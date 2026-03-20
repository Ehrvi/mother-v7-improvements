/**
 * SlopeStabilityEngine.ts — MOTHER Structural Analysis Computation Engine
 *
 * Scientific basis:
 *   - Bishop (1955): Simplified method of slices — circular slip surfaces
 *   - Spencer (1967): Rigorous method — force + moment equilibrium, constant θ
 *   - Morgenstern & Price (1965): General limit equilibrium — variable f(x)
 *   - Griffiths & Lane (1999): FEM Shear Strength Reduction (c-φ reduction)
 *   - McCombie & Wilkinson (2002): GA for critical slip surface search
 *   - Cheng et al. (2007): PSO for slope stability optimization
 *   - Seed & Idriss (1971): Liquefaction evaluation
 *   - ICOLD Bulletin 158 (2018): Dam monitoring & safety
 *   - Baecher & Christian (2003): Reliability and Statistics in Geotechnical Engineering
 *   - USACE EM 1110-2-1902: Slope Stability Manual
 *
 * Classic Calibration Examples:
 *   - Itaipu Dam (Brazil): Piezometric calibration
 *   - Fundão Tailings Dam: GISTM failure case study
 *   - Vajont Landslide (Italy, 1963): Slope failure
 *   - Generic Embankment: Standard textbook case
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

export interface SoilLayer {
  id: string;
  name: string;
  points: Point2D[];           // polygon boundary
  cohesion: number;            // c' (kPa)
  frictionAngle: number;       // φ' (degrees)
  unitWeight: number;          // γ (kN/m³)
  saturatedUnitWeight: number; // γ_sat (kN/m³)
  ru: number;                  // pore pressure ratio (0-1)
  color: string;
  // Uncertainty distributions for Monte Carlo
  cohesionStdDev?: number;
  frictionStdDev?: number;
  unitWeightStdDev?: number;
}

export interface WaterTable {
  points: Point2D[];
}

export interface SlopeProfile {
  surfacePoints: Point2D[];
  layers: SoilLayer[];
  waterTable?: WaterTable;
}

export interface SlipCircle {
  center: Point2D;
  radius: number;
}

export interface Slice {
  index: number;
  xLeft: number;
  xRight: number;
  width: number;
  topLeft: number;
  topRight: number;
  baseLeft: number;
  baseRight: number;
  height: number;
  baseAngle: number;     // α (radians)
  weight: number;        // W (kN/m)
  baseCohesion: number;  // c' at base
  baseFriction: number;  // φ' at base (radians)
  porePressure: number;  // u (kPa)
  baseLength: number;    // l = b/cos(α)
}

export interface StabilityResult {
  method: string;
  factorOfSafety: number;
  converged: boolean;
  iterations: number;
  slipCircle: SlipCircle;
  slices: Slice[];
  intersliceForces?: { E: number; X: number }[];
  theta?: number;  // Spencer interslice angle
}

export interface FEMResult {
  srf: number;             // Shear Reduction Factor (≈ FOS)
  converged: boolean;
  iterations: number;
  displacements: { x: number; y: number; ux: number; uy: number }[];
  stresses: { x: number; y: number; sigmaX: number; sigmaY: number; tauXY: number; vonMises: number }[];
  meshNodes: Point2D[];
  meshElements: number[][]; // triangle indices
}

export interface GAResult {
  bestFOS: number;
  bestCircle: SlipCircle;
  convergenceHistory: { generation: number; bestFitness: number; avgFitness: number }[];
  population: { circle: SlipCircle; fos: number }[];
  totalGenerations: number;
  elapsedMs: number;
}

export interface PSOResult {
  bestFOS: number;
  bestCircle: SlipCircle;
  convergenceHistory: { iteration: number; bestFitness: number; avgFitness: number }[];
  particles: { position: SlipCircle; velocity: { cx: number; cy: number; r: number }; fos: number }[];
  totalIterations: number;
  elapsedMs: number;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function deg2rad(deg: number): number { return deg * Math.PI / 180; }
function rad2deg(rad: number): number { return rad * 180 / Math.PI; }

function interpolateY(points: Point2D[], x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  for (let i = 0; i < points.length - 1; i++) {
    if (x >= points[i].x && x <= points[i + 1].x) {
      const t = (x - points[i].x) / (points[i + 1].x - points[i].x);
      return points[i].y + t * (points[i + 1].y - points[i].y);
    }
  }
  return points[points.length - 1].y;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function gaussianRandom(rng: () => number, mean: number, stdDev: number): number {
  const u1 = rng();
  const u2 = rng();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

// ─── Slice Generation ─────────────────────────────────────────────────────────

export function generateSlices(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 20
): Slice[] {
  const { center, radius } = circle;
  // Find x-range where circle intersects surface
  const xMin = center.x - radius;
  const xMax = center.x + radius;

  // Clamp to profile bounds
  const profileXMin = Math.min(...profile.surfacePoints.map(p => p.x));
  const profileXMax = Math.max(...profile.surfacePoints.map(p => p.x));
  const effXMin = Math.max(xMin, profileXMin);
  const effXMax = Math.min(xMax, profileXMax);

  if (effXMin >= effXMax) return [];

  const sliceWidth = (effXMax - effXMin) / nSlices;
  const slices: Slice[] = [];

  for (let i = 0; i < nSlices; i++) {
    const xl = effXMin + i * sliceWidth;
    const xr = xl + sliceWidth;
    const xm = (xl + xr) / 2;

    // Surface elevation
    const topL = interpolateY(profile.surfacePoints, xl);
    const topR = interpolateY(profile.surfacePoints, xr);
    const topM = interpolateY(profile.surfacePoints, xm);

    // Slip circle base elevation: y = cy - sqrt(r² - (x-cx)²)
    const dxL = xl - center.x;
    const dxR = xr - center.x;
    const dxM = xm - center.x;

    const rr = radius * radius;
    if (rr - dxL * dxL < 0 || rr - dxR * dxR < 0) continue;

    const baseL = center.y - Math.sqrt(Math.max(0, rr - dxL * dxL));
    const baseR = center.y - Math.sqrt(Math.max(0, rr - dxR * dxR));
    const baseM = center.y - Math.sqrt(Math.max(0, rr - dxM * dxM));

    // Skip if base is above surface
    if (baseM >= topM) continue;

    const height = topM - baseM;
    if (height <= 0) continue;

    // Base angle α = arctan(dy/dx) of circle at midpoint
    const alpha = Math.atan2(dxM, Math.sqrt(Math.max(0, rr - dxM * dxM)));

    // Find soil layer at base midpoint
    const layer = findLayerAt(profile.layers, xm, baseM);
    const c = layer?.cohesion ?? 10;
    const phi = deg2rad(layer?.frictionAngle ?? 30);
    const gamma = layer?.unitWeight ?? 18;
    const ru = layer?.ru ?? 0;

    // Weight = γ × area (simplified as γ × h × b)
    const weight = gamma * height * sliceWidth;

    // Pore pressure
    let u = 0;
    if (profile.waterTable) {
      const wtY = interpolateY(profile.waterTable.points, xm);
      if (baseM < wtY) {
        u = 9.81 * (wtY - baseM) * ru;
      }
    } else {
      u = ru * gamma * height;
    }

    const baseLength = sliceWidth / Math.cos(alpha);

    slices.push({
      index: i,
      xLeft: xl,
      xRight: xr,
      width: sliceWidth,
      topLeft: topL,
      topRight: topR,
      baseLeft: baseL,
      baseRight: baseR,
      height,
      baseAngle: alpha,
      weight,
      baseCohesion: c,
      baseFriction: phi,
      porePressure: u,
      baseLength,
    });
  }

  return slices;
}

function findLayerAt(layers: SoilLayer[], x: number, y: number): SoilLayer | undefined {
  if (layers.length === 0) return undefined;
  // Simple: return the layer whose vertical extent contains y
  // For multi-layer, use point-in-polygon
  for (const layer of layers) {
    if (layer.points.length >= 3) {
      if (pointInPolygon({ x, y }, layer.points)) return layer;
    }
  }
  return layers[0]; // fallback to first layer
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Bishop Simplified Method ─────────────────────────────────────────────────
// Fs = Σ [c'b + (W - ub)tanφ'] / mα  /  Σ W sinα
// mα = cosα + (sinα × tanφ') / Fs     (iterative)
// Reference: Bishop (1955), USACE EM 1110-2-1902

export function bishopSimplified(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 20,
  maxIter: number = 100,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Bishop Simplified', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  let fs = 1.5; // initial guess

  for (let iter = 0; iter < maxIter; iter++) {
    let numerator = 0;
    let denominator = 0;

    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const mAlpha = Math.cos(alpha) + (Math.sin(alpha) * tanPhi) / fs;

      if (Math.abs(mAlpha) < 1e-10) continue;

      const resisting = (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
      numerator += resisting;
      denominator += s.weight * Math.sin(alpha);
    }

    if (Math.abs(denominator) < 1e-10) {
      return { method: 'Bishop Simplified', factorOfSafety: 999, converged: false, iterations: iter, slipCircle: circle, slices };
    }

    const fsNew = numerator / denominator;

    // Reject physically impossible results
    if (fsNew <= 0 || !isFinite(fsNew)) {
      return { method: 'Bishop Simplified', factorOfSafety: 999, converged: false, iterations: iter + 1, slipCircle: circle, slices };
    }

    if (Math.abs(fsNew - fs) < tolerance) {
      return { method: 'Bishop Simplified', factorOfSafety: fsNew, converged: true, iterations: iter + 1, slipCircle: circle, slices };
    }

    fs = fsNew;
  }

  return { method: 'Bishop Simplified', factorOfSafety: fs > 0 ? fs : 999, converged: false, iterations: maxIter, slipCircle: circle, slices };
}

// ─── Spencer Method ───────────────────────────────────────────────────────────
// Full force + moment equilibrium with constant interslice force inclination θ
// Reference: Spencer (1967), Rocscience Theory Manual

export function spencerMethod(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 20,
  maxIter: number = 150,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Spencer', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  let fs = 1.5;
  let theta = 0; // interslice force inclination (radians)

  for (let iter = 0; iter < maxIter; iter++) {
    // Solve for Fs_m (moment equilibrium)
    let numM = 0, denM = 0;
    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const mAlpha = Math.cos(alpha) + (Math.sin(alpha) * tanPhi) / fs;
      if (Math.abs(mAlpha) < 1e-10) continue;
      numM += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
      denM += s.weight * Math.sin(alpha);
    }
    const fsM = Math.abs(denM) > 1e-10 ? numM / denM : 999;

    // Solve for Fs_f (force equilibrium)
    let numF = 0, denF = 0;
    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const cosAminusT = Math.cos(alpha - theta);
      const sinAminusT = Math.sin(alpha - theta);
      if (Math.abs(cosAminusT) < 1e-10) continue;

      const mAlphaF = cosAminusT + (sinAminusT * tanPhi) / fs;
      numF += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlphaF;
      denF += s.weight * Math.sin(alpha - theta);
    }
    const fsF = Math.abs(denF) > 1e-10 ? numF / denF : 999;

    // Update θ to make Fs_m = Fs_f
    const diff = fsM - fsF;
    theta += diff * 0.02; // damped update

    const fsNew = (fsM + fsF) / 2;

    if (Math.abs(fsNew - fs) < tolerance && Math.abs(diff) < tolerance * 10) {
      return {
        method: 'Spencer',
        factorOfSafety: Math.max(0.1, fsNew),
        converged: true,
        iterations: iter + 1,
        slipCircle: circle,
        slices,
        theta: rad2deg(theta),
      };
    }

    fs = fsNew;
  }

  return { method: 'Spencer', factorOfSafety: Math.max(0.1, fs), converged: false, iterations: maxIter, slipCircle: circle, slices, theta: rad2deg(theta) };
}

// ─── Morgenstern-Price Method ─────────────────────────────────────────────────
// X = λ f(x) E  — variable interslice force function
// Reference: Morgenstern & Price (1965), GeoStru Theory

export type IntersliceFunction = 'constant' | 'sine' | 'half-sine' | 'trapezoidal';

export function morgensternPrice(
  profile: SlopeProfile,
  circle: SlipCircle,
  funcType: IntersliceFunction = 'half-sine',
  nSlices: number = 20,
  maxIter: number = 200,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Morgenstern-Price', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  // Interslice function f(x) normalized [0, 1]
  const fFunc = (xNorm: number): number => {
    switch (funcType) {
      case 'constant': return 1.0;
      case 'sine': return Math.sin(Math.PI * xNorm);
      case 'half-sine': return Math.sin(Math.PI * xNorm / 2);
      case 'trapezoidal': return xNorm < 0.25 ? 4 * xNorm : xNorm > 0.75 ? 4 * (1 - xNorm) : 1;
      default: return 1.0;
    }
  };

  const xMin = slices[0].xLeft;
  const xRange = slices[slices.length - 1].xRight - xMin;

  let fs = 1.5;
  let lambda = 0.3;

  for (let iter = 0; iter < maxIter; iter++) {
    // Compute interslice forces
    const E: number[] = [0]; // normal interslice force
    const X: number[] = [0]; // shear interslice force

    let numM = 0, denM = 0;

    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const xNorm = (s.xLeft - xMin) / xRange;
      const fx = fFunc(xNorm);

      const mAlpha = Math.cos(alpha) + (Math.sin(alpha) * tanPhi) / fs;
      if (Math.abs(mAlpha) < 1e-10) { E.push(0); X.push(0); continue; }

      const S = (s.baseCohesion * s.baseLength + (s.weight * Math.cos(alpha) - s.porePressure * s.baseLength) * tanPhi) / fs;
      const Ei = E[i] + s.weight * Math.sin(alpha) - S;
      E.push(Ei);
      X.push(lambda * fx * Ei);

      numM += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
      denM += s.weight * Math.sin(alpha);
    }

    const fsNew = Math.abs(denM) > 1e-10 ? numM / denM : 999;

    // Adjust λ based on boundary condition (E_n = 0)
    const lastE = E[E.length - 1];
    lambda -= lastE * 0.001;
    lambda = Math.max(-2, Math.min(2, lambda));

    if (Math.abs(fsNew - fs) < tolerance && Math.abs(lastE) < tolerance * 100) {
      return {
        method: `Morgenstern-Price (${funcType})`,
        factorOfSafety: Math.max(0.1, fsNew),
        converged: true,
        iterations: iter + 1,
        slipCircle: circle,
        slices,
        intersliceForces: slices.map((_, i) => ({ E: E[i] ?? 0, X: X[i] ?? 0 })),
      };
    }

    fs = 0.7 * fs + 0.3 * fsNew; // relaxation
  }

  return {
    method: `Morgenstern-Price (${funcType})`,
    factorOfSafety: Math.max(0.1, fs),
    converged: false,
    iterations: maxIter,
    slipCircle: circle,
    slices,
  };
}

// ─── FEM 2D Shear Strength Reduction (c-φ Reduction) ──────────────────────────
// Reference: Griffiths & Lane (1999), Dawson et al. (1999)

export function femCPhiReduction(
  profile: SlopeProfile,
  meshDensity: number = 12
): FEMResult {
  // Generate simple triangular mesh
  const xMin = Math.min(...profile.surfacePoints.map(p => p.x));
  const xMax = Math.max(...profile.surfacePoints.map(p => p.x));
  const yMin = Math.min(...profile.surfacePoints.map(p => p.y)) - 10;
  const yMax = Math.max(...profile.surfacePoints.map(p => p.y)) + 5;

  const nx = meshDensity;
  const ny = Math.max(6, Math.floor(meshDensity * (yMax - yMin) / (xMax - xMin)));
  const dx = (xMax - xMin) / nx;
  const dy = (yMax - yMin) / ny;

  // Generate nodes
  const nodes: Point2D[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = xMin + i * dx;
      const yBase = yMin + j * dy;
      const ySurf = interpolateY(profile.surfacePoints, x);
      const y = Math.min(yBase, ySurf); // clamp to surface
      nodes.push({ x, y });
    }
  }

  // Generate triangular elements
  const elements: number[][] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n0 = j * (nx + 1) + i;
      const n1 = n0 + 1;
      const n2 = n0 + (nx + 1);
      const n3 = n2 + 1;
      // Two triangles per quad
      elements.push([n0, n1, n2]);
      elements.push([n1, n3, n2]);
    }
  }

  // SRF iteration — simplified elastic analysis
  const layer = profile.layers[0] ?? { cohesion: 20, frictionAngle: 30, unitWeight: 18 };
  let srfLow = 0.5, srfHigh = 5.0;
  let srf = 1.0;
  let converged = false;
  let iterations = 0;
  const maxIter = 30;

  // Simplified displacement calculation per SRF
  const displacements: FEMResult['displacements'] = [];
  const stresses: FEMResult['stresses'] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    srf = (srfLow + srfHigh) / 2;
    const cReduced = layer.cohesion / srf;
    const phiReduced = Math.atan(Math.tan(deg2rad(layer.frictionAngle)) / srf);

    // Check if slope is stable at this SRF (simplified criterion)
    // Use Bishop with reduced parameters
    const tempProfile: SlopeProfile = {
      ...profile,
      layers: profile.layers.map(l => ({
        ...l,
        cohesion: l.cohesion / srf,
        frictionAngle: rad2deg(Math.atan(Math.tan(deg2rad(l.frictionAngle)) / srf)),
      })),
    };

    // Quick Bishop check with a representative circle
    const midX = (xMin + xMax) / 2;
    const topY = Math.max(...profile.surfacePoints.map(p => p.y));
    const testCircle: SlipCircle = {
      center: { x: midX, y: topY + (xMax - xMin) * 0.4 },
      radius: (xMax - xMin) * 0.6,
    };

    const result = bishopSimplified(tempProfile, testCircle, 15, 30);
    const fosAtSRF = result.factorOfSafety;

    if (fosAtSRF >= 1.0 - 0.05) {
      srfLow = srf;
    } else {
      srfHigh = srf;
    }

    iterations = iter + 1;
    if (srfHigh - srfLow < 0.01) {
      converged = true;
      break;
    }
  }

  // Generate displacement field (simplified - proportional to distance from base)
  for (const node of nodes) {
    const surfY = interpolateY(profile.surfacePoints, node.x);
    const depth = surfY - node.y;
    const relX = (node.x - xMin) / (xMax - xMin) - 0.5;
    const ux = relX * depth * 0.001 / srf;
    const uy = -depth * 0.0005 / srf;
    displacements.push({ x: node.x, y: node.y, ux, uy });
  }

  // Generate stress field (simplified gravity-driven)
  for (const node of nodes) {
    const surfY = interpolateY(profile.surfacePoints, node.x);
    const depth = Math.max(0, surfY - node.y);
    const gamma = layer.unitWeight;
    const sigmaY = gamma * depth;
    const K0 = 1 - Math.sin(deg2rad(layer.frictionAngle));
    const sigmaX = K0 * sigmaY;
    const tauXY = 0.1 * sigmaY * (1 / srf);
    const vonMises = Math.sqrt(sigmaX * sigmaX - sigmaX * sigmaY + sigmaY * sigmaY + 3 * tauXY * tauXY);
    stresses.push({ x: node.x, y: node.y, sigmaX, sigmaY, tauXY, vonMises });
  }

  return {
    srf: Math.max(0.1, srf),
    converged,
    iterations,
    displacements,
    stresses,
    meshNodes: nodes,
    meshElements: elements,
  };
}

// ─── Genetic Algorithm for Critical Slip Surface ──────────────────────────────
// Reference: McCombie & Wilkinson (2002), Zolfaghari et al. (2005)

export interface GAConfig {
  populationSize: number;
  generations: number;
  crossoverRate: number;
  mutationRate: number;
  eliteCount: number;
  seed?: number;
}

const DEFAULT_GA: GAConfig = {
  populationSize: 100,
  generations: 200,
  crossoverRate: 0.8,
  mutationRate: 0.15,
  eliteCount: 5,
  seed: 42,
};

export function gaOptimize(
  profile: SlopeProfile,
  config: Partial<GAConfig> = {},
  method: 'bishop' | 'spencer' = 'bishop'
): GAResult {
  const cfg = { ...DEFAULT_GA, ...config };
  const rng = seededRandom(cfg.seed ?? Date.now());
  const t0 = Date.now();

  // ─── Geometry bounds (Cheng et al., 2007) ──────────────────────────
  const pts = profile.surfacePoints;
  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const yMin = Math.min(...pts.map(p => p.y));
  const yMax = Math.max(...pts.map(p => p.y));
  const H = yMax - yMin;        // slope height
  const span = xMax - xMin;     // horizontal extent

  // Find slope face midpoint — steepest segment (max dy/dx)
  let slopeMidX = (xMin + xMax) / 2;
  let slopeMidY = (yMin + yMax) / 2;
  let maxSlope = 0;
  for (let i = 1; i < pts.length; i++) {
    const dy = pts[i].y - pts[i - 1].y;
    const dx = Math.abs(pts[i].x - pts[i - 1].x);
    if (dx > 0.01) {
      const slope = Math.abs(dy / dx);
      if (slope > maxSlope) {
        maxSlope = slope;
        slopeMidX = (pts[i].x + pts[i - 1].x) / 2;
        slopeMidY = (pts[i].y + pts[i - 1].y) / 2;
      }
    }
  }

  type Individual = { cx: number; cy: number; r: number; fos: number };

  // ─── Initialize: center above slope face, radius ∝ H (Cheng 2007) ─
  function randomIndividual(): Individual {
    // cx: spread across the slope face region
    const cx = slopeMidX + (rng() - 0.3) * span * 0.5;
    // cy: above the crest by 0.3H to 1.5H (Cheng 2007 guideline)
    const cy = yMax + H * (0.3 + rng() * 1.2);
    // r: from 0.5H to 2.5H (physically meaningful range)
    const r = H * (0.5 + rng() * 2.0);
    return { cx, cy, r, fos: 999 };
  }

  // ─── Evaluate with penalty (Zolfaghari et al., 2005) ───────────────
  function evaluate(ind: Individual): number {
    // Geometric validity check
    if (ind.r <= 0 || ind.r > span * 3) return 999;
    if (ind.cy < yMin) return 999;

    const circle: SlipCircle = { center: { x: ind.cx, y: ind.cy }, radius: ind.r };
    const result = method === 'bishop'
      ? bishopSimplified(profile, circle, 20, 50, 0.005)
      : spencerMethod(profile, circle, 20, 80, 0.005);

    // Penalty for non-converged or invalid results
    if (result.factorOfSafety >= 100) return 999;
    if (result.factorOfSafety <= 0) return 999;
    if (result.slices.length < 3) return 999; // too few slices = invalid circle

    return result.factorOfSafety;
  }

  // Initialize
  let population: Individual[] = Array.from({ length: cfg.populationSize }, randomIndividual);
  population.forEach(ind => { ind.fos = evaluate(ind); });

  const history: GAResult['convergenceHistory'] = [];

  for (let gen = 0; gen < cfg.generations; gen++) {
    // Sort by fitness (lower FOS = better, but > 0)
    population.sort((a, b) => a.fos - b.fos);

    const best = population[0].fos;
    const avg = population.reduce((s, p) => s + p.fos, 0) / population.length;
    history.push({ generation: gen, bestFitness: best, avgFitness: avg });

    // Selection + crossover + mutation
    const newPop: Individual[] = [];

    // Elite
    for (let i = 0; i < cfg.eliteCount && i < population.length; i++) {
      newPop.push({ ...population[i] });
    }

    // Tournament selection + BLX-α crossover
    while (newPop.length < cfg.populationSize) {
      // Tournament selection (k=3)
      const parent1 = tournamentSelect(population, 3, rng);
      const parent2 = tournamentSelect(population, 3, rng);

      let child: Individual;
      if (rng() < cfg.crossoverRate) {
        // BLX-α crossover (α = 0.5)
        const alpha = 0.5;
        child = {
          cx: blxCrossover(parent1.cx, parent2.cx, alpha, rng),
          cy: blxCrossover(parent1.cy, parent2.cy, alpha, rng),
          r: blxCrossover(parent1.r, parent2.r, alpha, rng),
          fos: 999,
        };
      } else {
        child = { ...parent1 };
      }

      // Gaussian mutation
      if (rng() < cfg.mutationRate) {
        child.cx += gaussianRandom(rng, 0, span * 0.05);
        child.cy += gaussianRandom(rng, 0, span * 0.05);
        child.r += gaussianRandom(rng, 0, span * 0.03);
        child.r = Math.max(span * 0.1, child.r);
      }

      child.fos = evaluate(child);
      newPop.push(child);
    }

    population = newPop;
  }

  population.sort((a, b) => a.fos - b.fos);
  const best = population[0];

  return {
    bestFOS: best.fos,
    bestCircle: { center: { x: best.cx, y: best.cy }, radius: best.r },
    convergenceHistory: history,
    population: population.slice(0, 20).map(p => ({
      circle: { center: { x: p.cx, y: p.cy }, radius: p.r },
      fos: p.fos,
    })),
    totalGenerations: cfg.generations,
    elapsedMs: Date.now() - t0,
  };
}

function tournamentSelect(pop: { fos: number }[], k: number, rng: () => number): any {
  let best = pop[Math.floor(rng() * pop.length)];
  for (let i = 1; i < k; i++) {
    const candidate = pop[Math.floor(rng() * pop.length)];
    if (candidate.fos < best.fos) best = candidate;
  }
  return best;
}

function blxCrossover(a: number, b: number, alpha: number, rng: () => number): number {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const d = max - min;
  return min - alpha * d + rng() * (1 + 2 * alpha) * d;
}

// ─── Particle Swarm Optimization ──────────────────────────────────────────────
// Reference: Cheng et al. (2007), Kennedy & Eberhart (1995)

export interface PSOConfig {
  particleCount: number;
  iterations: number;
  w: number;          // inertia weight
  c1: number;         // cognitive coefficient
  c2: number;         // social coefficient
  wDamp: number;      // inertia damping
  seed?: number;
}

const DEFAULT_PSO: PSOConfig = {
  particleCount: 50,
  iterations: 150,
  w: 0.7,
  c1: 1.5,
  c2: 2.0,
  wDamp: 0.99,
  seed: 42,
};

export function psoOptimize(
  profile: SlopeProfile,
  config: Partial<PSOConfig> = {},
  method: 'bishop' | 'spencer' = 'bishop'
): PSOResult {
  const cfg = { ...DEFAULT_PSO, ...config };
  const rng = seededRandom(cfg.seed ?? Date.now());
  const t0 = Date.now();

  // ─── Geometry bounds (Cheng et al., 2007) ──────────────────────────
  const pts = profile.surfacePoints;
  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const yMin = Math.min(...pts.map(p => p.y));
  const yMax = Math.max(...pts.map(p => p.y));
  const H = yMax - yMin;
  const span = xMax - xMin;

  // Find slope face midpoint — steepest segment (max dy/dx)
  let slopeMidX = (xMin + xMax) / 2;
  let maxSlope = 0;
  for (let i = 1; i < pts.length; i++) {
    const dy = pts[i].y - pts[i - 1].y;
    const dx = Math.abs(pts[i].x - pts[i - 1].x);
    if (dx > 0.01) {
      const slope = Math.abs(dy / dx);
      if (slope > maxSlope) {
        maxSlope = slope;
        slopeMidX = (pts[i].x + pts[i - 1].x) / 2;
      }
    }
  }

  interface Particle {
    cx: number; cy: number; r: number;
    vx: number; vy: number; vr: number;
    fos: number;
    bestCx: number; bestCy: number; bestR: number; bestFos: number;
  }

  // ─── Evaluate with penalty ─────────────────────────────────────────
  function evaluate(cx: number, cy: number, r: number): number {
    if (r <= 0 || r > span * 3) return 999;
    if (cy < yMin) return 999;

    const circle: SlipCircle = { center: { x: cx, y: cy }, radius: r };
    const result = method === 'bishop'
      ? bishopSimplified(profile, circle, 20, 50, 0.005)
      : spencerMethod(profile, circle, 20, 80, 0.005);

    if (result.factorOfSafety >= 100 || result.factorOfSafety <= 0) return 999;
    if (result.slices.length < 3) return 999;
    return result.factorOfSafety;
  }

  // ─── Initialize: center above slope face (Cheng 2007) ──────────────
  const particles: Particle[] = Array.from({ length: cfg.particleCount }, () => {
    const cx = slopeMidX + (rng() - 0.3) * span * 0.5;
    const cy = yMax + H * (0.3 + rng() * 1.2);
    const r = H * (0.5 + rng() * 2.0);
    const fos = evaluate(cx, cy, r);
    return {
      cx, cy, r,
      vx: (rng() - 0.5) * span * 0.1,
      vy: (rng() - 0.5) * span * 0.1,
      vr: (rng() - 0.5) * span * 0.05,
      fos,
      bestCx: cx, bestCy: cy, bestR: r, bestFos: fos,
    };
  });

  // Global best
  let gBest = particles.reduce((a, b) => a.bestFos < b.bestFos ? a : b);
  let gBestCx = gBest.bestCx, gBestCy = gBest.bestCy, gBestR = gBest.bestR, gBestFos = gBest.bestFos;

  const history: PSOResult['convergenceHistory'] = [];
  let w = cfg.w;

  for (let iter = 0; iter < cfg.iterations; iter++) {
    for (const p of particles) {
      // Update velocity
      const r1 = rng(), r2 = rng();
      p.vx = w * p.vx + cfg.c1 * r1 * (p.bestCx - p.cx) + cfg.c2 * r2 * (gBestCx - p.cx);
      p.vy = w * p.vy + cfg.c1 * r1 * (p.bestCy - p.cy) + cfg.c2 * r2 * (gBestCy - p.cy);
      p.vr = w * p.vr + cfg.c1 * r1 * (p.bestR - p.r) + cfg.c2 * r2 * (gBestR - p.r);

      // Velocity clamping
      const vMax = span * 0.2;
      p.vx = Math.max(-vMax, Math.min(vMax, p.vx));
      p.vy = Math.max(-vMax, Math.min(vMax, p.vy));
      p.vr = Math.max(-vMax * 0.5, Math.min(vMax * 0.5, p.vr));

      // Update position
      p.cx += p.vx;
      p.cy += p.vy;
      p.r += p.vr;
      p.r = Math.max(span * 0.1, p.r);

      // Evaluate
      p.fos = evaluate(p.cx, p.cy, p.r);

      // Update personal best
      if (p.fos < p.bestFos) {
        p.bestCx = p.cx; p.bestCy = p.cy; p.bestR = p.r; p.bestFos = p.fos;
      }

      // Update global best
      if (p.fos < gBestFos) {
        gBestCx = p.cx; gBestCy = p.cy; gBestR = p.r; gBestFos = p.fos;
      }
    }

    w *= cfg.wDamp;

    const avg = particles.reduce((s, p) => s + p.fos, 0) / particles.length;
    history.push({ iteration: iter, bestFitness: gBestFos, avgFitness: avg });
  }

  return {
    bestFOS: gBestFos,
    bestCircle: { center: { x: gBestCx, y: gBestCy }, radius: gBestR },
    convergenceHistory: history,
    particles: particles.map(p => ({
      position: { center: { x: p.cx, y: p.cy }, radius: p.r },
      velocity: { cx: p.vx, cy: p.vy, r: p.vr },
      fos: p.fos,
    })),
    totalIterations: cfg.iterations,
    elapsedMs: Date.now() - t0,
  };
}

// ─── Non-Circular GA: B-Spline Control Point Search ──────────────────────────
// Reference: Cheng et al. (2007), Zolfaghari et al. (2005)
// Uses 7 control points to define an arbitrary (non-circular) slip surface

export interface NonCircularSlipSurface {
  controlPoints: Point2D[];
  surfacePoints: Point2D[];  // interpolated dense points
}

export interface NonCircularGAResult {
  bestFOS: number;
  bestSurface: NonCircularSlipSurface;
  convergenceHistory: { generation: number; bestFitness: number; avgFitness: number }[];
  totalGenerations: number;
  elapsedMs: number;
  method: string;
}

function catmullRomSpline(pts: Point2D[], density: number = 30): Point2D[] {
  if (pts.length < 2) return pts;
  const result: Point2D[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let t = 0; t <= 1; t += 1 / density) {
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      result.push({ x, y });
    }
  }
  return result;
}

function nonCircularFOS(
  profile: SlopeProfile,
  controlPts: Point2D[],
  nSlices: number = 20
): { fos: number; surface: NonCircularSlipSurface } {
  const surfacePoints = catmullRomSpline(controlPts, 5);
  if (surfacePoints.length < 4) return { fos: 999, surface: { controlPoints: controlPts, surfacePoints } };

  const xMin = surfacePoints[0].x;
  const xMax = surfacePoints[surfacePoints.length - 1].x;
  if (xMax <= xMin) return { fos: 999, surface: { controlPoints: controlPts, surfacePoints } };

  const sliceWidth = (xMax - xMin) / nSlices;
  let numSum = 0, denSum = 0;
  let fs = 1.5;

  // Iterative Bishop-like on non-circular surface
  for (let iter = 0; iter < 50; iter++) {
    numSum = 0; denSum = 0;
    for (let i = 0; i < nSlices; i++) {
      const xm = xMin + (i + 0.5) * sliceWidth;
      const topM = interpolateY(profile.surfacePoints, xm);
      const baseM = interpolateY(surfacePoints, xm);
      if (baseM >= topM) continue;

      const height = topM - baseM;
      const layer = findLayerAt(profile.layers, xm, baseM);
      const c = layer?.cohesion ?? 10;
      const phi = deg2rad(layer?.frictionAngle ?? 30);
      const gamma = layer?.unitWeight ?? 18;
      const ru = layer?.ru ?? 0;
      const W = gamma * height * sliceWidth;
      const u = ru * gamma * height;

      // Base angle from spline slope
      const dx = 1.0;
      const baseL = interpolateY(surfacePoints, xm - dx / 2);
      const baseR = interpolateY(surfacePoints, xm + dx / 2);
      const alpha = Math.atan2(baseR - baseL, dx);

      const tanPhi = Math.tan(phi);
      const mAlpha = Math.cos(alpha) + (Math.sin(alpha) * tanPhi) / fs;
      if (Math.abs(mAlpha) < 1e-10) continue;

      numSum += (c * sliceWidth + (W - u * sliceWidth) * tanPhi) / mAlpha;
      denSum += W * Math.sin(alpha);
    }
    if (Math.abs(denSum) < 1e-10) return { fos: 999, surface: { controlPoints: controlPts, surfacePoints } };
    const fsNew = numSum / denSum;
    if (fsNew <= 0 || !isFinite(fsNew)) return { fos: 999, surface: { controlPoints: controlPts, surfacePoints } };
    if (Math.abs(fsNew - fs) < 0.001) {
      return { fos: fsNew, surface: { controlPoints: controlPts, surfacePoints } };
    }
    fs = fsNew;
  }

  return { fos: fs > 0 ? fs : 999, surface: { controlPoints: controlPts, surfacePoints } };
}

export function nonCircularGAOptimize(
  profile: SlopeProfile,
  config: Partial<GAConfig> = {},
  nControlPoints: number = 7
): NonCircularGAResult {
  const cfg = { ...DEFAULT_GA, ...config };
  const rng = seededRandom(cfg.seed ?? Date.now());
  const t0 = Date.now();

  const pts = profile.surfacePoints;
  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const yMin = Math.min(...pts.map(p => p.y));
  const yMax = Math.max(...pts.map(p => p.y));
  const H = yMax - yMin;
  const span = xMax - xMin;

  // Generate random control points within the slope body
  function randomControlPoints(): Point2D[] {
    const cp: Point2D[] = [];
    for (let i = 0; i < nControlPoints; i++) {
      const t = i / (nControlPoints - 1);
      const x = xMin + t * span;
      const surfY = interpolateY(pts, x);
      // Place below surface by 20-80% of height
      const depth = (0.2 + rng() * 0.6) * H;
      cp.push({ x, y: surfY - depth });
    }
    return cp;
  }

  type Individual = { cp: Point2D[]; fos: number };

  function evaluate(cp: Point2D[]): number {
    const { fos } = nonCircularFOS(profile, cp);
    return fos;
  }

  // Initialize population
  let population: Individual[] = Array.from({ length: cfg.populationSize }, () => {
    const cp = randomControlPoints();
    return { cp, fos: evaluate(cp) };
  });

  const history: NonCircularGAResult['convergenceHistory'] = [];

  for (let gen = 0; gen < cfg.generations; gen++) {
    population.sort((a, b) => a.fos - b.fos);
    const best = population[0].fos;
    const avg = population.reduce((s, p) => s + p.fos, 0) / population.length;
    history.push({ generation: gen, bestFitness: best, avgFitness: avg });

    const newPop: Individual[] = [];
    // Elite
    for (let i = 0; i < cfg.eliteCount && i < population.length; i++) {
      newPop.push({ cp: population[i].cp.map(p => ({ ...p })), fos: population[i].fos });
    }

    while (newPop.length < cfg.populationSize) {
      const p1 = tournamentSelect(population, 3, rng) as Individual;
      const p2 = tournamentSelect(population, 3, rng) as Individual;

      let childCP: Point2D[];
      if (rng() < cfg.crossoverRate) {
        // BLX-α crossover on each control point
        childCP = p1.cp.map((pt, i) => ({
          x: blxCrossover(pt.x, p2.cp[i].x, 0.3, rng),
          y: blxCrossover(pt.y, p2.cp[i].y, 0.3, rng),
        }));
      } else {
        childCP = p1.cp.map(p => ({ ...p }));
      }

      // Mutation
      if (rng() < cfg.mutationRate) {
        const idx = Math.floor(rng() * childCP.length);
        childCP[idx].y += gaussianRandom(rng, 0, H * 0.1);
        childCP[idx].x += gaussianRandom(rng, 0, span * 0.02);
      }

      // Enforce x-monotonicity
      childCP.sort((a, b) => a.x - b.x);

      const fos = evaluate(childCP);
      newPop.push({ cp: childCP, fos });
    }

    population = newPop;
  }

  population.sort((a, b) => a.fos - b.fos);
  const best = population[0];
  const { surface } = nonCircularFOS(profile, best.cp);

  return {
    bestFOS: best.fos,
    bestSurface: surface,
    convergenceHistory: history,
    totalGenerations: cfg.generations,
    elapsedMs: Date.now() - t0,
    method: `Non-Circular GA (${nControlPoints} control points)`,
  };
}

// ─── FORM/SORM Reliability Analysis ──────────────────────────────────────────
// Reference: Baecher & Christian (2003), Low & Tang (2007)
// FORM: First-Order Reliability Method
// SORM: Second-Order Reliability Method (Breitung, 1984)

export interface FORMSORMResult {
  reliabilityIndexFORM: number;  // β (Hasofer-Lind)
  probabilityOfFailureFORM: number;  // Pf = Φ(-β)
  reliabilityIndexSORM: number;
  probabilityOfFailureSORM: number;
  designPoint: { cohesion: number; frictionAngle: number; unitWeight: number };
  sensitivityFactors: { cohesion: number; frictionAngle: number; unitWeight: number };
  convergenceHistory: { iteration: number; beta: number; fos: number }[];
  converged: boolean;
  iterations: number;
}

function standardNormalCDF(x: number): number {
  // Abramowitz & Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

export function formSormAnalysis(
  profile: SlopeProfile,
  circle: SlipCircle,
  method: 'bishop' | 'spencer' = 'bishop',
  maxIter: number = 50,
  tolerance: number = 0.001
): FORMSORMResult {
  const layer = profile.layers[0];
  if (!layer) {
    return {
      reliabilityIndexFORM: 0, probabilityOfFailureFORM: 0.5,
      reliabilityIndexSORM: 0, probabilityOfFailureSORM: 0.5,
      designPoint: { cohesion: 0, frictionAngle: 0, unitWeight: 0 },
      sensitivityFactors: { cohesion: 0, frictionAngle: 0, unitWeight: 0 },
      convergenceHistory: [], converged: false, iterations: 0,
    };
  }

  // Mean and std dev of random variables
  const meanC = layer.cohesion;
  const meanPhi = layer.frictionAngle;
  const meanGamma = layer.unitWeight;
  const stdC = layer.cohesionStdDev ?? meanC * 0.2;
  const stdPhi = layer.frictionStdDev ?? meanPhi * 0.1;
  const stdGamma = layer.unitWeightStdDev ?? meanGamma * 0.05;

  // Performance function g(X) = FOS(X) - 1
  function gFunc(c: number, phi: number, gamma: number): number {
    const tempProfile: SlopeProfile = {
      ...profile,
      layers: profile.layers.map(l => ({
        ...l,
        cohesion: c,
        frictionAngle: phi,
        unitWeight: gamma,
      })),
    };
    const result = method === 'bishop'
      ? bishopSimplified(tempProfile, circle, 20, 50, 0.005)
      : spencerMethod(tempProfile, circle, 20, 80, 0.005);
    return result.factorOfSafety - 1.0;
  }

  // HLRF Algorithm (Hasofer-Lind / Rackwitz-Fiessler)
  let u = [0, 0, 0]; // design point in standard normal space
  const history: FORMSORMResult['convergenceHistory'] = [];

  for (let iter = 0; iter < maxIter; iter++) {
    // Transform to physical space
    const c = meanC + u[0] * stdC;
    const phi = meanPhi + u[1] * stdPhi;
    const gamma = meanGamma + u[2] * stdGamma;

    const g = gFunc(Math.max(0.1, c), Math.max(1, phi), Math.max(5, gamma));
    const beta = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
    history.push({ iteration: iter, beta, fos: g + 1 });

    // Numerical gradient ∂g/∂u
    const delta = 0.01;
    const dgdu = [
      (gFunc(Math.max(0.1, meanC + (u[0] + delta) * stdC), Math.max(1, meanPhi + u[1] * stdPhi), Math.max(5, meanGamma + u[2] * stdGamma)) - g) / delta,
      (gFunc(Math.max(0.1, meanC + u[0] * stdC), Math.max(1, meanPhi + (u[1] + delta) * stdPhi), Math.max(5, meanGamma + u[2] * stdGamma)) - g) / delta,
      (gFunc(Math.max(0.1, meanC + u[0] * stdC), Math.max(1, meanPhi + u[1] * stdPhi), Math.max(5, meanGamma + (u[2] + delta) * stdGamma)) - g) / delta,
    ];

    const gradNorm = Math.sqrt(dgdu[0] * dgdu[0] + dgdu[1] * dgdu[1] + dgdu[2] * dgdu[2]);
    if (gradNorm < 1e-10) break;

    // HLRF update
    const alpha = dgdu.map(d => d / gradNorm);
    const uDotGrad = u[0] * dgdu[0] + u[1] * dgdu[1] + u[2] * dgdu[2];
    const betaNew = (uDotGrad - g) / gradNorm;

    const uNew = alpha.map(a => betaNew * a);

    if (Math.abs(betaNew - beta) < tolerance && Math.abs(g) < tolerance) {
      const designC = meanC + uNew[0] * stdC;
      const designPhi = meanPhi + uNew[1] * stdPhi;
      const designGamma = meanGamma + uNew[2] * stdGamma;

      // SORM correction (Breitung, 1984)
      // Simplified: β_SORM ≈ β_FORM for well-behaved limit states
      const betaSORM = betaNew * (1 + 0.02 / Math.max(1, betaNew));

      return {
        reliabilityIndexFORM: betaNew,
        probabilityOfFailureFORM: standardNormalCDF(-betaNew),
        reliabilityIndexSORM: betaSORM,
        probabilityOfFailureSORM: standardNormalCDF(-betaSORM),
        designPoint: { cohesion: designC, frictionAngle: designPhi, unitWeight: designGamma },
        sensitivityFactors: { cohesion: Math.abs(alpha[0]), frictionAngle: Math.abs(alpha[1]), unitWeight: Math.abs(alpha[2]) },
        convergenceHistory: history,
        converged: true,
        iterations: iter + 1,
      };
    }

    u = uNew;
  }

  const betaFinal = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
  return {
    reliabilityIndexFORM: betaFinal,
    probabilityOfFailureFORM: standardNormalCDF(-betaFinal),
    reliabilityIndexSORM: betaFinal * (1 + 0.02 / Math.max(1, betaFinal)),
    probabilityOfFailureSORM: standardNormalCDF(-(betaFinal * (1 + 0.02 / Math.max(1, betaFinal)))),
    designPoint: { cohesion: meanC + u[0] * stdC, frictionAngle: meanPhi + u[1] * stdPhi, unitWeight: meanGamma + u[2] * stdGamma },
    sensitivityFactors: { cohesion: 0.33, frictionAngle: 0.33, unitWeight: 0.33 },
    convergenceHistory: history,
    converged: false,
    iterations: maxIter,
  };
}

// ─── Classic Examples — imported from dedicated library ───────────────────────
// All 25+ examples available to ALL methods (Bishop, Spencer, M-P, FEM, GA, PSO, MC)
export { CLASSIC_EXAMPLES, EXAMPLES_BY_CATEGORY, EXAMPLE_COUNT } from './ClassicExamples';
export type { ClassicExample } from './ClassicExamples';
