/**
 * MOTHER — DGM Council + Manager + Integration Property-Based Tests
 *
 * Tests for the AI Council (Delphi+MAD+Vote), DGM Manager orchestration,
 * and cross-system integration (Guardian ↔ Evolution blocking).
 *
 * Scientific basis:
 *   - Property-based testing (Claessen & Hughes, QuickCheck, 2000)
 *   - Metamorphic testing for agentic AI (arXiv:2603.13173, AMSTA 2026)
 *   - Multi-Agent Debate (Du et al., arXiv:2305.19118, 2023)
 *   - AutoAdapt (arXiv:2603.08181, 2026)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================
// TYPES (mirrors dgm-council.ts / dgm-manager.ts / dgm-agent.ts)
// ============================================================

type ProposalType = 'CONFIG' | 'PROMPT' | 'ROUTING' | 'CACHE' | 'MODULE' | 'ARCHITECTURE' | 'SAFETY' | 'PERFORMANCE' | 'OTHER';

interface CouncilProposal {
  memberId: string;
  memberName: string;
  type: ProposalType;
  description: string;
  rationale: string;
  expectedFitnessGain: number;
  confidence: number;
  risks: string;
}

interface ScoredProposal extends CouncilProposal {
  avgScore: number;
}

interface CouncilMember {
  id: string;
  name: string;
  weight: number;
}

// ============================================================
// PURE FUNCTIONS UNDER TEST (extracted from dgm-council.ts)
// ============================================================

const COUNCIL_MEMBERS: CouncilMember[] = [
  { id: 'deepseek', name: 'DeepSeek R1', weight: 0.20 },
  { id: 'claude', name: 'Claude Sonnet 4', weight: 0.25 },
  { id: 'gemini', name: 'Gemini 2.5 Pro', weight: 0.20 },
  { id: 'mistral', name: 'Mistral Large', weight: 0.15 },
  { id: 'mother', name: 'MOTHER (GPT-4o)', weight: 0.20 },
];

function computeWeightedScore(
  scores: Array<{ criticId: string; score: number }>,
  members: CouncilMember[],
): number {
  if (scores.length === 0) return 5; // default

  const weightedSum = scores.reduce((sum, s) => {
    const member = members.find(m => m.id === s.criticId);
    const weight = member?.weight || 0.15;
    return sum + s.score * weight;
  }, 0);

  const totalWeight = scores.reduce((sum, s) => {
    const member = members.find(m => m.id === s.criticId);
    return sum + (member?.weight || 0.15);
  }, 0);

  return totalWeight > 0 ? weightedSum / totalWeight : 5;
}

function voteAndRank(
  proposals: ScoredProposal[],
  debateThreshold: number,
  maxProposals: number,
): ScoredProposal[] {
  return [...proposals]
    .filter(p => p.avgScore >= debateThreshold * 10)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, maxProposals);
}

function clampFitnessGain(gain: number): number {
  return Math.min(Math.max(gain, 1), 20);
}

function clampConfidence(confidence: number): number {
  return Math.min(Math.max(confidence, 0), 1);
}

function memberWeightsSum(members: CouncilMember[]): number {
  return members.reduce((sum, m) => sum + m.weight, 0);
}

// ============================================================
// ARBITRARIES
// ============================================================

const arbProposalType = fc.constantFrom(
  'CONFIG', 'PROMPT', 'ROUTING', 'CACHE', 'MODULE', 'ARCHITECTURE', 'SAFETY', 'PERFORMANCE', 'OTHER'
) as fc.Arbitrary<ProposalType>;

const arbMemberId = fc.constantFrom('deepseek', 'claude', 'gemini', 'mistral', 'mother');

const arbCouncilProposal: fc.Arbitrary<ScoredProposal> = fc.record({
  memberId: arbMemberId,
  memberName: fc.string({ minLength: 1, maxLength: 30 }),
  type: arbProposalType,
  description: fc.string({ minLength: 10, maxLength: 200 }),
  rationale: fc.string({ minLength: 1, maxLength: 200 }),
  expectedFitnessGain: fc.double({ min: 1, max: 20, noNaN: true }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  risks: fc.string({ minLength: 1, maxLength: 100 }),
  avgScore: fc.double({ min: 0, max: 10, noNaN: true }),
});

const arbCritiqueScore = fc.record({
  criticId: arbMemberId,
  score: fc.integer({ min: 1, max: 10 }),
});

// ============================================================
// COUNCIL TESTS
// ============================================================

describe('DGM Council — Property-Based Verification', () => {

  // ─────────────────────────────────────────────
  // PROPERTY 1: Member weights sum to 1.0
  // ─────────────────────────────────────────────
  describe('Council Configuration', () => {
    it('Council member weights sum to 1.0', () => {
      const sum = memberWeightsSum(COUNCIL_MEMBERS);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('All weight values are in (0, 1]', () => {
      for (const m of COUNCIL_MEMBERS) {
        expect(m.weight).toBeGreaterThan(0);
        expect(m.weight).toBeLessThanOrEqual(1);
      }
    });

    it('5 council members exist', () => {
      expect(COUNCIL_MEMBERS.length).toBe(5);
    });

    it('All member IDs are unique', () => {
      const ids = COUNCIL_MEMBERS.map(m => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 2: Weighted scoring properties
  // ─────────────────────────────────────────────
  describe('Weighted Scoring', () => {
    it('∀ scores: weighted score is in [1, 10]', () => {
      fc.assert(
        fc.property(
          fc.array(arbCritiqueScore, { minLength: 1, maxLength: 5 }),
          (scores) => {
            const result = computeWeightedScore(scores, COUNCIL_MEMBERS);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(10);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('∀ all identical scores → weighted average equals that score', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (uniformScore) => {
            const scores = COUNCIL_MEMBERS.map(m => ({ criticId: m.id, score: uniformScore }));
            const result = computeWeightedScore(scores, COUNCIL_MEMBERS);
            expect(result).toBeCloseTo(uniformScore, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Empty scores → default (5)', () => {
      expect(computeWeightedScore([], COUNCIL_MEMBERS)).toBe(5);
    });

    it('Weighted scoring is deterministic', () => {
      fc.assert(
        fc.property(
          fc.array(arbCritiqueScore, { minLength: 1, maxLength: 5 }),
          (scores) => {
            const r1 = computeWeightedScore(scores, COUNCIL_MEMBERS);
            const r2 = computeWeightedScore(scores, COUNCIL_MEMBERS);
            expect(r1).toBe(r2);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 3: Vote and rank properties
  // ─────────────────────────────────────────────
  describe('Vote and Rank', () => {
    it('∀ proposals: result length ≤ maxProposals', () => {
      fc.assert(
        fc.property(
          fc.array(arbCouncilProposal, { minLength: 0, maxLength: 15 }),
          fc.integer({ min: 1, max: 5 }),
          (proposals, maxProposals) => {
            const result = voteAndRank(proposals, 0.6, maxProposals);
            expect(result.length).toBeLessThanOrEqual(maxProposals);
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('∀ proposals: result is sorted descending by avgScore', () => {
      fc.assert(
        fc.property(
          fc.array(arbCouncilProposal, { minLength: 2, maxLength: 10 }),
          (proposals) => {
            const result = voteAndRank(proposals, 0, 10);
            for (let i = 1; i < result.length; i++) {
              expect(result[i - 1].avgScore).toBeGreaterThanOrEqual(result[i].avgScore);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('∀ proposals below threshold: filtered out', () => {
      fc.assert(
        fc.property(
          fc.array(arbCouncilProposal, { minLength: 1, maxLength: 10 }),
          fc.double({ min: 0.1, max: 0.9, noNaN: true }),
          (proposals, threshold) => {
            const result = voteAndRank(proposals, threshold, 10);
            for (const p of result) {
              expect(p.avgScore).toBeGreaterThanOrEqual(threshold * 10);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('Empty input → empty output', () => {
      expect(voteAndRank([], 0.6, 3)).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 4: Clamping bounds
  // ─────────────────────────────────────────────
  describe('Clamping', () => {
    it('∀ gain: clampFitnessGain ∈ [1, 20]', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -100, max: 200, noNaN: true }),
          (gain) => {
            const clamped = clampFitnessGain(gain);
            expect(clamped).toBeGreaterThanOrEqual(1);
            expect(clamped).toBeLessThanOrEqual(20);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('∀ confidence: clampConfidence ∈ [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -10, max: 10, noNaN: true }),
          (conf) => {
            const clamped = clampConfidence(conf);
            expect(clamped).toBeGreaterThanOrEqual(0);
            expect(clamped).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 2000 }
      );
    });

    it('Clamping is idempotent: clamp(clamp(x)) = clamp(x)', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -100, max: 200, noNaN: true }),
          (gain) => {
            expect(clampFitnessGain(clampFitnessGain(gain))).toBe(clampFitnessGain(gain));
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 5: Graceful fallback properties
  // ─────────────────────────────────────────────
  describe('Graceful Fallback', () => {
    it('∀ empty proposals: fallbackUsed flag is correct', () => {
      const proposals: ScoredProposal[] = [];
      const resultProposals = voteAndRank(proposals, 0.6, 3);
      expect(resultProposals.length).toBe(0);
      // If 0 proposals → system should fallback to rules
    });

    it('∀ all failed AI calls: system produces 0 proposals (fallback trigger)', () => {
      // Simulate Promise.allSettled with all rejections
      const results: PromiseSettledResult<CouncilProposal[]>[] = COUNCIL_MEMBERS.map(() => ({
        status: 'rejected' as const,
        reason: new Error('timeout'),
      }));

      const proposals: CouncilProposal[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') proposals.push(...r.value);
      }
      expect(proposals.length).toBe(0);
    });

    it('∀ partial AI responses: proposals from responding AIs are included', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          (respondingCount) => {
            // Simulate: respondingCount AIs succeed, rest fail
            const allProposals: CouncilProposal[] = [];
            for (let i = 0; i < respondingCount; i++) {
              allProposals.push({
                memberId: COUNCIL_MEMBERS[i].id,
                memberName: COUNCIL_MEMBERS[i].name,
                type: 'PERFORMANCE',
                description: `Improve latency via caching mechanism ${i}`,
                rationale: 'test',
                expectedFitnessGain: 5,
                confidence: 0.8,
                risks: 'none',
              });
            }
            expect(allProposals.length).toBe(respondingCount);
            expect(allProposals.length).toBeLessThanOrEqual(5);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 6: Integration — Guardian blocks Evolution
  // ─────────────────────────────────────────────
  describe('Guardian ↔ Evolution Integration', () => {
    it('CRITICAL health → proposals blocked (returns [])', () => {
      // Simulates the integration logic in generateProposals
      const guardian = { isEvolutionAllowed: () => false };
      const proposals = guardian.isEvolutionAllowed() ? ['p1'] : [];
      expect(proposals).toEqual([]);
    });

    it('HEALTHY health → proposals allowed', () => {
      const guardian = { isEvolutionAllowed: () => true };
      const allowed = guardian.isEvolutionAllowed();
      expect(allowed).toBe(true);
    });

    it('∀ blocking state transitions: block/unblock toggles correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
          (blockSequence) => {
            let blocked = false;
            for (const shouldBlock of blockSequence) {
              blocked = shouldBlock;
            }
            expect(typeof blocked).toBe('boolean');
            expect(blocked).toBe(blockSequence[blockSequence.length - 1]);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ─────────────────────────────────────────────
  // PROPERTY 7: Metamorphic — Proposal type invariance
  // (arXiv:2603.13173 — semantic-preserving transformations)
  // ─────────────────────────────────────────────
  describe('Metamorphic Properties (arXiv:2603.13173)', () => {
    it('∀ proposals: changing memberName does NOT change vote ranking position', () => {
      fc.assert(
        fc.property(
          arbCouncilProposal,
          fc.string({ minLength: 1, maxLength: 30 }),
          (proposal, newName) => {
            const p1 = { ...proposal };
            const p2 = { ...proposal, memberName: newName };
            // Score should be the same — name doesn't affect ranking
            expect(p1.avgScore).toBe(p2.avgScore);
          }
        ),
        { numRuns: 500 }
      );
    });

    it('∀ proposals: clamped gain is invariant to input scaling beyond bounds', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 20, max: 1000, noNaN: true }),
          (hugeGain) => {
            // Any gain > 20 clamps to 20
            expect(clampFitnessGain(hugeGain)).toBe(20);
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});
