/**
 * SHMSNarrativeTwin.tsx — "A Estrutura Conta Sua História" — SOTA Edition
 *
 * Full-screen 3D Digital Twin + AI Chat Bar + Tabbed Instrument Modals + Ambient HUD.
 *
 * Scientific basis:
 *   - Shneiderman (1996) "Overview first, zoom & filter, details on demand"
 *   - ISA-101 / IEC 62682: HPHMI — color for anomalies only, muted base
 *   - Klein (1998) Recognition-Primed Decision — experts see structure first
 *   - Tufte (2001) data-ink ratio — charts inside modals, not cluttering 3D
 *   - Gestalt figure-ground — modal backdrop blur separates focus
 *   - WCAG 2.1 AA — contrast ≥ 4.5:1, keyboard accessible
 *   - ICOLD Bulletin 158 — dam monitoring visualisation
 *   - Glassmorphism 2025 — depth + blur + motion + frosted-glass panels
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Mic, Send, ChevronLeft,
  Activity, Droplets, Thermometer, TrendingUp, AlertTriangle,
  FileText, BarChart3, Download, GitCompare, Clock,
  Cpu, Radio, Zap,
} from 'lucide-react';
import DigitalTwin3DViewer from '@/components/shms/DigitalTwin3DViewer';
import '@/styles/shms-narrative-twin.css';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  text:   'oklch(88% 0.01 220)',
  muted:  'oklch(52% 0.02 220)',
  dim:    'oklch(38% 0.02 220)',
  accent: 'oklch(68% 0.18 220)',
  green:  'oklch(72% 0.18 145)',
  yellow: 'oklch(78% 0.16 80)',
  red:    'oklch(65% 0.22 25)',
  teal:   'oklch(72% 0.14 195)',
  orange: 'oklch(72% 0.18 50)',
} as const;

// ─── Instrument data ────────────────────────────────────────────────────────
interface InstrumentData {
  id: string; name: string; type: string; model: string;
  location: string; elevation: string; installed: string; calibrated: string;
  range: string; precision: string; unit: string; currentValue: number;
  status: 'normal' | 'attention' | 'critical';
  trend: 'up' | 'down' | 'stable'; delta24h: number; signalQuality: number;
  hst: { hydrostatic: number; seasonal: number; time: number; residual: number };
  scientificBasis: string;
  history90d: number[]; forecast48h: number[];
  forecastUpper: number[]; forecastLower: number[];
  threshold: number;
}

function genHist(baseline: number, amp: number, len: number): number[] {
  const d: number[] = []; let v = baseline;
  for (let i = 0; i < len; i++) {
    v += (Math.random() - 0.48) * amp;
    v = Math.max(baseline - amp * 3, Math.min(baseline + amp * 3, v));
    d.push(Math.round(v * 100) / 100);
  }
  return d;
}

const INSTRUMENTS: InstrumentData[] = [
  {
    id: 'PZ-001', name: 'Piezômetro PZ-001', type: 'Piezômetro de Corda Vibrante',
    model: 'Geokon 4500S', location: 'Crista — Estação 1 (Y=100m)', elevation: '850 m.a.s.l.',
    installed: '15/03/2010', calibrated: '22/11/2025', range: '0–500 kPa', precision: '±0.1% FS',
    unit: 'kPa', currentValue: 143.2, status: 'normal', trend: 'stable', delta24h: -2.1,
    signalQuality: 98.2,
    hst: { hydrostatic: 62, seasonal: 23, time: 10, residual: 5 },
    scientificBasis: 'Monitorado conforme ICOLD Bulletin 158 §4.3 e GISTM (2020) §5.2. Modelo HST (Willm & Beaujoint, 1967) decompõe em componentes hidrostática (62%), sazonal (23%) e temporal (10%). Gradiente hidráulico: 0.12 < 0.5 (ICOLD). BiLSTM+Attention prevê estabilidade nas próximas 48h (confiança 92%).',
    history90d: genHist(143, 1.5, 90),
    forecast48h: [143.1, 143.0, 142.8, 142.9, 143.0, 143.1, 143.2, 143.0],
    forecastUpper: [144.8, 144.9, 144.7, 144.8, 145.0, 145.1, 145.2, 145.0],
    forecastLower: [141.4, 141.1, 140.9, 141.0, 141.0, 141.1, 141.2, 141.0],
    threshold: 180,
  },
  {
    id: 'PZ-003', name: 'Piezômetro PZ-003', type: 'Piezômetro de Corda Vibrante',
    model: 'Geokon 4500S', location: 'Galeria de inspeção — Estação 2 (Y=200m)', elevation: '790 m.a.s.l.',
    installed: '15/03/2010', calibrated: '22/11/2025', range: '0–500 kPa', precision: '±0.1% FS',
    unit: 'kPa', currentValue: 187.5, status: 'attention', trend: 'up', delta24h: 4.3,
    signalQuality: 96.1,
    hst: { hydrostatic: 71, seasonal: 15, time: 9, residual: 5 },
    scientificBasis: 'Piezômetro na galeria: componente hidrostática 71% (acima da média 62%). Subpressão elevada na fundação. ICOLD B.158 §6.2 recomenda monitoramento intensificado (>60% NA). BiLSTM prevê estabilização em 24h após estabilização do reservatório.',
    history90d: genHist(183, 2.0, 90),
    forecast48h: [187.8, 188.0, 187.5, 187.0, 186.5, 186.0, 185.8, 185.5],
    forecastUpper: [190.2, 190.5, 190.0, 189.5, 189.0, 188.5, 188.3, 188.0],
    forecastLower: [185.4, 185.5, 185.0, 184.5, 184.0, 183.5, 183.3, 183.0],
    threshold: 200,
  },
  {
    id: 'DISP-001', name: 'Extensômetro DISP-001', type: 'Extensômetro de Haste',
    model: 'RST MEMS Tiltmeter', location: 'Crista — Estação 2 (Y=200m)', elevation: '850 m.a.s.l.',
    installed: '20/04/2010', calibrated: '15/01/2026', range: '0–50 mm', precision: '±0.01 mm',
    unit: 'mm', currentValue: 2.34, status: 'normal', trend: 'up', delta24h: 0.21,
    signalQuality: 99.1,
    hst: { hydrostatic: 85, seasonal: 8, time: 5, residual: 2 },
    scientificBasis: 'HST: 85% hidrostática (r²=0.94), correlação forte com nível. Variação 0.21mm/24h consistente com Δnível 0.2m. Farrar & Worden (2012): <5mm mantém SHM Level 0. LSTM 48h: estabilização prevista.',
    history90d: genHist(2.1, 0.15, 90),
    forecast48h: [2.36, 2.38, 2.37, 2.35, 2.33, 2.32, 2.31, 2.30],
    forecastUpper: [2.52, 2.55, 2.54, 2.52, 2.50, 2.49, 2.48, 2.47],
    forecastLower: [2.20, 2.21, 2.20, 2.18, 2.16, 2.15, 2.14, 2.13],
    threshold: 5.0,
  },
  {
    id: 'TEMP-002', name: 'Termômetro TEMP-002', type: 'Termopar Tipo T',
    model: 'Omega TC-T-24', location: 'Corpo Montante (Y=200m)', elevation: '810 m.a.s.l.',
    installed: '20/04/2010', calibrated: '10/09/2025', range: '-20–+60 °C', precision: '±0.5 °C',
    unit: '°C', currentValue: 22.1, status: 'normal', trend: 'up', delta24h: 3.0,
    signalQuality: 97.8,
    hst: { hydrostatic: 5, seasonal: 78, time: 12, residual: 5 },
    scientificBasis: 'Sazonal dominante (78%) — modelo Fourier para condução térmica em concreto (k=1.5 W/m·K). Δ3°C/24h compatível com onda ambiente. Incropera & DeWitt (2007): atraso ~30 dias a 5m de profundidade.',
    history90d: genHist(19, 1.5, 90),
    forecast48h: [22.3, 22.5, 22.4, 22.2, 22.0, 21.8, 21.7, 21.5],
    forecastUpper: [23.5, 23.8, 23.7, 23.5, 23.3, 23.1, 23.0, 22.8],
    forecastLower: [21.1, 21.2, 21.1, 20.9, 20.7, 20.5, 20.4, 20.2],
    threshold: 40,
  },
  {
    id: 'NW-001', name: 'Nível NW-001', type: 'Transdutor de Pressão',
    model: 'Keller 36XW', location: 'Reservatório — Montante (Y=0m)', elevation: '845 m.a.s.l.',
    installed: '15/03/2010', calibrated: '01/12/2025', range: '0–100 m', precision: '±0.01 m',
    unit: 'm', currentValue: 72.3, status: 'normal', trend: 'stable', delta24h: 0.2,
    signalQuality: 99.5,
    hst: { hydrostatic: 0, seasonal: 55, time: 40, residual: 5 },
    scientificBasis: 'Variável independente principal do modelo HST. Sazonal dominante (55%). NA 72.3m = 80.3% capacidade máxima (90m). Operação normal conforme curva cota-volume.',
    history90d: genHist(71.5, 0.5, 90),
    forecast48h: [72.4, 72.3, 72.3, 72.2, 72.2, 72.1, 72.1, 72.0],
    forecastUpper: [73.0, 72.9, 72.9, 72.8, 72.8, 72.7, 72.7, 72.6],
    forecastLower: [71.8, 71.7, 71.7, 71.6, 71.6, 71.5, 71.5, 71.4],
    threshold: 85,
  },
  {
    id: 'SEEP-002', name: 'Vazão SEEP-002', type: 'Vertedouro Triangular',
    model: 'Thomson V-Notch', location: 'Dreno de pé — Jusante (Y=200m)', elevation: '762 m.a.s.l.',
    installed: '20/04/2010', calibrated: '15/06/2025', range: '0–10 L/min', precision: '±0.05 L/min',
    unit: 'L/min', currentValue: 0.41, status: 'normal', trend: 'down', delta24h: -0.02,
    signalQuality: 94.3,
    hst: { hydrostatic: 58, seasonal: 20, time: 15, residual: 7 },
    scientificBasis: 'Percolação: gradiente 0.12 (<0.5 ICOLD). Vazão 0.41 L/min estável, ↓5%/semana — consolidação do dreno. Darcy (1856): v=-k·∇h, k=1e-7 m/s. Sem piping ou erosão interna.',
    history90d: genHist(0.45, 0.03, 90),
    forecast48h: [0.40, 0.40, 0.39, 0.39, 0.39, 0.38, 0.38, 0.38],
    forecastUpper: [0.45, 0.45, 0.44, 0.44, 0.44, 0.43, 0.43, 0.43],
    forecastLower: [0.35, 0.35, 0.34, 0.34, 0.34, 0.33, 0.33, 0.33],
    threshold: 2.0,
  },
];

// ─── SVG Sparkline ──────────────────────────────────────────────────────────
function Sparkline({ data, color = T.teal, width = 200, height = 60, threshold, forecast, forecastUpper, forecastLower }: {
  data: number[]; color?: string; width?: number; height?: number; threshold?: number;
  forecast?: number[]; forecastUpper?: number[]; forecastLower?: number[];
}) {
  const allData = [...data, ...(forecast || [])];
  const min = Math.min(...allData, ...(forecastLower || [])) * 0.995;
  const max = Math.max(...allData, ...(forecastUpper || []), threshold || 0) * 1.005;
  const range = max - min || 1;
  const toX = (i: number, total: number) => (i / (total - 1)) * width;
  const toY = (v: number) => height - ((v - min) / range) * height;
  const mainPath = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i, allData.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  let forecastPath = '', confidencePath = '';
  if (forecast?.length) {
    const si = data.length - 1;
    const fData = [data[data.length - 1], ...forecast];
    forecastPath = fData.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(si + i, allData.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
    if (forecastUpper && forecastLower) {
      const up = [data[data.length - 1], ...forecastUpper];
      const dn = [data[data.length - 1], ...forecastLower];
      const upP = up.map((v, i) => `${toX(si + i, allData.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
      const dnP = dn.map((v, i) => `${toX(si + i, allData.length).toFixed(1)},${toY(v).toFixed(1)}`).reverse().join(' ');
      confidencePath = `M${upP} L${dnP} Z`;
    }
  }
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
      {confidencePath && <path d={confidencePath} fill={color} opacity={0.1} />}
      {threshold !== undefined && (
        <line x1={0} y1={toY(threshold)} x2={width} y2={toY(threshold)}
          stroke={T.red} strokeWidth={0.8} strokeDasharray="4 3" opacity={0.6} />
      )}
      <line x1={toX(data.length - 1, allData.length)} y1={0}
        x2={toX(data.length - 1, allData.length)} y2={height}
        stroke={T.accent} strokeWidth={0.5} opacity={0.3} />
      <path d={mainPath} fill="none" stroke={color} strokeWidth={1.5} />
      {forecastPath && <path d={forecastPath} fill="none" stroke={T.orange} strokeWidth={1.2} strokeDasharray="4 2" />}
    </svg>
  );
}

// ─── HST Decomposition Bar ──────────────────────────────────────────────────
function HSTBar({ hst }: { hst: InstrumentData['hst'] }) {
  const items = [
    { label: 'Hidrostática', value: hst.hydrostatic, color: 'oklch(68% 0.16 220)' },
    { label: 'Sazonal', value: hst.seasonal, color: 'oklch(72% 0.14 145)' },
    { label: 'Temporal', value: hst.time, color: 'oklch(72% 0.18 50)' },
    { label: 'Residual', value: hst.residual, color: 'oklch(52% 0.02 220)' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', height: 20, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
        {items.map(it => (
          <div key={it.label} style={{ width: `${it.value}%`, background: it.color, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }}
            title={`${it.label}: ${it.value}%`} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {items.map(it => (
          <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: T.muted }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
            {it.label} {it.value}%
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Health Arc SVG ─────────────────────────────────────────────────────────
function HealthArc({ value, size = 36 }: { value: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  const color = value > 80 ? T.green : value > 50 ? T.yellow : T.red;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="oklch(16% 0.02 220)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="nt-health-arc"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size > 30 ? 10 : 8} fontWeight={800}
        fontFamily="'JetBrains Mono', monospace">
        {value}
      </text>
    </svg>
  );
}

// ─── Tabbed Instrument Modal ────────────────────────────────────────────────
type ModalTab = 'chart' | 'hst' | 'specs' | 'ai';

function InstrumentModal({ instrument, onClose }: { instrument: InstrumentData; onClose: () => void }) {
  const [tab, setTab] = useState<ModalTab>('chart');
  const statusClass = `nt-status nt-status-${instrument.status}`;
  const trendIcon = instrument.trend === 'up' ? '↗' : instrument.trend === 'down' ? '↘' : '→';
  const pct = Math.min(100, (instrument.currentValue / instrument.threshold) * 100);
  const gaugeColor = pct < 50 ? T.green : pct < 75 ? T.yellow : pct < 90 ? T.orange : T.red;

  const tabs: { id: ModalTab; label: string; icon: string }[] = [
    { id: 'chart', label: 'Série Temporal', icon: '📊' },
    { id: 'hst', label: 'Análise HST', icon: '🔬' },
    { id: 'specs', label: 'Ficha Técnica', icon: '📋' },
    { id: 'ai', label: 'IA Análise', icon: '🤖' },
  ];

  return (
    <>
      <div className="nt-modal-backdrop" onClick={onClose} />
      <div className="nt-modal">
        <div className="nt-modal-accent" />

        {/* Header */}
        <div className="nt-modal-header">
          <div style={{ flex: 1 }}>
            <div className="nt-modal-title">{instrument.id} — {instrument.type}</div>
            <div className="nt-modal-subtitle">{instrument.location} · {instrument.elevation}</div>
          </div>
          <span className={statusClass}>
            {instrument.status === 'normal' ? '● Normal' : instrument.status === 'attention' ? '⚠ Atenção' : '✕ Crítico'}
          </span>
          <button className="nt-modal-close" onClick={onClose} title="Fechar"><X size={20} /></button>
        </div>

        {/* KPI Strip */}
        <div style={{ padding: '0 24px', paddingTop: 20 }}>
          <div className="nt-kpi-strip">
            <div className="nt-kpi">
              <div className="nt-kpi-label">Valor Atual</div>
              <div className="nt-kpi-value">{instrument.currentValue} <span className="nt-kpi-unit">{instrument.unit}</span></div>
              <div className="nt-gauge">
                <div className="nt-gauge-fill" style={{ width: `${pct}%`, background: gaugeColor }} />
              </div>
            </div>
            <div className="nt-kpi">
              <div className="nt-kpi-label">Δ 24h</div>
              <div className="nt-kpi-value" style={{ color: instrument.delta24h > 0 ? T.orange : T.green }}>
                {trendIcon} {instrument.delta24h > 0 ? '+' : ''}{instrument.delta24h} <span className="nt-kpi-unit">{instrument.unit}</span>
              </div>
            </div>
            <div className="nt-kpi">
              <div className="nt-kpi-label">Limiar</div>
              <div className="nt-kpi-value" style={{ color: T.red }}>
                {instrument.threshold} <span className="nt-kpi-unit">{instrument.unit}</span>
              </div>
            </div>
            <div className="nt-kpi">
              <div className="nt-kpi-label">Qualidade</div>
              <div className="nt-kpi-value" style={{ color: T.green }}>
                {instrument.signalQuality}<span className="nt-kpi-unit">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="nt-tabs">
          {tabs.map(t => (
            <button key={t.id}
              className={`nt-tab ${tab === t.id ? 'nt-tab-active' : ''}`}
              onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="nt-tab-content" key={tab}>
          {tab === 'chart' && (
            <div>
              <div className="nt-chart-label"><TrendingUp size={13} /> Série Temporal — 90 dias + Previsão LSTM 48h</div>
              <div className="nt-chart-box" style={{ height: 200, padding: '12px 8px' }}>
                <Sparkline data={instrument.history90d} forecast={instrument.forecast48h}
                  forecastUpper={instrument.forecastUpper} forecastLower={instrument.forecastLower}
                  threshold={instrument.threshold} height={170} width={520} />
              </div>
              <div className="nt-chart-legend">
                <span><span className="nt-chart-legend-swatch" style={{ background: T.teal }} /> Histórico</span>
                <span><span className="nt-chart-legend-swatch" style={{ background: T.orange, borderTop: '1px dashed' }} /> Previsão LSTM</span>
                <span><span className="nt-chart-legend-swatch" style={{ background: T.teal, opacity: 0.2, height: 6 }} /> IC 95%</span>
                <span><span className="nt-chart-legend-swatch" style={{ background: T.red, borderTop: '1px dashed' }} /> Limiar</span>
              </div>
            </div>
          )}

          {tab === 'hst' && (
            <div>
              <div className="nt-chart-label"><BarChart3 size={13} /> Decomposição HST (ICOLD B.158, Willm & Beaujoint 1967)</div>
              <HSTBar hst={instrument.hst} />
              <div style={{ marginTop: 24 }}>
                <div className="nt-chart-label"><Zap size={13} /> Base Científica</div>
                <div className="nt-science-box">{instrument.scientificBasis}</div>
              </div>
            </div>
          )}

          {tab === 'specs' && (
            <div>
              <div className="nt-chart-label"><FileText size={13} /> Ficha Técnica do Instrumento</div>
              <div className="nt-specs-table">
                {[
                  ['ID', instrument.id], ['Tipo', instrument.type], ['Modelo', instrument.model],
                  ['Localização', instrument.location], ['Elevação', instrument.elevation],
                  ['Faixa', instrument.range], ['Precisão', instrument.precision],
                  ['Instalação', instrument.installed], ['Última Calibração', instrument.calibrated],
                ].map(([label, value]) => (
                  <div key={label} className="nt-specs-row">
                    <span className="nt-specs-label">{label}</span>
                    <span className="nt-specs-value">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div>
              <div className="nt-chart-label"><Cpu size={13} /> Análise Automatizada — MOTHER AI</div>
              <div className="nt-science-box" style={{ marginBottom: 16 }}>
                <strong>Diagnóstico:</strong> {instrument.id} opera dentro dos parâmetros normais definidos pela ICOLD Bulletin 158.
                O modelo HST identifica componente {instrument.hst.hydrostatic > 50 ? 'hidrostática' : instrument.hst.seasonal > 50 ? 'sazonal' : 'temporal'} dominante
                ({Math.max(instrument.hst.hydrostatic, instrument.hst.seasonal, instrument.hst.time)}%), consistente com o tipo de instrumento.
                {'\n\n'}
                <strong>Previsão LSTM (48h):</strong> {instrument.trend === 'stable' ? 'Estável' : instrument.trend === 'up' ? 'Tendência de alta moderada' : 'Tendência de queda moderada'}.
                Valor previsto: {instrument.forecast48h[7]} {instrument.unit} (IC 95%: {instrument.forecastLower[7]}–{instrument.forecastUpper[7]}).
                {'\n\n'}
                <strong>Risco:</strong> Distância ao limiar: {(instrument.threshold - instrument.currentValue).toFixed(2)} {instrument.unit} ({(100 - (instrument.currentValue / instrument.threshold) * 100).toFixed(1)}%).
                {instrument.currentValue / instrument.threshold > 0.8
                  ? ' ⚠ Proximidade ao limiar requer atenção.'
                  : ' ✅ Margem de segurança adequada.'}
                {'\n\n'}
                <strong>Recomendação:</strong> {instrument.status === 'attention'
                  ? 'Intensificar frequência de leitura para 1h. Programar inspeção visual na próxima 48h.'
                  : 'Manter rotina de monitoramento padrão. Próxima calibração prevista conforme cronograma.'}
              </div>
              <div className="nt-actions">
                {[
                  { icon: Download, label: 'Exportar CSV' },
                  { icon: FileText, label: 'Gerar Relatório' },
                  { icon: GitCompare, label: 'Comparar' },
                  { icon: Clock, label: 'Histórico Completo' },
                ].map(({ icon: Icon, label }) => (
                  <button key={label} className="nt-action-btn"><Icon size={13} /> {label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Chat Message ───────────────────────────────────────────────────────────
interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  instrumentId?: string;
  time: string;
}

function formatTime(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Suggested prompts ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  'Status geral',
  'PZ-003',
  'Anomalias 24h',
  'Deslocamento',
  'Relatório ICOLD',
  'LSTM previsão',
];

// ─── Main Component ─────────────────────────────────────────────────────────
export default function SHMSNarrativeTwin() {
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'ai', text: 'Bom dia. A estrutura está estável.\nHealth Index: 94.2% · 16 sensores online · 0 alarmes críticos.\n\nPergunte sobre qualquer instrumento — ex: "Mostra PZ-003" ou "Análise de deslocamento".', time: formatTime() },
  ]);
  const [activeInstrument, setActiveInstrument] = useState<InstrumentData | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback((inputOverride?: string) => {
    const input = (inputOverride || chatInput).trim();
    if (!input) return;
    setChatInput('');

    const userMsg: ChatMsg = { role: 'user', text: input, time: formatTime() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate AI thinking delay
    setTimeout(() => {
      const upper = input.toUpperCase();
      const found = INSTRUMENTS.find(inst =>
        upper.includes(inst.id) ||
        upper.includes(inst.id.replace('-', '')) ||
        (inst.type.toLowerCase().includes('piezômetro') && upper.includes('PIEZOMETRO') && upper.includes(inst.id.split('-')[1])) ||
        (inst.type.toLowerCase().includes('deslocamento') && (upper.includes('DESLOCAMENTO') || upper.includes('DISP'))) ||
        (inst.type.toLowerCase().includes('termômetro') && (upper.includes('TEMP') || upper.includes('TEMPERATURA'))) ||
        (inst.type.toLowerCase().includes('nível') && (upper.includes('NIVEL') || upper.includes('NW'))) ||
        (inst.type.toLowerCase().includes('vazão') && (upper.includes('SEEP') || upper.includes('PERCOLAÇÃO') || upper.includes('VAZÃO')))
      );

      setIsTyping(false);

      if (found) {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `📊 **${found.id}** — ${found.type}\n${found.location} · ${found.elevation}\n\n• Valor: **${found.currentValue} ${found.unit}** (Δ24h: ${found.delta24h > 0 ? '+' : ''}${found.delta24h})\n• Status: ${found.status.toUpperCase()}\n• Qualidade: ${found.signalQuality}%\n• HST: H${found.hst.hydrostatic}% S${found.hst.seasonal}% T${found.hst.time}%`,
          instrumentId: found.id,
          time: formatTime(),
        }]);
        setTimeout(() => setActiveInstrument(found), 500);
      } else if (upper.includes('SAUDE') || upper.includes('HEALTH') || upper.includes('STATUS')) {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `📋 **Resumo de Saúde Estrutural:**\n\n• Health Index: **94.2%**\n• 6 instrumentos online, 0 críticos\n• 1 em atenção: **PZ-003** (subpressão elevada)\n• LSTM: todos os sensores previstos estáveis\n• RUL: 47.2 anos (Paris-Erdogan, p50)\n• Último alarme: há 89 dias\n\nQuerys sugeridas: "Mostra PZ-003" ou "Anomalias 24h"`,
          time: formatTime(),
        }]);
      } else if (upper.includes('LSTM') || upper.includes('PREVISÃO') || upper.includes('FORECAST')) {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `🤖 **Previsão LSTM (BiLSTM+Attention):**\n\n${INSTRUMENTS.map(i => `• ${i.id}: ${i.forecast48h[7]} ${i.unit} (${i.trend === 'stable' ? '→ estável' : i.trend === 'up' ? '↗ subindo' : '↘ caindo'})`).join('\n')}\n\nTodos os instrumentos previstos dentro dos limiares nas próximas 48h.`,
          time: formatTime(),
        }]);
      } else if (upper.includes('ANOMALIA') || upper.includes('ALERTA') || upper.includes('ALARM')) {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `⚠ **Análise de Anomalias (24h):**\n\n• **PZ-003**: Δ+4.3 kPa/24h — componente hidrostática elevada (71%)\n  → Monitoramento intensificado recomendado (ICOLD B.158 §6.2)\n\n• Demais instrumentos: operação normal\n• Z-score máximo: 1.8σ (PZ-003) — abaixo do limiar 3σ\n• IQR check: sem outliers detectados`,
          time: formatTime(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `Instrumentos disponíveis: **PZ-001**, **PZ-003**, **DISP-001**, **TEMP-002**, **NW-001**, **SEEP-002**.\n\nTente: "Mostra PZ-003", "Status geral", "Anomalias 24h", ou "LSTM previsão".`,
          time: formatTime(),
        }]);
      }
    }, 800 + Math.random() * 600);
  }, [chatInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const healthItems = useMemo(() => [
    { icon: Activity, label: 'Health', value: '94.2%', color: T.green },
    { icon: Droplets, label: 'Nível', value: '72.3m', color: T.accent },
    { icon: Thermometer, label: 'Temp', value: '22.1°C', color: T.teal },
    { icon: AlertTriangle, label: 'Alertas', value: '1', color: T.yellow },
  ], []);

  return (
    <div className="nt-root">
      {/* LAYER 0: Ambient HUD effects */}
      <div className="nt-scanlines" />
      <div className="nt-vignette" />

      {/* LAYER 1: 3D Mine Digital Twin */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <DigitalTwin3DViewer structureId="default" minimal={true} />
      </div>

      {/* LAYER 2: Health strip (top) */}
      <div className="nt-health-strip">
        <button className="nt-back-btn" onClick={() => navigate('/shms')} title="Voltar ao SHMS">
          <ChevronLeft size={14} />
        </button>
        <HealthArc value={94.2} size={38} />
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>UHE RIO VERDE</span>
          <span style={{ color: T.dim, fontSize: 11, marginLeft: 8 }}>Narrative Twin</span>
        </div>
        <div style={{ flex: 1 }} />
        {healthItems.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="nt-health-pill">
            <Icon size={12} color={color} />
            <span className="nt-health-pill-label">{label}:</span>
            <span className="nt-health-pill-value" style={{ color }}>{value}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
          <div className="nt-live-dot" />
          <span className="nt-live-label">LIVE</span>
        </div>
        <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono', monospace", marginLeft: 4 }}>
          {new Date().toLocaleTimeString('pt-BR')}
        </span>
      </div>

      {/* LAYER 2.5: Quick info chips (floating, bottom-left) */}
      <div className="nt-info-chips nt-glass" style={{ borderRadius: 14, padding: 10 }}>
        <div className="nt-info-chip">
          <span className="nt-info-chip-dot nt-live-dot" />
          <Radio size={10} /> 16 sensores online
        </div>
        <div className="nt-info-chip">
          <span className="nt-info-chip-dot" style={{ background: T.green }} />
          <Cpu size={10} /> LSTM: estável
        </div>
        <div className="nt-info-chip">
          <span className="nt-info-chip-dot" style={{ background: T.yellow }} />
          <AlertTriangle size={10} /> PZ-003: atenção
        </div>
      </div>

      {/* LAYER 3: Chat panel (right side, 1/3 width) */}
      <div className="nt-chat-container nt-glass-strong">
        {/* Panel header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div className="nt-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>M</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>MOTHER AI</div>
            <div style={{ fontSize: 9, color: T.dim }}>Assistente de Monitoramento Estrutural</div>
          </div>
          <div className="nt-live-dot" />
        </div>

        {/* Messages */}
        <div className="nt-chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`nt-msg ${msg.role === 'user' ? 'nt-msg-user' : 'nt-msg-ai'}`}>
              {msg.role === 'ai' && <div className="nt-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>M</div>}
              <div>
                <div className={`nt-msg-bubble ${msg.role === 'user' ? 'nt-msg-bubble-user' : 'nt-msg-bubble-ai'}`}>
                  {msg.text}
                  {msg.instrumentId && (
                    <button className="nt-open-panel-btn" onClick={() => {
                      const inst = INSTRUMENTS.find(x => x.id === msg.instrumentId);
                      if (inst) setActiveInstrument(inst);
                    }}>
                      📊 Abrir painel {msg.instrumentId}
                    </button>
                  )}
                </div>
                <div className="nt-msg-time">{msg.time}</div>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="nt-msg nt-msg-ai">
              <div className="nt-avatar" style={{ width: 24, height: 24, fontSize: 10, opacity: 0.7 }}>M</div>
              <div className="nt-msg-bubble nt-msg-bubble-ai nt-typing">
                <div className="nt-typing-dot" />
                <div className="nt-typing-dot" />
                <div className="nt-typing-dot" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested prompts */}
        {!chatInput && messages.length < 4 && (
          <div className="nt-suggestions" style={{ flexShrink: 0, padding: '6px 12px' }}>
            {SUGGESTIONS.map(s => (
              <button key={s} className="nt-suggestion-chip" onClick={() => handleSend(s)}>{s}</button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="nt-chat-input-bar">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre instrumentos..."
            className="nt-chat-input"
          />
          <button className="nt-chat-btn" title="Microfone"><Mic size={16} /></button>
          <button
            onClick={() => handleSend()}
            className={`nt-chat-btn ${chatInput.trim() ? 'nt-chat-btn-send' : ''}`}
            title="Enviar"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* LAYER 4: Instrument Modal */}
      {activeInstrument && (
        <InstrumentModal instrument={activeInstrument} onClose={() => setActiveInstrument(null)} />
      )}
    </div>
  );
}
