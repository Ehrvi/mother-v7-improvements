/**
 * FTAReportPanel.tsx — Automated Normative Report Generator
 * Standards: ANM Res. 95/2022, GISTM 2020, ICOLD B.130/194, ABNT NBR 13028
 */
import { useMemo } from 'react';
import { type FTNode, type CutSet, type ImportanceMeasure, type MCResult, probColor, probTag, generateReportData, getAuditChain, verifyAuditChain, runMonteCarlo } from './FaultTreeEngine';

interface Props {
  structureId: string;
  ftNodes: Map<string, FTNode>;
  topProb: number;
  cutSets: CutSet[];
  importance: ImportanceMeasure[];
}

export default function FTAReportPanel({ structureId, ftNodes, topProb, cutSets, importance }: Props) {
  const glass: React.CSSProperties = { background: 'rgba(10,12,20,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 };
  const mc = useMemo(() => runMonteCarlo(ftNodes, 'TOP', 5000), [ftNodes]);
  const report = useMemo(() => generateReportData(structureId, ftNodes, topProb, cutSets, importance, mc), [structureId, ftNodes, topProb, cutSets, importance, mc]);
  const auditChain = getAuditChain();
  const chainValid = verifyAuditChain();

  const handleExportHTML = () => {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório FTA — ${structureId}</title>
    <style>body{font-family:'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#222}
    h1{color:#0a2540;border-bottom:3px solid #0a66c2;padding-bottom:8px}h2{color:#0a4a7a;margin-top:32px}
    table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
    th{background:#f0f4f8;font-weight:600}.badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
    .critical{background:#fee;color:#c00}.alert{background:#fff3e0;color:#e65100}
    .normal{background:#e8f5e9;color:#2e7d32}.footer{margin-top:40px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:12px}</style></head>
    <body><h1>📋 Relatório de Análise por Árvore de Falhas (FTA)</h1>
    <p><strong>Estrutura:</strong> ${structureId} · <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')} · <strong>Norma:</strong> ${report.standard}</p>
    <h2>1. Sumário Executivo</h2><p>Probabilidade do evento topo (ruptura): <strong>${topProb.toExponential(2)}/ano</strong>
    — Classificação: <span class="badge ${topProb >= 1e-2 ? 'critical' : topProb >= 1e-3 ? 'alert' : 'normal'}">${probTag(topProb)}</span></p>
    <p>Monte Carlo (N=5000, Lognormal σ=0.5): P5=${mc.p5.toExponential(2)} · P50=${mc.p50.toExponential(2)} · P95=${mc.p95.toExponential(2)}</p>
    <h2>2. Cut Sets Mínimos (Top ${cutSets.length})</h2><table><tr><th>#</th><th>Eventos</th><th>Ordem</th><th>P(/ano)</th></tr>
    ${cutSets.slice(0, 10).map((cs, i) => `<tr><td>${i + 1}</td><td>${cs.events.map(e => ftNodes.get(e)?.label ?? e).join(' ∧ ')}</td><td>${cs.order}</td><td>${cs.probability.toExponential(2)}</td></tr>`).join('')}</table>
    <h2>3. Medidas de Importância (Fussell-Vesely)</h2><table><tr><th>Evento</th><th>F-V</th><th>Birnbaum</th><th>RAW</th><th>RRW</th></tr>
    ${importance.slice(0, 8).map(im => `<tr><td>${im.label}</td><td>${im.fv.toFixed(4)}</td><td>${im.birnbaum.toExponential(1)}</td><td>${im.raw.toFixed(1)}</td><td>${im.rrw > 99 ? '∞' : im.rrw.toFixed(1)}</td></tr>`).join('')}</table>
    <h2>4. Recomendações Prioritárias</h2><ol>${report.recommendations.map(r => `<li>${r}</li>`).join('')}</ol>
    <h2>5. Integridade do Registro</h2><p>Hash Chain: ${chainValid ? '✅ Válida' : '❌ Adulterada'} · Registros: ${auditChain.length}</p>
    <div class="footer"><p>Gerado automaticamente por MOTHER FTA Module v2.0 · ${report.standard}</p>
    <p>IEC 61025:2006 · ICOLD B.121/130/194 · GISTM 2020 §8 · NUREG-0492 · Vesely (1981) · Fussell-Vesely (1975)</p></div></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `FTA_Report_${structureId}_${new Date().toISOString().split('T')[0]}.html`;
    a.click(); URL.revokeObjectURL(url);
  };

  const templates = [
    { id: 'anm', name: 'ANM Res. 95/2022', icon: '🇧🇷', desc: 'RISR — Relatório de Inspeção de Segurança Regular', color: '#00c853' },
    { id: 'gistm', name: 'GISTM 2020', icon: '🌍', desc: 'Knowledge Base Assessment Report', color: '#0af' },
    { id: 'icold', name: 'ICOLD B.130', icon: '🏛️', desc: 'Quantitative Risk Assessment Report', color: '#c8f' },
    { id: 'nbr', name: 'ABNT NBR 13028', icon: '📐', desc: 'Relatório de Segurança de Barragens de Mineração', color: '#ff8844' },
  ];

  return (
    <div style={{ ...glass, flex: 1, overflow: 'auto', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>
        📋 Geração de Relatórios Normativos — ANM · GISTM · ICOLD · ABNT
      </div>

      {/* Template selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {templates.map(t => (
          <button key={t.id} onClick={handleExportHTML}
            style={{ background: `${t.color}08`, border: `1px solid ${t.color}22`, borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}>
            <div style={{ fontSize: 18 }}>{t.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.color, marginTop: 4 }}>{t.name}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Report preview */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          📋 Preview do Relatório
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${probColor(topProb)}22`, color: probColor(topProb), fontWeight: 700 }}>{probTag(topProb)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 11 }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Dados Estruturais</div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Estrutura: <strong style={{ color: '#0af' }}>{structureId}</strong></div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>P(Top): <strong style={{ color: probColor(topProb) }}>{topProb.toExponential(2)}/ano</strong></div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Cut Sets: <strong style={{ color: '#0af' }}>{cutSets.length}</strong></div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Nós da Árvore: <strong style={{ color: '#c8f' }}>{ftNodes.size}</strong></div>
          </div>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Monte Carlo</div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>P5: <strong style={{ color: '#00ff88' }}>{mc.p5.toExponential(2)}</strong></div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>P50: <strong style={{ color: '#ffcc00' }}>{mc.p50.toExponential(2)}</strong></div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>P95: <strong style={{ color: '#ff3344' }}>{mc.p95.toExponential(2)}</strong></div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Convergido: <strong style={{ color: mc.converged ? '#00ff88' : '#ff8844' }}>{mc.converged ? 'Sim' : 'Não'}</strong></div>
          </div>
        </div>

        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', marginBottom: 6 }}>Top 5 Recomendações</div>
          {report.recommendations.map((r, i) => (
            <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
              {i + 1}. {r}
            </div>
          ))}
        </div>
      </div>

      {/* Audit chain */}
      <div style={{ background: chainValid ? 'rgba(0,255,136,0.04)' : 'rgba(255,50,60,0.06)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${chainValid ? 'rgba(0,255,136,0.15)' : 'rgba(255,50,60,0.2)'}` }}>
        <div style={{ fontSize: 10, color: chainValid ? '#00ff88' : '#ff3344', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          {chainValid ? '🔒' : '⚠️'} Hash Chain Audit — {chainValid ? 'ÍNTEGRA' : 'ADULTERADA'}
          <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>· SHA-256 · {auditChain.length} registros</span>
        </div>
        {auditChain.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', maxHeight: 80, overflow: 'auto' }}>
            {auditChain.slice(-3).map(r => (
              <div key={r.id} style={{ marginBottom: 2 }}>#{r.id} [{r.timestamp.split('T')[1]?.slice(0, 8)}] P={r.topEventProbability.toExponential(2)} hash={r.hash.slice(0, 16)}…</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 9, color: 'rgba(255,255,255,0.12)' }}>
        ANM Res. 95/2022 · GISTM 2020 §8 · ICOLD B.130/194 · ABNT NBR 13028 · IEC 61025
      </div>
    </div>
  );
}
