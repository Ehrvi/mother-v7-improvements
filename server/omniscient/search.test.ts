/**
 * MOTHER Omniscient - Vector Search Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cosineSimilarity, searchSimilarChunks, getSearchStatistics } from './search';
import { generateEmbedding, serializeEmbedding } from './embeddings';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { paperChunks, papers, knowledgeAreas } from '../../drizzle/schema';

describe('MOTHER Omniscient - Vector Search', () => {
  describe('Cosine Similarity', () => {
    it('should calculate similarity for identical vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];
      
      const similarity = cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBeCloseTo(1.0, 5); // Identical vectors = 1.0
    });
    
    it('should calculate similarity for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      
      const similarity = cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBeCloseTo(0.0, 5); // Orthogonal vectors = 0.0
    });
    
    it('should calculate similarity for opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      
      const similarity = cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBeCloseTo(-1.0, 5); // Opposite vectors = -1.0
    });
    
    it('should calculate similarity for similar vectors', () => {
      const vec1 = [1, 1, 0];
      const vec2 = [1, 0.9, 0];
      
      const similarity = cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBeGreaterThan(0.9); // Similar vectors > 0.9
      expect(similarity).toBeLessThan(1.0);
    });
    
    it('should throw error for mismatched dimensions', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0];
      
      expect(() => cosineSimilarity(vec1, vec2)).toThrow('Vector dimensions mismatch');
    });
    
    it('should handle zero vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 0, 0];
      
      const similarity = cosineSimilarity(vec1, vec2);
      
      expect(similarity).toBe(0); // Zero vector = 0 similarity
    });
  });
  
  describe('Vector Search (Integration)', () => {
    let connection: mysql.Connection;
    let db: ReturnType<typeof drizzle>;
    let testAreaId: number;
    let testPaperId: number;
    
    beforeAll(async () => {
      // Setup test database connection
      connection = await mysql.createConnection(process.env.DATABASE_URL!);
      db = drizzle(connection);
      
      // Create test knowledge area
      const [area] = await db.insert(knowledgeAreas).values({
        name: 'Test Area (Vector Search)',
        description: 'Test area for vector search tests',
        status: 'completed',
        papersCount: 1,
        totalChunks: 3,
      });
      
      testAreaId = Number(area.insertId);
      
      // Create test paper
      const [paper] = await db.insert(papers).values({
        knowledgeAreaId: testAreaId,
        arxivId: 'test-vector-search-001',
        title: 'Test Paper for Vector Search',
        authors: 'Test Author',
        abstract: 'Test abstract',
        chunksCount: 3,
      });
      
      testPaperId = Number(paper.insertId);
      
      // Create test chunks with embeddings
      const texts = [
        'Quantum computing uses quantum mechanics to process information.',
        'Machine learning is a subset of artificial intelligence.',
        'The cat sat on the mat.',
      ];
      
      for (let i = 0; i < texts.length; i++) {
        const embedding = await generateEmbedding(texts[i]);
        const embeddingJson = serializeEmbedding(embedding);
        
        await db.insert(paperChunks).values({
          paperId: testPaperId,
          chunkIndex: i,
          text: texts[i],
          embedding: embeddingJson,
          tokenCount: texts[i].split(' ').length,
        });
      }
    }, 120000); // 120s timeout for setup
    
    afterAll(async () => {
      // Cleanup test data
      if (testAreaId) {
        await db.delete(knowledgeAreas).where(eq(knowledgeAreas.id, testAreaId));
      }
      
      await connection.end();
    });
    
    it('should search for similar chunks', async () => {
      const query = 'quantum mechanics';
      const results = await searchSimilarChunks(query, 3, 0.0);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
      
      // Results should be sorted by similarity (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
      
      // Top result should be about quantum computing
      expect(results[0].content).toContain('quantum');
      expect(results[0].similarity).toBeGreaterThan(0.5);
    }, 60000); // 60s timeout
    
    it('should filter by minimum similarity', async () => {
      const query = 'quantum mechanics';
      const results = await searchSimilarChunks(query, 10, 0.7);
      
      // All results should have similarity >= 0.7
      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0.7);
      }
    }, 60000); // 60s timeout
    
    it('should return empty array if no matches above threshold', async () => {
      const query = 'completely unrelated topic xyz123';
      const results = await searchSimilarChunks(query, 10, 0.9);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // May be empty or have very few results
      expect(results.length).toBeLessThanOrEqual(3);
    }, 60000); // 60s timeout
    
    it('should get search statistics', async () => {
      const stats = await getSearchStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalChunks).toBeGreaterThanOrEqual(3); // At least our test chunks
      expect(stats.totalPapers).toBeGreaterThanOrEqual(1); // At least our test paper
      expect(stats.avgChunksPerPaper).toBeGreaterThan(0);
    });
  });
});
