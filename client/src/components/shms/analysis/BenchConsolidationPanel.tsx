/**
 * BenchConsolidationPanel.tsx — SOTA Bench Consolidation UI
 *
 * 4 Tabs:
 *   1. Parametric Design — sliders + SVG preview + inter-ramp angle
 *   2. DAC Analysis — 3-scale FOS with semaphore (Read & Stacey 2009)
 *   3. DGM Optimizer — evolutionary optimization + convergence chart
 *   4. Audit Trail — SHA-256 hash, history, catchment check
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
} from './BenchConsolidationEngine';

interface Props { structureId: string; }

type Tab = 'design' | 'dac' | 'dgm' | 'audit';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'design', label: 'Design Paramétrico', icon: '📐' },
  { key: 'dac',    label: 'DAC 3 Escalas',      icon: '⚖️' },
  { key: 'dgm',    label: 'DGM Optimizer',       icon: '🧬' },
  { key: 'audit',  label: 'Audit Trail',         icon: '🔐' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  container: { padding: 'var(--shms-sp-5)', display: 'flex', flexDirection: 'column' as const, gap: 'var(--shms-sp-4)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--shms-sp-3)' },
  title: { fontSize: 'var(--shms-fs-lg)', fontWeight: 700 },
  subtitle: { fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' },
  tabs: { display: 'flex', gap: 'var(--shms-sp-1)', borderBottom: '1px solid var(--shms-border)', paddingBottom: 'var(--shms-sp-1)' },
  tab: { padding: '8px 14px', fontSize: 'var(--shms-fs-sm)', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--shms-radius-sm) var(--shms-radius-sm) 0 0', border: '1px solid transparent', borderBottom: 'none', background: 'transparent', color: 'var(--shms-text-secondary)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' },
  tabActive: { background: 'var(--shms-accent-bg)', color: 'var(--shms-accent)', borderColor: 'var(--shms-accent-border)' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--shms-sp-4)' },
  card: { background: 'var(--shms-bg-1)', border: '1px solid var(--shms-border)', borderRadius: 'var(--shms-radius)', padding: 'var(--shms-sp-4)' },
  cardTitle: { fontSize: 'var(--shms-fs-sm)', fontWeight: 600, marginBottom: 'var(--shms-sp-3)', display: 'flex', alignItems: 'center', gap: '6px' },
  slider: { width: '100%', accentColor: 'var(--shms-accent)' },
  sliderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--shms-sp-2)' },
  sliderLabel: { fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)' },
  sliderValue: { fontSize: 'var(--shms-fs-sm)', fontWeight: 700, fontFamily: 'var(--shms-font-mono)' },
  badge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '4px', fontSize: 'var(--shms-fs-xs)', fontWeight: 700, background: `var(--shms-${color}-bg)`, color: `var(--shms-${color})`, border: `1px solid var(--shms-${color}-border)` }),
  mono: { fontFamily: 'var(--shms-font-mono)', fontSize: 'var(--shms-fs-sm)' },
  btn: { padding: '8px 16px', borderRadius: 'var(--shms-radius-sm)', border: '1px solid var(--shms-accent-border)', background: 'var(--shms-accent-bg)', color: 'var(--shms-accent)', fontWeight: 600, fontSize: 'var(--shms-fs-sm)', cursor: 'pointer', transition: 'all 0.2s' },
  btnAccent: { padding: '10px 20px', borderRadius: 'var(--shms-radius-sm)', border: 'none', background: 'linear-gradient(135deg, oklch(68% 0.16 240), oklch(64% 0.14 260))', color: '#fff', fontWeight: 700, fontSize: 'var(--shms-fs-sm)', cursor: 'pointer', boxShadow: '0 2px 8px oklch(68% 0.16 240 / 0.3)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 'var(--shms-fs-sm)' },
  th: { textAlign: 'left' as const, padding: '8px 12px', fontSize: 'var(--shms-fs-xs)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'var(--shms-text-dim)', borderBottom: '1px solid var(--shms-border)' },
  td: { padding: '8px 12px', borderBottom: '1px solid oklch(13% 0.015 230)' },
};

// ─── SVG Bench Profile ──────────────────────────────────────────────────────
function BenchProfileSVG({ H, W, alpha, N }: { H: number; W: number; alpha: number; N: number }) {
  const points = generateBenchProfile({ benchHeight: H, bermWidth: W, faceAngle: alpha, numBenches: N, overallHeight: N * H, interRampAngle: computeInterRampAngle(H, W, alpha, N), overallAngle: 0 });
  if (points.length < 2) return null;

  const maxX = Math.max(...points.map(p => p.x));
  const maxY = Math.max(...points.map(p => p.y));
  const pad = 10;
  const w = maxX + pad * 2;
  const h = maxY + pad * 2;

  // Flip Y for SVG (y increases downward)
  const toSvg = (p: { x: number; y: number }) => ({ x: p.x + pad, y: h - p.y - pad });

  const svgPoints = points.map(toSvg);
  const pathD = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Fill area
  const fillD = pathD + ` L${(maxX + pad + 10).toFixed(1)},${(h - pad).toFixed(1)} L${pad.toFixed(1)},${(h - pad).toFixed(1)} Z`;

  // Inter-ramp line
  const toe = toSvg(points[0]);
  const crest = toSvg(points[points.length - 2]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 200, background: 'oklch(8% 0.01 230)', borderRadius: 'var(--shms-radius-sm)', border: '1px solid var(--shms-border)' }}>
      <defs>
        <linearGradient id="bench-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(40% 0.08 45)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="oklch(25% 0.05 45)" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Fill */}
      <path d={fillD} fill="url(#bench-fill)" />
      {/* Profile line */}
      <path d={pathD} fill="none" stroke="oklch(72% 0.17 45)" strokeWidth="2" strokeLinejoin="round" />
      {/* Inter-ramp line */}
      <line x1={toe.x} y1={toe.y} x2={crest.x} y2={crest.y} stroke="oklch(68% 0.16 240)" strokeWidth="1.5" strokeDasharray="4,3" />
      {/* Bench labels */}
      {svgPoints.filter((_, i) => i > 0 && i < svgPoints.length - 1 && i % 2 === 1).map((p, i) => (
        <text key={i} x={p.x + 3} y={p.y - 3} fontSize="8" fill="var(--shms-text-muted)" fontFamily="var(--shms-font-mono)">B{i + 1}</text>
      ))}
      {/* Dimension: total height */}
      <text x={pad / 2} y={h / 2} fontSize="8" fill="var(--shms-accent)" fontFamily="var(--shms-font-mono)" transform={`rotate(-90, ${pad / 2}, ${h / 2})`} textAnchor="middle">{(N * H).toFixed(0)}m</text>
    </svg>
  );
}

// ─── DAC Semaphore ──────────────────────────────────────────────────────────
function DACRow({ label, fos, minFOS, bishop, spencer, mp }: { label: string; fos: number; minFOS: number; bishop: number; spencer: number; mp: number }) {
  const pass = fos >= minFOS;
  const color = pass ? (fos >= minFOS * 1.15 ? 'green' : 'yellow') : 'red';
  return (
    <tr>
      <td style={s.td}><strong>{label}</strong></td>
      <td style={{ ...s.td, ...s.mono }}>{bishop.toFixed(3)}</td>
      <td style={{ ...s.td, ...s.mono }}>{spencer.toFixed(3)}</td>
      <td style={{ ...s.td, ...s.mono }}>{mp.toFixed(3)}</td>
      <td style={{ ...s.td, ...s.mono, fontWeight: 700 }}>{fos.toFixed(3)}</td>
      <td style={{ ...s.td, ...s.mono }}>{minFOS.toFixed(1)}</td>
      <td style={s.td}><span style={s.badge(color)}>{pass ? '✅ PASS' : '❌ FAIL'}</span></td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function BenchConsolidationPanel({ structureId }: Props) {
  const [tab, setTab] = useState<Tab>('design');

  // Design params
  const [H, setH] = useState(15);
  const [W, setW] = useState(8);
  const [alpha, setAlpha] = useState(65);
  const [N, setN] = useState(4);

  // Soil params (editable)
  const [soil, setSoil] = useState<BenchSoilParams>(DEFAULT_BENCH_SOIL);

  // Results
  const [result, setResult] = useState<ConsolidationResult | null>(null);
  const [dgmResult, setDgmResult] = useState<DGMEvolutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConsolidationResult[]>([]);

  // Computed
  const interRamp = useMemo(() => computeInterRampAngle(H, W, alpha, N), [H, W, alpha, N]);
  const catchment = useMemo(() => assessCatchment(H, W), [H, W]);

  // Run analysis
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyzeConsolidation(H, W, alpha, N, soil);
      setResult(r);
      setHistory(prev => [r, ...prev].slice(0, 20));
      setTab('dac');
    } finally { setLoading(false); }
  }, [H, W, alpha, N, soil]);

  // Run DGM
  const runDGM = useCallback(async () => {
    setLoading(true);
    try {
      const constraints: DGMConstraints = {
        hRange: [8, 25], wRange: [5, 15], alphaRange: [50, 80], nRange: [2, 8],
        minFOS: 1.3, targetFOS: 1.5,
      };
      const dgm = await dgmOptimizeBenchDesign(soil, constraints, 60, 80, Date.now() % 10000);
      setDgmResult(dgm);
      setResult(dgm.bestDesign);
      // Apply best design params
      const best = dgm.bestDesign.design;
      setH(Math.round(best.benchHeight * 10) / 10);
      setW(Math.round(best.bermWidth * 10) / 10);
      setAlpha(Math.round(best.faceAngle * 10) / 10);
      setN(best.numBenches);
      setTab('dgm');
    } finally { setLoading(false); }
  }, [soil]);

  return (
    <div style={s.container} className="shms-animate-slide-in">
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>🏗️ Consolidação de Bancadas</div>
          <div style={s.subtitle}>SOTA — DGM Evolutionary × DAC Read & Stacey 2009 × Modified Ritchie</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={s.btn} onClick={runAnalysis} disabled={loading}>
            {loading ? '⏳' : '▶'} Analisar
          </button>
          <button style={s.btnAccent} onClick={runDGM} disabled={loading}>
            {loading ? '⏳ Evoluindo...' : '🧬 DGM Otimizar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'design' && (
        <div style={s.grid2}>
          {/* Left: Sliders */}
          <div style={s.card}>
            <div style={s.cardTitle}>📐 Parâmetros da Bancada</div>

            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>Altura (H)</span>
              <span style={s.sliderValue}>{H.toFixed(1)} m</span>
            </div>
            <input type="range" min="5" max="30" step="0.5" value={H} onChange={e => setH(+e.target.value)} style={s.slider} />

            <div style={{ ...s.sliderRow, marginTop: '12px' }}>
              <span style={s.sliderLabel}>Berma (W)</span>
              <span style={s.sliderValue}>{W.toFixed(1)} m</span>
            </div>
            <input type="range" min="3" max="20" step="0.5" value={W} onChange={e => setW(+e.target.value)} style={s.slider} />

            <div style={{ ...s.sliderRow, marginTop: '12px' }}>
              <span style={s.sliderLabel}>Ângulo de Face (α)</span>
              <span style={s.sliderValue}>{alpha.toFixed(0)}°</span>
            </div>
            <input type="range" min="40" max="85" step="1" value={alpha} onChange={e => setAlpha(+e.target.value)} style={s.slider} />

            <div style={{ ...s.sliderRow, marginTop: '12px' }}>
              <span style={s.sliderLabel}>Nº de Bancadas (N)</span>
              <span style={s.sliderValue}>{N}</span>
            </div>
            <input type="range" min="2" max="10" step="1" value={N} onChange={e => setN(+e.target.value)} style={s.slider} />

            {/* Computed values */}
            <div style={{ marginTop: '16px', padding: '12px', background: 'var(--shms-bg-2)', borderRadius: 'var(--shms-radius-sm)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><span style={s.sliderLabel}>Ângulo Inter-Rampa</span><div style={{ ...s.mono, fontWeight: 700, color: 'var(--shms-accent)' }}>{interRamp.toFixed(1)}°</div></div>
              <div><span style={s.sliderLabel}>Altura Total</span><div style={{ ...s.mono, fontWeight: 700 }}>{(N * H).toFixed(1)} m</div></div>
              <div>
                <span style={s.sliderLabel}>Catchment (Ritchie)</span>
                <div style={{ ...s.mono, fontWeight: 700, color: catchment.adequate ? 'var(--shms-green)' : 'var(--shms-red)' }}>
                  {catchment.adequate ? '✅' : '❌'} {W.toFixed(1)} / {catchment.requiredWidth.toFixed(1)} m
                </div>
              </div>
              <div><span style={s.sliderLabel}>Spill Radius</span><div style={s.mono}>{catchment.spillRadius.toFixed(1)} m</div></div>
            </div>

            {/* Soil */}
            <div style={{ marginTop: '16px' }}>
              <div style={s.cardTitle}>🪨 Solo</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: 'var(--shms-fs-xs)' }}>
                <div><span style={s.sliderLabel}>c' (kPa)</span><input type="number" value={soil.cohesion} onChange={e => setSoil({ ...soil, cohesion: +e.target.value })} style={{ width: '100%', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '4px', padding: '4px', color: 'var(--shms-text)', fontSize: '12px' }} /></div>
                <div><span style={s.sliderLabel}>φ' (°)</span><input type="number" value={soil.frictionAngle} onChange={e => setSoil({ ...soil, frictionAngle: +e.target.value })} style={{ width: '100%', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '4px', padding: '4px', color: 'var(--shms-text)', fontSize: '12px' }} /></div>
                <div><span style={s.sliderLabel}>γ (kN/m³)</span><input type="number" value={soil.unitWeight} onChange={e => setSoil({ ...soil, unitWeight: +e.target.value })} style={{ width: '100%', background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: '4px', padding: '4px', color: 'var(--shms-text)', fontSize: '12px' }} /></div>
              </div>
            </div>
          </div>

          {/* Right: SVG Preview */}
          <div style={s.card}>
            <div style={s.cardTitle}>📊 Perfil da Consolidação</div>
            <BenchProfileSVG H={H} W={W} alpha={alpha} N={N} />
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: 'var(--shms-fs-xs)' }}>
              <div style={{ padding: '8px', background: 'var(--shms-bg-2)', borderRadius: '4px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Escala Bancada</div>
                <div style={{ ...s.mono, fontSize: '14px', fontWeight: 700 }}>1 × {H}m</div>
                <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)' }}>FOS ≥ 1.1</div>
              </div>
              <div style={{ padding: '8px', background: 'var(--shms-bg-2)', borderRadius: '4px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Escala Inter-Rampa</div>
                <div style={{ ...s.mono, fontSize: '14px', fontWeight: 700 }}>{N} × {H}m</div>
                <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)' }}>FOS ≥ 1.2</div>
              </div>
              <div style={{ padding: '8px', background: 'var(--shms-bg-2)', borderRadius: '4px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Escala Global</div>
                <div style={{ ...s.mono, fontSize: '14px', fontWeight: 700 }}>{(N * H).toFixed(0)}m total</div>
                <div style={{ fontSize: '9px', color: 'var(--shms-text-dim)' }}>FOS ≥ 1.3</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'dac' && result && (
        <div>
          <div style={s.card}>
            <div style={s.cardTitle}>⚖️ DAC — Design Acceptance Criteria (Read & Stacey 2009)</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Escala</th>
                  <th style={s.th}>Bishop</th>
                  <th style={s.th}>Spencer</th>
                  <th style={s.th}>M-P</th>
                  <th style={s.th}>FOS (min)</th>
                  <th style={s.th}>DAC Min</th>
                  <th style={s.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.dac.map(d => (
                  <DACRow
                    key={d.scale}
                    label={d.scale === 'bench' ? 'Bancada' : d.scale === 'inter-ramp' ? 'Inter-Rampa' : 'Global'}
                    fos={d.fos} minFOS={d.minFOS}
                    bishop={d.fosBishop} spencer={d.fosSpencer} mp={d.fosMorgensternPrice}
                  />
                ))}
              </tbody>
            </table>

            {/* Overall verdict */}
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: 'var(--shms-radius-sm)', background: result.overallPass ? 'var(--shms-green-bg)' : 'var(--shms-red-bg)', border: `1px solid ${result.overallPass ? 'var(--shms-green-border)' : 'var(--shms-red-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, color: result.overallPass ? 'var(--shms-green)' : 'var(--shms-red)' }}>
                  {result.overallPass ? '✅ DESIGN APROVADO' : '❌ DESIGN REPROVADO'}
                </div>
                <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)' }}>
                  DAC {result.dac.every(d => d.pass) ? 'satisfeito' : 'não satisfeito'} • Catchment {result.catchment.adequate ? 'adequado' : 'inadequado'}
                </div>
              </div>
              <div style={s.mono}>Volume: {result.volume.toFixed(0)} m³/m</div>
            </div>
          </div>

          {/* Catchment */}
          <div style={{ ...s.card, marginTop: 'var(--shms-sp-4)' }}>
            <div style={s.cardTitle}>🛡️ Catchment — Modified Ritchie (Call & Savely 1990)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Berma Atual</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700 }}>{result.catchment.bermWidth.toFixed(1)}m</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Mínimo Ritchie</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700, color: result.catchment.adequate ? 'var(--shms-green)' : 'var(--shms-red)' }}>{result.catchment.requiredWidth.toFixed(1)}m</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Spill Radius</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700 }}>{result.catchment.spillRadius.toFixed(1)}m</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Retenção</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700, color: result.catchment.retentionCapacity >= 100 ? 'var(--shms-green)' : 'var(--shms-yellow)' }}>{result.catchment.retentionCapacity.toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'dac' && !result && (
        <div className="shms-empty" style={{ height: 300 }}>
          <div style={{ fontSize: '32px' }}>⚖️</div>
          <div>Clique em <strong>"Analisar"</strong> para rodar a análise DAC 3 escalas</div>
        </div>
      )}

      {tab === 'dgm' && dgmResult && (
        <div>
          <div style={s.card}>
            <div style={s.cardTitle}>🧬 DGM — Darwin Golden Machine — Resultado Evolutivo</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Gerações</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700 }}>{dgmResult.generations}</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Tempo</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700 }}>{(dgmResult.elapsedMs / 1000).toFixed(1)}s</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Pareto Front</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700, color: 'var(--shms-accent)' }}>{dgmResult.paretoFront.length}</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--shms-bg-2)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={s.sliderLabel}>Best FOS</div>
                <div style={{ ...s.mono, fontSize: '18px', fontWeight: 700, color: 'var(--shms-green)' }}>
                  {Math.min(...dgmResult.bestDesign.dac.map(d => d.fos)).toFixed(3)}
                </div>
              </div>
            </div>

            {/* Best design */}
            <div style={{ padding: '12px', background: 'var(--shms-accent-bg)', borderRadius: 'var(--shms-radius-sm)', border: '1px solid var(--shms-accent-border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--shms-accent)', marginBottom: '8px' }}>🏆 Design Ótimo Evoluído</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', ...s.mono }}>
                <div>H = {dgmResult.bestDesign.design.benchHeight.toFixed(1)}m</div>
                <div>W = {dgmResult.bestDesign.design.bermWidth.toFixed(1)}m</div>
                <div>α = {dgmResult.bestDesign.design.faceAngle.toFixed(0)}°</div>
                <div>N = {dgmResult.bestDesign.design.numBenches}</div>
                <div>θ_ir = {dgmResult.bestDesign.design.interRampAngle.toFixed(1)}°</div>
              </div>
            </div>

            {/* Convergence (text-based since no Recharts dependency) */}
            <div style={{ marginTop: '16px' }}>
              <div style={s.cardTitle}>📈 Convergência</div>
              <svg viewBox="0 0 400 120" style={{ width: '100%', height: 120, background: 'oklch(8% 0.01 230)', borderRadius: 'var(--shms-radius-sm)' }}>
                {dgmResult.convergenceHistory.length > 1 && (() => {
                  const pts = dgmResult.convergenceHistory;
                  const maxFit = Math.max(...pts.map(p => p.bestFitness), 1);
                  const xScale = 390 / pts.length;
                  const yScale = 100 / maxFit;
                  const bestLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(5 + i * xScale).toFixed(1)},${(110 - p.bestFitness * yScale).toFixed(1)}`).join(' ');
                  const avgLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(5 + i * xScale).toFixed(1)},${(110 - p.avgFitness * yScale).toFixed(1)}`).join(' ');
                  return (
                    <>
                      <path d={avgLine} fill="none" stroke="oklch(50% 0.1 230)" strokeWidth="1" opacity="0.5" />
                      <path d={bestLine} fill="none" stroke="oklch(68% 0.16 240)" strokeWidth="2" />
                      <text x="5" y="10" fontSize="8" fill="var(--shms-text-dim)" fontFamily="var(--shms-font-mono)">Best Fitness</text>
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      )}

      {tab === 'dgm' && !dgmResult && (
        <div className="shms-empty" style={{ height: 300 }}>
          <div style={{ fontSize: '32px' }}>🧬</div>
          <div>Clique em <strong>"DGM Otimizar"</strong> para evoluir o design ótimo</div>
          <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>60 organismos × 80 gerações | Tournament + BLX-α + Gaussian mutation</div>
        </div>
      )}

      {tab === 'audit' && (
        <div style={s.card}>
          <div style={s.cardTitle}>🔐 Audit Trail — Hash Criptográfico</div>
          {history.length === 0 ? (
            <div className="shms-empty" style={{ height: 200 }}>
              <div>Nenhuma análise registrada. Execute uma análise primeiro.</div>
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>#</th>
                  <th style={s.th}>Timestamp</th>
                  <th style={s.th}>H×N</th>
                  <th style={s.th}>W</th>
                  <th style={s.th}>α</th>
                  <th style={s.th}>θ_ir</th>
                  <th style={s.th}>FOS min</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => {
                  const minFOS = Math.min(...r.dac.map(d => d.fos));
                  return (
                    <tr key={i}>
                      <td style={s.td}>{i + 1}</td>
                      <td style={{ ...s.td, ...s.mono, fontSize: '10px' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                      <td style={{ ...s.td, ...s.mono }}>{r.design.benchHeight.toFixed(0)}×{r.design.numBenches}</td>
                      <td style={{ ...s.td, ...s.mono }}>{r.design.bermWidth.toFixed(1)}</td>
                      <td style={{ ...s.td, ...s.mono }}>{r.design.faceAngle.toFixed(0)}°</td>
                      <td style={{ ...s.td, ...s.mono }}>{r.design.interRampAngle.toFixed(1)}°</td>
                      <td style={{ ...s.td, ...s.mono, fontWeight: 700 }}>{minFOS.toFixed(3)}</td>
                      <td style={s.td}><span style={s.badge(r.overallPass ? 'green' : 'red')}>{r.overallPass ? 'OK' : 'FAIL'}</span></td>
                      <td style={{ ...s.td, ...s.mono, fontSize: '9px', color: 'var(--shms-text-dim)' }} title={r.hash}>{r.hash.substring(0, 16)}…</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
