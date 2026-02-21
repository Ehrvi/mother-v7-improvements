/**
 * MOTHER v7.0 - Layer 1: Interface Layer
 * tRPC router for MOTHER system
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { processQuery, getSystemStats } from '../mother/core';
import { addKnowledge } from '../mother/knowledge';
import { getRecentQueries, getQueryStats, getAllKnowledge } from '../db';
import { sanitizeAndValidate } from '../middleware/sanitize';

export const motherRouter = router({
  /**
   * Main query endpoint
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
});
