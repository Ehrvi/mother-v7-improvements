/**
 * GitHubReadService — Sprint 1.3.1 (Ciclo 178)
 * Provides MOTHER with read access to its own GitHub repository.
 * Scientific basis: DevOps Research (Forsgren et al., 2018 — Accelerate)
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

  async getFile(filePath: string, branch = 'main'): Promise<FileContent> {
    const data = await this.request<any>(`/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${branch}`);
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { path: filePath, content, sha: data.sha, size: data.size };
  }

  async listFiles(dirPath = '', branch = 'main'): Promise<string[]> {
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/contents/${dirPath}?ref=${branch}`);
    return data.map((f: any) => f.path);
  }

  async getRecentCommits(limit = 10): Promise<CommitInfo[]> {
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/commits?per_page=${limit}`);
    return data.map((c: any) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
  }

  async getOpenPRs(): Promise<any[]> {
    return this.request<any[]>(`/repos/${this.owner}/${this.repo}/pulls?state=open`);
  }

  async getBranches(): Promise<string[]> {
    const data = await this.request<any[]>(`/repos/${this.owner}/${this.repo}/branches`);
    return data.map((b: any) => b.name);
  }
}

export const githubReadService = new GitHubReadService();
