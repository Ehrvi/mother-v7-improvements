/**
 * SHMS Multi-Tier Anomaly Detector — server/shms/anomaly-ml.ts
 * MOTHER v7 | Structural Health Monitoring System
 *
 * Scientific basis:
 * - Welford (1962): Online algorithm for computing running mean and variance
 * - Page (1954): CUSUM — cumulative sum control chart for change-point detection
 * - Liu et al. (2008): "Isolation Forest" — anomaly detection via random partitioning
 * - GISTM (2020) Section 8.2: Alert level framework for tailings dam instrumentation
 *
 * Architecture:
 *   Tier 1 (real-time)  : Z-score with Welford online statistics
 *   Tier 2 (1-min)      : CUSUM with adaptive threshold (Page 1954)
 *   Tier 3 (15-min)     : Isolation Forest (Liu et al. 2008, TypeScript-pure)
 *   Tier 4 (composite)  : Weighted combination [0.2, 0.3, 0.5]
 */

import { createLogger } from '../_core/logger.js';

const logger = createLogger('anomaly-ml');

// ============================================================
// Public Interfaces
// ============================================================

export interface MultiTierAnomalyResult {
  sensorId: string;
  timestamp: Date;
  value: number;
  isAnomaly: boolean;
  compositeScore: number;
  severity: 'normal' | 'watch' | 'warning' | 'alert' | 'critical';
  tiers: {
    zscore: { score: number; flagged: boolean; zscore: number };
    cusum: { score: number; flagged: boolean; cumulativeSum: number };
    isolationForest: { score: number; flagged: boolean; avgPathLength: number };
  };
  method: string;
  message: string;
}

export interface AnomalyDetectorConfig {
  zscoreThreshold?: number;
  cusumK?: number;
  cusumH?: number;
  ifWindowSize?: number;
}

// ============================================================
// Internal state types
// ============================================================

interface WelfordState {
  count: number;
  mean: number;
  m2: number;
  std: number;
}

interface CusumState {
  cusumPos: number;
  cusumNeg: number;
}

interface IsolationNode {
  isLeaf: boolean;
  size: number;
  splitValue: number;
  splitAttr: number;  // always 0 for univariate
  left: IsolationNode | null;
  right: IsolationNode | null;
}

// ============================================================
// Tier 1: Welford Online Algorithm
// Reference: Welford (1962), Knuth TAOCP Vol 2
// ============================================================

function welfordUpdate(state: WelfordState, value: number): void {
  state.count++;
  const delta = value - state.mean;
  state.mean += delta / state.count;
  const delta2 = value - state.mean;
  state.m2 += delta * delta2;
  state.std = state.count > 1 ? Math.sqrt(state.m2 / (state.count - 1)) : 0;
}

function zscoreAnalyze(
  state: WelfordState,
  value: number,
  threshold: number
): { zscore: number; score: number; flagged: boolean } {
  const z = state.std > 0 ? (value - state.mean) / state.std : 0;
  const absZ = Math.abs(z);
  const score = Math.min(1, absZ / (threshold * 2));
  return { zscore: Math.round(z * 1000) / 1000, score, flagged: absZ >= threshold };
}

// ============================================================
// Tier 2: CUSUM Change-Point Detection
// Reference: Page (1954) — "Continuous inspection schemes"
// ============================================================

function cusumUpdate(
  state: CusumState,
  welford: WelfordState,
  value: number,
  k: number,
  h: number
): { cumulativeSum: number; score: number; flagged: boolean } {
  const std = welford.std > 0 ? welford.std : 1;
  const deviation = (value - welford.mean) / std;
  state.cusumPos = Math.max(0, state.cusumPos + deviation - k);
  state.cusumNeg = Math.max(0, state.cusumNeg - deviation - k);
  const maxCusum = Math.max(state.cusumPos, state.cusumNeg);
  const flagged = maxCusum >= h;
  const score = Math.min(1, maxCusum / (h * 1.5));
  return { cumulativeSum: Math.round(maxCusum * 1000) / 1000, score, flagged };
}

// ============================================================
// Tier 3: Isolation Forest (TypeScript-pure)
// Reference: Liu et al. (2008) — "Isolation Forest", ICDM 2008
// Score: s(x,n) = 2^(-E[h(x)] / c(n))
// ============================================================

/** Average path length of unsuccessful BST search — Liu et al. (2008) Eq. 1 */
function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function buildIsolationTree(
  data: number[],
  currentDepth: number,
  maxDepth: number
): IsolationNode {
  const size = data.length;
  if (currentDepth >= maxDepth || size <= 1) {
    return { isLeaf: true, size, splitValue: 0, splitAttr: 0, left: null, right: null };
  }
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  if (minVal === maxVal) {
    return { isLeaf: true, size, splitValue: 0, splitAttr: 0, left: null, right: null };
  }
  // Random split point in [min, max)
  const splitValue = minVal + Math.random() * (maxVal - minVal);
  const leftData = data.filter(v => v < splitValue);
  const rightData = data.filter(v => v >= splitValue);
  return {
    isLeaf: false,
    size,
    splitValue,
    splitAttr: 0,
    left: buildIsolationTree(leftData, currentDepth + 1, maxDepth),
    right: buildIsolationTree(rightData, currentDepth + 1, maxDepth),
  };
}

function pathLength(value: number, node: IsolationNode, currentDepth: number): number {
  if (node.isLeaf) {
    return currentDepth + cFactor(node.size);
  }
  if (value < node.splitValue) {
    return pathLength(value, node.left!, currentDepth + 1);
  }
  return pathLength(value, node.right!, currentDepth + 1);
}

function isolationForestScore(
  value: number,
  window: number[],
  nTrees: number
): { score: number; avgPathLength: number } {
  const n = window.length;
  if (n < 4) return { score: 0, avgPathLength: 0 };

  const maxDepth = Math.ceil(Math.log2(n));
  let totalPath = 0;

  for (let t = 0; t < nTrees; t++) {
    // Bootstrap sample (subsample size min(256, n))
    const subsampleSize = Math.min(256, n);
    const sample: number[] = [];
    for (let i = 0; i < subsampleSize; i++) {
      sample.push(window[Math.floor(Math.random() * n)]);
    }
    const tree = buildIsolationTree(sample, 0, maxDepth);
    totalPath += pathLength(value, tree, 0);
  }

  const avgPath = totalPath / nTrees;
  const cn = cFactor(Math.min(256, n));
  const score = cn > 0 ? Math.pow(2, -avgPath / cn) : 0;
  return { score: Math.min(1, Math.max(0, score)), avgPathLength: Math.round(avgPath * 100) / 100 };
}

// ============================================================
// Severity Classification
// Reference: GISTM (2020) Section 8.2 — Alert Level Framework
// ============================================================

function classifySeverity(
  compositeScore: number,
  zscore: number,
  cusumFlagged: boolean
): 'normal' | 'watch' | 'warning' | 'alert' | 'critical' {
  const absZ = Math.abs(zscore);
  if (compositeScore > 0.85 && absZ > 4.5 && cusumFlagged) return 'critical';
  if (compositeScore > 0.70 || (absZ >= 4.0 && cusumFlagged)) return 'alert';
  if (compositeScore > 0.55 || absZ >= 3.5) return 'warning';
  if (compositeScore > 0.40 || absZ >= 3.0) return 'watch';
  return 'normal';
}

// ============================================================
// Public Class: MultiTierAnomalyDetector
// ============================================================

export class MultiTierAnomalyDetector {
  private readonly sensorId: string;
  private readonly zscoreThreshold: number;
  private readonly cusumK: number;
  private readonly cusumH: number;
  private readonly ifWindowSize: number;
  private readonly nTrees: number = 50;

  private welford: WelfordState;
  private cusumState: CusumState;
  private valueWindow: number[];
  private minSamples: number = 30;

  constructor(sensorId: string, config: AnomalyDetectorConfig = {}) {
    this.sensorId = sensorId;
    this.zscoreThreshold = config.zscoreThreshold ?? 3.0;
    this.cusumK = config.cusumK ?? 0.5;
    this.cusumH = config.cusumH ?? 5.0;
    this.ifWindowSize = config.ifWindowSize ?? 100;

    this.welford = { count: 0, mean: 0, m2: 0, std: 0 };
    this.cusumState = { cusumPos: 0, cusumNeg: 0 };
    this.valueWindow = [];
  }

  /**
   * Process a new sensor value through all four tiers.
   * Tiers are applied sequentially; Tier 4 combines with weights [0.2, 0.3, 0.5].
   */
  process(value: number, timestamp: Date): MultiTierAnomalyResult {
    // Maintain sliding window for IF
    this.valueWindow.push(value);
    if (this.valueWindow.length > this.ifWindowSize) {
      this.valueWindow.shift();
    }

    const warming = this.welford.count < this.minSamples;

    // --- Tier 1: Z-score ---
    const zResult = warming
      ? { zscore: 0, score: 0, flagged: false }
      : zscoreAnalyze(this.welford, value, this.zscoreThreshold);

    // Update Welford AFTER scoring to avoid contamination
    welfordUpdate(this.welford, value);

    // --- Tier 2: CUSUM ---
    const cusumResult = warming
      ? { cumulativeSum: 0, score: 0, flagged: false }
      : cusumUpdate(this.cusumState, this.welford, value, this.cusumK, this.cusumH);

    // --- Tier 3: Isolation Forest ---
    const ifResult = this.valueWindow.length < 10
      ? { score: 0, flagged: false, avgPathLength: 0 }
      : (() => {
          const r = isolationForestScore(value, this.valueWindow, this.nTrees);
          return { ...r, flagged: r.score > 0.6 };
        })();

    // --- Tier 4: Composite (weights: z=0.2, cusum=0.3, if=0.5) ---
    const compositeScore = warming
      ? 0
      : Math.min(1, 0.2 * zResult.score + 0.3 * cusumResult.score + 0.5 * ifResult.score);

    const severity = warming ? 'normal' : classifySeverity(compositeScore, zResult.zscore, cusumResult.flagged);
    const isAnomaly = severity !== 'normal';

    const method = [
      zResult.flagged ? 'zscore' : null,
      cusumResult.flagged ? 'cusum' : null,
      ifResult.flagged ? 'isolation-forest' : null,
    ].filter((m): m is string => m !== null).join('+') || (warming ? 'warming-up' : 'baseline');

    const message = warming
      ? `Warming up baseline (${this.welford.count}/${this.minSamples} samples)`
      : isAnomaly
        ? `${severity.toUpperCase()}: sensor ${this.sensorId} = ${value} (score=${compositeScore.toFixed(3)})`
        : `Normal: sensor ${this.sensorId} = ${value} (mean=${this.welford.mean.toFixed(2)})`;

    logger.debug('Tier analysis', { sensorId: this.sensorId, severity, compositeScore });

    return {
      sensorId: this.sensorId,
      timestamp,
      value,
      isAnomaly,
      compositeScore: Math.round(compositeScore * 10000) / 10000,
      severity,
      tiers: {
        zscore: { score: zResult.score, flagged: zResult.flagged, zscore: zResult.zscore },
        cusum: { score: cusumResult.score, flagged: cusumResult.flagged, cumulativeSum: cusumResult.cumulativeSum },
        isolationForest: { score: ifResult.score, flagged: ifResult.flagged, avgPathLength: ifResult.avgPathLength },
      },
      method,
      message,
    };
  }

  /** Reset all state (e.g., after sensor maintenance). */
  reset(): void {
    this.welford = { count: 0, mean: 0, m2: 0, std: 0 };
    this.cusumState = { cusumPos: 0, cusumNeg: 0 };
    this.valueWindow = [];
    logger.info('Detector state reset', { sensorId: this.sensorId });
  }
}
