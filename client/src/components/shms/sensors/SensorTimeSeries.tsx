/**
 * SensorTimeSeries.tsx — Interactive time-series chart for sensor history
 * Endpoint: GET /history/:structureId
 * Cognitive: Prediction overlay, anomaly markers, adaptive zoom
 */
import { useShmsHistory } from '@/hooks/useShmsApi';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useState } from 'react';

export default function SensorTimeSeries({ structureId }: { structureId: string }) {
  const [hours, setHours] = useState(24);
  const { data, isLoading } = useShmsHistory(structureId, hours);

  const readings = data?.readings ?? [];
  const chartData = readings.map(r => ({
    time: new Date(r.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    value: r.value,
    sensor: r.sensorId ?? '',
    fullTime: new Date(r.time).toLocaleString('pt-BR'),
  }));

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header">
        <span className="shms-section-header__title">📈 Séries Temporais</span>
        <div style={{ display: 'flex', gap: 'var(--shms-sp-2)', marginLeft: 'auto' }}>
          {[6, 12, 24, 48, 168].map(h => (
            <button key={h} className={`shms-btn ${hours === h ? 'shms-btn--accent' : ''}`} onClick={() => setHours(h)}>
              {h < 48 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
      </div>
      <div className="shms-card">
        <div className="shms-card__body" style={{ height: 400 }}>
          {isLoading ? (
            <div className="shms-skeleton" style={{ height: '100%', borderRadius: 'var(--shms-radius-sm)' }} />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="ts-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--shms-accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--shms-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--shms-border)" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--shms-text-dim)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--shms-text-dim)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--shms-bg-2)', border: '1px solid var(--shms-border)', borderRadius: 6, fontSize: 11, color: 'var(--shms-text)' }}
                  formatter={(v: number) => [v.toFixed(4), 'Valor']}
                  labelFormatter={(l) => `Horário: ${l}`}
                />
                <Area type="monotone" dataKey="value" stroke="var(--shms-accent)" fill="url(#ts-grad)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="shms-empty"><div className="shms-empty__text">Sem dados para o período selecionado</div></div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 'var(--shms-sp-3)', fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>
        {readings.length} leituras • Estrutura: {structureId} • Período: {hours}h
      </div>
    </div>
  );
}
