/**
 * StabilityPanel.tsx — Bishop FOS + Monte Carlo probability of failure
 * Endpoint: GET /stability/:structureId
 */
import { useShmsStability } from '@/hooks/useShmsApi';

export default function StabilityPanel({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsStability(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />;
  const analyses = (data?.analyses ?? []) as any[];

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">⛰️ Análise de Estabilidade (Bishop)</span></div>
      {analyses.length === 0 ? (
        <div className="shms-empty"><div className="shms-empty__text">Nenhuma análise disponível para esta estrutura</div></div>
      ) : (
        <div className="shms-grid-2">
          {analyses.map((a: any, i: number) => (
            <div key={i} className="shms-card shms-animate-slide-in">
              <div className="shms-card__header">
                <span className="shms-card__title">Análise #{i + 1}</span>
                <span className={`shms-badge shms-badge--${(a.fos ?? a.factorOfSafety ?? 0) >= 1.5 ? 'green' : (a.fos ?? a.factorOfSafety ?? 0) >= 1.0 ? 'yellow' : 'red'}`}>
                  FOS: {(a.fos ?? a.factorOfSafety ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="shms-card__body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--shms-sp-3)' }}>
                  <div><span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Método</span><div style={{ fontWeight: 600 }}>Bishop Simplificado</div></div>
                  <div><span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Prob. Falha (Pf)</span><div style={{ fontWeight: 600, color: 'var(--shms-red)' }}>{(a.pf ?? a.probabilityOfFailure ?? 0).toExponential(2)}</div></div>
                  <div><span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Simulações MC</span><div className="mono">{a.monteCarloIterations ?? a.simulations ?? 'N/A'}</div></div>
                  <div><span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>β (confiabilidade)</span><div className="mono">{(a.reliabilityIndex ?? a.beta ?? 0).toFixed(2)}</div></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
