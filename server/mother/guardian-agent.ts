/**
 * MOTHER v76.0 — Guardian Agent
 * Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025) — self-improving AI agents
 *   that modify their own code: SWE-bench 20% → 50%
 * - Self-RAG (Asai et al., arXiv:2310.11511, NeurIPS 2023) — self-reflective retrieval
 * - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal reinforcement learning
 * - Google SRE Book (2016) — SLO-based reliability engineering
 * - Circuit Breaker (Nygard, 2007) — fail-fast pattern for distributed systems
 *
 * Responsibilities:
 * 1. Monitor SLOs: P95 latency <2s, error rate <0.1%, uptime >99.9%
 * 2. Detect anomalies: latency spikes, error rate increases, circuit breaker trips
 * 3. Trigger self-healing: restart providers, clear caches, escalate to DGM
 * 4. Audit log: immutable record of all guardian actions (for DGM fitness evaluation)
 * 5. Alert: surface critical issues to MOTHER UI and bd_central
 */

import { getAllCircuitStats, resetCircuit } from './circuit-breaker';
import { getCacheStats, pruneExpiredEntries } from './semantic-cache';
import { createLogger } from '../_core/logger';
const log = createLogger('GUARDIAN');

// ============================================================
// TYPES
// ============================================================

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type HealingAction = 'RESET_CIRCUIT' | 'PRUNE_CACHE' | 'ESCALATE_DGM' | 'LOG_ONLY' | 'NONE';

export interface SLOViolation {
  metric: string;
  current: number;
  threshold: number;
  severity: AlertSeverity;
  timestamp: Date;
  healingAction: HealingAction;
}

export interface GuardianReport {
  timestamp: Date;
  healthy: boolean;
  violations: SLOViolation[];
  healingActionsExecuted: string[];
  circuitStats: ReturnType<typeof getAllCircuitStats>;
  cacheStats: ReturnType<typeof getCacheStats>;
  uptimeMs: number;
}

export interface PerformanceObservation {
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  tier: string;
  timestamp: Date;
}

// ============================================================
// SLO THRESHOLDS (Google SRE Book, 2016)
// ============================================================

const SLO = {
  P95_LATENCY_MS: 2000,       // P95 latency < 2s
  ERROR_RATE: 0.001,           // error rate < 0.1%
  CACHE_HIT_RATE_MIN: 0.20,   // cache hit rate > 20% (after warmup)
  CIRCUIT_OPEN_MAX: 1,         // max 1 circuit open at a time
} as const;

// ============================================================
// STATE
// ============================================================

const startTime = Date.now();
const observations: PerformanceObservation[] = [];
const auditLog: Array<{ timestamp: Date; action: string; detail: string }> = [];
const MAX_OBSERVATIONS = 1000;

// ============================================================
// OBSERVATION RECORDING
// ============================================================

/**
 * Record a performance observation from any layer.
 * Called by core-orchestrator.ts after each request.
 */
export function recordObservation(obs: PerformanceObservation): void {
  observations.push(obs);
  if (observations.length > MAX_OBSERVATIONS) {
    observations.splice(0, observations.length - MAX_OBSERVATIONS);
  }
}

// ============================================================
// SLO EVALUATION
// ============================================================

function evaluateSLOs(): SLOViolation[] {
  const violations: SLOViolation[] = [];
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;  // 5-minute window

  const recent = observations.filter(o => now - o.timestamp.getTime() < windowMs);

  if (recent.length === 0) return violations;

  // P95 latency check
  const latencies = recent.map(o => o.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] ?? 0;

  if (p95Latency > SLO.P95_LATENCY_MS) {
    violations.push({
      metric: 'P95_LATENCY',
      current: p95Latency,
      threshold: SLO.P95_LATENCY_MS,
      severity: p95Latency > SLO.P95_LATENCY_MS * 3 ? 'CRITICAL' : 'WARNING',
      timestamp: new Date(),
      healingAction: 'LOG_ONLY',
    });
  }

  // Error rate check
  const errors = recent.filter(o => !o.success).length;
  const errorRate = errors / recent.length;

  if (errorRate > SLO.ERROR_RATE) {
    violations.push({
      metric: 'ERROR_RATE',
      current: errorRate,
      threshold: SLO.ERROR_RATE,
      severity: errorRate > 0.05 ? 'CRITICAL' : 'WARNING',
      timestamp: new Date(),
      healingAction: 'ESCALATE_DGM',
    });
  }

  // Circuit breaker check
  const circuits = getAllCircuitStats();
  const openCircuits = circuits.filter(c => c.state === 'OPEN');

  if (openCircuits.length >= SLO.CIRCUIT_OPEN_MAX) {
    for (const circuit of openCircuits) {
      violations.push({
        metric: `CIRCUIT_OPEN_${circuit.provider.toUpperCase()}`,
        current: 1,
        threshold: 0,
        severity: 'CRITICAL',
        timestamp: new Date(),
        healingAction: 'RESET_CIRCUIT',
      });
    }
  }

  // Cache health check (only after warmup — 100+ requests)
  if (recent.length > 100) {
    const cacheStats = getCacheStats();
    if (cacheStats.hitRate < SLO.CACHE_HIT_RATE_MIN) {
      violations.push({
        metric: 'CACHE_HIT_RATE',
        current: cacheStats.hitRate,
        threshold: SLO.CACHE_HIT_RATE_MIN,
        severity: 'INFO',
        timestamp: new Date(),
        healingAction: 'PRUNE_CACHE',
      });
    }
  }

  return violations;
}

// ============================================================
// SELF-HEALING ACTIONS
// ============================================================

async function executeHealingAction(violation: SLOViolation): Promise<string> {
  const action = violation.healingAction;

  switch (action) {
    case 'RESET_CIRCUIT': {
      const provider = violation.metric.replace('CIRCUIT_OPEN_', '').toLowerCase();
      resetCircuit(provider);
      const msg = `Reset circuit breaker for ${provider}`;
      auditLog.push({ timestamp: new Date(), action: 'RESET_CIRCUIT', detail: msg });
      return msg;
    }

    case 'PRUNE_CACHE': {
      const pruned = pruneExpiredEntries();
      const msg = `Pruned ${pruned} expired cache entries`;
      auditLog.push({ timestamp: new Date(), action: 'PRUNE_CACHE', detail: msg });
      return msg;
    }

    case 'ESCALATE_DGM': {
      const msg = `Escalating to DGM: ${violation.metric} at ${(violation.current * 100).toFixed(2)}% (threshold: ${(violation.threshold * 100).toFixed(2)}%)`;
      auditLog.push({ timestamp: new Date(), action: 'ESCALATE_DGM', detail: msg });
      // DGM escalation is handled by dgm-agent.ts
      try {
        const { escalateToGuardian } = await import('./dgm-agent');
        await escalateToGuardian(violation);
      } catch (escalateErr: any) {
        // P5 fix: Log DGM escalation failure instead of silently swallowing
        log.warn(`DGM escalation failed (non-blocking): ${escalateErr?.message ?? escalateErr}`);
      }
      return msg;
    }

    case 'LOG_ONLY': {
      const msg = `Logged violation: ${violation.metric}=${violation.current.toFixed(2)} (threshold: ${violation.threshold})`;
      auditLog.push({ timestamp: new Date(), action: 'LOG_ONLY', detail: msg });
      return msg;
    }

    default:
      return 'No action taken';
  }
}

// ============================================================
// MAIN GUARDIAN REPORT
// ============================================================

/**
 * Run a full guardian health check.
 * Called periodically (every 60s) and on-demand from API.
 */
export async function runGuardianCheck(): Promise<GuardianReport> {
  const violations = evaluateSLOs();
  const healingActionsExecuted: string[] = [];

  // Execute healing actions for violations
  for (const violation of violations) {
    if (violation.healingAction !== 'NONE') {
      try {
        const result = await executeHealingAction(violation);
        healingActionsExecuted.push(result);
      } catch (err: any) {
        log.error(`Healing action failed: ${err.message}`);
      }
    }
  }

  const report: GuardianReport = {
    timestamp: new Date(),
    healthy: violations.filter(v => v.severity !== 'INFO').length === 0,
    violations,
    healingActionsExecuted,
    circuitStats: getAllCircuitStats(),
    cacheStats: getCacheStats(),
    uptimeMs: Date.now() - startTime,
  };

  // Log critical violations
  for (const v of violations.filter(v => v.severity === 'CRITICAL')) {
    log.error(`CRITICAL: ${v.metric}=${v.current} (threshold: ${v.threshold})`);
  }

  return report;
}

/**
 * Get the immutable audit log (last N entries).
 */
export function getAuditLog(limit = 100): typeof auditLog {
  return auditLog.slice(-limit);
}

/**
 * Get performance statistics for observability.
 */
export function getPerformanceStats(): {
  totalObservations: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  avgLatencyMs: number;
} {
  if (observations.length === 0) {
    return { totalObservations: 0, p50LatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0, errorRate: 0, avgLatencyMs: 0 };
  }

  const latencies = observations.map(o => o.latencyMs).sort((a, b) => a - b);
  const errors = observations.filter(o => !o.success).length;

  return {
    totalObservations: observations.length,
    p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] ?? 0,
    p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
    p99LatencyMs: latencies[Math.floor(latencies.length * 0.99)] ?? 0,
    errorRate: errors / observations.length,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
  };
}

// ============================================================
// PERIODIC GUARDIAN (auto-run every 60s)
// ============================================================

let guardianInterval: ReturnType<typeof setInterval> | null = null;

export function startGuardian(intervalMs = 60000): void {
  if (guardianInterval) return;  // already running

  guardianInterval = setInterval(async () => {
    try {
      const report = await runGuardianCheck();
      if (!report.healthy) {
        log.warn(`Health check: ${report.violations.length} violations, ${report.healingActionsExecuted.length} actions executed`);
      }
    } catch (err: any) {
      log.error('Periodic check failed:', err.message);
    }
  }, intervalMs);

  log.info(`Started periodic health checks every ${intervalMs / 1000}s`);
}

export function stopGuardian(): void {
  if (guardianInterval) {
    clearInterval(guardianInterval);
    guardianInterval = null;
    log.info('Stopped');
  }
}
