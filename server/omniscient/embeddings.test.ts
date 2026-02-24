/**
 * MOTHER Omniscient - Embeddings Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateEmbedding,
  generateEmbeddingsBatch,
  calculateEmbeddingCost,
  serializeEmbedding,
  deserializeEmbedding,
  validateEmbedding,
  getEmbeddingModelInfo,
} from './embeddings';
import { cosineSimilarity } from './search';

describe('MOTHER Omniscient - Embeddings', () => {
  it('should generate embedding for single text', async () => {
    const text = 'This is a test sentence for embedding generation.';
    const embedding = await generateEmbedding(text);
    
    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(1536); // text-embedding-3-small dimensions
    expect(typeof embedding[0]).toBe('number');
  }, 30000); // 30s timeout
  
  it('should generate embeddings for batch', async () => {
    const texts = [
      'First test sentence.',
      'Second test sentence.',
      'Third test sentence.',
    ];
    
    const embeddings = await generateEmbeddingsBatch(texts);
    
    expect(embeddings).toBeDefined();
    expect(Array.isArray(embeddings)).toBe(true);
    expect(embeddings.length).toBe(3);
    expect(embeddings[0].length).toBe(1536);
    expect(embeddings[1].length).toBe(1536);
    expect(embeddings[2].length).toBe(1536);
  }, 60000); // 60s timeout
  
  it('should calculate embedding cost correctly', () => {
    const tokenCount = 100000; // 100K tokens
    const cost = calculateEmbeddingCost(tokenCount);
    
    expect(cost).toBe(0.002); // $0.00002 * 100 = $0.002 (not $2.00)
  });
  
  it('should serialize and deserialize embeddings', () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    
    // Serialize
    const json = serializeEmbedding(embedding);
    expect(typeof json).toBe('string');
    expect(json).toBe('[0.1,0.2,0.3,0.4,0.5]');
    
    // Deserialize
    const deserialized = deserializeEmbedding(json);
    expect(Array.isArray(deserialized)).toBe(true);
    expect(deserialized).toEqual(embedding);
  });
  
  it('should validate embeddings correctly', () => {
    // Valid embedding
    const validEmbedding = new Array(1536).fill(0.1);
    expect(validateEmbedding(validEmbedding)).toBe(true);
    
    // Invalid: wrong dimensions
    const invalidDimensions = new Array(100).fill(0.1);
    expect(validateEmbedding(invalidDimensions)).toBe(false);
    
    // Invalid: not an array
    expect(validateEmbedding('not an array' as any)).toBe(false);
    
    // Invalid: contains non-numbers
    const invalidValues = new Array(1536).fill('0.1');
    expect(validateEmbedding(invalidValues as any)).toBe(false);
  });
  
  it('should return correct model info', () => {
    const info = getEmbeddingModelInfo();
    
    expect(info.model).toBe('text-embedding-3-small');
    expect(info.dimensions).toBe(1536);
    expect(info.batchSize).toBe(100);
    expect(info.costPer1KTokens).toBe(0.00002);
  });
  
  it('should generate similar embeddings for similar texts', async () => {
    const text1 = 'The cat sat on the mat.';
    const text2 = 'A cat was sitting on a mat.';
    const text3 = 'Quantum computing is revolutionary.';
    
    const [emb1, emb2, emb3] = await generateEmbeddingsBatch([text1, text2, text3]);
    
    // Similar texts should have high cosine similarity
    const similarity12 = cosineSimilarity(emb1, emb2);
    const similarity13 = cosineSimilarity(emb1, emb3);
    
    console.log(`Similarity (cat sentences): ${similarity12.toFixed(3)}`);
    console.log(`Similarity (cat vs quantum): ${similarity13.toFixed(3)}`);
    
    // Similar texts should have higher similarity than dissimilar texts
    expect(similarity12).toBeGreaterThan(similarity13);
    expect(similarity12).toBeGreaterThan(0.7); // High similarity threshold
  }, 60000); // 60s timeout
});
