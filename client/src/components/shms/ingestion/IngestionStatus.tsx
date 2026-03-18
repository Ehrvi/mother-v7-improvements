/** IngestionStatus.tsx — 8 protocol connector statuses • Endpoint: GET /ingest/status */
import { useShmsIngestStatus } from '@/hooks/useShmsApi';
export default function IngestionStatus() {
  const { data, isLoading } = useShmsIngestStatus();
  if (isLoading) return <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />;
  const connectors = data?.connectors ?? [];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header">
        <span className="shms-section-header__title">🔌 Conectores de Ingestão</span>
        <span className="shms-section-header__count">{data?.activeProtocols ?? 0}/{data?.totalProtocols ?? 0} ativos</span>
      </div>
      <div className="shms-grid-2">
        {connectors.map(c => {
          const color = c.status === 'active' ? 'green' : c.status === 'standby' ? 'blue' : c.status === 'error' ? 'red' : 'yellow';
          return (
            <div key={c.protocol} className="shms-card">
              <div className="shms-card__header">
                <span className="shms-card__title" style={{ textTransform: 'uppercase' }}>{c.protocol}</span>
                <span className={`shms-badge shms-badge--${color}`}>{c.status}</span>
              </div>
              <div className="shms-card__body" style={{ fontSize: 'var(--shms-fs-xs)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <span style={{ color: 'var(--shms-text-dim)' }}>Ingeridos:</span><span className="mono">{c.totalIngested.toLocaleString()}</span>
                  <span style={{ color: 'var(--shms-text-dim)' }}>Rejeitados:</span><span className="mono">{c.totalRejected.toLocaleString()}</span>
                  <span style={{ color: 'var(--shms-text-dim)' }}>Última atividade:</span><span>{c.lastActivity ? new Date(c.lastActivity).toLocaleString('pt-BR') : '—'}</span>
                </div>
                <div style={{ marginTop: 'var(--shms-sp-2)', color: 'var(--shms-text-dim)' }}>Base: {c.scientificBasis}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
