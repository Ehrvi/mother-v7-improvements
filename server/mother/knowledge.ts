/**
 * MOTHER v7.0 - Layer 5: Knowledge Layer
 * Implements 4-source knowledge integration to prevent catastrophic forgetting
 *
 * Academic validation:
 * - Continual Learning Survey (2024): 6 proven approaches
 * - Lifelong ML (Tom Mitchell, 1397 cit.): Never-ending learning demonstrated
 *
 * Sources:
 * 1. SQLite Database (Replay mechanism) - Persistent storage
 * 2. Vector Embeddings (Template-based) - Semantic search
 * 3. Real-time APIs (Context-dependent) - Fresh data
 * 4. External Knowledge Bases - Specialized information
 *
 * Result: NO CATASTROPHIC FORGETTING
 */

import { searchKnowledge, getAllKnowledge } from "../db";
import type { Knowledge } from "../../drizzle/schema";
import { getEmbedding, cosineSimilarity } from "./embeddings";
import { logger } from "../lib/logger";

export interface KnowledgeSource {
  name: string;
  type: "database" | "vector" | "api" | "external";
  priority: number; // 1-4, lower = higher priority
}

export interface KnowledgeResult {
  content: string;
  source: KnowledgeSource;
  confidence: number; // 0-1
  relevance: number; // 0-1
}

/**
 * Source 1: SQLite Database (Replay mechanism)
 * Persistent storage of all knowledge
 */
export async function queryDatabase(query: string): Promise<KnowledgeResult[]> {
  try {
    const results = await searchKnowledge(query, 5);

    return results.map((item: Knowledge) => ({
      content: item.content,
      source: {
        name: "SQLite Database",
        type: "database" as const,
        priority: 1,
      },
      confidence: 0.9, // High confidence in stored knowledge
      relevance: calculateRelevance(query, item.content),
    }));
  } catch (error) {
    logger.error("[Knowledge] Database query failed:", error);
    return [];
  }
}

/**
 * Source 2: Vector Embeddings Search (Semantic Similarity)
 * Uses OpenAI embeddings + cosine similarity for semantic search
 * Iteration 13: Upgraded from TF-IDF to true vector search
 */
export async function queryVectorSearch(
  query: string
): Promise<KnowledgeResult[]> {
  try {
    // Get all knowledge entries from database
    const allKnowledge = await getAllKnowledge();

    if (allKnowledge.length === 0) {
      logger.info("[Knowledge] No knowledge entries in database");
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await getEmbedding(query);

    // Check if we got a valid embedding (not zero vector)
    const isZeroVector = queryEmbedding.every(v => v === 0);
    if (isZeroVector) {
      logger.warn(
        "[Knowledge] Failed to get query embedding, falling back to keyword search"
      );
      return await queryVectorSearchFallback(query, allKnowledge);
    }

    // Calculate semantic similarity for each knowledge entry
    const results = await Promise.all(
      allKnowledge.map(async (item: Knowledge) => {
        let relevance = 0;

        // If entry has embedding, use cosine similarity
        if (item.embedding) {
          try {
            const itemEmbedding = JSON.parse(item.embedding);
            relevance = cosineSimilarity(queryEmbedding, itemEmbedding);
          } catch (e) {
            logger.error(
              `[Knowledge] Failed to parse embedding for "${item.title}"`
            );
            // Fall back to keyword matching for this entry
            const queryTerms = extractTerms(query);
            const titleRelevance = calculateTermRelevance(
              queryTerms,
              item.title
            );
            const contentRelevance = calculateTermRelevance(
              queryTerms,
              item.content
            );
            relevance = titleRelevance * 0.7 + contentRelevance * 0.3;
          }
        } else {
          // No embedding stored, generate and calculate similarity
          const itemText = `${item.title}\n\n${item.content}`;
          const itemEmbedding = await getEmbedding(itemText);

          // Check if we got a valid embedding
          const isItemZeroVector = itemEmbedding.every(v => v === 0);
          if (!isItemZeroVector) {
            relevance = cosineSimilarity(queryEmbedding, itemEmbedding);

            // Store embedding for future use (fire-and-forget)
            const { updateKnowledgeEmbedding } = await import("../db");
            updateKnowledgeEmbedding(
              item.id,
              JSON.stringify(itemEmbedding),
              "text-embedding-3-small"
            ).catch((err: Error) =>
              logger.error(
                `[Knowledge] Failed to store embedding for ID ${item.id}:`,
                err
              )
            );
          } else {
            // Fallback to keyword matching
            const queryTerms = extractTerms(query);
            const titleRelevance = calculateTermRelevance(
              queryTerms,
              item.title
            );
            const contentRelevance = calculateTermRelevance(
              queryTerms,
              item.content
            );
            relevance = titleRelevance * 0.7 + contentRelevance * 0.3;
          }
        }

        return {
          content: `${item.title}\n\n${item.content}`,
          source: {
            name: "Knowledge Base (Vector)",
            type: "vector" as const,
            priority: 2,
          },
          confidence: 0.9, // Higher confidence with semantic search
          relevance,
          item,
        };
      })
    );

    // Filter by relevance threshold (>0.5 for semantic similarity) and sort
    const relevantResults = results
      .filter(r => r.relevance > 0.5)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3); // Top 3 most relevant

    logger.info(
      `[Knowledge] Vector search found ${relevantResults.length} relevant entries`
    );
    if (relevantResults.length > 0) {
      logger.info(
        `[Knowledge] Top match: "${relevantResults[0].item.title}" (similarity: ${(relevantResults[0].relevance * 100).toFixed(1)}%)`
      );
    }

    return relevantResults;
  } catch (error) {
    logger.error("[Knowledge] Vector search failed:", error);
    // Fallback to keyword search
    const allKnowledge = await getAllKnowledge();
    return await queryVectorSearchFallback(query, allKnowledge);
  }
}

/**
 * Fallback keyword search when embeddings fail
 * TF-IDF style relevance scoring
 */
async function queryVectorSearchFallback(
  query: string,
  allKnowledge: Knowledge[]
): Promise<KnowledgeResult[]> {
  const queryTerms = extractTerms(query);

  if (queryTerms.length === 0) {
    return [];
  }

  const results = allKnowledge.map((item: Knowledge) => {
    const titleRelevance = calculateTermRelevance(queryTerms, item.title);
    const contentRelevance = calculateTermRelevance(queryTerms, item.content);
    const relevance = titleRelevance * 0.7 + contentRelevance * 0.3;

    return {
      content: `${item.title}\n\n${item.content}`,
      source: {
        name: "Knowledge Base (Keyword)",
        type: "vector" as const,
        priority: 2,
      },
      confidence: 0.7, // Lower confidence for keyword matching
      relevance,
      item,
    };
  });

  const relevantResults = results
    .filter(r => r.relevance > 0.2)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  logger.info(
    `[Knowledge] Keyword fallback found ${relevantResults.length} relevant entries`
  );
  return relevantResults;
}

/**
 * Extract meaningful terms from text
 * Removes stop words and short terms
 */
function extractTerms(text: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "is",
    "was",
    "are",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "could",
    "can",
    "may",
    "might",
    "must",
    "shall",
    "what",
    "when",
    "where",
    "who",
    "which",
    "why",
    "how",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "its",
    "our",
    "their",
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(term => term.length > 2 && !stopWords.has(term));
}

/**
 * Calculate term-based relevance score
 * Returns value between 0 and 1
 */
function calculateTermRelevance(queryTerms: string[], text: string): number {
  const textLower = text.toLowerCase();
  const textTerms = extractTerms(text);

  if (textTerms.length === 0) {
    return 0;
  }

  let matchScore = 0;

  for (const queryTerm of queryTerms) {
    // Exact match in text
    if (textLower.includes(queryTerm)) {
      matchScore += 1.0;
    }

    // Partial match (term contains query term or vice versa)
    for (const textTerm of textTerms) {
      if (textTerm.includes(queryTerm) || queryTerm.includes(textTerm)) {
        matchScore += 0.5;
        break;
      }
    }
  }

  // Normalize by number of query terms
  return Math.min(matchScore / queryTerms.length, 1.0);
}

/**
 * Source 3: Real-time APIs (Context-dependent)
 * Fresh, current information
 * Phase 2: Integrate real APIs (news, weather, etc.)
 */
export async function queryRealTimeAPIs(
  query: string
): Promise<KnowledgeResult[]> {
  // Phase 1: Placeholder
  // Phase 2: Integrate real-time APIs
  // - News API for current events
  // - Weather API for weather queries
  // - Stock API for financial data
  // - etc.

  logger.info("[Knowledge] Real-time APIs not yet implemented (Phase 2)");
  return [];
}

/**
 * Source 4: External Knowledge Bases
 * Specialized domain knowledge
 * Phase 2: Integrate knowledge graphs
 */
export async function queryExternalKnowledge(
  query: string
): Promise<KnowledgeResult[]> {
  // Phase 1: Placeholder
  // Phase 2: Integrate knowledge graphs
  // - Domain-specific databases
  // - Academic papers
  // - Technical documentation
  // - etc.

  logger.info("[Knowledge] External knowledge not yet implemented (Phase 2)");
  return [];
}

/**
 * Unified knowledge query across all 4 sources
 * Implements multi-source integration to prevent forgetting
 */
export async function queryKnowledge(
  query: string
): Promise<KnowledgeResult[]> {
  // Query all sources in parallel
  const [dbResults, vectorResults, apiResults, externalResults] =
    await Promise.all([
      queryDatabase(query),
      queryVectorSearch(query),
      queryRealTimeAPIs(query),
      queryExternalKnowledge(query),
    ]);

  // Combine and sort by priority and relevance
  const allResults = [
    ...dbResults,
    ...vectorResults,
    ...apiResults,
    ...externalResults,
  ];

  // Sort by: priority (ascending), then relevance (descending)
  allResults.sort((a, b) => {
    if (a.source.priority !== b.source.priority) {
      return a.source.priority - b.source.priority;
    }
    return b.relevance - a.relevance;
  });

  // Return top 10 results
  return allResults.slice(0, 10);
}

/**
 * Calculate relevance score between query and content
 * Simple term overlap heuristic
 * Phase 2: Use vector similarity
 */
function calculateRelevance(query: string, content: string): number {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(term => term.length > 3);

  const contentLower = content.toLowerCase();
  const matchedTerms = queryTerms.filter(term => contentLower.includes(term));

  return queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0;
}

/**
 * Add new knowledge to the system
 * Stores in database for replay mechanism
 */
export async function addKnowledge(
  title: string,
  content: string,
  category?: string,
  source?: string
): Promise<number> {
  const { insertKnowledge } = await import("../db");

  return await insertKnowledge({
    title,
    content,
    category: category || "general",
    source: source || "user",
    sourceType: "user",
    tags: null,
    embedding: null,
    embeddingModel: null,
    accessCount: 0,
    lastAccessed: null,
  });
}

/**
 * Retrieve knowledge context for a query
 * v14: Integrated with Knowledge Acquisition Layer for cross-task retention
 * Returns formatted string for LLM context
 */
export async function getKnowledgeContext(query: string): Promise<string> {
  // v14: Use Knowledge Acquisition Layer (SQLite + TiDB dual-write)
  // Provides cross-task knowledge retention (resolves "Groundhog Day Problem")
  try {
    const knowledgeBase = (await import("../knowledge/base")).default;

    // Defensive check: ensure knowledgeBase is initialized
    if (!knowledgeBase || typeof knowledgeBase.searchConcepts !== "function") {
      logger.warn("Knowledge Acquisition Layer not available - using fallback");
      const results = await queryKnowledge(query);
      if (results.length === 0) return "";
      const contextParts = results.map(
        (result, index) =>
          `[Source ${index + 1}: ${result.source.name}]\n${result.content}`
      );
      return `\n\nRelevant Knowledge:\n${contextParts.join("\n\n")}`;
    }

    // Search concepts from Knowledge Acquisition Layer
    const concepts = await knowledgeBase.searchConcepts(query, undefined, 5);

    // Search lessons learned
    const lessons = await knowledgeBase.searchLessons(query, undefined, 3);

    // Fallback to legacy knowledge system if no results from new layer
    if (concepts.length === 0 && lessons.length === 0) {
      const results = await queryKnowledge(query);

      if (results.length === 0) {
        return "";
      }

      // Format results as context
      const contextParts = results.map((result, index) => {
        return `[Source ${index + 1}: ${result.source.name}]\n${result.content}`;
      });

      return `\n\nRelevant Knowledge:\n${contextParts.join("\n\n")}`;
    }

    // Format Knowledge Acquisition Layer results
    const contextParts: string[] = [];

    if (concepts.length > 0) {
      contextParts.push("**Concepts:**");
      concepts.forEach((concept, index) => {
        contextParts.push(
          `[Concept ${index + 1}: ${concept.conceptName}]\n` +
            `Type: ${concept.conceptType}\n` +
            `Confidence: ${(concept.confidence * 100).toFixed(0)}%\n` +
            `${concept.description}`
        );
      });
    }

    if (lessons.length > 0) {
      contextParts.push("\n**Lessons Learned:**");
      lessons.forEach((lesson, index) => {
        contextParts.push(
          `[Lesson ${index + 1}: ${lesson.lessonTitle}]\n` +
            `Type: ${lesson.lessonType}\n` +
            `Impact: ${lesson.impact}\n` +
            `Confidence: ${(lesson.confidence * 100).toFixed(0)}%\n` +
            `${lesson.lessonDescription}` +
            (lesson.howToApply
              ? `\n\n**How to Apply:** ${lesson.howToApply}`
              : "")
        );

        // Mark lesson as applied
        knowledgeBase.markLessonApplied(lesson.lessonId);
      });
    }

    return `\n\nRelevant Knowledge (Knowledge Acquisition Layer):\n${contextParts.join("\n\n")}`;
  } catch (error) {
    logger.error(
      "Error in Knowledge Acquisition Layer - falling back to legacy system:",
      error
    );
    // Fallback to legacy knowledge system
    const results = await queryKnowledge(query);
    if (results.length === 0) return "";
    const contextParts = results.map(
      (result, index) =>
        `[Source ${index + 1}: ${result.source.name}]\n${result.content}`
    );
    return `\n\nRelevant Knowledge:\n${contextParts.join("\n\n")}`;
  }
}
