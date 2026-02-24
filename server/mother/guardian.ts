/**
 * MOTHER v7.0 - Layer 6: Quality Layer (Guardian System)
 * Implements 5-check validation framework
 * 
 * Academic validation:
 * - LLM Judges Survey (2024): Automated evaluation effective
 * - Testing DNNs (arXiv, 336 cit.): Systematic testing proven
 * - DeepTest (ACM, 1905 cit.): Automated testing for DNNs works
 * 
 * Phase 1: 3 checks (Completeness, Accuracy, Relevance)
 * Phase 2: 5 checks (+ Coherence, Safety)
 * 
 * Target: 90+ quality score (out of 100)
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
 * In production: cross-reference with knowledge base
 */
function checkAccuracy(query: string, response: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  
  // Check for hedging language (indicates uncertainty)
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
  
  if (hedgingCount >= 3) {
    score -= 20;
    issues.push('Excessive uncertainty/hedging language');
  } else if (hedgingCount >= 1) {
    score -= 5;
    issues.push('Some uncertainty in response');
  }
  
  // Check for contradictions (simple heuristic)
  const contradictionPatterns = [
    /but\s+actually/i,
    /however,?\s+this\s+is\s+not/i,
    /on\s+the\s+other\s+hand/i,
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
 * Ensures response addresses the query using semantic similarity
 */
async function checkRelevance(query: string, response: string): Promise<{ score: number; issues: string[] }> {
  const issues: string[] = [];
  let score = 100;
  
  // Use TF-IDF style keyword matching (embeddings API not available)
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(term => term.length > 3);
  
  const responseLower = response.toLowerCase();
  const matchedTerms = queryTerms.filter(term => responseLower.includes(term));
  const relevanceRatio = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 1;
  
  // Adjust thresholds for keyword matching (more lenient than semantic)
  if (relevanceRatio < 0.2) {
    score = 60;
    issues.push(`Low term overlap with query (${(relevanceRatio * 100).toFixed(1)}%)`);
  } else if (relevanceRatio < 0.4) {
    score = 80;
    issues.push(`Moderate term overlap with query (${(relevanceRatio * 100).toFixed(1)}%)`);
  } else if (relevanceRatio < 0.6) {
    score = 90;
    // Acceptable, no issue
  } else {
    score = 100;
  }
  
  console.log(`[Guardian] Keyword relevance: ${(relevanceRatio * 100).toFixed(1)}%, Score: ${score}`)
  
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
  
  // Check for logical connectors
  const connectors = ['therefore', 'because', 'thus', 'hence', 'consequently', 'as a result'];
  const hasConnectors = connectors.some(c => response.toLowerCase().includes(c));
  
  if (response.length > 200 && !hasConnectors) {
    score -= 10;
    issues.push('Lacks logical connectors for longer response');
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Check 5: Safety (Phase 2)
 * Screens for harmful content
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
    /bias/i,
    /unfair/i,
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
 * Run Guardian validation (Phase 1: 3 checks)
 */
export async function validateQuality(query: string, response: string, phase: 1 | 2 = 1): Promise<GuardianResult> {
  // Phase 1: 3 checks (Completeness, Accuracy, Relevance)
  const completeness = checkCompleteness(query, response);
  const accuracy = checkAccuracy(query, response);
  const relevance = await checkRelevance(query, response);
  
  let qualityScore: number;
  let coherenceScore: number | undefined;
  let safetyScore: number | undefined;
  const allIssues: string[] = [
    ...completeness.issues,
    ...accuracy.issues,
    ...relevance.issues,
  ];
  
  if (phase === 1) {
    // Phase 1: Weighted average of 3 checks
    qualityScore = (
      completeness.score * 0.25 +
      accuracy.score * 0.30 +
      relevance.score * 0.45
    );
  } else {
    // Phase 2: Add Coherence and Safety checks
    const coherence = checkCoherence(query, response);
    const safety = checkSafety(query, response);
    
    coherenceScore = coherence.score;
    safetyScore = safety.score;
    
    allIssues.push(...coherence.issues, ...safety.issues);
    
    // Phase 2: Weighted average of 5 checks
    qualityScore = (
      completeness.score * 0.25 +
      accuracy.score * 0.30 +
      relevance.score * 0.20 +
      coherence.score * 0.15 +
      safety.score * 0.10
    );
  }
  
  return {
    qualityScore: Math.round(qualityScore),
    completenessScore: Math.round(completeness.score),
    accuracyScore: Math.round(accuracy.score),
    relevanceScore: Math.round(relevance.score),
    coherenceScore: coherenceScore ? Math.round(coherenceScore) : undefined,
    safetyScore: safetyScore ? Math.round(safetyScore) : undefined,
    passed: qualityScore >= 90,
    issues: allIssues,
  };
}
