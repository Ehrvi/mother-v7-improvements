/**
 * GitHubReadService — Sprint 1.3.1 (Ciclo 178, atualizado C181)
 * Provides MOTHER with read access to its own GitHub repository.
 * Scientific basis: DevOps Research (Forsgren et al., 2018 — Accelerate)
 * Rate limit: 5000 req/hora para PAT autenticado (GitHub REST API docs)
 */
import { createLogger } from '../_core/logger.js';

const log = createLogger('GH_READ');

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  size: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  createdAt: string;
  url: string;
}

export interface CompareResult {
  status: 'ahead' | 'behind' | 'diverged' | 'identical';
  aheadBy: number;
  behindBy: number;
  commits: CommitInfo[];
  files: string[];
}

export interface SearchResult {
  totalCount: number;
  items: Array<{
    path: string;
    repository: string;
    url: string;
    score: number;
  }>;
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

export class GitHubReadService {
  private owner: string;
  private repo: string;
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor() {
    this.owner = process.env.GITHUB_OWNER || 'Ehrvi';
    this.repo = process.env.GITHUB_REPO || 'mother-v7-improvements';
    this.token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '';
    if (!this.token) log.warn('[GitHubRead] No GITHUB_TOKEN set — read operations will fail on private repos');
  }

  private async request<T>(path: string): Promise<T> {
    await rateLimiter.throttle();
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'MOTHER-v81.8',
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  /** Read a file from the repository */
  async getFile(filePath: string, branch = 'main'): Promise<FileContent> {
    const data = await this.request<any>(`/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${branch}`);
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { path: filePath, content, sha: data.sha, size: data.size };
  }

  /** List files in a directory */
  async listDirectory(dirPath = '', branch = 'main'): Promise<string[]> {
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/contents/${dirPath}?ref=${branch}`);
    return data.map((f: any) => f.path);
  }

  /** Get commit history for a file or the whole repo */
  async getCommitHistory(filePath?: string, limit = 20): Promise<CommitInfo[]> {
    const pathParam = filePath ? `&path=${encodeURIComponent(filePath)}` : '';
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/commits?per_page=${limit}${pathParam}`);
    return data.map((c: any) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
  }

  /** Get open issues from the repository */
  async getOpenIssues(labels?: string[]): Promise<IssueInfo[]> {
    const labelParam = labels?.length ? `&labels=${labels.join(',')}` : '';
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/issues?state=open&per_page=50${labelParam}`);
    return data
      .filter((i: any) => !i.pull_request) // exclude PRs
      .map((i: any) => ({
        number: i.number,
        title: i.title,
        body: i.body || '',
        state: i.state,
        labels: i.labels.map((l: any) => l.name),
        createdAt: i.created_at,
        url: i.html_url,
      }));
  }

  /** Compare two branches */
  async compareBranches(base: string, head: string): Promise<CompareResult> {
    const data = await this.request<any>(`/repos/${this.owner}/${this.repo}/compare/${base}...${head}`);
    return {
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      commits: data.commits.map((c: any) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      })),
      files: data.files?.map((f: any) => f.filename) || [],
    };
  }

  /** Search code in the repository */
  async searchCode(query: string): Promise<SearchResult> {
    const q = encodeURIComponent(`${query} repo:${this.owner}/${this.repo}`);
    const data = await this.request<any>(`/search/code?q=${q}&per_page=20`);
    return {
      totalCount: data.total_count,
      items: data.items.map((i: any) => ({
        path: i.path,
        repository: i.repository.full_name,
        url: i.html_url,
        score: i.score,
      })),
    };
  }

  /** Get open PRs */
  async getOpenPRs(): Promise<any[]> {
    return this.request<any[]>(`/repos/${this.owner}/${this.repo}/pulls?state=open`);
  }

  /** Get all branches */
  async getBranches(): Promise<string[]> {
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/branches`);
    return data.map((b: any) => b.name);
  }

  /** Get repository metadata */
  async getRepoInfo(): Promise<{ stars: number; forks: number; defaultBranch: string; language: string }> {
    const data = await this.request<any>(`/repos/${this.owner}/${this.repo}`);
    return {
      stars: data.stargazers_count,
      forks: data.forks_count,
      defaultBranch: data.default_branch,
      language: data.language,
    };
  }
}

export const githubReadService = new GitHubReadService();
