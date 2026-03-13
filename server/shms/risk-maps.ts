/**
 * SHMS Risk Maps — server/shms/risk-maps.ts
 * MOTHER v7 | Module 3
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 §4.3 (2017): Dam safety monitoring visualization & risk zoning
 * - GISTM 2020 §4.3: Geotechnical risk mapping for tailings storage facilities
 * - ABNT NBR 13028:2017: Risk classification criteria for tailings dams
 * - Ray-casting algorithm: Jordan (1987), "A Simple and Fast Algorithm for Ray-Polygon Intersection"
 */

import { createLogger } from '../_core/logger.js';
import { randomUUID } from 'crypto';

const log = createLogger('risk-maps');

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'negligible' | 'low' | 'medium' | 'high' | 'very_high' | 'critical';

export interface GeoPoint { lat: number; lng: number; }

export interface RiskCriteria {
  type: 'sensor_threshold' | 'behavior_class' | 'damage_index' | 'manual';
  sensorId?: string;
  condition: string;   // e.g. "value > 150 kPa"
  weight: number;      // 0-1
  currentMet: boolean;
}

export interface RiskPolygon {
  id: string;
  name: string;
  description: string;
  structureId: string;
  polygon: GeoPoint[];
  riskLevel: RiskLevel;
  riskScore: number;   // 0-100
  criteria: RiskCriteria[];
  associatedSensorIds: string[];
  color: string;       // hex
  opacity: number;     // 0-1
  notes: string[];
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface RiskMapSnapshot {
  id: string;
  structureId: string;
  capturedAt: Date;
  polygons: RiskPolygon[];
  overallRisk: RiskLevel;
  exportedPngBase64?: string;
  notes: string;
}

// ─── ICOLD color palette ──────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  negligible: '#22c55e',
  low:        '#84cc16',
  medium:     '#eab308',
  high:       '#f97316',
  very_high:  '#ef4444',
  critical:   '#dc2626',
};

const RISK_SCORE_THRESHOLDS: [number, RiskLevel][] = [
  [90, 'critical'],
  [70, 'very_high'],
  [50, 'high'],
  [30, 'medium'],
  [10, 'low'],
  [0,  'negligible'],
];

export function getRiskColor(level: RiskLevel): string {
  return RISK_COLORS[level];
}

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Ray-casting algorithm (Jordan 1987) to determine if a point lies inside a polygon.
 * Works in geographic (lat/lng) coordinates — accuracy sufficient for dam-scale areas.
 */
export function detectSensorInPolygon(
  sensorPosition: GeoPoint,
  polygon: GeoPoint[],
): boolean {
  if (polygon.length < 3) return false;
  const { lat: py, lng: px } = sensorPosition;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Parse a simple condition string like "value > 150" or "value between 10 and 20". */
function evaluateCondition(condition: string, value: number): boolean {
  const c = condition.trim().toLowerCase();
  const gt  = c.match(/value\s*>\s*([\d.]+)/);
  const gte = c.match(/value\s*>=\s*([\d.]+)/);
  const lt  = c.match(/value\s*<\s*([\d.]+)/);
  const lte = c.match(/value\s*<=\s*([\d.]+)/);
  const eq  = c.match(/value\s*==?\s*([\d.]+)/);
  const btw = c.match(/value\s+between\s+([\d.]+)\s+and\s+([\d.]+)/);
  if (btw)  return value >= parseFloat(btw[1]) && value <= parseFloat(btw[2]);
  if (gte)  return value >= parseFloat(gte[1]);
  if (lte)  return value <= parseFloat(lte[1]);
  if (gt)   return value > parseFloat(gt[1]);
  if (lt)   return value < parseFloat(lt[1]);
  if (eq)   return value === parseFloat(eq[1]);
  return false;
}

function scoreToLevel(score: number): RiskLevel {
  for (const [threshold, level] of RISK_SCORE_THRESHOLDS) {
    if (score >= threshold) return level;
  }
  return 'negligible';
}

export function computePolygonRisk(
  polygon: RiskPolygon,
  readings: Map<string, number>,
): { level: RiskLevel; score: number; criteriasMet: string[] } {
  const criteriasMet: string[] = [];
  let weightedScore = 0;
  let totalWeight = 0;

  for (const criterion of polygon.criteria) {
    totalWeight += criterion.weight;
    let met = false;
    if (criterion.type === 'manual') {
      met = criterion.currentMet;
    } else if (criterion.sensorId) {
      const val = readings.get(criterion.sensorId);
      if (val !== undefined) {
        met = evaluateCondition(criterion.condition, val);
      }
    } else {
      met = criterion.currentMet;
    }
    if (met) {
      weightedScore += criterion.weight;
      criteriasMet.push(criterion.condition);
    }
  }

  const score = totalWeight > 0
    ? Math.round((weightedScore / totalWeight) * 100)
    : 0;
  const level = scoreToLevel(score);

  log.debug(`Polygon ${polygon.id} risk computed: score=${score} level=${level}`);
  return { level, score, criteriasMet };
}

export function generateRiskMapSnapshot(
  structureId: string,
  polygons: RiskPolygon[],
  readings: Map<string, number>,
): RiskMapSnapshot {
  const evaluated = polygons.map((p) => {
    const { level, score } = computePolygonRisk(p, readings);
    return { ...p, riskLevel: level, riskScore: score };
  });

  const levelOrder: RiskLevel[] = ['negligible', 'low', 'medium', 'high', 'very_high', 'critical'];
  const overallRisk = evaluated.reduce<RiskLevel>((max, p) => {
    return levelOrder.indexOf(p.riskLevel) > levelOrder.indexOf(max)
      ? p.riskLevel
      : max;
  }, 'negligible');

  return {
    id: randomUUID(),
    structureId,
    capturedAt: new Date(),
    polygons: evaluated,
    overallRisk,
    notes: '',
  };
}

export function exportRiskMapAsSVG(
  snapshot: RiskMapSnapshot,
  width = 800,
  height = 600,
): string {
  if (snapshot.polygons.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#888" text-anchor="middle">No polygons</text></svg>`;
  }

  const allPts = snapshot.polygons.flatMap((p) => p.polygon);
  const minLat = Math.min(...allPts.map((p) => p.lat));
  const maxLat = Math.max(...allPts.map((p) => p.lat));
  const minLng = Math.min(...allPts.map((p) => p.lng));
  const maxLng = Math.max(...allPts.map((p) => p.lng));
  const pad = 40;

  const toX = (lng: number) =>
    pad + ((lng - minLng) / (maxLng - minLng || 1)) * (width - pad * 2);
  const toY = (lat: number) =>
    pad + ((maxLat - lat) / (maxLat - minLat || 1)) * (height - pad * 2);

  const polySVGs = snapshot.polygons.map((p) => {
    const pts = p.polygon.map((pt) => `${toX(pt.lng)},${toY(pt.lat)}`).join(' ');
    const color = getRiskColor(p.riskLevel);
    const cx = toX(p.polygon.reduce((s, pt) => s + pt.lng, 0) / p.polygon.length);
    const cy = toY(p.polygon.reduce((s, pt) => s + pt.lat, 0) / p.polygon.length);
    return `<polygon points="${pts}" fill="${color}" fill-opacity="${p.opacity}" stroke="${color}" stroke-width="1.5"/>
<text x="${cx}" y="${cy}" fill="#fff" font-size="11" text-anchor="middle" font-family="sans-serif">${p.name}</text>`;
  });

  const legend = Object.entries(RISK_COLORS).map(([lvl, col], i) => {
    const y = 20 + i * 18;
    return `<rect x="${width - 130}" y="${y}" width="12" height="12" fill="${col}"/>
<text x="${width - 112}" y="${y + 10}" fill="#ccc" font-size="11" font-family="sans-serif">${lvl}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  <text x="${pad}" y="${pad - 10}" fill="#888" font-size="12" font-family="sans-serif">Structure: ${snapshot.structureId} | Overall: ${snapshot.overallRisk}</text>
  ${polySVGs.join('\n  ')}
  ${legend.join('\n  ')}
</svg>`;
}

// ─── Manager class ────────────────────────────────────────────────────────────

export class RiskMapsManager {
  private polygons = new Map<string, RiskPolygon>();

  addPolygon(polygon: Omit<RiskPolygon, 'id' | 'createdAt' | 'updatedAt'>): RiskPolygon {
    const now = new Date();
    const full: RiskPolygon = { ...polygon, id: randomUUID(), createdAt: now, updatedAt: now };
    this.polygons.set(full.id, full);
    log.info(`Polygon added: ${full.id} (${full.name})`);
    return full;
  }

  updatePolygon(id: string, updates: Partial<RiskPolygon>): void {
    const existing = this.polygons.get(id);
    if (!existing) throw new Error(`Polygon ${id} not found`);
    this.polygons.set(id, { ...existing, ...updates, id, updatedAt: new Date() });
  }

  deletePolygon(id: string): void {
    this.polygons.delete(id);
  }

  getPolygonsByStructure(structureId: string): RiskPolygon[] {
    return [...this.polygons.values()].filter((p) => p.structureId === structureId && p.isActive);
  }

  getSensorsInPolygon(
    polygonId: string,
    sensors: { id: string; position: GeoPoint }[],
  ): string[] {
    const polygon = this.polygons.get(polygonId);
    if (!polygon) return [];
    return sensors
      .filter((s) => detectSensorInPolygon(s.position, polygon.polygon))
      .map((s) => s.id);
  }

  computeAllPolygonRisks(
    readings: Map<string, number>,
  ): Map<string, { level: RiskLevel; score: number }> {
    const result = new Map<string, { level: RiskLevel; score: number }>();
    for (const [id, polygon] of this.polygons) {
      const { level, score } = computePolygonRisk(polygon, readings);
      result.set(id, { level, score });
    }
    return result;
  }

  createSnapshot(
    structureId: string,
    readings: Map<string, number>,
    notes = '',
  ): RiskMapSnapshot {
    const polygons = this.getPolygonsByStructure(structureId);
    const snapshot = generateRiskMapSnapshot(structureId, polygons, readings);
    return { ...snapshot, notes };
  }
}

export const riskMapsManager = new RiskMapsManager();
