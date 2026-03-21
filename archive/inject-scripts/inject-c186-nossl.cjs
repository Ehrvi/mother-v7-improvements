'use strict';
const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

const pass = execSync("gcloud secrets versions access latest --secret=mother-db-url --project=mothers-library-mcp 2>/dev/null | grep -oP '(?<=:)[^@]+(?=@)'").toString().trim();

const entries = [
  ['infrastructure', 'BD Oficial: Cloud SQL mother-db-sydney (R21)', 'REGRA R21: BD oficial = Cloud SQL MySQL 8.0, instancia mothers-library-mcp:australia-southeast1:mother-db-sydney, database mother_db, 28 tabelas, 6549 conhecimentos. TiDB Cloud = APENAS sandbox Manus. Acesso: Cloud SQL Auth Proxy porta 3307 ou secret mother-db-url no GCP.', 'C186', 1.0, '["bd-oficial","cloud-sql","r21"]'],
  ['infrastructure', 'HiveMQ Cloud Configurado (NC-SHMS-MQTT)', 'NC-SHMS-MQTT CORRIGIDA C186. HiveMQ Cloud: mqtts://5d8c986a8de24d1d9d92cbd55fcd75d7.s1.eu.hivemq.cloud:8883, usuario Mother. Secrets: mother-hivemq-url/username/password no GCP. Mapeados ao Cloud Run. Revisao 00653-dpn deployada. Topicos GISTM: shms/sensors/{tipo}/{sensorId}.', 'C186', 1.0, '["hivemq","mqtt","shms","nc-shms-mqtt"]'],
  ['security', 'GITHUB_TOKEN Confirmado (NC-GITHUB-TOKEN)', 'NC-GITHUB-TOKEN CORRIGIDA C186. Secret mother-github-token = ghu_yaqMTc... ativo no Cloud Run mother-interface. Sprint 9 DGM desbloqueado.', 'C186', 1.0, '["github-token","sprint-9","nc-github-token"]'],
  ['performance', 'latency-telemetry.ts: P50/P95/P99 + Apdex (NC-LATENCY-001 Parcial)', 'Modulo latency-telemetry.ts criado C186. Circular buffer 10000 registros. Apdex: Satisfied(<=T)/Tolerating(T-4T)/Frustrated(>4T). Targets: TIER_1 P50<=800ms, TIER_2 1500ms, TIER_3 3000ms, TIER_4 8000ms, CACHE_HIT 50ms. 20 testes passando. Warm cache ativo. PENDENTE: integrar recordLatency() em producao. Base: Dean & Barroso 2013; FrugalGPT Chen 2023.', 'C186', 0.9, '["latencia","p50","apdex","telemetria"]'],
  ['testing', 'Phase 2.1: 75 Testes Integracao SHMS+DGM+Router', 'Phase 2.1 concluida C186. 75 testes em phase2-integration.test.ts. Cobertura: LSTMPredictor, DigitalTwin, SHMSAnomalyDetector, SHMSAlertEngine, DGM Orchestrator, Adaptive Router PT/EN. Total: 131 testes (36+75+20).', 'C186', 1.0, '["testes","integracao","phase2","131-testes"]'],
  ['architecture', 'NC-ARCH-001 Regressao Detectada e Corrigida C186', 'NC-ARCH-001 regrediu C186: import artifact-panel linha 2128 de a2a-server.ts. Corrigido. Verificar SEMPRE: awk NR>80 && /^import / server/mother/a2a-server.ts DEVE retornar VAZIO.', 'C186', 1.0, '["nc-arch-001","regressao","imports"]'],
  ['documentation', 'AWAKE V264 + MASTER PROMPT V58.0 + TODO-ROADMAP V12', 'Documentacao C186 commitada (00c7c8d). AWAKE V264: R21, HiveMQ, 131 testes, URL Cloud Run corrigida. MASTER PROMPT V58.0: BDs oficiais, Passo 7 URL corrigida, R21. TODO-ROADMAP V12: Phase 2 concluida, Phase 3 definida.', 'C186', 1.0, '["awake-v264","master-prompt-v58","todo-roadmap-v12"]'],
  ['infrastructure', 'Cloud Run URL Correta: mother-interface', 'URL producao: https://mother-interface-233196174701.australia-southeast1.run.app/api/health. Servico: mother-interface (nao mother-a2a). Revisao ativa C186: mother-interface-00653-dpn. 10 secrets configurados.', 'C186', 1.0, '["cloud-run","url-producao","mother-interface"]'],
  ['scientific', 'R21: BD Oficial = Cloud SQL (nunca TiDB em producao)', 'R21 adicionada C186: BD OFICIAL = Cloud SQL mother-db-sydney. TiDB Cloud = sandbox Manus. NUNCA consultar TiDB em producao. Criada apos descoberta C185 de scripts conectando ao TiDB em vez do Cloud SQL.', 'C186', 1.0, '["r21","regra-incremental","bd-oficial"]'],
];

async function run() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: pass,
    database: 'mother_db',
    ssl: false,
    connectTimeout: 15000,
  });

  const [rows] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
  console.log('Current entries:', rows[0].cnt);

  let inserted = 0;
  for (const [cat, title, content, source, conf, tags] of entries) {
    await conn.execute(
      'INSERT INTO knowledge (category, title, content, source, confidence, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [cat, title, content, source, conf, tags]
    );
    inserted++;
    console.log(`  [${inserted}] ${title.substring(0, 55)}`);
  }

  const [final] = await conn.execute('SELECT COUNT(*) as cnt FROM knowledge');
  console.log(`\nDone! ${rows[0].cnt} -> ${final[0].cnt} entries (+${inserted})`);
  await conn.end();
}

run().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
