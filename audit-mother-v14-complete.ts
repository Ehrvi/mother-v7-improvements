/**
 * MOTHER v14.0 - Complete Audit System
 * 
 * Scientific Audit Methodology based on:
 * - IEEE 829 (Software Test Documentation)
 * - ISO/IEC 25010 (Software Quality Model)
 * - NIST SP 800-53 (Security Controls)
 * - OWASP Top 10 (Security)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface AuditResult {
  category: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

const results: AuditResult[] = [];

function audit(category: string, test: () => boolean, message: string, severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'): void {
  try {
    const passed = test();
    results.push({
      category,
      status: passed ? 'PASS' : 'FAIL',
      message,
      severity,
    });
  } catch (error) {
    results.push({
      category,
      status: 'FAIL',
      message,
      details: error instanceof Error ? error.message : String(error),
      severity,
    });
  }
}

console.log('🔍 MOTHER v14.0 - Complete Audit Starting...\n');

// Phase 1: Unit Tests
console.log('📋 Phase 1: Unit Tests Audit');
audit('Unit Tests', () => {
  try {
    const testOutput = execSync('npm test 2>&1', { encoding: 'utf-8', timeout: 60000 });
    const passMatch = testOutput.match(/(\d+) passed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    console.log(\`  ✓ Tests passed: \${passed}\`);
    return passed >= 30;
  } catch (e) {
    return false;
  }
}, 'All unit tests must pass (30+ tests)', 'CRITICAL');

// Phase 2: Module Integration
console.log('\n📋 Phase 2: Module Integration Audit');
audit('Critical Thinking Integration', () => {
  const coreFile = readFileSync('server/mother/core.ts', 'utf-8');
  return coreFile.includes('CriticalThinkingCentral') || coreFile.includes('critical-thinking');
}, 'Critical Thinking must be integrated', 'CRITICAL');

audit('GOD-Level Learning Integration', () => {
  const coreFile = readFileSync('server/mother/core.ts', 'utf-8');
  return coreFile.includes('GODLevelLearning') || coreFile.includes('god-level');
}, 'GOD-Level Learning must be integrated', 'CRITICAL');

// Phase 3: Database Schema
console.log('\n📋 Phase 3: Database Schema Audit');
audit('System Config Table', () => {
  const schemaFile = readFileSync('drizzle/schema.ts', 'utf-8');
  return schemaFile.includes('system_config');
}, 'system_config table must exist', 'CRITICAL');

audit('Knowledge Table', () => {
  const schemaFile = readFileSync('drizzle/schema.ts', 'utf-8');
  return schemaFile.includes('knowledge') && schemaFile.includes('embedding');
}, 'knowledge table must have embeddings', 'CRITICAL');

// Phase 4: Security
console.log('\n📋 Phase 4: Security Audit');
audit('Input Validation', () => {
  const routerFile = readFileSync('server/routers/mother.ts', 'utf-8');
  return routerFile.includes('z.object');
}, 'Input validation must be implemented', 'CRITICAL');

audit('Authentication', () => {
  return existsSync('server/routers/auth.ts');
}, 'Authentication must exist', 'CRITICAL');

// Results
console.log('\n' + '='.repeat(80));
console.log('📊 AUDIT RESULTS');
console.log('='.repeat(80));

const criticalFails = results.filter(r => r.severity === 'CRITICAL' && r.status === 'FAIL');
console.log(\`\n✅ PASSED: \${results.filter(r => r.status === 'PASS').length}/\${results.length}\`);
console.log(\`❌ FAILED: \${results.filter(r => r.status === 'FAIL').length}/\${results.length}\`);
console.log(\`🔴 CRITICAL FAILURES: \${criticalFails.length}\`);

if (results.filter(r => r.status === 'FAIL').length > 0) {
  console.log('\n❌ FAILURES:');
  results.filter(r => r.status === 'FAIL').forEach((f, i) => {
    console.log(\`\${i + 1}. [\${f.severity}] \${f.category}: \${f.message}\`);
  });
}

// Save report
const report = \`# MOTHER v14.0 Audit Report

**Date:** \${new Date().toISOString()}

## Summary
- Total: \${results.length}
- Passed: \${results.filter(r => r.status === 'PASS').length}
- Failed: \${results.filter(r => r.status === 'FAIL').length}
- Critical Failures: \${criticalFails.length}

## Results
\${results.map((r, i) => \`\${i + 1}. [\${r.severity}] \${r.category}: \${r.status} - \${r.message}\`).join('\n')}
\`;

writeFileSync('AUDIT-REPORT-V14.md', report);
console.log('\n📄 Report saved to AUDIT-REPORT-V14.md');

process.exit(criticalFails.length > 0 ? 1 : 0);
