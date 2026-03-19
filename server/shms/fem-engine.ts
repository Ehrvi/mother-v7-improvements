/**
 * fem-engine.ts — SHMS Finite Element / Finite Difference Physics Engine
 *
 * Pure TypeScript 2D structural analysis for dam cross-sections.
 * No external dependencies — designed for Cloud Run lightweight deployment.
 *
 * Scientific basis:
 *   - Zienkiewicz & Taylor (2000) "The Finite Element Method" Vol.1-2 — foundational FEM theory
 *   - Bathe (2014) "Finite Element Procedures" 2nd ed. — practical FEM implementation
 *   - FEAScript (2024) feascript.com — JS-native FEM patterns for browser/server
 *   - Darcy (1856) "Les fontaines publiques de Dijon" — seepage flow law
 *   - Fourier (1822) "Théorie analytique de la chaleur" — heat conduction
 *   - ICOLD Bulletin 155 (2013) — Guidelines for use of numerical models in dam engineering
 *   - USACE EM 1110-2-1901 (1993) — Seepage Analysis and Control for Dams
 *   - Hughes (2000) "The Finite Element Method" — plane strain/stress formulations
 *
 * Modules:
 *   1. 2D Plane-Strain FEM: stress/strain analysis of dam cross-section
 *   2. FDM Seepage: Darcy flow through dam body (pore water pressure)
 *   3. FDM Thermal: temperature distribution through structure
 *
 * Mesh: Triangular elements (CST — Constant Strain Triangle)
 * Solver: Direct (Gaussian elimination) for small meshes, Jacobi iteration for larger
 */

import { createLogger } from '../_core/logger';

const log = createLogger('fem-engine');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Node2D {
  id: number;
  x: number;    // meters
  y: number;    // meters
}

export interface TriElement {
  id: number;
  nodes: [number, number, number]; // 3 node IDs (CST)
  materialId: number;
}

export interface Material {
  id: number;
  name: string;
  E: number;           // Young's modulus (Pa) — typical rock/concrete: 20-40 GPa
  nu: number;          // Poisson's ratio — concrete: 0.15-0.20, rock: 0.25
  rho: number;         // Density (kg/m³)
  k: number;           // Permeability (m/s) — for seepage (Darcy 1856)
  thermalK: number;    // Thermal conductivity (W/m·K) — for Fourier
  specificHeat: number; // Specific heat capacity (J/kg·K)
}

export interface BoundaryCondition {
  nodeId: number;
  type: 'displacement' | 'force' | 'pressure' | 'temperature' | 'head';
  dof: 'x' | 'y' | 'scalar';
  value: number;
}

export interface Mesh2D {
  nodes: Node2D[];
  elements: TriElement[];
  materials: Material[];
}

export interface StressResult {
  elementId: number;
  sigmaX: number;     // Normal stress X (Pa)
  sigmaY: number;     // Normal stress Y (Pa)
  tauXY: number;      // Shear stress (Pa)
  vonMises: number;   // Von Mises equivalent stress (Pa)
  principalMax: number;
  principalMin: number;
  safetyFactor: number; // ratio to material strength
}

export interface DisplacementResult {
  nodeId: number;
  ux: number;  // displacement X (m)
  uy: number;  // displacement Y (m)
  magnitude: number;
}

export interface SeepageResult {
  nodeId: number;
  head: number;           // hydraulic head (m)
  pressure: number;       // pore water pressure (Pa)
  velocityX: number;      // seepage velocity X (m/s)
  velocityY: number;      // seepage velocity Y (m/s)
  gradient: number;       // hydraulic gradient (dimensionless)
}

export interface ThermalResult {
  nodeId: number;
  temperature: number;    // °C
  heatFluxX: number;      // W/m²
  heatFluxY: number;      // W/m²
}

export interface FEMAnalysisResult {
  type: 'stress' | 'seepage' | 'thermal';
  mesh: { nodeCount: number; elementCount: number };
  stresses?: StressResult[];
  displacements?: DisplacementResult[];
  seepage?: SeepageResult[];
  thermal?: ThermalResult[];
  summary: {
    maxVonMises?: number;
    maxDisplacement?: number;
    maxSeepageVelocity?: number;
    maxTemperature?: number;
    minSafetyFactor?: number;
    solverIterations: number;
    solveTimeMs: number;
  };
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINEAR ALGEBRA (Gaussian elimination, Jacobi iteration)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve Ax = b via Gaussian elimination with partial pivoting.
 * Suitable for small-to-medium meshes (N < 500).
 * Ref: Golub & Van Loan (2013) "Matrix Computations" 4th ed.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(M[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }
    if (maxVal < 1e-15) continue; // singular

    // Swap rows
    if (maxRow !== col) {
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    x[i] = Math.abs(M[i][i]) > 1e-15 ? sum / M[i][i] : 0;
  }
  return x;
}

/**
 * Jacobi iterative solver for sparse systems (seepage/thermal).
 * Converges for diagonally dominant matrices (typical in FDM).
 * Ref: Young (1971) "Iterative Solution of Large Linear Systems"
 */
function solveJacobi(A: number[][], b: number[], maxIter: number = 500, tol: number = 1e-8): { x: number[]; iterations: number } {
  const n = b.length;
  let x = new Array(n).fill(0);
  let xNew = new Array(n).fill(0);
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      let sum = b[i];
      for (let j = 0; j < n; j++) {
        if (j !== i) sum -= A[i][j] * x[j];
      }
      xNew[i] = Math.abs(A[i][i]) > 1e-15 ? sum / A[i][i] : 0;
      maxDiff = Math.max(maxDiff, Math.abs(xNew[i] - x[i]));
    }
    [x, xNew] = [xNew, x]; // swap
    iterations = iter + 1;
    if (maxDiff < tol) break;
  }
  return { x, iterations };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CST ELEMENT (Constant Strain Triangle — Zienkiewicz & Taylor 2000 Ch.6)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute CST element stiffness matrix [6×6] for plane strain.
 * Uses linear shape functions: N1 = (a1 + b1*x + c1*y) / (2*Area)
 * Ref: Hughes (2000) §3.4; Bathe (2014) §5.4
 */
function cstStiffness(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  E: number, nu: number, thickness: number = 1,
): number[][] {
  // Element area (shoelace formula)
  const area = 0.5 * Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1));
  if (area < 1e-12) return Array.from({ length: 6 }, () => new Array(6).fill(0));

  // Shape function derivatives (constant over element)
  const b1 = y2 - y3, b2 = y3 - y1, b3 = y1 - y2;
  const c1 = x3 - x2, c2 = x1 - x3, c3 = x2 - x1;

  // B matrix [3×6] — strain-displacement (B = ∂N/∂x)
  const invArea2 = 1 / (2 * area);
  const B: number[][] = [
    [b1 * invArea2, 0, b2 * invArea2, 0, b3 * invArea2, 0],
    [0, c1 * invArea2, 0, c2 * invArea2, 0, c3 * invArea2],
    [c1 * invArea2, b1 * invArea2, c2 * invArea2, b2 * invArea2, c3 * invArea2, b3 * invArea2],
  ];

  // D matrix [3×3] — constitutive (plane strain)
  const factor = E / ((1 + nu) * (1 - 2 * nu));
  const D: number[][] = [
    [factor * (1 - nu), factor * nu, 0],
    [factor * nu, factor * (1 - nu), 0],
    [0, 0, factor * (1 - 2 * nu) / 2],
  ];

  // K = B^T · D · B · area · thickness
  // First compute DB = D * B [3×6]
  const DB: number[][] = Array.from({ length: 3 }, () => new Array(6).fill(0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 6; j++) {
      for (let k = 0; k < 3; k++) {
        DB[i][j] += D[i][k] * B[k][j];
      }
    }
  }

  // K = B^T * DB * area * thickness [6×6]
  const K: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      for (let k = 0; k < 3; k++) {
        K[i][j] += B[k][i] * DB[k][j];
      }
      K[i][j] *= area * thickness;
    }
  }

  return K;
}

/**
 * Compute element stresses from nodal displacements.
 * σ = D · B · u (constant over CST element)
 */
function cstStress(
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  E: number, nu: number, u: number[],
): { sigmaX: number; sigmaY: number; tauXY: number } {
  const area = 0.5 * Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1));
  if (area < 1e-12) return { sigmaX: 0, sigmaY: 0, tauXY: 0 };

  const b1 = y2 - y3, b2 = y3 - y1, b3 = y1 - y2;
  const c1 = x3 - x2, c2 = x1 - x3, c3 = x2 - x1;
  const invArea2 = 1 / (2 * area);

  // Strain ε = B · u
  const eps_x = invArea2 * (b1 * u[0] + b2 * u[2] + b3 * u[4]);
  const eps_y = invArea2 * (c1 * u[1] + c2 * u[3] + c3 * u[5]);
  const gamma_xy = invArea2 * (c1 * u[0] + b1 * u[1] + c2 * u[2] + b2 * u[3] + c3 * u[4] + b3 * u[5]);

  // Stress σ = D · ε
  const factor = E / ((1 + nu) * (1 - 2 * nu));
  const sigmaX = factor * ((1 - nu) * eps_x + nu * eps_y);
  const sigmaY = factor * (nu * eps_x + (1 - nu) * eps_y);
  const tauXY = factor * ((1 - 2 * nu) / 2) * gamma_xy;

  return { sigmaX, sigmaY, tauXY };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2D PLANE-STRAIN FEM SOLVER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve 2D plane-strain stress analysis.
 * Assembles global stiffness, applies BCs, solves for displacements,
 * then computes element stresses + Von Mises + safety factor.
 */
export function solveStress(
  mesh: Mesh2D,
  boundaries: BoundaryCondition[],
  gravity: boolean = true,
): FEMAnalysisResult {
  const startTime = Date.now();
  const warnings: string[] = [];
  const nNodes = mesh.nodes.length;
  const nDOF = nNodes * 2;

  // Build node index map
  const nodeIndex = new Map<number, number>();
  mesh.nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  // Assemble global stiffness matrix
  const K: number[][] = Array.from({ length: nDOF }, () => new Array(nDOF).fill(0));
  const F: number[] = new Array(nDOF).fill(0);

  for (const elem of mesh.elements) {
    const mat = mesh.materials.find(m => m.id === elem.materialId) ?? mesh.materials[0];
    const i0 = nodeIndex.get(elem.nodes[0])!;
    const i1 = nodeIndex.get(elem.nodes[1])!;
    const i2 = nodeIndex.get(elem.nodes[2])!;
    const n0 = mesh.nodes[i0], n1 = mesh.nodes[i1], n2 = mesh.nodes[i2];

    const Ke = cstStiffness(n0.x, n0.y, n1.x, n1.y, n2.x, n2.y, mat.E, mat.nu);

    // Local-to-global DOF mapping
    const dofs = [i0 * 2, i0 * 2 + 1, i1 * 2, i1 * 2 + 1, i2 * 2, i2 * 2 + 1];

    // Assemble
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        K[dofs[r]][dofs[c]] += Ke[r][c];
      }
    }

    // Gravity body force (ICOLD B.155 §3.2)
    if (gravity) {
      const area = 0.5 * Math.abs((n1.x - n0.x) * (n2.y - n0.y) - (n2.x - n0.x) * (n1.y - n0.y));
      const bodyForceY = -mat.rho * 9.81 * area / 3; // distributed equally to 3 nodes
      F[i0 * 2 + 1] += bodyForceY;
      F[i1 * 2 + 1] += bodyForceY;
      F[i2 * 2 + 1] += bodyForceY;
    }
  }

  // Apply boundary conditions
  for (const bc of boundaries) {
    const ni = nodeIndex.get(bc.nodeId);
    if (ni === undefined) continue;

    if (bc.type === 'displacement') {
      const dof = bc.dof === 'x' ? ni * 2 : ni * 2 + 1;
      // Penalty method (Bathe 2014 §4.2.3)
      const penalty = 1e20;
      K[dof][dof] += penalty;
      F[dof] += penalty * bc.value;
    } else if (bc.type === 'force') {
      const dof = bc.dof === 'x' ? ni * 2 : ni * 2 + 1;
      F[dof] += bc.value;
    } else if (bc.type === 'pressure') {
      // Hydrostatic pressure on face — simplified as nodal force
      F[ni * 2] += bc.value * (bc.dof === 'x' ? 1 : 0);
      F[ni * 2 + 1] += bc.value * (bc.dof === 'y' ? 1 : 0);
    }
  }

  // Solve K·u = F
  let displacements: number[];
  let solverIter = 1;
  if (nDOF <= 200) {
    displacements = solveLinearSystem(K, F);
  } else {
    const result = solveJacobi(K, F, 1000, 1e-10);
    displacements = result.x;
    solverIter = result.iterations;
    if (solverIter >= 1000) warnings.push('Jacobi solver did not converge in 1000 iterations');
  }

  // Extract results
  const dispResults: DisplacementResult[] = mesh.nodes.map((n, i) => ({
    nodeId: n.id,
    ux: displacements[i * 2],
    uy: displacements[i * 2 + 1],
    magnitude: Math.sqrt(displacements[i * 2] ** 2 + displacements[i * 2 + 1] ** 2),
  }));

  // Compute element stresses
  const stressResults: StressResult[] = mesh.elements.map(elem => {
    const mat = mesh.materials.find(m => m.id === elem.materialId) ?? mesh.materials[0];
    const i0 = nodeIndex.get(elem.nodes[0])!;
    const i1 = nodeIndex.get(elem.nodes[1])!;
    const i2 = nodeIndex.get(elem.nodes[2])!;
    const n0 = mesh.nodes[i0], n1 = mesh.nodes[i1], n2 = mesh.nodes[i2];

    const u = [
      displacements[i0 * 2], displacements[i0 * 2 + 1],
      displacements[i1 * 2], displacements[i1 * 2 + 1],
      displacements[i2 * 2], displacements[i2 * 2 + 1],
    ];

    const { sigmaX, sigmaY, tauXY } = cstStress(n0.x, n0.y, n1.x, n1.y, n2.x, n2.y, mat.E, mat.nu, u);

    // Von Mises equivalent stress
    const vonMises = Math.sqrt(sigmaX ** 2 - sigmaX * sigmaY + sigmaY ** 2 + 3 * tauXY ** 2);

    // Principal stresses
    const avg = (sigmaX + sigmaY) / 2;
    const R = Math.sqrt(((sigmaX - sigmaY) / 2) ** 2 + tauXY ** 2);
    const principalMax = avg + R;
    const principalMin = avg - R;

    // Safety factor (concrete compressive: ~30 MPa)
    const compressiveStrength = 30e6;
    const safetyFactor = vonMises > 0 ? compressiveStrength / vonMises : 999;

    return {
      elementId: elem.id,
      sigmaX, sigmaY, tauXY,
      vonMises, principalMax, principalMin,
      safetyFactor: Math.min(safetyFactor, 999),
    };
  });

  return {
    type: 'stress',
    mesh: { nodeCount: nNodes, elementCount: mesh.elements.length },
    stresses: stressResults,
    displacements: dispResults,
    summary: {
      maxVonMises: Math.max(...stressResults.map(s => s.vonMises)),
      maxDisplacement: Math.max(...dispResults.map(d => d.magnitude)),
      minSafetyFactor: Math.min(...stressResults.map(s => s.safetyFactor)),
      solverIterations: solverIter,
      solveTimeMs: Date.now() - startTime,
    },
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FDM SEEPAGE SOLVER (Darcy 1856 + Laplace equation)
// ∇·(k·∇h) = 0  →  k·(∂²h/∂x² + ∂²h/∂y²) = 0
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve 2D seepage (Laplace equation) using FDM on a regular grid.
 * Computes hydraulic head distribution, pore pressure, and flow velocities.
 * Ref: USACE EM 1110-2-1901 (1993); Cedergren (1989) "Seepage, Drainage & Flow Nets"
 */
export function solveSeepage(
  nx: number,          // grid cells in X
  ny: number,          // grid cells in Y
  dx: number,          // cell width (m)
  dy: number,          // cell height (m)
  permeability: number, // k (m/s)
  headBoundary: { left: number; right: number; top?: number; bottom?: number },
): FEMAnalysisResult {
  const startTime = Date.now();
  const warnings: string[] = [];
  const nNodes = nx * ny;

  // Initialize head field
  const head = new Array(nNodes).fill(0);

  // Set boundary conditions
  for (let j = 0; j < ny; j++) {
    head[j * nx] = headBoundary.left;                  // left boundary
    head[j * nx + nx - 1] = headBoundary.right;        // right boundary
  }
  if (headBoundary.top !== undefined) {
    for (let i = 0; i < nx; i++) head[i] = headBoundary.top;
  }
  if (headBoundary.bottom !== undefined) {
    for (let i = 0; i < nx; i++) head[(ny - 1) * nx + i] = headBoundary.bottom;
  }

  // Iterative Laplace solver (Gauss-Seidel SOR)
  // h(i,j) = 0.25 * [h(i-1,j) + h(i+1,j) + h(i,j-1) + h(i,j+1)]
  const omega = 1.5; // SOR relaxation factor (Young 1971)
  let maxIter = 0;

  for (let iter = 0; iter < 2000; iter++) {
    let maxDiff = 0;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        // Skip fixed boundaries
        if (i === 0 || i === nx - 1) continue;

        const idx = j * nx + i;
        const newVal = 0.25 * (
          head[idx - 1] + head[idx + 1] +
          head[idx - nx] + head[idx + nx]
        );
        const update = omega * (newVal - head[idx]);
        head[idx] += update;
        maxDiff = Math.max(maxDiff, Math.abs(update));
      }
    }
    maxIter = iter + 1;
    if (maxDiff < 1e-8) break;
  }

  if (maxIter >= 2000) warnings.push('Seepage solver did not converge in 2000 iterations');

  // Compute flow velocities (Darcy's law: v = -k · ∇h)
  const gamma_w = 9810; // N/m³ (unit weight of water)
  const seepageResults: SeepageResult[] = [];

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      const h = head[idx];

      // Central differences for gradient
      const dhdx = (i > 0 && i < nx - 1)
        ? (head[idx + 1] - head[idx - 1]) / (2 * dx)
        : (i === 0 ? (head[idx + 1] - head[idx]) / dx : (head[idx] - head[idx - 1]) / dx);
      const dhdy = (j > 0 && j < ny - 1)
        ? (head[idx + nx] - head[idx - nx]) / (2 * dy)
        : (j === 0 ? (head[idx + nx] - head[idx]) / dy : (head[idx] - head[idx - nx]) / dy);

      seepageResults.push({
        nodeId: idx,
        head: h,
        pressure: gamma_w * h, // u = γ_w · h (hydrostatic)
        velocityX: -permeability * dhdx,
        velocityY: -permeability * dhdy,
        gradient: Math.sqrt(dhdx ** 2 + dhdy ** 2),
      });
    }
  }

  return {
    type: 'seepage',
    mesh: { nodeCount: nNodes, elementCount: (nx - 1) * (ny - 1) },
    seepage: seepageResults,
    summary: {
      maxSeepageVelocity: Math.max(...seepageResults.map(s => Math.sqrt(s.velocityX ** 2 + s.velocityY ** 2))),
      solverIterations: maxIter,
      solveTimeMs: Date.now() - startTime,
    },
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FDM THERMAL SOLVER (Fourier 1822 — steady-state heat conduction)
// ∇·(k·∇T) = 0
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Solve 2D steady-state thermal conduction on a regular grid.
 * Ref: Fourier (1822); Incropera & DeWitt (2007) "Fundamentals of Heat and Mass Transfer"
 */
export function solveThermal(
  nx: number,
  ny: number,
  dx: number,
  dy: number,
  thermalK: number,    // W/(m·K)
  tempBoundary: { left: number; right: number; top?: number; bottom?: number },
): FEMAnalysisResult {
  const startTime = Date.now();
  const warnings: string[] = [];
  const nNodes = nx * ny;
  const temp = new Array(nNodes).fill((tempBoundary.left + tempBoundary.right) / 2);

  // Set boundary conditions
  for (let j = 0; j < ny; j++) {
    temp[j * nx] = tempBoundary.left;
    temp[j * nx + nx - 1] = tempBoundary.right;
  }
  if (tempBoundary.top !== undefined) {
    for (let i = 0; i < nx; i++) temp[i] = tempBoundary.top;
  }
  if (tempBoundary.bottom !== undefined) {
    for (let i = 0; i < nx; i++) temp[(ny - 1) * nx + i] = tempBoundary.bottom;
  }

  // Gauss-Seidel iteration for Laplace equation (same structure as seepage)
  let maxIter = 0;
  for (let iter = 0; iter < 2000; iter++) {
    let maxDiff = 0;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        const newVal = 0.25 * (
          temp[idx - 1] + temp[idx + 1] +
          temp[idx - nx] + temp[idx + nx]
        );
        maxDiff = Math.max(maxDiff, Math.abs(newVal - temp[idx]));
        temp[idx] = newVal;
      }
    }
    maxIter = iter + 1;
    if (maxDiff < 1e-8) break;
  }

  if (maxIter >= 2000) warnings.push('Thermal solver did not converge in 2000 iterations');

  // Compute heat flux (q = -k · ∇T)
  const thermalResults: ThermalResult[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      const dTdx = (i > 0 && i < nx - 1)
        ? (temp[idx + 1] - temp[idx - 1]) / (2 * dx)
        : (i === 0 ? (temp[idx + 1] - temp[idx]) / dx : (temp[idx] - temp[idx - 1]) / dx);
      const dTdy = (j > 0 && j < ny - 1)
        ? (temp[idx + nx] - temp[idx - nx]) / (2 * dy)
        : (j === 0 ? (temp[idx + nx] - temp[idx]) / dy : (temp[idx] - temp[idx - nx]) / dy);

      thermalResults.push({
        nodeId: idx,
        temperature: temp[idx],
        heatFluxX: -thermalK * dTdx,
        heatFluxY: -thermalK * dTdy,
      });
    }
  }

  return {
    type: 'thermal',
    mesh: { nodeCount: nNodes, elementCount: (nx - 1) * (ny - 1) },
    thermal: thermalResults,
    summary: {
      maxTemperature: Math.max(...thermalResults.map(t => t.temperature)),
      solverIterations: maxIter,
      solveTimeMs: Date.now() - startTime,
    },
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO MESH GENERATOR (dam cross-section)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a simple triangulated dam cross-section mesh.
 * Trapezoidal profile: top width < bottom width, height H.
 */
export function generateDamMesh(
  height: number = 30,       // m
  baseWidth: number = 25,    // m
  crestWidth: number = 5,    // m
  nDivisionsX: number = 8,
  nDivisionsY: number = 10,
): { mesh: Mesh2D; boundaries: BoundaryCondition[] } {
  const nodes: Node2D[] = [];
  const elements: TriElement[] = [];

  // Generate nodes
  let nodeId = 0;
  for (let j = 0; j <= nDivisionsY; j++) {
    const t = j / nDivisionsY; // 0 = top, 1 = bottom
    const y = height * (1 - t);
    const halfWidth = (crestWidth + (baseWidth - crestWidth) * t) / 2;

    for (let i = 0; i <= nDivisionsX; i++) {
      const s = i / nDivisionsX; // 0 = left, 1 = right
      const x = -halfWidth + 2 * halfWidth * s;
      nodes.push({ id: nodeId++, x, y });
    }
  }

  // Generate triangular elements (2 triangles per quad)
  let elemId = 0;
  for (let j = 0; j < nDivisionsY; j++) {
    for (let i = 0; i < nDivisionsX; i++) {
      const n00 = j * (nDivisionsX + 1) + i;
      const n10 = n00 + 1;
      const n01 = (j + 1) * (nDivisionsX + 1) + i;
      const n11 = n01 + 1;

      elements.push({ id: elemId++, nodes: [n00, n10, n01], materialId: 0 });
      elements.push({ id: elemId++, nodes: [n10, n11, n01], materialId: 0 });
    }
  }

  // Default concrete material
  const materials: Material[] = [{
    id: 0,
    name: 'Concrete C25',
    E: 25e9,             // 25 GPa
    nu: 0.18,            // Poisson's ratio for concrete
    rho: 2400,           // kg/m³
    k: 1e-9,             // very low permeability
    thermalK: 1.5,       // W/(m·K)
    specificHeat: 900,   // J/(kg·K)
  }];

  // Boundary conditions
  const boundaries: BoundaryCondition[] = [];

  // Fixed base (bottom row)
  for (let i = 0; i <= nDivisionsX; i++) {
    const bottomNodeId = nDivisionsY * (nDivisionsX + 1) + i;
    boundaries.push({ nodeId: bottomNodeId, type: 'displacement', dof: 'x', value: 0 });
    boundaries.push({ nodeId: bottomNodeId, type: 'displacement', dof: 'y', value: 0 });
  }

  // Hydrostatic pressure on upstream face (left column)
  for (let j = 0; j <= nDivisionsY; j++) {
    const leftNodeId = j * (nDivisionsX + 1);
    const nodeY = nodes[leftNodeId].y;
    const waterLevel = height * 0.85; // 85% full
    if (nodeY < waterLevel) {
      const pressure = 9810 * (waterLevel - nodeY); // γ_w · (H - y)
      boundaries.push({ nodeId: leftNodeId, type: 'pressure', dof: 'x', value: pressure });
    }
  }

  return { mesh: { nodes, elements, materials }, boundaries };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function initFEMEngine(): Promise<void> {
  log.info('[FEM] Physics Engine initialized — Zienkiewicz & Taylor (2000) + Darcy (1856) + Fourier (1822)');
  log.info('[FEM] Modules: 2D Plane-Strain FEM (CST) | FDM Seepage | FDM Thermal');
  log.info('[FEM] Solvers: Gaussian Elimination + Jacobi Iteration + Gauss-Seidel SOR');

  // Self-test with demo mesh
  const { mesh, boundaries } = generateDamMesh(30, 25, 5, 6, 8);
  const stressResult = solveStress(mesh, boundaries);
  log.info(
    `[FEM] Self-test: ${mesh.nodes.length} nodes, ${mesh.elements.length} elements | ` +
    `maxσ_VM=${(stressResult.summary.maxVonMises! / 1e6).toFixed(2)} MPa | ` +
    `maxDisp=${(stressResult.summary.maxDisplacement! * 1000).toFixed(4)} mm | ` +
    `SF=${stressResult.summary.minSafetyFactor!.toFixed(1)} | ` +
    `${stressResult.summary.solveTimeMs}ms`
  );

  const seepageResult = solveSeepage(20, 15, 1.25, 2.0, 1e-7, { left: 25, right: 0 });
  log.info(
    `[FEM] Seepage self-test: ${seepageResult.mesh.nodeCount} nodes | ` +
    `maxV=${seepageResult.summary.maxSeepageVelocity!.toExponential(2)} m/s | ` +
    `${seepageResult.summary.solveTimeMs}ms`
  );
}
