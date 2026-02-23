/**
 * MOTHER v7.0 - Layer 1: Interface Layer
 * tRPC router for MOTHER system
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { processQuery, getSystemStats } from "../mother/core";
import { addKnowledge } from "../mother/knowledge";
import { getRecentQueries, getQueryStats, getAllKnowledge } from "../db";
import { sanitizeAndValidate } from "../middleware/sanitize";
import { enqueueQuery } from "../lib/queue";
import { assessComplexity } from "../mother/intelligence";
import { createHash } from "crypto";
import { invokeCodeAgent } from "../mother/code_agent";

export const motherRouter = router({
  /**
   * Async query endpoint (uses BullMQ for tier 3 queries)
   * Returns job ID for polling, or immediate result for tier 1-2
   */
  queryAsync: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(5000),
        useCache: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sanitizedQuery = sanitizeAndValidate(input.query, 5000);

      // Assess complexity to determine if we should queue
      const complexity = assessComplexity(sanitizedQuery);
      const queryHash = createHash("sha256")
        .update(sanitizedQuery.toLowerCase().trim())
        .digest("hex");

      // Tier 3 (gpt-4) queries go to queue for async processing
      if (complexity.tier === "gpt-4") {
        const job = await enqueueQuery({
          query: sanitizedQuery,
          userId: ctx.user?.id,
          tier: complexity.tier,
          queryHash,
          timestamp: Date.now(),
        });

        if (job) {
          return {
            async: true,
            jobId: job.id,
            tier: complexity.tier,
            message:
              "Query queued for processing. Use /api/trpc/queue.job to check status.",
          };
        }

        // Fallback to sync processing if queue is not available
      }

      // Tier 1-2 queries process synchronously (fast enough)
      const result = await processQuery({
        query: sanitizedQuery,
        userId: ctx.user?.id,
        useCache: input.useCache,
      });

      return {
        async: false,
        result,
      };
    }),

  /**
   * Main query endpoint (synchronous)
   * Processes a query through all 7 MOTHER layers
   */
  query: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(5000),
        useCache: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Sanitize and validate input to prevent XSS/injection attacks
      const sanitizedQuery = sanitizeAndValidate(input.query, 5000);

      const result = await processQuery({
        query: sanitizedQuery,
        userId: ctx.user?.id,
        useCache: input.useCache,
      });

      return result;
    }),

  /**
   * Get query history for current user
   */
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      const queries = await getRecentQueries(input.limit);

      // Filter to current user's queries
      const userQueries = queries.filter(q => q.userId === ctx.user.id);

      return userQueries;
    }),

  /**
   * Get all queries (admin only)
   */
  allQueries: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(100),
      })
    )
    .query(async ({ input }) => {
      return await getRecentQueries(input.limit);
    }),

  /**
   * Get system statistics
   * Shows cost reduction, quality scores, tier distribution, etc.
   */
  stats: publicProcedure.query(async () => {
    return await getSystemStats();
  }),

  /**
   * Get detailed analytics
   */
  analytics: publicProcedure
    .input(
      z.object({
        periodHours: z.number().min(1).max(168).optional().default(24),
      })
    )
    .query(async ({ input }) => {
      return await getQueryStats(input.periodHours);
    }),

  /**
   * Add knowledge to the system
   * Stores in database for future retrieval
   */
  addKnowledge: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(500),
        content: z.string().min(1),
        category: z.string().optional(),
        source: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await addKnowledge(
        input.title,
        input.content,
        input.category,
        input.source
      );

      return { id, success: true };
    }),

  /**
   * Get all knowledge entries
   */
  knowledge: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(100),
      })
    )
    .query(async ({ input }) => {
      return await getAllKnowledge(input.limit);
    }),

  /**
   * v31.0: CodeAgent endpoint
   * Invokes the autonomous CodeAgent to perform software engineering tasks
   * 
   * Example task: "Add a new field 'priority' of type 'number' with default value 0 to the 'queries' table in drizzle/schema.ts"
   */
  runCodeAgent: protectedProcedure
    .input(
      z.object({
        task: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ input }) => {
      return await invokeCodeAgent(input.task);
    }),
});
