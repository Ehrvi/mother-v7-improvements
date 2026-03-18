/**
 * SystemMetrics — Real-time system metrics display component
 *
 * Demonstrates all React+TypeScript best practices:
 *   1. Typed props with interface (ButtonProps pattern)
 *   2. State management with useState<T> (Counter pattern)
 *   3. Custom Hook with typed return (useToggle pattern)
 *   4. Memoization with useMemo + React.memo (optimization)
 *   5. Event handling with typed handlers (FormInput pattern)
 *
 * Scientific basis:
 *   - Nielsen (1994) Heuristic #1: Visibility of System Status
 *   - Shneiderman (1996): Overview first, then details on demand
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Activity, Cpu, Clock, Shield, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

// ═══════════════════════════════════════════
// 1. TYPES — Contratos claros para dados
// ═══════════════════════════════════════════

/** Status de saúde de um subsistema */
export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

/** Dados de uma métrica individual */
export interface MetricData {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: HealthStatus;
  trend?: 'up' | 'down' | 'stable';
  timestamp: Date;
}

/** Props do componente MetricCard (memoizado) */
export interface MetricCardProps {
  metric: MetricData;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Props do componente principal SystemMetrics */
export interface SystemMetricsProps {
  /** Nome do sistema que está sendo monitorado */
  systemName: string;
  /** Array de métricas para exibir */
  metrics: MetricData[];
  /** Intervalo de atualização em ms (padrão: 5000) */
  refreshIntervalMs?: number;
  /** Callback quando o usuário seleciona uma métrica */
  onMetricSelect?: (metric: MetricData) => void;
  /** Se deve mostrar detalhes expandíveis */
  expandable?: boolean;
}

// ═══════════════════════════════════════════
// 2. CUSTOM HOOK — useMetricFilter
// ═══════════════════════════════════════════

export type MetricFilter = 'all' | HealthStatus;

interface UseMetricFilterReturn {
  filter: MetricFilter;
  setFilter: (f: MetricFilter) => void;
  filtered: MetricData[];
  counts: Record<MetricFilter, number>;
}

/**
 * Custom Hook para filtrar métricas por status de saúde.
 * Usa useMemo para memoizar o resultado da filtragem.
 *
 * @param metrics - Array de métricas para filtrar
 * @param initialFilter - Filtro inicial (padrão: 'all')
 */
export function useMetricFilter(
  metrics: MetricData[],
  initialFilter: MetricFilter = 'all',
): UseMetricFilterReturn {
  const [filter, setFilter] = useState<MetricFilter>(initialFilter);

  // useMemo: filtragem só recalcula quando metrics ou filter mudam
  const filtered = useMemo(() => {
    if (filter === 'all') return metrics;
    return metrics.filter(m => m.status === filter);
  }, [metrics, filter]);

  // useMemo: contagem por status
  const counts = useMemo(() => {
    const result: Record<MetricFilter, number> = {
      all: metrics.length,
      healthy: 0,
      degraded: 0,
      critical: 0,
      unknown: 0,
    };
    for (const m of metrics) {
      result[m.status]++;
    }
    return result;
  }, [metrics]);

  return { filter, setFilter, filtered, counts };
}

// ═══════════════════════════════════════════
// 3. SUB-COMPONENTS (React.memo)
// ═══════════════════════════════════════════

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: 'var(--success, #34d399)',
  degraded: 'var(--warning, #fbbf24)',
  critical: 'var(--error, #f87171)',
  unknown: 'var(--text-muted, #606080)',
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: 'Saudável',
  degraded: 'Degradado',
  critical: 'Crítico',
  unknown: 'Desconhecido',
};

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingUp, // rotated via CSS
  stable: Activity,
};

/**
 * MetricCard — Cartão individual de métrica (memoizado com React.memo).
 * Só re-renderiza se suas props mudarem (shallow comparison).
 */
export const MetricCard: React.FC<MetricCardProps> = React.memo(({ metric, selected, onSelect }) => {
  const color = STATUS_COLORS[metric.status];
  const TrendIcon = metric.trend ? TREND_ICONS[metric.trend] : null;

  return (
    <button
      onClick={() => onSelect(metric.id)}
      data-testid={`metric-card-${metric.id}`}
      aria-label={`${metric.label}: ${metric.value}${metric.unit} - ${STATUS_LABELS[metric.status]}`}
      role="button"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '16px',
        borderRadius: 16,
        border: selected
          ? `2px solid ${color}`
          : '2px solid var(--border-subtle, rgba(255,255,255,0.06))',
        background: selected
          ? `${color}11`
          : 'var(--bg-surface, #141422)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
        width: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #a0a0c0)' }}>
          {metric.label}
        </span>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
          aria-label={STATUS_LABELS[metric.status]}
        />
      </div>

      {/* Value */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary, #f0f0ff)' }}>
          {metric.value}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary, #606080)' }}>
          {metric.unit}
        </span>
        {TrendIcon && (
          <TrendIcon
            style={{
              width: 14,
              height: 14,
              marginLeft: 4,
              color,
              transform: metric.trend === 'down' ? 'rotate(180deg)' : 'none',
            }}
          />
        )}
      </div>

      {/* Timestamp */}
      <span style={{ fontSize: 10, color: 'var(--text-muted, #404060)' }}>
        {metric.timestamp.toLocaleTimeString()}
      </span>
    </button>
  );
});

MetricCard.displayName = 'MetricCard';

// ═══════════════════════════════════════════
// 4. MAIN COMPONENT
// ═══════════════════════════════════════════

const FILTER_OPTIONS: { value: MetricFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'healthy', label: 'Saudável' },
  { value: 'degraded', label: 'Degradado' },
  { value: 'critical', label: 'Crítico' },
];

/**
 * SystemMetrics — Dashboard de métricas do sistema.
 *
 * Usa:
 * - Custom Hook (useMetricFilter) para filtragem memoizada
 * - React.memo no MetricCard para evitar re-renderizações
 * - useCallback para estabilidade referencial dos handlers
 * - useState para expansão e seleção
 */
const SystemMetrics: React.FC<SystemMetricsProps> = ({
  systemName,
  metrics,
  onMetricSelect,
  expandable = true,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const { filter, setFilter, filtered, counts } = useMetricFilter(metrics);

  // useCallback: handler estável para MetricCard (previne re-render desnecessário via React.memo)
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(prev => (prev === id ? null : id));
      const metric = metrics.find(m => m.id === id);
      if (metric && onMetricSelect) {
        onMetricSelect(metric);
      }
    },
    [metrics, onMetricSelect],
  );

  // useMemo: resumo de saúde geral
  const overallHealth = useMemo<HealthStatus>(() => {
    if (metrics.some(m => m.status === 'critical')) return 'critical';
    if (metrics.some(m => m.status === 'degraded')) return 'degraded';
    if (metrics.every(m => m.status === 'healthy')) return 'healthy';
    return 'unknown';
  }, [metrics]);

  return (
    <div
      data-testid="system-metrics"
      style={{
        borderRadius: 20,
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        background: 'var(--bg-base, #0e0e1a)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield style={{ width: 18, height: 18, color: STATUS_COLORS[overallHealth] }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #f0f0ff)' }}>
            {systemName}
          </span>
          <span
            data-testid="overall-health"
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              background: `${STATUS_COLORS[overallHealth]}22`,
              color: STATUS_COLORS[overallHealth],
              textTransform: 'uppercase',
            }}
          >
            {STATUS_LABELS[overallHealth]}
          </span>
        </div>

        {expandable && (
          <button
            onClick={() => setExpanded(e => !e)}
            data-testid="expand-toggle"
            aria-label={expanded ? 'Recolher métricas' : 'Expandir métricas'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary, #606080)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            {expanded ? <ChevronUp style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />}
          </button>
        )}
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                data-testid={`filter-${opt.value}`}
                style={{
                  fontSize: 11,
                  fontWeight: filter === opt.value ? 700 : 500,
                  padding: '4px 12px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  color: filter === opt.value ? '#fff' : 'var(--text-tertiary, #606080)',
                  background: filter === opt.value
                    ? 'var(--accent-primary, #a78bfa)'
                    : 'var(--bg-elevated, #1a1a2e)',
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label} ({counts[opt.value]})
              </button>
            ))}
          </div>

          {/* Metric grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {filtered.map(metric => (
              <MetricCard
                key={metric.id}
                metric={metric}
                selected={selectedId === metric.id}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <p data-testid="empty-message" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
              Nenhuma métrica com status "{FILTER_OPTIONS.find(o => o.value === filter)?.label}"
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemMetrics;
