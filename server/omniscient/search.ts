/**
 * MOTHER Omniscient - Vector Search (v69.0)
 * 
 * Provides semantic search capabilities using cosine similarity.
 * Uses the shared DB pool from db.ts to support both Unix socket (Cloud SQL)
 * and TCP connections — fixing the "Invalid URL" error on Cloud Run.
 *
 * v69.0 LATENCY OPTIMIZATION: In-Memory Embedding Cache
 * ─────────────────────────────────────────────────────
 * PREVIOUS BOTTLENECK: Every query loaded ALL 3,901 chunks from DB and
 *   deserialized their JSON embeddings (1536 floats each) in JavaScript.
 *   This was O(n) with n=3901, taking 6-12s per query.
 *
 * FIX: Cache all chunk embeddings in memory after first load.
 *   Subsequent queries skip the DB scan entirely and use the cached vectors.
 *   Cache is invalidated after 1 hour to pick up newly ingested papers.
 *
 * Scientific basis:
 *   - Faiss (Johnson et al., arXiv:1702.08734, 2017): in-memory ANN search
 *   - ANN-Benchmarks (Aumüller et al., 2020): flat index (brute-force) is
 *     optimal for n<10,000 vectors — no approximation error, fast enough
 *   - Cloud SQL latency: DB round-trip = 2-5ms; JSON parse = 1ms/chunk
 *     → 3901 chunks × 6ms = 23s. Cache eliminates this entirely.
 *
 * Expected improvement: 6-12s → 0.1-0.3s for vector search phase.
 */
import { eq, sql } from 'drizzle-orm';
import { paperChunks } from '../../drizzle/schema';
import { generateEmbedding, deserializeEmbedding } from './embeddings';
import { getDb } from '../db';

// ─── In-Memory Embedding Cache ────────────────────────────────────────────────
interface CachedChunk {
  chunkId: string;
  paperId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  paperTitle?: string;
  paperAuthors?: string;
  paperUrl?: string;
  arxivId?: string;
}

interface EmbeddingCache {
  chunks: CachedChunk[];
  loadedAt: number;
  isLoading: boolean;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const embeddingCache: EmbeddingCache = {
  chunks: [],
  loadedAt: 0,
  isLoading: false,
};

async function ensureCacheLoaded(): Promise<void> {
  const now = Date.now();
  const cacheAge = now - embeddingCache.loadedAt;
  
  if (embeddingCache.chunks.length > 0 && cacheAge < CACHE_TTL_MS) {
    return;
  }
  
  if (embeddingCache.isLoading) {
    let waited = 0;
    while (embeddingCache.isLoading && waited < 30000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
    return;
  }
  
  embeddingCache.isLoading = true;
  const loadStart = Date.now();
  
  try {
    const db = await getDb();
    if (!db) {
      console.error('[Search] DB not available for cache load');
      embeddingCache.isLoading = false;
      return;
    }
    
    const { papers } = await import('../../drizzle/schema');
    const rawChunks = await db
      .select({
        chunkId: paperChunks.id,
        paperId: paperChunks.paperId,
        chunkIndex: paperChunks.chunkIndex,
        content: paperChunks.text,
        embedding: paperChunks.embedding,
        paperTitle: papers.title,
        paperAuthors: papers.authors,
        paperUrl: papers.pdfUrl,
        arxivId: papers.arxivId,
      })
      .from(paperChunks)
      .leftJoin(papers, eq(paperChunks.paperId, papers.id))
      .execute();
    
    const cached: CachedChunk[] = [];
    let parseErrors = 0;
    for (const chunk of rawChunks) {
      try {
        const embedding = deserializeEmbedding(chunk.embedding);
        cached.push({
          chunkId: String(chunk.chunkId),
          paperId: String(chunk.paperId),
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          embedding,
          paperTitle: chunk.paperTitle || undefined,
          paperAuthors: chunk.paperAuthors || undefined,
          paperUrl: chunk.paperUrl || undefined,
          arxivId: chunk.arxivId || undefined,
        });
      } catch {
        parseErrors++;
      }
    }
    
    embeddingCache.chunks = cached;
    embeddingCache.loadedAt = Date.now();
    console.log(`[Search] Cache loaded: ${cached.length} chunks in ${Date.now() - loadStart}ms (${parseErrors} parse errors)`);
  } catch (err) {
    console.error('[Search] Cache load failed:', err);
  } finally {
    embeddingCache.isLoading = false;
  }
}

// Pre-warm cache on module load (non-blocking)
ensureCacheLoaded().catch(() => {});

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimensions mismatch: ${vec1.length} vs ${vec2.length}`);
  }
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Search result interface
 */
export interface SearchResult {
  chunkId: string;
  paperId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  paperTitle?: string;
  paperAuthors?: string;
  paperUrl?: string;
  arxivId?: string;
}

/**
 * Search for similar chunks using vector similarity (basic, no metadata)
 * v69.0: Delegates to searchSimilarChunksWithMetadata (uses cache)
 */
export async function searchSimilarChunks(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  return searchSimilarChunksWithMetadata(query, topK, minSimilarity);
}

/**
 * Search for similar chunks with paper metadata.
 * v69.0: Uses in-memory cache — O(n) scan in RAM instead of DB round-trip.
 * Expected latency: 0.1-0.3s (was 6-12s).
 */
export async function searchSimilarChunksWithMetadata(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  const startTime = Date.now();
  console.log(`[Search] v69.0 cached search: "${query.slice(0, 60)}..." (top ${topK}, min sim: ${minSimilarity})`);
  
  await ensureCacheLoaded();
  
  if (embeddingCache.chunks.length === 0) {
    console.warn('[Search] Cache empty — falling back to direct DB query');
    return searchSimilarChunksDirectDB(query, topK, minSimilarity);
  }
  
  const queryEmbedding = await generateEmbedding(query);
  console.log(`[Search] Query embedding in ${Date.now() - startTime}ms, scanning ${embeddingCache.chunks.length} cached chunks`);
  
  const results: SearchResult[] = [];
  for (const chunk of embeddingCache.chunks) {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    if (similarity >= minSimilarity) {
      results.push({
        chunkId: chunk.chunkId,
        paperId: chunk.paperId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        similarity,
        paperTitle: chunk.paperTitle,
        paperAuthors: chunk.paperAuthors,
        paperUrl: chunk.paperUrl,
        arxivId: chunk.arxivId,
      });
    }
  }
  
  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, topK);
  
  console.log(`[Search] Found ${results.length} matches, returning top ${topResults.length} in ${Date.now() - startTime}ms total`);
  return topResults;
}

/**
 * Fallback: direct DB query when cache is unavailable
 */
async function searchSimilarChunksDirectDB(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) return [];
  
  const queryEmbedding = await generateEmbedding(query);
  const { papers } = await import('../../drizzle/schema');
  const chunks = await db
    .select({
      chunkId: paperChunks.id,
      paperId: paperChunks.paperId,
      chunkIndex: paperChunks.chunkIndex,
      content: paperChunks.text,
      embedding: paperChunks.embedding,
      paperTitle: papers.title,
      paperAuthors: papers.authors,
      paperUrl: papers.pdfUrl,
      arxivId: papers.arxivId,
    })
    .from(paperChunks)
    .leftJoin(papers, eq(paperChunks.paperId, papers.id))
    .execute();
  
  const results: SearchResult[] = [];
  for (const chunk of chunks) {
    try {
      const chunkEmbedding = deserializeEmbedding(chunk.embedding);
      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      if (similarity >= minSimilarity) {
        results.push({
          chunkId: String(chunk.chunkId),
          paperId: String(chunk.paperId),
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          similarity,
          paperTitle: chunk.paperTitle || undefined,
          paperAuthors: chunk.paperAuthors || undefined,
          paperUrl: chunk.paperUrl || undefined,
          arxivId: chunk.arxivId || undefined,
        });
      }
    } catch {}
  }
  
  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, topK);
  console.log(`[Search] Direct DB fallback: ${topResults.length} results in ${Date.now() - startTime}ms`);
  return topResults;
}

/**
 * Invalidate the embedding cache (call after ingesting new papers)
 */
export function invalidateEmbeddingCache(): void {
  embeddingCache.loadedAt = 0;
  embeddingCache.chunks = [];
  console.log('[Search] Embedding cache invalidated');
}

/**
 * Get search statistics using shared DB pool
 */
export async function getSearchStatistics() {
  const db = await getDb();
  if (!db) return { totalChunks: 0, totalPapers: 0, avgChunksPerPaper: 0 };

  const { papers } = await import('../../drizzle/schema');

  const [chunkCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(paperChunks)
    .execute();

  const [paperCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(papers)
    .execute();

  return {
    totalChunks: chunkCount.count,
    totalPapers: paperCount.count,
    avgChunksPerPaper: chunkCount.count / (paperCount.count || 1),
    cacheStatus: {
      loaded: embeddingCache.chunks.length > 0,
      chunkCount: embeddingCache.chunks.length,
      ageMs: Date.now() - embeddingCache.loadedAt,
    },
  };
}
