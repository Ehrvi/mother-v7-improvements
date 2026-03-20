/**
 * SHMSTopbar.tsx — Global status bar with cognitive real-time indicators
 *
 * Design basis:
 * - Nielsen H1: Visibility of system status (always show health, MQTT, refresh)
 * - ISA-18.2 §5.4: Global alarm summary always visible
 * - HPHMI: Grayscale baseline, color only for alarms
 * - Adaptive severity: topbar border changes color based on worst active alert
 */

import { useShmsHealth, useShmsDashboardAll } from '@/hooks/useShmsApi';
import SHMSThemeSwitcher from './SHMSThemeSwitcher';

interface SHMSTopbarProps {
  currentTitle: string;
  selectedStructureId?: string;
  structures?: Array<{ structureId: string; structureName: string }>;
  onSelectStructure?: (id: string) => void;
}

export default function SHMSTopbar({ currentTitle, selectedStructureId, structures, onSelectStructure }: SHMSTopbarProps) {
  const { data: health } = useShmsHealth({ refetchInterval: 15_000 });
  const { data: dashboard, dataUpdatedAt } = useShmsDashboardAll();

  const mqttOk = health?.mqttConfigured ?? false;
  const avgHealth = dashboard?.avgHealthScore ?? 0;
  const alertCount = dashboard?.activeAlerts ?? 0;

  // Adaptive severity — determine worst state
  const worstLevel = alertCount > 5 ? 'red' : alertCount > 0 ? 'yellow' : 'green';

  // Time since last refresh
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const ageStr = lastUpdate
    ? `${Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s atrás`
    : '—';

  return (
    <header
      className="shms-topbar"
      style={{ borderBottomColor: worstLevel === 'red' ? 'var(--shms-red)' : worstLevel === 'yellow' ? 'var(--shms-yellow)' : 'var(--shms-border)' }}
      role="banner"
    >
      <div className="shms-topbar__left">
        <div>
          <div className="shms-topbar__title">{currentTitle}</div>
          <div className="shms-topbar__subtitle">MOTHER SHMS v4 — ISO 13374 / ICOLD 158</div>
        </div>
      </div>

      <div className="shms-topbar__right">
        {/* Theme Switcher (6 SOTA variations) */}
        <SHMSThemeSwitcher />

        {/* Structure selector */}
        {structures && structures.length > 0 && onSelectStructure && (
          <select
            value={selectedStructureId || ''}
            onChange={(e) => onSelectStructure(e.target.value)}
            className="shms-btn"
            style={{ minWidth: 140 }}
            aria-label="Selecionar estrutura"
          >
            <option value="">Todas estruturas</option>
            {structures.map(s => (
              <option key={s.structureId} value={s.structureId}>{s.structureName}</option>
            ))}
          </select>
        )}

        {/* Health Score Ring (cognitive indicator) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`Saúde: ${avgHealth.toFixed(0)}%`}>
          <svg width="28" height="28" viewBox="0 0 28 28" role="img" aria-label={`Saúde ${avgHealth.toFixed(0)}%`}>
            <circle cx="14" cy="14" r="11" fill="none" stroke="var(--shms-border)" strokeWidth="2.5" />
            <circle
              cx="14" cy="14" r="11" fill="none"
              stroke={avgHealth >= 80 ? 'var(--shms-green)' : avgHealth >= 50 ? 'var(--shms-yellow)' : 'var(--shms-red)'}
              strokeWidth="2.5"
              strokeDasharray={`${(avgHealth / 100) * 69.1} 69.1`}
              strokeLinecap="round"
              transform="rotate(-90 14 14)"
              style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.3s ease' }}
            />
            <text x="14" y="14" textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="700" fill="var(--shms-text)">
              {avgHealth.toFixed(0)}
            </text>
          </svg>
        </div>

        {/* MQTT real-time status (cognitive) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={mqttOk ? 'MQTT conectado' : 'MQTT desconectado'}>
          <div
            className="shms-pulse"
            style={{ background: mqttOk ? 'var(--shms-green)' : 'var(--shms-red)' }}
          />
          <span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-secondary)' }}>
            {mqttOk ? 'MQTT' : 'Offline'}
          </span>
        </div>

        {/* Alert count (cognitive severity) */}
        {alertCount > 0 && (
          <span className={`shms-badge shms-badge--${worstLevel}`}>
            🚨 {alertCount}
          </span>
        )}

        {/* Last update indicator */}
        <span style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }} title="Última atualização">
          ⟳ {ageStr}
        </span>
      </div>
    </header>
  );
}
