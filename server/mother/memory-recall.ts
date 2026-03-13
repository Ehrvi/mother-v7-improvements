/**
 * Proactive Memory Recall — Detects implicit references to past conversations
 * and retrieves relevant episodic memories automatically.
 * Scientific basis: MemGPT (Packer et al., arXiv:2310.08560, 2023)
 */

import { searchEpisodicMemory } from './embeddings';
import { createLogger } from '../_core/logger';

const log = createLogger('MEMORY_RECALL');

export interface MemoryRecallResult {
  triggered: boolean;
  reason: string;
  memories: Array<{
    query: string;
    response: string;
    similarity: number;
    qualityScore: string | null;
  }>;
  contextSnippet: string;
  recallTimeMs: number;
}

// Patterns that indicate the user is referencing a past conversation
const REFERENCE_PATTERNS = [
  /\b(?:aquele|aquela|aquilo)\s+(?:assunto|tema|tópico|conversa|discussão)\b/i,
  /\b(?:como\s+(?:falamos|conversamos|discutimos|mencionei|disse))\b/i,
  /\b(?:lembra|lembre|remember|recall)\b/i,
  /\b(?:continue|continua|prossiga|retome)\s+(?:de\s+onde|from\s+where)\b/i,
  /\b(?:sobre\s+o\s+que\s+(?:falamos|conversamos))\b/i,
  /\b(?:you\s+(?:said|mentioned|told\s+me|explained))\b/i,
  /\b(?:você\s+(?:disse|mencionou|explicou|falou))\b/i,
  /\b(?:last\s+time|da\s+última\s+vez|anteriormente|previously)\b/i,
  /\b(?:we\s+(?:talked|discussed|spoke)\s+about)\b/i,
  /\b(?:(?:na|naquela)\s+(?:outra|última)\s+(?:conversa|sessão))\b/i,
];

/**
 * Check if the query references past conversations and recall relevant memories.
 */
export async function proactiveRecall(
  query: string,
  userId?: number,
): Promise<MemoryRecallResult> {
  const start = Date.now();

  // Check if query references past conversations
  const matchedPattern = REFERENCE_PATTERNS.find(p => p.test(query));

  if (!matchedPattern) {
    return {
      triggered: false,
      reason: 'no_reference_detected',
      memories: [],
      contextSnippet: '',
      recallTimeMs: Date.now() - start,
    };
  }

  log.info(`[MemoryRecall] Reference pattern detected in query: "${query.slice(0, 80)}..."`);

  try {
    // Search episodic memory with lower threshold for broader recall
    const memories = await searchEpisodicMemory(query, 5, 0.60);

    if (memories.length === 0) {
      return {
        triggered: true,
        reason: 'reference_detected_but_no_memories_found',
        memories: [],
        contextSnippet: '',
        recallTimeMs: Date.now() - start,
      };
    }

    const formattedMemories = memories.map(m => ({
      query: m.query,
      response: m.response,
      similarity: m.similarity,
      qualityScore: m.qualityScore,
    }));

    const contextSnippet = `\n\n## Previous Conversations (Proactive Recall)\n` +
      memories.map((m, i) =>
        `[Recall ${i + 1} | Similarity: ${m.similarity.toFixed(3)}]\n` +
        `User asked: ${m.query.slice(0, 200)}\n` +
        `You answered: ${m.response.slice(0, 400)}`
      ).join('\n\n');

    log.info(`[MemoryRecall] Recalled ${memories.length} relevant memories (top similarity: ${memories[0].similarity.toFixed(3)})`);

    return {
      triggered: true,
      reason: 'reference_detected_memories_found',
      memories: formattedMemories,
      contextSnippet,
      recallTimeMs: Date.now() - start,
    };
  } catch (err) {
    log.warn('[MemoryRecall] Failed:', (err as Error).message);
    return {
      triggered: true,
      reason: 'reference_detected_recall_failed',
      memories: [],
      contextSnippet: '',
      recallTimeMs: Date.now() - start,
    };
  }
}
