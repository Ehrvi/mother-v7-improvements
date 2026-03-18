/** BoreholeViewer.tsx — Lithologic profiles • Endpoint: GET /boreholes/:structureId */
import { useShmsBoreholes } from '@/hooks/useShmsApi';
export default function BoreholeViewer({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsBoreholes(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />;
  const boreholes = (data?.boreholes ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">🕳️ Sondagens / Perfis Litológicos</span></div>
      {boreholes.length === 0 ? (
        <div className="shms-empty"><div className="shms-empty__text">Nenhuma sondagem cadastrada</div></div>
      ) : (
        <div className="shms-grid-2">
          {boreholes.map((b: any, i: number) => (
            <div key={i} className="shms-card">
              <div className="shms-card__header"><span className="shms-card__title">{b.boreholeId ?? b.name ?? `BH-${i+1}`}</span></div>
              <div className="shms-card__body">
                {b.layers?.map((l: any, j: number) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--shms-border)' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: l.color ?? 'var(--shms-text-dim)', flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--shms-fs-sm)' }}>{l.material ?? l.name}</span>
                    <span className="mono" style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginLeft: 'auto' }}>{l.depth ?? l.from}–{l.to ?? '?'}m</span>
                  </div>
                )) ?? <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>{JSON.stringify(b).slice(0, 200)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
