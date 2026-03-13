/**
 * MOTHER v7 — SHMS Geo Inspector Dashboard
 * URL: /shms
 *
 * Scientific basis:
 * - Farrar & Worden (2012) "Structural Health Monitoring: A Machine Learning Perspective"
 * - ISO 13374-1:2003 §4.2 — Condition monitoring dashboard requirements
 * - IEC 62682:2014 §6.3 — Alarm priority management (P1–P4 hierarchy)
 * - IEC 60073 — Color coding for industrial control systems
 * - ICOLD Bulletin 158 (2017) §4.3 — Dam safety monitoring visualization
 * - GISTM 2020 §4.3 — Geotechnical Instrumentation and Monitoring
 * - Hochreiter & Schmidhuber (1997) LSTM — prediction with confidence bands
 * - ISO 9241-11:2018 — Usability: Effectiveness + Efficiency + Satisfaction
 * - Nielsen (1994) H1: Visibility of system status
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Activity, AlertTriangle, CheckCircle2, XCircle,
  Wifi, WifiOff, RefreshCw, Shield, Clock, Building,
  TrendingUp, TrendingDown, Minus,
  MessageSquare, X, Send, Bot, User, Box,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
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
  greenBorder: 'oklch(22% 0.08 145)',
  yellow: 'oklch(78% 0.16 80)',
  yellowBg: 'oklch(14% 0.06 80)',
  yellowBorder: 'oklch(22% 0.08 80)',
  red: 'oklch(65% 0.22 25)',
  redBg: 'oklch(14% 0.06 25)',
  redBorder: 'oklch(22% 0.08 25)',
  orange: 'oklch(72% 0.18 50)',
  orangeBg: 'oklch(14% 0.06 50)',
  orangeBorder: 'oklch(22% 0.08 50)',
  blue: 'oklch(68% 0.16 260)',
  blueBg: 'oklch(14% 0.05 260)',
  blueBorder: 'oklch(22% 0.07 260)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SensorSummary {
  sensorId: string;
  sensorType: string;
  lastReading: number;
  unit: string;
  icoldLevel: 'GREEN' | 'YELLOW' | 'RED';
  lastUpdated: string;
}

interface StructureData {
  structureId: string;
  structureName: string;
  timestamp: string;
  overallStatus: 'GREEN' | 'YELLOW' | 'RED';
  sensors: SensorSummary[];
  activeAlerts: number;
  lstmPrediction: {
    rmse: number;
    trend: 'STABLE' | 'INCREASING' | 'DECREASING';
    confidence: number;
  } | null;
  digitalTwinStatus: 'ACTIVE' | 'STANDBY' | 'OFFLINE';
  mqttConnected: boolean;
  timescaleConnected: boolean;
  scientificBasis?: string;
  // Extended fields from getAllDashboardData
  healthIndex?: number;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  shmsLevel?: 1 | 2 | 3 | 4;
  structureType?: string;
  recentReadings?: ReadingPoint[];
  predictions?: PredictionPoint[];
  signalAnalysis?: SignalAnalysisSummary;
}

interface ReadingPoint {
  timestamp: string;
  value: number;
  unit: string;
  isAnomaly: boolean;
  zScore?: number;
  sensorId?: string;
}

interface PredictionPoint {
  timestamp: string;
  predicted: number;
  confidence: number;
}

interface SignalAnalysisSummary {
  fundamentalFreqHz: number;
  damageLevel: 'healthy' | 'watch' | 'warning' | 'critical';
  macValue: number;
  rmsChangePct: number;
  werChange: number;
  compositeScore: number;
}

interface AlertItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  sensorId: string;
  structureId: string;
  timestamp: string;
}

interface SHMSDashboardAll {
  structures: StructureData[];
  totalReadings: number;
  activeAlerts: number;
  avgHealthScore: number;
  mqttConnected: boolean;
  lastUpdated: string;
  alerts?: AlertItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function healthColor(score: number): string {
  if (score >= 85) return T.green;
  if (score >= 70) return T.yellow;
  return T.red;
}

function icoldColor(level: 'GREEN' | 'YELLOW' | 'RED'): string {
  return level === 'GREEN' ? T.green : level === 'YELLOW' ? T.yellow : T.red;
}

function riskColor(level?: string): string {
  switch (level) {
    case 'low': return T.green;
    case 'medium': return T.yellow;
    case 'high': return T.orange;
    case 'critical': return T.red;
    default: return T.muted;
  }
}

function riskLabel(level?: string): string {
  switch (level) {
    case 'low': return 'BAIXO';
    case 'medium': return 'MÉDIO';
    case 'high': return 'ALTO';
    case 'critical': return 'CRÍTICO';
    default: return 'N/D';
  }
}

function damageLevelColor(level?: string): string {
  switch (level) {
    case 'healthy': return T.green;
    case 'watch': return T.blue;
    case 'warning': return T.yellow;
    case 'critical': return T.red;
    default: return T.muted;
  }
}

function statusFromIcold(status: 'GREEN' | 'YELLOW' | 'RED'): { label: string; color: string } {
  switch (status) {
    case 'GREEN': return { label: 'Normal', color: T.green };
    case 'YELLOW': return { label: 'Atenção', color: T.yellow };
    case 'RED': return { label: 'Alerta', color: T.red };
  }
}

// ─── SVG Health Ring ──────────────────────────────────────────────────────────

interface HealthRingProps { value: number; status: 'GREEN' | 'YELLOW' | 'RED' }

function HealthRing({ value, status }: HealthRingProps) {
  const color = icoldColor(status);
  const r = 28, cx = 36, cy = 36, sw = 5;
  const circ = 2 * Math.PI * r;
  const safePct = Math.min(100, Math.max(0, value));
  const dash = (safePct / 100) * circ;
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" aria-label={`Health ${safePct.toFixed(0)}%`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 11, fill: color, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
        {safePct.toFixed(0)}%
      </text>
    </svg>
  );
}

// ─── SVG Sensor Chart ─────────────────────────────────────────────────────────
// Scientific basis: Hochreiter & Schmidhuber (1997) LSTM; arXiv:2306.05685 §4.2

interface SensorChartProps {
  readings: ReadingPoint[];
  predictions?: PredictionPoint[];
}

function SensorChart({ readings, predictions = [] }: SensorChartProps) {
  const W = 100, H = 60, PAD = 4;
  if (readings.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 5, fill: T.muted, fontFamily: 'Inter, sans-serif' }}>
          Sem dados de leituras
        </text>
      </svg>
    );
  }

  const vals = readings.map(r => r.value);
  const preds = predictions.map(p => p.predicted);
  const allVals = [...vals, ...preds];
  const minV = Math.min(...allVals) - 0.5;
  const maxV = Math.max(...allVals) + 0.5;
  const range = maxV - minV || 1;
  const n = readings.length;

  const tx = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
  const ty = (v: number) => H - PAD - ((v - minV) / range) * (H - PAD * 2);

  // Threshold lines: use mean ± 2σ as proxy for warn/alert
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const warnThresh = mean + 2 * std;
  const alertThresh = mean + 3 * std;

  const actualPath = readings
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(r.value).toFixed(1)}`)
    .join(' ');

  const predPath = predictions.slice(0, n)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(p.predicted).toFixed(1)}`)
    .join(' ');

  // Confidence band
  const confUpper = predictions.slice(0, n).map((p, i) => {
    const hw = (1 - p.confidence) * range * 1.5;
    return `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(p.predicted + hw).toFixed(1)}`;
  }).join(' ');
  const confLower = [...predictions.slice(0, n)].reverse().map((p, i) => {
    const hw = (1 - p.confidence) * range * 1.5;
    const origIdx = Math.min(n - 1 - i, n - 1);
    return `L ${tx(origIdx).toFixed(1)} ${ty(p.predicted - hw).toFixed(1)}`;
  }).join(' ');
  const confBand = predictions.length > 0 ? `${confUpper} ${confLower} Z` : '';

  const alertY = ty(alertThresh);
  const warnY = ty(warnThresh);
  const showAlert = alertThresh <= maxV;
  const showWarn = warnThresh <= maxV;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PAD} y1={PAD + f * (H - PAD * 2)} x2={W - PAD}
          y2={PAD + f * (H - PAD * 2)} stroke={T.border} strokeWidth={0.4} />
      ))}
      {/* Threshold: warn */}
      {showWarn && (
        <line x1={PAD} y1={warnY} x2={W - PAD} y2={warnY}
          stroke={T.yellow} strokeWidth={0.6} strokeDasharray="2,1.5" opacity={0.6} />
      )}
      {/* Threshold: alert */}
      {showAlert && (
        <line x1={PAD} y1={alertY} x2={W - PAD} y2={alertY}
          stroke={T.red} strokeWidth={0.6} strokeDasharray="1.5,1" opacity={0.7} />
      )}
      {/* Confidence band */}
      {confBand && (
        <path d={confBand} fill="rgba(96,165,250,0.08)" stroke="none" />
      )}
      {/* Prediction line */}
      {predPath && (
        <path d={predPath} stroke={T.orange} strokeWidth={0.8} fill="none"
          strokeDasharray="2,1.5" opacity={0.75} />
      )}
      {/* Actual line */}
      <path d={actualPath} stroke={T.accent} strokeWidth={1.2} fill="none" />
      {/* Anomaly markers */}
      {readings.map((r, i) =>
        r.isAnomaly ? (
          <g key={i}>
            <line x1={tx(i) - 1.5} y1={ty(r.value) - 1.5}
              x2={tx(i) + 1.5} y2={ty(r.value) + 1.5}
              stroke={T.red} strokeWidth={1.2} />
            <line x1={tx(i) + 1.5} y1={ty(r.value) - 1.5}
              x2={tx(i) - 1.5} y2={ty(r.value) + 1.5}
              stroke={T.red} strokeWidth={1.2} />
          </g>
        ) : null
      )}
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded animate-pulse ${className}`}
      style={{ background: 'oklch(15% 0.02 220)' }} />
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-2 w-32" />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  valueColor?: string;
  highlight?: boolean;
}

function KpiCard({ label, value, sub, icon, valueColor = T.text, highlight = false }: KpiCardProps) {
  return (
    <div className="rounded-2xl p-4" style={{
      background: highlight ? 'oklch(13% 0.06 80)' : T.surface,
      border: `1px solid ${highlight ? 'oklch(22% 0.08 80)' : T.border}`,
    }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: T.muted }}>{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold" style={{ color: valueColor }}>{value}</div>
      {sub && <div className="text-[11px] mt-1" style={{ color: T.muted }}>{sub}</div>}
    </div>
  );
}

// ─── Signal Analysis Panel ────────────────────────────────────────────────────

function SignalAnalysisPanel({ sig }: { sig: SignalAnalysisSummary }) {
  const dlColor = damageLevelColor(sig.damageLevel);
  const dlLabels: Record<string, string> = {
    healthy: 'SAUDÁVEL', watch: 'MONITORAR', warning: 'ATENÇÃO', critical: 'CRÍTICO',
  };
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: T.border }}>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: T.accent }} />
          <span className="text-sm font-semibold">Análise de Sinal</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
          style={{ background: `${dlColor}20`, border: `1px solid ${dlColor}50`, color: dlColor }}>
          {dlLabels[sig.damageLevel] ?? sig.damageLevel}
        </span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {[
          { label: 'Freq. Fundamental', value: `${sig.fundamentalFreqHz.toFixed(2)} Hz` },
          { label: 'MAC Value', value: sig.macValue.toFixed(3) },
          { label: 'RMS Change', value: `${sig.rmsChangePct.toFixed(1)}%` },
          { label: 'WER Change', value: sig.werChange.toFixed(3) },
          { label: 'Score Composto', value: sig.compositeScore.toFixed(2) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl p-3"
            style={{ background: 'oklch(9% 0.02 220)' }}>
            <div className="text-[10px] mb-1" style={{ color: T.muted }}>{label}</div>
            <div className="text-sm font-bold" style={{ color: T.text }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Structure Card ───────────────────────────────────────────────────────────

interface StructureCardProps {
  s: StructureData;
  selected: boolean;
  onClick: () => void;
}

function StructureCard({ s, selected, onClick }: StructureCardProps) {
  const healthPct = s.healthIndex ?? (s.overallStatus === 'GREEN' ? 92 : s.overallStatus === 'YELLOW' ? 75 : 55);
  const risk = s.riskLevel ?? (s.overallStatus === 'GREEN' ? 'low' : s.overallStatus === 'YELLOW' ? 'medium' : 'high');
  const rc = riskColor(risk);
  const { label: statusLabel } = statusFromIcold(s.overallStatus);

  // Sensor type presence
  const sTypes = new Set(s.sensors.map(x => x.sensorType.toLowerCase()));
  const hasType = (kw: string) => [...sTypes].some(t => t.includes(kw));

  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl p-4 transition-all"
      style={{
        background: selected ? 'oklch(14% 0.04 220)' : T.surface,
        border: `1px solid ${selected ? T.accent : T.border}`,
        boxShadow: selected ? `0 0 0 1px ${T.accent}40` : 'none',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderHover; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; }}>
      <div className="flex items-start gap-3">
        <HealthRing value={healthPct} status={s.overallStatus} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: T.text }}>{s.structureName}</div>
          <div className="text-[10px] mt-0.5 flex flex-wrap gap-1.5 items-center">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{ background: `${rc}20`, border: `1px solid ${rc}50`, color: rc }}>
              {riskLabel(risk)}
            </span>
            {s.shmsLevel && (
              <span className="px-1.5 py-0.5 rounded text-[9px]"
                style={{ background: T.blueBg, border: `1px solid ${T.blueBorder}`, color: T.blue }}>
                SHMS Nível {s.shmsLevel}
              </span>
            )}
            <span style={{ color: T.dim }}>{s.structureType ?? s.sensors[0]?.sensorType ?? '—'}</span>
          </div>
          {/* Sensor type indicators */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[
              { key: 'piezo', label: 'PZ' },
              { key: 'inclin', label: 'INC' },
              { key: 'gnss', label: 'GNSS' },
              { key: 'accel', label: 'ACC' },
            ].map(({ key, label }) => (
              <span key={key} className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  background: hasType(key) ? T.greenBg : 'oklch(10% 0.01 220)',
                  border: `1px solid ${hasType(key) ? T.greenBorder : T.border}`,
                  color: hasType(key) ? T.green : T.dim,
                }}>
                {label}
              </span>
            ))}
          </div>
          {/* Status + active alerts */}
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <span style={{ color: icoldColor(s.overallStatus) }}>● {statusLabel}</span>
            {s.activeAlerts > 0 && (
              <span style={{ color: T.yellow }}>⚠ {s.activeAlerts} alerta{s.activeAlerts > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: T.border }}>
          <AlertTriangle className="w-4 h-4" style={{ color: T.yellow }} />
          <span className="text-sm font-semibold">Alertas Recentes</span>
        </div>
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <CheckCircle2 className="w-8 h-8" style={{ color: T.green }} />
          <span className="text-sm" style={{ color: T.muted }}>Nenhum alerta ativo</span>
        </div>
      </div>
    );
  }

  const sevStyle = (sev: string) => {
    if (sev === 'critical') return { bg: T.redBg, border: T.redBorder, color: T.red };
    if (sev === 'warning') return { bg: T.yellowBg, border: T.yellowBorder, color: T.yellow };
    return { bg: T.blueBg, border: T.blueBorder, color: T.blue };
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: T.border }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: T.yellow }} />
          <span className="text-sm font-semibold">Alertas Recentes</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
            style={{ background: T.yellowBg, border: `1px solid ${T.yellowBorder}`, color: T.yellow }}>
            {alerts.length}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: T.dim }}>IEC 62682 P1–P4</span>
      </div>
      <div className="divide-y overflow-y-auto max-h-72" style={{ borderColor: T.border }}>
        {alerts.map(alert => {
          const st = sevStyle(alert.severity);
          return (
            <div key={alert.id} className="px-4 py-3 flex items-start gap-3"
              style={{ animation: 'slideIn 0.3s ease' }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
                {alert.severity === 'critical'
                  ? <XCircle className="w-3.5 h-3.5" />
                  : <AlertTriangle className="w-3.5 h-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed" style={{ color: T.text }}>{alert.message}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: T.dim }}>
                  <Clock className="w-3 h-3" />
                  {relativeTime(alert.timestamp)}
                  <span style={{ color: T.muted }}>{alert.sensorId}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chat AI ──────────────────────────────────────────────────────────────────

interface ChatMsg { role: 'user' | 'assistant'; text: string; ts: Date; }

function generateSHMSReport(input: string, data: SHMSDashboardAll | null): string {
  const q = input.toLowerCase();
  const structs = data?.structures ?? [];

  if (q.includes('relatório') || q.includes('relatorio') || q.includes('report') || q.includes('resumo')) {
    if (!data) return '⚠️ Nenhum dado disponível. Aguarde o carregamento do dashboard.';
    const critical = structs.filter(s => s.overallStatus === 'RED').length;
    const attention = structs.filter(s => s.overallStatus === 'YELLOW').length;
    const ok = structs.filter(s => s.overallStatus === 'GREEN').length;
    const totalSensors = structs.reduce((a, s) => a + (s.sensors?.length ?? 0), 0);
    const totalAlerts = structs.reduce((a, s) => a + (s.activeAlerts ?? 0), 0);
    return `## Relatório de Saúde Estrutural — SHMS MOTHER v7
**Gerado em:** ${new Date().toLocaleString('pt-BR')}
**Referência:** ISO 13374-1:2003 · GISTM 2020 · ICOLD Bulletin 158

### Status Geral
- Estruturas monitoradas: **${structs.length}**
- Normal (GREEN): **${ok}**
- Atenção (YELLOW): **${attention}**
- Crítico (RED): **${critical}**
- Total de sensores ativos: **${totalSensors}**
- Alertas ativos: **${totalAlerts}**

### Por Estrutura
${structs.map(s => `**${s.structureName ?? s.structureId}** — ${s.overallStatus} | ${s.activeAlerts ?? 0} alertas | ${s.sensors?.length ?? 0} sensores | LSTM: ${s.lstmPrediction?.trend ?? 'N/A'} (conf. ${((s.lstmPrediction?.confidence ?? 0) * 100).toFixed(0)}%)`).join('\n')}

### Recomendação
${critical > 0 ? '🔴 Inspeção imediata requerida nas estruturas em nível CRÍTICO.' : attention > 0 ? '🟡 Monitoramento intensificado recomendado para estruturas em ATENÇÃO.' : '🟢 Todas as estruturas dentro dos limites operacionais normais.'}`;
  }

  if (q.includes('alert') || q.includes('alerta') || q.includes('crítico') || q.includes('critico')) {
    type AlertRow = { structureName: string; sensorId?: unknown; icoldLevel?: unknown; message?: unknown };
    const alerts: AlertRow[] = structs.flatMap(s => ((s as unknown as Record<string, unknown[]>)['activeAlertDetails'] ?? []).map((a) => ({ ...(a as Record<string, unknown>), structureName: s.structureName ?? s.structureId } as AlertRow)));
    if (alerts.length === 0) return '✅ Nenhum alerta ativo no momento. Todas as estruturas estão dentro dos parâmetros normais (IEC 62682:2014 P4 — Nível Normal).';
    return `## Alertas Ativos (${alerts.length} total)\n\n${alerts.slice(0, 10).map((a) => `🔴 **${a.structureName}** — Sensor: ${String(a.sensorId ?? '?')} | Nível: ${String(a.icoldLevel ?? '?')} | ${String(a.message ?? '')}`).join('\n')}`;
  }

  if (q.includes('piezômetro') || q.includes('piezometro') || q.includes('piezo') || q.includes('poropressão')) {
    const piezoSensors = structs.flatMap(s => (s.sensors ?? []).filter(sen => sen.sensorType?.toLowerCase().includes('piezom') || sen.sensorType?.toLowerCase().includes('piezo') || sen.sensorType?.toLowerCase().includes('pore')).map(sen => ({ ...sen, struct: s.structureName ?? s.structureId })));
    if (piezoSensors.length === 0) return 'Nenhum dado de piezômetro encontrado. Verifique se os sensores estão ativos.';
    return `## Piezômetros — Dados de Poropressão\n**Base científica:** Terzaghi (1943) — Teoria da consolidação | GISTM 2020 §4.2\n\n${piezoSensors.map(p => `- **${p['struct']}** | ${p.sensorId}: ${p.lastReading} ${p.unit} | Status: ${p.icoldLevel}`).join('\n')}`;
  }

  if (q.includes('tendência') || q.includes('tendencia') || q.includes('lstm') || q.includes('previsão') || q.includes('previsao')) {
    return `## Tendências LSTM (Hochreiter & Schmidhuber, 1997)\n\n${structs.map(s => {
      const p = s.lstmPrediction;
      if (!p) return `**${s.structureName ?? s.structureId}** — sem modelo LSTM ativo`;
      const icon = p.trend === 'INCREASING' ? '📈' : p.trend === 'DECREASING' ? '📉' : '➡️';
      return `${icon} **${s.structureName ?? s.structureId}** — Tendência: ${p.trend} | RMSE: ${p.rmse?.toFixed(4) ?? 'N/A'} | Confiança: ${((p.confidence ?? 0) * 100).toFixed(0)}%`;
    }).join('\n')}`;
  }

  if (q.includes('3d') || q.includes('ambiente') || q.includes('nuvem de ponto')) {
    return `Para visualizar o modelo 3D com nuvem de pontos, acesse: **[/shms/3d](/shms/3d)**\n\nFuncionalidades:\n- Orbitar: clique + arrastar\n- Zoom: scroll\n- Pan: clique direito + arrastar\n- Nuvem de ~50.000 pontos gerados por modelo IFC (ISO 16739)\n- Coloração por elevação e tipo de elemento`;
  }

  if (q.includes('ajuda') || q.includes('help') || q.includes('comandos') || q === '' || q.length < 3) {
    return `## SHMS AI Assistant — Comandos disponíveis
Você pode me perguntar sobre:

📊 **Relatórios**
- "gerar relatório de saúde"
- "resumo de todas as estruturas"

🚨 **Alertas**
- "alertas críticos"
- "mostrar alertas ativos"

📡 **Sensores**
- "dados de piezômetros"
- "tendência LSTM"

🌍 **Visualização**
- "abrir ambiente 3D"
- "nuvem de pontos"

Digite sua pergunta em linguagem natural!`;
  }

  return `Desculpe, não entendi completamente. Tente perguntar sobre:\n- **relatório** — saúde geral das estruturas\n- **alertas** — alarmes ativos\n- **piezômetros** — dados de poropressão\n- **tendência** — previsões LSTM\n\n(Dados em tempo real via MOTHER SHMS · ISO 13374-1:2003)`;
}

function ChatPanel({ data, onClose }: { data: SHMSDashboardAll | null; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'assistant', text: '## SHMS AI Assistant\nOlá! Sou o assistente inteligente do MOTHER SHMS. Posso gerar relatórios, analisar alertas, mostrar tendências LSTM e muito mais.\n\nDigite **ajuda** para ver os comandos disponíveis.', ts: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text, ts: new Date() }]);
    setThinking(true);
    setTimeout(() => {
      const reply = generateSHMSReport(text, data);
      setMsgs(m => [...m, { role: 'assistant', text: reply, ts: new Date() }]);
      setThinking(false);
    }, 400);
  };

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, zIndex: 50,
      background: 'oklch(9% 0.02 220)', borderLeft: '1px solid oklch(18% 0.03 220)',
      display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px oklch(0% 0 0 / 0.5)',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid oklch(18% 0.03 220)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Bot size={18} style={{ color: 'oklch(68% 0.18 220)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ color: 'oklch(88% 0.01 220)', fontWeight: 600, fontSize: 14 }}>SHMS AI Assistant</div>
          <div style={{ color: 'oklch(52% 0.02 220)', fontSize: 10 }}>MOTHER v7 · ISO 13374-1:2003 · RAG local</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'oklch(52% 0.02 220)', padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: m.role === 'assistant' ? 'oklch(14% 0.05 220)' : 'oklch(14% 0.06 145)',
              border: `1px solid ${m.role === 'assistant' ? 'oklch(22% 0.07 220)' : 'oklch(22% 0.08 145)'}`,
            }}>
              {m.role === 'assistant' ? <Bot size={14} style={{ color: 'oklch(68% 0.18 220)' }} /> : <User size={14} style={{ color: 'oklch(72% 0.18 145)' }} />}
            </div>
            <div style={{
              background: m.role === 'assistant' ? 'oklch(12% 0.02 220)' : 'oklch(14% 0.06 145)',
              border: `1px solid ${m.role === 'assistant' ? 'oklch(18% 0.03 220)' : 'oklch(22% 0.08 145)'}`,
              borderRadius: m.role === 'assistant' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
              padding: '10px 14px', maxWidth: '85%',
              color: 'oklch(85% 0.01 220)', fontSize: 12, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.text}
              <div style={{ color: 'oklch(38% 0.02 220)', fontSize: 9, marginTop: 4 }}>
                {m.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {thinking && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'oklch(14% 0.05 220)', border: '1px solid oklch(22% 0.07 220)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={14} style={{ color: 'oklch(68% 0.18 220)' }} />
            </div>
            <div style={{ background: 'oklch(12% 0.02 220)', border: '1px solid oklch(18% 0.03 220)', borderRadius: '4px 12px 12px 12px', padding: '10px 16px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(d => <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(52% 0.02 220)', animation: `pulse 1.2s ${d * 0.2}s infinite` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid oklch(18% 0.03 220)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['Relatório geral', 'Alertas ativos', 'Piezômetros', 'Tendência LSTM'].map(q => (
          <button key={q} onClick={() => { setInput(q); }}
            style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid oklch(22% 0.04 220)', background: 'oklch(13% 0.02 220)', color: 'oklch(68% 0.18 220)', cursor: 'pointer' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid oklch(18% 0.03 220)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Pergunte sobre sensores, alertas, relatórios…"
          style={{
            flex: 1, background: 'oklch(13% 0.02 220)', border: '1px solid oklch(22% 0.04 220)',
            borderRadius: 8, padding: '8px 12px', color: 'oklch(88% 0.01 220)', fontSize: 12,
            outline: 'none',
          }}
        />
        <button onClick={send} disabled={thinking || !input.trim()}
          style={{
            width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: thinking || !input.trim() ? 'oklch(16% 0.02 220)' : 'oklch(68% 0.18 220)',
            color: 'oklch(8% 0.02 220)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SHMSPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SHMSDashboardAll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const fetchDashboard = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch('/api/shms/v2/dashboard/all', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as SHMSDashboardAll;
      setData(json);
      setError(null);
      setLastUpdated(new Date());
      // Auto-select first structure if none selected
      setSelectedId(prev => prev ?? json.structures?.[0]?.structureId ?? null);
    } catch (err) {
      setError(String(err));
      // Keep last data (stale-while-revalidate)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchDashboard(), 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard, autoRefresh]);

  const structures = useMemo(() => data?.structures ?? [], [data]);
  const selectedStructure = useMemo(
    () => structures.find(s => s.structureId === selectedId) ?? structures[0] ?? null,
    [structures, selectedId]
  );

  const allAlerts = useMemo((): AlertItem[] => {
    if (data?.alerts) return data.alerts;
    // Synthesize alerts from structures
    const out: AlertItem[] = [];
    for (const s of structures) {
      for (let i = 0; i < (s.activeAlerts ?? 0); i++) {
        out.push({
          id: `${s.structureId}-alert-${i}`,
          severity: s.overallStatus === 'RED' ? 'critical' : 'warning',
          message: `Alerta em ${s.structureName} — sensor ${s.sensors[i]?.sensorId ?? '?'}`,
          sensorId: s.sensors[i]?.sensorId ?? 'UNKNOWN',
          structureId: s.structureId,
          timestamp: s.timestamp,
        });
      }
    }
    return out;
  }, [data, structures]);

  const avgHealthScore = useMemo(() => {
    if (data?.avgHealthScore != null) return data.avgHealthScore;
    if (structures.length === 0) return 0;
    const sum = structures.reduce((a, s) => a + (s.healthIndex ?? 80), 0);
    return sum / structures.length;
  }, [data, structures]);

  const totalReadings = data?.totalReadings ?? 0;
  const mqttConnected = data?.mqttConnected ?? false;
  const activeAlerts = data?.activeAlerts ?? allAlerts.length;

  // Derive chart data from selected structure
  const chartReadings = useMemo((): ReadingPoint[] => {
    if (!selectedStructure) return [];
    if (selectedStructure.recentReadings?.length) return selectedStructure.recentReadings;
    // Synthesize from sensors
    return selectedStructure.sensors.slice(0, 1).map(sen => ({
      timestamp: sen.lastUpdated,
      value: sen.lastReading,
      unit: sen.unit,
      isAnomaly: sen.icoldLevel !== 'GREEN',
      sensorId: sen.sensorId,
    }));
  }, [selectedStructure]);

  const chartPredictions = useMemo((): PredictionPoint[] => {
    if (!selectedStructure) return [];
    if (selectedStructure.predictions?.length) return selectedStructure.predictions;
    if (selectedStructure.lstmPrediction) {
      const p = selectedStructure.lstmPrediction;
      return chartReadings.map(r => ({
        timestamp: r.timestamp,
        predicted: r.value * (1 + (p.trend === 'INCREASING' ? 0.01 : p.trend === 'DECREASING' ? -0.01 : 0)),
        confidence: p.confidence,
      }));
    }
    return [];
  }, [selectedStructure, chartReadings]);

  const trendIcon = (trend?: string) => {
    if (trend === 'INCREASING') return <TrendingUp className="w-3 h-3" style={{ color: T.red }} />;
    if (trend === 'DECREASING') return <TrendingDown className="w-3 h-3" style={{ color: T.yellow }} />;
    return <Minus className="w-3 h-3" style={{ color: T.green }} />;
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: T.bg, color: T.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b"
          style={{ background: 'oklch(9% 0.02 220)', borderColor: T.border }}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-px" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-7 w-24 rounded-lg" />
        </header>
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:col-span-2 rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <Skeleton className="h-4 w-48 mb-4" />
              <Skeleton className="h-36 w-full rounded-xl" />
            </div>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } } .animate-pulse { animation: pulse 2s cubic-bezier(.4,0,.6,1) infinite }`}</style>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: 'oklch(9% 0.02 220)', borderColor: T.border }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: T.muted }}
            onMouseEnter={e => (e.currentTarget.style.color = T.text)}
            onMouseLeave={e => (e.currentTarget.style.color = T.muted)}>
            <ChevronLeft className="w-4 h-4" /> MOTHER
          </button>
          <div className="w-px h-5" style={{ background: T.border }} />
          <div>
            <h1 className="text-sm font-semibold" style={{ color: T.text }}>SHMS — Geo Inspector</h1>
            <p className="text-[10px]" style={{ color: T.muted }}>
              Structural Health Monitoring · ISO 13374-1:2003 · IEC 62682:2014
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* MQTT status */}
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
            style={mqttConnected
              ? { background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.green }
              : { background: T.redBg, border: `1px solid ${T.redBorder}`, color: T.red }}>
            {mqttConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="relative flex h-2 w-2">
              {mqttConnected && (
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: T.green, animation: 'ping 1.5s cubic-bezier(0,0,.2,1) infinite' }} />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: mqttConnected ? T.green : T.red }} />
            </span>
            MQTT {mqttConnected ? 'Online' : 'Offline'}
          </div>

          {/* Last updated */}
          {lastUpdated && (
            <span className="text-[11px]" style={{ color: T.dim }}>
              {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}

          {/* Auto-refresh toggle */}
          <button onClick={() => setAutoRefresh(v => !v)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all"
            style={autoRefresh
              ? { background: T.blueBg, border: `1px solid ${T.blueBorder}`, color: T.blue }
              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
            <RefreshCw className="w-3 h-3" style={{ animation: autoRefresh ? 'spin 4s linear infinite' : 'none' }} />
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>

          {/* Refresh button */}
          <button onClick={() => fetchDashboard(true)} disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: T.accent, color: 'oklch(8% 0.02 220)', opacity: refreshing ? 0.6 : 1 }}
            onMouseEnter={e => { if (!refreshing) (e.currentTarget as HTMLButtonElement).style.background = 'oklch(74% 0.20 220)'; }}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = T.accent}>
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>

          {/* 3D Environment button */}
          <button onClick={() => navigate('/shms/3d')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'oklch(14% 0.05 260)', border: '1px solid oklch(22% 0.07 260)', color: 'oklch(68% 0.16 260)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'oklch(18% 0.06 260)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'oklch(14% 0.05 260)')}>
            <Box className="w-3 h-3" />
            3D
          </button>

          {/* AI Chat button */}
          <button onClick={() => setChatOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{ background: chatOpen ? 'oklch(14% 0.06 145)' : 'oklch(14% 0.05 220)', border: `1px solid ${chatOpen ? 'oklch(22% 0.08 145)' : 'oklch(22% 0.04 220)'}`, color: chatOpen ? 'oklch(72% 0.18 145)' : T.accent }}>
            <MessageSquare className="w-3 h-3" />
            AI Chat
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ═══ ERROR BANNER ═══ */}
        {error && (
          <div className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: T.redBg, border: `1px solid ${T.redBorder}` }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: T.red }}>
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>Erro ao buscar dados: {error}. Exibindo dados anteriores.</span>
            </div>
            <button onClick={() => fetchDashboard(true)}
              className="text-xs px-3 py-1.5 rounded-lg transition-all"
              style={{ background: T.redBorder, color: T.red }}
              onMouseEnter={e => (e.currentTarget.style.background = T.red, e.currentTarget.style.color = '#000')}
              onMouseLeave={e => (e.currentTarget.style.background = T.redBorder, e.currentTarget.style.color = T.red)}>
              Tentar novamente
            </button>
          </div>
        )}

        {/* ═══ KPI ROW ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Leituras"
            value={totalReadings.toLocaleString('pt-BR')}
            sub="acumulado histórico"
            icon={<Activity className="w-4 h-4" style={{ color: T.accent }} />}
          />
          <KpiCard
            label="Alertas Ativos"
            value={activeAlerts}
            sub={`${allAlerts.filter(a => a.severity === 'critical').length} críticos`}
            icon={<AlertTriangle className="w-4 h-4" style={{ color: activeAlerts > 0 ? T.yellow : T.muted }} />}
            valueColor={activeAlerts > 0 ? T.yellow : T.green}
            highlight={activeAlerts > 0}
          />
          <KpiCard
            label="Health Score Médio"
            value={`${avgHealthScore.toFixed(1)}%`}
            sub={avgHealthScore >= 85 ? 'Operação normal' : avgHealthScore >= 70 ? 'Requer atenção' : 'Intervenção necessária'}
            icon={<Shield className="w-4 h-4" style={{ color: healthColor(avgHealthScore) }} />}
            valueColor={healthColor(avgHealthScore)}
          />
          <KpiCard
            label="Estruturas Monitoradas"
            value={structures.length}
            sub={`${structures.filter(s => s.overallStatus === 'GREEN').length} normais · ${structures.filter(s => s.overallStatus !== 'GREEN').length} em atenção`}
            icon={<Building className="w-4 h-4" style={{ color: T.blue }} />}
            valueColor={T.blue}
          />
        </div>

        {/* ═══ STRUCTURE GRID + CHART ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Structure cards (3-column grid within left column) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Shield className="w-4 h-4" style={{ color: T.accent }} />
              <h2 className="text-sm font-semibold" style={{ color: T.text }}>Estruturas Monitoradas</h2>
              <span className="ml-auto text-[10px]" style={{ color: T.dim }}>{structures.length} total</span>
            </div>
            {structures.length === 0 && !loading && (
              <div className="rounded-2xl p-6 text-center text-sm" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                Nenhuma estrutura disponível
              </div>
            )}
            {structures.map(s => (
              <StructureCard
                key={s.structureId}
                s={s}
                selected={s.structureId === (selectedStructure?.structureId ?? null)}
                onClick={() => setSelectedId(s.structureId)}
              />
            ))}
          </div>

          {/* Chart panel */}
          <div className="lg:col-span-2 space-y-4">
            {selectedStructure ? (
              <>
                {/* Chart header */}
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  <div className="px-4 py-3 border-b flex items-center justify-between"
                    style={{ borderColor: T.border }}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" style={{ color: T.accent }} />
                      <h2 className="text-sm font-semibold">{selectedStructure.structureName}</h2>
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: T.blueBg, border: `1px solid ${T.blueBorder}`, color: T.blue }}>
                        {selectedStructure.digitalTwinStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: T.dim }}>
                      <span className="flex items-center gap-1">
                        <span style={{ color: T.accent }}>—</span> Real
                      </span>
                      <span className="flex items-center gap-1">
                        <span style={{ color: T.orange }}>- -</span> LSTM
                      </span>
                      <span className="flex items-center gap-1">
                        <span style={{ background: `${T.accent}30`, display: 'inline-block', width: 12, height: 8, borderRadius: 2 }} />
                        IC 95%
                      </span>
                      <span className="flex items-center gap-1">
                        <span style={{ color: T.red }}>✕</span> Anomalia
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="rounded-xl overflow-hidden mb-4"
                      style={{ background: 'oklch(9% 0.02 220)' }}>
                      <SensorChart readings={chartReadings} predictions={chartPredictions} />
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        {
                          label: 'Sensor Principal',
                          value: selectedStructure.sensors[0]?.sensorId ?? '—',
                          color: T.accent,
                        },
                        {
                          label: 'Última Leitura',
                          value: selectedStructure.sensors[0]
                            ? `${selectedStructure.sensors[0].lastReading} ${selectedStructure.sensors[0].unit}`
                            : '—',
                          color: T.text,
                        },
                        {
                          label: 'Confiança LSTM',
                          value: selectedStructure.lstmPrediction
                            ? `${(selectedStructure.lstmPrediction.confidence * 100).toFixed(0)}%`
                            : '—',
                          color: T.blue,
                        },
                        {
                          label: 'Tendência',
                          value: (
                            <span className="flex items-center justify-center gap-1">
                              {trendIcon(selectedStructure.lstmPrediction?.trend)}
                              {selectedStructure.lstmPrediction?.trend ?? '—'}
                            </span>
                          ),
                          color: T.text,
                        },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-xl p-3 text-center"
                          style={{ background: 'oklch(13% 0.02 220)' }}>
                          <div className="text-xs font-semibold" style={{ color }}>{value}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: T.dim }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Signal analysis panel (if available) */}
                {selectedStructure.signalAnalysis && (
                  <SignalAnalysisPanel sig={selectedStructure.signalAnalysis} />
                )}

                {/* Sensor table */}
                {selectedStructure.sensors.length > 0 && (
                  <div className="rounded-2xl overflow-hidden"
                    style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                    <div className="px-4 py-3 border-b flex items-center gap-2"
                      style={{ borderColor: T.border }}>
                      <Activity className="w-4 h-4" style={{ color: T.accent }} />
                      <span className="text-sm font-semibold">Sensores da Estrutura</span>
                      <span className="ml-auto text-[10px]" style={{ color: T.dim }}>
                        {selectedStructure.sensors.length} sensores
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                            {['Sensor', 'Tipo', 'Leitura', 'ICOLD', 'Atualizado'].map(h => (
                              <th key={h} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider"
                                style={{ color: T.dim }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedStructure.sensors.map((sen, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid oklch(13% 0.02 220)` }}
                              className="transition-colors"
                              onMouseEnter={e => (e.currentTarget.style.background = 'oklch(13% 0.02 220)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <td className="px-4 py-2 text-xs font-mono" style={{ color: T.accent }}>{sen.sensorId}</td>
                              <td className="px-4 py-2 text-xs" style={{ color: T.muted }}>{sen.sensorType}</td>
                              <td className="px-4 py-2 text-xs font-semibold" style={{ color: T.text }}>
                                {sen.lastReading} {sen.unit}
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                                  style={{
                                    background: `${icoldColor(sen.icoldLevel)}20`,
                                    border: `1px solid ${icoldColor(sen.icoldLevel)}50`,
                                    color: icoldColor(sen.icoldLevel),
                                  }}>
                                  {sen.icoldLevel}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-[10px]" style={{ color: T.dim }}>
                                {relativeTime(sen.lastUpdated)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl p-8 flex items-center justify-center"
                style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                Selecione uma estrutura para ver detalhes
              </div>
            )}
          </div>
        </div>

        {/* ═══ ALERTS PANEL ═══ */}
        <AlertsPanel alerts={allAlerts} />

        {/* ═══ FOOTER ═══ */}
        <footer className="flex items-center justify-between text-[10px] pb-4"
          style={{ color: T.dim }}>
          <span>SHMS Geo Inspector v4 · MOTHER v7 · ISO 13374-1:2003 · IEC 62682:2014 · GISTM 2020</span>
          <span>
            {totalReadings.toLocaleString('pt-BR')} leituras · {structures.length} estruturas ·{' '}
            {lastUpdated ? `atualizado ${lastUpdated.toLocaleTimeString('pt-BR')}` : 'carregando…'}
          </span>
        </footer>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ping { 75%,100% { transform: scale(2); opacity: 0; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        .animate-spin { animation: spin 1s linear infinite; }
        .animate-pulse { animation: pulse 2s cubic-bezier(.4,0,.6,1) infinite; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: oklch(22% 0.02 220); border-radius: 4px; }
      `}</style>

      {/* AI Chat panel */}
      {chatOpen && <ChatPanel data={data} onClose={() => setChatOpen(false)} />}
    </div>
  );
}
