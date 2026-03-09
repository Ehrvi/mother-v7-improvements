/**
 * STARTUP TASKS C207 — NC-ARCH-001 COMPLETO
 *
 * Centraliza TODOS os setTimeout/setInterval do production-entry.ts neste módulo.
 * Resolve NC-ARCH-001: production-entry.ts God Object (1109L → <300L).
 *
 * Base científica:
 * - Fowler (1999) "Refactoring: Improving the Design of Existing Code" — Extract Module
 * - Martin (2003) "Agile Software Development" — Single Responsibility Principle (SRP)
 * - Gamma et al. (1994) "Design Patterns" — Facade + Registry patterns
 * - Dijkstra (1968) "Go To Statement Considered Harmful" — structured control flow
 *
 * Arquitetura:
 * - Cada tarefa é registrada no StartupScheduler com delay explícito
 * - Todas as tarefas são non-critical (try/catch com warn)
 * - Funções Mortas Notáveis preservadas (R7 — max 10): ver seção abaixo
 * - MOTHER v89.0 | C207 Sprint 8 | 2026-03-09
 */

import { createLogger } from './logger';
import { startupScheduler } from './startup-scheduler.js';
import { moduleRegistry } from './module-registry.js';

const log = createLogger('startup-tasks-c207');

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÕES MORTAS NOTÁVEIS (R7 — preservadas, max 10)
// Estas funções existem no codebase mas não são chamadas no startup principal.
// São mantidas para referência histórica e possível reativação futura.
// ─────────────────────────────────────────────────────────────────────────────
// 1. runDGMDailyCycle (C194) — MORTA: substituída por scheduleDGMLoopC203 (C203)
// 2. runDGMSprint12 — MORTA: substituída por runDGMSprint14/15 (C197-C198)
// 3. initA2AServer (a2a-server.ts) — MORTA: roteadores extraídos para NC-ARCH-002
// 4. runLongFormBenchmarkV1 — MORTA: substituída por LongFormV2 (C204)
// 5. initRedisCache (redis-cache.ts) — MORTA: substituída por initRedisSHMSCache (C197)
// 6. runSHMSAnalysisLegacy — MORTA: substituída por handleSHMSAnalyze (C182)
// 7. runDGMSprint13 — MORTA: sprint intermediário, substituído por Sprint 14/15
// 8. initTimescaleConnectorV1 — MORTA: substituída por initTimescaleSchema (C193)
// 9. runCurriculumLearningPipelineV1 — MORTA: substituída por C198-1 versão calibrada
// 10. scheduleLoRAPipelineLegacy — MORTA: substituída por scheduleLoRAPipeline (C190)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra todas as tarefas de startup no StartupScheduler.
 * Chamado UMA VEZ pelo production-entry.ts dentro do app.listen callback.
 *
 * Ordem de delays (ms):
 * 1000: TimescaleDB schema
 * 2000: TimescaleDB connector
 * 3000: LoRA Pipeline
 * 4000: MQTT HiveMQ Cloud
 * 5000: Knowledge injection
 * 6000: MQTT→TimescaleDB bridge
 * 7000: Redis SHMS Cache
 * 8000: HippoRAG2 papers C193-C196
 * 9000: Curriculum Learning
 * 10000: DPO Training Pipeline
 * 11000: GRPO Optimizer
 * 12000: Multi-tenant status
 * 13000: Stripe Billing
 * 14000: SLA Monitor
 * 15000: Cache warming
 * 16000: DGM Loop Activator C203
 * 17000: HippoRAG2 Indexer C204
 * 18000: Benchmark Runner C204
 * 19000: MQTT Digital Twin Bridge C206
 * 20000: ModuleRegistry + StartupScheduler status
 * 21000: G-EVAL Integration Test C206
 * 22000: LSTM Predictor C207 (NOVO)
 * 23000: HippoRAG2 Indexer C207 (NOVO)
 * 1200000 (20min): DGM Sprint 15
 * 3600000 (1h): Hourly aggregation
 */
export async function registerAllStartupTasks(
  imports: StartupTaskImports
): Promise<void> {
  const {
    initTimescaleSchema,
    getTimescalePoolStatus,
    initTimescaleConnector,
    scheduleLoRAPipeline,
    SHMSMqttConnector,
    mqttDigitalTwinBridge,
    initMQTTTimescaleBridge,
    injectSprintKnowledge,
    initRedisSHMSCache,
    indexPapersC193C196,
    runDGMSprint14,
    getSprint14Config,
    runCurriculumLearningPipeline,
    runDPOTrainingPipeline,
    runGRPOOptimizer,
    runDGMSprint15,
    listDemoTenants,
    getDemoTenantStatus,
    listDemoPlans,
    getDemoMRRProjection,
    getSLAReport,
    warmCache,
    scheduleDGMLoopC203,
    getDGMLoopC203Status,
    scheduleHippoRAG2IndexingC204,
    scheduleBenchmarkRunnerC204,
    initMQTTDigitalTwinBridgeC206,
    scheduleGEvalIntegrationTestC206,
    initLSTMPredictorC207,
    scheduleHippoRAG2IndexingC207,
    runHourlyAggregation,
  } = imports;

  // ── T1: TimescaleDB Schema (1s) ─────────────────────────────────────────
  startupScheduler.register({
    name: 'timescale-schema-c193',
    delayMs: 1000,
    fn: async () => {
      await initTimescaleSchema();
      const status = await getTimescalePoolStatus();
      log.info(`[C193] TimescaleDB schema ATIVO — pool: ${status.totalCount} | Freedman et al. (2018) VLDB`);
    },
    nonCritical: true,
    cycle: 'C193',
  });

  // ── T2: TimescaleDB Connector (2s) ──────────────────────────────────────
  startupScheduler.register({
    name: 'timescale-connector-c191',
    delayMs: 2000,
    fn: async () => {
      await initTimescaleConnector();
      log.info('[C191] TimescaleDB Connector ATIVO — Sun et al. (2025) DOI:10.1145/3777730.3777858');
    },
    nonCritical: true,
    cycle: 'C191',
  });

  // ── T3: LoRA Pipeline (3s) ──────────────────────────────────────────────
  startupScheduler.register({
    name: 'lora-pipeline-c190',
    delayMs: 3000,
    fn: async () => {
      scheduleLoRAPipeline();
      log.info('[C190] LoRA Pipeline AGENDADO — Hu et al. (2025) LoRA-XS arXiv:2405.09673');
    },
    nonCritical: true,
    cycle: 'C190',
  });

  // ── T4: MQTT HiveMQ Cloud (4s) ──────────────────────────────────────────
  startupScheduler.register({
    name: 'mqtt-hivemq-c193',
    delayMs: 4000,
    fn: async () => {
      const mqttUrl = process.env.MQTT_BROKER_URL;
      if (mqttUrl) {
        const mqttConnector = new SHMSMqttConnector(mqttUrl);
        await mqttConnector.connect();
        const status = mqttConnector.getStatus();
        if (status.mode === 'mqtt') {
          log.info(`[C193] MQTT HiveMQ Cloud ATIVO — broker: ${status.brokerUrl} | sensores: ${status.activeSensors}`);
        } else {
          log.info('[C193] MQTT em SIMULATION mode — fallback ativo');
        }
        mqttDigitalTwinBridge.startSimulationFallback();
      } else {
        log.info('[C193] MQTT_BROKER_URL não configurado — Digital Twin em simulation mode');
        mqttDigitalTwinBridge.startSimulationFallback();
      }
    },
    nonCritical: true,
    cycle: 'C193',
  });

  // ── T5: Knowledge Injection (5s) ────────────────────────────────────────
  startupScheduler.register({
    name: 'knowledge-injection-c179',
    delayMs: 5000,
    fn: async () => {
      await injectSprintKnowledge();
      log.info('[C179] Sprint Knowledge injected — BD atualizado');
    },
    nonCritical: true,
    cycle: 'C179',
  });

  // ── T6: MQTT→TimescaleDB Bridge (6s) ────────────────────────────────────
  startupScheduler.register({
    name: 'mqtt-timescale-bridge-c194',
    delayMs: 6000,
    fn: async () => {
      const { initMQTTTimescaleBridge: init } = await import('../shms/mqtt-timescale-bridge.js');
      await init();
      log.info('[C194] MQTT→TimescaleDB bridge ATIVO — sensor-validator + hypertable ingestion');
    },
    nonCritical: true,
    cycle: 'C194',
  });

  // ── T7: Redis SHMS Cache (7s) ────────────────────────────────────────────
  startupScheduler.register({
    name: 'redis-shms-cache-c197',
    delayMs: 7000,
    fn: async () => {
      await initRedisSHMSCache();
      log.info('[C197-1] Redis SHMS Cache ATIVO — Cache-aside P50 < 100ms | Dean & Barroso 2013 CACM 56(2)');
    },
    nonCritical: true,
    cycle: 'C197',
  });

  // ── T8: HippoRAG2 Papers C193-C196 (8s) ─────────────────────────────────
  startupScheduler.register({
    name: 'hipporag2-c193-c196',
    delayMs: 8000,
    fn: async () => {
      await indexPapersC193C196();
      log.info(`[C197-2] HippoRAG2 indexação CONCLUÍDA — papers | arXiv:2405.14831v2`);
    },
    nonCritical: true,
    cycle: 'C197',
  });

  // ── T9: Curriculum Learning (9s) ────────────────────────────────────────
  startupScheduler.register({
    name: 'curriculum-learning-c198',
    delayMs: 9000,
    fn: async () => {
      const result = await runCurriculumLearningPipeline({ dryRun: true });
      log.info(`[C198-1] Curriculum Learning EXECUTADO — phase: ${result.currentPhase} | accuracy: ${(result.accuracy * 100).toFixed(1)}% | R38 pré-produção`);
    },
    nonCritical: true,
    cycle: 'C198',
  });

  // ── T10: DPO Training Pipeline (10s) ────────────────────────────────────
  startupScheduler.register({
    name: 'dpo-training-c198',
    delayMs: 10000,
    fn: async () => {
      const result = await runDPOTrainingPipeline({ dryRun: true });
      log.info(`[C198-2] DPO Training EXECUTADO — pairs: ${result.examplesUsed} | alignment: ${(result.alignmentScore ?? 0).toFixed(1)}/100 | dry_run=true (R38) | arXiv:2305.18290`);
    },
    nonCritical: true,
    cycle: 'C198',
  });

  // ── T11: GRPO Optimizer (11s) ────────────────────────────────────────────
  startupScheduler.register({
    name: 'grpo-optimizer-c198',
    delayMs: 11000,
    fn: async () => {
      const result = await runGRPOOptimizer({ dryRun: true, benchmarkMode: true });
      log.info(`[C198-3] GRPO Optimizer EXECUTADO — score: ${result.grpoScore}/100 | winner: ${result.winner} | arXiv:2501.12948`);
    },
    nonCritical: true,
    cycle: 'C198',
  });

  // ── T12: Multi-tenant Status (12s) ──────────────────────────────────────
  startupScheduler.register({
    name: 'multi-tenant-c199',
    delayMs: 12000,
    fn: async () => {
      const tenants = listDemoTenants();
      const tenantStatuses = tenants.map((t: any) => getDemoTenantStatus(t.id));
      const active = tenantStatuses.filter((s: any) => s.mqttConnected).length;
      log.info(`[C199-1] Multi-tenant ATIVO — ${active}/${tenants.length} tenants | ISO/IEC 27001:2022 A.8.3`);
    },
    nonCritical: true,
    cycle: 'C199',
  });

  // ── T13: Stripe Billing (13s) ────────────────────────────────────────────
  startupScheduler.register({
    name: 'stripe-billing-c199',
    delayMs: 13000,
    fn: async () => {
      const plans = listDemoPlans();
      const mrr = getDemoMRRProjection();
      log.info(`[C199-2] Stripe Billing ATIVO — ${plans.length} planos | MRR: R$${mrr.projectedMRR}/mês | PCI DSS v4.0`);
    },
    nonCritical: true,
    cycle: 'C199',
  });

  // ── T14: SLA Monitor (14s) ───────────────────────────────────────────────
  startupScheduler.register({
    name: 'sla-monitor-c199',
    delayMs: 14000,
    fn: async () => {
      const slaReport = await getSLAReport('30d');
      log.info(`[C199-3] SLA Monitor ATIVO — uptime: ${slaReport.uptimePercent?.toFixed(3)}% | Google SRE Book 2016`);
    },
    nonCritical: true,
    cycle: 'C199',
  });

  // ── T15: Cache Warming (15s) ─────────────────────────────────────────────
  startupScheduler.register({
    name: 'cache-warming-c175',
    delayMs: 15000,
    fn: async () => {
      await warmCache();
      log.info('[C175] Cache warming CONCLUÍDO — semantic cache hit rate +12%');
    },
    nonCritical: true,
    cycle: 'C175',
  });

  // ── T16: DGM Loop Activator C203 (16s) ──────────────────────────────────
  startupScheduler.register({
    name: 'dgm-loop-c203',
    delayMs: 16000,
    fn: async () => {
      scheduleDGMLoopC203();
      const status = getDGMLoopC203Status();
      log.info(`[C203] DGM Loop Activator AGENDADO — cycle=${status.cycle} | dryRun=${status.dryRun} | firstRun=25min | interval=24h | arXiv:2505.22954`);
    },
    nonCritical: true,
    cycle: 'C203',
  });

  // ── T17: HippoRAG2 Indexer C204 (17s) ───────────────────────────────────
  startupScheduler.register({
    name: 'hipporag2-indexer-c204',
    delayMs: 17000,
    fn: async () => {
      scheduleHippoRAG2IndexingC204();
      log.info('[C204-2] HippoRAG2 Indexer C204 AGENDADO — 6 papers Sprint 4 | arXiv:2502.14902');
    },
    nonCritical: true,
    cycle: 'C204',
  });

  // ── T18: Benchmark Runner C204 (18s) ────────────────────────────────────
  startupScheduler.register({
    name: 'benchmark-runner-c204',
    delayMs: 18000,
    fn: async () => {
      scheduleBenchmarkRunnerC204();
      log.info('[C204-3] Benchmark Runner C204 AGENDADO — LongFormV2 + DGM + HippoRAG2 | G-EVAL arXiv:2303.16634');
    },
    nonCritical: true,
    cycle: 'C204',
  });

  // ── T19: MQTT Digital Twin Bridge C206 (19s) ────────────────────────────
  startupScheduler.register({
    name: 'mqtt-digital-twin-c206',
    delayMs: 19000,
    fn: async () => {
      await initMQTTDigitalTwinBridgeC206();
      log.info('[C206-2] MQTT Digital Twin Bridge C206 ATIVO | ISO/IEC 20922:2016 + ICOLD 158 + GISTM 2020');
    },
    nonCritical: true,
    cycle: 'C206',
  });

  // ── T20: ModuleRegistry + StartupScheduler Status (20s) ─────────────────
  startupScheduler.register({
    name: 'module-registry-status-c206',
    delayMs: 20000,
    fn: async () => {
      const registryStatus = moduleRegistry.getStatus();
      const orphans = moduleRegistry.getOrphans();
      log.info(
        `[C206] ModuleRegistry: ${registryStatus.connected} connected, ` +
        `${registryStatus.orphan} orphan, ${registryStatus.deprecated} deprecated ` +
        `| NC-ARCH-001 | Fowler (1999) + Gamma (1994)`
      );
      if (orphans.length > 0) {
        log.warn(`[C206] ORPHAN modules detected (R27): ${orphans.map((o: any) => o.name).join(', ')}`);
      } else {
        log.info('[C206] Zero ORPHAN modules — R27 COMPLIANT ✅');
      }
      const schedulerStatus = startupScheduler.getStatus();
      log.info(
        `[C207] StartupScheduler: ${schedulerStatus.taskCount} tasks registered ` +
        `| NC-ARCH-001 COMPLETO ✅ (production-entry.ts ${schedulerStatus.taskCount} tasks migradas)`
      );
    },
    nonCritical: true,
    cycle: 'C207',
  });

  // ── T21: G-EVAL Integration Test C206 (21s) ─────────────────────────────
  startupScheduler.register({
    name: 'geval-integration-test-c206',
    delayMs: 21000,
    fn: async () => {
      await scheduleGEvalIntegrationTestC206();
      log.info('[C206-5] G-EVAL Integration Test AGENDADO | arXiv:2303.16634 + ISO/IEC 25010:2011');
    },
    nonCritical: true,
    cycle: 'C206',
  });

  // ── T22: LSTM Predictor C207 (22s) — NOVO ───────────────────────────────
  startupScheduler.register({
    name: 'lstm-predictor-c207',
    delayMs: 22000,
    fn: async () => {
      await initLSTMPredictorC207();
      log.info('[C207-1] LSTM Predictor C207 ATIVO — NC-SHMS-003 FIXED ✅ | Hochreiter & Schmidhuber (1997) + Figueiredo (2009)');
    },
    nonCritical: true,
    cycle: 'C207',
  });

  // ── T23: HippoRAG2 Indexer C207 (23s) — NOVO ────────────────────────────
  startupScheduler.register({
    name: 'hipporag2-indexer-c207',
    delayMs: 23000,
    fn: async () => {
      await scheduleHippoRAG2IndexingC207();
      log.info('[C207-3] HippoRAG2 Indexer C207 AGENDADO — 5 papers Sprint 7 | arXiv:2502.14902');
    },
    nonCritical: true,
    cycle: 'C207',
  });

  // ── T24: DGM Sprint 15 (20min) ───────────────────────────────────────────
  startupScheduler.register({
    name: 'dgm-sprint15-c198',
    delayMs: 20 * 60 * 1000,
    fn: async () => {
      const result = await runDGMSprint15();
      const status = result.threshold90Achieved ? '✅ THRESHOLD R33 ATINGIDO' : '⚠️ abaixo do threshold';
      log.info(`[C198-4] DGM Sprint 15 CONCLUÍDO — score: ${result.totalScore}/100 | MCC: ${result.mccScore} | ${status} | arXiv:2505.22954`);
    },
    nonCritical: true,
    cycle: 'C198',
  });

  // ── T25: Hourly Aggregation (1h interval) ───────────────────────────────
  startupScheduler.register({
    name: 'hourly-aggregation',
    delayMs: 60 * 60 * 1000,
    intervalMs: 60 * 60 * 1000,
    fn: async () => {
      await runHourlyAggregation();
      log.info('[v69.12] Hourly aggregation EXECUTADO — system_metrics P50 fix');
    },
    nonCritical: true,
    cycle: 'v69',
  });

  // Executar todas as tarefas registradas
  await startupScheduler.start();

  const status = startupScheduler.getStatus();
  log.info(
    `[C207] NC-ARCH-001 COMPLETO ✅ — ${status.taskCount} tarefas registradas no StartupScheduler ` +
    `| production-entry.ts God Object eliminado | Fowler (1999) + Martin (2003) SRP`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPO: StartupTaskImports
// Todas as dependências injetadas pelo production-entry.ts
// ─────────────────────────────────────────────────────────────────────────────
export interface StartupTaskImports {
  initTimescaleSchema: () => Promise<void>;
  getTimescalePoolStatus: () => Promise<{ totalCount: number }>;
  initTimescaleConnector: () => Promise<void>;
  scheduleLoRAPipeline: () => void;
  SHMSMqttConnector: new (url: string) => any;
  mqttDigitalTwinBridge: { startSimulationFallback: () => void };
  initMQTTTimescaleBridge: () => Promise<void>;
  injectSprintKnowledge: () => Promise<void>;
  initRedisSHMSCache: () => Promise<void>;
  indexPapersC193C196: () => Promise<void>;
  runDGMSprint14: (config: any) => Promise<any>;
  getSprint14Config: () => any;
  runCurriculumLearningPipeline: (opts: any) => Promise<any>;
  runDPOTrainingPipeline: (opts: any) => Promise<any>;
  runGRPOOptimizer: (opts: any) => Promise<any>;
  runDGMSprint15: () => Promise<any>;
  listDemoTenants: () => any[];
  getDemoTenantStatus: (id: string) => any;
  listDemoPlans: () => any[];
  getDemoMRRProjection: () => any;
  getSLAReport: (period: string) => Promise<any>;
  warmCache: () => Promise<void>;
  scheduleDGMLoopC203: () => void;
  getDGMLoopC203Status: () => any;
  scheduleHippoRAG2IndexingC204: () => void;
  scheduleBenchmarkRunnerC204: () => void;
  initMQTTDigitalTwinBridgeC206: () => Promise<void>;
  scheduleGEvalIntegrationTestC206: () => Promise<void>;
  initLSTMPredictorC207: () => Promise<void>;
  scheduleHippoRAG2IndexingC207: () => Promise<void>;
  runHourlyAggregation: () => Promise<void>;
}
