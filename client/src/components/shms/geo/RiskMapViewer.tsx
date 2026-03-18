/** RiskMapViewer.tsx — Risk polygons (ICOLD colors) • Endpoint: GET /risk-map/:structureId */
import { useShmsRiskMap } from '@/hooks/useShmsApi';
export default function RiskMapViewer({ structureId }: { structureId: string }) {
  const { data, isLoading } = useShmsRiskMap(structureId);
  if (isLoading) return <div className="shms-skeleton" style={{ height: 400, borderRadius: 'var(--shms-radius)' }} />;
  const zones = (data?.zones ?? []) as any[];
  const snapshot = data?.snapshot as any;
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">🗺️ Mapa de Risco (ICOLD)</span></div>
      <div className="shms-card"><div className="shms-card__body" style={{ minHeight: 300 }}>
        {zones.length > 0 ? (
          <div style={{ display: 'grid', gap: 'var(--shms-sp-3)' }}>
            {zones.map((z: any, i: number) => {
              const color = z.riskLevel === 'high' || z.riskLevel === 'critical' ? 'red' : z.riskLevel === 'medium' ? 'yellow' : 'green';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--shms-sp-3)', padding: 'var(--shms-sp-3)', background: 'var(--shms-bg-2)', borderRadius: 'var(--shms-radius-sm)', borderLeft: `3px solid var(--shms-${color})` }}>
                  <span className={`shms-badge shms-badge--${color}`}>{z.riskLevel ?? 'N/A'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--shms-fs-sm)' }}>{z.name ?? z.zoneId ?? `Zona ${i+1}`}</div>
                    <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>{z.description ?? `Score: ${z.riskScore?.toFixed(2) ?? 'N/A'}`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="shms-empty"><div className="shms-empty__text">Nenhuma zona de risco mapeada</div></div>
        )}
      </div></div>
    </div>
  );
}
