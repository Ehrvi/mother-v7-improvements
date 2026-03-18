/** DocumentLibrary.tsx • Endpoint: GET /documents/:id */
import { useShmsDocuments } from '@/hooks/useShmsApi';
export default function DocumentLibrary({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsDocuments(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  const docs = (data?.documents ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📄 Documentos</span><span className="shms-section-header__count">{docs.length}</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ padding: 0 }}>
        {docs.length === 0 ? <div className="shms-empty"><div className="shms-empty__text">Nenhum documento cadastrado</div></div> : (
          <table className="shms-table"><thead><tr><th>Título</th><th>Tipo</th><th>Data</th></tr></thead><tbody>
            {docs.map((d: any, i: number) => (
              <tr key={i}><td>{d.title ?? d.name}</td><td>{d.type ?? '—'}</td><td style={{ fontSize: 'var(--shms-fs-xs)' }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString('pt-BR') : '—'}</td></tr>
            ))}
          </tbody></table>
        )}
      </div></div>
    </div>
  );
}
