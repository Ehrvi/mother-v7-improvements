/**
 * Batch script: Replace all (db as any).$client.query → rawQuery
 * Adds import { rawQuery } from '../db' to each file
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOTHER_DIR = path.resolve(__dirname, '..', 'server', 'mother');

const FILES_TO_FIX = [
  'gea_supervisor.ts',
  'update-proposals.ts',
  'user-memory.ts',
  'reproposal-engine.ts',
  'self-proposal-engine.ts',
  'autonomous-update-job.ts',
  'a2a-server.ts',
];

let totalChanged = 0;
let totalCalls = 0;

for (const fileName of FILES_TO_FIX) {
  const filePath = path.join(MOTHER_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠ ${fileName} — file not found, skipping`);
    continue;
  }

  let src = fs.readFileSync(filePath, 'utf-8');
  
  const matches = src.match(/\(db as any\)\.\$client\.query\(/g);
  const callCount = matches?.length ?? 0;
  
  if (callCount === 0) {
    continue;
  }

  // Add rawQuery import if not already present
  if (!src.includes('rawQuery')) {
    // Check if there's an existing import from '../db' to extend
    const dbImportMatch = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/db['"]/);
    if (dbImportMatch) {
      const existingImports = dbImportMatch[1];
      const newImport = `import { ${existingImports.trim()}, rawQuery } from '../db'`;
      src = src.replace(dbImportMatch[0], newImport);
    } else {
      // Add new import after last import line
      const lines = src.split('\n');
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
          lastImportIdx = i;
        }
      }
      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, "import { rawQuery } from '../db';");
        src = lines.join('\n');
      }
    }
  }

  // Replace the anti-pattern
  // Pattern variants:
  // 1. const [rows] = await (db as any).$client.query(
  // 2. const rows = await (db as any).$client.query(  
  // 3. await (db as any).$client.query(
  // 4. const result = await (db as any).$client.query(
  src = src.replace(/\(db as any\)\.\$client\.query\(/g, 'rawQuery(');

  fs.writeFileSync(filePath, src, 'utf-8');
  totalChanged++;
  totalCalls += callCount;
  console.log(`✅ ${fileName} — ${callCount} calls replaced`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Total: ${totalChanged} files, ${totalCalls} calls: (db as any).$client.query → rawQuery`);
