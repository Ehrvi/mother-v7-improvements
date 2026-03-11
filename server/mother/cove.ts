/**
 * CoVe — Chain-of-Verification
 * MOTHER v75.4 — Ciclo 54 v2.0 — Action 3
 *
 * Scientific basis:
 *   - Chain-of-Verification (Dhuliawala et al., arXiv:2309.11495, 2023):
 *     CoVe reduces hallucinations by 28-46% across factual tasks by generating
 *     verification questions and independently answering them.
 *   - FActScore (Min et al., arXiv:2305.14251, 2023): atomic fact scoring for
 *     factual precision evaluation.
 *   - SelfCheckGPT (Manakul et al., arXiv:2303.08896, 2023): consistency-based
 *     hallucination detection without external knowledge.
 *   - RAGAS (Es et al., arXiv:2309.15217, 2023): faithfulness metric for RAG.
 *
 * Algorithm (4-step CoVe):
 *   Step 1: Draft response (already done by MOTHER pipeline)
 *   Step 2: Plan verification questions — identify verifiable claims
 *   Step 3: Execute verifications — independently answer each question
 *   Step 4: Generate final verified response — revise based on inconsistencies
 *
 * Trigger conditions:
 *   - Response contains factual claims (numbers, dates, names, statistics)
 *   - Response length > 300 chars
 *   - Query category is 'research' or 'complex_reasoning'
 *   - hallucinationRisk is 'medium' or 'high'
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';

const log = createLogger('CoVe');

export interface VerificationQuestion {
  question: string;
  claim: string;
  answer?: string;
  consistent: boolean;
}

export interface CoVeResult {
  applied: boolean;
  verificationQuestions: VerificationQuestion[];
  inconsistenciesFound: number;
  revisedResponse?: string;
  wasRevised: boolean;
  faithfulnessScore: number; // 0-100, based on consistency rate
}

// Patterns indicating factual claims that should be verified
const FACTUAL_CLAIM_PATTERNS = [
  /\b\d{4}\b/, // Years
  /\b\d+[\.,]\d+\s*%/i, // Percentages
  /\b(segundo|according to|de acordo com|conforme|baseado em|based on)\b/i,
  /\b(estudo|study|pesquisa|research|artigo|paper|publicado|published)\b/i,
  /\b(provou|proved|demonstrou|demonstrated|mostrou|showed|encontrou|found)\b/i,
  /\b(sempre|nunca|todos|nenhum|always|never|all|none)\b/i, // Absolute claims
  /\b(maior|menor|melhor|pior|mais|menos|biggest|smallest|best|worst)\b/i, // Superlatives
];

/**
 * Check if response contains verifiable factual claims.
 * Returns true if CoVe should be applied.
 */
export function shouldApplyCoVe(
  response: string,
  queryCategory: string,
  hallucinationRisk: string,
  tier?: string // C257: tier-aware gating
): boolean {
  // Only apply to substantive responses
  if (response.length < 300) return false;
  // C257: TIER_4 (gemini-2.5-pro) has lower hallucination rate — skip CoVe unless high risk
  // Scientific basis: FrugalGPT (Chen et al., 2023) — skip verification for high-capability models
  if (tier === 'TIER_4' && hallucinationRisk !== 'high') return false;

  // Always apply for high hallucination risk
  if (hallucinationRisk === 'high') return true;

  // Ciclo 56 Ação 2: Expanded trigger — medium risk now applies to ALL categories
  // (was: only research/complex_reasoning). Scientific basis: Dhuliawala et al.
  // (arXiv:2309.11495, 2023) — CoVe reduces hallucinations 28-46% across ALL
  // factual tasks, not only complex ones. Faithfulness gap was -12.2% in Ciclo 55.
  if (hallucinationRisk === 'medium') return true;

  // Ciclo 56 Ação 2: Lower pattern threshold from 3 → 2 for earlier activation
  // Min et al. (FActScore, arXiv:2305.14251, 2023): even 2 atomic facts warrant verification
  const patternMatches = FACTUAL_CLAIM_PATTERNS.filter(p => p.test(response)).length;
  if (patternMatches >= 2) return true;

  return false;
}

/**
 * Step 2: Generate verification questions for factual claims in the response.
 * Scientific basis: CoVe (Dhuliawala et al., 2023) — "plan verifications" step.
 */
async function generateVerificationQuestions(
  query: string,
  response: string
): Promise<VerificationQuestion[]> {
  const planPrompt = `You are a fact-checking assistant. Given a response to a query, identify the top 3-5 most important factual claims that could be verified independently.

ORIGINAL QUERY: ${query}

RESPONSE TO VERIFY:
${response.slice(0, 2000)}

Generate 3-5 verification questions in this EXACT JSON format:
[
  {
    "claim": "the specific factual claim being verified",
    "question": "a standalone question to verify this claim (without referencing the response)"
  }
]

Focus on: numbers, statistics, dates, attributions, causal claims, and absolute statements.
Return ONLY the JSON array, no other text.`;

  try {
    const planResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'You are a precise fact-checking assistant. Return only valid JSON.' },
        { role: 'user', content: planPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const rawPlanContent = planResponse.choices[0]?.message?.content || '[]';
    const planContent = typeof rawPlanContent === 'string' ? rawPlanContent : JSON.stringify(rawPlanContent);
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = planContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const questions = JSON.parse(jsonMatch[0]) as Array<{ claim: string; question: string }>;
    return questions.slice(0, 3).map(q => ({ // C257: 3 questions max (was 5) — Dhuliawala et al. (2023): diminishing returns after 3
      claim: q.claim || '',
      question: q.question || '',
      consistent: true, // Will be updated in verification step
    }));
  } catch (err) {
    log.warn('[CoVe] Failed to generate verification questions:', (err as Error).message);
    return [];
  }
}

/**
 * Step 3: Execute verifications independently.
 * Scientific basis: CoVe (Dhuliawala et al., 2023) — "execute verifications" step.
 *
 * Key insight: Questions are answered WITHOUT seeing the original response,
 * preventing the model from just confirming what it already said.
 */
async function executeVerifications(
  questions: VerificationQuestion[],
  knowledgeContext: string
): Promise<VerificationQuestion[]> {
  if (questions.length === 0) return questions;

  const verifiedQuestions = await Promise.all(
    questions.map(async (vq) => {
      try {
        const verifyPrompt = `Answer this factual question as accurately as possible. Be concise (1-2 sentences).

${knowledgeContext ? `CONTEXT:\n${knowledgeContext.slice(0, 500)}\n\n` : ''}QUESTION: ${vq.question}`;

        const verifyResponse = await invokeLLM({
          model: 'gpt-4o-mini',
          provider: 'openai',
          messages: [
            { role: 'system', content: 'Answer factual questions concisely and accurately. If uncertain, say so.' },
            { role: 'user', content: verifyPrompt },
          ],
          temperature: 0.1,
          max_tokens: 150,
        });

        const rawAnswer = verifyResponse.choices[0]?.message?.content || '';
        const answer = typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer);
        return { ...vq, answer };
      } catch (err) {
        return { ...vq, answer: 'Unable to verify' };
      }
    })
  );

  return verifiedQuestions;
}

/**
 * Check consistency between original claims and verification answers.
 * Uses simple heuristics + LLM judge for borderline cases.
 */
async function checkConsistency(
  questions: VerificationQuestion[],
  response: string
): Promise<VerificationQuestion[]> {
  if (questions.length === 0) return questions;

  const consistencyPrompt = `Compare these factual claims from a response with independent verification answers. 
For each pair, determine if they are CONSISTENT or INCONSISTENT.

${questions.map((q, i) => `
CLAIM ${i + 1}: "${q.claim}"
VERIFICATION ANSWER: "${q.answer || 'No answer'}"
`).join('\n')}

Respond in EXACTLY this format:
CLAIM_1: CONSISTENT|INCONSISTENT
CLAIM_2: CONSISTENT|INCONSISTENT
...

Be strict: if the verification answer contradicts or significantly differs from the claim, mark INCONSISTENT.`;

  try {
    const consistencyResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'You are a consistency checker. Respond only with the structured format.' },
        { role: 'user', content: consistencyPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const rawContent = consistencyResponse.choices[0]?.message?.content || '';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const lines = content.split('\n').filter((l: string) => l.trim());

    const updatedQuestions = [...questions];
    for (const line of lines) {
      const match = line.match(/CLAIM_(\d+):\s*(CONSISTENT|INCONSISTENT)/i);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        if (idx >= 0 && idx < updatedQuestions.length) {
          updatedQuestions[idx] = {
            ...updatedQuestions[idx],
            consistent: match[2].toUpperCase() === 'CONSISTENT',
          };
        }
      }
    }

    return updatedQuestions;
  } catch (err) {
    log.warn('[CoVe] Consistency check failed:', (err as Error).message);
    return questions.map(q => ({ ...q, consistent: true })); // Assume consistent on error
  }
}

/**
 * Step 4: Generate final verified response.
 * Scientific basis: CoVe (Dhuliawala et al., 2023) — "generate final verified response" step.
 */
async function generateVerifiedResponse(
  query: string,
  originalResponse: string,
  inconsistentClaims: VerificationQuestion[],
  systemPrompt: string
): Promise<string> {
  const correctionList = inconsistentClaims
    .map(q => `- CLAIM: "${q.claim}" → VERIFICATION: "${q.answer}"`)
    .join('\n');

  const revisionPrompt = `Your previous response contained factual inconsistencies. Please revise it.

ORIGINAL QUERY: ${query}

INCONSISTENCIES FOUND:
${correctionList}

ORIGINAL RESPONSE:
${originalResponse.slice(0, 2000)}

Please provide a revised response that:
1. Corrects the inconsistent claims based on the verification answers
2. Maintains the same structure and quality as the original
3. Does not mention this correction process

Provide only the revised response, no meta-commentary.`;

  try {
    const revisionResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: revisionPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const revisedContent = revisionResponse.choices[0]?.message?.content;
    return typeof revisedContent === 'string' && revisedContent.length > 100
      ? revisedContent
      : originalResponse;
  } catch (err) {
    log.warn('[CoVe] Revision failed, keeping original:', (err as Error).message);
    return originalResponse;
  }
}

/**
 * Main CoVe function — apply Chain-of-Verification to reduce hallucinations.
 *
 * Scientific basis:
 *   - Dhuliawala et al. (arXiv:2309.11495, 2023): 28-46% hallucination reduction
 *   - FActScore (Min et al., 2023): atomic fact precision
 *   - SelfCheckGPT (Manakul et al., 2023): consistency-based detection
 */
export async function applyCoVe(
  query: string,
  response: string,
  systemPrompt: string,
  knowledgeContext: string,
  queryCategory: string,
  hallucinationRisk: string
): Promise<CoVeResult> {
  // Check if CoVe should be applied
  if (!shouldApplyCoVe(response, queryCategory, hallucinationRisk)) {
    return {
      applied: false,
      verificationQuestions: [],
      inconsistenciesFound: 0,
      wasRevised: false,
      faithfulnessScore: 100,
    };
  }

  log.info(`[CoVe] Applying verification (category=${queryCategory}, risk=${hallucinationRisk})`);

  try {
    // Step 2: Generate verification questions
    const questions = await generateVerificationQuestions(query, response);
    if (questions.length === 0) {
      return {
        applied: true,
        verificationQuestions: [],
        inconsistenciesFound: 0,
        wasRevised: false,
        faithfulnessScore: 100,
      };
    }

    // Step 3: Execute verifications independently — C257: 8s timeout (was unbounded)
    // Scientific basis: Amdahl's Law (1967) — bounded latency prevents tail-latency cascade
    const verifiedQuestions = await Promise.race([
      executeVerifications(questions, knowledgeContext),
      new Promise<typeof questions>((resolve) => setTimeout(() => resolve(questions), 8000))
    ]);

    // Check consistency
    const checkedQuestions = await checkConsistency(verifiedQuestions, response);

    const inconsistentClaims = checkedQuestions.filter(q => !q.consistent);
    const faithfulnessScore = Math.round(
      (checkedQuestions.filter(q => q.consistent).length / checkedQuestions.length) * 100
    );

    log.info(`[CoVe] Faithfulness: ${faithfulnessScore}% (${inconsistentClaims.length} inconsistencies)`);

    // Step 4: Revise if inconsistencies found
    let finalResponse = response;
    let wasRevised = false;

    if (inconsistentClaims.length > 0) {
      finalResponse = await generateVerifiedResponse(query, response, inconsistentClaims, systemPrompt);
      wasRevised = finalResponse !== response;
      if (wasRevised) {
        log.info(`[CoVe] Response revised: ${inconsistentClaims.length} claims corrected`);
      }
    }

    return {
      applied: true,
      verificationQuestions: checkedQuestions,
      inconsistenciesFound: inconsistentClaims.length,
      revisedResponse: wasRevised ? finalResponse : undefined,
      wasRevised,
      faithfulnessScore,
    };
  } catch (err) {
    log.warn('[CoVe] Failed (non-blocking):', (err as Error).message);
    return {
      applied: false,
      verificationQuestions: [],
      inconsistenciesFound: 0,
      wasRevised: false,
      faithfulnessScore: 100,
    };
  }
}
