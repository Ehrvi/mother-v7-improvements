/**
 * NumericalPanel.tsx — Numerical Methods Visualization
 *
 * Scientific basis:
 *   - Griffiths & Lane (1999): FEM SSR visualization standards
 *   - Itasca FLAC 9.0 (2025): Contour plot conventions
 *   - Potts & Zdravkovic (1999): Geotechnical FE presentation
 *   - Cedergren (1989): Flow net visualization
 *
 * Features:
 *   - FDM SSR deformation contours
 *   - FEM 2D stress/strain maps
 *   - Seepage flow nets (flow lines + equipotentials)
 *   - Coupled analysis comparison
 */

import { useState, useMemo, useCallback } from 'react';
import { CLASSIC_EXAMPLES } from './ClassicExamples';
import { fdmSSR, fem2DSSR, seepageSolver, coupledSeepageStability } from './NumericalEngine';
import type { FDMSSRResult, FEM2DResult, SeepageResult, CoupledResult } from './NumericalEngine';
import type { SlopeProfile } from './SlopeStabilityEngine';

type AnalysisMode = 'fdm-ssr' | 'fem-2d' | 'seepage' | 'coupled';
type DisplayMode = 'displacement' | 'vonMises' | 'sigma-y' | 'failure';

interface NumericalPanelProps {
  structureId?: string;
}

// Color scale: blue → green → yellow → red
function valueToColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.25) {
    const s = clamped / 0.25;
    return `hsl(${240 - s * 120}, 80%, ${50 + s * 10}%)`;
  } else if (clamped < 0.5) {
    const s = (clamped - 0.25) / 0.25;
    return `hsl(${120 - s * 60}, 80%, ${60 + s * 10}%)`;
  } else if (clamped < 0.75) {
    const s = (clamped - 0.5) / 0.25;
    return `hsl(${60 - s * 30}, 90%, ${70 - s * 10}%)`;
  } else {
    const s = (clamped - 0.75) / 0.25;
    return `hsl(${30 - s * 30}, 100%, ${60 - s * 20}%)`;
  }
}

export default function NumericalPanel({ structureId }: NumericalPanelProps) {
  const [mode, setMode] = useState<AnalysisMode>('fdm-ssr');
  const [display, setDisplay] = useState<DisplayMode>('displacement');
  const [exampleId, setExampleId] = useState(0);
  const [gridDensity, setGridDensity] = useState(15);
  const [upstreamHead, setUpstreamHead] = useState(10);
  const [running, setRunning] = useState(false);
  const [fdmResult, setFdmResult] = useState<FDMSSRResult | null>(null);
  const [femResult, setFemResult] = useState<FEM2DResult | null>(null);
  const [seepResult, setSeepResult] = useState<SeepageResult | null>(null);
  const [coupledResult, setCoupledResult] = useState<CoupledResult | null>(null);

  const profile: SlopeProfile = useMemo(() => {
    const ex = CLASSIC_EXAMPLES[exampleId] ?? CLASSIC_EXAMPLES[0];
    return {
      surfacePoints: ex.profile.surfacePoints,
      layers: ex.profile.layers,
      waterTable: ex.profile.waterTable,
    };
  }, [exampleId]);

  const runAnalysis = useCallback(() => {
    setRunning(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          switch (mode) {
            case 'fdm-ssr':
              setFdmResult(fdmSSR(profile, gridDensity));
              break;
            case 'fem-2d':
              setFemResult(fem2DSSR(profile, gridDensity));
              break;
            case 'seepage':
              setSeepResult(seepageSolver(profile, upstreamHead, 0, 1e-6, gridDensity));
              break;
            case 'coupled':
              setCoupledResult(coupledSeepageStability(profile, upstreamHead, 0, gridDensity));
              break;
          }
        } catch { /* analysis error — handled by null result */ }
        setRunning(false);
      }, 50);
    });
  }, [mode, profile, gridDensity, upstreamHead]);

  // SVG dimensions
  const svgW = 800;
  const svgH = 400;
  const pts = profile.surfacePoints;
  const xMin = Math.min(...pts.map(p => p.x)) - 2;
  const xMax = Math.max(...pts.map(p => p.x)) + 2;
  const yMin = Math.min(...pts.map(p => p.y)) - 8;
  const yMax = Math.max(...pts.map(p => p.y)) + 4;
  const scaleX = svgW / (xMax - xMin);
  const scaleY = svgH / (yMax - yMin);
  const scale = Math.min(scaleX, scaleY);
  const tx = (p: { x: number; y: number }) => (p.x - xMin) * scale;
  const ty = (p: { x: number; y: number }) => svgH - (p.y - yMin) * scale;

  const activeResult = mode === 'fdm-ssr' ? fdmResult : mode === 'fem-2d' ? femResult : mode === 'seepage' ? seepResult : coupledResult;

  return (
    <div className="shms-card" style={{ padding: 'var(--space-5, 16px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 12px)' }}>
      <h2 className="shms-heading" style={{ margin: 0 }}>🔢 Métodos Numéricos — SSR / FEM / Seepage</h2>
      <p className="shms-text--muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Griffiths & Lane (1999) · Itasca FLAC 9.0 · Cedergren (1989 )
      </p>

      {/* ── Controls ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['fdm-ssr', 'fem-2d', 'seepage', 'coupled'] as AnalysisMode[]).map(m => (
          <button
            key={m}
            className={`shms-btn ${mode === m ? 'shms-btn--active' : ''}`}
            onClick={() => setMode(m)}
            style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: 'var(--shms-radius-sm, 6px)' }}
          >
            {m === 'fdm-ssr' ? '⚡ FDM SSR' : m === 'fem-2d' ? '🔺 FEM 2D' : m === 'seepage' ? '💧 Seepage' : '🔗 Coupled'}
          </button>
        ))}

        <select
          className="shms-select"
          value={exampleId}
          onChange={e => setExampleId(Number(e.target.value))}
          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
        >
          {CLASSIC_EXAMPLES.map((ex, i) => (
            <option key={i} value={i}>{ex.name}</option>
          ))}
        </select>

        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
          Grid:
          <input
            type="range" min={8} max={30} value={gridDensity}
            onChange={e => setGridDensity(Number(e.target.value))}
            style={{ width: 80 }}
          />
          {gridDensity}
        </label>

        {(mode === 'seepage' || mode === 'coupled') && (
          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            h↑:
            <input
              type="range" min={1} max={20} value={upstreamHead}
              onChange={e => setUpstreamHead(Number(e.target.value))}
              style={{ width: 60 }}
            />
            {upstreamHead}m
          </label>
        )}

        <button
          className="shms-btn shms-btn--primary"
          onClick={runAnalysis}
          disabled={running}
          style={{ fontSize: '0.8rem', padding: '6px 16px' }}
        >
          {running ? '⏳ Calculando...' : '▶ Executar'}
        </button>
      </div>

      {/* ── Display mode selector (for FDM/FEM) ──────────────── */}
      {(mode === 'fdm-ssr' || mode === 'fem-2d') && (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['displacement', 'vonMises', 'sigma-y', 'failure'] as DisplayMode[]).map(d => (
            <button
              key={d}
              className={`shms-btn ${display === d ? 'shms-btn--active' : ''}`}
              onClick={() => setDisplay(d)}
              style={{ fontSize: '0.7rem', padding: '3px 8px' }}
            >
              {d === 'displacement' ? '📐 Deformação' : d === 'vonMises' ? '🔴 von Mises' : d === 'sigma-y' ? '⬇️ σ_y' : '⚠️ Failure'}
            </button>
          ))}
        </div>
      )}

      {/* ── Results summary ──────────────────────────────────── */}
      {activeResult && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {mode === 'fdm-ssr' && fdmResult && (
            <>
              <ResultCard label="SRF (≈ FOS)" value={fdmResult.srf.toFixed(3)} accent={fdmResult.srf < 1.2 ? 'red' : fdmResult.srf < 1.5 ? 'amber' : 'green'} />
              <ResultCard label="Convergiu" value={fdmResult.converged ? '✅' : '❌'} accent="neutral" />
              <ResultCard label="Iterações" value={String(fdmResult.iterations)} accent="neutral" />
              <ResultCard label="Desl. Máx (m)" value={fdmResult.maxDisplacement.toFixed(4)} accent="neutral" />
              <ResultCard label="Tempo" value={`${fdmResult.elapsedMs} ms`} accent="neutral" />
            </>
          )}
          {mode === 'fem-2d' && femResult && (
            <>
              <ResultCard label="SRF (≈ FOS)" value={femResult.srf.toFixed(3)} accent={femResult.srf < 1.2 ? 'red' : femResult.srf < 1.5 ? 'amber' : 'green'} />
              <ResultCard label="Convergiu" value={femResult.converged ? '✅' : '❌'} accent="neutral" />
              <ResultCard label="Elementos" value={String(femResult.elements.length)} accent="neutral" />
              <ResultCard label="Strain Energy" value={femResult.strainEnergy.toExponential(2)} accent="neutral" />
              <ResultCard label="Tempo" value={`${femResult.elapsedMs} ms`} accent="neutral" />
            </>
          )}
          {mode === 'seepage' && seepResult && (
            <>
              <ResultCard label="Convergiu" value={seepResult.converged ? '✅' : '❌'} accent="neutral" />
              <ResultCard label="Iterações" value={String(seepResult.iterations)} accent="neutral" />
              <ResultCard label="Fluxo Total" value={`${seepResult.totalFlow.toExponential(2)} m³/s`} accent="neutral" />
              <ResultCard label="∇h Máx" value={seepResult.maxGradient.toFixed(4)} accent={seepResult.maxGradient > 1 ? 'red' : 'green'} />
              <ResultCard label="∇h Saída" value={seepResult.exitGradient.toFixed(4)} accent={seepResult.exitGradient > 0.5 ? 'amber' : 'green'} />
            </>
          )}
          {mode === 'coupled' && coupledResult && (
            <>
              <ResultCard label="FOS (seco)" value={coupledResult.fosWithoutSeepage.toFixed(3)} accent="green" />
              <ResultCard label="FOS (c/ percolação)" value={coupledResult.fosWithSeepage.toFixed(3)} accent={coupledResult.fosWithSeepage < 1.3 ? 'red' : 'amber'} />
              <ResultCard label="Δ FOS" value={`-${coupledResult.fosDifference.toFixed(3)}`} accent="red" />
              <ResultCard label="∇h Máx" value={coupledResult.seepage.maxGradient.toFixed(4)} accent="neutral" />
            </>
          )}
        </div>
      )}

      {/* ── SVG Visualization ────────────────────────────────── */}
      <div style={{ border: '1px solid var(--shms-border, #333)', borderRadius: 'var(--shms-radius, 8px)', overflow: 'hidden', background: 'var(--shms-surface-1, #1a1a2e)' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ display: 'block' }}>
          {/* Soil body */}
          <polygon
            points={[
              ...pts.map(p => `${tx(p)},${ty(p)}`),
              `${tx(pts[pts.length - 1])},${svgH}`,
              `${tx(pts[0])},${svgH}`,
            ].join(' ')}
            fill="var(--shms-surface-2, #252540)"
            stroke="var(--shms-text-secondary, #888)"
            strokeWidth={1}
          />

          {/* Surface line */}
          <polyline
            points={pts.map(p => `${tx(p)},${ty(p)}`).join(' ')}
            fill="none"
            stroke="var(--shms-accent-green, #4ecdc4)"
            strokeWidth={2}
          />

          {/* FDM SSR nodes */}
          {mode === 'fdm-ssr' && fdmResult && fdmResult.grid.nodes.map((n, i) => {
            if (n.y > (profile.surfacePoints.find(p => Math.abs(p.x - n.x) < fdmResult.grid.dx)?.y ?? Infinity)) return null;
            const disp = Math.sqrt(n.ux ** 2 + n.uy ** 2);
            const maxD = fdmResult.maxDisplacement || 1;
            const t = display === 'displacement' ? disp / maxD
                    : display === 'vonMises' ? n.vonMises / (Math.max(...fdmResult.grid.nodes.map(nd => nd.vonMises)) || 1)
                    : display === 'sigma-y' ? Math.abs(n.sigmaYY) / (Math.max(...fdmResult.grid.nodes.map(nd => Math.abs(nd.sigmaYY))) || 1)
                    : disp / maxD > 0.5 ? 1 : 0;
            return (
              <circle
                key={i}
                cx={tx(n)}
                cy={ty(n)}
                r={2.5}
                fill={valueToColor(t)}
                opacity={0.8}
              />
            );
          })}

          {/* FDM failure zone */}
          {mode === 'fdm-ssr' && fdmResult && fdmResult.failureZone.length > 3 && (
            <polygon
              points={fdmResult.failureZone.map(p => `${tx(p)},${ty(p)}`).join(' ')}
              fill="rgba(255,0,0,0.15)"
              stroke="red"
              strokeWidth={1}
              strokeDasharray="4,2"
            />
          )}

          {/* FEM elements */}
          {mode === 'fem-2d' && femResult && femResult.elements.map((el, i) => {
            const [n0, n1, n2] = el.nodes;
            const p0 = femResult.nodes[n0], p1 = femResult.nodes[n1], p2 = femResult.nodes[n2];
            if (!p0 || !p1 || !p2) return null;
            const fi = femResult.failureIndicator[i] ?? 0;
            const stress = femResult.stresses[i];
            const maxVM = Math.max(...femResult.stresses.map(s => s.vonMises), 1);
            const t = display === 'failure' ? fi
                    : display === 'vonMises' ? stress.vonMises / maxVM
                    : display === 'sigma-y' ? Math.abs(stress.sigmaY) / (Math.max(...femResult.stresses.map(s => Math.abs(s.sigmaY))) || 1)
                    : fi;
            return (
              <polygon
                key={i}
                points={`${tx(p0)},${ty(p0)} ${tx(p1)},${ty(p1)} ${tx(p2)},${ty(p2)}`}
                fill={valueToColor(t)}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={0.5}
                opacity={0.7}
              />
            );
          })}

          {/* Seepage flow lines */}
          {(mode === 'seepage' && seepResult || mode === 'coupled' && coupledResult) && (() => {
            const sr = mode === 'seepage' ? seepResult! : coupledResult!.seepage;
            return (
              <>
                {sr.flowLines.map((line, i) => (
                  <polyline
                    key={`fl-${i}`}
                    points={line.map(p => `${tx(p)},${ty(p)}`).join(' ')}
                    fill="none"
                    stroke="rgba(66,165,245,0.6)"
                    strokeWidth={1.5}
                  />
                ))}
                {sr.equipotentialLines.map((eq, i) => (
                  <polyline
                    key={`eq-${i}`}
                    points={eq.points.map(p => `${tx(p)},${ty(p)}`).join(' ')}
                    fill="none"
                    stroke="rgba(255,183,77,0.4)"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                ))}
                {sr.phreatricLine.length > 1 && (
                  <polyline
                    points={sr.phreatricLine.map(p => `${tx(p)},${ty(p)}`).join(' ')}
                    fill="none"
                    stroke="cyan"
                    strokeWidth={2}
                  />
                )}
                {/* Seepage node pressures */}
                {sr.nodes.filter((_, i) => i % 3 === 0).map((n, i) => {
                  const maxP = Math.max(...sr.nodes.map(nd => nd.pressure), 1);
                  return (
                    <circle
                      key={`sn-${i}`}
                      cx={tx(n)}
                      cy={ty(n)}
                      r={1.5}
                      fill={valueToColor(n.pressure / maxP)}
                      opacity={0.5}
                    />
                  );
                })}
              </>
            );
          })()}

          {/* Color scale legend */}
          <defs>
            <linearGradient id="legend-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={valueToColor(0)} />
              <stop offset="25%" stopColor={valueToColor(0.25)} />
              <stop offset="50%" stopColor={valueToColor(0.5)} />
              <stop offset="75%" stopColor={valueToColor(0.75)} />
              <stop offset="100%" stopColor={valueToColor(1)} />
            </linearGradient>
          </defs>
          <rect x={svgW - 160} y={svgH - 30} width={140} height={12} fill="url(#legend-grad)" rx={3} />
          <text x={svgW - 160} y={svgH - 34} fill="#aaa" fontSize={9}>Low</text>
          <text x={svgW - 30} y={svgH - 34} fill="#aaa" fontSize={9} textAnchor="end">High</text>
        </svg>
      </div>

      {/* ── Convergence table ─────────────────────────────────── */}
      {mode === 'fdm-ssr' && fdmResult && fdmResult.convergenceHistory.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          <table className="shms-table" style={{ fontSize: '0.75rem', width: '100%' }}>
            <thead>
              <tr><th>SRF</th><th>Max Velocity</th><th>Status</th></tr>
            </thead>
            <tbody>
              {fdmResult.convergenceHistory.map((h, i) => (
                <tr key={i}>
                  <td>{h.srf.toFixed(3)}</td>
                  <td>{h.maxVelocity.toExponential(2)}</td>
                  <td style={{ color: h.converged ? 'var(--shms-accent-green, #4ecdc4)' : 'var(--shms-accent-red, #ff6b6b)' }}>
                    {h.converged ? '✅ Estável' : '❌ Instável'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Small result card component ─────────────────────────────────────────────

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
