/**
 * StabilityPanel.tsx — Integrated Structural Analysis Module
 *
 * Complete rewrite of the 42-line placeholder. 6-tab interface:
 *   1. Slope Geometry & Classic Examples
 *   2. Stability Methods (Bishop/Spencer/Morgenstern-Price)
 *   3. FEM Analysis (c-φ Reduction)
 *   4. GA/PSO Optimization
 *   5. Reliability (Monte Carlo + FORM + Scenarios)
 *   6. Reports (ICOLD/GISTM/ANCOLD/ANM-BR/CDA/USACE)
 *
 * Scientific basis: see SlopeStabilityEngine.ts, ReliabilityEngine.ts
 */
import { useState, useMemo, useCallback } from 'react';
import {
  bishopSimplified, spencerMethod, morgensternPrice, femCPhiReduction,
  gaOptimize, psoOptimize,
  type SlopeProfile, type SlipCircle, type StabilityResult, type FEMResult,
  type GAResult, type PSOResult,
} from './SlopeStabilityEngine';
import { CLASSIC_EXAMPLES, EXAMPLES_BY_CATEGORY, type ClassicExample } from './ClassicExamples';
import {
  monteCarloSimulation, formAnalysis, scenarioAnalysis, extractDistributions,
  classifyReliability, classifyFOS, STANDARD_SCENARIOS,
  type MonteCarloResult, type FORMResult, type ScenarioResult,
} from './ReliabilityEngine';
import {
  generateReport, reportToText, AVAILABLE_STANDARDS, type ReportStandard,
} from './StabilityReportEngine';

type Tab = 'geometry' | 'stability' | 'fem' | 'optimization' | 'reliability' | 'reports';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'geometry', label: 'Geometria', icon: '⛰️' },
  { id: 'stability', label: 'Estabilidade', icon: '📐' },
  { id: 'fem', label: 'FEM', icon: '🔬' },
  { id: 'optimization', label: 'GA/PSO', icon: '🧬' },
  { id: 'reliability', label: 'Confiabilidade', icon: '🎲' },
  { id: 'reports', label: 'Relatórios', icon: '📋' },
];

export default function StabilityPanel({ structureId }: { structureId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('geometry');
  const [selectedExample, setSelectedExample] = useState<ClassicExample>(CLASSIC_EXAMPLES[0]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // ─── Analysis State ──────────────────────────────────────────────────
  const [bishopResult, setBishopResult] = useState<StabilityResult | null>(null);
  const [spencerResult, setSpencerResult] = useState<StabilityResult | null>(null);
  const [mpResult, setMpResult] = useState<StabilityResult | null>(null);
  const [femResult, setFemResult] = useState<FEMResult | null>(null);
  const [gaResult, setGaResult] = useState<GAResult | null>(null);
  const [psoResult, setPsoResult] = useState<PSOResult | null>(null);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [formResult, setFormResult] = useState<FORMResult | null>(null);
  const [scenarioResults, setScenarioResults] = useState<ScenarioResult[] | null>(null);
  const [reportText, setReportText] = useState<string>('');
  const [selectedStandard, setSelectedStandard] = useState<ReportStandard>('ICOLD');
  const [computing, setComputing] = useState(false);

  // ─── Slip Circle (uses published critical circle when available) ─────
  const defaultCircle = useMemo<SlipCircle>(() => {
    // Use published critical circle from benchmark if available
    if (selectedExample.criticalCircle) {
      return selectedExample.criticalCircle;
    }
    // Fallback: auto-generate
    const pts = selectedExample.profile.surfacePoints;
    const yMin = Math.min(...pts.map(p => p.y));
    const yMax = Math.max(...pts.map(p => p.y));
    const H = yMax - yMin;
    const crest = pts.reduce((best, p) => p.y > best.y ? p : best, pts[0]);
    return {
      center: { x: crest.x - H * 0.3, y: yMax + H * 0.3 },
      radius: H * 0.7,
    };
  }, [selectedExample]);

  // ─── Filtered Examples ──────────────────────────────────────────────
  const filteredExamples = useMemo(() =>
    categoryFilter === 'all' ? CLASSIC_EXAMPLES : CLASSIC_EXAMPLES.filter(e => e.category === categoryFilter),
    [categoryFilter]
  );

  // ─── Run All Stability Analyses ─────────────────────────────────────
  const runStability = useCallback(() => {
    setComputing(true);
    setTimeout(() => {
      const profile = selectedExample.profile;
      const circle = defaultCircle;
      setBishopResult(bishopSimplified(profile, circle, 20, 100, 0.001));
      setSpencerResult(spencerMethod(profile, circle, 20, 150, 0.001));
      setMpResult(morgensternPrice(profile, circle, 'half-sine', 20, 200, 0.001));
      setComputing(false);
      setActiveTab('stability');
    }, 50);
  }, [selectedExample, defaultCircle]);

  const runFEM = useCallback(() => {
    setComputing(true);
    setTimeout(() => {
      setFemResult(femCPhiReduction(selectedExample.profile, 12));
      setComputing(false);
      setActiveTab('fem');
    }, 50);
  }, [selectedExample]);

  const runOptimization = useCallback(() => {
    setComputing(true);
    setTimeout(() => {
      setGaResult(gaOptimize(selectedExample.profile, { generations: 80, populationSize: 50 }));
      setPsoResult(psoOptimize(selectedExample.profile, { iterations: 60, particleCount: 30 }));
      setComputing(false);
      setActiveTab('optimization');
    }, 50);
  }, [selectedExample]);

  const runReliability = useCallback(() => {
    setComputing(true);
    setTimeout(() => {
      const dists = extractDistributions(selectedExample.profile);
      if (dists.length > 0) {
        setMcResult(monteCarloSimulation(selectedExample.profile, defaultCircle, dists, { iterations: 5000, samplingMethod: 'lhs' }));
        setFormResult(formAnalysis(selectedExample.profile, defaultCircle, dists, 30));
      }
      setScenarioResults(scenarioAnalysis(selectedExample.profile, defaultCircle));
      setComputing(false);
      setActiveTab('reliability');
    }, 50);
  }, [selectedExample, defaultCircle]);

  const generateReportAction = useCallback(() => {
    const report = generateReport({
      structureName: selectedExample.name, structureId, analyst: 'MOTHER AI', date: new Date().toISOString().split('T')[0],
      standard: selectedStandard,
      stability: { bishop: bishopResult ?? undefined, spencer: spencerResult ?? undefined, morgensternPrice: mpResult ?? undefined },
      fem: femResult ?? undefined, optimization: { ga: gaResult ?? undefined, pso: psoResult ?? undefined },
      reliability: { monteCarlo: mcResult ?? undefined, form: formResult ?? undefined },
      scenarios: scenarioResults ?? undefined, exampleId: selectedExample.id, dgmHash: `DGM-${Date.now().toString(16)}`,
    });
    setReportText(reportToText(report));
    setActiveTab('reports');
  }, [selectedExample, structureId, selectedStandard, bishopResult, spencerResult, mpResult, femResult, gaResult, psoResult, mcResult, formResult, scenarioResults]);

  const runAll = useCallback(() => {
    setComputing(true);
    setTimeout(() => {
      const profile = selectedExample.profile;
      const circle = defaultCircle;
      setBishopResult(bishopSimplified(profile, circle, 20, 100, 0.001));
      setSpencerResult(spencerMethod(profile, circle, 20, 150, 0.001));
      setMpResult(morgensternPrice(profile, circle, 'half-sine', 20, 200, 0.001));
      setFemResult(femCPhiReduction(profile, 12));
      setGaResult(gaOptimize(profile, { generations: 60, populationSize: 40 }));
      setPsoResult(psoOptimize(profile, { iterations: 50, particleCount: 25 }));
      const dists = extractDistributions(profile);
      if (dists.length > 0) {
        setMcResult(monteCarloSimulation(profile, circle, dists, { iterations: 3000, samplingMethod: 'lhs' }));
        setFormResult(formAnalysis(profile, circle, dists, 20));
      }
      setScenarioResults(scenarioAnalysis(profile, circle));
      setComputing(false);
    }, 100);
  }, [selectedExample, defaultCircle]);

  // ─── SVG Profile Visualization ──────────────────────────────────────
  // Uses data-space coordinates with Y-flip transform so geometry renders correctly
  const renderProfileSVG = () => {
    const profile = selectedExample.profile;
    const allPts = [
      ...profile.surfacePoints,
      ...profile.layers.flatMap(l => l.points),
      ...(profile.waterTable?.points ?? []),
    ];
    const pad = 10;
    const xMin = Math.min(...allPts.map(p => p.x)) - pad;
    const xMax = Math.max(...allPts.map(p => p.x)) + pad;
    const yMin = Math.min(...allPts.map(p => p.y)) - pad;
    const yMax = Math.max(...allPts.map(p => p.y)) + pad * 2;
    const W = xMax - xMin;
    const H = yMax - yMin;

    // SVG viewBox in data-space, Y flipped via transform
    // We use a group with transform="scale(1,-1) translate(0, -yMax-yMin)"
    // so that y increases upward as in geotechnical convention
    const polyPath = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Use published critical circle
    const circleCx = defaultCircle.center.x;
    const circleCy = defaultCircle.center.y;
    const circleR = defaultCircle.radius;

    // Stroke widths proportional to data size
    const sw = Math.max(W, H) * 0.004;
    const swThin = sw * 0.6;
    const fontSize = Math.max(W, H) * 0.025;

    return (
      <svg
        width="100%"
        viewBox={`${xMin} ${yMin} ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          background: 'var(--shms-bg-card)',
          borderRadius: 'var(--shms-radius)',
          border: '1px solid var(--shms-border)',
          maxHeight: 400,
        }}
      >
        {/* Flip Y so y increases upward */}
        <g transform={`scale(1,-1) translate(0,${-(yMin + yMax)})`}>
          {/* Layers — filled polygons */}
          {profile.layers.map(layer => (
            <path
              key={layer.id}
              d={polyPath(layer.points) + 'Z'}
              fill={layer.color}
              fillOpacity={0.35}
              stroke={layer.color}
              strokeWidth={swThin}
              strokeOpacity={0.8}
            />
          ))}

          {/* Water table — dashed blue */}
          {profile.waterTable && (
            <path
              d={polyPath(profile.waterTable.points)}
              fill="none"
              stroke="#4488ff"
              strokeWidth={sw}
              strokeDasharray={`${sw * 3},${sw * 2}`}
            />
          )}

          {/* Surface profile — solid white */}
          <path
            d={polyPath(profile.surfacePoints)}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={sw * 1.2}
            strokeLinejoin="round"
          />

          {/* Slip circle */}
          <circle
            cx={circleCx}
            cy={circleCy}
            r={circleR}
            fill="none"
            stroke="#ef4444"
            strokeWidth={swThin}
            strokeDasharray={`${sw * 2.5},${sw * 1.5}`}
            opacity={0.6}
          />
        </g>

        {/* Labels — NOT flipped (text needs to be right-side up) */}
        {profile.layers.map(layer => {
          const cx = layer.points.reduce((s, p) => s + p.x, 0) / layer.points.length;
          const cy = layer.points.reduce((s, p) => s + p.y, 0) / layer.points.length;
          // Convert to flipped coords: svgY = (yMin + yMax) - cy
          const svgY = (yMin + yMax) - cy;
          return (
            <text
              key={layer.id + '-label'}
              x={cx}
              y={svgY}
              fill={layer.color}
              fontSize={fontSize}
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
              opacity={0.85}
            >
              {layer.name.split('(')[0].trim()}
            </text>
          );
        })}

        {/* Y-axis grid marks (dynamic based on data range) */}
        {(() => {
          const dataYMin = Math.min(...profile.surfacePoints.map(p => p.y));
          const dataYMax = Math.max(...profile.surfacePoints.map(p => p.y));
          const step = Math.max(1, Math.round((dataYMax - dataYMin) / 4));
          const marks: number[] = [];
          for (let y = Math.ceil(dataYMin); y <= dataYMax; y += step) marks.push(y);
          return marks.map(elev => {
            const svgY = (yMin + yMax) - elev;
            return (
              <g key={`elev-${elev}`}>
                <line x1={xMin + 2} y1={svgY} x2={xMax - 2} y2={svgY} stroke="rgba(255,255,255,0.08)" strokeWidth={swThin * 0.3} />
                <text x={xMin + 3} y={svgY + fontSize * 0.35} fill="rgba(255,255,255,0.35)" fontSize={fontSize * 0.65}>
                  y={elev}m
                </text>
              </g>
            );
          });
        })()}
      </svg>
    );
  };

  // ─── Render KPI Card ──────────────────────────────────────────────
  const KPI = ({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) => (
    <div className="shms-card" style={{ padding: 'var(--shms-sp-3)', textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 'var(--shms-fs-xl)', fontWeight: 700, color: color || 'var(--shms-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // ─── Render Histogram SVG ──────────────────────────────────────────
  const renderHistogram = (histogram: MonteCarloResult['histogram'], w = 500, h = 200) => {
    const maxCount = Math.max(...histogram.map(b => b.count), 1);
    const barW = w / histogram.length - 2;
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ background: 'var(--shms-bg-card)', borderRadius: 'var(--shms-radius)' }}>
        {histogram.map((bin, i) => {
          const barH = (bin.count / maxCount) * (h - 30);
          const x = i * (w / histogram.length) + 1;
          const color = bin.binCenter < 1.0 ? '#ef4444' : bin.binCenter < 1.5 ? '#eab308' : '#22c55e';
          return <rect key={i} x={x} y={h - 20 - barH} width={barW} height={barH} fill={color} fillOpacity={0.7} rx={2} />;
        })}
        {/* x-axis labels */}
        {histogram.filter((_, i) => i % 4 === 0).map((bin, i) => (
          <text key={i} x={i * 4 * (w / histogram.length) + barW / 2} y={h - 5} fontSize={9} fill="var(--shms-text-dim)" textAnchor="middle">{bin.binCenter.toFixed(1)}</text>
        ))}
        {/* FOS=1.0 line */}
        {(() => {
          const x1Pos = histogram.findIndex(b => b.binCenter >= 1.0);
          if (x1Pos < 0) return null;
          const xPos = x1Pos * (w / histogram.length);
          return <line x1={xPos} y1={0} x2={xPos} y2={h - 20} stroke="#ef4444" strokeWidth={2} strokeDasharray="4,2" />;
        })()}
      </svg>
    );
  };

  // ─── Convergence Chart SVG ──────────────────────────────────────────
  const renderConvergence = (data: { x: number; y: number }[], w = 500, h = 180, label = 'FOS') => {
    if (data.length === 0) return null;
    const xMax = Math.max(...data.map(d => d.x));
    const yMin = Math.min(...data.map(d => d.y));
    const yMax = Math.max(...data.map(d => d.y));
    const yRange = yMax - yMin || 1;
    const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${(d.x / xMax) * w},${h - 20 - ((d.y - yMin) / yRange) * (h - 40)}`).join(' ');
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ background: 'var(--shms-bg-card)', borderRadius: 'var(--shms-radius)' }}>
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} />
        <text x={5} y={15} fontSize={10} fill="var(--shms-text-dim)">{label} min: {yMin.toFixed(3)}</text>
      </svg>
    );
  };

  return (
    <div className="shms-animate-slide-in">
      {/* Header */}
      <div className="shms-section-header" style={{ marginBottom: 'var(--shms-sp-3)' }}>
        <span className="shms-section-header__title">🏗️ Análise Estrutural Integrada (Bishop/Spencer/FEM/MC)</span>
        <div style={{ display: 'flex', gap: 'var(--shms-sp-2)' }}>
          <button className="shms-btn shms-btn--primary" onClick={runAll} disabled={computing}>
            {computing ? '⏳ Calculando...' : '▶️ Executar Todos'}
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--shms-sp-3)', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`shms-btn ${activeTab === tab.id ? 'shms-btn--primary' : ''}`}
            style={{ fontSize: 'var(--shms-fs-sm)', padding: '6px 12px' }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: Geometry & Examples ═══ */}
      {activeTab === 'geometry' && (
        <div>
          {/* Category Filter */}
          <div style={{ display: 'flex', gap: 'var(--shms-sp-2)', marginBottom: 'var(--shms-sp-3)', flexWrap: 'wrap' }}>
            {['all', 'dam', 'tailings', 'natural-slope', 'benchmark', 'cut'].map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className={`shms-btn ${categoryFilter === cat ? 'shms-btn--primary' : ''}`}
                style={{ fontSize: 'var(--shms-fs-sm)', padding: '4px 10px' }}>
                {cat === 'all' ? '📚 Todos' : cat === 'dam' ? '🏛️ Barragens' : cat === 'tailings' ? '⚠️ Rejeitos' : cat === 'natural-slope' ? '🏔️ Taludes' : cat === 'benchmark' ? '🔬 Benchmarks' : '🔨 Cortes'}
                ({(cat === 'all' ? CLASSIC_EXAMPLES : CLASSIC_EXAMPLES.filter(e => e.category === cat)).length})
              </button>
            ))}
          </div>

          {/* Examples Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--shms-sp-3)', marginBottom: 'var(--shms-sp-4)' }}>
            {filteredExamples.map(ex => (
              <div key={ex.id} onClick={() => setSelectedExample(ex)}
                className={`shms-card shms-animate-slide-in ${selectedExample.id === ex.id ? '' : ''}`}
                style={{ cursor: 'pointer', border: selectedExample.id === ex.id ? '2px solid var(--shms-accent)' : '1px solid var(--shms-border)', padding: 'var(--shms-sp-3)' }}>
                <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 4 }}>{ex.name}</div>
                <div style={{ fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-text-dim)', marginBottom: 6 }}>{ex.description}</div>
                <div style={{ display: 'flex', gap: 'var(--shms-sp-2)', flexWrap: 'wrap' }}>
                  <span className={`shms-badge shms-badge--${(ex.expectedFOS.bishop ?? 2) >= 1.5 ? 'green' : (ex.expectedFOS.bishop ?? 2) >= 1.0 ? 'yellow' : 'red'}`}>
                    FOS ≈ {ex.expectedFOS.bishop?.toFixed(2)}
                  </span>
                  <span className="shms-badge">{ex.country}</span>
                  {ex.failureYear && <span className="shms-badge shms-badge--red">Ruptura {ex.failureYear}</span>}
                </div>
                <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 4 }}>{ex.reference.split('.')[0]}</div>
              </div>
            ))}
          </div>

          {/* Selected Example Detail */}
          <div className="shms-card" style={{ padding: 'var(--shms-sp-4)' }}>
            <div style={{ fontSize: 'var(--shms-fs-lg)', fontWeight: 700, marginBottom: 'var(--shms-sp-3)' }}>
              {selectedExample.name}
            </div>
            {renderProfileSVG()}
            <div style={{ marginTop: 'var(--shms-sp-3)' }}>
              <div style={{ fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-text-dim)' }}>{selectedExample.reference}</div>
              <div style={{ fontSize: 'var(--shms-fs-sm)', marginTop: 4 }}>{selectedExample.calibrationNotes}</div>
              {selectedExample.mqttTopics && (
                <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 8 }}>
                  MQTT: {selectedExample.mqttTopics.join(', ')}
                </div>
              )}
            </div>
            {/* Soil Layers Table */}
            <table style={{ width: '100%', marginTop: 'var(--shms-sp-3)', borderCollapse: 'collapse', fontSize: 'var(--shms-fs-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--shms-border)', color: 'var(--shms-text-dim)' }}>
                  <th style={{ padding: 4, textAlign: 'left' }}>Camada</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>c&apos; (kPa)</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>φ&apos; (°)</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>γ (kN/m³)</th>
                  <th style={{ padding: 4, textAlign: 'right' }}>ru</th>
                </tr>
              </thead>
              <tbody>
                {selectedExample.profile.layers.map(layer => (
                  <tr key={layer.id} style={{ borderBottom: '1px solid var(--shms-border)' }}>
                    <td style={{ padding: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, background: layer.color, display: 'inline-block' }} />
                      {layer.name}
                    </td>
                    <td className="mono" style={{ padding: 4, textAlign: 'right' }}>{layer.cohesion}</td>
                    <td className="mono" style={{ padding: 4, textAlign: 'right' }}>{layer.frictionAngle}</td>
                    <td className="mono" style={{ padding: 4, textAlign: 'right' }}>{layer.unitWeight}</td>
                    <td className="mono" style={{ padding: 4, textAlign: 'right' }}>{layer.ru.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 'var(--shms-sp-3)', display: 'flex', gap: 'var(--shms-sp-2)' }}>
              <button className="shms-btn shms-btn--primary" onClick={runStability}>📐 Estabilidade</button>
              <button className="shms-btn" onClick={runFEM}>🔬 FEM</button>
              <button className="shms-btn" onClick={runOptimization}>🧬 GA/PSO</button>
              <button className="shms-btn" onClick={runReliability}>🎲 Monte Carlo</button>
              <button className="shms-btn" onClick={runAll}>▶️ Todos</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB 2: Stability Methods ═══ */}
      {activeTab === 'stability' && (
        <div>
          {!bishopResult ? (
            <div className="shms-empty"><div className="shms-empty__text">Execute a análise de estabilidade primeiro (Tab Geometria → 📐 Estabilidade)</div></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--shms-sp-3)', marginBottom: 'var(--shms-sp-4)' }}>
                <KPI label="Bishop Simplificado" value={bishopResult.factorOfSafety.toFixed(3)} color={classifyFOS(bishopResult.factorOfSafety).color} sub={`${bishopResult.iterations} iter, ${bishopResult.converged ? '✅' : '⚠️'}`} />
                {spencerResult && <KPI label="Spencer" value={spencerResult.factorOfSafety.toFixed(3)} color={classifyFOS(spencerResult.factorOfSafety).color} sub={`θ = ${spencerResult.theta?.toFixed(1) ?? 'N/A'}°`} />}
                {mpResult && <KPI label="Morgenstern-Price" value={mpResult.factorOfSafety.toFixed(3)} color={classifyFOS(mpResult.factorOfSafety).color} sub={mpResult.method} />}
              </div>
              {/* Comparison Table */}
              <div className="shms-card" style={{ padding: 'var(--shms-sp-4)' }}>
                <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 'var(--shms-sp-3)' }}>Comparação de Métodos</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--shms-fs-sm)' }}>
                  <thead><tr style={{ borderBottom: '2px solid var(--shms-border)' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>Método</th><th style={{ textAlign: 'right', padding: 6 }}>FOS</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Convergiu</th><th style={{ textAlign: 'right', padding: 6 }}>Iterações</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Classificação</th>
                  </tr></thead>
                  <tbody>
                    {[bishopResult, spencerResult, mpResult].filter(Boolean).map(r => {
                      const cl = classifyFOS(r!.factorOfSafety);
                      return (
                        <tr key={r!.method} style={{ borderBottom: '1px solid var(--shms-border)' }}>
                          <td style={{ padding: 6 }}>{r!.method}</td>
                          <td className="mono" style={{ padding: 6, textAlign: 'right', color: cl.color, fontWeight: 700 }}>{r!.factorOfSafety.toFixed(4)}</td>
                          <td style={{ padding: 6, textAlign: 'right' }}>{r!.converged ? '✅' : '⚠️'}</td>
                          <td className="mono" style={{ padding: 6, textAlign: 'right' }}>{r!.iterations}</td>
                          <td style={{ padding: 6, textAlign: 'right', color: cl.color }}>{cl.level}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 8 }}>
                  Ref: Bishop (1955), Spencer (1967), Morgenstern & Price (1965). FOS requerido ≥ 1.50 (USACE EM 1110-2-1902)
                </div>
              </div>
              {/* Profile with slip circle */}
              <div className="shms-card" style={{ padding: 'var(--shms-sp-4)', marginTop: 'var(--shms-sp-3)' }}>
                <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 'var(--shms-sp-2)' }}>Seção Transversal + Círculo de Ruptura</div>
                {renderProfileSVG()}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ TAB 3: FEM ═══ */}
      {activeTab === 'fem' && (
        <div>
          {!femResult ? (
            <div className="shms-empty"><div className="shms-empty__text">Execute FEM primeiro (Tab Geometria → 🔬 FEM)</div></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--shms-sp-3)', marginBottom: 'var(--shms-sp-4)' }}>
                <KPI label="SRF (c-φ Reduction)" value={femResult.srf.toFixed(3)} color={classifyFOS(femResult.srf).color} sub={`${femResult.iterations} iter`} />
                <KPI label="Nós da Malha" value={`${femResult.meshNodes.length}`} sub="Triangular" />
                <KPI label="Elementos" value={`${femResult.meshElements.length}`} sub="T3" />
                <KPI label="Convergência" value={femResult.converged ? '✅' : '⚠️'} color={femResult.converged ? '#22c55e' : '#f97316'} />
              </div>
              <div className="shms-card" style={{ padding: 'var(--shms-sp-4)' }}>
                <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 'var(--shms-sp-2)' }}>Malha FEM + Tensão de Von Mises</div>
                <svg width="100%" viewBox={`0 0 600 300`} style={{ background: 'var(--shms-bg-card)', borderRadius: 'var(--shms-radius)' }}>
                  {femResult.meshElements.slice(0, 200).map((el, i) => {
                    const n0 = femResult.meshNodes[el[0]], n1 = femResult.meshNodes[el[1]], n2 = femResult.meshNodes[el[2]];
                    if (!n0 || !n1 || !n2) return null;
                    const s = femResult.stresses[el[0]];
                    const maxVM = Math.max(...femResult.stresses.map(s => s.vonMises), 1);
                    const intensity = Math.min(1, (s?.vonMises ?? 0) / maxVM);
                    const color = `hsl(${(1 - intensity) * 240}, 80%, 50%)`;
                    const xRange = Math.max(...femResult.meshNodes.map(n => n.x)) - Math.min(...femResult.meshNodes.map(n => n.x));
                    const yRange = Math.max(...femResult.meshNodes.map(n => n.y)) - Math.min(...femResult.meshNodes.map(n => n.y));
                    const xMin = Math.min(...femResult.meshNodes.map(n => n.x));
                    const yMin = Math.min(...femResult.meshNodes.map(n => n.y));
                    const sx = (p: { x: number; y: number }) => ({ x: ((p.x - xMin) / xRange) * 570 + 15, y: 285 - ((p.y - yMin) / yRange) * 270 });
                    const p0 = sx(n0), p1 = sx(n1), p2 = sx(n2);
                    return <polygon key={i} points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={color} fillOpacity={0.6} stroke={color} strokeWidth={0.3} />;
                  })}
                </svg>
                <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 8 }}>
                  Ref: Griffiths & Lane (1999) — Shear Strength Reduction. Cores: azul (baixo σ) → vermelho (alto σ)
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ TAB 4: GA/PSO Optimization ═══ */}
      {activeTab === 'optimization' && (
        <div>
          {!gaResult && !psoResult ? (
            <div className="shms-empty"><div className="shms-empty__text">Execute GA/PSO primeiro (Tab Geometria)</div></div>
          ) : (
            <>
              {/* ─── Cross-Section with Slip Surfaces ─── */}
              <div className="shms-card" style={{ padding: '20px 20px 16px' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600, color: '#e6edf3', marginBottom: '16px', letterSpacing: '0.02em' }}>
                  Superfície de Ruptura Crítica
                </div>
                {(() => {
                  const profile = selectedExample.profile;
                  const surfPts = profile.surfacePoints;
                  const allPts = [...surfPts, ...(profile.layers?.flatMap(l => l.points) ?? [])];

                  // Viewbox calculation
                  const dataXMin = Math.min(...allPts.map(p => p.x));
                  const dataXMax = Math.max(...allPts.map(p => p.x));
                  const dataYMin = Math.min(...allPts.map(p => p.y));
                  const dataYMax = Math.max(...allPts.map(p => p.y));
                  const padX = (dataXMax - dataXMin) * 0.08;
                  const padYBot = (dataYMax - dataYMin) * 0.08;
                  const padYTop = (dataYMax - dataYMin) * 0.35; // space for labels
                  const vbX = dataXMin - padX;
                  const vbY = dataYMin - padYBot;
                  const vbW = (dataXMax - dataXMin) + padX * 2;
                  const vbH = (dataYMax - dataYMin) + padYBot + padYTop;
                  const sw = vbW * 0.003;  // base stroke width
                  const fSize = vbW * 0.022;

                  // Grid step (auto: snap to 5 or 10)
                  const rawStep = (dataXMax - dataXMin) / 8;
                  const gridStep = rawStep > 7 ? 10 : 5;

                  const polyPath = (pts2: { x: number; y: number }[]) =>
                    pts2.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

                  // ── Circle-surface intersection ──
                  function circleIntersect(cx: number, cy: number, r: number) {
                    const hits: { x: number; y: number }[] = [];
                    for (let i = 0; i < surfPts.length - 1; i++) {
                      const p1 = surfPts[i], p2 = surfPts[i + 1];
                      const dx = p2.x - p1.x, dy = p2.y - p1.y;
                      const fx = p1.x - cx, fy = p1.y - cy;
                      const a = dx * dx + dy * dy;
                      const b = 2 * (fx * dx + fy * dy);
                      const c2 = fx * fx + fy * fy - r * r;
                      let disc = b * b - 4 * a * c2;
                      if (disc < 0) continue;
                      disc = Math.sqrt(disc);
                      for (const sign of [-1, 1]) {
                        const t = (-b + sign * disc) / (2 * a);
                        if (t >= -0.001 && t <= 1.001) {
                          hits.push({ x: p1.x + t * dx, y: p1.y + t * dy });
                        }
                      }
                    }
                    hits.sort((a2, b2) => a2.x - b2.x);
                    const unique: { x: number; y: number }[] = [];
                    for (const h of hits) {
                      if (!unique.length || Math.hypot(h.x - unique[unique.length - 1].x, h.y - unique[unique.length - 1].y) > 0.05) {
                        unique.push(h);
                      }
                    }
                    return unique;
                  }

                  // ── Build slip arc (only the arc inside soil body) ──
                  // ── Build slip arc (polyline through soil body) ──
                   function buildSlipArc(cx: number, cy: number, r: number) {
                     const hits = circleIntersect(cx, cy, r);
                     if (hits.length < 2) return null;
                     const entry = hits[0], exit = hits[hits.length - 1];

                     // Compute angles for entry and exit on the circle
                     const a1 = Math.atan2(entry.y - cy, entry.x - cx);
                     const a2 = Math.atan2(exit.y - cy, exit.x - cx);

                     // Determine which arc direction goes BELOW the surface (through soil)
                     // Test: sample midpoint of each candidate arc direction
                     const testMidCW = a1 + (a2 - a1 - 2 * Math.PI) / 2;
                     const testMidCCW = a1 + (a2 - a1 + 2 * Math.PI) / 2;
                     const midYCW = cy + r * Math.sin(testMidCW);
                     const midYCCW = cy + r * Math.sin(testMidCCW);
                     // The arc going to lower Y passes through the soil
                     const goLowerAngle = midYCW < midYCCW;

                     // Generate polyline (120 points) along the correct arc direction
                     const N = 120;
                     const arcPts: { x: number; y: number }[] = [entry];
                     if (goLowerAngle) {
                       let start = a1, end = a2;
                       while (end > start) end -= 2 * Math.PI;
                       for (let i = 1; i < N; i++) {
                         const ang = start + (i / N) * (end - start);
                         arcPts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
                       }
                     } else {
                       let start = a1, end = a2;
                       while (end < start) end += 2 * Math.PI;
                       for (let i = 1; i < N; i++) {
                         const ang = start + (i / N) * (end - start);
                         arcPts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
                       }
                     }
                     arcPts.push(exit);

                     // Arc as SVG polyline path
                     const arcD = arcPts.map((p, i) =>
                       `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`
                     ).join(' ');

                     // Failure mass fill: arc polyline + surface segments reversed
                     const surfSeg: { x: number; y: number }[] = [];
                     let started = false;
                     for (const pt of surfPts) {
                       if (!started && pt.x >= entry.x - 0.1) { surfSeg.push(entry); started = true; }
                       if (started) {
                         if (pt.x > exit.x + 0.1) { surfSeg.push(exit); break; }
                         surfSeg.push(pt);
                       }
                     }
                     if (surfSeg.length > 0 && surfSeg[surfSeg.length - 1].x < exit.x - 0.1) surfSeg.push(exit);
                     const surfBack = [...surfSeg].reverse().map(p => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
                     const fillD = `${arcD} ${surfBack} Z`;

                     return { arcD, fillD, entry, exit };
                   }

                  // ── Collect results ──
                  type SlipData = { cx: number; cy: number; r: number; fos: number; color: string; id: string; label: string; arc: ReturnType<typeof buildSlipArc> };
                  const slips: SlipData[] = [];

                  if (gaResult && gaResult.bestFOS > 0 && gaResult.bestFOS < 100) {
                    const c = gaResult.bestCircle;
                    slips.push({
                      cx: c.center.x, cy: c.center.y, r: c.radius,
                      fos: gaResult.bestFOS, color: '#58a6ff', id: 'ga',
                      label: `GA  FOS = ${gaResult.bestFOS.toFixed(3)}`,
                      arc: buildSlipArc(c.center.x, c.center.y, c.radius),
                    });
                  }
                  if (psoResult && psoResult.bestFOS > 0 && psoResult.bestFOS < 100) {
                    const c = psoResult.bestCircle;
                    slips.push({
                      cx: c.center.x, cy: c.center.y, r: c.radius,
                      fos: psoResult.bestFOS, color: '#79c0ff', id: 'pso',
                      label: `PSO FOS = ${psoResult.bestFOS.toFixed(3)}`,
                      arc: buildSlipArc(c.center.x, c.center.y, c.radius),
                    });
                  }
                  if (selectedExample.criticalCircle) {
                    const c = selectedExample.criticalCircle;
                    slips.push({
                      cx: c.center.x, cy: c.center.y, r: c.radius,
                      fos: selectedExample.expectedFOS.bishop ?? 0, color: '#f85149', id: 'ref',
                      label: `Ref  FOS = ${(selectedExample.expectedFOS.bishop ?? 0).toFixed(3)}`,
                      arc: buildSlipArc(c.center.x, c.center.y, c.radius),
                    });
                  }

                  // Soil body clip polygon - extend below for full arc
                  const clipPoly = [...surfPts];
                  const baseY = dataYMin - (dataYMax - dataYMin) * 0.5;
                  clipPoly.push({ x: surfPts[surfPts.length - 1].x + 5, y: surfPts[surfPts.length - 1].y });
                  clipPoly.push({ x: surfPts[surfPts.length - 1].x + 5, y: baseY });
                  clipPoly.push({ x: surfPts[0].x - 5, y: baseY });
                  clipPoly.push({ x: surfPts[0].x - 5, y: surfPts[0].y });

                  return (
                    <svg
                      width="100%"
                      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                      preserveAspectRatio="xMidYMid meet"
                      style={{ borderRadius: '8px', border: '1px solid #30363d', maxHeight: 420 }}
                    >
                      <defs>
                        {/* Clip to soil body */}
                        <clipPath id="soil-clip">
                          <polygon points={clipPoly.map(p => `${p.x},${p.y}`).join(' ')} />
                        </clipPath>
                        {/* Hatch pattern for soil layers */}
                        <pattern id="soil-hatch" width={vbW * 0.012} height={vbW * 0.012} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                          <line x1="0" y1="0" x2="0" y2={vbW * 0.012} stroke="#8b949e" strokeWidth={sw * 0.3} strokeOpacity="0.15" />
                        </pattern>
                      </defs>

                      <g transform={`scale(1,-1) translate(0,${-(vbY * 2 + vbH)})`}>
                        {/* Grid */}
                        {(() => {
                          const lines: React.ReactElement[] = [];
                          const x0 = Math.ceil(dataXMin / gridStep) * gridStep;
                          const y0 = Math.ceil(dataYMin / gridStep) * gridStep;
                          for (let gx = x0; gx <= dataXMax; gx += gridStep) {
                            lines.push(
                              <line key={`gx${gx}`} x1={gx} y1={dataYMin} x2={gx} y2={dataYMax + padYTop * 0.3} stroke="#30363d" strokeWidth={sw * 0.3} strokeOpacity={0.4} strokeDasharray={`${sw},${sw * 2}`} />,
                              <g key={`lx${gx}`} transform={`translate(${gx},${dataYMin - fSize * 0.6}) scale(1,-1)`}>
                                <text x={0} y={0} fill="#484f58" fontSize={fSize * 0.7} textAnchor="middle" fontFamily="Inter, sans-serif">{gx}</text>
                              </g>
                            );
                          }
                          for (let gy = y0; gy <= dataYMax; gy += gridStep) {
                            lines.push(
                              <line key={`gy${gy}`} x1={dataXMin} y1={gy} x2={dataXMax} y2={gy} stroke="#30363d" strokeWidth={sw * 0.3} strokeOpacity={0.4} strokeDasharray={`${sw},${sw * 2}`} />,
                              <g key={`ly${gy}`} transform={`translate(${dataXMin - fSize * 0.4},${gy}) scale(1,-1)`}>
                                <text x={0} y={0} fill="#484f58" fontSize={fSize * 0.7} textAnchor="end" fontFamily="Inter, sans-serif">{gy}</text>
                              </g>
                            );
                          }
                          return lines;
                        })()}

                        {/* Soil layers — hatch fill */}
                        {profile.layers.map(layer => (
                          <path
                            key={layer.id}
                            d={polyPath(layer.points) + ' Z'}
                            fill="url(#soil-hatch)"
                            stroke="#8b949e"
                            strokeWidth={sw * 0.4}
                            strokeOpacity={0.3}
                          />
                        ))}

                        {/* Surface profile — clean white line */}
                        <path
                          d={polyPath(surfPts)}
                          fill="none"
                          stroke="#e6edf3"
                          strokeWidth={sw * 1.2}
                          strokeLinejoin="round"
                        />

                        {/* Slip arcs — CLIPPED to soil body */}
                        <g clipPath="url(#soil-clip)">
                          {slips.map(s => s.arc && (
                            <g key={s.id}>
                              {/* Shaded failure mass */}
                              <path d={s.arc.fillD} fill={s.color} fillOpacity={0.06} stroke="none" />
                              {/* The slip arc */}
                              <path
                                d={s.arc.arcD}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={sw * 2}
                                strokeLinecap="round"
                                strokeDasharray={s.id === 'ref' ? `${sw * 3},${sw * 2}` : 'none'}
                              />
                            </g>
                          ))}
                        </g>

                        {/* Entry/exit markers — outside clip */}
                        {slips.map(s => s.arc && (
                          <g key={`pts-${s.id}`}>
                            <circle cx={s.arc.entry.x} cy={s.arc.entry.y} r={sw * 1.5} fill={s.color} fillOpacity={0.8} />
                            <circle cx={s.arc.exit.x} cy={s.arc.exit.y} r={sw * 1.5} fill={s.color} fillOpacity={0.8} />
                          </g>
                        ))}

                        {/* FOS labels — positioned above geometry */}
                        {slips.map((s, i) => {
                          if (!s.arc) return null;
                          const lx = (s.arc.entry.x + s.arc.exit.x) / 2;
                          const ly = dataYMax + padYTop * (0.15 + i * 0.22);
                          return (
                            <g key={`label-${s.id}`} transform={`translate(${lx},${ly}) scale(1,-1)`}>
                              {/* Pill background */}
                              <rect
                                x={-fSize * 4.5} y={-fSize * 0.7}
                                width={fSize * 9} height={fSize * 1.4}
                                rx={fSize * 0.3}
                                fill="#161b22" fillOpacity={0.9}
                                stroke={s.color} strokeWidth={sw * 0.4} strokeOpacity={0.4}
                              />
                              <text
                                x={0} y={fSize * 0.35}
                                fill={s.color}
                                fontSize={fSize * 0.85}
                                fontWeight="500"
                                textAnchor="middle"
                                fontFamily="'JetBrains Mono', monospace"
                              >
                                {s.label}
                              </text>
                              {/* Leader line */}
                              <line
                                x1={0} y1={fSize * 0.7}
                                x2={0} y2={fSize * 0.7 + (ly - dataYMax) * 0.3}
                                stroke={s.color} strokeWidth={sw * 0.3} strokeOpacity={0.3}
                                strokeDasharray={`${sw},${sw}`}
                              />
                            </g>
                          );
                        })}

                        {/* Scale bar (bottom-right) */}
                        {(() => {
                          const barLen = gridStep;
                          const bx = dataXMax - barLen - padX * 0.2;
                          const by = dataYMin + padYBot * 0.3;
                          return (
                            <g>
                              <line x1={bx} y1={by} x2={bx + barLen} y2={by} stroke="#8b949e" strokeWidth={sw} />
                              <line x1={bx} y1={by - sw * 2} x2={bx} y2={by + sw * 2} stroke="#8b949e" strokeWidth={sw * 0.5} />
                              <line x1={bx + barLen} y1={by - sw * 2} x2={bx + barLen} y2={by + sw * 2} stroke="#8b949e" strokeWidth={sw * 0.5} />
                              <g transform={`translate(${bx + barLen / 2},${by - fSize * 0.5}) scale(1,-1)`}>
                                <text x={0} y={0} fill="#8b949e" fontSize={fSize * 0.6} textAnchor="middle" fontFamily="Inter, sans-serif">{barLen}m</text>
                              </g>
                            </g>
                          );
                        })()}
                      </g>
                    </svg>
                  );
                })()}

                {/* Legend */}
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#8b949e' }}>
                  {gaResult && gaResult.bestFOS < 100 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '12px', height: '2px', background: '#58a6ff', display: 'inline-block' }} /> GA
                    </span>
                  )}
                  {psoResult && psoResult.bestFOS < 100 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '12px', height: '2px', background: '#79c0ff', display: 'inline-block' }} /> PSO
                    </span>
                  )}
                  {selectedExample.criticalCircle && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '12px', height: '2px', background: '#f85149', display: 'inline-block', borderTop: '1px dashed #f85149' }} /> Publicado
                    </span>
                  )}
                </div>
              </div>

              {/* ─── Comparison Table ─── */}
              <div className="shms-card" style={{ padding: '16px 20px', marginTop: '12px' }}>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #30363d' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8b949e', fontWeight: 500, fontSize: '11px' }}>Método</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#8b949e', fontWeight: 500, fontSize: '11px' }}>FOS</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#8b949e', fontWeight: 500, fontSize: '11px' }}>Centro (x, y)</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#8b949e', fontWeight: 500, fontSize: '11px' }}>Raio (m)</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#8b949e', fontWeight: 500, fontSize: '11px' }}>Tempo</th>
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {gaResult && gaResult.bestFOS < 100 && (
                      <tr style={{ borderBottom: '1px solid #1c2129' }}>
                        <td style={{ padding: '6px 8px', color: '#58a6ff', fontFamily: 'Inter, sans-serif' }}>GA (Bishop)</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: classifyFOS(gaResult.bestFOS).color }}>{gaResult.bestFOS.toFixed(4)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e6edf3' }}>({gaResult.bestCircle.center.x.toFixed(1)}, {gaResult.bestCircle.center.y.toFixed(1)})</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e6edf3' }}>{gaResult.bestCircle.radius.toFixed(1)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8b949e' }}>{gaResult.elapsedMs}ms</td>
                      </tr>
                    )}
                    {psoResult && psoResult.bestFOS < 100 && (
                      <tr style={{ borderBottom: '1px solid #1c2129' }}>
                        <td style={{ padding: '6px 8px', color: '#79c0ff', fontFamily: 'Inter, sans-serif' }}>PSO (Bishop)</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: classifyFOS(psoResult.bestFOS).color }}>{psoResult.bestFOS.toFixed(4)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e6edf3' }}>({psoResult.bestCircle.center.x.toFixed(1)}, {psoResult.bestCircle.center.y.toFixed(1)})</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#e6edf3' }}>{psoResult.bestCircle.radius.toFixed(1)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8b949e' }}>{psoResult.elapsedMs}ms</td>
                      </tr>
                    )}
                    {selectedExample.expectedFOS.bishop && (
                      <tr>
                        <td style={{ padding: '6px 8px', color: '#f85149', fontFamily: 'Inter, sans-serif' }}>Publicado (Bishop)</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#e6edf3' }}>{selectedExample.expectedFOS.bishop.toFixed(4)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8b949e' }}>{selectedExample.criticalCircle ? `(${selectedExample.criticalCircle.center.x.toFixed(1)}, ${selectedExample.criticalCircle.center.y.toFixed(1)})` : '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#8b949e' }}>{selectedExample.criticalCircle?.radius.toFixed(1) ?? '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#484f58' }}>—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ TAB 5: Reliability ═══ */}
      {activeTab === 'reliability' && (
        <div>
          {!mcResult && !scenarioResults ? (
            <div className="shms-empty"><div className="shms-empty__text">Execute análise de confiabilidade (Tab Geometria → 🎲 Monte Carlo)</div></div>
          ) : (
            <>
              {mcResult && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--shms-sp-3)', marginBottom: 'var(--shms-sp-4)' }}>
                    <KPI label="FOS Médio" value={mcResult.mean.toFixed(3)} color={classifyFOS(mcResult.mean).color} sub={`σ = ${mcResult.stdDev.toFixed(3)}`} />
                    <KPI label="P(ruptura)" value={`${(mcResult.probabilityOfFailure * 100).toFixed(2)}%`} color={mcResult.probabilityOfFailure > 0.01 ? '#ef4444' : '#22c55e'} sub={`N = ${mcResult.fosValues.length}`} />
                    <KPI label="β (Hasofer-Lind)" value={mcResult.reliabilityIndex.toFixed(2)} color={classifyReliability(mcResult.reliabilityIndex).color} sub={classifyReliability(mcResult.reliabilityIndex).level} />
                    <KPI label="P5 / P95" value={`${mcResult.percentiles.p5.toFixed(2)} / ${mcResult.percentiles.p95.toFixed(2)}`} sub="Intervalo 90%" />
                  </div>
                  <div className="shms-card" style={{ padding: 'var(--shms-sp-4)', marginBottom: 'var(--shms-sp-3)' }}>
                    <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 'var(--shms-sp-2)' }}>Histograma FOS (Monte Carlo LHS)</div>
                    {renderHistogram(mcResult.histogram)}
                    <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 8 }}>
                      Linha vermelha = FOS=1.0. Verde=seguro, amarelo=marginal, vermelho=instável. Ref: Baecher & Christian (2003)
                    </div>
                  </div>
                  {/* Sensitivity */}
                  {mcResult.sensitivity.length > 0 && (
                    <div className="shms-card" style={{ padding: 'var(--shms-sp-4)', marginBottom: 'var(--shms-sp-3)' }}>
                      <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 'var(--shms-sp-2)' }}>Diagrama Tornado (Sensibilidade)</div>
                      {mcResult.sensitivity.slice(0, 6).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 'var(--shms-fs-sm)' }}>
                          <div style={{ width: 160, textAlign: 'right', color: 'var(--shms-text-dim)' }}>{s.parameter}</div>
                          <div style={{ flex: 1, height: 16, background: 'var(--shms-bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.abs(s.correlationCoeff) * 100}%`, height: '100%', background: s.correlationCoeff > 0 ? '#22c55e' : '#ef4444', borderRadius: 4 }} />
                          </div>
                          <div className="mono" style={{ width: 60 }}>{s.correlationCoeff.toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {/* Scenario Analysis */}
              {scenarioResults && (
                <div className="shms-card" style={{ padding: 'var(--shms-sp-4)' }}>
                  <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600, marginBottom: 'var(--shms-sp-3)' }}>Análise de Cenários (ICOLD/USACE/ANM)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--shms-fs-sm)' }}>
                    <thead><tr style={{ borderBottom: '2px solid var(--shms-border)' }}>
                      <th style={{ padding: 6, textAlign: 'left' }}>Cenário</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>FOS</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>Requerido</th>
                      <th style={{ padding: 6, textAlign: 'center' }}>Status</th>
                      <th style={{ padding: 6, textAlign: 'left' }}>Referência</th>
                    </tr></thead>
                    <tbody>
                      {scenarioResults.map((sr, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--shms-border)' }}>
                          <td style={{ padding: 6 }}>{sr.scenario.name}</td>
                          <td className="mono" style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: sr.passes ? '#22c55e' : '#ef4444' }}>{sr.fos.toFixed(3)}</td>
                          <td className="mono" style={{ padding: 6, textAlign: 'right' }}>{sr.scenario.requiredFOS.toFixed(1)}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{sr.passes ? '✅' : '❌'}</td>
                          <td style={{ padding: 6, fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>{sr.scenario.reference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ TAB 6: Reports ═══ */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', gap: 'var(--shms-sp-3)', marginBottom: 'var(--shms-sp-3)', flexWrap: 'wrap' }}>
            {AVAILABLE_STANDARDS.map(std => (
              <button key={std.id} onClick={() => setSelectedStandard(std.id)}
                className={`shms-btn ${selectedStandard === std.id ? 'shms-btn--primary' : ''}`}
                style={{ fontSize: 'var(--shms-fs-sm)', padding: '6px 14px' }}>
                {std.name}
              </button>
            ))}
          </div>
          <button className="shms-btn shms-btn--primary" onClick={generateReportAction} style={{ marginBottom: 'var(--shms-sp-3)' }}>
            📋 Gerar Relatório ({selectedStandard})
          </button>
          {reportText && (
            <div className="shms-card" style={{ padding: 'var(--shms-sp-4)' }}>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 'var(--shms-fs-sm)', lineHeight: 1.5, maxHeight: 600, overflowY: 'auto' }}>{reportText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
