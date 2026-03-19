/**
 * Batch fix: Replace remaining console.log/warn/error with log calls
 * in files that already have createLogger imported
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOTHER_DIR = path.resolve(__dirname, '..', 'server', 'mother');

const FILES = [
  'core.ts',
  'knowledge.ts',
  'e2b-sandbox.ts',
  'dgm-orchestrator.ts',
  'citation-engine.ts',
];

let total = 0;
for (const f of FILES) {
  const fp = path.join(MOTHER_DIR, f);
  if (!fs.existsSync(fp)) { console.log(`⚠ ${f} not found`); continue; }
  let src = fs.readFileSync(fp, 'utf-8');
  
  // Verify createLogger is imported and log is defined
  if (!src.includes('createLogger') || !src.includes('const log =')) {
    console.log(`⚠ ${f} — no createLogger/log, skipping`);
    continue;
  }
  
  let count = 0;
  // Replace console.log → log.info, console.warn → log.warn, console.error → log.error
  src = src.replace(/console\.log\(/g, () => { count++; return 'log.info('; });
  src = src.replace(/console\.warn\(/g, () => { count++; return 'log.warn('; });
  src = src.replace(/console\.error\(/g, () => { count++; return 'log.error('; });
  
  fs.writeFileSync(fp, src, 'utf-8');
  total += count;
  console.log(`✅ ${f} — ${count} calls`);
}
console.log(`\nTotal: ${total} console calls replaced`);
