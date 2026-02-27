/**
 * MOTHER v74.13: A2A (Agent2Agent) Protocol Server — NC-COLLAB-001
 *
 * Establishes direct Manus↔MOTHER communication channel via A2A protocol.
 *
 * Scientific basis:
 * - A2A Protocol (Google Cloud, April 2025): open standard for AI agent interoperability
 *   arXiv:2505.02279 (Ehtesham et al., 2025) — comparison of MCP, ACP, A2A, ANP
 * - Agent Card: self-description JSON published at /.well-known/agent.json
 *   Enables Manus to auto-discover MOTHER's capabilities without manual configuration
 * - MCP vs A2A (Auth0, 2025): "MCP extends what a single agent can do;
 *   A2A expands how agents can collaborate"
 *
 * Architecture:
 * - GET  /.well-known/agent.json   → Agent Card (A2A autodescription)
 * - GET  /api/a2a/diagnostics      → Real-time metrics for Manus
 * - POST /api/a2a/query            → Send query to MOTHER via A2A
 * - GET  /api/a2a/knowledge        → Read bd_central entries
 * - POST /api/a2a/knowledge        → Add entry to bd_central
 * - GET  /api/a2a/status           → System health check
 *
 * Authentication: Bearer token (MANUS_A2A_TOKEN env var)
 * If MANUS_A2A_TOKEN is not set, auth is skipped (dev mode)
 */
import { Router, Request, Response, NextFunction } from 'express';
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

// ── Agent Card ────────────────────────────────────────────────────────────────
/**
 * GET /.well-known/agent.json
 * A2A Agent Card — self-description published at well-known URL.
 * Manus reads this at the start of each session to discover MOTHER's capabilities.
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
 * Real-time system metrics for Manus.
 * Enables Manus to diagnose MOTHER's state without manual inspection.
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
    log.info('Diagnostics requested by Manus');
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
 * Read bd_central entries for Manus to load MOTHER's knowledge base.
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
 * Body: { query, useCache?, conversationHistory? }
 */
a2aRouter.post('/api/a2a/query', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { query, useCache = true, conversationHistory = [] } = req.body;
    if (!query) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    // Lazy import to avoid circular dependency
    const { processQuery } = await import('./core');
    const result = await processQuery({
      query,
      useCache,
      conversationHistory,
    });

    log.info('Query processed via A2A', { category: result.tier, quality: result.quality.qualityScore });
    res.json(result);
  } catch (err) {
    log.error('A2A query error', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
});
