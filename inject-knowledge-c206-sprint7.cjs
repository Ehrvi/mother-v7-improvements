/**
 * inject-knowledge-c206-sprint7.cjs
 * Injeta 15 novos registros de conhecimento no BD de MOTHER para Sprint 7 C206.
 *
 * Domínios: SHMS Phase 2, MQTT IoT, REST API, NC-ARCH-001, G-EVAL, Closed-Loop Learning,
 *           Digital Twin, Migration Patterns, Startup Scheduler, Module Registry
 *
 * MOTHER v88.0 | C206 | Sprint 7 | 2026-03-09
 */

'use strict';

const mysql = require('mysql2/promise');
const crypto = require('crypto');

const DB_URL = process.env.DATABASE_URL || process.env.DB_URL;

if (!DB_URL) {
  console.error('❌ DATABASE_URL não configurado');
  process.exit(1);
}

function parseDbUrl(url) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/(.+)/);
  if (!match) throw new Error('Invalid DATABASE_URL format');
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4] || '3306'),
    database: match[5].split('?')[0],
    ssl: { rejectUnauthorized: false }, // TiDB Cloud requires SSL
  };
}

const entries = [
  // ─── C206-1: SHMS Phase 2 REST API ─────────────────────────────────────────
  {
    title: 'SHMS Phase 2 REST API — Digital Twin Endpoints C206',
    content: `MOTHER C206 implementou 5 endpoints REST para o Digital Twin Engine (C205): GET /structures (lista todas), GET /structures/:id (estado completo), GET /structures/:id/anomalies (anomalias Z-score + IQR), POST /structures/:id/readings (injetar leitura), GET /health (status engine). Base: REST Fielding (2000) + ISO 13374-1:2003 + Grieves (2014) Digital Twin. SHM Levels 1-4 (Farrar & Worden 2012): Nominal (≥0.9), Detection (≥0.7), Localization (≥0.5), Classification (≥0.3), Prognosis (<0.3). Arquivo: server/shms/digital-twin-routes-c206.ts.`,
    tags: JSON.stringify(['shms', 'rest-api', 'digital-twin', 'c206', 'iso-13374', 'farrar-worden']),
    domain: 'shms',
    sourceType: 'technical',
  },
  // ─── C206-2: MQTT Digital Twin Bridge ──────────────────────────────────────
  {
    title: 'MQTT Digital Twin Bridge C206 — ISO/IEC 20922:2016',
    content: `MOTHER C206 implementou MQTTDigitalTwinBridgeC206: conecta broker MQTT ao Digital Twin Engine C205. Tópico: shms/{structureId}/sensors/{sensorType}. Mapeamento de tipos: piezometer→pore_pressure, inclinometer→displacement, accelerometer→acceleration. Fallback automático para modo simulação se MQTT_BROKER_URL não configurado (R38 pré-produção). Reconexão com exponential backoff (Tanenbaum 2006 §6.4.2): max 10 tentativas, delay 1s→30s. Simulação: leituras a cada 30s, 5% de anomalias sintéticas. Base: ISO/IEC 20922:2016 + ICOLD Bulletin 158 + GISTM 2020 + Sun et al. (2025) DOI:10.1145/3777730.3777858.`,
    tags: JSON.stringify(['mqtt', 'digital-twin', 'iot', 'c206', 'icold-158', 'gistm-2020']),
    domain: 'shms',
    sourceType: 'technical',
  },
  // ─── C206-3: NC-ARCH-001 Startup Scheduler ─────────────────────────────────
  {
    title: 'StartupScheduler C206 — NC-ARCH-001 God Object Refactoring',
    content: `MOTHER C206 criou StartupScheduler (server/_core/startup-scheduler.ts) para resolver NC-ARCH-001: production-entry.ts era God Object com 1044 linhas. O scheduler centraliza todos os setTimeout/setInterval em um registry tipado. API: register({name, cycle, delayMs, intervalMs, fn, nonCritical}) + start() + stop() + getTasks() + getStatus(). Padrão: Registry + Executor (Fowler 1999 + Martin 2008). Base: Fowler (1999) "Refactoring" Extract Module + Martin (2008) "Clean Code" SRP + McConnell (2004) "Code Complete" §7.5 (≤500 linhas). NC-ARCH-001 PARTIAL: C206 adiciona scheduler e registry, migração completa planejada para C207.`,
    tags: JSON.stringify(['architecture', 'refactoring', 'startup-scheduler', 'c206', 'nc-arch-001', 'srp']),
    domain: 'architecture',
    sourceType: 'technical',
  },
  // ─── C206-3: Module Registry ────────────────────────────────────────────────
  {
    title: 'ModuleRegistry C206 — Gamma et al. (1994) Registry Pattern',
    content: `MOTHER C206 criou ModuleRegistry (server/_core/module-registry.ts): centraliza todos os imports de módulos. Cada módulo tem: name, path, cycle, status (CONNECTED|ORPHAN|DEPRECATED), importedIn, exportedFunctions. Métodos: register(), updateStatus(), getOrphans(), getConnected(), getStatus(), getAll(). Regra R27: todo módulo gerado pelo DGM DEVE ser registrado. Status log no startup (t=20s): zero ORPHAN modules = R27 COMPLIANT. Base: Gamma et al. (1994) "Design Patterns" Registry Pattern + Fowler (2002) "Patterns of Enterprise Application Architecture" + McConnell (2004) Information Hiding.`,
    tags: JSON.stringify(['architecture', 'module-registry', 'c206', 'design-patterns', 'r27']),
    domain: 'architecture',
    sourceType: 'technical',
  },
  // ─── C206-4: Migration 0037 ─────────────────────────────────────────────────
  {
    title: 'Migration 0037 — learning_evaluations + dgm_signals (C206)',
    content: `MOTHER C206 criou Migration 0037 (drizzle/migrations/0037_c206_learning_evaluations.sql): duas novas tabelas. (1) learning_evaluations: armazena avaliações G-EVAL por sessão — campos: g_eval_score, coherence, consistency, fluency, relevance, reflexion_triggered, dgm_signal_sent. Pesos G-EVAL: coherence(0.30) + consistency(0.20) + fluency(0.15) + relevance(0.35). (2) dgm_signals: armazena sinais de melhoria enviados ao DGM — campos: trigger_reason, consecutive_count, avg_g_eval_score, weakness_pattern, resolution_status. Trigger: 3 avaliações consecutivas < 0.70 → dgm_signal gerado. Base: G-EVAL arXiv:2303.16634 + Reflexion arXiv:2303.11366 + DGM arXiv:2505.22954.`,
    tags: JSON.stringify(['database', 'migration', 'g-eval', 'dgm-signals', 'c206', 'closed-loop']),
    domain: 'database',
    sourceType: 'technical',
  },
  // ─── C206-5: G-EVAL Integration Test ────────────────────────────────────────
  {
    title: 'G-EVAL Integration Test C206 — Validação Pipeline Closed-Loop Learning',
    content: `MOTHER C206 implementou GEvalIntegrationTestC206 (server/mother/geval-integration-test-c206.ts): valida pipeline Closed-Loop Learning C205 com 3 casos de teste. Caso 1 (alta qualidade, score > 0.80): deve passar sem Reflexion. Caso 2 (mediana, 0.65-0.75): deve acionar Reflexion mas não DGM signal. Caso 3 (baixa qualidade, < 0.60): deve acionar Reflexion E DGM signal. Critério: closedLoopVerified = todos 3 passam. Agendado t=30s após startup. Base: G-EVAL Liu et al. (2023) arXiv:2303.16634 + Reflexion Shinn et al. (2023) arXiv:2303.11366 + ISO/IEC 25010:2011 §4.2.`,
    tags: JSON.stringify(['g-eval', 'integration-test', 'closed-loop', 'c206', 'reflexion', 'iso-25010']),
    domain: 'ai',
    sourceType: 'technical',
  },
  // ─── Versionamento ──────────────────────────────────────────────────────────
  {
    title: 'Versionamento MOTHER — Regra de Incremento por Sprint',
    content: `MOTHER usa versionamento semântico com incremento por Sprint completo: cada Sprint = +1 versão major. Histórico: v83.0 (C202, Sprint 3) → v84.0 (C203, Sprint 4) → v85.0 (C204, Sprint 5) → v86.0 (C205, Sprint 6) → v87.0 (C205-fix, versão corrigida) → v88.0 (C206, Sprint 7). Problema identificado C205: core.ts não foi incluído no commit, causando v83.0 em produção por 3 ciclos. Fix: commit fix(c205-r002) incluiu core.ts explicitamente. Regra: SEMPRE incluir server/mother/core.ts no commit de bump de versão. Verificação: curl /api/trpc/mother.stats deve retornar version=vXX.0.`,
    tags: JSON.stringify(['versioning', 'deployment', 'c206', 'git', 'cloud-run']),
    domain: 'devops',
    sourceType: 'technical',
  },
  // ─── REST API Design ────────────────────────────────────────────────────────
  {
    title: 'REST API Design — Fielding (2000) Constraints para SHMS',
    content: `MOTHER aplica as 6 constraints REST de Fielding (2000) no SHMS Phase 2: (1) Client-Server: separação entre sensor data e UI. (2) Stateless: cada request contém todo o contexto necessário. (3) Cacheable: GET /structures/:id pode ser cacheado (Cache-Control: max-age=30). (4) Uniform Interface: recursos identificados por URI (/structures/:id), representações JSON. (5) Layered System: MQTT Bridge → Digital Twin Engine → REST API → Client. (6) Code on Demand (opcional): não implementado. Padrão de resposta: {success, data, timestamp, cycle, scientificBasis}. Versioning via URI: /api/shms/v2/* (v1 DEPRECATED C189).`,
    tags: JSON.stringify(['rest', 'api-design', 'fielding', 'shms', 'c206']),
    domain: 'architecture',
    sourceType: 'research',
  },
  // ─── Digital Twin Science ────────────────────────────────────────────────────
  {
    title: 'Digital Twin para SHMS — Grieves (2014) + Sun et al. (2025)',
    content: `Digital Twin em SHMS: representação virtual de uma estrutura física com atualização em tempo real. Grieves (2014) define 3 componentes: Physical Space (sensores reais), Virtual Space (modelo computacional), Connection (fluxo de dados bidirecional). MOTHER implementa: Physical=sensores MQTT, Virtual=DigitalTwinEngineC205, Connection=MQTTDigitalTwinBridgeC206. Health Index [0.0-1.0] calculado por: anomaly_count, sensor_quality, alert_severity. Sun et al. (2025) DOI:10.1145/3777730.3777858: SHMS Digital Twin em tempo real com latência < 100ms. ICOLD Bulletin 158 (2014): thresholds L1/L2/L3 para barragens.`,
    tags: JSON.stringify(['digital-twin', 'shms', 'grieves-2014', 'sun-2025', 'icold-158']),
    domain: 'shms',
    sourceType: 'research',
  },
  // ─── Anomaly Detection ──────────────────────────────────────────────────────
  {
    title: 'Anomaly Detection SHMS — Z-score (3σ) + IQR (Tukey 1977)',
    content: `MOTHER usa dois métodos de anomaly detection para SHMS: (1) Z-score (Grubbs 1969): z = (x - μ) / σ. Threshold: |z| > 3.0 (Sohn et al. 2004 — 3σ rule). Sensível a outliers extremos. (2) IQR (Tukey 1977): outlier se x < Q1 - 1.5*IQR ou x > Q3 + 1.5*IQR. Robusto a distribuições não-normais. Combinação: isAnomaly = zscore_anomaly OR iqr_anomaly. Confidence: 0.9+ → critical, 0.7+ → warning, else → info. Health Index degradation: cada anomalia reduz healthIndex proporcionalmente à severity. Histórico: últimas 100 leituras por sensor (sliding window). Base: Sohn et al. (2004) "Structural Health Monitoring Using Statistical Pattern Recognition".`,
    tags: JSON.stringify(['anomaly-detection', 'z-score', 'iqr', 'tukey', 'shms', 'c205']),
    domain: 'shms',
    sourceType: 'research',
  },
  // ─── Closed-Loop Learning ───────────────────────────────────────────────────
  {
    title: 'Closed-Loop Learning C205 — Ciclo Cognitivo Fechado',
    content: `MOTHER C205 fechou o ciclo cognitivo: RESPONSE → G-EVAL → MEMORY → DGM. Antes de C205 (NC-LOOP-001): o ciclo estava ABERTO — respostas não eram avaliadas automaticamente, DGM não recebia feedback de qualidade. ClosedLoopLearning (server/mother/closed-loop-learning-c205.ts): avalia cada resposta com G-EVAL (4 dimensões), armazena em learning_evaluations, aciona Reflexion se score < 0.70, envia dgm_signal se 3 consecutivos < 0.70. G-EVAL pesos: coherence(0.30) + consistency(0.20) + fluency(0.15) + relevance(0.35). Reflexion (Shinn 2023 arXiv:2303.11366): gera critique verbal e re-tenta resposta. Base: G-EVAL arXiv:2303.16634 + DGM arXiv:2505.22954.`,
    tags: JSON.stringify(['closed-loop', 'g-eval', 'reflexion', 'c205', 'cognitive-cycle']),
    domain: 'ai',
    sourceType: 'research',
  },
  // ─── God Object Anti-Pattern ────────────────────────────────────────────────
  {
    title: 'God Object Anti-Pattern — Fowler (1999) Refactoring em MOTHER',
    content: `MOTHER identificou God Object em production-entry.ts (1044 linhas) e a2a-server.ts (2268 linhas). Fowler (1999) "Refactoring": God Class viola SRP (Martin 2003) — uma classe com muitas responsabilidades. Solução aplicada: Extract Module. a2a-server.ts: 4 routers extraídos (C190) — auth-router, shms-router, dgm-router, metrics-router. production-entry.ts: StartupScheduler (C206) extrai todos os setTimeout/setInterval. ModuleRegistry (C206) extrai o inventário de módulos. NC-ARCH-001 PARTIAL: C206 cria infraestrutura, migração completa dos 18 setTimeout existentes planejada para C207. Meta: production-entry.ts < 300 linhas (McConnell 2004 §7.5).`,
    tags: JSON.stringify(['architecture', 'god-object', 'refactoring', 'fowler', 'nc-arch-001', 'c206']),
    domain: 'architecture',
    sourceType: 'technical',
  },
  // ─── GISTM 2020 ─────────────────────────────────────────────────────────────
  {
    title: 'GISTM 2020 — Global Industry Standard on Tailings Management',
    content: `GISTM (2020) — Global Industry Standard on Tailings Management: padrão internacional para monitoramento de barragens de rejeitos. Relevante para MOTHER SHMS: §4.3 define thresholds de sensores (piezômetros, inclinômetros, acelerômetros). Níveis de alerta: L1 (aviso, operação normal), L2 (alerta, ação preventiva), L3 (crítico, evacuação). Integrado com ICOLD Bulletin 158 (2014) para barragens de água. MOTHER implementa: anomaly detection com Z-score 3σ (L1), IQR outlier (L2), confidence > 0.9 (L3). Digital Twin Health Index: ≥0.9 (nominal), ≥0.7 (L1), ≥0.5 (L2), <0.5 (L3). Referência: GISTM (2020) "Global Industry Standard on Tailings Management" §4.3.`,
    tags: JSON.stringify(['gistm', 'tailings', 'shms', 'icold', 'dam-safety', 'c206']),
    domain: 'shms',
    sourceType: 'research',
  },
  // ─── Exponential Backoff ────────────────────────────────────────────────────
  {
    title: 'Exponential Backoff — Tanenbaum (2006) para Reconexão MQTT',
    content: `MOTHER C206 implementa exponential backoff para reconexão MQTT (Tanenbaum 2006 "Computer Networks" §6.4.2 — Binary Exponential Backoff). Fórmula: delay = min(BASE_DELAY * 2^attempt, MAX_DELAY). Parâmetros: BASE_DELAY=1000ms, MAX_DELAY=30000ms, MAX_RECONNECT=10. Sequência: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s → fallback para simulação. Após MAX_RECONNECT tentativas: startSimulationMode() ativado (R38). Aplicação: MQTTDigitalTwinBridgeC206.scheduleReconnect(). Padrão também usado em: redis-shms-cache.ts (C197), timescale-pg-client.ts (C193).`,
    tags: JSON.stringify(['mqtt', 'exponential-backoff', 'tanenbaum', 'reconnection', 'c206']),
    domain: 'infrastructure',
    sourceType: 'technical',
  },
  // ─── Relatório Conselho R4 ──────────────────────────────────────────────────
  {
    title: 'Relatório Conselho R4 — Auditoria MOTHER v83.0 (2026-03-09)',
    content: `Relatório Conselho R4 (2026-03-09) auditou MOTHER v83.0 e identificou: Score 95.0/100 (meta: 96.0 em C206). NCs abertas: NC-ARCH-001 (God Object production-entry.ts 1044L), NC-LOOP-002 (DGM proposals duplicados), NC-MEM-003 (HippoRAG2 recall@10 não validado em produção). Pontos fortes: Digital Twin Engine C205 funcional, Closed-Loop Learning C205 implementado, 7636 entradas no BD. Roadmap aprovado: C206 (SHMS Phase 2 REST + MQTT + G-EVAL Test), C207 (LSTM predictor + NC-ARCH-001 completo), C208 (Fortescue proposal + comercialização). Auditoria iterativa: 3 ciclos consecutivos em v83.0 indicavam bug de versionamento (core.ts não commitado).`,
    tags: JSON.stringify(['conselho', 'auditoria', 'roadmap', 'c206', 'nc-arch-001', 'score']),
    domain: 'governance',
    sourceType: 'technical',
  },
];

async function main() {
  const config = parseDbUrl(DB_URL);
  const conn = await mysql.createConnection(config);

  console.log(`\n🚀 Injetando ${entries.length} registros de conhecimento — C206 Sprint 7\n`);

  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const id = crypto.randomUUID();
    try {
      await conn.execute(
        `INSERT IGNORE INTO knowledge (id, title, content, tags, domain, sourceType, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [id, entry.title, entry.content, entry.tags, entry.domain, entry.sourceType]
      );
      const [rows] = await conn.execute('SELECT ROW_COUNT() as cnt');
      if (rows[0].cnt > 0) {
        inserted++;
        console.log(`  ✅ [${entry.domain}] ${entry.title.slice(0, 60)}...`);
      } else {
        skipped++;
        console.log(`  ⏭️  [SKIP] ${entry.title.slice(0, 60)}...`);
      }
    } catch (err) {
      console.error(`  ❌ Erro ao inserir "${entry.title.slice(0, 40)}...":`, err.message);
    }
  }

  // Get total count
  const [countRows] = await conn.execute('SELECT COUNT(*) as total FROM knowledge');
  const total = countRows[0].total;

  await conn.end();

  console.log(`\n📊 Resultado:`);
  console.log(`   Inseridos: ${inserted}`);
  console.log(`   Pulados:   ${skipped}`);
  console.log(`   Total BD:  ${total}`);
  console.log(`\n✅ C206 Sprint 7 — Knowledge injection CONCLUÍDA\n`);
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
