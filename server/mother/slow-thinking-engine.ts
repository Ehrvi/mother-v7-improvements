/**
 * Slow Thinking Engine — server/mother/slow-thinking-engine.ts
 * MOTHER v96.0 | Ciclo C213 | NC-SENS-003
 *
 * Implements "Slow Thinking" (System 2 reasoning) for complex queries:
 * - Extended thinking with structured reasoning phases
 * - Complexity scoring to gate slow vs fast thinking
 * - Multi-pass reasoning with self-critique
 * - Budget-aware token allocation
 *
 * Scientific basis:
 * - Kahneman (2011) "Thinking, Fast and Slow" — System 1 vs System 2
 * - Anthropic (2025) "Extended Thinking" — claude-3-7-sonnet extended thinking API
 *   https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 * - Snell et al. (2024) "Scaling LLM Test-Time Compute Optimally"
 *   arXiv:2408.03314 — test-time compute scaling laws
 * - OpenAI (2024) "Learning to Reason with LLMs" — o1 reasoning model
 *   https://openai.com/index/learning-to-reason-with-llms/
 */

export interface SlowThinkingContext {
  query: string;
  complexityScore: number;    // 0-1, computed by computeComplexityScore
  domain: string;             // 'math' | 'logic' | 'code' | 'science' | 'philosophy'
  budgetTokens: number;       // Max tokens for thinking phase
  requiresProof: boolean;     // Whether formal proof is needed
}

export interface SlowThinkingResult {
  thinkingPhases: ThinkingPhase[];
  finalAnswer: string;
  confidenceScore: number;    // 0-1
  totalThinkingTokens: number;
  usedSlowThinking: boolean;
  complexityScore: number;
}

export interface ThinkingPhase {
  phase: 'decompose' | 'hypothesize' | 'verify' | 'synthesize' | 'critique';
  content: string;
  tokensUsed: number;
}

// Complexity threshold: queries above this use slow thinking
const SLOW_THINKING_THRESHOLD = 0.65;

// Domain weights for complexity scoring
const DOMAIN_COMPLEXITY_WEIGHTS: Record<string, number> = {
  math: 0.9,
  logic: 0.85,
  science: 0.8,
  philosophy: 0.75,
  code: 0.7,
  creative: 0.5,
  general: 0.4,
};

/**
 * Compute complexity score for a query.
 * Based on: query length, domain, logical operators, mathematical symbols,
 * multi-step indicators, and uncertainty markers.
 *
 * Scientific basis: Snell et al. (2024) arXiv:2408.03314 — complexity-adaptive compute
 */
export function computeComplexityScore(query: string): number {
  let score = 0;

  // Length factor (longer queries tend to be more complex)
  const wordCount = query.split(/\s+/).length;
  score += Math.min(wordCount / 100, 0.2);

  // Mathematical symbols
  const mathSymbols = (query.match(/[∀∃∈∉⊂⊃∪∩∧∨¬→↔∫∑∏√π∞≤≥≠≈]/g) || []).length;
  score += Math.min(mathSymbols * 0.05, 0.2);

  // Logical operators
  const logicOps = (query.match(/\b(if|then|therefore|hence|implies|iff|prove|disprove|contradict|lemma|theorem|corollary)\b/gi) || []).length;
  score += Math.min(logicOps * 0.04, 0.15);

  // Multi-step indicators
  const multiStep = (query.match(/\b(step|first|second|third|then|finally|next|after|before|because|since|thus|consequently)\b/gi) || []).length;
  score += Math.min(multiStep * 0.02, 0.1);

  // Uncertainty / deep analysis markers
  const deepMarkers = (query.match(/\b(why|how|explain|analyze|compare|evaluate|critique|justify|derive|prove|demonstrate|show that)\b/gi) || []).length;
  score += Math.min(deepMarkers * 0.03, 0.15);

  // Code complexity
  const codeMarkers = (query.match(/\b(algorithm|complexity|O\(|Big-O|recursion|dynamic programming|concurrency|thread|async|deadlock)\b/gi) || []).length;
  score += Math.min(codeMarkers * 0.04, 0.15);

  // Philosophical depth
  const philMarkers = (query.match(/\b(consciousness|qualia|free will|determinism|ontology|epistemology|phenomenology|existence)\b/gi) || []).length;
  score += Math.min(philMarkers * 0.05, 0.1);

  return Math.min(score, 1.0);
}

/**
 * Detect the primary domain of a query.
 */
export function detectQueryDomain(query: string): string {
  const patterns: Record<string, RegExp> = {
    math: /\b(prove|theorem|lemma|integral|derivative|matrix|eigenvalue|topology|algebra|calculus|probability|statistics)\b/i,
    logic: /\b(∀|∃|FOL|predicate|syllogism|modus ponens|tautology|satisfiable|valid|entails)\b/i,
    science: /\b(hypothesis|experiment|empirical|quantum|relativity|entropy|thermodynamics|biology|chemistry|physics)\b/i,
    philosophy: /\b(consciousness|qualia|free will|ethics|ontology|epistemology|phenomenology|Kant|Hegel|Wittgenstein)\b/i,
    code: /\b(algorithm|function|class|async|thread|O\(n\)|recursion|data structure|API|database)\b/i,
  };

  for (const [domain, pattern] of Object.entries(patterns)) {
    if (pattern.test(query)) return domain;
  }
  return 'general';
}

/**
 * Determine if slow thinking should be activated for this query.
 */
export function shouldUseSlowThinking(query: string): {
  activate: boolean;
  complexityScore: number;
  domain: string;
  reason: string;
} {
  const complexityScore = computeComplexityScore(query);
  const domain = detectQueryDomain(query);
  const domainWeight = DOMAIN_COMPLEXITY_WEIGHTS[domain] ?? 0.4;
  const adjustedScore = complexityScore * (0.5 + domainWeight * 0.5);

  const activate = adjustedScore >= SLOW_THINKING_THRESHOLD;

  return {
    activate,
    complexityScore: adjustedScore,
    domain,
    reason: activate
      ? `High complexity (${(adjustedScore * 100).toFixed(0)}%) in domain '${domain}' — activating System 2 reasoning`
      : `Low complexity (${(adjustedScore * 100).toFixed(0)}%) — System 1 reasoning sufficient`,
  };
}

/**
 * Build a structured slow thinking prompt that guides the model through
 * explicit reasoning phases before generating the final answer.
 *
 * Based on Anthropic Extended Thinking + Snell et al. (2024) compute scaling.
 */
export function buildSlowThinkingPrompt(ctx: SlowThinkingContext): string {
  const phases = [
    '**FASE 1 — DECOMPOSIÇÃO:** Decomponha o problema em subproblemas independentes. Liste cada subproblema explicitamente.',
    '**FASE 2 — HIPÓTESES:** Para cada subproblema, formule hipóteses iniciais com base em conhecimento prévio.',
    '**FASE 3 — VERIFICAÇÃO:** Verifique cada hipótese com evidências, contraexemplos ou provas formais.',
    '**FASE 4 — SÍNTESE:** Combine as verificações em uma resposta coerente e completa.',
    '**FASE 5 — AUTOCRÍTICA:** Identifique limitações, suposições não verificadas e possíveis erros na resposta.',
  ];

  const proofInstruction = ctx.requiresProof
    ? '\n**REQUISITO FORMAL:** Esta questão requer prova formal. Use notação matemática rigorosa e justifique cada passo.'
    : '';

  return `## SLOW THINKING ATIVADO (Complexidade: ${(ctx.complexityScore * 100).toFixed(0)}% | Domínio: ${ctx.domain})

Esta questão requer raciocínio profundo (System 2). Execute as seguintes fases ANTES de responder:

${phases.join('\n\n')}
${proofInstruction}

**ORÇAMENTO DE RACIOCÍNIO:** ${ctx.budgetTokens} tokens para as fases de pensamento.

**QUESTÃO:** ${ctx.query}

---
Inicie com a FASE 1 e complete todas as fases antes de apresentar a resposta final.`;
}

/**
 * Enhance system prompt with slow thinking instruction when activated.
 * Called by core.ts pipeline after complexity detection.
 */
export function enhanceSystemPromptWithSlowThinking(
  systemPrompt: string,
  query: string
): { enhancedPrompt: string; activated: boolean; complexityScore: number } {
  const detection = shouldUseSlowThinking(query);

  if (!detection.activate) {
    return {
      enhancedPrompt: systemPrompt,
      activated: false,
      complexityScore: detection.complexityScore,
    };
  }

  const ctx: SlowThinkingContext = {
    query,
    complexityScore: detection.complexityScore,
    domain: detection.domain,
    budgetTokens: Math.round(detection.complexityScore * 4000), // 0-4000 tokens budget
    requiresProof: detection.domain === 'math' || detection.domain === 'logic',
  };

  const slowThinkingBlock = buildSlowThinkingPrompt(ctx);

  const enhancedPrompt = `${systemPrompt}

---
## NC-SENS-003: SLOW THINKING ENGINE ATIVADO
${slowThinkingBlock}
---`;

  return {
    enhancedPrompt,
    activated: true,
    complexityScore: detection.complexityScore,
  };
}
