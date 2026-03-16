#!/usr/bin/env node
/**
 * DGM Pre-Start Self-Heal
 *
 * Runs BEFORE the server starts (before esbuild/tsx parses any .ts files).
 * Restores source files corrupted by DGM validation writes that crashed
 * mid-way (wrote proposedCode but never restored the backup).
 *
 * Symptom: esbuild crashes with "Expected ';' but found ':'" because the
 * source file contains the LLM's proposed code instead of valid TypeScript.
 *
 * How it works:
 * 1. Checks .dgm-backup/ for backup files left by crashed DGM runs
 * 2. Restores each original file from its backup
 * 3. Removes the backup files
 *
 * The DGM validation code writes a backup to .dgm-backup/ BEFORE
 * overwriting a source file. If the process crashes before restoring,
 * the backup persists on disk and this script restores it on next start.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const BACKUP_DIR = join(ROOT, '.dgm-backup');

let restored = 0;

// Phase 1: Restore from .dgm-backup/ (deterministic — these are real backups)
try {
  if (existsSync(BACKUP_DIR)) {
    const backups = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.ts'));
    for (const backupFile of backups) {
      const backupPath = join(BACKUP_DIR, backupFile);
      // Decode filename: server__mother__foo.ts -> server/mother/foo.ts
      const originalRelPath = backupFile.replace(/__/g, '/');
      const originalFullPath = resolve(ROOT, originalRelPath);

      try {
        const content = readFileSync(backupPath, 'utf-8');
        if (content === '<<DGM_FILE_DID_NOT_EXIST>>') {
          // File didn't exist before DGM created it — delete it
          if (existsSync(originalFullPath)) {
            unlinkSync(originalFullPath);
            console.log(`[dgm-pre-start] DELETED DGM-created file: ${originalRelPath}`);
          }
        } else {
          writeFileSync(originalFullPath, content, 'utf-8');
          console.log(`[dgm-pre-start] RESTORED from backup: ${originalRelPath}`);
        }
        unlinkSync(backupPath);
        restored++;
      } catch (err) {
        console.warn(`[dgm-pre-start] Failed to restore ${originalRelPath}: ${err.message}`);
      }
    }
  }
} catch (err) {
  console.warn(`[dgm-pre-start] Warning: backup restore failed: ${err.message}`);
}

if (restored > 0) {
  console.log(`[dgm-pre-start] Self-heal complete: restored ${restored} file(s) from .dgm-backup/`);
}
