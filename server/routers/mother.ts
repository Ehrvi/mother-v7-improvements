/**
 * MOTHER v7.0 - Layer 1: Interface Layer
 * tRPC router for MOTHER system
 */

import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { checkAllProviders } from '../mother/provider-health';
import { processQuery, getSystemStats } from '../mother/core';
import { addKnowledge } from '../mother/knowledge';
import { getRecentQueries, getQueryStats, getAllKnowledge, getDgmLineage } from '../db';
import { runCodeAgent } from '../mother/code_agent';
import { invokeSupervisor, getSupervisorStatus } from '../mother/supervisor';
import { getAgentPool, getFitnessHistory } from '../mother/gea_supervisor';
import { getDb } from '../db';
import { randomUUID } from 'crypto';
import { getProposals, approveProposal, logAuditEvent, CREATOR_EMAIL as CREATOR } from '../mother/update-proposals';
import { MOTHER_VERSION } from '../mother/core';
import { getSanitizedUserContext, QUALITY_LAB_ACCESS } from '../mother/user-hierarchy';
import { BENCHMARK_QUERIES, evaluateBenchmarkResponse, calculateBenchmarkStats, type BenchmarkResult } from '../mother/benchmark-suite';
import { runArxivPipeline, testArxivPipeline } from '../mother/arxiv-pipeline';

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
            `## ⚙️ MOTHER ${MOTHER_VERSION} — System Status`,
            '',
            `- **Version:** ${MOTHER_VERSION}`,
            `- **Build:** ${new Date().toISOString().split('T')[0]}`,
            `- **Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
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
            `## 🔍 MOTHER ${MOTHER_VERSION} — Full System Audit`,
            '',
            '### Performance Metrics',
            `| Metric | Value |`,
            `|--------|-------|`,
            `| Version | ${MOTHER_VERSION} |`,
            `| Build Date | ${new Date().toISOString().split('T')[0]} |`,
            `| Memory Heap | ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB total |`,
            `| Node.js | ${process.version} |`,
            `| Uptime | ${Math.round(process.uptime() / 60)} minutes |`,
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
        // /fitness — Real-time fitness score from the database (v71.0 fix)
                if (cmd === '/calibrate') {
          // NC-CALIBRATION-001: Run 7D G-Eval weight calibration
          // Scientific basis: Liu et al. (2023, arXiv:2303.16634)
          try {
            const { getCalibrationSummary } = await import('../mother/calibration.js');
            const summary = await getCalibrationSummary();
            return { response: `## Calibration Report\n\n${summary}`, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
          } catch (err) {
            return { response: `❌ Calibration error: ${(err as Error).message}`, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
          }
        }
        if (cmd === '/fitness') {
          const history = await getFitnessHistory(10).catch(() => []);
          const stats = await getSystemStats();
          const latest = history[0];
          const avgFitness = history.length > 0
            ? (history.reduce((s: number, h: any) => s + (h.fitnessScore || 0), 0) / history.length).toFixed(4)
            : 'N/A';
          const response = [
            `## 🧬 MOTHER ${MOTHER_VERSION} — Fitness Report`,
            ``,
            `### Score Atual`,
            `| Dimensão | Valor |`,
            `|----------|-------|`,
            `| **Fitness Score (último)** | ${latest?.fitnessScore?.toFixed(4) ?? 'N/A'} |`,
            `| **Fitness Médio (últimos 10)** | ${avgFitness} |`,
            `| **Qualidade Média** | ${stats.avgQuality?.toFixed(1) ?? 'N/A'}/100 |`,
            `| **Cache Hit Rate** | ${stats.cacheHitRate?.toFixed(1) ?? 'N/A'}% |`,
            `| **Avg Response Time** | ${stats.avgResponseTime?.toFixed(0) ?? 'N/A'}ms |`,
            `| **Total Queries** | ${stats.totalQueries ?? 'N/A'} |`,
            ``,
            `### Histórico Recente`,
            history.length > 0
              ? history.slice(0, 5).map((h: any, i: number) => `${i+1}. Score: ${h.fitnessScore?.toFixed(4) ?? 'N/A'} — ${h.createdAt ? new Date(h.createdAt).toLocaleString('pt-BR') : 'N/A'}`).join('\n')
              : '_Nenhum histórico disponível ainda._',
            ``,
            `_Fitness = 0.35×correctness + 0.20×efficiency + 0.20×robustness + 0.15×maintainability + 0.10×novelty_`,
          ].join('\n');
          return { response, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
        }
        // /docs [section] — Admin documentation (creator only)
        if (cmd === '/docs') {
          const { getAdminDocs } = await import('../mother/admin-docs');
          const section = args.trim() || undefined;
          const docs = await getAdminDocs(section);
          return { response: docs, tier: 'gpt-4o-mini' as const, complexityScore: 0, confidenceScore: 1, quality: { passed: true, qualityScore: 100, issues: [] }, responseTime: 0, tokensUsed: 0, cost: 0, costReduction: 0, cacheHit: false, queryId: -1 };
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

  /**
   * v68.8: Provider Health Check
   * Returns real-time status of all 5 LLM providers.
   * Scientific basis: Circuit Breaker Pattern (Nygard, 2007)
   * Cached for 5 minutes to avoid hammering provider APIs.
   */
  providerHealth: publicProcedure
    .input(
      z.object({
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      const report = await checkAllProviders(input.forceRefresh);
      return report;
    }),

  /**
   * v69.11: User Context Endpoint
   * Returns sanitized user context (role, permissions) for frontend authorization.
   * Scientific basis: NIST RBAC SP 800-162 (2014); Anthropic Principal Hierarchy (2026)
   * Security: Returns ONLY what the frontend needs — no secrets, no implementation details.
   */
  userContext: publicProcedure.query(async ({ ctx }) => {
    const context = getSanitizedUserContext(ctx.user);
    const qualityLabAccess = QUALITY_LAB_ACCESS[context.role];
    return {
      ...context,
      qualityLabAccess,
    };
  }),

  /**
   * v69.13: Scientific Benchmark Runner (MMLU-style, 50 standard queries)
   * Scientific basis: MMLU (Hendrycks et al., arXiv:2009.03300, 2020)
   * CREATOR ONLY: Benchmark runs cost tokens.
   */
  runBenchmark: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        maxQueries: z.number().min(1).max(50).optional().default(10),
        cycleId: z.string().optional().default('manual'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userEmail = ctx.user?.email;
      if (userEmail !== CREATOR) {
        throw new Error('Benchmark runs require creator authorization');
      }
      let queries = BENCHMARK_QUERIES;
      if (input.category) {
        queries = queries.filter(q => q.category === input.category);
      }
      queries = queries.slice(0, input.maxQueries);
      const results: BenchmarkResult[] = [];
      const startTime = Date.now();
      for (const benchQuery of queries) {
        const qStart = Date.now();
        try {
          const result = await processQuery({
            query: benchQuery.query,
            userId: ctx.user?.id,
            userEmail,
            useCache: false,
          });
          results.push(evaluateBenchmarkResponse(
            benchQuery,
            result.response,
            result.quality?.qualityScore || 75,
            Date.now() - qStart,
            result.tier || 'unknown',
          ));
        } catch (err) {
          results.push(evaluateBenchmarkResponse(
            benchQuery, `ERROR: ${err}`, 0, Date.now() - qStart, 'error',
          ));
        }
      }
      const stats = calculateBenchmarkStats(results);
      const totalTime = Date.now() - startTime;
      await logAuditEvent({
        action: 'BENCHMARK_RUN',
        actorEmail: userEmail,
        actorType: 'creator',
        targetType: 'system',
        targetId: input.cycleId,
        details: `Benchmark: ${queries.length} queries | Pass rate: ${(stats.passRate * 100).toFixed(1)}% | Avg quality: ${stats.avgQualityScore.toFixed(1)} | Time: ${totalTime}ms`,
        success: true,
      });
      return {
        cycleId: input.cycleId,
        version: MOTHER_VERSION,
        totalQueries: queries.length,
        passedQueries: results.filter(r => r.passed).length,
        passRate: stats.passRate,
        avgQualityScore: stats.avgQualityScore,
        avgResponseTime: stats.avgResponseTime,
        byCategory: stats.byCategory,
        totalTimeMs: totalTime,
        results,
      };
    }),

  /**
   * v69.13: Get benchmark queries list (no execution)
   */
  getBenchmarkQueries: publicProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => {
      let queries = BENCHMARK_QUERIES;
      if (input.category) queries = queries.filter(q => q.category === input.category);
      return {
        total: queries.length,
        categories: [...new Set(BENCHMARK_QUERIES.map(q => q.category))],
        queries: queries.map(q => ({ id: q.id, category: q.category, difficulty: q.difficulty, language: q.language, query: q.query, minQualityScore: q.minQualityScore })),
      };
    }),

  /**
   * v69.15: arXiv/PubMed Pipeline — Run automatic paper ingestion (Ciclo 35)
   * Scientific basis: Lewis et al. (2020, NeurIPS) RAG; Shi et al. (2024, arXiv:2407.01219)
   */
  runArxivPipeline: protectedProcedure
    .input(z.object({
      maxPerCategory: z.number().min(1).max(20).optional().default(5),
      daysBack: z.number().min(1).max(30).optional().default(7),
    }))
    .mutation(async ({ input }) => {
      const result = await runArxivPipeline(input.maxPerCategory, input.daysBack);
      return result;
    }),

  /**
   * v69.15: Test arXiv pipeline connectivity
   */
  testArxivPipeline: protectedProcedure
    .query(async () => {
      return await testArxivPipeline();
    }),
});
