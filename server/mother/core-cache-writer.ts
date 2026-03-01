/**
 * core-cache-writer.ts — SRP Phase 7 (Ciclo 83)
 * 
 * Extracted from core.ts: CACHE UPDATE block (lines 1254-1299)
 * Fowler (Refactoring, 2018) — Extract Method pattern
 * 
 * Scientific basis:
 *   - SRP (Martin, Clean Architecture, 2017) — Single Responsibility Principle
 *   - GPTCache (Zeng et al., 2023) — semantic cache for LLM responses
 *   - Redis best practices (2024) — TTL management for stable knowledge queries
 *   - Varangot-Reille et al. (arXiv:2502.00409, 2025) — cache as routing optimization
 * 
 * Responsibility: Write query responses to exact and semantic cache tables.
 * Inputs: query, response, quality, cache eligibility flags, embeddings.
 * Outputs: void (fire-and-forget for semantic cache).
 */

import { retryDbOperation } from './db-retry';
import { insertCacheEntry, insertSemanticCacheEntry } from '../db';
import { createLogger } from '../_core/logger';
import type { GuardianResult } from './guardian';

const log = createLogger('CACHE-WRITER');

export interface CacheWriteContext {
  query: string;
  queryHash: string;
  queryEmbedding: number[] | null;
  response: string;
  tier: string;
  complexityScore: number;
  confidenceScore: number;
  quality: GuardianResult;
  tokensUsed: number;
  cost: number;
  costReduction: number;
  queryId: string | number | null;
  effectiveUseCache: boolean;
}

/**
 * Writes a query response to both exact and semantic cache tables.
 * 
 * Exact cache: 72-hour TTL (NC-008 fix, v74.0)
 * Semantic cache: 7-day TTL (cosine-similarity lookup, v69.6)
 * 
 * Non-blocking: semantic cache write is fire-and-forget.
 * Blocking: exact cache write uses retryDbOperation for reliability.
 */
export async function writeCacheEntry(ctx: CacheWriteContext): Promise<void> {
  // v69.4: BUG-002 fix — use cacheEligible (>=75) not passed (>=90)
  // NC-SELFAUDIT-001: effectiveUseCache=false for self-reporting queries
  if (!ctx.effectiveUseCache || !(ctx.quality.cacheEligible ?? ctx.quality.passed)) {
    return;
  }

  const cacheData = {
    response: ctx.response,
    tier: ctx.tier,
    complexityScore: ctx.complexityScore,
    confidenceScore: ctx.confidenceScore,
    quality: ctx.quality,
    tokensUsed: ctx.tokensUsed,
    cost: ctx.cost,
    costReduction: ctx.costReduction,
    queryId: ctx.queryId,
  };

  // v74.0: NC-008 fix — increase exact cache TTL from 24h to 72h
  // Scientific basis: GPTCache (Zeng et al., 2023) — longer TTL improves hit rate;
  // Redis best practices (2024) — stable knowledge queries benefit from 3-day TTL
  const expiresAt72h = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours (was 24h)

  await retryDbOperation(() => insertCacheEntry({
    queryHash: ctx.queryHash,
    query: ctx.query,
    response: JSON.stringify(cacheData),
    embedding: null,
    hitCount: 0,
    lastHit: null,
    ttl: 259200, // 72 hours in seconds (was 86400 = 24h)
    expiresAt: expiresAt72h,
  }));

  // v69.6: Write to semantic_cache table for cosine-similarity lookup
  // Scientific basis: GPTCache (Zeng et al., 2023); schema aligned with actual DB columns
  if (ctx.queryEmbedding) {
    const expiresAt7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL
    insertSemanticCacheEntry({
      queryHash: ctx.queryHash,
      queryText: ctx.query,
      queryEmbedding: JSON.stringify(ctx.queryEmbedding),
      response: JSON.stringify(cacheData),
      hitCount: 0,
      expiresAt: expiresAt7d,
    }).catch((err: Error) => log.warn('[MOTHER] Semantic cache write failed (non-blocking):', err.message));
  }
}
