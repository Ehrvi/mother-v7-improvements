/**
 * MOTHER v81.0 — Code Cycle Executor (C136 — Canonical Commit Pattern)
 *
 * Single canonical entry point for all code creation cycles in MOTHER.
 * Replaces the fragmented commit logic spread across self-code-writer.ts,
 * supervisor-activator.ts, and roadmap-executor.ts.
 *
 * Canonical flow:
 *   generateCode() → writeFile() → checkTypeScript() → gitCommit() → gitPush() → result
 *
 * Scientific Basis:
 * - Single Responsibility Principle (Martin, 2003, "Agile Software Development")
 * - GitOps (Weaveworks, 2017): Every change is a git commit — the git repo is the
 *   single source of truth for the system state.
 * - Gödel Machine (Schmidhuber, 2003): Self-modification requires a verifiable
 *   proof chain — each commit is a cryptographic proof of the change.
 * - DORA Metrics (Forsgren et al., 2018, "Accelerate"): Deployment frequency and
 *   lead time are key predictors of software delivery performance.
 *
 * v81.0 Changes:
 * - Consolidates all commit logic into one module
 * - Uses GITHUB_TOKEN from Secret Manager (Cloud Run) or env var (local)
 * - Implements proper TypeScript error counting (not just pass/fail)
 * - Returns structured CycleResult with full observability
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import { execSync } from 'child_process';

const log = (msg: string) => console.log(`[CodeCycleExecutor] ${msg}`);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CycleResult {
  success: boolean;
  filePath: string;
  linesWritten: number;
  tsErrors: number;
  commitSha?: string;
  buildId?: string;
  error?: string;
  durationMs: number;
}

// ─── Project Root ─────────────────────────────────────────────────────────────

/**
 * Detect project root across environments.
 * - Cloud Run: /app
 * - Local (mother-code): /home/ubuntu/mother-code/mother-interface
 * - Local (mother-latest): relative to __dirname
 */
export function getProjectRoot(): string {
  if (existsSync('/app/server')) return '/app';
  if (existsSync('/home/ubuntu/mother-code/mother-interface/server')) {
    return '/home/ubuntu/mother-code/mother-interface';
  }
  return join(__dirname, '../../..');
}

// ─── Step 1: Write File ───────────────────────────────────────────────────────

/**
 * Write content to a file, creating parent directories if needed.
 * Returns the number of lines written.
 */
export function writeFile(
  filePath: string,
  content: string
): { linesWritten: number } {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  const linesWritten = content.split(/\r?\n/).length;
  log(`writeFile: ${filePath} (${linesWritten} lines)`);
  return { linesWritten };
}

// ─── Step 2: TypeScript Check ─────────────────────────────────────────────────

/**
 * Run `tsc --noEmit` and return the number of TypeScript errors.
 * Returns 0 on success, N on failure (N = number of error lines).
 */
export function checkTypeScript(root: string): number {
  try {
    execSync('npx tsc --noEmit 2>&1', {
      cwd: root,
      stdio: 'pipe',
      timeout: 60_000,
    });
    log('checkTypeScript: 0 errors');
    return 0;
  } catch (err: any) {
    const output: string = err.stdout?.toString() || err.stderr?.toString() || '';
    const errorLines = output
      .split(/\r?\n/)
      .filter((line: string) => line.match(/: error TS\d{4}:/));
    const count = errorLines.length || 1;
    log(`checkTypeScript: ${count} errors`);
    return count;
  }
}

// ─── Step 3: Git Commit ───────────────────────────────────────────────────────

/**
 * Configure git remote with GITHUB_TOKEN for Cloud Run authentication.
 * Uses the x-access-token scheme (GitHub Docs, 2024).
 * Restores the original remote URL after commit for security.
 */
function configureGitAuth(root: string): string | null {
  const token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    log('configureGitAuth: no GITHUB_TOKEN, using existing auth');
    return null;
  }
  try {
    const originalUrl = execSync(`git -C "${root}" remote get-url origin`, {
      timeout: 5_000,
    })
      .toString()
      .trim();

    if (originalUrl.startsWith('https://') && !originalUrl.includes('@')) {
      const urlObj = new URL(originalUrl);
      urlObj.username = 'x-access-token';
      urlObj.password = token;
      const authUrl = urlObj.toString();
      execSync(`git -C "${root}" remote set-url origin "${authUrl}"`, {
        timeout: 5_000,
      });
      log('configureGitAuth: token injected into remote URL');
      return originalUrl; // return original to restore later
    }
    return null;
  } catch (err: any) {
    log(`configureGitAuth warning: ${err.message}`);
    return null;
  }
}

/**
 * Stage a file, commit, and return the commit SHA.
 * Handles GITHUB_TOKEN injection for Cloud Run environments.
 */
export function gitCommit(
  root: string,
  filePath: string,
  message: string
): string {
  // Configure git user (required in Cloud Run)
  try {
    execSync(`git -C "${root}" config user.email "mother-bot@intelltech.com.br"`, {
      timeout: 5_000,
    });
    execSync(`git -C "${root}" config user.name "MOTHER Bot"`, {
      timeout: 5_000,
    });
  } catch { /* non-blocking */ }

  const originalUrl = configureGitAuth(root);

  try {
    execSync(`git -C "${root}" add "${filePath}"`, { timeout: 10_000 });
    execSync(
      `git -C "${root}" commit -m "${message.replace(/"/g, "'")}"`,
      { timeout: 15_000 }
    );
    const sha = execSync(`git -C "${root}" rev-parse HEAD`, { timeout: 5_000 })
      .toString()
      .trim()
      .slice(0, 8);
    log(`gitCommit: ${sha} — ${message}`);
    return sha;
  } finally {
    // Always restore original remote URL (security: remove token from URL)
    if (originalUrl) {
      try {
        execSync(`git -C "${root}" remote set-url origin "${originalUrl}"`, {
          timeout: 5_000,
        });
      } catch { /* non-blocking */ }
    }
  }
}

// ─── Step 4: Git Push ─────────────────────────────────────────────────────────

/**
 * Push to origin main. Re-injects token for the push operation.
 */
export function gitPush(root: string): void {
  const originalUrl = configureGitAuth(root);
  try {
    execSync(`git -C "${root}" push origin main`, { timeout: 30_000 });
    log('gitPush: pushed to origin/main');
  } finally {
    if (originalUrl) {
      try {
        execSync(`git -C "${root}" remote set-url origin "${originalUrl}"`, {
          timeout: 5_000,
        });
      } catch { /* non-blocking */ }
    }
  }
}

// ─── Step 5: Get Cloud Build ID ───────────────────────────────────────────────

async function getLatestBuildId(): Promise<string> {
  await new Promise((r) => setTimeout(r, 3_000));
  try {
    const id = execSync(
      'gcloud builds list --limit=1 --format="value(id)" 2>/dev/null',
      { timeout: 15_000 }
    )
      .toString()
      .trim();
    return id || 'pending';
  } catch {
    return 'pending';
  }
}

// ─── Main: executeCodeCycle ───────────────────────────────────────────────────

/**
 * Canonical code cycle: write → typecheck → commit → push → build.
 *
 * This is the SINGLE entry point for all code creation in MOTHER.
 * All other modules (supervisor-activator, roadmap-executor, agent-task)
 * should delegate to this function.
 *
 * @param filePath  Absolute path to the file to write
 * @param content   TypeScript source code content
 * @param commitMsg Git commit message (e.g., "feat(C136): interface-shell-executor")
 */
export async function executeCodeCycle(
  filePath: string,
  content: string,
  commitMsg: string
): Promise<CycleResult> {
  const start = Date.now();
  const root = getProjectRoot();
  const relPath = relative(root, filePath);

  log(`Starting cycle: ${relPath}`);
  log(`Project root: ${root}`);

  try {
    // Step 1: Write
    const { linesWritten } = writeFile(filePath, content);

    // Step 2: TypeScript check
    const tsErrors = checkTypeScript(root);
    if (tsErrors > 0) {
      return {
        success: false,
        filePath: relPath,
        linesWritten,
        tsErrors,
        error: `TypeScript check failed: ${tsErrors} error(s)`,
        durationMs: Date.now() - start,
      };
    }

    // Step 3: Commit
    const commitSha = gitCommit(root, relPath, commitMsg);

    // Step 4: Push
    gitPush(root);

    // Step 5: Build ID
    const buildId = await getLatestBuildId();

    log(`Cycle complete: ${commitSha} | build: ${buildId}`);

    return {
      success: true,
      filePath: relPath,
      linesWritten,
      tsErrors: 0,
      commitSha,
      buildId,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    log(`Cycle error: ${err.message}`);
    return {
      success: false,
      filePath: relPath,
      linesWritten: 0,
      tsErrors: -1,
      error: err.message || String(err),
      durationMs: Date.now() - start,
    };
  }
}
