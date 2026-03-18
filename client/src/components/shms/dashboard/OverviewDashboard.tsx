/**
 * OverviewDashboard.tsx — Main SHMS overview with KPIs, structure cards, and AI insights
 *
 * Endpoints consumed: dashboard/all, health, bridge/stats
 * Design basis:
 * - Few (2013): KPIs at top for instant situational awareness
 * - HPHMI: Grayscale baseline, color = alarm severity
 * - Cognitive UI: AI insight feed, predictive health rings, anomaly highlighting
 */

import { useShmsDashboardAll, useShmsBridgeStats, type StructureData } from '@/hooks/useShmsApi';
import type { ShmsView } from '@/components/shms/SHMSSidebar';

interface OverviewDashboardProps {
  onSelectStructure: (id: string) => void;
  onNavigate: (view: ShmsView) => void;
}

function HealthRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 80 ? 'var(--shms-green)' : value >= 50 ? 'var(--shms-yellow)' : 'var(--shms-red)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--shms-border)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${(value / 100) * circ} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.25} fontWeight="700" fill="var(--shms-text)">{value.toFixed(0)}</text>
    </svg>
  );
}

function icoldColor(status: string) {
  switch (status) {
    case 'RED': return 'red';
    case 'YELLOW': return 'yellow';
    default: return 'green';
  }
}

function StructureCard({ structure, onClick }: { structure: StructureData; onClick: () => void }) {
  const health = structure.healthIndex ?? (structure.overallStatus === 'GREEN' ? 92 : structure.overallStatus === 'YELLOW' ? 65 : 30);
  const anomalies = structure.sensors?.filter(s => s.icoldLevel !== 'GREEN').length ?? 0;

  return (
    <button className="shms-card shms-animate-slide-in" onClick={onClick} style={{ cursor: 'pointer', width: '100%', textAlign: 'left', background: 'var(--shms-bg-1)' }}>
      <div className="shms-card__header">
        <span className="shms-card__title">
          <span className={`shms-badge shms-badge--${icoldColor(structure.overallStatus)}`}>
            {structure.overallStatus}
          </span>
          {structure.structureName || structure.structureId}
        </span>
        <HealthRing value={health} size={36} />
      </div>
      <div className="shms-card__body" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--shms-sp-3)' }}>
        <div>
          <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Sensores</div>
          <div style={{ fontSize: 'var(--shms-fs-md)', fontWeight: 600 }}>{structure.sensors?.length ?? 0}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Alertas</div>
          <div style={{ fontSize: 'var(--shms-fs-md)', fontWeight: 600, color: structure.activeAlerts > 0 ? 'var(--shms-red)' : 'var(--shms-text)' }}>
            {structure.activeAlerts}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>Anomalias</div>
          <div style={{ fontSize: 'var(--shms-fs-md)', fontWeight: 600, color: anomalies > 0 ? 'var(--shms-orange)' : 'var(--shms-text)' }}>
            {anomalies}
          </div>
        </div>
        {structure.lstmPrediction && (
          <div style={{ gridColumn: 'span 3', marginTop: 'var(--shms-sp-2)', padding: 'var(--shms-sp-2)', background: 'var(--shms-blue-bg)', borderRadius: 'var(--shms-radius-sm)', border: '1px solid var(--shms-blue-border)' }}>
            <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-blue)', display: 'flex', alignItems: 'center', gap: 4 }}>
              🧠 Previsão LSTM: {structure.lstmPrediction.trend} — confiança {(structure.lstmPrediction.confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

export default function OverviewDashboard({ onSelectStructure, onNavigate }: OverviewDashboardProps) {
  const { data, isLoading, error } = useShmsDashboardAll();
  const { data: bridge } = useShmsBridgeStats();

  if (isLoading) {
    return (
      <div className="shms-animate-slide-in">
        <div className="shms-grid-4" style={{ marginBottom: 'var(--shms-sp-5)' }}>
          {[1,2,3,4].map(i => <div key={i} className="shms-skeleton" style={{ height: 80, borderRadius: 'var(--shms-radius)' }} />)}
        </div>
        <div className="shms-grid-3">
          {[1,2,3].map(i => <div key={i} className="shms-skeleton" style={{ height: 180, borderRadius: 'var(--shms-radius)' }} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shms-empty">
        <div className="shms-empty__icon">⚠️</div>
        <div className="shms-empty__text">Falha ao carregar dashboard: {(error as Error).message}</div>
        <button className="shms-btn" onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    );
  }

  const structures = data?.structures ?? [];
  const totalSensors = structures.reduce((n, s) => n + (s.sensors?.length ?? 0), 0);
  const greenCount = structures.filter(s => s.overallStatus === 'GREEN').length;
  const anomalySensors = structures.reduce((n, s) => n + (s.sensors?.filter(x => x.icoldLevel !== 'GREEN').length ?? 0), 0);
  const bridgeStatus = bridge?.status === 'ok' ? 'Operacional' : 'N/A';

  return (
    <div className="shms-animate-slide-in">
      {/* KPI Cards — Few (2013): instant situational awareness */}
      <div className="shms-grid-4" style={{ marginBottom: 'var(--shms-sp-5)' }}>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Saúde Média <span className={`shms-badge shms-badge--${(data?.avgHealthScore ?? 0) >= 80 ? 'green' : 'yellow'}`} style={{ fontSize: 9 }}>{(data?.avgHealthScore ?? 0).toFixed(0)}%</span></div>
          <div className="shms-kpi__value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HealthRing value={data?.avgHealthScore ?? 0} size={48} />
          </div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Estruturas <span className="shms-badge shms-badge--green" style={{ fontSize: 9 }}>{greenCount}/{structures.length} OK</span></div>
          <div className="shms-kpi__value">{structures.length}</div>
          <div className="shms-kpi__sub">{totalSensors} sensores ativos</div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Alertas Ativos <span className={`shms-badge shms-badge--${(data?.activeAlerts ?? 0) > 0 ? 'red' : 'green'}`} style={{ fontSize: 9 }}>{(data?.activeAlerts ?? 0) > 0 ? 'ATENÇÃO' : 'OK'}</span></div>
          <div className="shms-kpi__value" style={{ color: (data?.activeAlerts ?? 0) > 0 ? 'var(--shms-red)' : 'var(--shms-green)' }}>
            {data?.activeAlerts ?? 0}
          </div>
          <div className="shms-kpi__sub">{anomalySensors} sensores anômalos</div>
        </div>
        <div className="shms-kpi">
          <div className="shms-kpi__label">Pipeline <span className="shms-badge shms-badge--blue" style={{ fontSize: 9 }}>{bridgeStatus}</span></div>
          <div className="shms-kpi__value" style={{ fontSize: 'var(--shms-fs-md)' }}>MQTT → TimescaleDB</div>
          <div className="shms-kpi__sub">{data?.totalReadings?.toLocaleString() ?? 0} leituras totais</div>
        </div>
      </div>

      {/* AI Cognitive Insight Banner — real-time cognitive element */}
      {data?.alerts && data.alerts.length > 0 && (
        <div style={{
          marginBottom: 'var(--shms-sp-4)',
          padding: 'var(--shms-sp-3) var(--shms-sp-4)',
          background: 'var(--shms-red-bg)',
          border: '1px solid var(--shms-red-border)',
          borderRadius: 'var(--shms-radius)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--shms-sp-2)',
          cursor: 'pointer',
        }} onClick={() => onNavigate('alerts')}>
          <span style={{ fontSize: 18 }}>🧠</span>
          <div>
            <div style={{ fontSize: 'var(--shms-fs-sm)', fontWeight: 600, color: 'var(--shms-red)' }}>
              AI Cognitivo: {data.alerts.length} alerta(s) ativo(s) requerem atenção
            </div>
            <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)' }}>
              Clique para ver detalhes e acionar resposta via Cognitive Bridge
            </div>
          </div>
        </div>
      )}

      {/* Structure Cards */}
      <div className="shms-section-header">
        <span className="shms-section-header__title">Estruturas Monitoradas</span>
        <span className="shms-section-header__count">{structures.length} estrutura(s)</span>
      </div>
      {structures.length === 0 ? (
        <div className="shms-empty">
          <div className="shms-empty__icon">🏗️</div>
          <div className="shms-empty__text">Nenhuma estrutura configurada. Configure sensores via ingestão de dados.</div>
          <button className="shms-btn shms-btn--accent" onClick={() => onNavigate('ingest-status')}>Configurar Ingestão</button>
        </div>
      ) : (
        <div className="shms-grid-3">
          {structures.map(s => (
            <StructureCard key={s.structureId} structure={s} onClick={() => onSelectStructure(s.structureId)} />
          ))}
        </div>
      )}
    </div>
  );
}
