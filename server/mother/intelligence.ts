/**
 * MOTHER v7.0 - Layer 3: Intelligence Layer
 * Implements 3-tier LLM routing based on query complexity
 *
 * Academic validation:
 * - FrugalGPT (Stanford): 98% cost reduction proven
 * - Hybrid LLM (Microsoft): 40% reduction with 0% quality drop
 *
 * Target distribution:
 * - Tier 1 (GPT-4o-mini): 90% of queries
 * - Tier 2 (GPT-4o): 9% of queries
 * - Tier 3 (GPT-4): 1% of queries
 */

export type LLMTier = "gpt-4o-mini" | "gpt-4o" | "gpt-4";

export interface ComplexityAssessment {
  tier: LLMTier;
  complexityScore: number; // 0-1
  confidenceScore: number; // 0-1
  reasoning: string;
}

/**
 * Assess query complexity and determine appropriate LLM tier
 *
 * Complexity indicators:
 * - Length: longer queries often more complex
 * - Keywords: technical terms, multi-step reasoning
 * - Structure: questions vs statements
 * - Domain: specialized knowledge requirements
 */
export function assessComplexity(query: string): ComplexityAssessment {
  const queryLower = query.toLowerCase();
  const wordCount = query.split(/\s+/).length;

  // Complexity scoring factors
  // Start with baseline complexity (all queries have some complexity)
  // Iteration 15: Increased baseline from 0.15 to 0.25 per MOTHER's analysis
  let complexityScore = 0.25;
  let reasoning: string[] = ["Baseline complexity"];

  // Factor 1: Length (longer = more complex)
  if (wordCount > 100) {
    complexityScore += 0.3;
    reasoning.push("Long query (100+ words)");
  } else if (wordCount > 50) {
    complexityScore += 0.2;
    reasoning.push("Medium query (50+ words)");
  } else if (wordCount > 20) {
    complexityScore += 0.1;
    reasoning.push("Short-medium query (20+ words)");
  } else if (wordCount > 5) {
    complexityScore += 0.05;
    reasoning.push("Short query (5-20 words)");
  }
  // Very short queries (< 5 words) keep baseline only

  // Factor 2: Technical/specialized keywords
  // Iteration 15: Expanded technical keywords list
  const technicalKeywords = [
    "algorithm",
    "architecture",
    "optimization",
    "implementation",
    "analysis",
    "synthesis",
    "evaluation",
    "comparison",
    "design",
    "strategy",
    "framework",
    "methodology",
    "research",
    "academic",
    "scientific",
    "technical",
    "complex",
    "advanced",
    "sophisticated",
    "comprehensive",
    "semantic",
    "similarity",
    "keyword",
    "matching",
    "retrieval",
    "embedding",
    "vector",
    "database",
    "api",
    "server",
    "client",
  ];

  const technicalCount = technicalKeywords.filter(kw =>
    queryLower.includes(kw)
  ).length;
  // Iteration 15: Increased technical keyword weight
  if (technicalCount >= 3) {
    complexityScore += 0.35; // Increased from 0.3
    reasoning.push(`High technical content (${technicalCount} keywords)`);
  } else if (technicalCount >= 1) {
    complexityScore += 0.2; // Increased from 0.15
    reasoning.push(`Some technical content (${technicalCount} keywords)`);
  }

  // Factor 3: Multi-step reasoning indicators
  const multiStepIndicators = [
    "first",
    "then",
    "after",
    "next",
    "finally",
    "step",
    "process",
    "procedure",
    "workflow",
    "compare",
    "contrast",
    "analyze",
    "evaluate",
    "explain how",
    "explain why",
    "describe the process",
  ];

  const multiStepCount = multiStepIndicators.filter(ind =>
    queryLower.includes(ind)
  ).length;
  if (multiStepCount >= 2) {
    complexityScore += 0.2;
    reasoning.push("Multi-step reasoning required");
  }

  // Factor 4: Question complexity
  // Iteration 15: Expanded complex question patterns and increased weight
  const complexQuestions = [
    "how does",
    "why does",
    "what is the difference",
    "difference between",
    "compare and contrast",
    "analyze",
    "evaluate",
    "explain",
    "design",
    "create",
    "develop",
    "implement",
    "describe the",
  ];

  const hasComplexQuestion = complexQuestions.some(q => queryLower.includes(q));
  if (hasComplexQuestion) {
    complexityScore += 0.2; // Increased from 0.15
    reasoning.push("Complex question type");
  }

  // Factor 5: Code/programming indicators (high complexity)
  const codeIndicators = [
    "code",
    "function",
    "class",
    "method",
    "variable",
    "debug",
    "error",
  ];
  const hasCode = codeIndicators.some(ind => queryLower.includes(ind));
  if (hasCode) {
    complexityScore += 0.1;
    reasoning.push("Programming-related query");
  }

  // Normalize complexity score to 0-1
  complexityScore = Math.min(complexityScore, 1.0);

  // Determine tier based on complexity thresholds
  // These thresholds are tunable for cost-quality tradeoff
  let tier: LLMTier;
  let confidenceScore: number;

  if (complexityScore >= 0.7) {
    // High complexity → GPT-4 (Tier 3)
    tier = "gpt-4";
    confidenceScore = 0.95; // High confidence in tier selection
  } else if (complexityScore >= 0.4) {
    // Medium complexity → GPT-4o (Tier 2)
    tier = "gpt-4o";
    confidenceScore = 0.85;
  } else {
    // Low complexity → GPT-4o-mini (Tier 1)
    tier = "gpt-4o-mini";
    confidenceScore = 0.9;
  }

  return {
    tier,
    complexityScore,
    confidenceScore,
    reasoning: reasoning.join("; ") || "Simple query",
  };
}

/**
 * Get model name for OpenAI API based on tier
 */
export function getModelForTier(tier: LLMTier): string {
  switch (tier) {
    case "gpt-4o-mini":
      return "gpt-4o-mini";
    case "gpt-4o":
      return "gpt-4o";
    case "gpt-4":
      return "gpt-4";
  }
}

/**
 * Calculate cost for a query based on tier and token usage
 * Pricing (per 1M tokens):
 * - GPT-4o-mini: $0.15 input, $0.60 output
 * - GPT-4o: $2.50 input, $10.00 output
 * - GPT-4: $30.00 input, $60.00 output
 */
export function calculateCost(
  tier: LLMTier,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing: Record<LLMTier, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
    "gpt-4o": { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
    "gpt-4": { input: 30.0 / 1_000_000, output: 60.0 / 1_000_000 },
  };

  const prices = pricing[tier];
  return inputTokens * prices.input + outputTokens * prices.output;
}

/**
 * Estimate baseline cost (100% GPT-4) for comparison
 */
export function calculateBaselineCost(
  inputTokens: number,
  outputTokens: number
): number {
  return calculateCost("gpt-4", inputTokens, outputTokens);
}

/**
 * Calculate cost reduction percentage vs baseline
 */
export function calculateCostReduction(
  actualCost: number,
  baselineCost: number
): number {
  if (baselineCost === 0) return 0;
  return ((baselineCost - actualCost) / baselineCost) * 100;
}
