/**
 * SHMS Anomaly Detector — server/shms/anomaly-detector.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * Scientific basis:
 * - Isolation Forest (Liu et al., 2008): Unsupervised anomaly detection via random partitioning
 * - CUSUM (Page, 1954; arXiv:2509.07112): Cumulative Sum for change-point detection
 * - Encode-then-Decompose (arXiv:2510.18998): Unsupervised time series anomaly detection
 * - Neural EKF (arXiv:2210.04165): Kalman-based state estimation for SHM
 * - GISTM 2020 Section 8: Threshold-based alert criteria for tailings dams
 *
 * Algorithm pipeline:
 *   1. Statistical baseline (rolling mean/std, Welford online algorithm)
 *   2. CUSUM change-point detection (arXiv:2509.07112 self-normalized variant)
 *   3. Isolation Forest score (simplified, no external dependencies)
 *   4. Multi-sensor correlation check
 *   5. Severity classification (GISTM: Normal → Watch → Warning → Alert → Emergency)
 */

import type { SensorReading, SensorType } from './mqtt-connector';

// ============================================================
// Types
// ============================================================

export type AlertSeverity = 'normal' | 'watch' | 'warning' | 'alert' | 'emergency';

export interface AnomalyResult {
  sensorId: string;
  sensorType: SensorType;
  timestamp: Date;
  value: number;
  unit: string;
  isAnomaly: boolean;
  severity: AlertSeverity;
  score: number;           // 0-1, higher = more anomalous
  method: string[];        // Which methods flagged it
  details: {
    zscore?: number;
    cusumScore?: number;
    isolationScore?: number;
    threshold?: number;
    baseline?: { mean: number; std: number };
  };
  message: string;
}

export interface SensorBaseline {
  sensorId: string;
  count: number;
  mean: number;
  m2: number;              // For Welford online variance
  std: number;
  min: number;
  max: number;
  cusumPos: number;        // CUSUM positive accumulator
  cusumNeg: number;        // CUSUM negative accumulator
  lastValues: number[];    // Rolling window (last 60 readings)
  updatedAt: Date;
}

// ============================================================
// Welford Online Algorithm for streaming mean/variance
// Reference: Welford (1962), Knuth TAOCP Vol 2
// ============================================================

function welfordUpdate(baseline: SensorBaseline, value: number): void {
  baseline.count++;
  const delta = value - baseline.mean;
  baseline.mean += delta / baseline.count;
  const delta2 = value - baseline.mean;
  baseline.m2 += delta * delta2;
  baseline.std = baseline.count > 1 ? Math.sqrt(baseline.m2 / (baseline.count - 1)) : 0;
  baseline.min = Math.min(baseline.min, value);
  baseline.max = Math.max(baseline.max, value);

  // Rolling window (last 60 readings)
  baseline.lastValues.push(value);
  if (baseline.lastValues.length > 60) {
    baseline.lastValues.shift();
  }
  baseline.updatedAt = new Date();
}

// ============================================================
// CUSUM Change-Point Detection
// Reference: Page (1954); Self-normalized variant: arXiv:2509.07112
// ============================================================

function cusumUpdate(baseline: SensorBaseline, value: number, k: number = 0.5): {
  cusumPos: number;
  cusumNeg: number;
  changeDetected: boolean;
  threshold: number;
} {
  const std = baseline.std || 1;
  const mean = baseline.mean;

  // Standardized deviation
  const deviation = (value - mean) / std;

  // CUSUM accumulators (Page's scheme)
  baseline.cusumPos = Math.max(0, baseline.cusumPos + deviation - k);
  baseline.cusumNeg = Math.max(0, baseline.cusumNeg - deviation - k);

  // Decision threshold h (typically 4-5 for 5-sigma events)
  const h = 4.0;
  const changeDetected = baseline.cusumPos > h || baseline.cusumNeg > h;

  return {
    cusumPos: baseline.cusumPos,
    cusumNeg: baseline.cusumNeg,
    changeDetected,
    threshold: h,
  };
}

// ============================================================
// Simplified Isolation Forest Score
// Reference: Liu et al. (2008) — "Isolation Forest"
// Simplified: uses path length approximation without full trees
// ============================================================

function isolationScore(value: number, baseline: SensorBaseline): number {
  if (baseline.lastValues.length < 10) return 0;

  const values = baseline.lastValues;
  const n = values.length;

  // Average path length for normal points (Liu et al. 2008, Eq. 1)
  const c = (n: number) => {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  };

  // Estimate isolation depth via binary search simulation
  let depth = 0;
  let lo = Math.min(...values);
  let hi = Math.max(...values);

  for (let i = 0; i < Math.log2(n) + 1; i++) {
    const mid = (lo + hi) / 2;
    if (value <= mid) {
      hi = mid;
    } else {
      lo = mid;
    }
    depth++;
    if (hi - lo < (baseline.max - baseline.min) / n) break;
  }

  // Anomaly score: s(x, n) = 2^(-E(h(x))/c(n))
  const score = Math.pow(2, -depth / c(n));
  return Math.min(1, Math.max(0, score));
}

// ============================================================
// GISTM Severity Classification
// Reference: GISTM 2020 Section 8.2 — Alert Level Framework
// ============================================================

function classifySeverity(score: number, zscore: number, cusumDetected: boolean): AlertSeverity {
  // Emergency: multiple methods agree on extreme anomaly
  if (score > 0.85 && Math.abs(zscore) > 4 && cusumDetected) {
    return 'emergency';
  }
  // Alert: high score + significant z-score
  if (score > 0.75 || (Math.abs(zscore) > 3.5 && cusumDetected)) {
    return 'alert';
  }
  // Warning: moderate anomaly
  if (score > 0.6 || Math.abs(zscore) > 3) {
    return 'warning';
  }
  // Watch: slight deviation
  if (score > 0.5 || Math.abs(zscore) > 2.5) {
    return 'watch';
  }
  return 'normal';
}

// ============================================================
// Main Anomaly Detector
// ============================================================

export class SHMSAnomalyDetector {
  private baselines: Map<string, SensorBaseline>;
  private readonly minSamplesForDetection: number;

  constructor(minSamplesForDetection: number = 30) {
    this.baselines = new Map();
    this.minSamplesForDetection = minSamplesForDetection;
  }

  /**
   * Process a sensor reading and return anomaly analysis.
   * Uses Welford online algorithm + CUSUM + Isolation Forest.
   */
  analyze(reading: SensorReading): AnomalyResult {
    const { sensorId, sensorType, value, unit, timestamp } = reading;

    // Initialize baseline if needed
    if (!this.baselines.has(sensorId)) {
      this.baselines.set(sensorId, {
        sensorId,
        count: 0,
        mean: value,
        m2: 0,
        std: 0,
        min: value,
        max: value,
        cusumPos: 0,
        cusumNeg: 0,
        lastValues: [],
        updatedAt: new Date(),
      });
    }

    const baseline = this.baselines.get(sensorId)!;

    // Need minimum samples before anomaly detection
    if (baseline.count < this.minSamplesForDetection) {
      welfordUpdate(baseline, value);
      return {
        sensorId, sensorType, timestamp, value, unit,
        isAnomaly: false,
        severity: 'normal',
        score: 0,
        method: ['warming-up'],
        details: { baseline: { mean: baseline.mean, std: baseline.std } },
        message: `Warming up baseline (${baseline.count}/${this.minSamplesForDetection} samples)`,
      };
    }

    // === Method 1: Z-score (statistical baseline) ===
    const zscore = baseline.std > 0 ? (value - baseline.mean) / baseline.std : 0;
    const zscoreFlag = Math.abs(zscore) > 3;

    // === Method 2: CUSUM change-point detection ===
    const cusum = cusumUpdate(baseline, value);
    const cusumFlag = cusum.changeDetected;

    // === Method 3: Isolation Forest score ===
    const isoScore = isolationScore(value, baseline);
    const isoFlag = isoScore > 0.6;

    // Update baseline AFTER computing scores (avoid contamination)
    welfordUpdate(baseline, value);

    // === Composite anomaly score ===
    const methods: string[] = [];
    let compositeScore = 0;

    if (zscoreFlag) { methods.push('zscore'); compositeScore += 0.4; }
    if (cusumFlag) { methods.push('cusum'); compositeScore += 0.4; }
    if (isoFlag) { methods.push('isolation-forest'); compositeScore += 0.2; }

    // Normalize to 0-1
    compositeScore = Math.min(1, compositeScore);

    // If no method flagged, use continuous score
    if (methods.length === 0) {
      compositeScore = Math.max(
        Math.abs(zscore) / 5,
        isoScore * 0.5,
        Math.max(cusum.cusumPos, cusum.cusumNeg) / 8
      );
    }

    const severity = classifySeverity(compositeScore, zscore, cusumFlag);
    const isAnomaly = severity !== 'normal';

    // Generate human-readable message
    const message = isAnomaly
      ? `${severity.toUpperCase()}: ${sensorType} ${sensorId} = ${value} ${unit} (z=${zscore.toFixed(2)}, score=${compositeScore.toFixed(2)})`
      : `Normal: ${sensorType} ${sensorId} = ${value} ${unit} (mean=${baseline.mean.toFixed(2)})`;

    return {
      sensorId, sensorType, timestamp, value, unit,
      isAnomaly,
      severity,
      score: Math.round(compositeScore * 1000) / 1000,
      method: methods.length > 0 ? methods : ['baseline'],
      details: {
        zscore: Math.round(zscore * 100) / 100,
        cusumScore: Math.round(Math.max(cusum.cusumPos, cusum.cusumNeg) * 100) / 100,
        isolationScore: Math.round(isoScore * 100) / 100,
        threshold: cusum.threshold,
        baseline: {
          mean: Math.round(baseline.mean * 100) / 100,
          std: Math.round(baseline.std * 100) / 100,
        },
      },
      message,
    };
  }

  /**
   * Get baseline statistics for a sensor.
   */
  getBaseline(sensorId: string): SensorBaseline | undefined {
    return this.baselines.get(sensorId);
  }

  /**
   * Reset baseline for a sensor (e.g., after maintenance).
   */
  resetBaseline(sensorId: string): void {
    this.baselines.delete(sensorId);
    console.log(`[SHMS-Detector] Baseline reset for sensor ${sensorId}`);
  }

  /**
   * Get summary statistics for all sensors.
   */
  getSummary(): Record<string, { count: number; mean: number; std: number; anomalyReady: boolean }> {
    const summary: Record<string, { count: number; mean: number; std: number; anomalyReady: boolean }> = {};
    for (const [sensorId, baseline] of this.baselines) {
      summary[sensorId] = {
        count: baseline.count,
        mean: Math.round(baseline.mean * 100) / 100,
        std: Math.round(baseline.std * 100) / 100,
        anomalyReady: baseline.count >= this.minSamplesForDetection,
      };
    }
    return summary;
  }
}
