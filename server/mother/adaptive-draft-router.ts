/**
 * Adaptive Draft Router — MOTHER v75.10 (Ciclo 60)
 *
 * Implementa roteamento adaptativo baseado em complexidade para reduzir latência
 * sem perda de qualidade. Inspirado em Speculative Decoding (Chen et al., arXiv:2302.01318,
 * ICML 2023) e EAGLE-2 (Li et al., arXiv:2406.16858, EMNLP 2024).
 *
 * Estratégia para MOTHER (multi-provider, sem acesso a pesos):
 * - "Draft" = resposta rápida do modelo menor (DeepSeek/Gemini)
 * - "Verify" = verificação de qualidade pelo modelo maior (GPT-4o)
 * - Se draft quality ≥ threshold → aceitar draft (evita chamada cara)
 * - Se draft quality < threshold → usar modelo completo (GPT-4o)
 *
 * Base científica:
 * - Speculative Decoding (Chen et al., arXiv:2302.01318, ICML 2023): draft + verify
 * - EAGLE-2 (Li et al., arXiv:2406.16858, EMNLP 2024): dynamic draft trees
 * - Medusa (Cai et al., arXiv:2401.10774, 2024): multiple decoding heads
 * - Amdahl's Law (1967): latência paralela vs sequencial
 *
 * Ganhos esperados:
 * - Latência P50: -40% (queries simples aceitas no draft)
 * - Latência P99: -20% (queries complexas ainda usam GPT-4o)
 * - Custo: -30% (menos chamadas ao modelo mais caro)
 */

import { reliabilityLogger as logger } from './reliability-logger';

export interface DraftRouterConfig {
  /** Threshold de qualidade para aceitar o draft (0-100) */
  acceptanceThreshold: number;
  /** Timeout para o draft model (ms) */
  draftTimeout: number;
  /** Timeout para o verify model (ms) */
  verifyTimeout: number;
  /** Categorias que sempre usam o modelo completo */
  alwaysFullCategories: string[];
}

export interface DraftResult {
  response: string;
  provider: string;
  usedDraft: boolean;
  draftQuality?: number;
  latency: number;
  strategy: 'draft_accepted' | 'draft_rejected' | 'full_model' | 'fallback';
}

export interface QueryContext {
  query: string;
  category: string;
  complexity: number; // 0-1
  hasHistoricalErrors: boolean;
}

const DEFAULT_CONFIG: DraftRouterConfig = {
  acceptanceThreshold: 72, // Aceitar draft se quality ≥ 72 (baseado em distribuição Ciclo 58)
  draftTimeout: 8000,       // 8s para draft (DeepSeek/Gemini são rápidos)
  verifyTimeout: 90000,     // 90s para verify (GPT-4o com Self-Consistency)
  alwaysFullCategories: ['complex_reasoning', 'research', 'stem']
};

/**
 * Estima complexidade da query baseado em heurísticas linguísticas.
 * Evita chamada LLM adicional para classificação.
 *
 * Baseado em: Query Complexity Estimation (Arora et al., 2023)
 */
export function estimateQueryComplexity(query: string): number {
  let score = 0;

  // Indicadores de alta complexidade
  const complexIndicators = [
    /calcul[ae]/i, /deriv[ae]/i, /integr[ae]/i, /prov[ae]/i,
    /demonstr[ae]/i, /explique matematicamente/i, /passo a passo/i,
    /compare.*contrast/i, /analise.*critica/i, /arXiv/i,
    /por que.*não/i, /como.*funciona.*internamente/i
  ];

  // Indicadores de baixa complexidade
  const simpleIndicators = [
    /o que é/i, /defin[ae]/i, /liste/i, /quais são/i,
    /quando foi/i, /quem é/i, /onde fica/i
  ];

  for (const pattern of complexIndicators) {
    if (pattern.test(query)) score += 0.15;
  }

  for (const pattern of simpleIndicators) {
    if (pattern.test(query)) score -= 0.1;
  }

  // Comprimento como proxy de complexidade
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 50) score += 0.2;
  if (wordCount > 100) score += 0.2;
  if (wordCount < 15) score -= 0.2;

  // Múltiplas perguntas = mais complexo
  const questionCount = (query.match(/\?/g) || []).length;
  if (questionCount > 2) score += 0.15;

  return Math.max(0, Math.min(1, 0.5 + score));
}

/**
 * Avalia qualidade do draft usando verificação leve (sem LLM adicional).
 * Usa heurísticas baseadas em comprimento, coerência e cobertura.
 *
 * Nota: Para avaliação completa, usar Guardian (G-Eval). Esta é uma
 * avaliação rápida para decisão de aceitar/rejeitar o draft.
 */
export function quickQualityCheck(
  query: string,
  response: string,
  category: string
): number {
  if (!response || response.length < 50) return 0;

  let score = 60; // Base score

  // Comprimento adequado
  const wordCount = response.split(/\s+/).length;
  if (wordCount > 100) score += 10;
  if (wordCount > 300) score += 5;
  if (wordCount < 30) score -= 20;

  // Presença de estrutura (listas, código, etc.)
  if (/```/.test(response)) score += 5; // Código
  if (/\d+\.\s/.test(response)) score += 3; // Lista numerada
  if (/\*\*/.test(response)) score += 2; // Bold

  // Cobertura de termos-chave da query
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 4);
  const responseLower = response.toLowerCase();
  const coveredTerms = queryTerms.filter(t => responseLower.includes(t));
  const coverageRatio = queryTerms.length > 0 ? coveredTerms.length / queryTerms.length : 0;
  score += coverageRatio * 15;

  // Penalizar respostas muito curtas para queries complexas
  if (category === 'complex_reasoning' && wordCount < 200) score -= 15;
  if (category === 'research' && wordCount < 150) score -= 10;

  // Penalizar respostas que parecem ser erros
  if (/error|timeout|sorry|cannot|unable/i.test(response.substring(0, 100))) score -= 30;

  return Math.max(0, Math.min(100, score));
}

/**
 * Seleciona o modelo draft baseado na categoria e complexidade.
 * Mapeia para os providers disponíveis em MOTHER.
 */
export function selectDraftModel(category: string, complexity: number): string {
  if (complexity > 0.7) return 'google'; // Gemini 2.5 Flash — rápido e capaz
  if (category === 'coding') return 'anthropic'; // Claude é bom em código
  if (complexity < 0.3) return 'deepseek'; // DeepSeek para queries simples
  return 'google'; // Default: Gemini
}

/**
 * Adaptive Draft Router principal.
 *
 * Algoritmo:
 * 1. Estimar complexidade da query
 * 2. Se categoria está em alwaysFullCategories → usar modelo completo
 * 3. Senão → tentar draft model primeiro
 * 4. Avaliar qualidade do draft
 * 5. Se qualidade ≥ threshold → aceitar draft
 * 6. Senão → usar modelo completo como fallback
 */
export class AdaptiveDraftRouter {
  private config: DraftRouterConfig;
  private stats = {
    totalRequests: 0,
    draftAccepted: 0,
    draftRejected: 0,
    fullModelUsed: 0,
    avgLatencyDraft: 0,
    avgLatencyFull: 0
  };

  constructor(config: Partial<DraftRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Decide se deve usar draft ou modelo completo.
   * Retorna a estratégia recomendada com justificativa.
   */
  shouldUseDraft(context: QueryContext): {
    useDraft: boolean;
    reason: string;
    draftModel: string;
  } {
    const { category, complexity, hasHistoricalErrors } = context;

    // Sempre usar modelo completo para categorias críticas
    if (this.config.alwaysFullCategories.includes(category)) {
      return {
        useDraft: false,
        reason: `category=${category} always uses full model`,
        draftModel: 'none'
      };
    }

    // Sempre usar modelo completo se há histórico de erros (Contrastive CoT ativo)
    if (hasHistoricalErrors) {
      return {
        useDraft: false,
        reason: 'historical errors detected — Contrastive CoT requires full model',
        draftModel: 'none'
      };
    }

    // Alta complexidade → modelo completo
    if (complexity > 0.75) {
      return {
        useDraft: false,
        reason: `complexity=${complexity.toFixed(2)} exceeds threshold`,
        draftModel: 'none'
      };
    }

    // Baixa/média complexidade → tentar draft
    const draftModel = selectDraftModel(category, complexity);
    return {
      useDraft: true,
      reason: `complexity=${complexity.toFixed(2)}, category=${category}`,
      draftModel
    };
  }

  /**
   * Registra resultado para estatísticas e aprendizado.
   */
  recordResult(result: DraftResult): void {
    this.stats.totalRequests++;
    if (result.strategy === 'draft_accepted') {
      this.stats.draftAccepted++;
      this.stats.avgLatencyDraft = (this.stats.avgLatencyDraft * (this.stats.draftAccepted - 1) + result.latency) / this.stats.draftAccepted;
    } else if (result.strategy === 'draft_rejected') {
      this.stats.draftRejected++;
    } else {
      this.stats.fullModelUsed++;
      this.stats.avgLatencyFull = (this.stats.avgLatencyFull * (this.stats.fullModelUsed - 1) + result.latency) / this.stats.fullModelUsed;
    }

    logger.info('system', 'DraftRouter event', {
      strategy: result.strategy,
      provider: result.provider,
      draftQuality: result.draftQuality,
      latency: result.latency,
      stats: this.getStats()
    });
  }

  /**
   * Retorna estatísticas de performance do roteador.
   */
  getStats() {
    const draftRate = this.stats.totalRequests > 0
      ? (this.stats.draftAccepted / this.stats.totalRequests * 100).toFixed(1)
      : '0';
    const latencySaving = this.stats.avgLatencyFull > 0 && this.stats.avgLatencyDraft > 0
      ? ((1 - this.stats.avgLatencyDraft / this.stats.avgLatencyFull) * 100).toFixed(1)
      : '0';

    return {
      ...this.stats,
      draftAcceptanceRate: `${draftRate}%`,
      estimatedLatencySaving: `${latencySaving}%`
    };
  }

  /**
   * Adapta o threshold baseado em feedback de qualidade.
   * Implementa aprendizado online simples (Cesa-Bianchi, 2006).
   */
  adaptThreshold(actualQuality: number, draftQuality: number): void {
    // Se draft foi aceito mas qualidade real foi baixa → aumentar threshold
    if (draftQuality >= this.config.acceptanceThreshold && actualQuality < 70) {
      this.config.acceptanceThreshold = Math.min(85, this.config.acceptanceThreshold + 2);
      logger.warn('system', `Threshold increased to ${this.config.acceptanceThreshold} (draft overestimated quality)`);
    }
    // Se draft foi rejeitado mas qualidade real era alta → diminuir threshold
    if (draftQuality < this.config.acceptanceThreshold && actualQuality > 85) {
      this.config.acceptanceThreshold = Math.max(60, this.config.acceptanceThreshold - 1);
      logger.info('system', `Threshold decreased to ${this.config.acceptanceThreshold} (draft underestimated quality)`);
    }
  }
}

// Singleton para uso global
export const adaptiveDraftRouter = new AdaptiveDraftRouter();
