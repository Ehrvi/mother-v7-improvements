/**
 * RULPredictionPanel.tsx — Remaining Useful Life prediction (P10/P50/P90)
 * Endpoint: GET /rul/:structureId
 * Cognitive: predictive health curve, confidence bands, degradation rate indicator
 */
import { useShmsRUL } from '@/hooks/useShmsApi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

export default function RULPredictionPanel({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsRUL(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 350, borderRadius: 'var(--shms-radius)' }} />;

  const rul = data?.rulDays ?? { p10: 0, p50: 0, p90: 0 };
  const bands = [
    { label: 'P10 (pessimista)', days: rul.p10, color: 'var(--shms-red)' },
    { label: 'P50 (mediana)', days: rul.p50, color: 'var(--shms-yellow)' },
    { label: 'P90 (otimista)', days: rul.p90, color: 'var(--shms-green)' },
  ];

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">⏳ Vida Útil Remanescente (RUL)</span></div>
      <div className="shms-grid-4" style={{ marginBottom: 'var(--shms-sp-4)' }}>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Saúde Atual</div>
          <div className="shms-kpi__value" style={{ color: (data?.currentHealth ?? 0) > 70 ? 'var(--shms-green)' : 'var(--shms-orange)' }}>
            {((data?.currentHealth ?? 0) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Taxa Degradação</div>
          <div className="shms-kpi__value" style={{ color: 'var(--shms-orange)' }}>{(data?.degradationRate ?? 0).toFixed(4)}/dia</div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Limiar Crítico</div>
          <div className="shms-kpi__value">{((data?.criticalThreshold ?? 0) * 100).toFixed(0)}%</div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Dias Analisados</div>
          <div className="shms-kpi__value">{data?.daysAnalysed ?? 0}</div>
        </div>
      </div>
      <div className="shms-card">
        <div className="shms-card__header">
          <span className="shms-card__title">🧠 Previsão Bootstrap (Paris-Erdogan + Efron)</span>
          {data?.usedFallback && <span className="shms-badge shms-badge--yellow">Fallback</span>}
        </div>
        <div className="shms-card__body" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bands} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--shms-border)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--shms-text-dim)' }} label={{ value: 'dias', position: 'insideBottomRight', fontSize: 10, fill: 'var(--shms-text-dim)' }} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: 'var(--shms-text-dim)' }} width={120} />
              <Tooltip contentStyle={{ background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="days" radius={[0, 6, 6, 0]}>
                {bands.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
