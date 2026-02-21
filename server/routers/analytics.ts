import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getPool } from "../db-pool";

/**
 * Analytics Router
 * Provides aggregated metrics for MOTHER v14 dashboard
 * Admin-only access
 */

export const analyticsRouter = router({
  /**
   * Get summary statistics for the last N days
   * Returns: cost reduction, quality score, cache hit rate, tier distribution, total queries
   */
  summary: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check if user is admin
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin access required for analytics',
        });
      }

      const pool = getPool();
      if (!pool) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database connection not available',
        });
      }

      try {
        // Calculate date range
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);

        // Query 1: Cost and quality metrics (using correct column names)
        const [costQualityRows] = await pool.query<any[]>(
          `SELECT 
            COUNT(*) as totalQueries,
            AVG(CAST(cost AS DECIMAL(10,6))) as avgCost,
            AVG(CAST(qualityScore AS DECIMAL(5,2))) as avgQualityScore,
            SUM(CASE WHEN cacheHit = 1 THEN 1 ELSE 0 END) as cacheHits
          FROM queries
          WHERE createdAt >= ?`,
          [startDate]
        );

        const costQuality = costQualityRows[0] || {
          totalQueries: 0,
          avgCost: 0,
          avgQualityScore: 0,
          cacheHits: 0,
        };

        // Query 2: Tier distribution
        const [tierRows] = await pool.query<any[]>(
          `SELECT 
            tier,
            COUNT(*) as count
          FROM queries
          WHERE createdAt >= ?
          GROUP BY tier`,
          [startDate]
        );

        // Calculate tier percentages
        const totalQueries = Number(costQuality.totalQueries) || 0;
        const tierCounts: Record<string, number> = {};
        
        tierRows.forEach((row: any) => {
          tierCounts[row.tier] = Number(row.count);
        });

        // Map actual tier values to target categories
        // gpt-4o-mini → guardian (cheapest, most queries)
        // gpt-4o → direct (medium cost, medium queries)
        // gpt-4 → parallel (most expensive, fewest queries)
        const tierDistribution = {
          guardian: totalQueries > 0 ? ((tierCounts['gpt-4o-mini'] || 0) / totalQueries) * 100 : 0,
          direct: totalQueries > 0 ? ((tierCounts['gpt-4o'] || 0) / totalQueries) * 100 : 0,
          parallel: totalQueries > 0 ? ((tierCounts['gpt-4'] || 0) / totalQueries) * 100 : 0,
        };

        // Calculate cache hit rate
        const cacheHitRate = totalQueries > 0 
          ? (Number(costQuality.cacheHits) / totalQueries) * 100 
          : 0;

        // Calculate cost reduction
        // Baseline: $0.0145 per query (GPT-4 average)
        // Actual: avgCost from database
        const baselineCost = 0.0145;
        const avgCost = Number(costQuality.avgCost) || 0;
        const avgCostReduction = avgCost > 0 
          ? ((baselineCost - avgCost) / baselineCost) * 100 
          : 0;

        return {
          totalQueries,
          avgCost,
          avgQualityScore: Number(costQuality.avgQualityScore) || 0,
          avgCostReduction,
          cacheHitRate,
          tierDistribution,
          dateRange: {
            from: startDate.toISOString(),
            to: new Date().toISOString(),
          },
        };
      } catch (error: any) {
        console.error('[Analytics] Error fetching summary:', error);
        
        // Return empty data instead of throwing error (graceful degradation)
        const fallbackStartDate = new Date();
        fallbackStartDate.setDate(fallbackStartDate.getDate() - input.days);
        
        return {
          totalQueries: 0,
          avgCost: 0,
          avgQualityScore: 0,
          avgCostReduction: 0,
          cacheHitRate: 0,
          tierDistribution: {
            guardian: 0,
            direct: 0,
            parallel: 0,
          },
          dateRange: {
            from: fallbackStartDate.toISOString(),
            to: new Date().toISOString(),
          },
        };
      }
    }),
});
