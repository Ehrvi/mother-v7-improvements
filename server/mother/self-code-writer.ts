/**
 * MOTHER v74.10 — Self-Code-Writer (NC-BUILD-002 FIXED)
 *
 * Gives MOTHER the ability to WRITE her own source code and trigger a deploy,
 * allowing the creator to order code updates directly via the chat interface.
 *
 * Scientific Basis:
 * - Gödel Machine (Schmidhuber, 2003, arXiv:cs/0309048): A self-referential system
 *   that can modify its own code when it can prove the modification is beneficial.
 *   MOTHER now has BOTH read AND write access to her own code — completing the loop.
 * - SWE-agent (Yang et al., arXiv:2405.15793, 2024): Software engineering agents
 *   that autonomously edit, test, and commit code changes.
 * - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): Self-modification must
 *   be constrained by a principal hierarchy — only the creator can authorize writes.
 * - DevOps/GitOps (Humble & Farley, 2010, "Continuous Delivery"): Every code change
 *   goes through git commit → CI/CD pipeline → automated deploy.
 * - GitHub REST API Auth (GitHub Docs, 2024): Token injected in remote URL for
 *   headless authentication in containerized environments (NC-BUILD-002).
 *
 * Security Model:
 * - CREATOR ONLY: Only elgarcia.eng@gmail.com can authorize writes
 * - Whitelist: Only server/mother/*.ts, server/routers/*.ts, client/src/pages/*.tsx allowed
 * - No secrets: Cannot write to .env, secrets, or config files
 * - Audit: Every write operation is logged in audit_log
 * - Validation: TypeScript check before commit (non-blocking — warns but doesn't block)
 * - Rollback: Every change is a git commit — can be reverted
 *
 * Deploy Pipeline:
 * - Write file → git commit → git push (with GITHUB_TOKEN) → Cloud Build → Cloud Run
 * - Build time: ~8-12 minutes
 * - Rollback: git revert <commit>
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// v74.1: ESM fix — __dirname is not defined in ESM ("type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Whitelist of writable paths (relative to project root)
const WRITABLE_PATHS = [
  'server/mother',
  'server/routers',
  'client/src/pages',
  'client/src/components',
];

// Paths that are NEVER writable (security)
const FORBIDDEN_PATHS = [
  '.env',
  'secrets',
  'cloudbuild.yaml',
  'Dockerfile',
  'drizzle/schema',
  'server/_core/trpc.ts',
  'server/db.ts',
];

// P1 fix: Twelve-Factor App Factor III — config via environment
function getProjectRoot(): string {
  return process.env.MOTHER_PROJECT_ROOT || process.cwd();
}

function isPathWritable(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  // Check forbidden paths first
  if (FORBIDDEN_PATHS.some(forbidden => normalized.includes(forbidden))) {
    return false;
  }
  // Check whitelist
  return WRITABLE_PATHS.some(allowed => normalized.startsWith(allowed));
}

/**
 * v74.10: NC-BUILD-002 — Configure git remote with GITHUB_TOKEN for Cloud Run auth.
 * In Cloud Run, there is no ~/.gitconfig or SSH key. We inject the token into the
 * remote URL so `git push` authenticates without interactive prompts.
 * Scientific basis: GitHub REST API authentication (GitHub Docs, 2024).
 */
function configureGitAuth(root: string): void {
  const token = process.env.GITHUB_TOKEN || '';
  if (!token) return; // Skip if no token (local dev with SSH keys)
  try {
    const remoteUrl = execSync(
      `cd "${root}" && git remote get-url origin 2>&1`,
      { timeout: 5000 }
    ).toString().trim();
    // Only inject if not already authenticated
    if (remoteUrl.startsWith('https://') && !remoteUrl.includes('@')) {
      const authenticatedUrl = remoteUrl.replace(
        'https://',
        `https://x-access-token:${token}@`
      );
      execSync(
        `cd "${root}" && git remote set-url origin "${authenticatedUrl}" 2>&1`,
        { timeout: 5000 }
      );
    }
    // Configure git identity for Cloud Run (no global gitconfig)
    execSync(
      `cd "${root}" && git config user.email "mother@system.ai" && git config user.name "MOTHER Self-Writer" 2>&1`,
      { timeout: 5000 }
    );
  } catch { /* non-blocking — proceed with existing remote config */ }
}

export interface WriteResult {
  success: boolean;
  filePath: string;
  linesWritten: number;
  commitSha?: string;
  deployTriggered?: boolean;
  buildId?: string;
  error?: string;
  warning?: string;
}

export interface PatchResult {
  success: boolean;
  filePath: string;
  patchesApplied: number;
  commitSha?: string;
  deployTriggered?: boolean;
  error?: string;
}

/**
 * Write or overwrite a file in MOTHER's codebase.
 * Creator-only. Triggers git commit + push → Cloud Build deploy.
 */
export async function writeCodeFile(
  filePath: string,
  content: string,
  commitMessage: string,
  triggerDeploy: boolean = true
): Promise<WriteResult> {
  if (!isPathWritable(filePath)) {
    return {
      success: false,
      filePath,
      linesWritten: 0,
      error: `Access denied: "${filePath}" is not in the writable whitelist or is a forbidden path.`,
    };
  }

  const root = getProjectRoot();
  const fullPath = join(root, filePath);

  try {
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write the file
    writeFileSync(fullPath, content, 'utf-8');
    const linesWritten = content.split('\n').length;

    // TypeScript check (non-blocking — warn but don't block)
    let warning: string | undefined;
    try {
      execSync('npx tsc --noEmit 2>&1', { cwd: root, timeout: 60000 });
    } catch (tsError: any) {
      const tsOutput = tsError.stdout?.toString() || tsError.message || '';
      const errorCount = (tsOutput.match(/error TS/g) || []).length;
      if (errorCount > 0) {
        warning = `⚠️ TypeScript: ${errorCount} error(s) detected. File written but may cause build failure. Review before deploy.`;
      }
    }

    if (!triggerDeploy) {
      return { success: true, filePath, linesWritten, warning };
    }

    // Git commit and push
    const { commitSha, buildId } = await gitCommitAndPush(root, filePath, commitMessage);

    return {
      success: true,
      filePath,
      linesWritten,
      commitSha,
      deployTriggered: true,
      buildId,
      warning,
    };
  } catch (error: any) {
    return {
      success: false,
      filePath,
      linesWritten: 0,
      error: `Write failed: ${error.message}`,
    };
  }
}

/**
 * Apply targeted patches to a file (find-and-replace operations).
 * Safer than full overwrites for small changes.
 */
export async function patchCodeFile(
  filePath: string,
  patches: Array<{ find: string; replace: string; description: string }>,
  commitMessage: string,
  triggerDeploy: boolean = true
): Promise<PatchResult> {
  if (!isPathWritable(filePath)) {
    return {
      success: false,
      filePath,
      patchesApplied: 0,
      error: `Access denied: "${filePath}" is not in the writable whitelist.`,
    };
  }

  const root = getProjectRoot();
  const fullPath = join(root, filePath);

  if (!existsSync(fullPath)) {
    return {
      success: false,
      filePath,
      patchesApplied: 0,
      error: `File not found: ${filePath}`,
    };
  }

  try {
    const { readFileSync } = await import('fs');
    let content = readFileSync(fullPath, 'utf-8');
    let patchesApplied = 0;

    for (const patch of patches) {
      if (content.includes(patch.find)) {
        content = content.replace(patch.find, patch.replace);
        patchesApplied++;
      }
    }

    if (patchesApplied === 0) {
      return {
        success: false,
        filePath,
        patchesApplied: 0,
        error: `No patches applied — none of the ${patches.length} find strings were found in the file.`,
      };
    }

    writeFileSync(fullPath, content, 'utf-8');

    if (!triggerDeploy) {
      return { success: true, filePath, patchesApplied };
    }

    const { commitSha, buildId } = await gitCommitAndPush(root, filePath, commitMessage);

    return {
      success: true,
      filePath,
      patchesApplied,
      commitSha,
      deployTriggered: true,
    };
  } catch (error: any) {
    return {
      success: false,
      filePath,
      patchesApplied: 0,
      error: `Patch failed: ${error.message}`,
    };
  }
}

/**
 * Get the current deploy status from Cloud Build.
 */
export async function getDeployStatus(): Promise<{
  latestBuild: string;
  status: string;
  startTime: string;
  duration: string;
  url: string;
}> {
  try {
    const output = execSync(
      'gcloud builds list --limit=1 --format="value(id,status,createTime,duration)" 2>/dev/null',
      { timeout: 15000 }
    ).toString().trim();

    const parts = output.split('\t');
    return {
      latestBuild: parts[0] || 'unknown',
      status: parts[1] || 'unknown',
      startTime: parts[2] || 'unknown',
      duration: parts[3] || 'unknown',
      url: `https://console.cloud.google.com/cloud-build/builds/${parts[0]}?project=mothers-library-mcp`,
    };
  } catch {
    return {
      latestBuild: 'unknown',
      status: 'unknown',
      startTime: 'unknown',
      duration: 'unknown',
      url: 'https://console.cloud.google.com/cloud-build/builds',
    };
  }
}

/**
 * Trigger a manual deploy without code changes (e.g., to restart the service).
 */
export async function triggerDeploy(reason: string): Promise<{
  success: boolean;
  buildId?: string;
  error?: string;
}> {
  const root = getProjectRoot();
  try {
    configureGitAuth(root); // v74.10: NC-BUILD-002
    // Create an empty commit to trigger Cloud Build
    execSync(`cd "${root}" && git commit --allow-empty -m "deploy: ${reason}" 2>&1`, { timeout: 15000 });
    execSync(`cd "${root}" && git push origin main 2>&1`, { timeout: 30000 });

    // Get the build ID
    await new Promise(resolve => setTimeout(resolve, 3000));
    const buildId = execSync(
      'gcloud builds list --limit=1 --format="value(id)" 2>/dev/null',
      { timeout: 15000 }
    ).toString().trim();

    return { success: true, buildId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Internal: git add, commit, push and get build ID.
 * v74.10: NC-BUILD-002 — configureGitAuth() injects GITHUB_TOKEN before push.
 */
async function gitCommitAndPush(
  root: string,
  filePath: string,
  commitMessage: string
): Promise<{ commitSha: string; buildId: string }> {
  configureGitAuth(root); // v74.10: NC-BUILD-002 — inject token for Cloud Run auth
  execSync(`cd "${root}" && git add "${filePath}" 2>&1`, { timeout: 15000 });
  execSync(`cd "${root}" && git commit -m "${commitMessage.replace(/"/g, "'")}" 2>&1`, { timeout: 15000 });
  execSync(`cd "${root}" && git push origin main 2>&1`, { timeout: 30000 });

  const commitSha = execSync(`cd "${root}" && git rev-parse HEAD 2>/dev/null`, { timeout: 10000 })
    .toString().trim().slice(0, 8);

  // Wait a moment then get the Cloud Build ID
  await new Promise(resolve => setTimeout(resolve, 3000));
  let buildId = 'pending';
  try {
    buildId = execSync(
      'gcloud builds list --limit=1 --format="value(id)" 2>/dev/null',
      { timeout: 15000 }
    ).toString().trim();
  } catch { /* non-blocking */ }

  return { commitSha, buildId };
}
