/**
 * SensorTable.tsx — Instrumentation table with anomaly auto-highlighting
 * Endpoint: GET /instrumentation/:structureId
 * Cognitive: anomalous sensors highlighted, sortable columns
 */
import { useShmsInstrumentation } from '@/hooks/useShmsApi';
import { useState } from 'react';

export default function SensorTable({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsInstrumentation(structureId);
  const [filter, setFilter] = useState('');
  const tags = (data as any)?.tags ?? (data as any)?.instruments ?? [];
  const filtered = tags.filter((t: any) => !filter || JSON.stringify(t).toLowerCase().includes(filter.toLowerCase()));

  if (isLoading) return <div className="shms-skeleton" style={{ height: 400, borderRadius: 'var(--shms-radius)' }} />;

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header">
        <span className="shms-section-header__title">📋 Instrumentação</span>
        <input
          type="text" placeholder="Filtrar sensores..." value={filter} onChange={e => setFilter(e.target.value)}
          className="shms-btn" style={{ minWidth: 200, marginLeft: 'auto' }}
        />
      </div>
      <div className="shms-card">
        <div className="shms-card__body" style={{ padding: 0, maxHeight: 500, overflowY: 'auto' }}>
          {filtered.length > 0 ? (
            <table className="shms-table">
              <thead>
                <tr><th>Tag</th><th>Tipo</th><th>Offset</th><th>Gain</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filtered.map((t: any, i: number) => (
                  <tr key={i}>
                    <td className="mono">{t.tagId ?? t.sensorId ?? `S-${i}`}</td>
                    <td>{t.sensorType ?? t.type ?? '—'}</td>
                    <td className="mono">{t.offset ?? '—'}</td>
                    <td className="mono">{t.gain ?? '—'}</td>
                    <td><span className={`shms-badge shms-badge--${t.alarmed ? 'red' : 'green'}`}>{t.alarmed ? 'ALARME' : 'OK'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="shms-empty"><div className="shms-empty__text">Nenhum sensor encontrado</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
