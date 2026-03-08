/**
 * MotherMonitor — C202 Sprint 3 UX/UI
 * Painel de monitoramento em tempo real via SSE
 *
 * Conecta ao endpoint /api/monitor/stream (monitor-routes.ts C200)
 * Exibe: versao, ciclo, run atual, fitness, memoria, DGM status
 *
 * Base: arXiv:2205.01068 — Adaptive UI for AI Systems
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface MonitorMetrics {
  version: string;
  cycle: string;
  runId: string;
  dgmStatus: 'idle' | 'running' | 'success' | 'failed';
  fitnessScore: number;
  episodicMemoryCount: number;
  semanticCacheHitRate: number;
  reflexionIterations: number;
  lastCycleAt: string | null;
  uptime: number;
  requestsTotal: number;
  requestsPerMinute: number;
  errorRate: number;
}

const DEFAULT_METRICS: MonitorMetrics = {
  version: 'v87.0',
  cycle: 'C202',
  runId: 'C202-R001',
  dgmStatus: 'idle',
  fitnessScore: 0,
  episodicMemoryCount: 0,
  semanticCacheHitRate: 0,
  reflexionIterations: 0,
  lastCycleAt: null,
  uptime: 0,
  requestsTotal: 0,
  requestsPerMinute: 0,
  errorRate: 0,
};

interface MotherMonitorProps {
  apiBase?: string;
  refreshInterval?: number;
  compact?: boolean;
}

export const MotherMonitor: React.FC<MotherMonitorProps> = ({
  apiBase = '',
  refreshInterval = 5000,
  compact = false,
}) => {
  const [metrics, setMetrics] = useState<MonitorMetrics>(DEFAULT_METRICS);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Try SSE first, fallback to polling
  const connectSSE = useCallback(() => {
    try {
      const es = new EventSource(`${apiBase}/api/monitor/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMetrics(prev => ({ ...prev, ...data }));
          setLastUpdate(new Date());
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Fallback to polling
        startPolling();
      };
    } catch {
      startPolling();
    }
  }, [apiBase]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/api/health`);
        if (res.ok) {
          const data = await res.json();
          setMetrics(prev => ({
            ...prev,
            version: data.version || prev.version,
            cycle: data.cycle || prev.cycle,
            uptime: data.uptime || prev.uptime,
          }));
          setConnected(true);
          setLastUpdate(new Date());
          setError(null);
        }
      } catch (err: any) {
        setConnected(false);
        setError(err.message);
      }
    }, refreshInterval);
  }, [apiBase, refreshInterval]);

  useEffect(() => {
    connectSSE();
    return () => {
      eventSourceRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [connectSSE]);

  const statusColor = {
    idle: '#6060a0',
    running: '#ffa04a',
    success: '#4aff9e',
    failed: '#ff6060',
  }[metrics.dgmStatus];

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '6px 12px',
        background: 'rgba(26, 26, 46, 0.8)',
        borderRadius: '8px',
        fontSize: '11px',
        color: '#a0a0c0',
      }}>
        <span style={{ color: connected ? '#4aff9e' : '#ff6060' }}>
          {connected ? '●' : '○'} {metrics.version}
        </span>
        <span style={{ color: statusColor }}>DGM: {metrics.dgmStatus}</span>
        <span>Mem: {metrics.episodicMemoryCount}</span>
        <span>Cache: {(metrics.semanticCacheHitRate * 100).toFixed(0)}%</span>
      </div>
    );
  }

  return (
    <div style={{
      background: '#1a1a2e',
      border: '1px solid #2d2d4e',
      borderRadius: '12px',
      padding: '16px',
      color: '#e0e0ff',
      fontFamily: 'monospace',
      fontSize: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#4a9eff' }}>
          MOTHER Monitor
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: connected ? '#4aff9e' : '#ff6060',
            display: 'inline-block',
          }} />
          <span style={{ color: connected ? '#4aff9e' : '#ff6060', fontSize: '11px' }}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Version + Cycle */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <MetricBox label="Versao" value={metrics.version} color="#4a9eff" />
        <MetricBox label="Ciclo" value={metrics.cycle} color="#c04aff" />
        <MetricBox label="Run ID" value={metrics.runId} color="#ffa04a" />
      </div>

      {/* DGM Status */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '12px',
        borderLeft: `3px solid ${statusColor}`,
      }}>
        <div style={{ color: '#6060a0', fontSize: '10px', marginBottom: '4px' }}>DGM STATUS</div>
        <div style={{ color: statusColor, fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>
          {metrics.dgmStatus}
        </div>
        {metrics.fitnessScore > 0 && (
          <div style={{ color: '#a0a0c0', marginTop: '4px' }}>
            Fitness: <span style={{ color: '#4aff9e' }}>{metrics.fitnessScore.toFixed(4)}</span>
            {' '}/ threshold: 0.8500
          </div>
        )}
      </div>

      {/* Memory + Cache */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <MetricBox
          label="Memoria Episodica"
          value={String(metrics.episodicMemoryCount)}
          color="#4aff9e"
          target="≥50"
        />
        <MetricBox
          label="Cache Hit Rate"
          value={`${(metrics.semanticCacheHitRate * 100).toFixed(1)}%`}
          color="#ffa04a"
          target="≥25%"
        />
        <MetricBox
          label="Reflexion Iters"
          value={String(metrics.reflexionIterations)}
          color="#c04aff"
        />
        <MetricBox
          label="Uptime"
          value={formatUptime(metrics.uptime)}
          color="#4a9eff"
        />
      </div>

      {/* Request Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <MetricBox label="Total Req" value={String(metrics.requestsTotal)} color="#a0a0c0" />
        <MetricBox label="Req/min" value={metrics.requestsPerMinute.toFixed(1)} color="#a0a0c0" />
        <MetricBox
          label="Error Rate"
          value={`${(metrics.errorRate * 100).toFixed(1)}%`}
          color={metrics.errorRate > 0.05 ? '#ff6060' : '#4aff9e'}
        />
      </div>

      {/* Footer */}
      <div style={{ color: '#4040a0', fontSize: '10px', textAlign: 'right' }}>
        {lastUpdate ? `Atualizado: ${lastUpdate.toLocaleTimeString()}` : 'Aguardando dados...'}
        {error && <span style={{ color: '#ff6060', marginLeft: '8px' }}>{error}</span>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// MetricBox helper
// ─────────────────────────────────────────────────────────────────────────

const MetricBox: React.FC<{
  label: string;
  value: string;
  color: string;
  target?: string;
}> = ({ label, value, color, target }) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
    padding: '8px 10px',
  }}>
    <div style={{ color: '#6060a0', fontSize: '9px', marginBottom: '3px', textTransform: 'uppercase' }}>
      {label}
    </div>
    <div style={{ color, fontWeight: 700, fontSize: '13px' }}>{value}</div>
    {target && (
      <div style={{ color: '#4040a0', fontSize: '9px', marginTop: '1px' }}>meta: {target}</div>
    )}
  </div>
);

export default MotherMonitor;
