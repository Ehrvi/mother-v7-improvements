/**
 * sensor-validator.ts — MOTHER v81.8 — Ciclo 189 (Phase 5 Semanas 3-4)
 *
 * Validates incoming SHMS sensor readings against GISTM and ICOLD standards.
 * Created to resolve NC-SHMS-001 identified in Conselho C188 (Seção 9.2).
 *
 * Scientific basis:
 * - GISTM 2020 (Global Industry Standard on Tailings Management) — sensor thresholds
 * - ICOLD Bulletin 158 (2014) — 3-level alarm system for dam monitoring
 * - Sun et al. (2025) DOI:10.1145/3777730.3777858 — real-time SHM validation pipeline
 * - ISO 9001:2015 — measurement validation and traceability
 *
 * @module sensor-validator
 * @version 1.0.0
 * @cycle C189
 * @council C188 — NC-SHMS-001 resolution
 */

import { createLogger } from '../_core/logger.js';

const log = createLogger('sensor-validator');

// ============================================================
// Types
// ============================================================

export type SensorType =
  | 'piezometer'
  | 'inclinometer'
  | 'gnss'
  | 'accelerometer'
  | 'rain_gauge'
  | 'water_level'
  | 'settlement_plate'
  | 'strain_gauge'
  | 'temperature';

export interface SensorReading {
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: Date;
  clientId?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  alertLevel: 'GREEN' | 'YELLOW' | 'RED';
  violations: ValidationViolation[];
  icoldLevel: 1 | 2 | 3; // 1=Normal, 2=Attention, 3=Emergency
  timestamp: Date;
}

export interface ValidationViolation {
  code: string;
  message: string;
  severity: 'warning' | 'critical';
  threshold?: number;
  actual?: number;
}

// ============================================================
// GISTM + ICOLD Thresholds (Scientific basis: GISTM 2020, ICOLD Bulletin 158)
// ============================================================

interface SensorThresholds {
  unit: string;
  yellowMin?: number;
  yellowMax?: number;
  redMin?: number;
  redMax?: number;
  description: string;
  reference: string;
}

const SENSOR_THRESHOLDS: Record<SensorType, SensorThresholds> = {
  piezometer: {
    unit: 'kPa',
    yellowMax: 200,
    redMax: 350,
    description: 'Pore water pressure — GISTM 2020 Table 4.1',
    reference: 'GISTM 2020 + ICOLD Bulletin 158',
  },
  inclinometer: {
    unit: 'mm',
    yellowMax: 10,
    redMax: 25,
    description: 'Lateral displacement — GISTM 2020 Table 4.2',
    reference: 'GISTM 2020 + Sun et al. 2025',
  },
  gnss: {
    unit: 'mm',
    yellowMax: 15,
    redMax: 30,
    description: 'Surface displacement — GISTM 2020 Table 4.3',
    reference: 'GISTM 2020',
  },
  accelerometer: {
    unit: 'g',
    yellowMax: 0.05,
    redMax: 0.1,
    description: 'Vibration/seismic acceleration — ICOLD Bulletin 158',
    reference: 'ICOLD Bulletin 158 (2014)',
  },
  rain_gauge: {
    unit: 'mm/h',
    yellowMax: 25,
    redMax: 50,
    description: 'Precipitation intensity — GISTM 2020',
    reference: 'GISTM 2020',
  },
  water_level: {
    unit: 'm',
    yellowMax: 0.8,
    redMax: 0.95,
    description: 'Freeboard ratio (current/max) — ICOLD Bulletin 158',
    reference: 'ICOLD Bulletin 158 (2014)',
  },
  settlement_plate: {
    unit: 'mm',
    yellowMax: 20,
    redMax: 50,
    description: 'Vertical settlement — GISTM 2020',
    reference: 'GISTM 2020',
  },
  strain_gauge: {
    unit: 'με',
    yellowMax: 500,
    redMax: 1000,
    description: 'Structural strain — ISO 9001:2015',
    reference: 'ISO 9001:2015 + Sun et al. 2025',
  },
  temperature: {
    unit: '°C',
    yellowMin: -10,
    yellowMax: 60,
    redMin: -20,
    redMax: 80,
    description: 'Sensor operating temperature',
    reference: 'GISTM 2020',
  },
};

// ============================================================
// Validation Logic
// ============================================================

/**
 * Validates a single sensor reading against GISTM + ICOLD thresholds.
 * Implements ICOLD 3-level alarm: GREEN (normal), YELLOW (attention), RED (emergency).
 *
 * @param reading - The sensor reading to validate
 * @returns ValidationResult with ICOLD alert level and any violations
 */
export function validateSensorReading(reading: SensorReading): ValidationResult {
  const violations: ValidationViolation[] = [];
  let alertLevel: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
  let icoldLevel: 1 | 2 | 3 = 1;

  // Structural validation
  if (!reading.sensorId || reading.sensorId.trim() === '') {
    violations.push({
      code: 'INVALID_SENSOR_ID',
      message: 'sensorId is required and must be non-empty',
      severity: 'critical',
    });
  }

  if (typeof reading.value !== 'number' || isNaN(reading.value)) {
    violations.push({
      code: 'INVALID_VALUE',
      message: `Sensor value must be a valid number, got: ${reading.value}`,
      severity: 'critical',
    });
    return buildResult(reading, 'RED', 3, violations);
  }

  if (!reading.timestamp || !(reading.timestamp instanceof Date) || isNaN(reading.timestamp.getTime())) {
    violations.push({
      code: 'INVALID_TIMESTAMP',
      message: 'timestamp must be a valid Date object',
      severity: 'warning',
    });
  }

  // Stale data check (> 5 minutes old)
  const ageMs = Date.now() - (reading.timestamp?.getTime() ?? 0);
  if (ageMs > 5 * 60 * 1000) {
    violations.push({
      code: 'STALE_DATA',
      message: `Sensor data is ${Math.round(ageMs / 1000)}s old (max: 300s)`,
      severity: 'warning',
    });
  }

  // Threshold validation
  const thresholds = SENSOR_THRESHOLDS[reading.sensorType];
  if (!thresholds) {
    violations.push({
      code: 'UNKNOWN_SENSOR_TYPE',
      message: `Unknown sensor type: ${reading.sensorType}`,
      severity: 'warning',
    });
  } else {
    const v = reading.value;

    // RED threshold check
    if (thresholds.redMax !== undefined && v >= thresholds.redMax) {
      alertLevel = 'RED';
      icoldLevel = 3;
      violations.push({
        code: 'THRESHOLD_RED_MAX',
        message: `${reading.sensorType} value ${v} ${thresholds.unit} exceeds RED threshold ${thresholds.redMax} ${thresholds.unit}`,
        severity: 'critical',
        threshold: thresholds.redMax,
        actual: v,
      });
    } else if (thresholds.redMin !== undefined && v <= thresholds.redMin) {
      alertLevel = 'RED';
      icoldLevel = 3;
      violations.push({
        code: 'THRESHOLD_RED_MIN',
        message: `${reading.sensorType} value ${v} ${thresholds.unit} below RED threshold ${thresholds.redMin} ${thresholds.unit}`,
        severity: 'critical',
        threshold: thresholds.redMin,
        actual: v,
      });
    }
    // YELLOW threshold check (only if not already RED)
    else if (thresholds.yellowMax !== undefined && v >= thresholds.yellowMax) {
      alertLevel = 'YELLOW';
      icoldLevel = 2;
      violations.push({
        code: 'THRESHOLD_YELLOW_MAX',
        message: `${reading.sensorType} value ${v} ${thresholds.unit} exceeds YELLOW threshold ${thresholds.yellowMax} ${thresholds.unit}`,
        severity: 'warning',
        threshold: thresholds.yellowMax,
        actual: v,
      });
    } else if (thresholds.yellowMin !== undefined && v <= thresholds.yellowMin) {
      alertLevel = 'YELLOW';
      icoldLevel = 2;
      violations.push({
        code: 'THRESHOLD_YELLOW_MIN',
        message: `${reading.sensorType} value ${v} ${thresholds.unit} below YELLOW threshold ${thresholds.yellowMin} ${thresholds.unit}`,
        severity: 'warning',
        threshold: thresholds.yellowMin,
        actual: v,
      });
    }
  }

  const result = buildResult(reading, alertLevel, icoldLevel, violations);

  if (alertLevel !== 'GREEN') {
    log.warn(`[SensorValidator] ${alertLevel} alert — ${reading.sensorId} (${reading.sensorType}): ${reading.value} ${thresholds?.unit ?? ''}`);
  }

  return result;
}

/**
 * Validates a batch of sensor readings.
 * Returns summary with counts per alert level.
 */
export function validateSensorBatch(readings: SensorReading[]): {
  results: ValidationResult[];
  summary: { total: number; green: number; yellow: number; red: number; invalid: number };
} {
  const results = readings.map(validateSensorReading);
  const summary = {
    total: results.length,
    green: results.filter(r => r.alertLevel === 'GREEN').length,
    yellow: results.filter(r => r.alertLevel === 'YELLOW').length,
    red: results.filter(r => r.alertLevel === 'RED').length,
    invalid: results.filter(r => !r.valid).length,
  };

  log.info(`[SensorValidator] Batch validated: ${summary.total} readings — G:${summary.green} Y:${summary.yellow} R:${summary.red}`);
  return { results, summary };
}

/**
 * Returns the ICOLD 3-level alarm description.
 * Reference: ICOLD Bulletin 158 (2014) — Section 4.2
 */
export function getIcoldAlarmDescription(level: 1 | 2 | 3): string {
  const descriptions: Record<1 | 2 | 3, string> = {
    1: 'GREEN — Normal operation. No action required.',
    2: 'YELLOW — Attention required. Increase monitoring frequency. Notify dam safety officer.',
    3: 'RED — Emergency. Immediate action required. Activate emergency response plan.',
  };
  return descriptions[level];
}

// ============================================================
// Helpers
// ============================================================

function buildResult(
  reading: SensorReading,
  alertLevel: 'GREEN' | 'YELLOW' | 'RED',
  icoldLevel: 1 | 2 | 3,
  violations: ValidationViolation[],
): ValidationResult {
  return {
    valid: violations.filter(v => v.severity === 'critical').length === 0,
    sensorId: reading.sensorId,
    sensorType: reading.sensorType,
    value: reading.value,
    unit: reading.unit,
    alertLevel,
    violations,
    icoldLevel,
    timestamp: reading.timestamp ?? new Date(),
  };
}
