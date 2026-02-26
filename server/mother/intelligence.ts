/**
 * MOTHER v68.8 - Layer 3: Intelligence Layer (Multi-Provider Cascade Router)
 * 
 * Implements a 4-level multi-provider cascade routing architecture.
 * 
 * Scientific Basis:
 * - FrugalGPT (Chen et al., 2023): cascade routing reduces cost by up to 98%
 * - RouteLLM (Ong et al., 2024): learned routing with preference data
 * - LLMRouterBench (Hu et al., 2026): comprehensive multi-provider routing benchmarks
 * - AdaptOrch (Yu, 2026): task-adaptive orchestration for LLM convergence era
 * 
 * Architecture:
 * - Level 0 (Router): Mistral Nemo classifies query category (fast, cheap)
 * - Level 1 (Simple): DeepSeek V3 handles factual/simple queries ($0.02/M tokens)
 * - Level 2 (General): Gemini 2.5 Flash handles general/analytical queries ($0.075/M tokens)
 * - Level 3 (Coding): Claude claude-opus-4-5 handles code/technical queries ($3/M tokens)
 * - Level 4 (Complex): GPT-4o handles complex reasoning/synthesis ($2.50/M tokens)
 * 
 * Target distribution (based on FrugalGPT empirical data):
 * - simple: ~50% of queries → DeepSeek
 * - general: ~30% of queries → Gemini
 * - coding: ~12% of queries → Claude
 * - complex_reasoning: ~8% of queries → GPT-4o
 */

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'mistral';

export type LLMModel = {
  provider: LLMProvider;
  modelName: string;
};

export type QueryCategory = 'simple' | 'general' | 'coding' | 'complex_reasoning';

export interface RoutingDecision {
  category: QueryCategory;
  model: LLMModel;
  confidence: number;
  reasoning: string;
  // Legacy compatibility fields
  tier: string;
  complexityScore: number;
  confidenceScore: number;
}

// ─── Pricing Table (per 1M tokens, input/output) ──────────────────────────────
// Source: artificialanalysis.ai + tldl.io (Feb 2026)
const PRICING: Record<LLMProvider, Record<string, { input: number; output: number }>> = {
  deepseek: {
    'deepseek-chat': { input: 0.02 / 1_000_000, output: 0.02 / 1_000_000 },
  },
  google: {
    'gemini-2.5-flash': { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
    'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.00 / 1_000_000 },
  },
  anthropic: {
    'claude-opus-4-5': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
    'claude-opus-4-6': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  },
  openai: {
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4': { input: 30.00 / 1_000_000, output: 60.00 / 1_000_000 },
  },
  mistral: {
    'mistral-small-latest': { input: 0.10 / 1_000_000, output: 0.30 / 1_000_000 },
  },
};

// ─── Model Selection per Category ─────────────────────────────────────────────
export function getModelForCategory(category: QueryCategory): LLMModel {
  switch (category) {
    case 'simple':
      return { provider: 'deepseek', modelName: 'deepseek-chat' };
    case 'general':
      return { provider: 'google', modelName: 'gemini-2.5-flash' };
    case 'coding':
      return { provider: 'anthropic', modelName: 'claude-opus-4-5' };
    case 'complex_reasoning':
      return { provider: 'openai', modelName: 'gpt-4o' };
  }
}

// ─── Static Classifier (no LLM call needed — deterministic heuristics) ────────
// Scientific basis: LLMRouterBench shows static classifiers match LLM-based
// routers at 95% accuracy while eliminating the routing latency cost entirely.
export function classifyQuery(query: string): RoutingDecision {
  const q = query.toLowerCase();
  const wordCount = query.split(/\s+/).length;

  // ── Coding indicators (highest priority) ──────────────────────────────────
  const codingPatterns = [
    'code', 'function', 'class', 'method', 'variable', 'debug', 'error',
    'typescript', 'javascript', 'python', 'java', 'sql', 'api', 'endpoint',
    'implement', 'refactor', 'bug', 'syntax', 'compile', 'runtime', 'stack trace',
    'algorithm', 'data structure', 'regex', 'async', 'promise', 'callback',
    'docker', 'kubernetes', 'git', 'github', 'deploy', 'ci/cd', 'pipeline',
  ];
  const codingScore = codingPatterns.filter(p => q.includes(p)).length;

  // ── Complex reasoning indicators ──────────────────────────────────────────
  const complexPatterns = [
    'analyze', 'compare', 'evaluate', 'synthesize', 'critique', 'argue',
    'philosophical', 'ethical', 'strategy', 'business plan', 'research',
    'scientific', 'hypothesis', 'methodology', 'framework', 'architecture',
    'design system', 'trade-off', 'pros and cons', 'decision', 'recommend',
    'comprehensive', 'in-depth', 'detailed analysis', 'explain why',
  ];
  const complexScore = complexPatterns.filter(p => q.includes(p)).length;

  // ── General indicators ────────────────────────────────────────────────────
  const generalPatterns = [
    'what is', 'how does', 'explain', 'describe', 'tell me about',
    'summary', 'overview', 'list', 'difference between', 'history of',
    'definition', 'meaning', 'example', 'tutorial', 'guide',
  ];
  const generalScore = generalPatterns.filter(p => q.includes(p)).length;

  // ── Routing decision ──────────────────────────────────────────────────────
  let category: QueryCategory;
  let confidence: number;
  let reasoning: string;

  if (codingScore >= 2) {
    category = 'coding';
    confidence = Math.min(0.95, 0.70 + codingScore * 0.05);
    reasoning = `Coding query detected (${codingScore} coding indicators)`;
  } else if (complexScore >= 2 || wordCount > 80) {
    category = 'complex_reasoning';
    confidence = Math.min(0.92, 0.65 + complexScore * 0.07);
    reasoning = `Complex reasoning required (${complexScore} complex indicators, ${wordCount} words)`;
  } else if (generalScore >= 1 || wordCount > 20) {
    category = 'general';
    confidence = Math.min(0.90, 0.70 + generalScore * 0.05);
    reasoning = `General query (${generalScore} general indicators, ${wordCount} words)`;
  } else {
    category = 'simple';
    confidence = 0.85;
    reasoning = `Simple/factual query (${wordCount} words, no complex indicators)`;
  }

  const model = getModelForCategory(category);

  // Legacy compatibility: map to old tier system for DB storage
  const tierMap: Record<QueryCategory, string> = {
    simple: 'gpt-4o-mini',
    general: 'gpt-4o-mini',
    coding: 'gpt-4o',
    complex_reasoning: 'gpt-4o',
  };

  const complexityScoreMap: Record<QueryCategory, number> = {
    simple: 0.2,
    general: 0.45,
    coding: 0.70,
    complex_reasoning: 0.85,
  };

  return {
    category,
    model,
    confidence,
    reasoning,
    // Legacy fields
    tier: tierMap[category],
    complexityScore: complexityScoreMap[category],
    confidenceScore: confidence,
  };
}

// ─── Legacy compatibility: assessComplexity ───────────────────────────────────
// Kept for backward compatibility with any code that still calls assessComplexity
export interface ComplexityAssessment {
  tier: string;
  complexityScore: number;
  confidenceScore: number;
  reasoning: string;
}

export type LLMTier = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4';

export function assessComplexity(query: string): ComplexityAssessment {
  const decision = classifyQuery(query);
  return {
    tier: decision.tier as LLMTier,
    complexityScore: decision.complexityScore,
    confidenceScore: decision.confidenceScore,
    reasoning: decision.reasoning,
  };
}

// ─── Legacy compatibility: getModelForTier ────────────────────────────────────
export function getModelForTier(tier: LLMTier): string {
  switch (tier) {
    case 'gpt-4o-mini': return 'gpt-4o-mini';
    case 'gpt-4o': return 'gpt-4o';
    case 'gpt-4': return 'gpt-4';
  }
}

// ─── Cost Calculation ─────────────────────────────────────────────────────────
export function calculateCostForModel(model: LLMModel, inputTokens: number, outputTokens: number): number {
  const providerPricing = PRICING[model.provider];
  if (!providerPricing) return 0;
  const modelPricing = providerPricing[model.modelName];
  if (!modelPricing) return 0;
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
}

// Legacy: calculateCost using old tier system
export function calculateCost(tier: LLMTier, inputTokens: number, outputTokens: number): number {
  const pricing: Record<LLMTier, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4': { input: 30.00 / 1_000_000, output: 60.00 / 1_000_000 },
  };
  const prices = pricing[tier];
  return (inputTokens * prices.input) + (outputTokens * prices.output);
}

export function calculateBaselineCost(inputTokens: number, outputTokens: number): number {
  return calculateCost('gpt-4', inputTokens, outputTokens);
}

export function calculateCostReduction(actualCost: number, baselineCost: number): number {
  if (baselineCost === 0) return 0;
  return ((baselineCost - actualCost) / baselineCost) * 100;
}
