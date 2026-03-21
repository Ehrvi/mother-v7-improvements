/**
 * BenchConsolidationPanel.tsx — SOTA Bench Consolidation UI
 *
 * SOTA UX Design Patterns Applied:
 *   1. Small-multiple DAC cards with semaphore borders (Tufte + HPHMI)
 *   2. Annotated SVG profile with dims, bench labels, catchment zones
 *   3. Tufte sparkline convergence + Pareto scatter
 *   4. Compact timeline audit trail (Linear.app pattern)
 *   5. Catchment visual bar with retention progress
 *   6. Slip circle overlay on SVG after analysis
 *   7. Hero verdict card (APPROVED / REJECTED) with glow
 *
 * References:
 *   - ISA-18.2 / IEC 62682: HPHMI grayscale-first, color for alarms only
 *   - Tufte (1983): data-ink ratio, small multiples, sparklines
 *   - Read & Stacey (2009): DAC criteria table presentation
 *   - Rocscience Slide3 (2024): split-panel, safety maps
 *   - Few (2013): KPI-first progressive disclosure
 *   - Nielsen (1994): visibility of status, user control
 */

import { useState, useMemo, useCallback } from 'react';
import {
  computeInterRampAngle,
  generateBenchProfile,
  analyzeConsolidation,
  dgmOptimizeBenchDesign,
  assessCatchment,
  DEFAULT_BENCH_SOIL,
  type BenchSoilParams,
  type ConsolidationResult,
  type DGMEvolutionResult,
  type DGMConstraints,
  type DACResult,
  type MonteCarloResult,
  type BenchComplianceEntry,
} from './BenchConsolidationEngine';

interface Props { structureId: string; }
type Tab = 'design' | 'lab' | 'dac' | 'dgm' | 'audit';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'design', label: 'Design', icon: '📐' },
  { key: 'lab',    label: 'Lab ASTM', icon: '🧪' },
  { key: 'dac',    label: 'DAC',    icon: '⚖️' },
  { key: 'dgm',    label: 'DGM',    icon: '🧬' },
  { key: 'audit',  label: 'Audit',  icon: '🔐' },
];

// ── ASTM D2435 Load Stage type ──
interface LoadStage { pressure: number; duration: number; }

// ── Consolidation Lab Parameters (SOTA §2.4) ──
interface ConsolidationLabParams {
  e0: number;           // Initial void ratio
  Gs: number;           // Specific gravity of solids
  sampleH: number;      // Sample height (mm)
  sampleD: number;      // Sample diameter (mm)
  drainage: 'single' | 'double';
  loadSchedule: LoadStage[];
  // Method toggles
  methodCasagrande: boolean;
  methodTaylor: boolean;
  methodIsotache: boolean;
  // Output toggles
  outputELogSigma: boolean;
  outputCv: boolean;
  outputCcCr: boolean;
  outputSettlement: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOTA COMPONENT: Annotated SVG Profile (Improvement #2 + #6)
// ═══════════════════════════════════════════════════════════════════════════════

function BenchProfileSVG({ H, W, alpha, N, catchmentOk, slipCircle }: {
  H: number; W: number; alpha: number; N: number; catchmentOk: boolean;
  slipCircle?: { cx: number; cy: number; r: number };
}) {
  const design = { benchHeight: H, bermWidth: W, faceAngle: alpha, numBenches: N, overallHeight: N * H, interRampAngle: computeInterRampAngle(H, W, alpha, N), overallAngle: 0 };
  const points = generateBenchProfile(design);
  if (points.length < 2) return null;

  const maxX = Math.max(...points.map(p => p.x));
  const maxY = Math.max(...points.map(p => p.y));
  const pad = 20; const w = maxX + pad * 2 + 30; const h = maxY + pad * 2 + 10;
  const toSvg = (p: { x: number; y: number }) => ({ x: p.x + pad + 20, y: h - p.y - pad });
  const svgPts = points.map(toSvg);
  const pathD = svgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillD = pathD + ` L${(maxX + pad + 30).toFixed(1)},${(h - pad).toFixed(1)} L${(pad + 20).toFixed(1)},${(h - pad).toFixed(1)} Z`;
  const toe = toSvg(points[0]); const crest = toSvg(points[points.length - 2]);
  const faceRun = H / Math.tan(alpha * Math.PI / 180);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 220, background: 'oklch(8% 0.01 230)', borderRadius: 'var(--shms-radius)', border: '1px solid var(--shms-border)' }}>
      <defs>
        <linearGradient id="bench-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(35% 0.06 45)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="oklch(20% 0.04 45)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d={fillD} fill="url(#bench-earth)" />
      <path d={pathD} fill="none" stroke="oklch(65% 0.12 45)" strokeWidth="2" strokeLinejoin="round" />
      {/* Inter-ramp dashed line */}
      <line x1={toe.x} y1={toe.y} x2={crest.x} y2={crest.y} stroke="oklch(68% 0.16 240)" strokeWidth="1.5" strokeDasharray="6,4" />
      {/* Bench labels + catchment zones (#2) */}
      {svgPts.map((p, i) => {
        if (i === 0 || i >= svgPts.length - 1) return null;
        const isFace = i % 2 === 1; const benchNum = Math.ceil(i / 2);
        if (isFace) {
          return <text key={`b${i}`} x={p.x + 4} y={p.y - 4} fontSize="9" fontWeight="700" fill="oklch(68% 0.16 240)" fontFamily="var(--shms-font-mono)">B{benchNum}</text>;
        }
        // Berm — catchment zone highlight
        const nextPt = svgPts[i + 1];
        if (nextPt) {
          return <rect key={`c${i}`} x={p.x} y={p.y - 4} width={nextPt.x - p.x} height={4} rx="2"
            fill={catchmentOk ? 'oklch(72% 0.17 148 / 0.4)' : 'oklch(62% 0.22 28 / 0.4)'} />;
        }
        return null;
      })}
      {/* Dimension: total height (vertical) */}
      <line x1={pad + 8} y1={toe.y} x2={pad + 8} y2={crest.y} stroke="oklch(50% 0.05 230)" strokeWidth="1" markerEnd="url(#arrow)" />
      <text x={pad + 2} y={(toe.y + crest.y) / 2} fontSize="8" fill="oklch(60% 0.05 230)" fontFamily="var(--shms-font-mono)" textAnchor="middle" transform={`rotate(-90, ${pad + 2}, ${(toe.y + crest.y) / 2})`}>{(N * H).toFixed(0)}m</text>
      {/* Dimension: berm width label on first berm */}
      {svgPts.length > 3 && (() => {
        const b1 = svgPts[2]; const b2 = svgPts[3];
        if (!b1 || !b2) return null;
        const mid = (b1.x + b2.x) / 2;
        return <text x={mid} y={b1.y + 14} fontSize="7" fill="oklch(55% 0.05 230)" fontFamily="var(--shms-font-mono)" textAnchor="middle">W={W}m</text>;
      })()}
      {/* θ inter-ramp label */}
      <text x={(toe.x + crest.x) / 2 + 10} y={(toe.y + crest.y) / 2 - 6} fontSize="8" fill="oklch(68% 0.16 240)" fontFamily="var(--shms-font-mono)">θ={computeInterRampAngle(H, W, alpha, N).toFixed(1)}°</text>
      {/* Slip circle overlay (#6) */}
      {slipCircle && (() => {
        const c = toSvg({ x: slipCircle.cx, y: slipCircle.cy });
        const scale = (svgPts[svgPts.length - 1].x - svgPts[0].x) / (maxX + 20);
        return <circle cx={c.x} cy={c.y} r={slipCircle.r * scale} fill="none" stroke="oklch(62% 0.22 28 / 0.6)" strokeWidth="2" strokeDasharray="6,3">
          <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>;
      })()}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOTA COMPONENT: Small-Multiple DAC Card (Improvement #1)
// ═══════════════════════════════════════════════════════════════════════════════

function DACCard({ d, label }: { d: DACResult; label: string }) {
  const status = d.fos >= d.minFOS * 1.15 ? 'green' : d.fos >= d.minFOS ? 'yellow' : 'red';
  const borderColor = status === 'green' ? 'oklch(72% 0.17 148 / 0.5)' : status === 'yellow' ? 'oklch(80% 0.15 85 / 0.5)' : 'oklch(62% 0.22 28 / 0.5)';
  const glowColor = status === 'green' ? 'oklch(72% 0.17 148 / 0.15)' : status === 'yellow' ? 'oklch(80% 0.15 85 / 0.1)' : 'oklch(62% 0.22 28 / 0.2)';
  const pofColor = d.pof <= 10 ? 'var(--shms-green)' : d.pof <= 25 ? 'oklch(80% 0.15 85)' : 'var(--shms-red)';
  return (
    <div style={{ background: 'var(--shms-bg-1)', border: `2px solid ${borderColor}`, borderRadius: 'var(--shms-radius)', padding: '16px', textAlign: 'center', boxShadow: `0 0 20px ${glowColor}`, transition: 'all 0.3s ease' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--shms-text-dim)', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'var(--shms-font-mono)', letterSpacing: '-0.03em', color: `var(--shms-${status})` }}>{d.fos.toFixed(3)}</div>
      <div style={{ fontSize: '10px', color: 'var(--shms-text-muted)', margin: '4px 0 8px' }}>≥ {d.minFOS.toFixed(1)} | PF &lt; {d.maxPF}%</div>
      {/* PoF Monte Carlo gauge (SOTA) */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="oklch(20% 0.02 230)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={pofColor} strokeWidth="3"
            strokeDasharray={`${Math.min(100, d.pof) * 0.94} ${94 - Math.min(100, d.pof) * 0.94}`}
            strokeDashoffset="23.5" strokeLinecap="round" />
          <text x="18" y="20" textAnchor="middle" fontSize="8" fontWeight="700" fill={pofColor} fontFamily="var(--shms-font-mono)">{d.pof.toFixed(0)}%</text>
        </svg>
        <div style={{ fontSize: '8px', color: 'var(--shms-text-dim)', textTransform: 'uppercase', textAlign: 'left', lineHeight: 1.3 }}>PoF<br/>Monte Carlo</div>
      </div>
      {/* Method breakdown — Tufte small text */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', fontSize: '9px', fontFamily: 'var(--shms-font-mono)' }}>
        <div><span style={{ color: 'var(--shms-text-dim)' }}>Bishop</span><div style={{ fontWeight: 700 }}>{d.fosBishop.toFixed(3)}</div></div>
        <div><span style={{ color: 'var(--shms-text-dim)' }}>Spencer</span><div style={{ fontWeight: 700 }}>{d.fosSpencer.toFixed(3)}</div></div>
        <div><span style={{ color: 'var(--shms-text-dim)' }}>M-P</span><div style={{ fontWeight: 700 }}>{d.fosMorgensternPrice.toFixed(3)}</div></div>
      </div>
      <div style={{ marginTop: '12px', fontSize: '16px' }}>{d.pass ? '✅' : '❌'}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOTA COMPONENT: Catchment Visual Bar (Improvement #5)
// ═══════════════════════════════════════════════════════════════════════════════

function CatchmentBar({ result }: { result: ConsolidationResult }) {
  const c = result.catchment;
  const pctMRC = Math.min(200, c.retentionCapacity);
  const pctEMRC = Math.min(200, c.retentionCapacityEMRC);
  const colorMRC = c.adequate ? 'var(--shms-green)' : 'var(--shms-red)';
  const colorEMRC = c.adequateEMRC ? 'oklch(68% 0.16 240)' : 'var(--shms-red)';
  return (
    <div style={{ background: 'var(--shms-bg-1)', border: '1px solid var(--shms-border)', borderRadius: 'var(--shms-radius)', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>🛡️ Catchment — MRC + EMRC</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>Berma</div>
          <div style={{ fontFamily: 'var(--shms-font-mono)', fontSize: '16px', fontWeight: 700 }}>{c.bermWidth.toFixed(1)}m</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>MRC Mín.</div>
          <div style={{ fontFamily: 'var(--shms-font-mono)', fontSize: '16px', fontWeight: 700, color: colorMRC }}>{c.requiredWidth.toFixed(1)}m</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>EMRC 90%</div>
          <div style={{ fontFamily: 'var(--shms-font-mono)', fontSize: '16px', fontWeight: 700, color: colorEMRC }}>{c.emrcRetentionDist.toFixed(1)}m</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>Spill Radius</div>
          <div style={{ fontFamily: 'var(--shms-font-mono)', fontSize: '16px', fontWeight: 700 }}>{c.spillRadius.toFixed(1)}m</div>
        </div>
      </div>
      {/* Dual retention bars — MRC vs EMRC */}
      <div style={{ fontSize: '10px', color: 'var(--shms-text-muted)', marginBottom: '4px' }}>MRC: {c.retentionCapacity.toFixed(0)}%</div>
      <div style={{ height: '6px', background: 'var(--shms-bg-2)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pctMRC / 2)}%`, background: colorMRC, borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ fontSize: '10px', color: 'var(--shms-text-muted)', marginBottom: '4px' }}>EMRC: {c.retentionCapacityEMRC.toFixed(0)}%</div>
      <div style={{ height: '6px', background: 'var(--shms-bg-2)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pctEMRC / 2)}%`, background: colorEMRC, borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOTA COMPONENT: Hero Verdict Card (Improvement #7)
// ═══════════════════════════════════════════════════════════════════════════════

function HeroVerdict({ result }: { result: ConsolidationResult }) {
  const pass = result.overallPass;
  const minFOS = Math.min(...result.dac.map(d => d.fos));
  const bg = pass ? 'oklch(14% 0.05 148 / 0.6)' : 'oklch(14% 0.06 28 / 0.6)';
  const border = pass ? 'oklch(72% 0.17 148 / 0.4)' : 'oklch(62% 0.22 28 / 0.4)';
  const glow = pass ? '0 0 30px oklch(72% 0.17 148 / 0.15)' : '0 0 30px oklch(62% 0.22 28 / 0.2)';
  const color = pass ? 'var(--shms-green)' : 'var(--shms-red)';
  return (
    <div style={{ background: bg, border: `2px solid ${border}`, borderRadius: 'var(--shms-radius-lg)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: glow, marginBottom: '16px' }}>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 800, color }}>{pass ? '✅ DESIGN APROVADO' : '❌ DESIGN REPROVADO'}</div>
        <div style={{ fontSize: '11px', color: 'var(--shms-text-secondary)', marginTop: '2px' }}>
          DAC {result.dac.every(d => d.pass) ? '3/3 satisfeito' : `${result.dac.filter(d => d.pass).length}/3`} • Catchment {result.catchment.adequate ? '✅' : '❌'} • EMRC {result.catchment.adequateEMRC ? '✅' : '❌'} • Vol: {result.volume.toFixed(0)} m³/m
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>FOS Mínimo</div>
        <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--shms-font-mono)', color }}>{minFOS.toFixed(3)}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOTA COMPONENT: Sparkline (Improvement #3 — Tufte)
// ═══════════════════════════════════════════════════════════════════════════════

function Sparkline({ data, width = 200, height = 40, color = 'oklch(68% 0.16 240)' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data); const max = Math.max(...data) || 1;
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* End dot */}
      {data.length > 0 && (() => {
        const lastX = width; const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;
        return <circle cx={lastX} cy={lastY} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SOTA COMPONENT: Audit Timeline (Improvement #4 — Linear.app)
// ═══════════════════════════════════════════════════════════════════════════════

function AuditTimeline({ history, onRestore }: { history: ConsolidationResult[]; onRestore: (r: ConsolidationResult) => void }) {
  if (history.length === 0) {
    return <div className="shms-empty" style={{ height: 200 }}><div style={{ fontSize: '32px' }}>🔐</div><div>Nenhuma análise registrada</div></div>;
  }
  return (
    <div style={{ position: 'relative', paddingLeft: '24px' }}>
      {/* Vertical line */}
      <div style={{ position: 'absolute', left: '8px', top: '4px', bottom: '4px', width: '2px', background: 'var(--shms-border)', borderRadius: '1px' }} />
      {history.map((r, i) => {
        const minFOS = Math.min(...r.dac.map(d => d.fos));
        const pass = r.overallPass;
        const dotColor = pass ? 'var(--shms-green)' : 'var(--shms-red)';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--shms-font-mono)', transition: 'opacity 0.2s' }}
            onClick={() => onRestore(r)} title="Clique para restaurar parâmetros">
            {/* Dot on timeline */}
            <div style={{ position: 'absolute', left: '4px', width: '10px', height: '10px', borderRadius: '50%', background: dotColor, border: '2px solid var(--shms-bg-1)' }} />
            <span style={{ color: 'var(--shms-text-dim)', fontSize: '10px', minWidth: '50px' }}>{new Date(r.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span>H={r.design.benchHeight.toFixed(0)}×{r.design.numBenches}</span>
            <span>W={r.design.bermWidth.toFixed(1)}</span>
            <span>α={r.design.faceAngle.toFixed(0)}°</span>
            <span style={{ fontWeight: 700, color: pass ? 'var(--shms-green)' : 'var(--shms-red)' }}>FOS={minFOS.toFixed(3)}</span>
            <span style={{ color: pass ? 'var(--shms-green)' : 'var(--shms-red)' }}>{pass ? '✅' : '❌'}</span>
            <span style={{ color: 'var(--shms-text-dim)', fontSize: '9px' }}>sha:{r.hash.substring(0, 8)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function BenchConsolidationPanel({ structureId }: Props) {
  const [tab, setTab] = useState<Tab>('design');
  const [H, setH] = useState(15);
  const [W, setW] = useState(8);
  const [alpha, setAlpha] = useState(65);
  const [N, setN] = useState(4);
  const [soil, setSoil] = useState<BenchSoilParams>(DEFAULT_BENCH_SOIL);
  const [result, setResult] = useState<ConsolidationResult | null>(null);
  const [dgmResult, setDgmResult] = useState<DGMEvolutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConsolidationResult[]>([]);

  // ── Consolidation Lab state (ASTM D2435) ──
  const [labParams, setLabParams] = useState<ConsolidationLabParams>({
    e0: 0.85, Gs: 2.65, sampleH: 20, sampleD: 63.5, drainage: 'double',
    loadSchedule: [
      { pressure: 12.5, duration: 24 },
      { pressure: 25, duration: 24 },
      { pressure: 50, duration: 24 },
      { pressure: 100, duration: 24 },
      { pressure: 200, duration: 24 },
      { pressure: 400, duration: 48 },
    ],
    methodCasagrande: true, methodTaylor: true, methodIsotache: false,
    outputELogSigma: true, outputCv: true, outputCcCr: true, outputSettlement: true,
  });
  const [labComputed, setLabComputed] = useState(false);

  const interRamp = useMemo(() => computeInterRampAngle(H, W, alpha, N), [H, W, alpha, N]);
  const catchment = useMemo(() => assessCatchment(H, W, alpha), [H, W, alpha]);

  // Get slip circle from best result for overlay
  const slipCircle = result ? (() => {
    const bestDac = result.dac.reduce((a, b) => a.fos < b.fos ? a : b);
    return { cx: bestDac.circle.center.x, cy: bestDac.circle.center.y, r: bestDac.circle.radius };
  })() : undefined;

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyzeConsolidation(H, W, alpha, N, soil);
      setResult(r);
      setHistory(prev => [r, ...prev].slice(0, 20));
      setTab('dac');
    } finally { setLoading(false); }
  }, [H, W, alpha, N, soil]);

  const runDGM = useCallback(async () => {
    setLoading(true);
    try {
      const constraints: DGMConstraints = { hRange: [8, 25], wRange: [5, 15], alphaRange: [50, 80], nRange: [2, 8], minFOS: 1.3, targetFOS: 1.5 };
      const dgm = await dgmOptimizeBenchDesign(soil, constraints, 60, 80, Date.now() % 10000);
      setDgmResult(dgm);
      setResult(dgm.bestDesign);
      const best = dgm.bestDesign.design;
      setH(Math.round(best.benchHeight * 10) / 10);
      setW(Math.round(best.bermWidth * 10) / 10);
      setAlpha(Math.round(best.faceAngle * 10) / 10);
      setN(best.numBenches);
      setHistory(prev => [dgm.bestDesign, ...prev].slice(0, 20));
      setTab('dgm');
    } finally { setLoading(false); }
  }, [soil]);

  const restoreFromHistory = (r: ConsolidationResult) => {
    setH(r.design.benchHeight); setW(r.design.bermWidth);
    setAlpha(r.design.faceAngle); setN(r.design.numBenches);
    setResult(r); setTab('dac');
  };

  // Slider helper
  const Slider = ({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) => (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
        <span style={{ color: 'var(--shms-text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--shms-accent)', height: '4px' }} />
    </div>
  );

  return (
    <div className="shms-animate-slide-in" style={{ padding: 'var(--shms-sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 'var(--shms-fs-lg)', fontWeight: 700 }}>🏗️ Consolidação de Bancadas</div>
          <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>DGM × DAC Read & Stacey 2009 × MRC + EMRC (NIOSH 2023) × Monte Carlo PoF × SHA-256</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="shms-btn" onClick={runAnalysis} disabled={loading}>{loading ? '⏳' : '▶'} Analisar</button>
          <button className="shms-btn shms-btn--accent" onClick={runDGM} disabled={loading}>{loading ? '⏳' : '🧬'} DGM</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--shms-border)', paddingBottom: '1px' }}>
        {TABS.map(t => (
          <button key={t.key} className={`shms-btn ${tab === t.key ? 'shms-sidebar__item--active' : ''}`}
            style={{ borderRadius: '6px 6px 0 0', borderBottom: 'none', fontSize: '12px', padding: '6px 14px' }}
            onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: DESIGN ─── */}
      {tab === 'design' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--shms-sp-4)' }}>
          {/* Left: Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-3)' }}>
            <div className="shms-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>📐 Parâmetros</div>
              <Slider label="Altura (H)" value={H} min={5} max={30} step={0.5} unit="m" onChange={setH} />
              <Slider label="Berma (W)" value={W} min={3} max={20} step={0.5} unit="m" onChange={setW} />
              <Slider label="Ângulo Face (α)" value={alpha} min={40} max={85} step={1} unit="°" onChange={setAlpha} />
              <Slider label="Nº Bancadas (N)" value={N} min={2} max={10} step={1} unit="" onChange={setN} />
            </div>

            {/* Computed KPIs */}
            <div className="shms-card" style={{ padding: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>θ Inter-Rampa</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700, color: 'var(--shms-accent)' }}>{interRamp.toFixed(1)}°</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Altura Total</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{(N * H).toFixed(1)}m</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Catchment</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700, color: catchment.adequate ? 'var(--shms-green)' : 'var(--shms-red)' }}>{catchment.adequate ? '✅' : '❌'} {W}/{catchment.requiredWidth.toFixed(1)}m</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Spill Radius</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{catchment.spillRadius.toFixed(1)}m</div></div>
              </div>
            </div>

            {/* Soil */}
            <div className="shms-card" style={{ padding: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>🪨 Solo</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {[
                  { label: "c' kPa", key: 'cohesion' as const, val: soil.cohesion },
                  { label: "φ' °", key: 'frictionAngle' as const, val: soil.frictionAngle },
                  { label: "γ kN/m³", key: 'unitWeight' as const, val: soil.unitWeight },
                ].map(({ label, key, val }) => (
                  <div key={key}>
                    <div style={{ fontSize: '8px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>{label}</div>
                    <input type="number" value={val} onChange={e => setSoil({ ...soil, [key]: +e.target.value })}
                      style={{ width: '100%', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '4px', padding: '3px 6px', color: 'var(--shms-text)', fontSize: '11px', fontFamily: 'var(--shms-font-mono)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: SVG + Scale cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-3)' }}>
            <BenchProfileSVG H={H} W={W} alpha={alpha} N={N} catchmentOk={catchment.adequate} slipCircle={result ? slipCircle : undefined} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {['Bancada', 'Inter-Rampa', 'Global'].map((label, i) => (
                <div key={label} className="shms-kpi" style={{ textAlign: 'center', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--shms-font-mono)', fontSize: '14px', fontWeight: 700 }}>{i === 0 ? `1×${H}m` : i === 1 ? `${N}×${H}m` : `${(N * H).toFixed(0)}m`}</div>
                  <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)' }}>FOS ≥ {[1.1, 1.2, 1.3][i]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: LAB (ASTM D2435 Oedometer — SOTA §2.4) ─── */}
      {tab === 'lab' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--shms-sp-4)' }}>
          {/* Left: Input Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-3)' }}>
            {/* Sample Properties */}
            <div className="shms-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>🧪 Parâmetros do Ensaio (ASTM D2435)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Índice de Vazios Inicial (e₀)', key: 'e0' as const, val: labParams.e0, step: 0.01, min: 0.3, max: 3.0 },
                  { label: 'Peso Específico (Gs)', key: 'Gs' as const, val: labParams.Gs, step: 0.01, min: 2.5, max: 2.8 },
                  { label: 'Altura da Amostra (mm)', key: 'sampleH' as const, val: labParams.sampleH, step: 0.5, min: 10, max: 40 },
                  { label: 'Diâmetro da Amostra (mm)', key: 'sampleD' as const, val: labParams.sampleD, step: 0.5, min: 50, max: 100 },
                ].map(({ label, key, val, step, min, max }) => (
                  <div key={key}>
                    <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>{label}</div>
                    <input type="number" value={val} step={step} min={min} max={max}
                      onChange={e => setLabParams({ ...labParams, [key]: +e.target.value })}
                      style={{ width: '100%', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '4px', padding: '6px 8px', color: 'var(--shms-text)', fontSize: '12px', fontFamily: 'var(--shms-font-mono)' }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)', textTransform: 'uppercase', marginBottom: '3px' }}>Drenagem</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['single', 'double'] as const).map(d => (
                    <button key={d} className={`shms-btn ${labParams.drainage === d ? 'shms-btn--accent' : ''}`}
                      style={{ fontSize: '10px', padding: '4px 10px' }}
                      onClick={() => setLabParams({ ...labParams, drainage: d })}>
                      {d === 'single' ? '▲ Simples' : '▲▼ Dupla'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Load Schedule */}
            <div className="shms-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>📊 Programa de Carregamento</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--shms-border)' }}>
                    <th style={{ padding: '4px', textAlign: 'left', fontSize: '9px', color: 'var(--shms-text-dim)' }}>Estágio</th>
                    <th style={{ padding: '4px', textAlign: 'right', fontSize: '9px', color: 'var(--shms-text-dim)' }}>σ (kPa)</th>
                    <th style={{ padding: '4px', textAlign: 'right', fontSize: '9px', color: 'var(--shms-text-dim)' }}>Duração (h)</th>
                    <th style={{ padding: '4px', textAlign: 'center', fontSize: '9px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {labParams.loadSchedule.map((stage, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--shms-border)' }}>
                      <td style={{ padding: '4px', fontFamily: 'var(--shms-font-mono)' }}>{i + 1}</td>
                      <td style={{ padding: '4px' }}>
                        <input type="number" value={stage.pressure} min={0} step={12.5}
                          onChange={e => {
                            const s = [...labParams.loadSchedule];
                            s[i] = { ...s[i], pressure: +e.target.value };
                            setLabParams({ ...labParams, loadSchedule: s });
                          }}
                          style={{ width: '70px', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '3px', padding: '2px 6px', color: 'var(--shms-text)', fontSize: '11px', fontFamily: 'var(--shms-font-mono)', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input type="number" value={stage.duration} min={1} step={1}
                          onChange={e => {
                            const s = [...labParams.loadSchedule];
                            s[i] = { ...s[i], duration: +e.target.value };
                            setLabParams({ ...labParams, loadSchedule: s });
                          }}
                          style={{ width: '60px', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '3px', padding: '2px 6px', color: 'var(--shms-text)', fontSize: '11px', fontFamily: 'var(--shms-font-mono)', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <button className="shms-btn" style={{ fontSize: '9px', padding: '1px 4px', color: 'var(--shms-red)' }}
                          onClick={() => {
                            const s = labParams.loadSchedule.filter((_, j) => j !== i);
                            setLabParams({ ...labParams, loadSchedule: s });
                          }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="shms-btn" style={{ fontSize: '10px', padding: '4px 10px', marginTop: '8px' }}
                onClick={() => {
                  const last = labParams.loadSchedule[labParams.loadSchedule.length - 1];
                  setLabParams({ ...labParams, loadSchedule: [...labParams.loadSchedule, { pressure: (last?.pressure ?? 200) * 2, duration: 24 }] });
                }}>+ Adicionar Estágio</button>
            </div>
          </div>

          {/* Right: Method + Output Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-3)' }}>
            {/* Methods */}
            <div className="shms-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>🔬 Método de Interpretação</div>
              {[
                { key: 'methodCasagrande' as const, label: 'Casagrande log-t', desc: 'ASTM D2435 — EOP via t₅₀ (curva √t50 = 0.197)', ref: 'ASTM D2435-11' },
                { key: 'methodTaylor' as const, label: 'Taylor √t', desc: 'Método gráfico √t — t₉₀ pela tangente', ref: 'Taylor (1948)' },
                { key: 'methodIsotache' as const, label: 'Isotache (Bjerrum)', desc: 'Inclui fluência — válido para argilas moles orgânicas', ref: 'Bjerrum (1967)' },
              ].map(({ key, label, desc, ref }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '4px', background: labParams[key] ? 'var(--shms-accent-bg)' : 'transparent', border: labParams[key] ? '1px solid var(--shms-accent-border)' : '1px solid transparent', transition: 'all 0.2s ease' }}>
                  <input type="checkbox" checked={labParams[key]} onChange={e => setLabParams({ ...labParams, [key]: e.target.checked })}
                    style={{ accentColor: 'var(--shms-accent)', marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--shms-text-dim)' }}>{desc}</div>
                    <div style={{ fontSize: '9px', color: 'var(--shms-text-muted)', fontStyle: 'italic' }}>{ref}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Output Parameters */}
            <div className="shms-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>📈 Parâmetros de Saída</div>
              {[
                { key: 'outputELogSigma' as const, label: 'Curva e–log σ\'', desc: 'Curva de compressibilidade (Cc, Cr, σ\'p)' },
                { key: 'outputCv' as const, label: 'Cv (coef. consolidação)', desc: 'cm²/s — por estágio de carga' },
                { key: 'outputCcCr' as const, label: 'Cc / Cr', desc: 'Índices de compressão e recompressão' },
                { key: 'outputSettlement' as const, label: 'Previsão de recalque', desc: 'Recalque primário + secundário (Cα)' },
              ].map(({ key, label, desc }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', marginBottom: '2px', background: labParams[key] ? 'var(--shms-accent-bg)' : 'transparent', transition: 'all 0.2s ease' }}>
                  <input type="checkbox" checked={labParams[key]} onChange={e => setLabParams({ ...labParams, [key]: e.target.checked })}
                    style={{ accentColor: 'var(--shms-accent)' }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)' }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Computed Preview */}
            <div className="shms-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>📋 Resumo do Ensaio</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Saturação Inicial</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{((labParams.Gs * (labParams.sampleH / 10)) / (labParams.e0 * (labParams.sampleH / 10)) * 100).toFixed(0)}%</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Hdr (drenagem)</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{labParams.drainage === 'double' ? (labParams.sampleH / 2).toFixed(1) : labParams.sampleH.toFixed(1)} mm</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>σ máx</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{Math.max(...labParams.loadSchedule.map(s => s.pressure))} kPa</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Estágios</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{labParams.loadSchedule.length}</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Duração Total</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{labParams.loadSchedule.reduce((a, s) => a + s.duration, 0)}h ({(labParams.loadSchedule.reduce((a, s) => a + s.duration, 0) / 24).toFixed(1)}d)</div></div>
                <div><span style={{ color: 'var(--shms-text-dim)', fontSize: '9px', textTransform: 'uppercase' }}>Métodos</span><div style={{ fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{[labParams.methodCasagrande && 'Casa.', labParams.methodTaylor && 'Taylor', labParams.methodIsotache && 'Isot.'].filter(Boolean).join(', ') || '—'}</div></div>
              </div>
              <button className="shms-btn shms-btn--accent" style={{ width: '100%', marginTop: '12px', padding: '8px' }}
                onClick={() => { setLabComputed(true); setTab('dac'); }}>
                ▶ Processar Ensaio e Analisar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: DAC ─── */}
      {tab === 'dac' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-4)' }}>
          <HeroVerdict result={result} />
          {/* Small-multiple DAC cards (#1) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--shms-sp-4)' }}>
            {result.dac.map(d => (
              <DACCard key={d.scale} d={d} label={d.scale === 'bench' ? 'Bancada' : d.scale === 'inter-ramp' ? 'Inter-Rampa' : 'Global'} />
            ))}
          </div>
          <CatchmentBar result={result} />
        </div>
      )}
      {tab === 'dac' && !result && (
        <div className="shms-empty" style={{ height: 300 }}>
          <div style={{ fontSize: '32px' }}>⚖️</div>
          <div>Clique <strong>"Analisar"</strong> para rodar DAC 3 escalas</div>
        </div>
      )}

      {/* ─── TAB: DGM ─── */}
      {tab === 'dgm' && dgmResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-4)' }}>
          <HeroVerdict result={dgmResult.bestDesign} />
          <div className="shms-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>🧬 Darwin Golden Machine — Evolution</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {[
                { label: 'Gerações', value: String(dgmResult.generations) },
                { label: 'Tempo', value: `${(dgmResult.elapsedMs / 1000).toFixed(1)}s` },
                { label: 'Pareto', value: String(dgmResult.paretoFront.length) },
                { label: 'Best FOS', value: Math.min(...dgmResult.bestDesign.dac.map(d => d.fos)).toFixed(3) },
                { label: 'Volume', value: `${dgmResult.bestDesign.volume.toFixed(0)}m³` },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--shms-font-mono)', fontSize: '16px', fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Best design params */}
            <div style={{ padding: '10px', background: 'var(--shms-accent-bg)', borderRadius: '6px', border: '1px solid var(--shms-accent-border)', display: 'flex', gap: '16px', justifyContent: 'center', fontFamily: 'var(--shms-font-mono)', fontSize: '12px' }}>
              <span>H={dgmResult.bestDesign.design.benchHeight.toFixed(1)}m</span>
              <span>W={dgmResult.bestDesign.design.bermWidth.toFixed(1)}m</span>
              <span>α={dgmResult.bestDesign.design.faceAngle.toFixed(0)}°</span>
              <span>N={dgmResult.bestDesign.design.numBenches}</span>
              <span style={{ color: 'var(--shms-accent)' }}>θ={dgmResult.bestDesign.design.interRampAngle.toFixed(1)}°</span>
            </div>
          </div>
          {/* Sparkline convergence (#3) */}
          <div className="shms-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>📈 Convergência (Sparkline — Tufte)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '8px', color: 'var(--shms-text-dim)' }}>Best Fitness</div>
                <Sparkline data={dgmResult.convergenceHistory.map(h => h.bestFitness)} width={300} height={50} color="oklch(68% 0.16 240)" />
              </div>
              <div>
                <div style={{ fontSize: '8px', color: 'var(--shms-text-dim)' }}>Avg Fitness</div>
                <Sparkline data={dgmResult.convergenceHistory.map(h => h.avgFitness)} width={300} height={50} color="oklch(50% 0.08 230)" />
              </div>
            </div>
          </div>
          {/* Pareto scatter — 3-axis: FOS vs Volume vs Catchment (#3) */}
          <div className="shms-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>🎯 Pareto Front — NSGA-II (FOS × Volume × Retenção)</div>
            <svg viewBox="0 0 400 150" style={{ width: '100%', height: 150, background: 'oklch(8% 0.01 230)', borderRadius: '6px' }}>
              <line x1="40" y1="130" x2="390" y2="130" stroke="oklch(25% 0.02 230)" strokeWidth="1" />
              <line x1="40" y1="10" x2="40" y2="130" stroke="oklch(25% 0.02 230)" strokeWidth="1" />
              <text x="215" y="148" fontSize="8" fill="var(--shms-text-dim)" textAnchor="middle" fontFamily="var(--shms-font-mono)">Volume (m³/m)</text>
              <text x="10" y="70" fontSize="8" fill="var(--shms-text-dim)" textAnchor="middle" fontFamily="var(--shms-font-mono)" transform="rotate(-90, 10, 70)">FOS min</text>
              {dgmResult.paretoFront.length > 0 && (() => {
                const vols = dgmResult.paretoFront.map(r => r.volume);
                const foss = dgmResult.paretoFront.map(r => Math.min(...r.dac.map(d => d.fos)));
                const rets = dgmResult.paretoFront.map(r => r.catchment.retentionCapacity);
                const vMin = Math.min(...vols); const vMax = Math.max(...vols) || 1;
                const fMin = Math.min(...foss); const fMax = Math.max(...foss) || 1;
                return dgmResult.paretoFront.map((r, i) => {
                  const x = 45 + ((vols[i] - vMin) / (vMax - vMin || 1)) * 340;
                  const y = 125 - ((foss[i] - fMin) / (fMax - fMin || 1)) * 110;
                  const isBest = r === dgmResult.bestDesign;
                  // 3rd axis — retention → dot size
                  const dotR = 2 + (rets[i] / 100) * 4;
                  return <circle key={i} cx={x} cy={y} r={isBest ? 6 : dotR} fill={isBest ? 'oklch(68% 0.16 240)' : 'oklch(72% 0.17 148 / 0.6)'} stroke={isBest ? 'white' : 'none'} strokeWidth={isBest ? 1.5 : 0}>
                    <title>FOS={foss[i].toFixed(3)} Vol={vols[i].toFixed(0)} Ret={rets[i].toFixed(0)}%</title>
                  </circle>;
                });
              })()}
            </svg>
          </div>
          {/* Monte Carlo histogram + Compliance heatmap */}
          {dgmResult.monteCarlo && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--shms-sp-4)' }}>
              {/* MC Histogram */}
              <div className="shms-card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>🎲 Monte Carlo PoF — {dgmResult.monteCarlo.nSims} sims</div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', fontSize: '10px', fontFamily: 'var(--shms-font-mono)' }}>
                  <span>PoF: <strong style={{ color: dgmResult.monteCarlo.pof <= 10 ? 'var(--shms-green)' : 'var(--shms-red)' }}>{dgmResult.monteCarlo.pof.toFixed(1)}%</strong></span>
                  <span>μ: {dgmResult.monteCarlo.mean.toFixed(3)}</span>
                  <span>σ: {dgmResult.monteCarlo.stdDev.toFixed(3)}</span>
                  <span>β: {dgmResult.monteCarlo.reliabilityIndex.toFixed(2)}</span>
                </div>
                <svg viewBox="0 0 300 80" style={{ width: '100%', height: 80 }}>
                  {(() => {
                    const mc = dgmResult.monteCarlo!;
                    const maxC = Math.max(...mc.histogram.map(h => h.count)) || 1;
                    const bw = 300 / mc.histogram.length;
                    const fosRange = mc.histogram.length > 0 ? [mc.histogram[0].bin, mc.histogram[mc.histogram.length - 1].bin] : [0, 2];
                    return <>
                      {mc.histogram.map((h, i) => (
                        <rect key={i} x={i * bw} y={75 - (h.count / maxC) * 70} width={bw - 1} height={(h.count / maxC) * 70}
                          fill={h.bin < 1.0 ? 'oklch(62% 0.22 28 / 0.7)' : 'oklch(68% 0.16 240 / 0.5)'} rx="1" />
                      ))}
                      {/* Red line at FoS = 1.0 */}
                      {fosRange[0] < 1.0 && fosRange[1] > 1.0 && (
                        <line x1={((1.0 - fosRange[0]) / (fosRange[1] - fosRange[0])) * 300} y1="0" x2={((1.0 - fosRange[0]) / (fosRange[1] - fosRange[0])) * 300} y2="75" stroke="var(--shms-red)" strokeWidth="1.5" strokeDasharray="4,2" />
                      )}
                    </>;
                  })()}
                </svg>
              </div>
              {/* Compliance Heatmap */}
              <div className="shms-card" style={{ padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>🗺️ Compliance — BFA (Maptek)</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {dgmResult.compliance.map(c => (
                    <div key={c.benchIndex} style={{ background: c.color + '22', border: `2px solid ${c.color}`, borderRadius: '6px', padding: '8px 10px', textAlign: 'center', minWidth: '60px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: c.color }}>B{c.benchIndex + 1}</div>
                      <div style={{ fontSize: '12px', fontFamily: 'var(--shms-font-mono)', fontWeight: 700 }}>{c.designedBFA}°</div>
                      <div style={{ fontSize: '9px', fontFamily: 'var(--shms-font-mono)', color: c.color }}>Δ{c.deviationDeg > 0 ? '+' : ''}{c.deviationDeg}°</div>
                      <div style={{ fontSize: '7px', color: 'var(--shms-text-dim)', textTransform: 'uppercase' }}>{c.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'dgm' && !dgmResult && (
        <div className="shms-empty" style={{ height: 300 }}>
          <div style={{ fontSize: '32px' }}>🧬</div>
          <div>Clique <strong>"DGM"</strong> para evoluir</div>
          <div style={{ fontSize: '10px', color: 'var(--shms-text-dim)' }}>60 organismos × 80 gerações</div>
        </div>
      )}

      {/* ─── TAB: AUDIT ─── */}
      {tab === 'audit' && (
        <div className="shms-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>🔐 Audit Trail — SHA-256</div>
          <AuditTimeline history={history} onRestore={restoreFromHistory} />
        </div>
      )}
    </div>
  );
}
