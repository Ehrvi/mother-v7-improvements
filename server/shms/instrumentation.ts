/**
 * SHMS Instrumentation Manager — server/shms/instrumentation.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 §4.3 (2011): Instrument alarm management and derived parameters.
 * - GISTM 2020 §7: Minimum instrumentation requirements and monitoring groups.
 * - ISO 80000-1:2009 / ISO 80000-4:2019: Quantities, units and linear conversion.
 * - Fortuna et al. (2007), "Soft Sensors for Monitoring and Control" — virtual tags.
 *
 * Third-party integrations (stubs):
 *   Geomos (Leica) — prisma displacement | OREAD (Encardio) — extensometers |
 *   Guardian (IDS GeoRadar) — SAR surface displacement
 */

import { createLogger } from '../_core/logger.js';

const log = createLogger('SHMS-Instrumentation');

// ============================================================
// Types
// ============================================================

export interface AlarmLevel {
  level: 'L1_GREEN' | 'L2_YELLOW' | 'L3_RED';
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'abs_gt';
  description: string;
}

export interface InstrumentTag {
  id: string; name: string; sensorType: string; unit: string; structureId: string;
  nodeId?: string;
  position?: { x: number; y: number; z: number; lat?: number; lng?: number };
  alarmLevels: AlarmLevel[]; group?: string; isVirtual: boolean;
  thirdPartySystem?: 'geomos' | 'oread' | 'guardian' | null;
  calibrationFactor: number; calibrationOffset: number;
  isActive: boolean; createdAt: Date;
}

export interface VirtualTag extends InstrumentTag {
  formula: string;       // e.g. "(PZ-001 + PZ-002) / 2"
  inputTagIds: string[];
  formulaType: 'arithmetic' | 'statistical' | 'temporal_trend';
}

export interface UnitConversion {
  fromUnit: string; toUnit: string;
  factor: number;   // value_to = value_from * factor + offset
  offset: number; magnitude: string;
}

// ============================================================
// Standard geotechnical unit conversions (ISO 80000-4, ASTM E380)
// ============================================================

export const STANDARD_CONVERSIONS: UnitConversion[] = [
  // Pressure (base kPa)
  { fromUnit:'kPa',  toUnit:'MPa',  factor:0.001,         offset:0,         magnitude:'pressure' },
  { fromUnit:'MPa',  toUnit:'kPa',  factor:1000,           offset:0,         magnitude:'pressure' },
  { fromUnit:'kPa',  toUnit:'psi',  factor:0.14503774,     offset:0,         magnitude:'pressure' },
  { fromUnit:'psi',  toUnit:'kPa',  factor:6.89476,        offset:0,         magnitude:'pressure' },
  { fromUnit:'kPa',  toUnit:'bar',  factor:0.01,           offset:0,         magnitude:'pressure' },
  { fromUnit:'bar',  toUnit:'kPa',  factor:100,            offset:0,         magnitude:'pressure' },
  { fromUnit:'kPa',  toUnit:'mH2O', factor:0.10197162,     offset:0,         magnitude:'pressure' },
  { fromUnit:'mH2O', toUnit:'kPa',  factor:9.80665,        offset:0,         magnitude:'pressure' },
  { fromUnit:'MPa',  toUnit:'psi',  factor:145.03774,      offset:0,         magnitude:'pressure' },
  { fromUnit:'psi',  toUnit:'MPa',  factor:0.006894757,    offset:0,         magnitude:'pressure' },
  // Displacement (base mm)
  { fromUnit:'mm',   toUnit:'cm',   factor:0.1,            offset:0,         magnitude:'displacement' },
  { fromUnit:'cm',   toUnit:'mm',   factor:10,             offset:0,         magnitude:'displacement' },
  { fromUnit:'mm',   toUnit:'m',    factor:0.001,          offset:0,         magnitude:'displacement' },
  { fromUnit:'m',    toUnit:'mm',   factor:1000,           offset:0,         magnitude:'displacement' },
  { fromUnit:'mm',   toUnit:'inch', factor:0.03937008,     offset:0,         magnitude:'displacement' },
  { fromUnit:'inch', toUnit:'mm',   factor:25.4,           offset:0,         magnitude:'displacement' },
  { fromUnit:'cm',   toUnit:'m',    factor:0.01,           offset:0,         magnitude:'displacement' },
  { fromUnit:'m',    toUnit:'cm',   factor:100,            offset:0,         magnitude:'displacement' },
  // Angle (base degrees)
  { fromUnit:'deg',  toUnit:'rad',  factor:Math.PI/180,    offset:0,         magnitude:'angle' },
  { fromUnit:'rad',  toUnit:'deg',  factor:180/Math.PI,    offset:0,         magnitude:'angle' },
  { fromUnit:'deg',  toUnit:'mrad', factor:(Math.PI/180)*1000, offset:0,     magnitude:'angle' },
  { fromUnit:'mrad', toUnit:'deg',  factor:(180/Math.PI)/1000, offset:0,     magnitude:'angle' },
  { fromUnit:'rad',  toUnit:'mrad', factor:1000,           offset:0,         magnitude:'angle' },
  { fromUnit:'mrad', toUnit:'rad',  factor:0.001,          offset:0,         magnitude:'angle' },
  // Temperature (base °C)
  { fromUnit:'°C',   toUnit:'°F',   factor:1.8,            offset:32,        magnitude:'temperature' },
  { fromUnit:'°F',   toUnit:'°C',   factor:1/1.8,          offset:-(32/1.8), magnitude:'temperature' },
  { fromUnit:'°C',   toUnit:'K',    factor:1,              offset:273.15,    magnitude:'temperature' },
  { fromUnit:'K',    toUnit:'°C',   factor:1,              offset:-273.15,   magnitude:'temperature' },
  { fromUnit:'°F',   toUnit:'K',    factor:5/9,            offset:255.37222, magnitude:'temperature' },
  { fromUnit:'K',    toUnit:'°F',   factor:9/5,            offset:-459.67,   magnitude:'temperature' },
];

// ============================================================
// Pure functions
// ============================================================

/** Convert a value between units. Returns null if no conversion entry is found. */
export function convertUnit(value: number, from: string, to: string, conversions: UnitConversion[]): number | null {
  if (from === to) return value;
  const c = conversions.find(x => x.fromUnit === from && x.toUnit === to);
  return c ? value * c.factor + c.offset : null;
}

/**
 * Return the highest triggered alarm level, or null if all clear.
 * Priority: L3_RED > L2_YELLOW > L1_GREEN.
 * Reference: GISTM 2020 Table 8.1; ICOLD Bulletin 158 §4.3.1.
 */
export function checkAlarmLevels(value: number, levels: AlarmLevel[]): AlarmLevel | null {
  const pri: Record<AlarmLevel['level'], number> = { L1_GREEN:1, L2_YELLOW:2, L3_RED:3 };
  const triggered = levels.filter(lvl => {
    const v = lvl.operator === 'abs_gt' ? Math.abs(value) : value;
    switch (lvl.operator) {
      case 'gt': return v > lvl.threshold;
      case 'lt': return v < lvl.threshold;
      case 'gte': return v >= lvl.threshold;
      case 'lte': return v <= lvl.threshold;
      case 'abs_gt': return v > lvl.threshold;
    }
  });
  if (!triggered.length) return null;
  return triggered.sort((a, b) => pri[b.level] - pri[a.level])[0]!;
}

/**
 * Evaluate a VirtualTag formula against current readings.
 * Supported: +,-,*,/ (parentheses), sqrt(x), abs(x), avg(t1,t2,...),
 *   max(t1,t2,...), min(t1,t2,...), rate_of_change(tagId) — reads "rate:<tagId>" key.
 * Returns null when any input is missing or the expression is invalid.
 * Reference: Fortuna et al. (2007); ICOLD Bulletin 158 §4.3.2.
 */
export function evaluateVirtualTag(tag: VirtualTag, readings: Map<string, number>): number | null {
  let expr = tag.formula;
  // Replace tag IDs longest-first to avoid partial matches
  for (const id of [...tag.inputTagIds].sort((a, b) => b.length - a.length)) {
    const val = readings.get(id);
    if (val === undefined) return null;
    expr = expr.replaceAll(id, String(val));
  }
  expr = expr.replace(/rate_of_change\(([^)]+)\)/g, (_m, t: string) => {
    const r = readings.get(`rate:${t.trim()}`); return r !== undefined ? String(r) : 'NaN';
  });
  expr = expr.replace(/sqrt\(([^)]+)\)/g, (_m, v: string) => String(Math.sqrt(parseFloat(v))));
  expr = expr.replace(/abs\(([^)]+)\)/g,  (_m, v: string) => String(Math.abs(parseFloat(v))));
  const agg = (fn: (...ns: number[]) => number) => (_m: string, a: string) => {
    const ns = a.split(',').map(s => parseFloat(s.trim()));
    return ns.some(n => isNaN(n)) ? 'NaN' : String(fn(...ns));
  };
  expr = expr.replace(/avg\(([^)]+)\)/g, (_m, a) => {
    const ns = a.split(',').map((s: string) => parseFloat(s.trim()));
    return ns.some((n: number) => isNaN(n)) ? 'NaN' : String(ns.reduce((s: number, n: number) => s + n, 0) / ns.length);
  });
  expr = expr.replace(/max\(([^)]+)\)/g, agg(Math.max));
  expr = expr.replace(/min\(([^)]+)\)/g, agg(Math.min));
  try {
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict"; return (${expr});`)() as number;
    return isFinite(r) ? r : null;
  } catch {
    log.warn('evaluateVirtualTag failed', { id: tag.id, expr });
    return null;
  }
}

// ============================================================
// InstrumentationManager
// ============================================================

export class InstrumentationManager {
  private tags = new Map<string, InstrumentTag>();
  private virtualTags = new Map<string, VirtualTag>();

  registerTag(tag: InstrumentTag): void {
    this.tags.set(tag.id, tag);
    log.info('Tag registered', { id: tag.id, type: tag.sensorType, group: tag.group });
  }

  registerVirtualTag(tag: VirtualTag): void {
    this.virtualTags.set(tag.id, tag);
    this.tags.set(tag.id, tag);
    log.info('Virtual tag registered', { id: tag.id, formula: tag.formula, type: tag.formulaType });
  }

  /**
   * Process a raw reading: apply calibration, evaluate formula (if virtual), check alarms.
   * Reference: ICOLD Bulletin 158 §4.3.1 — calibrated value = raw × factor + offset.
   */
  processReading(
    tagId: string, value: number, readings: Map<string, number>,
  ): { alarmTriggered: AlarmLevel | null; resolvedValue: number } {
    const tag = this.tags.get(tagId);
    if (!tag || !tag.isActive) return { alarmTriggered: null, resolvedValue: value };

    let resolvedValue: number;
    if (tag.isVirtual) {
      const vTag = this.virtualTags.get(tagId);
      if (!vTag) return { alarmTriggered: null, resolvedValue: value };
      const ev = evaluateVirtualTag(vTag, readings);
      if (ev === null) { log.warn('Virtual tag eval failed', { tagId }); return { alarmTriggered: null, resolvedValue: value }; }
      resolvedValue = ev * tag.calibrationFactor + tag.calibrationOffset;
    } else {
      resolvedValue = value * tag.calibrationFactor + tag.calibrationOffset;
    }

    const alarmTriggered = checkAlarmLevels(resolvedValue, tag.alarmLevels);
    if (alarmTriggered) log.warn('Alarm triggered', { tagId, level: alarmTriggered.level, value: resolvedValue });
    return { alarmTriggered, resolvedValue };
  }

  /** Aggregate counts for all active tags in a named monitoring group (GISTM 2020 §7). */
  getGroupStats(group: string): { count: number; activeAlarms: number; avgValue: number } {
    const g = Array.from(this.tags.values()).filter(t => t.group === group && t.isActive);
    return { count: g.length, activeAlarms: 0, avgValue: 0 }; // live data supplied by caller
  }

  getTag(id: string): InstrumentTag | undefined { return this.tags.get(id); }
  getAllTags(): InstrumentTag[] { return Array.from(this.tags.values()); }
  getVirtualTag(id: string): VirtualTag | undefined { return this.virtualTags.get(id); }
}

export const instrumentationManager = new InstrumentationManager();
