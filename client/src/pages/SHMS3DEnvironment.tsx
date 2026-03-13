/**
 * SHMS 3D Environment — client/src/pages/SHMS3DEnvironment.tsx
 * MOTHER v7 | Module 5
 *
 * Three.js scene graph concepts (no runtime dependency — HTML/CSS/SVG wireframe representation)
 * IFC (ISO 16739) structural element visualization
 * Dark theme: oklch(8% 0.02 220)
 *
 * Imports scene data from: /api/a2a/shms/3d/:structureId
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Download, Info, Layers, MousePointer2 } from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: 'oklch(8% 0.02 220)',
  surface: 'oklch(11% 0.02 220)',
  surfaceHover: 'oklch(14% 0.03 220)',
  border: 'oklch(18% 0.03 220)',
  borderHover: 'oklch(24% 0.04 220)',
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

// ─── API types (mirrors server/shms/environment-3d.ts) ───────────────────────
interface Point3D { x: number; y: number; z: number; }
interface Mesh3D {
  id: string; name: string; vertices: Point3D[];
  faces: [number, number, number][]; color: string; opacity: number;
}
interface StructuralElement3D {
  id: string;
  type: 'dam_body' | 'foundation' | 'drainage' | 'instrumentation_point';
  mesh: Mesh3D;
  properties: Record<string, unknown>;
}
interface Scene3D {
  structureId: string;
  elements: StructuralElement3D[];
  dem: { width: number; height: number; resolution: number; elevations: number[][] };
  sensorMarkers: Array<{ sensorId: string; position: Point3D; alarmLevel: string }>;
}

// ─── Alarm colour map ─────────────────────────────────────────────────────────
const ALARM_COLORS: Record<string, string> = {
  normal: '#22c55e',
  watch: '#84cc16',
  warning: '#eab308',
  alert: '#f97316',
  critical: '#ef4444',
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonBlock({ w, h, style }: { w: number | string; h: number | string; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: 'oklch(16% 0.02 220)',
      animation: 'pulse 1.8s ease-in-out infinite',
      ...style,
    }} />
  );
}

// ─── 3D Wireframe SVG representation ─────────────────────────────────────────

/**
 * Projects a 3D point onto a 2D isometric viewport.
 * Uses a simplified isometric projection:
 *   sx = cx + (x - z) * cos30
 *   sy = cy - y * scale + (x + z) * sin30
 */
function isoProject(
  pt: Point3D,
  cx: number,
  cy: number,
  scale: number,
  yBase: number,
): { sx: number; sy: number } {
  const cos30 = 0.866;
  const sin30 = 0.5;
  const sx = cx + (pt.x - pt.z) * cos30 * scale;
  const sy = cy - (pt.y - yBase) * scale + (pt.x + pt.z) * sin30 * scale;
  return { sx, sy };
}

interface ViewTransform {
  cx: number; cy: number; scale: number; yBase: number;
}

function computeViewTransform(elements: StructuralElement3D[], W: number, H: number): ViewTransform {
  if (elements.length === 0) return { cx: W / 2, cy: H / 2, scale: 1, yBase: 0 };

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const el of elements) {
    for (const v of el.mesh.vertices) {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
    }
  }

  const yBase = minY;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;

  // Estimate projected extents for scale fitting
  const projRange = Math.max(rangeX + rangeZ, rangeY + (rangeX + rangeZ) * 0.5);
  const scale = Math.min((W * 0.55) / projRange, (H * 0.55) / projRange, 4);

  const cx = W / 2 - ((minX + maxX) / 2 - (minZ + maxZ) / 2) * 0.866 * scale;
  const cy = H * 0.6 + rangeY * scale * 0.2;

  return { cx, cy, scale, yBase };
}

function ElementWireframe({
  el,
  vt,
  isSelected,
  onSelect,
}: {
  el: StructuralElement3D;
  vt: ViewTransform;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { mesh } = el;
  const projected = mesh.vertices.map((v) => isoProject(v, vt.cx, vt.cy, vt.scale, vt.yBase));

  // Build edge set from faces (avoid duplicates)
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of mesh.faces) {
    for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = `${Math.min(u, v)}-${Math.max(u, v)}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([u, v]);
      }
    }
  }

  const strokeColor = isSelected ? '#ffffff' : mesh.color;
  const strokeWidth = isSelected ? 1.5 : 0.8;
  const fillOpacity = isSelected ? 0.12 : 0.06;

  return (
    <g style={{ cursor: 'pointer' }} onClick={onSelect}>
      {/* Face fills for depth hint */}
      {mesh.faces.map(([a, b, c], fi) => {
        const pa = projected[a], pb = projected[b], pc = projected[c];
        if (!pa || !pb || !pc) return null;
        return (
          <polygon
            key={`f${fi}`}
            points={`${pa.sx},${pa.sy} ${pb.sx},${pb.sy} ${pc.sx},${pc.sy}`}
            fill={mesh.color}
            fillOpacity={fillOpacity}
            stroke="none"
          />
        );
      })}
      {/* Wireframe edges */}
      {edges.map(([u, v], ei) => {
        const pu = projected[u], pv = projected[v];
        if (!pu || !pv) return null;
        return (
          <line
            key={`e${ei}`}
            x1={pu.sx} y1={pu.sy}
            x2={pv.sx} y2={pv.sy}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeOpacity={0.85}
          />
        );
      })}
    </g>
  );
}

function SensorMarkerDot({
  marker,
  vt,
  isSelected,
  onSelect,
}: {
  marker: Scene3D['sensorMarkers'][number];
  vt: ViewTransform;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { sx, sy } = isoProject(marker.position, vt.cx, vt.cy, vt.scale, vt.yBase);
  const color = ALARM_COLORS[marker.alarmLevel] ?? '#22c55e';
  return (
    <g style={{ cursor: 'pointer' }} onClick={onSelect}>
      {isSelected && <circle cx={sx} cy={sy} r={12} fill={color} fillOpacity={0.2} />}
      <circle cx={sx} cy={sy} r={5} fill={color} stroke="#000" strokeWidth={0.5} />
      <text
        x={sx + 8} y={sy + 4}
        fill={T.text}
        fontSize={9}
        fontFamily="system-ui, sans-serif"
      >
        {marker.sensorId.split('-').pop()}
      </text>
    </g>
  );
}

function DemGrid({
  dem,
  vt,
}: {
  dem: Scene3D['dem'];
  vt: ViewTransform;
}) {
  // Only render first 8x8 grid to avoid SVG overload
  const rows = Math.min(dem.height, 8);
  const cols = Math.min(dem.width, 8);

  const lines: React.ReactNode[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const projected = [
        isoProject({ x: col * dem.resolution, y: dem.elevations[row]?.[col] ?? 0, z: row * dem.resolution }, vt.cx, vt.cy, vt.scale, vt.yBase),
        isoProject({ x: (col + 1) * dem.resolution, y: dem.elevations[row]?.[col + 1] ?? 0, z: row * dem.resolution }, vt.cx, vt.cy, vt.scale, vt.yBase),
        isoProject({ x: col * dem.resolution, y: dem.elevations[row + 1]?.[col] ?? 0, z: (row + 1) * dem.resolution }, vt.cx, vt.cy, vt.scale, vt.yBase),
        isoProject({ x: (col + 1) * dem.resolution, y: dem.elevations[row + 1]?.[col + 1] ?? 0, z: (row + 1) * dem.resolution }, vt.cx, vt.cy, vt.scale, vt.yBase),
      ];
      lines.push(
        <line key={`d-h-${row}-${col}`} x1={projected[0].sx} y1={projected[0].sy} x2={projected[1].sx} y2={projected[1].sy} stroke="oklch(28% 0.04 220)" strokeWidth={0.5} />,
        <line key={`d-v-${row}-${col}`} x1={projected[0].sx} y1={projected[0].sy} x2={projected[2].sx} y2={projected[2].sy} stroke="oklch(28% 0.04 220)" strokeWidth={0.5} />,
      );
    }
  }
  return <g>{lines}</g>;
}

function Scene3DCanvas({
  scene,
  selectedId,
  onSelectElement,
  onSelectSensor,
}: {
  scene: Scene3D;
  selectedId: string | null;
  onSelectElement: (id: string) => void;
  onSelectSensor: (id: string) => void;
}) {
  const W = 900, H = 540;
  const vt = useMemo(() => computeViewTransform(scene.elements, W, H), [scene.elements]);

  // Sort elements so instrumentation_point renders last (on top)
  const sortedElements = useMemo(() => [
    ...scene.elements.filter((e) => e.type !== 'instrumentation_point'),
    ...scene.elements.filter((e) => e.type === 'instrumentation_point'),
  ], [scene.elements]);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ background: 'oklch(7% 0.015 220)', display: 'block', flex: 1 }}
    >
      {/* Axis guides */}
      <g opacity={0.3}>
        {/* X axis (red) */}
        <line
          x1={vt.cx} y1={vt.cy}
          x2={vt.cx + 80 * 0.866} y2={vt.cy + 80 * 0.5}
          stroke="#ef4444" strokeWidth={1}
        />
        <text x={vt.cx + 82 * 0.866} y={vt.cy + 82 * 0.5} fill="#ef4444" fontSize={9}>X</text>
        {/* Y axis (green) */}
        <line x1={vt.cx} y1={vt.cy} x2={vt.cx} y2={vt.cy - 80} stroke="#22c55e" strokeWidth={1} />
        <text x={vt.cx + 3} y={vt.cy - 82} fill="#22c55e" fontSize={9}>Y</text>
        {/* Z axis (blue) */}
        <line
          x1={vt.cx} y1={vt.cy}
          x2={vt.cx - 80 * 0.866} y2={vt.cy + 80 * 0.5}
          stroke="#3b82f6" strokeWidth={1}
        />
        <text x={vt.cx - 90 * 0.866} y={vt.cy + 90 * 0.5} fill="#3b82f6" fontSize={9}>Z</text>
      </g>

      {/* DEM terrain grid */}
      <DemGrid dem={scene.dem} vt={vt} />

      {/* Structural elements */}
      {sortedElements.map((el) => (
        <ElementWireframe
          key={el.id}
          el={el}
          vt={vt}
          isSelected={selectedId === el.id}
          onSelect={() => onSelectElement(el.id)}
        />
      ))}

      {/* Sensor markers */}
      {scene.sensorMarkers.map((marker) => (
        <SensorMarkerDot
          key={marker.sensorId}
          marker={marker}
          vt={vt}
          isSelected={selectedId === marker.sensorId}
          onSelect={() => onSelectSensor(marker.sensorId)}
        />
      ))}

      {/* Watermark */}
      <text
        x={W - 8} y={H - 8}
        fill={T.dim}
        fontSize={9}
        textAnchor="end"
        fontFamily="system-ui, sans-serif"
      >
        MOTHER v7 · ISO 16739 · Wireframe Preview
      </text>
    </svg>
  );
}

// ─── Info panel ───────────────────────────────────────────────────────────────

function InfoPanel({
  scene,
  selectedId,
}: {
  scene: Scene3D;
  selectedId: string | null;
}) {
  const selectedElement = scene.elements.find((e) => e.id === selectedId);
  const selectedMarker = scene.sensorMarkers.find((m) => m.sensorId === selectedId);

  const elementCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const el of scene.elements) {
      counts[el.type] = (counts[el.type] ?? 0) + 1;
    }
    return counts;
  }, [scene.elements]);

  const panelStyle: React.CSSProperties = {
    width: 240,
    background: T.surface,
    borderLeft: `1px solid ${T.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflowY: 'auto',
    flexShrink: 0,
    fontFamily: 'system-ui, sans-serif',
  };
  const sectionHead: React.CSSProperties = {
    padding: '10px 14px',
    borderBottom: `1px solid ${T.border}`,
    color: T.muted,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 14px',
    borderBottom: `1px solid ${T.border}`,
    fontSize: 12,
  };

  return (
    <div style={panelStyle}>
      {/* Structure summary */}
      <div style={sectionHead}><Info size={10} style={{ display: 'inline', marginRight: 5 }} />Structure</div>
      <div style={rowStyle}>
        <span style={{ color: T.muted }}>ID</span>
        <span style={{ color: T.text, fontFamily: 'monospace', fontSize: 11 }}>{scene.structureId}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: T.muted }}>Elements</span>
        <span style={{ color: T.accent, fontWeight: 700 }}>{scene.elements.length}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: T.muted }}>Sensors</span>
        <span style={{ color: T.green, fontWeight: 700 }}>{scene.sensorMarkers.length}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: T.muted }}>DEM size</span>
        <span style={{ color: T.text, fontSize: 11 }}>{scene.dem.width}×{scene.dem.height}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ color: T.muted }}>Resolution</span>
        <span style={{ color: T.text, fontSize: 11 }}>{scene.dem.resolution} m/cell</span>
      </div>

      {/* Element type breakdown */}
      <div style={sectionHead}><Layers size={10} style={{ display: 'inline', marginRight: 5 }} />Elements</div>
      {Object.entries(elementCounts).map(([type, count]) => (
        <div key={type} style={rowStyle}>
          <span style={{ color: T.muted, fontSize: 11 }}>{type.replace('_', ' ')}</span>
          <span style={{ color: T.text }}>{count}</span>
        </div>
      ))}

      {/* Selection detail */}
      {(selectedElement ?? selectedMarker) && (
        <>
          <div style={sectionHead}>Selection</div>
          {selectedElement && (
            <>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>ID</span>
                <span style={{ color: T.text, fontFamily: 'monospace', fontSize: 10 }}>{selectedElement.id.split('-').slice(-2).join('-')}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Type</span>
                <span style={{ color: T.accent, fontSize: 11 }}>{selectedElement.type}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Vertices</span>
                <span style={{ color: T.text }}>{selectedElement.mesh.vertices.length}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Faces</span>
                <span style={{ color: T.text }}>{selectedElement.mesh.faces.length}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Color</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.text }}>
                  <span style={{ width: 12, height: 12, background: selectedElement.mesh.color, borderRadius: 2, display: 'inline-block' }} />
                  {selectedElement.mesh.color}
                </span>
              </div>
              {/* IFC properties */}
              {Object.entries(selectedElement.properties).slice(0, 5).map(([k, v]) => (
                <div key={k} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span style={{ color: T.dim, fontSize: 10 }}>{k}</span>
                  <span style={{ color: T.text, fontSize: 11, wordBreak: 'break-all' }}>{String(v)}</span>
                </div>
              ))}
            </>
          )}
          {selectedMarker && (
            <>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Sensor</span>
                <span style={{ color: T.text, fontFamily: 'monospace', fontSize: 11 }}>{selectedMarker.sensorId}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Alarm</span>
                <span style={{ color: ALARM_COLORS[selectedMarker.alarmLevel] ?? T.green, fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>
                  {selectedMarker.alarmLevel}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>X</span>
                <span style={{ color: T.text, fontFamily: 'monospace' }}>{selectedMarker.position.x.toFixed(2)}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Y</span>
                <span style={{ color: T.text, fontFamily: 'monospace' }}>{selectedMarker.position.y.toFixed(2)}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ color: T.muted }}>Z</span>
                <span style={{ color: T.text, fontFamily: 'monospace' }}>{selectedMarker.position.z.toFixed(2)}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Controls legend ──────────────────────────────────────────────────────────

function ControlsLegend() {
  const items: Array<{ key: string; desc: string }> = [
    { key: 'Click', desc: 'Select element' },
    { key: 'Orbit', desc: 'Rotate view (isometric fixed)' },
    { key: 'Scroll', desc: 'Zoom in / out' },
    { key: 'Shift+drag', desc: 'Pan viewport' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 14, left: 14,
      background: 'oklch(10% 0.02 220 / 0.85)',
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: '8px 12px',
      backdropFilter: 'blur(4px)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ color: T.muted, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
        <MousePointer2 size={9} />Controls
      </div>
      {items.map((item) => (
        <div key={item.key} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 3 }}>
          <kbd style={{
            background: T.surfaceHover, border: `1px solid ${T.border}`,
            borderRadius: 3, padding: '1px 5px', fontSize: 9, color: T.text,
            fontFamily: 'monospace', whiteSpace: 'nowrap',
          }}>{item.key}</kbd>
          <span style={{ fontSize: 10, color: T.muted }}>{item.desc}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Demo scene fallback ──────────────────────────────────────────────────────

function buildDemoScene(): Scene3D {
  return {
    structureId: 'DEMO-DAM-01',
    elements: [
      {
        id: 'DEMO-DAM-01-dam-body',
        type: 'dam_body',
        mesh: {
          id: 'DEMO-DAM-01-dam-body-mesh',
          name: 'Dam Body',
          color: '#8B7355',
          opacity: 1.0,
          vertices: [
            { x: -60, y: 0, z: 0 }, { x: 60, y: 0, z: 0 },
            { x: -20, y: 40, z: 0 }, { x: 20, y: 40, z: 0 },
            { x: -60, y: 0, z: 80 }, { x: 60, y: 0, z: 80 },
            { x: -20, y: 40, z: 80 }, { x: 20, y: 40, z: 80 },
          ],
          faces: [
            [0, 1, 2], [1, 3, 2],
            [4, 6, 5], [5, 6, 7],
            [0, 4, 1], [1, 4, 5],
            [2, 3, 6], [3, 7, 6],
            [0, 2, 4], [2, 6, 4],
            [1, 5, 3], [3, 5, 7],
          ],
        },
        properties: { material: 'earthfill', crestElevation: 40, baseElevation: 0 },
      },
      {
        id: 'DEMO-DAM-01-foundation',
        type: 'foundation',
        mesh: {
          id: 'DEMO-DAM-01-foundation-mesh',
          name: 'Foundation',
          color: '#5A5A5A',
          opacity: 0.9,
          vertices: [
            { x: -80, y: -2, z: 0 }, { x: 80, y: -2, z: 0 },
            { x: 80, y: -2, z: 80 }, { x: -80, y: -2, z: 80 },
          ],
          faces: [[0, 1, 2], [0, 2, 3]],
        },
        properties: { material: 'rock' },
      },
      {
        id: 'DEMO-DAM-01-drainage',
        type: 'drainage',
        mesh: {
          id: 'DEMO-DAM-01-drainage-mesh',
          name: 'Drainage Blanket',
          color: '#4A90D9',
          opacity: 0.75,
          vertices: [
            { x: -0.75, y: 0, z: 16 }, { x: 0.75, y: 0, z: 16 },
            { x: 0.75, y: 24, z: 16 }, { x: -0.75, y: 24, z: 16 },
            { x: -0.75, y: 0, z: 64 }, { x: 0.75, y: 0, z: 64 },
            { x: 0.75, y: 24, z: 64 }, { x: -0.75, y: 24, z: 64 },
          ],
          faces: [
            [0, 1, 2], [0, 2, 3],
            [4, 6, 5], [4, 7, 6],
            [0, 4, 1], [1, 4, 5],
            [2, 6, 3], [3, 6, 7],
            [0, 3, 4], [3, 7, 4],
            [1, 5, 2], [2, 5, 6],
          ],
        },
        properties: { material: 'filteredGravel' },
      },
    ],
    dem: {
      width: 8, height: 8, resolution: 20,
      elevations: Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 8 }, (__, col) => {
          const nx = (col / 7) * 2 - 1;
          const ny = (row / 7) * 2 - 1;
          return -8 * Math.exp(-(nx * nx + ny * ny) * 2);
        }),
      ),
    },
    sensorMarkers: [
      { sensorId: 'DEMO-DAM-01-ip-p1', position: { x: -15, y: 16, z: 24 }, alarmLevel: 'normal' },
      { sensorId: 'DEMO-DAM-01-ip-p2', position: { x: 15, y: 12, z: 56 }, alarmLevel: 'watch' },
      { sensorId: 'DEMO-DAM-01-ip-in1', position: { x: 0, y: 40, z: 40 }, alarmLevel: 'normal' },
    ],
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SHMS3DEnvironment() {
  const navigate = useNavigate();
  const [scene, setScene] = useState<Scene3D | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [structureId] = useState('DEMO-DAM-01');

  const fetchScene = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/a2a/shms/3d/${structureId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: Scene3D = await res.json();
      setScene(data);
    } catch (err) {
      // Fall back to demo data if API is unavailable
      setScene(buildDemoScene());
      setError(
        err instanceof Error
          ? `API unavailable — showing demo scene. (${err.message})`
          : 'API unavailable — showing demo scene.',
      );
    } finally {
      setLoading(false);
    }
  }, [structureId]);

  useEffect(() => {
    void fetchScene();
  }, [fetchScene]);

  const handleExportGLTF = useCallback(() => {
    if (!scene) return;
    // Minimal GLTF stub export (full export available via server)
    const payload = JSON.stringify({ structureId: scene.structureId, elementCount: scene.elements.length, sensorCount: scene.sensorMarkers.length }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scene.structureId}-scene-info.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scene]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const rootStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: T.bg, color: T.text, fontFamily: 'system-ui, sans-serif',
  };
  const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderBottom: `1px solid ${T.border}`,
    background: T.surface, flexShrink: 0,
  };
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
    border: `1px solid ${active ? T.accent : T.border}`,
    background: active ? T.blueBg : 'none',
    color: active ? T.accent : T.text,
    transition: 'all 0.15s',
  });
  const bodyStyle: React.CSSProperties = { display: 'flex', flex: 1, overflow: 'hidden' };
  const canvasAreaStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
  };

  return (
    <div style={rootStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <button onClick={() => navigate('/shms')} style={{ ...btnStyle(), padding: '4px 8px' }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>SHMS · Ambiente 3D</span>
        <span style={{ color: T.muted, fontSize: 12 }}>
          Wireframe · IFC ISO 16739 · {structureId}
        </span>
        <div style={{ flex: 1 }} />
        {scene && (
          <>
            <span style={{ fontSize: 11, color: T.muted }}>
              {scene.elements.length} elem · {scene.sensorMarkers.length} sensors
            </span>
          </>
        )}
        <button onClick={handleExportGLTF} style={btnStyle()} title="Export scene JSON" disabled={!scene}>
          <Download size={13} />
          <span>Export</span>
        </button>
        <button onClick={() => { void fetchScene(); }} style={btnStyle()} title="Refresh scene">
          <RefreshCw size={13} />
        </button>
      </header>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '8px 16px', background: T.yellowBg, borderBottom: `1px solid ${T.yellow}`,
          color: T.yellow, fontSize: 12, flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      <div style={bodyStyle}>
        {/* 3D Canvas area */}
        <div style={canvasAreaStyle}>
          {loading ? (
            // Loading skeleton
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
              <SkeletonBlock w="60%" h={24} />
              <SkeletonBlock w="100%" h={380} />
              <div style={{ display: 'flex', gap: 12 }}>
                <SkeletonBlock w="33%" h={60} />
                <SkeletonBlock w="33%" h={60} />
                <SkeletonBlock w="33%" h={60} />
              </div>
            </div>
          ) : scene ? (
            <>
              <Scene3DCanvas
                scene={scene}
                selectedId={selectedId}
                onSelectElement={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                onSelectSensor={(id) => setSelectedId((prev) => (prev === id ? null : id))}
              />
              <ControlsLegend />
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 14 }}>
              No scene data available.
            </div>
          )}
        </div>

        {/* Right info panel */}
        {!loading && scene && (
          <InfoPanel scene={scene} selectedId={selectedId} />
        )}
      </div>

      {/* Inline keyframe animation for skeleton */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
