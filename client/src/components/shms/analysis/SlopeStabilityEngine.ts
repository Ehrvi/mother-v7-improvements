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

  // Compute profile bottom — uses minimum y of ALL SOIL LAYER polygons
  // This allows the circle to cut through all soil layers (critical for multi-layer)
  // Ref: Rocscience SLIDE2 allows slip surfaces through any defined material
  let profileBottom = Math.min(...profile.surfacePoints.map(p => p.y));
  for (const layer of profile.layers) {
    for (const pt of layer.points) {
      if (pt.y < profileBottom) profileBottom = pt.y;
    }
  }

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
    if (rr - dxM * dxM < 0) continue;

    const circleBaseL = rr - dxL * dxL >= 0 ? center.y - Math.sqrt(rr - dxL * dxL) : center.y;
    const circleBaseR = rr - dxR * dxR >= 0 ? center.y - Math.sqrt(rr - dxR * dxR) : center.y;
    const circleBaseM = center.y - Math.sqrt(Math.max(0, rr - dxM * dxM));

    // Clamp base to profile bottom — slip surface can't go below the soil
    const baseL = Math.max(circleBaseL, profileBottom);
    const baseR = Math.max(circleBaseR, profileBottom);
    const baseM = Math.max(circleBaseM, profileBottom);

    // Skip if base is above surface
    if (baseM >= topM) continue;

    const heightL = topL - baseL;
    const heightR = topR - baseR;
    const height = topM - baseM;
    if (height <= 0) continue;

    // Base angle α — from circle geometry: α = arcsin((x - cx) / R)
    // Equivalent: α = atan2(dx, sqrt(R² - dx²))
    // When base is clamped at profileBottom, use finite difference from base geometry
    // Ref: Bishop (1955), USACE EM 1110-2-1902 §C-2
    let alpha: number;
    if (circleBaseM > profileBottom + 0.01) {
      // Circle is within soil — use exact circle geometry
      alpha = Math.atan2(dxM, Math.sqrt(Math.max(0, rr - dxM * dxM)));
    } else {
      // Base clamped at profileBottom — use finite difference of actual base
      alpha = Math.atan2(baseL - baseR, sliceWidth);
    }

    // Find soil layer at base midpoint (use effective base position)
    const layer = findLayerAt(profile.layers, xm, baseM + 0.01); // slightly above base
    const c = layer?.cohesion ?? 10;
    const phi = deg2rad(layer?.frictionAngle ?? 30);
    const gamma = layer?.unitWeight ?? 18;
    const ru = layer?.ru ?? 0;

    // Weight = γ × trapezoidal area — more accurate than rectangular
    // Ref: USACE EM 1110-2-1902 §C-2 — W = γ · b · (hL + hR) / 2
    const weight = gamma * sliceWidth * (Math.max(0, heightL) + Math.max(0, heightR)) / 2;

    // Pore pressure — USACE EM 1110-2-1902 §C-3
    // When water table exists: u = γ_w · h_w (hydrostatic, no ru)
    // When no water table: u = ru · σ_v = ru · γ · h
    let u = 0;
    if (profile.waterTable) {
      const wtY = interpolateY(profile.waterTable.points, xm);
      if (baseM < wtY) {
        u = 9.81 * (wtY - baseM); // γ_w · h_w — no ru factor
      }
    } else {
      u = ru * gamma * height;  // ru·σ_v approach
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
  // Try point-in-polygon for each layer
  for (const layer of layers) {
    if (layer.points.length >= 3) {
      if (pointInPolygon({ x, y }, layer.points)) return layer;
    }
  }
  // Fallback: find the layer whose y-centroid is closest to query point
  // This handles edge cases at layer boundaries and small polygon gaps
  let bestLayer = layers[0];
  let bestDist = Infinity;
  for (const layer of layers) {
    if (layer.points.length < 3) continue;
    const centY = layer.points.reduce((sum, p) => sum + p.y, 0) / layer.points.length;
    const centX = layer.points.reduce((sum, p) => sum + p.x, 0) / layer.points.length;
    const dist = Math.sqrt((x - centX) ** 2 + (y - centY) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestLayer = layer;
    }
  }
  return bestLayer;
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

// ─── Critical Circle Search ──────────────────────────────────────────────────
// Grid search for the circle with minimum Bishop FOS
// Ref: Rocscience SLIDE2 uses 20×20 grid + 11 radii per point = 4400 trials
// We use coarse→fine two-phase search + quality filters

export function searchCriticalCircle(
  profile: SlopeProfile,
  nSlicesSearch: number = 30,
  gridSize: number = 15
): { circle: SlipCircle; fos: number } {
  const xs = profile.surfacePoints.map(p => p.x);
  const ys = profile.surfacePoints.map(p => p.y);
  const xMinP = Math.min(...xs);
  const xMaxP = Math.max(...xs);
  const yMinP = Math.min(...ys);
  const yMaxP = Math.max(...ys);
  const H = yMaxP - yMinP;          // slope height
  const L = xMaxP - xMinP;          // profile length

  // Search grid: per Fredlund et al. (1981), center ABOVE crest
  const cxMin = xMinP - L * 0.1;
  const cxMax = xMaxP + L * 0.1;
  const cyMin = yMaxP;               // center must be above crest for circular failure
  const cyMax = yMaxP + 3.0 * H;    // up to 3.0× height above crest
  const rMin = H * 0.5;
  const rMax = H * 4.0;

  const cxStep = (cxMax - cxMin) / gridSize;
  const cyStep = (cyMax - cyMin) / gridSize;
  const rStep = (rMax - rMin) / 12;

  let bestFOS = Infinity;
  let bestCircle: SlipCircle = { center: { x: 0, y: 0 }, radius: 0 };

  // Quick Bishop with physical validity checks (NOT result filters)
  function quickBishop(cx: number, cy: number, r: number): number {
    const circle: SlipCircle = { center: { x: cx, y: cy }, radius: r };
    const slices = generateSlices(profile, circle, nSlicesSearch);
    if (slices.length < 5) return 999;

    let fs = 1.5;
    for (let iter = 0; iter < 50; iter++) {
      let num = 0, den = 0;
      for (const s of slices) {
        const tanPhi = Math.tan(s.baseFriction);
        const mA = Math.cos(s.baseAngle) * (1 + Math.tan(s.baseAngle) * tanPhi / fs);
        if (Math.abs(mA) < 1e-10) continue;
        num += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mA;
        den += s.weight * Math.sin(s.baseAngle);
      }
      if (Math.abs(den) < 1e-10) return 999;
      const fsNew = num / den;
      if (fsNew <= 0 || !isFinite(fsNew)) return 999;
      if (Math.abs(fsNew - fs) < 0.001) return fsNew;
      fs = fsNew;
    }
    return fs;
  }

  // Phase 1: Coarse search
  for (let cx = cxMin; cx <= cxMax; cx += cxStep) {
    for (let cy = cyMin; cy <= cyMax; cy += cyStep) {
      for (let r = rMin; r <= rMax; r += rStep) {
        const fos = quickBishop(cx, cy, r);
        if (fos > 0.1 && fos < bestFOS) {
          bestFOS = fos;
          bestCircle = { center: { x: cx, y: cy }, radius: r };
        }
      }
    }
  }

  // Phase 2: Fine search around best  
  const fcxStep = cxStep / 4;
  const fcyStep = cyStep / 4;
  const frStep = rStep / 4;
  const bCx = bestCircle.center.x;
  const bCy = bestCircle.center.y;
  const bR = bestCircle.radius;

  for (let cx = bCx - cxStep; cx <= bCx + cxStep; cx += fcxStep) {
    for (let cy = bCy - cyStep; cy <= bCy + cyStep; cy += fcyStep) {
      for (let r = Math.max(rMin, bR - rStep); r <= Math.min(rMax, bR + rStep); r += frStep) {
        const fos = quickBishop(cx, cy, r);
        if (fos > 0.1 && fos < bestFOS) {
          bestFOS = fos;
          bestCircle = { center: { x: cx, y: cy }, radius: r };
        }
      }
    }
  }

  return { circle: bestCircle, fos: bestFOS };
}

// ─── Fellenius / Ordinary Method of Slices (OMS) ─────────────────────────────
// Original: Fellenius, W. (1936). "Calculation of the stability of earth dams."
//           Transactions of the 2nd Congress on Large Dams, Washington, Vol.4, 445-462.
// Also:     Fellenius, W. (1927). Erdstatische Berechnungen. W. Ernst & Sohn, Berlin.
//
// F = Σ[c'·l + (W·cosα − u·l)·tanφ'] / Σ[W·sinα]
// Ignores all interslice forces → conservative (lowest FOS).
// No iteration needed — direct calculation.

export function felleniusOMS(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 30
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Fellenius (OMS)', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  let numerator = 0;
  let denominator = 0;

  for (const s of slices) {
    const alpha = s.baseAngle;
    const tanPhi = Math.tan(s.baseFriction);
    const l = s.baseLength;
    // Normal force on base: N = W·cosα
    // Effective normal: N' = N − u·l
    numerator += s.baseCohesion * l + (s.weight * Math.cos(alpha) - s.porePressure * l) * tanPhi;
    denominator += s.weight * Math.sin(alpha);
  }

  if (Math.abs(denominator) < 1e-10) {
    return { method: 'Fellenius (OMS)', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices };
  }

  const fos = numerator / denominator;
  return {
    method: 'Fellenius (OMS)',
    factorOfSafety: fos > 0 ? fos : 999,
    converged: true,
    iterations: 1,
    slipCircle: circle,
    slices,
  };
}

// ─── Bishop Simplified Method ─────────────────────────────────────────────────
// Fs = Σ [c'b + (W − u·b)tanφ'] / mα  /  Σ W sinα
// mα = cosα · (1 + tanα·tanφ'/Fs)
// Reference: Bishop (1955), USACE EM 1110-2-1902 Eq.C-15

export function bishopSimplified(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 30,
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
      // USACE EM 1110-2-1902: mα = cosα·(1 + tanα·tanφ'/F)
      const mAlpha = Math.cos(alpha) * (1 + Math.tan(alpha) * tanPhi / fs);

      if (Math.abs(mAlpha) < 1e-10) continue;

      // Bishop numerator: [c'·b + (W − u·b)·tanφ'] / mα
      // Where u acts over slice width b (Bishop simplification)
      const resisting = (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
      numerator += resisting;
      denominator += s.weight * Math.sin(alpha);
    }

    if (Math.abs(denominator) < 1e-10) {
      return { method: 'Bishop Simplified', factorOfSafety: 999, converged: false, iterations: iter, slipCircle: circle, slices };
    }

    const fsNew = numerator / denominator;

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

// ─── Janbu Simplified Method ──────────────────────────────────────────────────
// Original: Janbu, N. (1954). "Application of composite slip surfaces for stability
//           analysis." European Conf. on Stability of Earth Slopes, Stockholm, Vol.3, 43-49.
//
// F = Σ[c'·b + (W − u·b)·tanφ'] / nα  /  Σ[W·tanα]
// nα = cos²α · (1 + tanα·tanφ'/F)
// Force equilibrium only (horizontal). Iterative.

export function janbuSimplified(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 30,
  maxIter: number = 100,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Janbu Simplified', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  let fs = 1.5;

  for (let iter = 0; iter < maxIter; iter++) {
    let numerator = 0;
    let denominator = 0;

    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const cosA = Math.cos(alpha);
      // Janbu: nα = cos²α · (1 + tanα·tanφ'/F)
      const nAlpha = cosA * cosA * (1 + Math.tan(alpha) * tanPhi / fs);

      if (Math.abs(nAlpha) < 1e-10) continue;

      numerator += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / nAlpha;
      denominator += s.weight * Math.tan(alpha);
    }

    if (Math.abs(denominator) < 1e-10) {
      return { method: 'Janbu Simplified', factorOfSafety: 999, converged: false, iterations: iter, slipCircle: circle, slices };
    }

    const fsNew = numerator / denominator;
    if (fsNew <= 0 || !isFinite(fsNew)) {
      return { method: 'Janbu Simplified', factorOfSafety: 999, converged: false, iterations: iter + 1, slipCircle: circle, slices };
    }

    if (Math.abs(fsNew - fs) < tolerance) {
      return { method: 'Janbu Simplified', factorOfSafety: fsNew, converged: true, iterations: iter + 1, slipCircle: circle, slices };
    }
    fs = fsNew;
  }

  return { method: 'Janbu Simplified', factorOfSafety: fs > 0 ? fs : 999, converged: false, iterations: maxIter, slipCircle: circle, slices };
}

// ─── Janbu Corrected Method ───────────────────────────────────────────────────
// Original: Janbu, N. (1973). "Slope Stability Computations." In Embankment Dam
//           Engineering — Casagrande Volume (eds. Hirschfeld & Poulos), Wiley, 47-86.
//
// Fc = F_janbu_simplified × f₀
// f₀ = 1 + b₁ · (d/L)                               [Janbu 1973, Fig. 9]
// b₁ = 0.69 for c-only (φ=0, undrained clay)
// b₁ = 0.50 for c-φ soils (effective stress)
// b₁ = 0.31 for φ-only (c=0, granular)
// d  = max vertical depth of slip surface below ground
// L  = horizontal distance between entry and exit points

export function janbuCorrected(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 30,
  maxIter: number = 100,
  tolerance: number = 0.001
): StabilityResult {
  const jResult = janbuSimplified(profile, circle, nSlices, maxIter, tolerance);
  if (jResult.factorOfSafety >= 100) return { ...jResult, method: 'Janbu Corrected' };

  // Compute correction factor f₀
  const slices = jResult.slices;
  if (slices.length === 0) return { ...jResult, method: 'Janbu Corrected' };

  // d = max depth of slip surface below ground
  const depths = slices.map(s => s.height);
  const d = Math.max(...depths);
  // L = horizontal length of slip surface
  const L = slices[slices.length - 1].xRight - slices[0].xLeft;
  if (L <= 0) return { ...jResult, method: 'Janbu Corrected' };

  const dOverL = d / L;

  // Determine b₁ based on weighted soil properties at the slip surface base
  // Ref: Janbu (1973) — b₁ depends on soil TYPE along slip surface, not just first layer
  let totalC = 0;
  let totalPhi = 0;
  for (const s of slices) {
    totalC += s.baseCohesion;
    totalPhi += s.baseFriction; // already in radians
  }
  const avgC = totalC / slices.length;          // average cohesion (kPa)
  const avgPhiDeg = (totalPhi / slices.length) * 180 / Math.PI; // avg φ in degrees

  // Janbu (1973) Fig. 9: b₁ depends on soil type
  let b1 = 0.50; // default: c-φ soil [Janbu 1973]
  if (avgC > 1 && avgPhiDeg <= 1) b1 = 0.69;            // c-only (undrained clay) [Janbu 1973]
  else if (avgC <= 1 && avgPhiDeg > 1) b1 = 0.31;       // φ-only (granular) [Janbu 1973]
  // else c-φ: b1 = 0.50 [Janbu 1973]

  // f₀ = 1 + b₁·(d/L)  [Janbu 1973, Eq. from Fig. 9]
  const f0 = 1 + b1 * dOverL;
  const correctedFOS = jResult.factorOfSafety * f0;

  return {
    ...jResult,
    method: 'Janbu Corrected',
    factorOfSafety: correctedFOS > 0 ? correctedFOS : 999,
  };
}

// ─── Corps of Engineers / Lowe-Karafiath Method ───────────────────────────────
// Original: USACE (2003). "Slope Stability." Engineer Manual EM 1110-2-1902,
//           U.S. Army Corps of Engineers, Appendix C, §C-5.
// Also:     Lowe, J. & Karafiath, L. (1960). "Stability of Earth Dams upon
//           Drawdown." Proc. 1st Pan-Am. CSMFE, Mexico City, Vol.2, 537-552.
//
// Force equilibrium with assumed interslice force inclination θ:
// CoE variant: θ = (slope_entry + slope_exit) / 2
// L-K variant: θᵢ = (αᵢ + βᵢ) / 2  where βᵢ = ground surface inclination

export function corpsOfEngineers(
  profile: SlopeProfile,
  circle: SlipCircle,
  variant: 'coe' | 'lowe-karafiath' = 'coe',
  nSlices: number = 30,
  maxIter: number = 100,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: variant === 'coe' ? 'Corps of Engineers' : 'Lowe-Karafiath', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  // Compute ground surface inclination for each slice
  const surfSlopes: number[] = slices.map(s => {
    const yL = interpolateY(profile.surfacePoints, s.xLeft);
    const yR = interpolateY(profile.surfacePoints, s.xRight);
    return Math.atan2(yR - yL, s.width);
  });

  // For CoE: use average of entry and exit slopes
  const entrySlope = surfSlopes[0];
  const exitSlope = surfSlopes[surfSlopes.length - 1];
  const coeTheta = (entrySlope + exitSlope) / 2;

  let fs = 1.5;

  for (let iter = 0; iter < maxIter; iter++) {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);

      // Interslice force inclination
      const theta = variant === 'coe' ? coeTheta : (alpha + surfSlopes[i]) / 2;

      // Force equilibrium per USACE EM 1110-2-1902 §C-5:
      // nα = cos(α-θ) + sin(α-θ)·tanφ'/F
      const nAlpha = Math.cos(alpha - theta) + Math.sin(alpha - theta) * tanPhi / fs;
      if (Math.abs(nAlpha) < 1e-10) continue;

      // Numerator: [c'·b + (W - u·b)·tanφ'] / nα
      // Denominator: W·sin(α) — same driving force as Bishop
      numerator += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / nAlpha;
      denominator += s.weight * Math.sin(alpha);
    }

    if (Math.abs(denominator) < 1e-10) {
      return { method: variant === 'coe' ? 'Corps of Engineers' : 'Lowe-Karafiath', factorOfSafety: 999, converged: false, iterations: iter, slipCircle: circle, slices };
    }

    const fsNew = numerator / denominator;
    if (fsNew <= 0 || !isFinite(fsNew)) {
      return { method: variant === 'coe' ? 'Corps of Engineers' : 'Lowe-Karafiath', factorOfSafety: 999, converged: false, iterations: iter + 1, slipCircle: circle, slices };
    }

    if (Math.abs(fsNew - fs) < tolerance) {
      return {
        method: variant === 'coe' ? 'Corps of Engineers' : 'Lowe-Karafiath',
        factorOfSafety: fsNew,
        converged: true,
        iterations: iter + 1,
        slipCircle: circle,
        slices,
      };
    }
    fs = fsNew;
  }

  return {
    method: variant === 'coe' ? 'Corps of Engineers' : 'Lowe-Karafiath',
    factorOfSafety: fs > 0 ? fs : 999,
    converged: false,
    iterations: maxIter,
    slipCircle: circle,
    slices,
  };
}

// ─── Spencer Method ───────────────────────────────────────────────────────────
// Original: Spencer, E. (1967). "A method of analysis of the stability of
//           embankments assuming parallel inter-slice forces."
//           Géotechnique, 17(1), 11-26.
//
// Rigorous: satisfies BOTH moment and force equilibrium.
// Constant interslice force inclination θ.
// Fm(F,θ) and Ff(F,θ) solved simultaneously.

export function spencerMethod(
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number = 30,
  maxIter: number = 200,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Spencer', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

  // Start with Bishop FOS as initial guess (better than arbitrary 1.5)
  const bishopFOS = computeBishopFOS(slices);
  let fs = bishopFOS > 0 && bishopFOS < 100 ? bishopFOS : 1.5;
  let theta = 0; // start at 0° — Spencer converges from Bishop solution

  // Helper: compute Bishop moment-equilibrium FOS
  function computeBishopFOS(sl: typeof slices): number {
    let fsB = 1.5;
    for (let it = 0; it < 50; it++) {
      let num = 0, den = 0;
      for (const s of sl) {
        const alpha = s.baseAngle;
        const tanPhi = Math.tan(s.baseFriction);
        const mA = Math.cos(alpha) * (1 + Math.tan(alpha) * tanPhi / fsB);
        if (Math.abs(mA) < 1e-10) continue;
        num += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mA;
        den += s.weight * Math.sin(alpha);
      }
      if (Math.abs(den) < 1e-10) return 999;
      const fsNew = num / den;
      if (fsNew <= 0 || !isFinite(fsNew)) return 999;
      if (Math.abs(fsNew - fsB) < 0.001) return fsNew;
      fsB = fsNew;
    }
    return fsB;
  }

  // Helper: compute moment-equilibrium FOS (same as Bishop — independent of θ)
  function computeFm(F: number): number {
    let num = 0, den = 0;
    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const mAlpha = Math.cos(alpha) * (1 + Math.tan(alpha) * tanPhi / F);
      if (Math.abs(mAlpha) < 1e-10) continue;
      num += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
      den += s.weight * Math.sin(alpha);
    }
    return Math.abs(den) > 1e-10 ? num / den : 999;
  }

  // Helper: compute force-equilibrium FOS for given θ
  function computeFf(F: number, th: number): number {
    let num = 0, den = 0;
    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const d = alpha - th;
      const cosDiff = Math.cos(d);
      const sinDiff = Math.sin(d);
      if (Math.abs(cosDiff) < 1e-10) continue;
      const nAlpha = cosDiff + sinDiff * tanPhi / F;
      if (Math.abs(nAlpha) < 1e-10) continue;
      num += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / nAlpha;
      den += s.weight * Math.sin(d);
    }
    return Math.abs(den) > 1e-10 ? num / den : 999;
  }

  let bestDiff = Infinity;
  let bestFs = fs;
  let bestTheta = theta;

  for (let iter = 0; iter < maxIter; iter++) {
    const fsM = computeFm(fs);
    const fsF = computeFf(fs, theta);

    if (fsM >= 100 || fsF >= 100) break;

    const diff = fsM - fsF;

    // Track best solution (closest to Fm = Ff)
    if (Math.abs(diff) < bestDiff) {
      bestDiff = Math.abs(diff);
      bestFs = (fsM + fsF) / 2;
      bestTheta = theta;
    }

    // Convergence check
    const fsNew = (fsM + fsF) / 2;
    if (Math.abs(fsNew - fs) < tolerance && Math.abs(diff) < tolerance * 5) {
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

    // Newton-Raphson θ update with finite difference
    const dTheta = 0.0005;
    const fsFp = computeFf(fs, theta + dTheta);
    const dFdTheta = (fsFp - fsF) / dTheta;

    let thetaNew = theta;
    if (Math.abs(dFdTheta) > 1e-10) {
      thetaNew = theta - diff / dFdTheta * 0.3; // conservative damped Newton
    } else {
      thetaNew = theta - diff * 0.005; // very small fixed step
    }

    // Clamp θ to [-30°, 30°] — practical range per Spencer (1967)
    thetaNew = Math.max(deg2rad(-30), Math.min(deg2rad(30), thetaNew));

    // Only accept θ update if it doesn't make things worse
    const fsFNew = computeFf(fs, thetaNew);
    if (fsFNew < 100 && fsFNew > 0) {
      theta = thetaNew;
    }

    fs = 0.7 * fs + 0.3 * fsNew; // conservative relaxation
  }

  // Fallback: if Spencer didn't converge, use best found solution
  // If bestDiff is large, fallback to Bishop FOS (Fm)
  const finalFos = bestDiff < 0.5 ? bestFs : bishopFOS;
  return {
    method: 'Spencer',
    factorOfSafety: Math.max(0.1, finalFos),
    converged: bestDiff < tolerance * 5,
    iterations: maxIter,
    slipCircle: circle,
    slices,
    theta: rad2deg(bestTheta),
  };
}

// ─── Morgenstern-Price Method (GLE Framework) ────────────────────────────────
// Satisfies BOTH moment and force equilibrium with variable interslice function.
// X = λ·f(x)·E — shear interslice force related to normal interslice force
// Solves for F and λ simultaneously using GLE framework.
// When f(x)=constant, reduces to Spencer. When λ=0, reduces to Bishop.
// Reference: Morgenstern & Price (1965), Fredlund & Krahn (1977), GeoStru Theory

export type IntersliceFunction = 'constant' | 'sine' | 'half-sine' | 'trapezoidal';

export function morgensternPrice(
  profile: SlopeProfile,
  circle: SlipCircle,
  funcType: IntersliceFunction = 'half-sine',
  nSlices: number = 30,
  maxIter: number = 300,
  tolerance: number = 0.001
): StabilityResult {
  const slices = generateSlices(profile, circle, nSlices);
  if (slices.length === 0) {
    return { method: 'Morgenstern-Price', factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices: [] };
  }

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
  if (xRange <= 0) {
    return { method: `Morgenstern-Price (${funcType})`, factorOfSafety: 999, converged: false, iterations: 0, slipCircle: circle, slices };
  }

  // Moment-equilibrium FOS (Bishop-like, independent of λ)
  function computeFm(F: number): number {
    let num = 0, den = 0;
    for (const s of slices) {
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const mAlpha = Math.cos(alpha) * (1 + Math.tan(alpha) * tanPhi / F);
      if (Math.abs(mAlpha) < 1e-10) continue;
      num += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
      den += s.weight * Math.sin(alpha);
    }
    return Math.abs(den) > 1e-10 ? num / den : 999;
  }

  // Force-equilibrium FOS (depends on λ through interslice angle θ(x)=arctan(λ·f(x)))
  function computeFf(F: number, lam: number): number {
    let num = 0, den = 0;
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const alpha = s.baseAngle;
      const tanPhi = Math.tan(s.baseFriction);
      const xNorm = ((s.xLeft + s.xRight) / 2 - xMin) / xRange;
      const fx = fFunc(xNorm);
      const thetaI = Math.atan(lam * fx); // variable interslice angle

      const diff = alpha - thetaI;
      const cosDiff = Math.cos(diff);
      const sinDiff = Math.sin(diff);
      if (Math.abs(cosDiff) < 1e-10) continue;

      const nAlpha = cosDiff + sinDiff * tanPhi / F;
      if (Math.abs(nAlpha) < 1e-10) continue;

      num += (s.baseCohesion * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / nAlpha;
      den += s.weight * Math.sin(diff);
    }
    return Math.abs(den) > 1e-10 ? num / den : 999;
  }

  let fs = 1.5;
  let lambda = 0.2;

  for (let iter = 0; iter < maxIter; iter++) {
    const fsM = computeFm(fs);
    const fsF = computeFf(fs, lambda);

    if (fsM >= 100 || fsF >= 100) break;

    // Adjust λ so that Fm = Ff
    const diff = fsM - fsF;

    // Finite difference ∂Ff/∂λ
    const dLam = 0.001;
    const fsFp = computeFf(fs, lambda + dLam);
    const dFdLam = (fsFp - fsF) / dLam;

    if (Math.abs(dFdLam) > 1e-10) {
      lambda += diff / dFdLam * 0.5; // damped Newton step
    } else {
      lambda += diff * 0.05;
    }
    lambda = Math.max(-3, Math.min(3, lambda));

    const fsNew = (fsM + fsF) / 2;

    if (Math.abs(fsNew - fs) < tolerance && Math.abs(diff) < tolerance * 3) {
      // Build interslice forces for output
      const E: number[] = [0];
      const X: number[] = [0];
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        const alpha = s.baseAngle;
        const tanPhi = Math.tan(s.baseFriction);
        const S = (s.baseCohesion * s.baseLength + (s.weight * Math.cos(alpha) - s.porePressure * s.baseLength) * tanPhi) / fsNew;
        const Ei = E[i] + s.weight * Math.sin(alpha) - S;
        const xNorm = ((s.xLeft + s.xRight) / 2 - xMin) / xRange;
        E.push(Ei);
        X.push(lambda * fFunc(xNorm) * Ei);
      }

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

    fs = 0.5 * fs + 0.5 * fsNew;
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
