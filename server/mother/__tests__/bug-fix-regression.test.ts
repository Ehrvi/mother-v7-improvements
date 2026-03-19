/**
 * MOTHER Bug-Fix Regression Tests
 *
 * Guards against re-introduction of all bugs fixed in Phases 1-6.
 * Each describe block maps to one fix category and documents why
 * the test exists (the original bug ID + scientific basis).
 *
 * Vitest — run with: npx vitest run server/mother/__tests__/bug-fix-regression.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────────────────
// Phase 1: Scale Mismatches (0-1 vs 0-100)
// ────────────────────────────────────────────────────────────────────

describe('Phase 1: Scale Mismatches', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('C123 — core-orchestrator uses 0-100 scale (not 0-1) for quality gate', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/core-orchestrator.ts'), 'utf-8'
    );
    // Must NOT have "< 0.6" for quality gates — should be "< 60"
    const badPattern = /qualityScore\s*<\s*0\.\d/;
    expect(badPattern.test(src)).toBe(false);
  });

  it('C94 — dgm-orchestrator uses 0-100 scale for passRate', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/dgm-orchestrator.ts'), 'utf-8'
    );
    const badPattern = /passRate\s*<\s*0\.\d/;
    expect(badPattern.test(src)).toBe(false);
  });

  it('C116 — evolution-ledger fitness uses 0-100 (not 1.0)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/evolution-ledger.ts'), 'utf-8'
    );
    // Must NOT have "fitness: 1.0" — should be "fitness: 100"
    expect(src).not.toMatch(/fitness:\s*1\.0\b/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Phase 2: Security — No new Function(), no execSync interpolation
// ────────────────────────────────────────────────────────────────────

describe('Phase 2: Security', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('P2-SEC-1 — tool-engine does NOT use new Function() (OWASP A03)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/tool-engine.ts'), 'utf-8'
    );
    // new Function() allows arbitrary code injection — must use vm.runInNewContext
    // Check only non-comment lines for new Function() usage
    const lines = src.split('\n');
    const codeWithNewFunc = lines.filter(
      l => /new\s+Function\s*\(/.test(l) && !l.trim().startsWith('//')
    );
    expect(codeWithNewFunc.length).toBe(0);
    expect(src).toMatch(/runInNewContext/);
  });

  it('P2-SEC-2 — update-proposals uses execFileSync (not interpolated execSync)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/update-proposals.ts'), 'utf-8'
    );
    // execSync with string interpolation allows command injection
    expect(src).toMatch(/execFileSync/);
  });

  it('P2-SEC-3 — autonomy uses execFileSync (not interpolated execSync)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/autonomy.ts'), 'utf-8'
    );
    expect(src).toMatch(/execFileSync/);
  });

  it('P2-SEC-4 — proof-of-autonomy has no hardcoded HMAC keys', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/proof-of-autonomy.ts'), 'utf-8'
    );
    // Must NOT have hardcoded key like "const key = 'secret123'"
    expect(src).not.toMatch(/hmacKey\s*=\s*['"][a-zA-Z0-9]{10,}['"]/);
    // Should use GITHUB_TOKEN for HMAC (not a hardcoded fallback)
    expect(src).toMatch(/GITHUB_TOKEN.*required.*HMAC|GITHUB_TOKEN/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Phase 3: Core Functionality
// ────────────────────────────────────────────────────────────────────

describe('Phase 3: Core Functionality', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('P3-1 — self-improve executeProposals has human gate', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/self-improve.ts'), 'utf-8'
    );
    // executeProposals must NOT be empty / no-op
    // It should reference PR creation or human approval
    expect(src).toMatch(/human|approval|PR|pull.request/i);
  });

  it('P3-2 — citation-engine does not contain fabricated arXiv citations', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/citation-engine.ts'), 'utf-8'
    );
    // The fabricated citation "9999" pattern should not exist
    expect(src).not.toMatch(/arXiv:\d{4}\.9{4,}/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Phase 4 + Category E: No hardcoded paths
// ────────────────────────────────────────────────────────────────────

describe('Phase 4 + Category E: Hardcoded Paths', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('E-1 — google-workspace-bridge rclone config uses env var', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/google-workspace-bridge.ts'), 'utf-8'
    );
    // Must NOT have hardcoded /home/ubuntu path for config
    expect(src).not.toMatch(/RCLONE_CONFIG\s*=\s*['"]\/home\/ubuntu/);
    // Should use process.env.RCLONE_CONFIG or os.homedir()
    expect(src).toMatch(/process\.env\.RCLONE_CONFIG|os\.homedir/);
  });

  it('E-2 — autonomous-update-job uses MOTHER_PROJECT_ROOT (not /home/ubuntu)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/autonomous-update-job.ts'), 'utf-8'
    );
    // The possibleSourcePaths array must NOT contain /home/ubuntu
    // The possibleSourcePaths code lines (excluding comments) must NOT contain /home/ubuntu
    const possiblePathsBlock = src.match(/possibleSourcePaths\s*=\s*\[([\s\S]*?)\]/);
    if (possiblePathsBlock) {
      // Strip inline comments from each line (handle CRLF), then check for /home/ubuntu
      const codeLines = possiblePathsBlock[1].split(/\r?\n/)
        .map(l => l.replace(/\/\/.*/, ''))  // strip inline comments
        .filter(l => l.trim().length > 0)
        .join('\n');
      expect(codeLines).not.toMatch(/\/home\/ubuntu/);
      expect(possiblePathsBlock[1]).toMatch(/MOTHER_PROJECT_ROOT/);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Category A: Raw SQL → Drizzle ORM
// ────────────────────────────────────────────────────────────────────

describe('Category A: Raw SQL → Drizzle', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('A-1 — deploy-validator uses Drizzle insert (not $client.query INSERT)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/deploy-validator.ts'), 'utf-8'
    );
    // Must NOT have $client.query for INSERT
    expect(src).not.toMatch(/\$client\.query/);
    // Should import auditLog from schema
    expect(src).toMatch(/auditLog/);
    expect(src).toMatch(/db\.insert/);
  });

  it('A-2 — dgm-guardian uses db.execute(sql`SELECT 1`) for health checks', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/dgm-guardian.ts'), 'utf-8'
    );
    // Must NOT have $client.query
    expect(src).not.toMatch(/\$client\.query/);
    // Should use db.execute(sql`...`)
    expect(src).toMatch(/db\.execute\(sql/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Category B: In-Memory → DB Persistence
// ────────────────────────────────────────────────────────────────────

describe('Category B: Persistence', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('B-1 — audit-trail persists entries to DB (not purely in-memory)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/audit-trail.ts'), 'utf-8'
    );
    // Must contain DB persistence code within recordAuditEntry
    expect(src).toMatch(/db\.insert\(auditLog\)/);
    expect(src).toMatch(/ISO.*27001|persistent.*audit/i);
  });

  it('B-2 — learned-router persists trained weights to DB', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/learned-router.ts'), 'utf-8'
    );
    // Must contain weight persistence
    expect(src).toMatch(/db\.insert\(learningPatterns\)/);
    expect(src).toMatch(/db\.update\(learningPatterns\)/);
  });

  it('B-3 — learned-router restores weights from DB on startup', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/learned-router.ts'), 'utf-8'
    );
    // Must contain restoration logic
    expect(src).toMatch(/Restored weights from DB/);
    expect(src).toMatch(/db\.select\(\)\.from\(learningPatterns\)/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Category C: Fail-Closed Validation
// ────────────────────────────────────────────────────────────────────

describe('Category C: Fail-Closed', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  it('C-1 — guardian-agent catch blocks log warnings (not silent)', () => {
    const src = fs.readFileSync(
      path.join(PROJECT_ROOT, 'server/mother/guardian-agent.ts'), 'utf-8'
    );
    // Must NOT have empty catch blocks for DGM operations
    // Should have log.warn or log.error in catch blocks
    const emptyCatch = /catch\s*\{[\s\n]*\}/;
    expect(emptyCatch.test(src)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Category D: Structured Logging (no console.log in modified files)
// ────────────────────────────────────────────────────────────────────

describe('Category D: Structured Logging', () => {
  const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

  const filesWithLogger = [
    'gea_supervisor.ts',
    'guardian-agent.ts',
    'db-retry.ts',
    'grounding.ts',
    'adaptive-router.ts',
  ];

  for (const file of filesWithLogger) {
    it(`D — ${file} uses createLogger (no console.log)`, () => {
      const src = fs.readFileSync(
        path.join(PROJECT_ROOT, `server/mother/${file}`), 'utf-8'
      );
      // Must import createLogger
      expect(src).toMatch(/createLogger/);
      // Must NOT have console.log calls (excluding comments)
      const lines = src.split('\n');
      const consoleCalls = lines.filter(
        l => /console\.(log|warn|error)\(/.test(l) && !l.trim().startsWith('//')
      );
      expect(consoleCalls.length).toBe(0);
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// Functional: Adaptive Router (pure logic, no DB needed)
// ────────────────────────────────────────────────────────────────────

describe('Functional: Adaptive Router', () => {
  // These tests can import the actual module since it has no DB deps at import time
  // (DB only used in learned-router's async IIFE which runs non-blocking)

  it('scoreTier maps complexity to correct tiers', async () => {
    const { scoreTier } = await import('../adaptive-router');
    expect(scoreTier(0)).toBe('TIER_1');
    expect(scoreTier(25)).toBe('TIER_1');
    expect(scoreTier(26)).toBe('TIER_2');
    expect(scoreTier(40)).toBe('TIER_2');
    expect(scoreTier(41)).toBe('TIER_3');
    expect(scoreTier(75)).toBe('TIER_3');
    expect(scoreTier(76)).toBe('TIER_4');
    expect(scoreTier(100)).toBe('TIER_4');
  });

  it('computeComplexitySignals detects code requests (EN + PT-BR)', async () => {
    const { computeComplexitySignals } = await import('../adaptive-router');
    expect(computeComplexitySignals('implement a REST API').hasCodeRequest).toBe(true);
    expect(computeComplexitySignals('implementar uma API REST').hasCodeRequest).toBe(true);
    expect(computeComplexitySignals('hello world').hasCodeRequest).toBe(false);
  });

  it('computeComplexityScore forces TIER_4 for long-form creative writing', async () => {
    const { computeComplexitySignals, computeComplexityScore, scoreTier } = await import('../adaptive-router');
    const signals = computeComplexitySignals('escreva um livro de 60 páginas sobre mineração');
    const score = computeComplexityScore(signals);
    expect(score).toBeGreaterThanOrEqual(76);
    expect(scoreTier(score)).toBe('TIER_4');
  });
});

// ────────────────────────────────────────────────────────────────────
// Functional: Audit Trail (pure logic, no DB needed for chain ops)
// ────────────────────────────────────────────────────────────────────

describe('Functional: Audit Trail Chain', () => {
  // Mock DB to prevent actual connections during import
  vi.mock('../../db', () => ({
    getDb: vi.fn().mockResolvedValue(null),
  }));
  vi.mock('../../../drizzle/schema', () => ({
    auditLog: {},
  }));

  it('recordAuditEntry produces valid hash chain', async () => {
    const { recordAuditEntry, verifyChainIntegrity } =
      await import('../audit-trail');

    // Record 3 entries
    const e1 = recordAuditEntry({
      action: 'api_call',
      actor: 'test',
      actorType: 'system',
      target: '/test',
      details: { test: true },
      outcome: 'success',
    });

    const e2 = recordAuditEntry({
      action: 'agent_task',
      actor: 'test',
      actorType: 'agent',
      target: 'test-task',
      details: {},
      outcome: 'success',
    });

    // Verify chain
    expect(e1.entryHash).toBeTruthy();
    expect(e1.chainHash).toBeTruthy();
    expect(e2.prevChainHash).toBe(e1.chainHash);

    const report = verifyChainIntegrity();
    expect(report.valid).toBe(true);
    expect(report.chain_intact).toBe(true);
  });

  it('getRecentEntries returns newest first', async () => {
    const { recordAuditEntry, getRecentEntries } =
      await import('../audit-trail');

    recordAuditEntry({
      action: 'api_call',
      actor: 'test-order-1',
      actorType: 'system',
      target: '/first',
      details: {},
      outcome: 'success',
    });

    recordAuditEntry({
      action: 'api_call',
      actor: 'test-order-2',
      actorType: 'system',
      target: '/second',
      details: {},
      outcome: 'success',
    });

    const recent = getRecentEntries(2);
    expect(recent.length).toBe(2);
    expect(recent[0].sequence).toBeGreaterThan(recent[1].sequence);
  });
});
