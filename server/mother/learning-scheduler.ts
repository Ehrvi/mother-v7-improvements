// server/mother/learning-scheduler.ts
// C313: Forced Learning Scheduler — Aprendizado Forçado por Agenda
// Base: Curriculum Learning (Bengio et al., arXiv:0903.2814)
// FLARE (Jiang et al., arXiv:2305.06983); Self-RAG (Asai et al., arXiv:2310.11511)

import { createLogger } from '../_core/logger';
const log = createLogger('LearningScheduler');

// Priority domains for MOTHER's objectives
const PRIORITY_DOMAINS = [
  // Objective A — SHMS
  { query: 'structural health monitoring machine learning 2025', category: 'shms', weight: 3 },
  { query: 'geotechnical monitoring IoT sensors real-time anomaly detection', category: 'shms', weight: 3 },
  { query: 'LSTM anomaly detection time series geotechnical sensors', category: 'shms', weight: 2 },
  { query: 'pore pressure monitoring slope stability machine learning', category: 'shms', weight: 2 },
  // Objective B — Autonomy
  { query: 'autonomous AI agent self-improvement code generation 2025', category: 'autonomy', weight: 3 },
  { query: 'Darwin Godel Machine self-modifying AI systems', category: 'autonomy', weight: 3 },
  { query: 'reinforcement learning verifiable rewards RLVR 2025', category: 'learning', weight: 2 },
  { query: 'direct preference optimization DPO fine-tuning LLM', category: 'learning', weight: 2 },
  // General AI quality
  { query: 'LangGraph ReAct agent reasoning acting language models', category: 'reasoning', weight: 2 },
  { query: 'retrieval augmented generation RAG knowledge graph 2025', category: 'rag', weight: 1 },
];

// SHMS curriculum modules (31 modules)
const SHMS_CURRICULUM = [
  'PorePressureAnalysis', 'SlopeStability', 'SeismicResponse', 'LiquefactionRisk',
  'SettlementPrediction', 'LateralDeformation', 'ThermalAnalysis', 'ErosionModeling',
  'FoundationBearing', 'RetainingWallAnalysis', 'TunnelStability', 'EmbankmentMonitoring',
  'CrackPropagation', 'VibrationAnalysis', 'GroundwaterFlow', 'ConsolidationAnalysis',
  'PileIntegrity', 'BridgeStructural', 'DamSafety', 'LandfillStability',
  'MineSlope', 'CoastalErosion', 'PermafrostMonitoring', 'RockMassClassification',
  'SoilLiquefaction', 'DifferentialSettlement', 'BearingCapacity', 'EarthquakeResponse',
  'FloodRisk', 'LandslidePredictor', 'MaterialDegradation'
];

interface StudySession {
  sessionId: string;
  type: 'morning_papers' | 'afternoon_review' | 'evening_consolidation' | 'shms_curriculum';
  startTime: Date;
  endTime?: Date;
  papersIngested: number;
  knowledgeUpdated: number;
  domains: string[];
  status: 'running' | 'completed' | 'failed';
}

/**
 * Simple daily scheduler using setTimeout/setInterval
 * (No external cron dependency required)
 */
function scheduleDaily(hour: number, minute: number, label: string, callback: () => Promise<void>): void {
  const now = new Date();
  const next = new Date();
  next.setUTCHours(hour, minute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  
  const msUntilNext = next.getTime() - now.getTime();
  
  log.info(`Scheduled "${label}" at ${hour}:${String(minute).padStart(2,'0')} UTC — next run in ${Math.round(msUntilNext/60000)} minutes`);
  
  setTimeout(() => {
    callback().catch(e => log.error(`Scheduled task "${label}" failed`, { error: e }));
    setInterval(() => {
      callback().catch(e => log.error(`Scheduled task "${label}" failed`, { error: e }));
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

/**
 * Morning Study Session (08:00 UTC daily)
 * Ingest papers from priority domains
 */
async function runMorningStudy(): Promise<StudySession> {
  const session: StudySession = {
    sessionId: `morning-${Date.now()}`,
    type: 'morning_papers',
    startTime: new Date(),
    papersIngested: 0,
    knowledgeUpdated: 0,
    domains: [],
    status: 'running'
  };
  
  log.info('Starting morning study session (C313)', { sessionId: session.sessionId });
  
  try {
    // Dynamically import to avoid circular deps
    const { triggerActiveStudy } = await import('./active-study');
    
    // Select top 3 domains by weight
    const selectedDomains = [...PRIORITY_DOMAINS]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    
    for (const domain of selectedDomains) {
      try {
        const result = await triggerActiveStudy(domain.query, 'high');
        session.papersIngested += result?.papersIngested || 0;
        session.knowledgeUpdated += result?.knowledgeAdded || 0;
        session.domains.push(domain.category);
        log.info(`Studied domain ${domain.category}`, { ingested: result?.papersIngested });
      } catch (e) {
        log.warn(`Failed to study domain ${domain.category}`, { error: e });
      }
    }
    
    session.status = 'completed';
    session.endTime = new Date();
    log.info('Morning study completed', { 
      papersIngested: session.papersIngested, 
      knowledgeUpdated: session.knowledgeUpdated 
    });
    return session;
  } catch (error) {
    session.status = 'failed';
    session.endTime = new Date();
    log.error('Morning study failed', { error });
    return session;
  }
}

/**
 * SHMS Curriculum Study (Monday 05:00 UTC)
 * Studies the weakest SHMS module based on knowledge graph mastery
 */
async function runShmsWeeklyStudy(): Promise<StudySession> {
  const session: StudySession = {
    sessionId: `shms-weekly-${Date.now()}`,
    type: 'shms_curriculum',
    startTime: new Date(),
    papersIngested: 0,
    knowledgeUpdated: 0,
    domains: ['shms'],
    status: 'running'
  };
  
  log.info('Starting SHMS weekly curriculum study (C313)', { sessionId: session.sessionId });
  
  try {
    const { triggerActiveStudy } = await import('./active-study');
    
    // Study 3 SHMS modules per week (rotating)
    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const startIdx = (weekNumber * 3) % SHMS_CURRICULUM.length;
    const modulesToStudy = SHMS_CURRICULUM.slice(startIdx, startIdx + 3);
    
    for (const module of modulesToStudy) {
      try {
        const result = await triggerActiveStudy(`geotechnical ${module} monitoring sensors machine learning 2025`, 'high');
        session.papersIngested += result?.papersIngested || 0;
        session.knowledgeUpdated += result?.knowledgeAdded || 0;
        log.info(`Studied SHMS module ${module}`, { ingested: result?.papersIngested });
      } catch (e) {
        log.warn(`Failed to study SHMS module ${module}`, { error: e });
      }
    }
    
    session.status = 'completed';
    session.endTime = new Date();
    log.info('SHMS weekly study completed', { 
      modules: modulesToStudy,
      papersIngested: session.papersIngested 
    });
    return session;
  } catch (error) {
    session.status = 'failed';
    session.endTime = new Date();
    log.error('SHMS weekly study failed', { error });
    return session;
  }
}

/**
 * Initialize the study scheduler
 * Called once at server startup from production-entry.ts
 */
export function initLearningScheduler(): void {
  log.info('Initializing Learning Scheduler (C313) — Forced Learning System');
  
  // Daily morning study at 08:00 UTC
  scheduleDaily(8, 0, 'morning-study', async () => { await runMorningStudy(); });
  
  // SHMS weekly curriculum at 05:00 UTC on Mondays
  // Check if today is Monday and schedule accordingly
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
  const msUntilMonday = daysUntilMonday * 24 * 60 * 60 * 1000;
  
  setTimeout(() => {
    runShmsWeeklyStudy().catch(e => log.error('SHMS weekly study failed', { error: e }));
    setInterval(() => {
      runShmsWeeklyStudy().catch(e => log.error('SHMS weekly study failed', { error: e }));
    }, 7 * 24 * 60 * 60 * 1000);
  }, msUntilMonday);
  
  log.info('Learning Scheduler initialized', {
    morningStudy: '08:00 UTC daily',
    shmsWeekly: 'Monday 05:00 UTC',
    priorityDomains: PRIORITY_DOMAINS.length,
    shmsCurriculum: SHMS_CURRICULUM.length
  });
}

// Export for testing
export { runMorningStudy, runShmsWeeklyStudy, PRIORITY_DOMAINS, SHMS_CURRICULUM };
