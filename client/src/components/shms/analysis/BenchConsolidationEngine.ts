/**
 * BenchConsolidationEngine.ts — SOTA Bench Consolidation with DGM
 *
 * Scientific basis:
 * - Read & Stacey (2009): "Guidelines for Open Pit Slope Design" — DAC criteria
 * - Call & Savely (1990): Modified Ritchie Criterion — catchment adequacy
 * - Ryan & Call (1992): Spill radius for berm design
 * - Sjöberg (1996): Cumulative fatigue model for face angle degradation
 * - Priest & Brown (1983): Probabilistic slope design
 * - MOTHER DGM: Darwin Golden Machine — evolutionary optimization of bench parameters
 *
 * Architecture:
 *   BenchDesign (genotype) → fitness(FOS, PF, catchment, volume) → DGM evolves → optimal design
 */

import type { SlopeProfile, SoilLayer, Point2D, SlipCircle, StabilityResult, IntersliceFunction } from './SlopeStabilityEngine';
import { bishopSimplified, spencerMethod, morgensternPrice, generateSlices } from './SlopeStabilityEngine';

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BenchDesign {
  benchHeight: number;      // H — individual bench height (m)
  bermWidth: number;        // W — berm/catch bench width (m)
  faceAngle: number;        // α — bench face angle (degrees)
  numBenches: number;       // N — number of benches to consolidate
  overallHeight: number;    // H_total = N × H (computed)
  interRampAngle: number;   // θ_ir (computed, degrees)
  overallAngle: number;     // θ_oa (computed, degrees)
}

export interface BenchSoilParams {
  cohesion: number;         // c' (kPa)
  frictionAngle: number;    // φ' (degrees)
  unitWeight: number;       // γ (kN/m³)
  saturatedUnitWeight: number;
  ru: number;               // pore pressure ratio
  cohesionStdDev: number;
  frictionStdDev: number;
  unitWeightStdDev: number;
}

/** DAC — Design Acceptance Criteria (Read & Stacey 2009, Table 10.2) */
export interface DACResult {
  scale: 'bench' | 'inter-ramp' | 'overall';
  fos: number;
  fosBishop: number;
  fosSpencer: number;
  fosMorgensternPrice: number;
  minFOS: number;           // DAC minimum
  maxPF: number;            // DAC max probability of failure (%)
  pass: boolean;
  circle: SlipCircle;
  sliceCount: number;
}

/** Catchment adequacy — Modified Ritchie Criterion */
export interface CatchmentResult {
  bermWidth: number;        // actual berm W (m)
  requiredWidth: number;    // Ritchie minimum (m)
  spillRadius: number;      // Ryan & Call spill radius (m)
  adequate: boolean;
  retentionCapacity: number; // % of rockfall retained
}

/** Full consolidation analysis result */
export interface ConsolidationResult {
  design: BenchDesign;
  dac: DACResult[];         // 3 scales: bench, inter-ramp, overall
  catchment: CatchmentResult;
  volume: number;           // m³ of rock in consolidated slope per meter run
  overallPass: boolean;
  hash: string;             // SHA-256 audit hash
  timestamp: number;
}

/** DGM evolutionary result */
export interface DGMEvolutionResult {
  bestDesign: ConsolidationResult;
  population: ConsolidationResult[];
  generations: number;
  convergenceHistory: { gen: number; bestFitness: number; avgFitness: number; bestFOS: number }[];
  paretoFront: ConsolidationResult[];  // non-dominated designs (FOS vs volume)
  elapsedMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DAC THRESHOLDS (Read & Stacey 2009, Table 10.2)
// ═══════════════════════════════════════════════════════════════════════════════

const DAC_CRITERIA: Record<string, { minFOS: number; maxPF: number }> = {
  'bench':      { minFOS: 1.1,  maxPF: 25 },
  'inter-ramp': { minFOS: 1.2,  maxPF: 10 },
  'overall':    { minFOS: 1.3,  maxPF: 3  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  GEOMETRY
// ═══════════════════════════════════════════════════════════════════════════════

/** Compute inter-ramp angle from bench parameters */
export function computeInterRampAngle(H: number, W: number, alpha: number, N: number): number {
  const tanAlpha = Math.tan(alpha * Math.PI / 180);
  if (tanAlpha === 0) return 0;
  const totalRise = N * H;
  const totalRun = N * H / tanAlpha + (N - 1) * W;
  return Math.atan2(totalRise, totalRun) * 180 / Math.PI;
}

/** Generate slope profile from bench parameters */
export function generateBenchProfile(design: BenchDesign, baseX: number = 0, baseY: number = 0): Point2D[] {
  const { benchHeight, bermWidth, faceAngle, numBenches } = design;
  const faceRun = benchHeight / Math.tan(faceAngle * Math.PI / 180);
  const points: Point2D[] = [{ x: baseX, y: baseY }];

  let x = baseX;
  let y = baseY;

  for (let i = 0; i < numBenches; i++) {
    // Bench face (inclined)
    x += faceRun;
    y += benchHeight;
    points.push({ x, y });

    // Berm (horizontal) — except after last bench
    if (i < numBenches - 1) {
      x += bermWidth;
      points.push({ x, y });
    }
  }

  // Extend crest horizontally
  points.push({ x: x + 20, y });

  return points;
}

/** Create SlopeProfile from bench parameters for LEM analysis */
export function createSlopeProfile(design: BenchDesign, soil: BenchSoilParams): SlopeProfile {
  const surface = generateBenchProfile(design);
  const maxX = Math.max(...surface.map(p => p.x)) + 10;
  const maxY = Math.max(...surface.map(p => p.y));

  const layer: SoilLayer = {
    id: 'bench-soil',
    name: 'Bench Material',
    color: '#8B7355',
    points: [
      { x: surface[0].x - 5, y: surface[0].y },
      ...surface,
      { x: maxX, y: maxY },
      { x: maxX, y: surface[0].y - 10 },
      { x: surface[0].x - 5, y: surface[0].y - 10 },
    ],
    cohesion: soil.cohesion,
    frictionAngle: soil.frictionAngle,
    unitWeight: soil.unitWeight,
    saturatedUnitWeight: soil.saturatedUnitWeight,
    ru: soil.ru,
    cohesionStdDev: soil.cohesionStdDev,
    frictionStdDev: soil.frictionStdDev,
    unitWeightStdDev: soil.unitWeightStdDev,
  };

  return { surfacePoints: surface, layers: [layer] };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CATCHMENT — Modified Ritchie Criterion (Call & Savely 1990)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Modified Ritchie Criterion for catch bench adequacy
 * W_min = 0.2 × H + 2.0 (for H < 12m)
 * W_min = 0.2 × H + 4.5 (for H ≥ 12m)
 * Spill radius (Ryan & Call 1992): R = 0.35 × H^0.83
 */
export function assessCatchment(benchHeight: number, bermWidth: number): CatchmentResult {
  const requiredWidth = benchHeight < 12
    ? 0.2 * benchHeight + 2.0
    : 0.2 * benchHeight + 4.5;

  const spillRadius = 0.35 * Math.pow(benchHeight, 0.83);
  const adequate = bermWidth >= requiredWidth;
  const retentionCapacity = Math.min(100, (bermWidth / requiredWidth) * 100);

  return { bermWidth, requiredWidth, spillRadius, adequate, retentionCapacity };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DAC ANALYSIS — 3-scale FOS (Read & Stacey 2009)
// ═══════════════════════════════════════════════════════════════════════════════

function findBestCircle(
  profile: SlopeProfile,
  xRange: [number, number],
  yRange: [number, number],
  rRange: [number, number],
  gridSize: number = 5
): SlipCircle {
  let bestFOS = 999;
  let bestCircle: SlipCircle = { center: { x: 0, y: 0 }, radius: 10 };

  const dx = (xRange[1] - xRange[0]) / gridSize;
  const dy = (yRange[1] - yRange[0]) / gridSize;
  const dr = (rRange[1] - rRange[0]) / gridSize;

  for (let ix = 0; ix <= gridSize; ix++) {
    for (let iy = 0; iy <= gridSize; iy++) {
      for (let ir = 0; ir <= gridSize; ir++) {
        const circle: SlipCircle = {
          center: { x: xRange[0] + ix * dx, y: yRange[0] + iy * dy },
          radius: rRange[0] + ir * dr,
        };
        const result = bishopSimplified(profile, circle, 20);
        if (result.factorOfSafety > 0.1 && result.factorOfSafety < bestFOS && result.slices.length >= 3) {
          bestFOS = result.factorOfSafety;
          bestCircle = circle;
        }
      }
    }
  }
  return bestCircle;
}

export function analyzeDACScales(design: BenchDesign, soil: BenchSoilParams): DACResult[] {
  const profile = createSlopeProfile(design, soil);
  const surface = profile.surfacePoints;
  const toe = surface[0];
  const crest = surface[surface.length - 2]; // last real point before extension
  const midX = (toe.x + crest.x) / 2;
  const H = design.overallHeight;

  const results: DACResult[] = [];

  // --- Bench scale (single bench) ---
  const benchR = design.benchHeight * 1.2;
  const benchCircle = findBestCircle(
    profile,
    [toe.x, toe.x + design.benchHeight / Math.tan(design.faceAngle * Math.PI / 180) + 5],
    [toe.y + design.benchHeight * 0.5, toe.y + design.benchHeight * 2],
    [benchR * 0.5, benchR * 1.5],
    4
  );

  const benchBishop = bishopSimplified(profile, benchCircle, 20);
  const benchSpencer = spencerMethod(profile, benchCircle, 20);
  const benchMP = morgensternPrice(profile, benchCircle, 'half-sine', 20);
  const benchFOS = Math.min(benchBishop.factorOfSafety, benchSpencer.factorOfSafety, benchMP.factorOfSafety);

  results.push({
    scale: 'bench',
    fos: benchFOS,
    fosBishop: benchBishop.factorOfSafety,
    fosSpencer: benchSpencer.factorOfSafety,
    fosMorgensternPrice: benchMP.factorOfSafety,
    minFOS: DAC_CRITERIA.bench.minFOS,
    maxPF: DAC_CRITERIA.bench.maxPF,
    pass: benchFOS >= DAC_CRITERIA.bench.minFOS,
    circle: benchCircle,
    sliceCount: benchBishop.slices.length,
  });

  // --- Inter-ramp scale ---
  const irR = H * 0.8;
  const irCircle = findBestCircle(
    profile,
    [toe.x - 5, midX + 5],
    [crest.y * 0.6, crest.y * 1.5],
    [irR * 0.6, irR * 1.5],
    4
  );

  const irBishop = bishopSimplified(profile, irCircle, 25);
  const irSpencer = spencerMethod(profile, irCircle, 25);
  const irMP = morgensternPrice(profile, irCircle, 'half-sine', 25);
  const irFOS = Math.min(irBishop.factorOfSafety, irSpencer.factorOfSafety, irMP.factorOfSafety);

  results.push({
    scale: 'inter-ramp',
    fos: irFOS,
    fosBishop: irBishop.factorOfSafety,
    fosSpencer: irSpencer.factorOfSafety,
    fosMorgensternPrice: irMP.factorOfSafety,
    minFOS: DAC_CRITERIA['inter-ramp'].minFOS,
    maxPF: DAC_CRITERIA['inter-ramp'].maxPF,
    pass: irFOS >= DAC_CRITERIA['inter-ramp'].minFOS,
    circle: irCircle,
    sliceCount: irBishop.slices.length,
  });

  // --- Overall scale ---
  const oaR = H * 1.2;
  const oaCircle = findBestCircle(
    profile,
    [toe.x - 10, toe.x + 5],
    [crest.y * 0.8, crest.y * 2.0],
    [oaR * 0.6, oaR * 1.8],
    5
  );

  const oaBishop = bishopSimplified(profile, oaCircle, 30);
  const oaSpencer = spencerMethod(profile, oaCircle, 30);
  const oaMP = morgensternPrice(profile, oaCircle, 'half-sine', 30);
  const oaFOS = Math.min(oaBishop.factorOfSafety, oaSpencer.factorOfSafety, oaMP.factorOfSafety);

  results.push({
    scale: 'overall',
    fos: oaFOS,
    fosBishop: oaBishop.factorOfSafety,
    fosSpencer: oaSpencer.factorOfSafety,
    fosMorgensternPrice: oaMP.factorOfSafety,
    minFOS: DAC_CRITERIA.overall.minFOS,
    maxPF: DAC_CRITERIA.overall.maxPF,
    pass: oaFOS >= DAC_CRITERIA.overall.minFOS,
    circle: oaCircle,
    sliceCount: oaBishop.slices.length,
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HASH — SHA-256 audit trail
// ═══════════════════════════════════════════════════════════════════════════════

async function computeHash(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple hash for environments without SubtleCrypto
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FULL CONSOLIDATION ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeConsolidation(
  H: number, W: number, alpha: number, N: number, soil: BenchSoilParams
): Promise<ConsolidationResult> {
  const interRampAngle = computeInterRampAngle(H, W, alpha, N);
  const overallHeight = N * H;

  const design: BenchDesign = {
    benchHeight: H, bermWidth: W, faceAngle: alpha, numBenches: N,
    overallHeight, interRampAngle, overallAngle: interRampAngle, // simplified
  };

  const dac = analyzeDACScales(design, soil);
  const catchment = assessCatchment(H, W);

  // Volume per meter run (trapezoidal approximation)
  const faceRun = H / Math.tan(alpha * Math.PI / 180);
  const totalRun = N * faceRun + (N - 1) * W;
  const volume = 0.5 * overallHeight * totalRun;

  const overallPass = dac.every(d => d.pass) && catchment.adequate;
  const timestamp = Date.now();

  const hashData = JSON.stringify({ design, dac: dac.map(d => d.fos), catchment: catchment.adequate, timestamp });
  const hash = await computeHash(hashData);

  return { design, dac, catchment, volume, overallPass, hash, timestamp };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DGM — DARWIN GOLDEN MACHINE — Evolutionary Bench Optimization
// ═══════════════════════════════════════════════════════════════════════════════

export interface DGMConstraints {
  hRange: [number, number];       // bench height range (m)
  wRange: [number, number];       // berm width range (m)
  alphaRange: [number, number];   // face angle range (degrees)
  nRange: [number, number];       // number of benches range
  minFOS: number;                 // minimum acceptable FOS (overall)
  targetFOS?: number;             // target FOS for fitness bonus
}

const DEFAULT_CONSTRAINTS: DGMConstraints = {
  hRange: [8, 25],
  wRange: [5, 15],
  alphaRange: [50, 80],
  nRange: [2, 8],
  minFOS: 1.3,
  targetFOS: 1.5,
};

type Individual = { H: number; W: number; alpha: number; N: number; fitness: number; result?: ConsolidationResult };

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function fitnessFunction(result: ConsolidationResult, constraints: DGMConstraints): number {
  const minFOS = Math.min(...result.dac.map(d => d.fos));
  const catchmentOk = result.catchment.adequate;

  // Penalty for not meeting DAC
  let penalty = 0;
  for (const d of result.dac) {
    if (d.fos < d.minFOS) penalty += (d.minFOS - d.fos) * 10;
  }
  if (!catchmentOk) penalty += 3;

  // Reward: higher FOS is better, but diminishing returns above target
  const target = constraints.targetFOS ?? 1.5;
  const fosReward = minFOS >= target
    ? 1.0 + 0.1 * (minFOS - target) // small bonus above target
    : minFOS / target;               // linear up to target

  // Efficiency: less volume = better (normalized)
  const volumeNorm = 1.0 / (1 + result.volume * 0.0001);

  return Math.max(0, fosReward * 5 + volumeNorm * 2 - penalty);
}

/**
 * DGM Evolutionary Optimizer — evolves optimal bench consolidation design
 * Uses real genetic algorithm with tournament selection, crossover, mutation
 */
export async function dgmOptimizeBenchDesign(
  soil: BenchSoilParams,
  constraints: DGMConstraints = DEFAULT_CONSTRAINTS,
  popSize: number = 60,
  generations: number = 80,
  seed: number = 42
): Promise<DGMEvolutionResult> {
  const rng = seededRandom(seed);
  const startTime = performance.now();
  const { hRange, wRange, alphaRange, nRange } = constraints;

  // Random individual within constraints
  function randomIndividual(): Individual {
    return {
      H: hRange[0] + rng() * (hRange[1] - hRange[0]),
      W: wRange[0] + rng() * (wRange[1] - wRange[0]),
      alpha: alphaRange[0] + rng() * (alphaRange[1] - alphaRange[0]),
      N: Math.round(nRange[0] + rng() * (nRange[1] - nRange[0])),
      fitness: 0,
    };
  }

  // Clamp to constraints
  function clamp(ind: Individual): Individual {
    return {
      H: Math.max(hRange[0], Math.min(hRange[1], ind.H)),
      W: Math.max(wRange[0], Math.min(wRange[1], ind.W)),
      alpha: Math.max(alphaRange[0], Math.min(alphaRange[1], ind.alpha)),
      N: Math.max(nRange[0], Math.min(nRange[1], Math.round(ind.N))),
      fitness: 0,
    };
  }

  // Tournament selection
  function tournament(pop: Individual[], k: number = 3): Individual {
    let best = pop[Math.floor(rng() * pop.length)];
    for (let i = 1; i < k; i++) {
      const challenger = pop[Math.floor(rng() * pop.length)];
      if (challenger.fitness > best.fitness) best = challenger;
    }
    return best;
  }

  // BLX-α crossover
  function crossover(a: Individual, b: Individual): Individual {
    const alpha2 = 0.3;
    function blx(v1: number, v2: number): number {
      const lo = Math.min(v1, v2);
      const hi = Math.max(v1, v2);
      const d = hi - lo;
      return lo - alpha2 * d + rng() * (1 + 2 * alpha2) * d;
    }
    return clamp({
      H: blx(a.H, b.H), W: blx(a.W, b.W),
      alpha: blx(a.alpha, b.alpha), N: Math.round(blx(a.N, b.N)),
      fitness: 0,
    });
  }

  // Gaussian mutation
  function mutate(ind: Individual, sigma: number = 0.1): Individual {
    function gauss(val: number, range: number): number {
      const u1 = rng(), u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
      return val + z * sigma * range;
    }
    return clamp({
      H: gauss(ind.H, hRange[1] - hRange[0]),
      W: gauss(ind.W, wRange[1] - wRange[0]),
      alpha: gauss(ind.alpha, alphaRange[1] - alphaRange[0]),
      N: Math.round(gauss(ind.N, nRange[1] - nRange[0])),
      fitness: 0,
    });
  }

  // Initialize population
  let population: Individual[] = Array.from({ length: popSize }, randomIndividual);

  const convergenceHistory: DGMEvolutionResult['convergenceHistory'] = [];

  // Evaluate
  async function evaluate(pop: Individual[]): Promise<void> {
    for (const ind of pop) {
      const result = await analyzeConsolidation(ind.H, ind.W, ind.alpha, ind.N, soil);
      ind.fitness = fitnessFunction(result, constraints);
      ind.result = result;
    }
  }

  await evaluate(population);

  // Evolve
  for (let gen = 0; gen < generations; gen++) {
    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);

    // Record history
    const avgFit = population.reduce((s, p) => s + p.fitness, 0) / popSize;
    convergenceHistory.push({
      gen,
      bestFitness: population[0].fitness,
      avgFitness: avgFit,
      bestFOS: population[0].result ? Math.min(...population[0].result.dac.map(d => d.fos)) : 0,
    });

    // Elitism: keep top 10%
    const eliteCount = Math.max(2, Math.floor(popSize * 0.1));
    const newPop: Individual[] = population.slice(0, eliteCount);

    // Fill rest with crossover + mutation
    while (newPop.length < popSize) {
      const parent1 = tournament(population);
      const parent2 = tournament(population);
      let child = crossover(parent1, parent2);
      if (rng() < 0.3) child = mutate(child, 0.15 * (1 - gen / generations)); // adaptive mutation
      newPop.push(child);
    }

    population = newPop;
    await evaluate(population.slice(eliteCount)); // only evaluate new individuals
  }

  // Final sort
  population.sort((a, b) => b.fitness - a.fitness);

  // Pareto front (FOS vs volume) — non-dominated sorting
  const withResults = population.filter(p => p.result) as (Individual & { result: ConsolidationResult })[];
  const paretoFront: ConsolidationResult[] = [];

  for (const ind of withResults) {
    const minFOS = Math.min(...ind.result.dac.map(d => d.fos));
    const vol = ind.result.volume;
    const dominated = withResults.some(other => {
      if (other === ind) return false;
      const otherFOS = Math.min(...other.result.dac.map(d => d.fos));
      return otherFOS >= minFOS && other.result.volume <= vol && (otherFOS > minFOS || other.result.volume < vol);
    });
    if (!dominated) paretoFront.push(ind.result);
  }

  return {
    bestDesign: population[0].result!,
    population: population.filter(p => p.result).map(p => p.result!),
    generations,
    convergenceHistory,
    paretoFront,
    elapsedMs: performance.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DEFAULT SOIL (typical open pit mine material)
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_BENCH_SOIL: BenchSoilParams = {
  cohesion: 25,
  frictionAngle: 32,
  unitWeight: 20,
  saturatedUnitWeight: 22,
  ru: 0.15,
  cohesionStdDev: 8,
  frictionStdDev: 3,
  unitWeightStdDev: 1.5,
};
