/**
 * score-normalizer.ts — MOTHER Score Normalization Utility
 *
 * Scientific basis:
 * - Dean & Barroso (2013) "The Tail at Scale" (CACM 56(2)) — metrics MUST use consistent units
 * - Type-safe normalization prevents scale drift bugs (C123, C94, C116)
 *
 * All quality/fitness scores in MOTHER use the 0-100 scale.
 * This utility detects and normalizes 0-1 values to 0-100.
 *
 * @version v96.1 | Bug Fix Audit Phase 1
 */

import { createLogger } from '../_core/logger';

const log = createLogger('ScoreNormalizer');

/**
 * Normalizes any score to the 0-100 range.
 * Detects 0-1 scale values and converts them.
 *
 * @param value - The raw score (may be 0-1 or 0-100)
 * @param label - Description for logging (e.g., "qualityScore", "passRate")
 * @returns Normalized score in 0-100 range
 */
export function normalizeScore(value: number, label: string = 'score'): number {
  if (typeof value !== 'number' || isNaN(value)) {
    log.warn(`[ScoreNormalizer] ${label} is NaN or not a number, defaulting to 0`);
    return 0;
  }

  // Detect 0-1 scale: values strictly between 0 and 1 (exclusive) are likely 0-1 scale
  // Values of exactly 0 or 1 are ambiguous but rare edge cases — treat 1.0 as 0-1 scale
  if (value > 0 && value <= 1.0) {
    log.debug(`[ScoreNormalizer] ${label}=${value} appears 0-1 scale, normalizing to 0-100`);
    return Math.round(value * 100);
  }

  // Already 0-100 scale, clamp to valid range
  return Math.round(Math.max(0, Math.min(100, value)));
}

/**
 * Validates that a score is in the expected 0-100 range.
 * Throws if the score appears to be in 0-1 scale (helps catch bugs at dev time).
 *
 * @param value - The score to validate
 * @param label - Description for error messages
 * @returns The validated score
 */
export function assertScore0to100(value: number, label: string = 'score'): number {
  if (value > 0 && value < 1) {
    throw new Error(
      `[ScoreNormalizer] ${label}=${value} appears to be 0-1 scale but 0-100 expected. ` +
      `Use normalizeScore() to convert, or fix the source.`
    );
  }
  return Math.round(Math.max(0, Math.min(100, value)));
}
