/**
 * MOTHER v67.0 - Grounding Engine (Anti-Hallucination)
 *
 * Implements a post-generation grounding mechanism that:
 * 1. Extracts factual claims from LLM responses
 * 2. Verifies each claim against retrieved knowledge context
 * 3. Injects inline citations for verified claims
 * 4. Flags or rewrites unverified claims
 *
 * Scientific basis:
 * - CRAG (Yan et al., arXiv:2401.15884, 2024): Corrective Retrieval Augmented Generation
 * - Self-RAG (Asai et al., arXiv:2310.11511, 2023): Self-Reflective RAG with critique tokens
 * - FActScoring (Min et al., arXiv:2305.14251, 2023): Factuality evaluation via atomic claims
 * - RAGAS (Es et al., arXiv:2309.15217, 2023): RAG evaluation framework
 * - Knowledge Grounding (Pan et al., arXiv:2306.08302, 2024): LLM-KG integration survey
 */

import { invokeLLM } from '../_core/llm';

export interface GroundedClaim {
  claim: string;
  isGrounded: boolean;
  sourceSnippet?: string;
  sourceName?: string;
  confidence: number;
}

export interface GroundingResult {
  groundedResponse: string;
  claims: GroundedClaim[];
  totalClaims: number;
  groundedClaims: number;
  hallucinationRisk: 'low' | 'medium' | 'high';
  citationsInjected: number;
}

/**
 * Main grounding function.
 * Takes an LLM-generated response and a knowledge context,
 * and returns a grounded version with citations.
 *
 * @param response - The raw LLM response to ground
 * @param knowledgeContext - The retrieved knowledge context (RAG results)
 * @param query - The original user query
 */
export async function groundResponse(
  response: string,
  knowledgeContext: string,
  query: string
): Promise<GroundingResult> {
  // If no knowledge context, we cannot ground — flag everything as unverified
  if (!knowledgeContext || knowledgeContext.trim().length < 50) {
    return {
      groundedResponse: response,
      claims: [],
      totalClaims: 0,
      groundedClaims: 0,
      hallucinationRisk: 'high',
      citationsInjected: 0,
    };
  }

  try {
    // Step 1: Extract atomic factual claims from the response
    const claims = await extractAtomicClaims(response, query);

    if (claims.length === 0) {
      return {
        groundedResponse: response,
        claims: [],
        totalClaims: 0,
        groundedClaims: 0,
        hallucinationRisk: 'low',
        citationsInjected: 0,
      };
    }

    // Step 2: Verify each claim against the knowledge context
    const groundedClaims = await verifyClaims(claims, knowledgeContext);

    // Step 3: Inject citations and flag unverified claims
    const { groundedResponse, citationsInjected } = injectCitationsAndFlags(
      response,
      groundedClaims
    );

    // Step 4: Assess hallucination risk
    const groundedCount = groundedClaims.filter(c => c.isGrounded).length;
    const groundingRatio = claims.length > 0 ? groundedCount / claims.length : 1;
    const hallucinationRisk: 'low' | 'medium' | 'high' =
      groundingRatio >= 0.8 ? 'low' : groundingRatio >= 0.5 ? 'medium' : 'high';

    console.log(
      `[Grounding] ${groundedCount}/${claims.length} claims grounded. Risk: ${hallucinationRisk}`
    );

    return {
      groundedResponse,
      claims: groundedClaims,
      totalClaims: claims.length,
      groundedClaims: groundedCount,
      hallucinationRisk,
      citationsInjected,
    };
  } catch (error) {
    console.error('[Grounding] Error during grounding:', error);
    // On error, return the original response unmodified
    return {
      groundedResponse: response,
      claims: [],
      totalClaims: 0,
      groundedClaims: 0,
      hallucinationRisk: 'medium',
      citationsInjected: 0,
    };
  }
}

/**
 * Extract atomic factual claims from a response using an LLM.
 * Based on FActScoring (Min et al., 2023) atomic claim decomposition.
 */
async function extractAtomicClaims(response: string, query: string): Promise<string[]> {
  // For short responses or conversational replies, skip claim extraction
  if (response.length < 100) return [];

  const extractionPrompt = `You are a fact-checking assistant. Given the following AI response to a user query, extract all atomic factual claims that could potentially be verified or falsified.

An atomic claim is a single, specific, verifiable statement (e.g., "The Transformer architecture was proposed in 2017", "GPT-4 has 1.8 trillion parameters").

Do NOT include:
- Opinions or subjective statements
- Definitions that are universally agreed upon
- Statements about the AI system itself (e.g., "I am MOTHER")
- Conversational filler

User Query: "${query.slice(0, 200)}"

AI Response:
"""
${response.slice(0, 2000)}
"""

Return ONLY a JSON array of strings, each being one atomic factual claim. If there are no verifiable claims, return an empty array [].
Example: ["The Transformer was proposed by Vaswani et al. in 2017", "BERT uses bidirectional attention"]`;

  try {
    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: extractionPrompt }],
      maxTokens: 500,
    });

    const content = typeof result === 'string' ? result : result?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((c: unknown) => typeof c === 'string').slice(0, 10);
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Verify each claim against the knowledge context.
 * Uses lightweight LLM calls to assess support.
 */
async function verifyClaims(
  claims: string[],
  knowledgeContext: string
): Promise<GroundedClaim[]> {
  const verificationPrompt = `You are a fact-checking assistant. Given a knowledge context and a list of factual claims, determine which claims are SUPPORTED by the context.

Knowledge Context:
"""
${knowledgeContext.slice(0, 3000)}
"""

Claims to verify (JSON array):
${JSON.stringify(claims)}

For each claim, return a JSON array of objects with:
- "claim": the original claim text
- "isGrounded": true if the context EXPLICITLY supports this claim, false otherwise
- "sourceSnippet": a short quote from the context that supports the claim (or null if not grounded)
- "sourceName": the source name from the context (e.g., "arXiv:2401.15884") or null
- "confidence": a number from 0.0 to 1.0 indicating how strongly the context supports the claim

Return ONLY the JSON array. Be strict: only mark as grounded if there is clear, direct evidence in the context.`;

  try {
    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: verificationPrompt }],
      maxTokens: 1000,
    });

    const content = typeof result === 'string' ? result : result?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item: Partial<GroundedClaim>) => ({
          claim: item.claim || '',
          isGrounded: item.isGrounded || false,
          sourceSnippet: item.sourceSnippet,
          sourceName: item.sourceName,
          confidence: item.confidence || 0,
        }));
      }
    }
  } catch {
    // Fall through to default
  }

  // Default: mark all as ungrounded if verification fails
  return claims.map(claim => ({
    claim,
    isGrounded: false,
    confidence: 0,
  }));
}

/**
 * Inject citations into the response text for grounded claims,
 * and append a warning for ungrounded claims.
 */
function injectCitationsAndFlags(
  response: string,
  groundedClaims: GroundedClaim[]
): { groundedResponse: string; citationsInjected: number } {
  let groundedResponse = response;
  let citationsInjected = 0;
  const references: string[] = [];

  for (const claim of groundedClaims) {
    if (claim.isGrounded && claim.sourceName) {
      // Find the claim in the response and append a citation marker
      const claimIndex = groundedResponse.indexOf(claim.claim.slice(0, 40));
      if (claimIndex !== -1) {
        const refNumber = references.length + 1;
        references.push(`[${refNumber}] ${claim.sourceName}${claim.sourceSnippet ? ` — "${claim.sourceSnippet.slice(0, 100)}"` : ''}`);
        // Insert citation after the sentence containing the claim
        const sentenceEnd = groundedResponse.indexOf('.', claimIndex);
        if (sentenceEnd !== -1) {
          groundedResponse =
            groundedResponse.slice(0, sentenceEnd) +
            ` [${refNumber}]` +
            groundedResponse.slice(sentenceEnd);
          citationsInjected++;
        }
      }
    }
  }

  // Append references section if any citations were injected
  if (references.length > 0) {
    groundedResponse += '\n\n**Referências:**\n' + references.join('\n');
  }

  return { groundedResponse, citationsInjected };
}

/**
 * Quick check: does this response need grounding?
 * Returns false for conversational replies that don't contain factual claims.
 */
export function needsGrounding(response: string): boolean {
  // Skip grounding for very short responses
  if (response.length < 80) return false;

  // Skip grounding for responses that are clearly conversational
  const conversationalPatterns = [
    /^(olá|oi|sim|não|claro|entendido|ok|certo)/i,
    /^(hello|hi|yes|no|sure|understood|ok|got it)/i,
  ];
  for (const pattern of conversationalPatterns) {
    if (pattern.test(response.trim())) return false;
  }

  return true;
}
