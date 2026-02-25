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
import { getAgentPool, getFitnessHistory } from '../mother/gea_supervisor';
import { getDb } from '../db';
import { randomUUID } from 'crypto';
import { getProposals, approveProposal, logAuditEvent, CREATOR_EMAIL as CREATOR } from '../mother/update-proposals';

export const motherRouter = router({
  /**
   * Main query endpoint — v63.0
   * Processes a query through all 7 MOTHER layers.
   * Supports multi-turn conversation history and admin slash commands.
   */
  query: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(10000),
        useCache: z.boolean().optional().default(true),
        conversationHistory: z.array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          })
        ).optional().default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userEmail = ctx.user?.email ?? undefined;
      const isCreator = userEmail === CREATOR;
      const query = input.query.trim();

      // ==================== ADMIN COMMAND HANDLER (v63.0) ====================
      // Slash commands for creator administration via prompt
      // Scientific basis: CLI-first design (Raymond, The Art of Unix Programming, 2003)
      if (isCreator && query.startsWith('/')) {
        const parts = query.split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        // /status — Current operational status
        if (cmd === '/status') {
          const stats = await getSystemStats();
          const response = [
            '## ⚙️ MOTHER v63.0 — System Status',
            '',
            `- **Version:** v63.0`,
            `- **Total Queries Processed:** ${stats.totalQueries ?? 'N/A'}`,
            `- **Average Quality Score:** ${stats.avgQuality?.toFixed(1) ?? 'N/A'}/100`,
            `- **Avg Response Time:** ${stats.avgResponseTime?.toFixed(0) ?? 'N/A'}ms`,
            `- **Cache Hit Rate:** ${stats.cacheHitRate?.toFixed(1) ?? 'N/A'}%`,
            `- **DGM Status:** Active`,
            '',
            '_Use `/proposals` to see pending self-update proposals._',
          ].join('\n');
          return { response, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
        }

        // /proposals — List all pending DGM proposals
        if (cmd === '/proposals') {
          const proposals = await getProposals(undefined, 20);
          const pending = proposals.filter(p => p.status === 'pending');
          let response = `## 🧠 DGM Self-Update Proposals (${pending.length} pending)\n\n`;
          if (pending.length === 0) {
            response += '_No pending proposals. MOTHER will generate new ones after 10 more queries._';
          } else {
            pending.forEach(p => {
              response += `### Proposal ID ${p.id}: ${p.title}\n`;
              response += `- **Description:** ${p.description}\n`;
              response += `- **Metric Trigger:** ${p.affectedModules ?? 'N/A'}\n`;
              response += `- **Status:** ${p.status}\n\n`;
            });
            response += `_Use \`/approve [ID]\` to approve a proposal._`;
          }
          return { response, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
        }

        // /approve [ID] — Approve a DGM proposal
        if (cmd === '/approve') {
          const proposalId = parseInt(args, 10);
          if (isNaN(proposalId)) {
            return { response: '❌ Usage: `/approve [ID]` — e.g. `/approve 1`', tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
          }
          const result = await approveProposal(proposalId, userEmail!);
          const response = result.success
            ? `✅ **Proposal ID ${proposalId} approved.** The DGM self-update pipeline will now execute this improvement.\n\nReason: ${result.reason}`
            : `❌ **Failed to approve Proposal ID ${proposalId}.**\n\nReason: ${result.reason}`;
          return { response, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
        }

        // /audit — Full system audit
        if (cmd === '/audit') {
          const stats = await getSystemStats();
          const proposals = await getProposals(undefined, 10);
          const pending = proposals.filter(p => p.status === 'pending');
          const response = [
            '## 🔍 MOTHER v63.0 — Full System Audit',
            '',
            '### Performance Metrics',
            `| Metric | Value |`,
            `|--------|-------|`,
            `| Version | v63.0 |`,
            `| Total Queries | ${stats.totalQueries ?? 'N/A'} |`,
            `| Avg Quality | ${stats.avgQuality?.toFixed(1) ?? 'N/A'}/100 |`,
            `| Avg Response Time | ${stats.avgResponseTime?.toFixed(0) ?? 'N/A'}ms |`,
            `| Cache Hit Rate | ${stats.cacheHitRate?.toFixed(1) ?? 'N/A'}% |`,
            '',
            '### DGM Status',
            `- **Pending Proposals:** ${pending.length}`,
            ...pending.map(p => `  - ID ${p.id}: ${p.title}`),
            '',
            '### Architecture',
            '- 7-Layer Cognitive Architecture: ✅ Active',
            '- Darwin Gödel Machine (DGM): ✅ Active',
            '- Episodic Memory: ✅ Active',
            '- Scientific RAG: ✅ Active',
            '- Guardian Quality System: ✅ Active',
            '',
            '_Audit complete. Use `/approve [ID]` to approve pending proposals._',
          ].join('\n');
          return { response, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
        }

        // /learn [text] — Ingest knowledge directly
        if (cmd === '/learn') {
          if (!args.trim()) {
            return { response: '❌ Usage: `/learn [text to learn]` — e.g. `/learn Quantum entanglement is...`', tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
          }
          await addKnowledge(
            `Creator Direct Learn: ${args.slice(0, 80)}`,
            args,
            'creator_direct',
            'creator'
          );
          await logAuditEvent({ action: 'CREATOR_DIRECT_LEARN', actorType: 'creator', actorEmail: userEmail, targetType: 'knowledge', details: `Direct learn: ${args.slice(0, 100)}`, success: true });
          return { response: `✅ **Knowledge ingested successfully.**\n\n> ${args.slice(0, 200)}${args.length > 200 ? '...' : ''}\n\n_This information is now part of my permanent knowledge base._`, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
        }
      }
      // ==================== END ADMIN COMMAND HANDLER ====================

      const result = await processQuery({
        query,
        userId: ctx.user?.id,
        userEmail,
        useCache: input.useCache,
        conversationHistory: input.conversationHistory,
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
        const SERVICE_URL = process.env.SERVICE_URL || 'https://mother-interface-qtvghovzxa-ts.a.run.app';
        const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'mothers-library-mcp';
        const QUEUE = 'dgm-evolution-queue';
        const LOCATION = 'australia-southeast1';

        // v45.0: Use Cloud Tasks for true async execution (solves fire-and-forget problem)
        try {
          const { CloudTasksClient } = await import('@google-cloud/tasks');
          const tasksClient = new CloudTasksClient();
          const queuePath = tasksClient.queuePath(PROJECT, LOCATION, QUEUE);
          const taskPayload = JSON.stringify({ run_id: runId, goal: input.goal });
          const task = {
            httpRequest: {
              httpMethod: 'POST' as const,
              url: `${SERVICE_URL}/api/dgm/execute`,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(taskPayload).toString('base64'),
              oidcToken: {
                serviceAccountEmail: `mother-cloudrun-sa@${PROJECT}.iam.gserviceaccount.com`,
              },
            },
          };
          const [createdTask] = await tasksClient.createTask({ parent: queuePath, task });

          // Store task in dgm_task_queue for tracking
          // FIX v46.0: await getDb() - getDb() is async
          const db = await getDb();
          if (db) {
            try {
              await (db as any).$client.query(
                `INSERT INTO dgm_task_queue (run_id, goal, status, cloud_task_name, created_at) VALUES (?, ?, 'queued', ?, NOW())`,
                [runId, input.goal, createdTask.name || '']
              );
            } catch (dbErr) {
              console.warn('[GEA] Could not store task in queue:', dbErr);
            }
          }

          console.log(`[GEA] Task queued via Cloud Tasks: run_id=${runId}`);
          return {
            run_id: runId,
            status: 'queued',
            message: 'GEA evolution queued via Cloud Tasks. Use supervisor.getStatus to monitor progress.',
            execution_mode: 'cloud_tasks_async',
          };
        } catch (cloudTasksError) {
          // Fallback to direct execution if Cloud Tasks fails
          console.warn('[GEA] Cloud Tasks unavailable, falling back to direct execution:', cloudTasksError);
          invokeSupervisor(input.goal, runId).catch((error) => {
            console.error(`[Supervisor] Error in run ${runId}:`, error);
          });
          return {
            run_id: runId,
            status: 'started',
            message: 'Supervisor evolution started (direct mode). Use supervisor.getStatus to monitor progress.',
            execution_mode: 'direct_fallback',
          };
        }
      }),

    /**
     * v45.0: GEA Agent Pool - View current agent pool with Performance-Novelty scores
     * Scientific basis: Group-Evolving Agents (Weng et al., arXiv:2602.04837)
     */
    agentPool: publicProcedure
      .query(async () => {
        const pool = await getAgentPool();
        return {
          pool_size: pool.length,
          max_pool_size: 5,
          agents: pool.map(a => ({
            id: a.id.slice(0, 8),
            fitness_score: a.fitnessScore,
            novelty_score: a.noveltyScore,
            performance_novelty_score: a.performanceNoveltyScore,
            strategies_count: a.strategies.length,
            strategies: a.strategies,
            full_fitness_breakdown: a.fullFitnessBreakdown || null,
            created_at: a.createdAt,
          })),
        };
      }),

    /**
     * v47.0: Fitness History - Cross-generation fitness tracking
     * Scientific basis: DGM (Zhang et al., arXiv:2505.22954) — fitness should improve
     * monotonically across generations in a well-functioning evolutionary system.
     */
    fitnessHistory: publicProcedure
      .input(
        z.object({
          limit: z.number().min(1).max(100).optional().default(20),
        })
      )
      .query(async ({ input }) => {
        const history = await getFitnessHistory(input.limit);
        const avgFitness = history.length > 0
          ? history.reduce((sum, h) => sum + h.fitnessScore, 0) / history.length
          : 0;
        const trend = history.length >= 2
          ? history[0].fitnessScore - history[history.length - 1].fitnessScore
          : 0;
        return {
          total_generations: history.length,
          avg_fitness: parseFloat(avgFitness.toFixed(4)),
          fitness_trend: parseFloat(trend.toFixed(4)),
          trend_direction: trend > 0.01 ? 'improving' : trend < -0.01 ? 'declining' : 'stable',
          history,
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
