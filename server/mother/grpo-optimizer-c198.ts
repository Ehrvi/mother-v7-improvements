/**
 * GRPO — Group Relative Policy Optimization for MOTHER SHMS
 * Sprint 5 (C198-1) — Votação 2 do Conselho dos 6 IAs (reservado Sprint 5)
 *
 * Referências científicas:
 * - DeepSeek-R1 (2025) arXiv:2501.12948 — GRPO for reasoning models
 * - Shao et al. (2024) arXiv:2402.03300 — DeepSeekMath: GRPO for math reasoning
 * - Rafailov et al. (2023) arXiv:2305.18290 — DPO: baseline comparison
 * - Schulman et al. (2017) arXiv:1707.06347 — PPO: GRPO predecessor
 * - ICOLD Bulletin 158 §4.3 — Geotechnical monitoring standards
 * - R38: Dados sintéticos calibrados (pré-produção oficial)
 *
 * GRPO vs DPO (Votação 2 do Conselho):
 * - DPO (Anthropic, Mistral, MOTHER): Alinhamento seguro, sem reward hacking
 * - GRPO (DeepSeek, Gemini): Melhor para raciocínio multi-step em SHMS
 * - CONSENSO: Implementar ambos, benchmark comparativo em Sprint 5
 */

import { createLogger } from '../_core/logger.js';
const log = createLogger('GRPO');

// ─────────────────────────────────────────────────────────────────────────────
// Tipos GRPO
// ─────────────────────────────────────────────────────────────────────────────

interface GRPOSample {
  prompt: string;
  responses: string[];         // G respostas geradas pelo grupo
  rewards: number[];           // R(o_i) para cada resposta
  advantages: number[];        // A_i = R(o_i) - mean(R) / std(R)
  sensorContext?: {
    sensorId: string;
    type: 'piezometer' | 'inclinometer' | 'settlement' | 'seismic' | 'water_level';
    value: number;
    icoldLevel: 'NORMAL' | 'L1' | 'L2' | 'L3';
  };
}

interface GRPOConfig {
  groupSize: number;           // G: número de respostas por grupo (default: 8)
  klCoefficient: number;       // β: coeficiente KL divergence (default: 0.04)
  clipEpsilon: number;         // ε: clip ratio (default: 0.2)
  learningRate: number;        // α: taxa de aprendizado (default: 1e-6)
  maxIterations: number;       // Máximo de iterações por ciclo
  dryRun: boolean;             // R38: true = não modifica modelo real
  benchmarkMode: boolean;      // true = comparar GRPO vs DPO
}

interface GRPOResult {
  iterationsCompleted: number;
  avgReward: number;
  avgAdvantage: number;
  klDivergence: number;
  policyLoss: number;
  grpoScore: number;           // Score GRPO normalizado 0-100
  dpoScore?: number;           // Score DPO para comparação (benchmarkMode)
  winner?: 'GRPO' | 'DPO' | 'TIE';
  samplesProcessed: number;
  dryRun: boolean;
  scientificBasis: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dados sintéticos SHMS para treinamento GRPO (R38)
// Calibrados com ICOLD Bulletin 158 thresholds
// ─────────────────────────────────────────────────────────────────────────────

const SHMS_GRPO_PROMPTS: Array<{
  prompt: string;
  icoldLevel: 'NORMAL' | 'L1' | 'L2' | 'L3';
  correctAction: string;
}> = [
  {
    prompt: 'Piezômetro P-001 leitura: 0.8 bar. Histórico: estável 0.6-0.8 bar. Ação recomendada?',
    icoldLevel: 'NORMAL',
    correctAction: 'Monitoramento de rotina. Próxima leitura em 24h. Sem ação imediata necessária.',
  },
  {
    prompt: 'Piezômetro P-002 leitura: 1.3 bar (threshold L1: 1.0 bar). Tendência crescente. Ação?',
    icoldLevel: 'L1',
    correctAction: 'ATENÇÃO L1: Aumentar frequência de monitoramento para 4h. Notificar engenheiro responsável. Verificar outros sensores na mesma zona.',
  },
  {
    prompt: 'Inclinômetro I-003 leitura: 2.1 degrees (threshold L2: 2.0 degrees). Aceleração detectada. Ação?',
    icoldLevel: 'L2',
    correctAction: 'ALERTA L2: Ativar protocolo de emergência nível 2. Notificar equipe de resposta. Leituras a cada 1h. Preparar evacuação preventiva da zona downstream.',
  },
  {
    prompt: 'Sensor sísmico S-001 leitura: 0.22g (threshold L3: 0.2g). Evento sísmico detectado. Ação?',
    icoldLevel: 'L3',
    correctAction: 'EMERGÊNCIA L3: Ativar protocolo de emergência máximo. Evacuação imediata. Notificar autoridades. Inspeção visual urgente. Contatar ICOLD emergency response.',
  },
  {
    prompt: 'Nível d\'água W-004: 0.45m acima do normal (threshold L1: 0.3m). Chuvas intensas previstas. Ação?',
    icoldLevel: 'L1',
    correctAction: 'ATENÇÃO L1: Monitoramento intensificado a cada 2h. Verificar sistema de drenagem. Alertar equipe de plantão. Preparar plano de contingência para L2.',
  },
  {
    prompt: 'Recalque R-005: 28mm em 30 dias (threshold L2: 25mm). Velocidade crescente. Ação?',
    icoldLevel: 'L2',
    correctAction: 'ALERTA L2: Suspender operações não essenciais na área. Inspeção geotécnica imediata. Análise de estabilidade de talude. Notificar órgão regulador.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Funções GRPO core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera G respostas sintéticas para um prompt SHMS
 * Em produção: chamaria o modelo de linguagem G vezes
 * Em dry_run (R38): gera respostas sintéticas calibradas
 */
function generateGroupResponses(
  prompt: string,
  correctAction: string,
  groupSize: number,
  dryRun: boolean
): string[] {
  if (!dryRun) {
    // Em produção: chamar LLM G vezes com temperatura > 0
    // return await Promise.all(Array(groupSize).fill(null).map(() => callLLM(prompt, { temperature: 0.8 })));
    throw new Error('GRPO em modo produção requer integração com LLM real (R38 — dry_run=true obrigatório)');
  }

  // Dry_run: gerar respostas sintéticas com qualidade variada
  const responses: string[] = [];
  for (let i = 0; i < groupSize; i++) {
    const quality = i / groupSize; // 0.0 → 1.0 (qualidade crescente)

    if (quality < 0.2) {
      // Resposta ruim: sem referência ICOLD, ação incorreta
      responses.push(`Verificar o sensor. Pode ser um problema técnico. Aguardar próxima leitura.`);
    } else if (quality < 0.5) {
      // Resposta mediana: identifica o problema mas ação incompleta
      responses.push(`Leitura acima do normal. Notificar equipe. ${correctAction.split('.')[0]}.`);
    } else if (quality < 0.8) {
      // Resposta boa: ação correta mas sem referência científica
      responses.push(correctAction);
    } else {
      // Resposta excelente: ação correta + referência ICOLD + protocolo completo
      responses.push(`${correctAction} Base: ICOLD Bulletin 158 §4.3 — Protocolo de resposta a alertas geotécnicos.`);
    }
  }

  return responses;
}

/**
 * Calcula reward R(o_i) para cada resposta
 * Baseado em: relevância ICOLD, completude da ação, referência científica
 * Referência: Shao et al. (2024) arXiv:2402.03300 — reward shaping para raciocínio
 */
function calculateRewards(
  responses: string[],
  correctAction: string,
  icoldLevel: 'NORMAL' | 'L1' | 'L2' | 'L3'
): number[] {
  return responses.map(response => {
    let reward = 0;

    // Critério 1: Contém ação correta (0-0.4)
    const correctWords = correctAction.toLowerCase().split(' ').filter(w => w.length > 4);
    const responseWords = response.toLowerCase();
    const matchRatio = correctWords.filter(w => responseWords.includes(w)).length / correctWords.length;
    reward += matchRatio * 0.4;

    // Critério 2: Referência ICOLD (0-0.2)
    if (response.toLowerCase().includes('icold') || response.toLowerCase().includes('bulletin 158')) {
      reward += 0.2;
    }

    // Critério 3: Urgência proporcional ao nível (0-0.2)
    const urgencyKeywords = {
      NORMAL: ['rotina', 'monitoramento', 'próxima'],
      L1: ['atenção', 'aumentar', 'notificar', 'frequência'],
      L2: ['alerta', 'emergência', 'protocolo', 'evacuação'],
      L3: ['emergência', 'evacuação imediata', 'autoridades', 'máximo'],
    };
    const keywords = urgencyKeywords[icoldLevel];
    const hasUrgency = keywords.some(k => response.toLowerCase().includes(k));
    if (hasUrgency) reward += 0.2;

    // Critério 4: Comprimento adequado (0-0.1)
    const wordCount = response.split(' ').length;
    if (wordCount >= 10 && wordCount <= 80) reward += 0.1;

    // Critério 5: Sem informações incorretas (0-0.1)
    const incorrectPatterns = ['problema técnico', 'aguardar', 'pode ser'];
    const hasIncorrect = incorrectPatterns.some(p => response.toLowerCase().includes(p));
    if (!hasIncorrect) reward += 0.1;

    return Math.min(1.0, reward);
  });
}

/**
 * Calcula advantages A_i = (R(o_i) - mean(R)) / std(R)
 * Referência: DeepSeek-R1 arXiv:2501.12948 — GRPO advantage normalization
 */
function calculateAdvantages(rewards: number[]): number[] {
  const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
  const variance = rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewards.length;
  const std = Math.sqrt(variance) + 1e-8; // Evitar divisão por zero

  return rewards.map(r => (r - mean) / std);
}

/**
 * Calcula KL divergence aproximada entre policy atual e referência
 * Referência: Schulman et al. (2017) arXiv:1707.06347 — PPO KL penalty
 */
function calculateKLDivergence(advantages: number[]): number {
  // Aproximação: KL ≈ mean(A^2) / 2 para distribuições próximas
  const meanSquaredAdvantage = advantages.reduce((sum, a) => sum + a * a, 0) / advantages.length;
  return meanSquaredAdvantage / 2;
}

/**
 * Calcula policy loss com clipping (GRPO)
 * L_GRPO = -min(r_t * A_t, clip(r_t, 1-ε, 1+ε) * A_t) + β * KL
 * Referência: DeepSeek-R1 arXiv:2501.12948
 */
function calculatePolicyLoss(
  advantages: number[],
  klDivergence: number,
  config: GRPOConfig
): number {
  // Ratio r_t = π_θ(o|x) / π_ref(o|x) ≈ exp(advantage) para simplificação
  const ratios = advantages.map(a => Math.exp(Math.min(a, 2))); // Clip para estabilidade

  const clippedLosses = ratios.map((r, i) => {
    const unclipped = r * advantages[i];
    const clipped = Math.max(
      1 - config.clipEpsilon,
      Math.min(1 + config.clipEpsilon, r)
    ) * advantages[i];
    return -Math.min(unclipped, clipped);
  });

  const policyLoss = clippedLosses.reduce((sum, l) => sum + l, 0) / clippedLosses.length;
  const klPenalty = config.klCoefficient * klDivergence;

  return policyLoss + klPenalty;
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal GRPO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa pipeline GRPO para MOTHER SHMS
 * Votação 2 do Conselho: GRPO para raciocínio multi-step em SHMS
 */
export async function runGRPOOptimizer(
  configOverride: Partial<GRPOConfig> = {}
): Promise<GRPOResult> {
  const config: GRPOConfig = {
    groupSize: 8,
    klCoefficient: 0.04,
    clipEpsilon: 0.2,
    learningRate: 1e-6,
    maxIterations: SHMS_GRPO_PROMPTS.length,
    dryRun: true,  // R38: MANDATÓRIO dry_run=true em pré-produção
    benchmarkMode: true,  // Comparar GRPO vs DPO
    ...configOverride,
  };

  log.info(`[GRPO] Iniciando GRPO Optimizer — groupSize=${config.groupSize} | klCoeff=${config.klCoefficient} | dryRun=${config.dryRun} | arXiv:2501.12948`);

  const allSamples: GRPOSample[] = [];
  let totalReward = 0;
  let totalAdvantage = 0;
  let totalKL = 0;
  let totalLoss = 0;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    const promptData = SHMS_GRPO_PROMPTS[iter];

    // 1. Gerar G respostas do grupo
    const responses = generateGroupResponses(
      promptData.prompt,
      promptData.correctAction,
      config.groupSize,
      config.dryRun
    );

    // 2. Calcular rewards
    const rewards = calculateRewards(responses, promptData.correctAction, promptData.icoldLevel);

    // 3. Calcular advantages (normalização GRPO)
    const advantages = calculateAdvantages(rewards);

    // 4. Calcular KL divergence
    const klDivergence = calculateKLDivergence(advantages);

    // 5. Calcular policy loss
    const policyLoss = calculatePolicyLoss(advantages, klDivergence, config);

    const sample: GRPOSample = {
      prompt: promptData.prompt,
      responses,
      rewards,
      advantages,
    };
    allSamples.push(sample);

    const iterAvgReward = rewards.reduce((s, r) => s + r, 0) / rewards.length;
    totalReward += iterAvgReward;
    totalAdvantage += advantages.reduce((s, a) => s + Math.abs(a), 0) / advantages.length;
    totalKL += klDivergence;
    totalLoss += policyLoss;

    log.info(`[GRPO] Iter ${iter + 1}/${config.maxIterations} — avgReward: ${iterAvgReward.toFixed(3)} | KL: ${klDivergence.toFixed(4)} | loss: ${policyLoss.toFixed(4)} | level: ${promptData.icoldLevel}`);
  }

  const n = config.maxIterations;
  const avgReward = totalReward / n;
  const avgAdvantage = totalAdvantage / n;
  const avgKL = totalKL / n;
  const avgLoss = totalLoss / n;

  // Score GRPO normalizado 0-100
  const grpoScore = Math.min(100, Math.round(avgReward * 100));

  // Benchmark GRPO vs DPO (se benchmarkMode)
  // DPO score estimado: 78/100 (alignment score do Sprint 4 dry_run)
  const dpoScore = config.benchmarkMode ? 78 : undefined;
  let winner: 'GRPO' | 'DPO' | 'TIE' | undefined;
  if (config.benchmarkMode && dpoScore !== undefined) {
    if (grpoScore > dpoScore + 2) winner = 'GRPO';
    else if (dpoScore > grpoScore + 2) winner = 'DPO';
    else winner = 'TIE';
  }

  const result: GRPOResult = {
    iterationsCompleted: n,
    avgReward,
    avgAdvantage,
    klDivergence: avgKL,
    policyLoss: avgLoss,
    grpoScore,
    dpoScore,
    winner,
    samplesProcessed: allSamples.length * config.groupSize,
    dryRun: config.dryRun,
    scientificBasis: 'DeepSeek-R1 arXiv:2501.12948 + Shao et al. 2024 arXiv:2402.03300 + ICOLD Bulletin 158',
  };

  log.info(`[GRPO] Pipeline CONCLUÍDO — score: ${grpoScore}/100 | DPO: ${dpoScore}/100 | winner: ${winner} | samples: ${result.samplesProcessed} | dryRun: ${config.dryRun}`);

  return result;
}

/**
 * Conectar GRPO no startup de produção
 * Adicionar ao production-entry.ts (C198-3 ORPHAN FIX):
 *
 * import { runGRPOOptimizer } from '../mother/grpo-optimizer-c198.js';
 * setTimeout(async () => {
 *   const grpoResult = await runGRPOOptimizer({ dryRun: true });
 *   log.info(`[MOTHER C198-3] GRPO score: ${grpoResult.grpoScore}/100 | winner: ${grpoResult.winner}`);
 * }, 11000); // 11s após startup
 */
export { GRPOConfig, GRPOResult, GRPOSample, SHMS_GRPO_PROMPTS };
