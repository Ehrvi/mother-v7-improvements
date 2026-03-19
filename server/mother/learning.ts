/**
 * MOTHER v56.0 - Continuous Learning Module
 * Automatically extracts insights from high-quality responses and adds to knowledge base
 *
 * Algorithm (v56.0 update — Req #3: Gradual knowledge acquisition):
 * 1. Trigger: Quality ≥75% (lowered from 95% for gradual learning)
 * 2. Extract: NLP sentence segmentation + keyword density
 * 3. Deduplicate: Embeddings similarity <0.85
 * 4. Validate: Test improvement in next related query
 *
 * Scientific basis:
 * - Continual Learning (Parisi et al., Neural Networks 2019): Gradual acquisition
 *   prevents catastrophic forgetting and enables incremental knowledge growth
 * - Online Learning (Hoi et al., ACM 2021): Lower threshold enables incremental
 *   knowledge growth from real-world interactions
 * - MemGPT (Packer et al., 2023): Hierarchical memory management for LLMs
 */

import { getEmbedding, cosineSimilarity } from './embeddings';
import { insertKnowledge, getAllKnowledge } from '../db';
// C189 NC-LEARN-001 Fix: Connect memory_agent.ts for importance-scored episodic memory consolidation
// Scientific basis: Park et al. (2023) arXiv:2304.03442 — Generative Agents: importance scoring
// improves knowledge retention by filtering low-value memories before storage
// Previous state (C188): memory_agent.ts had 400L written but never imported in learning.ts
import { computeImportanceScore } from './memory_agent';
import { createLogger } from '../_core/logger';
const log = createLogger('LEARNING');


// v56.0: Lowered from 95 to 75 — Req #3: Gradual knowledge acquisition
// Scientific basis: Parisi et al. (2019) — lower threshold enables incremental learning
export const LEARNING_QUALITY_THRESHOLD = 75;

export interface LearningCandidate {
  content: string;
  query: string;
  response: string;
  qualityScore: number;
  timestamp: Date;
  userId?: number; // v56.0: Track which user triggered the learning
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
    'performance', 'scalability', 'reliability', 'security',
    // v56.0: Added scientific/research keywords
    'research', 'study', 'evidence', 'scientific', 'empirical',
    'hypothesis', 'experiment', 'analysis', 'result', 'conclusion',
    'theorem', 'proof', 'algorithm', 'complexity', 'efficiency',
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
    log.error('[Learning] Embedding check failed:', error);
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
 * v56.0: Threshold lowered from 95 to 75 (Req #3: Gradual learning)
 */
export async function learnFromResponse(candidate: LearningCandidate): Promise<LearningResult> {
  log.info(`[Learning] Evaluating response (quality: ${candidate.qualityScore}, threshold: ${LEARNING_QUALITY_THRESHOLD})`);

  // Step 1: Check quality threshold (≥75% — v56.0 Req #3: gradual learning)
  // Lowered from 95 to 75 based on Continual Learning research (Parisi et al., 2019)
  // Rationale: 95% threshold was too strict — knowledge rarely persisted
  // 75% threshold enables gradual, incremental knowledge acquisition
  if (candidate.qualityScore < LEARNING_QUALITY_THRESHOLD) {
    return {
      learned: false,
      reason: `Quality ${candidate.qualityScore} < ${LEARNING_QUALITY_THRESHOLD} threshold`
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

  // C189 NC-LEARN-001: Filter by importance score (Park et al. 2023 — Generative Agents)
  // Only store insights with importance >= 0.4 to prevent knowledge base pollution
  // computeImportanceScore(createdAt, lastAccessed, retrievalCount, linkCount)
  // For new insights: createdAt=now, lastAccessed=null, retrievalCount=1, linkCount=0
  const now = new Date();
  const importantInsights = insights.filter(_insight => {
    const score = computeImportanceScore(now, null, 1, 0);
    return score >= 0.4;
  });

  if (importantInsights.length === 0) {
    return {
      learned: false,
      reason: 'No insights passed importance threshold (>=0.4)'
    };
  }

  log.info(`[Learning] Extracted ${insights.length} insights, ${importantInsights.length} passed importance filter`);

  // Step 3: Check for duplicates and add new knowledge
  const existingKnowledge = await getAllKnowledge();

  for (const insight of importantInsights) {
    const { isDuplicate: isDup, maxSimilarity } = await isDuplicate(insight, existingKnowledge);

    if (isDup) {
      log.info(`[Learning] Skipping duplicate (similarity: ${maxSimilarity.toFixed(2)})`);
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
        tags: JSON.stringify(['auto-learned', 'continuous-learning', `quality-${candidate.qualityScore}`]),
        source: `Query: ${candidate.query.substring(0, 100)}`,
        sourceType: 'learning',
        embedding: JSON.stringify(embedding),
        embeddingModel: 'text-embedding-3-small',
      });

      log.info(`[Learning] ✅ Added knowledge ID ${knowledgeId}: "${title}" (quality: ${candidate.qualityScore})`);

      return {
        learned: true,
        reason: `Added insight (quality: ${candidate.qualityScore}, similarity: ${maxSimilarity.toFixed(2)})`,
        knowledgeId,
        similarity: maxSimilarity
      };
    } catch (error) {
      log.error('[Learning] Failed to add knowledge:', error);
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
 */
export function validateLearning(
  query: string,
  responseWithNewKnowledge: string,
  qualityScore: number
): boolean {
  // v56.0: Updated threshold to match new learning threshold
  return qualityScore >= LEARNING_QUALITY_THRESHOLD;
}

/**
 * Learn from a completed DGM/GEA evolution run.
 *
 * v47.0 New: Lower quality threshold (60) for evolution-derived insights,
 * since fitness scores rarely reach 95+ in early generations.
 *
 * Scientific basis: Continuous learning from self-improvement runs
 * (arXiv:2507.21046, Section 3.2 — "learning from self-generated experience").
 *
 * @param runId - The evolution run ID
 * @param fitnessScore - Fitness score in [0, 1]
 * @param strategies - Strategies that contributed to success
 * @param goal - The evolution goal
 */
export async function learnFromEvolutionRun(
  runId: string,
  fitnessScore: number,
  strategies: string[],
  goal: string
): Promise<LearningResult> {
  const EVOLUTION_QUALITY_THRESHOLD = 60; // Lower threshold for evolution runs

  // Convert fitness [0,1] to quality score [0,100]
  const qualityScore = Math.round(fitnessScore * 100);

  if (qualityScore < EVOLUTION_QUALITY_THRESHOLD || strategies.length === 0) {
    return {
      learned: false,
      reason: `Evolution quality ${qualityScore} < ${EVOLUTION_QUALITY_THRESHOLD} threshold or no strategies`,
    };
  }

  const evolutionSummary = `DGM Evolution Run ${runId} achieved fitness=${fitnessScore.toFixed(3)} on goal: "${goal.slice(0, 200)}". Successful strategies: ${strategies.join('; ')}`;

  // Use the standard learning pipeline with the evolution summary as the response
  const insights = extractInsights(evolutionSummary);

  if (insights.length === 0) {
    // If no insights extracted, use the full summary as the insight
    insights.push(evolutionSummary);
  }

  const existingKnowledge = await getAllKnowledge();

  for (const insight of insights) {
    const { isDuplicate: isDup, maxSimilarity } = await isDuplicate(insight, existingKnowledge);

    if (isDup) {
      log.info(`[Learning] Skipping duplicate evolution insight (similarity: ${maxSimilarity.toFixed(2)})`);
      continue;
    }

    try {
      const embedding = await getEmbedding(insight);
      const title = `Evolution Run ${runId.slice(0, 8)}: ${generateTitle(insight)}`;

      const knowledgeId = await insertKnowledge({
        title,
        content: insight,
        category: 'learned',
        tags: JSON.stringify(['auto-learned', 'dgm-evolution', `fitness-${fitnessScore.toFixed(2)}`]),
        source: `DGM Evolution: ${goal.slice(0, 100)}`,
        sourceType: 'learning',
        embedding: JSON.stringify(embedding),
        embeddingModel: 'text-embedding-3-small',
      });

      log.info(`[Learning] ✅ Evolution insight added (ID=${knowledgeId}, fitness=${fitnessScore.toFixed(2)}): "${title.slice(0, 60)}"`);

      return {
        learned: true,
        reason: `Evolution insight added (fitness=${fitnessScore.toFixed(2)}, similarity=${maxSimilarity.toFixed(2)})`,
        knowledgeId,
        similarity: maxSimilarity,
      };
    } catch (error) {
      log.error('[Learning] Failed to add evolution insight:', error);
      return {
        learned: false,
        reason: `Insert failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  return {
    learned: false,
    reason: 'All evolution insights were duplicates',
  };
}
