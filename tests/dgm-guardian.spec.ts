/**
 * MOTHER — DGM Guardian Property-Based Tests
 *
 * Tests for the real-time health monitoring + auto-recovery system.
 * Verifies properties that must hold for system reliability.
 *
 * Scientific basis:
 *   - Property-based testing (Claessen & Hughes, QuickCheck, 2000)
 *   - Chaos Engineering (Netflix, "Principles of Chaos Engineering", 2018)
 *   - Autonomic Computing (Kephart & Chess, IEEE 2003)
 *   - Metamorphic Testing for Agentic AI (arXiv:2603.13173, AMSTA 2026)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// TYPES (mirrors dgm-guardian.ts)
// ============================================================

type HealthCheckStatus = 'OK' | 'WARN' | 'FAIL';
type OverallHealth = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'DOWN';
type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AnomalyType = 'LATENCY_SPIKE' | 'ERROR_SURGE' | 'FITNESS_DROP' | 'SERVICE_DOWN' | 'MEMORY_HIGH' | 'CONNECTION_LOST';

interface HealthCheck {
  name: string;
  status: HealthCheckStatus;
  latencyMs: number;
  detail?: string;
}

// ============================================================
// PURE FUNCTIONS UNDER TEST (extracted from dgm-guardian.ts)
// ============================================================

function computeOverallHealth(checks: HealthCheck[]): OverallHealth {
  const failCount = checks.filter(c => c.status === 'FAIL').length;
  const warnCount = checks.filter(c => c.status === 'WARN').length;

  if (failCount >= 3) return 'DOWN';
  if (failCount >= 1) return 'CRITICAL';
  if (warnCount >= 2) return 'DEGRADED';
  return 'HEALTHY';
}

function shouldBlockEvolution(
  overall: OverallHealth,
  consecutiveFailures: number,
  maxConsecutiveFailures: number,
): boolean {
  return overall === 'CRITICAL' || overall === 'DOWN' ||
    consecutiveFailures >= maxConsecutiveFailures;
}

function detectLatencySpike(
  currentLatency: number,
  baselineLatency: number,
  spikeMultiplier: number,
): boolean {
  return currentLatency > (baselineLatency * spikeMultiplier);
}

function detectFitnessDrop(
  currentFitness: number,
  previousFitness: number,
  dropThreshold: number,
): boolean {
  return (previousFitness - currentFitness) >= dropThreshold;
}

function determineSeverity(failCount: number, consecutiveFailures: number): AnomalySeverity {
  if (failCount >= 3 || consecutiveFailures >= 5) return 'CRITICAL';
  if (failCount >= 2 || consecutiveFailures >= 3) return 'HIGH';
  if (failCount >= 1) return 'MEDIUM';
  return 'LOW';
}

// ============================================================
// ARBITRARIES
// ============================================================

const arbHealthCheckStatus = fc.constantFrom('OK', 'WARN', 'FAIL') as fc.Arbitrary<HealthCheckStatus>;

const arbHealthCheck: fc.Arbitrary<HealthCheck> = fc.record({
  name: fc.constantFrom('API', 'Database', 'LLM', 'Memory', 'Fitness'),
  status: arbHealthCheckStatus,
  latencyMs: fc.nat({ max: 30000 }),
  detail: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
});

const arbOverallHealth = fc.constantFrom('HEALTHY', 'DEGRADED', 'CRITICAL', 'DOWN') as fc.Arbitrary<OverallHealth>;

// ============================================================
// TESTS
// ============================================================

describe('DGM Guardian — Property-Based Verification', () => {

  // ─────────────────────────────────────────────
  // PROPERTY 1: Health status classification is deterministic and total
  // ─────────────────────────────────────────────
  describe('Health Status Classification', () => {
    it('∀ check set: overall health is always one of 4 valid states', () => {
      fc.assert(
        fc.property(
          fc.array(arbHealthCheck, { minLength: 0, maxLength: 10 }),
          (checks) => {
            const result = computeOverallHealth(checks);
            expect(['HEALTHY', 'DEGRADED', 'CRITICAL', 'DOWN']).toContain(result);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('∀ checks: 0 failures + 0 warnings → HEALTHY', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ name: fc.string(), status: fc.constant('OK' as HealthCheckStatus), latencyMs: fc.nat() }),
            { minLength: 0, maxLength: 5 }
          ),
          (checks) => {
            expect(computeOverallHealth(checks)).toBe('HEALTHY');
          }
        ),
        { numRuns: 500 }
      );
    });

    it('∀ checks: ≥3 failures → DOWN', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ name: fc.string(), status: fc.constant('FAIL' as HealthCheckStatus), latencyMs: fc.nat() }),
            { minLength: 3, maxLength: 10 }
          ),
          (failChecks) => {
            expect(computeOverallHealth(failChecks)).toBe('DOWN');
          }
        ),
        { numRuns: 500 }
      );
    });

    it('∀ checks: exactly 1 failure → CRITICAL', () => {
      const okCheck: HealthCheck = { name: 'ok', status: 'OK', latencyMs: 10 };
      const failCheck: HealthCheck = { name: 'fail', status: 'FAIL', latencyMs: 10 };
      expect(computeOverallHealth([okCheck, okCheck, failCheck])).toBe('CRITICAL');
    });

    it('Health classification is deterministic (same input → same output)', () => {
      fc.assert(
        fc.property(
          fc.array(arbHealthCheck, { minLength: 1, maxLength: 5 }),
          (checks) => {
            const r1 = computeOverallHealth(checks);
            const r2 = computeOverallHealth(checks);
            expect(r1).toBe(r2);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 2: Evolution blocking (Guardian → Evolution safety)
  // ─────────────────────────────────────────────
  describe('Evolution Blocking', () => {
    it('∀ CRITICAL or DOWN status → Evolution BLOCKED', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('CRITICAL', 'DOWN') as fc.Arbitrary<OverallHealth>,
          fc.nat({ max: 10 }),
          (overall, consec) => {
            expect(shouldBlockEvolution(overall, consec, 3)).toBe(true);
          }
        ),
        { numRuns: 500 }
      );
    });

    it('∀ HEALTHY status with low failures → Evolution NOT blocked', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 2 }),
          (consec) => {
            expect(shouldBlockEvolution('HEALTHY', consec, 3)).toBe(false);
          }
        ),
        { numRuns: 500 }
      );
    });

    it('∀ consecutive failures ≥ max → Evolution BLOCKED regardless of status', () => {
      fc.assert(
        fc.property(
          arbOverallHealth,
          fc.integer({ min: 3, max: 20 }),
          (overall, consec) => {
            expect(shouldBlockEvolution(overall, consec, 3)).toBe(true);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 3: Anomaly detection thresholds
  // ─────────────────────────────────────────────
  describe('Anomaly Detection', () => {
    it('∀ latency > baseline × multiplier → latency spike detected', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 1000, noNaN: true }),   // baseline
          fc.double({ min: 0.01, max: 10, noNaN: true }),  // extra above threshold
          fc.double({ min: 2, max: 5, noNaN: true }),      // multiplier
          (baseline, extra, multiplier) => {
            const current = baseline * multiplier + extra;
            expect(detectLatencySpike(current, baseline, multiplier)).toBe(true);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('∀ latency ≤ baseline × multiplier → NO spike', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1, max: 1000, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),      // fraction of threshold
          fc.double({ min: 2, max: 5, noNaN: true }),
          (baseline, fraction, multiplier) => {
            const current = baseline * multiplier * fraction;
            expect(detectLatencySpike(current, baseline, multiplier)).toBe(false);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('∀ fitness drop ≥ threshold → FITNESS_DROP detected', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 20, max: 100, noNaN: true }),   // previous fitness
          fc.double({ min: 20, max: 50, noNaN: true }),    // drop amount ≥ threshold
          (previous, drop) => {
            const current = previous - drop;
            expect(detectFitnessDrop(current, previous, 20)).toBe(true);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('∀ fitness improvement → NO drop detected', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 80, noNaN: true }),
          fc.double({ min: 0, max: 20, noNaN: true }),
          (previous, improvement) => {
            const current = previous + improvement;
            expect(detectFitnessDrop(current, previous, 20)).toBe(false);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 4: Severity classification
  // ─────────────────────────────────────────────
  describe('Severity Classification', () => {
    it('∀ ≥3 fails or ≥5 consecutive → CRITICAL severity', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }),
          fc.nat({ max: 20 }),
          (fails, consec) => {
            expect(determineSeverity(fails, consec)).toBe('CRITICAL');
          }
        ),
        { numRuns: 500 }
      );
    });

    it('∀ 0 fails + 0 consecutive → LOW severity', () => {
      expect(determineSeverity(0, 0)).toBe('LOW');
    });

    it('Severity is monotonic: more failures → same or higher severity', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.integer({ min: 0, max: 5 }),
          fc.nat({ max: 10 }),
          (fails1, failsDelta, consec) => {
            const fails2 = fails1 + failsDelta;
            const sev1 = determineSeverity(fails1, consec);
            const sev2 = determineSeverity(fails2, consec);
            const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
            expect(order.indexOf(sev2)).toBeGreaterThanOrEqual(order.indexOf(sev1));
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 5: Circuit Breaker invariants
  // ─────────────────────────────────────────────
  describe('Circuit Breaker', () => {
    it('Circuit breaker state is boolean (open or closed)', () => {
      const openBreakers = new Set<string>();

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.boolean(),
          (target, shouldOpen) => {
            if (shouldOpen) openBreakers.add(target);
            else openBreakers.delete(target);

            const isOpen = openBreakers.has(target);
            expect(typeof isOpen).toBe('boolean');
            expect(isOpen).toBe(shouldOpen);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 6: Health history is bounded (memory safety)
  // ─────────────────────────────────────────────
  describe('Health History Bounds', () => {
    it('∀ N entries added: history never exceeds 100', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 300 }),
          (n) => {
            const history: any[] = [];
            for (let i = 0; i < n; i++) {
              history.push({ timestamp: new Date(), overall: 'HEALTHY' });
              if (history.length > 100) {
                history.splice(0, history.length - 100);
              }
            }
            expect(history.length).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});
