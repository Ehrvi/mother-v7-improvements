/**
 * MOTHER v75.6 — Proactive Knowledge Retrieval
 *
 * Implements proactive, criterion-based retrieval BEFORE LLM generation.
 * Solves the "passive RAG" problem where MOTHER only retrieves when explicitly asked.
 *
 * Scientific basis:
 * - FLARE (Jiang et al., arXiv:2305.06983, EMNLP 2023):
 *   "Most existing RAG employ a retrieve-and-generate setup that only retrieves once.
 *   This is limiting for long-form generation where continually gathering information is essential."
 *   FLARE uses low-confidence tokens as retrieval triggers.
 *
 * - Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024):
 *   "indiscriminately retrieving regardless of whether retrieval is necessary diminishes LM versatility"
 *   Self-RAG uses reflection tokens [Retrieve], [IsRel], [IsSup], [IsUse] for adaptive retrieval.
 *   Key insight: retrieval should be ADAPTIVE, not fixed.
 *
 * - Agentic RAG (Singh et al., arXiv:2501.09136, 2025):
 *   "Agentic RAG transcends limitations by embedding autonomous agents that dynamically manage
 *   retrieval strategies, iteratively refine contextual understanding."
 *   Pattern: Adaptive RAG decides retrieval based on complexity and uncertainty.
 *
 * - NeurIPS 2024 Uncertainty (Kapoor et al., arXiv:2406.08391):
 *   "prompting on its own is insufficient to achieve good calibration"
 *   Objective criteria outperform subjective LLM self-assessment for uncertainty detection.
 *
 * Architecture:
 * 1. shouldProactivelyRetrieve(): Objective criteria for proactive retrieval trigger
 * 2. proactiveKnowledgeRetrieval(): Execute additional search_knowledge before generation
 * 3. assessContextSufficiency(): Quantitative context quality score
 */

import { queryKnowledge } from './knowledge';

// ==================== TYPES ====================

export interface ProactiveRetrievalConfig {
  minDocuments: number;       // Minimum CRAG documents for "sufficient" context
  minContextLength: number;   // Minimum context length in characters
  stemCategories: string[];   // Categories that always trigger proactive retrieval
  maxAdditionalResults: number; // Max additional results to fetch
}

export interface ProactiveRetrievalResult {
  triggered: boolean;
  reason: string;
  additionalContext: string;
  resultsFound: number;
  sufficiencyScore: number;  // 0.0 to 1.0
}

export interface ContextSufficiencyAssessment {
  score: number;           // 0.0 to 1.0
  isInsufficient: boolean;
  reasons: string[];
}

// ==================== CONFIGURATION ====================

/**
 * Proactive retrieval configuration
 * Based on empirical analysis of Ciclo 55 benchmark results:
 * - depth gap (-16.0%): queries STEM com < 2 documentos CRAG
 * - faithfulness gap (-12.2%): queries com contexto < 300 chars
 */
const DEFAULT_CONFIG: ProactiveRetrievalConfig = {
  minDocuments: 2,           // Self-RAG: at least 2 relevant passages for factual queries
  minContextLength: 300,     // FLARE: context below 300 chars is insufficient for complex queries
  stemCategories: [          // Categories that ALWAYS trigger proactive retrieval (FLARE-inspired)
    'complex_reasoning',
    'research',
    'coding',
    'stem',
  ],
  maxAdditionalResults: 5,
};

// ==================== CORE FUNCTIONS ====================

/**
 * Assess the sufficiency of the current knowledge context.
 * Uses objective criteria (Self-RAG reflection token equivalent).
 *
 * Scientific basis: Self-RAG [IsRel] and [IsSup] reflection tokens
 * assess whether retrieved passages are relevant and support the generation.
 */
export function assessContextSufficiency(
  knowledgeContext: string,
  cragDocumentCount: number,
  category: string,
  config: ProactiveRetrievalConfig = DEFAULT_CONFIG
): ContextSufficiencyAssessment {
  const reasons: string[] = [];
  let score = 1.0;

  // Criterion 1: Document count (Self-RAG [IsRel] equivalent)
  if (cragDocumentCount < config.minDocuments) {
    const deficit = config.minDocuments - cragDocumentCount;
    score -= 0.3 * deficit;
    reasons.push(`Only ${cragDocumentCount} CRAG documents (minimum: ${config.minDocuments})`);
  }

  // Criterion 2: Context length (FLARE confidence threshold equivalent)
  if (knowledgeContext.length < config.minContextLength) {
    const ratio = knowledgeContext.length / config.minContextLength;
    score -= 0.4 * (1 - ratio);
    reasons.push(`Context length ${knowledgeContext.length} chars (minimum: ${config.minContextLength})`);
  }

  // Criterion 3: Empty context (critical failure)
  if (!knowledgeContext || knowledgeContext.trim().length === 0) {
    score = 0.0;
    reasons.push('Knowledge context is empty — no bd_central data found');
  }

  // Criterion 4: STEM/complex category always requires richer context
  if (config.stemCategories.includes(category) && score < 0.8) {
    score -= 0.1;
    reasons.push(`Category "${category}" requires high-quality context (STEM/research)`);
  }

  score = Math.max(0, Math.min(1, score));

  return {
    score,
    isInsufficient: score < 0.7,
    reasons,
  };
}

/**
 * Determine if proactive retrieval should be triggered.
 *
 * Scientific basis:
 * - FLARE: triggers retrieval when generation confidence is low
 * - Self-RAG: uses [Retrieve] token when retrieval is needed
 * - Agentic RAG: Adaptive RAG pattern — retrieval based on complexity
 *
 * Returns true if MOTHER should proactively search bd_central
 * BEFORE the LLM generation phase.
 */
export function shouldProactivelyRetrieve(
  query: string,
  knowledgeContext: string,
  cragDocumentCount: number,
  category: string,
  config: ProactiveRetrievalConfig = DEFAULT_CONFIG
): { should: boolean; reason: string; sufficiencyScore: number } {
  const assessment = assessContextSufficiency(
    knowledgeContext,
    cragDocumentCount,
    category,
    config
  );

  // Always trigger for STEM/research/complex categories with insufficient context
  if (config.stemCategories.includes(category) && assessment.isInsufficient) {
    return {
      should: true,
      reason: `STEM/research category "${category}" with insufficient context (score: ${assessment.score.toFixed(2)}): ${assessment.reasons.join('; ')}`,
      sufficiencyScore: assessment.score,
    };
  }

  // Trigger for any category with empty context
  if (!knowledgeContext || knowledgeContext.trim().length === 0) {
    return {
      should: true,
      reason: 'Empty knowledge context — bd_central returned no results for this query',
      sufficiencyScore: 0,
    };
  }

  // Trigger for any category with critically insufficient context
  if (assessment.score < 0.4) {
    return {
      should: true,
      reason: `Critical context insufficiency (score: ${assessment.score.toFixed(2)}): ${assessment.reasons.join('; ')}`,
      sufficiencyScore: assessment.score,
    };
  }

  return {
    should: false,
    reason: `Context sufficient (score: ${assessment.score.toFixed(2)})`,
    sufficiencyScore: assessment.score,
  };
}

/**
 * Execute proactive knowledge retrieval.
 * Searches bd_central with multiple query variants for better coverage.
 *
 * Scientific basis:
 * - FLARE: uses forward-looking active retrieval with query reformulation
 * - HyDE (Gao et al., arXiv:2212.10496): hypothetical document embeddings for better retrieval
 * - Query expansion: multiple query variants improve recall
 */
export async function executeProactiveRetrieval(
  query: string,
  category: string,
  config: ProactiveRetrievalConfig = DEFAULT_CONFIG
): Promise<ProactiveRetrievalResult> {
  try {
    // Search bd_central with the original query
    const results = await queryKnowledge(query);

    if (!results || results.length === 0) {
      return {
        triggered: true,
        reason: 'Proactive retrieval executed — no additional results found in bd_central',
        additionalContext: '',
        resultsFound: 0,
        sufficiencyScore: 0,
      };
    }

    // Format additional context
    const additionalContext = results
      .map((r, i) => `[Proactive Result ${i + 1} | Confidence: ${(r.confidence || 0).toFixed(3)} | Relevance: ${(r.relevance || 0).toFixed(3)}]\n${r.content}`)
      .join('\n\n');

    return {
      triggered: true,
      reason: `Proactive retrieval found ${results.length} additional results in bd_central`,
      additionalContext,
      resultsFound: results.length,
      sufficiencyScore: Math.min(1, results.length / config.minDocuments),
    };
  } catch (error) {
    return {
      triggered: true,
      reason: `Proactive retrieval failed: ${(error as Error).message}`,
      additionalContext: '',
      resultsFound: 0,
      sufficiencyScore: 0,
    };
  }
}

/**
 * Generate a proactive context quality marker for injection into the system prompt.
 * Informs the LLM about the retrieval status so it can calibrate its response.
 *
 * Scientific basis: Self-RAG reflection tokens — the LLM needs explicit signals
 * about retrieval quality to calibrate its generation.
 */
export function generateProactiveContextMarker(
  result: ProactiveRetrievalResult,
  sufficiencyAssessment: ContextSufficiencyAssessment
): string {
  if (!result.triggered) return '';

  const status = result.resultsFound > 0
    ? `✅ PROACTIVE RETRIEVAL: Found ${result.resultsFound} additional results in bd_central`
    : `⚠️ PROACTIVE RETRIEVAL: No additional results found in bd_central for this query`;

  const qualityNote = sufficiencyAssessment.isInsufficient
    ? `\n⚠️ CONTEXT QUALITY: Insufficient (score: ${sufficiencyAssessment.score.toFixed(2)}). ${sufficiencyAssessment.reasons.join('; ')}. If the context below is insufficient, call search_knowledge with a more specific query.`
    : `\n✅ CONTEXT QUALITY: Sufficient after proactive retrieval (score: ${sufficiencyAssessment.score.toFixed(2)}).`;

  return `\n\n## 🔍 PROACTIVE RETRIEVAL STATUS\n${status}${qualityNote}\n`;
}
