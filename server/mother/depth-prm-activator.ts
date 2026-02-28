/**
 * Depth PRM Activator — MOTHER v75.11 (Ciclo 61)
 *
 * Resolve NC-DEPTH-003: Depth gap -10 em queries técnicas sem cache (Q7/Q8).
 *
 * Base científica:
 * - Lightman et al. (2023) Let's Verify Step by Step — PRM (arXiv:2305.20050, ICLR 2024)
 *   "Process supervision significantly outperforms outcome supervision.
 *    Our process-supervised model solves 78% of problems from MATH test set."
 * - Wang et al. (2024) Math-Shepherd (arXiv:2312.08935, ACL 2024)
 *   "Step-level process reward provides more granular feedback than outcome reward."
 * - Benchmark Ciclo 59 (MOTHER v75.9):
 *   Q7 (depth): MOTHER 75 vs Manus 85 (Δ -10) — queries técnicas sem cache
 *   Q8 (depth): MOTHER 75 vs Manus 85 (Δ -10) — queries técnicas sem cache
 *   Causa raiz: ProcessRewardVerifier ativo apenas para complex_reasoning e stem,
 *   não para queries classificadas como "depth" (geralmente research ou general).
 *
 * Solução (Ciclo 61):
 *   Estender ProcessRewardVerifier para detectar queries de "depth" implícito:
 *   - Queries técnicas longas (> 150 chars) em qualquer categoria
 *   - Queries com indicadores de profundidade: "explique detalhadamente", "como funciona"
 *   - Queries sobre conceitos técnicos complexos (ML, física, matemática, engenharia)
 *
 * Ganho esperado:
 *   NC-DEPTH-003: Q7/Q8 de 75 → 85+ (alvo: empatar com Manus)
 *   Depth gap: -10 → 0 ou positivo
 */

import { verifyReasoning, type PRMConfig, type PRMVerificationResult } from './process-reward-verifier.js';
import { createLogger } from '../_core/logger.js';

const logger = createLogger('depth-prm-activator');

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DepthPRMResult {
  /** Se a verificação de depth foi ativada */
  triggered: boolean;
  /** Razão para ativação */
  triggerReason: string;
  /** Resultado da verificação PRM */
  prmResult?: PRMVerificationResult;
  /** Indicadores de depth detectados na query */
  depthIndicators: string[];
  /** Score de depth estimado (0-1) */
  depthScore: number;
}

// ─── Indicadores de queries de depth ─────────────────────────────────────────

/**
 * Indicadores linguísticos de queries que requerem profundidade técnica
 * Baseado em análise das queries Q7/Q8 do Benchmark Ciclo 59
 */
const DEPTH_LINGUISTIC_INDICATORS = [
  // Pedidos explícitos de profundidade
  /explique detalhadamente/i,
  /como funciona/i,
  /descreva o processo/i,
  /quais são as etapas/i,
  /passo a passo/i,
  /em profundidade/i,
  /aprofunde/i,
  /detalhe/i,
  /elabore/i,
  /analise/i,
  /compare e contraste/i,
  /quais são as diferenças/i,
  /vantagens e desvantagens/i,
  /pros e contras/i,
  // Pedidos de explicação técnica
  /por que.*funciona/i,
  /como.*implementar/i,
  /qual.*mecanismo/i,
  /qual.*algoritmo/i,
  /qual.*arquitetura/i,
  /como.*otimizar/i,
  /como.*melhorar/i,
];

/**
 * Domínios técnicos que tipicamente requerem depth
 */
const TECHNICAL_DOMAIN_PATTERNS = [
  /machine learning|deep learning|neural network|transformer|attention/i,
  /algoritmo|complexidade|big.?o|otimização/i,
  /física|mecânica quântica|termodinâmica|eletromagnetismo/i,
  /matemática|cálculo|álgebra linear|estatística|probabilidade/i,
  /engenharia|sistema|arquitetura|infraestrutura/i,
  /biologia|genética|proteína|célula|dna/i,
  /química|reação|molécula|átomo|ligação/i,
  /economia|mercado|inflação|política monetária/i,
  /filosofia|epistemologia|ontologia|ética/i,
  /linguística|semântica|pragmática|sintaxe/i,
];

// ─── Detecção de queries de depth ────────────────────────────────────────────

/**
 * Detecta se uma query requer resposta de alta profundidade técnica
 *
 * Critérios (baseados na análise de Q7/Q8 do Benchmark Ciclo 59):
 * 1. Query longa (> 150 chars) — indica complexidade
 * 2. Indicadores linguísticos de depth
 * 3. Domínio técnico identificado
 * 4. Categoria não é já complex_reasoning ou stem (já têm PRM)
 */
function detectDepthQuery(
  query: string,
  category: string
): { isDepthQuery: boolean; indicators: string[]; score: number } {
  // Categorias que já têm PRM ativo — não duplicar
  if (['complex_reasoning', 'stem'].includes(category)) {
    return { isDepthQuery: false, indicators: [], score: 0 };
  }

  const indicators: string[] = [];
  let score = 0;

  // Critério 1: Query longa (indica complexidade)
  if (query.length > 200) {
    indicators.push(`long_query (${query.length} chars)`);
    score += 0.3;
  } else if (query.length > 150) {
    indicators.push(`medium_query (${query.length} chars)`);
    score += 0.15;
  }

  // Critério 2: Indicadores linguísticos de depth
  for (const pattern of DEPTH_LINGUISTIC_INDICATORS) {
    if (pattern.test(query)) {
      const match = query.match(pattern)?.[0] ?? pattern.source;
      indicators.push(`linguistic: "${match}"`);
      score += 0.25;
      break; // Contar apenas uma vez
    }
  }

  // Critério 3: Domínio técnico
  for (const pattern of TECHNICAL_DOMAIN_PATTERNS) {
    if (pattern.test(query)) {
      const match = query.match(pattern)?.[0] ?? pattern.source;
      indicators.push(`technical_domain: "${match}"`);
      score += 0.2;
      break; // Contar apenas uma vez
    }
  }

  // Critério 4: Múltiplas perguntas na mesma query (indica depth)
  const questionCount = (query.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    indicators.push(`multiple_questions (${questionCount})`);
    score += 0.15;
  }

  // Critério 5: Categoria research com query técnica
  if (category === 'research' && score > 0.2) {
    indicators.push('research_category_with_depth_indicators');
    score += 0.1;
  }

  return {
    isDepthQuery: score >= 0.4, // Threshold: pelo menos 2 critérios
    indicators,
    score: Math.min(score, 1.0),
  };
}

// ─── Configuração PRM para depth ─────────────────────────────────────────────

/**
 * Configuração PRM otimizada para queries de depth
 * Mais permissiva que para complex_reasoning (menos passos obrigatórios)
 */
const DEPTH_PRM_CONFIG: PRMConfig = {
  minStepsForVerification: 2,      // Menos passos obrigatórios (depth pode ter 2-3 passos)
  maxStepsToVerify: 8,             // Mais passos verificados (depth tem mais conteúdo)
  stepCorrectnessThreshold: 55,    // Threshold ligeiramente mais baixo (depth é mais subjetivo, escala 0-100)
  mandatoryCategories: ['complex_reasoning', 'stem', 'depth_detected'],
};

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Depth PRM Activator
 *
 * Estende o ProcessRewardVerifier (Ciclo 60) para queries de depth implícito.
 * Resolve NC-DEPTH-003: Q7/Q8 depth gap -10 (MOTHER 75 vs Manus 85).
 *
 * Diferença vs comportamento anterior (Ciclo 60):
 *   ANTES: PRM ativo apenas para complex_reasoning e stem
 *          → queries de depth em "general" ou "research" sem verificação
 *          → respostas rasas → score 75 vs Manus 85
 *   AGORA: detectar depth implícito em qualquer categoria
 *          → verificar passos de raciocínio para queries técnicas profundas
 *          → respostas mais completas → score 85+ (alvo)
 *
 * @param query - Query do usuário
 * @param response - Resposta gerada pelo LLM
 * @param category - Categoria detectada pelo Intelligence Router
 */
export async function applyDepthPRM(
  query: string,
  response: string,
  category: string
): Promise<DepthPRMResult> {
  const { isDepthQuery, indicators, score } = detectDepthQuery(query, category);

  if (!isDepthQuery) {
    return {
      triggered: false,
      triggerReason: `Not a depth query (score=${score.toFixed(2)} < 0.4)`,
      depthIndicators: indicators,
      depthScore: score,
    };
  }

  logger.info(
    `Depth PRM triggered: score=${score.toFixed(2)}, indicators=${indicators.length}`,
    { category, queryLength: query.length, indicators }
  );

  // Aplicar verificação PRM com configuração de depth
  const prmResult = verifyReasoning(
    response,
    query,
    'depth_detected', // Categoria virtual para ativar PRM
    DEPTH_PRM_CONFIG
  );

  logger.info(
    `Depth PRM result: overallScore=${prmResult.overallScore.toFixed(2)}, action=${prmResult.action}`,
    { stepsCount: prmResult.steps?.length ?? 0, firstErrorStep: prmResult.firstErrorStep }
  );

  return {
    triggered: true,
    triggerReason: `Depth query detected (score=${score.toFixed(2)}): ${indicators.join(', ')}`,
    prmResult,
    depthIndicators: indicators,
    depthScore: score,
  };
}

/**
 * Verifica se uma query deve ter PRM de depth aplicado
 * Função rápida para uso no pipeline principal sem overhead
 */
export function shouldApplyDepthPRM(query: string, category: string): boolean {
  const { isDepthQuery } = detectDepthQuery(query, category);
  return isDepthQuery;
}

/**
 * Gera prompt de enriquecimento para queries de depth
 * Instrui o LLM a fornecer resposta mais profunda e estruturada
 *
 * Baseado em: Lightman et al. (2023) — process supervision melhora
 * quando o modelo é instruído a mostrar o raciocínio passo a passo.
 */
export function buildDepthEnrichmentPrompt(query: string, depthScore: number): string {
  if (depthScore < 0.4) return '';

  const intensity = depthScore >= 0.7 ? 'muito detalhada e aprofundada' : 'detalhada e estruturada';

  return `

## INSTRUÇÃO DE PROFUNDIDADE (Depth PRM Ativo)

Esta query requer uma resposta ${intensity}. Por favor:
1. Estruture sua resposta em seções claras com títulos
2. Explique cada conceito com exemplos concretos
3. Mostre o raciocínio passo a passo onde aplicável
4. Inclua comparações, contrastes ou trade-offs quando relevante
5. Conclua com um resumo dos pontos principais

Profundidade esperada: ${depthScore >= 0.7 ? 'máxima (análise completa)' : 'alta (cobertura abrangente)'}
`;
}
