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
 * 1. Runs `git diff --name-only` to find dirty files
 * 2. For each dirty server/ file, checks if it looks like DGM corruption
 *    (the file starts with a JSON-like structure or has no valid TS)
 * 3. Restores via `git checkout -- <file>`
 */
import { execSync } from 'child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

try {
  const dirty = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);

  // Only check server/ files — DGM only modifies server code
  const serverFiles = dirty.filter(f => f.startsWith('server/'));
  if (serverFiles.length === 0) process.exit(0);

  // Check each file for DGM corruption signatures
  const { readFileSync, existsSync } = await import('fs');
  const { resolve } = await import('path');

  let restored = 0;
  for (const file of serverFiles) {
    const fullPath = resolve(ROOT, file);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const firstLine = content.split('\n')[0] || '';

      // DGM corruption signatures:
      // 1. File starts with { (LLM returned raw JSON instead of code)
      // 2. File starts with ``` (LLM wrapped output in markdown fences)
      // 3. File starts with "targetFile" or "codeChanges" (JSON field leaked)
      // 4. The .ts file fails basic syntax: no imports, no exports, no function/const/class
      const isCorrupted =
        firstLine.startsWith('{') ||
        firstLine.startsWith('```') ||
        firstLine.includes('"targetFile"') ||
        firstLine.includes('"codeChanges"') ||
        // A .ts file with no import/export/function/const/class/interface/type in first 500 chars
        // is almost certainly corrupted (all valid MOTHER .ts files have these)
        (file.endsWith('.ts') && !/\b(import|export|function|const|class|interface|type)\b/.test(content.slice(0, 500)));

      if (isCorrupted) {
        execSync(`git checkout -- "${file}"`, { cwd: ROOT, stdio: 'pipe' });
        console.log(`[dgm-pre-start] RESTORED corrupted file: ${file}`);
        restored++;
      }
    } catch {
      // If we can't read/check, try restoring anyway for safety
      try {
        execSync(`git checkout -- "${file}"`, { cwd: ROOT, stdio: 'pipe' });
        console.log(`[dgm-pre-start] RESTORED unreadable file: ${file}`);
        restored++;
      } catch { /* give up on this file */ }
    }
  }

  if (restored > 0) {
    console.log(`[dgm-pre-start] Self-heal complete: restored ${restored} corrupted file(s)`);
  }
} catch (err) {
  // Non-fatal — don't block server startup if git isn't available
  console.warn(`[dgm-pre-start] Warning: self-heal check failed: ${err.message}`);
}
