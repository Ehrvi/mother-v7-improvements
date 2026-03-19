/**
 * MOTHER v56.0 - Per-User Personalized Memory Module
 * Implements Requirement #4: Each user gets unique experience with personalized memory
 *
 * Scientific basis:
 * - MemGPT (Packer et al., 2023, arXiv:2310.08560): Hierarchical memory management
 *   for LLMs with paging between in-context and external storage
 * - Episodic Memory in AI (Tulving, 1972; adapted for LLMs): User-specific episodic
 *   memory enables personalized, context-aware interactions
 * - Personalized RAG (Salemi & Zamani, 2024): User-specific retrieval improves
 *   response relevance by 23% on average
 *
 * Architecture:
 * - Each user has isolated memory space in `user_memory` table
 * - Memories are embedded for semantic retrieval
 * - Importance scoring determines memory retention priority
 * - Retrieval count tracks frequently accessed memories
 */

import { getDb, rawQuery } from '../db';
import { getEmbedding, cosineSimilarity } from './embeddings';
import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';
const log = createLogger('USER_MEMORY');


export interface UserMemory {
  id: number;
  userId: number;
  content: string;
  embedding?: string;
  keywords?: string;
  context: string;
  category: string;
  tags?: string;
  importanceScore: number;
  retrievalCount: number;
  lastAccessed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMemoryInput {
  userId: number;
  content: string;
  context?: string;
  category?: string;
  tags?: string[];
  importanceScore?: number;
}

export interface MemorySearchResult {
  memory: UserMemory;
  similarity: number;
}

/**
 * Store a new memory for a specific user
 * v56.0: Req #4 — personalized memory per user
 */
export async function storeUserMemory(input: UserMemoryInput): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) {
      log.warn('[UserMemory] DB not available');
      return null;
    }

    // Generate embedding for semantic retrieval
    let embedding: string | null = null;
    try {
      const embeddingVector = await getEmbedding(input.content);
      embedding = JSON.stringify(embeddingVector);
    } catch (e) {
      log.warn('[UserMemory] Embedding generation failed (non-blocking):', e);
    }

    // Extract keywords (simple approach)
    const keywords = extractKeywords(input.content);

    const result = await rawQuery(
      `INSERT INTO user_memory (user_id, content, embedding, keywords, context, category, tags, importance_score, retrieval_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      [
        input.userId,
        input.content,
        embedding,
        keywords.join(','),
        input.context || 'General',
        input.category || 'Uncategorized',
        input.tags ? JSON.stringify(input.tags) : null,
        input.importanceScore ?? 0.5,
      ]
    );

    const insertId = result[0]?.insertId;
    log.info(`[UserMemory] ✅ Stored memory ID ${insertId} for user ${input.userId}`);
    return insertId || null;
  } catch (error) {
    log.error('[UserMemory] Failed to store memory:', error);
    return null;
  }
}

/**
 * Retrieve relevant memories for a user based on semantic similarity
 * v56.0: Req #4 — personalized memory retrieval
 */
export async function retrieveUserMemories(
  userId: number,
  query: string,
  limit = 5,
  minSimilarity = 0.6
): Promise<MemorySearchResult[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    // Get all memories for this user
    const [rows] = await rawQuery(
      `SELECT id, user_id, content, embedding, keywords, context, category, tags,
              importance_score, retrieval_count, last_accessed, created_at, updated_at
       FROM user_memory
       WHERE user_id = ?
       ORDER BY importance_score DESC, retrieval_count DESC
       LIMIT 100`,
      [userId]
    );

    if (!rows || rows.length === 0) return [];

    // Generate query embedding
    const queryEmbedding = await getEmbedding(query);

    // Score memories by semantic similarity + importance
    const scored: MemorySearchResult[] = [];
    for (const row of rows) {
      if (!row.embedding) continue;
      
      try {
        const memEmbedding = JSON.parse(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, memEmbedding);
        
        // Combined score: 70% semantic similarity + 30% importance
        const combinedScore = (similarity * 0.7) + (row.importance_score * 0.3);
        
        if (similarity >= minSimilarity) {
          scored.push({
            memory: {
              id: row.id,
              userId: row.user_id,
              content: row.content,
              embedding: row.embedding,
              keywords: row.keywords,
              context: row.context,
              category: row.category,
              tags: row.tags,
              importanceScore: row.importance_score,
              retrievalCount: row.retrieval_count,
              lastAccessed: row.last_accessed,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
            similarity: combinedScore,
          });
        }
      } catch (e) {
        // Skip memories with invalid embeddings
      }
    }

    // Sort by combined score and return top results
    scored.sort((a, b) => b.similarity - a.similarity);
    const topResults = scored.slice(0, limit);

    // Update retrieval count and last_accessed for retrieved memories
    if (topResults.length > 0) {
      const ids = topResults.map(r => r.memory.id);
      await rawQuery(
        `UPDATE user_memory SET retrieval_count = retrieval_count + 1, last_accessed = NOW()
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    return topResults;
  } catch (error) {
    log.error('[UserMemory] Failed to retrieve memories:', error);
    return [];
  }
}

/**
 * Get user memory context for injection into system prompt
 * Returns formatted string of relevant memories
 */
export async function getUserMemoryContext(
  userId: number,
  query: string
): Promise<string> {
  const memories = await retrieveUserMemories(userId, query, 5, 0.55);
  
  if (memories.length === 0) return '';

  const memoryLines = memories.map(m => 
    `- [${m.memory.category}] ${m.memory.content.substring(0, 200)}`
  );

  return `\n### 🧠 Your Personal Memory (${memories.length} relevant entries)\n${memoryLines.join('\n')}`;
}

/**
 * Automatically extract and store memories from a conversation
 * Called after each interaction to build user's memory over time
 * v56.0: Req #3 (gradual learning) + Req #4 (personalized memory)
 */
export async function extractAndStoreMemories(
  userId: number,
  query: string,
  response: string,
  qualityScore: number
): Promise<void> {
  // Only store memories from decent quality interactions (≥60%)
  if (qualityScore < 60) return;

  try {
    // Extract memorable facts from the interaction
    const memorableContent = extractMemorableContent(query, response);
    
    for (const content of memorableContent) {
      // Check if this is already stored (simple text similarity)
      const existing = await retrieveUserMemories(userId, content, 1, 0.9);
      if (existing.length > 0) continue; // Skip duplicates
      
      await storeUserMemory({
        userId,
        content,
        context: `From query: ${query.substring(0, 100)}`,
        category: inferCategory(content),
        importanceScore: qualityScore / 100,
      });
    }
  } catch (error) {
    log.error('[UserMemory] Auto-extraction failed (non-blocking):', error);
  }
}

/**
 * Extract memorable content from a query-response pair
 */
function extractMemorableContent(query: string, response: string): string[] {
  const memorable: string[] = [];
  
  // Extract user preferences/interests from query
  const queryInsights = extractQueryInsights(query);
  memorable.push(...queryInsights);
  
  // Extract key facts from response
  const responseInsights = extractResponseInsights(response);
  memorable.push(...responseInsights);
  
  return memorable.filter(m => m.length > 30 && m.length < 500);
}

function extractQueryInsights(query: string): string[] {
  const insights: string[] = [];
  
  // Detect user interests/preferences
  const interestPatterns = [
    /(?:I (?:am|work|study|research|like|prefer|use|need|want))[^.!?]+/gi,
    /(?:my (?:project|company|team|goal|work))[^.!?]+/gi,
    /(?:we (?:are|use|need|want|have))[^.!?]+/gi,
  ];
  
  for (const pattern of interestPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      insights.push(...matches.map(m => m.trim()));
    }
  }
  
  return insights;
}

function extractResponseInsights(response: string): string[] {
  // Extract sentences with high information density
  return response
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 50 && s.length < 300)
    .filter(s => {
      const keywords = ['is', 'are', 'means', 'defined', 'refers', 'represents', 'consists'];
      return keywords.some(k => s.toLowerCase().includes(k));
    })
    .slice(0, 3); // Max 3 insights per response
}

function inferCategory(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes('code') || lower.includes('programming') || lower.includes('software')) return 'Technology';
  if (lower.includes('research') || lower.includes('paper') || lower.includes('study')) return 'Research';
  if (lower.includes('company') || lower.includes('business') || lower.includes('project')) return 'Work';
  if (lower.includes('prefer') || lower.includes('like') || lower.includes('want')) return 'Preferences';
  return 'General';
}

function extractKeywords(content: string): string[] {
  // Simple keyword extraction: remove stopwords and take most frequent
  const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'this', 'that', 'it', 'its', 'as', 'if', 'then', 'than']);
  
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 10);
}

/**
 * Get memory statistics for a user
 */
export async function getUserMemoryStats(userId: number): Promise<{
  totalMemories: number;
  categories: Record<string, number>;
  mostAccessed: string[];
}> {
  try {
    const db = await getDb();
    if (!db) return { totalMemories: 0, categories: {}, mostAccessed: [] };

    const [countResult] = await rawQuery(
      'SELECT COUNT(*) as total FROM user_memory WHERE user_id = ?',
      [userId]
    );
    const total = countResult[0]?.total || 0;

    const [categoryResult] = await rawQuery(
      'SELECT category, COUNT(*) as cnt FROM user_memory WHERE user_id = ? GROUP BY category',
      [userId]
    );
    const categories: Record<string, number> = {};
    for (const row of (categoryResult || [])) {
      categories[row.category] = row.cnt;
    }

    const [topResult] = await rawQuery(
      'SELECT content FROM user_memory WHERE user_id = ? ORDER BY retrieval_count DESC LIMIT 5',
      [userId]
    );
    const mostAccessed = (topResult || []).map((r: any) => r.content.substring(0, 100));

    return { totalMemories: total, categories, mostAccessed };
  } catch (error) {
    log.error('[UserMemory] Stats failed:', error);
    return { totalMemories: 0, categories: {}, mostAccessed: [] };
  }
}

// ============================================================
// v82.0 SOTA UPGRADES
// ============================================================

/**
 * LLM-based memory extraction (replaces regex heuristics).
 * Uses GPT-4o-mini with structured output to identify memorable content.
 *
 * Scientific basis:
 * - MemoryOS (Kang et al., 2025, arXiv:2506.06326): +49% F1 with hierarchical memory
 * - A-MEM (Xu et al., 2025, arXiv:2502.12110): LLM extracts semantic metadata
 * - MemGPT (Packer et al., 2023): LLMs as memory managers
 *
 * Cost: ~$0.001 per interaction (500 input + 100 output tokens on gpt-4o-mini)
 */
export async function extractMemoriesWithLLM(
  userId: number,
  query: string,
  response: string,
  qualityScore: number
): Promise<void> {
  // Only extract from quality interactions
  if (qualityScore < 60) return;

  try {
    const prompt = `Analyze this interaction and extract important MEMORIES about the USER.
Types: preference, fact, skill, context, goal, interest
Return ONLY a JSON array (no text around it):
[{"content": "what to remember", "category": "type", "importance": 0.0-1.0}]
If nothing memorable, return: []

User query: ${query.slice(0, 400)}
Response: ${response.slice(0, 400)}`;

    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
    });

    const content = typeof result === 'string' ? result :
      (typeof result?.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content : '');
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const memories = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(memories)) return;

    for (const mem of memories) {
      if (!mem.content || mem.content.length < 10) continue;

      // Dedup check
      const existing = await retrieveUserMemories(userId, mem.content, 1, 0.85);
      if (existing.length > 0) continue;

      await storeUserMemory({
        userId,
        content: mem.content,
        context: `Extracted from conversation`,
        category: mem.category || 'General',
        importanceScore: mem.importance || 0.5,
      });
    }
  } catch (error) {
    log.error('[UserMemory] LLM extraction failed (non-blocking):', error);
    // Fall back to regex extraction
    await extractAndStoreMemories(userId, query, response, qualityScore);
  }
}

/**
 * Consolidate user's top memories into a concise profile.
 * Returns a natural language summary of the user's preferences, interests, and context.
 *
 * Scientific basis:
 * - MemoryOS (Kang et al., 2025): Long-term Personal Memory (LPM) = consolidated profile
 * - Generative Agents (Park et al., 2023): Higher-order reflection from experience
 */
export async function consolidateUserProfile(userId: number): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return '';

    // Get top 20 most accessed/important memories
    const [rows] = await rawQuery(
      `SELECT content, category FROM user_memory
       WHERE user_id = ?
       ORDER BY retrieval_count DESC, importance_score DESC
       LIMIT 20`,
      [userId]
    );

    if (!rows || rows.length === 0) return '';

    const memoryList = rows.map((m: any) => `[${m.category}] ${m.content}`).join('\n');

    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Synthesize a user profile from these memories (max 150 words):
${memoryList}

Return a concise paragraph describing the user's interests, preferences, skills, and context.`,
      }],
      maxTokens: 200,
    });

    const profile = typeof result === 'string' ? result :
      (typeof result?.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content : '');
    return profile.trim();
  } catch (error) {
    log.error('[UserMemory] Profile consolidation failed:', error);
    return '';
  }
}

/**
 * Apply temporal decay to unaccessed memories.
 * Reduces importance of memories not accessed in 30+ days.
 *
 * Scientific basis:
 * - ALMA (Xiong et al., 2026, arXiv:2602.07755): Meta-learned memory designs
 *   include active forgetting mechanisms
 * - SleepGate (Xie, 2026, arXiv:2603.14517): Sleep-inspired consolidation
 *   reduces interference from O(n) to O(log n)
 * - Ebbinghaus Forgetting Curve (1885): Memory strength decays exponentially
 */
export async function applyTemporalDecay(userId: number): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    // Decay importance by 10% for memories not accessed in 30+ days
    const [result] = await rawQuery(
      `UPDATE user_memory
       SET importance_score = importance_score * 0.9
       WHERE user_id = ?
       AND (last_accessed IS NULL OR last_accessed < NOW() - INTERVAL 30 DAY)
       AND importance_score > 0.1`,
      [userId]
    );

    const affected = result?.affectedRows || 0;
    if (affected > 0) {
      log.info(`[UserMemory] Temporal decay applied: ${affected} memories for user ${userId}`);
    }
    return affected;
  } catch (error) {
    log.error('[UserMemory] Temporal decay failed:', error);
    return 0;
  }
}

