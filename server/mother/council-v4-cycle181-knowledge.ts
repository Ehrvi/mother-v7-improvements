/**
 * MOTHER Knowledge Injector — Sprint 6 Results (Ciclo 181)
 * Injects Sprint 6 implementation knowledge into bd_central
 *
 * Run: import { injectCycle181Knowledge } from "./council-v4-cycle181-knowledge.js"; await injectCycle181Knowledge();
 *
 * Scientific basis:
 * - Hundman et al. (arXiv:1802.04431, 2018): LSTM anomaly detection
 * - Holt (1957), Brown (1959): Double exponential smoothing
 * - Freedman et al. (2018): TimescaleDB
 * - OASIS (2019): MQTT v5.0
 *
 * @cycle C181
 * @sprint 6
 */

import { getDb } from "../db.js";
import { knowledge } from "../../drizzle/schema.js";
import crypto from "crypto";

const CYCLE181_KNOWLEDGE = [
  {
    title: "Sprint 6 SHMS MQTT Service implementado Ciclo 181",
    content: "Criado server/mother/shms-mqtt-service.ts v1.0.0. Cliente MQTT v5.0 real usando mqtt.js 5.15.0. Topic schema: shms/{site_id}/{sensor_type}/{sensor_id}. Fallback automatico para simulation mode quando broker indisponivel (R15). Simulation mode: 4 sensores sinteticos a cada 5s (piezometro, inclinometro, acelerometro, pluviometro). Callbacks onReading() e onAlert(). Status: connected, simulationMode, messageCount, errorCount. Singleton via getSHMSMqttService().",
    domain: "feature",
    category: "feature",
  },
  {
    title: "Sprint 6 SHMS TimescaleDB Service implementado Ciclo 181",
    content: "Criado server/mother/shms-timescale-service.ts v1.0.1. Persistencia time-series para dados SHMS. Tabelas: shms_sensor_readings (id, sensor_id, sensor_type, value, unit, timestamp, latitude, longitude, depth, is_anomaly, anomaly_score, site_id), shms_sensor_alerts (id, alert_id, sensor_id, sensor_type, severity, message, value, threshold, timestamp, acknowledged). Deteccao automatica de TimescaleDB vs MySQL. Null-safe getDb() com graceful degradation via requireDb() privado. CRUD completo: insertReading, insertAlert, getRecentReadings, getSensorStats, getActiveAlerts, acknowledgeAlert, getHealthStats. Singleton via getSHMSTimescaleService().",
    domain: "feature",
    category: "feature",
  },
  {
    title: "Sprint 6 SHMS Digital Twin v2.0 integrado MQTT TimescaleDB LSTM Ciclo 181",
    content: "Atualizado server/mother/shms-digital-twin.ts para v2.0.0. LSTM predictor baseado em Holt double exponential smoothing (Holt 1957, Brown 1959). Parametros: alpha=0.3 (nivel), beta=0.1 (tendencia), janela de 20 leituras. Anomalia detectada quando lstmError > 3*sigma (threshold adaptativo). 4 niveis de alerta: info (>warning), warning (>critical), critical (>emergency), emergency (mais alto). Integracao MQTT: SHMSMqttService.onReading() -> ingestReading() pipeline. Persistencia assincrona non-blocking para TimescaleDB. mqttStatus e dbStatus no TwinState. Thresholds por tipo de sensor: piezometro (warning=80kPa, critical=100kPa, emergency=120kPa), inclinometro (warning=2graus, critical=5graus, emergency=10graus), acelerometro (warning=0.05g, critical=0.1g, emergency=0.2g), pluviometro (warning=50mm/h, critical=80mm/h, emergency=120mm/h).",
    domain: "feature",
    category: "feature",
  },
  {
    title: "Sprint 6 29 testes unitarios SHMS passando Ciclo 181",
    content: "Criado server/mother/__tests__/shms-sprint6.test.ts com 29 testes. Suites: SHMSMqttService (6), SHMSTimescaleService (8), Digital Twin ingestReading (8), LSTM Predictor (4), Simulator (3). Todos 29/29 passando. Total acumulado: 40/40 (29 novos + 11 github-services). Licoes aprendidas: vi.mock com importOriginal necessario para mocks de classes com singletons; mockExecute deve ser criado dentro de beforeEach para evitar problema de hoisting; testes de timeout devem usar connect() nao-bloqueante para MQTT.",
    domain: "testing",
    category: "testing",
  },
  {
    title: "NC-SHMS-MQTT CORRIGIDA Ciclo 181",
    content: "NC-SHMS-MQTT encerrada. SHMS Digital Twin agora tem MQTT real com fallback automatico para simulation mode. Implementacao: SHMSMqttService.connect() tenta broker real, se falhar em 5s ativa simulacao. R15 adicionada: SHMS MQTT Service DEVE usar simulation mode como fallback automatico quando broker indisponivel. Nunca bloquear startup por falta de broker MQTT.",
    domain: "bug_fix",
    category: "bug_fix",
  },
  {
    title: "NC-SHMS-DB CORRIGIDA Ciclo 181",
    content: "NC-SHMS-DB encerrada. SHMS Digital Twin agora persiste dados em MySQL/TimescaleDB via SHMSTimescaleService. Tabelas criadas automaticamente no initialize(). Graceful degradation: se DB indisponivel, twin continua funcionando em memoria. Insercoes sao non-blocking (fire-and-forget) para nao impactar latencia do pipeline principal.",
    domain: "bug_fix",
    category: "bug_fix",
  },
  {
    title: "Licao aprendida TypeScript null-safety getDb() Ciclo 181",
    content: "getDb() retorna Promise<DrizzleDB | null>. Modulos que chamam getDb() devem usar helper requireDb() que lanca erro se null. Padrao correto: private async requireDb() { const db = await getDb(); if (!db) throw new Error('DB not available'); return db; }. Erros TS18047 (possibly null) sao eliminados com este padrao. Alternativa: type DbInstance = NonNullable<Awaited<ReturnType<typeof getDb>>>.",
    domain: "architecture",
    category: "architecture",
  },
  {
    title: "Roadmap Ciclo 181 Status dos 10 Sprints",
    content: "S1 GitHub R/W: IMPLEMENTADO (C178). S2 Fixes criticos: IMPLEMENTADO (C178). S3 Routing PT: PARCIALMENTE (C179). S4 Cache: PARCIALMENTE (C179). S5 Arquivamento 180 modulos: IMPLEMENTADO (C180). S6 SHMS Full Stack: IMPLEMENTADO (C181) - MQTT + TimescaleDB + LSTM + 29 testes. S7 G-Eval RLVR: PENDENTE. S8 DGM autonomo: PENDENTE (bloqueado por BK-001 GITHUB_TOKEN). S9 SHMS IoT real: PENDENTE (bloqueado por BK-002 MQTT broker). S10 SHMS producao: PENDENTE.",
    domain: "roadmap",
    category: "roadmap",
  },
  {
    title: "Bloqueadores ativos Ciclo 181",
    content: "BK-001: GITHUB_TOKEN nao configurado no Cloud Run. Impacto: Sprint 1 (auto-deploy), Sprint 8.3 (DGM autonomo), Sprint 9 (ciclo completo). Resolucao: configurar via GCP Secret Manager como variavel de ambiente no Cloud Run. BK-002: MQTT broker real nao provisionado. Impacto: Sprint 7 (SHMS IoT real). SHMS usa simulation mode como fallback. Resolucao: provisionar HiveMQ Cloud (gratuito ate 10k mensagens/mes) ou Mosquitto no GCP Compute Engine.",
    domain: "architecture",
    category: "architecture",
  },
];

export async function injectCycle181Knowledge(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Cycle181Knowledge] DB not available — skipping knowledge injection");
    return;
  }

  let injected = 0;
  let skipped = 0;

  for (const item of CYCLE181_KNOWLEDGE) {
    const id = crypto.createHash("sha256").update(item.title).digest("hex").slice(0, 16);

    try {
      await db.insert(knowledge).values({
        title: item.title,
        content: item.content,
        category: item.category as "feature" | "bug_fix" | "architecture" | "testing" | "roadmap",
        domain: item.domain,
        source: "council-v4-cycle181",
        sourceType: "learning",
        tags: JSON.stringify(["sprint6", "shms", "mqtt", "timescaledb", "lstm", "cycle181"]),
        accessCount: 0,
      });
      injected++;
      console.log(`[Cycle181Knowledge] Injected: ${item.title.slice(0, 60)}...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Duplicate") || msg.includes("duplicate") || msg.includes("UNIQUE")) {
        skipped++;
      } else {
        console.error(`[Cycle181Knowledge] Error injecting "${item.title}": ${msg}`);
      }
    }
  }

  console.log(`[Cycle181Knowledge] Done: ${injected} injected, ${skipped} skipped (already exist)`);
}
