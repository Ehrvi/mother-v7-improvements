/**
 * Batch script: Convert all console.log/warn/error → createLogger in server/mother/*.ts
 * 
 * Strategy:
 * 1. Find all .ts files with console.log/warn/error (excluding __tests__, .test.ts)
 * 2. For each file:
 *    a. Check if createLogger is already imported → skip if yes
 *    b. Add import + logger creation
 *    c. Replace console.log → log.info, console.warn → log.warn, console.error → log.error
 * 3. Report what was changed
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOTHER_DIR = path.resolve(__dirname, '..', 'server', 'mother');

// Files that already have createLogger (skip these)
const ALREADY_DONE = new Set<string>();

// Get all .ts files in server/mother
function getFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...getFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

function getLoggerName(filename: string): string {
  // Convert filename to UPPER_SNAKE_CASE
  const base = path.basename(filename, '.ts');
  return base
    .replace(/[-_]/g, '_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .slice(0, 30);
}

function processFile(filePath: string): { changed: boolean; consoleCalls: number } {
  let src = fs.readFileSync(filePath, 'utf-8');
  
  // Skip if already has createLogger
  if (src.includes('createLogger')) {
    return { changed: false, consoleCalls: 0 };
  }
  
  // Count console calls (excluding comments)
  const lines = src.split('\n');
  const consoleCalls = lines.filter(
    l => /console\.(log|warn|error)\(/.test(l) && !l.trim().startsWith('//')
  ).length;
  
  if (consoleCalls === 0) {
    return { changed: false, consoleCalls: 0 };
  }
  
  const loggerName = getLoggerName(filePath);
  
  // Find the right place to add the import
  // After the last import statement
  const importLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) || /^import\(/.test(lines[i].trim())) {
      importLines.push(i);
    }
  }
  
  const lastImportLine = importLines.length > 0 ? importLines[importLines.length - 1] : -1;
  
  // Add import and logger creation after last import
  const importStatement = `import { createLogger } from '../_core/logger';`;
  const loggerCreation = `const log = createLogger('${loggerName}');`;
  
  // Check if the file uses relative imports to figure out depth
  const hasDeepImport = src.includes("from '../../");
  const adjustedImport = hasDeepImport 
    ? `import { createLogger } from '../../_core/logger';`
    : importStatement;
  
  if (lastImportLine >= 0) {
    lines.splice(lastImportLine + 1, 0, adjustedImport, loggerCreation, '');
  } else {
    // No imports found — add at top after any comments/doc blocks
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('/**') || lines[i].trim().startsWith('*') || lines[i].trim().startsWith('//') || lines[i].trim() === '') {
        insertAt = i + 1;
      } else {
        break;
      }
    }
    lines.splice(insertAt, 0, adjustedImport, loggerCreation, '');
  }
  
  // Replace console calls
  let result = lines.join('\n');
  
  // Replace console.log → log.info (preserving the message)
  result = result.replace(/console\.log\(/g, 'log.info(');
  // Replace console.warn → log.warn
  result = result.replace(/console\.warn\(/g, 'log.warn(');
  // Replace console.error → log.error
  result = result.replace(/console\.error\(/g, 'log.error(');
  
  fs.writeFileSync(filePath, result, 'utf-8');
  
  return { changed: true, consoleCalls };
}

// Main
const files = getFiles(MOTHER_DIR);
let totalChanged = 0;
let totalCalls = 0;

console.log(`Scanning ${files.length} files in ${MOTHER_DIR}...\n`);

for (const file of files) {
  const { changed, consoleCalls } = processFile(file);
  if (changed) {
    totalChanged++;
    totalCalls += consoleCalls;
    console.log(`✅ ${path.relative(MOTHER_DIR, file)} — ${consoleCalls} calls converted`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Total: ${totalChanged} files changed, ${totalCalls} console calls converted`);
