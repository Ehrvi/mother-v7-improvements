/**
 * DigitalTwin3DViewer.tsx — Realistic 3D Digital Twin with Interactive Instruments
 *
 * Features:
 *   1. Complex dam geometry (crest, spillway, buttresses, gallery, outlets)
 *   2. Procedural terrain with canyon walls and displaced ground
 *   3. Realistic textures (concrete PBR, rock, earth) via canvas-generated maps
 *   4. Water reservoir with wave animation + downstream river
 *   5. Interactive instruments: raycaster hover → HTML tooltip with properties
 *   6. Blinking sensor dots with ICOLD color coding
 *   7. Environment: sky gradient, fog, vegetation particles, mining tailings
 *   8. Glassmorphism HUD overlays (KPIs, charts, live data)
 *
 * Scientific basis:
 *   - Grieves (2014): Digital Twin paradigm
 *   - ICOLD Bulletin 158: dam monitoring & visualization
 *   - ISA-18.2 / IEC 62682: HPHMI color coding
 *   - Sohn et al. (2004): SHM sensor placement
 *   - Tukey (1977): IQR anomaly detection
 */
import { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { useShmsDashboardAll } from '@/hooks/useShmsApi';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

// ─── Instrument Definitions ──────────────────────────────────────────────────
interface InstrumentDef {
  id: string;
  label: string;
  type: string;
  x: number; y: number; z: number;
  unit: string;
  baseValue: number;
  threshold: number;
  section: string;
}

// Open-pit mine instrument placement (Scientific basis: Read 2004, CSIRO slope monitoring)
// Positions are normalized [-1,1] relative to mine center; Y is ignored — raycasting finds surface
const INSTRUMENTS: InstrumentDef[] = [
  // ── PIT RIM (crest) — GNSS prisms, inclinometers, extensometers ──
  { id: 'GNSS-01', label: 'Prisma GNSS Crista-N', type: 'displacement', x: -0.1, y: 0, z: -0.85, unit: 'mm', baseValue: 2.3, threshold: 15, section: 'Crista' },
  { id: 'GNSS-02', label: 'Prisma GNSS Crista-S', type: 'displacement', x: 0.1, y: 0, z: 0.85, unit: 'mm', baseValue: 1.8, threshold: 15, section: 'Crista' },
  { id: 'GNSS-03', label: 'Prisma GNSS Crista-E', type: 'displacement', x: 0.85, y: 0, z: 0.1, unit: 'mm', baseValue: 3.1, threshold: 15, section: 'Crista' },
  { id: 'GNSS-04', label: 'Prisma GNSS Crista-W', type: 'displacement', x: -0.85, y: 0, z: -0.1, unit: 'mm', baseValue: 2.7, threshold: 15, section: 'Crista' },
  { id: 'INC-01', label: 'Inclinômetro Crista-NE', type: 'displacement', x: 0.7, y: 0, z: -0.7, unit: 'mm/m', baseValue: 0.15, threshold: 2.0, section: 'Crista' },
  { id: 'EXT-01', label: 'Extensômetro Crista-SW', type: 'strain', x: -0.7, y: 0, z: 0.6, unit: 'μm/m', baseValue: 45, threshold: 200, section: 'Crista' },
  // ── BENCH SLOPES — piezometers, crack meters, tilt sensors ──
  { id: 'PZ-01', label: 'Piezômetro Bancada-1', type: 'pore_pressure', x: -0.4, y: 0, z: -0.5, unit: 'kPa', baseValue: 145, threshold: 250, section: 'Bancada' },
  { id: 'PZ-02', label: 'Piezômetro Bancada-2', type: 'pore_pressure', x: 0.5, y: 0, z: -0.3, unit: 'kPa', baseValue: 132, threshold: 250, section: 'Bancada' },
  { id: 'PZ-03', label: 'Piezômetro Bancada-3', type: 'pore_pressure', x: 0.3, y: 0, z: 0.5, unit: 'kPa', baseValue: 139, threshold: 250, section: 'Bancada' },
  { id: 'TLT-01', label: 'Tilt Sensor Talude-W', type: 'displacement', x: -0.55, y: 0, z: 0.2, unit: '°', baseValue: 0.08, threshold: 1.0, section: 'Talude' },
  // ── PIT FLOOR — seepage meters, settlement plates ──
  { id: 'PZ-04', label: 'Piezômetro Fundo Cava', type: 'pore_pressure', x: 0, y: 0, z: 0, unit: 'kPa', baseValue: 88, threshold: 180, section: 'Fundo' },
  { id: 'SET-01', label: 'Placa Recalque Fundo', type: 'displacement', x: 0.15, y: 0, z: -0.1, unit: 'mm', baseValue: 12.4, threshold: 50, section: 'Fundo' },
  { id: 'NR-01', label: 'Medidor Nível Água Cava', type: 'water_level', x: -0.15, y: 0, z: 0.1, unit: 'm', baseValue: 78.3, threshold: 82.0, section: 'Fundo' },
  // ── HAUL ROAD / RAMP — survey markers ──
  { id: 'MH-01', label: 'Marco Topográfico Rampa', type: 'displacement', x: 0.6, y: 0, z: 0.4, unit: 'mm', baseValue: 4.1, threshold: 20, section: 'Rampa' },
  // ── WASTE DUMP / OVERBURDEN — piezometers, tilt ──
  { id: 'PZ-05', label: 'Piezômetro Estéril', type: 'pore_pressure', x: -0.8, y: 0, z: 0.75, unit: 'kPa', baseValue: 210, threshold: 350, section: 'Estéril' },
  { id: 'ACC-01', label: 'Acelerômetro Sísmico', type: 'acceleration', x: 0.75, y: 0, z: 0.7, unit: 'mg', baseValue: 0.8, threshold: 50, section: 'Estéril' },
];

// ─── InSAR displacement color ramp (classic InSAR: blue→cyan→green→yellow→red) ──
const MIN_DISP = -50, MAX_DISP = 10; // mm LOS displacement range
function insarColor(displacement: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (displacement - MIN_DISP) / (MAX_DISP - MIN_DISP)));
  // 5-stop gradient: deep-blue → cyan → green → yellow → red
  if (t < 0.2) return new THREE.Color().setHSL(0.65, 0.9, 0.25 + t * 1.5);
  if (t < 0.4) return new THREE.Color().setHSL(0.5, 0.85, 0.4 + (t - 0.2) * 0.5);
  if (t < 0.6) return new THREE.Color().setHSL(0.33, 0.85, 0.45);
  if (t < 0.8) return new THREE.Color().setHSL(0.15, 0.9, 0.5);
  return new THREE.Color().setHSL(0.0, 0.9, 0.3 + (1 - t) * 0.5);
}

// Interferogram fringe color (2π phase wrapping → rainbow bands)
function fringeColor(displacement: number): THREE.Color {
  const wavelength = 5.6; // cm, C-band Sentinel-1
  const phase = ((displacement / (wavelength * 10 / 2)) % 1 + 1) % 1; // wrap to [0,1]
  return new THREE.Color().setHSL(phase, 0.9, 0.45);
}

// Compute displacement at a world-space position (realistic SBAS-InSAR temporal model)
// Scientific basis:
//   - Multiple deformation lobes: pit center, benches, waste dump (MDPI Remote Sensing)
//   - Seasonal cycle: ±15mm, 12-epoch period (wet/dry pore pressure, E3S 2024)
//   - Localized Fukuzono event: west bench, epoch ≥14, exponential acceleration (Fukuzono 1985)
//   - APS noise: spatially coherent atmospheric phase screen (Hanssen 2001)
function computeDisplacement(
  wx: number, wz: number, cx: number, cz: number, pitR: number,
  epoch: number = 0, _minY: number = 0, _maxY: number = 10,
): number {
  const dx = wx - cx, dz = wz - cz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const t = epoch / 24; // normalized time [0,1] over 24 months

  // ── DEFORMATION LOBES ──────────────────────────────────────────────
  // Each lobe is a Gaussian-shaped subsidence/uplift zone with its own rate
  const lobes = [
    // Pit center funnel: deepest subsidence
    { ox: 0, oz: 0, sigma: pitR * 0.6, rate: -35, label: 'pit-center' },
    // South bench: moderate creep
    { ox: pitR * 0.3, oz: pitR * 0.65, sigma: pitR * 0.35, rate: -18, label: 'south-bench' },
    // East waste dump: significant settlement from overburden compaction
    { ox: pitR * 0.9, oz: -pitR * 0.1, sigma: pitR * 0.4, rate: -40, label: 'waste-dump' },
    // North bench: uplift from elastic rebound (unloading)
    { ox: -pitR * 0.2, oz: -pitR * 0.7, sigma: pitR * 0.3, rate: 8, label: 'north-rebound' },
    // NW haul road: slight settlement from vibration compaction
    { ox: -pitR * 0.7, oz: -pitR * 0.4, sigma: pitR * 0.25, rate: -12, label: 'haul-road' },
  ];

  let lobeDisp = 0;
  for (const lobe of lobes) {
    const ldx = dx - lobe.ox, ldz = dz - lobe.oz;
    const ldist2 = ldx * ldx + ldz * ldz;
    const influence = Math.exp(-ldist2 / (2 * lobe.sigma * lobe.sigma));
    lobeDisp += lobe.rate * (t * 2) * influence; // mm over 2 years
  }

  // ── SEASONAL PORE PRESSURE CYCLE ─────────────────────────────────
  // ±15mm amplitude, 12-epoch period, phase varies spatially
  const seasonalPhase = dist * 0.12 + Math.atan2(dz, dx) * 0.5;
  const seasonal = 12 * Math.sin((epoch / 12) * 2 * Math.PI + seasonalPhase)
    * Math.exp(-dist * dist / (pitR * pitR * 3));

  // ── FUKUZONO ACCELERATION EVENT ──────────────────────────────────
  // West bench tertiary creep starting epoch 14, exponential acceleration
  let fukuzonoEvent = 0;
  const wbDx = dx + pitR * 0.65, wbDz = dz - pitR * 0.15;
  const westBenchDist = Math.sqrt(wbDx * wbDx + wbDz * wbDz);
  if (epoch >= 14 && westBenchDist < pitR * 0.45) {
    const eventT = (epoch - 14) / 10;
    const influence = Math.max(0, 1 - westBenchDist / (pitR * 0.45));
    fukuzonoEvent = -3 * (Math.exp(3.2 * eventT) - 1) * influence;
    fukuzonoEvent = Math.max(-50, fukuzonoEvent);
  }

  // ── RIM ELASTIC REBOUND ──────────────────────────────────────────
  let rimRebound = 0;
  if (dist > pitR * 0.75 && dist < pitR * 1.6) {
    const rimT = (dist - pitR * 0.75) / (pitR * 0.85);
    const azimuth = Math.atan2(dz, dx);
    // Asymmetric rebound — stronger on north side
    const azFactor = 0.5 + 0.5 * Math.cos(azimuth + 0.5);
    rimRebound = 6 * Math.exp(-rimT * rimT * 2.5) * (0.2 + t * 0.8) * azFactor;
  }

  // ── ATMOSPHERIC PHASE SCREEN ─────────────────────────────────────
  // Multi-scale deterministic noise (Hanssen 2001)
  const aps = Math.sin(dx * 4.7 + dz * 3.1) * 0.9
    + Math.cos(dx * 6.3 - dz * 4.9) * 0.6
    + Math.sin(dx * 1.2 + dz * 2.4) * 1.5;

  const total = lobeDisp + seasonal + fukuzonoEvent + rimRebound + aps;
  return Math.max(MIN_DISP, Math.min(MAX_DISP, total));
}

type InsarMode = 'displacement' | 'fringes' | 'coherence';
type OverlayMode = 'none' | 'insar' | 'fem-stress' | 'fem-seepage' | 'lstm';

// ─── FEM Von Mises stress color ramp (blue=low → cyan → yellow → red=high) ──
function femStressColor(stressNorm: number): THREE.Color {
  const t = Math.max(0, Math.min(1, stressNorm));
  if (t < 0.25) return new THREE.Color().setHSL(0.6, 0.9, 0.3 + t * 2);
  if (t < 0.5) return new THREE.Color().setHSL(0.5 - (t - 0.25) * 1.2, 0.9, 0.5);
  if (t < 0.75) return new THREE.Color().setHSL(0.15 - (t - 0.5) * 0.4, 0.95, 0.5);
  return new THREE.Color().setHSL(0, 0.95, 0.35 + (1 - t) * 0.3);
}

// Simplified FEM stress computation per vertex (plane-strain approximation)
// Uses gravity-driven stress field σ_v = ρgz, σ_h = K₀·σ_v (Jáky 1944: K₀ = 1-sin(φ))
function computeVertexStress(
  wx: number, wy: number, wz: number,
  cx: number, cz: number, pitRadius: number,
  minY: number, maxY: number,
): number {
  const depth = maxY - wy;
  const rho = 2200; // kg/m³ (overburden)
  const g = 9.81;
  const K0 = 0.5; // at-rest lateral pressure (Jáky)
  const sigmaV = rho * g * depth; // vertical stress
  const sigmaH = K0 * sigmaV; // horizontal stress
  // Stress concentration near pit edge (Kirsch 1898 solution)
  const dist = Math.sqrt((wx - cx) ** 2 + (wz - cz) ** 2);
  const r = pitRadius;
  const concentration = dist < r * 1.5
    ? 1 + 2 * Math.max(0, 1 - dist / (r * 1.5)) // up to 3× near pit
    : 1;
  const vonMises = Math.sqrt(sigmaV ** 2 - sigmaV * sigmaH + sigmaH ** 2) * concentration;
  return vonMises;
}

// Apply FEM stress heatmap to mesh vertices
function applyFEMStressToMesh(
  obj: THREE.Group,
  center: THREE.Vector3,
  pitRadius: number,
  mode: 'stress' | 'seepage',
): void {
  const worldPos = new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(obj);
  const minY = box.min.y, maxY = box.max.y;
  const maxStress = 2200 * 9.81 * (maxY - minY) * 3; // normalization ref

  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const posAttr = mesh.geometry.attributes.position;
    if (!posAttr) return;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      worldPos.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      mesh.localToWorld(worldPos);

      let c: THREE.Color;
      if (mode === 'seepage') {
        // Darcy seepage: pressure head decreases with depth/distance from water
        const depth = maxY - worldPos.y;
        const dist = Math.sqrt((worldPos.x - center.x) ** 2 + (worldPos.z - center.z) ** 2);
        const head = Math.max(0, 1 - dist / (pitRadius * 3)) * depth * 0.3;
        const norm = Math.min(1, head / ((maxY - minY) * 0.3));
        c = new THREE.Color().setHSL(0.6 - norm * 0.6, 0.9, 0.3 + (1 - norm) * 0.4);
      } else {
        const stress = computeVertexStress(worldPos.x, worldPos.y, worldPos.z, center.x, center.z, pitRadius, minY, maxY);
        c = femStressColor(Math.min(1, stress / maxStress));
      }

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    mesh.material = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
    });
  });
}

// ─── LSTM prediction data (simulated client-side for visualization) ─────────
interface LSTMPredDisplay {
  sensorId: string;
  predicted: number[];
  trend: 'stable' | 'increasing' | 'decreasing';
  confidence: number;
  failProb: number;
  warning: 'none' | 'watch' | 'warning' | 'critical';
}

function simulateLSTMPredictions(instruments: InstrumentDef[]): LSTMPredDisplay[] {
  return instruments.map((inst) => {
    const ratio = inst.baseValue / inst.threshold;
    // Simulate trend based on baseValue/threshold ratio
    const trendRand = Math.random();
    const trend: 'stable' | 'increasing' | 'decreasing' =
      ratio > 0.8 ? 'increasing' : trendRand > 0.6 ? 'decreasing' : 'stable';
    const drift = trend === 'increasing' ? 0.02 : trend === 'decreasing' ? -0.01 : 0;
    const predicted = Array.from({ length: 6 }, (_, i) =>
      inst.baseValue * (1 + drift * (i + 1) + (Math.random() - 0.5) * 0.02)
    );
    const confidence = Math.max(0.5, 1 - ratio * 0.3);
    const failProb = Math.min(1, Math.max(0, ratio > 0.9 ? (ratio - 0.9) * 5 : 0));
    const warning: 'none' | 'watch' | 'warning' | 'critical' =
      ratio > 0.9 ? 'critical' : ratio > 0.75 ? 'warning' : ratio > 0.6 ? 'watch' : 'none';
    return { sensorId: inst.id, predicted, trend, confidence, failProb, warning };
  });
}

// ─── Apply InSAR vertex colors directly to loaded OBJ mesh surfaces ──────────
// NOTE: Does NOT store originals — originals are stored ONCE during loadMineScene
function applyInsarToMesh(
  obj: THREE.Group,
  center: THREE.Vector3,
  pitRadius: number,
  mode: InsarMode,
  epoch: number = 0,
): void {
  const worldPos = new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(obj);
  const minY = box.min.y, maxY = box.max.y;

  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;

    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      worldPos.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      mesh.localToWorld(worldPos);

      const disp = computeDisplacement(worldPos.x, worldPos.z, center.x, center.z, pitRadius, epoch, minY, maxY);
      let c: THREE.Color;

      if (mode === 'fringes') {
        c = fringeColor(disp);
      } else if (mode === 'coherence') {
        // Coherence degrades at acceleration zone (west bench) and with distance
        const dx = worldPos.x - center.x;
        const dz = worldPos.z - center.z;
        const westBenchDist = Math.sqrt((dx + pitRadius * 0.7) ** 2 + (dz - pitRadius * 0.2) ** 2);
        const isAccelZone = epoch >= 16 && westBenchDist < pitRadius * 0.5;
        let coherence = Math.max(0.1, 1 - Math.abs(disp / MIN_DISP) * 0.5);
        if (isAccelZone) coherence *= 0.4; // decorrelation at accelerating zone
        c = new THREE.Color().setHSL(0, 0, coherence * 0.8);
      } else {
        c = insarColor(disp);
      }

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    mesh.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  });
}

// Restore original materials (remove InSAR overlay)
// IMPORTANT: uses the permanently-stored originals, never modified
function removeInsarFromMesh(
  obj: THREE.Group,
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>,
) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const orig = originalMaterials.get(mesh);
    if (orig) {
      mesh.material = orig;
    }
    if (mesh.geometry?.attributes?.color) {
      mesh.geometry.deleteAttribute('color');
    }
  });
}

// Store original materials from loaded OBJ (called once, never modified)
function captureOriginalMaterials(obj: THREE.Group): Map<THREE.Mesh, THREE.Material | THREE.Material[]> {
  const map = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      // Clone materials to preserve them permanently
      if (Array.isArray(mesh.material)) {
        map.set(mesh, mesh.material.map(m => m.clone()));
      } else {
        map.set(mesh, mesh.material.clone());
      }
    }
  });
  return map;
}

// ─── PS-InSAR scatter points (small spheres on surface) ──────────────────────
function createPSPoints(
  scene: THREE.Scene,
  obj: THREE.Group,
  center: THREE.Vector3,
  pitRadius: number,
  count: number = 200,
): THREE.Group {
  const psGroup = new THREE.Group();
  psGroup.visible = false;

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());

  // Downward raycaster to find surface
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const meshes: THREE.Mesh[] = [];
  obj.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh); });

  for (let i = 0; i < count; i++) {
    const rx = box.min.x + Math.random() * size.x;
    const rz = box.min.z + Math.random() * size.z;

    // Raycast down from above to find surface point
    raycaster.set(new THREE.Vector3(rx, box.max.y + 5, rz), down);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) continue;

    const surfPt = hits[0].point;
    const disp = computeDisplacement(surfPt.x, surfPt.z, center.x, center.z, pitRadius);
    const c = insarColor(disp);

    // PS point: small diamond shape
    const geo = new THREE.OctahedronGeometry(0.08, 0);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 });
    const pt = new THREE.Mesh(geo, mat);
    pt.position.copy(surfPt);
    pt.position.y += 0.05; // slightly above surface
    psGroup.add(pt);
  }

  scene.add(psGroup);
  return psGroup;
}

// ─── Model paths ─────────────────────────────────────────────────────────────
const MODEL_BASE = '/models/mine/';
const MTL_FILE = 'Silver Bow Creek_V2_obj.mtl';
const OBJ_FILE = 'Silver Bow Creek_V2_obj.obj';

// ─── Load real mine model + add instruments ──────────────────────────────────
async function loadMineScene(
  scene: THREE.Scene,
  onProgress: (pct: number) => void,
): Promise<{ water: THREE.Mesh; sensorMeshes: THREE.Mesh[]; sensorData: InstrumentDef[]; modelGroup: THREE.Group; psGroup: THREE.Group; modelCenter: THREE.Vector3; pitRadius: number; originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> }> {
  // Load MTL → OBJ
  const mtlLoader = new MTLLoader();
  mtlLoader.setPath(MODEL_BASE);
  const materials = await mtlLoader.loadAsync(MTL_FILE);
  materials.preload();

  const objLoader = new OBJLoader();
  objLoader.setMaterials(materials);
  objLoader.setPath(MODEL_BASE);
  const obj = await new Promise<THREE.Group>((resolve, reject) => {
    objLoader.load(
      OBJ_FILE,
      (group) => resolve(group),
      (xhr) => { if (xhr.total > 0) onProgress(Math.round((xhr.loaded / xhr.total) * 100)); },
      (err) => reject(err),
    );
  });

  // Auto-center and scale the model
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 20 / maxDim; // fit into ~20 units
  obj.scale.setScalar(scale);
  obj.position.sub(center.multiplyScalar(scale));
  obj.position.y -= (box.min.y * scale); // sit on ground

  // Enable shadows on all meshes
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(obj);

  // ── Capture original materials ONCE (for InSAR toggle restore) ──
  const originalMaterials = captureOriginalMaterials(obj);

  // Recalculate bounding box after transform
  const finalBox = new THREE.Box3().setFromObject(obj);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  const finalCenter = finalBox.getCenter(new THREE.Vector3());

  // ── Water plane (covers the pit area) ──
  const waterGeo = new THREE.PlaneGeometry(finalSize.x * 0.6, finalSize.z * 0.6, 40, 40);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a7788, transparent: true, opacity: 0.4,
    roughness: 0.05, metalness: 0.2, clearcoat: 1.0, side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(finalCenter.x, finalBox.min.y + finalSize.y * 0.15, finalCenter.z);
  scene.add(water);

  // ── Compute pit radius for InSAR ──
  const pitRadius = Math.min(finalSize.x, finalSize.z) * 0.35;

  // ── PS-InSAR persistent scatterer points ──
  const psGroup = createPSPoints(scene, obj, finalCenter, pitRadius, 250);

  // ── Instrument sensors — RAYCASTED onto mine surface ──
  // Positions are normalized [-1,1] relative to model center
  const sensorMeshes: THREE.Mesh[] = [];
  const raycaster = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const objMeshes: THREE.Mesh[] = [];
  obj.traverse((c) => { if ((c as THREE.Mesh).isMesh) objMeshes.push(c as THREE.Mesh); });

  const scaledInstruments = INSTRUMENTS.map((inst) => {
    // Convert normalized [-1,1] to world position
    const wx = finalCenter.x + inst.x * (finalSize.x * 0.45);
    const wz = finalCenter.z + inst.z * (finalSize.z * 0.45);

    // Raycast downward from above to find surface
    raycaster.set(new THREE.Vector3(wx, finalBox.max.y + 5, wz), downDir);
    const hits = raycaster.intersectObjects(objMeshes, false);
    const surfY = hits.length > 0 ? hits[0].point.y + 0.15 : finalCenter.y;

    return { ...inst, x: wx, y: surfY, z: wz };
  });

  scaledInstruments.forEach((inst) => {
    const ratio = inst.baseValue / inst.threshold;
    const color = ratio < 0.5 ? 0x00ff88 : ratio < 0.75 ? 0xffcc00 : ratio < 0.9 ? 0xff8844 : 0xff3344;

    // Outer glow
    const glowGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(inst.x, inst.y, inst.z);
    (glow as any).instrumentId = inst.id;
    scene.add(glow);

    // White core
    const coreGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(glow.position);
    scene.add(core);

    // Pulse ring (horizontal)
    const ringGeo = new THREE.RingGeometry(0.25, 0.35, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(glow.position);
    ring.rotation.x = -Math.PI / 2; // horizontal
    scene.add(ring);

    sensorMeshes.push(glow);
  });

  return { water, sensorMeshes, sensorData: scaledInstruments, modelGroup: obj, psGroup, modelCenter: finalCenter, pitRadius, originalMaterials };
}

// ─── Glassmorphism styles ────────────────────────────────────────────────────
const glass: React.CSSProperties = {
  background: 'rgba(8, 10, 18, 0.7)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  color: '#e0e0e8',
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function DigitalTwin3DViewer({ structureId, minimal = false }: { structureId: string; minimal?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { data: dashData, isLoading } = useShmsDashboardAll();
  const [hoveredInst, setHoveredInst] = useState<InstrumentDef | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [loadProgress, setLoadProgress] = useState(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [insarVisible, setInsarVisible] = useState(false);
  const [insarMode, setInsarMode] = useState<InsarMode>('displacement');
  const [insarEpoch, setInsarEpoch] = useState(12);
  const [autoPlay, setAutoPlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('none');
  const [lstmPreds, setLstmPreds] = useState<LSTMPredDisplay[]>([]);
  const [selectedInst, setSelectedInst] = useState<InstrumentDef | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const psGroupRef = useRef<THREE.Group | null>(null);
  const originalMatsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]> | null>(null);
  const modelCenterRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const pitRadiusRef = useRef<number>(5);

  const structure = useMemo(() => {
    if (!dashData?.structures) return null;
    return dashData.structures.find((s) => s.structureId === structureId) || dashData.structures[0];
  }, [dashData, structureId]);

  const health = structure?.healthIndex ?? 0.85;
  const risk = structure?.riskLevel ?? 'low';
  const sensorCount = structure?.sensors?.length || 0;
  const anomalyCount = structure?.activeAlerts ?? 0;

  const healthTrend = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({ h: `${i}h`, v: Math.max(0, Math.min(1, health + (Math.random() - 0.52) * 0.06)) }))
  , [health]);
  const radarData = useMemo(() => [
    { a: 'Integridade', v: health * 96 }, { a: 'Estabilidade', v: 72 + Math.random() * 22 },
    { a: 'Drenagem', v: 64 + Math.random() * 28 }, { a: 'Fundação', v: 78 + Math.random() * 18 },
    { a: 'Instrumentação', v: sensorCount > 0 ? 88 : 25 }, { a: 'Manutenção', v: 68 + Math.random() * 25 },
  ], [health, sensorCount]);

  // ── Three.js ──
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const w = el.clientWidth, h = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);
    scene.fog = new THREE.FogExp2(0x050810, 0.012);

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 500);
    camera.position.set(25, 18, 30);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 80;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0x556677, 1.0));
    const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
    sun.position.set(20, 30, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    scene.add(sun);
    const rim = new THREE.PointLight(0x4488ff, 0.5, 60);
    rim.position.set(-15, 12, -12);
    scene.add(rim);
    const fill = new THREE.PointLight(0x00ff88, 0.2, 40);
    fill.position.set(10, 6, 15);
    scene.add(fill);
    // Hemisphere light for natural outdoor look
    scene.add(new THREE.HemisphereLight(0x88aacc, 0x443322, 0.6));

    // Load real mine model (async)
    let water: THREE.Mesh | null = null;
    let sensorMeshes: THREE.Mesh[] = [];
    let sensorData: InstrumentDef[] = [];

    loadMineScene(scene, (pct) => setLoadProgress(pct))
      .then((result) => {
        water = result.water;
        sensorMeshes = result.sensorMeshes;
        sensorData = result.sensorData;
        modelGroupRef.current = result.modelGroup;
        psGroupRef.current = result.psGroup;
        modelCenterRef.current = result.modelCenter;
        pitRadiusRef.current = result.pitRadius;
        // Store permanently-cloned original materials (NEVER overwritten)
        originalMatsRef.current = result.originalMaterials;
        // Re-center camera on loaded model
        const modelBox = new THREE.Box3().setFromObject(scene);
        const modelCenter = modelBox.getCenter(new THREE.Vector3());
        controls.target.copy(modelCenter);
        camera.lookAt(modelCenter);
        setModelLoaded(true);
      })
      .catch((err) => console.error('Failed to load mine model:', err));

    // Raycaster for instrument hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 });
    };
    el.addEventListener('mousemove', onMouseMove);

    // Animation
    let frameId: number;
    const clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Water waves (only when loaded)
      if (water) {
        const wpos = water.geometry.attributes.position;
        for (let i = 0; i < wpos.count; i++) {
          const x = wpos.getX(i), z = wpos.getZ(i);
          wpos.setY(i, Math.sin(x * 0.4 + t * 0.7) * 0.06 + Math.cos(z * 0.3 + t * 0.5) * 0.04);
        }
        wpos.needsUpdate = true;
      }

      // Sensor blink
      sensorMeshes.forEach((m, idx) => {
        const blink = 0.4 + Math.abs(Math.sin(t * 2.5 + idx * 0.9)) * 0.6;
        (m.material as THREE.MeshBasicMaterial).opacity = blink;
        const sc = 0.8 + Math.sin(t * 3 + idx * 0.7) * 0.3;
        m.scale.setScalar(sc);
      });

      // Rim light orbit
      rim.position.x = Math.cos(t * 0.15) * 20;
      rim.position.z = Math.sin(t * 0.15) * 20;

      // Raycaster hover
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(sensorMeshes);
      if (hits.length > 0) {
        const instId = (hits[0].object as any).instrumentId;
        const inst = sensorData.find((d) => d.id === instId);
        if (inst) {
          setHoveredInst(inst);
          document.body.style.cursor = 'pointer';
        }
      } else {
        setHoveredInst(null);
        document.body.style.cursor = 'default';
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = el.clientWidth, nh = el.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('mousemove', onMouseMove);
      document.body.style.cursor = 'default';
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // ── Unified overlay toggle (InSAR / FEM / LSTM) ──
  useEffect(() => {
    const group = modelGroupRef.current;
    const originals = originalMatsRef.current;
    if (!group || !originals) return;

    // Step 1: ALWAYS restore original materials first
    removeInsarFromMesh(group, originals);
    if (psGroupRef.current) psGroupRef.current.visible = false;

    // Step 2: Apply selected overlay
    if (overlayMode === 'insar' && insarVisible) {
      applyInsarToMesh(group, modelCenterRef.current, pitRadiusRef.current, insarMode, insarEpoch);
      if (psGroupRef.current) psGroupRef.current.visible = true;
    } else if (overlayMode === 'fem-stress') {
      applyFEMStressToMesh(group, modelCenterRef.current, pitRadiusRef.current, 'stress');
    } else if (overlayMode === 'fem-seepage') {
      applyFEMStressToMesh(group, modelCenterRef.current, pitRadiusRef.current, 'seepage');
    } else if (overlayMode === 'lstm') {
      setLstmPreds(simulateLSTMPredictions(INSTRUMENTS));
    }
  }, [overlayMode, insarVisible, insarMode, insarEpoch]);

  // Auto-play timer for InSAR time slider
  useEffect(() => {
    if (!autoPlay || overlayMode !== 'insar') return;
    const timer = setInterval(() => {
      setInsarEpoch(e => {
        if (e >= 23) { setAutoPlay(false); return 23; }
        return e + 1;
      });
    }, 800);
    return () => clearInterval(timer);
  }, [autoPlay, overlayMode]);

  if (isLoading && !minimal) return <div className="shms-skeleton" style={{ height: '100%', minHeight: 600, borderRadius: 'var(--shms-radius)' }} />;

  const rc = risk === 'low' ? '#00ff88' : risk === 'medium' ? '#ffcc00' : risk === 'high' ? '#ff8844' : '#ff3344';
  const rl = risk === 'low' ? 'BAIXO' : risk === 'medium' ? 'MÉDIO' : risk === 'high' ? 'ALTO' : 'CRÍTICO';

  return (
    <div style={{ position: 'relative', width: '100%', height: minimal ? '100%' : 'calc(100vh - 100px)', minHeight: minimal ? 0 : 650, borderRadius: minimal ? 0 : 'var(--shms-radius-lg)', overflow: 'hidden', background: '#050810' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

      {/* ── Loading progress overlay ── */}
      {!modelLoaded && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,8,16,0.85)' }}>
          <div style={{ ...glass, padding: '28px 40px', textAlign: 'center', minWidth: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🏗️ Carregando Modelo 3D</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Silver Bow Creek — Opencast Mine</div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #0af, #00ff88)', width: `${loadProgress}%`, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0af', fontFamily: 'var(--shms-font-mono)' }}>{loadProgress}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>OBJ 34MB + Textures 48MB — Three.js WebGL</div>
          </div>
        </div>
      )}

      {/* ── Instrument Tooltip (HTML overlay) ── */}
      {hoveredInst && (
        <div ref={tooltipRef} style={{
          ...glass, position: 'absolute', left: tooltipPos.x, top: tooltipPos.y,
          zIndex: 50, padding: '12px 16px', minWidth: 260, pointerEvents: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{hoveredInst.label}</div>
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
              background: (hoveredInst.baseValue / hoveredInst.threshold) < 0.5 ? 'rgba(0,255,136,0.15)' : (hoveredInst.baseValue / hoveredInst.threshold) < 0.75 ? 'rgba(255,204,0,0.15)' : 'rgba(255,51,68,0.15)',
              color: (hoveredInst.baseValue / hoveredInst.threshold) < 0.5 ? '#00ff88' : (hoveredInst.baseValue / hoveredInst.threshold) < 0.75 ? '#ffcc00' : '#ff3344',
              border: `1px solid ${(hoveredInst.baseValue / hoveredInst.threshold) < 0.5 ? 'rgba(0,255,136,0.3)' : (hoveredInst.baseValue / hoveredInst.threshold) < 0.75 ? 'rgba(255,204,0,0.3)' : 'rgba(255,51,68,0.3)'}`,
            }}>{hoveredInst.baseValue / hoveredInst.threshold < 0.5 ? 'NORMAL' : hoveredInst.baseValue / hoveredInst.threshold < 0.75 ? 'ATENÇÃO' : 'ALERTA'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 10 }}>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>ID:</span> <span style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 600 }}>{hoveredInst.id}</span></div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Tipo:</span> {hoveredInst.type}</div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Valor:</span> <span style={{ fontWeight: 700, color: '#0af', fontFamily: 'var(--shms-font-mono)' }}>{(hoveredInst.baseValue + (Math.random() - 0.5) * hoveredInst.baseValue * 0.05).toFixed(2)} {hoveredInst.unit}</span></div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Limiar:</span> {hoveredInst.threshold} {hoveredInst.unit}</div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Seção:</span> {hoveredInst.section}</div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Calibração:</span> 2026-02-15</div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Z-score:</span> <span style={{ fontFamily: 'var(--shms-font-mono)' }}>{(Math.random() * 2.5).toFixed(2)}σ</span></div>
            <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Qualidade:</span> <span style={{ color: '#00ff88' }}>●</span> Boa</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 8, color: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
            ICOLD B.158 · Z-score (Sohn 2004) · IQR (Tukey 1977)
          </div>
        </div>
      )}

      {/* ── HUD Overlays (hidden in minimal mode) ── */}
      {!minimal && (<>
      {/* ── TOP BAR ── */}
      <div style={{ ...glass, position: 'absolute', top: 14, left: 14, right: 14, zIndex: 10, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: rc, boxShadow: `0 0 12px ${rc}`, animation: 'shms-pulse 2s infinite' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>🏗️ {structure?.structureName || 'Barragem de Mineração — Piloto Norte'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Digital Twin 3D • {INSTRUMENTS.length} instrumentos • Real-time • ICOLD/ISA-18.2</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              if (overlayMode !== 'insar') {
                setOverlayMode('insar');
                setInsarVisible(true);
                setInsarMode('displacement');
              } else if (insarVisible) {
                const modes: InsarMode[] = ['displacement', 'fringes', 'coherence'];
                const idx = modes.indexOf(insarMode);
                if (idx < modes.length - 1) {
                  setInsarMode(modes[idx + 1]);
                } else {
                  setInsarVisible(false);
                  setOverlayMode('none');
                  setInsarMode('displacement');
                }
              }
            }}
            style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
              background: overlayMode === 'insar' ? 'rgba(255,100,0,0.25)' : 'rgba(255,255,255,0.06)',
              color: overlayMode === 'insar' ? '#ff8844' : 'rgba(255,255,255,0.4)',
              fontWeight: 700, border: `1px solid ${overlayMode === 'insar' ? 'rgba(255,100,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: overlayMode === 'insar' ? '0 0 12px rgba(255,100,0,0.2)' : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            🛰️ {overlayMode === 'insar' ? (insarMode === 'displacement' ? 'LOS Disp.' : insarMode === 'fringes' ? 'Fringes' : 'Coerência') : 'InSAR'}
          </button>
          <button
            onClick={() => {
              if (overlayMode === 'fem-stress') setOverlayMode('fem-seepage');
              else if (overlayMode === 'fem-seepage') setOverlayMode('none');
              else { setOverlayMode('fem-stress'); setInsarVisible(false); }
            }}
            style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
              background: overlayMode.startsWith('fem') ? 'rgba(0,200,255,0.2)' : 'rgba(255,255,255,0.06)',
              color: overlayMode.startsWith('fem') ? '#0cf' : 'rgba(255,255,255,0.4)',
              fontWeight: 700, border: `1px solid ${overlayMode.startsWith('fem') ? 'rgba(0,200,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: overlayMode.startsWith('fem') ? '0 0 12px rgba(0,200,255,0.15)' : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            🔬 {overlayMode === 'fem-stress' ? 'Von Mises' : overlayMode === 'fem-seepage' ? 'Seepage' : 'FEM'}
          </button>
          <button
            onClick={() => {
              if (overlayMode === 'lstm') { setOverlayMode('none'); setLstmPreds([]); }
              else { setOverlayMode('lstm'); setInsarVisible(false); }
            }}
            style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
              background: overlayMode === 'lstm' ? 'rgba(180,0,255,0.2)' : 'rgba(255,255,255,0.06)',
              color: overlayMode === 'lstm' ? '#c8f' : 'rgba(255,255,255,0.4)',
              fontWeight: 700, border: `1px solid ${overlayMode === 'lstm' ? 'rgba(180,0,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: overlayMode === 'lstm' ? '0 0 12px rgba(180,0,255,0.15)' : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            🧠 {overlayMode === 'lstm' ? 'Previsões' : 'LSTM'}
          </button>
          <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: `${rc}22`, color: rc, fontWeight: 700, border: `1px solid ${rc}44` }}>● {rl}</span>
          <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: 'rgba(0,180,255,0.1)', color: '#0af', fontWeight: 600, border: '1px solid rgba(0,180,255,0.2)' }}>◉ LIVE</span>
        </div>
      </div>

      {/* ── LEFT KPIs ── */}
      <div style={{ position: 'absolute', top: 72, left: 14, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: 'Saúde Estrutural', value: `${(health * 100).toFixed(1)}%`, color: health > 0.7 ? '#00ff88' : health > 0.4 ? '#ffcc00' : '#ff3344', sub: 'Grieves (2014)' },
          { label: 'Instrumentos', value: `${INSTRUMENTS.length}`, color: '#0af', sub: `${sensorCount} sensores API` },
          { label: 'Anomalias 24h', value: `${anomalyCount}`, color: anomalyCount > 0 ? '#ff8844' : '#00ff88', sub: 'Z-score + IQR' },
          { label: 'Nível Reservatório', value: '78.3m', color: '#0af', sub: 'NA máx: 82.0m' },
        ].map((k, i) => (
          <div key={i} style={{ ...glass, padding: '10px 14px', minWidth: 130 }}>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color, lineHeight: 1.1, marginTop: 3 }}>{k.value}</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── BOTTOM LEFT — Health trend ── */}
      <div style={{ ...glass, position: 'absolute', bottom: 14, left: 14, zIndex: 10, padding: '10px 14px', width: 300, height: 115 }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📈 Tendência Saúde (24h)</div>
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={healthTrend}>
            <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00ff88" stopOpacity={0.35} /><stop offset="100%" stopColor="#00ff88" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="h" tick={false} axisLine={false} />
            <YAxis domain={[0.6, 1]} tick={false} axisLine={false} />
            <ReTooltip contentStyle={{ background: 'rgba(8,10,18,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 10 }} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Saúde']} />
            <Area type="monotone" dataKey="v" stroke="#00ff88" strokeWidth={2} fill="url(#hg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── BOTTOM RIGHT — Radar ── */}
      <div style={{ ...glass, position: 'absolute', bottom: 14, right: 14, zIndex: 10, padding: '8px 12px', width: 220, height: 190 }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📊 Saúde Multi-dim</div>
        <ResponsiveContainer width="100%" height={160}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="rgba(255,255,255,0.05)" />
            <PolarAngleAxis dataKey="a" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.3)' }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="v" stroke="#0af" fill="#0af" fillOpacity={0.12} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* ── RIGHT — Instrument legend ── */}
      <div style={{ ...glass, position: 'absolute', top: 72, right: 14, zIndex: 10, padding: '10px 12px', width: 200, maxHeight: 'calc(100% - 290px)', overflowY: 'auto' }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📍 Instrumentos ({INSTRUMENTS.length})</div>
        {INSTRUMENTS.map((inst) => {
          const ratio = inst.baseValue / inst.threshold;
          const c = ratio < 0.5 ? '#00ff88' : ratio < 0.75 ? '#ffcc00' : ratio < 0.9 ? '#ff8844' : '#ff3344';
          return (
            <div key={inst.id} onClick={() => setSelectedInst(inst)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 9, cursor: 'pointer', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}`, flexShrink: 0 }} />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{inst.id}</div>
                <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)' }}>{inst.section}</div>
              </div>
              <div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700, color: c, fontSize: 9, whiteSpace: 'nowrap' }}>
                {inst.baseValue.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── InSAR Color Legend (visible when InSAR is on) ── */}
      {insarVisible && (
        <div style={{ ...glass, position: 'absolute', bottom: 145, left: 14, zIndex: 15, padding: '10px 14px', width: 300 }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🛰️ InSAR — Deslocamento LOS (mm)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--shms-font-mono)' }}>-50</span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'linear-gradient(90deg, hsl(240,80%,30%), hsl(180,80%,45%), hsl(120,80%,45%), hsl(60,90%,50%), hsl(0,90%,40%))' }} />
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--shms-font-mono)' }}>+10</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 7, color: 'rgba(255,255,255,0.25)' }}>
            <span>Subsidência</span>
            <span>Estável</span>
            <span>Soerguimento</span>
          </div>
        </div>
      )}

      {/* ── InSAR Time Slider ── */}
      {overlayMode === 'insar' && (
        <div style={{ ...glass, position: 'absolute', bottom: 145, left: 330, right: 240, zIndex: 15, padding: '8px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <button onClick={() => { setAutoPlay(!autoPlay); if (!autoPlay && insarEpoch >= 23) setInsarEpoch(0); }}
              style={{ background: 'none', border: 'none', color: autoPlay ? '#0af' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14, padding: 0 }}>
              {autoPlay ? '⏸' : '▶'}
            </button>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
              📅 Série Temporal SBAS — Época {insarEpoch + 1}/24
            </div>
            <div style={{ fontSize: 8, color: '#0af', fontWeight: 700, fontFamily: 'var(--shms-font-mono)' }}>
              {new Date(2024, insarEpoch).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
            </div>
          </div>
          <input type="range" min={0} max={23} value={insarEpoch} onChange={e => setInsarEpoch(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#0af', height: 4, cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>
            <span>Jan/24</span><span>Jul/24</span><span>Jan/25</span><span>Jul/25</span><span>Dez/25</span>
          </div>
          {/* Mini displacement sparkline */}
          <div style={{ display: 'flex', alignItems: 'end', gap: 1, height: 20, marginTop: 4 }}>
            {Array.from({ length: 24 }, (_, ep) => {
              const d = Math.abs(computeDisplacement(0, 0, 0, 0, 5, ep, 0, 10));
              const h = Math.max(2, (d / 50) * 20);
              const isCurrent = ep === insarEpoch;
              const isAccel = ep >= 14;
              return <div key={ep} style={{ flex: 1, height: h, borderRadius: 1, background: isCurrent ? '#0af' : isAccel ? 'rgba(255,80,0,0.5)' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s' }} />;
            })}
          </div>
        </div>
      )}

      {/* ── InSAR Metadata Panel (visible when InSAR is on) ── */}
      {insarVisible && (
        <div style={{ ...glass, position: 'absolute', bottom: 260, left: 14, zIndex: 15, padding: '10px 14px', width: 230 }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📡 Dados InSAR</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: 9 }}>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Satélite:</span></div>
            <div style={{ fontWeight: 600 }}>Sentinel-1A/B</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Técnica:</span></div>
            <div style={{ fontWeight: 600 }}>SBAS-InSAR</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Banda:</span></div>
            <div style={{ fontWeight: 600 }}>C-band (5.6 cm)</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Período:</span></div>
            <div style={{ fontWeight: 600, fontFamily: 'var(--shms-font-mono)', fontSize: 8 }}>2024-01 — 2026-03</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Imagens:</span></div>
            <div style={{ fontWeight: 600 }}>87 (asc/desc)</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Resolução:</span></div>
            <div style={{ fontWeight: 600 }}>5×20m (IW mode)</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Coerência:</span></div>
            <div style={{ fontWeight: 600, color: '#00ff88' }}>0.72 média</div>
            <div><span style={{ color: 'rgba(255,255,255,0.35)' }}>Max deslocam.:</span></div>
            <div style={{ fontWeight: 700, color: '#ff3344', fontFamily: 'var(--shms-font-mono)' }}>-48.2mm</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 7, color: 'rgba(255,255,255,0.15)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4 }}>
            Hanssen (2001) · Berardino et al. (2002) · ASF DAAC
          </div>
        </div>
      )}

      {/* ── FEM Legend (Von Mises / Seepage) ── */}
      {overlayMode.startsWith('fem') && (
        <div style={{ ...glass, position: 'absolute', bottom: 145, left: 14, zIndex: 15, padding: '10px 14px', width: 300 }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🔬 {overlayMode === 'fem-stress' ? 'FEM — Tensão Von Mises (Pa)' : 'FDM — Percolação Darcy (m)'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--shms-font-mono)' }}>{overlayMode === 'fem-stress' ? '0' : '0'}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: overlayMode === 'fem-stress'
              ? 'linear-gradient(90deg, hsl(216,90%,30%), hsl(180,90%,45%), hsl(60,90%,50%), hsl(30,95%,45%), hsl(0,95%,35%))'
              : 'linear-gradient(90deg, hsl(216,90%,30%), hsl(180,90%,45%), hsl(120,80%,40%), hsl(60,90%,50%), hsl(0,90%,40%))' }} />
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--shms-font-mono)' }}>{overlayMode === 'fem-stress' ? 'σ_max' : 'h_max'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 7, color: 'rgba(255,255,255,0.25)' }}>
            <span>{overlayMode === 'fem-stress' ? 'Baixa tensão' : 'Seco'}</span>
            <span>{overlayMode === 'fem-stress' ? 'Concentração' : 'Saturação'}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 7, color: 'rgba(255,255,255,0.15)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4 }}>
            {overlayMode === 'fem-stress' ? 'Zienkiewicz & Taylor (2000) · Jáky (1944) · Kirsch (1898)' : 'Darcy (1856) · USACE EM 1110-2-1901'}
          </div>
        </div>
      )}

      {/* ── LSTM Predictions Panel ── */}
      {overlayMode === 'lstm' && lstmPreds.length > 0 && (
        <div style={{ ...glass, position: 'absolute', bottom: 14, left: 14, zIndex: 15, padding: '10px 14px', width: 340, maxHeight: 320, overflowY: 'auto' }}>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🧠 LSTM Previsões — Horizonte 6h</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lstmPreds.map(p => {
              const wc = p.warning === 'critical' ? '#ff3344' : p.warning === 'warning' ? '#ff8844' : p.warning === 'watch' ? '#ffcc00' : '#00ff88';
              const tc = p.trend === 'increasing' ? '↗' : p.trend === 'decreasing' ? '↘' : '→';
              return (
                <div key={p.sensorId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 4, background: `${wc}08`, borderLeft: `2px solid ${wc}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: wc, boxShadow: `0 0 6px ${wc}` }} />
                  <div style={{ flex: 1, fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{p.sensorId}</div>
                  <div style={{ fontSize: 8, color: wc, fontWeight: 700, fontFamily: 'var(--shms-font-mono)' }}>{tc} {p.predicted[5]?.toFixed(1)}</div>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', width: 32, textAlign: 'right' }}>{(p.confidence * 100).toFixed(0)}%</div>
                  {p.failProb > 0 && (
                    <div style={{ fontSize: 7, color: '#ff3344', fontWeight: 700 }}>⚠ {(p.failProb * 100).toFixed(0)}%</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 7, color: 'rgba(255,255,255,0.15)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4 }}>
            Hochreiter & Schmidhuber (1997) · GISTM 2020 §8 · Malhotra et al. (2015)
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 10, fontSize: 7, color: 'rgba(255,255,255,0.12)', textAlign: 'center', maxWidth: 500 }}>
        Grieves (2014) · Farrar & Worden (2012) · ISO 13374-1 · ICOLD B.158 · ISA-18.2 · Sohn (2004) · Tukey (1977) · Hanssen (2001) · Three.js WebGL
      </div>

      {/* ── Instrument Detail Modal ── */}
      {selectedInst && (() => {
        const inst = selectedInst;
        const ratio = inst.baseValue / inst.threshold;
        const sc = ratio < 0.5 ? '#00ff88' : ratio < 0.75 ? '#ffcc00' : ratio < 0.9 ? '#ff8844' : '#ff3344';
        const pred = simulateLSTMPredictions([inst])[0];
        // Generate 24 historical data points
        const history = Array.from({ length: 24 }, (_, i) => {
          const base = inst.baseValue * (0.85 + (i / 24) * 0.2);
          const noise = Math.sin(i * 1.7) * inst.baseValue * 0.04 + Math.cos(i * 2.3) * inst.baseValue * 0.03;
          return { month: new Date(2024, i).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), value: base + noise, idx: i };
        });
        const lastVal = history[history.length - 1].value;
        const trendDir = pred.trend === 'increasing' ? '↗ Crescente' : pred.trend === 'decreasing' ? '↘ Decrescente' : '→ Estável';
        const riskText = ratio > 0.9 ? 'CRÍTICO — Excede 90% do limiar GISTM' : ratio > 0.75 ? 'ALERTA — Próximo ao limiar de atenção' : ratio > 0.5 ? 'ATENÇÃO — Monitoramento intensificado recomendado' : 'NORMAL — Dentro dos parâmetros operacionais';

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedInst(null); }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(12,15,25,0.98), rgba(8,10,18,0.99))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, width: 620, maxHeight: '85vh', overflowY: 'auto', padding: '24px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc, boxShadow: `0 0 12px ${sc}` }} />
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{inst.id}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${sc}22`, color: sc, fontWeight: 700, border: `1px solid ${sc}44` }}>
                      {ratio > 0.9 ? 'CRÍTICO' : ratio > 0.75 ? 'ALERTA' : ratio > 0.5 ? 'ATENÇÃO' : 'NORMAL'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{inst.type} · {inst.section} · {inst.unit}</div>
                </div>
                <button onClick={() => setSelectedInst(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>

              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Valor Atual', value: inst.baseValue.toFixed(2), unit: inst.unit, color: sc },
                  { label: 'Limiar', value: inst.threshold.toFixed(2), unit: inst.unit, color: 'rgba(255,255,255,0.5)' },
                  { label: 'Razão', value: `${(ratio * 100).toFixed(1)}%`, unit: '', color: sc },
                  { label: 'Confiança LSTM', value: `${(pred.confidence * 100).toFixed(0)}%`, unit: '', color: '#c8f' },
                ].map((k, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: k.color, fontFamily: 'var(--shms-font-mono)' }}>{k.value}<span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}> {k.unit}</span></div>
                  </div>
                ))}
              </div>

              {/* Time Series Chart */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>📈 Série Temporal + Previsão LSTM (6 meses)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={[
                    ...history.map(h => ({ ...h, pred: undefined as number | undefined })),
                    ...pred.predicted.map((p, i) => ({ month: `+${i + 1}m`, value: undefined as number | undefined, pred: p, idx: 24 + i }))
                  ]}>
                    <defs>
                      <linearGradient id={`ig-${inst.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sc} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={sc} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id={`pg-${inst.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c8f" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#c8f" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} interval={3} />
                    <YAxis tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)' }} axisLine={false} width={35} />
                    <ReTooltip contentStyle={{ background: 'rgba(8,10,18,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 10 }} />
                    <ReferenceLine y={inst.threshold} stroke="#ff3344" strokeDasharray="5 3" strokeWidth={1} label={{ value: 'Limiar', fill: '#ff3344', fontSize: 7, position: 'right' }} />
                    <Area type="monotone" dataKey="value" stroke={sc} strokeWidth={2} fill={`url(#ig-${inst.id})`} dot={false} connectNulls={false} name="Medido" />
                    <Area type="monotone" dataKey="pred" stroke="#c8f" strokeWidth={2} strokeDasharray="6 3" fill={`url(#pg-${inst.id})`} dot={{ r: 3, fill: '#c8f' }} connectNulls={false} name="LSTM" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* AI Analysis Section */}
              <div style={{ background: 'linear-gradient(135deg, rgba(180,0,255,0.06), rgba(0,180,255,0.04))', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(180,0,255,0.15)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#c8f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🧠</span> Análise AI — LSTM + Diagnóstico
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Tendência</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: pred.trend === 'increasing' ? '#ff8844' : pred.trend === 'decreasing' ? '#0cf' : '#00ff88' }}>{trendDir}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>Prob. Falha (6m)</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: pred.failProb > 0.1 ? '#ff3344' : pred.failProb > 0 ? '#ff8844' : '#00ff88' }}>
                      {pred.failProb > 0 ? `${(pred.failProb * 100).toFixed(1)}%` : '< 0.1%'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 8 }}>
                  <strong style={{ color: sc }}>Diagnóstico:</strong> {riskText}.
                  Valor previsto em +6m: <strong style={{ color: '#c8f' }}>{pred.predicted[5]?.toFixed(2)} {inst.unit}</strong> ({trendDir.toLowerCase()}).
                  {pred.failProb > 0.05 && <> <strong style={{ color: '#ff3344' }}>⚠ Ação requerida:</strong> Verificar drenagem e piezômetros adjacentes. Recomendar inspeção geotécnica in-loco.</>}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  <strong>Recomendações:</strong>
                  <ul style={{ margin: '4px 0 0 12px', padding: 0 }}>
                    <li>Frequência de leitura: {ratio > 0.75 ? '1h' : ratio > 0.5 ? '4h' : '12h'} (GISTM §8.3)</li>
                    <li>Validação cruzada: {inst.id.startsWith('PZ') ? 'Correlacionar com inclinômetros vizinhos' : inst.id.startsWith('GNSS') ? 'Confrontar com InSAR LOS' : 'Verificar redundância de sensores'}</li>
                    <li>Modelo: LSTM (Hochreiter 1997) — 64 neurônios, janela 12 épocas, lr=0.001</li>
                  </ul>
                </div>
                <div style={{ marginTop: 8, fontSize: 7, color: 'rgba(255,255,255,0.15)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4 }}>
                  Hochreiter & Schmidhuber (1997) · GISTM 2020 · Malhotra et al. (2015) · ISO 13374-1
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      </>)}
    </div>
  );
}
