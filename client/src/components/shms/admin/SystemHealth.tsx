/** SystemHealth.tsx — System health + bridge stats • Endpoints: GET /health, GET /bridge/stats, GET /status */
import { useShmsHealth, useShmsBridgeStats } from '@/hooks/useShmsApi';
export default function SystemHealth() {
  const { data: health, isLoading: hl } = useShmsHealth();
  const { data: bridge, isLoading: bl } = useShmsBridgeStats();
  if (hl || bl) return <div className="shms-skeleton" style={{ height: 200, borderRadius: 'var(--shms-radius)' }} />;
  return (
    <div className="shms-animate-slide-in">
      <div className="shms-section-header"><span className="shms-section-header__title">🖥️ Saúde do Sistema</span></div>
      <div className="shms-grid-3">
        <div className="shms-kpi">
          <div className="shms-kpi__label">Serviço</div>
          <div className="shms-kpi__value" style={{ color: health?.status === 'ok' ? 'var(--shms-green)' : 'var(--shms-red)' }}>
            {health?.status === 'ok' ? '✅ Online' : '⚠ Degradado'}
          </div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">MQTT</div>
          <div className="shms-kpi__value" style={{ color: health?.mqttConfigured ? 'var(--shms-green)' : 'var(--shms-yellow)' }}>
            {health?.mqttConfigured ? '🟢 Configurado' : '⚪ Não configurado'}
          </div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Pipeline Bridge</div>
          <div className="shms-kpi__value" style={{ color: bridge?.status === 'ok' ? 'var(--shms-green)' : 'var(--shms-yellow)' }}>
            {bridge?.status ?? 'N/A'}
          </div>
        </div>
      </div>
      {bridge?.stats && (
        <div className="shms-card" style={{ marginTop: 'var(--shms-sp-4)' }}><div className="shms-card__body">
          <pre style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--shms-font-mono)' }}>
            {JSON.stringify(bridge.stats, null, 2)}
          </pre>
        </div></div>
      )}
    </div>
  );
}
