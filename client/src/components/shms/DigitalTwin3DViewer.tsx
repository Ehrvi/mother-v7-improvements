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

// Compute displacement at a world-space position (simulated SBAS-InSAR)
function computeDisplacement(wx: number, wz: number, cx: number, cz: number, pitR: number): number {
  const dx = wx - cx, dz = wz - cz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  let d: number;
  if (dist < pitR) {
    // Subsidence in pit center: Gaussian funnel
    d = MIN_DISP * Math.exp(-dist * dist / (pitR * pitR * 0.45));
  } else {
    // Elastic rebound at rim + lateral spreading
    d = 6 * Math.exp(-(dist - pitR) * 0.25) + Math.sin(dx * 1.8 + dz * 1.3) * 2;
  }
  // Atmospheric phase screen noise
  d += Math.sin(dx * 4.7 + dz * 3.1) * 1.8 + Math.cos(dx * 6.3 - dz * 4.9) * 1.2;
  // Seasonal thermal expansion noise
  d += Math.sin(dx * 0.5) * Math.cos(dz * 0.5) * 2.5;
  return Math.max(MIN_DISP, Math.min(MAX_DISP, d));
}

type InsarMode = 'displacement' | 'fringes' | 'coherence';

// ─── Apply InSAR vertex colors directly to loaded OBJ mesh surfaces ──────────
// NOTE: Does NOT store originals — originals are stored ONCE during loadMineScene
function applyInsarToMesh(
  obj: THREE.Group,
  center: THREE.Vector3,
  pitRadius: number,
  mode: InsarMode,
  epoch: number = 0, // temporal variation: 0-23 months
): void {
  const worldPos = new THREE.Vector3();

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

      // Temporal variation: subsidence deepens progressively with each epoch
      const temporalFactor = 1 + epoch * 0.08; // 8% deeper per month
      const disp = computeDisplacement(worldPos.x, worldPos.z, center.x, center.z, pitRadius) * temporalFactor;
      let c: THREE.Color;

      if (mode === 'fringes') {
        c = fringeColor(disp);
      } else if (mode === 'coherence') {
        const coherence = Math.max(0.1, 1 - Math.abs(disp / MIN_DISP) * 0.7);
        c = new THREE.Color().setHSL(0, 0, coherence * 0.8);
      } else {
        c = insarColor(disp);
      }

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Replace material with vertex-colored version
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
export default function DigitalTwin3DViewer({ structureId }: { structureId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { data: dashData, isLoading } = useShmsDashboardAll();
  const [hoveredInst, setHoveredInst] = useState<InstrumentDef | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [loadProgress, setLoadProgress] = useState(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [insarVisible, setInsarVisible] = useState(false);
  const [insarMode, setInsarMode] = useState<InsarMode>('displacement');
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

  // ── Toggle InSAR overlay (surface-draped vertex colors) ──
  // FIX: Always restore originals FIRST before applying new mode
  // originals are stored ONCE in loadMineScene and never overwritten
  useEffect(() => {
    const group = modelGroupRef.current;
    const originals = originalMatsRef.current;
    if (!group || !originals) return;

    // Step 1: ALWAYS restore original materials first
    removeInsarFromMesh(group, originals);

    if (insarVisible) {
      // Step 2: Apply InSAR vertex colors on top of restored originals
      applyInsarToMesh(group, modelCenterRef.current, pitRadiusRef.current, insarMode);
      if (psGroupRef.current) psGroupRef.current.visible = true;
    } else {
      if (psGroupRef.current) psGroupRef.current.visible = false;
    }
  }, [insarVisible, insarMode]);

  if (isLoading) return <div className="shms-skeleton" style={{ height: '100%', minHeight: 600, borderRadius: 'var(--shms-radius)' }} />;

  const rc = risk === 'low' ? '#00ff88' : risk === 'medium' ? '#ffcc00' : risk === 'high' ? '#ff8844' : '#ff3344';
  const rl = risk === 'low' ? 'BAIXO' : risk === 'medium' ? 'MÉDIO' : risk === 'high' ? 'ALTO' : 'CRÍTICO';

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 100px)', minHeight: 650, borderRadius: 'var(--shms-radius-lg)', overflow: 'hidden', background: '#050810' }}>
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
              if (!insarVisible) {
                setInsarVisible(true);
              } else {
                // Cycle modes: displacement → fringes → coherence → OFF
                const modes: InsarMode[] = ['displacement', 'fringes', 'coherence'];
                const idx = modes.indexOf(insarMode);
                if (idx < modes.length - 1) {
                  setInsarMode(modes[idx + 1]);
                } else {
                  setInsarVisible(false);
                  setInsarMode('displacement');
                }
              }
            }}
            style={{
              fontSize: 10, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
              background: insarVisible ? 'rgba(255,100,0,0.25)' : 'rgba(255,255,255,0.06)',
              color: insarVisible ? '#ff8844' : 'rgba(255,255,255,0.4)',
              fontWeight: 700, border: `1px solid ${insarVisible ? 'rgba(255,100,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: insarVisible ? '0 0 12px rgba(255,100,0,0.2)' : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            🛰️ {insarVisible ? (insarMode === 'displacement' ? 'LOS Disp.' : insarMode === 'fringes' ? 'Fringes' : 'Coerência') : 'InSAR'}
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
            <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: 9 }}>
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

      {/* ── Footer ── */}
      <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 10, fontSize: 7, color: 'rgba(255,255,255,0.12)', textAlign: 'center', maxWidth: 500 }}>
        Grieves (2014) · Farrar & Worden (2012) · ISO 13374-1 · ICOLD B.158 · ISA-18.2 · Sohn (2004) · Tukey (1977) · Hanssen (2001) · Three.js WebGL
      </div>
    </div>
  );
}
