/**
 * Unit tests for GitHubReadService and GitHubWriteService
 * Sprint 1.3.1/1.3.2 — Ciclo 181
 * Uses vitest with mocked fetch to avoid real API calls
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubReadService } from '../github-read-service.js';
import { GitHubWriteService } from '../github-write-service.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
vi.mock('../../_core/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe('GitHubReadService', () => {
  let service: GitHubReadService;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_OWNER = 'Ehrvi';
    process.env.GITHUB_REPO = 'mother-v7-improvements';
    service = new GitHubReadService();
    mockFetch.mockReset();
  });

  it('getFile — decodes base64 content correctly', async () => {
    const content = 'console.log("MOTHER");';
    const encoded = Buffer.from(content).toString('base64');
    mockFetch.mockReturnValueOnce(makeResponse({
      content: encoded,
      sha: 'abc123',
      size: content.length,
    }));

    const result = await service.getFile('server/mother/core.ts');
    expect(result.content).toBe(content);
    expect(result.sha).toBe('abc123');
    expect(result.path).toBe('server/mother/core.ts');
  });

  it('listDirectory — returns array of file paths', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([
      { path: 'server/mother/core.ts' },
      { path: 'server/mother/guardian.ts' },
    ]));

    const files = await service.listDirectory('server/mother');
    expect(files).toHaveLength(2);
    expect(files[0]).toBe('server/mother/core.ts');
  });

  it('getCommitHistory — maps commits correctly', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([{
      sha: 'def456',
      commit: {
        message: 'fix: NC-TS-001 await getDb',
        author: { name: 'MOTHER-DGM', date: '2026-03-07T00:00:00Z' },
      },
      html_url: 'https://github.com/Ehrvi/mother-v7-improvements/commit/def456',
    }]));

    const commits = await service.getCommitHistory(undefined, 1);
    expect(commits[0].sha).toBe('def456');
    expect(commits[0].message).toContain('NC-TS-001');
  });

  it('getOpenIssues — filters out PRs', async () => {
    mockFetch.mockReturnValueOnce(makeResponse([
      { number: 1, title: 'NC-001', body: 'bug', state: 'open', labels: [], created_at: '2026-03-07', html_url: 'https://github.com', pull_request: undefined },
      { number: 2, title: 'PR: fix', body: 'pr', state: 'open', labels: [], created_at: '2026-03-07', html_url: 'https://github.com', pull_request: { url: 'x' } },
    ]));

    const issues = await service.getOpenIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(1);
  });

  it('compareBranches — returns correct structure', async () => {
    mockFetch.mockReturnValueOnce(makeResponse({
      status: 'ahead',
      ahead_by: 3,
      behind_by: 0,
      commits: [],
      files: [{ filename: 'server/mother/core.ts' }],
    }));

    const result = await service.compareBranches('main', 'dgm/proposal-001');
    expect(result.status).toBe('ahead');
    expect(result.aheadBy).toBe(3);
    expect(result.files).toContain('server/mother/core.ts');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValueOnce(makeResponse({ message: 'Not Found' }, 404));
    await expect(service.getFile('nonexistent.ts')).rejects.toThrow('GitHub API 404');
  });
});

describe('GitHubWriteService', () => {
  let service: GitHubWriteService;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    service = new GitHubWriteService();
    mockFetch.mockReset();
  });

  it('createBranch — creates branch from main SHA', async () => {
    // Mock getMainSha
    mockFetch.mockReturnValueOnce(makeResponse({ object: { sha: 'main-sha-123' } }));
    // Mock create branch
    mockFetch.mockReturnValueOnce(makeResponse({ ref: 'refs/heads/dgm/test' }));

    const result = await service.createBranch('dgm/test');
    expect(result.branchName).toBe('dgm/test');
    expect(result.sha).toBe('main-sha-123');
  });

  it('commitFile — encodes content to base64', async () => {
    const content = 'const x = 1;';
    mockFetch.mockReturnValueOnce(makeResponse({
      commit: { sha: 'commit-sha', html_url: 'https://github.com/commit' },
    }));

    const result = await service.commitFile('test.ts', content, 'fix: test', 'dgm/branch');
    expect(result.sha).toBe('commit-sha');

    // Verify the request body had base64 content
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.content).toBe(Buffer.from(content).toString('base64'));
  });

  it('createPullRequest — returns PR info', async () => {
    mockFetch.mockReturnValueOnce(makeResponse({
      number: 42,
      html_url: 'https://github.com/pulls/42',
    }));

    const pr = await service.createPullRequest('fix: NC-TS-001', 'Fix await', 'dgm/fix');
    expect(pr.number).toBe(42);
    expect(pr.branch).toBe('dgm/fix');
  });

  it('createIssue — creates issue with labels', async () => {
    mockFetch.mockReturnValueOnce(makeResponse({
      number: 10,
      html_url: 'https://github.com/issues/10',
    }));

    const issue = await service.createIssue('NC-001: Bug found', 'Description', ['bug', 'dgm']);
    expect(issue.number).toBe(10);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.labels).toEqual(['bug', 'dgm']);
  });

  it('autonomousSelfModification — autoMerge=false by default (R12)', async () => {
    // getMainSha
    mockFetch.mockReturnValueOnce(makeResponse({ object: { sha: 'sha1' } }));
    // createBranch
    mockFetch.mockReturnValueOnce(makeResponse({}));
    // commitFile
    mockFetch.mockReturnValueOnce(makeResponse({ commit: { sha: 'c1', html_url: 'x' } }));
    // createPR
    mockFetch.mockReturnValueOnce(makeResponse({ number: 5, html_url: 'https://github.com/pulls/5' }));
    // addComment
    mockFetch.mockReturnValueOnce(makeResponse({}));

    const result = await service.autonomousSelfModification({
      branchName: 'dgm/proposal-001',
      files: [{ path: 'test.ts', content: 'const x = 1;' }],
      prTitle: 'DGM: fix NC-001',
      prBody: 'Automated fix',
    });

    expect(result.pr.number).toBe(5);
    expect(result.commits).toHaveLength(1);
    // Should NOT have called merge (autoMerge=false by default)
    const mergeCalls = mockFetch.mock.calls.filter(c =>
      c[0]?.includes('/merge')
    );
    expect(mergeCalls).toHaveLength(0);
  });
});
