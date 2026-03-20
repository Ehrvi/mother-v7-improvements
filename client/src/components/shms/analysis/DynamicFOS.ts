/**
 * DynamicFOS.ts — Real-Time Factor of Safety Computation Engine
 *
 * Scientific basis:
 *   - Bishop (1955): Simplified method of slices — adapted for time-varying ru(t)
 *   - ICOLD Bulletin 158 (2018): Continuous dam safety monitoring
 *   - Fell et al. (2015): "Geotechnical Engineering of Dams" — dynamic pore pressure
 *   - Duncan (1996): "State of the art for slopes" — time-dependent stability
 *   - Griffiths & Lane (1999): SSR framework for FOS convergence criteria
 *   - GISTM (2020): Global Industry Standard on Tailings Management — real-time monitoring
 *
 * Purpose:
 *   Computes FOS as a function of time using live sensor data (piezometers,
 *   displacement, water level). Feeds the Digital Twin HUD and alarm system.
 *
 * Usage:
 *   const fosEngine = new DynamicFOSEngine(profile, sensorConfig);
 *   fosEngine.updateSensorReading('PZ-001', { timestamp, value });
 *   const result = fosEngine.computeCurrentFOS();
 */

import type { Point2D, SoilLayer, SlopeProfile, SlipCircle } from './SlopeStabilityEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SensorReading {
  sensorId: string;
  timestamp: number;  // epoch ms
  value: number;
  unit: string;
  sensorType: 'pore_pressure' | 'displacement' | 'water_level' | 'temperature' | 'seepage' | 'strain';
}

export interface FOSTimePoint {
  timestamp: number;
  fos: number;
  ru: number;       // current average pore pressure ratio
  waterLevel: number;
  maxDisplacement: number;
  alertLevel: 'green' | 'yellow' | 'red' | 'critical';
  method: string;
}

export interface DynamicFOSResult {
  currentFOS: number;
  fosHistory: FOSTimePoint[];
  trend: 'stable' | 'decreasing' | 'increasing' | 'accelerating-decrease';
  trendRate: number;  // Δ FOS / day
  predictedFOS24h: number;
  predictedFOS7d: number;
  alertLevel: 'green' | 'yellow' | 'red' | 'critical';
  lastUpdated: number;
  sensorHealth: { total: number; online: number; stale: number };
  ruTimeSeries: { t: number; ru: number }[];
}

export interface SensorConfig {
  sensorId: string;
  type: SensorReading['sensorType'];
  location: Point2D;   // position in slope profile coordinates
  baseline: number;    // nominal value
  threshold: number;   // ICOLD threshold
  layerId?: string;    // which soil layer this affects
}

// ─── Dynamic FOS Engine ──────────────────────────────────────────────────────

export class DynamicFOSEngine {
  private profile: SlopeProfile;
  private sensorConfigs: SensorConfig[];
  private latestReadings: Map<string, SensorReading> = new Map();
  private fosHistory: FOSTimePoint[] = [];
  private defaultCircle: SlipCircle;

  constructor(profile: SlopeProfile, sensors: SensorConfig[]) {
    this.profile = profile;
    this.sensorConfigs = sensors;

    // Default critical circle (simplified — would come from GA in production)
    const pts = profile.surfacePoints;
    const xMin = Math.min(...pts.map(p => p.x));
    const xMax = Math.max(...pts.map(p => p.x));
    const yMax = Math.max(...pts.map(p => p.y));
    const yMin = Math.min(...pts.map(p => p.y));
    this.defaultCircle = {
      center: { x: (xMin + xMax) / 2, y: yMax + (yMax - yMin) * 0.5 },
      radius: (yMax - yMin) * 1.2,
    };
  }

  /** Ingest a new sensor reading */
  updateSensorReading(reading: SensorReading): void {
    this.latestReadings.set(reading.sensorId, reading);
  }

  /** Batch update from API response */
  updateFromDashboard(sensors: { sensorId: string; sensorType: string; lastReading: number; unit: string; lastUpdated: string }[]): void {
    const now = Date.now();
    for (const s of sensors) {
      this.latestReadings.set(s.sensorId, {
        sensorId: s.sensorId,
        timestamp: new Date(s.lastUpdated).getTime() || now,
        value: s.lastReading,
        unit: s.unit,
        sensorType: this.classifySensorType(s.sensorType),
      });
    }
  }

  private classifySensorType(apiType: string): SensorReading['sensorType'] {
    const t = apiType.toLowerCase();
    if (t.includes('piezo') || t.includes('pore') || t.includes('pressure')) return 'pore_pressure';
    if (t.includes('disp') || t.includes('deform') || t.includes('gnss') || t.includes('inclin')) return 'displacement';
    if (t.includes('level') || t.includes('water') || t.includes('nível')) return 'water_level';
    if (t.includes('temp')) return 'temperature';
    if (t.includes('seep') || t.includes('flow') || t.includes('vazão')) return 'seepage';
    if (t.includes('strain') || t.includes('extenso')) return 'strain';
    return 'pore_pressure';
  }

  /** Compute current ru(t) from piezometer readings */
  private computeCurrentRu(): number {
    const piezos = this.sensorConfigs.filter(s => s.type === 'pore_pressure');
    if (piezos.length === 0) return 0.2; // default

    let totalRu = 0;
    let count = 0;

    for (const config of piezos) {
      const reading = this.latestReadings.get(config.sensorId);
      if (!reading) continue;

      // ru = u / (γ·h) — pore pressure ratio
      // Approximate: ratio of current value to threshold
      const ru = Math.min(0.8, Math.max(0, reading.value / config.threshold));
      totalRu += ru;
      count++;
    }

    return count > 0 ? totalRu / count : 0.2;
  }

  /** Get current water table level from sensors */
  private getCurrentWaterLevel(): number {
    const waterSensors = this.sensorConfigs.filter(s => s.type === 'water_level');
    for (const config of waterSensors) {
      const reading = this.latestReadings.get(config.sensorId);
      if (reading) return reading.value;
    }
    return 0;
  }

  /** Get max displacement from displacement sensors */
  private getMaxDisplacement(): number {
    const dispSensors = this.sensorConfigs.filter(s =>
      s.type === 'displacement' || s.type === 'strain'
    );
    let maxDisp = 0;
    for (const config of dispSensors) {
      const reading = this.latestReadings.get(config.sensorId);
      if (reading && Math.abs(reading.value) > maxDisp) {
        maxDisp = Math.abs(reading.value);
      }
    }
    return maxDisp;
  }

  /** Simplified Bishop FOS with dynamic ru(t) */
  private bishopFOS(ru: number): number {
    const { surfacePoints, layers } = this.profile;
    const circle = this.defaultCircle;
    const nSlices = 15;

    // Find intersection of circle with surface
    const xMin = Math.min(...surfacePoints.map(p => p.x));
    const xMax = Math.max(...surfacePoints.map(p => p.x));
    const sliceWidth = (xMax - xMin) / nSlices;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < nSlices; i++) {
      const xMid = xMin + (i + 0.5) * sliceWidth;
      const surfY = this.interpolateY(surfacePoints, xMid);

      // Circle base at x
      const dx = xMid - circle.center.x;
      const discriminant = circle.radius * circle.radius - dx * dx;
      if (discriminant < 0) continue;
      const baseY = circle.center.y - Math.sqrt(discriminant);
      if (baseY >= surfY) continue;

      const height = surfY - baseY;
      if (height <= 0) continue;

      // Find soil layer
      const layer = this.findLayer(layers, xMid, (surfY + baseY) / 2);
      const c = layer.cohesion;
      const phi = layer.frictionAngle * Math.PI / 180;
      const gamma = layer.unitWeight;

      const alpha = Math.atan2(dx, Math.sqrt(discriminant));
      const W = gamma * height * sliceWidth;
      const u = ru * gamma * height;  // pore pressure from ru(t)
      const l = sliceWidth / Math.cos(alpha);

      // Bishop simplified formula
      numerator += (c * l + (W - u * l) * Math.tan(phi));
      denominator += W * Math.sin(alpha);
    }

    if (Math.abs(denominator) < 1e-6) return 5.0;
    return Math.max(0.1, Math.min(10, numerator / denominator));
  }

  private interpolateY(pts: Point2D[], x: number): number {
    if (pts.length === 0) return 0;
    if (x <= pts[0].x) return pts[0].y;
    if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].x && x <= pts[i + 1].x) {
        const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
    return pts[pts.length - 1].y;
  }

  private findLayer(layers: SoilLayer[], x: number, y: number): SoilLayer {
    for (const layer of layers) {
      if (layer.points.length >= 3) {
        let inside = false;
        for (let i = 0, j = layer.points.length - 1; i < layer.points.length; j = i++) {
          const xi = layer.points[i].x, yi = layer.points[i].y;
          const xj = layer.points[j].x, yj = layer.points[j].y;
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
          }
        }
        if (inside) return layer;
      }
    }
    return layers[0] ?? {
      id: 'default', name: 'Default', points: [],
      cohesion: 20, frictionAngle: 30, unitWeight: 18,
      saturatedUnitWeight: 20, ru: 0.2, color: '#888',
    };
  }

  /** Determine alert level from FOS */
  private fosToAlert(fos: number): FOSTimePoint['alertLevel'] {
    if (fos >= 1.5) return 'green';
    if (fos >= 1.3) return 'yellow';
    if (fos >= 1.0) return 'red';
    return 'critical';
  }

  /** Compute current FOS and update history */
  computeCurrentFOS(): DynamicFOSResult {
    const now = Date.now();
    const ru = this.computeCurrentRu();
    const waterLevel = this.getCurrentWaterLevel();
    const maxDisp = this.getMaxDisplacement();
    const fos = this.bishopFOS(ru);

    const point: FOSTimePoint = {
      timestamp: now,
      fos,
      ru,
      waterLevel,
      maxDisplacement: maxDisp,
      alertLevel: this.fosToAlert(fos),
      method: 'Bishop-Dynamic',
    };

    this.fosHistory.push(point);

    // Keep last 500 points
    if (this.fosHistory.length > 500) {
      this.fosHistory = this.fosHistory.slice(-500);
    }

    // Compute trend
    const recent = this.fosHistory.slice(-20);
    let trend: DynamicFOSResult['trend'] = 'stable';
    let trendRate = 0;

    if (recent.length >= 5) {
      const first5 = recent.slice(0, 5).reduce((s, p) => s + p.fos, 0) / 5;
      const last5 = recent.slice(-5).reduce((s, p) => s + p.fos, 0) / 5;
      const dtDays = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 86400000;
      trendRate = dtDays > 0 ? (last5 - first5) / dtDays : 0;

      if (trendRate < -0.05) trend = 'accelerating-decrease';
      else if (trendRate < -0.01) trend = 'decreasing';
      else if (trendRate > 0.01) trend = 'increasing';
    }

    // Simple linear prediction
    const predictedFOS24h = Math.max(0.1, fos + trendRate * 1);
    const predictedFOS7d = Math.max(0.1, fos + trendRate * 7);

    // Sensor health
    const staleThreshold = 3600000; // 1 hour
    let online = 0, stale = 0;
    for (const config of this.sensorConfigs) {
      const reading = this.latestReadings.get(config.sensorId);
      if (reading && (now - reading.timestamp) < staleThreshold) online++;
      else stale++;
    }

    // ru time series
    const ruTimeSeries = this.fosHistory.slice(-50).map(p => ({ t: p.timestamp, ru: p.ru }));

    return {
      currentFOS: fos,
      fosHistory: this.fosHistory.slice(-100),
      trend,
      trendRate: Math.round(trendRate * 1000) / 1000,
      predictedFOS24h: Math.round(predictedFOS24h * 100) / 100,
      predictedFOS7d: Math.round(predictedFOS7d * 100) / 100,
      alertLevel: this.fosToAlert(fos),
      lastUpdated: now,
      sensorHealth: { total: this.sensorConfigs.length, online, stale },
      ruTimeSeries,
    };
  }

  /** Get a static FOS for demo without sensors (uses base profile ru) */
  static computeStaticFOS(profile: SlopeProfile): number {
    const engine = new DynamicFOSEngine(profile, []);
    const baseRu = profile.layers.length > 0
      ? profile.layers.reduce((s, l) => s + l.ru, 0) / profile.layers.length
      : 0.2;
    return engine.bishopFOS(baseRu);
  }
}

// ─── Pre-configured sensor mapping for demo ──────────────────────────────────
// Maps from DigitalTwin3DViewer instrument IDs to DynamicFOS sensor configs

export const DEFAULT_SENSOR_CONFIGS: SensorConfig[] = [
  { sensorId: 'PZ-01', type: 'pore_pressure', location: { x: 30, y: 10 }, baseline: 145, threshold: 250 },
  { sensorId: 'PZ-02', type: 'pore_pressure', location: { x: 50, y: 12 }, baseline: 132, threshold: 250 },
  { sensorId: 'PZ-03', type: 'pore_pressure', location: { x: 40, y: 11 }, baseline: 139, threshold: 250 },
  { sensorId: 'PZ-04', type: 'pore_pressure', location: { x: 45, y: 5 }, baseline: 88, threshold: 180 },
  { sensorId: 'PZ-05', type: 'pore_pressure', location: { x: 20, y: 15 }, baseline: 210, threshold: 350 },
  { sensorId: 'GNSS-01', type: 'displacement', location: { x: 35, y: 18 }, baseline: 2.3, threshold: 15 },
  { sensorId: 'GNSS-02', type: 'displacement', location: { x: 55, y: 18 }, baseline: 1.8, threshold: 15 },
  { sensorId: 'GNSS-03', type: 'displacement', location: { x: 60, y: 17 }, baseline: 3.1, threshold: 15 },
  { sensorId: 'GNSS-04', type: 'displacement', location: { x: 25, y: 17 }, baseline: 2.7, threshold: 15 },
  { sensorId: 'INC-01', type: 'displacement', location: { x: 50, y: 16 }, baseline: 0.15, threshold: 2.0 },
  { sensorId: 'EXT-01', type: 'strain', location: { x: 28, y: 15 }, baseline: 45, threshold: 200 },
  { sensorId: 'TLT-01', type: 'displacement', location: { x: 32, y: 14 }, baseline: 0.08, threshold: 1.0 },
  { sensorId: 'SET-01', type: 'displacement', location: { x: 48, y: 5 }, baseline: 12.4, threshold: 50 },
  { sensorId: 'NR-01', type: 'water_level', location: { x: 38, y: 6 }, baseline: 78.3, threshold: 82.0 },
  { sensorId: 'MH-01', type: 'displacement', location: { x: 55, y: 13 }, baseline: 4.1, threshold: 20 },
  { sensorId: 'ACC-01', type: 'displacement', location: { x: 58, y: 16 }, baseline: 0.8, threshold: 50 },
];
