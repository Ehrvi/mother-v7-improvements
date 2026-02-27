/**
 * MOTHER v74.9 — Reliability Monitor Component
 * 
 * Real-time dashboard displaying the Four Golden Signals (Google SRE Book, Beyer et al., 2016):
 * 1. Latency (p50/p95/p99)
 * 2. Traffic (queries/minute)
 * 3. Errors (error rate %)
 * 4. Saturation (quality score, hallucination rate)
 * 
 * Uses Server-Sent Events (SSE) for real-time log streaming.
 * 
 * Scientific basis:
 * - Google SRE Book Ch.6 (Beyer et al., 2016) — Four Golden Signals
 * - AgentOps (Dong et al., 2024, arXiv:2411.05285) — LLM agent observability dashboard
 * - LumiMAS (Solomon et al., 2025, arXiv:2508.12412) — real-time multi-agent monitoring
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================
// Types (mirrored from server/mother/reliability-logger.ts)
// ============================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type LogComponent = 'guardian' | 'crag' | 'omniscient' | 'core' | 'tool-engine' | 'search' | 'episodic' | 'system';
type SLOState = 'ok' | 'warning' | 'critical';

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  component: LogComponent;
  message: string;
  data?: Record<string, unknown>;
}

interface GoldenSignals {
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  queriesPerMinute: number;
  totalQueries: number;
  errorRatePct: number;
  totalErrors: number;
  avgQualityScore: number;
  regenerationRatePct: number;
  hallucination_ratePct: number;
  toolSuccessRatePct: number;
}

interface SLOStatus {
  latencyP95: SLOState;
  errorRate: SLOState;
  availability: SLOState;
  qualityScore: SLOState;
  overall: SLOState;
}

// ============================================================
// Helpers
// ============================================================

const SLO_COLORS: Record<SLOState, string> = {
  ok: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const SLO_BG: Record<SLOState, string> = {
  ok: 'rgba(34,197,94,0.12)',
  warning: 'rgba(245,158,11,0.12)',
  critical: 'rgba(239,68,68,0.12)',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: '#60a5fa',
  warn: '#fbbf24',
  error: '#f87171',
  debug: '#9ca3af',
};

const COMPONENT_ABBR: Record<LogComponent, string> = {
  guardian: 'GRD',
  crag: 'CRG',
  omniscient: 'OMN',
  core: 'COR',
  'tool-engine': 'TLE',
  search: 'SRC',
  episodic: 'EPS',
  system: 'SYS',
};

function formatMs(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPct(pct: number): string {
  if (pct === 0) return '0%';
  return `${pct.toFixed(1)}%`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour12: false });
  } catch {
    return iso;
  }
}

// ============================================================
// Sub-components
// ============================================================

interface MetricCardProps {
  label: string;
  value: string;
  subvalue?: string;
  status: SLOState;
  icon: string;
}

function MetricCard({ label, value, subvalue, status, icon }: MetricCardProps) {
  return (
    <div style={{
      background: SLO_BG[status],
      border: `1px solid ${SLO_COLORS[status]}40`,
      borderRadius: 12,
      padding: '12px 16px',
      minWidth: 140,
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{
          marginLeft: 'auto',
          width: 8, height: 8, borderRadius: '50%',
          background: SLO_COLORS[status],
          boxShadow: `0 0 6px ${SLO_COLORS[status]}`,
        }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: SLO_COLORS[status], lineHeight: 1 }}>
        {value}
      </div>
      {subvalue && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          {subvalue}
        </div>
      )}
    </div>
  );
}

interface LogRowProps {
  entry: LogEntry;
}

function LogRow({ entry }: LogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasData = entry.data && Object.keys(entry.data).length > 0;

  return (
    <div
      onClick={() => hasData && setExpanded(e => !e)}
      style={{
        padding: '3px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: hasData ? 'pointer' : 'default',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: '#6b7280', minWidth: 80 }}>{formatTime(entry.timestamp)}</span>
        <span style={{
          color: LEVEL_COLORS[entry.level],
          minWidth: 36,
          fontWeight: 600,
          fontSize: 10,
          textTransform: 'uppercase',
        }}>
          {entry.level}
        </span>
        <span style={{
          color: '#8b5cf6',
          minWidth: 28,
          fontSize: 10,
          fontWeight: 600,
        }}>
          {COMPONENT_ABBR[entry.component] ?? entry.component.toUpperCase().slice(0, 3)}
        </span>
        <span style={{ color: '#e5e7eb', flex: 1 }}>{entry.message}</span>
        {hasData && (
          <span style={{ color: '#6b7280', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
        )}
      </div>
      {expanded && hasData && (
        <pre style={{
          margin: '4px 0 4px 120px',
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 6,
          fontSize: 11,
          color: '#d1d5db',
          overflow: 'auto',
          maxHeight: 120,
        }}>
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

interface ReliabilityMonitorProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function ReliabilityMonitor({ isOpen = true, onClose }: ReliabilityMonitorProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [signals, setSignals] = useState<GoldenSignals | null>(null);
  const [slo, setSlo] = useState<SLOStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [filterComponent, setFilterComponent] = useState<LogComponent | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/reliability-stream');
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // Reconnect after 3s (SSE standard retry)
      setTimeout(connect, 3000);
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload: unknown };

        if (msg.type === 'init') {
          const init = msg.payload as { logs: LogEntry[]; signals: GoldenSignals; slo: SLOStatus };
          setLogs(init.logs);
          setSignals(init.signals);
          setSlo(init.slo);
        } else if (msg.type === 'log') {
          setLogs(prev => [...prev.slice(-499), msg.payload as LogEntry]);
        } else if (msg.type === 'metrics') {
          const m = msg.payload as { signals: GoldenSignals; slo: SLOStatus };
          setSignals(m.signals);
          setSlo(m.slo);
        }
      } catch {
        // ignore parse errors
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [isOpen, connect]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(l => {
    if (filterLevel !== 'all' && l.level !== filterLevel) return false;
    if (filterComponent !== 'all' && l.component !== filterComponent) return false;
    return true;
  });

  if (!isOpen) return null;

  const overall = slo?.overall ?? 'ok';

  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0, bottom: 0,
      width: 640,
      background: '#0f1117',
      borderLeft: `1px solid ${SLO_COLORS[overall]}40`,
      display: 'flex',
      flexDirection: 'column',
      zIndex: 9999,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#0a0d14',
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: connected ? '#22c55e' : '#ef4444',
          boxShadow: connected ? '0 0 8px #22c55e' : '0 0 8px #ef4444',
        }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#f9fafb' }}>
          MOTHER Reliability Monitor
        </span>
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>
          v74.9 · {connected ? 'Live' : 'Reconnecting...'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 20,
            background: SLO_BG[overall],
            color: SLO_COLORS[overall],
            border: `1px solid ${SLO_COLORS[overall]}60`,
            fontWeight: 600,
          }}>
            SLO: {overall.toUpperCase()}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6b7280', fontSize: 18, padding: '0 4px',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Four Golden Signals */}
      {signals && slo && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Four Golden Signals · 5min window
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <MetricCard
              label="Latency p95"
              value={formatMs(signals.p95LatencyMs)}
              subvalue={`p50: ${formatMs(signals.p50LatencyMs)} · p99: ${formatMs(signals.p99LatencyMs)}`}
              status={slo.latencyP95}
              icon="⏱"
            />
            <MetricCard
              label="Traffic"
              value={`${signals.queriesPerMinute}/min`}
              subvalue={`${signals.totalQueries} total queries`}
              status="ok"
              icon="📊"
            />
            <MetricCard
              label="Error Rate"
              value={formatPct(signals.errorRatePct)}
              subvalue={`${signals.totalErrors} errors`}
              status={slo.errorRate}
              icon="⚠️"
            />
            <MetricCard
              label="Quality"
              value={signals.avgQualityScore > 0 ? signals.avgQualityScore.toFixed(1) : '—'}
              subvalue={`regen: ${formatPct(signals.regenerationRatePct)} · halluc: ${formatPct(signals.hallucination_ratePct)}`}
              status={slo.qualityScore}
              icon="🎯"
            />
          </div>
          {/* Tool success rate */}
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
            Tool success rate: <span style={{ color: '#60a5fa' }}>{formatPct(signals.toolSuccessRatePct)}</span>
            {' · '}
            Availability: <span style={{ color: SLO_COLORS[slo.availability] }}>
              {signals.totalQueries > 0
                ? formatPct(((signals.totalQueries - signals.totalErrors) / signals.totalQueries) * 100)
                : '100%'}
            </span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Filter:</span>
        {(['all', 'info', 'warn', 'error', 'debug'] as const).map(level => (
          <button
            key={level}
            onClick={() => setFilterLevel(level)}
            style={{
              padding: '2px 8px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: filterLevel === level ? 700 : 400,
              background: filterLevel === level
                ? (level === 'all' ? '#374151' : LEVEL_COLORS[level as LogLevel] + '30')
                : 'transparent',
              color: level === 'all' ? '#d1d5db' : LEVEL_COLORS[level as LogLevel] ?? '#d1d5db',
            }}
          >
            {level}
          </button>
        ))}
        <span style={{ color: 'rgba(255,255,255,0.1)', margin: '0 4px' }}>|</span>
        <select
          value={filterComponent}
          onChange={e => setFilterComponent(e.target.value as LogComponent | 'all')}
          style={{
            background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)',
            color: '#d1d5db', borderRadius: 6, padding: '2px 6px', fontSize: 11,
          }}
        >
          <option value="all">All components</option>
          {(['guardian', 'crag', 'omniscient', 'core', 'tool-engine', 'search', 'episodic', 'system'] as LogComponent[]).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => setAutoScroll(a => !a)}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer',
            fontSize: 11,
            background: autoScroll ? 'rgba(96,165,250,0.15)' : 'transparent',
            color: autoScroll ? '#60a5fa' : '#6b7280',
          }}
        >
          {autoScroll ? '⬇ Auto-scroll ON' : '⬇ Auto-scroll OFF'}
        </button>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {filteredLogs.length} / {logs.length} entries
        </span>
      </div>

      {/* Log Stream */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: '#0a0d14',
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{
            padding: 32,
            textAlign: 'center',
            color: '#4b5563',
            fontSize: 13,
          }}>
            {connected ? 'Waiting for logs...' : 'Connecting to log stream...'}
          </div>
        ) : (
          filteredLogs.map(entry => (
            <LogRow key={entry.id} entry={entry} />
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10,
        color: '#4b5563',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>Google SRE Four Golden Signals · AgentOps · LumiMAS · ISO/IEC 25010:2023</span>
        <span>MOTHER v74.9</span>
      </div>
    </div>
  );
}

export default ReliabilityMonitor;
