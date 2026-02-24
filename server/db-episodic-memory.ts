/**
 * MOTHER v30.0 - Episodic Memory Functions
 * 
 * Implements active memory retrieval through vector search on the queries table.
 * This module provides the core functionality for the second pillar of the cognitive architecture.
 * 
 * References:
 * [10] Chhikara, P., et al. (2025). Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory.
 * [11] Microsoft Research. (2025). Project GraphRAG.
 */

import { getDb } from "./db";
import { queries } from "../drizzle/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "./mother/embeddings";
import { logger } from "./lib/logger";

/**
 * Generate and save embedding for a query asynchronously
 * Called after a query is successfully saved to the database
 * 
 * @param queryId - The ID of the query in the database
 * @param queryText - The original query text
 * @param responseText - The response text
 */
export async function generateAndSaveEmbedding(
  queryId: number,
  queryText: string,
  responseText: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      logger.warn('[EpisodicMemory] Database not available, skipping embedding generation');
      return;
    }

    // Combine query and response for richer semantic representation
    const combinedText = `Query: ${queryText}\nResponse: ${responseText}`;
    
    // Generate embedding using text-embedding-3-small
    const embeddingVector = await getEmbedding(combinedText);
    
    // Save embedding to database as JSON string
    await db
      .update(queries)
      .set({
        embedding: JSON.stringify(embeddingVector),
      })
      .where(eq(queries.id, queryId));
    
    logger.info(`[EpisodicMemory] Saved embedding for Query ID ${queryId}`);
  } catch (error) {
    // Don't throw - embedding generation is non-critical
    logger.error(`[EpisodicMemory] Failed to save embedding for Query ID ${queryId}:`, error);
  }
}

/**
 * Search episodic memory for semantically similar past interactions
 * 
 * IMPORTANT: This implementation uses a full table scan with in-memory similarity calculation.
 * This is acceptable for v30.0 validation but should be replaced with a dedicated vector database
 * (Pinecone, Weaviate, or Google Vertex AI Vector Search) in v30.1 for production scale.
 * 
 * @param queryText - The query text to search for
 * @param limit - Maximum number of results to return
 * @returns Array of past interactions sorted by similarity (highest first)
 */
export async function searchEpisodicMemory(
  queryText: string,
  limit: number = 3
): Promise<Array<{ query: string; response: string; similarity: number; tier: string }>> {
  try {
    const db = await getDb();
    if (!db) {
      logger.warn('[EpisodicMemory] Database not available');
      return [];
    }

    // Generate embedding for the search query
    const queryEmbedding = await getEmbedding(queryText);

    // Fetch all queries that have embeddings
    // NOTE: This is a full table scan - inefficient but acceptable for v30.0
    const allQueries = await db
      .select({
        id: queries.id,
        query: queries.query,
        response: queries.response,
        tier: queries.tier,
        embedding: queries.embedding,
      })
      .from(queries)
      .where(isNotNull(queries.embedding));

    if (allQueries.length === 0) {
      logger.info('[EpisodicMemory] No queries with embeddings found');
      return [];
    }

    // Calculate cosine similarity for each query
    const similarities = allQueries.map(q => {
      try {
        const qEmbedding = JSON.parse(q.embedding!);
        const similarity = cosineSimilarity(queryEmbedding, qEmbedding);
        
        return {
          query: q.query,
          response: q.response,
          tier: q.tier,
          similarity,
        };
      } catch (error) {
        logger.error(`[EpisodicMemory] Failed to parse embedding for query ${q.id}:`, error);
        return {
          query: q.query,
          response: q.response,
          tier: q.tier,
          similarity: 0,
        };
      }
    });

    // Sort by similarity (descending) and take top N
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    const topResults = similarities.slice(0, limit);
    
    logger.info(`[EpisodicMemory] Found ${topResults.length} similar past interactions (top similarity: ${topResults[0]?.similarity.toFixed(3) || 'N/A'})`);
    
    return topResults;
  } catch (error) {
    logger.error('[EpisodicMemory] Search failed:', error);
    return [];
  }
}

/**
 * Get statistics about episodic memory
 * Useful for monitoring and debugging
 */
export async function getEpisodicMemoryStats(): Promise<{
  totalQueries: number;
  queriesWithEmbeddings: number;
  embeddingCoverage: number;
}> {
  try {
    const db = await getDb();
    if (!db) {
      return { totalQueries: 0, queriesWithEmbeddings: 0, embeddingCoverage: 0 };
    }

    const allQueries = await db.select({ id: queries.id }).from(queries);
    const queriesWithEmbeddings = await db
      .select({ id: queries.id })
      .from(queries)
      .where(isNotNull(queries.embedding));

    const total = allQueries.length;
    const withEmbeddings = queriesWithEmbeddings.length;
    const coverage = total > 0 ? (withEmbeddings / total) * 100 : 0;

    return {
      totalQueries: total,
      queriesWithEmbeddings: withEmbeddings,
      embeddingCoverage: coverage,
    };
  } catch (error) {
    logger.error('[EpisodicMemory] Failed to get stats:', error);
    return { totalQueries: 0, queriesWithEmbeddings: 0, embeddingCoverage: 0 };
  }
}
