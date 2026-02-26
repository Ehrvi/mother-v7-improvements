/**
 * MOTHER v69.12 — Metrics Aggregation Job
 *
 * Populates fitness_history, system_metrics, and learning_patterns
 * from real query data in the queries table.
 *
 * Scientific basis:
 *   - Google SRE Book (Beyer et al., 2016): Service Level Objectives
 *   - DGM fitness tracking: Zhang et al. (2025) arXiv:2505.22954
 *   - Adaptive learning: Madaan et al. (2023) Self-Refine arXiv:2303.17651
 *
 * Bug fix v69.12: These tables were empty because:
 *   1. fitness_history: DGM loop existed in code but was never called
 *   2. system_metrics: INSERT used wrong column names (endpoint vs periodStart)
 *   3. learning_patterns: learnFromResponse() called but not persisted to DB
 */

import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ── FITNESS HISTORY ──────────────────────────────────────────────────────────

/**
 * Record a fitness snapshot for the current MOTHER generation.
 * Called after every 10 queries (via runMetricsJobs in core.ts).
 */
export async function recordFitnessSnapshot(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const recentResult = await db.execute(sql`
      SELECT quality_score, response_time, cost, cache_hit, tier
      FROM queries
      WHERE created_at >= NOW() - INTERVAL 24 HOUR
        AND quality_score IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const rows = (recentResult as any)[0] as any[];
    if (!rows || rows.length === 0) return;

    const qualityScores = rows.map((r: any) => Number(r.quality_score ?? 0)).filter(q => q > 0);
    const responseTimes = rows.map((r: any) => Number(r.response_time ?? 0)).filter(t => t > 0);
    const cacheHits = rows.filter((r: any) => r.cache_hit === 1).length;

    const correctness = qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length / 100
      : 0.5;
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 30000;
    const efficiency = Math.max(0, Math.min(1, 1 - (avgResponseTime - 1000) / 29000));
    const robustness = qualityScores.length / rows.length;
    const maintainability = rows.length > 0 ? cacheHits / rows.length : 0;
    const tier3Count = rows.filter((r: any) => r.tier === 'gpt-4o' || r.tier === 'gpt-4').length;
    const novelty = rows.length > 0 ? tier3Count / rows.length : 0;

    const fitnessScore = (
      0.35 * correctness +
      0.25 * efficiency +
      0.20 * robustness +
      0.10 * maintainability +
      0.10 * novelty
    );

    const genResult = await db.execute(sql`SELECT COUNT(*) as gen FROM fitness_history`);
    const generation = Number(((genResult as any)[0] as any[])?.[0]?.gen ?? 0) + 1;

    const label = fitnessScore >= 0.85 ? 'EXCELLENT'
      : fitnessScore >= 0.70 ? 'GOOD'
      : fitnessScore >= 0.55 ? 'ACCEPTABLE'
      : 'NEEDS_IMPROVEMENT';

    const runId = `mother-${Date.now()}-gen${generation}`;
    const goalSummary = `Auto-snapshot: ${rows.length} queries, avgQuality=${Math.round(correctness * 100)}%, avgLatency=${Math.round(avgResponseTime)}ms`;

    await db.execute(sql`
      INSERT INTO fitness_history
        (run_id, generation, fitness_score, correctness, efficiency, robustness, maintainability, novelty, label, goal_summary)
      VALUES
        (${runId}, ${generation}, ${fitnessScore}, ${correctness}, ${efficiency}, ${robustness}, ${maintainability}, ${novelty}, ${label}, ${goalSummary})
    `);

    console.log(`[MOTHER] Fitness gen ${generation}: ${fitnessScore.toFixed(3)} (${label})`);
  } catch (err) {
    console.warn('[MOTHER] Fitness snapshot error:', (err as Error).message?.slice(0, 100));
  }
}

// ── SYSTEM METRICS ───────────────────────────────────────────────────────────

/**
 * Aggregate the last hour of queries into system_metrics.
 * Called every hour by the production server.
 */
export async function aggregateSystemMetrics(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const aggResult = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN tier = 'gpt-4o-mini' THEN 1 ELSE 0 END) as tier1,
        SUM(CASE WHEN tier = 'gpt-4o' THEN 1 ELSE 0 END) as tier2,
        SUM(CASE WHEN tier NOT IN ('gpt-4o-mini', 'gpt-4o') THEN 1 ELSE 0 END) as tier3,
        AVG(quality_score) as avgQuality,
        SUM(CASE WHEN quality_score >= 90 THEN 1 ELSE 0 END) as above90,
        AVG(response_time) as avgResponseTime,
        SUM(CAST(cost AS DECIMAL(10,8))) as totalCost,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cacheHits
      FROM queries
      WHERE created_at >= NOW() - INTERVAL 1 HOUR
    `);
    const r = ((aggResult as any)[0] as any[])?.[0];
    if (!r || Number(r.total) === 0) return;

    const total = Number(r.total);
    const cacheHitRate = total > 0 ? ((Number(r.cacheHits) / total) * 100).toFixed(2) : '0.00';
    const periodStart = new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const periodEnd = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const avgQuality = Number(r.avgQuality ?? 0).toFixed(2);
    const avgResponseTime = Number(r.avgResponseTime ?? 0).toFixed(0);
    const totalCost = Number(r.totalCost ?? 0).toFixed(8);

    await db.execute(sql`
      INSERT INTO system_metrics
        (period_start, period_end, total_queries, tier1_queries, tier2_queries, tier3_queries,
         avg_quality_score, quality_above_90, avg_response_time, total_cost, cache_hit_rate, created_at)
      VALUES
        (${periodStart}, ${periodEnd}, ${total}, ${Number(r.tier1)}, ${Number(r.tier2)}, ${Number(r.tier3)},
         ${avgQuality}, ${Number(r.above90)}, ${avgResponseTime}, ${totalCost}, ${cacheHitRate}, NOW())
      ON DUPLICATE KEY UPDATE
        total_queries = ${total},
        avg_quality_score = ${avgQuality},
        cache_hit_rate = ${cacheHitRate}
    `);

    console.log(`[MOTHER] System metrics: ${total} queries, quality=${avgQuality}, cache=${cacheHitRate}%`);
  } catch (err) {
    console.warn('[MOTHER] System metrics error:', (err as Error).message?.slice(0, 100));
  }
}

// ── LEARNING PATTERNS ────────────────────────────────────────────────────────

/**
 * Extract and persist learning patterns from recent high-quality queries.
 */
export async function extractAndPersistPatterns(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const patternsResult = await db.execute(sql`
      SELECT
        tier,
        AVG(quality_score) as avgQuality,
        AVG(CAST(cost AS DECIMAL(10,8))) as avgCost,
        COUNT(*) as cnt
      FROM queries
      WHERE created_at >= NOW() - INTERVAL 7 DAY
        AND quality_score >= 85
        AND tier IS NOT NULL
      GROUP BY tier
      HAVING cnt >= 3
      ORDER BY avgQuality DESC
      LIMIT 10
    `);
    const rows = ((patternsResult as any)[0] as any[]) ?? [];

    for (const row of rows) {
      const pattern = `tier:${row.tier}`;
      const successRate = Number(row.avgQuality ?? 0) / 100;
      const avgQuality = Number(row.avgQuality ?? 0);
      const avgCost = Number(row.avgCost ?? 0);
      const confidence = Math.min(1, Number(row.cnt) / 10);

      await db.execute(sql`
        INSERT INTO learning_patterns
          (pattern_type, pattern, occurrences, success_rate, avg_quality, avg_cost, confidence, is_active, last_seen)
        VALUES
          ('routing_pattern', ${pattern}, ${Number(row.cnt)}, ${successRate}, ${avgQuality}, ${avgCost}, ${confidence}, 1, NOW())
        ON DUPLICATE KEY UPDATE
          occurrences = ${Number(row.cnt)},
          success_rate = ${successRate},
          avg_quality = ${avgQuality},
          confidence = ${confidence},
          last_seen = NOW()
      `);
    }

    if (rows.length > 0) {
      console.log(`[MOTHER] Persisted ${rows.length} learning patterns`);
    }
  } catch (err) {
    console.warn('[MOTHER] Learning patterns error:', (err as Error).message?.slice(0, 100));
  }
}

// ── ORCHESTRATION ────────────────────────────────────────────────────────────

/** Run all metrics jobs (called after every 10 queries). */
export async function runMetricsJobs(): Promise<void> {
  await Promise.allSettled([
    recordFitnessSnapshot(),
    extractAndPersistPatterns(),
  ]);
}

/** Run hourly aggregation (called by production server scheduler). */
export async function runHourlyAggregation(): Promise<void> {
  await aggregateSystemMetrics();
}
