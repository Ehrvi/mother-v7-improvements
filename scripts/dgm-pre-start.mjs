#!/usr/bin/env node
/**
 * DGM Pre-Start Cleanup
 *
 * Runs BEFORE the server starts (before esbuild/tsx parses any .ts files).
 *
 * 1. Cleans up orphaned .dgm-worktree-* directories from crashed DGM validation runs
 * 2. Restores any files from .dgm-backup/ (legacy safety net)
 * 3. Prunes git worktree state
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// Phase 1: Clean up orphaned DGM worktrees
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

// Phase 2: Restore from .dgm-backup/ (legacy — from pre-worktree approach)
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
