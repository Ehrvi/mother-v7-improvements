/**
 * MOTHER v7.0 - Layer 1: Interface Layer
 * tRPC router for MOTHER system
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { processQuery, getSystemStats } from '../mother/core';
import { addKnowledge } from '../mother/knowledge';
import { getRecentQueries, getQueryStats, getAllKnowledge, getDgmLineage } from '../db';
import { runCodeAgent } from '../mother/code_agent';
import { invokeSupervisor, getSupervisorStatus } from '../mother/supervisor';
import { randomUUID } from 'crypto';

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
      const result = await processQuery({
        query: input.query,
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
   * v31.0 - CodeAgent endpoint
   * Runs an autonomous coding task using LangGraph ReAct agent
   * Scientific basis: ReAct (Yao et al., ICLR 2023)
   */
  runCodeAgent: protectedProcedure
    .input(
      z.object({
        task: z.string().min(1).max(10000).describe('The coding task to execute'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runCodeAgent(input.task);
      return result;
    }),

  /**
   * v43.0: DGM Lineage Dashboard
   * Returns the evolutionary tree from dgm_archive for visualization.
   * Scientific basis: Darwin Gödel Machine (Sakana AI, arXiv:2505.22954)
   * "The DGM archive provides a transparent, traceable lineage of every change."
   */
  dgmLineage: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).optional().default(200),
      })
    )
    .query(async ({ input }) => {
      const entries = await getDgmLineage(input.limit);
      // Aggregate statistics for the dashboard
      const fitnessScores = entries.map(e => e.fitnessScore ?? 0).filter(f => f > 0);
      return {
        entries,
        total: entries.length,
        rootCount: entries.filter(e => !e.parentId).length,
        maxFitness: fitnessScores.length > 0 ? Math.max(...fitnessScores) : 0,
        avgFitness: fitnessScores.length > 0
          ? fitnessScores.reduce((sum, f) => sum + f, 0) / fitnessScores.length
          : 0,
        generationsWithFitness: fitnessScores.length,
      };
    }),

  /**
   * v38.0: DGM Supervisor - Orchestrates multi-agent evolution loop
   * Scientific basis: Darwin Godel Machine (Sakana AI, 2025)
   */
  supervisor: router({
    evolve: publicProcedure
      .input(
        z.object({
          goal: z.string().min(1).max(2000),
        })
      )
      .mutation(async ({ input }) => {
        const runId = randomUUID();
        invokeSupervisor(input.goal, runId).catch((error) => {
          console.error(`[Supervisor] Error in run ${runId}:`, error);
        });
        return {
          run_id: runId,
          status: 'started',
          message: 'Supervisor evolution started. Use supervisor.getStatus to monitor progress.',
        };
      }),

    getStatus: publicProcedure
      .input(
        z.object({
          run_id: z.string().uuid(),
        })
      )
      .query(async ({ input }) => {
        const stateHistory = await getSupervisorStatus(input.run_id);
        if (stateHistory.length === 0) {
          return {
            run_id: input.run_id,
            status: 'not_found',
            message: 'No state found for this run_id.',
            history: [],
          };
        }
        const latestState = stateHistory[0];
        const isComplete = Array.isArray(latestState.next) && latestState.next.length === 0;
        return {
          run_id: input.run_id,
          status: isComplete ? 'completed' : 'running',
          current_node: Array.isArray(latestState.values?.next) ? latestState.values.next[0] : latestState.values?.next,
          message_count: latestState.values.messages?.length || 0,
          checkpoint: latestState.config?.configurable?.checkpoint_id || null,
          history: stateHistory.map((state) => ({
            checkpoint_id: state.config?.configurable?.checkpoint_id,
            next: state.next,
            message_count: state.values.messages?.length || 0,
          })),
        };
      }),
  }),
});
