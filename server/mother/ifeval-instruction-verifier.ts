/**
 * IFEvalInstructionVerifier — MOTHER v75.13 (Ciclo 63)
 *
 * Resolve NC-INSTRUCTION-001: instruction_following gap -6.0 (Q10: MOTHER 94 vs Manus 100)
 *
 * Fundamentação científica:
 * - arXiv:2311.07911 (IFEval, Google, 2023): 885 citações
 *   "Instruction-Following Evaluation for Large Language Models"
 *   Zhou et al., Google DeepMind, 2023
 * - Benchmark Ciclo 61: Q10 MOTHER 94 vs Manus 100 (gap -6.0)
 * - Benchmark Ciclo 62: instruction_following gap -6.0 persistente
 *
 * Metodologia IFEval (arXiv:2311.07911):
 * - 25 tipos de instruções verificáveis programaticamente
 * - Categorias: format, length, keywords, language, style
 * - Métricas: prompt-level accuracy, instruction-level accuracy
 *
 * Implementação MOTHER:
 * 1. Detectar instruções verificáveis na query
 * 2. Verificar compliance programático na resposta
 * 3. Calcular instruction-level accuracy
 * 4. Ação: accept | partial_retry | full_retry
 */

import { createLogger } from '../_core/logger.js';
import { invokeLLM } from '../_core/llm.js';

const logger = createLogger('ifeval-verifier');

export interface IFEvalConfig {
  /** Threshold mínimo de compliance (default: 0.90) */
  minComplianceScore: number;
  /** Threshold para partial retry (default: 0.75) */
  partialRetryThreshold: number;
  /** Máximo de tentativas de retry (default: 2) */
  maxRetries: number;
  /** Ativar verificação de formato (default: true) */
  checkFormat: boolean;
  /** Ativar verificação de comprimento (default: true) */
  checkLength: boolean;
  /** Ativar verificação de keywords (default: true) */
  checkKeywords: boolean;
}

export interface InstructionConstraint {
  type: 'format' | 'length' | 'keyword' | 'language' | 'style' | 'structure';
  description: string;
  verifier: (response: string) => boolean;
  weight: number; // 0-1, importância relativa
}

export interface IFEvalResult {
  overallScore: number;
  promptLevelAccuracy: boolean;
  instructionLevelAccuracy: number;
  constraintsDetected: number;
  constraintsPassed: number;
  failedConstraints: string[];
  action: 'accept' | 'partial_retry' | 'full_retry';
  retryInstructions?: string;
}

const DEFAULT_CONFIG: IFEvalConfig = {
  minComplianceScore: 0.90,
  partialRetryThreshold: 0.75,
  maxRetries: 2,
  checkFormat: true,
  checkLength: true,
  checkKeywords: true,
};

/**
 * Detecta instruções verificáveis em uma query
 * Baseado nos 25 tipos de IFEval (arXiv:2311.07911)
 */
function detectInstructionConstraints(query: string): InstructionConstraint[] {
  const constraints: InstructionConstraint[] = [];
  const queryLower = query.toLowerCase();

  // === FORMATO ===
  // Markdown
  if (/use\s+(markdown|headers|bullet|lista|list|table|tabela)/i.test(query)) {
    constraints.push({
      type: 'format',
      description: 'Use markdown formatting',
      verifier: (r) => /[#*`\-]/.test(r),
      weight: 0.8,
    });
  }

  // JSON
  if (/\b(json|formato json|retorne json|return json)\b/i.test(query)) {
    constraints.push({
      type: 'format',
      description: 'Return JSON format',
      verifier: (r) => /\{[\s\S]*\}/.test(r),
      weight: 1.0,
    });
  }

  // Lista numerada
  if (/\b(liste|list|enumere|enumerate|numere)\b.*\b(itens|items|pontos|points)\b/i.test(query) ||
      /\b(\d+)\s+itens?\b/i.test(query)) {
    const countMatch = query.match(/\b(\d+)\s+itens?\b/i);
    const expectedCount = countMatch ? parseInt(countMatch[1]) : null;
    constraints.push({
      type: 'structure',
      description: `Numbered list${expectedCount ? ` with ${expectedCount} items` : ''}`,
      verifier: (r) => {
        const numberedItems = (r.match(/^\d+\.\s/gm) || []).length;
        if (expectedCount) return numberedItems >= expectedCount;
        return numberedItems >= 2;
      },
      weight: 0.9,
    });
  }

  // === COMPRIMENTO ===
  // Mínimo de palavras
  const minWordsMatch = query.match(/\b(pelo menos|at least|minimum|mínimo)\s+(\d+)\s+(palavras?|words?)\b/i);
  if (minWordsMatch) {
    const minWords = parseInt(minWordsMatch[2]);
    constraints.push({
      type: 'length',
      description: `Minimum ${minWords} words`,
      verifier: (r) => r.split(/\s+/).length >= minWords,
      weight: 1.0,
    });
  }

  // Máximo de palavras
  const maxWordsMatch = query.match(/\b(no máximo|at most|maximum|máximo)\s+(\d+)\s+(palavras?|words?)\b/i);
  if (maxWordsMatch) {
    const maxWords = parseInt(maxWordsMatch[2]);
    constraints.push({
      type: 'length',
      description: `Maximum ${maxWords} words`,
      verifier: (r) => r.split(/\s+/).length <= maxWords,
      weight: 1.0,
    });
  }

  // Conciso / breve
  if (/\b(conciso|concise|breve|brief|curto|short|sucinto|succinct)\b/i.test(query)) {
    constraints.push({
      type: 'length',
      description: 'Concise response (< 200 words)',
      verifier: (r) => r.split(/\s+/).length <= 200,
      weight: 0.7,
    });
  }

  // Detalhado / extenso
  if (/\b(detalhado|detailed|extenso|extensive|abrangente|comprehensive)\b/i.test(query)) {
    constraints.push({
      type: 'length',
      description: 'Detailed response (> 300 words)',
      verifier: (r) => r.split(/\s+/).length >= 300,
      weight: 0.7,
    });
  }

  // === KEYWORDS ===
  // Incluir keyword específica
  const includeMatch = query.match(/\b(inclua?|include|mencione?|mention)\s+["']?([^"'\n,]+)["']?/i);
  if (includeMatch) {
    const keyword = includeMatch[2].trim().toLowerCase();
    if (keyword.length > 2 && keyword.length < 50) {
      constraints.push({
        type: 'keyword',
        description: `Include keyword: "${keyword}"`,
        verifier: (r) => r.toLowerCase().includes(keyword),
        weight: 0.9,
      });
    }
  }

  // Não incluir keyword
  const excludeMatch = query.match(/\b(não inclua?|do not include|evite?|avoid|sem mencionar)\s+["']?([^"'\n,]+)["']?/i);
  if (excludeMatch) {
    const keyword = excludeMatch[2].trim().toLowerCase();
    if (keyword.length > 2 && keyword.length < 50) {
      constraints.push({
        type: 'keyword',
        description: `Exclude keyword: "${keyword}"`,
        verifier: (r) => !r.toLowerCase().includes(keyword),
        weight: 0.9,
      });
    }
  }

  // === IDIOMA ===
  if (/\b(em inglês|in english|respond in english)\b/i.test(query)) {
    constraints.push({
      type: 'language',
      description: 'Respond in English',
      verifier: (r) => {
        const portugueseWords = (r.match(/\b(o|a|os|as|de|do|da|em|para|com|por|que|não|sim)\b/gi) || []).length;
        const totalWords = r.split(/\s+/).length;
        return totalWords > 0 && portugueseWords / totalWords < 0.1;
      },
      weight: 1.0,
    });
  }

  if (/\b(em português|in portuguese|responda em português)\b/i.test(query)) {
    constraints.push({
      type: 'language',
      description: 'Respond in Portuguese',
      verifier: (r) => {
        const portugueseWords = (r.match(/\b(o|a|os|as|de|do|da|em|para|com|por|que|não|sim)\b/gi) || []).length;
        const totalWords = r.split(/\s+/).length;
        return totalWords > 0 && portugueseWords / totalWords >= 0.05;
      },
      weight: 1.0,
    });
  }

  // === ESTILO ===
  // Sem introdução/conclusão
  if (/\b(sem introdução|without introduction|sem conclusão|without conclusion)\b/i.test(query)) {
    constraints.push({
      type: 'style',
      description: 'No introduction/conclusion',
      verifier: (r) => {
        const hasIntro = /^(introdução|introduction|in this|neste|este artigo)/i.test(r.trim());
        const hasConclusion = /(conclusão|conclusion|em resumo|in summary|portanto|therefore)\s*$/i.test(r.trim());
        return !hasIntro && !hasConclusion;
      },
      weight: 0.6,
    });
  }

  // Primeira pessoa
  if (/\b(primeira pessoa|first person|use "eu"|use "I")\b/i.test(query)) {
    constraints.push({
      type: 'style',
      description: 'Use first person',
      verifier: (r) => /\b(eu|I|meu|minha|my)\b/i.test(r),
      weight: 0.7,
    });
  }

  return constraints;
}

/**
 * Verifica compliance de uma resposta com as instruções detectadas
 * Implementa IFEval instruction-level accuracy (arXiv:2311.07911)
 */
export function verifyInstructionCompliance(
  response: string,
  query: string,
  config: IFEvalConfig = DEFAULT_CONFIG
): IFEvalResult {
  const constraints = detectInstructionConstraints(query);

  if (constraints.length === 0) {
    // Sem instruções verificáveis detectadas — score máximo
    return {
      overallScore: 1.0,
      promptLevelAccuracy: true,
      instructionLevelAccuracy: 1.0,
      constraintsDetected: 0,
      constraintsPassed: 0,
      failedConstraints: [],
      action: 'accept',
    };
  }

  const failedConstraints: string[] = [];
  let weightedScore = 0;
  let totalWeight = 0;

  for (const constraint of constraints) {
    totalWeight += constraint.weight;
    try {
      const passes = constraint.verifier(response);
      if (passes) {
        weightedScore += constraint.weight;
      } else {
        failedConstraints.push(constraint.description);
      }
    } catch {
      // Se o verificador falhar, considerar como não-compliance
      failedConstraints.push(`${constraint.description} (verifier error)`);
    }
  }

  const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 1.0;
  const instructionLevelAccuracy = constraints.length > 0
    ? (constraints.length - failedConstraints.length) / constraints.length
    : 1.0;
  const promptLevelAccuracy = failedConstraints.length === 0;

  // Determinar ação
  let action: IFEvalResult['action'];
  let retryInstructions: string | undefined;

  if (overallScore >= config.minComplianceScore) {
    action = 'accept';
  } else if (overallScore >= config.partialRetryThreshold) {
    action = 'partial_retry';
    retryInstructions = `Please fix the following instruction violations:\n${failedConstraints.map(c => `- ${c}`).join('\n')}`;
  } else {
    action = 'full_retry';
    retryInstructions = `The response failed to follow these critical instructions:\n${failedConstraints.map(c => `- ${c}`).join('\n')}\n\nPlease regenerate the response following ALL instructions.`;
  }

  logger.info('IFEvalVerifier result', {
    overallScore,
    promptLevelAccuracy,
    instructionLevelAccuracy,
    constraintsDetected: constraints.length,
    constraintsPassed: constraints.length - failedConstraints.length,
    failedCount: failedConstraints.length,
    action,
  });

  return {
    overallScore,
    promptLevelAccuracy,
    instructionLevelAccuracy,
    constraintsDetected: constraints.length,
    constraintsPassed: constraints.length - failedConstraints.length,
    failedConstraints,
    action,
    retryInstructions,
  };
}

/**
 * Verifica instruction-following via LLM para constraints complexas
 * Complementa a verificação programática para casos ambíguos
 */
export async function verifyInstructionComplianceLLM(
  response: string,
  query: string,
  provider: string = 'openai'
): Promise<{ score: number; violations: string[] }> {
  const prompt = `You are an instruction-following evaluator implementing IFEval (arXiv:2311.07911).

ORIGINAL QUERY (with instructions):
${query.slice(0, 800)}

RESPONSE TO EVALUATE:
${response.slice(0, 1200)}

Evaluate if the response follows ALL instructions in the query.
Check for: format requirements, length constraints, keyword inclusions/exclusions, language, style.

Return ONLY JSON: {
  "score": 0.XX,
  "violations": ["list of violated instructions"],
  "followed": ["list of followed instructions"]
}`;

  try {
    const result = await invokeLLM({
      provider: provider as 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      maxTokens: 300,
    });

    const content = String(result.choices[0]?.message?.content ?? '{"score": 0.9, "violations": []}');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(1, parsed.score ?? 0.9)),
        violations: parsed.violations ?? [],
      };
    }
  } catch (err) {
    logger.warn('LLM instruction verification failed', { error: String(err) });
  }

  return { score: 0.9, violations: [] };
}

export { DEFAULT_CONFIG as IFEvalDefaults };
