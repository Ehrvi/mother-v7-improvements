/**
 * Context Relevance Scorer — Only inject relevant context into prompts
 * Scientific basis: Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024)
 * Problem: MOTHER injects ALL context regardless of relevance, bloating prompts
 * Solution: Score each context source and only include if relevance > threshold
 */

import { createLogger } from '../_core/logger';

const log = createLogger('CTX_SCORER');

export interface ScoredContext {
  source: string;
  content: string;
  relevanceScore: number;
  included: boolean;
  tokenEstimate: number;
}

export interface ContextScoringResult {
  scoredContexts: ScoredContext[];
  includedContexts: ScoredContext[];
  totalTokensIncluded: number;
  totalTokensExcluded: number;
  contextReductionPercent: number;
}

const RELEVANCE_THRESHOLD = 0.4;
const MAX_CONTEXT_TOKENS = 8000;

// Source priority: higher priority = included first when token budget is tight
const SOURCE_PRIORITY: Record<string, number> = {
  user_memory: 1,
  episodic: 2,
  crag: 3,
  knowledge_graph: 4,
  omniscient: 5,
  research: 6,
  proactive: 7,
};

/**
 * Score and filter context sources by relevance to the query.
 */
export function scoreAndFilterContexts(
  query: string,
  contexts: Array<{ source: string; content: string }>,
): ContextScoringResult {
  const queryTerms = extractKeyTerms(query);

  const scored: ScoredContext[] = contexts.map(ctx => {
    const relevance = computeRelevance(queryTerms, ctx.content);
    const tokenEst = Math.ceil(ctx.content.length / 4);
    return {
      source: ctx.source,
      content: ctx.content,
      relevanceScore: relevance,
      included: false,
      tokenEstimate: tokenEst,
    };
  });

  // Sort by priority first, then by relevance
  scored.sort((a, b) => {
    const aPri = SOURCE_PRIORITY[a.source] || 99;
    const bPri = SOURCE_PRIORITY[b.source] || 99;
    if (aPri !== bPri) return aPri - bPri;
    return b.relevanceScore - a.relevanceScore;
  });

  // Include contexts above threshold, respecting token budget
  let tokensUsed = 0;
  for (const ctx of scored) {
    if (ctx.relevanceScore >= RELEVANCE_THRESHOLD && tokensUsed + ctx.tokenEstimate <= MAX_CONTEXT_TOKENS) {
      ctx.included = true;
      tokensUsed += ctx.tokenEstimate;
    }
  }

  const included = scored.filter(c => c.included);
  const excluded = scored.filter(c => !c.included);
  const totalTokens = scored.reduce((sum, c) => sum + c.tokenEstimate, 0);

  if (excluded.length > 0) {
    log.info(`[CtxScorer] ${included.length}/${scored.length} contexts included (${tokensUsed} tokens). Excluded: ${excluded.map(c => `${c.source}(${c.relevanceScore.toFixed(2)})`).join(', ')}`);
  }

  return {
    scoredContexts: scored,
    includedContexts: included,
    totalTokensIncluded: tokensUsed,
    totalTokensExcluded: totalTokens - tokensUsed,
    contextReductionPercent: totalTokens > 0 ? Math.round(((totalTokens - tokensUsed) / totalTokens) * 100) : 0,
  };
}

/**
 * Format included contexts for prompt injection.
 */
export function formatScoredContexts(result: ContextScoringResult): string {
  if (result.includedContexts.length === 0) return '';
  return result.includedContexts.map(ctx => ctx.content).join('\n\n');
}

function extractKeyTerms(query: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'em', 'no', 'na',
    'para', 'por', 'com', 'que', 'se', 'como', 'mais', 'ou', 'e',
    'what', 'how', 'why', 'when', 'where', 'who', 'which',
    'me', 'my', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those',
  ]);

  return query
    .toLowerCase()
    .replace(/[^\w\sáàâãéêíóôõúç]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function computeRelevance(queryTerms: string[], content: string): number {
  if (!content || content.trim().length === 0) return 0;
  if (queryTerms.length === 0) return 0.5;

  const contentLower = content.toLowerCase();
  let matchCount = 0;
  let weightedScore = 0;

  for (const term of queryTerms) {
    if (contentLower.includes(term)) {
      matchCount++;
      const occurrences = (contentLower.match(
        new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      ) || []).length;
      weightedScore += Math.min(occurrences, 5) / 5;
    }
  }

  const termCoverage = matchCount / queryTerms.length;
  const normalizedTF = weightedScore / queryTerms.length;
  return Math.min(1, termCoverage * 0.6 + normalizedTF * 0.4);
}
