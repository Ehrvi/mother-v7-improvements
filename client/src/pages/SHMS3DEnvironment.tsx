/**
 * SHMS 3D Environment — client/src/pages/SHMS3DEnvironment.tsx
 * MOTHER v7 | Module 5
 *
 * Full 3D interactive point cloud visualization of a dam structure.
 * Based on:
 *   - Schütz et al. (2016, 2020) "Potree: Rendering Large Point Clouds in the Browser"
 *   - IFC ISO 16739 — structural element classification
 *   - ICOLD Bulletin 158 (2017) — dam safety monitoring visualization
 *   - GISTM 2020 §4.3 — geotechnical monitoring
 *
 * Three.js WebGLRenderer + OrbitControls + THREE.Points (vertex colors)
 * ~50 000 synthetic LiDAR points, Monte Carlo surface scatter with ±0.5m jitter
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Layers,
  Eye,
  EyeOff,
  RefreshCw,
  Sliders,
  Download,
  Info,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: 'oklch(8% 0.02 220)',
  surface: 'oklch(11% 0.02 220)',
  surfaceHover: 'oklch(14% 0.03 220)',
  border: 'oklch(18% 0.03 220)',
  text: 'oklch(88% 0.01 220)',
  muted: 'oklch(52% 0.02 220)',
  dim: 'oklch(38% 0.02 220)',
  accent: 'oklch(68% 0.18 220)',
  green: 'oklch(72% 0.18 145)',
  greenBg: 'oklch(14% 0.06 145)',
  yellow: 'oklch(78% 0.16 80)',
  yellowBg: 'oklch(14% 0.06 80)',
  red: 'oklch(65% 0.22 25)',
  redBg: 'oklch(14% 0.06 25)',
  orange: 'oklch(72% 0.18 50)',
  orangeBg: 'oklch(14% 0.06 50)',
  blue: 'oklch(68% 0.16 260)',
  blueBg: 'oklch(14% 0.05 260)',
} as const;

// ─── Dam dimensions (ICOLD Bulletin 158 reference geometry) ──────────────────
const DAM = {
  crestLength: 400,
  crestWidth: 10,
  height: 90,           // dam height in metres
  crestElevation: 850,  // m.a.s.l.
  baseElevation: 760,
  upstreamSlope: 0.35,  // H:V
  downstreamSlope: 0.40,
  foundationDepth: 20,  // below base
  foundationOverhang: 10,
} as const;

// Derived half-widths at base
const BASE_HALF_US = DAM.upstreamSlope * DAM.height;   // upstream side extension
const BASE_HALF_DS = DAM.downstreamSlope * DAM.height; // downstream side extension

// ─── Layer descriptors ────────────────────────────────────────────────────────
interface LayerDesc {
  id: string;
  label: string;
  visible: boolean;
  color: string; // CSS hex for UI swatch
}

const LAYER_DEFS: LayerDesc[] = [
  { id: 'dam_body',       label: 'Corpo da Barragem',  visible: true,  color: '#d97706' },
  { id: 'foundation',     label: 'Fundação / Laje',    visible: true,  color: '#6b7280' },
  { id: 'upstream',       label: 'Face Montante',      visible: true,  color: '#3b82f6' },
  { id: 'downstream',     label: 'Face Jusante',       visible: true,  color: '#92400e' },
  { id: 'drainage',       label: 'Cobertor Drenante',  visible: true,  color: '#06b6d4' },
  { id: 'instrumentation',label: 'Instrumentação',     visible: true,  color: '#fde047' },
  { id: 'terrain',        label: 'Terreno / DEM',      visible: true,  color: '#16a34a' },
];

// ─── Point cloud generation ───────────────────────────────────────────────────

interface PointGroup {
  name: string;
  start: number;
  count: number;
}

interface PointCloud {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
  groups: PointGroup[];
}

/** Lerp between two RGB triplets [r,g,b] each 0..1 */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Elevation-based rainbow colour: blue→cyan→green→yellow→red */
function elevationColor(z: number): [number, number, number] {
  const zMin = DAM.baseElevation;
  const zMax = DAM.crestElevation;
  const t = Math.max(0, Math.min(1, (z - zMin) / (zMax - zMin)));

  const stops: Array<[number, [number, number, number]]> = [
    [0.00, [0.00, 0.00, 1.00]], // blue
    [0.25, [0.00, 0.80, 0.90]], // cyan
    [0.50, [0.10, 0.85, 0.10]], // green
    [0.75, [0.95, 0.90, 0.00]], // yellow
    [1.00, [1.00, 0.10, 0.00]], // red
  ];

  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1];
    const [t1, c1] = stops[i];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return lerpColor(c0, c1, f);
    }
  }
  return [1, 0.1, 0];
}

function rand(): number {
  return Math.random();
}

function jitter(): number {
  return (rand() - 0.5) * 1.0; // ±0.5 m LiDAR jitter
}

/**
 * Generate synthetic LiDAR point cloud of a zoned earth-fill dam.
 * Monte Carlo surface scatter, ~50 000 points.
 */
function generateDamPointCloud(): PointCloud {
  const pos: number[] = [];
  const col: number[] = [];
  const groups: PointGroup[] = [];

  function pushPoint(x: number, y: number, z: number, r: number, g: number, b: number) {
    pos.push(x + jitter(), y + jitter(), z + jitter());
    col.push(r, g, b);
  }

  // ── 1. DAM BODY (trapezoidal cross-section, extruded along Y) ───────────────
  // Amber/orange for earthfill core  — type: dam_body
  {
    const n = 18000;
    const start = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const y = rand() * DAM.crestLength;
      const relH = rand();                        // 0=base, 1=crest
      const z = DAM.baseElevation + relH * DAM.height;
      // interior body: x between narrowing walls
      const halfWidthAtZ = (BASE_HALF_US + BASE_HALF_DS) * (1 - relH) + (DAM.crestWidth / 2) * relH;
      const x = (rand() - 0.5) * 2 * halfWidthAtZ;
      // amber
      const r = 0.85 + rand() * 0.1;
      const g = 0.45 + rand() * 0.15;
      const b = 0.05 + rand() * 0.05;
      pushPoint(x, y, z, r, g, b);
    }
    groups.push({ name: 'dam_body', start, count: pos.length / 3 - start });
  }

  // ── 2. FOUNDATION SLAB (flat base, wider than dam foot) ─────────────────────
  {
    const n = 6000;
    const start = pos.length / 3;
    const halfW = BASE_HALF_US + BASE_HALF_DS + DAM.foundationOverhang;
    for (let i = 0; i < n; i++) {
      const y = rand() * DAM.crestLength;
      const x = (rand() - 0.5) * 2 * halfW;
      const z = DAM.baseElevation - rand() * DAM.foundationDepth;
      // gray rock
      const v = 0.35 + rand() * 0.15;
      pushPoint(x, y, z, v, v, v);
    }
    groups.push({ name: 'foundation', start, count: pos.length / 3 - start });
  }

  // ── 3. UPSTREAM FACE (water side, sloped) ───────────────────────────────────
  {
    const n = 6000;
    const start = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const y = rand() * DAM.crestLength;
      const relH = rand();
      const z = DAM.baseElevation + relH * DAM.height;
      const x = -BASE_HALF_US * (1 - relH) - (DAM.crestWidth / 2) * relH;
      // blue-ish (water interface)
      const r = 0.05 + rand() * 0.10;
      const g = 0.30 + rand() * 0.20;
      const b = 0.75 + rand() * 0.25;
      pushPoint(x, y, z, r, g, b);
    }
    groups.push({ name: 'upstream', start, count: pos.length / 3 - start });
  }

  // ── 4. DOWNSTREAM FACE (dry side, vegetated/tan) ────────────────────────────
  {
    const n = 6000;
    const start = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const y = rand() * DAM.crestLength;
      const relH = rand();
      const z = DAM.baseElevation + relH * DAM.height;
      const x = BASE_HALF_DS * (1 - relH) + (DAM.crestWidth / 2) * relH;
      // brown/tan
      const r = 0.55 + rand() * 0.15;
      const g = 0.32 + rand() * 0.10;
      const b = 0.08 + rand() * 0.05;
      pushPoint(x, y, z, r, g, b);
    }
    groups.push({ name: 'downstream', start, count: pos.length / 3 - start });
  }

  // ── 5. DRAINAGE BLANKET (horizontal, near base downstream) ──────────────────
  {
    const n = 3500;
    const start = pos.length / 3;
    const blanketW = BASE_HALF_DS * 1.5;
    for (let i = 0; i < n; i++) {
      const y = rand() * DAM.crestLength;
      const x = (rand() * blanketW) + (DAM.crestWidth / 2);
      const z = DAM.baseElevation + rand() * 3;
      // cyan
      const r = 0.00 + rand() * 0.10;
      const g = 0.70 + rand() * 0.20;
      const b = 0.75 + rand() * 0.20;
      pushPoint(x, y, z, r, g, b);
    }
    groups.push({ name: 'drainage', start, count: pos.length / 3 - start });
  }

  // ── 6. INSTRUMENTATION POINTS (piezometers, inclinometers) ──────────────────
  {
    const n = 500;
    const start = pos.length / 3;
    // Instruments are clustered at regular positions
    const stations = [
      { x:  0,               y: DAM.crestLength * 0.25 },
      { x:  0,               y: DAM.crestLength * 0.50 },
      { x:  0,               y: DAM.crestLength * 0.75 },
      { x: -BASE_HALF_US/2,  y: DAM.crestLength * 0.50 },
      { x:  BASE_HALF_DS/2,  y: DAM.crestLength * 0.50 },
    ];
    for (let i = 0; i < n; i++) {
      const st = stations[i % stations.length];
      const z = DAM.baseElevation + rand() * DAM.height;
      const x = st.x + (rand() - 0.5) * 4;
      const y = st.y + (rand() - 0.5) * 4;
      // bright yellow
      pushPoint(x, y, z, 1.0, 0.95, 0.00);
    }
    groups.push({ name: 'instrumentation', start, count: pos.length / 3 - start });
  }

  // ── 7. TERRAIN / DEM around dam ─────────────────────────────────────────────
  {
    const n = 10000;
    const start = pos.length / 3;
    const areaHalfX = BASE_HALF_US + BASE_HALF_DS + 120;
    const areaHalfY = DAM.crestLength / 2 + 100;
    const cx = 0;
    const cy = DAM.crestLength / 2;

    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * 2 * areaHalfX;
      const y = cy + (rand() - 0.5) * 2 * areaHalfY;

      // Exclude area directly occupied by dam body
      const dxDam = Math.abs(x) / (BASE_HALF_US + BASE_HALF_DS + 5);
      if (dxDam < 1 && y > -10 && y < DAM.crestLength + 10) continue;

      // Gently undulating terrain at base elevation
      const z = DAM.baseElevation - 2 + Math.sin(x * 0.05) * 1.5 + Math.cos(y * 0.03) * 1.2;
      // Green gradient
      const t = Math.max(0, Math.min(1, (rand())));
      const r = 0.02 + t * 0.08;
      const g = 0.45 + rand() * 0.30;
      const b = 0.02 + t * 0.08;
      pushPoint(x, y, z, r, g, b);
    }
    groups.push({ name: 'terrain', start, count: pos.length / 3 - start });
  }

  const count = pos.length / 3;
  return {
    positions: new Float32Array(pos),
    colors: new Float32Array(col),
    count,
    groups,
  };
}

// ─── Elevation-coloured variant ───────────────────────────────────────────────
function applyElevationColors(positions: Float32Array): Float32Array {
  const n = positions.length / 3;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const z = positions[i * 3 + 2];
    const [r, g, b] = elevationColor(z);
    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

// ─── Right Info Panel ─────────────────────────────────────────────────────────

interface InfoPanelProps {
  visible: boolean;
  hoveredGroup: string | null;
  totalPoints: number;
  fps: number;
}

function InfoPanel({ visible, hoveredGroup, totalPoints, fps }: InfoPanelProps) {
  if (!visible) return null;

  const ICOLD_LEVELS: Record<string, { level: string; color: string; desc: string }> = {
    dam_body:        { level: 'A1',    color: '#22c55e', desc: 'Corpo principal — Aterro compactado' },
    foundation:      { level: 'A2',    color: '#6b7280', desc: 'Fundação rochosa / laje de concreto' },
    upstream:        { level: 'B1',    color: '#3b82f6', desc: 'Face de montante — Proteção contra erosão' },
    downstream:      { level: 'B2',    color: '#92400e', desc: 'Face de jusante — Drenagem superficial' },
    drainage:        { level: 'C1',    color: '#06b6d4', desc: 'Cobertor drenante — Alívio de subpressão' },
    instrumentation: { level: 'I',     color: '#fde047', desc: 'Instrumentação — Piezômetros / Inclinômetros' },
    terrain:         { level: 'T',     color: '#16a34a', desc: 'Terreno natural — Modelo de Elevação Digital' },
  };

  const info = hoveredGroup ? ICOLD_LEVELS[hoveredGroup] : null;

  return (
    <div style={{
      position: 'absolute', right: 16, top: 60,
      width: 230,
      background: 'oklch(11% 0.02 220 / 0.92)',
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 14,
      backdropFilter: 'blur(6px)',
      fontFamily: 'system-ui, sans-serif',
      transition: 'opacity 0.2s',
      zIndex: 10,
    }}>
      <div style={{ color: T.muted, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Info size={10} /> Informações do Elemento
      </div>

      {info ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
            <span style={{ color: T.text, fontWeight: 600, fontSize: 12 }}>{hoveredGroup?.replace('_', ' ')}</span>
          </div>
          <div style={{ color: T.muted, fontSize: 11, marginBottom: 6 }}>{info.desc}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.dim }}>
            <span>ICOLD Bull. 158 — §{info.level}</span>
            <span style={{ color: info.color, fontWeight: 700 }}>{info.level}</span>
          </div>
        </>
      ) : (
        <div style={{ color: T.dim, fontSize: 11 }}>Passe o mouse sobre a nuvem de pontos.</div>
      )}

      <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: T.muted }}>Pontos totais</span>
          <span style={{ color: T.text, fontFamily: 'monospace' }}>{totalPoints.toLocaleString('pt-BR')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: T.muted }}>Camadas</span>
          <span style={{ color: T.text }}>{LAYER_DEFS.length}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: T.muted }}>FPS</span>
          <span style={{ color: fps >= 50 ? T.green : fps >= 25 ? T.yellow : T.red, fontFamily: 'monospace', fontWeight: 700 }}>{fps}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SHMS3DEnvironment() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scene refs (mutable, not state)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points[]>([]);
  const animFrameRef = useRef<number>(0);
  const fpsTimestampRef = useRef<number>(0);
  const fpsCountRef = useRef<number>(0);
  const cloudRef = useRef<PointCloud | null>(null);
  const elevColorsRef = useRef<Float32Array | null>(null);

  // UI state
  const [layers, setLayers] = useState<LayerDesc[]>(LAYER_DEFS.map((l) => ({ ...l })));
  const [pointSize, setPointSize] = useState(0.3);
  const [colorMode, setColorMode] = useState<'elemento' | 'elevacao'>('elemento');
  const [fps, setFps] = useState(0);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number; z: number } | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [totalPoints, setTotalPoints] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // ── Helper: rebuild colors based on mode ──────────────────────────────────
  const rebuildColors = useCallback((mode: 'elemento' | 'elevacao') => {
    const cloud = cloudRef.current;
    if (!cloud) return;
    const pts = pointsRef.current;

    if (mode === 'elevacao') {
      if (!elevColorsRef.current) {
        elevColorsRef.current = applyElevationColors(cloud.positions);
      }
      // Apply elevation colors to all groups together via one merged geometry
      let offset = 0;
      for (const pt of pts) {
        const geo = pt.geometry;
        const attr = geo.getAttribute('color') as THREE.BufferAttribute;
        if (!attr) continue;
        const cnt = attr.count;
        const sub = elevColorsRef.current.subarray(offset * 3, (offset + cnt) * 3);
        attr.set(sub);
        attr.needsUpdate = true;
        offset += cnt;
      }
    } else {
      // Restore element colors
      let groupIdx = 0;
      for (const pt of pts) {
        const geo = pt.geometry;
        const attr = geo.getAttribute('color') as THREE.BufferAttribute;
        if (!attr) continue;
        const cnt = attr.count;
        const sub = cloud.colors.subarray(groupIdx * 3, (groupIdx + cnt) * 3);
        attr.set(sub);
        attr.needsUpdate = true;
        groupIdx += cnt;
      }
    }
  }, []);

  // ── Initialize Three.js scene ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x060c14, 1);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060c14, 0.0008);
    sceneRef.current = scene;

    // Camera
    const { clientWidth: W, clientHeight: H } = container;
    const camera = new THREE.PerspectiveCamera(55, W / H, 1, 5000);
    // Position: oblique above, looking at dam centre
    camera.position.set(250, 200, DAM.crestElevation + 80);
    camera.lookAt(0, DAM.crestLength / 2, DAM.baseElevation + DAM.height / 2);
    cameraRef.current = camera;

    renderer.setSize(W, H);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, DAM.crestLength / 2, DAM.baseElevation + DAM.height / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 20;
    controls.maxDistance = 2000;
    controls.panSpeed = 1.2;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 1.4;
    controls.update();
    controlsRef.current = controls;

    // Helpers
    const gridHelper = new THREE.GridHelper(800, 40, 0x1a2a3a, 0x1a2a3a);
    gridHelper.position.set(0, DAM.crestLength / 2, DAM.baseElevation);
    // Rotate so grid is in XY plane (Three.js GridHelper is XZ by default)
    // We use Y-up but Z-elevation convention: keep as-is, just put it at base
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(60);
    axesHelper.position.set(-150, 0, DAM.baseElevation - 5);
    scene.add(axesHelper);

    // Lights (for future mesh overlays)
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 300, 500);
    scene.add(dirLight);

    // Generate point cloud
    const cloud = generateDamPointCloud();
    cloudRef.current = cloud;
    setTotalPoints(cloud.count);

    // Create one THREE.Points per group (for visibility toggles)
    const allPoints: THREE.Points[] = [];
    for (const group of cloud.groups) {
      const subPos = cloud.positions.subarray(group.start * 3, (group.start + group.count) * 3);
      const subCol = cloud.colors.subarray(group.start * 3, (group.start + group.count) * 3);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(subPos.slice(), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(subCol.slice(), 3));

      const mat = new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        sizeAttenuation: true,
      });

      const pts = new THREE.Points(geo, mat);
      pts.name = group.name;
      scene.add(pts);
      allPoints.push(pts);
    }
    pointsRef.current = allPoints;

    // Animation loop
    let lastFpsUpdate = performance.now();
    let fpsFrames = 0;

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      controls.update();
      renderer.render(scene, camera);

      fpsFrames++;
      const now = performance.now();
      const delta = now - lastFpsUpdate;
      if (delta >= 500) {
        setFps(Math.round((fpsFrames * 1000) / delta));
        fpsFrames = 0;
        lastFpsUpdate = now;
      }
    }
    animate();

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      }
    });
    ro.observe(container);

    setInitialized(true);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      controls.dispose();
      for (const pt of allPoints) {
        pt.geometry.dispose();
        (pt.material as THREE.PointsMaterial).dispose();
      }
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync point size ────────────────────────────────────────────────────────
  useEffect(() => {
    for (const pt of pointsRef.current) {
      (pt.material as THREE.PointsMaterial).size = pointSize;
    }
  }, [pointSize]);

  // ── Sync layer visibility ──────────────────────────────────────────────────
  useEffect(() => {
    for (const pt of pointsRef.current) {
      const layer = layers.find((l) => l.id === pt.name);
      if (layer) pt.visible = layer.visible;
    }
  }, [layers]);

  // ── Sync color mode ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    rebuildColors(colorMode);
  }, [colorMode, initialized, rebuildColors]);

  // ── Mouse hover: raycasting for coordinate display ─────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!canvas || !camera || !scene) return;

    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    raycaster.params.Points = { threshold: 2 };

    const intersects = raycaster.intersectObjects(pointsRef.current, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      const p = hit.point;
      setHoverCoords({ x: p.x, y: p.y, z: p.z });
      setHoveredGroup(hit.object.name);
    } else {
      setHoverCoords(null);
      setHoveredGroup(null);
    }
  }, []);

  // ── Export point cloud as CSV ──────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const cloud = cloudRef.current;
    if (!cloud) return;
    const lines = ['x,y,z,r,g,b'];
    for (let i = 0; i < cloud.count; i++) {
      const x = cloud.positions[i * 3 + 0].toFixed(2);
      const y = cloud.positions[i * 3 + 1].toFixed(2);
      const z = cloud.positions[i * 3 + 2].toFixed(2);
      const r = Math.round(cloud.colors[i * 3 + 0] * 255);
      const g = Math.round(cloud.colors[i * 3 + 1] * 255);
      const b = Math.round(cloud.colors[i * 3 + 2] * 255);
      lines.push(`${x},${y},${z},${r},${g},${b}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dam-pointcloud.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Reset camera ───────────────────────────────────────────────────────────
  const handleResetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(250, 200, DAM.crestElevation + 80);
    controls.target.set(0, DAM.crestLength / 2, DAM.baseElevation + DAM.height / 2);
    controls.update();
  }, []);

  // ── Toggle layer ───────────────────────────────────────────────────────────
  const toggleLayer = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  // ─── Styles ───────────────────────────────────────────────────────────────
  const sidebarW = 220;

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
    border: `1px solid ${T.border}`, background: 'none', color: T.text,
    transition: 'all 0.15s', fontFamily: 'system-ui, sans-serif',
  };

  const activeBtn: React.CSSProperties = {
    ...btnBase,
    border: `1px solid ${T.accent}`,
    background: T.blueBg,
    color: T.accent,
  };

  const sectionLabel: React.CSSProperties = {
    color: T.muted, fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '10px 14px 6px',
  };

  const layerVisibleLayers = useMemo(() => layers.filter((l) => l.visible).length, [layers]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: T.bg, color: T.text, fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button onClick={() => navigate('/shms')} style={btnBase}>
          <ChevronLeft size={14} />
        </button>

        <span style={{ fontWeight: 700, fontSize: 14 }}>Ambiente 3D — Nuvem de Pontos</span>

        <span style={{
          background: T.blueBg,
          color: T.accent,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: '2px 9px',
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 700,
        }}>
          {totalPoints.toLocaleString('pt-BR')} pts
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setColorMode((m) => m === 'elemento' ? 'elevacao' : 'elemento')}
          style={colorMode === 'elevacao' ? activeBtn : btnBase}
          title="Alternar modo de cor"
        >
          <Sliders size={13} />
          {colorMode === 'elemento' ? 'Elemento' : 'Elevação'}
        </button>

        <button onClick={handleResetCamera} style={btnBase} title="Resetar câmera">
          <RefreshCw size={13} />
        </button>

        <button onClick={handleExport} style={btnBase} title="Exportar CSV">
          <Download size={13} />
          <span>Export CSV</span>
        </button>

        <button
          onClick={() => setInfoPanelOpen((v) => !v)}
          style={infoPanelOpen ? activeBtn : btnBase}
          title="Painel de informações"
        >
          <Info size={13} />
        </button>
      </header>

      {/* ── Main body ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <aside style={{
          width: sidebarW, flexShrink: 0,
          background: T.surface,
          borderRight: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Layers */}
          <div style={sectionLabel}><Layers size={10} style={{ display: 'inline', marginRight: 5 }} />Camadas ({layerVisibleLayers}/{layers.length})</div>
          {layers.map((layer) => (
            <div
              key={layer.id}
              onClick={() => toggleLayer(layer.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', cursor: 'pointer',
                borderBottom: `1px solid ${T.border}`,
                opacity: layer.visible ? 1 : 0.4,
                transition: 'opacity 0.15s',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: layer.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, flex: 1, color: T.text }}>{layer.label}</span>
              {layer.visible ? <Eye size={12} color={T.muted} /> : <EyeOff size={12} color={T.dim} />}
            </div>
          ))}

          {/* Color mode */}
          <div style={sectionLabel}>Modo de Cor</div>
          <div style={{ padding: '4px 14px 10px', display: 'flex', gap: 6 }}>
            {(['elemento', 'elevacao'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                style={{
                  ...(colorMode === mode ? activeBtn : btnBase),
                  flex: 1, justifyContent: 'center', padding: '5px 0',
                }}
              >
                {mode === 'elemento' ? 'Elemento' : 'Elevação'}
              </button>
            ))}
          </div>

          {/* Point size */}
          <div style={sectionLabel}>Tamanho do Ponto</div>
          <div style={{ padding: '4px 14px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: T.muted }}>Tamanho</span>
              <span style={{ fontSize: 11, color: T.text, fontFamily: 'monospace' }}>{pointSize.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={2.0}
              step={0.05}
              value={pointSize}
              onChange={(e) => setPointSize(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: T.accent }}
            />
          </div>

          {/* Stats */}
          <div style={sectionLabel}>Estatísticas</div>
          {[
            ['Pontos totais', totalPoints.toLocaleString('pt-BR')],
            ['Camadas', LAYER_DEFS.length.toString()],
            ['FPS', fps.toString()],
            ['Elevação mín', `${DAM.baseElevation} m`],
            ['Elevação máx', `${DAM.crestElevation} m`],
            ['Comprimento crista', `${DAM.crestLength} m`],
            ['Altura', `${DAM.height} m`],
          ].map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 14px', borderBottom: `1px solid ${T.border}`,
              fontSize: 11,
            }}>
              <span style={{ color: T.muted }}>{label}</span>
              <span style={{ color: T.text, fontFamily: 'monospace' }}>{value}</span>
            </div>
          ))}

          {/* Elevation legend */}
          {colorMode === 'elevacao' && (
            <>
              <div style={sectionLabel}>Legenda — Elevação</div>
              <div style={{ padding: '6px 14px 14px' }}>
                <div style={{
                  height: 14,
                  borderRadius: 4,
                  background: 'linear-gradient(to right, #0000ff, #00ccee, #22cc22, #f0e000, #ff2200)',
                  marginBottom: 6,
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.dim }}>
                  <span>{DAM.baseElevation}m</span>
                  <span>{DAM.crestElevation}m</span>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Canvas area */}
        <div
          ref={containerRef}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#060c14' }}
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />

          {/* Info panel overlay */}
          <InfoPanel
            visible={infoPanelOpen}
            hoveredGroup={hoveredGroup}
            totalPoints={totalPoints}
            fps={fps}
          />
        </div>
      </div>

      {/* ── Bottom bar ─────────────────────────────────────────────────── */}
      <footer style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '5px 14px',
        borderTop: `1px solid ${T.border}`,
        background: T.surface,
        flexShrink: 0, flexWrap: 'wrap',
        fontSize: 11,
      }}>
        {hoverCoords ? (
          <span style={{ fontFamily: 'monospace', color: T.text }}>
            X: <b>{hoverCoords.x.toFixed(1)}</b> &nbsp;
            Y: <b>{hoverCoords.y.toFixed(1)}</b> &nbsp;
            Z: <b>{hoverCoords.z.toFixed(1)}</b> m
          </span>
        ) : (
          <span style={{ color: T.dim }}>Passe o mouse sobre os pontos para ver coordenadas</span>
        )}

        <div style={{ flex: 1 }} />

        <span style={{ color: T.dim }}>
          FPS: <span style={{
            color: fps >= 50 ? T.green : fps >= 25 ? T.yellow : T.red,
            fontFamily: 'monospace', fontWeight: 700,
          }}>{fps}</span>
        </span>

        {/* Scale reference */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.dim }}>
          <div style={{ width: 40, height: 2, background: T.text }} />
          <span>≈ 40 m</span>
        </div>

        <span style={{ color: T.dim, fontSize: 10 }}>
          MOTHER v7 · ICOLD Bull. 158 · IFC ISO 16739 · Schütz et al. (2020)
        </span>
      </footer>
    </div>
  );
}
