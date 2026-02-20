#!/usr/bin/env node

/**
 * Sync Lições #26 and #27 to MOTHER Production
 * 
 * Adds new lessons learned to production database
 */

import Database from 'better-sqlite3';
import fs from 'fs';

const DB_PATH = '/home/ubuntu/mother-interface/mother.db';

console.log('🔄 Syncing Lições #26 and #27 to Production Database');
console.log('='.repeat(70));
console.log('');

// Read LESSONS-LEARNED-UPDATED.md
const lessonsFile = '/home/ubuntu/mother-interface/LESSONS-LEARNED-UPDATED.md';
const lessonsContent = fs.readFileSync(lessonsFile, 'utf-8');

// Extract Lição #26
const licao26Match = lessonsContent.match(/## Lição #26: Cloud Build Trigger Validation Protocol[\s\S]*?(?=\n## Lição #27|$)/);
const licao26 = licao26Match ? licao26Match[0] : null;

// Extract Lição #27
const licao27Match = lessonsContent.match(/## Lição #27: Cross-Platform Documentation[\s\S]*?(?=\n## Lição #|---\n|$)/);
const licao27 = licao27Match ? licao27Match[0] : null;

if (!licao26 || !licao27) {
  console.error('❌ Failed to extract Lições #26 or #27 from file');
  process.exit(1);
}

console.log('✅ Extracted Lição #26 (', licao26.length, 'chars)');
console.log('✅ Extracted Lição #27 (', licao27.length, 'chars)');
console.log('');

// Connect to database
const db = new Database(DB_PATH);

// Check current knowledge count
const countBefore = db.prepare('SELECT COUNT(*) as count FROM knowledge').get();
console.log(`📊 Knowledge entries before sync: ${countBefore.count}`);
console.log('');

// Check if Lições already exist
const existing26 = db.prepare('SELECT id FROM knowledge WHERE title LIKE ?').get('%Lição #26%');
const existing27 = db.prepare('SELECT id FROM knowledge WHERE title LIKE ?').get('%Lição #27%');

if (existing26) {
  console.log('⚠️  Lição #26 already exists (id:', existing26.id, ') - Skipping');
} else {
  // Insert Lição #26
  const insert26 = db.prepare(`
    INSERT INTO knowledge (title, content, category, tags, confidence, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insert26.run(
    'Lição #26: Cloud Build Trigger Validation Protocol',
    licao26,
    'deployment',
    'cloud-build,trigger,validation,ci-cd,deployment,testing',
    10,
    new Date().toISOString(),
    new Date().toISOString()
  );

  console.log('✅ Inserted Lição #26 into database');
}

if (existing27) {
  console.log('⚠️  Lição #27 already exists (id:', existing27.id, ') - Skipping');
} else {
  // Insert Lição #27
  const insert27 = db.prepare(`
    INSERT INTO knowledge (title, content, category, tags, confidence, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insert27.run(
    'Lição #27: Cross-Platform Documentation',
    licao27,
    'documentation',
    'cross-platform,windows,linux,mac,documentation,best-practices',
    10,
    new Date().toISOString(),
    new Date().toISOString()
  );

  console.log('✅ Inserted Lição #27 into database');
}

// Check final count
const countAfter = db.prepare('SELECT COUNT(*) as count FROM knowledge').get();
console.log('');
console.log(`📊 Knowledge entries after sync: ${countAfter.count}`);
console.log(`📈 Added: ${countAfter.count - countBefore.count} new entries`);
console.log('');

// Verify insertion
const verify26 = db.prepare('SELECT id, title, confidence FROM knowledge WHERE title LIKE ?').get('%Lição #26%');
const verify27 = db.prepare('SELECT id, title, confidence FROM knowledge WHERE title LIKE ?').get('%Lição #27%');

if (verify26) {
  console.log('✅ Verified Lição #26:', verify26.title, '(id:', verify26.id, ', confidence:', verify26.confidence, ')');
}

if (verify27) {
  console.log('✅ Verified Lição #27:', verify27.title, '(id:', verify27.id, ', confidence:', verify27.confidence, ')');
}

db.close();

console.log('');
console.log('='.repeat(70));
console.log('✅ Sync Complete!');
console.log('');
console.log('Next Steps:');
console.log('1. Restart dev server to reload knowledge');
console.log('2. Query MOTHER API to validate Lição #26 present');
console.log('3. Deploy to production via Cloud Build trigger');
console.log('');
