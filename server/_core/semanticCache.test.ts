/**
 * Semantic Cache Tests
 * 
 * Validates semantic caching functionality with embeddings and similarity search.
 */

import { describe, it, expect } from 'vitest';
import { 
  generateQueryEmbedding, 
  cosineSimilarity,
  searchSemanticCache,
  storeInSemanticCache,
  getSemanticCacheStats
} from './semanticCache';

describe('Semantic Cache', () => {
  it('should generate embedding for query', async () => {
    const embedding = await generateQueryEmbedding('What is quantum computing?');
    
    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(1536); // text-embedding-3-small dimensions
    expect(typeof embedding[0]).toBe('number');
  });

  it('should calculate cosine similarity correctly', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [1, 0, 0];
    const vec3 = [0, 1, 0];

    const sim1 = cosineSimilarity(vec1, vec2);
    const sim2 = cosineSimilarity(vec1, vec3);

    expect(sim1).toBeCloseTo(1.0, 5); // Identical vectors
    expect(sim2).toBeCloseTo(0.0, 5); // Orthogonal vectors
  });

  it('should handle similar queries with high similarity', async () => {
    const query1 = 'What are the benefits of AI?';
    const query2 = 'What are the advantages of artificial intelligence?';

    const emb1 = await generateQueryEmbedding(query1);
    const emb2 = await generateQueryEmbedding(query2);

    const similarity = cosineSimilarity(emb1, emb2);

    expect(similarity).toBeGreaterThan(0.85); // Similar queries should have high similarity
  });

  it('should handle dissimilar queries with low similarity', async () => {
    const query1 = 'What is quantum computing?';
    const query2 = 'How to bake a chocolate cake?';

    const emb1 = await generateQueryEmbedding(query1);
    const emb2 = await generateQueryEmbedding(query2);

    const similarity = cosineSimilarity(emb1, emb2);

    expect(similarity).toBeLessThan(0.5); // Dissimilar queries should have low similarity
  });

  it('should store and retrieve from semantic cache', async () => {
    const query = 'Test query for semantic cache';
    const embedding = await generateQueryEmbedding(query);
    const response = 'Test response';
    const metadata = { tier: 'gpt-4o-mini', quality: 95 };

    // Store in cache
    await storeInSemanticCache(query, embedding, response, metadata);

    // Search cache (should find exact match)
    const result = await searchSemanticCache(query, 0.95);

    expect(result).toBeDefined();
    expect(result?.response).toBe(response);
    expect(result?.similarity).toBeGreaterThan(0.99); // Exact match
    expect(result?.metadata).toEqual(metadata);
  });

  it('should return null for cache miss', async () => {
    const uniqueQuery = `Unique query ${Date.now()} ${Math.random()}`;
    
    const result = await searchSemanticCache(uniqueQuery, 0.95);

    expect(result).toBeNull();
  });

  it('should get cache statistics', async () => {
    const stats = await getSemanticCacheStats();

    expect(stats).toBeDefined();
    expect(typeof stats.totalEntries).toBe('number');
    expect(typeof stats.totalHits).toBe('number');
    expect(typeof stats.avgHitsPerEntry).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
    expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
  });
});
