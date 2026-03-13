// Module 7 — Dynamic Stability Analysis (SHMS)
// Limit Equilibrium (Bishop Simplified), FEM stubs, Monte Carlo failure probability

export type AnalysisMethod = 'bishop_simplified' | 'janbu_simplified' | 'spencer' | 'morgenstern_price' | 'finite_element';

export interface SlipSurface {
  type: 'circular' | 'non_circular' | 'compound';
  center?: { x: number; y: number };
  radius?: number;
  points?: { x: number; y: number }[];
}

export interface SoilSlice {
  index: number;
  width: number;
  midX: number;
  baseAngle: number;   // degrees
  height: number;
  weight: number;      // kN/m
  poreWaterPressure: number; // kPa
  cohesion: number;    // kPa
  frictionAngle: number; // degrees
}

export interface StabilityModel {
  id: string;
  name: string;
  structureId: string;
  method: AnalysisMethod;
  crossSectionId?: string;
  slipSurface: SlipSurface;
  slices: SoilSlice[];
  linkedPiezometerIds: string[];
  dryFOS?: number;
  saturatedFOS?: number;
  lastRealFOS?: number;
  lastFOSComputedAt?: Date;
  failureProbability?: number;
  scheduledEvaluationCron?: string;
}

export interface StabilityResult {
  modelId: string;
  computedAt: Date;
  fos: number;
  method: AnalysisMethod;
  criticalSlipSurface?: SlipSurface;
  slices: SoilSlice[];
  failureProbability: number;
  converged: boolean;
  iterations: number;
  piezometerReadings?: Map<string, number>;
  warningLevel: 'safe' | 'watch' | 'warning' | 'critical';
}

// ─── Pure functions ────────────────────────────────────────────────────────

/** Bishop Simplified iterative FOS computation */
export function computeFOSBishop(
  slices: SoilSlice[],
  tolerance = 0.001
): { fos: number; converged: boolean; iterations: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;

  // Denominator (independent of FOS)
  const denom = slices.reduce((acc, s) => acc + s.weight * Math.sin(toRad(s.baseAngle)), 0);
  if (Math.abs(denom) < 1e-9) return { fos: 0, converged: false, iterations: 0 };

  let fos = 1.5;
  let converged = false;
  let iterations = 0;
  const MAX_ITER = 200;

  while (iterations < MAX_ITER) {
    let numer = 0;
    for (const s of slices) {
      const alpha = toRad(s.baseAngle);
      const phi = toRad(s.frictionAngle);
      const mAlpha = Math.cos(alpha) + (Math.sin(alpha) * Math.tan(phi)) / fos;
      if (Math.abs(mAlpha) < 1e-9) continue;
      const resistance = (s.cohesion * s.width + (s.weight - s.poreWaterPressure * s.width) * Math.tan(phi)) / mAlpha;
      numer += resistance;
    }
    const fosNew = numer / denom;
    iterations++;
    if (Math.abs(fosNew - fos) < tolerance) {
      fos = fosNew;
      converged = true;
      break;
    }
    fos = fosNew;
  }

  return { fos: Math.max(0, fos), converged, iterations };
}

/** Compute pore water pressure from piezometric head */
export function computePoreWaterPressure(
  piezometerHead: number,
  sliceBaseElevation: number,
  waterDensity = 9.81 // kN/m³
): number {
  const hw = piezometerHead - sliceBaseElevation;
  return hw > 0 ? waterDensity * hw : 0;
}

/** Assign pore pressures to slices using linked piezometer readings */
export function updateSlicesWithPiezometers(
  slices: SoilSlice[],
  piezometerReadings: Map<string, number>,
  linkedPiezometers: string[]
): SoilSlice[] {
  if (linkedPiezometers.length === 0) return slices;

  // Average piezometric head across linked piezometers
  let totalHead = 0;
  let count = 0;
  for (const pid of linkedPiezometers) {
    const h = piezometerReadings.get(pid);
    if (h !== undefined) { totalHead += h; count++; }
  }
  if (count === 0) return slices;
  const avgHead = totalHead / count;

  // Approximate slice base elevation from weight and unit weight (18 kN/m³ default)
  return slices.map((s) => {
    const approxBaseElev = -(s.index * s.width); // relative ordering approximation
    const u = computePoreWaterPressure(avgHead, approxBaseElev);
    return { ...s, poreWaterPressure: u };
  });
}

/** Parse simplified Rocscience .slim format (key=value text) */
export function parseSlimFile(slimContent: string): Partial<StabilityModel> {
  const lines = slimContent.split(/\r?\n/);
  const model: Partial<StabilityModel> = { slices: [], linkedPiezometerIds: [] };
  const slipCenter = { x: 0, y: 0 };
  let radius = 0;
  const slices: SoilSlice[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const val = line.slice(eq + 1).trim();

    switch (key) {
      case 'model_name': model.name = val; break;
      case 'method': {
        const m = val.toLowerCase().replace(/\s+/g, '_') as AnalysisMethod;
        const valid: AnalysisMethod[] = ['bishop_simplified','janbu_simplified','spencer','morgenstern_price','finite_element'];
        model.method = valid.includes(m) ? m : 'bishop_simplified';
        break;
      }
      case 'circle_center_x': slipCenter.x = parseFloat(val); break;
      case 'circle_center_y': slipCenter.y = parseFloat(val); break;
      case 'circle_radius': radius = parseFloat(val); break;
      case 'slice': {
        // format: index,width,midX,baseAngle,height,weight,u,c,phi
        const parts = val.split(',').map(Number);
        if (parts.length >= 9) {
          slices.push({
            index: parts[0], width: parts[1], midX: parts[2],
            baseAngle: parts[3], height: parts[4], weight: parts[5],
            poreWaterPressure: parts[6], cohesion: parts[7], frictionAngle: parts[8],
          });
        }
        break;
      }
    }
  }

  model.slipSurface = { type: 'circular', center: slipCenter, radius };
  if (slices.length > 0) model.slices = slices;
  return model;
}

/** Monte Carlo failure probability (N=1000 simulations) */
export function computeFailureProbabilityMonteCarlo(
  model: StabilityModel,
  variability?: { cohesionCv?: number; frictionCv?: number; poresCv?: number }
): number {
  const cohCv = variability?.cohesionCv ?? 0.15;
  const phiCv = variability?.frictionCv ?? 0.05;
  const uCv = variability?.poresCv ?? 0.10;
  const N = 1000;
  let failures = 0;

  // Box-Muller normal sample
  const randn = () => {
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  for (let i = 0; i < N; i++) {
    const perturbedSlices = model.slices.map((s) => ({
      ...s,
      cohesion: Math.max(0, s.cohesion * (1 + cohCv * randn())),
      frictionAngle: Math.max(1, s.frictionAngle * (1 + phiCv * randn())),
      poreWaterPressure: Math.max(0, s.poreWaterPressure * (1 + uCv * randn())),
    }));
    const { fos } = computeFOSBishop(perturbedSlices);
    if (fos < 1.0) failures++;
  }

  return failures / N;
}

// ─── Warning level helper ──────────────────────────────────────────────────

function fosToWarningLevel(fos: number): StabilityResult['warningLevel'] {
  if (fos > 1.5) return 'safe';
  if (fos >= 1.3) return 'watch';
  if (fos >= 1.1) return 'warning';
  return 'critical';
}

// ─── Engine ────────────────────────────────────────────────────────────────

export class StabilityAnalysisEngine {
  private models = new Map<string, StabilityModel>();
  private results = new Map<string, StabilityResult>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  registerModel(model: StabilityModel): void {
    this.models.set(model.id, model);
  }

  runAnalysis(
    modelId: string,
    piezometerReadings: Map<string, number>
  ): StabilityResult {
    const model = this.models.get(modelId);
    if (!model) throw new Error(`StabilityModel not found: ${modelId}`);

    const slices = updateSlicesWithPiezometers(
      model.slices,
      piezometerReadings,
      model.linkedPiezometerIds
    );

    const { fos, converged, iterations } = computeFOSBishop(slices);
    const failureProbability = computeFailureProbabilityMonteCarlo(
      { ...model, slices },
      { cohesionCv: 0.15, frictionCv: 0.05, poresCv: 0.10 }
    );

    const computedAt = new Date();
    const result: StabilityResult = {
      modelId, computedAt, fos, method: model.method,
      criticalSlipSurface: model.slipSurface, slices, failureProbability,
      converged, iterations, piezometerReadings, warningLevel: fosToWarningLevel(fos),
    };
    this.models.set(modelId, { ...model, lastRealFOS: fos, lastFOSComputedAt: computedAt, failureProbability });

    this.results.set(modelId, result);
    return result;
  }

  getModelsByStructure(structureId: string): StabilityModel[] {
    return [...this.models.values()].filter((m) => m.structureId === structureId);
  }

  getLatestResults(): Map<string, StabilityResult> {
    return new Map(this.results);
  }

  /** Schedule recurring evaluation using approximate cron (interval only) */
  scheduleEvaluation(
    modelId: string,
    cron: string,
    callback: (result: StabilityResult) => void
  ): void {
    // Parse "0 */N * * *" → N hours interval; fallback 6h
    const match = cron.match(/\*\/(\d+)/);
    const hours = match ? parseInt(match[1], 10) : 6;
    const ms = hours * 60 * 60 * 1000;

    const existing = this.timers.get(modelId);
    if (existing) clearInterval(existing);

    const timer = setInterval(() => {
      const model = this.models.get(modelId);
      if (!model) return;
      try {
        const result = this.runAnalysis(modelId, new Map());
        callback(result);
      } catch { /* ignore transient errors */ }
    }, ms);

    this.timers.set(modelId, timer);
  }
}

export const stabilityEngine = new StabilityAnalysisEngine();
