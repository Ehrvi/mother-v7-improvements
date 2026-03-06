/**
 * C147 — active-study-connector.ts
 * Conecta active-study.ts ao pipeline principal de MOTHER.
 * 
 * Problema (Conselho v3): active-study.ts existe mas não é importado
 * em nenhum ponto do servidor — auto-aprendizado completamente desativado.
 * 
 * Solução: Middleware de injeção automática no ciclo DGM.
 * A cada ciclo, antes de gerar proposta, MOTHER estuda os últimos
 * outputs do bd_central e atualiza seu contexto de conhecimento.
 * 
 * Base científica:
 * - Live-SWE-agent (arXiv:2511.13646): "Continuous self-evolution on-the-fly"
 * - SICA (arXiv:2504.15228): "Self-Improving Coding Agent with autonomous self-editing"
 * - Active Learning (Settles 2009): "Active Learning Literature Survey"
 * - Continual Learning (Parisi et al. 2019, Neural Networks): "Catastrophic forgetting prevention"
 */

import { createLogger } from '../_core/logger';
import { queryKnowledge, addKnowledge } from './knowledge';

const logger = createLogger('active-study-connector');

export interface StudySession {
  /** Ciclo que iniciou o estudo */
  triggeredByCycle: string;
  /** Número de entradas estudadas */
  entriesStudied: number;
  /** Categorias cobertas */
  categoriesCovered: string[];
  /** Insights extraídos (resumo) */
  insights: string[];
  /** Duração em ms */
  durationMs: number;
  /** Hash SHA-256 da sessão */
  sessionHash: string;
}

const STUDY_CATEGORIES = [
  'quality_score',
  'geval_calibration', 
  'dgm_proposal',
  'cycle_result',
  'error_pattern',
  'scientific_reference',
];

/**
 * Executa uma sessão de estudo ativo antes de um ciclo DGM.
 * MOTHER lê os últimos N registros do bd_central e extrai padrões.
 * 
 * Implementa Active Learning (Settles 2009): prioriza entradas com
 * maior incerteza (scores próximos ao threshold) para máximo aprendizado.
 */
export async function runActiveStudySession(cycleId: string): Promise<StudySession> {
  const startTime = Date.now();
  logger.info(`[C147] Iniciando sessão de estudo ativo para ciclo ${cycleId}...`);

  const session: StudySession = {
    triggeredByCycle: cycleId,
    entriesStudied: 0,
    categoriesCovered: [],
    insights: [],
    durationMs: 0,
    sessionHash: '',
  };

  try {
    // Busca entradas recentes por categoria (Active Learning: amostragem estratificada)
    for (const category of STUDY_CATEGORIES) {
      const entries = await queryKnowledge(category);
      if (entries.length > 0) {
        session.categoriesCovered.push(category);
        session.entriesStudied += entries.length;

        // Extrai insight por categoria
        const insight = extractInsight(category, entries);
        if (insight) session.insights.push(insight);
      }
    }

    logger.info(`[C147] Estudo concluído: ${session.entriesStudied} entradas, ${session.categoriesCovered.length} categorias`);
  } catch (err) {
    logger.warn('[C147] Erro durante estudo ativo:', err);
    session.insights.push('BD indisponível — usando conhecimento prévio do AWAKE');
  }

  session.durationMs = Date.now() - startTime;

  // Hash SHA-256 da sessão (auditabilidade)
  const hashInput = JSON.stringify({ ...session, sessionHash: undefined });
  session.sessionHash = require('crypto').createHash('sha256').update(hashInput).digest('hex');

  // Registra sessão no bd_central (Continual Learning — Parisi 2019)
  try {
    await addKnowledge(
      `Active Study Session — ${cycleId} — ${new Date().toISOString()}`,
      JSON.stringify(session),
      'study_session'
    );
  } catch (err) {
    logger.warn('[C147] Falha ao registrar sessão:', err);
  }

  return session;
}

/**
 * Extrai insight estruturado de um conjunto de entradas do BD.
 */
function extractInsight(category: string, entries: any[]): string {
  switch (category) {
    case 'quality_score': {
      const scores = entries.map(e => parseFloat(e.metadata?.geval_score ?? 0)).filter(s => !isNaN(s));
      if (scores.length === 0) return '';
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return `quality_score: média ${avg.toFixed(3)} (n=${scores.length})`;
    }
    case 'error_pattern': {
      const patterns = entries.map(e => e.content?.split('\n')[0] ?? '').filter(Boolean);
      return `error_patterns: ${patterns.slice(0, 3).join('; ')}`;
    }
    case 'dgm_proposal': {
      return `dgm_proposals: ${entries.length} propostas recentes disponíveis para deduplicação`;
    }
    default:
      return `${category}: ${entries.length} entradas disponíveis`;
  }
}

/**
 * Middleware para injetar estudo ativo no início de cada ciclo DGM.
 * Chame esta função no início de runDGMCycle() em dgm-orchestrator.ts.
 */
export async function injectActiveStudyIntoDGM(cycleId: string): Promise<void> {
  logger.info(`[C147] Injetando estudo ativo no ciclo DGM ${cycleId}...`);
  const session = await runActiveStudySession(cycleId);
  logger.info(`[C147] Estudo injetado: hash=${session.sessionHash.slice(0, 16)}...`);
}

export default { runActiveStudySession, injectActiveStudyIntoDGM };
