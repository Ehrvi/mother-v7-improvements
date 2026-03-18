/**
 * SignalAnalysisPanel.tsx — FFT/PSD/DWT signal analysis results
 * Endpoint: GET /signal-analysis/:structureId
 */
import { useShmsSignalAnalysis } from '@/hooks/useShmsApi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

export default function SignalAnalysisPanel({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsSignalAnalysis(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 400, borderRadius: 'var(--shms-radius)' }} />;
  const sa = data?.signalAnalysis as any ?? {};
  const di = data?.damageIndex as any ?? {};
  const metrics = [
    { name: 'Freq. Fund.', value: sa.fundamentalFreqHz ?? 0, unit: 'Hz' },
    { name: 'MAC', value: sa.macValue ?? di.mac ?? 0, unit: '' },
    { name: 'RMS Δ', value: sa.rmsChangePct ?? di.rmsChange ?? 0, unit: '%' },
    { name: 'Damage Score', value: sa.compositeScore ?? di.compositeDamageIndex ?? 0, unit: '' },
    { name: 'WER', value: sa.werChange ?? di.werChange ?? 0, unit: '' },
  ];

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">🔬 Análise de Sinais (FFT/PSD/DWT)</span></div>
      <div className="shms-grid-3" style={{ marginBottom: 'var(--shms-sp-4)' }}>
        {metrics.map(m => (
          <div key={m.name} className="shms-kpi">
            <div className="shms-kpi__label">{m.name}</div>
            <div className="shms-kpi__value" style={{ color: m.name === 'Damage Score' && m.value > 0.5 ? 'var(--shms-red)' : 'var(--shms-text)' }}>
              {typeof m.value === 'number' ? m.value.toFixed(4) : m.value} <span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>{m.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="shms-card">
        <div className="shms-card__header"><span className="shms-card__title">Índices de Dano</span></div>
        <div className="shms-card__body" style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--shms-border)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--shms-text-dim)' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--shms-text-dim)' }} width={100} />
              <Tooltip contentStyle={{ background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {metrics.map((m, i) => (
                  <Cell key={i} fill={m.value > 0.7 ? 'var(--shms-red)' : m.value > 0.4 ? 'var(--shms-yellow)' : 'var(--shms-accent)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {data?.usedFallback && <div style={{ marginTop: 'var(--shms-sp-2)', fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>⚠ Dados de fallback (sem TimescaleDB)</div>}
    </div>
  );
}
