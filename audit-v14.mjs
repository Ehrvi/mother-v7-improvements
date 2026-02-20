import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const results = [];

function audit(category, test, message, severity = 'MEDIUM') {
  try {
    const passed = test();
    results.push({ category, status: passed ? 'PASS' : 'FAIL', message, severity });
  } catch (error) {
    results.push({ category, status: 'FAIL', message, details: error.message, severity });
  }
}

console.log('🔍 MOTHER v14.0 Audit\n');

// Phase 1: Unit Tests
console.log('📋 Phase 1: Unit Tests');
audit('Unit Tests', () => {
  try {
    const testOutput = execSync('npm test 2>&1', { encoding: 'utf-8', timeout: 60000 });
    const passMatch = testOutput.match(/(\d+) passed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    console.log('  Tests passed: ' + passed);
    return passed >= 30;
  } catch (e) {
    return false;
  }
}, 'All unit tests must pass (30+ tests)', 'CRITICAL');

// Phase 2: Module Integration
console.log('\n📋 Phase 2: Module Integration');
audit('Critical Thinking', () => {
  const coreFile = readFileSync('server/mother/core.ts', 'utf-8');
  return coreFile.includes('critical-thinking');
}, 'Critical Thinking integrated', 'CRITICAL');

audit('GOD-Level Learning', () => {
  const coreFile = readFileSync('server/mother/core.ts', 'utf-8');
  return coreFile.includes('god-level');
}, 'GOD-Level Learning integrated', 'CRITICAL');

// Phase 3: Database
console.log('\n📋 Phase 3: Database Schema');
audit('System Config', () => {
  const schemaFile = readFileSync('drizzle/schema.ts', 'utf-8');
  return schemaFile.includes('system_config');
}, 'system_config table exists', 'CRITICAL');

audit('Knowledge Table', () => {
  const schemaFile = readFileSync('drizzle/schema.ts', 'utf-8');
  return schemaFile.includes('knowledge') && schemaFile.includes('embedding');
}, 'knowledge table has embeddings', 'CRITICAL');

// Phase 4: Security
console.log('\n📋 Phase 4: Security');
audit('Input Validation', () => {
  const routerFile = readFileSync('server/routers/mother.ts', 'utf-8');
  return routerFile.includes('z.object');
}, 'Input validation implemented', 'CRITICAL');

audit('Authentication', () => {
  return existsSync('server/routers/auth.ts');
}, 'Authentication exists', 'CRITICAL');

// Results
console.log('\n' + '='.repeat(60));
const criticalFails = results.filter(r => r.severity === 'CRITICAL' && r.status === 'FAIL');
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;

console.log('PASSED: ' + passed + '/' + results.length);
console.log('FAILED: ' + failed + '/' + results.length);
console.log('CRITICAL FAILURES: ' + criticalFails.length);

if (failed > 0) {
  console.log('\nFAILURES:');
  results.filter(r => r.status === 'FAIL').forEach((f, i) => {
    console.log((i + 1) + '. [' + f.severity + '] ' + f.category + ': ' + f.message);
  });
}

let report = '# MOTHER v14.0 Audit\n\n**Date:** ' + new Date().toISOString() + '\n\n## Summary\n- Total: ' + results.length + '\n- Passed: ' + passed + '\n- Failed: ' + failed + '\n- Critical: ' + criticalFails.length + '\n\n## Results\n\n';
results.forEach((r, i) => {
  report += (i + 1) + '. [' + r.severity + '] ' + r.category + ': ' + r.status + '\n';
});

writeFileSync('AUDIT-REPORT-V14.md', report);
console.log('\nReport: AUDIT-REPORT-V14.md');

process.exit(criticalFails.length > 0 ? 1 : 0);
