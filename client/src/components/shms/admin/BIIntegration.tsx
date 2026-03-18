/** BIIntegration.tsx • Endpoint: POST /bi/push */
import { useShmsBIPush } from '@/hooks/useShmsApi';
import { useState } from 'react';
export default function BIIntegration({ structureId }: { structureId: string }) {
  const push = useShmsBIPush();
  const [msg, setMsg] = useState('');
  const doPush = (sink: string) => {
    push.mutate({ structureId, sink }, { onSuccess: () => setMsg(`✅ Push ${sink} enviado`), onError: (e: any) => setMsg(`❌ ${e.message}`) });
  };
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📊 BI Integration</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-text-secondary)', marginBottom: 'var(--shms-sp-4)' }}>
          Enviar dados para plataformas de Business Intelligence
        </div>
        <div style={{ display: 'flex', gap: 'var(--shms-sp-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Power BI', 'Tableau', 'Grafana', 'Metabase'].map(s => (
            <button key={s} className="shms-btn" onClick={() => doPush(s.toLowerCase().replace(' ', '-'))} disabled={push.isPending}>📡 {s}</button>
          ))}
        </div>
        {msg && <div style={{ marginTop: 'var(--shms-sp-3)', fontSize: 'var(--shms-fs-sm)' }}>{msg}</div>}
      </div></div>
    </div>
  );
}
