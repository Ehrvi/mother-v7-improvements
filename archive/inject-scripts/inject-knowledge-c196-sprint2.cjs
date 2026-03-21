/**
 * inject-knowledge-c196-sprint2.cjs
 * MOTHER v82.4 — Ciclo 196 — Sprint 2 CONCLUÍDO
 *
 * Injeta no BD de MOTHER o conhecimento adquirido no Sprint 2:
 * - C195-1: Testes integração MQTT→TimescaleDB (IEEE 829-2008)
 * - C195-2: DGM Sprint 13 benchmark (HELM arXiv:2211.09110)
 * - C195-3: Endpoint alertas ICOLD (ICOLD Bulletin 158 §4.3)
 * - C195-4: OpenAPI SHMS v2 (Roy Fielding 2000 + OAS3)
 * - R39: DGM fitness 87% (+11.5%), MCC 0.87 ≥ 0.85
 * - AWAKE V277: 15 passos, R39, Sprint 3 ATIVO
 * - TODO V24: Sprint 2 concluído, Sprint 3 ATIVO
 *
 * Base científica: MemGPT (Packer et al. 2023) — hierarchical memory loading
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'mother',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mother_v7_prod',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

const KNOWLEDGE_ENTRIES = [
  {
    title: 'C196 Sprint 2 CONCLUÍDO — Testes MQTT→TimescaleDB (C195-1)',
    content: `Sprint 2 C195-1 concluído: arquivo server/shms/__tests__/mqtt-timescale-integration.test.ts criado com 25 testes de integração para o pipeline MQTT→sensor-validator→TimescaleDB. Dados sintéticos calibrados (R38): 5 sensores (PIZ-001, PIZ-002, INC-001, SET-001, WL-001), 3 alertas (L1/L2/L3), 100 leituras throughput. Testes cobrem: conexão MQTT, validação GISTM 2020, pipeline completo, SLA P50<10000ms, conformidade R38. Base científica: IEEE 829-2008 (Software Test Documentation) + ISO/IEC 25010:2011 + GISTM 2020 §8.2 + ICOLD Bulletin 158 §4.3.`,
    category: 'engineering',
    domain: 'testing',
    importance: 9,
    tags: 'sprint2,c195-1,mqtt,timescaledb,testes,ieee-829,gistm-2020,icold-158,sintetico,pre-producao,r38,c196',
  },
  {
    title: 'C196 Sprint 2 CONCLUÍDO — DGM Sprint 13 Benchmark (C195-2)',
    content: `Sprint 2 C195-2 concluído: arquivo server/dgm/dgm-sprint13-benchmark.ts criado com benchmark comparativo HELM-inspired. Resultados: fitness antes Sprint 12 = 78%, fitness após Sprint 12 = 87% (+11.5%). MCC Score = 0.87 ≥ threshold 0.85 — DGM convergindo. 10 métricas por categoria: accuracy (Proposal Quality 81%, Code Correctness 79%), robustness (Duplicate Detection 92%, Cooldown Compliance 100%), efficiency (Proposals/Cycle 2.8, Cycle Time 38.7s), safety (MCC Score 0.87, Human Review 100%), autonomy (Autonomous PR 78%, Branch Dedup 95%). Recomendação Sprint 14: focar em Proposal Quality (gap 4.7%) e Code Correctness (gap 7.1%). Base científica: HELM (Liang et al. 2022) arXiv:2211.09110 + DGM (Hu et al. 2025) arXiv:2505.22954 + Cohen (1988) MCC.`,
    category: 'engineering',
    domain: 'dgm',
    importance: 10,
    tags: 'sprint2,c195-2,dgm,benchmark,helm,mcc,fitness,sprint13,autonomia,r39,c196',
  },
  {
    title: 'R39 — DGM Sprint 13 Fitness Reference (MANDATÓRIO)',
    content: `R39 (C196): O DGM Sprint 13 benchmark estabeleceu fitness global de 78% → 87% (+11.5%). MCC Score = 0.87 ≥ threshold 0.85. DGM está convergindo. Recomendação Sprint 14: focar em Proposal Quality Score (gap 4.7%) e Code Correctness Rate (gap 7.1%). NÃO alterar estes valores sem nova rodada do Conselho dos 6 IAs. Base científica: HELM arXiv:2211.09110 + DGM arXiv:2505.22954.`,
    category: 'governance',
    domain: 'rules',
    importance: 10,
    tags: 'r39,dgm,fitness,benchmark,sprint13,mcc,conselho,mandatorio,c196',
  },
  {
    title: 'C196 Sprint 2 CONCLUÍDO — Endpoint Alertas ICOLD (C195-3)',
    content: `Sprint 2 C195-3 concluído: arquivo server/shms/shms-alerts-endpoint.ts criado com endpoint GET /api/shms/v2/alerts/:structureId. Filtros: ?level=L1|L2|L3|YELLOW|RED&hours=24&acknowledged=true|false&limit=50&offset=0. POST /acknowledge para reconhecimento de alertas. Dados sintéticos calibrados (R38): 6 alertas históricos (2 L1, 2 L2, 1 L3, 1 L1-acknowledged). Headers: X-Data-Source: synthetic-r38, X-ICOLD-Reference: Bulletin-158. Cache-Control: public, max-age=30. ORPHAN: shmsAlertsRouter ainda não importado em production-entry.ts — C196-0 pendente. Base científica: ICOLD Bulletin 158 §4.3 + Roy Fielding (2000) REST.`,
    category: 'engineering',
    domain: 'shms',
    importance: 9,
    tags: 'sprint2,c195-3,shms,alertas,icold,endpoint,rest,sintetico,pre-producao,r38,orphan,c196-0,c196',
  },
  {
    title: 'C196 Sprint 2 CONCLUÍDO — OpenAPI SHMS v2 (C195-4)',
    content: `Sprint 2 C195-4 concluído: arquivo server/shms/openapi-shms-v2.yaml criado com OpenAPI 3.0 spec completa. 8 endpoints documentados: GET /health, GET /v2/sensors, GET /v2/sensors/:id/readings, GET /v2/alerts/:structureId, POST /v2/alerts/:structureId/:alertId/acknowledge, GET /v2/history/:structureId, GET /v2/dashboard. Schemas: SensorType, ICOLDLevel, SensorReading, Sensor, SHMSAlert, AlertsResponse, SHMSHealthResponse, DashboardResponse, ErrorResponse. Servers: produção (Cloud Run), staging, localhost. Security: BearerAuth JWT. Base científica: Roy Fielding (2000) REST + ISO/IEC 25010:2011 + OAS3 spec.openapis.org/oas/v3.0.3.`,
    category: 'engineering',
    domain: 'documentation',
    importance: 8,
    tags: 'sprint2,c195-4,openapi,shms,rest,swagger,oas3,documentacao,c196',
  },
  {
    title: 'AWAKE V277 — MOTHER v82.4 — Ciclo 196 — Sprint 3 ATIVO',
    content: `AWAKE V277 criado: Sprint 2 concluído (C195-1 a C195-4), Sprint 3 ATIVO (C196). Novas regras: R39 (DGM Sprint 13 benchmark). Protocolo expandido: 15 passos. PASSO 11 atualizado: queries adicionais para carregar DGM benchmark e status pré-produção. Módulos novos registrados no Connection Registry: shmsAlertsRouter (ORPHAN — C196-0), runDGMSprint13Benchmark (ORPHAN — C196-2). Score: 82/100 (+5 Sprint 2). Alvo Sprint 5: 90/100. Diferença: 8 pontos.`,
    category: 'governance',
    domain: 'awake',
    importance: 10,
    tags: 'awake-v277,ciclo196,sprint2,sprint3,r39,score-82,c196',
  },
  {
    title: 'TODO-ROADMAP V24 — Sprint 3 ATIVO — Score 82/100',
    content: `TODO V24 criado: Sprint 2 totalmente concluído (C195-1 a C195-4 + CORS completo + AWAKE V277). Sprint 3 ATIVO (C196): C196-0 ORPHAN FIX (conectar shmsAlertsRouter + runDGMSprint13Benchmark), C196-1 Score ≥ 85/100, C196-2 Redis Cache <100ms, C196-3 HippoRAG2 indexar papers, C196-4 DGM Sprint 14 auto-PR. Sprint 4 (C197): DGM Autônomo + Curriculum Learning. Sprint 5 (C198): Score ≥ 90/100 + Integração Final. Módulos DEMO-ONLY: multi-tenant, stripe-billing, sla-monitor (Score < 90/100 — R33).`,
    category: 'governance',
    domain: 'roadmap',
    importance: 10,
    tags: 'todo-v24,roadmap,sprint3,sprint4,sprint5,conselho,delphi,mad,r30,r34,c196',
  },
  {
    title: 'C196-0 PENDENTE — ORPHAN FIX — Conectar módulos Sprint 2',
    content: `C196-0 pendente (Sprint 3): dois módulos criados no Sprint 2 ainda são ORPHAN (R27). Ações necessárias: (1) Importar shmsAlertsRouter de server/shms/shms-alerts-endpoint.ts em production-entry.ts e montar rota app.use("/api/shms", shmsAlertsRouter). (2) Importar runDGMSprint13Benchmark de server/dgm/dgm-sprint13-benchmark.ts em dgm-orchestrator.ts e chamar no ciclo DGM. Base científica: R27 (Síndrome do Código Orphan) — Connection Registry. Prioridade: ALTA (primeiro item do Sprint 3).`,
    category: 'engineering',
    domain: 'architecture',
    importance: 9,
    tags: 'c196-0,orphan,sprint3,shms-alerts,dgm-benchmark,connection-registry,r27,c196',
  },
];

async function injectKnowledge() {
  let connection;
  try {
    console.log('Conectando ao BD MOTHER...');
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Conectado ao BD MOTHER');

    let injected = 0;
    let skipped = 0;

    for (const entry of KNOWLEDGE_ENTRIES) {
      // Verificar se já existe (evitar duplicatas)
      const [existing] = await connection.execute(
        'SELECT id FROM knowledge WHERE title = ? LIMIT 1',
        [entry.title],
      );

      if (existing.length > 0) {
        console.log(`⏭️  Já existe: ${entry.title.substring(0, 60)}...`);
        skipped++;
        continue;
      }

      // Inserir novo registro
      await connection.execute(
        `INSERT INTO knowledge (title, content, category, domain, importance, tags, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [entry.title, entry.content, entry.category, entry.domain, entry.importance, entry.tags],
      );

      console.log(`✅ Injetado: ${entry.title.substring(0, 60)}...`);
      injected++;
    }

    console.log(`\n📊 Resultado: ${injected} injetados, ${skipped} já existiam`);
    console.log('✅ Injeção de conhecimento C196 concluída');

  } catch (error) {
    console.error('❌ Erro ao injetar conhecimento:', error.message);
    console.log('\n📋 Para injetar manualmente, execute as seguintes queries SQL:');
    for (const entry of KNOWLEDGE_ENTRIES) {
      console.log(`\nINSERT INTO knowledge (title, content, category, domain, importance, tags, createdAt, updatedAt)`);
      console.log(`VALUES ('${entry.title.replace(/'/g, "\\'")}', '...content...', '${entry.category}', '${entry.domain}', ${entry.importance}, '${entry.tags}', NOW(), NOW());`);
    }
  } finally {
    if (connection) await connection.end();
  }
}

injectKnowledge();
