/**
 * GOD-Level Learning System
 * 
 * Based on MOTHER v13 learning foundations:
 * - Automatic knowledge acquisition from high-quality interactions
 * - Quality filtering (only learn from 90+ score queries)
 * - Intelligent deduplication (prevent redundant entries)
 * - Auto-categorization (categorize new knowledge)
 * - Embedding generation (OpenAI embeddings for semantic search)
 * 
 * References:
 * - /home/ubuntu/mother-v13-learning/docs/knowledge_system/GOD_LEVEL_KNOWLEDGE_ACQUIRED.md
 * - /home/ubuntu/mother-v13-knowledge/LESSONS_LEARNED.md (Lesson 2: Documentation ≠ Learning Without Persistence)
 * 
 * @module server/learning/god-level
 */

import { getDb } from "../db";
import { knowledge } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { logger } from '../lib/logger';
// QueryResult type will be defined inline
interface QueryResult {
  query: string;
  response: string;
  tier: string;
  quality: { qualityScore: number };
  cost: number;
  tokensUsed: number;
}

/**
 * GOD-Level Learning Configuration
 */
export const GOD_LEVEL_CONFIG = {
  /** Minimum quality score to trigger learning (0-100) */
  MIN_QUALITY_SCORE: 85,
  
  /** Maximum entries to check for deduplication */
  MAX_DEDUP_CHECK: 100,
  
  /** Similarity threshold for deduplication (0-1) */
  SIMILARITY_THRESHOLD: 0.85,
  
  /** Categories for auto-categorization */
  CATEGORIES: [
    "cybersecurity",
    "sdlc",
    "project_management",
    "information_management",
    "financial_management",
    "technical",
    "business",
    "other"
  ] as const,
};

export type KnowledgeCategory = typeof GOD_LEVEL_CONFIG.CATEGORIES[number];

/**
 * Learning Entry to be saved
 */
export interface LearningEntry {
  query: string;
  response: string;
  category: KnowledgeCategory;
  qualityScore: number;
  source: string;
  metadata?: Record<string, any>;
}

/**
 * GOD-Level Learning System
 * 
 * Automatically learns from high-quality interactions without manual intervention.
 */
export class GODLevelLearning {
  /**
   * Learn from a query result if it meets quality criteria
   * 
   * @param result - Query result from MOTHER core
   * @returns true if learning occurred, false otherwise
   */
  static async learnFromQuery(result: QueryResult): Promise<boolean> {
    logger.info(`[GOD-Level DEBUG] learnFromQuery called with quality: ${result.quality.qualityScore}`);
    try {
      // Step 1: Quality filtering (only learn from 90+ score)
      logger.info(`[GOD-Level DEBUG] Quality check: ${result.quality.qualityScore} vs threshold: ${GOD_LEVEL_CONFIG.MIN_QUALITY_SCORE}`);
      if (result.quality.qualityScore < GOD_LEVEL_CONFIG.MIN_QUALITY_SCORE) {
        logger.info(`[GOD-Level] Skipping learning: quality ${result.quality.qualityScore} < ${GOD_LEVEL_CONFIG.MIN_QUALITY_SCORE}`);
        return false;
      }

      // Step 2: Check for duplicates (prevent redundant entries)
      logger.info('[GOD-Level DEBUG] Checking for duplicates...');
      const isDuplicate = await this.checkDuplicate(result.response);
      logger.info(`[GOD-Level DEBUG] Duplicate check result: ${isDuplicate}`);
      if (isDuplicate) {
        logger.info(`[GOD-Level] Skipping learning: duplicate content detected`);
        return false;
      }

      // Step 3: Auto-categorize the knowledge
      logger.info('[GOD-Level DEBUG] Categorizing knowledge...');
      const category = await this.categorizeKnowledge(result.query, result.response);
      logger.info(`[GOD-Level DEBUG] Category: ${category}`);

      // Step 4: Generate embedding for semantic search
      const embedding = await this.generateEmbedding(result.response);

      // Step 5: Save to knowledge base
      const entry: LearningEntry = {
        query: result.query,
        response: result.response,
        category,
        qualityScore: result.quality.qualityScore,
        source: "god_level_learning",
        metadata: {
          tier: result.tier,
          cost: result.cost,
          tokensUsed: result.tokensUsed,
          timestamp: new Date().toISOString(),
        },
      };

      logger.info('[GOD-Level DEBUG] Saving knowledge to database...');
      await this.saveKnowledge(entry, embedding);
      logger.info('[GOD-Level DEBUG] ✅ Knowledge saved successfully!');

      logger.info(`[GOD-Level] ✅ Learned from query: category=${category}, quality=${result.quality.qualityScore}`);
      return true;
    } catch (error) {
      logger.error('[GOD-Level DEBUG] ❌ EXCEPTION:', error);
      logger.error(`[GOD-Level] ❌ Learning failed:`, error);
      return false;
    }
  }

  /**
   * Check if content is duplicate (using semantic similarity)
   * 
   * @param content - Content to check
   * @returns true if duplicate, false otherwise
   */
  private static async checkDuplicate(content: string): Promise<boolean> {
    try {
      // Generate embedding for new content
      const newEmbedding = await this.generateEmbedding(content);

      // Get recent entries for comparison
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const recentEntries = await db
        .select()
        .from(knowledge)
        .orderBy(sql`${knowledge.createdAt} DESC`)
        .limit(GOD_LEVEL_CONFIG.MAX_DEDUP_CHECK);

      // Check similarity with each recent entry
      for (const entry of recentEntries) {
        if (!entry.embedding) continue;

        const similarity = this.cosineSimilarity(
          newEmbedding,
          JSON.parse(entry.embedding as string)
        );

        if (similarity >= GOD_LEVEL_CONFIG.SIMILARITY_THRESHOLD) {
          logger.info(`[GOD-Level] Duplicate detected: similarity=${similarity.toFixed(3)}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`[GOD-Level] Deduplication check failed:`, error);
      return false; // Assume not duplicate if check fails
    }
  }

  /**
   * Auto-categorize knowledge using LLM
   * 
   * @param query - User query
   * @param response - MOTHER response
   * @returns Category
   */
  private static async categorizeKnowledge(
    query: string,
    response: string
  ): Promise<KnowledgeCategory> {
    try {
      const prompt = `Categorize the following knowledge into ONE of these categories: ${GOD_LEVEL_CONFIG.CATEGORIES.join(", ")}.

Query: ${query}
Response: ${response.substring(0, 500)}...

Category (respond with ONLY the category name):`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: "You are a knowledge categorization expert. Respond with ONLY the category name, nothing else." },
          { role: "user", content: prompt },
        ],
      });

      const content = result.choices[0].message.content;
      const category = (typeof content === 'string' ? content.trim() : 'other').toLowerCase() as KnowledgeCategory;

      // Validate category
      if (GOD_LEVEL_CONFIG.CATEGORIES.includes(category)) {
        return category;
      }

      logger.warn(`[GOD-Level] Invalid category "${category}", defaulting to "other"`);
      return "other";
    } catch (error) {
      logger.error(`[GOD-Level] Categorization failed:`, error);
      return "other";
    }
  }

  /**
   * Generate embedding for semantic search
   * 
   * @param text - Text to embed
   * @returns Embedding vector
   */
  private static async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use OpenAI embeddings API
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.substring(0, 8000), // Limit to 8k chars
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      logger.error(`[GOD-Level] Embedding generation failed:`, error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  /**
   * Save knowledge to database
   * 
   * @param entry - Learning entry
   * @param embedding - Embedding vector
   */
  private static async saveKnowledge(
    entry: LearningEntry,
    embedding: number[]
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    await db.insert(knowledge).values({
      title: entry.query.substring(0, 500), // Use query as title (truncated)
      content: JSON.stringify({
        query: entry.query,
        response: entry.response,
        category: entry.category,
        metadata: entry.metadata,
      }),
      category: entry.category,
      embedding: JSON.stringify(embedding),
      embeddingModel: "text-embedding-3-small",
      source: entry.source,
      sourceType: "learning",
      createdAt: new Date(),
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   * 
   * @param a - Vector A
   * @param b - Vector B
   * @returns Similarity score (0-1)
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
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

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Retrieve relevant knowledge using semantic search
   * 
   * @param query - Search query
   * @param limit - Maximum number of results
   * @returns Relevant knowledge entries
   */
  static async retrieveKnowledge(
    query: string,
    limit: number = 5
  ): Promise<Array<{ content: string; similarity: number }>> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Get all knowledge entries
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const entries = await db.select().from(knowledge);

      // Calculate similarity for each entry
      const results = entries
        .filter((entry: any) => entry.embedding)
        .map((entry: any) => ({
          content: entry.content,
          similarity: this.cosineSimilarity(
            queryEmbedding,
            JSON.parse(entry.embedding as string)
          ),
        }))
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, limit);

      return results;
    } catch (error) {
      logger.error(`[GOD-Level] Knowledge retrieval failed:`, error);
      return [];
    }
  }
}

/**
 * Export for use in MOTHER core
 */
export default GODLevelLearning;
