/**
 * MOTHER v7.0 - Iteration 18: Continuous Learning
 * Automatically extracts insights from high-quality responses and adds to knowledge base
 * 
 * Algorithm (designed by MOTHER superinteligência):
 * 1. Trigger: Quality >95%
 * 2. Extract: NLP sentence segmentation + keyword density
 * 3. Deduplicate: Embeddings similarity <0.85
 * 4. Validate: Test improvement in next related query
 */

import { getEmbedding, cosineSimilarity } from './embeddings';
import { insertKnowledge, getAllKnowledge } from '../db';
import { logger } from '../lib/logger';

export interface LearningCandidate {
  content: string;
  query: string;
  response: string;
  qualityScore: number;
  timestamp: Date;
}

export interface LearningResult {
  learned: boolean;
  reason: string;
  knowledgeId?: number;
  similarity?: number;
}

/**
 * Extract high-value insights from response
 * Uses sentence segmentation + keyword density
 */
export function extractInsights(response: string): string[] {
  // Split into sentences (simple approach)
  const sentences = response
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // Min length for meaningful insight

  const insights: string[] = [];

  // Keywords indicating high-value content
  const highValueKeywords = [
    'algorithm', 'implementation', 'strategy', 'approach', 'method',
    'pattern', 'architecture', 'design', 'solution', 'technique',
    'principle', 'concept', 'framework', 'model', 'system',
    'process', 'workflow', 'best practice', 'optimization',
    'performance', 'scalability', 'reliability', 'security'
  ];

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    
    // Count keyword matches
    const keywordMatches = highValueKeywords.filter(keyword => 
      lowerSentence.includes(keyword)
    ).length;

    // High-value if contains 2+ keywords or is long and detailed
    if (keywordMatches >= 2 || (sentence.length > 100 && keywordMatches >= 1)) {
      insights.push(sentence);
    }
  }

  return insights;
}

/**
 * Check if insight is duplicate using embeddings similarity
 * Threshold: <0.85 = new topic (recommended by MOTHER)
 */
export async function isDuplicate(
  insight: string,
  existingKnowledge: Array<{ title: string; content: string; embedding: string | null }>
): Promise<{ isDuplicate: boolean; maxSimilarity: number }> {
  try {
    // Get embedding for new insight
    const insightEmbedding = await getEmbedding(insight);

    let maxSimilarity = 0;

    for (const entry of existingKnowledge) {
      if (!entry.embedding) continue;

      const existingEmbedding = JSON.parse(entry.embedding);
      const similarity = cosineSimilarity(insightEmbedding, existingEmbedding);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }

      // Threshold: 0.85 (MOTHER recommendation)
      if (similarity >= 0.85) {
        return { isDuplicate: true, maxSimilarity: similarity };
      }
    }

    return { isDuplicate: false, maxSimilarity };
  } catch (error) {
    logger.error('[Learning] Embedding check failed:', error);
    // Fallback: assume not duplicate if embeddings fail
    return { isDuplicate: false, maxSimilarity: 0 };
  }
}

/**
 * Generate title from insight content
 */
function generateTitle(insight: string): string {
  // Take first 50 chars or until first comma/colon
  const title = insight
    .split(/[,:]/)[0]
    .substring(0, 50)
    .trim();
  
  return title || 'Learned Insight';
}

/**
 * Learn from high-quality response
 * Main entry point for continuous learning
 */
export async function learnFromResponse(candidate: LearningCandidate): Promise<LearningResult> {
  logger.info(`[Learning] Evaluating response (quality: ${candidate.qualityScore})`);

  // Step 1: Check quality threshold (>95%)
  if (candidate.qualityScore <= 95) {
    return {
      learned: false,
      reason: `Quality ${candidate.qualityScore} <= 95 threshold`
    };
  }

  // Step 2: Extract insights
  const insights = extractInsights(candidate.response);
  
  if (insights.length === 0) {
    return {
      learned: false,
      reason: 'No high-value insights extracted'
    };
  }

  logger.info(`[Learning] Extracted ${insights.length} insights`);

  // Step 3: Check for duplicates and add new knowledge
  const existingKnowledge = await getAllKnowledge();

  for (const insight of insights) {
    const { isDuplicate: isDup, maxSimilarity } = await isDuplicate(insight, existingKnowledge);

    if (isDup) {
      logger.info(`[Learning] Skipping duplicate (similarity: ${maxSimilarity.toFixed(2)})`);
      continue;
    }

    // Step 4: Add to knowledge base
    try {
      const embedding = await getEmbedding(insight);
      const title = generateTitle(insight);

      const knowledgeId = await insertKnowledge({
        title,
        content: insight,
        category: 'learned', // Mark as learned (vs manually added)
        tags: JSON.stringify(['auto-learned', 'continuous-learning']),
        source: `Query: ${candidate.query.substring(0, 100)}`,
        sourceType: 'learning',
        embedding: JSON.stringify(embedding),
        embeddingModel: 'text-embedding-3-small',
      });

      logger.info(`[Learning] ✅ Added knowledge ID ${knowledgeId}: "${title}"`);

      return {
        learned: true,
        reason: `Added insight (similarity: ${maxSimilarity.toFixed(2)})`,
        knowledgeId,
        similarity: maxSimilarity
      };
    } catch (error) {
      logger.error('[Learning] Failed to add knowledge:', error);
      return {
        learned: false,
        reason: `Insert failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  return {
    learned: false,
    reason: 'All insights were duplicates'
  };
}

/**
 * Validate learning by checking if knowledge improves future queries
 * (To be implemented in future iteration)
 */
export function validateLearning(
  query: string,
  responseWithNewKnowledge: string,
  qualityScore: number
): boolean {
  // Placeholder for validation logic
  // In future: compare quality scores before/after learning
  return qualityScore > 90;
}
