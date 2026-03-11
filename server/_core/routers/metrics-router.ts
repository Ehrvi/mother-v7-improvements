/**
 * metrics-router.ts — MOTHER v87.0 — Ciclo 199
 *
 * Metrics and observability routes extracted from a2a-server.ts.
 * Part of NC-ARCH-002 resolution: decomposing God Object a2a-server.ts (2.268L).
 *
 * Scientific basis:
 * - Conselho C188 Seção 5.4 — NC-ARCH-002 God Object decomposition
 * - Dean & Barroso (2013) CACM 56(2) — The Tail at Scale (P50/P95/P99 metrics)
 * - Google SRE Book (Beyer et al., 2016) — Golden Signals: latency, traffic, errors, saturation
 * - OpenTelemetry CNCF 2023 — observability standards
 *
 * @module metrics-router
 * @version 1.0.0
 * @cycle C189
 * @council C188 — NC-ARCH-002 resolution
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import { authenticateA2A } from './auth-router.js';

const log = createLogger('metrics-router');

export const metricsRouter = Router();

/**
 * GET /metrics/health — System health (no auth required)
 * Scientific basis: Google SRE Book — health check endpoints
 */
metricsRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: process.env.MOTHER_VERSION || 'v87.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /metrics/latency — P50/P95/P99 latency report
 * Scientific basis: Dean & Barroso (2013) — tail latency analysis
 */
metricsRouter.get('/latency', authenticateA2A, async (_req: Request, res: Response) => {
  try {
    const { getLatencyReport } = await import('../../mother/latency-telemetry.js');
    const report = getLatencyReport();
    res.json(report);
  } catch (err) {
    log.warn('[MetricsRouter] Latency middleware not available:', (err as Error).message);
    res.json({
      message: 'Latency middleware not loaded',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /metrics/cache — Semantic cache hit rate
 * Scientific basis: GPTCache (Zeng et al., 2023)
 */
metricsRouter.get('/cache', authenticateA2A, async (_req: Request, res: Response) => {
  try {
    const { getCacheStats } = await import('../../mother/semantic-cache.js');
    const stats = await getCacheStats();
    res.json(stats);
  } catch (err) {
    log.warn('[MetricsRouter] Cache stats not available:', (err as Error).message);
    res.json({
      hitRate: 0,
      message: 'Cache stats unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /metrics/quality — G-Eval quality scores summary
 * Scientific basis: G-Eval (Kong et al., 2023) arXiv:2303.16634
 */
metricsRouter.get('/quality', authenticateA2A, async (_req: Request, res: Response) => {
  try {
    const { getDb } = await import('../../db.js');
    const db = await getDb();
    if (!db) {
      res.json({ message: 'DB not available', timestamp: new Date().toISOString() });
      return;
    }
    // C268: Query real quality metrics from bd_central
    try {
      const [rows] = await (db as any).$client.query(
        `SELECT quality_score, tier, response_time_ms
         FROM query_log
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND quality_score IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 500`
      );
      const scores = (rows || []).map((r: any) => Number(r.quality_score)).filter((s: number) => !isNaN(s));
      const avgQ = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
      const passRate = scores.filter((s: number) => s >= 90).length / (scores.length || 1) * 100;
      res.json({
        quality_avg_24h: Math.round(avgQ * 10) / 10,
        quality_pass_rate_pct: Math.round(passRate * 10) / 10,
        quality_target: 90,
        sample_count: scores.length,
        gEvalTarget: 87.8,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.json({ message: 'Quality metrics endpoint ready', gEvalTarget: 87.8, timestamp: new Date().toISOString() });
    }
  } catch (err) {
    log.warn('[MetricsRouter] Quality metrics not available:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /metrics/dashboard — C268: Comprehensive real-time metrics dashboard
 * Scientific basis:
 *   - Dean & Barroso (2013) CACM 56(2) — The Tail at Scale (P50/P95/P99 metrics)
 *   - Google SRE Book (Beyer et al., 2016) — Golden Signals: latency, traffic, errors, saturation
 *   - G-Eval (Kong et al., 2023, arXiv:2303.16634) — quality scoring
 *   - FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — tier distribution
 *   - Conselho V102 — 'indicadores mensuráveis' requirement
 */
metricsRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    // Latency metrics
    let latencyReport: any = null;
    try {
      const { getLatencyReport } = await import('../../mother/latency-telemetry.js');
      latencyReport = getLatencyReport();
    } catch { /* non-blocking */ }

    // Cache metrics
    let cacheStats: any = null;
    try {
      const { getCacheStats } = await import('../../mother/semantic-cache.js');
      cacheStats = await getCacheStats();
    } catch { /* non-blocking */ }

    // DB metrics (quality + tier distribution)
    let qualityMetrics: any = null;
    let tierDistribution: any = null;
    try {
      const { getDb } = await import('../../db.js');
      const db = await getDb();
      if (db) {
        const [qRows] = await (db as any).$client.query(
          `SELECT
             AVG(quality_score) as avg_quality,
             MIN(quality_score) as min_quality,
             MAX(quality_score) as max_quality,
             COUNT(*) as total,
             SUM(CASE WHEN quality_score >= 90 THEN 1 ELSE 0 END) as pass_count,
             AVG(response_time_ms) as avg_latency_ms
           FROM query_log
           WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
           AND quality_score IS NOT NULL`
        ).catch(() => [[]]);
        if (qRows && qRows[0]) {
          const r = qRows[0];
          qualityMetrics = {
            avg: Math.round((Number(r.avg_quality) || 0) * 10) / 10,
            min: Number(r.min_quality) || 0,
            max: Number(r.max_quality) || 0,
            total: Number(r.total) || 0,
            pass_rate_pct: Math.round(((Number(r.pass_count) || 0) / (Number(r.total) || 1)) * 1000) / 10,
            avg_latency_ms: Math.round(Number(r.avg_latency_ms) || 0),
          };
        }
        const [tRows] = await (db as any).$client.query(
          `SELECT tier, COUNT(*) as count
           FROM query_log
           WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
           GROUP BY tier`
        ).catch(() => [[]]);
        if (tRows) {
          tierDistribution = {};
          for (const row of (tRows as any[])) {
            tierDistribution[row.tier] = Number(row.count);
          }
        }
      }
    } catch { /* non-blocking */ }

    res.json({
      version: process.env.MOTHER_VERSION || 'v122.12',
      cycle: process.env.MOTHER_CYCLE || '265',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      latency: latencyReport ? {
        p50_ms: latencyReport.overall?.p50 || 0,
        p95_ms: latencyReport.overall?.p95 || 0,
        p99_ms: latencyReport.overall?.p99 || 0,
        total_requests: latencyReport.totalRequests || 0,
        cache_hit_rate_pct: Math.round((latencyReport.cacheHitRate || 0) * 100),
        recommendation: latencyReport.recommendation || '',
      } : { p50_ms: 0, p95_ms: 0, p99_ms: 0, total_requests: 0, cache_hit_rate_pct: 0, recommendation: 'No data yet' },
      cache: cacheStats ? {
        hit_rate_pct: Math.round((cacheStats.hitRate || 0) * 100),
        total_entries: cacheStats.totalEntries || 0,
      } : { hit_rate_pct: 0, total_entries: 0 },
      quality: qualityMetrics || { avg: 0, min: 0, max: 0, total: 0, pass_rate_pct: 0, avg_latency_ms: 0 },
      tier_distribution: tierDistribution || {},
      targets: {
        quality_min: 90,
        latency_p50_ms: 10000,
        cache_hit_rate_pct: 30,
        pass_rate_pct: 80,
      },
      scientific_basis: [
        'Dean & Barroso (2013) CACM 56(2) — The Tail at Scale',
        'G-Eval (Kong et al., arXiv:2303.16634, 2023)',
        'FrugalGPT (Chen et al., arXiv:2305.05176, 2023)',
        'Google SRE Book (Beyer et al., 2016)',
        'Conselho V102 — indicadores mensuráveis',
      ],
    });
  } catch (err) {
    log.warn('[MetricsRouter] Dashboard metrics error:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});
