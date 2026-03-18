/** BigDataPanel.tsx — Behavior classification • Endpoint: GET /big-data/:structureId */
import { useShmsBigData } from '@/hooks/useShmsApi';
export default function BigDataPanel({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsBigData(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  const caps = (data as any)?.capabilities ?? (data as any)?.classifications ?? [];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">🧮 Big Data / Classificação Comportamental</span></div>
      <div className="shms-card"><div className="shms-card__body">
        {Array.isArray(caps) && caps.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--shms-sp-2)' }}>
            {caps.map((c: any, i: number) => (
              <li key={i} style={{ padding: 'var(--shms-sp-2) var(--shms-sp-3)', background: 'var(--shms-bg-2)', borderRadius: 'var(--shms-radius-sm)', fontSize: 'var(--shms-fs-sm)' }}>
                {typeof c === 'string' ? c : JSON.stringify(c)}
              </li>
            ))}
          </ul>
        ) : (
          <div className="shms-empty"><div className="shms-empty__text">Módulo Big Data disponível — configure a classificação</div></div>
        )}
      </div></div>
    </div>
  );
}
