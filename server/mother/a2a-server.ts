/**
 * MOTHER v78.8: A2A (Agent2Agent) Protocol Server — NC-COLLAB-001
 *
 * Establishes direct Everton↔MOTHER communication channel via A2A protocol.
 *
 * Scientific basis:
 * - A2A Protocol (Google Cloud, April 2025): open standard for AI agent interoperability
 *   arXiv:2505.02279 (Ehtesham et al., 2025) — comparison of MCP, ACP, A2A, ANP
 * - Agent Card: self-description JSON published at /.well-known/agent.json
 *   Enables Everton to auto-discover MOTHER's capabilities without manual configuration
 * - MCP vs A2A (Auth0, 2025): "MCP extends what a single agent can do;
 *   A2A expands how agents can collaborate"
 *
 * Architecture:
 * - GET  /.well-known/agent.json   → Agent Card (A2A autodescription)
 * - GET  /api/a2a/diagnostics      → Real-time metrics for Everton
 * - POST /api/a2a/query            → Send query to MOTHER via A2A
 * - GET  /api/a2a/knowledge        → Read bd_central entries
 * - POST /api/a2a/knowledge        → Add entry to bd_central
 * - GET  /api/a2a/status           → System health check
 *
 * Authentication: Bearer token (MANUS_A2A_TOKEN env var)
 * If MANUS_A2A_TOKEN is not set, auth is skipped (dev mode)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { getLedger, computeLedgerRootHash, computeMasterHash, EVOLUTION_LEDGER } from './evolution-ledger.js';
import { registerSHMSRoutes } from '../shms/shms-api'; // NC-SHMS-001: SHMS real-time monitoring
import { getDb } from '../db';
import { knowledge, queries } from '../../drizzle/schema';
import { getRecentQueries, getQueryStats, getAllKnowledge } from '../db';
import { checkAllProviders } from './provider-health';
import { MOTHER_VERSION } from './core';
import { gte, desc, sql } from 'drizzle-orm';
import { createLogger } from '../_core/logger';

const log = createLogger('A2A');

// ── Authentication ────────────────────────────────────────────────────────────
function authenticateA2A(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.MANUS_A2A_TOKEN;
  if (!token) {
    // Dev mode: no token configured, allow all
    next();
    return;
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${token}`) {
    res.status(401).json({ error: 'Unauthorized — invalid or missing A2A token' });
    return;
  }
  next();
}

export const a2aRouter = Router();

// NC-SHMS-001: Register SHMS routes under /api/shms/*
// Scientific basis: GISTM 2020, ICOLD Bulletin 158, arXiv:2602.19603 (OPC UA PubSub)
registerSHMSRoutes(a2aRouter);

// ── Agent Card ────────────────────────────────────────────────────────────────
/**
 * GET /.well-known/agent.json
 * A2A Agent Card — self-description published at well-known URL.
 * Everton reads this at the start of each session to discover MOTHER's capabilities.
 * Scientific basis: A2A Protocol spec (Google, 2025) — Agent Cards enable
 * automatic capability discovery without manual configuration.
 */
a2aRouter.get('/.well-known/agent.json', (_req: Request, res: Response) => {
  log.info('Agent Card requested');
  res.json({
    name: 'MOTHER',
    version: MOTHER_VERSION,
    description: [
      'Multi-provider LLM orchestrator with persistent memory and autonomous self-improvement.',
      `Providers: DeepSeek, Gemini 2.5 Flash, Claude Sonnet 4-5, GPT-4o, Mistral.`,
      `Knowledge base: 1100+ scientific papers (bd_central).`,
      `Capabilities: GEA evolution (pool of 5 agents), DGM self-modification,`,
      `Knowledge Graph (GraphRAG), Abductive Reasoning, MAPE-K self-improvement,`,
      `Playwright browser (real web access), E2B code sandbox, Anna's Archive search.`,
    ].join(' '),
    url: 'https://mother-interface-qtvghovzxa-ts.a.run.app',
    capabilities: {
      streaming: true,
      multiTurn: true,
      tools: true,
      orchestration: true,
      browserAccess: true,
      codeExecution: true,
      selfModification: true,
      persistentMemory: true,
    },
    skills: [
      {
        id: 'query',
        name: 'Process Query',
        description: 'Route query to optimal LLM (DeepSeek/Gemini/Claude/GPT-4o) with RAG, Guardian quality check, and G-Eval scoring',
      },
      {
        id: 'diagnostics',
        name: 'System Diagnostics',
        description: 'Real-time metrics: quality scores, cache hit rate, provider health, recent queries',
      },
      {
        id: 'knowledge_read',
        name: 'Knowledge Base Read',
        description: 'Read bd_central with 1100+ scientific papers, filterable by quality_score and category',
      },
      {
        id: 'knowledge_write',
        name: 'Knowledge Base Write',
        description: 'Add new entries to bd_central for persistent knowledge ingestion',
      },
      {
        id: 'browser',
        name: 'Real Web Browser',
        description: 'Navigate any URL with Playwright Chromium, download PDFs, search Anna\'s Archive',
      },
      {
        id: 'code_execution',
        name: 'Code Sandbox',
        description: 'Execute Python, Node.js, Bash code in E2B isolated sandbox with artifact output',
      },
      {
        id: 'orchestrate',
        name: 'Multi-LLM Orchestration',
        description: 'Mixture of Agents (MoA) for complex queries, Debate for ambiguous queries',
      },
      {
        id: 'self_improve',
        name: 'Self-Improvement',
        description: 'MAPE-K cycle, DGM proposals, GEA evolution — MOTHER improves herself',
      },
      {
        id: 'agent_task',
        name: 'Agent Task (Ciclo 107)',
        description: 'MOTHER executes autonomous agent tasks: read codebase, write code, commit, sandbox test, deploy. Modes: read-only, write-sandbox, write-production.',
      },
    ],
    providers: ['deepseek', 'google', 'anthropic', 'openai', 'mistral'],
    authentication: {
      schemes: ['Bearer'],
      tokenEnvVar: 'MANUS_A2A_TOKEN',
    },
    endpoints: {
      agentCard: '/.well-known/agent.json',
      diagnostics: '/api/a2a/diagnostics',
      query: '/api/a2a/query',
      knowledgeRead: '/api/a2a/knowledge',
      knowledgeWrite: '/api/a2a/knowledge',
      status: '/api/a2a/status',
      agentTask: '/api/a2a/agent-task',
      stream: '/api/a2a/stream',
    },
  });
});

// ── Status ────────────────────────────────────────────────────────────────────
/**
 * GET /api/a2a/status
 * Quick health check — no auth required.
 */
a2aRouter.get('/api/a2a/status', async (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    version: MOTHER_VERSION,
    timestamp: new Date().toISOString(),
    a2a: true,
  });
});

// ── Diagnostics ───────────────────────────────────────────────────────────────
/**
 * GET /api/a2a/diagnostics
 * Real-time system metrics for Everton.
 * Enables Everton to diagnose MOTHER's state without manual inspection.
 *
 * Returns:
 * - version, timestamp
 * - metrics: cacheHitRate, avgQualityScore, totalRecentQueries
 * - recentQueries: last 20 with category, qualityScore, provider, cacheHit, responseTime
 * - providerHealth: status of all 5 LLM providers
 * - qualityDistribution: histogram of quality scores
 */
a2aRouter.get('/api/a2a/diagnostics', authenticateA2A, async (_req: Request, res: Response) => {
  try {
    log.info('Diagnostics requested by Everton');
    const [recentQueriesRaw, providerHealth] = await Promise.all([
      getRecentQueries(50),
      checkAllProviders(false),
    ]);

    const recentQueries = recentQueriesRaw as any[];

    const cacheHitRate = recentQueries.length > 0
      ? Math.round((recentQueries.filter(q => q.cacheHit === 1 || q.cacheHit === true).length / recentQueries.length) * 100) / 100
      : 0;

    const qualityScores = recentQueries
      .map(q => parseFloat(q.qualityScore || '0'))
      .filter(s => s > 0);
    const avgQualityScore = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length * 10) / 10
      : 0;

    // Quality distribution histogram
    const qualityDistribution = {
      '0-50': qualityScores.filter(s => s < 50).length,
      '50-70': qualityScores.filter(s => s >= 50 && s < 70).length,
      '70-80': qualityScores.filter(s => s >= 70 && s < 80).length,
      '80-90': qualityScores.filter(s => s >= 80 && s < 90).length,
      '90-100': qualityScores.filter(s => s >= 90).length,
    };

    // Category distribution
    const categoryDist: Record<string, number> = {};
    recentQueries.forEach(q => {
      const cat = q.queryCategory || 'unknown';
      categoryDist[cat] = (categoryDist[cat] || 0) + 1;
    });

    res.json({
      version: MOTHER_VERSION,
      timestamp: new Date().toISOString(),
      metrics: {
        cacheHitRate,
        avgQualityScore,
        totalRecentQueries: recentQueries.length,
        qualityDistribution,
        categoryDistribution: categoryDist,
      },
      recentQueries: recentQueries.slice(0, 20).map(q => ({
        id: q.id,
        category: q.queryCategory,
        qualityScore: q.qualityScore ? parseFloat(q.qualityScore) : null,
        provider: q.provider,
        cacheHit: q.cacheHit,
        responseTime: q.responseTime,
        createdAt: q.createdAt,
      })),
      providerHealth,
    });
  } catch (err) {
    log.error('Diagnostics error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// ── Knowledge Read ────────────────────────────────────────────────────────────
/**
 * GET /api/a2a/knowledge?limit=100&quality_score_min=0.8&category=orchestration
 * Read bd_central entries for Everton to load MOTHER's knowledge base.
 */
a2aRouter.get('/api/a2a/knowledge', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const minScore = Number(req.query.quality_score_min) || 0.8;
    const category = req.query.category as string | undefined;

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    let queryBuilder = db.select({
      id: knowledge.id,
      title: knowledge.title,
      content: knowledge.content,
      source: knowledge.source,
      category: knowledge.category,
      tags: knowledge.tags,
      createdAt: knowledge.createdAt,
    })
      .from(knowledge)
      .orderBy(desc(knowledge.createdAt))
      .limit(limit);

    const entries = await queryBuilder;

    // Filter in JS (knowledge table has no qualityScore field - filter by category only)
    const filtered = entries.filter((e: any) => {
      const catOk = !category || e.category === category;
      return catOk;
    });

    res.json({
      total: filtered.length,
      version: MOTHER_VERSION,
      entries: filtered,
    });
  } catch (err) {
    log.error('Knowledge read error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// ── Knowledge Write ───────────────────────────────────────────────────────────
/**
 * POST /api/a2a/knowledge
 * Add entry to bd_central — Manus can inject knowledge directly.
 * Body: { title, content, source, category, tags?, quality_score? }
 */
a2aRouter.post('/api/a2a/knowledge', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { title, content, source, category, tags, quality_score } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: 'title and content are required' });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    const result = await db.insert(knowledge).values({
      title,
      content,
      source: source || 'manus-a2a',
      category: category || 'general',
      tags: tags ? JSON.stringify(tags) : null,
      sourceType: 'external',
    });

    log.info('Knowledge added via A2A', { title, category });
    res.json({ success: true, id: Number((result as any)[0]?.insertId) });
  } catch (err) {
    log.error('Knowledge write error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// ── Query via A2A ─────────────────────────────────────────────────────────────
/**
 * POST /api/a2a/query
 * Send a query to MOTHER via A2A protocol.
 * Body: { query, userId?, userEmail?, useCache?, conversationHistory? }
 *
 * Ciclo 105 fix (NC-A2A-PARAMS-001): Added userId, userEmail to body extraction.
 * Previously these were ignored, preventing DPO routing and cache bypass.
 * Scientific basis: A2A Protocol (Google, 2025) — full context propagation.
 */
a2aRouter.post('/api/a2a/query', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { query, userId, userEmail, useCache = true, conversationHistory = [] } = req.body;
    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    // Lazy import to avoid circular dependency
    const { processQuery } = await import('./core');
    const result = await processQuery({
      query,
      userId,
      userEmail,
      useCache,
      conversationHistory,
    });

    log.info('Query processed via A2A', { category: result.tier, quality: result.quality?.qualityScore });
    res.json(result);
  } catch (err) {
    log.error('A2A query error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// ============================================================
// SSE STREAMING ENDPOINT (NC-SSE-002 Ciclo 108 — Native Token Streaming)
// ============================================================
// Scientific basis:
// - Server-Sent Events (W3C EventSource API, 2012)
// - OpenAI Streaming API: stream=true + onChunk callback in llm.ts
// - TokenFlow (Zheng et al., 2024): token-by-token delivery reduces perceived latency
// Ciclo 106: Simulated word-by-word streaming (post-hoc)
// Ciclo 108: Native token streaming via onChunk callback passed to orchestrate()
//   Tokens are emitted as they arrive from the LLM, not after full generation.
//   Falls back gracefully if provider does not support streaming.
// ============================================================
a2aRouter.get('/api/a2a/stream', authenticateA2A, async (req: Request, res: Response) => {
  const { query, userId, userEmail } = req.query as Record<string, string>;

  if (!query) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx/Cloud Run buffering
  res.flushHeaders();

  // Send initial connection event
  res.write('event: connected\ndata: {"status": "streaming", "version": "' + MOTHER_VERSION + '"}\n\n');

  let chunkIndex = 0;
  try {
    // NC-SSE-002: Native token streaming via onChunk callback
    // Tokens are emitted as they arrive from the LLM provider
    const { orchestrate } = await import('./core-orchestrator');
    const result = await orchestrate({
      query,
      userId: userId || undefined,
      sessionId: req.headers['x-session-id'] as string | undefined,
      conversationHistory: [],
      metadata: { userEmail, streaming: true, source: 'sse' },
      onChunk: (chunk: string) => {
        // Emit each token as it arrives from the LLM
        chunkIndex++;
        try {
          res.write(`data: ${JSON.stringify({ chunk, done: false, index: chunkIndex })}\n\n`);
        } catch { /* client disconnected */ }
      },
    });

    // If no chunks were emitted (provider buffered), fall back to word-by-word
    if (chunkIndex === 0 && result.response) {
      const words = result.response.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = i === 0 ? words[i] : ' ' + words[i];
        res.write(`data: ${JSON.stringify({ chunk, done: false, index: i + 1 })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      chunkIndex = words.length;
    }

    // Send final event with metadata
    res.write(`data: ${JSON.stringify({
      done: true,
      model: result.model,
      provider: result.provider,
      tier: result.tier,
      qualityScore: result.qualityScore,
      latencyMs: result.latencyMs,
      fromCache: result.fromCache,
      version: result.version,
      nativeStreaming: chunkIndex > 0,
      gEvalScores: result.layers?.find(l => l.name?.includes('G-Eval'))?.detail,
    })}\n\n`);

    log.info('SSE stream completed', { tier: result.tier, chunks: chunkIndex, latencyMs: result.latencyMs, nativeStreaming: chunkIndex > 0 });
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err), done: true })}\n\n`);
    log.error('SSE stream error', { error: String(err) });
  } finally {
    res.end();
  }
});


// ============================================================
// AGENT TASK ENDPOINT — NC-AGENT-LOOP-001 (Ciclo 107, Fase 1)
// ============================================================
// Scientific basis:
// - ReAct (Yao et al., arXiv:2210.03629, 2022): Reason-Act-Observe loop
// - Reflexion (Shinn et al., arXiv:2303.11366, 2023): Episodic memory for learning
// - Darwin Gödel Machine (Sakana AI, arXiv:2505.22954, 2025): Archive + empirical validation
// - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): Safety constraints
//
// This endpoint activates MOTHER's agent capabilities:
// - 'read-only': MOTHER reads and analyzes codebase (safe exploration)
// - 'write-sandbox': MOTHER writes code, tests in sandbox, commits to branch
// - 'write-production': MOTHER writes, tests, commits, and deploys (creator only)
//
// Milestone Zero (Ciclo 107): MOTHER writes its first code via this endpoint.
// ============================================================
a2aRouter.post('/api/a2a/agent-task', authenticateA2A, async (req: Request, res: Response) => {
  const { task, mode = 'write-sandbox', userId, threadId, maxIterations } = req.body;

  if (!task || typeof task !== 'string') {
    res.status(400).json({ error: 'task is required and must be a string' });
    return;
  }

  if (!['read-only', 'write-sandbox', 'write-production'].includes(mode)) {
    res.status(400).json({
      error: 'mode must be one of: read-only, write-sandbox, write-production',
    });
    return;
  }

  // Safety: write-production requires creator role
  // In dev mode (no MANUS_A2A_TOKEN), all modes are allowed
  if (mode === 'write-production' && process.env.MANUS_A2A_TOKEN) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== process.env.MANUS_A2A_TOKEN) {
      res.status(403).json({
        error: 'write-production mode requires creator authentication',
      });
      return;
    }
  }

  try {
    log.info('A2A agent-task received', {
      mode,
      userId,
      taskPreview: task.slice(0, 80),
    });

    const { executeAgentTask } = await import('./supervisor-activator');

    const result = await executeAgentTask({
      task,
      mode,
      userId: userId || 'anonymous',
      maxIterations: maxIterations ? Math.min(Number(maxIterations), 5) : 5,
      threadId,
    });

    log.info('A2A agent-task completed', {
      success: result.success,
      taskId: result.taskId,
      mode: result.mode,
      durationMs: result.durationMs,
      commitHash: result.commitHash,
    });

    res.json(result);
  } catch (err) {
    log.error('A2A agent-task error', { error: String(err) });
    res.status(500).json({
      error: String(err),
      success: false,
    });
  }
});

// ============================================================
// PROOF OF AUTONOMY ENDPOINTS (v79.3)
// Cryptographic proof that MOTHER autonomously created code
// Scientific basis: DGM (arXiv:2505.22954)
// ============================================================

/**
 * GET /api/a2a/autonomy
 * Get MOTHER's current autonomy level and proof summary
 */
a2aRouter.get('/api/a2a/autonomy', async (_req: Request, res: Response) => {
  try {
    const { calculateAutonomyLevel } = await import('./proof-of-autonomy');
    const autonomy = await calculateAutonomyLevel();
    res.json({
      ...autonomy,
      agent_version: MOTHER_VERSION,
      repo: 'https://github.com/Ehrvi/mother-v7-improvements',
      proof_endpoint: '/api/a2a/proof/:commitHash',
      roadmap_endpoint: '/api/a2a/roadmap-execute',
      message: 'MOTHER is a self-improving AI agent. Each proof record is cryptographically signed.'
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/proof
 * List all proofs of MOTHER's autonomous code creation
 */
a2aRouter.get('/api/a2a/proof', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const { getAllProofs, calculateAutonomyLevel } = await import('./proof-of-autonomy');
    const [proofs, autonomy] = await Promise.all([
      getAllProofs(limit, offset),
      calculateAutonomyLevel()
    ]);
    res.json({
      proofs,
      total: proofs.length,
      autonomy,
      message: `MOTHER has ${autonomy.proofs_count} cryptographically verified autonomous code creations`
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/proof/c112 — MUST be before /:commitHash to avoid route capture
 * Get Ciclo 112 cryptographic proof of autonomy
 * Scientific basis: DGM (arXiv:2505.22954) + Merkle trees (Merkle 1987)
 * @version v79.5 | Ciclo 112
 */
a2aRouter.get('/api/a2a/proof/c112', async (_req: Request, res: Response) => {
  try {
    const { getFullProof, verifyProof, PROOF_SUMMARY } = await import('./autonomy-proof-c112');
    const proof = getFullProof();
    const valid = verifyProof(proof);
    res.json({
      valid,
      proof: PROOF_SUMMARY,
      full_proof: proof,
      verification_method: 'SHA-256 chain hash',
      scientific_basis: 'Darwin Gödel Machine (arXiv:2505.22954)',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('A2A proof/c112 error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/proof/:commitHash
 * Verify that MOTHER autonomously created code for a given commit
 */
a2aRouter.get('/api/a2a/proof/:commitHash', async (req: Request, res: Response) => {
  const { commitHash } = req.params;
  if (!commitHash || commitHash.length < 7) {
    return res.status(400).json({ error: 'commitHash must be at least 7 characters' });
  }
  try {
    const { getProofByCommit, calculateAutonomyLevel } = await import('./proof-of-autonomy');
    const [proof, autonomy] = await Promise.all([
      getProofByCommit(commitHash),
      calculateAutonomyLevel()
    ]);
    if (!proof) {
      return res.status(404).json({
        verified: false,
        message: 'No proof found for this commit. Was this code written by MOTHER?',
        autonomy_level: autonomy.level,
        proofs_count: autonomy.proofs_count
      });
    }
    res.json({ ...proof, autonomy_level_summary: autonomy });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/a2a/roadmap-execute
 * MOTHER reads and executes the next phase of her own roadmap
 * This is the key endpoint for MOTHER's self-directed evolution
 */
a2aRouter.post('/api/a2a/roadmap-execute', async (req: Request, res: Response) => {
  const { phase, dryRun, userId } = req.body || {};
  log.info('A2A roadmap-execute request', { phase, dryRun, userId });
  try {
    const { executeRoadmapPhase } = await import('./roadmap-executor');
    const phaseId = typeof phase === 'string' ? phase : 'next';
    const result = await executeRoadmapPhase(phaseId);
    res.json(result);
  } catch (err) {
    log.error('A2A roadmap-execute error', { error: String(err) });
    res.status(500).json({ error: String(err), success: false });
  }
});

/**
 * POST /api/a2a/benchmark/run
 * Trigger Benchmark C111 — 6 MCCs for Proof of Autonomy
 * Scientific basis: HELM (arXiv:2211.09110) + DGM (arXiv:2505.22954)
 */
a2aRouter.post('/api/a2a/benchmark/run', async (req: Request, res: Response) => {
  const { userId } = req.body || {};
  log.info('A2A benchmark/run request', { userId });
  try {
    const { runBenchmarkC111 } = await import('./benchmark-runner');
    const result = await runBenchmarkC111();
    res.json(result);
  } catch (err) {
    log.error('A2A benchmark/run error', { error: String(err) });
    res.status(500).json({ error: String(err), success: false });
  }
});

/**
 * GET /api/a2a/benchmark/summary
 * Get latest benchmark summary from bd_central
 */
a2aRouter.get('/api/a2a/benchmark/summary', async (_req: Request, res: Response) => {
  try {
    const { getBenchmarkSummary } = await import('./benchmark-runner');
    const summary = await getBenchmarkSummary();
    res.json(summary);
  } catch (err) {
    log.error('A2A benchmark/summary error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/decompose?phase=1
 * Decompose a roadmap phase into atomic executable tasks
 * Scientific basis: ReAct (arXiv:2210.03629) + CodeAct (arXiv:2402.01030)
 */
a2aRouter.get('/api/a2a/decompose', async (req: Request, res: Response) => {
  const phase = req.query.phase as string || '1';
  try {
    const { getPhaseDecomposition, decomposeTask } = await import('./task-decomposer');
    const plan = getPhaseDecomposition(phase);
    if (plan) {
      res.json(plan);
    } else {
      res.json(decomposeTask(`Execute roadmap phase ${phase}`, phase));
    }
  } catch (err) {
    log.error('A2A decompose error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/sandbox/status
 * Check E2B sandbox availability (Gap 2 status)
 * Scientific basis: SWE-agent ACI (arXiv:2405.15793)
 * @version v79.5 | Ciclo 112
 */
a2aRouter.get('/api/a2a/sandbox/status', async (_req: Request, res: Response) => {
  try {
    const { getSandboxStatus } = await import('./e2b-sandbox');
    const status = getSandboxStatus();
    res.json({
      ...status,
      gap2: status.gap2Closed ? 'CLOSED' : 'PARTIAL',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('A2A sandbox/status error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/a2a/benchmark/trigger
 * Trigger HELM-lite benchmark (called by Cloud Build post-deploy or manually)
 * Scientific basis: HELM (arXiv:2211.09110) + DARWIN (arXiv:2602.02534)
 * @version v79.5 | Ciclo 112
 */
a2aRouter.post('/api/a2a/benchmark/trigger', async (req: Request, res: Response) => {
  const { buildId, version, commitSha, triggeredBy } = req.body || {};
  try {
    const { triggerHelmLiteBenchmark } = await import('./helm-lite-trigger');
    const result = await triggerHelmLiteBenchmark({
      buildId,
      version,
      commitSha,
      triggeredBy: triggeredBy || 'manual',
    });
    res.json(result);
  } catch (err) {
    log.error('A2A benchmark/trigger error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/proof/c112
 * Get Ciclo 112 cryptographic proof of autonomy
 * Scientific basis: DGM (arXiv:2505.22954) + Merkle trees (Merkle 1987)
 * @version v79.5 | Ciclo 112
 */
a2aRouter.get('/api/a2a/proof/c112', async (_req: Request, res: Response) => {
  try {
    const { getFullProof, verifyProof, PROOF_SUMMARY } = await import('./autonomy-proof-c112');
    const proof = getFullProof();
    const valid = verifyProof(proof);
    res.json({
      valid,
      proof: PROOF_SUMMARY,
      full_proof: proof,
      verification_method: 'SHA-256 chain hash',
      scientific_basis: 'Darwin Gödel Machine (arXiv:2505.22954)',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('A2A proof/c112 error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});

// ============================================================
// CICLO 113 ENDPOINTS — v79.6
// Gap 10 closure: async task pattern + proof chain validator
// Scientific basis: RFC 7231 §6.3.3 + Merkle (1987) + DGM (arXiv:2505.22954)
// Author: Everton Garcia (Wizards Down Under)
// ============================================================

/**
 * POST /api/a2a/agent-task/async
 * Fire-and-forget: returns taskId immediately (202 Accepted)
 * Closes Gap 10: HTTP timeout on long-running agent tasks
 */
a2aRouter.post('/api/a2a/agent-task/async', authenticateA2A, async (req: Request, res: Response) => {
  const { task, mode = 'write-sandbox', userId, threadId, maxIterations } = req.body;
  if (!task || typeof task !== 'string') {
    res.status(400).json({ error: 'task is required and must be a string' });
    return;
  }
  try {
    const { createAsyncTask } = await import('./async-task-manager');
    const taskId = createAsyncTask({ task, mode, userId: userId || 'anonymous', threadId, maxIterations });
    res.status(202).json({
      taskId,
      status: 'pending',
      poll_url: `/api/a2a/task/${taskId}`,
      message: 'Task accepted. Poll poll_url for status.',
      scientific_basis: 'RFC 7231 §6.3.3 — 202 Accepted for long-running operations',
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/task/:taskId
 * Poll for async task status and result
 */
a2aRouter.get('/api/a2a/task/:taskId', async (req: Request, res: Response) => {
  const { taskId } = req.params;
  try {
    const { getTaskStatus } = await import('./async-task-manager');
    const task = getTaskStatus(taskId);
    if (!task) {
      res.status(404).json({ error: `Task ${taskId} not found` });
      return;
    }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/tasks
 * List all async tasks with queue stats
 */
a2aRouter.get('/api/a2a/tasks', async (_req: Request, res: Response) => {
  try {
    const { listTasks, getQueueStats, generateQueueStateHash } = await import('./async-task-manager');
    const tasks = listTasks(20);
    const stats = getQueueStats();
    const queueHash = generateQueueStateHash();
    res.json({ tasks, stats, queue_state_hash: queueHash, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/proof/chain
 * Get the full cryptographic proof chain (Ciclos 110-113+)
 * Scientific basis: Merkle trees (Merkle 1987) + DGM (arXiv:2505.22954)
 */
a2aRouter.get('/api/a2a/proof/chain', async (_req: Request, res: Response) => {
  try {
    const { getChainSummary, validateProofChain, PROOF_CHAIN } = await import('./proof-chain-validator');
    const summary = getChainSummary();
    const validation = validateProofChain();
    res.json({
      summary,
      validation,
      chain: PROOF_CHAIN,
      verification_commands: [
        'curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/proof/chain | python3 -m json.tool',
        'git clone https://github.com/Ehrvi/mother-v7-improvements.git && cd mother-v7-improvements && git log --oneline | head -20',
      ],
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/a2a/proof/master-hash
 * Compute and return the current master hash of all 115+ modules
 * Scientific basis: Merkle tree root (Merkle 1987)
 */
a2aRouter.get('/api/a2a/proof/master-hash', async (_req: Request, res: Response) => {
  try {
    const path = await import('path');
    const { computeMasterHash } = await import('./proof-chain-validator');
    const modulesDir = path.join(process.cwd(), 'server', 'mother');
    const { masterHash, moduleCount, modules } = computeMasterHash(modulesDir);
    res.json({
      master_hash: masterHash,
      module_count: moduleCount,
      version: 'v79.6',
      cycle: 113,
      timestamp: new Date().toISOString(),
      modules,
      scientific_basis: 'SHA-256 Merkle tree root over all TypeScript modules',
      verification: 'Recompute locally: python3 -c "import hashlib,os; hashes=[hashlib.sha256(open(f\'server/mother/{f}\',\'rb\').read()).hexdigest() for f in sorted(os.listdir(\'server/mother\')) if f.endswith(\'.ts\')]; print(hashlib.sha256(\'\'.join(hashes).encode()).hexdigest())"',
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============================================================
// CICLO 114: EVOLUTION LEDGER ENDPOINTS
// ============================================================

// GET /api/a2a/ledger — full evolution ledger
a2aRouter.get('/api/a2a/ledger', (_req: Request, res: Response) => {
  try {
    const ledgerData = getLedger();
    res.json({
      status: 'ok',
      system: 'MOTHER — Modular Orchestrated Thinking and Hierarchical Execution Runtime',
      developer: 'Everton Garcia (Wizards Down Under)',
      ...ledgerData,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/a2a/ledger/summary — compact summary for quick display
a2aRouter.get('/api/a2a/ledger/summary', (_req: Request, res: Response) => {
  try {
    const ledgerRootHash = computeLedgerRootHash();
    const motherDir = __dirname;
    const { hash: masterHash, moduleCount } = computeMasterHash(motherDir);

    const summary = EVOLUTION_LEDGER.map(e => ({
      cycle: e.cycle,
      version: e.version,
      date: e.date,
      commit: e.commit,
      chain_hash: e.chain_hash,
      master_hash: e.master_hash,
      modules_created: e.modules_created.length,
      modules_created_names: e.modules_created,
      insertions: e.insertions,
      benchmark: `${e.benchmark.mccs_passed}/${e.benchmark.mccs_total} ${e.benchmark.verdict}`,
      gaps_closed: e.gaps_closed,
      summary: e.summary,
    }));

    res.json({
      status: 'ok',
      ledger_root_hash: ledgerRootHash,
      current_master_hash: masterHash,
      current_module_count: moduleCount,
      total_cycles: EVOLUTION_LEDGER.length,
      total_modules_created: EVOLUTION_LEDGER.reduce((s, e) => s + e.modules_created.length, 0),
      total_insertions: EVOLUTION_LEDGER.reduce((s, e) => s + e.insertions, 0),
      cycles: summary,
      verification: 'curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/ledger/summary | python3 -m json.tool',
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/a2a/ledger/:cycle — single cycle entry
a2aRouter.get('/api/a2a/ledger/:cycle', (req: Request, res: Response) => {
  try {
    const cycleNum = parseInt(req.params.cycle, 10);
    const entry = EVOLUTION_LEDGER.find(e => e.cycle === cycleNum);
    if (!entry) {
      return res.status(404).json({ error: `Cycle ${cycleNum} not found in ledger` });
    }
    res.json({ status: 'ok', entry });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
