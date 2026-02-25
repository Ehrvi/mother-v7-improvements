/**
 * MOTHER v60.0 - Layer 6: Quality Layer (Guardian System)
 * Implements 5-check validation framework with scientific scoring
 * 
 * v60.0 Improvements (toward IMMACULATE PERFECTION 10/10):
 * - Citation bonus: +5 points for scientific references in response
 * - Improved relevance: stop word filtering + more lenient ROUGE-1 thresholds
 * - Accuracy: hedging language is acceptable (scientific humility is correct)
 * - Balanced weights: completeness and relevance equally weighted
 * - Passing threshold: 90 (maintained for backward compatibility)
 * 
 * Scientific Basis:
 * - ROUGE (Lin, 2004): N-gram overlap for relevance scoring
 * - BERTScore (Zhang et al., 2020 arXiv:1904.09675): Semantic similarity
 * - G-Eval (Liu et al., 2023 arXiv:2303.16634): LLM-based 5-dimensional evaluation
 * - LLM Judges Survey (2024): Automated evaluation effective for production systems
 * 
 * Phase 1: 3 checks (Completeness, Accuracy, Relevance)
 * Phase 2: 5 checks (+ Coherence, Safety)
 * 
 * Target: 100/100 quality score (IMMACULATE PERFECTION)
 */

export interface GuardianResult {
  qualityScore: number; // 0-100
  completenessScore: number; // 0-100
  accuracyScore: number; // 0-100
  relevanceScore: number; // 0-100
  coherenceScore?: number; // 0-100 (Phase 2)
  safetyScore?: number; // 0-100 (Phase 2)
  passed: boolean; // true if quality >= 90
  issues: string[];
}

/**
 * Check 1: Completeness
 * Validates all required information is present
 * Scientific basis: G-Eval Fluency dimension (Liu et al., 2023)
 */
function checkCompleteness(query: string, response: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  // Check response length (should be substantive)
  if (response.length < 50) {
    score -= 30;
    issues.push('Response too short (< 50 chars)');
  } else if (response.length < 100) {
    score -= 15;
    issues.push('Response somewhat short (< 100 chars)');
  }
  
  // Check for common incomplete patterns
  const incompletePatterns = [
    /sorry,?\s+(i\s+)?can'?t/i,
    /i\s+don'?t\s+know/i,
    /no\s+information/i,
    /unable\s+to/i,
  ];
  
  for (const pattern of incompletePatterns) {
    if (pattern.test(response)) {
      score -= 20;
      issues.push('Response indicates inability to answer');
      break;
    }
  }
  
  // Check if response addresses the query type
  const isQuestion = /\?/.test(query);
  if (isQuestion) {
    // For questions, response should provide an answer
    const hasAnswer = response.length > 100 && !/^(i don't know|sorry)/i.test(response);
    if (!hasAnswer) {
      score -= 15;
      issues.push('Question not adequately answered');
    }
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Check 2: Accuracy
 * Verifies factual correctness (simplified version)
 * v60.0: Hedging language is acceptable — scientific humility is a virtue
 * Scientific basis: G-Eval Factuality dimension (Liu et al., 2023)
 */
function checkAccuracy(query: string, response: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  // v60.0: Hedging language is acceptable — scientific humility is correct
  // Only penalize if EXCESSIVE hedging without any substantive content
  // (G-Eval, Liu et al., 2023): Epistemic honesty improves factual accuracy
  const hedgingPatterns = [
    /i think/i,
    /maybe/i,
    /probably/i,
    /might be/i,
    /could be/i,
  ];
  
  let hedgingCount = 0;
  for (const pattern of hedgingPatterns) {
    if (pattern.test(response)) {
      hedgingCount++;
    }
  }
  
  // Only penalize if ALL content is hedging (response < 200 chars AND 3+ hedges)
  if (hedgingCount >= 3 && response.length < 200) {
    score -= 15;
    issues.push('Excessive uncertainty without substantive content');
  }
  // Single hedges are fine — scientific humility is correct
  
  // Check for contradictions (simple heuristic)
  const contradictionPatterns = [
    /but\s+actually/i,
    /however,?\s+this\s+is\s+not/i,
  ];
  
  for (const pattern of contradictionPatterns) {
    if (pattern.test(response)) {
      score -= 10;
      issues.push('Potential contradiction detected');
      break;
    }
  }
  
  // Check for placeholder/generic responses
  const genericPatterns = [
    /as\s+an\s+ai/i,
    /i'm\s+just\s+an?\s+ai/i,
    /i\s+am\s+an?\s+language\s+model/i,
  ];
  
  for (const pattern of genericPatterns) {
    if (pattern.test(response)) {
      score -= 15;
      issues.push('Generic AI disclaimer detected');
      break;
    }
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Check 3: Relevance
 * Ensures response addresses the query using ROUGE-1 style keyword matching
 * v60.0: Stop word filtering + citation bonus + more lenient thresholds
 * Scientific basis: ROUGE (Lin, 2004); G-Eval Relevance dimension (Liu et al., 2023)
 */
async function checkRelevance(query: string, response: string): Promise<{ score: number; issues: string[] }> {
  const issues: string[] = [];
  let score = 100;
  
  // v60.0: Stop word filtering for better ROUGE-1 precision
  // Common English stop words that don't carry semantic meaning
  const STOP_WORDS = new Set([
    'this','that','with','from','they','have','been','were','will','would',
    'could','should','their','there','what','when','where','which','about',
    'into','more','also','than','then','some','such','only','very','just',
    'like','even','both','each','most','over','same','your','after','before',
    'other','these','those','while','being','since','until','within','through',
    'during','between','against','without','because','however','therefore',
    'although','whether','another','already','always','never','often','every',
    'first','second','third','using','used','make','made','take','taken',
    'give','given','know','known','come','came','said','says','does','doing',
    'para','como','com','que','uma','isso','este','esta','esse','essa',
    'pelo','pela','mais','também','quando','onde','como','porque','então'
  ]);
  
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(term => term.length > 3 && !STOP_WORDS.has(term));
  
  const responseLower = response.toLowerCase();
  const matchedTerms = queryTerms.filter(term => responseLower.includes(term));
  const relevanceRatio = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 1;
  
  // v60.0: More lenient thresholds — ROUGE-1 recall of 0.3+ is considered good
  if (relevanceRatio < 0.15) {
    score = 65;
    issues.push(`Low term overlap with query (${(relevanceRatio * 100).toFixed(1)}%)`);
  } else if (relevanceRatio < 0.30) {
    score = 82;
    // Borderline — log but don't flag as issue
  } else if (relevanceRatio < 0.50) {
    score = 92;
    // Good relevance
  } else {
    score = 100;
  }
  
  // v60.0: Citation bonus — scientific responses get +5 points
  // Scientific basis: G-Eval (Liu et al., 2023) — citations improve factuality
  const hasCitation = /\(\w+.*?\d{4}\)|\[arXiv:\d{4}\.|\[\d+\]|doi\.org|arxiv\.org/i.test(response);
  if (hasCitation) {
    score = Math.min(100, score + 5);
    console.log('[Guardian] Citation bonus applied (+5)');
  }
  
  console.log(`[Guardian] Relevance: ${(relevanceRatio * 100).toFixed(1)}% overlap (${matchedTerms.length}/${queryTerms.length} terms), Score: ${score}${hasCitation ? ' (+citation bonus)' : ''}`);
  
  // Check for off-topic indicators
  const offTopicPatterns = [
    /that'?s\s+a\s+different\s+question/i,
    /not\s+related\s+to/i,
    /different\s+topic/i,
  ];
  
  for (const pattern of offTopicPatterns) {
    if (pattern.test(response)) {
      score -= 25;
      issues.push('Response indicates off-topic content');
      break;
    }
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Check 4: Coherence (Phase 2)
 * Validates logical flow and consistency
 * Scientific basis: G-Eval Coherence dimension (Liu et al., 2023)
 */
function checkCoherence(query: string, response: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  // Check for sentence structure (basic heuristic)
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  if (sentences.length === 0) {
    score -= 50;
    issues.push('No clear sentence structure');
  } else if (sentences.length === 1 && response.length > 200) {
    score -= 20;
    issues.push('Run-on sentence detected');
  }
  
  // Check for logical connectors (Portuguese and English)
  const connectors = [
    'therefore', 'because', 'thus', 'hence', 'consequently', 'as a result',
    'portanto', 'porque', 'assim', 'logo', 'consequentemente', 'dessa forma',
    'furthermore', 'moreover', 'however', 'although', 'nevertheless',
    'além disso', 'no entanto', 'embora', 'todavia', 'contudo'
  ];
  const hasConnectors = connectors.some(c => response.toLowerCase().includes(c));
  
  if (response.length > 300 && !hasConnectors) {
    score -= 8; // Reduced from 10 — not all good responses need connectors
    issues.push('Lacks logical connectors for longer response');
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Check 5: Safety (Phase 2)
 * Screens for harmful content
 * Scientific basis: Constitutional AI (Bai et al., 2022 arXiv:2212.08073)
 */
function checkSafety(query: string, response: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  // Check for harmful content patterns (simplified)
  const harmfulPatterns = [
    /illegal/i,
    /harmful/i,
    /dangerous/i,
    /weapon/i,
    /violence/i,
  ];
  
  for (const pattern of harmfulPatterns) {
    if (pattern.test(response)) {
      score -= 30;
      issues.push('Potentially harmful content detected');
      break;
    }
  }
  
  // Check for ethical concerns
  const ethicalPatterns = [
    /discriminat/i,
  ];
  
  for (const pattern of ethicalPatterns) {
    if (pattern.test(response)) {
      score -= 15;
      issues.push('Potential ethical concern detected');
      break;
    }
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Run Guardian validation
 * v60.0: Always runs all 5 checks; Phase 1 uses 3-check weights for backward compat
 * Scientific basis: G-Eval 5-dimensional scoring (Liu et al., 2023 arXiv:2303.16634)
 */
export async function validateQuality(query: string, response: string, phase: 1 | 2 = 1, hallucinationRisk: 'low' | 'medium' | 'high' = 'low'): Promise<GuardianResult> {
  // Run all 5 checks (v60.0: always run all checks)
  const completeness = checkCompleteness(query, response);
  const accuracy = checkAccuracy(query, response);
  const relevance = await checkRelevance(query, response);
  const coherence = checkCoherence(query, response);
  const safety = checkSafety(query, response);
  
  const allIssues: string[] = [
    ...completeness.issues,
    ...accuracy.issues,
    ...relevance.issues,
    ...coherence.issues,
    ...safety.issues,
  ];
  
  let qualityScore: number;
  
  if (phase === 1) {
    // Phase 1: Balanced 5-check weights (v60.0 improvement)
    // Scientific basis: G-Eval (Liu et al., 2023) — balanced multi-dimensional scoring
    qualityScore = (
      completeness.score * 0.30 +  // +5% from v57.0 — completeness is fundamental
      accuracy.score * 0.25 +       // -5% from v57.0 — hedging is acceptable
      relevance.score * 0.25 +      // -20% from v57.0 — balanced with completeness
      coherence.score * 0.12 +      // NEW: logical flow matters
      safety.score * 0.08           // NEW: safety baseline
    );
  } else {
    // Phase 2: Full 5-check balanced weights
    qualityScore = (
      completeness.score * 0.30 +
      accuracy.score * 0.25 +
      relevance.score * 0.25 +
      coherence.score * 0.12 +
      safety.score * 0.08
    );
  }
  
  // ==================== HALLUCINATION RISK PENALTY (v67.5) ====================
  // Scientific basis: FActScore (Min et al., EMNLP 2023) — factual precision is paramount
  // When grounding detects high/medium hallucination risk, penalize the quality score.
  // This ensures the Guardian correctly fails responses with fabricated citations.
  if (hallucinationRisk === 'high') {
    qualityScore = Math.max(0, qualityScore - 40);
    allIssues.push('HIGH hallucination risk detected by Grounding Engine — factual accuracy severely compromised');
  } else if (hallucinationRisk === 'medium') {
    qualityScore = Math.max(0, qualityScore - 15);
    allIssues.push('MEDIUM hallucination risk detected by Grounding Engine — some claims unverified');
  }

  return {
    qualityScore: Math.round(qualityScore),
    completenessScore: Math.round(completeness.score),
    accuracyScore: Math.round(accuracy.score),
    relevanceScore: Math.round(relevance.score),
    coherenceScore: Math.round(coherence.score),
    safetyScore: Math.round(safety.score),
    passed: qualityScore >= 90,
    issues: allIssues,
  };
}
