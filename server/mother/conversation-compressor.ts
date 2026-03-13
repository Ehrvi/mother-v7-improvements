/**
 * Conversation Compressor — Intelligent compression of long conversation histories
 * Scientific basis: MemGPT (Packer et al., arXiv:2310.08560, 2023)
 * MANUS approach: Compress older events into summaries, keep recent messages intact
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';

const log = createLogger('COMPRESSOR');

export interface CompressedHistory {
  summary: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  originalCount: number;
  compressedCount: number;
  compressionTimeMs: number;
}

const KEEP_RECENT = 6; // Keep last 6 messages (3 turns) intact
const COMPRESSION_THRESHOLD = 10; // Only compress if >10 messages

/**
 * Compress conversation history for efficient context management.
 * Keeps recent messages intact, summarizes older ones.
 */
export async function compressConversation(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<CompressedHistory> {
  const start = Date.now();

  if (messages.length <= COMPRESSION_THRESHOLD) {
    return {
      summary: '',
      recentMessages: messages,
      originalCount: messages.length,
      compressedCount: messages.length,
      compressionTimeMs: Date.now() - start,
    };
  }

  const recentMessages = messages.slice(-KEEP_RECENT);
  const olderMessages = messages.slice(0, -KEEP_RECENT);

  try {
    const conversationText = olderMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 300)}`)
      .join('\n\n');

    const result = await invokeLLM({
      model: 'deepseek-chat',
      provider: 'deepseek',
      messages: [{
        role: 'user',
        content: `Summarize this conversation history into a concise summary (max 500 words). Preserve: key topics discussed, decisions made, user preferences, and any unresolved questions. Output ONLY the summary, no preamble.

Conversation (${olderMessages.length} messages):
${conversationText.slice(0, 4000)}`,
      }],
      temperature: 0.2,
      max_tokens: 600,
    });

    const summary = result.choices?.[0]?.message?.content || '';

    log.info(`[Compressor] Compressed ${olderMessages.length} messages into ${summary.length} char summary`);

    return {
      summary: summary ? `## Previous Conversation Summary\n${summary}` : '',
      recentMessages,
      originalCount: messages.length,
      compressedCount: recentMessages.length,
      compressionTimeMs: Date.now() - start,
    };
  } catch (err) {
    log.warn('[Compressor] Compression failed, truncating:', (err as Error).message);
    // Fallback: just keep recent messages without summary
    return {
      summary: '',
      recentMessages,
      originalCount: messages.length,
      compressedCount: recentMessages.length,
      compressionTimeMs: Date.now() - start,
    };
  }
}

/**
 * Format compressed history for injection into LLM messages.
 */
export function formatCompressedHistory(
  compressed: CompressedHistory,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (compressed.summary) {
    // Inject summary as a "system context" via assistant message
    messages.push({
      role: 'assistant',
      content: compressed.summary,
    });
  }

  messages.push(...compressed.recentMessages);

  return messages;
}
