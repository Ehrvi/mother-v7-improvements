/**
 * MOTHER v7.0 - Embeddings Utility
 * Provides semantic similarity using OpenAI embeddings
 * v30.0: Added searchEpisodicMemory for active memory retrieval
 */

import { ENV } from '../_core/env';
import { getDb } from '../db';
import { queries } from '../../drizzle/schema';
import { isNotNull, desc, eq } from 'drizzle-orm';
import { createLogger } from '../_core/logger';
const log = createLogger('EMBEDDINGS');


/**
 * Get embedding vector for text
 * Uses text-embedding-3-small (1536 dimensions, $0.02/1M tokens)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    // Use OpenAI API directly (Forge API /v1/embeddings returns 404)
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000) // Limit to ~8k chars to avoid token limits
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Embeddings API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    log.error('[Embeddings] Error:', error);
    // Fallback: return zero vector (TF-IDF will be used instead)
    return new Array(1536).fill(0);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1 (typically 0-1 for embeddings)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate semantic similarity between two texts
 * Returns similarity score 0-1
 */
export async function semanticSimilarity(text1: string, text2: string): Promise<number> {
  const [embedding1, embedding2] = await Promise.all([
    getEmbedding(text1),
    getEmbedding(text2)
  ]);

  return cosineSimilarity(embedding1, embedding2);
}

/**
 * MOTHER v30.0: Episodic Memory Search
 * Searches past queries using cosine similarity on embeddings.
 * Returns top-k most similar past interactions for context injection.
 * 
 * Scientific basis: MemGPT (Packer et al., 2023) - virtual context management
 * for long-term memory in LLM agents.
 */
export interface EpisodicMemory {
  query: string;
  response: string;
  similarity: number;
  tier: string;
  qualityScore: string | null;
  createdAt: Date;
}

export async function searchEpisodicMemory(
  queryText: string,
  topK: number = 3,
  minSimilarity: number = 0.75
): Promise<EpisodicMemory[]> {
  try {
    const db = await getDb();
    
    // Get embedding for the current query
    const queryEmbedding = await getEmbedding(queryText);
    
    // Check if embedding is a zero vector (API failure fallback)
    const isZeroVector = queryEmbedding.every(v => v === 0);
    if (isZeroVector) {
      log.info('[EpisodicMemory] Zero vector detected, skipping memory search');
      return [];
    }
    
    // Fetch recent queries that have embeddings (limit to last 500 for performance)
    const recentQueries = await (db as any)
      .select({
        query: queries.query,
        response: queries.response,
        embedding: queries.embedding,
        tier: queries.tier,
        qualityScore: queries.qualityScore,
        createdAt: queries.createdAt,
      })
      .from(queries)
      .where(isNotNull(queries.embedding))
      .orderBy(desc(queries.createdAt))
      .limit(500);
    
    if (recentQueries.length === 0) {
      log.info('[EpisodicMemory] No queries with embeddings found');
      return [];
    }
    
    // Calculate cosine similarity for each past query
    const scored: EpisodicMemory[] = [];
    
    for (const pastQuery of recentQueries) {
      if (!pastQuery.embedding) continue;
      
      try {
        const pastEmbedding: number[] = JSON.parse(pastQuery.embedding);
        const similarity = cosineSimilarity(queryEmbedding, pastEmbedding);
        
        if (similarity >= minSimilarity) {
          scored.push({
            query: pastQuery.query,
            response: pastQuery.response,
            similarity,
            tier: pastQuery.tier,
            qualityScore: pastQuery.qualityScore,
            createdAt: pastQuery.createdAt,
          });
        }
      } catch {
        // Skip malformed embeddings
        continue;
      }
    }
    
    // Sort by similarity descending, return top-k
    scored.sort((a, b) => b.similarity - a.similarity);
    const results = scored.slice(0, topK);
    
    if (results.length > 0) {
      log.info(`[EpisodicMemory] Found ${results.length} relevant past interactions (top similarity: ${results[0].similarity.toFixed(3)})`);
    }
    
    return results;
  } catch (error) {
    log.error('[EpisodicMemory] Search error:', error);
    return [];
  }
}

/**
 * MOTHER v30.0: Generate and store embedding for a query
 * Called asynchronously after a query is processed to avoid latency impact.
 */
export async function generateAndStoreEmbedding(queryId: number, queryText: string): Promise<void> {
  try {
    const db = await getDb();
    const embedding = await getEmbedding(queryText);
    
    // Check if it's a zero vector (API failure)
    const isZeroVector = embedding.every(v => v === 0);
    if (isZeroVector) return;
    
    await (db as any)
      .update(queries)
      .set({ embedding: JSON.stringify(embedding) })
      .where(eq(queries.id, queryId));
    
    log.info(`[EpisodicMemory] Stored embedding for query ${queryId}`);
  } catch (error) {
    log.error(`[EpisodicMemory] Failed to store embedding for query ${queryId}:`, error);
  }
}
