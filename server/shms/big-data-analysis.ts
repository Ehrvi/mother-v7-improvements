/**
 * SHMS Big Data & Predictive Analysis — server/shms/big-data-analysis.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * Scientific basis:
 * - Mann (1945): "Nonparametric tests against trend", Econometrica 13(3), pp. 245-259.
 * - Pearson (1895): "Notes on regression and inheritance", Proc. Royal Society, 58, 240-242.
 * - Spearman (1904): "The proof and measurement of association", Am. J. Psych. 15, 72-101.
 * - Box & Jenkins (1970): "Time Series Analysis: Forecasting and Control", ARIMA methodology.
 * - Cleveland (1990): "STL: Seasonal-Trend Decomposition using Loess", J. Official Statistics.
 * - ICOLD Bulletin 158 §5 (2011): Analysis of time-series instrumentation data.
 *
 * Modules:
 *   - Exploratory statistics (mean, std, skewness, kurtosis, IQR, CV)
 *   - Temporal behaviour classification (stationary → accelerating growth)
 *   - Correlation analysis: Pearson r, Spearman ρ, cross-correlation with lag
 *   - Autocorrelation (ACF) and Partial Autocorrelation (PACF)
 *   - Mechanical properties: displacement → velocity → acceleration (finite differences)
 *   - 7-day forecast with confidence interval (linear trend + residual std)
 */

import { createLogger } from '../_core/logger.js';

const log = createLogger('SHMS-BigData');

// ============================================================
// Types
// ============================================================

export type BehaviorClass =
  | 'stationary'
  | 'linearly_increasing'
  | 'linearly_decreasing'
  | 'accelerating_increase'   // 2nd derivative > 0, slope > 0
  | 'decelerating_increase'   // 2nd derivative < 0, slope > 0
  | 'decelerating_decrease';  // 2nd derivative > 0, slope < 0

export interface TimeSeriesPoint { timestamp: Date; value: number; }

export interface ExploratoryStats {
  count: number;
  mean: number;
  median: number;
  std: number;
  variance: number;
  skewness: number;   // Pearson's moment coefficient of skewness
  kurtosis: number;   // excess kurtosis (normal = 0)
  min: number;
  max: number;
  range: number;
  percentile25: number;
  percentile75: number;
  iqr: number;
  cv: number;         // coefficient of variation = std / |mean|
}

export interface CorrelationResult {
  tag1Id: string;
  tag2Id: string;
  pearsonR: number;
  spearmanRho: number;   // rank-based, captures monotonic non-linear relationships
  lagOptimal: number;    // lag in hours that maximises cross-correlation
  significance: 'high' | 'moderate' | 'low' | 'none';
}

export interface AutocorrelationResult {
  lag: number;
  acf: number;    // sample autocorrelation function
  pacf: number;   // partial autocorrelation (Yule-Walker approximation)
}

export interface BehaviorAnalysis {
  classification: BehaviorClass;
  linearTrend: { slope: number; r2: number };  // slope in units/hour
  velocity: number[];     // first derivative (units/hour)
  acceleration: number[]; // second derivative (units/hour²)
  changePoints: Date[];   // detected structural breaks
  forecastNext7d: { timestamp: Date; predicted: number; lower: number; upper: number }[];
  confidence: number;     // 0-1, based on R² of the trend model
}

// ============================================================
// Internal helpers
// ============================================================

/** Convert Date[] time series to hours-since-first for numeric regression. */
function toHours(series: TimeSeriesPoint[]): number[] {
  if (series.length === 0) return [];
  const t0 = series[0]!.timestamp.getTime();
  return series.map(p => (p.timestamp.getTime() - t0) / 3_600_000);
}

/** Simple Ordinary Least Squares linear regression. */
function ols(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0, r2: 0 };

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (x[i]! - meanX) * (y[i]! - meanY);
    ssxx += (x[i]! - meanX) ** 2;
    ssyy += (y[i]! - meanY) ** 2;
  }
  if (ssxx === 0) return { slope: 0, intercept: meanY, r2: 0 };
  const slope = ssxy / ssxx;
  const intercept = meanY - slope * meanX;
  const r2 = ssyy === 0 ? 1 : (ssxy ** 2) / (ssxx * ssyy);
  return { slope, intercept, r2 };
}

/** Rank array, average ranks for ties. */
function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j]!.v === indexed[i]!.v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[indexed[k]!.i] = avgRank;
    i = j;
  }
  return ranks;
}

/** Sample standard deviation. */
function stdDev(values: number[], mean: number): number {
  const n = values.length;
  if (n < 2) return 0;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
}

/** Percentile via linear interpolation. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
}

/** Central-difference first derivative (units/hour). */
function firstDerivative(values: number[], hours: number[]): number[] {
  const n = values.length;
  if (n < 2) return [];
  const deriv: number[] = new Array(n);
  deriv[0] = (values[1]! - values[0]!) / Math.max(hours[1]! - hours[0]!, 1e-9);
  deriv[n - 1] = (values[n - 1]! - values[n - 2]!) / Math.max(hours[n - 1]! - hours[n - 2]!, 1e-9);
  for (let i = 1; i < n - 1; i++) {
    const dt = Math.max(hours[i + 1]! - hours[i - 1]!, 1e-9);
    deriv[i] = (values[i + 1]! - values[i - 1]!) / dt;
  }
  return deriv;
}

// ============================================================
// Public functions
// ============================================================

/**
 * Compute comprehensive exploratory statistics for a time series.
 * Reference: Pearson (1895); Joanes & Gill (1998) skewness/kurtosis formulas.
 */
export function computeExploratoryStats(series: TimeSeriesPoint[]): ExploratoryStats {
  const n = series.length;
  if (n === 0) {
    return {
      count: 0, mean: 0, median: 0, std: 0, variance: 0,
      skewness: 0, kurtosis: 0, min: 0, max: 0, range: 0,
      percentile25: 0, percentile75: 0, iqr: 0, cv: 0,
    };
  }

  const values = series.map(p => p.value);
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = n < 2 ? 0 : values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  let skewness = 0, kurtosis = 0;
  if (std > 0 && n >= 3) {
    skewness = values.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;
    kurtosis = values.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n - 3;
  }

  const p25 = percentile(sorted, 25);
  const p75 = percentile(sorted, 75);

  return {
    count: n,
    mean,
    median: percentile(sorted, 50),
    std,
    variance,
    skewness,
    kurtosis,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    range: sorted[n - 1]! - sorted[0]!,
    percentile25: p25,
    percentile75: p75,
    iqr: p75 - p25,
    cv: mean !== 0 ? std / Math.abs(mean) : 0,
  };
}

/**
 * Classify temporal behaviour of a sensor time series.
 * Algorithm:
 *   1. Fit OLS linear regression → slope, R²
 *   2. Compute central-difference velocity and acceleration
 *   3. If R² < 0.3: stationary
 *   4. Classify by sign of slope and mean acceleration
 * Reference: Mann (1945) trend test; Box-Jenkins ARIMA diagnostics.
 */
export function classifyBehavior(series: TimeSeriesPoint[]): BehaviorAnalysis {
  const n = series.length;
  const emptyResult: BehaviorAnalysis = {
    classification: 'stationary',
    linearTrend: { slope: 0, r2: 0 },
    velocity: [], acceleration: [], changePoints: [],
    forecastNext7d: [], confidence: 0,
  };
  if (n < 3) return emptyResult;

  const hours = toHours(series);
  const values = series.map(p => p.value);
  const { slope, intercept, r2 } = ols(hours, values);
  const velocity = firstDerivative(values, hours);
  const acceleration = firstDerivative(velocity, hours);
  const meanAccel = acceleration.reduce((s, v) => s + v, 0) / acceleration.length;

  // Behaviour classification
  let classification: BehaviorClass;
  if (r2 < 0.3) {
    classification = 'stationary';
  } else if (slope > 0) {
    if (meanAccel > 0.001 * Math.abs(slope)) classification = 'accelerating_increase';
    else if (meanAccel < -0.001 * Math.abs(slope)) classification = 'decelerating_increase';
    else classification = 'linearly_increasing';
  } else {
    if (meanAccel > 0.001 * Math.abs(slope)) classification = 'decelerating_decrease';
    else classification = 'linearly_decreasing';
  }

  // Change point detection: look for sign changes in acceleration (simplified CUSUM)
  const changePoints: Date[] = [];
  for (let i = 1; i < acceleration.length - 1; i++) {
    if (Math.sign(acceleration[i]!) !== Math.sign(acceleration[i - 1]!) &&
        Math.abs(acceleration[i]!) > Math.abs(slope) * 0.05) {
      changePoints.push(series[i]!.timestamp);
    }
  }

  // Forecast next 7 days: linear extrapolation + ±1.96σ residual confidence interval
  const residualStd = stdDev(
    values.map((v, i) => v - (slope * hours[i]! + intercept)),
    0,
  );
  const lastHour = hours[n - 1]!;
  const forecastNext7d: BehaviorAnalysis['forecastNext7d'] = [];
  const FORECAST_STEPS = 14; // every 12h for 7d
  for (let step = 1; step <= FORECAST_STEPS; step++) {
    const fh = lastHour + step * 12;
    const predicted = slope * fh + intercept;
    const margin = 1.96 * residualStd;
    forecastNext7d.push({
      timestamp: new Date(series[n - 1]!.timestamp.getTime() + step * 12 * 3_600_000),
      predicted,
      lower: predicted - margin,
      upper: predicted + margin,
    });
  }

  log.debug('Behavior classified', { classification, slope, r2, changePoints: changePoints.length });

  return {
    classification,
    linearTrend: { slope, r2 },
    velocity,
    acceleration,
    changePoints,
    forecastNext7d,
    confidence: r2,
  };
}

/**
 * Compute Pearson r and Spearman ρ correlation between two co-temporal series.
 * Cross-correlation lag is found by sliding series2 up to maxLag=48h.
 * Reference: Pearson (1895); Spearman (1904); ICOLD Bulletin 158 §5.2.
 */
export function computeCorrelation(
  series1: TimeSeriesPoint[],
  series2: TimeSeriesPoint[],
): CorrelationResult {
  const tag1Id = 'series1';
  const tag2Id = 'series2';
  const defaultResult: CorrelationResult = {
    tag1Id, tag2Id, pearsonR: 0, spearmanRho: 0, lagOptimal: 0, significance: 'none',
  };

  const n = Math.min(series1.length, series2.length);
  if (n < 4) return defaultResult;

  const v1 = series1.slice(0, n).map(p => p.value);
  const v2 = series2.slice(0, n).map(p => p.value);

  // Pearson r
  const m1 = v1.reduce((s, v) => s + v, 0) / n;
  const m2 = v2.reduce((s, v) => s + v, 0) / n;
  let ssxy = 0, ss1 = 0, ss2 = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (v1[i]! - m1) * (v2[i]! - m2);
    ss1  += (v1[i]! - m1) ** 2;
    ss2  += (v2[i]! - m2) ** 2;
  }
  const pearsonR = (ss1 > 0 && ss2 > 0) ? ssxy / Math.sqrt(ss1 * ss2) : 0;

  // Spearman ρ (rank-based Pearson)
  const r1 = rankArray(v1);
  const r2 = rankArray(v2);
  const rm1 = r1.reduce((s, v) => s + v, 0) / n;
  const rm2 = r2.reduce((s, v) => s + v, 0) / n;
  let rssxy = 0, rss1 = 0, rss2 = 0;
  for (let i = 0; i < n; i++) {
    rssxy += (r1[i]! - rm1) * (r2[i]! - rm2);
    rss1  += (r1[i]! - rm1) ** 2;
    rss2  += (r2[i]! - rm2) ** 2;
  }
  const spearmanRho = (rss1 > 0 && rss2 > 0) ? rssxy / Math.sqrt(rss1 * rss2) : 0;

  // Cross-correlation: find optimal lag (hours) maximising |r|
  const hours1 = toHours(series1.slice(0, n));
  const intervalH = n > 1 ? (hours1[n - 1]! - hours1[0]!) / (n - 1) : 1;
  const maxLagSteps = Math.min(48, Math.floor(n / 4));
  let bestR = Math.abs(pearsonR);
  let bestLag = 0;

  for (let lag = 1; lag <= maxLagSteps; lag++) {
    const sub1 = v1.slice(lag);
    const sub2 = v2.slice(0, n - lag);
    const m = sub1.length;
    if (m < 4) break;
    const mu1 = sub1.reduce((s, v) => s + v, 0) / m;
    const mu2 = sub2.reduce((s, v) => s + v, 0) / m;
    let xy = 0, x2 = 0, y2 = 0;
    for (let i = 0; i < m; i++) {
      xy += (sub1[i]! - mu1) * (sub2[i]! - mu2);
      x2 += (sub1[i]! - mu1) ** 2;
      y2 += (sub2[i]! - mu2) ** 2;
    }
    const r = (x2 > 0 && y2 > 0) ? xy / Math.sqrt(x2 * y2) : 0;
    if (Math.abs(r) > bestR) { bestR = Math.abs(r); bestLag = lag * intervalH; }
  }

  const absR = Math.abs(pearsonR);
  const significance: CorrelationResult['significance'] =
    absR >= 0.7 ? 'high' : absR >= 0.4 ? 'moderate' : absR >= 0.2 ? 'low' : 'none';

  return { tag1Id, tag2Id, pearsonR, spearmanRho, lagOptimal: bestLag, significance };
}

/**
 * Compute ACF and PACF (Yule-Walker approximation) up to maxLag.
 * Reference: Box & Jenkins (1970), ARIMA methodology; Brockwell & Davis (2002).
 */
export function computeAutocorrelation(
  series: TimeSeriesPoint[],
  maxLag: number,
): AutocorrelationResult[] {
  const values = series.map(p => p.value);
  const n = values.length;
  if (n < maxLag + 2) return [];

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (variance === 0) return [];

  // ACF
  const acfValues: number[] = [1];
  for (let k = 1; k <= maxLag; k++) {
    let cov = 0;
    for (let t = 0; t < n - k; t++) {
      cov += (values[t]! - mean) * (values[t + k]! - mean);
    }
    acfValues.push(cov / (n * variance));
  }

  // PACF via Yule-Walker (Levinson-Durbin recursion)
  const pacfValues: number[] = [1];
  const phi: number[][] = [];
  for (let k = 1; k <= maxLag; k++) {
    let num = acfValues[k]!;
    if (k > 1) {
      for (let j = 1; j < k; j++) {
        num -= phi[k - 2]![j - 1]! * acfValues[k - j]!;
      }
    }
    let den = 1;
    if (k > 1) {
      for (let j = 1; j < k; j++) {
        den -= phi[k - 2]![j - 1]! * acfValues[j]!;
      }
    }
    const phikk = den !== 0 ? num / den : 0;
    pacfValues.push(phikk);

    if (k > 1) {
      const prev = phi[k - 2]!;
      const curr = new Array<number>(k);
      for (let j = 0; j < k - 1; j++) {
        curr[j] = prev[j]! - phikk * prev[k - 2 - j]!;
      }
      curr[k - 1] = phikk;
      phi.push(curr);
    } else {
      phi.push([phikk]);
    }
  }

  return acfValues.map((acf, i) => ({ lag: i, acf, pacf: pacfValues[i] ?? 0 }));
}

/**
 * Compute mechanical properties from a displacement time series using finite differences.
 * - velocity    = Δdisplacement / Δt  (units/hour)
 * - acceleration = Δvelocity / Δt     (units/hour²)
 * Reference: ICOLD Bulletin 158 §5.3 — kinematic analysis of structural monitoring data.
 */
export function computeMechanicalProperties(
  displacementSeries: TimeSeriesPoint[],
  intervalHours = 1,
): { displacement: number[]; velocity: number[]; acceleration: number[] } {
  const n = displacementSeries.length;
  if (n === 0) return { displacement: [], velocity: [], acceleration: [] };

  const displacement = displacementSeries.map(p => p.value);
  const hours = toHours(displacementSeries);

  const effectiveInterval = n > 1
    ? (hours[n - 1]! - hours[0]!) / (n - 1)
    : intervalHours;

  const velocity = firstDerivative(displacement, hours);
  const velHours = hours.map((h, i) => h + effectiveInterval * 0.5 * (i === 0 ? 0 : 1));
  const acceleration = firstDerivative(velocity, velHours);

  return { displacement, velocity, acceleration };
}
