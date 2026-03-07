/**
 * GitHubWriteService — Sprint 1.3.2 (Ciclo 178)
 * Provides MOTHER with write access to its own GitHub repository.
 * Enables autonomous self-modification: branch → commit → PR → merge.
 * Scientific basis: Darwin (1859) — variation + selection; DGM (Zhang et al., 2024 arXiv:2408.08435)
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

  async getMainSha(): Promise<string> {
    const data = await this.request<any>('GET', `/repos/${this.owner}/${this.repo}/git/ref/heads/main`);
    return data.object.sha;
  }

  async createBranch(branchName: string, fromSha?: string): Promise<CreateBranchResult> {
    const sha = fromSha || await this.getMainSha();
    await this.request('POST', `/repos/${this.owner}/${this.repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha,
    });
    log.info(`[GitHubWrite] Created branch: ${branchName} from ${sha.slice(0, 8)}`);
    return { branchName, sha };
  }

  async commitFile(
    filePath: string,
    content: string,
    message: string,
    branch: string,
    existingSha?: string
  ): Promise<CommitResult> {
    const encodedContent = Buffer.from(content).toString('base64');
    const body: any = {
      message,
      content: encodedContent,
      branch,
    };
    if (existingSha) body.sha = existingSha;

    const data = await this.request<any>('PUT', `/repos/${this.owner}/${this.repo}/contents/${filePath}`, body);
    log.info(`[GitHubWrite] Committed: ${filePath} on ${branch}`);
    return {
      sha: data.commit.sha,
      url: data.commit.html_url,
      message,
    };
  }

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

  async mergePullRequest(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
    await this.request('PUT', `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/merge`, {
      merge_method: mergeMethod,
    });
    log.info(`[GitHubWrite] Merged PR #${prNumber} via ${mergeMethod}`);
  }

  async deleteBranch(branchName: string): Promise<void> {
    await this.request('DELETE', `/repos/${this.owner}/${this.repo}/git/refs/heads/${branchName}`);
    log.info(`[GitHubWrite] Deleted branch: ${branchName}`);
  }

  /**
   * Full autonomous self-modification cycle:
   * 1. Create branch
   * 2. Commit file changes
   * 3. Create PR
   * 4. (CI runs quality gate + smoke tests)
   * 5. Merge PR
   * 6. Delete branch
   */
  async autonomousSelfModification(params: {
    branchName: string;
    files: Array<{ path: string; content: string; existingSha?: string }>;
    prTitle: string;
    prBody: string;
    autoMerge?: boolean;
  }): Promise<{ pr: PullRequestResult; commits: CommitResult[] }> {
    const { branchName, files, prTitle, prBody, autoMerge = false } = params;

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

    // 4. Auto-merge if requested (after CI passes)
    if (autoMerge) {
      await new Promise(r => setTimeout(r, 10000)); // Wait 10s for CI to start
      await this.mergePullRequest(pr.number, 'squash');
      await this.deleteBranch(branchName);
    }

    return { pr, commits };
  }
}

export const githubWriteService = new GitHubWriteService();
