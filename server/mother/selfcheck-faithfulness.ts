/**
 * SelfCheck Faithfulness Calibrator — MOTHER v75.10 (Ciclo 60)
 *
 * Implementa detecção de alucinações baseada em consistência de amostras,
 * inspirado no SelfCheckGPT (Manakul et al., arXiv:2303.08896, EMNLP 2023).
 *
 * Princípio central (Manakul et al., 2023):
 * "Se um LLM tem conhecimento de um conceito, respostas amostradas são
 * provavelmente similares e contêm fatos consistentes. Para fatos alucinados,
 * respostas amostradas tendem a divergir e contradizer umas às outras."
 *
 * Adaptação para MOTHER (multi-provider):
 * - Em vez de amostrar o mesmo modelo N vezes, comparamos respostas de
 *   providers diferentes (OpenAI, Anthropic, Google) para o mesmo prompt
 * - Inconsistências entre providers indicam possível alucinação
 * - Quando inconsistência é alta → ativar CoVe (arXiv:2309.11495) para verificação
 *
 * Base científica:
 * - SelfCheckGPT (Manakul et al., arXiv:2303.08896, EMNLP 2023)
 * - CoVe (Dhuliawala et al., arXiv:2309.11495, ACL 2024)
 * - FactScore (Min et al., arXiv:2305.14251, EMNLP 2023)
 * - Semantic Similarity (Reimers & Gurevych, arXiv:1908.10084, EMNLP 2019)
 *
 * Resultados esperados:
 * - NC-DEPTH-002: Q2 faithfulness 31.13 → > 60 (alvo: resolver gap crítico)
 * - AUC-PR sentence-level: +15% vs baseline (baseado em Manakul et al., 2023)
 */

import { reliabilityLogger as logger } from './reliability-logger';

export interface FaithfulnessCheckResult {
  /** Score de consistência entre 0-100 (100 = totalmente consistente) */
  consistencyScore: number;
  /** Se alucinação foi detectada */
  hallucinationDetected: boolean;
  /** Sentenças suspeitas identificadas */
  suspiciousSentences: string[];
  /** Recomendação de ação */
  action: 'accept' | 'verify_with_cove' | 'regenerate' | 'flag';
  /** Evidência de inconsistência */
  inconsistencyEvidence: string[];
}

export interface SelfCheckConfig {
  /** Threshold de consistência abaixo do qual ativa CoVe */
  coveActivationThreshold: number;
  /** Threshold abaixo do qual recomenda regeneração */
  regenerateThreshold: number;
  /** Número mínimo de sentenças para análise */
  minSentences: number;
  /** Categorias onde faithfulness é crítica */
  criticalCategories: string[];
}

const DEFAULT_CONFIG: SelfCheckConfig = {
  coveActivationThreshold: 70, // Ativar CoVe se consistência < 70
  regenerateThreshold: 40,     // Regenerar se consistência < 40
  minSentences: 3,
  criticalCategories: ['research', 'complex_reasoning', 'stem']
};

/**
 * Extrai sentenças factuais de uma resposta.
 * Foca em afirmações verificáveis (números, datas, nomes, citações).
 */
export function extractFactualSentences(text: string): string[] {
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);

  // Priorizar sentenças com conteúdo factual
  const factualPatterns = [
    /\d{4}/, // Anos
    /arXiv:\d+\.\d+/, // Citações arXiv
    /\d+[%°]/, // Percentagens/graus
    /[A-Z][a-z]+ et al\./, // Citações acadêmicas
    /\b(demonstrou|mostrou|publicou|propôs|alcançou)\b/i, // Verbos factuais
    /\b(\d+\.?\d*)\s*(pp|%|pontos|tokens|parâmetros)\b/i // Métricas
  ];

  return sentences.filter(s =>
    factualPatterns.some(p => p.test(s))
  ).slice(0, 10); // Máximo 10 sentenças para análise
}

/**
 * Calcula similaridade semântica simples entre duas strings.
 * Usa Jaccard similarity sobre n-gramas de palavras como proxy.
 * Para produção, usar embeddings (Sentence-BERT, arXiv:1908.10084).
 */
export function computeTextSimilarity(text1: string, text2: string): number {
  const normalize = (t: string) => t.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size; // Jaccard similarity
}

/**
 * Detecta contradições numéricas entre duas respostas.
 * Números diferentes para o mesmo contexto indicam possível alucinação.
 */
export function detectNumericalContradictions(
  response1: string,
  response2: string
): string[] {
  const contradictions: string[] = [];

  // Extrair pares (contexto, número) de cada resposta
  const extractNumbers = (text: string): Map<string, number[]> => {
    const map = new Map<string, number[]>();
    const patterns = [
      /(\w+(?:\s+\w+){0,3})\s+(?:é|foi|são|foram|alcançou|atingiu)\s+(\d+(?:\.\d+)?)/gi,
      /(\d+(?:\.\d+)?)\s*(%|pp|pontos)\s+(?:em|no|na|de)\s+(\w+)/gi,
      /arXiv:(\d+\.\d+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const key = match[1]?.toLowerCase() || 'number';
        const val = parseFloat(match[2] || match[1]);
        if (!isNaN(val)) {
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(val);
        }
      }
    }
    return map;
  };

  const nums1 = extractNumbers(response1);
  const nums2 = extractNumbers(response2);

  // Comparar números para contextos similares
  for (const [key1, vals1] of nums1) {
    for (const [key2, vals2] of nums2) {
      const keySimilarity = computeTextSimilarity(key1, key2);
      if (keySimilarity > 0.5) {
        for (const v1 of vals1) {
          for (const v2 of vals2) {
            // Contradição se diferença > 20%
            if (Math.abs(v1 - v2) / Math.max(v1, v2) > 0.2) {
              contradictions.push(`"${key1}": ${v1} vs ${v2}`);
            }
          }
        }
      }
    }
  }

  return contradictions;
}

/**
 * Verifica consistência de uma resposta comparando com contexto do bd_central.
 * Implementa a lógica central do SelfCheckGPT adaptada para MOTHER.
 *
 * @param primaryResponse - Resposta principal a verificar
 * @param referenceResponses - Respostas de referência (outros providers ou bd_central)
 * @param query - Query original
 * @param category - Categoria da query
 */
export function checkFaithfulness(
  primaryResponse: string,
  referenceResponses: string[],
  query: string,
  category: string,
  config: SelfCheckConfig = DEFAULT_CONFIG
): FaithfulnessCheckResult {

  if (!primaryResponse || primaryResponse.length < 50) {
    return {
      consistencyScore: 0,
      hallucinationDetected: true,
      suspiciousSentences: [],
      action: 'regenerate',
      inconsistencyEvidence: ['Response too short or empty']
    };
  }

  if (referenceResponses.length === 0) {
    // Sem referências → análise baseada apenas em heurísticas internas
    return performInternalCheck(primaryResponse, query, category, config);
  }

  const inconsistencyEvidence: string[] = [];
  const suspiciousSentences: string[] = [];
  let totalConsistencyScore = 0;
  let checkCount = 0;

  // 1. Verificar consistência com cada resposta de referência
  for (const reference of referenceResponses) {
    if (!reference || reference.length < 50) continue;

    const similarity = computeTextSimilarity(primaryResponse, reference);
    totalConsistencyScore += similarity * 100;
    checkCount++;

    // Detectar contradições numéricas
    const contradictions = detectNumericalContradictions(primaryResponse, reference);
    if (contradictions.length > 0) {
      inconsistencyEvidence.push(...contradictions.map(c => `Numerical contradiction: ${c}`));
    }

    // Baixa similaridade = possível divergência factual
    if (similarity < 0.15) {
      inconsistencyEvidence.push(`Low semantic similarity (${(similarity * 100).toFixed(1)}%) with reference response`);
    }
  }

  // 2. Extrair e verificar sentenças factuais
  const factualSentences = extractFactualSentences(primaryResponse);
  for (const sentence of factualSentences) {
    let sentenceConsistency = 0;
    let sentenceChecks = 0;

    for (const reference of referenceResponses) {
      if (!reference) continue;
      const sim = computeTextSimilarity(sentence, reference);
      sentenceConsistency += sim;
      sentenceChecks++;
    }

    const avgSentenceConsistency = sentenceChecks > 0
      ? sentenceConsistency / sentenceChecks
      : 0.5;

    // Sentença suspeita se consistência < 20%
    if (avgSentenceConsistency < 0.2 && sentence.length > 30) {
      suspiciousSentences.push(sentence);
    }
  }

  // 3. Calcular score final
  const avgConsistency = checkCount > 0
    ? totalConsistencyScore / checkCount
    : 50;

  // Penalizar por contradições numéricas
  const contradictionPenalty = Math.min(30, inconsistencyEvidence.length * 10);
  const finalScore = Math.max(0, Math.min(100, avgConsistency - contradictionPenalty));

  // 4. Determinar ação
  let action: FaithfulnessCheckResult['action'];
  if (finalScore < config.regenerateThreshold) {
    action = 'regenerate';
  } else if (finalScore < config.coveActivationThreshold) {
    action = 'verify_with_cove';
  } else if (suspiciousSentences.length > 2) {
    action = 'flag';
  } else {
    action = 'accept';
  }

  const hallucinationDetected = finalScore < 60 || suspiciousSentences.length > 3;

  logger.info('system', 'SelfCheck event', {
    consistencyScore: finalScore,
    hallucinationDetected,
    suspiciousCount: suspiciousSentences.length,
    inconsistencyCount: inconsistencyEvidence.length,
    action,
    category
  });

  return {
    consistencyScore: finalScore,
    hallucinationDetected,
    suspiciousSentences,
    action,
    inconsistencyEvidence
  };
}

/**
 * Verificação interna quando não há respostas de referência.
 * Usa heurísticas baseadas em padrões de alucinação conhecidos.
 */
function performInternalCheck(
  response: string,
  query: string,
  category: string,
  config: SelfCheckConfig
): FaithfulnessCheckResult {
  const inconsistencyEvidence: string[] = [];
  let score = 70; // Score base sem referências

  // Detectar padrões de alucinação comuns
  const hallucinationPatterns = [
    { pattern: /arXiv:\d{4}\.\d{4,5}/, check: (m: string) => {
      // Verificar se o arXiv ID parece válido (ano 2000-2026)
      const year = parseInt(m.replace('arXiv:', '').substring(0, 2));
      return year < 0 || year > 26;
    }, penalty: 20, msg: 'Potentially invalid arXiv ID' },
    { pattern: /\b(100%|perfeito|nunca falha|sempre correto)\b/i,
      check: () => true, penalty: 10, msg: 'Overconfident claim detected' },
    { pattern: /\b(\d{4})\b/, check: (m: string) => {
      const year = parseInt(m);
      return year > 2026 || year < 1950;
    }, penalty: 15, msg: 'Potentially invalid year' }
  ];

  for (const { pattern, check, penalty, msg } of hallucinationPatterns) {
    const matches = response.match(new RegExp(pattern, 'g')) || [];
    for (const match of matches) {
      if (check(match)) {
        score -= penalty;
        inconsistencyEvidence.push(msg);
        break;
      }
    }
  }

  // Verificar cobertura da query
  const queryCoverage = computeTextSimilarity(query, response);
  if (queryCoverage < 0.1) {
    score -= 15;
    inconsistencyEvidence.push('Low query coverage — response may be off-topic');
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const action = finalScore < config.regenerateThreshold ? 'regenerate'
    : finalScore < config.coveActivationThreshold ? 'verify_with_cove'
    : 'accept';

  return {
    consistencyScore: finalScore,
    hallucinationDetected: finalScore < 60,
    suspiciousSentences: [],
    action,
    inconsistencyEvidence
  };
}

/**
 * Integração com o pipeline principal de MOTHER.
 * Chamado após geração da resposta, antes de retornar ao usuário.
 *
 * Fluxo:
 * 1. Verificar faithfulness da resposta principal
 * 2. Se action = 'verify_with_cove' → ativar CoVe (arXiv:2309.11495)
 * 3. Se action = 'regenerate' → tentar novo provider
 * 4. Se action = 'flag' → adicionar disclaimer na resposta
 * 5. Registrar resultado no bd_central para aprendizado
 */
export async function applyFaithfulnessCalibration(
  primaryResponse: string,
  referenceContext: string[],
  query: string,
  category: string
): Promise<{
  response: string;
  faithfulnessScore: number;
  calibrationApplied: boolean;
  action: string;
}> {
  const config = DEFAULT_CONFIG;

  // Apenas aplicar para categorias críticas ou quando contexto de referência existe
  const isCritical = config.criticalCategories.includes(category);
  if (!isCritical && referenceContext.length === 0) {
    return {
      response: primaryResponse,
      faithfulnessScore: 75, // Default quando não verificado
      calibrationApplied: false,
      action: 'skipped'
    };
  }

  const result = checkFaithfulness(
    primaryResponse,
    referenceContext,
    query,
    category,
    config
  );

  logger.info('system', 'SelfCheck event', {
    action: result.action,
    score: result.consistencyScore,
    hallucinationDetected: result.hallucinationDetected,
    category
  });

  if (result.action === 'accept') {
    return {
      response: primaryResponse,
      faithfulnessScore: result.consistencyScore,
      calibrationApplied: false,
      action: 'accepted'
    };
  }

  if (result.action === 'flag' && result.suspiciousSentences.length > 0) {
    // Adicionar nota de cautela para sentenças suspeitas
    const disclaimer = `\n\n> **Nota de calibração:** Algumas afirmações nesta resposta podem necessitar de verificação adicional com fontes primárias.`;
    return {
      response: primaryResponse + disclaimer,
      faithfulnessScore: result.consistencyScore,
      calibrationApplied: true,
      action: 'flagged'
    };
  }

  // Para 'verify_with_cove' e 'regenerate', retornar a resposta original
  // com o score para que o pipeline principal decida a ação
  return {
    response: primaryResponse,
    faithfulnessScore: result.consistencyScore,
    calibrationApplied: (result.action as string) !== 'accept',
    action: result.action
  };
}
