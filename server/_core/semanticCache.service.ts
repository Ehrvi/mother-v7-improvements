import { getDb } from "../db";
import { semanticCache } from "../../drizzle/schema";
import { desc, sql } from "drizzle-orm";

/**
 * Service class for semantic cache operations
 * Isolates database logic to avoid Drizzle schema import issues in tests
 */
export class SemanticCacheService {
  /**
   * Find cached response for similar query using cosine similarity
   * @param embedding Query embedding (1536 dimensions)
   * @param minSimilarity Minimum similarity threshold (0-1)
   * @returns Cached entry if found, null otherwise
   */
  async findSimilar(
    embedding: number[],
    minSimilarity: number = 0.95
  ): Promise<{ queryText: string; response: string; similarity: number } | null> {
    const db = await getDb();
    if (!db) throw new Error('Database not initialized');
    
    // Calculate cosine similarity using SQL
    // similarity = dot(a, b) / (norm(a) * norm(b))
    const embeddingJson = JSON.stringify(embedding);
    
    const results = await db
      .select({
        id: semanticCache.id,
        queryText: semanticCache.queryText,
        response: semanticCache.response,
        queryEmbedding: semanticCache.queryEmbedding,
      })
      .from(semanticCache)
      .execute();
    
    // Calculate cosine similarity in JavaScript (SQL cosine similarity is complex in SQLite)
    let bestMatch: { queryText: string; response: string; similarity: number } | null = null;
    let maxSimilarity = 0;
    
    for (const row of results) {
      const cachedEmbedding: number[] = JSON.parse(row.queryEmbedding);
      const similarity = cosineSimilarity(embedding, cachedEmbedding);
      
      if (similarity > maxSimilarity && similarity >= minSimilarity) {
        maxSimilarity = similarity;
        bestMatch = {
          queryText: row.queryText,
          response: row.response,
          similarity,
        };
      }
    }
    
    // Update hit count if found
    if (bestMatch) {
      const matchedRow = results.find(r => r.queryText === bestMatch!.queryText);
      if (matchedRow) {
        await db
          .update(semanticCache)
          .set({
            hitCount: sql`${semanticCache.hitCount} + 1`,
            lastHitAt: new Date(),
          })
          .where(sql`${semanticCache.id} = ${matchedRow.id}`)
          .execute();
      }
    }
    
    return bestMatch;
  }

  /**
   * Save new query-response pair with embedding
   * @param queryText Original query text
   * @param queryEmbedding Query embedding (1536 dimensions)
   * @param response LLM response
   * @param responseMetadata Optional metadata (model, tokens, cost, etc.)
   */
  async save(
    queryText: string,
    queryEmbedding: number[],
    response: string,
    responseMetadata?: Record<string, any>
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('Database not initialized');
    
    await db
      .insert(semanticCache)
      .values({
        queryText,
        queryEmbedding: JSON.stringify(queryEmbedding),
        response,
        responseMetadata: responseMetadata ? JSON.stringify(responseMetadata) : null,
        hitCount: 0,
        createdAt: new Date(),
      })
      .execute();
  }

  /**
   * Get cache statistics
   * @returns Cache stats (total entries, total hits, hit rate)
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalHits: number;
    hitRate: number;
  }> {
    const db = await getDb();
    if (!db) throw new Error('Database not initialized');
    
    const results = await db
      .select({
        count: sql<number>`COUNT(*)`,
        totalHits: sql<number>`SUM(${semanticCache.hitCount})`,
      })
      .from(semanticCache)
      .execute();
    
    const totalEntries = results[0]?.count || 0;
    const totalHits = results[0]?.totalHits || 0;
    const hitRate = totalEntries > 0 ? totalHits / totalEntries : 0;
    
    return { totalEntries, totalHits, hitRate };
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Similarity score (0-1)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}
