/**
 * GitHubWriteService — Sprint 1.3.2 (Ciclo 178, atualizado C181)
 * Provides MOTHER with write access to its own GitHub repository.
 * Enables autonomous self-modification: branch → commit → PR → merge.
 * Scientific basis: Darwin (1859) — variation + selection; DGM (Zhang et al., 2024 arXiv:2408.08435)
 * Rate limit: 5000 req/hora para PAT autenticado (GitHub REST API docs)
 */
import { createLogger } from '../_core/logger.js';

const log = createLogger('GH_WRITE');

export interface CreateBranchResult {
  branchName: string;
  sha: string;
}

export interface CommitResult {
  sha: string;
  url: string;
  message: string;
}

export interface PullRequestResult {
  number: number;
  url: string;
  title: string;
  branch: string;
}

export interface IssueResult {
  number: number;
  url: string;
  title: string;
}

// Simple in-memory rate limiter: max 50 req/min (conservative vs 5000/hora)
class RateLimiter {
  private requests: number[] = [];
  private maxPerMinute = 50;

  async throttle(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < 60000);
    if (this.requests.length >= this.maxPerMinute) {
      const oldest = this.requests[0];
      const waitMs = 60000 - (now - oldest) + 100;
      log.warn(`[RateLimit] Throttling ${waitMs}ms (${this.requests.length} req/min)`);
      await new Promise(r => setTimeout(r, waitMs));
    }
    this.requests.push(Date.now());
  }
}

const rateLimiter = new RateLimiter();

export class GitHubWriteService {
  private owner: string;
  private repo: string;
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Ehrvi';
    this.repo = process.env.GITHUB_REPO || 'mother-v7-improvements';
    this.token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '';
    if (!this.token) log.warn('[GitHubWrite] No GITHUB_TOKEN set — write operations will fail');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await rateLimiter.throttle();
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'MOTHER-v81.8',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub API ${method} ${path} ${res.status}: ${errText.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  /** Get the SHA of an existing file on a branch (returns null if not found) */
  async getFileSha(filePath: string, branch = 'main'): Promise<string | null> {
    try {
      const data = await this.request<any>('GET', `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`);
      return (data as any).sha || null;
    } catch {
      return null; // file does not exist yet — safe to create
    }
  }

  /** Get the SHA of the HEAD of main branch */
  async getMainSha(): Promise<string> {
    const data = await this.request<any>('GET', `/repos/${this.owner}/${this.repo}/git/ref/heads/main`);
    return data.object.sha;
  }

  /** Create a new branch from main (or specified SHA) */
  async createBranch(branchName: string, fromSha?: string): Promise<CreateBranchResult> {
    const sha = fromSha || await this.getMainSha();
    await this.request('POST', `/repos/${this.owner}/${this.repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha,
    });
    log.info(`[GitHubWrite] Created branch: ${branchName} from ${sha.slice(0, 8)}`);
    return { branchName, sha };
  }

  /** Commit a file to a branch (create or update). Auto-fetches sha if file already exists. */
  async commitFile(
    filePath: string,
    content: string,
    message: string,
    branch: string,
    existingSha?: string
  ): Promise<CommitResult> {
    const encodedContent = Buffer.from(content).toString('base64');
    // Auto-resolve sha: required by GitHub API when updating an existing file (422 if missing)
    // Check branch first, then main — covers both update-on-branch and first-commit scenarios
    const resolvedSha = existingSha
      || await this.getFileSha(filePath, branch)
      || await this.getFileSha(filePath, 'main');
    const body: any = {
      message,
      content: encodedContent,
      branch,
    };
    if (resolvedSha) body.sha = resolvedSha;

    const data = await this.request<any>('PUT', `/repos/${this.owner}/${this.repo}/contents/${filePath}`, body);
    log.info(`[GitHubWrite] Committed: ${filePath} on ${branch}`);
    return {
      sha: data.commit.sha,
      url: data.commit.html_url,
      message,
    };
  }

  /** Create a Pull Request */
  async createPullRequest(
    title: string,
    body: string,
    branch: string,
    base = 'main'
  ): Promise<PullRequestResult> {
    const data = await this.request<any>('POST', `/repos/${this.owner}/${this.repo}/pulls`, {
      title,
      body,
      head: branch,
      base,
    });
    log.info(`[GitHubWrite] Created PR #${data.number}: ${title}`);
    return { number: data.number, url: data.html_url, title, branch };
  }

  /** Add a comment to a PR or Issue */
  async addPRComment(prNumber: number, comment: string): Promise<void> {
    await this.request('POST', `/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments`, {
      body: comment,
    });
    log.info(`[GitHubWrite] Added comment to PR #${prNumber}`);
  }

  /** Create a GitHub Issue (for DGM NC tracking) */
  async createIssue(
    title: string,
    body: string,
    labels: string[] = []
  ): Promise<IssueResult> {
    const data = await this.request<any>('POST', `/repos/${this.owner}/${this.repo}/issues`, {
      title,
      body,
      labels,
    });
    log.info(`[GitHubWrite] Created Issue #${data.number}: ${title}`);
    return { number: data.number, url: data.html_url, title };
  }

  /** Merge a Pull Request */
  async mergePullRequest(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
    await this.request('PUT', `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/merge`, {
      merge_method: mergeMethod,
    });
    log.info(`[GitHubWrite] Merged PR #${prNumber} via ${mergeMethod}`);
  }

  /** Delete a branch */
  async deleteBranch(branchName: string): Promise<void> {
    await this.request('DELETE', `/repos/${this.owner}/${this.repo}/git/refs/heads/${branchName}`);
    log.info(`[GitHubWrite] Deleted branch: ${branchName}`);
  }

  /**
   * Full autonomous self-modification cycle (DGM Sprint 1.3.3):
   * 1. Create branch dgm/proposal-{id}-{ts}
   * 2. Commit all file changes
   * 3. Create PR with full context
   * 4. Add DGM analysis comment
   * 5. (CI runs quality gate + smoke tests automatically)
   * 6. Optionally merge after CI passes
   *
   * IMPORTANT: autoMerge=false by default (R12 — requires 3 successful cycles first)
   * Scientific basis: Tang et al. (2025) DOI:10.1038/s41467-025-63913-1 — AI autonomy risks
   */
  async autonomousSelfModification(params: {
    branchName: string;
    files: Array<{ path: string; content: string; existingSha?: string }>;
    prTitle: string;
    prBody: string;
    autoMerge?: boolean;
    proposalId?: string;
    analysisContext?: string;
  }): Promise<{ pr: PullRequestResult; commits: CommitResult[] }> {
    const { branchName, files, prTitle, prBody, autoMerge = false, proposalId, analysisContext } = params;

    // 1. Create branch
    await this.createBranch(branchName);

    // 2. Commit all files
    const commits: CommitResult[] = [];
    for (const file of files) {
      const commit = await this.commitFile(
        file.path,
        file.content,
        `[DGM] ${prTitle} — ${file.path}`,
        branchName,
        file.existingSha
      );
      commits.push(commit);
    }

    // 3. Create PR
    const pr = await this.createPullRequest(prTitle, prBody, branchName);

    // 4. Add DGM analysis comment
    const comment = [
      `## 🤖 DGM Autonomous Proposal`,
      `**Proposal ID:** ${proposalId || 'N/A'}`,
      `**Files Modified:** ${files.map(f => f.path).join(', ')}`,
      `**Commits:** ${commits.length}`,
      analysisContext ? `\n**Analysis:**\n${analysisContext}` : '',
      `\n**Auto-merge:** ${autoMerge ? 'YES (R12 override)' : 'NO — awaiting human review'}`,
      `\n*Generated by MOTHER v81.8 DGM Self-Improvement Loop*`,
    ].filter(Boolean).join('\n');
    await this.addPRComment(pr.number, comment);

    // 5. Auto-merge if requested (only after 3 validated cycles — R12)
    if (autoMerge) {
      log.warn(`[GitHubWrite] autoMerge=true — waiting 30s for CI to start before merge`);
      await new Promise(r => setTimeout(r, 30000));
      await this.mergePullRequest(pr.number, 'squash');
      await this.deleteBranch(branchName);
    }

    return { pr, commits };
  }
}

export const githubWriteService = new GitHubWriteService();
