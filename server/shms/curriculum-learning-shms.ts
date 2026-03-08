/**
 * Curriculum Learning SHMS — C197-5
 * Pipeline progressivo: sintético calibrado → dados reais (quando disponíveis)
 *
 * Votação 2 do Conselho dos 6 IAs: DPO + Constitutional AI (MAIORIA 3/5)
 * Anthropic, Mistral, MOTHER votaram DPO; DeepSeek e Gemini votaram GRPO (Sprint 5)
 *
 * Referências científicas:
 * - Bengio et al. (2009) ICML — Curriculum Learning: "Training from easy to hard"
 * - Rafailov et al. (2023) arXiv:2305.18290 — DPO: Direct Preference Optimization
 * - Bai et al. (2022) arXiv:2212.08073 — Constitutional AI (Anthropic)
 * - ICOLD Bulletin 158 (2014) §4.3 — Dam monitoring thresholds L1/L2/L3
 * - GISTM 2020 §8 — Global Industry Standard on Tailings Management
 * - Sun et al. (2025) DOI:10.1145/3777730.3777858 — SHMS Digital Twin
 *
 * STATUS: PRÉ-PRODUÇÃO OFICIAL (R38) — Fase 1 usa dados sintéticos calibrados
 */

import { createLogger } from '../_core/logger.js';

const log = createLogger('CURRICULUM-SHMS');

// ─────────────────────────────────────────────────────────────────────────
// Tipos e constantes
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fase do curriculum learning
 * Bengio et al. (2009): progressão de fácil → difícil
 */
export type CurriculumPhase =
  | 'phase1_synthetic_basic'      // Dados sintéticos simples (normal operation)
  | 'phase2_synthetic_anomaly'    // Dados sintéticos com anomalias ICOLD L1
  | 'phase3_synthetic_critical'   // Dados sintéticos com alertas ICOLD L2/L3
  | 'phase4_real_calibration'     // Dados reais (quando disponíveis) — R38
  | 'phase5_dpo_refinement';      // Fine-tuning DPO com preferências humanas

/**
 * Exemplo de treinamento SHMS
 * Usado para DPO: (prompt, chosen_response, rejected_response)
 */
export interface SHMSTrainingExample {
  id: string;
  phase: CurriculumPhase;
  prompt: string;
  chosenResponse: string;     // Resposta preferida (DPO: y_w)
  rejectedResponse: string;   // Resposta rejeitada (DPO: y_l)
  sensorData: {
    type: 'piezometer' | 'inclinometer' | 'settlement' | 'seismic' | 'water_level';
    value: number;
    unit: string;
    icoldLevel: 'NORMAL' | 'L1' | 'L2' | 'L3';
  };
  metadata: {
    difficulty: number;       // 0-1 (Bengio curriculum)
    scientificBasis: string;
    createdAt: Date;
  };
}

/**
 * Resultado do pipeline de curriculum learning
 */
export interface CurriculumPipelineResult {
  phase: CurriculumPhase;
  examplesGenerated: number;
  examplesValid: number;
  averageDifficulty: number;
  dpoReadiness: boolean;      // true quando fase 5 pode ser iniciada
  nextPhase?: CurriculumPhase;
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// Geradores de dados sintéticos calibrados (R38)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Gera leitura sintética de sensor calibrada com thresholds ICOLD
 * Base: ICOLD Bulletin 158 §4.3 + GISTM 2020 §8
 */
function generateSyntheticReading(
  type: SHMSTrainingExample['sensorData']['type'],
  targetLevel: 'NORMAL' | 'L1' | 'L2' | 'L3'
): { type: SHMSTrainingExample['sensorData']['type']; value: number; unit: string; icoldLevel: 'NORMAL' | 'L1' | 'L2' | 'L3' } {
  // Thresholds ICOLD Bulletin 158 §4.3
  const thresholds: Record<string, { l1: number; l2: number; l3: number; unit: string; normalMax: number }> = {
    piezometer:   { l1: 1.0, l2: 2.0, l3: 3.0, unit: 'bar',     normalMax: 0.8 },
    inclinometer: { l1: 0.5, l2: 1.0, l3: 2.0, unit: 'degrees', normalMax: 0.3 },
    settlement:   { l1: 10,  l2: 25,  l3: 50,  unit: 'mm',      normalMax: 7 },
    seismic:      { l1: 0.05, l2: 0.1, l3: 0.2, unit: 'g',      normalMax: 0.03 },
    water_level:  { l1: 0.3, l2: 0.6, l3: 0.9, unit: 'm',       normalMax: 0.2 },
  };

  const t = thresholds[type];
  let value: number;

  switch (targetLevel) {
    case 'NORMAL':
      value = Math.random() * t.normalMax;
      break;
    case 'L1':
      value = t.l1 + Math.random() * (t.l2 - t.l1) * 0.9;
      break;
    case 'L2':
      value = t.l2 + Math.random() * (t.l3 - t.l2) * 0.9;
      break;
    case 'L3':
      value = t.l3 + Math.random() * t.l3 * 0.5;
      break;
  }

  return { type, value: parseFloat(value.toFixed(4)), unit: t.unit, icoldLevel: targetLevel };
}

/**
 * Gera resposta preferida (chosen) para um alerta ICOLD
 * Segue Constitutional AI (Bai et al. 2022): resposta segura, precisa, acionável
 */
function generateChosenResponse(
  sensorData: SHMSTrainingExample['sensorData'],
  structureId: string
): string {
  const levelDescriptions = {
    NORMAL: 'operação normal',
    L1: 'ATENÇÃO — monitoramento intensificado',
    L2: 'ALERTA — ação corretiva necessária',
    L3: 'EMERGÊNCIA — evacuação imediata',
  };

  const actions = {
    NORMAL: 'Continuar monitoramento padrão conforme ICOLD Bulletin 158 §4.3.',
    L1: 'Aumentar frequência de leitura para 15min. Notificar engenheiro responsável. Documentar em log de auditoria.',
    L2: 'Acionar protocolo de alerta. Notificar equipe de resposta. Preparar plano de contingência conforme GISTM 2020 §8.',
    L3: 'AÇÃO IMEDIATA: Acionar protocolo de emergência. Notificar autoridades. Iniciar evacuação preventiva conforme PAE.',
  };

  return `[SHMS MOTHER v82.4] Estrutura ${structureId} — ${levelDescriptions[sensorData.icoldLevel]}

Sensor: ${sensorData.type} | Leitura: ${sensorData.value} ${sensorData.unit} | Nível ICOLD: ${sensorData.icoldLevel}

Análise: ${sensorData.icoldLevel === 'NORMAL'
    ? `Leitura dentro dos parâmetros normais (< ${sensorData.value * 1.3} ${sensorData.unit}).`
    : `Leitura ${sensorData.value} ${sensorData.unit} excede threshold ICOLD ${sensorData.icoldLevel}.`}

Ação recomendada: ${actions[sensorData.icoldLevel]}

Base científica: ICOLD Bulletin 158 §4.3 | GISTM 2020 §8 | Sun et al. (2025) SHMS Digital Twin`;
}

/**
 * Gera resposta rejeitada (rejected) — imprecisa ou insegura
 * Usada no DPO para ensinar MOTHER a evitar respostas inadequadas
 */
function generateRejectedResponse(
  sensorData: SHMSTrainingExample['sensorData']
): string {
  // Respostas rejeitadas: vagas, sem base científica, ou incorretas
  const rejectedTemplates = [
    `O sensor ${sensorData.type} registrou ${sensorData.value}. Pode ser normal ou não.`,
    `Leitura: ${sensorData.value} ${sensorData.unit}. Verificar manualmente.`,
    `Alerta detectado. Consultar manual do equipamento.`,
    `Valor ${sensorData.value} registrado. Sem análise disponível no momento.`,
  ];

  return rejectedTemplates[Math.floor(Math.random() * rejectedTemplates.length)];
}

// ─────────────────────────────────────────────────────────────────────────
// Pipeline de Curriculum Learning
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fase 1: Dados sintéticos básicos (operação normal)
 * Bengio et al. (2009): começar com exemplos simples
 */
export async function runPhase1SyntheticBasic(
  examplesPerSensor = 20
): Promise<SHMSTrainingExample[]> {
  const examples: SHMSTrainingExample[] = [];
  const sensorTypes: SHMSTrainingExample['sensorData']['type'][] = [
    'piezometer', 'inclinometer', 'settlement', 'seismic', 'water_level'
  ];

  for (const type of sensorTypes) {
    for (let i = 0; i < examplesPerSensor; i++) {
      const sensorData = generateSyntheticReading(type, 'NORMAL');
      const structureId = `STRUCT-${String(i % 5 + 1).padStart(3, '0')}`;

      examples.push({
        id: `phase1-${type}-${i}-${Date.now()}`,
        phase: 'phase1_synthetic_basic',
        prompt: `Analisar leitura do sensor ${type} na estrutura ${structureId}: ${sensorData.value} ${sensorData.unit}`,
        chosenResponse: generateChosenResponse(sensorData, structureId),
        rejectedResponse: generateRejectedResponse(sensorData),
        sensorData,
        metadata: {
          difficulty: 0.1 + Math.random() * 0.2, // 0.1-0.3 (fácil)
          scientificBasis: 'ICOLD Bulletin 158 §4.3 + Bengio et al. (2009) ICML',
          createdAt: new Date(),
        },
      });
    }
  }

  log.info('[CURRICULUM-SHMS] Fase 1 concluída', {
    phase: 'phase1_synthetic_basic',
    examples: examples.length,
    avgDifficulty: examples.reduce((s, e) => s + e.metadata.difficulty, 0) / examples.length,
    scientificBasis: 'Bengio et al. (2009) ICML — Curriculum Learning',
  });

  return examples;
}

/**
 * Fase 2: Dados sintéticos com anomalias ICOLD L1
 * Dificuldade progressiva: Bengio et al. (2009)
 */
export async function runPhase2SyntheticAnomaly(
  examplesPerSensor = 15
): Promise<SHMSTrainingExample[]> {
  const examples: SHMSTrainingExample[] = [];
  const sensorTypes: SHMSTrainingExample['sensorData']['type'][] = [
    'piezometer', 'inclinometer', 'settlement', 'seismic', 'water_level'
  ];

  for (const type of sensorTypes) {
    for (let i = 0; i < examplesPerSensor; i++) {
      const sensorData = generateSyntheticReading(type, 'L1');
      const structureId = `STRUCT-${String(i % 5 + 1).padStart(3, '0')}`;

      examples.push({
        id: `phase2-${type}-${i}-${Date.now()}`,
        phase: 'phase2_synthetic_anomaly',
        prompt: `ALERTA L1: Sensor ${type} na estrutura ${structureId} registrou ${sensorData.value} ${sensorData.unit}. Analisar e recomendar ação.`,
        chosenResponse: generateChosenResponse(sensorData, structureId),
        rejectedResponse: generateRejectedResponse(sensorData),
        sensorData,
        metadata: {
          difficulty: 0.4 + Math.random() * 0.2, // 0.4-0.6 (médio)
          scientificBasis: 'ICOLD Bulletin 158 §4.3 L1 + Bengio et al. (2009) ICML',
          createdAt: new Date(),
        },
      });
    }
  }

  log.info('[CURRICULUM-SHMS] Fase 2 concluída', {
    phase: 'phase2_synthetic_anomaly',
    examples: examples.length,
    avgDifficulty: examples.reduce((s, e) => s + e.metadata.difficulty, 0) / examples.length,
    scientificBasis: 'ICOLD L1 + Bengio et al. (2009)',
  });

  return examples;
}

/**
 * Fase 3: Dados sintéticos com alertas críticos ICOLD L2/L3
 * Dificuldade alta: Bengio et al. (2009)
 */
export async function runPhase3SyntheticCritical(
  examplesPerSensor = 10
): Promise<SHMSTrainingExample[]> {
  const examples: SHMSTrainingExample[] = [];
  const sensorTypes: SHMSTrainingExample['sensorData']['type'][] = [
    'piezometer', 'inclinometer', 'settlement', 'seismic', 'water_level'
  ];

  for (const type of sensorTypes) {
    // L2 examples
    for (let i = 0; i < Math.floor(examplesPerSensor * 0.6); i++) {
      const sensorData = generateSyntheticReading(type, 'L2');
      const structureId = `STRUCT-${String(i % 5 + 1).padStart(3, '0')}`;

      examples.push({
        id: `phase3-l2-${type}-${i}-${Date.now()}`,
        phase: 'phase3_synthetic_critical',
        prompt: `⚠️ ALERTA L2: Sensor ${type} na estrutura ${structureId} registrou ${sensorData.value} ${sensorData.unit}. Ação imediata requerida.`,
        chosenResponse: generateChosenResponse(sensorData, structureId),
        rejectedResponse: generateRejectedResponse(sensorData),
        sensorData,
        metadata: {
          difficulty: 0.7 + Math.random() * 0.1, // 0.7-0.8 (difícil)
          scientificBasis: 'ICOLD Bulletin 158 §4.3 L2 + GISTM 2020 §8',
          createdAt: new Date(),
        },
      });
    }

    // L3 examples (mais raros — ICOLD)
    for (let i = 0; i < Math.floor(examplesPerSensor * 0.4); i++) {
      const sensorData = generateSyntheticReading(type, 'L3');
      const structureId = `STRUCT-${String(i % 5 + 1).padStart(3, '0')}`;

      examples.push({
        id: `phase3-l3-${type}-${i}-${Date.now()}`,
        phase: 'phase3_synthetic_critical',
        prompt: `🚨 EMERGÊNCIA L3: Sensor ${type} na estrutura ${structureId} registrou ${sensorData.value} ${sensorData.unit}. EVACUAÇÃO IMEDIATA.`,
        chosenResponse: generateChosenResponse(sensorData, structureId),
        rejectedResponse: generateRejectedResponse(sensorData),
        sensorData,
        metadata: {
          difficulty: 0.9 + Math.random() * 0.1, // 0.9-1.0 (muito difícil)
          scientificBasis: 'ICOLD Bulletin 158 §4.3 L3 + GISTM 2020 §8 + PAE',
          createdAt: new Date(),
        },
      });
    }
  }

  log.info('[CURRICULUM-SHMS] Fase 3 concluída', {
    phase: 'phase3_synthetic_critical',
    examples: examples.length,
    l2Count: examples.filter(e => e.sensorData.icoldLevel === 'L2').length,
    l3Count: examples.filter(e => e.sensorData.icoldLevel === 'L3').length,
    scientificBasis: 'ICOLD L2/L3 + Bengio et al. (2009) + GISTM 2020',
  });

  return examples;
}

/**
 * Pipeline completo de Curriculum Learning SHMS
 * Executa fases 1-3 (sintéticas) e prepara dataset para DPO
 *
 * Fase 4 (dados reais) e Fase 5 (DPO fine-tuning) serão habilitadas
 * quando dados reais estiverem disponíveis (R38 — pré-produção)
 */
export async function runCurriculumLearningPipeline(): Promise<CurriculumPipelineResult> {
  log.info('[CURRICULUM-SHMS] Iniciando pipeline de Curriculum Learning', {
    phases: ['phase1_synthetic_basic', 'phase2_synthetic_anomaly', 'phase3_synthetic_critical'],
    note: 'Fase 4 (dados reais) e Fase 5 (DPO) aguardam dados reais (R38)',
    scientificBasis: 'Bengio et al. (2009) ICML + Rafailov et al. (2023) DPO arXiv:2305.18290',
  });

  const phase1Examples = await runPhase1SyntheticBasic(20);
  const phase2Examples = await runPhase2SyntheticAnomaly(15);
  const phase3Examples = await runPhase3SyntheticCritical(10);

  const allExamples = [...phase1Examples, ...phase2Examples, ...phase3Examples];
  const avgDifficulty = allExamples.reduce((s, e) => s + e.metadata.difficulty, 0) / allExamples.length;

  // DPO readiness: ≥ 200 exemplos com distribuição equilibrada (Rafailov et al. 2023)
  const dpoReadiness = allExamples.length >= 200 &&
    phase3Examples.length >= 50; // Exemplos críticos suficientes

  const result: CurriculumPipelineResult = {
    phase: 'phase3_synthetic_critical',
    examplesGenerated: allExamples.length,
    examplesValid: allExamples.filter(e => e.chosenResponse && e.rejectedResponse).length,
    averageDifficulty: parseFloat(avgDifficulty.toFixed(3)),
    dpoReadiness,
    nextPhase: dpoReadiness ? 'phase5_dpo_refinement' : 'phase4_real_calibration',
    timestamp: new Date(),
  };

  log.info('[CURRICULUM-SHMS] Pipeline concluído', {
    ...result,
    phase1: phase1Examples.length,
    phase2: phase2Examples.length,
    phase3: phase3Examples.length,
    scientificBasis: 'Bengio et al. (2009) ICML — Curriculum Learning completo',
  });

  return result;
}

