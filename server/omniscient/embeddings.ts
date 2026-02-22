/**
 * MOTHER Omniscient - Embeddings Generation
 * 
 * Provides functions to generate embeddings for text chunks using OpenAI API
 */

import { invokeLLM } from '../_core/llm';

/**
 * Embedding model configuration
 */
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // Process 100 chunks at a time

/**
 * Generate embedding for a single text
 * 
 * @param text - Input text
 * @returns Embedding vector (1536 dimensions)
 * 
 * @example
 * const embedding = await generateEmbedding('This is a test sentence.');
 * console.log(embedding.length); // 1536
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Call OpenAI embeddings API via invokeLLM
    // Note: invokeLLM is designed for chat completions, but we can use fetch directly
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const embedding = data.data[0].embedding;
    
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding?.length}`);
    }
    
    return embedding;
  } catch (error) {
    console.error('[Embeddings] Generation error:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * 
 * Strategy:
 * 1. Split texts into batches of BATCH_SIZE
 * 2. Process each batch sequentially (to avoid rate limits)
 * 3. Return all embeddings in original order
 * 
 * @param texts - Array of input texts
 * @returns Array of embedding vectors
 * 
 * @example
 * const texts = ['Text 1', 'Text 2', 'Text 3'];
 * const embeddings = await generateEmbeddingsBatch(texts);
 * console.log(embeddings.length); // 3
 * console.log(embeddings[0].length); // 1536
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  console.log(`[Embeddings] Generating embeddings for ${texts.length} texts (batch size: ${BATCH_SIZE})`);
  
  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
    
    console.log(`[Embeddings] Processing batch ${batchNumber}/${totalBatches} (${batch.length} texts)`);
    
    try {
      // Call OpenAI embeddings API with batch
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const batchEmbeddings = data.data.map((item: any) => item.embedding);
      
      // Verify dimensions
      for (const embedding of batchEmbeddings) {
        if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Invalid embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding?.length}`);
        }
      }
      
      embeddings.push(...batchEmbeddings);
      
      console.log(`[Embeddings] Batch ${batchNumber}/${totalBatches} complete (${embeddings.length}/${texts.length} total)`);
      
      // Rate limiting: wait 1 second between batches
      if (i + BATCH_SIZE < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[Embeddings] Batch ${batchNumber} error:`, error);
      throw error;
    }
  }
  
  console.log(`[Embeddings] Generated ${embeddings.length} embeddings`);
  
  return embeddings;
}

/**
 * Calculate cost for generating embeddings
 * 
 * Pricing: $0.00002 per 1K tokens (text-embedding-3-small)
 * 
 * @param tokenCount - Total number of tokens
 * @returns Cost in USD
 * 
 * @example
 * const cost = calculateEmbeddingCost(100000); // 100K tokens
 * console.log(cost); // $2.00
 */
export function calculateEmbeddingCost(tokenCount: number): number {
  const costPer1KTokens = 0.00002;
  return (tokenCount / 1000) * costPer1KTokens;
}

/**
 * Serialize embedding to JSON string for database storage
 * 
 * @param embedding - Embedding vector
 * @returns JSON string
 * 
 * @example
 * const embedding = [0.1, 0.2, 0.3];
 * const json = serializeEmbedding(embedding);
 * console.log(json); // "[0.1,0.2,0.3]"
 */
export function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/**
 * Deserialize embedding from JSON string
 * 
 * @param json - JSON string
 * @returns Embedding vector
 * 
 * @example
 * const json = "[0.1,0.2,0.3]";
 * const embedding = deserializeEmbedding(json);
 * console.log(embedding); // [0.1, 0.2, 0.3]
 */
export function deserializeEmbedding(json: string): number[] {
  const embedding = JSON.parse(json);
  
  if (!Array.isArray(embedding)) {
    throw new Error('Invalid embedding format: expected array');
  }
  
  return embedding;
}

/**
 * Validate embedding vector
 * 
 * @param embedding - Embedding vector
 * @returns True if valid, false otherwise
 * 
 * @example
 * const embedding = new Array(1536).fill(0.1);
 * console.log(validateEmbedding(embedding)); // true
 */
export function validateEmbedding(embedding: number[]): boolean {
  if (!Array.isArray(embedding)) {
    return false;
  }
  
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    return false;
  }
  
  // Check all elements are numbers
  for (const value of embedding) {
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get embedding model info
 * 
 * @returns Model configuration
 */
export function getEmbeddingModelInfo() {
  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    batchSize: BATCH_SIZE,
    costPer1KTokens: 0.00002,
  };
}

/**
 * TODO (Phase 6): Implement retry logic with exponential backoff
 * TODO (Phase 6): Implement caching for repeated texts
 * TODO (Phase 6): Implement error recovery (partial batch success)
 * TODO (Phase 6): Implement progress tracking for large batches
 */
