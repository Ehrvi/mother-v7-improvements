/**
 * Knowledge Injection — Ciclo 186 — Phase 2
 * MOTHER v81.8 — 2026-03-07
 *
 * Injects Phase 2 learnings into the production BD (Cloud SQL mother-db-sydney)
 * via TiDB Cloud proxy (sandbox environment).
 *
 * Scientific basis:
 * - Dean & Barroso (2013) — The Tail at Scale
 * - Chen et al. (2023) — FrugalGPT
 * - ISO/IEC 20922:2016 — MQTT v5.0
 */

'use strict';

const mysql = require('mysql2/promise');

const DB_URL = process.env.DATABASE_URL || '';

if (!DB_URL) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

// Parse DATABASE_URL: mysql://user:pass@host:port/dbname
function parseDbUrl(url) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d*)\/?(.+)?/);
  if (!match) throw new Error('Invalid DATABASE_URL format: ' + url);
  return {
    user: match[1],
    password: decodeURIComponent(match[2]),
    host: match[3],
    port: parseInt(match[4] || '3306'),
    database: match[5] || 'mother_db',
  };
}

const knowledgeEntries = [
  {
    category: 'infrastructure',
    title: 'BD Oficial de Produção: Cloud SQL mother-db-sydney',
    content: `REGRA MANDATÓRIA (R21): O BD oficial de produção de MOTHER é Cloud SQL MySQL 8.0, instância mothers-library-mcp:australia-southeast1:mother-db-sydney, database mother_db. Possui 28 tabelas e 6.549 entradas de conhecimento. TiDB Cloud (gateway03.us-east-1.prod.aws.tidbcloud.com) é APENAS o sandbox Manus — nunca consultar em produção. Acesso via Cloud SQL Auth Proxy (porta 3307) ou secret mother-db-url no GCP Secret Manager.`,
    source: 'Ciclo 186 — Mapeamento BD Produção',
    confidence: 1.0,
    tags: JSON.stringify(['bd-oficial', 'cloud-sql', 'producao', 'r21', 'infraestrutura']),
  },
  {
    category: 'infrastructure',
    title: 'HiveMQ Cloud Configurado no Cloud Run (NC-SHMS-MQTT)',
    content: `NC-SHMS-MQTT CORRIGIDA no Ciclo 186. HiveMQ Cloud MQTT v5.0 TLS configurado: URL mqtts://5d8c986a8de24d1d9d92cbd55fcd75d7.s1.eu.hivemq.cloud:8883, usuário Mother, secrets no GCP (mother-hivemq-url, mother-hivemq-username, mother-hivemq-password). Secrets mapeados ao Cloud Run via gcloud run services update --update-secrets. Nova revisão mother-interface-00653-dpn deployada com 100% tráfego. Tópicos GISTM: shms/sensors/{tipo}/{sensorId}. Base: ISO/IEC 20922:2016 MQTT v5.0.`,
    source: 'Ciclo 186 — NC-SHMS-MQTT Fix',
    confidence: 1.0,
    tags: JSON.stringify(['hivemq', 'mqtt', 'shms', 'cloud-run', 'nc-shms-mqtt']),
  },
  {
    category: 'security',
    title: 'GITHUB_TOKEN Confirmado Ativo no Cloud Run (NC-GITHUB-TOKEN)',
    content: `NC-GITHUB-TOKEN CORRIGIDA no Ciclo 186 (confirmação). GITHUB_TOKEN secret mother-github-token = ghu_yaqMTc... já estava configurado no Cloud Run mother-interface. Verificado via gcloud run services describe. Sprint 9 (DGM Ciclo Completo Autônomo) está desbloqueado. Permissões: contents:write, pull_requests:write, issues:write.`,
    source: 'Ciclo 186 — NC-GITHUB-TOKEN Confirmação',
    confidence: 1.0,
    tags: JSON.stringify(['github-token', 'cloud-run', 'dgm', 'sprint-9', 'nc-github-token']),
  },
  {
    category: 'performance',
    title: 'Latency Telemetry Module (NC-LATENCY-001 Parcial)',
    content: `Módulo latency-telemetry.ts criado no Ciclo 186. Implementa P50/P75/P95/P99 por tier usando circular buffer de 10.000 registros. Apdex score (Apdex Alliance 2007): Satisfied (≤T), Tolerating (T-4T), Frustrated (>4T). Targets: TIER_1 P50≤800ms, TIER_2 P50≤1500ms, TIER_3 P50≤3000ms, TIER_4 P50≤8000ms, CACHE_HIT P50≤50ms. 20 testes passando. Warm cache já ativo em production-entry.ts (linha 646). PENDENTE: integrar recordLatency() no middleware de produção para medir P50 real. Base científica: Dean & Barroso (2013) The Tail at Scale; Chen et al. (2023) FrugalGPT.`,
    source: 'Ciclo 186 — NC-LATENCY-001 Parcial',
    confidence: 0.9,
    tags: JSON.stringify(['latencia', 'p50', 'apdex', 'telemetria', 'nc-latency-001']),
  },
  {
    category: 'testing',
    title: 'Phase 2.1: 75 Testes de Integração SHMS+DGM+Router',
    content: `Phase 2.1 concluída no Ciclo 186. 75 testes de integração em server/mother/__tests__/phase2-integration.test.ts. Cobertura: LSTMPredictor (ingest, predict, RMSE), DigitalTwin (updateFromReading, healthScore, multi-sensor), SHMSAnomalyDetector (analyze, CUSUM, Isolation Forest), SHMSAlertEngine (ICOLD thresholds: Normal/Watch/Warning/Alert/Emergency), DGM Orchestrator (status, history, getFitnessTrend), Adaptive Router (PT/EN routing, TIER_1/2/3/4, Intelltech context). Total acumulado: 131 testes (36 Phase1 + 75 Phase2.1 + 20 Phase2.3/2.4).`,
    source: 'Ciclo 186 — Phase 2.1 Integration Tests',
    confidence: 1.0,
    tags: JSON.stringify(['testes', 'integracao', 'shms', 'dgm', 'router', 'phase2']),
  },
  {
    category: 'architecture',
    title: 'NC-ARCH-001 Regressão Detectada e Corrigida no Ciclo 186',
    content: `NC-ARCH-001 havia sido corrigida no C185 (5 imports mid-file movidos). No C186, durante protocolo AWAKE V263, detectada nova regressão: import de artifact-panel na linha 2128 de a2a-server.ts. Corrigido imediatamente. Lição: NC-ARCH-001 deve ser verificada em CADA ciclo via awk 'NR>80 && /^import /' server/mother/a2a-server.ts. Resultado DEVE ser VAZIO.`,
    source: 'Ciclo 186 — NC-ARCH-001 Regressão',
    confidence: 1.0,
    tags: JSON.stringify(['nc-arch-001', 'regressao', 'imports', 'typescript', 'a2a-server']),
  },
  {
    category: 'documentation',
    title: 'Documentação Ciclo 186: AWAKE V264 + MASTER PROMPT V58.0 + TODO-ROADMAP V12',
    content: `Documentação do Ciclo 186 criada e commitada (commit 00c7c8d). AWAKE V264: R21 (BD oficial), HiveMQ Cloud docs, 131 testes, URL Cloud Run corrigida. MASTER PROMPT V58.0: BDs oficiais documentados, Passo 7 URL corrigida, Passo 5 expandido para 131 testes, R21 adicionada, seção de BDs de produção. TODO-ROADMAP V12: Phase 2 concluída, Phase 3 definida com critérios mensuráveis, métricas atualizadas.`,
    source: 'Ciclo 186 — Documentação',
    confidence: 1.0,
    tags: JSON.stringify(['awake-v264', 'master-prompt-v58', 'todo-roadmap-v12', 'documentacao']),
  },
  {
    category: 'infrastructure',
    title: 'Cloud Run Service: mother-interface (URL Correta)',
    content: `URL correta do Cloud Run de produção: https://mother-interface-233196174701.australia-southeast1.run.app/api/health. Serviço: mother-interface (não mother-a2a nem mother-production-*). Região: australia-southeast1. Revisão ativa após C186: mother-interface-00653-dpn. Env vars configuradas: DATABASE_URL, OPENAI_API_KEY, GITHUB_TOKEN, MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD, e outros 7 secrets.`,
    source: 'Ciclo 186 — Cloud Run URL',
    confidence: 1.0,
    tags: JSON.stringify(['cloud-run', 'url-producao', 'mother-interface', 'infraestrutura']),
  },
  {
    category: 'scientific',
    title: 'R21: Regra Incremental — BD Oficial de Produção',
    content: `R21 adicionada no Ciclo 186: BD OFICIAL = Cloud SQL mother-db-sydney (australia-southeast1). TiDB Cloud (gateway03.us-east-1.prod.aws.tidbcloud.com) = apenas sandbox Manus. NUNCA consultar TiDB em produção. Sempre usar Cloud SQL Auth Proxy para acesso local: ./cloud-sql-proxy mothers-library-mcp:australia-southeast1:mother-db-sydney --port 3307. Esta regra foi criada após descoberta no C185 de que scripts de injeção estavam conectando ao TiDB Cloud (sandbox) em vez do Cloud SQL (produção).`,
    source: 'Ciclo 186 — R21',
    confidence: 1.0,
    tags: JSON.stringify(['r21', 'bd-oficial', 'regra-incremental', 'cloud-sql', 'tidb']),
  },
];

async function injectKnowledge() {
  let conn;
  try {
    const config = parseDbUrl(DB_URL);
    console.log(`Connecting to ${config.host}:${config.port}/${config.database}...`);

    conn = await mysql.createConnection({
      ...config,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 15000,
    });

    console.log('Connected successfully.');

    // Check current count
    const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
    const currentCount = rows[0].cnt;
    console.log(`Current knowledge entries: ${currentCount}`);

    // Insert each entry
    let inserted = 0;
    for (const entry of knowledgeEntries) {
      const [result] = await conn.execute(
        `INSERT INTO knowledge (category, title, content, source, confidence, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [entry.category, entry.title, entry.content, entry.source, entry.confidence, entry.tags]
      );
      inserted++;
      console.log(`  [${inserted}/${knowledgeEntries.length}] Inserted: ${entry.title.substring(0, 60)}...`);
    }

    // Final count
    const [finalRows] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
    console.log(`\nKnowledge injection complete!`);
    console.log(`  Before: ${currentCount} entries`);
    console.log(`  Inserted: ${inserted} entries`);
    console.log(`  After: ${finalRows[0].cnt} entries`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

injectKnowledge();
