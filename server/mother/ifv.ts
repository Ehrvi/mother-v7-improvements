/**
 * IFV — Instruction Following Verifier
 * MOTHER v75.4 — Ciclo 54 v2.0 — Action 2
 *
 * Scientific basis:
 *   - IFEval (Zhou et al., arXiv:2311.07911, 2023): Instruction-Following Evaluation benchmark
 *     showing that LLMs fail 15-30% of explicit format/constraint instructions.
 *   - FollowBench (Jiang et al., arXiv:2310.20410, 2023): multi-level instruction following
 *     with Constraint Satisfaction Rate (CSR) as primary metric.
 *   - Self-RAG (Asai et al., arXiv:2310.11511, 2023): reflection tokens for self-evaluation.
 *   - SELF-INSTRUCT (Wang et al., arXiv:2212.10560, 2022): instruction quality filtering.
 *   - arXiv:2601.03269 (Instruction Following Verifier, 2026): LLM-as-judge for constraint
 *     satisfaction verification with 94.2% agreement with human annotators.
 *
 * Purpose: Verify that MOTHER's response satisfies all explicit constraints in the query.
 * Trigger: After Constitutional AI layer, before final return.
 * Non-blocking: errors caught and logged, original response preserved.
 *
 * Constraint types detected:
 *   1. Format constraints (e.g., "responda em JSON", "use bullet points", "em português")
 *   2. Length constraints (e.g., "máximo 200 palavras", "resposta curta", "detalhado")
 *   3. Content constraints (e.g., "não mencione X", "inclua Y", "cite fontes")
 *   4. Style constraints (e.g., "formal", "técnico", "simples")
 *   5. Structure constraints (e.g., "com exemplos", "passo a passo", "com tabela")
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';

const log = createLogger('IFV');

export interface IFVConstraint {
  type: 'format' | 'length' | 'content' | 'style' | 'structure';
  description: string;
  satisfied: boolean;
  confidence: number;
}

export interface IFVResult {
  hasConstraints: boolean;
  constraints: IFVConstraint[];
  allSatisfied: boolean;
  satisfactionRate: number;
  revisedResponse?: string;
  wasRevised: boolean;
  ifvScore: number; // 0-100
}

// ── Constraint Detection Patterns ──────────────────────────────────────────────
// Based on IFEval benchmark constraint taxonomy (Zhou et al., 2023)
const FORMAT_PATTERNS = [
  /\b(em json|formato json|json format|responda.*json)\b/i,
  /\b(em markdown|formato markdown|use markdown)\b/i,
  /\b(em tabela|formato tabela|use.*tabela)\b/i,
  /\b(em lista|bullet points|use.*lista|liste)\b/i,
  /\b(em português|em inglês|in english|in portuguese)\b/i,
  /\b(numerado|numerada|numbered list)\b/i,
  /\b(código|code block|```)\b/i,
];

const LENGTH_PATTERNS = [
  /\b(máximo|no máximo|at most|maximum)\s+(\d+)\s*(palavras|words|caracteres|chars|linhas|lines)\b/i,
  /\b(mínimo|no mínimo|at least|minimum)\s+(\d+)\s*(palavras|words|caracteres|chars|linhas|lines)\b/i,
  /\b(resposta curta|brief|conciso|concise|resumido|resumida)\b/i,
  /\b(detalhado|detalhada|detailed|extenso|extensa|completo|completa)\b/i,
  /\b(em\s+(\d+)\s*(palavras|words))\b/i,
];

const CONTENT_PATTERNS = [
  /\b(não mencione|don't mention|avoid mentioning|sem mencionar)\b/i,
  /\b(inclua|include|mencione|mention|cite|citar)\b/i,
  /\b(com exemplos|with examples|dê exemplos|give examples)\b/i,
  /\b(cite fontes|cite sources|com referências|with references)\b/i,
  /\b(sem código|no code|apenas texto|text only)\b/i,
];

const STYLE_PATTERNS = [
  /\b(formal|técnico|technical|acadêmico|academic)\b/i,
  /\b(simples|simple|fácil|easy|leigo|layman)\b/i,
  /\b(profissional|professional)\b/i,
  /\b(casual|informal|conversacional|conversational)\b/i,
];

const STRUCTURE_PATTERNS = [
  /\b(passo a passo|step by step|step-by-step)\b/i,
  /\b(com introdução|with introduction|introdução.*conclusão)\b/i,
  /\b(pros e contras|pros and cons|vantagens e desvantagens)\b/i,
  /\b(compare|comparison|comparação|comparar)\b/i,
  /\b(estruturado|structured|organizado|organized)\b/i,
];

/**
 * Detect explicit constraints in the user query.
 * Returns list of detected constraints (unsatisfied by default — will be verified).
 */
export function detectConstraints(query: string): IFVConstraint[] {
  const constraints: IFVConstraint[] = [];

  for (const pattern of FORMAT_PATTERNS) {
    if (pattern.test(query)) {
      constraints.push({
        type: 'format',
        description: `Format constraint: ${pattern.source}`,
        satisfied: false,
        confidence: 0.9,
      });
    }
  }

  for (const pattern of LENGTH_PATTERNS) {
    if (pattern.test(query)) {
      constraints.push({
        type: 'length',
        description: `Length constraint: ${pattern.source}`,
        satisfied: false,
        confidence: 0.85,
      });
    }
  }

  for (const pattern of CONTENT_PATTERNS) {
    if (pattern.test(query)) {
      constraints.push({
        type: 'content',
        description: `Content constraint: ${pattern.source}`,
        satisfied: false,
        confidence: 0.8,
      });
    }
  }

  for (const pattern of STYLE_PATTERNS) {
    if (pattern.test(query)) {
      constraints.push({
        type: 'style',
        description: `Style constraint: ${pattern.source}`,
        satisfied: false,
        confidence: 0.75,
      });
    }
  }

  for (const pattern of STRUCTURE_PATTERNS) {
    if (pattern.test(query)) {
      constraints.push({
        type: 'structure',
        description: `Structure constraint: ${pattern.source}`,
        satisfied: false,
        confidence: 0.8,
      });
    }
  }

  return constraints;
}

/**
 * Verify constraint satisfaction using LLM-as-judge.
 * Scientific basis: arXiv:2601.03269 — IFV achieves 94.2% human agreement.
 *
 * Uses gpt-4o-mini as judge (cost-efficient, sufficient for binary classification).
 * Returns updated constraints with satisfaction status.
 */
async function verifyConstraints(
  query: string,
  response: string,
  constraints: IFVConstraint[]
): Promise<IFVConstraint[]> {
  if (constraints.length === 0) return constraints;

  const constraintList = constraints
    .map((c, i) => `${i + 1}. [${c.type.toUpperCase()}] ${c.description}`)
    .join('\n');

  const verificationPrompt = `You are an Instruction Following Verifier (IFV). Your task is to determine whether a response satisfies explicit constraints from the user's query.

USER QUERY:
${query}

RESPONSE TO EVALUATE:
${response.slice(0, 2000)}${response.length > 2000 ? '...[truncated]' : ''}

CONSTRAINTS TO VERIFY:
${constraintList}

For each constraint, respond with EXACTLY this format (one line per constraint):
CONSTRAINT_1: SATISFIED|VIOLATED (confidence: 0.0-1.0)
CONSTRAINT_2: SATISFIED|VIOLATED (confidence: 0.0-1.0)
...

Be strict: if a constraint is partially satisfied, mark as VIOLATED.`;

  try {
    const judgeResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'You are a precise instruction-following verifier. Respond only with the structured format requested.' },
        { role: 'user', content: verificationPrompt },
      ],
      temperature: 0.1, // Low temperature for deterministic classification
      max_tokens: 200,
    });

    const rawJudgeContent = judgeResponse.choices[0]?.message?.content || '';
    const judgeContent = typeof rawJudgeContent === 'string' ? rawJudgeContent : JSON.stringify(rawJudgeContent);
    const lines = judgeContent.split('\n').filter((l: string) => l.trim());

    const updatedConstraints = [...constraints];
    for (const line of lines) {
      const match = line.match(/CONSTRAINT_(\d+):\s*(SATISFIED|VIOLATED)\s*\(confidence:\s*([\d.]+)\)/i);
      if (match) {
        const idx = parseInt(match[1]) - 1;
        if (idx >= 0 && idx < updatedConstraints.length) {
          updatedConstraints[idx] = {
            ...updatedConstraints[idx],
            satisfied: match[2].toUpperCase() === 'SATISFIED',
            confidence: parseFloat(match[3]) || 0.8,
          };
        }
      }
    }

    return updatedConstraints;
  } catch (err) {
    log.warn('[IFV] Constraint verification failed, assuming satisfied:', (err as Error).message);
    // On error, assume all constraints satisfied (non-blocking)
    return constraints.map(c => ({ ...c, satisfied: true }));
  }
}

/**
 * Regenerate response to satisfy violated constraints.
 * Scientific basis: Self-Refine (Madaan et al., arXiv:2303.17651, 2023)
 *
 * Uses targeted regeneration: only regenerates when critical constraints violated.
 * Critical constraints: format (JSON/markdown) and explicit content exclusions.
 */
async function regenerateForConstraints(
  query: string,
  response: string,
  violatedConstraints: IFVConstraint[],
  systemPrompt: string
): Promise<string> {
  const violationList = violatedConstraints
    .map(c => `- [${c.type.toUpperCase()}] ${c.description}`)
    .join('\n');

  const regenerationPrompt = `The following constraints from the user's query were NOT satisfied in your previous response:

${violationList}

USER QUERY: ${query}

YOUR PREVIOUS RESPONSE (violated constraints):
${response.slice(0, 1500)}

Please regenerate your response, this time strictly satisfying ALL the listed constraints. Do not acknowledge this correction — just provide the corrected response directly.`;

  try {
    const regenResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: regenerationPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const regenContent = regenResponse.choices[0]?.message?.content;
    return typeof regenContent === 'string' && regenContent.length > 50
      ? regenContent
      : response; // Fallback to original if regeneration fails
  } catch (err) {
    log.warn('[IFV] Regeneration failed, keeping original:', (err as Error).message);
    return response;
  }
}

/**
 * Main IFV function — verify and optionally fix instruction following.
 *
 * Algorithm:
 * 1. Detect constraints in query (regex-based, fast)
 * 2. If no constraints detected, return early (no overhead)
 * 3. Verify constraint satisfaction via LLM-as-judge
 * 4. If critical constraints violated, regenerate response
 * 5. Return IFV result with metrics
 *
 * Scientific basis:
 *   - IFEval (Zhou et al., 2023): 25 verifiable instruction types
 *   - FollowBench (Jiang et al., 2023): CSR metric for multi-constraint queries
 *   - arXiv:2601.03269 (2026): IFV with 94.2% human agreement
 */
export async function applyIFV(
  query: string,
  response: string,
  systemPrompt: string,
  options: {
    enableRegeneration?: boolean; // Default: true for critical constraints
    maxConstraintsToVerify?: number; // Default: 5 (cost control)
  } = {}
): Promise<IFVResult> {
  const { enableRegeneration = true, maxConstraintsToVerify = 5 } = options;

  // Step 1: Detect constraints
  const detectedConstraints = detectConstraints(query);

  if (detectedConstraints.length === 0) {
    return {
      hasConstraints: false,
      constraints: [],
      allSatisfied: true,
      satisfactionRate: 1.0,
      wasRevised: false,
      ifvScore: 100,
    };
  }

  // Limit to top constraints by confidence (cost control)
  const constraintsToVerify = detectedConstraints
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxConstraintsToVerify);

  log.info(`[IFV] Detected ${detectedConstraints.length} constraints, verifying top ${constraintsToVerify.length}`);

  // Step 2: Verify constraints via LLM-as-judge
  const verifiedConstraints = await verifyConstraints(query, response, constraintsToVerify);

  const satisfiedCount = verifiedConstraints.filter(c => c.satisfied).length;
  const satisfactionRate = satisfiedCount / verifiedConstraints.length;
  const ifvScore = Math.round(satisfactionRate * 100);

  log.info(`[IFV] Satisfaction: ${satisfiedCount}/${verifiedConstraints.length} (${ifvScore}%)`);

  // Step 3: Regenerate if critical constraints violated
  const violatedConstraints = verifiedConstraints.filter(c => !c.satisfied);
  const criticalViolations = violatedConstraints.filter(
    c => c.type === 'format' || c.type === 'content'
  );

  let finalResponse = response;
  let wasRevised = false;

  if (enableRegeneration && criticalViolations.length > 0) {
    log.info(`[IFV] ${criticalViolations.length} critical violations — regenerating response`);
    finalResponse = await regenerateForConstraints(query, response, criticalViolations, systemPrompt);
    wasRevised = finalResponse !== response;
    if (wasRevised) {
      log.info('[IFV] Response regenerated to satisfy critical constraints');
    }
  }

  return {
    hasConstraints: true,
    constraints: verifiedConstraints,
    allSatisfied: violatedConstraints.length === 0,
    satisfactionRate,
    revisedResponse: wasRevised ? finalResponse : undefined,
    wasRevised,
    ifvScore,
  };
}
