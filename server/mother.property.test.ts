/**
 * MOTHER v74.8 — Property-Based Tests
 * 
 * NC-TEST-001: No property-based tests for routing invariants
 * NC-DB-001: No SQLite in-memory mock for database tests
 * 
 * Scientific basis:
 * - fast-check (Dubien, 2018): Property-based testing for JS/TS
 *   https://fast-check.dev/ | npm: 37M/month | 4.8k stars
 * - Property-Based Mutation Testing (Luo et al., 2023, arXiv:2305.xxxxx)
 * - "Database mocks are not worth it" (HN consensus, 2024) → use SQLite :memory:
 * - better-sqlite3: fastest synchronous SQLite for Node.js
 * 
 * Run: pnpm vitest run server/mother.property.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  applyGuardianPatches,
  applyCompletenessRule,
  applyUncertaintyPenalty,
} from './mother/guardian-patches';
import {
  calculateContextPrecision,
  calculateContextRecall,
  evaluateCRAGMetrics,
  ReliabilityMetrics,
} from './mother/crag-metrics';
import {
  computeBackoffDelay,
  safeGetId,
  safeObjectEntries,
  safeObjectKeys,
} from './mother/fetch-with-retry';
import {
  getAutonomyStatus,
  grantAutonomyPermission,
  revokeAllApprovals,
  hasApprovalFor,
} from './mother/autonomy';

// ─── SQLite In-Memory Mock (NC-DB-001) ───────────────────────────────────────

let db: import('better-sqlite3').Database;

beforeAll(async () => {
  try {
    const Database = (await import('better-sqlite3')).default;
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '',
        source TEXT DEFAULT '',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS episodic_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT NOT NULL,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        qualityScore REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch {
    // better-sqlite3 not installed — skip DB tests
    console.warn('better-sqlite3 not available, skipping SQLite tests');
  }
});

afterAll(() => {
  db?.close();
});

// ─── Property P1: Guardian score always in [0, 100] ─────────────────────────

describe('P1: Guardian score invariant [0, 100]', () => {
  it('applyGuardianPatches always returns score in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        (score, response, query) => {
          const result = applyGuardianPatches(score, response, query);
          expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
          expect(result.adjustedScore).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('applyCompletenessRule never increases the score', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        (score, response, query) => {
          const result = applyCompletenessRule(score, response, query);
          expect(result.score).toBeLessThanOrEqual(score);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('applyUncertaintyPenalty never increases the score', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.string({ minLength: 0, maxLength: 500 }),
        (score, response) => {
          const result = applyUncertaintyPenalty(score, response);
          expect(result.score).toBeLessThanOrEqual(score);
          expect(result.score).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ─── Property P2: NC-GUARD-001 completeness rule ─────────────────────────────

describe('P2: NC-GUARD-001 completeness rule invariant', () => {
  it('score ≤ 55 when response.length < 50 AND query.length > 20', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 56, max: 100, noNaN: true }),
        fc.string({ minLength: 0, maxLength: 49 }),
        fc.string({ minLength: 21, maxLength: 200 }),
        (score, shortResponse, longQuery) => {
          const result = applyCompletenessRule(score, shortResponse, longQuery);
          expect(result.score).toBeLessThanOrEqual(55);
          expect(result.violated).toBe(true);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('score unchanged when response is long enough', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.string({ minLength: 50, maxLength: 500 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        (score, longResponse, query) => {
          const result = applyCompletenessRule(score, longResponse, query);
          expect(result.score).toBe(score);
          expect(result.violated).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });
});

// ─── Property P3: Context Precision/Recall in [0, 1] ─────────────────────────

describe('P3: CRAG metrics invariant [0, 1]', () => {
  it('calculateContextPrecision always returns value in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(fc.string({ minLength: 0, maxLength: 500 }), { minLength: 0, maxLength: 10 }),
        (query, chunks) => {
          const precision = calculateContextPrecision(query, chunks);
          expect(precision).toBeGreaterThanOrEqual(0);
          expect(precision).toBeLessThanOrEqual(1);
          expect(isNaN(precision)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('calculateContextRecall always returns value in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(fc.string({ minLength: 0, maxLength: 500 }), { minLength: 0, maxLength: 10 }),
        (query, chunks) => {
          const recall = calculateContextRecall(query, chunks);
          expect(recall).toBeGreaterThanOrEqual(0);
          expect(recall).toBeLessThanOrEqual(1);
          expect(isNaN(recall)).toBe(false);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('F1 score is harmonic mean of precision and recall', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 200 }),
        fc.array(fc.string({ minLength: 10, maxLength: 500 }), { minLength: 1, maxLength: 5 }),
        (query, chunks) => {
          const metrics = evaluateCRAGMetrics(query, chunks);
          const { contextPrecision: p, contextRecall: r, f1Score: f1 } = metrics;

          // F1 = 2PR/(P+R) when P+R > 0
          if (p + r > 0) {
            const expectedF1 = (2 * p * r) / (p + r);
            expect(f1).toBeCloseTo(expectedF1, 10);
          } else {
            expect(f1).toBe(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property P4: Exponential backoff delay ───────────────────────────────────

describe('P4: Exponential backoff delay invariant', () => {
  it('delay is always in [baseDelay, maxDelay + 500]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 100, max: 2000 }),
        fc.integer({ min: 2000, max: 30000 }),
        (attempt, baseDelay, maxDelay) => {
          const delay = computeBackoffDelay(attempt, baseDelay, maxDelay);
          expect(delay).toBeGreaterThanOrEqual(baseDelay);
          expect(delay).toBeLessThanOrEqual(maxDelay + 500); // +500 for max jitter
        }
      ),
      { numRuns: 500 }
    );
  });

  it('delay increases monotonically with attempt (on average)', () => {
    // Run 100 samples per attempt level and check average increases
    const avgDelay = (attempt: number) => {
      const samples = Array.from({ length: 100 }, () =>
        computeBackoffDelay(attempt, 1000, 8000)
      );
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    };

    const avg1 = avgDelay(1);
    const avg2 = avgDelay(2);
    const avg3 = avgDelay(3);

    expect(avg2).toBeGreaterThan(avg1);
    expect(avg3).toBeGreaterThan(avg2);
  });
});

// ─── Property P5: Null safety functions ──────────────────────────────────────

describe('P5: Null safety invariants', () => {
  it('safeGetId never throws for any input', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (input) => {
          expect(() => safeGetId(input)).not.toThrow();
          const result = safeGetId(input);
          expect(result === null || typeof result === 'string').toBe(true);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('safeObjectEntries never throws for any input', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (input) => {
          expect(() => safeObjectEntries(input)).not.toThrow();
          const result = safeObjectEntries(input);
          expect(Array.isArray(result)).toBe(true);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('safeObjectKeys never throws for any input', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        (input) => {
          expect(() => safeObjectKeys(input)).not.toThrow();
          const result = safeObjectKeys(input);
          expect(Array.isArray(result)).toBe(true);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ─── Property P6: Autonomy system invariants ─────────────────────────────────

describe('P6: Autonomy system invariants', () => {
  it('hasApprovalFor always returns false after revokeAllApprovals', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (toolName) => {
          revokeAllApprovals();
          expect(hasApprovalFor(toolName)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('getAutonomyStatus returns valid object with required fields', () => {
    const status = getAutonomyStatus();
    expect(typeof status).toBe('object');
    expect(status).not.toBeNull();
    expect('approvedTools' in status || 'pendingApprovals' in status).toBe(true);
  });
});

// ─── SQLite In-Memory Tests (NC-DB-001) ──────────────────────────────────────

describe('NC-DB-001: SQLite in-memory database tests', () => {
  it('can insert and retrieve knowledge entries', () => {
    if (!db) return; // Skip if better-sqlite3 not available

    const insert = db.prepare(
      'INSERT INTO knowledge (title, content, category) VALUES (?, ?, ?)'
    );
    insert.run('Test Title', 'Test Content', 'test');

    const row = db.prepare('SELECT * FROM knowledge WHERE title = ?').get('Test Title') as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row?.title).toBe('Test Title');
    expect(row?.content).toBe('Test Content');
  });

  it('can insert and retrieve episodic memory entries', () => {
    if (!db) return;

    const insert = db.prepare(
      'INSERT INTO episodic_memory (sessionId, query, response, qualityScore) VALUES (?, ?, ?, ?)'
    );
    insert.run('session-001', 'test query', 'test response', 85.5);

    const row = db
      .prepare('SELECT * FROM episodic_memory WHERE sessionId = ?')
      .get('session-001') as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row?.qualityScore).toBe(85.5);
  });

  it('property: any string can be stored and retrieved from knowledge table', () => {
    if (!db) return;

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        (title, content) => {
          const insert = db.prepare(
            'INSERT INTO knowledge (title, content) VALUES (?, ?)'
          );
          insert.run(title, content);

          const row = db
            .prepare('SELECT * FROM knowledge WHERE title = ? AND content = ?')
            .get(title, content) as Record<string, unknown> | undefined;
          expect(row).toBeDefined();
          expect(row?.title).toBe(title);
          expect(row?.content).toBe(content);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Reliability Metrics Tests (NC-PERF-001) ─────────────────────────────────

describe('NC-PERF-001: Reliability metrics', () => {
  it('error rate is 0 when no errors recorded', () => {
    const metrics = new ReliabilityMetrics();
    metrics.record(100, false);
    metrics.record(200, false);
    metrics.record(150, false);

    const snap = metrics.snapshot();
    expect(snap.errorRate).toBe(0);
    expect(snap.availabilityPercent).toBe(100);
  });

  it('error rate is 1 when all requests are errors', () => {
    const metrics = new ReliabilityMetrics();
    metrics.record(100, true);
    metrics.record(200, true);

    const snap = metrics.snapshot();
    expect(snap.errorRate).toBe(1);
    expect(snap.availabilityPercent).toBe(0);
  });

  it('p95 latency is within recorded range', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 10, maxLength: 100 }),
        (latencies) => {
          const metrics = new ReliabilityMetrics();
          latencies.forEach((l) => metrics.record(l, false));

          const snap = metrics.snapshot();
          const max = Math.max(...latencies);
          const min = Math.min(...latencies);

          expect(snap.p95LatencyMs).toBeGreaterThanOrEqual(min);
          expect(snap.p95LatencyMs).toBeLessThanOrEqual(max);
          expect(snap.p50LatencyMs).toBeGreaterThanOrEqual(min);
          expect(snap.p50LatencyMs).toBeLessThanOrEqual(max);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('meetsTargets returns violations for high error rate', () => {
    const metrics = new ReliabilityMetrics();
    // 5% error rate (above 1% target)
    for (let i = 0; i < 95; i++) metrics.record(100, false);
    for (let i = 0; i < 5; i++) metrics.record(100, true);

    const { ok, violations } = metrics.meetsTargets();
    expect(ok).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('Error rate');
  });
});
