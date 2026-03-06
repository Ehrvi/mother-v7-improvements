/**
 * MOTHER v81.5 — Constitutional AI v2 (NC-QUALITY-008 + F3-2 Ciclo 171)
 *
 * Scientific Basis:
 * - Bai et al. arXiv:2212.08073 (Constitutional AI, Anthropic 2022):
 *   Critique-then-Revise with iterative refinement (multiple CAI rounds)
 *   "The key insight is that LLMs can critique and revise their own outputs"
 *   Key result: CAI with RL (RLAIF) achieves HHH parity with RLHF
 * - Saunders et al. arXiv:2206.05802 (Self-Critique, 2022)
 * - Sun et al. arXiv:2305.03047 (Principle-Driven Self-Alignment, 2023)
 * - Askell et al. (HHH framework, Anthropic 2021)
 * - F3-2 (Ciclo 171): Iterative loop (up to 2 rounds) + 3 MOTHER-specific principles
 *
 * Architecture (v2 — iterative, 11 principles):
 * Round 1: Critique (8 universal + 3 MOTHER-specific) → Revise if violations
 * Round 2: Re-critique revised response → Revise again if still < 80 (convergence)
 * Max 2 rounds to bound latency (~4s total overhead)
 *
 * Principles (11 total):
 * Universal (1-8): Faithfulness, Depth, Obedience, Honesty, Helpfulness, Safety, Completeness, Precision
 * MOTHER-specific (9-11):
 * 9. Scientific Grounding: Must cite arXiv/papers/standards for technical claims
 * 10. Geotechnical Accuracy: Geotechnical claims must comply with ICOLD/ABNT/ISO standards
 * 11. SHMS Relevance: For monitoring queries, must reference sensor types, thresholds, or protocols
 *
 * Performance: ~2-4s overhead per query (only triggered when quality < 80)
 */

import { ENV } from '../_core/env';
import { reliabilityLogger } from './reliability-logger';

// F3-2: Maximum CAI iterations (Bai et al. 2022 uses multiple rounds for convergence)
const MAX_CAI_ROUNDS = 2;
// F3-2: Score threshold for triggering a second round
const SECOND_ROUND_THRESHOLD = 80;

export interface ConstitutionalAIResult {
  originalResponse: string;
  revisedResponse: string | null;
  wasRevised: boolean;
  violatedPrinciples: string[];
  critiqueScore: number; // 0-100
  constitutionalScore: number; // 0-100
  improvementDelta: number; // revisedScore - originalScore
  rounds: number; // F3-2: number of CAI rounds executed
}

// F3-2: Extended critique interface with MOTHER-specific principles
interface ConstitutionalCritique {
  faithfulness: { score: number; violation: string | null };
  depth: { score: number; violation: string | null };
  obedience: { score: number; violation: string | null };
  honesty: { score: number; violation: string | null };
  helpfulness: { score: number; violation: string | null };
  safety: { score: number; violation: string | null };
  completeness: { score: number; violation: string | null };
  precision: { score: number; violation: string | null };
  // F3-2: MOTHER-specific principles
  scientific_grounding: { score: number; violation: string | null };
  geotechnical_accuracy: { score: number; violation: string | null };
  shms_relevance: { score: number; violation: string | null };
}

/**
 * Run Constitutional AI critique on a response (v2 — 11 principles)
 */
async function critiqueResponse(
  query: string,
  response: string,
  context?: string
): Promise<ConstitutionalCritique | null> {
  if (!ENV.openaiApiKey) return null;

  const contextSection = context && context.trim().length > 50
    ? `\n\n**Retrieved Context:**\n${context.slice(0, 2000)}`
    : '';

  // F3-2: Extended prompt with 3 MOTHER-specific principles
  const critiquePrompt = `You are a Constitutional AI critic. Evaluate this AI response against 11 principles.
For each principle, score 1-5 and identify any violation (null if none).

**Query:** ${query.slice(0, 400)}
**Response:** ${response.slice(0, 1500)}${contextSection}

**Constitutional Principles:**
1. **Faithfulness** (1-5): Are all claims grounded in context or explicitly marked as inference? 
   Violation: "Response makes claims not in context without acknowledging they are inferences"
2. **Depth** (1-5): Does response include specific data, citations, numbers, or examples?
   Violation: "Response is generic/superficial with no specific data or citations"
3. **Obedience** (1-5): Does response follow ALL explicit instructions in the query?
   Violation: "Response ignores instruction to [X]"
4. **Honesty** (1-5): Does response acknowledge uncertainty rather than fabricate?
   Violation: "Response states uncertain facts as definitive without qualification"
5. **Helpfulness** (1-5): Does response provide actionable, specific information?
   Violation: "Response is too vague to be actionable"
6. **Safety** (1-5): Is response free from harmful or inappropriate content?
   Violation: "Response contains [harmful content]"
7. **Completeness** (1-5): Does response address ALL aspects of the query?
   Violation: "Response ignores [aspect] of the query"
8. **Precision** (1-5): Does response use precise language, not vague qualifiers?
   Violation: "Response uses vague language like 'many', 'some', 'often' without specifics"
9. **Scientific Grounding** (1-5): For technical claims, does response cite arXiv papers, standards, or peer-reviewed sources?
   Violation: "Response makes technical claims without citing any scientific source or standard"
10. **Geotechnical Accuracy** (1-5): If response covers geotechnical topics (dams, settlements, sensors), does it comply with ICOLD/ABNT/ISO standards?
    Violation: "Response makes geotechnical claims that contradict or ignore ICOLD/ABNT/ISO standards"
    Note: Score 3 (neutral) if query is not geotechnical.
11. **SHMS Relevance** (1-5): If response covers structural health monitoring, does it reference specific sensor types, thresholds, or monitoring protocols?
    Violation: "Response discusses SHMS/monitoring without specifying sensor types, alert thresholds, or protocols"
    Note: Score 3 (neutral) if query is not about monitoring.

Respond ONLY with JSON (no markdown):
{
  "faithfulness": {"score": X, "violation": "..." or null},
  "depth": {"score": X, "violation": "..." or null},
  "obedience": {"score": X, "violation": "..." or null},
  "honesty": {"score": X, "violation": "..." or null},
  "helpfulness": {"score": X, "violation": "..." or null},
  "safety": {"score": X, "violation": "..." or null},
  "completeness": {"score": X, "violation": "..." or null},
  "precision": {"score": X, "violation": "..." or null},
  "scientific_grounding": {"score": X, "violation": "..." or null},
  "geotechnical_accuracy": {"score": X, "violation": "..." or null},
  "shms_relevance": {"score": X, "violation": "..." or null}
}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: critiquePrompt }],
        temperature: 0.1,
        max_tokens: 700,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { choices: Array<{ message: { content: string | null } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) return null;

    const cleaned = (typeof content === 'string' ? content : JSON.stringify(content))
      .replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned) as ConstitutionalCritique;
  } catch (e) {
    reliabilityLogger.warn('guardian', 'Constitutional AI critique failed', { error: String(e) });
    return null;
  }
}

/**
 * Revise response based on constitutional violations
 * Uses critique-then-revise pattern from Bai et al. (2022)
 */
async function reviseResponse(
  query: string,
  originalResponse: string,
  violations: string[],
  context?: string
): Promise<string | null> {
  if (!ENV.openaiApiKey || violations.length === 0) return null;

  const contextSection = context && context.trim().length > 50
    ? `\n\n**Available Context:**\n${context.slice(0, 2000)}`
    : '';

  const revisionPrompt = `You are an expert AI assistant. Revise this response to fix the identified violations.

**Original Query:** ${query.slice(0, 400)}
**Original Response:** ${originalResponse.slice(0, 1500)}${contextSection}

**Violations to Fix:**
${violations.map((v, i) => `${i + 1}. ${v}`).join('\n')}

**Revision Instructions:**
- Fix ALL violations listed above
- Maintain the same language as the original response
- Add specific data, citations, or examples where depth is lacking
- Ground all claims in the provided context if available
- Acknowledge uncertainty explicitly where needed
- Address all aspects of the original query
- Be precise: replace vague qualifiers with specific numbers/facts
- For scientific claims: add arXiv/paper citations where appropriate
- For geotechnical claims: reference ICOLD/ABNT/ISO standards where applicable
- For SHMS/monitoring claims: specify sensor types, thresholds, or protocols

Provide ONLY the revised response (no preamble, no explanation):`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: revisionPrompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { choices: Array<{ message: { content: string | null } }> };
    const content = data.choices[0]?.message?.content;
    return (typeof content === 'string' ? content : null);
  } catch (e) {
    reliabilityLogger.warn('guardian', 'Constitutional AI revision failed', { error: String(e) });
    return null;
  }
}

/**
 * Calculate constitutional score from critique (v2 — 11 principles)
 * F3-2: Updated weights to include MOTHER-specific principles
 * Weights: faithfulness(20%) + depth(20%) + obedience(15%) + completeness(12%) +
 *          scientific_grounding(10%) + honesty(7%) + helpfulness(6%) +
 *          geotechnical_accuracy(5%) + shms_relevance(3%) + safety(1%) + precision(1%)
 */
function calculateConstitutionalScore(critique: ConstitutionalCritique): number {
  const weights: Record<string, number> = {
    faithfulness: 0.20,
    depth: 0.20,
    obedience: 0.15,
    completeness: 0.12,
    scientific_grounding: 0.10,  // F3-2: new
    honesty: 0.07,
    helpfulness: 0.06,
    geotechnical_accuracy: 0.05, // F3-2: new
    shms_relevance: 0.03,        // F3-2: new
    safety: 0.01,
    precision: 0.01,
  };

  let weightedSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const dim = critique[key as keyof ConstitutionalCritique];
    if (dim) {
      weightedSum += (dim.score / 5) * 100 * weight;
    }
  }

  return Math.round(weightedSum);
}

/**
 * Main Constitutional AI v2 function — iterative critique-revise loop
 * F3-2 (Ciclo 171): Up to MAX_CAI_ROUNDS rounds for convergence (Bai et al. 2022)
 *
 * @param query - The original user query
 * @param response - The response to evaluate and potentially revise
 * @param qualityScore - Current quality score (only run if < 80)
 * @param context - Retrieved knowledge context (for faithfulness evaluation)
 */
export async function applyConstitutionalAI(
  query: string,
  response: string,
  qualityScore: number,
  context?: string
): Promise<ConstitutionalAIResult> {
  const defaultResult: ConstitutionalAIResult = {
    originalResponse: response,
    revisedResponse: null,
    wasRevised: false,
    violatedPrinciples: [],
    critiqueScore: qualityScore,
    constitutionalScore: qualityScore,
    improvementDelta: 0,
    rounds: 0,
  };

  // Only apply if quality is below threshold
  if (qualityScore >= 80) {
    return defaultResult;
  }

  const startTime = Date.now();
  reliabilityLogger.info('guardian', 'Constitutional AI v2 triggered', {
    qualityScore,
    responseLength: response.length,
    maxRounds: MAX_CAI_ROUNDS,
  });

  let currentResponse = response;
  let finalRevisedResponse: string | null = null;
  let allViolations: string[] = [];
  let finalScore = qualityScore;
  let rounds = 0;

  // F3-2: Iterative critique-revise loop (Bai et al. 2022)
  for (let round = 0; round < MAX_CAI_ROUNDS; round++) {
    rounds++;

    // Step 1: Critique
    const critique = await critiqueResponse(query, currentResponse, context);
    if (!critique) {
      reliabilityLogger.warn('guardian', `Constitutional AI v2 round ${round + 1}: critique returned null`);
      break;
    }

    const constitutionalScore = calculateConstitutionalScore(critique);
    finalScore = constitutionalScore;

    // Collect violations
    const violations: string[] = [];
    for (const [key, value] of Object.entries(critique)) {
      if (value.violation && value.score < 4) {
        violations.push(`[${key.toUpperCase()}] ${value.violation}`);
      }
    }

    if (violations.length === 0) {
      reliabilityLogger.info('guardian', `Constitutional AI v2 round ${round + 1}: no violations`, {
        constitutionalScore,
        elapsed: Date.now() - startTime,
      });
      break;  // Converged — no more violations
    }

    allViolations = [...allViolations, ...violations];

    // Step 2: Revise
    const revised = await reviseResponse(query, currentResponse, violations, context);
    if (!revised) break;

    finalRevisedResponse = revised;
    currentResponse = revised;  // Use revised as input for next round

    reliabilityLogger.info('guardian', `Constitutional AI v2 round ${round + 1} complete`, {
      violations: violations.length,
      constitutionalScore,
      elapsed: Date.now() - startTime,
    });

    // F3-2: Early stop if score already good enough after revision
    if (constitutionalScore >= SECOND_ROUND_THRESHOLD && round < MAX_CAI_ROUNDS - 1) {
      reliabilityLogger.info('guardian', `Constitutional AI v2: converged at round ${round + 1} (score=${constitutionalScore})`);
      break;
    }
  }

  const elapsed = Date.now() - startTime;
  const improvementDelta = finalRevisedResponse ? Math.max(0, finalScore - qualityScore) : 0;

  reliabilityLogger.info('guardian', 'Constitutional AI v2 completed', {
    rounds,
    violationsFixed: allViolations.length,
    wasRevised: !!finalRevisedResponse,
    originalScore: qualityScore,
    finalScore,
    improvementDelta,
    elapsed,
  });

  return {
    originalResponse: response,
    revisedResponse: finalRevisedResponse,
    wasRevised: !!finalRevisedResponse,
    violatedPrinciples: allViolations,
    critiqueScore: finalScore,
    constitutionalScore: finalScore,
    improvementDelta,
    rounds,
  };
}
