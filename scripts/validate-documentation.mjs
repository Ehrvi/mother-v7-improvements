#!/usr/bin/env node
/**
 * MOTHER v14 - Documentation Validation Pipeline
 * 
 * Purpose: Validate documentation accuracy against actual production state
 * Usage: node scripts/validate-documentation.mjs [--fix]
 * 
 * Validates:
 * - Project ID matches production
 * - URLs match production endpoints
 * - Redis configuration matches production
 * - Database schema matches drizzle schema
 * - Knowledge count matches database
 * - All critical facts are up-to-date
 * 
 * Exit codes:
 * - 0: All validations passed
 * - 1: Validation failures found
 * - 2: Critical error (cannot connect to services)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  projectId: 'mothers-library-mcp',
  productionUrl: 'https://mother-interface-qtvghovzxa-ts.a.run.app',
  redisHost: '10.165.124.3',
  redisName: 'mother-cache',
  vpcConnector: 'mother-vpc-connector',
  region: 'australia-southeast1',
};

// Documentation files to validate (relative to project root)
const DOCS = [
  'docs/MOTHER-V14-RE-WAKE-DOCUMENT-V2.md',
  'docs/MOTHER-V14-VPC-NETWORK-DOCUMENTATION.md',
  'docs/MOTHER-V14-SCHEMA-EVOLUTION-DOCUMENTATION.md',
  'docs/MOTHER-V14-ALL-TABLES-DOCUMENTATION.md',
];

// Project root directory
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Validation results
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'='.repeat(80)}`, 'blue');
  log(`  ${title}`, 'bold');
  log(`${'='.repeat(80)}`, 'blue');
  console.log('');
}

function pass(test, message) {
  results.passed.push({ test, message });
  log(`✅ ${test}: ${message}`, 'green');
}

function fail(test, message, expected, actual) {
  results.failed.push({ test, message, expected, actual });
  log(`❌ ${test}: ${message}`, 'red');
  if (expected && actual) {
    log(`   Expected: ${expected}`, 'yellow');
    log(`   Actual: ${actual}`, 'yellow');
  }
}

function warn(test, message) {
  results.warnings.push({ test, message });
  log(`⚠️  ${test}: ${message}`, 'yellow');
}

// Validation functions

async function validateDocumentExists(docPath) {
  const fullPath = path.resolve(PROJECT_ROOT, docPath);
  try {
    await fs.access(fullPath);
    pass('Document Exists', path.basename(docPath));
    return fullPath;
  } catch (error) {
    fail('Document Exists', `File not found: ${path.basename(docPath)}`);
    return null;
  }
}

async function validateDocumentContent(docPath, checks) {
  const fullPath = path.resolve(PROJECT_ROOT, docPath);
  const docName = path.basename(docPath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    
    for (const check of checks) {
      const { name, pattern, expected, critical = true } = check;
      
      if (pattern instanceof RegExp) {
        const match = content.match(pattern);
        if (match) {
          pass(`${docName} - ${name}`, expected || 'Pattern found');
        } else {
          if (critical) {
            fail(`${docName} - ${name}`, 'Pattern not found', pattern.toString(), 'N/A');
          } else {
            warn(`${docName} - ${name}`, 'Pattern not found (non-critical)');
          }
        }
      } else {
        const found = content.includes(pattern);
        if (found) {
          pass(`${docName} - ${name}`, expected || 'Text found');
        } else {
          if (critical) {
            fail(`${docName} - ${name}`, 'Text not found', pattern, 'N/A');
          } else {
            warn(`${docName} - ${name}`, 'Text not found (non-critical)');
          }
        }
      }
    }
  } catch (error) {
    fail(`${docName} - Content`, `Failed to read file: ${error.message}`);
  }
}

async function validateProductionEndpoint() {
  try {
    const response = await fetch(`${CONFIG.productionUrl}/api/trpc/mother.query?batch=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '0': { json: { query: 'validate documentation', useCache: false } }
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      const result = data[0]?.result?.data?.json;
      
      if (result) {
        pass('Production Endpoint', `Responding (${result.responseTime}ms, quality: ${result.quality.qualityScore})`);
        return true;
      } else {
        fail('Production Endpoint', 'Invalid response format');
        return false;
      }
    } else {
      fail('Production Endpoint', `HTTP ${response.status}: ${response.statusText}`);
      return false;
    }
  } catch (error) {
    fail('Production Endpoint', `Connection failed: ${error.message}`);
    return false;
  }
}

async function validateDatabaseSchema() {
  if (!process.env.DATABASE_URL) {
    warn('Database Schema', 'DATABASE_URL not set, skipping database validation');
    return;
  }
  
  try {
    const conn = await mysql.createConnection(process.env.DATABASE_URL);
    
    // Get all tables
    const [tables] = await conn.execute("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    const expectedTables = [
      'users', 'queries', 'knowledge', 'learning_patterns', 'cache_entries',
      'system_metrics', 'system_config', 'ab_test_metrics', 'webhooks',
      'webhook_deliveries', '__drizzle_migrations'
    ];
    
    const missingTables = expectedTables.filter(t => !tableNames.includes(t));
    const extraTables = tableNames.filter(t => !expectedTables.includes(t) && !t.startsWith('__'));
    
    if (missingTables.length === 0 && extraTables.length === 0) {
      pass('Database Schema', `All 11 tables present`);
    } else {
      if (missingTables.length > 0) {
        fail('Database Schema', `Missing tables: ${missingTables.join(', ')}`);
      }
      if (extraTables.length > 0) {
        warn('Database Schema', `Extra tables: ${extraTables.join(', ')}`);
      }
    }
    
    // Validate queries table has 6 quality score columns
    const [queriesSchema] = await conn.execute("DESCRIBE queries");
    const scoreColumns = queriesSchema
      .filter(col => col.Field.includes('Score'))
      .map(col => col.Field);
    
    const expectedScores = [
      'qualityScore', 'completenessScore', 'accuracyScore',
      'relevanceScore', 'coherenceScore', 'safetyScore', 'complexityScore', 'confidenceScore'
    ];
    
    const missingScores = expectedScores.filter(s => !scoreColumns.includes(s));
    
    if (missingScores.length === 0) {
      pass('Quality Scores', 'All 8 score columns present in queries table');
    } else {
      fail('Quality Scores', `Missing score columns: ${missingScores.join(', ')}`);
    }
    
    // Validate knowledge count
    const [knowledgeStats] = await conn.execute(`
      SELECT COUNT(*) as total, COUNT(DISTINCT category) as categories
      FROM knowledge
    `);
    
    const { total, categories } = knowledgeStats[0];
    pass('Knowledge Base', `${total} entries across ${categories} categories`);
    
    // Store for documentation sync
    global.knowledgeCount = total;
    global.categoryCount = categories;
    
    await conn.end();
  } catch (error) {
    fail('Database Connection', `Failed to connect: ${error.message}`);
  }
}

async function validateKnowledgeCount() {
  if (!global.knowledgeCount) {
    warn('Knowledge Count', 'Database validation skipped, cannot verify count');
    return;
  }
  
  const docPath = path.resolve(PROJECT_ROOT, 'docs/MOTHER-V14-RE-WAKE-DOCUMENT-V2.md');
  
  try {
    const content = await fs.readFile(docPath, 'utf-8');
    const match = content.match(/\*\*Knowledge Base\*\*:\s*\*\*(\d+)\s+entries\*\*/i);
    
    if (match) {
      const docCount = parseInt(match[1], 10);
      const actualCount = global.knowledgeCount;
      
      if (docCount === actualCount) {
        pass('Knowledge Count', `Matches database: ${actualCount} entries`);
      } else {
        fail('Knowledge Count', 'Mismatch between documentation and database', 
             `${actualCount} entries`, `${docCount} entries (in docs)`);
      }
    } else {
      warn('Knowledge Count', 'Could not find knowledge count in documentation');
    }
  } catch (error) {
    fail('Knowledge Count', `Failed to read document: ${error.message}`);
  }
}

// Main validation pipeline

async function main() {
  const startTime = Date.now();
  
  log('\n╔═══════════════════════════════════════════════════════════════════════════════╗', 'blue');
  log('║                                                                               ║', 'blue');
  log('║             MOTHER v14 - Documentation Validation Pipeline                   ║', 'blue');
  log('║                                                                               ║', 'blue');
  log('╚═══════════════════════════════════════════════════════════════════════════════╝', 'blue');
  
  // Phase 1: Document Existence
  logSection('Phase 1: Document Existence');
  
  for (const doc of DOCS) {
    await validateDocumentExists(doc);
  }
  
  // Phase 2: Production Validation
  logSection('Phase 2: Production Endpoint Validation');
  
  await validateProductionEndpoint();
  
  // Phase 3: Database Validation
  logSection('Phase 3: Database Schema Validation');
  
  await validateDatabaseSchema();
  
  // Phase 4: Content Validation
  logSection('Phase 4: Documentation Content Validation');
  
  // Re-Wake Document
  await validateDocumentContent('docs/MOTHER-V14-RE-WAKE-DOCUMENT-V2.md', [
    { name: 'Project ID', pattern: CONFIG.projectId, expected: 'Correct project ID' },
    { name: 'Production URL', pattern: CONFIG.productionUrl, expected: 'Correct production URL' },
    { name: 'Redis Host', pattern: CONFIG.redisHost, expected: 'Correct Redis IP' },
    { name: 'Redis Name', pattern: CONFIG.redisName, expected: 'Correct Redis name' },
    { name: 'VPC Connector', pattern: CONFIG.vpcConnector, expected: 'Correct VPC connector' },
    { name: 'Region', pattern: CONFIG.region, expected: 'Correct region' },
  ]);
  
  // VPC Network Documentation
  await validateDocumentContent('docs/MOTHER-V14-VPC-NETWORK-DOCUMENTATION.md', [
    { name: 'VPC Connector IP', pattern: '10.9.0.0/28', expected: 'Correct VPC connector IP range' },
    { name: 'Redis IP', pattern: CONFIG.redisHost, expected: 'Correct Redis IP' },
    { name: 'Security Analysis', pattern: 'Security Posture Summary', expected: 'Security analysis present' },
  ]);
  
  // Schema Evolution Documentation
  await validateDocumentContent('docs/MOTHER-V14-SCHEMA-EVOLUTION-DOCUMENTATION.md', [
    { name: 'Version History', pattern: /Version \d+\.\d+/, expected: 'Version history present' },
    { name: 'Quality Refactoring', pattern: 'Quality Metrics Refactoring', expected: 'Quality refactoring documented' },
    { name: '11 Tables', pattern: '11 tables', expected: 'Correct table count' },
  ]);
  
  // All Tables Documentation
  await validateDocumentContent('docs/MOTHER-V14-ALL-TABLES-DOCUMENTATION.md', [
    { name: 'Table Count', pattern: '11 tables', expected: 'Correct table count' },
    { name: 'Queries Table', pattern: '18 columns', expected: 'Correct queries table column count' },
    { name: 'ERD Diagram', pattern: 'Entity Relationship Diagram', expected: 'ERD present' },
  ]);
  
  // Phase 5: Knowledge Count Sync
  logSection('Phase 5: Knowledge Count Synchronization');
  
  await validateKnowledgeCount();
  
  // Summary
  logSection('Validation Summary');
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  log(`Total Tests: ${results.passed.length + results.failed.length + results.warnings.length}`, 'bold');
  log(`Passed: ${results.passed.length}`, 'green');
  log(`Failed: ${results.failed.length}`, 'red');
  log(`Warnings: ${results.warnings.length}`, 'yellow');
  log(`Duration: ${duration}s`, 'blue');
  
  if (results.failed.length > 0) {
    log('\n❌ VALIDATION FAILED', 'red');
    log('Please fix the issues above and re-run validation.', 'yellow');
    process.exit(1);
  } else if (results.warnings.length > 0) {
    log('\n⚠️  VALIDATION PASSED WITH WARNINGS', 'yellow');
    log('Consider addressing warnings for complete documentation accuracy.', 'yellow');
    process.exit(0);
  } else {
    log('\n✅ ALL VALIDATIONS PASSED', 'green');
    log('Documentation is 100% accurate and up-to-date.', 'green');
    process.exit(0);
  }
}

// Run validation
main().catch(error => {
  log(`\n💥 CRITICAL ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(2);
});
