/** ExportPanel.tsx — Export CSV/JSON/Excel/Word • Endpoint: POST /export */
import { useShmsExport } from '@/hooks/useShmsApi';
import { useState } from 'react';
export default function ExportPanel({ structureId }: { structureId: string }) {
  const exportMut = useShmsExport();
  const [msg, setMsg] = useState('');
  const doExport = (format: string) => {
    exportMut.mutate({ structureId, format }, { onSuccess: () => setMsg(`✅ Exportação ${format.toUpperCase()} solicitada`), onError: (e: any) => setMsg(`❌ ${e.message}`) });
  };
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">💾 Exportar Dados</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-text-secondary)', marginBottom: 'var(--shms-sp-4)' }}>
          Exportar dados da estrutura <span className="mono">{structureId || 'todas'}</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--shms-sp-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['csv', 'json', 'excel', 'word'].map(f => (
            <button key={f} className="shms-btn" onClick={() => doExport(f)} disabled={exportMut.isPending}>
              📥 {f.toUpperCase()}
            </button>
          ))}
        </div>
        {msg && <div style={{ marginTop: 'var(--shms-sp-3)', fontSize: 'var(--shms-fs-sm)' }}>{msg}</div>}
      </div></div>
    </div>
  );
}
