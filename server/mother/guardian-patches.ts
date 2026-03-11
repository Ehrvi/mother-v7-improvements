/**
 * MOTHER v74.8 — Guardian Patches
 * 
 * NC-GUARD-001: Response completeness rule
 * NC-GUARD-002: Uncertainty pattern detection (PT + EN)
 * 
 * Scientific basis:
 * - G-Eval (Liu et al., 2023, arXiv:2303.16634): LLM-as-a-judge with CoT scoring
 * - RAGAS Answer Completeness (Es et al., 2023, arXiv:2309.15217)
 * - Rank-Calibration (Shuoli et al., 2024, ACL EMNLP): uncertainty markers ↔ calibration error
 * - Concise Thoughts (Nayab et al., 2024, arXiv:2407.19825): response length vs quality
 * 
 * Apply these patches by importing and calling applyGuardianPatches(qualityScore, response, query)
 * in guardian.ts AFTER the base qualityScore is computed.
 */

export interface GuardianPatchResult {
  adjustedScore: number;
  completenessViolation: boolean;
  uncertaintyCount: number;
  penalties: string[];
}

/**
 * NC-GUARD-001: Response completeness rule
 * 
 * If the response is too short relative to the query length,
 * force the quality score below the regeneration threshold (70).
 * 
 * Basis: RAGAS Answer Completeness — responses < 50 chars have completeness ≈ 0
 * Threshold: response.length < 50 AND query.length > 20 → score ≤ 55
 */
export function applyCompletenessRule(
  qualityScore: number,
  response: string,
  query: string
): { score: number; violated: boolean } {
  const RESPONSE_MIN_LENGTH = 50;
  const QUERY_MIN_LENGTH = 20;
  const COMPLETENESS_CAP = 55; // Below regeneration threshold of 70

  const responseLen = response.trim().length;
  const queryLen = query.trim().length;

  if (responseLen < RESPONSE_MIN_LENGTH && queryLen > QUERY_MIN_LENGTH) {
    return {
      score: Math.min(qualityScore, COMPLETENESS_CAP),
      violated: true,
    };
  }

  return { score: qualityScore, violated: false };
}

/**
 * NC-GUARD-002: Uncertainty pattern detection (PT + EN)
 * 
 * Detects linguistic markers of uncertainty in the response.
 * Each unique pattern match reduces the quality score by 10 points (capped at 3 matches = -30).
 * 
 * Basis: Rank-Calibration (Shuoli et al., 2024) — uncertainty markers correlate with
 * Expected Calibration Error (ECE). High ECE → unreliable response → lower quality score.
 */
export const UNCERTAINTY_PATTERNS_EN = [
  /\bi('m| am) not sure\b/i,
  /\bmaybe\b/i,
  /\bpossibly\b/i,
  /\bi think\b/i,
  /\bi believe\b/i,
  /\bit seems\b/i,
  /\bi cannot confirm\b/i,
  /\bi can't confirm\b/i,
  /\bi don't know\b/i,
  /\bi do not know\b/i,
  /\bi cannot say\b/i,
  /\bi can't say\b/i,
  /\buncertain\b/i,
  /\bnot sure\b/i,
];

export const UNCERTAINTY_PATTERNS_PT = [
  /\bnão tenho certeza\b/i,
  /\bacho que\b/i,
  /\btalvez\b/i,
  /\bpossivelmente\b/i,
  /\bacredito que\b/i,
  /\bparece que\b/i,
  /\bnão posso confirmar\b/i,
  /\bnão sei\b/i,
  /\bnão consigo dizer\b/i,
  /\bincerto\b/i,
  /\bincerta\b/i,
  /\bpode ser\b/i,
];

export const ALL_UNCERTAINTY_PATTERNS = [
  ...UNCERTAINTY_PATTERNS_EN,
  ...UNCERTAINTY_PATTERNS_PT,
];

export function applyUncertaintyPenalty(
  qualityScore: number,
  response: string
): { score: number; uncertaintyCount: number } {
  const PENALTY_PER_MATCH = 5;  // C255: 10 → 5 pts (philosophical/academic hedging is legitimate epistemic language)
  const MAX_PENALTY_MATCHES = 2; // C255: 3 → 2 (max -10 pts total, was -30 pts)

  const matchedPatterns = ALL_UNCERTAINTY_PATTERNS.filter((p) =>
    p.test(response)
  );
  const uncertaintyCount = matchedPatterns.length;

  if (uncertaintyCount === 0) {
    return { score: qualityScore, uncertaintyCount: 0 };
  }

  const penalty = PENALTY_PER_MATCH * Math.min(uncertaintyCount, MAX_PENALTY_MATCHES);
  return {
    score: Math.max(0, qualityScore - penalty),
    uncertaintyCount,
  };
}

/**
 * Main patch function — apply both NC-GUARD-001 and NC-GUARD-002
 * 
 * Usage in guardian.ts:
 * ```typescript
 * import { applyGuardianPatches } from './guardian-patches';
 * 
 * // After computing base qualityScore...
 * const patched = applyGuardianPatches(qualityScore, response, query);
 * qualityScore = patched.adjustedScore;
 * ```
 */
export function applyGuardianPatches(
  qualityScore: number,
  response: string,
  query: string
): GuardianPatchResult {
  const penalties: string[] = [];

  // NC-GUARD-001: Completeness rule
  const completeness = applyCompletenessRule(qualityScore, response, query);
  let score = completeness.score;
  if (completeness.violated) {
    penalties.push(
      `NC-GUARD-001: Response too short (${response.trim().length} chars) for query length ${query.trim().length}. Score capped at 55.`
    );
  }

  // NC-GUARD-002: Uncertainty penalty
  const uncertainty = applyUncertaintyPenalty(score, response);
  score = uncertainty.score;
  if (uncertainty.uncertaintyCount > 0) {
    penalties.push(
      `NC-GUARD-002: ${uncertainty.uncertaintyCount} uncertainty pattern(s) detected. Penalty: -${Math.min(uncertainty.uncertaintyCount, 2) * 5} points.`
    );
  }

  return {
    adjustedScore: score,
    completenessViolation: completeness.violated,
    uncertaintyCount: uncertainty.uncertaintyCount,
    penalties,
  };
}
