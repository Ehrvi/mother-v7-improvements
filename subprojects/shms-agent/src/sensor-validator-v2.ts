/**
 * sensor-validator-v2.ts — SHMS-Agent Ciclo 120
 * GERADO AUTONOMAMENTE POR MOTHER v80.0 — Ciclo 120
 *
 * Validação estatística rigorosa de leituras de sensores geotécnicos
 * com detecção de outliers, verificação de limiares ICOLD 158 e
 * cálculo de índices de qualidade de dados.
 *
 * Embasamento científico:
 * - ICOLD Bulletin 158 (2014) — Automated Dam Monitoring Systems
 * - ISO 19650 (2018) — Information management using BIM
 * - Grubbs (1969) — Procedures for detecting outlying observations (Technometrics)
 * - Tukey (1977) — Exploratory Data Analysis (IQR method)
 * - Spencer Jr. et al. (2025) — AI for SHM, ScienceDirect
 * - ASTM E178-21 — Standard Practice for Dealing with Outlying Observations
 */

import { createHash } from 'crypto';
import type { SensorReading, SensorType, AlertLevel } from './types';

// ─── ICOLD 158 Threshold Configuration ───────────────────────────────────────

/**
 * Thresholds based on ICOLD Bulletin 158 (2014) Table 3.1
 * and typical geotechnical monitoring practice.
 * Values are configurable per project.
 */
export interface SensorThresholds {
  min: number;         // Physical minimum (below = sensor failure)
  max: number;         // Physical maximum (above = sensor failure)
  warningLow: number;  // Yellow alert lower bound
  warningHigh: number; // Yellow alert upper bound
  alertLow: number;    // Orange alert lower bound
  alertHigh: number;   // Orange alert upper bound
  emergencyLow: number;  // Red alert lower bound
  emergencyHigh: number; // Red alert upper bound
  rateOfChange: number;  // Max acceptable change per hour
}

export const DEFAULT_THRESHOLDS: Record<SensorType, SensorThresholds> = {
  piezometer: {
    min: 0, max: 500,
    warningLow: 0, warningHigh: 150,
    alertLow: 0, alertHigh: 200,
    emergencyLow: 0, emergencyHigh: 250,
    rateOfChange: 20, // kPa/hour
  },
  inclinometer: {
    min: -50, max: 50,
    warningLow: -5, warningHigh: 5,
    alertLow: -10, alertHigh: 10,
    emergencyLow: -20, emergencyHigh: 20,
    rateOfChange: 2, // mm/m per hour
  },
  settlement: {
    min: -200, max: 200,
    warningLow: -20, warningHigh: 20,
    alertLow: -50, alertHigh: 50,
    emergencyLow: -100, emergencyHigh: 100,
    rateOfChange: 5, // mm/hour
  },
  accelerometer: {
    min: -5, max: 5,
    warningLow: -0.1, warningHigh: 0.1,
    alertLow: -0.3, alertHigh: 0.3,
    emergencyLow: -1.0, emergencyHigh: 1.0,
    rateOfChange: 0.5,
  },
  strain_gauge: {
    min: -5000, max: 5000,
    warningLow: -500, warningHigh: 500,
    alertLow: -1000, alertHigh: 1000,
    emergencyLow: -2000, emergencyHigh: 2000,
    rateOfChange: 100,
  },
  water_level: {
    min: 0, max: 200,
    warningLow: 0, warningHigh: 60,
    alertLow: 0, alertHigh: 70,
    emergencyLow: 0, emergencyHigh: 80,
    rateOfChange: 5,
  },
  temperature: {
    min: -20, max: 80,
    warningLow: -5, warningHigh: 45,
    alertLow: -10, alertHigh: 55,
    emergencyLow: -15, emergencyHigh: 65,
    rateOfChange: 10,
  },
  rainfall: {
    min: 0, max: 500,
    warningLow: 0, warningHigh: 50,
    alertLow: 0, alertHigh: 100,
    emergencyLow: 0, emergencyHigh: 200,
    rateOfChange: 50,
  },
};

// ─── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  alertLevel: AlertLevel;
  issues: string[];
  correctedValue?: number;
  qualityScore: number;        // 0-100
  outlierScore: number;        // Z-score or IQR-based
  thresholdViolation?: {
    type: 'warning' | 'alert' | 'emergency' | 'physical';
    bound: 'low' | 'high';
    threshold: number;
    value: number;
  };
  rateOfChangeViolation?: {
    rate: number;
    maxAllowed: number;
    previousValue: number;
    previousTimestamp: string;
  };
  proofHash: string;
}

// ─── Statistical History (for outlier detection) ──────────────────────────────

interface SensorHistory {
  values: number[];
  timestamps: string[];
  mean: number;
  stdDev: number;
  q1: number;
  q3: number;
  iqr: number;
  lastUpdated: string;
}

// ─── SensorValidatorV2 Class ──────────────────────────────────────────────────

export class SensorValidatorV2 {
  private histories = new Map<string, SensorHistory>();
  private thresholds: Map<string, SensorThresholds>;
  private windowSize: number;

  constructor(
    customThresholds?: Map<string, SensorThresholds>,
    windowSize = 100
  ) {
    this.thresholds = customThresholds ?? new Map();
    this.windowSize = windowSize;
  }

  /**
   * Set custom thresholds for a specific sensor.
   */
  setThresholds(sensorId: string, thresholds: SensorThresholds): void {
    this.thresholds.set(sensorId, thresholds);
  }

  /**
   * Validate a sensor reading using:
   * 1. Physical range check (sensor failure detection)
   * 2. ICOLD 158 threshold classification
   * 3. Statistical outlier detection (Tukey IQR method)
   * 4. Rate of change validation
   */
  validate(reading: SensorReading): ValidationResult {
    const issues: string[] = [];
    let alertLevel: AlertLevel = 'NORMAL';
    let qualityScore = 100;
    let outlierScore = 0;
    let thresholdViolation: ValidationResult['thresholdViolation'];
    let rateOfChangeViolation: ValidationResult['rateOfChangeViolation'];

    const thresholds = this.thresholds.get(reading.sensorId) ??
                       DEFAULT_THRESHOLDS[reading.sensorType];

    // ── 1. Physical range check ──────────────────────────────────────────────
    if (reading.value < thresholds.min || reading.value > thresholds.max) {
      issues.push(`Value ${reading.value} outside physical range [${thresholds.min}, ${thresholds.max}]`);
      qualityScore -= 50;
      alertLevel = 'CRITICAL';
      thresholdViolation = {
        type: 'physical',
        bound: reading.value < thresholds.min ? 'low' : 'high',
        threshold: reading.value < thresholds.min ? thresholds.min : thresholds.max,
        value: reading.value,
      };
    }

    // ── 2. ICOLD 158 threshold classification ────────────────────────────────
    if (alertLevel !== 'CRITICAL') {
      if (reading.value < thresholds.emergencyLow || reading.value > thresholds.emergencyHigh) {
        alertLevel = 'EMERGENCY';
        thresholdViolation = {
          type: 'emergency',
          bound: reading.value < thresholds.emergencyLow ? 'low' : 'high',
          threshold: reading.value < thresholds.emergencyLow ? thresholds.emergencyLow : thresholds.emergencyHigh,
          value: reading.value,
        };
        issues.push(`EMERGENCY threshold exceeded: ${reading.value}`);
        qualityScore -= 10;
      } else if (reading.value < thresholds.alertLow || reading.value > thresholds.alertHigh) {
        alertLevel = 'CRITICAL';
        thresholdViolation = {
          type: 'alert',
          bound: reading.value < thresholds.alertLow ? 'low' : 'high',
          threshold: reading.value < thresholds.alertLow ? thresholds.alertLow : thresholds.alertHigh,
          value: reading.value,
        };
        issues.push(`ALERT threshold exceeded: ${reading.value}`);
        qualityScore -= 5;
      } else if (reading.value < thresholds.warningLow || reading.value > thresholds.warningHigh) {
        alertLevel = 'WARNING';
        thresholdViolation = {
          type: 'warning',
          bound: reading.value < thresholds.warningLow ? 'low' : 'high',
          threshold: reading.value < thresholds.warningLow ? thresholds.warningLow : thresholds.warningHigh,
          value: reading.value,
        };
        issues.push(`WARNING threshold exceeded: ${reading.value}`);
      }
    }

    // ── 3. Statistical outlier detection (Tukey IQR method) ─────────────────
    const history = this.getOrCreateHistory(reading.sensorId);
    if (history.values.length >= 10) {
      // IQR method: outlier if value < Q1 - 1.5*IQR or > Q3 + 1.5*IQR
      const lowerFence = history.q1 - 1.5 * history.iqr;
      const upperFence = history.q3 + 1.5 * history.iqr;

      if (reading.value < lowerFence || reading.value > upperFence) {
        // Z-score for magnitude
        const zScore = history.stdDev > 0
          ? Math.abs(reading.value - history.mean) / history.stdDev
          : 0;
        outlierScore = zScore;

        if (zScore > 4) {
          issues.push(`Extreme outlier detected (z=${zScore.toFixed(2)}): ${reading.value}`);
          qualityScore -= 30;
          if (alertLevel === 'NORMAL') alertLevel = 'WARNING';
        } else if (zScore > 3) {
          issues.push(`Outlier detected (z=${zScore.toFixed(2)}): ${reading.value}`);
          qualityScore -= 15;
        } else {
          issues.push(`Mild outlier (IQR method): ${reading.value}`);
          qualityScore -= 5;
        }
      }
    }

    // ── 4. Rate of change validation ────────────────────────────────────────
    if (history.values.length > 0 && history.timestamps.length > 0) {
      const prevValue = history.values[history.values.length - 1]!;
      const prevTimestamp = history.timestamps[history.timestamps.length - 1]!;
      const hoursDiff = (new Date(reading.timestamp).getTime() - new Date(prevTimestamp).getTime()) / 3_600_000;

      if (hoursDiff > 0 && hoursDiff < 24) {
        const ratePerHour = Math.abs(reading.value - prevValue) / hoursDiff;
        if (ratePerHour > thresholds.rateOfChange) {
          rateOfChangeViolation = {
            rate: ratePerHour,
            maxAllowed: thresholds.rateOfChange,
            previousValue: prevValue,
            previousTimestamp: prevTimestamp,
          };
          issues.push(`Rate of change exceeded: ${ratePerHour.toFixed(2)}/h > ${thresholds.rateOfChange}/h`);
          qualityScore -= 20;
          if (alertLevel === 'NORMAL') alertLevel = 'WARNING';
        }
      }
    }

    // ── 5. Quality score from reading metadata ───────────────────────────────
    if (reading.quality !== undefined && reading.quality < 80) {
      qualityScore -= Math.round((80 - reading.quality) * 0.5);
      issues.push(`Low quality signal: ${reading.quality}%`);
    }

    // Update history
    this.updateHistory(reading.sensorId, reading.value, reading.timestamp);

    // Generate proof hash
    const proofHash = createHash('sha256').update(JSON.stringify({
      sensorId: reading.sensorId,
      value: reading.value,
      timestamp: reading.timestamp,
      alertLevel,
      qualityScore: Math.max(0, qualityScore),
      issues,
    })).digest('hex');

    return {
      valid: alertLevel !== 'CRITICAL' && alertLevel !== 'EMERGENCY' && qualityScore > 20,
      alertLevel,
      issues,
      qualityScore: Math.max(0, Math.min(100, qualityScore)),
      outlierScore,
      thresholdViolation,
      rateOfChangeViolation,
      proofHash,
    };
  }

  private getOrCreateHistory(sensorId: string): SensorHistory {
    if (!this.histories.has(sensorId)) {
      this.histories.set(sensorId, {
        values: [],
        timestamps: [],
        mean: 0,
        stdDev: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
        lastUpdated: new Date().toISOString(),
      });
    }
    return this.histories.get(sensorId)!;
  }

  private updateHistory(sensorId: string, value: number, timestamp: string): void {
    const history = this.getOrCreateHistory(sensorId);
    history.values.push(value);
    history.timestamps.push(timestamp);

    // Keep only the last windowSize values
    if (history.values.length > this.windowSize) {
      history.values.shift();
      history.timestamps.shift();
    }

    // Recalculate statistics
    const n = history.values.length;
    if (n > 0) {
      history.mean = history.values.reduce((a, b) => a + b, 0) / n;
      const variance = history.values.reduce((acc, v) => acc + Math.pow(v - history.mean, 2), 0) / n;
      history.stdDev = Math.sqrt(variance);

      // IQR calculation
      const sorted = [...history.values].sort((a, b) => a - b);
      history.q1 = sorted[Math.floor(n * 0.25)] ?? history.mean;
      history.q3 = sorted[Math.floor(n * 0.75)] ?? history.mean;
      history.iqr = history.q3 - history.q1;
    }

    history.lastUpdated = new Date().toISOString();
  }

  getHistoryStats(sensorId: string): SensorHistory | null {
    return this.histories.get(sensorId) ?? null;
  }

  getSensorCount(): number {
    return this.histories.size;
  }
}
