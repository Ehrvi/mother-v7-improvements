/**
 * MOTHER v74.14 — Self-Refine Phase 3: Iterative Self-Improvement Loop
 * NC-QUALITY-007: Depth score target ≥ 80
 * 
 * Scientific basis:
 * - Self-Refine (Madaan et al., arXiv:2303.17651, 2023): iterative feedback + refinement
 *   Key finding: Self-Refine improves quality by 20% on average across 7 tasks
 * - Reflexion (Shinn et al., arXiv:2303.11366, 2023): verbal reinforcement learning
 * - Constitutional AI (Bai et al., arXiv:2212.08073, 2022): critique-then-revise
 * - CRITIC (Gou et al., arXiv:2305.11738, 2023): tool-augmented self-correction
 * 
 * Phase 3 improvements over existing Guardian Regeneration Loop (Phase 2):
 * 1. Up to 3 iterations (vs 1 in Phase 2)
 * 2. Structured critique with 6 dimensions (vs generic issues list)
 * 3. Constitutional AI checklist embedded in critique
 * 4. Depth-specific feedback (citations, data, specificity)
 * 5. Early stopping when quality ≥ 90 (avoid unnecessary iterations)
 */

import { invokeLLM } from '../_core/llm';
import { reliabilityLogger } from './reliability-logger';

export interface SelfRefineResult {
  finalResponse: string;
  iterations: number;
  initialScore: number;
  finalScore: number;
  improved: boolean;
  critiques: string[];
}

interface CritiqueResult {
  score: number; // 0-100
  dimensions: {
    faithfulness: number;   // 0-100: claims supported by context
    relevance: number;      // 0-100: addresses the query
    depth: number;          // 0-100: specificity, citations, data
    coherence: number;      // 0-100: logical flow
    obedience: number;      // 0-100: follows instructions
    safety: number;         // 0-100: no harmful content
  };
  issues: string[];
  suggestions: string[];
}

const MAX_ITERATIONS = 3;
const QUALITY_THRESHOLD = 90; // stop early if score >= 90
const MIN_IMPROVEMENT = 5;    // minimum score improvement to continue

/**
 * Self-Refine Phase 3: iterative improvement with structured critique.
 * Called after initial response generation when quality < 80.
 */
export async function selfRefinePhase3(
  query: string,
  initialResponse: string,
  initialScore: number,
  context: string,
  systemPrompt: string
): Promise<SelfRefineResult> {
  reliabilityLogger.info('guardian', `Starting Phase 3 (initial score: ${initialScore})`);
  
  let currentResponse = initialResponse;
  let currentScore = initialScore;
  const critiques: string[] = [];
  let iterations = 0;
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Early stopping
    if (currentScore >= QUALITY_THRESHOLD) {
      reliabilityLogger.info('guardian', `Early stop at iteration ${i}: score ${currentScore} >= ${QUALITY_THRESHOLD}`);
      break;
    }
    
    // Step 1: Critique
    const critique = await generateCritique(query, currentResponse, context);
    critiques.push(critique.issues.join('; '));
    reliabilityLogger.info('guardian', `Iteration ${i+1} critique: score=${critique.score}, issues=${critique.issues.length}`);
    
    // Step 2: Refine
    const refined = await generateRefinement(query, currentResponse, critique, context, systemPrompt);
    
    // Step 3: Evaluate improvement
    const newCritique = await generateCritique(query, refined, context);
    
    if (newCritique.score > currentScore + MIN_IMPROVEMENT) {
      currentResponse = refined;
      currentScore = newCritique.score;
      iterations = i + 1;
      reliabilityLogger.info('guardian', `Iteration ${i+1}: improved ${currentScore - initialScore} points`);
    } else {
      reliabilityLogger.info('guardian', `Iteration ${i+1}: no improvement (${newCritique.score} vs ${currentScore}). Stopping.`);
      break;
    }
  }
  
  return {
    finalResponse: currentResponse,
    iterations,
    initialScore,
    finalScore: currentScore,
    improved: currentScore > initialScore,
    critiques,
  };
}

/**
 * Generate structured critique with 6 dimensions + Constitutional AI checklist.
 * Scientific basis: G-Eval (Liu et al., 2023) + Constitutional AI (Bai et al., 2022)
 */
async function generateCritique(
  query: string,
  response: string,
  context: string
): Promise<CritiqueResult> {
  const contextSnippet = context.slice(0, 1000);
  
  try {
    const critiqueResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        {
          role: 'system',
          content: `You are a strict quality evaluator. Evaluate the response on 6 dimensions (0-100 each).
Return ONLY JSON: {
  "faithfulness": <0-100>,
  "relevance": <0-100>,
  "depth": <0-100>,
  "coherence": <0-100>,
  "obedience": <0-100>,
  "safety": <0-100>,
  "issues": ["issue1", "issue2"],
  "suggestions": ["fix1", "fix2"]
}

Scoring guide:
- faithfulness: Are all claims supported by the context? (0=invented facts, 100=fully grounded)
- relevance: Does it address the query? (0=off-topic, 100=perfectly targeted)
- depth: Does it have citations, data, specificity? (0=vague, 100=rich with evidence)
- coherence: Is the logic clear? (0=contradictory, 100=perfectly structured)
- obedience: Does it follow all instructions in the query? (0=ignores instructions, 100=fully compliant)
- safety: Is it safe and appropriate? (0=harmful, 100=safe)`,
        },
        {
          role: 'user',
          content: `Query: "${query}"\n\nContext available:\n${contextSnippet}\n\nResponse to evaluate:\n${response.slice(0, 2000)}`,
        },
      ],
      maxTokens: 300,
      temperature: 0.1,
    });
    
    const content = critiqueResponse.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse((typeof content === 'string' ? content : JSON.stringify(content)).replace(/```json\n?|\n?```/g, '').trim());
    
    const dims = {
      faithfulness: parsed.faithfulness || 50,
      relevance: parsed.relevance || 50,
      depth: parsed.depth || 50,
      coherence: parsed.coherence || 50,
      obedience: parsed.obedience || 50,
      safety: parsed.safety || 80,
    };
    
    // Weighted average: depth and faithfulness weighted higher (main quality issues)
    const score = Math.round(
      dims.faithfulness * 0.25 +
      dims.relevance * 0.20 +
      dims.depth * 0.25 +
      dims.coherence * 0.15 +
      dims.obedience * 0.10 +
      dims.safety * 0.05
    );
    
    return {
      score,
      dimensions: dims,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
    };
  } catch (e) {
    return {
      score: 50,
      dimensions: { faithfulness: 50, relevance: 50, depth: 50, coherence: 50, obedience: 50, safety: 80 },
      issues: ['Critique failed'],
      suggestions: ['Improve depth and citations'],
    };
  }
}

/**
 * Generate refined response based on critique.
 * Scientific basis: Self-Refine (Madaan et al., 2023) — feedback-guided refinement
 */
async function generateRefinement(
  query: string,
  currentResponse: string,
  critique: CritiqueResult,
  context: string,
  systemPrompt: string
): Promise<string> {
  const issuesList = critique.issues.join('\n- ');
  const suggestionsList = critique.suggestions.join('\n- ');
  const lowestDim = Object.entries(critique.dimensions)
    .sort(([,a], [,b]) => a - b)[0];
  
  const refinementPrompt = `The following response has quality issues. Rewrite it to fix them.

ORIGINAL RESPONSE:
${currentResponse}

QUALITY CRITIQUE (score: ${critique.score}/100):
Lowest dimension: ${lowestDim[0]} (${lowestDim[1]}/100)

Issues:
- ${issuesList}

Suggestions:
- ${suggestionsList}

CONTEXT AVAILABLE:
${context.slice(0, 1500)}

REWRITE REQUIREMENTS:
1. Fix ALL issues listed above
2. Improve ${lowestDim[0]} specifically — this is the weakest dimension
3. Add citations from context when making factual claims
4. Be specific with data, numbers, and evidence
5. Follow all instructions in the original query
6. DO NOT start with "Revised:", "Here is the improved version:", or any prefix
7. Output the final answer directly as if it were the original response`;

  try {
    const refinedResponse = await invokeLLM({
      model: 'gpt-4o',
      provider: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: refinementPrompt },
      ],
      maxTokens: 4096,
      temperature: 0.3,
    });
    
    const rawContent = refinedResponse.choices[0]?.message?.content;
    return (typeof rawContent === 'string' ? rawContent : null) || currentResponse;
  } catch (e) {
    return currentResponse;
  }
}
