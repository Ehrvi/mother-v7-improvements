/**
 * core-system-utils.ts — SRP Phase 3 (Ciclo 78)
 *
 * Extracted from core.ts per Single Responsibility Principle (SOLID).
 * This module handles system-level utilities: batch processing and statistics.
 *
 * Scientific basis:
 * - SRP: Martin (2003) — "Clean Architecture" — a module should have one reason to change
 * - Strangler Fig Pattern: Fowler (2004) — incremental extraction from monolith
 * - Modular Monolith: Despoudis (2025) — "TypeScript 5 Design Patterns and Best Practices"
 *
 * Ciclo 78: Extracted processBatch + getSystemStats from core.ts (1426 → 1383 lines)
 */

// MOTHER_VERSION is exported from core.ts
// We use a lazy import to avoid circular dependency
import type { MotherResponse } from './core-pipeline-types';

/**
 * Process multiple queries in sequence.
 * Delegates to processQuery from core.ts.
 */
export async function processBatch(queries: string[], userId?: number): Promise<MotherResponse[]> {
  // Lazy import to avoid circular dependency
  const { processQuery } = await import('./core');
  const results: MotherResponse[] = [];

  for (const query of queries) {
    const result = await processQuery({ query, userId });
    results.push(result);
  }

  return results;
}

/**
 * Get system statistics for the last 24 hours.
 * Layer 7: Learning/Analytics
 */
export async function getSystemStats(): Promise<{
  totalQueries: number;
  tier1Percentage: number;
  tier2Percentage: number;
  tier3Percentage: number;
  avgQuality: number;
  avgResponseTime: number;
  avgCostReduction: number;
  cacheHitRate: number;
  version: string;
}> {
  const { getQueryStats } = await import('../db');

  const stats = await getQueryStats(24); // Last 24 hours

  const total = stats.totalQueries;

  return {
    totalQueries: total,
    tier1Percentage: total > 0 ? (stats.tier1Count / total) * 100 : 0,
    tier2Percentage: total > 0 ? (stats.tier2Count / total) * 100 : 0,
    tier3Percentage: total > 0 ? (stats.tier3Count / total) * 100 : 0,
    avgQuality: stats.avgQuality,
    avgResponseTime: stats.avgResponseTime,
    avgCostReduction: stats.avgCostReduction, // v68.3: Sprint 3 fix — real data from queries table
    cacheHitRate: stats.cacheHitRate,
    version: (await import('./core')).MOTHER_VERSION, // v69.1: Dynamic version from single source of truth
  };
}
