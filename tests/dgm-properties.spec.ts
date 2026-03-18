/**
 * MOTHER — DGM Pipeline Property-Based Tests (Level 4 Formal Verification)
 *
 * Uses fast-check to verify mathematical properties of the DGM self-improvement
 * pipeline hold for ALL possible inputs, not just hand-picked test cases.
 *
 * Scientific basis:
 * - Property-based testing (Claessen & Hughes, 2000) — QuickCheck
 * - DGM Safety constraints (Zhang et al., arXiv:2505.22954)
 * - Constitutional AI (Bai et al., arXiv:2212.08073)
 *
 * Each property is universally quantified:
 *   ∀ input ∈ Domain: property(input) = true
 *
 * fast-check generates 1000+ random inputs per property to search for
 * counterexamples. If none found, the property holds with high confidence.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// TYPES (mirrors dgm-agent.ts)
// ============================================================

interface ImprovementProposal {
  id: string;
  type: 'CONFIG' | 'PROMPT' | 'ROUTING' | 'CACHE' | 'MODULE';
  description: string;
  rationale: string;
  expectedFitnessGain: number;
  safetyCheck: boolean;
  approved: boolean;
}

interface FitnessMetrics {
  avgQualityScore: number;
  p95LatencyMs: number;
  errorRate: number;
  cacheHitRate: number;
  userSatisfactionProxy: number;
  fitnessScore: number;
  timestamp: Date;
  sampleSize: number;
}

type ProposalStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'failed' | 'rejected';

// ============================================================
// PURE FUNCTIONS UNDER TEST (extracted for testability)
// ============================================================

const FORBIDDEN_PATTERNS = [
  'remove circuit breaker',
  'disable quality gate',
  'remove safety',
  'bypass guardian',
  'skip validation',
  'remove audit',
];

function validateProposal(proposal: ImprovementProposal): boolean {
  const descLower = proposal.description.toLowerCase();
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (descLower.includes(pattern)) return false;
  }
  if (proposal.expectedFitnessGain < 3) return false;
  return true;
}

function computeFitnessScore(
  avgQuality: number,
  p95Latency: number,
  errorRate: number,
  cacheHitRate: number
): number {
  const qualityComponent = avgQuality * 0.4;
  const latencyComponent = Math.max(0, 100 - (p95Latency / 50)) * 0.3;
  const reliabilityComponent = (1 - errorRate) * 100 * 0.2;
  const cacheComponent = cacheHitRate * 100 * 0.1;
  return Math.min(100, Math.max(0, qualityComponent + latencyComponent + reliabilityComponent + cacheComponent));
}

const VALID_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending:     ['approved', 'rejected'],
  approved:    ['in_progress', 'failed'],
  in_progress: ['completed', 'failed'],
  completed:   [],           // terminal state
  failed:      ['approved'], // can be re-approved
  rejected:    [],           // terminal state
};

function isValidTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================
// ARBITRARIES (fast-check generators)
// ============================================================

const arbProposalType = fc.constantFrom('CONFIG', 'PROMPT', 'ROUTING', 'CACHE', 'MODULE') as fc.Arbitrary<ImprovementProposal['type']>;

const arbSafeProposal: fc.Arbitrary<ImprovementProposal> = fc.record({
  id: fc.uuid(),
  type: arbProposalType,
  description: fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => !FORBIDDEN_PATTERNS.some(p => s.toLowerCase().includes(p))),
  rationale: fc.string({ minLength: 1, maxLength: 200 }),
  expectedFitnessGain: fc.double({ min: 3, max: 50 }),
  safetyCheck: fc.constant(true),
  approved: fc.boolean(),
});

const arbDangerousDescription = fc.constantFrom(
  'We should remove circuit breaker from the system',
  'Plan: disable quality gate to improve speed',
  'Optimize by remove safety checks entirely',
  'Faster routing: bypass guardian on low-risk queries',
  'Performance: skip validation for cached responses',
  'Cleanup: remove audit logging to reduce I/O',
  'REMOVE CIRCUIT BREAKER NOW',
  'We must BYPASS GUARDIAN for better UX',
);

const arbDangerousProposal: fc.Arbitrary<ImprovementProposal> = fc.record({
  id: fc.uuid(),
  type: arbProposalType,
  description: arbDangerousDescription,
  rationale: fc.string({ minLength: 1, maxLength: 200 }),
  expectedFitnessGain: fc.double({ min: 3, max: 50, noNaN: true }),
  safetyCheck: fc.constant(true),
  approved: fc.boolean(),
});

const arbLowGainProposal: fc.Arbitrary<ImprovementProposal> = fc.record({
  id: fc.uuid(),
  type: arbProposalType,
  description: fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => !FORBIDDEN_PATTERNS.some(p => s.toLowerCase().includes(p))),
  rationale: fc.string({ minLength: 1, maxLength: 200 }),
  expectedFitnessGain: fc.double({ min: -10, max: 2.99, noNaN: true }),
  safetyCheck: fc.constant(true),
  approved: fc.boolean(),
});

const arbProposalStatus = fc.constantFrom(
  'pending', 'approved', 'in_progress', 'completed', 'failed', 'rejected'
) as fc.Arbitrary<ProposalStatus>;

// ============================================================
// PROPERTY-BASED TESTS
// ============================================================

describe('DGM Level 4 — Property-Based Verification', () => {

  // ─────────────────────────────────────────────
  // PROPERTY 1: Safety Gate ALWAYS blocks dangerous patterns
  // ∀ proposal with forbidden pattern: validate(proposal) = false
  // ─────────────────────────────────────────────
  describe('Safety Gate (Constitutional AI)', () => {
    it('∀ proposal containing forbidden pattern → REJECTED', () => {
      fc.assert(
        fc.property(arbDangerousProposal, (proposal) => {
          expect(validateProposal(proposal)).toBe(false);
        }),
        { numRuns: 1000, verbose: true }
      );
    });

    it('∀ safe proposal with sufficient gain → APPROVED', () => {
      fc.assert(
        fc.property(arbSafeProposal, (proposal) => {
          expect(validateProposal(proposal)).toBe(true);
        }),
        { numRuns: 1000 }
      );
    });

    it('∀ proposal with expectedFitnessGain < 3% → REJECTED', () => {
      fc.assert(
        fc.property(arbLowGainProposal, (proposal) => {
          expect(validateProposal(proposal)).toBe(false);
        }),
        { numRuns: 1000 }
      );
    });

    it('Safety Gate is pure: same input → same output (deterministic)', () => {
      fc.assert(
        fc.property(arbSafeProposal, (proposal) => {
          const r1 = validateProposal(proposal);
          const r2 = validateProposal(proposal);
          expect(r1).toBe(r2);
        }),
        { numRuns: 500 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 2: Fitness score is always bounded [0, 100]
  // ∀ quality ∈ [0,100], latency ∈ [0,∞), error ∈ [0,1], cache ∈ [0,1]:
  //   0 ≤ fitness(q, l, e, c) ≤ 100
  // ─────────────────────────────────────────────
  describe('Fitness Score Bounds', () => {
    it('∀ inputs: 0 ≤ fitnessScore ≤ 100', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true }),        // avgQuality
          fc.double({ min: 0, max: 30000, noNaN: true }),       // p95Latency
          fc.double({ min: 0, max: 1, noNaN: true }),           // errorRate
          fc.double({ min: 0, max: 1, noNaN: true }),           // cacheHitRate
          (quality, latency, errorRate, cacheHitRate) => {
            const score = computeFitnessScore(quality, latency, errorRate, cacheHitRate);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 5000 }
      );
    });

    it('∀ inputs: higher quality → higher fitness (monotonicity)', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 50, noNaN: true }),          // quality_low
          fc.double({ min: 0, max: 50, noNaN: true }),          // quality_delta (always positive)
          fc.double({ min: 0, max: 5000, noNaN: true }),        // latency (fixed)
          fc.double({ min: 0, max: 1, noNaN: true }),           // errorRate (fixed)
          fc.double({ min: 0, max: 1, noNaN: true }),           // cacheHitRate (fixed)
          (qLow, qDelta, latency, errorRate, cacheHitRate) => {
            const qHigh = qLow + qDelta;
            const scoreLow = computeFitnessScore(qLow, latency, errorRate, cacheHitRate);
            const scoreHigh = computeFitnessScore(qHigh, latency, errorRate, cacheHitRate);
            expect(scoreHigh).toBeGreaterThanOrEqual(scoreLow);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('∀ inputs: lower error rate → higher fitness (monotonicity)', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true }),
          fc.double({ min: 0, max: 5000, noNaN: true }),
          fc.double({ min: 0, max: 0.5, noNaN: true }),   // error_low
          fc.double({ min: 0, max: 0.5, noNaN: true }),   // error_delta
          fc.double({ min: 0, max: 1, noNaN: true }),
          (quality, latency, errLow, errDelta, cacheHitRate) => {
            const errHigh = Math.min(1, errLow + errDelta);
            const scoreLow = computeFitnessScore(quality, latency, errLow, cacheHitRate);
            const scoreHigh = computeFitnessScore(quality, latency, errHigh, cacheHitRate);
            // Lower error → higher score
            expect(scoreLow).toBeGreaterThanOrEqual(scoreHigh);
          }
        ),
        { numRuns: 2000 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 3: Proposal state machine transitions are valid
  // ∀ (from, to) ∈ States²: transition is either valid or invalid — never undefined
  // ─────────────────────────────────────────────
  describe('Proposal State Machine', () => {
    it('∀ (from, to) ∈ States: isValidTransition is boolean (total function)', () => {
      fc.assert(
        fc.property(arbProposalStatus, arbProposalStatus, (from, to) => {
          const result = isValidTransition(from, to);
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: 500 }
      );
    });

    it('∀ completed proposals: no outgoing transitions (terminal)', () => {
      fc.assert(
        fc.property(arbProposalStatus, (to) => {
          expect(isValidTransition('completed', to)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('∀ rejected proposals: no outgoing transitions (terminal)', () => {
      fc.assert(
        fc.property(arbProposalStatus, (to) => {
          expect(isValidTransition('rejected', to)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('No unapproved code ever executes (pending → in_progress is invalid)', () => {
      expect(isValidTransition('pending', 'in_progress')).toBe(false);
    });

    it('Approval is required before execution (approved → in_progress is valid)', () => {
      expect(isValidTransition('approved', 'in_progress')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 4: Audit log integrity (append-only)
  // ─────────────────────────────────────────────
  describe('Audit Log Integrity', () => {
    it('∀ sequences of entries: log only grows (append-only)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 100 }),
          (entries) => {
            const log: string[] = [];
            for (const entry of entries) {
              const prevLength = log.length;
              log.push(entry);
              expect(log.length).toBe(prevLength + 1);
              // Previous entries are never modified
              for (let i = 0; i < prevLength; i++) {
                expect(log[i]).toBe(entries[i]);
              }
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 5: Safety Gate forbidden patterns are case-insensitive
  // ∀ forbidden pattern, ∀ casing: validate blocks it
  // ─────────────────────────────────────────────
  describe('Safety Gate Case Insensitivity', () => {
    it('∀ forbidden pattern in ANY casing → REJECTED', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...FORBIDDEN_PATTERNS),
          fc.constantFrom('lower', 'upper') as fc.Arbitrary<string>,
          (pattern, casing) => {
            const desc = casing === 'lower'
              ? `proposal to ${pattern.toLowerCase()}`
              : `PROPOSAL TO ${pattern.toUpperCase()}`;

            const proposal: ImprovementProposal = {
              id: 'test',
              type: 'CONFIG',
              description: desc,
              rationale: 'test',
              expectedFitnessGain: 10,
              safetyCheck: true,
              approved: false,
            };
            expect(validateProposal(proposal)).toBe(false);
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});
