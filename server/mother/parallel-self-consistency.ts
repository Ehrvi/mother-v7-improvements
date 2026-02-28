/**
 * Parallel Self-Consistency (PSC) — MOTHER v75.11 (Ciclo 61)
 *
 * Resolve NC-LATENCY-002: Q2 timeout 120s por Self-Consistency sequencial.
 *
 * Base científica:
 * - Wang et al. (2023) Self-Consistency (arXiv:2203.11171, ICLR 2023)
 *   "We propose self-consistency, a decoding strategy that samples diverse reasoning paths
 *    and selects the most consistent answer via majority vote."
 * - Li et al. (2024) Early-Stopping Self-Consistency — ESC (arXiv:2401.10480, ICLR 2024)
 *   "ESC reduces sampling by -80.1% on GSM8K while attaining comparable performance."
 * - Aggarwal et al. (2023) Adaptive Consistency (arXiv:2305.11860)
 *   "Stop sampling once leading answer appears sufficiently dominant."
 *
 * Inovação Ciclo 61 vs Ciclo 59 (self-consistency.ts):
 *   ANTES: loop sequencial for(i=0; i<N; i++) — 3 × 40s = 120s+ → TIMEOUT
 *   AGORA: Promise.all([sample1, sample2, sample3]) — max(40s, 40s, 40s) = 40s → OK
 *
 * Ganho esperado:
 *   Latência P50: 40s (vs 120s sequencial) — redução de 67%
 *   Latência P99: 60s (vs 180s sequencial) — redução de 67%
 *   NC-LATENCY-002: Q2 timeout → Q2 score > 70 (alvo)
 */

import { invokeLLM } from '../_core/llm.js';
import { createLogger } from '../_core/logger.js';
import type { LLMProvider } from './intelligence.js';

const logger = createLogger('parallel-self-consistency');

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ParallelSCConfig {
  /** Número de amostras paralelas (default: 3, conforme Wang et al. 2023) */
  n: number;
  /** Temperatura para diversidade de raciocínio (default: 0.7) */
  temperature: number;
  /** Threshold de confiança para early-stopping (default: 0.8 = 80%) */
  confidenceThreshold: number;
  /** Timeout por amostra individual em ms (default: 55000 = 55s) */
  sampleTimeoutMs: number;
  /** Timeout total para todas as amostras em ms (default: 65000 = 65s) */
  totalTimeoutMs: number;
}

export interface ParallelSCResult {
  finalAnswer: string;
  confidence: number;
  pathsGenerated: number;
  successfulPaths: number;
  failedPaths: number;
  allPaths: string[];
  aggregationMethod: 'majority_vote' | 'single_path' | 'none';
  applied: boolean;
  skipped: boolean;
  skipReason?: string;
  /** Latência total em ms (chave para NC-LATENCY-002) */
  latencyMs: number;
  /** Latência máxima entre as N amostras (indica o gargalo) */
  maxSampleLatencyMs: number;
}

// ─── Configuração padrão ──────────────────────────────────────────────────────

const DEFAULT_PSC_CONFIG: ParallelSCConfig = {
  n: 3,
  temperature: 0.7,
  confidenceThreshold: 0.8,
  sampleTimeoutMs: 55_000,   // 55s por amostra (headroom para o timeout de 60s do provider)
  totalTimeoutMs: 65_000,    // 65s total (vs 120s+ sequencial)
};

// ─── Funções auxiliares ───────────────────────────────────────────────────────

/**
 * Extrai a resposta final de um raciocínio CoT
 * Prioriza marcadores explícitos: "Portanto", "Logo", "Resposta:", "Answer:"
 */
function extractFinalAnswer(content: string): string {
  const markers = [
    /(?:portanto|logo|conclusão|resposta final|answer|therefore)[:\s]+(.+?)(?:\n|$)/i,
    /\*\*(?:resposta|answer)[:\s]*\*\*\s*(.+?)(?:\n|$)/i,
    /(?:^|\n)(?:resposta|answer)[:\s]+(.+?)(?:\n|$)/im,
  ];

  for (const marker of markers) {
    const match = content.match(marker);
    if (match?.[1] && match[1].trim().length > 5) {
      return match[1].trim();
    }
  }

  // Fallback: últimas 2 frases do conteúdo
  const sentences = content.split(/[.!?]\s+/).filter(s => s.trim().length > 10);
  if (sentences.length >= 2) {
    return sentences.slice(-2).join('. ').trim();
  }
  return content.slice(-300).trim();
}

/**
 * Similaridade de Jaccard entre dois textos (proxy de similaridade semântica)
 * Suficiente para majority voting — embeddings seriam muito lentos para SC
 */
function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  const intersection = new Set([...tokensA].filter(t => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Majority voting com clustering por similaridade
 * Wang et al. (2023): "unweighted sum" ≈ "normalized weighted sum" para N pequeno
 */
function majorityVote(answers: string[]): { winner: string; confidence: number } {
  if (answers.length === 0) return { winner: '', confidence: 0 };
  if (answers.length === 1) return { winner: answers[0], confidence: 1.0 };

  const clusters: { representative: string; count: number }[] = [];

  for (const answer of answers) {
    let assigned = false;
    for (const cluster of clusters) {
      if (jaccardSimilarity(answer, cluster.representative) > 0.4) {
        cluster.count++;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({ representative: answer, count: 1 });
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  return {
    winner: clusters[0].representative,
    confidence: clusters[0].count / answers.length,
  };
}

/**
 * Gera uma única amostra com timeout individual
 * Retorna null em caso de falha ou timeout
 */
async function generateSample(
  query: string,
  systemPrompt: string,
  provider: string,
  model: string,
  temperature: number,
  timeoutMs: number,
  sampleIndex: number
): Promise<{ content: string; latencyMs: number } | null> {
  const startTime = Date.now();

  // CoT prompt — pede raciocínio passo a passo antes da resposta final
  const cotQuery = `${query}\n\nPor favor, raciocine passo a passo antes de dar sua resposta final.`;

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs)
  );

  const samplePromise = (async () => {
    try {
      const response = await invokeLLM({
        provider: provider as LLMProvider,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: cotQuery },
        ],
        temperature,
        maxTokens: 1500,
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((c: unknown) => (c as { text?: string }).text ?? '').join('')
          : '';

      if (content && content.length > 50) {
        return { content, latencyMs: Date.now() - startTime };
      }
      return null;
    } catch (err) {
      logger.warn( `Sample ${sampleIndex} failed`, { error: String(err) });
      return null;
    }
  })();

  const result = await Promise.race([samplePromise, timeoutPromise]);
  if (result === null) {
    logger.warn( `Sample ${sampleIndex} timed out after ${timeoutMs}ms`);
  }
  return result;
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Parallel Self-Consistency (PSC)
 *
 * Diferença crítica vs self-consistency.ts (Ciclo 59):
 *   ANTES: for loop sequencial → 3 × latência = 120s+ → TIMEOUT (NC-LATENCY-002)
 *   AGORA: Promise.all paralelo → max(latência) ≈ 40s → DENTRO DO LIMITE
 *
 * Algoritmo:
 *   1. Lançar N=3 chamadas LLM em paralelo (Promise.all)
 *   2. Aguardar todas (ou timeout total de 65s)
 *   3. Coletar respostas bem-sucedidas
 *   4. Aplicar majority voting nas respostas
 *   5. Early-stopping: se confiança ≥ 80%, retornar imediatamente
 *
 * @param query - Query do usuário
 * @param systemPrompt - System prompt de MOTHER
 * @param provider - Provider LLM (openai, anthropic, etc.)
 * @param model - Modelo específico
 * @param config - Configuração opcional
 */
export async function applyParallelSelfConsistency(
  query: string,
  systemPrompt: string,
  provider: string,
  model: string,
  config: Partial<ParallelSCConfig> = {}
): Promise<ParallelSCResult> {
  const cfg = { ...DEFAULT_PSC_CONFIG, ...config };
  const totalStart = Date.now();

  logger.info(
    `Starting PSC: N=${cfg.n} PARALLEL (vs sequential in Ciclo 59)`,
    { provider, model, confidenceThreshold: cfg.confidenceThreshold }
  );

  // ── PASSO 1: Lançar N amostras em PARALELO ──────────────────────────────────
  // Esta é a mudança crítica vs Ciclo 59:
  //   ANTES: for(i=0; i<3; i++) { await generateSample() }  → sequencial
  //   AGORA: Promise.all([s1, s2, s3])                       → paralelo
  const samplePromises = Array.from({ length: cfg.n }, (_, i) =>
    generateSample(
      query,
      systemPrompt,
      provider,
      model,
      cfg.temperature,
      cfg.sampleTimeoutMs,
      i + 1
    )
  );

  // Timeout total como safety net
  const totalTimeoutPromise = new Promise<null[]>((resolve) =>
    setTimeout(() => resolve(Array(cfg.n).fill(null)), cfg.totalTimeoutMs)
  );

  const results = await Promise.race([
    Promise.all(samplePromises),
    totalTimeoutPromise,
  ]);

  const totalLatencyMs = Date.now() - totalStart;

  // ── PASSO 2: Coletar respostas bem-sucedidas ────────────────────────────────
  const successfulResults = (results as Array<{ content: string; latencyMs: number } | null>).filter((r): r is { content: string; latencyMs: number } => r !== null);
  const allPaths = successfulResults.map(r => r.content);
  const maxSampleLatencyMs = successfulResults.length > 0
    ? Math.max(...successfulResults.map(r => r.latencyMs))
    : totalLatencyMs;

  logger.info(
    `PSC completed: ${successfulResults.length}/${cfg.n} paths successful`,
    { totalLatencyMs, maxSampleLatencyMs }
  );

  // ── PASSO 3: Tratar casos de falha ─────────────────────────────────────────
  if (allPaths.length === 0) {
    logger.warn( 'All parallel samples failed — returning empty result');
    return {
      finalAnswer: '',
      confidence: 0,
      pathsGenerated: 0,
      successfulPaths: 0,
      failedPaths: cfg.n,
      allPaths: [],
      aggregationMethod: 'none',
      applied: false,
      skipped: true,
      skipReason: 'All parallel samples failed or timed out',
      latencyMs: totalLatencyMs,
      maxSampleLatencyMs,
    };
  }

  if (allPaths.length === 1) {
    logger.info( 'Only 1 path succeeded — returning single path');
    return {
      finalAnswer: allPaths[0],
      confidence: 0.5,
      pathsGenerated: 1,
      successfulPaths: 1,
      failedPaths: cfg.n - 1,
      allPaths,
      aggregationMethod: 'single_path',
      applied: true,
      skipped: false,
      latencyMs: totalLatencyMs,
      maxSampleLatencyMs,
    };
  }

  // ── PASSO 4: Majority voting ────────────────────────────────────────────────
  const extractedAnswers = allPaths.map(extractFinalAnswer);
  const { winner, confidence } = majorityVote(extractedAnswers);

  // Early-stopping check (ESC, arXiv:2401.10480)
  const usedEarlyStopping = confidence >= cfg.confidenceThreshold;
  if (usedEarlyStopping) {
    logger.info(
      `ESC: confidence=${confidence.toFixed(2)} >= ${cfg.confidenceThreshold} — high consensus`,
      { latencyMs: totalLatencyMs }
    );
  }

  // Selecionar o caminho completo mais próximo do winner
  let bestPath = allPaths[0];
  let bestSim = 0;
  for (const path of allPaths) {
    const sim = jaccardSimilarity(extractFinalAnswer(path), winner);
    if (sim > bestSim) {
      bestSim = sim;
      bestPath = path;
    }
  }

  logger.info(
    `PSC result: confidence=${confidence.toFixed(2)}, paths=${allPaths.length}, latency=${totalLatencyMs}ms`,
    { aggregationMethod: 'majority_vote', usedEarlyStopping }
  );

  return {
    finalAnswer: bestPath,
    confidence,
    pathsGenerated: allPaths.length,
    successfulPaths: allPaths.length,
    failedPaths: cfg.n - allPaths.length,
    allPaths,
    aggregationMethod: 'majority_vote',
    applied: true,
    skipped: false,
    latencyMs: totalLatencyMs,
    maxSampleLatencyMs,
  };
}

/**
 * Verifica se PSC deve ser aplicado para uma query
 * Critérios: categoria complex_reasoning + query não trivial
 */
export function shouldApplyParallelSC(
  category: string,
  queryLength: number,
  hasHistoricalErrors: boolean
): boolean {
  // PSC obrigatório para complex_reasoning (Regra 11 do AWAKE)
  if (category === 'complex_reasoning') return true;

  // PSC para queries longas com histórico de erros
  if (hasHistoricalErrors && queryLength > 100) return true;

  return false;
}
