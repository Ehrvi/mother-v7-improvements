#!/usr/bin/env node
/**
 * DGM Pre-Start Self-Heal
 *
 * Runs BEFORE the server starts (before esbuild/tsx parses any .ts files).
 * Restores ALL uncommitted server/ file changes via git checkout.
 *
 * Why: DGM self-modification can corrupt source files by writing proposed
 * code (from the LLM) directly to real source files. If the code is invalid,
 * esbuild crashes on next startup. This has corrupted: hipporag2.ts,
 * semantic-cache.ts, grounding.ts, intelligence.ts.
 *
 * The DGM now uses GitHub PRs for all modifications, so there should be
 * ZERO legitimate uncommitted changes to server/ files at startup.
 * Any uncommitted server/ changes are assumed to be DGM corruption.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// Phase 1: Restore ALL dirty server/ files via git checkout
// DGM modifications now go through GitHub PRs, so any uncommitted
// server/ changes are DGM corruption from failed/crashed runs.
// SOTA: Skip in development mode — manual edits must NOT be reverted
// Enable explicitly with DGM_RESTORE=true for DGM testing in dev
// Scientific basis: 12-Factor App (Heroku, 2011) — env-specific config
const isDev = process.env.NODE_ENV === 'development';
const forceRestore = process.env.DGM_RESTORE === 'true';
if (isDev && !forceRestore) {
  console.log('[dgm-pre-start] DEV mode — skipping server/ restore (set DGM_RESTORE=true to force)');
} else {
  try {
  const dirty = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);
  const serverFiles = dirty.filter(f => f.startsWith('server/'));
  if (serverFiles.length > 0) {
    console.log(`[dgm-pre-start] Found ${serverFiles.length} uncommitted server/ file(s) — restoring from git`);
    for (const file of serverFiles) {
      try {
        execSync(`git checkout -- "${file}"`, { cwd: ROOT, stdio: 'pipe' });
        console.log(`[dgm-pre-start] RESTORED: ${file}`);
      } catch (err) {
        console.warn(`[dgm-pre-start] Failed to restore ${file}: ${err.message}`);
      }
    }
  }
  } catch { /* git not available — skip */ }
}

// Phase 2: Clean up orphaned DGM worktrees
try {
  const entries = readdirSync(ROOT);
  const orphanedWorktrees = entries.filter(e => e.startsWith('.dgm-worktree-'));
  for (const wt of orphanedWorktrees) {
    const wtPath = join(ROOT, wt);
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: ROOT, stdio: 'pipe' });
      console.log(`[dgm-pre-start] Removed orphaned worktree: ${wt}`);
    } catch {
      try { rmSync(wtPath, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  if (orphanedWorktrees.length > 0) {
    execSync('git worktree prune', { cwd: ROOT, stdio: 'pipe' });
  }
} catch { /* ignore */ }

// Phase 3: Restore from .dgm-backup/ (legacy safety net)
const BACKUP_DIR = join(ROOT, '.dgm-backup');
try {
  if (existsSync(BACKUP_DIR)) {
    const backups = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.ts'));
    for (const backupFile of backups) {
      const backupPath = join(BACKUP_DIR, backupFile);
      const originalRelPath = backupFile.replace(/__/g, '/');
      const originalFullPath = resolve(ROOT, originalRelPath);
      try {
        const content = readFileSync(backupPath, 'utf-8');
        if (content === '<<DGM_FILE_DID_NOT_EXIST>>') {
          if (existsSync(originalFullPath)) unlinkSync(originalFullPath);
        } else {
          writeFileSync(originalFullPath, content, 'utf-8');
        }
        unlinkSync(backupPath);
        console.log(`[dgm-pre-start] Restored from backup: ${originalRelPath}`);
      } catch (err) {
        console.warn(`[dgm-pre-start] Failed to restore ${originalRelPath}: ${err.message}`);
      }
    }
  }
} catch { /* ignore */ }
