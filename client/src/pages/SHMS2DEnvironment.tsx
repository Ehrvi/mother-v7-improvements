/**
 * SHMS 2D Environment — client/src/pages/SHMS2DEnvironment.tsx
 * MOTHER v7 | Module 4
 *
 * ISO 19107:2003 — Spatial schema for GIS | ICOLD B158 §4.3 — Dam monitoring visualization
 * ISO 9241-11:2018 — Usability | IEC 60073 — Color coding for alarm levels
 * Tobler (1970) — Map projection normalization for SVG viewport
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ZoomIn, ZoomOut, Ruler, Download, Layers, RefreshCw } from 'lucide-react';

// ─── Design tokens (mirrors SHMSPage.tsx) ────────────────────────────────────
const T = {
  bg: 'oklch(8% 0.02 220)', surface: 'oklch(11% 0.02 220)', surfaceHover: 'oklch(14% 0.03 220)',
  border: 'oklch(18% 0.03 220)', borderHover: 'oklch(24% 0.04 220)',
  text: 'oklch(88% 0.01 220)', muted: 'oklch(52% 0.02 220)', dim: 'oklch(38% 0.02 220)',
  accent: 'oklch(68% 0.18 220)', green: 'oklch(72% 0.18 145)', greenBg: 'oklch(14% 0.06 145)',
  yellow: 'oklch(78% 0.16 80)', yellowBg: 'oklch(14% 0.06 80)',
  red: 'oklch(65% 0.22 25)', redBg: 'oklch(14% 0.06 25)',
  orange: 'oklch(72% 0.18 50)', orangeBg: 'oklch(14% 0.06 50)',
  blue: 'oklch(68% 0.16 260)', blueBg: 'oklch(14% 0.05 260)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Sensor2D {
  id: string; name: string; type: string;
  lat: number; lng: number; value: number; unit: string;
  alarmLevel: 'normal' | 'watch' | 'warning' | 'alert' | 'critical';
  group?: string;
}
interface GeoLayer {
  id: string; name: string; type: 'orthophoto' | 'contour' | 'geological' | 'risk_zone';
  visible: boolean; color?: string; opacity: number;
}
interface Reading { ts: number; value: number; }

// ─── Sample data — Barragem de Brumadinho (MG), approximate coordinates ──────
const DEMO_SENSORS: Sensor2D[] = [
  { id: 'P-01', name: 'Piezômetro P-01', type: 'Piezômetro', lat: -20.1193, lng: -44.1250, value: 142.5, unit: 'kPa', alarmLevel: 'normal',  group: 'Talúde Sul' },
  { id: 'P-02', name: 'Piezômetro P-02', type: 'Piezômetro', lat: -20.1198, lng: -44.1242, value: 198.3, unit: 'kPa', alarmLevel: 'watch',   group: 'Talúde Sul' },
  { id: 'IN-01', name: 'Inclinômetro IN-01', type: 'Inclinômetro', lat: -20.1185, lng: -44.1258, value: 18.7, unit: 'mm', alarmLevel: 'warning', group: 'Crista' },
  { id: 'P-03', name: 'Piezômetro P-03', type: 'Piezômetro', lat: -20.1202, lng: -44.1235, value: 231.0, unit: 'kPa', alarmLevel: 'alert',   group: 'Talúde Norte' },
  { id: 'RN-01', name: 'Referência RN-01', type: 'Marco Topográfico', lat: -20.1178, lng: -44.1265, value: 0.5, unit: 'mm', alarmLevel: 'normal', group: 'Crista' },
];
const DEMO_LAYERS: GeoLayer[] = [
  { id: 'l-contour',   name: 'Curvas de Nível',  type: 'contour',    visible: true,  color: '#4ade80', opacity: 0.4 },
  { id: 'l-geo',       name: 'Geologia',          type: 'geological', visible: false, color: '#f97316', opacity: 0.3 },
  { id: 'l-risk',      name: 'Zonas de Risco',    type: 'risk_zone',  visible: true,  color: '#ef4444', opacity: 0.25 },
  { id: 'l-ortho',     name: 'Ortofoto',          type: 'orthophoto', visible: false, color: undefined, opacity: 1.0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number; }

function latLngToSVG(
  lat: number, lng: number, bounds: Bounds, width: number, height: number, pad = 48,
): { x: number; y: number } {
  const dLat = bounds.maxLat - bounds.minLat || 0.001;
  const dLng = bounds.maxLng - bounds.minLng || 0.001;
  const x = pad + ((lng - bounds.minLng) / dLng) * (width - pad * 2);
  const y = pad + ((bounds.maxLat - lat) / dLat) * (height - pad * 2);
  return { x, y };
}

function haversineMeters(a: Sensor2D, b: Sensor2D): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ALARM_COLORS: Record<Sensor2D['alarmLevel'], string> = {
  normal: '#22c55e', watch: '#84cc16', warning: '#eab308', alert: '#f97316', critical: '#ef4444',
};

function genReadings(seed: number, n = 30): Reading[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    ts: now - (n - i) * 60_000,
    value: seed + Math.sin(i * 0.4) * seed * 0.12 + (Math.random() - 0.5) * seed * 0.06,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LayerSidebar({
  layers, onToggle, sensors, filterType, filterGroup, setFilterType, setFilterGroup,
}: {
  layers: GeoLayer[]; onToggle: (id: string) => void; sensors: Sensor2D[];
  filterType: string; filterGroup: string;
  setFilterType: (v: string) => void; setFilterGroup: (v: string) => void;
}) {
  const types = useMemo(() => ['all', ...Array.from(new Set(sensors.map((s) => s.type)))], [sensors]);
  const groups = useMemo(() => ['all', ...Array.from(new Set(sensors.map((s) => s.group ?? 'N/A')))], [sensors]);
  const sidebarStyle: React.CSSProperties = {
    width: 220, background: T.surface, borderRight: `1px solid ${T.border}`,
    display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', flexShrink: 0,
  };
  const headStyle: React.CSSProperties = { padding: '12px 14px', borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' };
  const labelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', color: T.text, fontSize: 12 };
  const selectStyle: React.CSSProperties = { background: T.surfaceHover, border: `1px solid ${T.border}`, color: T.text, borderRadius: 4, padding: '3px 6px', fontSize: 11, width: '100%' };
  return (
    <div style={sidebarStyle}>
      <div style={headStyle}><Layers size={12} style={{ display: 'inline', marginRight: 6 }} />Camadas</div>
      {layers.map((l) => (
        <label key={l.id} style={labelStyle}>
          <input type="checkbox" checked={l.visible} onChange={() => onToggle(l.id)} />
          {l.color && <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, flexShrink: 0 }} />}
          <span>{l.name}</span>
        </label>
      ))}
      <div style={{ ...headStyle, marginTop: 8 }}>Filtros</div>
      <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: T.muted, fontSize: 10, marginBottom: 2 }}>TIPO</div>
        <select style={selectStyle} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ color: T.muted, fontSize: 10, marginTop: 4 }}>GRUPO</div>
        <select style={selectStyle} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
    </div>
  );
}

function SensorPopup({ sensor, onClose }: { sensor: Sensor2D; onClose: () => void }) {
  const readings = useMemo(() => genReadings(sensor.value), [sensor.id]);
  const popStyle: React.CSSProperties = {
    position: 'absolute', top: 10, right: 10, width: 220, background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, zIndex: 20,
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  };
  const color = ALARM_COLORS[sensor.alarmLevel];
  return (
    <div style={popStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{sensor.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>{sensor.type} · {sensor.group}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color }}>{sensor.value.toFixed(1)}</span>
        <span style={{ fontSize: 12, color: T.muted }}>{sensor.unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        <span style={{ fontSize: 11, color, textTransform: 'uppercase' }}>{sensor.alarmLevel}</span>
      </div>
      <MiniChart readings={readings} color={color} unit={sensor.unit} />
    </div>
  );
}

function MiniChart({ readings, color, unit }: { readings: Reading[]; color: string; unit: string }) {
  const W = 192, H = 64, pad = 4;
  if (readings.length < 2) return null;
  const vals = readings.map((r) => r.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const toX = (i: number) => pad + (i / (readings.length - 1)) * (W - pad * 2);
  const toY = (v: number) => pad + ((max - v) / range) * (H - pad * 2);
  const pts = readings.map((r, i) => `${toX(i)},${toY(r.value)}`).join(' ');
  const fillPts = `${toX(0)},${H} ${pts} ${toX(readings.length - 1)},${H}`;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polygon points={fillPts} fill={color} fillOpacity={0.15} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <text x={pad} y={H - 2} fill={T.muted as string} fontSize={9}>{min.toFixed(0)} {unit}</text>
      <text x={W - pad} y={H - 2} fill={T.muted as string} fontSize={9} textAnchor="end">{max.toFixed(0)} {unit}</text>
    </svg>
  );
}

function MapSVG({
  sensors, layers, zoom, selected, measuring, onSelect,
}: {
  sensors: Sensor2D[]; layers: GeoLayer[]; zoom: number;
  selected: string[]; measuring: boolean;
  onSelect: (id: string) => void;
}) {
  const W = 800, H = 520;
  const bounds = useMemo<Bounds>(() => {
    if (sensors.length === 0) return { minLat: -0.002, maxLat: 0.002, minLng: -0.002, maxLng: 0.002 };
    const lats = sensors.map((s) => s.lat);
    const lngs = sensors.map((s) => s.lng);
    const pad = 0.002;
    return { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLng: Math.min(...lngs) - pad, maxLng: Math.max(...lngs) + pad };
  }, [sensors]);

  const toXY = useCallback(
    (lat: number, lng: number) => latLngToSVG(lat, lng, bounds, W, H),
    [bounds],
  );

  const riskLayer = layers.find((l) => l.type === 'risk_zone' && l.visible);
  const contourLayer = layers.find((l) => l.type === 'contour' && l.visible);
  const geoLayer = layers.find((l) => l.type === 'geological' && l.visible);

  // Distance line between first two selected sensors
  const distLine = useMemo(() => {
    if (selected.length < 2) return null;
    const a = sensors.find((s) => s.id === selected[0])!;
    const b = sensors.find((s) => s.id === selected[1])!;
    if (!a || !b) return null;
    const pa = toXY(a.lat, a.lng);
    const pb = toXY(b.lat, b.lng);
    const dist = haversineMeters(a, b);
    return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, dist };
  }, [selected, sensors, toXY]);

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const x = 48 + (i / steps) * (W - 96);
      const y = 48 + (i / steps) * (H - 96);
      const lat = bounds.maxLat - (i / steps) * (bounds.maxLat - bounds.minLat);
      const lng = bounds.minLng + (i / steps) * (bounds.maxLng - bounds.minLng);
      lines.push(
        <line key={`gv${i}`} x1={x} y1={48} x2={x} y2={H - 48} stroke={T.border} strokeWidth={0.5} />,
        <line key={`gh${i}`} x1={48} y1={y} x2={W - 48} y2={y} stroke={T.border} strokeWidth={0.5} />,
        <text key={`lt${i}`} x={2} y={y + 4} fill={T.dim as string} fontSize={8}>{lat.toFixed(4)}°</text>,
        <text key={`lnt${i}`} x={x} y={H - 2} fill={T.dim as string} fontSize={8} textAnchor="middle">{lng.toFixed(4)}°</text>,
      );
    }
    return lines;
  }, [bounds]);

  return (
    <svg
      width="100%" viewBox={`0 0 ${W} ${H}`}
      style={{ background: 'oklch(9% 0.015 220)', cursor: measuring ? 'crosshair' : 'default', flex: 1 }}
      transform={`scale(${zoom})`}
    >
      {/* Grid */}
      {gridLines}

      {/* Contour lines (decorative arcs) */}
      {contourLayer && [0.3, 0.55, 0.75].map((r, i) => {
        const cx = W / 2, cy = H / 2;
        const rx = (W / 2 - 48) * r, ry = (H / 2 - 48) * r;
        return <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={contourLayer.color} strokeWidth={0.8} strokeOpacity={contourLayer.opacity} />;
      })}

      {/* Geological zones */}
      {geoLayer && (
        <rect x={100} y={80} width={280} height={200} rx={8} fill={geoLayer.color} fillOpacity={geoLayer.opacity} />
      )}

      {/* Risk zone polygon */}
      {riskLayer && (() => {
        const center = sensors[3] ? toXY(sensors[3].lat, sensors[3].lng) : { x: W / 2, y: H / 2 };
        const pts = [
          [center.x - 60, center.y - 40], [center.x + 40, center.y - 50],
          [center.x + 50, center.y + 30], [center.x - 20, center.y + 50],
        ].map((p) => p.join(',')).join(' ');
        return <polygon points={pts} fill={riskLayer.color!} fillOpacity={riskLayer.opacity} stroke={riskLayer.color!} strokeWidth={1} />;
      })()}

      {/* Distance measurement line */}
      {distLine && (
        <>
          <line x1={distLine.x1} y1={distLine.y1} x2={distLine.x2} y2={distLine.y2}
            stroke={T.yellow as string} strokeWidth={1.5} strokeDasharray="6 3" />
          <text x={(distLine.x1 + distLine.x2) / 2} y={(distLine.y1 + distLine.y2) / 2 - 8}
            fill={T.yellow as string} fontSize={11} textAnchor="middle" fontWeight="bold">
            {distLine.dist.toFixed(1)} m
          </text>
        </>
      )}

      {/* Sensors */}
      {sensors.map((s) => {
        const { x, y } = toXY(s.lat, s.lng);
        const color = ALARM_COLORS[s.alarmLevel];
        const isSelected = selected.includes(s.id);
        return (
          <g key={s.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(s.id)}>
            {isSelected && <circle cx={x} cy={y} r={18} fill={color} fillOpacity={0.2} />}
            <circle cx={x} cy={y} r={10} fill={color} stroke={isSelected ? '#fff' : color} strokeWidth={isSelected ? 2 : 0.5} />
            <text x={x} y={y + 24} fill={T.text as string} fontSize={10} textAnchor="middle">{s.id}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SHMS2DEnvironment() {
  const navigate = useNavigate();
  const [sensors, setSensors] = useState<Sensor2D[]>(DEMO_SENSORS);
  const [layers, setLayers] = useState<GeoLayer[]>(DEMO_LAYERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [filterType, setFilterType] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const [loading, setLoading] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const filteredSensors = useMemo(() => sensors.filter((s) => {
    if (filterType !== 'all' && s.type !== filterType) return false;
    if (filterGroup !== 'all' && (s.group ?? 'N/A') !== filterGroup) return false;
    return true;
  }), [sensors, filterType, filterGroup]);

  const popupSensor = useMemo(() =>
    selected.length === 1 ? sensors.find((s) => s.id === selected[0]) ?? null : null,
    [selected, sensors]);

  const toggleLayer = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);

  const handleSensorClick = useCallback((id: string) => {
    if (measuring) {
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        const next = [...prev, id];
        return next.length > 2 ? next.slice(-2) : next;
      });
    } else {
      setSelected((prev) => prev[0] === id ? [] : [id]);
    }
  }, [measuring]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/a2a/shms/dashboard/all');
      if (res.ok) {
        const data = await res.json();
        // Map API sensors to Sensor2D if available
        if (Array.isArray(data?.sensors)) setSensors(data.sensors);
      }
    } catch {
      // silently fall back to demo data
    } finally {
      setLoading(false);
    }
  }, []);

  const exportSVG = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;
    const blob = new Blob([el.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'shms-2d-map.svg'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Root layout
  const root: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, color: T.text, fontFamily: 'system-ui, sans-serif' };
  const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 };
  const btnStyle = (active?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12, border: `1px solid ${active ? T.accent : T.border}`,
    background: active ? T.blueBg : 'none', color: active ? T.accent : T.text, transition: 'all 0.15s',
  });
  const bodyStyle: React.CSSProperties = { display: 'flex', flex: 1, overflow: 'hidden' };
  const mapArea: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' };
  const toolbarStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 };

  const alarmSummary = useMemo(() => {
    const counts = { normal: 0, watch: 0, warning: 0, alert: 0, critical: 0 };
    sensors.forEach((s) => counts[s.alarmLevel]++);
    return counts;
  }, [sensors]);

  return (
    <div style={root}>
      {/* Header */}
      <header style={headerStyle}>
        <button onClick={() => navigate('/shms')} style={{ ...btnStyle(), padding: '4px 8px' }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>SHMS · Ambiente 2D</span>
        <span style={{ color: T.muted, fontSize: 12 }}>WebGIS — Monitoramento Geotécnico</span>
        <div style={{ flex: 1 }} />
        {/* Alarm summary badges */}
        {Object.entries(alarmSummary).map(([level, count]) => count > 0 && (
          <span key={level} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: `${ALARM_COLORS[level as Sensor2D['alarmLevel']]}22`, color: ALARM_COLORS[level as Sensor2D['alarmLevel']] }}>
            {count} {level}
          </span>
        ))}
        <button onClick={handleRefresh} style={btnStyle()} title="Atualizar dados">
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </header>

      <div style={bodyStyle}>
        {/* Left sidebar */}
        <LayerSidebar
          layers={layers} onToggle={toggleLayer} sensors={sensors}
          filterType={filterType} filterGroup={filterGroup}
          setFilterType={setFilterType} setFilterGroup={setFilterGroup}
        />

        {/* Map area */}
        <div style={mapArea}>
          {/* Toolbar */}
          <div style={toolbarStyle}>
            <button style={btnStyle()} onClick={() => setZoom((z) => Math.min(z + 0.2, 3))} title="Zoom in"><ZoomIn size={14} /></button>
            <button style={btnStyle()} onClick={() => setZoom((z) => Math.max(z - 0.2, 0.4))} title="Zoom out"><ZoomOut size={14} /></button>
            <span style={{ color: T.dim, fontSize: 11 }}>{Math.round(zoom * 100)}%</span>
            <div style={{ width: 1, height: 18, background: T.border, margin: '0 4px' }} />
            <button style={btnStyle(measuring)} onClick={() => { setMeasuring((m) => !m); setSelected([]); }} title="Medir distância">
              <Ruler size={14} /><span style={{ fontSize: 11 }}>Medir</span>
            </button>
            {measuring && selected.length === 2 && (
              <span style={{ fontSize: 11, color: T.yellow }}>
                {(() => {
                  const a = sensors.find((s) => s.id === selected[0])!;
                  const b = sensors.find((s) => s.id === selected[1])!;
                  return a && b ? `${haversineMeters(a, b).toFixed(1)} m` : '';
                })()}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button style={btnStyle()} onClick={exportSVG} title="Exportar SVG"><Download size={14} /><span style={{ fontSize: 11 }}>SVG</span></button>
          </div>

          {/* SVG Map */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <MapSVG
              sensors={filteredSensors} layers={layers}
              zoom={zoom} selected={selected}
              measuring={measuring} onSelect={handleSensorClick}
            />
            {/* Sensor popup */}
            {popupSensor && !measuring && (
              <SensorPopup sensor={popupSensor} onClose={() => setSelected([])} />
            )}
            {/* Measuring hint */}
            {measuring && (
              <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: T.surface, border: `1px solid ${T.yellow}`, color: T.yellow, padding: '4px 14px', borderRadius: 20, fontSize: 11 }}>
                {selected.length === 0 ? 'Clique em 2 sensores para medir distância' : selected.length === 1 ? 'Selecione o segundo sensor' : `Distância: ${(() => { const a = sensors.find((s) => s.id === selected[0])!; const b = sensors.find((s) => s.id === selected[1])!; return a && b ? haversineMeters(a, b).toFixed(1) + ' m' : ''; })()} · Clique para nova medição`}
              </div>
            )}
          </div>

          {/* Bottom chart for selected sensor (when not in measuring mode) */}
          {!measuring && selected.length === 1 && (() => {
            const s = sensors.find((x) => x.id === selected[0])!;
            if (!s) return null;
            const readings = genReadings(s.value);
            const color = ALARM_COLORS[s.alarmLevel];
            const W2 = 760, H2 = 90;
            const vals = readings.map((r) => r.value);
            const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
            const toX = (i: number) => 40 + (i / (readings.length - 1)) * (W2 - 60);
            const toY = (v: number) => 10 + ((max - v) / range) * (H2 - 24);
            const pts = readings.map((r, i) => `${toX(i)},${toY(r.value)}`).join(' ');
            const fillPts = `${toX(0)},${H2} ${pts} ${toX(readings.length - 1)},${H2}`;
            return (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: '8px 16px', background: T.surface, flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{s.name} — Últimas 30 leituras · {s.unit}</div>
                <svg width="100%" viewBox={`0 0 ${W2} ${H2}`} style={{ display: 'block' }}>
                  <polygon points={fillPts} fill={color} fillOpacity={0.1} />
                  <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
                  {[min, (min + max) / 2, max].map((v, i) => (
                    <text key={i} x={36} y={toY(v) + 3} fill={T.dim as string} fontSize={8} textAnchor="end">{v.toFixed(1)}</text>
                  ))}
                  <text x={40} y={H2 - 4} fill={T.dim as string} fontSize={8}>30 min atrás</text>
                  <text x={W2 - 20} y={H2 - 4} fill={T.dim as string} fontSize={8} textAnchor="end">agora</text>
                </svg>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
