/** SirenControl.tsx — Emergency sirens • Endpoints: GET/POST /sirens/:structureId */
import { useShmsSirens, useShmsSirenActivate } from '@/hooks/useShmsApi';
import { useState } from 'react';
export default function SirenControl({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsSirens(structureId);
  const activate = useShmsSirenActivate();
  const [confirm, setConfirm] = useState(false);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  const sirens = (data?.sirens ?? []) as any[];
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">📢 Controle de Sirenes</span></div>
      <div className="shms-card" style={{ borderColor: 'var(--shms-red-border)' }}>
        <div className="shms-card__header" style={{ background: 'var(--shms-red-bg)' }}>
          <span className="shms-card__title" style={{ color: 'var(--shms-red)' }}>⚠ Ativação de Emergência</span>
        </div>
        <div className="shms-card__body" style={{ textAlign: 'center' }}>
          {!confirm ? (
            <button className="shms-btn shms-btn--danger" style={{ fontSize: 'var(--shms-fs-md)', padding: 'var(--shms-sp-3) var(--shms-sp-6)' }}
              onClick={() => setConfirm(true)}>🔔 Ativar Sirene de Emergência</button>
          ) : (
            <div>
              <div style={{ fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-red)', marginBottom: 'var(--shms-sp-3)', fontWeight: 600 }}>Confirma ativação da sirene de emergência?</div>
              <div style={{ display: 'flex', gap: 'var(--shms-sp-2)', justifyContent: 'center' }}>
                <button className="shms-btn shms-btn--danger" onClick={() => { activate.mutate({ structureId, body: { type: 'emergency' } }); setConfirm(false); }}>
                  ✅ Confirmar
                </button>
                <button className="shms-btn" onClick={() => setConfirm(false)}>Cancelar</button>
              </div>
            </div>
          )}
          {sirens.length > 0 && (
            <div style={{ marginTop: 'var(--shms-sp-4)', fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>
              {sirens.length} sirene(s) cadastrada(s)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
