/**
 * MOTHER v7.0 - Embeddings Utility
 * Provides semantic similarity using OpenAI embeddings
 */

import { ENV } from '../_core/env';

/**
 * Get embedding vector for text
 * Uses text-embedding-3-small (1536 dimensions, $0.02/1M tokens)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const apiUrl = ENV.forgeApiUrl?.replace(/\/$/, '') || '';
    const response = await fetch(`${apiUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.forgeApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000) // Limit to ~8k chars to avoid token limits
      })
    });

    if (!response.ok) {
      throw new Error(`Embeddings API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('[Embeddings] Error:', error);
    // Fallback: return zero vector
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
