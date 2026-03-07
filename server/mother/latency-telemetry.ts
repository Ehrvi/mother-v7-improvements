/**
 * latency-telemetry.ts — MOTHER v81.8 — Ciclo 186 — Phase 2.3 (NC-LATENCY-001)
 *
 * Latency telemetry module for P50/P95/P99 measurement across routing tiers.
 *
 * Scientific basis:
 * - Percentile latency measurement: Dean & Barroso (2013) "The Tail at Scale" (CACM 56(2))
 * - FrugalGPT (Chen et al., 2023, arXiv:2305.05176): tier-based latency targets
 * - Apdex score: Application Performance Index (Apdex Alliance, 2007)
 *   Formula: Apdex(T) = (Satisfied + 0.5 × Tolerating) / Total
 *   where Satisfied = latency ≤ T, Tolerating = T < latency ≤ 4T, Frustrated = latency > 4T
 *
 * Latency targets (FrugalGPT tiers):
 * - TIER_1: P50 target ≤ 800ms, P95 target ≤ 2000ms
 * - TIER_2: P50 target ≤ 1500ms, P95 target ≤ 4000ms
 * - TIER_3: P50 target ≤ 3000ms, P95 target ≤ 8000ms
 * - TIER_4: P50 target ≤ 8000ms, P95 target ≤ 20000ms
 *
 * Author: MOTHER v81.8 — Ciclo 186 — Phase 2.3
 */

export type RoutingTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4' | 'CACHE_HIT' | 'ERROR';

export interface LatencyRecord {
  tier: RoutingTier;
  durationMs: number;
  timestamp: Date;
  cacheHit: boolean;
  model?: string;
  tokenCount?: number;
}

export interface PercentileStats {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  count: number;
}

export interface TierLatencyReport {
  tier: RoutingTier;
  stats: PercentileStats;
  target_p50_ms: number;
  target_p95_ms: number;
  p50_ok: boolean;
  p95_ok: boolean;
  apdex: number;  // 0-1, where 1 = perfect
  apdex_t_ms: number;  // Apdex threshold T
}

export interface LatencyTelemetryReport {
  generatedAt: Date;
  totalRequests: number;
  cacheHitRate: number;
  overall: PercentileStats;
  byTier: Record<RoutingTier, TierLatencyReport>;
  recommendation: string;
  scientificBasis: string;
}

// ── Tier latency targets (FrugalGPT, Chen et al. 2023) ───────────────────────

const TIER_TARGETS: Record<RoutingTier, { p50_ms: number; p95_ms: number; apdex_t_ms: number }> = {
  TIER_1:    { p50_ms: 800,   p95_ms: 2000,  apdex_t_ms: 800   },
  TIER_2:    { p50_ms: 1500,  p95_ms: 4000,  apdex_t_ms: 1500  },
  TIER_3:    { p50_ms: 3000,  p95_ms: 8000,  apdex_t_ms: 3000  },
  TIER_4:    { p50_ms: 8000,  p95_ms: 20000, apdex_t_ms: 8000  },
  CACHE_HIT: { p50_ms: 50,    p95_ms: 200,   apdex_t_ms: 50    },
  ERROR:     { p50_ms: 5000,  p95_ms: 15000, apdex_t_ms: 5000  },
};

// ── In-memory circular buffer (max 10,000 records) ───────────────────────────

const MAX_RECORDS = 10_000;
const records: LatencyRecord[] = [];
let totalCacheHits = 0;
let totalRequests = 0;

/**
 * Record a latency measurement.
 * Call this after each request completes.
 */
export function recordLatency(
  tier: RoutingTier,
  durationMs: number,
  options: { cacheHit?: boolean; model?: string; tokenCount?: number } = {}
): void {
  const record: LatencyRecord = {
    tier,
    durationMs,
    timestamp: new Date(),
    cacheHit: options.cacheHit ?? false,
    model: options.model,
    tokenCount: options.tokenCount,
  };

  records.push(record);
  if (records.length > MAX_RECORDS) records.shift();

  totalRequests++;
  if (options.cacheHit) totalCacheHits++;
}

/**
 * Compute percentile from sorted array.
 * Uses linear interpolation (NIST method).
 */
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const fraction = idx - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

/**
 * Compute Apdex score for a set of latency values.
 * Apdex(T) = (Satisfied + 0.5 × Tolerating) / Total
 * - Satisfied: latency ≤ T
 * - Tolerating: T < latency ≤ 4T
 * - Frustrated: latency > 4T
 *
 * Reference: Apdex Alliance (2007), https://www.apdex.org/
 */
function computeApdex(values: number[], T: number): number {
  if (values.length === 0) return 1.0;
  const satisfied = values.filter(v => v <= T).length;
  const tolerating = values.filter(v => v > T && v <= 4 * T).length;
  return Math.round(((satisfied + 0.5 * tolerating) / values.length) * 1000) / 1000;
}

/**
 * Compute percentile stats for an array of values.
 */
function computeStats(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { p50: 0, p75: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    p50: Math.round(computePercentile(sorted, 50)),
    p75: Math.round(computePercentile(sorted, 75)),
    p95: Math.round(computePercentile(sorted, 95)),
    p99: Math.round(computePercentile(sorted, 99)),
    mean: Math.round(mean),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: values.length,
  };
}

/**
 * Generate a comprehensive latency telemetry report.
 * Includes P50/P75/P95/P99 per tier, Apdex scores, and recommendations.
 *
 * Scientific basis: Dean & Barroso (2013) "The Tail at Scale" (CACM 56(2))
 */
export function getLatencyReport(windowMs?: number): LatencyTelemetryReport {
  const now = Date.now();
  const filtered = windowMs
    ? records.filter(r => now - r.timestamp.getTime() <= windowMs)
    : records;

  const allDurations = filtered.map(r => r.durationMs);
  const overall = computeStats(allDurations);
  const cacheHitRate = totalRequests > 0
    ? Math.round((totalCacheHits / totalRequests) * 1000) / 1000
    : 0;

  // Compute per-tier stats
  const byTier = {} as Record<RoutingTier, TierLatencyReport>;
  const tiers: RoutingTier[] = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'CACHE_HIT', 'ERROR'];

  for (const tier of tiers) {
    const tierRecords = filtered.filter(r => r.tier === tier);
    const tierDurations = tierRecords.map(r => r.durationMs);
    const stats = computeStats(tierDurations);
    const targets = TIER_TARGETS[tier];
    const apdex = computeApdex(tierDurations, targets.apdex_t_ms);

    byTier[tier] = {
      tier,
      stats,
      target_p50_ms: targets.p50_ms,
      target_p95_ms: targets.p95_ms,
      p50_ok: stats.count === 0 || stats.p50 <= targets.p50_ms,
      p95_ok: stats.count === 0 || stats.p95 <= targets.p95_ms,
      apdex,
      apdex_t_ms: targets.apdex_t_ms,
    };
  }

  // Generate recommendation
  const violations = tiers.filter(t => byTier[t].stats.count > 0 && (!byTier[t].p50_ok || !byTier[t].p95_ok));
  let recommendation: string;
  if (violations.length === 0) {
    recommendation = 'All tiers within P50/P95 targets. System performing optimally.';
  } else {
    const details = violations.map(t => {
      const r = byTier[t];
      const issues = [];
      if (!r.p50_ok) issues.push(`P50=${r.stats.p50}ms > target ${r.target_p50_ms}ms`);
      if (!r.p95_ok) issues.push(`P95=${r.stats.p95}ms > target ${r.target_p95_ms}ms`);
      return `${t}: ${issues.join(', ')}`;
    });
    recommendation = `Latency violations detected: ${details.join(' | ')}. Consider: (1) increase cache warm-up queries, (2) reduce TIER_3/4 model count, (3) enable Cloud Run min-instances.`;
  }

  return {
    generatedAt: new Date(),
    totalRequests,
    cacheHitRate,
    overall,
    byTier,
    recommendation,
    scientificBasis: 'Dean & Barroso (2013) "The Tail at Scale" (CACM 56(2)) + FrugalGPT (Chen et al., 2023, arXiv:2305.05176)',
  };
}

/**
 * Get current P50 for a specific tier.
 * Convenience function for quick checks.
 */
export function getTierP50(tier: RoutingTier): number {
  const tierRecords = records.filter(r => r.tier === tier);
  if (tierRecords.length === 0) return 0;
  const durations = tierRecords.map(r => r.durationMs).sort((a, b) => a - b);
  return Math.round(computePercentile(durations, 50));
}

/**
 * Reset all telemetry data.
 * Use for testing or after major configuration changes.
 */
export function resetTelemetry(): void {
  records.length = 0;
  totalCacheHits = 0;
  totalRequests = 0;
}

/**
 * Get raw records for debugging.
 */
export function getRawRecords(limit = 100): LatencyRecord[] {
  return records.slice(-limit);
}
