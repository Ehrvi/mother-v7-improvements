/**
 * ReliabilityEngine.ts — Probabilistic Analysis for Slope Stability
 *
 * Scientific basis:
 *   - Baecher & Christian (2003): Reliability and Statistics in Geotechnical Engineering
 *   - Hasofer & Lind (1974): First/Second Order Reliability Methods (FORM/SORM)
 *   - Ang & Tang (2007): Probability Concepts in Engineering
 *   - USACE ETL 1110-2-556: Risk-Based Analysis in Geotechnical Engineering
 *   - ICOLD Bulletin 130 (2002): Risk Assessment in Dam Safety Management
 *   - Duncan (2000): Factors of Safety and Reliability in Geotechnical Engineering
 *
 * Methods:
 *   1. Monte Carlo Simulation with Latin Hypercube Sampling (LHS)
 *   2. FORM — Hasofer-Lind Reliability Index (HL-RF algorithm)
 *   3. Scenario Analysis — Operating, Flood, Seismic, Post-Earthquake
 *   4. Sensitivity Analysis — Tornado diagrams, correlation coefficients
 */

import type { SlopeProfile, SlipCircle } from './SlopeStabilityEngine';
import { bishopSimplified } from './SlopeStabilityEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParameterDistribution {
  name: string;            // e.g. "c' (kPa)", "φ' (°)", "γ (kN/m³)"
  type: 'normal' | 'lognormal' | 'uniform' | 'triangular';
  mean: number;
  stdDev: number;
  min?: number;
  max?: number;
  layerId: string;
  property: 'cohesion' | 'frictionAngle' | 'unitWeight' | 'ru';
}

export interface MonteCarloConfig {
  iterations: number;
  seed?: number;
  samplingMethod: 'random' | 'lhs';  // Latin Hypercube Sampling
}

export interface MonteCarloResult {
  fosValues: number[];
  mean: number;
  stdDev: number;
  probabilityOfFailure: number;   // P(FOS < 1.0)
  reliabilityIndex: number;       // β = (μ - 1) / σ
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  histogram: { binCenter: number; count: number }[];
  sensitivity: { parameter: string; correlationCoeff: number }[];
  elapsedMs: number;
  converged: boolean;
}

export interface FORMResult {
  reliabilityIndex: number;     // β (Hasofer-Lind)
  probabilityOfFailure: number; // Pf = Φ(-β)
  designPoint: { name: string; value: number; sensitivity: number }[];
  iterations: number;
  converged: boolean;
}

export type Scenario = 'operating' | 'flood' | 'seismic' | 'post-earthquake' | 'rapid-drawdown' | 'construction';

export interface ScenarioConfig {
  name: string;
  scenario: Scenario;
  ruMultiplier: number;        // Pore pressure factor
  seismicCoefficient: number;  // kh for pseudo-static
  loadFactor: number;          // Additional load multiplier
  requiredFOS: number;         // Minimum FOS per standard
  reference: string;           // Standard reference
}

export interface ScenarioResult {
  scenario: ScenarioConfig;
  fos: number;
  passes: boolean;
  safetyMargin: number;  // FOS - required FOS
}

// ─── Predefined Scenarios (ICOLD, USACE, ANM) ────────────────────────────────

export const STANDARD_SCENARIOS: ScenarioConfig[] = [
  { name: 'Operação Normal', scenario: 'operating', ruMultiplier: 1.0, seismicCoefficient: 0, loadFactor: 1.0,
    requiredFOS: 1.5, reference: 'USACE EM 1110-2-1902 / ICOLD Bulletin 130' },
  { name: 'Cheia de Projeto (PMF)', scenario: 'flood', ruMultiplier: 1.3, seismicCoefficient: 0, loadFactor: 1.0,
    requiredFOS: 1.3, reference: 'USACE EM 1110-2-1902 / ANM Res. 95/2022' },
  { name: 'Sismo OBE (pseudo-estático)', scenario: 'seismic', ruMultiplier: 1.0, seismicCoefficient: 0.10, loadFactor: 1.0,
    requiredFOS: 1.1, reference: 'USACE ER 1110-2-1806 / ICOLD Bulletin 148' },
  { name: 'Sismo MCE (pseudo-estático)', scenario: 'seismic', ruMultiplier: 1.15, seismicCoefficient: 0.20, loadFactor: 1.0,
    requiredFOS: 1.0, reference: 'USACE ER 1110-2-1806 / ANCOLD (2024)' },
  { name: 'Pós-terremoto (resistência residual)', scenario: 'post-earthquake', ruMultiplier: 1.5, seismicCoefficient: 0, loadFactor: 1.0,
    requiredFOS: 1.2, reference: 'USACE ER 1110-2-1806 / Seed & Idriss (1971)' },
  { name: 'Rebaixamento Rápido (50%)', scenario: 'rapid-drawdown', ruMultiplier: 0.8, seismicCoefficient: 0, loadFactor: 1.0,
    requiredFOS: 1.3, reference: 'USACE EM 1110-2-1902 / Duncan et al. (1990)' },
  { name: 'Final de Construção', scenario: 'construction', ruMultiplier: 0.6, seismicCoefficient: 0, loadFactor: 1.15,
    requiredFOS: 1.3, reference: 'USACE EM 1110-2-1902 / ANM Res. 95/2022' },
];

// ─── Utility Functions ────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}

function sampleDistribution(
  dist: ParameterDistribution,
  rng: () => number
): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);

  switch (dist.type) {
    case 'normal':
      return dist.mean + dist.stdDev * z;
    case 'lognormal': {
      const sigma2 = Math.log(1 + (dist.stdDev / dist.mean) ** 2);
      const mu = Math.log(dist.mean) - sigma2 / 2;
      return Math.exp(mu + Math.sqrt(sigma2) * z);
    }
    case 'uniform': {
      const lo = dist.min ?? (dist.mean - dist.stdDev * Math.sqrt(3));
      const hi = dist.max ?? (dist.mean + dist.stdDev * Math.sqrt(3));
      return lo + u1 * (hi - lo);
    }
    case 'triangular': {
      const lo = dist.min ?? (dist.mean - dist.stdDev * 2);
      const hi = dist.max ?? (dist.mean + dist.stdDev * 2);
      const md = dist.mean;
      const fc = (md - lo) / (hi - lo);
      return u1 < fc
        ? lo + Math.sqrt(u1 * (hi - lo) * (md - lo))
        : hi - Math.sqrt((1 - u1) * (hi - lo) * (hi - md));
    }
    default:
      return dist.mean;
  }
}

// Latin Hypercube Sampling
function lhsSample(
  distributions: ParameterDistribution[],
  n: number,
  rng: () => number
): number[][] {
  const nParams = distributions.length;
  const samples: number[][] = [];

  // Create stratified samples for each parameter
  const stratified: number[][] = distributions.map(() => {
    const bins: number[] = [];
    for (let i = 0; i < n; i++) {
      bins.push((i + rng()) / n);
    }
    // Shuffle
    for (let i = bins.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bins[i], bins[j]] = [bins[j], bins[i]];
    }
    return bins;
  });

  for (let i = 0; i < n; i++) {
    const sample: number[] = [];
    for (let p = 0; p < nParams; p++) {
      const quantile = stratified[p][i];
      // Inverse CDF approximation using normal
      const z = inverseCDF(quantile);
      const dist = distributions[p];
      switch (dist.type) {
        case 'normal':
          sample.push(dist.mean + dist.stdDev * z);
          break;
        case 'lognormal': {
          const sigma2 = Math.log(1 + (dist.stdDev / dist.mean) ** 2);
          const mu = Math.log(dist.mean) - sigma2 / 2;
          sample.push(Math.exp(mu + Math.sqrt(sigma2) * z));
          break;
        }
        case 'uniform': {
          const lo = dist.min ?? (dist.mean - dist.stdDev * Math.sqrt(3));
          const hi = dist.max ?? (dist.mean + dist.stdDev * Math.sqrt(3));
          sample.push(lo + quantile * (hi - lo));
          break;
        }
        default:
          sample.push(dist.mean + dist.stdDev * z);
      }
    }
    samples.push(sample);
  }

  return samples;
}

function inverseCDF(p: number): number {
  // Rational approximation (Abramowitz & Stegun 26.2.23)
  if (p <= 0) return -4;
  if (p >= 1) return 4;
  if (p < 0.5) return -inverseCDF(1 - p);
  const t = Math.sqrt(-2 * Math.log(1 - p));
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}

// ─── Monte Carlo Simulation ──────────────────────────────────────────────────

export function monteCarloSimulation(
  profile: SlopeProfile,
  circle: SlipCircle,
  distributions: ParameterDistribution[],
  config: Partial<MonteCarloConfig> = {}
): MonteCarloResult {
  const cfg: MonteCarloConfig = {
    iterations: 10000,
    seed: 42,
    samplingMethod: 'lhs',
    ...config,
  };

  const rng = seededRandom(cfg.seed ?? Date.now());
  const t0 = Date.now();
  const fosValues: number[] = [];
  const paramValues: number[][] = [];

  // Generate samples
  let samples: number[][];
  if (cfg.samplingMethod === 'lhs') {
    samples = lhsSample(distributions, cfg.iterations, rng);
  } else {
    samples = Array.from({ length: cfg.iterations }, () =>
      distributions.map(d => sampleDistribution(d, rng))
    );
  }

  // Run simulations
  for (let i = 0; i < cfg.iterations; i++) {
    const sampledProfile: SlopeProfile = {
      ...profile,
      layers: profile.layers.map(layer => {
        const modified = { ...layer };
        for (let p = 0; p < distributions.length; p++) {
          if (distributions[p].layerId === layer.id) {
            const val = Math.max(0, samples[i][p]);
            switch (distributions[p].property) {
              case 'cohesion': modified.cohesion = val; break;
              case 'frictionAngle': modified.frictionAngle = val; break;
              case 'unitWeight': modified.unitWeight = val; break;
              case 'ru': modified.ru = Math.min(1, val); break;
            }
          }
        }
        return modified;
      }),
    };

    const result = bishopSimplified(sampledProfile, circle, 15, 30, 0.01);
    fosValues.push(result.factorOfSafety);
    paramValues.push(samples[i]);
  }

  // Statistics
  const validFOS = fosValues.filter(f => f < 100);
  const n = validFOS.length;
  const mean = validFOS.reduce((s, v) => s + v, 0) / n;
  const variance = validFOS.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const pf = validFOS.filter(f => f < 1.0).length / n;
  const beta = stdDev > 0 ? (mean - 1.0) / stdDev : 99;

  // Percentiles
  const sorted = [...validFOS].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor(p * n)] ?? sorted[0];

  // Histogram (20 bins)
  const minFOS = sorted[0] ?? 0;
  const maxFOS = sorted[sorted.length - 1] ?? 3;
  const nBins = 20;
  const binWidth = (maxFOS - minFOS) / nBins || 0.1;
  const histogram: MonteCarloResult['histogram'] = [];
  for (let b = 0; b < nBins; b++) {
    const lo = minFOS + b * binWidth;
    const hi = lo + binWidth;
    const count = validFOS.filter(f => f >= lo && f < hi).length;
    histogram.push({ binCenter: lo + binWidth / 2, count });
  }

  // Sensitivity (Spearman rank correlation)
  const sensitivity: MonteCarloResult['sensitivity'] = distributions.map((d, idx) => {
    const paramVals = paramValues.map(pv => pv[idx]);
    const corr = spearmanCorrelation(paramVals, fosValues);
    return { parameter: d.name, correlationCoeff: corr };
  });

  sensitivity.sort((a, b) => Math.abs(b.correlationCoeff) - Math.abs(a.correlationCoeff));

  return {
    fosValues: validFOS,
    mean,
    stdDev,
    probabilityOfFailure: pf,
    reliabilityIndex: beta,
    percentiles: { p5: pct(0.05), p25: pct(0.25), p50: pct(0.50), p75: pct(0.75), p95: pct(0.95) },
    histogram,
    sensitivity,
    elapsedMs: Date.now() - t0,
    converged: n > cfg.iterations * 0.9,
  };
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const rankX = rankArray(x);
  const rankY = rankArray(y);
  const meanRX = rankX.reduce((s, v) => s + v, 0) / n;
  const meanRY = rankY.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rankX[i] - meanRX;
    const dy = rankY[i] - meanRY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].i] = i + 1;
  }
  return ranks;
}

// ─── FORM (First-Order Reliability Method) ────────────────────────────────────
// Hasofer-Lind Reliability Index via HL-RF algorithm

export function formAnalysis(
  profile: SlopeProfile,
  circle: SlipCircle,
  distributions: ParameterDistribution[],
  maxIter: number = 50,
  tolerance: number = 0.001
): FORMResult {
  const n = distributions.length;
  let u = new Array(n).fill(0); // design point in standard normal space
  let beta = 3.0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Transform to physical space
    const x = distributions.map((d, i) => d.mean + d.stdDev * u[i]);

    // Evaluate g(x) = FOS - 1.0
    const modifiedProfile: SlopeProfile = {
      ...profile,
      layers: profile.layers.map(layer => {
        const modified = { ...layer };
        for (let p = 0; p < n; p++) {
          if (distributions[p].layerId === layer.id) {
            switch (distributions[p].property) {
              case 'cohesion': modified.cohesion = Math.max(0, x[p]); break;
              case 'frictionAngle': modified.frictionAngle = Math.max(0, x[p]); break;
              case 'unitWeight': modified.unitWeight = Math.max(1, x[p]); break;
              case 'ru': modified.ru = Math.max(0, Math.min(1, x[p])); break;
            }
          }
        }
        return modified;
      }),
    };

    const result = bishopSimplified(modifiedProfile, circle, 15, 30, 0.01);
    const g = result.factorOfSafety - 1.0;

    // Compute gradient by finite differences
    const grad: number[] = [];
    const delta = 0.01;
    for (let p = 0; p < n; p++) {
      const uPlus = [...u];
      uPlus[p] += delta;
      const xPlus = distributions.map((d, i) => d.mean + d.stdDev * uPlus[i]);
      const profPlus: SlopeProfile = {
        ...profile,
        layers: profile.layers.map(layer => {
          const mod = { ...layer };
          for (let pp = 0; pp < n; pp++) {
            if (distributions[pp].layerId === layer.id) {
              switch (distributions[pp].property) {
                case 'cohesion': mod.cohesion = Math.max(0, xPlus[pp]); break;
                case 'frictionAngle': mod.frictionAngle = Math.max(0, xPlus[pp]); break;
                case 'unitWeight': mod.unitWeight = Math.max(1, xPlus[pp]); break;
                case 'ru': mod.ru = Math.max(0, Math.min(1, xPlus[pp])); break;
              }
            }
          }
          return mod;
        }),
      };
      const resPlus = bishopSimplified(profPlus, circle, 15, 30, 0.01);
      grad.push((resPlus.factorOfSafety - result.factorOfSafety) / delta);
    }

    // HL-RF update
    const gradNorm = Math.sqrt(grad.reduce((s, g) => s + g * g, 0));
    if (gradNorm < 1e-10) break;

    const alpha = grad.map(g => g / gradNorm);
    const betaNew = Math.sqrt(u.reduce((s, ui) => s + ui * ui, 0));

    // Update design point
    const uNew = alpha.map((a, i) => -a * (betaNew + g / gradNorm));
    const betaCalc = Math.sqrt(uNew.reduce((s, ui) => s + ui * ui, 0));

    if (Math.abs(betaCalc - beta) < tolerance && Math.abs(g) < tolerance) {
      return {
        reliabilityIndex: betaCalc,
        probabilityOfFailure: normalCDF(-betaCalc),
        designPoint: distributions.map((d, i) => ({
          name: d.name,
          value: d.mean + d.stdDev * uNew[i],
          sensitivity: alpha[i] * alpha[i],
        })),
        iterations: iter + 1,
        converged: true,
      };
    }

    u = uNew;
    beta = betaCalc;
  }

  const betaFinal = Math.sqrt(u.reduce((s, ui) => s + ui * ui, 0));
  return {
    reliabilityIndex: betaFinal,
    probabilityOfFailure: normalCDF(-betaFinal),
    designPoint: distributions.map((d, i) => ({
      name: d.name,
      value: d.mean + d.stdDev * u[i],
      sensitivity: 1 / n,
    })),
    iterations: maxIter,
    converged: false,
  };
}

// ─── Scenario Analysis ────────────────────────────────────────────────────────

export function scenarioAnalysis(
  profile: SlopeProfile,
  circle: SlipCircle,
  scenarios: ScenarioConfig[] = STANDARD_SCENARIOS
): ScenarioResult[] {
  return scenarios.map(scenario => {
    const modifiedProfile: SlopeProfile = {
      ...profile,
      layers: profile.layers.map(layer => ({
        ...layer,
        ru: Math.min(1, layer.ru * scenario.ruMultiplier),
        unitWeight: layer.unitWeight * scenario.loadFactor,
      })),
    };

    // For seismic: add pseudo-static horizontal force as weight increase
    if (scenario.seismicCoefficient > 0) {
      modifiedProfile.layers = modifiedProfile.layers.map(layer => ({
        ...layer,
        unitWeight: layer.unitWeight * (1 + scenario.seismicCoefficient * 0.5),
      }));
    }

    const result = bishopSimplified(modifiedProfile, circle, 20, 50, 0.001);
    const fos = result.factorOfSafety;

    return {
      scenario,
      fos,
      passes: fos >= scenario.requiredFOS,
      safetyMargin: fos - scenario.requiredFOS,
    };
  });
}

// ─── Utility: Extract distributions from profile layers ───────────────────────

export function extractDistributions(profile: SlopeProfile): ParameterDistribution[] {
  const dists: ParameterDistribution[] = [];
  for (const layer of profile.layers) {
    if (layer.cohesionStdDev && layer.cohesionStdDev > 0) {
      dists.push({ name: `c' ${layer.name} (kPa)`, type: 'normal', mean: layer.cohesion,
        stdDev: layer.cohesionStdDev, layerId: layer.id, property: 'cohesion' });
    }
    if (layer.frictionStdDev && layer.frictionStdDev > 0) {
      dists.push({ name: `φ' ${layer.name} (°)`, type: 'normal', mean: layer.frictionAngle,
        stdDev: layer.frictionStdDev, layerId: layer.id, property: 'frictionAngle' });
    }
    if (layer.unitWeightStdDev && layer.unitWeightStdDev > 0) {
      dists.push({ name: `γ ${layer.name} (kN/m³)`, type: 'normal', mean: layer.unitWeight,
        stdDev: layer.unitWeightStdDev, layerId: layer.id, property: 'unitWeight' });
    }
  }
  return dists;
}

// ─── Reliability classification (USACE / ICOLD) ──────────────────────────────

export interface ReliabilityClassification {
  level: string;
  color: string;
  description: string;
  betaRange: string;
  pfRange: string;
}

export function classifyReliability(beta: number): ReliabilityClassification {
  if (beta >= 4.0) return { level: 'Muito Alto', color: '#22c55e', description: 'Desempenho acima do esperado', betaRange: 'β ≥ 4.0', pfRange: 'Pf < 3×10⁻⁵' };
  if (beta >= 3.0) return { level: 'Alto', color: '#84cc16', description: 'Desempenho satisfatório', betaRange: '3.0 ≤ β < 4.0', pfRange: '10⁻⁴ − 10⁻³' };
  if (beta >= 2.5) return { level: 'Adequado', color: '#eab308', description: 'Aceitável com monitoramento', betaRange: '2.5 ≤ β < 3.0', pfRange: '10⁻³ − 6×10⁻³' };
  if (beta >= 2.0) return { level: 'Abaixo do Esperado', color: '#f97316', description: 'Requer investigação adicional', betaRange: '2.0 ≤ β < 2.5', pfRange: '6×10⁻³ − 2×10⁻²' };
  if (beta >= 1.5) return { level: 'Insatisfatório', color: '#ef4444', description: 'Ação corretiva necessária', betaRange: '1.5 ≤ β < 2.0', pfRange: '2×10⁻² − 7×10⁻²' };
  return { level: 'Crítico', color: '#dc2626', description: 'Ação imediata requerida!', betaRange: 'β < 1.5', pfRange: 'Pf > 7×10⁻²' };
}

// ─── FOS Classification (USACE / ANM) ────────────────────────────────────────

export function classifyFOS(fos: number, scenario: Scenario = 'operating'): { level: string; color: string; required: number } {
  const required = scenario === 'operating' ? 1.5 : scenario === 'seismic' ? 1.1 : scenario === 'flood' ? 1.3 : scenario === 'construction' ? 1.3 : 1.2;
  if (fos >= required * 1.3) return { level: 'Seguro', color: '#22c55e', required };
  if (fos >= required) return { level: 'Adequado', color: '#eab308', required };
  if (fos >= 1.0) return { level: 'Marginal', color: '#f97316', required };
  return { level: 'Instável', color: '#dc2626', required };
}

// ─── DGM Hash Integration ─────────────────────────────────────────────────────

export function hashAnalysisResult(result: MonteCarloResult | FORMResult | ScenarioResult[]): string {
  const data = JSON.stringify(result);
  // Simple hash for provenance tracking (SHA-256 would be used in production)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const chr = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'DGM-' + Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}
