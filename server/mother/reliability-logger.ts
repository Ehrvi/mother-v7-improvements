/**
 * MOTHER v74.9 — Reliability Logger
 * 
 * Centralized log store and SSE broadcaster for the reliability monitor.
 * Implements the Four Golden Signals (Beyer et al., 2016, Google SRE Book):
 * 1. Latency (p50/p95/p99)
 * 2. Traffic (queries/minute)
 * 3. Errors (error rate %)
 * 4. Saturation (queue depth, memory)
 * 
 * Also tracks LLM-specific metrics (AgentOps, Dong et al., 2024, arXiv:2411.05285):
 * - Quality score distribution
 * - Tool call success rate
 * - Hallucination rate (uncertainty patterns detected)
 * - Retry rate (regeneration triggered)
 * 
 * Scientific basis:
 * - Google SRE Book Ch.6 (Beyer et al., 2016) — Four Golden Signals
 * - AgentOps (Dong et al., 2024, arXiv:2411.05285) — LLM agent observability
 * - LumiMAS (Solomon et al., 2025, arXiv:2508.12412) — multi-agent monitoring
 * - ISO/IEC 25010:2023 — reliability sub-characteristics
 */

import type { Response } from 'express';
import { createLogger } from '../_core/logger';
const log = createLogger('RELIABILITY_LOGGER');


// ============================================================
// Types
// ============================================================

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogComponent = 'guardian' | 'crag' | 'omniscient' | 'core' | 'tool-engine' | 'search' | 'episodic' | 'system';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  component: LogComponent;
  message: string;
  data?: Record<string, unknown>;
}

export interface QueryMetric {
  timestamp: number;
  processingTimeMs: number;
  qualityScore: number;
  isError: boolean;
  isRegeneration: boolean;
  hasUncertainty: boolean;
  toolsUsed: string[];
  modelName: string;
  queryCategory: string;
}

export interface GoldenSignals {
  // Latency
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  // Traffic
  queriesPerMinute: number;
  totalQueries: number;
  // Errors
  errorRatePct: number;
  totalErrors: number;
  // Saturation (LLM-specific)
  avgQualityScore: number;
  regenerationRatePct: number;
  hallucination_ratePct: number;
  toolSuccessRatePct: number;
}

export interface SLOStatus {
  latencyP95: 'ok' | 'warning' | 'critical';
  errorRate: 'ok' | 'warning' | 'critical';
  availability: 'ok' | 'warning' | 'critical';
  qualityScore: 'ok' | 'warning' | 'critical';
  overall: 'ok' | 'warning' | 'critical';
}

// ============================================================
// Reliability Logger (singleton)
// ============================================================

class ReliabilityLogger {
  private logs: LogEntry[] = [];
  private metrics: QueryMetric[] = [];
  private sseClients: Set<Response> = new Set();
  private readonly MAX_LOGS = 500;
  private readonly MAX_METRICS = 1000;
  private readonly WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  // SLO thresholds (ISO/IEC 25010:2023 + Google SRE)
  private readonly SLO = {
    p95LatencyMs: 5000,
    errorRatePct: 1.0,
    availabilityPct: 99.5,
    minQualityScore: 70,
  };

  // ---- Logging ----

  log(level: LogLevel, component: LogComponent, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    // Broadcast to SSE clients
    this.broadcast({ type: 'log', payload: entry });

    // Console output
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${component}]`;
    if (level === 'error') log.error(`${prefix} ${message}`, data ?? undefined);
    else if (level === 'warn') log.warn(`${prefix} ${message}`, data ?? undefined);
    else log.info(`${prefix} ${message}`, data ?? undefined);
  }

  info(component: LogComponent, message: string, data?: Record<string, unknown>): void {
    this.log('info', component, message, data);
  }

  warn(component: LogComponent, message: string, data?: Record<string, unknown>): void {
    this.log('warn', component, message, data);
  }

  error(component: LogComponent, message: string, data?: Record<string, unknown>): void {
    this.log('error', component, message, data);
  }

  debug(component: LogComponent, message: string, data?: Record<string, unknown>): void {
    this.log('debug', component, message, data);
  }

  // ---- Metrics Recording ----

  recordQuery(metric: Omit<QueryMetric, 'timestamp'>): void {
    const entry: QueryMetric = { ...metric, timestamp: Date.now() };
    this.metrics.push(entry);
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Compute and broadcast updated signals
    const signals = this.computeGoldenSignals();
    const slo = this.computeSLOStatus(signals);
    this.broadcast({ type: 'metrics', payload: { signals, slo } });

    // Auto-warn on SLO violations
    if (slo.overall !== 'ok') {
      const violations: string[] = [];
      if (slo.latencyP95 !== 'ok') violations.push(`p95=${signals.p95LatencyMs}ms > ${this.SLO.p95LatencyMs}ms`);
      if (slo.errorRate !== 'ok') violations.push(`errorRate=${signals.errorRatePct.toFixed(2)}% > ${this.SLO.errorRatePct}%`);
      if (slo.qualityScore !== 'ok') violations.push(`avgQuality=${signals.avgQualityScore.toFixed(1)} < ${this.SLO.minQualityScore}`);
      this.warn('system', `SLO violation detected: ${violations.join(', ')}`, { slo, violations });
    }
  }

  // ---- Golden Signals Computation ----

  computeGoldenSignals(): GoldenSignals {
    const now = Date.now();
    const windowMetrics = this.metrics.filter(m => now - m.timestamp < this.WINDOW_MS);

    if (windowMetrics.length === 0) {
      return {
        p50LatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0,
        queriesPerMinute: 0, totalQueries: 0,
        errorRatePct: 0, totalErrors: 0,
        avgQualityScore: 0, regenerationRatePct: 0,
        hallucination_ratePct: 0, toolSuccessRatePct: 0,
      };
    }

    // Latency percentiles
    const latencies = windowMetrics.map(m => m.processingTimeMs).sort((a, b) => a - b);
    const p50 = this.percentile(latencies, 50);
    const p95 = this.percentile(latencies, 95);
    const p99 = this.percentile(latencies, 99);

    // Traffic
    const windowMinutes = this.WINDOW_MS / 60000;
    const qpm = windowMetrics.length / windowMinutes;

    // Errors
    const errors = windowMetrics.filter(m => m.isError);
    const errorRate = (errors.length / windowMetrics.length) * 100;

    // Quality
    const qualityScores = windowMetrics.map(m => m.qualityScore).filter(s => s > 0);
    const avgQuality = qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0;

    // Regeneration rate
    const regenerations = windowMetrics.filter(m => m.isRegeneration);
    const regenRate = (regenerations.length / windowMetrics.length) * 100;

    // Hallucination rate
    const hallucinations = windowMetrics.filter(m => m.hasUncertainty);
    const hallucinationRate = (hallucinations.length / windowMetrics.length) * 100;

    // Tool success rate
    const queriesWithTools = windowMetrics.filter(m => m.toolsUsed.length > 0);
    const toolSuccessRate = queriesWithTools.length > 0
      ? ((queriesWithTools.length - errors.filter(m => m.toolsUsed.length > 0).length) / queriesWithTools.length) * 100
      : 100;

    return {
      p50LatencyMs: Math.round(p50),
      p95LatencyMs: Math.round(p95),
      p99LatencyMs: Math.round(p99),
      queriesPerMinute: Math.round(qpm * 10) / 10,
      totalQueries: this.metrics.length,
      errorRatePct: Math.round(errorRate * 100) / 100,
      totalErrors: errors.length,
      avgQualityScore: Math.round(avgQuality * 10) / 10,
      regenerationRatePct: Math.round(regenRate * 100) / 100,
      hallucination_ratePct: Math.round(hallucinationRate * 100) / 100,
      toolSuccessRatePct: Math.round(toolSuccessRate * 10) / 10,
    };
  }

  computeSLOStatus(signals: GoldenSignals): SLOStatus {
    const latencyP95: SLOStatus['latencyP95'] =
      signals.p95LatencyMs === 0 ? 'ok' :
      signals.p95LatencyMs < this.SLO.p95LatencyMs ? 'ok' :
      signals.p95LatencyMs < this.SLO.p95LatencyMs * 1.5 ? 'warning' : 'critical';

    const errorRate: SLOStatus['errorRate'] =
      signals.errorRatePct < this.SLO.errorRatePct ? 'ok' :
      signals.errorRatePct < this.SLO.errorRatePct * 2 ? 'warning' : 'critical';

    const availabilityPct = signals.totalQueries > 0
      ? ((signals.totalQueries - signals.totalErrors) / signals.totalQueries) * 100
      : 100;
    const availability: SLOStatus['availability'] =
      availabilityPct >= this.SLO.availabilityPct ? 'ok' :
      availabilityPct >= 99.0 ? 'warning' : 'critical';

    const qualityScore: SLOStatus['qualityScore'] =
      signals.avgQualityScore === 0 ? 'ok' :
      signals.avgQualityScore >= this.SLO.minQualityScore ? 'ok' :
      signals.avgQualityScore >= this.SLO.minQualityScore * 0.85 ? 'warning' : 'critical';

    const statuses = [latencyP95, errorRate, availability, qualityScore];
    const overall: SLOStatus['overall'] =
      statuses.includes('critical') ? 'critical' :
      statuses.includes('warning') ? 'warning' : 'ok';

    return { latencyP95, errorRate, availability, qualityScore, overall };
  }

  // ---- SSE Management ----

  addSSEClient(res: Response): void {
    this.sseClients.add(res);
    this.info('system', `SSE client connected (total: ${this.sseClients.size})`);

    // Send initial state
    const signals = this.computeGoldenSignals();
    const slo = this.computeSLOStatus(signals);
    this.sendToClient(res, { type: 'init', payload: { logs: this.logs.slice(-50), signals, slo } });

    res.on('close', () => {
      this.sseClients.delete(res);
      this.info('system', `SSE client disconnected (total: ${this.sseClients.size})`);
    });
  }

  private broadcast(event: { type: string; payload: unknown }): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    const deadClients: Response[] = [];

    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        deadClients.push(client);
      }
    }

    for (const dead of deadClients) {
      this.sseClients.delete(dead);
    }
  }

  private sendToClient(res: Response, event: { type: string; payload: unknown }): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      this.sseClients.delete(res);
    }
  }

  // ---- Utilities ----

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  getLogs(limit = 100, level?: LogLevel, component?: LogComponent): LogEntry[] {
    let filtered = this.logs;
    if (level) filtered = filtered.filter(l => l.level === level);
    if (component) filtered = filtered.filter(l => l.component === component);
    return filtered.slice(-limit);
  }

  getSnapshot() {
    const signals = this.computeGoldenSignals();
    const slo = this.computeSLOStatus(signals);
    return { signals, slo, logCount: this.logs.length, metricCount: this.metrics.length };
  }
}

// Singleton export
export const reliabilityLogger = new ReliabilityLogger();
