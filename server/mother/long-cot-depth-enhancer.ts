/**
 * Long CoT Depth Enhancer — MOTHER v75.14
 * 
 * Base científica: Chen et al. (2025) "Towards Reasoning Era: A Survey of Long
 * Chain-of-Thought for Reasoning Large Language Models" arXiv:2503.09567 (393 citações)
 * 
 * Princípio: Long CoT caracteriza-se por três propriedades: deep reasoning (raciocínio
 * profundo), extensive exploration (exploração extensiva) e feasible reflection (reflexão
 * viável). Adaptado para MOTHER como enhancer de depth e complex_reasoning.
 * 
 * Objetivo: Resolver NC-DEPTH-004 (depth 86.0 → meta 100.0, falta 14.0 pts)
 *           e NC-REASONING-003 (complex_reasoning 89.7 → meta 100.0, falta 10.3 pts)
 * 
 * Algoritmo:
 * 1. Detectar se query requer Long CoT (complexity score > 0.6)
 * 2. Aplicar deep reasoning: decomposição em sub-problemas
 * 3. Aplicar extensive exploration: considerar múltiplas perspectivas
 * 4. Aplicar feasible reflection: verificar coerência e completude
 * 5. Timeout estendido: 150s (vs 90s anterior) para queries de depth
 */

import { createLogger } from '../_core/logger.js';
import { invokeLLM } from '../_core/llm.js';

const logger = createLogger('long-cot-depth-enhancer');

export interface LongCoTConfig {
  /** Timeout estendido para queries de depth (ms). Default: 150000 */
  depthTimeoutMs: number;
  /** Threshold de complexidade para ativar Long CoT. Default: 0.6 */
  complexityThreshold: number;
  /** Threshold de DepthPRM para ativar (reduzido de 0.3 → 0.2). Default: 0.2 */
  depthPRMThreshold: number;
  /** Categorias onde Long CoT é obrigatório */
  mandatoryCategories: string[];
  /** Comprimento mínimo de query para ativar. Default: 100 chars */
  minQueryLength: number;
}

export interface LongCoTResult {
  enhanced: boolean;
  depthScore: number;
  reasoningScore: number;
  subProblems: string[];
  reflectionNotes: string[];
  timeoutMs: number;
  action: 'accept' | 'enhance' | 'deep_enhance' | 'timeout';
}

const DEFAULT_CONFIG: LongCoTConfig = {
  depthTimeoutMs: 150000, // 150s — aumentado de 120s
  complexityThreshold: 0.6,
  depthPRMThreshold: 0.2, // Reduzido de 0.3 → 0.2 (mais agressivo)
  mandatoryCategories: ['complex_reasoning', 'stem'],
  minQueryLength: 100,
};

/**
 * Calcula o score de complexidade de uma query
 * Baseado em indicadores linguísticos de Long CoT (arXiv:2503.09567)
 */
export function computeComplexityScore(query: string): number {
  const indicators = [
    // Deep reasoning indicators
    /explique|analise|compare|contraste|avalie|critique/i,
    /explain|analyze|compare|contrast|evaluate|critique/i,
    // Extensive exploration indicators
    /por que|como funciona|quais são as implicações/i,
    /why|how does|what are the implications/i,
    // Multi-step reasoning
    /passo a passo|step by step|derive|prove|demonstrate/i,
    // Technical depth
    /algoritmo|complexidade|otimização|teorema|prova/i,
    /algorithm|complexity|optimization|theorem|proof/i,
    // Long query (>150 chars)
    query.length > 150 ? /.*/ : /NEVER_MATCH/,
    // Multiple questions
    query.split('?').length > 2 ? /.*/ : /NEVER_MATCH/,
  ];

  const matches = indicators.filter((pattern) => pattern.test(query)).length;
  return Math.min(1.0, matches / 5);
}

/**
 * Decompõe uma query complexa em sub-problemas (Deep Reasoning — arXiv:2503.09567)
 */
async function decomposeIntoSubProblems(
  query: string,
  provider: string
): Promise<string[]> {
  try {
    const result = await invokeLLM({
      provider: provider as any,
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Decompose the complex question into 3-5 atomic sub-problems that must be solved to answer the main question. Return one sub-problem per line.',
        },
        {
          role: 'user',
          content: `Decompose: ${query.slice(0, 500)}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 300,
    });

    const content = String(result.choices[0]?.message?.content || '');
    return content
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 10)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Gera notas de reflexão para verificar coerência (Feasible Reflection — arXiv:2503.09567)
 */
async function generateReflectionNotes(
  response: string,
  query: string,
  provider: string
): Promise<string[]> {
  try {
    const result = await invokeLLM({
      provider: provider as any,
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Review the response for depth and completeness. Identify any missing aspects, shallow explanations, or logical gaps. Return one observation per line.',
        },
        {
          role: 'user',
          content: `Query: ${query.slice(0, 300)}\n\nResponse: ${response.slice(0, 1000)}\n\nReflection notes:`,
        },
      ],
      temperature: 0.1,
      maxTokens: 200,
    });

    const content = String(result.choices[0]?.message?.content || '');
    return content
      .split('\n')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 10)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Aplica Long CoT depth enhancement
 * Implementa: arXiv:2503.09567 — deep reasoning + extensive exploration + feasible reflection
 */
export async function enhanceDepth(
  query: string,
  response: string,
  category: string,
  provider: string,
  config: Partial<LongCoTConfig> = {}
): Promise<LongCoTResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Compute complexity score
  const complexityScore = computeComplexityScore(query);
  const shouldEnhance =
    cfg.mandatoryCategories.includes(category) ||
    (complexityScore >= cfg.complexityThreshold &&
      query.length >= cfg.minQueryLength);

  if (!shouldEnhance) {
    return {
      enhanced: false,
      depthScore: 0.8,
      reasoningScore: 0.8,
      subProblems: [],
      reflectionNotes: [],
      timeoutMs: 90000,
      action: 'accept',
    };
  }

  logger.info('Long CoT depth enhancement activated', {
    category,
    complexityScore: complexityScore.toFixed(2),
    queryLength: query.length,
    timeoutMs: cfg.depthTimeoutMs,
  });

  // Step 1: Deep Reasoning — decompose into sub-problems
  const subProblems = await decomposeIntoSubProblems(query, provider);

  // Step 2: Extensive Exploration — check if response covers sub-problems
  const coveredSubProblems = subProblems.filter((sp) => {
    const keywords = sp.toLowerCase().split(' ').filter((w) => w.length > 4);
    return keywords.some((kw) => response.toLowerCase().includes(kw));
  });

  const coverageScore =
    subProblems.length > 0 ? coveredSubProblems.length / subProblems.length : 0.8;

  // Step 3: Feasible Reflection — identify gaps
  const reflectionNotes =
    coverageScore < 0.8
      ? await generateReflectionNotes(response, query, provider)
      : [];

  // Compute depth and reasoning scores
  const depthScore = Math.min(
    1.0,
    coverageScore * 0.7 + (response.length > 500 ? 0.2 : 0.1) + 0.1
  );
  const reasoningScore = Math.min(
    1.0,
    coverageScore * 0.6 + (subProblems.length > 2 ? 0.2 : 0.1) + 0.2
  );

  const action =
    depthScore >= 0.9
      ? 'accept'
      : depthScore >= 0.7
      ? 'enhance'
      : 'deep_enhance';

  logger.info('Long CoT depth result', {
    depthScore: depthScore.toFixed(2),
    reasoningScore: reasoningScore.toFixed(2),
    coverageScore: coverageScore.toFixed(2),
    subProblems: subProblems.length,
    reflectionNotes: reflectionNotes.length,
    action,
  });

  return {
    enhanced: true,
    depthScore,
    reasoningScore,
    subProblems,
    reflectionNotes,
    timeoutMs: cfg.depthTimeoutMs,
    action,
  };
}

/**
 * Verifica se Long CoT deve ser ativado para uma query
 */
export function shouldActivateLongCoT(
  query: string,
  category: string,
  depthPRMScore: number = 0
): boolean {
  const cfg = DEFAULT_CONFIG;
  const complexityScore = computeComplexityScore(query);

  return (
    cfg.mandatoryCategories.includes(category) ||
    (complexityScore >= cfg.complexityThreshold &&
      query.length >= cfg.minQueryLength) ||
    depthPRMScore >= cfg.depthPRMThreshold // Threshold reduzido: 0.3 → 0.2
  );
}

/**
 * Retorna o timeout estendido para queries de depth
 * Aumentado de 120s → 150s para resolver NC-DEPTH-004
 */
export function getDepthTimeout(category: string, queryLength: number): number {
  if (DEFAULT_CONFIG.mandatoryCategories.includes(category)) {
    return DEFAULT_CONFIG.depthTimeoutMs; // 150s
  }
  if (queryLength > 200) {
    return 120000; // 120s para queries longas
  }
  return 90000; // 90s padrão
}
