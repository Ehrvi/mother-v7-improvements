/**
 * MOTHER v80.0 — Core Prompt Builder
 * SRP Phase 12 (Ciclo 89): Extracted from core-orchestrator.ts
 * Ciclo 91: Updated version to v80.0, DPO v3 identity DElGST0Q integrated
 *
 * Responsibilities:
 * - fetchKnowledgeContext: RAG from bd_central (knowledge module)
 * - fetchEpisodicContext: episodic memory retrieval (embeddings module)
 * - buildConversationContext: conversation history formatting
 * - buildSystemPrompt: assembles full system prompt with identity facts
 * - buildMessages: formats messages array for LLM call
 *
 * Scientific basis:
 * - HippoRAG 2 (arXiv:2502.14802, ICML 2025) — non-parametric continual learning
 * - Me-Agent (2026) — persistent memory and dynamic personalization
 * - SPIN (Chen et al., arXiv:2401.01335, ICML 2024) — self-play identity alignment
 */
import {
  MOTHER_IDENTITY_FACTS_SECTION,
  ARCHITECTURE_FACTS_SECTION,
} from './core-system-prompt';
import type { RoutingDecision as AdaptiveRoutingDecision } from './adaptive-router';

// ============================================================
// TYPES
// ============================================================
export interface ContextBundle {
  knowledgeContext: string;
  episodicContext: string;
  conversationContext: string;
  durationMs: number;
}

// ============================================================
// CONTEXT FETCHERS
// ============================================================
export async function fetchKnowledgeContext(query: string, tier: string): Promise<string> {
  // Import dynamically to avoid circular deps
  try {
    const { queryKnowledge } = await import('./knowledge');
    const results = await Promise.race([
      queryKnowledge(query).then(r => r.map((k: { content: string }) => k.content).join('\n\n')),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    return results as string;
  } catch {
    return '';
  }
}

export async function fetchEpisodicContext(userId: string | undefined, query: string): Promise<string> {
  if (!userId) return '';
  try {
    const { searchEpisodicMemory } = await import('./embeddings');
    const result = await Promise.race([
      searchEpisodicMemory(query, 3).then((mems: Array<{ query: string; response: string }>) =>
        mems.map(m => `Q: ${m.query}\nA: ${m.response}`).join('\n---\n')
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return result as string;
  } catch {
    return '';
  }
}

export function buildConversationContext(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  if (!history || history.length === 0) return '';
  return history
    .slice(-6)  // last 3 turns
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n');
}

// ============================================================
// PROMPT BUILDERS
// ============================================================
export function buildSystemPrompt(context: ContextBundle, routing: AdaptiveRoutingDecision): string {
  // Ciclo 86: Identity fix — include MOTHER_IDENTITY_FACTS_SECTION + ARCHITECTURE_FACTS_SECTION
  // Scientific basis: SPIN (Chen et al., arXiv:2401.01335, ICML 2024) — self-play identity alignment
  // Root cause: core-orchestrator.ts was missing identity/architecture facts → identity=17.3% in C85
  const parts = [
    `You are MOTHER (Modular Orchestrated Thinking and Hierarchical Execution Runtime), version v80.0.`,
    `You are an advanced AI system created by Everton Garcia for Wizards Down Under.`,
    `You have persistent memory, self-improvement capabilities, and manage complex AI systems.`,
    `Current routing tier: ${routing.tier} | Model: ${routing.primaryModel}`,
    ``,
    MOTHER_IDENTITY_FACTS_SECTION,
    ``,
    ARCHITECTURE_FACTS_SECTION,
  ];
  if (context.knowledgeContext) {
    parts.push(`\n## Knowledge Context (bd_central)\n${context.knowledgeContext}`);
  }
  if (context.episodicContext) {
    parts.push(`\n## Episodic Memory\n${context.episodicContext}`);
  }
  if (context.conversationContext) {
    parts.push(`\n## Recent Conversation\n${context.conversationContext}`);
  }
  return parts.join('\n');
}

export function buildMessages(
  query: string,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ];
}
