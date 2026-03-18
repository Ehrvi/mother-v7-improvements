/** FileManager.tsx • Endpoint: GET /files/:id */
import { useShmsFiles } from '@/hooks/useShmsApi';
export default function FileManager({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsFiles(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  const files = (data?.files ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📁 Arquivos</span><span className="shms-section-header__count">{files.length}</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ padding: 0 }}>
        {files.length === 0 ? <div className="shms-empty"><div className="shms-empty__text">Nenhum arquivo cadastrado</div></div> : (
          <table className="shms-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Tamanho</th><th>Data</th></tr></thead><tbody>
            {files.map((f: any, i: number) => (
              <tr key={i}><td>{f.name ?? f.filename}</td><td>{f.type ?? f.mimeType ?? '—'}</td><td className="mono">{f.size ?? '—'}</td><td style={{ fontSize: 'var(--shms-fs-xs)' }}>{f.createdAt ? new Date(f.createdAt).toLocaleDateString('pt-BR') : '—'}</td></tr>
            ))}
          </tbody></table>
        )}
      </div></div>
    </div>
  );
}
