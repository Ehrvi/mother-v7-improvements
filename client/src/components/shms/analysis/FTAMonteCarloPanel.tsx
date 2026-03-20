/**
 * FTAMonteCarloPanel.tsx — Monte Carlo Simulation & Bayesian Uncertainty Panel
 * Scientific basis: Bobbio et al. (2001), Lognormal uncertainty (NUREG/CR-6928)
 */
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { type MCResult, type FTNode, runMonteCarlo, computeProbability, probColor } from './FaultTreeEngine';

interface Props { ftNodes: Map<string, FTNode>; topProb: number }

export default function FTAMonteCarloPanel({ ftNodes, topProb }: Props) {
  const mc = useMemo(() => runMonteCarlo(ftNodes, 'TOP', 10000), [ftNodes]);
  const glass: React.CSSProperties = { background: 'rgba(10,12,20,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 };

  // Build histogram data
  const histData = useMemo(() => {
    const bins = 40;
    const min = mc.p5 * 0.5;
    const max = mc.p95 * 1.5;
    const step = (max - min) / bins;
    const counts = new Array(bins).fill(0);
    for (const s of mc.samples) {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((s - min) / step)));
      counts[idx]++;
    }
    return counts.map((c, i) => ({ bin: (min + i * step).toExponential(1), count: c, x: min + i * step }));
  }, [mc]);

  const kpis = [
    { label: 'Média (μ)', value: mc.mean.toExponential(2), color: '#0af' },
    { label: 'P5', value: mc.p5.toExponential(2), color: '#00ff88' },
    { label: 'Mediana (P50)', value: mc.p50.toExponential(2), color: '#ffcc00' },
    { label: 'P95', value: mc.p95.toExponential(2), color: '#ff3344' },
    { label: 'Desvio (σ)', value: mc.std.toExponential(2), color: '#c8f' },
    { label: 'CV (σ/μ)', value: (mc.std / mc.mean * 100).toFixed(1) + '%', color: mc.converged ? '#00ff88' : '#ff8844' },
  ];

  return (
    <div style={{ ...glass, flex: 1, overflow: 'auto', padding: '14px 16px' }}>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>
        🎲 Simulação Monte Carlo — N=10.000 · Distribuição Lognormal (σ=0.5) · NUREG/CR-6928
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: `${k.color}08`, borderRadius: 8, padding: '8px 10px', border: `1px solid ${k.color}22`, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color, fontFamily: 'monospace', marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Convergence indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: mc.converged ? '#00ff88' : '#ff8844', boxShadow: `0 0 6px ${mc.converged ? '#00ff8866' : '#ff884466'}` }} />
        <span style={{ color: mc.converged ? '#00ff88' : '#ff8844', fontWeight: 600 }}>
          {mc.converged ? 'Convergido (CV < 5%)' : 'Não convergido (CV ≥ 5%)'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.25)' }}>· Amostras: {mc.samples.length} · Determinístico: {topProb.toExponential(2)}</span>
      </div>

      {/* Histogram */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 8px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
          📊 Distribuição da Probabilidade do Top Event (P5–P95)
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={histData}>
            <XAxis dataKey="bin" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.2)' }} axisLine={false} width={25} />
            <Tooltip contentStyle={{ background: 'rgba(8,10,18,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [v, 'Freq.']} />
            <ReferenceLine x={mc.p5.toExponential(1)} stroke="#00ff88" strokeDasharray="3 3" label={{ value: 'P5', fontSize: 10, fill: '#00ff88' }} />
            <ReferenceLine x={mc.p50.toExponential(1)} stroke="#ffcc00" strokeDasharray="3 3" label={{ value: 'P50', fontSize: 10, fill: '#ffcc00' }} />
            <ReferenceLine x={mc.p95.toExponential(1)} stroke="#ff3344" strokeDasharray="3 3" label={{ value: 'P95', fontSize: 10, fill: '#ff3344' }} />
            <Bar dataKey="count" fill="#0af" fillOpacity={0.6} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sensitivity Tornado */}
      <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
          🌪️ Análise de Sensibilidade Tornado — ΔP(Top) por variação ±50% de cada evento básico
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {[...ftNodes.values()].filter(n => n.kind === 'basic').slice(0, 8).map(be => {
            const orig = be.probability ?? 0;
            const modified1 = new Map(ftNodes);
            modified1.set(be.id, { ...be, probability: orig * 1.5 });
            const modified2 = new Map(ftNodes);
            modified2.set(be.id, { ...be, probability: orig * 0.5 });
            const pHigh = computeProbability('TOP', modified1);
            const pLow = computeProbability('TOP', modified2);
            const delta = pHigh - pLow;
            const barW = Math.min(100, Math.max(2, delta / topProb * 500));
            const c = probColor(delta);
            return (
              <div key={be.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.5)' }}>
                  {be.label}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: barW, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${c}44, ${c})` }} />
                  <span style={{ color: c, fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>Δ{delta.toExponential(1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.12)' }}>
        Bobbio et al. (2001) · NUREG/CR-6928 · Lognormal σ=0.5 · MCS convergence: CV &lt; 5%
      </div>
    </div>
  );
}
