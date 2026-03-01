/**
 * core-learning-builder.ts — SRP Phase 6 (Ciclo 82)
 *
 * Extracted from core.ts per Single Responsibility Principle (SOLID).
 * This module handles all post-response learning and persistence operations:
 * - Query persistence (insertQuery + embedding generation)
 * - Continuous learning (learnFromResponse)
 * - Agentic learning loop (agenticLearningLoop)
 * - User memory storage (extractAndStoreMemories)
 *
 * Scientific basis:
 * - SRP: Martin (2003) — "Clean Architecture" — a module should have one reason to change
 * - Strangler Fig Pattern: Fowler (2004) — incremental extraction from monolith
 * - Continual Learning: Parisi et al. (2019) — catastrophic forgetting mitigation
 * - Generative Agents: Park et al. (2023) — memory and learning in LLM agents
 * - MemGPT: Packer et al. (2023) — user memory extraction and storage
 * - DGM: Zhang et al. (arXiv:2505.22954, Sakana AI 2025) — autonomous self-improvement
 *
 * Ciclo 82: Extracted learning/persistence block from core.ts (1472 → ~1400 lines)
 */

import type { GuardianResult } from './guardian';
import type { RoutingDecision, LLMTier } from './intelligence';
import { createLogger } from '../_core/logger';

const log = createLogger('core-learning-builder');

export interface LearningContext {
  query: string;
  response: string;
  knowledgeContext: string;
  quality: GuardianResult & { qualityScore: number; completenessScore: number; accuracyScore: number; relevanceScore: number; cacheEligible?: boolean };
  complexity: {
    tier: string;
    complexityScore?: number;
    confidenceScore?: number;
  };
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  routingDecision: RoutingDecision;
  selectedProvider: string;
  selectedModel: string;
  queryHash: string;
  queryEmbedding?: number[] | null;
  cost: number;
  costReduction: number;
  responseTime: number;
  effectiveUseCache: boolean;
  userId?: number;
}

export interface LearningResult {
  queryId: number | null;
}

/**
 * Execute all post-response learning and persistence operations.
 * All operations are fire-and-forget (non-blocking).
 *
 * Extracted from core.ts Layer 8 (Metrics + Learning) per SRP Phase 6.
 * Fowler (Refactoring, 2018) — Extract Method pattern.
 */
export async function executeLearningPipeline(ctx: LearningContext): Promise<LearningResult> {
  // Lazy imports to avoid circular dependencies
  const { insertQuery, insertCacheEntry, insertSemanticCacheEntry } = await import('../db');
  const { retryDbOperation } = await import('./db-retry');
  const { generateAndStoreEmbedding } = await import('./embeddings');
  const { learnFromResponse, LEARNING_QUALITY_THRESHOLD } = await import('./learning');
  const { agenticLearningLoop } = await import('./agentic-learning');
  const { extractAndStoreMemories } = await import('./user-memory');

  let queryId: number | null = null;

  // ==================== PERSISTENCE ====================
  // Store query log for learning (with retry logic)
  // Async logging: Don't block response if INSERT fails
  retryDbOperation(() => insertQuery({
    userId: ctx.userId || null,
    query: ctx.query,
    response: ctx.response,
    tier: ctx.complexity.tier as LLMTier,
    complexityScore: (ctx.complexity.complexityScore ?? 0).toString(),
    confidenceScore: (ctx.complexity.confidenceScore ?? 0).toString(),
    qualityScore: (ctx.quality.qualityScore ?? 0).toString(),
    completenessScore: (ctx.quality.completenessScore ?? 0).toString(),
    accuracyScore: (ctx.quality.accuracyScore ?? 0).toString(),
    relevanceScore: (ctx.quality.relevanceScore ?? 0).toString(),
    coherenceScore: ctx.quality.coherenceScore?.toString() || null,
    safetyScore: ctx.quality.safetyScore?.toString() || null,
    responseTime: ctx.responseTime ?? 0,
    tokensUsed: ctx.usage?.total_tokens ?? 0,
    cost: (ctx.cost ?? 0).toString(),
    cacheHit: 0,
    // v68.8: Multi-provider cascade router — persist routing decision
    provider: ctx.selectedProvider,
    modelName: ctx.selectedModel,
    queryCategory: ctx.routingDecision.category,
    // v68.3: Sprint 3 — Persist RAGAS metrics and costReduction
    costReduction: ctx.costReduction.toString(),
    ragasFaithfulness: ctx.quality.ragasFaithfulness?.toString() || null,
    ragasAnswerRelevancy: ctx.quality.ragasAnswerRelevancy?.toString() || null,
    ragasContextPrecision: ctx.quality.ragasContextPrecision?.toString() || null,
  }))
    .then(id => {
      queryId = id;
      log.info(`[MOTHER] Query logged successfully: ID ${id}`);
      // v30.0: Generate and store embedding asynchronously (fire-and-forget)
      generateAndStoreEmbedding(id, ctx.query).catch(err =>
        log.error('[MOTHER] Embedding generation failed (non-blocking):', err.message)
      );
    })
    .catch(error => {
      log.error('[MOTHER] Failed to log query (non-blocking):', error.message);
    });

  // ==================== v56.0: CONTINUOUS LEARNING (Req #3) ====================
  // Learn from high-quality responses (fire-and-forget)
  // Threshold: quality ≥75% (lowered from 95% for gradual learning)
  // Scientific basis: Parisi et al. (2019) — Continual Learning

  // ==================== AGENTIC LEARNING LOOP (v67.0) ====================
  // Proactively identify and capture learning opportunities
  // Scientific basis: Generative Agents (Park et al., 2023), MemGPT (Packer et al., 2023)
  if (ctx.quality.qualityScore && ctx.quality.qualityScore >= LEARNING_QUALITY_THRESHOLD) {
    agenticLearningLoop(ctx.query, ctx.response, ctx.knowledgeContext, ctx.quality.qualityScore, ctx.userId)
      .then(result => {
        if (result.learned) log.info(`[MOTHER] 🧠 Agentic Learning: ${result.reason}`);
      })
      .catch(err => log.error('[MOTHER] Agentic learning failed (non-blocking):', err));
  }
  if (ctx.quality.qualityScore && ctx.quality.qualityScore >= LEARNING_QUALITY_THRESHOLD) {
    learnFromResponse({
      content: ctx.response,
      query: ctx.query,
      response: ctx.response,
      qualityScore: ctx.quality.qualityScore,
      timestamp: new Date(),
      userId: ctx.userId,
    })
      .then(result => {
        if (result.learned) {
          log.info(`[MOTHER] 🧠 Learned new knowledge: ${result.reason}`);
        } else {
          log.info(`[MOTHER] No learning: ${result.reason}`);
        }
      })
      .catch(error => {
        log.error('[MOTHER] Learning failed (non-blocking):', error.message);
      });
  }

  // ==================== v56.0: USER MEMORY STORAGE (Req #4) ====================
  // Extract and store memorable content for this user
  // Scientific basis: MemGPT (Packer et al., 2023)
  if (ctx.userId) {
    extractAndStoreMemories(ctx.userId, ctx.query, ctx.response, ctx.quality.qualityScore)
      .catch(error => {
        log.error('[MOTHER] User memory storage failed (non-blocking):', error.message);
      });
  }

  return { queryId };
}
