/**
 * MOTHER v75.6 — Metacognitive Monitor
 *
 * Implements metacognitive self-monitoring: MOTHER evaluates its own
 * knowledge state and uncertainty BEFORE generating a response.
 * This is the core of "active intelligence" — not waiting to be asked,
 * but proactively assessing what it knows and what it needs to learn.
 *
 * Scientific basis:
 * - Metacognitive Monitoring (Ji-An et al., arXiv:2505.13763, 2025):
 *   "Language Models Are Capable of Metacognitive Monitoring —
 *   LLMs can explicitly report and control their activation patterns"
 *
 * - NeurIPS 2024 Uncertainty (Kapoor et al., arXiv:2406.08391):
 *   "prompting on its own is insufficient to achieve good calibration.
 *   Fine-tuning on correct/incorrect examples creates uncertainty estimates
 *   with good generalization and small computational overhead."
 *   Key finding: objective criteria outperform subjective LLM self-assessment.
 *
 * - Proactive Agents (arXiv:2410.12361, 2024):
 *   "Shifting LLM Agents from Reactive Responses to Active Assistance"
 *   Proactive agents anticipate knowledge needs and act without explicit instructions.
 *
 * - Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024):
 *   Reflection tokens [Retrieve], [IsRel], [IsSup], [IsUse] enable
 *   the model to assess its own generation quality.
 *
 * - FLARE (Jiang et al., arXiv:2305.06983, EMNLP 2023):
 *   "Uses low-confidence tokens as triggers for additional retrieval"
 *   Uncertainty-driven retrieval improves factual accuracy.
 *
 * Architecture:
 * 1. assessKnowledgeState(): Compute knowledge coverage score
 * 2. detectKnowledgeGap(): Identify specific gaps in available context
 * 3. generateMetacognitiveReport(): Structured assessment for system prompt injection
 * 4. computeUncertaintyScore(): Quantitative uncertainty estimation
 */

// ==================== TYPES ====================

export interface KnowledgeStateAssessment {
  coverageScore: number;        // 0.0 to 1.0 — how well context covers the query
  uncertaintyScore: number;     // 0.0 to 1.0 — estimated uncertainty (1 = high uncertainty)
  knowledgeGapDetected: boolean;
  gaps: string[];               // Specific knowledge gaps identified
  recommendation: 'answer' | 'search_first' | 'study_required' | 'acknowledge_uncertainty';
  systemPromptMarker: string;   // Injected into system prompt for LLM awareness
}

export interface MetacognitiveConfig {
  coverageThreshold: number;    // Minimum coverage score to answer confidently
  uncertaintyThreshold: number; // Maximum uncertainty to answer without retrieval
  stemBoost: number;            // Extra uncertainty for STEM queries (harder to assess)
}

// ==================== CONFIGURATION ====================

const DEFAULT_META_CONFIG: MetacognitiveConfig = {
  coverageThreshold: 0.5,  // Below 0.5: search first
  uncertaintyThreshold: 0.6, // Above 0.6: acknowledge uncertainty
  stemBoost: 0.15,         // STEM queries are inherently harder to verify
};

// ==================== KNOWLEDGE GAP DETECTION ====================

/**
 * Detect specific knowledge gaps based on query analysis and available context.
 *
 * Scientific basis: Self-RAG [IsRel] reflection token — assesses whether
 * retrieved passages are relevant to the query.
 */
function detectKnowledgeGaps(
  query: string,
  knowledgeContext: string,
  omniscientContext: string,
  category: string
): string[] {
  const gaps: string[] = [];

  // Gap 1: No context at all
  if (!knowledgeContext || knowledgeContext.trim().length === 0) {
    gaps.push('No bd_central knowledge found for this query');
  }

  // Gap 2: No indexed papers for academic/STEM queries
  if (['research', 'complex_reasoning', 'stem'].includes(category)) {
    if (!omniscientContext || omniscientContext.trim().length === 0) {
      gaps.push('No indexed academic papers found in Omniscient layer');
    }
  }

  // Gap 3: Query contains specific entities not found in context
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const contextLower = (knowledgeContext + omniscientContext).toLowerCase();
  const missingTerms = queryWords.filter(w =>
    !contextLower.includes(w) &&
    !/^(como|para|sobre|quando|onde|porque|quais|qual|este|essa|esse|isso|aqui|mais|menos|muito|todo|cada|outro|mesmo)\b/.test(w)
  );
  if (missingTerms.length > 3) {
    gaps.push(`Key query terms not found in context: ${missingTerms.slice(0, 3).join(', ')}`);
  }

  // Gap 4: Context too short for complex queries
  const contextLength = knowledgeContext.length + omniscientContext.length;
  if (contextLength < 500 && ['complex_reasoning', 'research'].includes(category)) {
    gaps.push(`Context too short (${contextLength} chars) for ${category} query`);
  }

  return gaps;
}

/**
 * Compute a quantitative uncertainty score for the current query-context pair.
 *
 * Scientific basis:
 * - NeurIPS 2024 (Kapoor et al.): Objective uncertainty estimation
 * - FLARE: Low-confidence tokens trigger retrieval
 *
 * Score: 0.0 = very confident | 1.0 = very uncertain
 */
function computeUncertaintyScore(
  knowledgeContext: string,
  omniscientContext: string,
  cragDocumentCount: number,
  category: string,
  config: MetacognitiveConfig = DEFAULT_META_CONFIG
): number {
  let uncertainty = 0.0;

  // Factor 1: Empty context → maximum uncertainty
  if (!knowledgeContext || knowledgeContext.trim().length === 0) {
    uncertainty += 0.5;
  } else {
    // Partial uncertainty based on context length
    const contextRatio = Math.min(1, knowledgeContext.length / 1000);
    uncertainty += 0.3 * (1 - contextRatio);
  }

  // Factor 2: No CRAG documents
  if (cragDocumentCount === 0) {
    uncertainty += 0.2;
  } else if (cragDocumentCount < 2) {
    uncertainty += 0.1;
  }

  // Factor 3: No Omniscient papers for academic queries
  if (['research', 'complex_reasoning'].includes(category) &&
      (!omniscientContext || omniscientContext.trim().length === 0)) {
    uncertainty += 0.15;
  }

  // Factor 4: STEM boost (harder to verify without sources)
  if (['complex_reasoning', 'research', 'stem'].includes(category)) {
    uncertainty += config.stemBoost;
  }

  return Math.min(1, uncertainty);
}

/**
 * Compute knowledge coverage score — how well the available context
 * covers the information needs of the query.
 *
 * Score: 0.0 = no coverage | 1.0 = full coverage
 */
function computeCoverageScore(
  knowledgeContext: string,
  omniscientContext: string,
  cragDocumentCount: number
): number {
  let coverage = 0.0;

  // Base coverage from CRAG documents
  coverage += Math.min(0.4, cragDocumentCount * 0.15);

  // Coverage from context length
  const totalContext = knowledgeContext.length + omniscientContext.length;
  coverage += Math.min(0.4, totalContext / 2000);

  // Bonus for Omniscient papers
  if (omniscientContext && omniscientContext.length > 200) {
    coverage += 0.2;
  }

  return Math.min(1, coverage);
}

// ==================== MAIN ASSESSMENT ====================

/**
 * Assess the current knowledge state and generate metacognitive report.
 *
 * This is the core of MOTHER's "active intelligence":
 * - Evaluates what it knows before responding
 * - Identifies specific gaps
 * - Recommends action (answer, search, study, or acknowledge uncertainty)
 * - Generates system prompt marker to inform the LLM
 *
 * Scientific basis:
 * - Metacognitive Monitoring (Ji-An et al., arXiv:2505.13763, 2025)
 * - NeurIPS 2024 Uncertainty (Kapoor et al., arXiv:2406.08391)
 * - Proactive Agents (arXiv:2410.12361, 2024)
 */
export function assessKnowledgeState(
  query: string,
  knowledgeContext: string,
  omniscientContext: string,
  cragDocumentCount: number,
  category: string,
  config: MetacognitiveConfig = DEFAULT_META_CONFIG
): KnowledgeStateAssessment {
  const gaps = detectKnowledgeGaps(query, knowledgeContext, omniscientContext, category);
  const uncertaintyScore = computeUncertaintyScore(
    knowledgeContext, omniscientContext, cragDocumentCount, category, config
  );
  const coverageScore = computeCoverageScore(knowledgeContext, omniscientContext, cragDocumentCount);
  const knowledgeGapDetected = gaps.length > 0 || uncertaintyScore > config.uncertaintyThreshold;

  // Determine recommendation
  let recommendation: KnowledgeStateAssessment['recommendation'];
  if (coverageScore < config.coverageThreshold && knowledgeGapDetected) {
    if (['research', 'complex_reasoning', 'stem'].includes(category)) {
      recommendation = 'study_required';
    } else {
      recommendation = 'search_first';
    }
  } else if (uncertaintyScore > config.uncertaintyThreshold) {
    recommendation = 'acknowledge_uncertainty';
  } else {
    recommendation = 'answer';
  }

  // Generate system prompt marker
  let systemPromptMarker = '';
  if (knowledgeGapDetected) {
    const gapList = gaps.map(g => `  - ${g}`).join('\n');
    const actionGuide = recommendation === 'study_required'
      ? '⚡ ACTION REQUIRED: Call search_knowledge immediately before answering. If results are insufficient, inform the user that active study has been triggered in background.'
      : recommendation === 'search_first'
      ? '⚡ ACTION REQUIRED: Call search_knowledge before answering to ensure factual accuracy.'
      : '⚠️ CAUTION: Answer with explicit uncertainty markers. Use "[Sem fonte verificada]" for unverified claims.';

    systemPromptMarker = `
## 🧠 METACOGNITIVE ASSESSMENT (v75.6)
**Knowledge Coverage Score:** ${(coverageScore * 100).toFixed(0)}% | **Uncertainty Score:** ${(uncertaintyScore * 100).toFixed(0)}%
**Knowledge Gaps Detected:**
${gapList}
**Recommendation:** ${recommendation.toUpperCase()}
${actionGuide}
`;
  } else {
    systemPromptMarker = `\n## 🧠 METACOGNITIVE ASSESSMENT\n✅ Knowledge coverage: ${(coverageScore * 100).toFixed(0)}% | Uncertainty: ${(uncertaintyScore * 100).toFixed(0)}% — Context sufficient for confident response.\n`;
  }

  return {
    coverageScore,
    uncertaintyScore,
    knowledgeGapDetected,
    gaps,
    recommendation,
    systemPromptMarker,
  };
}

/**
 * Generate a concise metacognitive status line for logging.
 */
export function formatMetacognitiveStatus(assessment: KnowledgeStateAssessment): string {
  return `[MetaCog] Coverage: ${(assessment.coverageScore * 100).toFixed(0)}% | Uncertainty: ${(assessment.uncertaintyScore * 100).toFixed(0)}% | Gaps: ${assessment.gaps.length} | Rec: ${assessment.recommendation}`;
}
