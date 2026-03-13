/**
 * SHMS Remaining Useful Life Predictor — server/shms/rul-predictor.ts
 * MOTHER v7 | Structural Health Monitoring System
 *
 * Scientific basis:
 * - Paris & Erdogan (1963): Exponential degradation model for fatigue crack growth
 * - AASHTO (2018) LRFDBR Section 4: Bridge structural health thresholds (critical = 60 pts)
 * - ISO 13381-1 (2015): "Condition monitoring — Prognostics" — RUL estimation methodology
 * - Efron (1979): Bootstrap resampling for uncertainty quantification
 * - Nelson (2005) "Applied Life Data Analysis": linear regression on log-transformed degradation
 *
 * Algorithm:
 *   1. < 7 data points  → insufficient_data; urgency by current score
 *   2. Fit H(t) = H0 * exp(-λt) via OLS on log(H) vs t (days since first point)
 *   3. Extrapolate to criticalThreshold to get median RUL (P50)
 *   4. Bootstrap 100 samples → P10 (pessimistic) and P90 (optimistic)
 *   5. Classify urgency: immediate (<30d), priority (30-90d), planned (90-365d), routine (>365d)
 */

import { createLogger } from '../_core/logger.js';

const logger = createLogger('rul-predictor');

// ============================================================
// Public Interfaces
// ============================================================

export interface DegradationPoint {
  timestamp: Date;
  healthScore: number;
}

export interface RULPrediction {
  structureId: string;
  predictedAt: Date;
  currentHealthScore: number;
  degradationRatePerDay: number;
  criticalThreshold: number;
  rulDaysP50: number;
  rulDaysP10: number;
  rulDaysP90: number;
  predictedCriticalDate: Date | null;
  confidence: number;
  modelType: 'exponential' | 'linear' | 'insufficient_data';
  interventionUrgency: 'routine' | 'planned' | 'priority' | 'immediate';
  recommendation: string;
}

// ============================================================
// Internal helpers
// ============================================================

const MS_PER_DAY = 86400_000;

/** Convert history to (t_days, healthScore) pairs, t relative to first point. */
function toTimeSeries(history: DegradationPoint[]): { t: number; h: number }[] {
  const t0 = history[0].timestamp.getTime();
  return history.map(p => ({
    t: (p.timestamp.getTime() - t0) / MS_PER_DAY,
    h: p.healthScore,
  }));
}

/**
 * Ordinary least-squares linear regression on (x[], y[]).
 * Returns { slope, intercept, r2 }.
 */
function olsLinear(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const meanY = sumY / n;
  const ssTot = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - (slope * x[i] + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

/**
 * Fit exponential model H(t) = H0 * exp(-λt) via log-linearisation.
 * Filters out non-positive health scores before taking log.
 * Returns { lambda, h0, r2 }.
 */
function fitExponential(series: { t: number; h: number }[]): { lambda: number; h0: number; r2: number } {
  const valid = series.filter(p => p.h > 0);
  if (valid.length < 2) return { lambda: 0, h0: series[0]?.h ?? 100, r2: 0 };

  const x = valid.map(p => p.t);
  const y = valid.map(p => Math.log(p.h));

  const { slope, intercept, r2 } = olsLinear(x, y);
  const lambda = -slope;         // λ > 0 means degradation
  const h0 = Math.exp(intercept);
  return { lambda, h0, r2 };
}

/**
 * Compute RUL in days for exponential model H(t) = H0 * exp(-λt).
 * Returns Infinity if lambda <= 0 (no degradation trend).
 */
function rulExponential(currentH: number, lambda: number, threshold: number): number {
  if (lambda <= 0 || currentH <= threshold) return lambda <= 0 ? Infinity : 0;
  return Math.log(currentH / threshold) / lambda;
}

/**
 * Bootstrap resampling — Efron (1979).
 * Returns sorted array of RUL estimates from 100 bootstrap samples.
 */
function bootstrapRUL(
  series: { t: number; h: number }[],
  threshold: number,
  nSamples: number = 100
): number[] {
  const n = series.length;
  const results: number[] = [];

  for (let b = 0; b < nSamples; b++) {
    // Sample with replacement
    const boot: { t: number; h: number }[] = [];
    for (let i = 0; i < n; i++) {
      boot.push(series[Math.floor(Math.random() * n)]);
    }
    // Sort by time to keep temporal order
    boot.sort((a, c) => a.t - c.t);

    const { lambda, h0, r2 } = fitExponential(boot);
    if (r2 < 0.1) continue; // skip poor fits
    const currentH = boot[boot.length - 1].h;
    const rul = rulExponential(currentH, lambda, threshold);
    if (isFinite(rul) && rul >= 0) results.push(rul);
  }

  return results.sort((a, b) => a - b);
}

/** Percentile from sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function urgencyFromRUL(rulDays: number): RULPrediction['interventionUrgency'] {
  if (rulDays < 30) return 'immediate';
  if (rulDays < 90) return 'priority';
  if (rulDays < 365) return 'planned';
  return 'routine';
}

function urgencyFromScore(score: number): RULPrediction['interventionUrgency'] {
  if (score < 65) return 'immediate';
  if (score < 75) return 'priority';
  if (score < 85) return 'planned';
  return 'routine';
}

function recommendationText(urgency: RULPrediction['interventionUrgency'], rulDays: number, modelType: string): string {
  if (modelType === 'insufficient_data') {
    return 'Insufficient data for RUL prediction. Continue monitoring to build degradation history.';
  }
  switch (urgency) {
    case 'immediate':
      return `Immediate intervention required. Estimated ${Math.round(rulDays)} days to critical threshold. Consider load restrictions and emergency inspection.`;
    case 'priority':
      return `Priority maintenance within 30–90 days. Estimated RUL: ${Math.round(rulDays)} days. Schedule detailed inspection.`;
    case 'planned':
      return `Plan maintenance within the year. Estimated RUL: ${Math.round(rulDays)} days. Include in next maintenance cycle.`;
    default:
      return `Structure healthy. Estimated RUL: ${Math.round(rulDays)} days. Continue routine monitoring per AASHTO schedule.`;
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Predict Remaining Useful Life for a monitored structure.
 *
 * Reference: ISO 13381-1 (2015) — Condition monitoring and diagnostics — Prognostics.
 * Model: exponential degradation H(t) = H0 * exp(-λt), fitted via OLS on log(H) vs t.
 * Uncertainty: bootstrap 100 samples → P10/P90 confidence interval (Efron 1979).
 * Critical threshold: 60 points (AASHTO LRFDBR 2018 Section 4).
 *
 * @param structureId   Unique identifier for the monitored structure
 * @param history       Time-ordered sequence of (timestamp, healthScore) pairs
 * @param criticalThreshold  Health score threshold for critical state (default: 60)
 */
export function predictRUL(
  structureId: string,
  history: DegradationPoint[],
  criticalThreshold: number = 60
): RULPrediction {
  const predictedAt = new Date();
  const currentHealth = history.length > 0 ? history[history.length - 1].healthScore : 100;

  // --- Insufficient data path ---
  if (history.length < 7) {
    const urgency = urgencyFromScore(currentHealth);
    logger.warn('Insufficient data for RUL prediction', { structureId, points: history.length });
    return {
      structureId,
      predictedAt,
      currentHealthScore: currentHealth,
      degradationRatePerDay: 0,
      criticalThreshold,
      rulDaysP50: 0,
      rulDaysP10: 0,
      rulDaysP90: 0,
      predictedCriticalDate: null,
      confidence: 0,
      modelType: 'insufficient_data',
      interventionUrgency: urgency,
      recommendation: recommendationText(urgency, 0, 'insufficient_data'),
    };
  }

  const series = toTimeSeries(history);
  const { lambda, h0, r2 } = fitExponential(series);

  const rulP50 = rulExponential(currentHealth, lambda, criticalThreshold);
  const rulP50Clamped = isFinite(rulP50) ? Math.max(0, rulP50) : 9999;

  // Bootstrap for uncertainty
  const bootResults = bootstrapRUL(series, criticalThreshold, 100);
  const rulP10 = bootResults.length >= 10 ? percentile(bootResults, 10) : rulP50Clamped * 0.7;
  const rulP90 = bootResults.length >= 10 ? percentile(bootResults, 90) : rulP50Clamped * 1.3;

  // Confidence proportional to R² and data coverage
  const confidence = Math.min(1, r2 * (Math.min(history.length, 30) / 30));

  // Degradation rate: λ * currentHealth (points per day for exponential model)
  const degradationRatePerDay = lambda > 0 ? lambda * currentHealth : 0;

  const predictedCriticalDate = isFinite(rulP50) && rulP50 < 9998
    ? new Date(predictedAt.getTime() + rulP50Clamped * MS_PER_DAY)
    : null;

  const urgency = urgencyFromRUL(rulP50Clamped);

  logger.info('RUL predicted', { structureId, rulDaysP50: Math.round(rulP50Clamped), urgency, r2 });

  return {
    structureId,
    predictedAt,
    currentHealthScore: Math.round(currentHealth * 100) / 100,
    degradationRatePerDay: Math.round(degradationRatePerDay * 10000) / 10000,
    criticalThreshold,
    rulDaysP50: Math.round(rulP50Clamped),
    rulDaysP10: Math.round(Math.max(0, rulP10)),
    rulDaysP90: Math.round(rulP90),
    predictedCriticalDate,
    confidence: Math.round(confidence * 10000) / 10000,
    modelType: 'exponential',
    interventionUrgency: urgency,
    recommendation: recommendationText(urgency, rulP50Clamped, 'exponential'),
  };
}
