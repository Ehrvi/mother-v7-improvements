/**
 * DepthTimeoutExtender — MOTHER v75.13 (Ciclo 63)
 *
 * Resolve NC-DEPTH-004: depth gap -14.0 (Q3 TIMEOUT, Q7 quase empate)
 *
 * Fundamentação científica:
 * - arXiv:2305.20050 (PRM "Let's Verify Step by Step", ICLR 2024): step-level verification
 * - arXiv:2312.08935 (OmegaPRM, ACL 2024): Monte Carlo Tree Search para depth
 * - Benchmark Ciclo 61: Q3 TIMEOUT (latência > 90s), Q7 depth gap -14.0
 *
 * Estratégia:
 * 1. Estender timeout de 90s → 150s para queries de depth
 * 2. Ativar DepthPRM para TODAS as queries (threshold 0.4 → 0.3)
 * 3. Detectar queries de depth por heurística semântica
 * 4. Usar streaming parcial para evitar timeout total
 */

import { createLogger } from '../_core/logger.js';

const logger = createLogger('depth-timeout-extender');

export interface DepthTimeoutConfig {
  /** Timeout padrão em ms (default: 90000) */
  defaultTimeoutMs: number;
  /** Timeout estendido para queries de depth em ms (default: 150000) */
  extendedTimeoutMs: number;
  /** Threshold DepthPRM padrão (default: 0.4) */
  defaultDepthPrmThreshold: number;
  /** Threshold DepthPRM universal (default: 0.3) */
  universalDepthPrmThreshold: number;
  /** Ativar streaming parcial para queries longas */
  enablePartialStreaming: boolean;
}

export interface DepthAnalysis {
  isDepthQuery: boolean;
  depthScore: number;
  recommendedTimeoutMs: number;
  depthPrmThreshold: number;
  detectedSignals: string[];
  action: 'standard' | 'extended_timeout' | 'streaming' | 'chunked';
}

const DEFAULT_CONFIG: DepthTimeoutConfig = {
  defaultTimeoutMs: 90_000,
  extendedTimeoutMs: 150_000,
  defaultDepthPrmThreshold: 0.4,
  universalDepthPrmThreshold: 0.3,
  enablePartialStreaming: true,
};

/**
 * Sinais semânticos que indicam query de depth (análise profunda)
 * Baseado em padrões do Benchmark Ciclo 61 Q3 (TIMEOUT) e Q7 (gap -14.0)
 */
const DEPTH_SIGNALS = [
  // Análise profunda
  /analise?\s+(profunda|detalhada|completa|abrangente)/i,
  /deep\s+(analysis|dive|exploration)/i,
  /comprehensive\s+(analysis|review|study)/i,
  // Comparação multi-dimensional
  /compar[ae]\s+.{10,}\s+(e|vs|versus|com)\s+/i,
  /diferença[s]?\s+entre\s+.{5,}\s+e\s+/i,
  // Explicação técnica extensa
  /explique?\s+(detalhadamente|em\s+detalhes|passo\s+a\s+passo)/i,
  /como\s+funciona\s+.{10,}\s+(internamente|em\s+detalhes)/i,
  // Pesquisa e síntese
  /pesquise?\s+.{10,}\s+(e\s+sintetize|e\s+resuma|e\s+analise)/i,
  /revise?\s+a\s+literatura/i,
  /estado\s+da\s+arte/i,
  /state\s+of\s+the\s+art/i,
  // Múltiplos aspectos
  /considerando\s+.{5,}\s+(aspectos|dimensões|fatores)/i,
  /levando\s+em\s+conta\s+.{5,}\s+(aspectos|fatores)/i,
  // Queries longas (> 200 chars geralmente indicam depth)
];

const DEPTH_KEYWORDS = [
  'arquitetura', 'architecture', 'mecanismo', 'mechanism',
  'implementação', 'implementation', 'algoritmo', 'algorithm',
  'fundamentos', 'foundations', 'princípios', 'principles',
  'história', 'history', 'evolução', 'evolution',
  'trade-off', 'vantagens e desvantagens', 'pros and cons',
  'casos de uso', 'use cases', 'aplicações', 'applications',
];

/**
 * Analisa se uma query requer tratamento de depth estendido
 */
export function analyzeDepthRequirements(
  query: string,
  category: string,
  _previousTimeoutMs?: number
): DepthAnalysis {
  const detectedSignals: string[] = [];
  let depthScore = 0;

  // Sinal 1: Categoria de depth
  if (category === 'research' || category === 'depth') {
    depthScore += 30;
    detectedSignals.push(`category=${category}`);
  }

  // Sinal 2: Padrões semânticos de depth
  for (const pattern of DEPTH_SIGNALS) {
    if (pattern.test(query)) {
      depthScore += 15;
      detectedSignals.push(`pattern:${pattern.source.slice(0, 30)}`);
    }
  }

  // Sinal 3: Keywords de depth
  const queryLower = query.toLowerCase();
  const matchedKeywords = DEPTH_KEYWORDS.filter(kw => queryLower.includes(kw));
  if (matchedKeywords.length > 0) {
    depthScore += matchedKeywords.length * 5;
    detectedSignals.push(`keywords:${matchedKeywords.slice(0, 3).join(',')}`);
  }

  // Sinal 4: Comprimento da query (queries longas indicam complexidade)
  if (query.length > 300) {
    depthScore += 20;
    detectedSignals.push(`long_query:${query.length}chars`);
  } else if (query.length > 150) {
    depthScore += 10;
    detectedSignals.push(`medium_query:${query.length}chars`);
  }

  // Sinal 5: Múltiplas perguntas ou aspectos
  const questionCount = (query.match(/\?/g) || []).length;
  if (questionCount > 1) {
    depthScore += questionCount * 8;
    detectedSignals.push(`multi_question:${questionCount}`);
  }

  const isDepthQuery = depthScore >= 25;

  // Determinar ação e timeout
  let action: DepthAnalysis['action'] = 'standard';
  let recommendedTimeoutMs = DEFAULT_CONFIG.defaultTimeoutMs;
  let depthPrmThreshold = DEFAULT_CONFIG.universalDepthPrmThreshold; // Universal: 0.3

  if (isDepthQuery) {
    if (depthScore >= 60) {
      action = 'streaming';
      recommendedTimeoutMs = DEFAULT_CONFIG.extendedTimeoutMs; // 150s
    } else if (depthScore >= 40) {
      action = 'extended_timeout';
      recommendedTimeoutMs = DEFAULT_CONFIG.extendedTimeoutMs; // 150s
    } else {
      action = 'extended_timeout';
      recommendedTimeoutMs = Math.round(DEFAULT_CONFIG.defaultTimeoutMs * 1.5); // 135s
    }
    depthPrmThreshold = 0.25; // Mais agressivo para queries de depth
  }

  logger.info('DepthTimeoutExtender analysis', {
    isDepthQuery,
    depthScore,
    action,
    recommendedTimeoutMs,
    signalCount: detectedSignals.length,
  });

  return {
    isDepthQuery,
    depthScore,
    recommendedTimeoutMs,
    depthPrmThreshold,
    detectedSignals,
    action,
  };
}

/**
 * Aplica configuração de timeout estendido ao contexto de execução
 * Integra com o pipeline principal de MOTHER
 */
export function applyDepthTimeoutConfig(
  analysis: DepthAnalysis,
  baseConfig: Partial<DepthTimeoutConfig> = {}
): DepthTimeoutConfig {
  const merged = { ...DEFAULT_CONFIG, ...baseConfig };

  if (analysis.isDepthQuery) {
    return {
      ...merged,
      defaultTimeoutMs: analysis.recommendedTimeoutMs,
      defaultDepthPrmThreshold: analysis.depthPrmThreshold,
    };
  }

  return merged;
}

/**
 * Verifica se uma resposta atende ao critério de depth
 * Baseado em: comprimento, estrutura, citações, exemplos
 */
export function verifyDepthQuality(
  response: string,
  query: string,
  minDepthScore: number = 0.3
): { passes: boolean; depthScore: number; deficiencies: string[] } {
  const deficiencies: string[] = [];
  let score = 0;
  const total = 100;

  // Critério 1: Comprimento mínimo (25 pts)
  const wordCount = response.split(/\s+/).length;
  if (wordCount >= 500) {
    score += 25;
  } else if (wordCount >= 200) {
    score += 15;
    deficiencies.push(`response_too_short:${wordCount}words`);
  } else {
    deficiencies.push(`response_very_short:${wordCount}words`);
  }

  // Critério 2: Estrutura (headers, listas) (20 pts)
  const hasHeaders = /^#{1,3}\s/m.test(response) || /\*\*[^*]+\*\*/m.test(response);
  const hasLists = /^[-*•]\s/m.test(response) || /^\d+\.\s/m.test(response);
  if (hasHeaders && hasLists) {
    score += 20;
  } else if (hasHeaders || hasLists) {
    score += 10;
    deficiencies.push('missing_structure');
  } else {
    deficiencies.push('no_structure');
  }

  // Critério 3: Exemplos concretos (20 pts)
  const hasExamples = /por exemplo|e\.g\.|exemplo:|ex:|for example|such as/i.test(response);
  const hasCode = /```[\s\S]*?```/.test(response);
  if (hasExamples || hasCode) {
    score += 20;
  } else {
    deficiencies.push('no_examples');
  }

  // Critério 4: Múltiplos aspectos/perspectivas (20 pts)
  const paragraphCount = response.split(/\n\n+/).length;
  if (paragraphCount >= 5) {
    score += 20;
  } else if (paragraphCount >= 3) {
    score += 10;
    deficiencies.push(`few_paragraphs:${paragraphCount}`);
  } else {
    deficiencies.push(`single_paragraph:${paragraphCount}`);
  }

  // Critério 5: Cobertura da query (15 pts)
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const responseLower = response.toLowerCase();
  const coveredWords = queryWords.filter(w => responseLower.includes(w));
  const coverage = queryWords.length > 0 ? coveredWords.length / queryWords.length : 1;
  if (coverage >= 0.7) {
    score += 15;
  } else if (coverage >= 0.4) {
    score += 8;
    deficiencies.push(`low_coverage:${Math.round(coverage * 100)}%`);
  } else {
    deficiencies.push(`very_low_coverage:${Math.round(coverage * 100)}%`);
  }

  const normalizedScore = score / total;
  const passes = normalizedScore >= minDepthScore;

  logger.info('DepthQualityVerifier result', {
    passes,
    depthScore: normalizedScore,
    wordCount,
    paragraphCount,
    coverage,
    deficiencies,
  });

  return {
    passes,
    depthScore: normalizedScore,
    deficiencies,
  };
}

export { DEFAULT_CONFIG as DepthTimeoutDefaults };
