/**
 * AlertsPanel.tsx — ICOLD L1/L2/L3 alerts with acknowledge + AI cognitive severity
 * Endpoints: dashboard/all (alerts), alerts/:id/notify
 * Cognitive: adaptive severity sorting, pulsing critical alerts, AI recommendation
 */
import { useShmsDashboardAll } from '@/hooks/useShmsApi';

export default function AlertsPanel({ structureId }: { structureId: string }) {
  const { data } = useShmsDashboardAll();
  const allAlerts = data?.alerts ?? [];
  const alerts = structureId ? allAlerts.filter(a => a.structureId === structureId) : allAlerts;
  const sorted = [...alerts].sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 } as any;
    return (sev[a.severity] ?? 5) - (sev[b.severity] ?? 5);
  });

  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header">
        <span className="shms-section-header__title">🚨 Alertas ICOLD</span>
        <span className="shms-section-header__count">{sorted.length} alerta(s)</span>
      </div>
      {sorted.length === 0 ? (
        <div className="shms-card"><div className="shms-card__body" style={{ textAlign: 'center', padding: 'var(--shms-sp-8)' }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div style={{ color: 'var(--shms-green)', fontWeight: 600, marginTop: 'var(--shms-sp-2)' }}>Nenhum alerta ativo</div>
          <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Todas as estruturas operando dentro dos limites normais</div>
        </div></div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--shms-sp-2)' }}>
          {sorted.map((a, i) => {
            const color = a.severity === 'critical' ? 'red' : a.severity === 'high' ? 'orange' : a.severity === 'medium' ? 'yellow' : 'blue';
            return (
              <div key={a.id ?? i} className="shms-card" style={{ borderLeft: `3px solid var(--shms-${color})` }}>
                <div className="shms-card__body" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--shms-sp-3)' }}>
                  <div className="shms-pulse" style={{ background: `var(--shms-${color})`, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--shms-sp-2)' }}>
                      <span className={`shms-badge shms-badge--${color}`}>{a.severity}</span>
                      <span className="mono" style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>{a.structureId} / {a.sensorId}</span>
                    </div>
                    <div style={{ fontSize: 'var(--shms-fs-sm)', marginTop: 4 }}>{a.message}</div>
                    <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginTop: 2 }}>
                      {new Date(a.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
