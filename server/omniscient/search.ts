/**
 * MOTHER Omniscient - Vector Search
 * 
 * Provides semantic search capabilities using cosine similarity
 */

import { drizzle } from 'drizzle-orm/mysql2';
import { eq, desc, sql } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { paperChunks } from '../../drizzle/schema';
import { generateEmbedding, deserializeEmbedding } from './embeddings';

/**
 * Calculate cosine similarity between two vectors
 * 
 * Formula: cos(θ) = (A · B) / (||A|| × ||B||)
 * 
 * Where:
 * - A · B is the dot product
 * - ||A|| and ||B|| are the magnitudes (Euclidean norms)
 * 
 * Result range: [-1, 1]
 * - 1: Vectors point in the same direction (identical)
 * - 0: Vectors are orthogonal (unrelated)
 * - -1: Vectors point in opposite directions
 * 
 * @param vec1 - First vector
 * @param vec2 - Second vector
 * @returns Cosine similarity score
 * 
 * @example
 * const vec1 = [1, 0, 0];
 * const vec2 = [1, 0, 0];
 * console.log(cosineSimilarity(vec1, vec2)); // 1.0 (identical)
 * 
 * const vec3 = [0, 1, 0];
 * console.log(cosineSimilarity(vec1, vec3)); // 0.0 (orthogonal)
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimensions mismatch: ${vec1.length} vs ${vec2.length}`);
  }
  
  // Calculate dot product (A · B)
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }
  
  // Calculate magnitudes (||A|| and ||B||)
  let magnitude1 = 0;
  let magnitude2 = 0;
  for (let i = 0; i < vec1.length; i++) {
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }
  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);
  
  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  // Calculate cosine similarity
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
}

/**
 * Search for similar chunks using vector similarity
 * 
 * Strategy:
 * 1. Generate embedding for query
 * 2. Retrieve all chunks from database
 * 3. Calculate cosine similarity for each chunk
 * 4. Sort by similarity (descending)
 * 5. Return top K results
 * 
 * Note: This is a naive implementation (O(n) complexity).
 * For production with millions of chunks, use:
 * - Vector databases (Pinecone, Weaviate, Qdrant)
 * - Approximate nearest neighbor (ANN) algorithms (FAISS, HNSW)
 * - Database extensions (pgvector for PostgreSQL)
 * 
 * @param query - Search query
 * @param topK - Number of results to return
 * @param minSimilarity - Minimum similarity threshold (0-1)
 * @returns Array of search results
 * 
 * @example
 * const results = await searchSimilarChunks('quantum computing', 5, 0.7);
 * for (const result of results) {
 *   console.log(`${result.similarity.toFixed(3)}: ${result.content.substring(0, 100)}...`);
 * }
 */
export async function searchSimilarChunks(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  console.log(`[Search] Query: "${query}" (top ${topK}, min similarity: ${minSimilarity})`);
  
  // 1. Generate embedding for query
  const startTime = Date.now();
  const queryEmbedding = await generateEmbedding(query);
  const embeddingTime = Date.now() - startTime;
  console.log(`[Search] Query embedding generated in ${embeddingTime}ms`);
  
  // 2. Retrieve all chunks from database
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);
  
  const chunks = await db
    .select()
    .from(paperChunks)
    .execute();
  
  console.log(`[Search] Retrieved ${chunks.length} chunks from database`);
  
  // 3. Calculate cosine similarity for each chunk
  const results: SearchResult[] = [];
  
  for (const chunk of chunks) {
    try {
      const chunkEmbedding = deserializeEmbedding(chunk.embedding);
      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      // Filter by minimum similarity
      if (similarity >= minSimilarity) {
        results.push({
          chunkId: String(chunk.id),
          paperId: String(chunk.paperId),
          chunkIndex: chunk.chunkIndex,
          content: chunk.text, // Column is 'text' not 'content'
          similarity,
        });
      }
    } catch (error) {
      console.error(`[Search] Error processing chunk ${chunk.id}:`, error);
      // Skip invalid chunks
    }
  }
  
  // 4. Sort by similarity (descending)
  results.sort((a, b) => b.similarity - a.similarity);
  
  // 5. Return top K results
  const topResults = results.slice(0, topK);
  
  const searchTime = Date.now() - startTime;
  console.log(`[Search] Found ${results.length} matching chunks, returning top ${topResults.length} (${searchTime}ms total)`);
  
  await connection.end();
  
  return topResults;
}

/**
 * Search for similar chunks with paper metadata
 * 
 * Same as searchSimilarChunks, but joins with papers table to include metadata
 * 
 * @param query - Search query
 * @param topK - Number of results to return
 * @param minSimilarity - Minimum similarity threshold (0-1)
 * @returns Array of search results with paper metadata
 * 
 * @example
 * const results = await searchSimilarChunksWithMetadata('quantum computing', 5, 0.7);
 * for (const result of results) {
 *   console.log(`${result.similarity.toFixed(3)}: ${result.paperTitle}`);
 *   console.log(`  ${result.content.substring(0, 100)}...`);
 * }
 */
export async function searchSimilarChunksWithMetadata(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  console.log(`[Search] Query with metadata: "${query}" (top ${topK}, min similarity: ${minSimilarity})`);
  
  // 1. Generate embedding for query
  const startTime = Date.now();
  const queryEmbedding = await generateEmbedding(query);
  const embeddingTime = Date.now() - startTime;
  console.log(`[Search] Query embedding generated in ${embeddingTime}ms`);
  
  // 2. Retrieve all chunks with paper metadata (JOIN)
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);
  
  const { papers } = await import('../../drizzle/schema');
  
  const chunks = await db
    .select({
      chunkId: paperChunks.id,
      paperId: paperChunks.paperId,
      chunkIndex: paperChunks.chunkIndex,
      content: paperChunks.text, // Column is 'text' not 'content'
      embedding: paperChunks.embedding,
      paperTitle: papers.title,
      paperAuthors: papers.authors,
      paperUrl: papers.pdfUrl, // Column is 'pdfUrl' not 'url'
    })
    .from(paperChunks)
    .leftJoin(papers, eq(paperChunks.paperId, papers.id))
    .execute();
  
  console.log(`[Search] Retrieved ${chunks.length} chunks with metadata from database`);
  
  // 3. Calculate cosine similarity for each chunk
  const results: SearchResult[] = [];
  
  for (const chunk of chunks) {
    try {
      const chunkEmbedding = deserializeEmbedding(chunk.embedding);
      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      // Filter by minimum similarity
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
        });
      }
    } catch (error) {
      console.error(`[Search] Error processing chunk ${chunk.chunkId}:`, error);
      // Skip invalid chunks
    }
  }
  
  // 4. Sort by similarity (descending)
  results.sort((a, b) => b.similarity - a.similarity);
  
  // 5. Return top K results
  const topResults = results.slice(0, topK);
  
  const searchTime = Date.now() - startTime;
  console.log(`[Search] Found ${results.length} matching chunks, returning top ${topResults.length} (${searchTime}ms total)`);
  
  await connection.end();
  
  return topResults;
}

/**
 * Get search statistics
 * 
 * @returns Search statistics
 */
export async function getSearchStatistics() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);
  
  const { papers } = await import('../../drizzle/schema');
  
  const [chunkCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(paperChunks)
    .execute();
  
  const [paperCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(papers)
    .execute();
  
  await connection.end();
  
  return {
    totalChunks: chunkCount.count,
    totalPapers: paperCount.count,
    avgChunksPerPaper: chunkCount.count / (paperCount.count || 1),
  };
}

/**
 * TODO (Phase 6): Implement approximate nearest neighbor (ANN) for large-scale search
 * TODO (Phase 6): Implement caching for frequent queries
 * TODO (Phase 6): Implement filtering by paper metadata (date, authors, category)
 * TODO (Phase 6): Implement re-ranking with LLM (semantic relevance)
 * TODO (Phase 6): Implement search analytics (query logs, popular queries)
 */
