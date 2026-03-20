/**
 * FTAScenarioPanel.tsx — Scenario Simulator + Event Tree + Risk Matrix + FMEA
 * Scientific basis: IEC 62502 (Event Trees), ICOLD B.130, ALARP principle
 */
import { useState, useMemo } from 'react';
import { type FTNode, type ScenarioConfig, ICOLD_SCENARIOS, buildEventTree, computeProbabilityWithOverrides, probColor, probTag } from './FaultTreeEngine';

interface Props { ftNodes: Map<string, FTNode>; topProb: number }

const consequenceColors: Record<string, string> = { catastrophic: '#ff3344', major: '#ff8844', moderate: '#ffcc00', minor: '#00ff88' };
const riskColors: Record<string, string> = { intolerable: '#ff3344', alarp_high: '#ff8844', alarp_low: '#ffcc00', acceptable: '#00ff88' };

export default function FTAScenarioPanel({ ftNodes, topProb }: Props) {
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [whatIfOverrides, setWhatIfOverrides] = useState<Record<string, number>>({});
  const glass: React.CSSProperties = { background: 'rgba(10,12,20,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 };

  const scenario = ICOLD_SCENARIOS.find(s => s.id === activeScenario);
  const overrides = scenario ? scenario.overrides : whatIfOverrides;
  const scenarioProb = useMemo(() => computeProbabilityWithOverrides('TOP', ftNodes, overrides), [ftNodes, overrides]);
  const delta = scenarioProb - topProb;
  const eventTree = useMemo(() => buildEventTree(scenario ? (scenario.id === 'pmp_flood' ? 'OVTOP' : scenario.id === 'piping_progressive' ? 'PIPE' : scenario.id === 'seismic_liquefaction' ? 'SEISMIC' : 'SLOPE') : 'OVTOP'), [scenario]);

  // FMEA data derived from FTA
  const fmeaData = useMemo(() => {
    const branches = ['OVTOP', 'PIPE', 'SLOPE', 'SEISMIC'];
    return branches.map(bid => {
      const node = ftNodes.get(bid)!;
      const p = computeProbabilityWithOverrides(bid, ftNodes, overrides);
      const severity = bid === 'SEISMIC' ? 10 : bid === 'SLOPE' ? 9 : bid === 'PIPE' ? 8 : 7;
      const detection = bid === 'SLOPE' ? 4 : bid === 'PIPE' ? 6 : bid === 'SEISMIC' ? 8 : 3;
      const occurrence = p > 1e-2 ? 10 : p > 1e-3 ? 7 : p > 1e-4 ? 4 : 2;
      const rpn = severity * occurrence * detection;
      return { id: bid, name: node.label, probability: p, severity, occurrence, detection, rpn };
    }).sort((a, b) => b.rpn - a.rpn);
  }, [ftNodes, overrides]);

  return (
    <div style={{ ...glass, flex: 1, overflow: 'auto', padding: '14px 16px' }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>
        🎯 Simulação de Cenários — ICOLD B.130 · IEC 62502 · Matriz ALARP
      </div>

      {/* Scenario selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {ICOLD_SCENARIOS.map(s => (
          <button key={s.id} onClick={() => setActiveScenario(activeScenario === s.id ? null : s.id)}
            style={{
              background: activeScenario === s.id ? `${s.color}18` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${activeScenario === s.id ? `${s.color}44` : 'rgba(255,255,255,0.04)'}`,
              borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: activeScenario === s.id ? s.color : 'rgba(255,255,255,0.6)', marginTop: 4 }}>{s.name}</div>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{Object.keys(s.overrides).length} eventos alterados</div>
          </button>
        ))}
      </div>

      {/* Scenario result KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase' }}>P(Top) Base</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: probColor(topProb), fontFamily: 'monospace' }}>{topProb.toExponential(2)}</div>
          <div style={{ fontSize: 8, color: probColor(topProb), fontWeight: 600 }}>{probTag(topProb)}</div>
        </div>
        <div style={{ background: `${probColor(scenarioProb)}08`, borderRadius: 8, padding: '10px 12px', border: `1px solid ${probColor(scenarioProb)}22`, textAlign: 'center' }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase' }}>P(Top) Cenário</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: probColor(scenarioProb), fontFamily: 'monospace' }}>{scenarioProb.toExponential(2)}</div>
          <div style={{ fontSize: 8, color: probColor(scenarioProb), fontWeight: 600 }}>{probTag(scenarioProb)}</div>
        </div>
        <div style={{ background: delta > 0 ? 'rgba(255,50,60,0.06)' : 'rgba(0,255,136,0.06)', borderRadius: 8, padding: '10px 12px', border: `1px solid ${delta > 0 ? 'rgba(255,50,60,0.2)' : 'rgba(0,255,136,0.2)'}`, textAlign: 'center' }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase' }}>Variação</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: delta > 0 ? '#ff3344' : '#00ff88', fontFamily: 'monospace' }}>
            {delta > 0 ? '+' : ''}{(delta / topProb * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>vs. base</div>
        </div>
      </div>

      {/* Event Tree (IEC 62502) */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
          🌿 Árvore de Eventos Pós-Falha (IEC 62502)
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {eventTree.map((branch, i) => {
            const c = consequenceColors[branch.consequence];
            const barW = Math.max(4, branch.probability * 200);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: `${c}06`, borderRadius: 6, border: `1px solid ${c}15` }}>
                <div style={{ width: barW, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${c}44, ${c})`, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{branch.name}</div>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>{branch.description}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: c, fontFamily: 'monospace' }}>{(branch.probability * 100).toFixed(0)}%</div>
                  <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: `${c}22`, color: c, fontWeight: 600, textTransform: 'uppercase' }}>
                    {branch.consequence}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FMEA Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
          📋 FMEA — Modos de Falha e Efeitos (RPN = S × O × D)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 4, padding: '4px 8px', fontSize: 7, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4 }}>
          <span>Modo de Falha</span><span style={{ textAlign: 'center' }}>S</span><span style={{ textAlign: 'center' }}>O</span><span style={{ textAlign: 'center' }}>D</span><span style={{ textAlign: 'center' }}>RPN</span><span style={{ textAlign: 'right' }}>P(falha)</span>
        </div>
        {fmeaData.map(fm => {
          const rpnColor = fm.rpn > 400 ? '#ff3344' : fm.rpn > 200 ? '#ff8844' : fm.rpn > 100 ? '#ffcc00' : '#00ff88';
          return (
            <div key={fm.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 4, padding: '6px 8px', fontSize: 9, borderBottom: '1px solid rgba(255,255,255,0.02)', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>{fm.name}</span>
              <span style={{ textAlign: 'center', color: '#ff8844', fontWeight: 700 }}>{fm.severity}</span>
              <span style={{ textAlign: 'center', color: '#ffcc00', fontWeight: 700 }}>{fm.occurrence}</span>
              <span style={{ textAlign: 'center', color: '#0af', fontWeight: 700 }}>{fm.detection}</span>
              <span style={{ textAlign: 'center', color: rpnColor, fontWeight: 800, fontFamily: 'monospace', fontSize: 11 }}>{fm.rpn}</span>
              <span style={{ textAlign: 'right', color: probColor(fm.probability), fontWeight: 700, fontFamily: 'monospace' }}>{fm.probability.toExponential(1)}</span>
            </div>
          );
        })}
      </div>

      {/* Risk Matrix ALARP */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
          🟢🟡🟠🔴 Matriz de Risco ALARP (As Low As Reasonably Practicable)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(4, 1fr)', gap: 2 }}>
          <div />{['Menor', 'Moderado', 'Major', 'Catastrófico'].map(c => <div key={c} style={{ fontSize: 7, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: 600, padding: 4 }}>{c}</div>)}
          {['>1e-2', '1e-3–1e-2', '1e-5–1e-3', '<1e-5'].map((pRange, pi) => (
            <>{[pRange].map(p => <div key={p} style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 4px' }}>{p}</div>)}{
              ['acceptable', pi === 0 ? 'alarp_low' : 'acceptable', pi < 2 ? 'alarp_high' : pi === 2 ? 'alarp_low' : 'acceptable', pi === 0 ? 'intolerable' : pi === 1 ? 'intolerable' : pi === 2 ? 'alarp_high' : 'alarp_low'].map((level, ci) => (
                <div key={`${pi}-${ci}`} style={{ background: `${riskColors[level]}22`, border: `1px solid ${riskColors[level]}33`, borderRadius: 4, padding: 6, textAlign: 'center', fontSize: 6, color: riskColors[level], fontWeight: 700, textTransform: 'uppercase' }}>
                  {level === 'intolerable' ? 'INTOLERÁVEL' : level === 'alarp_high' ? 'ALARP↑' : level === 'alarp_low' ? 'ALARP↓' : 'ACEITÁVEL'}
                </div>
              ))
            }</>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 7, color: 'rgba(255,255,255,0.12)' }}>
        IEC 62502:2010 · ICOLD B.130 · ALARP (HSE UK, 2001) · FMEA: IEC 60812
      </div>
    </div>
  );
}
