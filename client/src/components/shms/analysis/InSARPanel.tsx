/**
 * InSARPanel.tsx — InSAR Mining Stability Analysis Panel
 *
 * Scientific basis:
 *   - Fukuzono (1985): Inverse Velocity Method for failure time prediction
 *   - Xu et al. (2020): InSAR phase denoising (arXiv:2001.00769)
 *   - Near-Real-Time InSAR (arXiv:2511.12051, 2025)
 *   - Read (2009): "Open Pit Slope Stability" — GA back-analysis
 *   - Dick et al. (2015): Mining slope displacement monitoring
 *
 * Features:
 *   - InSAR displacement heat map on surface mesh
 *   - Inverse velocity chart with regression line
 *   - Surface-only FOS estimation (GA back-analysis)
 *   - Deformation forecast with confidence bands
 */

import { useState, useMemo, useCallback } from 'react';
import {
  inverseVelocityMethod,
  surfaceBackAnalysis,
  lstmDeformationPredict,
} from './InSAREngine';
import type {
  InSARPoint,
  DisplacementTimeSeries,
  IVMResult,
  SurfaceBackAnalysisResult,
  LSTMDeformationResult,
} from './InSAREngine';

interface InSARPanelProps {
  structureId?: string;
}

// Build a synthetic DisplacementTimeSeries for demo
function generateSyntheticData(nPoints: number = 20, nTimesteps: number = 30): {
  points: InSARPoint[];
  series: DisplacementTimeSeries[];
} {
  const now = Date.now();
  const dayMs = 86400000;
  const points: InSARPoint[] = [];
  const series: DisplacementTimeSeries[] = [];

  for (let i = 0; i < nPoints; i++) {
    const x = 20 + Math.random() * 60;
    const y = 5 + Math.random() * 15;
    const isInFailureZone = x > 40 && x < 60 && y > 8 && y < 14;
    const id = `PS-${i.toString().padStart(3, '0')}`;

    const timestamps: string[] = [];
    const displacements: number[] = [];
    const velocities: number[] = [];

    for (let t = 0; t < nTimesteps; t++) {
      const date = new Date(now - (nTimesteps - t) * dayMs * 12);
      timestamps.push(date.toISOString());
      const base = isInFailureZone ? 0.5 + t * 0.3 * Math.exp(t * 0.03) : 0.1 + t * 0.05;
      displacements.push(base + (Math.random() - 0.5) * 0.1);
    }

    for (let t = 1; t < nTimesteps; t++) {
      velocities.push((displacements[t] - displacements[t - 1]) / 12);
    }
    velocities.unshift(velocities[0] ?? 0);

    const lastVel = velocities[velocities.length - 1];

    points.push({ id, x, y, elevation: y + Math.random() * 2, losVelocity: lastVel * 365, coherence: 0.7 + Math.random() * 0.3 });
    series.push({ pointId: id, timestamps, displacements, velocities });
  }

  return { points, series };
}

export default function InSARPanel({ structureId }: InSARPanelProps) {
  const [data] = useState(() => generateSyntheticData());
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [ivmResult, setIvmResult] = useState<IVMResult | null>(null);
  const [gaResult, setGaResult] = useState<SurfaceBackAnalysisResult | null>(null);
  const [predResult, setPredResult] = useState<LSTMDeformationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'ivm' | 'ga' | 'forecast'>('map');

  const surfaceProfile = useMemo(() =>
    data.points.sort((a, b) => a.x - b.x).map(p => ({ x: p.x, y: p.y })),
    [data.points]
  );

  // Pick the most-moving point for IVM/LSTM and compose the whole-area for GA
  const maxDispIdx = useMemo(() => {
    let mi = 0;
    for (let i = 1; i < data.series.length; i++) {
      const d = data.series[i].displacements;
      const dm = data.series[mi].displacements;
      if (d[d.length - 1] > dm[dm.length - 1]) mi = i;
    }
    return mi;
  }, [data.series]);

  const runFullAnalysis = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      try {
        // IVM on most-moving point
        const ivm = inverseVelocityMethod(data.series[maxDispIdx]);
        setIvmResult(ivm);

        // GA back-analysis
        const observed = data.points.map((p, i) => ({
          x: p.x, y: p.y,
          disp: data.series[i].displacements[data.series[i].displacements.length - 1],
        }));
        const ga = surfaceBackAnalysis(surfaceProfile, observed, 60, 80);
        setGaResult(ga);

        // LSTM forecast on most-moving point
        const pred = lstmDeformationPredict(data.series[maxDispIdx], 30);
        setPredResult(pred);
      } catch { /* handled */ }
      setRunning(false);
    }, 100);
  }, [data, surfaceProfile, maxDispIdx]);

  // SVG dimensions
  const svgW = 800, svgH = 350;
  const xMin = Math.min(...data.points.map(p => p.x)) - 5;
  const xMax = Math.max(...data.points.map(p => p.x)) + 5;
  const yMin = Math.min(...data.points.map(p => p.y)) - 3;
  const yMax = Math.max(...data.points.map(p => p.y)) + 5;
  const tx = (x: number) => ((x - xMin) / (xMax - xMin)) * svgW;
  const ty = (y: number) => svgH - ((y - yMin) / (yMax - yMin)) * svgH;

  const maxDisp = Math.max(
    ...data.series.map(s => Math.abs(s.displacements[s.displacements.length - 1])),
    0.001
  );

  const selSeries = selectedIdx !== null ? data.series[selectedIdx] : null;
  const selPoint = selectedIdx !== null ? data.points[selectedIdx] : null;

  return (
    <div className="shms-card" style={{ padding: 'var(--space-5, 16px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 12px)' }}>
      <h2 className="shms-heading" style={{ margin: 0 }}>🛰️ InSAR Mining Stability — Surface-Only Analysis</h2>
      <p className="shms-text--muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Fukuzono (1985) IVM · Read (2009) GA Back-Analysis · arXiv:2511.12051 Near-RT InSAR
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([
          { id: 'map' as const, label: '🗺️ Displacement Map' },
          { id: 'ivm' as const, label: '📉 Inverse Velocity' },
          { id: 'ga' as const, label: '🧬 GA Back-Analysis' },
          { id: 'forecast' as const, label: '📊 LSTM Forecast' },
        ]).map(tab => (
          <button
            key={tab.id}
            className={`shms-btn ${activeTab === tab.id ? 'shms-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            {tab.label}
          </button>
        ))}

        <button
          className="shms-btn shms-btn--primary"
          onClick={runFullAnalysis}
          disabled={running}
          style={{ marginLeft: 'auto', fontSize: '0.8rem', padding: '6px 16px' }}
        >
          {running ? '⏳ Analyzing...' : '▶ Full Analysis'}
        </button>
      </div>

      {/* ── Tab: Displacement Map ─────────────────────────── */}
      {activeTab === 'map' && (
        <div style={{ border: '1px solid var(--shms-border, #333)', borderRadius: 'var(--shms-radius, 8px)', overflow: 'hidden', background: 'var(--shms-surface-1, #1a1a2e)' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ display: 'block' }}>
            <polyline points={surfaceProfile.map(p => `${tx(p.x)},${ty(p.y)}`).join(' ')} fill="none" stroke="var(--shms-accent-green, #4ecdc4)" strokeWidth={2} />
            {data.points.map((p, i) => {
              const disp = Math.abs(data.series[i].displacements[data.series[i].displacements.length - 1]);
              const t = disp / maxDisp;
              const r = 4 + t * 12;
              const hue = 120 - t * 120;
              const isSelected = i === selectedIdx;
              return (
                <g key={p.id} onClick={() => setSelectedIdx(i)} style={{ cursor: 'pointer' }}>
                  <circle cx={tx(p.x)} cy={ty(p.y)} r={r} fill={`hsla(${hue}, 80%, 55%, 0.7)`}
                    stroke={isSelected ? 'white' : 'none'} strokeWidth={isSelected ? 2 : 0} />
                  <text x={tx(p.x)} y={ty(p.y) - r - 3} fill="#aaa" fontSize={8} textAnchor="middle">
                    {disp.toFixed(1)}mm
                  </text>
                </g>
              );
            })}
            <text x={10} y={20} fill="#ccc" fontSize={11} fontWeight={600}>InSAR LOS Displacement</text>
            <text x={10} y={34} fill="#888" fontSize={9}>{data.points.length} persistent scatterers</text>
          </svg>
        </div>
      )}

      {/* ── Tab: IVM ──────────────────────────────────────── */}
      {activeTab === 'ivm' && ivmResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <ResultCard label="Fase Creep" value={ivmResult.currentPhase} accent={ivmResult.currentPhase === 'tertiary' ? 'red' : ivmResult.currentPhase === 'secondary' ? 'amber' : 'green'} />
            <ResultCard label="R²" value={ivmResult.r2.toFixed(4)} accent="neutral" />
            <ResultCard label="Slope (1/v)" value={ivmResult.regressionSlope.toExponential(2)} accent="neutral" />
            {ivmResult.daysToFailure !== null && (
              <ResultCard label="Falha em" value={`${ivmResult.daysToFailure} dias`} accent="red" />
            )}
            <ResultCard label="Confiança" value={`${(ivmResult.confidence * 100).toFixed(0)}%`} accent={ivmResult.confidence > 0.5 ? 'green' : 'amber'} />
          </div>
          <div style={{ border: '1px solid var(--shms-border, #333)', borderRadius: 'var(--shms-radius, 8px)', padding: 16, background: 'var(--shms-surface-1, #1a1a2e)' }}>
            <svg viewBox={`0 0 ${svgW} 250`} width="100%" style={{ display: 'block' }}>
              {ivmResult.inverseVelocities.length > 0 && (() => {
                const ivd = ivmResult.inverseVelocities;
                const tMin = new Date(ivd[0].time).getTime();
                const tMax = new Date(ivd[ivd.length - 1].time).getTime();
                const ivMax = Math.max(...ivd.map(d => d.invVel), 1);
                const mx = (t: number) => ((t - tMin) / (tMax - tMin || 1)) * (svgW - 40) + 20;
                const my = (iv: number) => 230 - (iv / ivMax) * 200;
                return (
                  <>
                    {ivd.map((d, i) => (
                      <circle key={i} cx={mx(new Date(d.time).getTime())} cy={my(d.invVel)} r={3} fill="var(--shms-accent-blue, #42a5f5)" />
                    ))}
                    <line
                      x1={mx(tMin)}
                      y1={my(ivmResult.regressionIntercept + ivmResult.regressionSlope * 0)}
                      x2={mx(tMax)}
                      y2={my(ivmResult.regressionIntercept + ivmResult.regressionSlope * ((tMax - tMin) / (1000 * 3600 * 24)))}
                      stroke="red" strokeWidth={1.5} strokeDasharray="4,3"
                    />
                    <text x={20} y={15} fill="#ccc" fontSize={10}>1/v vs Time (Fukuzono 1985)</text>
                    <text x={20} y={245} fill="#888" fontSize={9}>Time →</text>
                    <text x={5} y={120} fill="#888" fontSize={9} transform="rotate(-90, 5, 120)">1/v →</text>
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}
      {activeTab === 'ivm' && !ivmResult && (
        <div className="shms-empty-state" style={{ padding: 40, textAlign: 'center', color: '#888' }}>Click "Full Analysis" to run the Inverse Velocity Method</div>
      )}

      {/* ── Tab: GA Back-Analysis ──────────────────────────── */}
      {activeTab === 'ga' && gaResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <ResultCard label="c' Estimado" value={`${gaResult.estimatedCohesion.toFixed(1)} kPa`} accent="neutral" />
            <ResultCard label="φ' Estimado" value={`${gaResult.estimatedFriction.toFixed(1)}°`} accent="neutral" />
            <ResultCard label="FOS Estimado" value={gaResult.estimatedFOS.toFixed(3)} accent={gaResult.estimatedFOS < 1.2 ? 'red' : gaResult.estimatedFOS < 1.5 ? 'amber' : 'green'} />
            <ResultCard label="Fit Quality" value={gaResult.fitQuality.toFixed(3)} accent={gaResult.fitQuality > 0.7 ? 'green' : 'amber'} />
            <ResultCard label="Tempo" value={`${gaResult.elapsedMs} ms`} accent="neutral" />
          </div>
          {/* Convergence chart */}
          <div style={{ border: '1px solid var(--shms-border, #333)', borderRadius: 'var(--shms-radius, 8px)', padding: 16, background: 'var(--shms-surface-1, #1a1a2e)' }}>
            <svg viewBox={`0 0 ${svgW} 180`} width="100%" style={{ display: 'block' }}>
              {gaResult.convergenceHistory.length > 0 && (() => {
                const ch = gaResult.convergenceHistory;
                const maxFit = Math.max(...ch.map(c => c.bestFit), 0.01);
                const mx = (g: number) => (g / (ch.length - 1 || 1)) * (svgW - 40) + 20;
                const my = (f: number) => 160 - (f / maxFit) * 140;
                return (
                  <>
                    <polyline
                      points={ch.map(c => `${mx(c.gen)},${my(c.bestFit)}`).join(' ')}
                      fill="none" stroke="var(--shms-accent-blue, #42a5f5)" strokeWidth={2}
                    />
                    <text x={20} y={15} fill="#ccc" fontSize={10}>GA Convergence — {ch.length} generations</text>
                    <text x={20} y={175} fill="#888" fontSize={9}>Generation →</text>
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}
      {activeTab === 'ga' && !gaResult && (
        <div className="shms-empty-state" style={{ padding: 40, textAlign: 'center', color: '#888' }}>Click "Full Analysis" to run GA Back-Analysis</div>
      )}

      {/* ── Tab: LSTM Forecast ─────────────────────────────── */}
      {activeTab === 'forecast' && predResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <ResultCard label="Tendência" value={predResult.trend} accent={predResult.trend === 'accelerating' ? 'red' : predResult.trend === 'decelerating' ? 'green' : 'neutral'} />
            <ResultCard label="RMSE" value={`${predResult.rmse.toFixed(2)} mm`} accent="neutral" />
            <ResultCard label="Taxa de Mudança" value={`${predResult.rateChange.toFixed(3)} mm/day²`} accent={predResult.rateChange > 0.01 ? 'red' : 'green'} />
            <ResultCard label="Horizonte" value={`${predResult.forecast.length} dias`} accent="neutral" />
          </div>
          <div style={{ border: '1px solid var(--shms-border, #333)', borderRadius: 'var(--shms-radius, 8px)', padding: 16, background: 'var(--shms-surface-1, #1a1a2e)' }}>
            <svg viewBox={`0 0 ${svgW} 200`} width="100%" style={{ display: 'block' }}>
              {predResult.forecast.length > 0 && (() => {
                const fc = predResult.forecast;
                const maxY = Math.max(...fc.map(f => f.upper), 0.01);
                const mx = (i: number) => (i / (fc.length - 1 || 1)) * (svgW - 40) + 20;
                const my = (v: number) => 180 - (v / maxY) * 160;
                return (
                  <>
                    {/* Confidence band */}
                    <polygon
                      points={[
                        ...fc.map((f, i) => `${mx(i)},${my(f.upper)}`),
                        ...fc.slice().reverse().map((f, i) => `${mx(fc.length - 1 - i)},${my(f.lower)}`),
                      ].join(' ')}
                      fill="rgba(66,165,245,0.12)"
                    />
                    {/* Prediction line */}
                    <polyline
                      points={fc.map((f, i) => `${mx(i)},${my(f.predicted)}`).join(' ')}
                      fill="none" stroke="var(--shms-accent-blue, #42a5f5)" strokeWidth={2}
                    />
                    {/* Upper bound */}
                    <polyline
                      points={fc.map((f, i) => `${mx(i)},${my(f.upper)}`).join(' ')}
                      fill="none" stroke="rgba(255,183,77,0.5)" strokeWidth={1} strokeDasharray="3,3"
                    />
                    <text x={20} y={15} fill="#ccc" fontSize={10}>Deformation Forecast — 30 day horizon</text>
                    <text x={20} y={195} fill="#888" fontSize={9}>Days ahead →</text>
                    <text x={5} y={100} fill="#888" fontSize={9} transform="rotate(-90, 5, 100)">Displacement (mm) →</text>
                  </>
                );
              })()}
            </svg>
          </div>
        </div>
      )}
      {activeTab === 'forecast' && !predResult && (
        <div className="shms-empty-state" style={{ padding: 40, textAlign: 'center', color: '#888' }}>Click "Full Analysis" to run LSTM Deformation Forecast</div>
      )}

      {/* ── Selected point detail ─────────────────────────── */}
      {selPoint && selSeries && (
        <div className="shms-card" style={{ padding: 12, borderLeft: '3px solid var(--shms-accent-blue, #42a5f5)' }}>
          <strong>{selPoint.id}</strong> — x: {selPoint.x.toFixed(1)}m, y: {selPoint.y.toFixed(1)}m
          <br />
          <span style={{ fontSize: '0.8rem', color: 'var(--shms-text-secondary, #888)' }}>
            Current disp: {selSeries.displacements[selSeries.displacements.length - 1].toFixed(2)} mm |
            LOS vel: {selPoint.losVelocity.toFixed(1)} mm/yr |
            Coherence: {selPoint.coherence.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

function ResultCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const color = accent === 'red' ? 'var(--shms-accent-red, #ff6b6b)'
              : accent === 'amber' ? 'var(--shms-accent-amber, #ffb74d)'
              : accent === 'green' ? 'var(--shms-accent-green, #4ecdc4)'
              : 'var(--shms-text-secondary, #888)';
  return (
    <div className="shms-stat-card" style={{ padding: '8px 12px', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--shms-text-secondary, #888)' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
