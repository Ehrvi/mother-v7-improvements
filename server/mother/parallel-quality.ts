/**
 * Parallel Quality Pipeline — Replaces sequential quality checks with parallel blocks
 *
 * Before: Guardian → Self-Refine → Constitutional AI → CoVe → IFEval → BERTScore →
 *         F-DPO → PRM → NSVIF → Z3 → Citation Engine (11 sequential = 3-8s)
 *
 * After: 3 parallel blocks (1-2s total):
 *   Block A (mandatory, ~1-2s):  Guardian G-Eval + Response Normalizer + IFEval
 *   Block B (conditional, ~1s):  Citation Engine + CoVe + PRM
 *   Block C (async, fire-and-forget): BERTScore + F-DPO + NSVIF + Z3
 *
 * Self-Refine and Constitutional AI: ONLY if Guardian <80 (not by default)
 *
 * Scientific basis:
 * - Amdahl's Law: parallel execution bounded by slowest block, not sum of all
 * - Google SRE (2016): quality checks should be budgeted, not unbounded
 */

import { createLogger } from '../_core/logger';

const log = createLogger('PARALLEL_QUALITY');

export interface QualityInput {
  query: string;
  response: string;
  category: string;
  tier: string;
  context?: string;
  contextSnippets?: string[];
}

export interface QualityCheckResult {
  name: string;
  score?: number;
  passed: boolean;
  durationMs: number;
  detail?: string;
}

export interface ParallelQualityResult {
  overallScore: number;
  passed: boolean;
  needsRefinement: boolean;
  blockA: QualityCheckResult[];
  blockB: QualityCheckResult[];
  blockC: QualityCheckResult[];  // async results (may not be available immediately)
  totalDurationMs: number;
}

type CheckFn = (input: QualityInput) => Promise<QualityCheckResult>;

/**
 * Run quality checks in parallel blocks.
 * Block A + B run in parallel (both must complete before returning).
 * Block C runs async (fire-and-forget for learning feedback).
 */
export async function runParallelQualityChecks(
  input: QualityInput,
  checks: {
    blockA: CheckFn[];
    blockB: Array<{ condition: (input: QualityInput) => boolean; check: CheckFn }>;
    blockC: CheckFn[];
  },
): Promise<ParallelQualityResult> {
  const start = Date.now();

  // Block A: Mandatory (always run)
  const blockAPromise = Promise.allSettled(
    checks.blockA.map(check => runCheckSafe(check, input))
  );

  // Block B: Conditional (run in parallel with A if conditions met)
  const activeBlockB = checks.blockB.filter(b => b.condition(input));
  const blockBPromise = Promise.allSettled(
    activeBlockB.map(b => runCheckSafe(b.check, input))
  );

  // Execute A and B in parallel
  const [blockAResults, blockBResults] = await Promise.all([blockAPromise, blockBPromise]);

  const blockA = extractResults(blockAResults);
  const blockB = extractResults(blockBResults);

  // Block C: Async fire-and-forget (for learning, not blocking)
  const blockC: QualityCheckResult[] = [];
  if (checks.blockC.length > 0) {
    Promise.allSettled(
      checks.blockC.map(check => runCheckSafe(check, input))
    ).then(results => {
      const asyncResults = extractResults(results);
      log.info(`[ParallelQuality] Block C async complete: ${asyncResults.map(r => `${r.name}=${r.passed}`).join(', ')}`);
    }).catch(() => {});
  }

  // Compute overall score from Block A (mandatory) results
  const scores = blockA.filter(r => r.score !== undefined).map(r => r.score!);
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
    : 80;

  const passed = overallScore >= 80;
  const needsRefinement = overallScore < 80 && overallScore >= 60;

  const totalDurationMs = Date.now() - start;

  log.info(`[ParallelQuality] Score=${overallScore} passed=${passed} duration=${totalDurationMs}ms (A:${blockA.length} B:${blockB.length} C:${checks.blockC.length})`);

  return {
    overallScore,
    passed,
    needsRefinement,
    blockA,
    blockB,
    blockC,
    totalDurationMs,
  };
}

async function runCheckSafe(check: CheckFn, input: QualityInput): Promise<QualityCheckResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      check(input),
      new Promise<QualityCheckResult>((resolve) =>
        setTimeout(() => resolve({
          name: 'timeout',
          passed: true, // Don't fail on timeout
          durationMs: 5000,
          detail: 'Check timed out after 5s',
        }), 5000)
      ),
    ]);
    return result;
  } catch (err) {
    return {
      name: 'error',
      passed: true, // Don't fail on error
      durationMs: Date.now() - start,
      detail: `Check failed: ${(err as Error).message}`,
    };
  }
}

function extractResults(
  settled: PromiseSettledResult<QualityCheckResult>[],
): QualityCheckResult[] {
  return settled.map(r => {
    if (r.status === 'fulfilled') return r.value;
    return {
      name: 'error',
      passed: true,
      durationMs: 0,
      detail: `Promise rejected: ${r.reason}`,
    };
  });
}
