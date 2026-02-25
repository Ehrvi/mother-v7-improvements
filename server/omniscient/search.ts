/**
 * MOTHER Omniscient - Vector Search
 * 
 * Provides semantic search capabilities using cosine similarity.
 * Uses the shared DB pool from db.ts to support both Unix socket (Cloud SQL)
 * and TCP connections — fixing the "Invalid URL" error on Cloud Run.
 */

import { eq, sql } from 'drizzle-orm';
import { paperChunks } from '../../drizzle/schema';
import { generateEmbedding, deserializeEmbedding } from './embeddings';
import { getDb } from '../db';

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
}

/**
 * Search for similar chunks using vector similarity (basic, no metadata)
 */
export async function searchSimilarChunks(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  console.log(`[Search] Query: "${query}" (top ${topK}, min similarity: ${minSimilarity})`);
  const startTime = Date.now();

  const db = await getDb();
  if (!db) {
    console.error('[Search] DB not available');
    return [];
  }

  const queryEmbedding = await generateEmbedding(query);
  console.log(`[Search] Query embedding generated in ${Date.now() - startTime}ms`);

  const chunks = await db.select().from(paperChunks).execute();
  console.log(`[Search] Retrieved ${chunks.length} chunks from database`);

  const results: SearchResult[] = [];
  for (const chunk of chunks) {
    try {
      const chunkEmbedding = deserializeEmbedding(chunk.embedding);
      const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
      if (similarity >= minSimilarity) {
        results.push({
          chunkId: String(chunk.id),
          paperId: String(chunk.paperId),
          chunkIndex: chunk.chunkIndex,
          content: chunk.text,
          similarity,
        });
      }
    } catch (error) {
      console.error(`[Search] Error processing chunk ${chunk.id}:`, error);
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, topK);
  console.log(`[Search] Found ${results.length} matching chunks, returning top ${topResults.length} (${Date.now() - startTime}ms total)`);
  return topResults;
}

/**
 * Search for similar chunks with paper metadata (JOIN with papers table)
 */
export async function searchSimilarChunksWithMetadata(
  query: string,
  topK: number = 10,
  minSimilarity: number = 0.5
): Promise<SearchResult[]> {
  console.log(`[Search] Query with metadata: "${query}" (top ${topK}, min similarity: ${minSimilarity})`);
  const startTime = Date.now();

  const db = await getDb();
  if (!db) {
    console.error('[Search] DB not available');
    return [];
  }

  const queryEmbedding = await generateEmbedding(query);
  console.log(`[Search] Query embedding generated in ${Date.now() - startTime}ms`);

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
    })
    .from(paperChunks)
    .leftJoin(papers, eq(paperChunks.paperId, papers.id))
    .execute();

  console.log(`[Search] Retrieved ${chunks.length} chunks with metadata from database`);

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
        });
      }
    } catch (error) {
      console.error(`[Search] Error processing chunk ${chunk.chunkId}:`, error);
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, topK);
  console.log(`[Search] Found ${results.length} matching chunks, returning top ${topResults.length} (${Date.now() - startTime}ms total)`);
  return topResults;
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
  };
}
