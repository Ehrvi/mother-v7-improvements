/** CrossSectionViewer.tsx — Geological SVG • Endpoint: GET /cross-section/:structureId */
import { useShmsCrossSection } from '@/hooks/useShmsApi';
export default function CrossSectionViewer({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsCrossSection(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />;
  const sections = (data?.sections ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📐 Seções Transversais</span></div>
      {sections.length === 0 ? (
        <div className="shms-empty"><div className="shms-empty__text">Nenhuma seção transversal gerada</div></div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--shms-sp-4)' }}>
          {sections.map((s: any, i: number) => (
            <div key={i} className="shms-card">
              <div className="shms-card__header"><span className="shms-card__title">Seção #{i+1} — {s.name ?? s.sectionId ?? ''}</span></div>
              <div className="shms-card__body" style={{ textAlign: 'center' }}>
                {s.svg ? <div dangerouslySetInnerHTML={{ __html: s.svg }} style={{ maxWidth: '100%', overflow: 'auto' }} /> :
                 <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Propriedades: {JSON.stringify(s).slice(0, 200)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
