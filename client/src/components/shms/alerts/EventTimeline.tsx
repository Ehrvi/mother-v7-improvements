/** EventTimeline.tsx • Endpoint: GET /events/:structureId */
import { useShmsEvents } from '@/hooks/useShmsApi';
export default function EventTimeline({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsEvents(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />;
  const events = (data?.events ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📅 Timeline de Eventos</span><span className="shms-section-header__count">{events.length}</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ maxHeight: 500, overflowY: 'auto' }}>
        {events.length === 0 ? <div className="shms-empty"><div className="shms-empty__text">Nenhum evento registrado</div></div> : (
          <div style={{ borderLeft: '2px solid var(--shms-border)', paddingLeft: 'var(--shms-sp-4)', display: 'grid', gap: 'var(--shms-sp-3)' }}>
            {events.map((e: any, i: number) => (
              <div key={i} style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: -22, top: 4, width: 8, height: 8, borderRadius: '50%', background: 'var(--shms-accent)' }} />
                <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>{e.timestamp ? new Date(e.timestamp).toLocaleString('pt-BR') : ''}</div>
                <div style={{ fontSize: 'var(--shms-fs-sm)', fontWeight: 500 }}>{e.description ?? e.type ?? e.message ?? JSON.stringify(e).slice(0, 100)}</div>
              </div>
            ))}
          </div>
        )}
      </div></div>
    </div>
  );
}
