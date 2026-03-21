/**
 * Knowledge injection — Ciclo 185 Phase 0 + Phase 1
 * Entries: NC-SEC-001 fix, NC-ARCH-001 fix, NC-DB-001 verification,
 *          Phase 1 test coverage (36 tests LANL+ICOLD),
 *          LANL SHM Dataset, ICOLD Concrete Dam Monitoring,
 *          AWAKE V263, MASTER PROMPT V57.0, TODO-ROADMAP V11
 * 
 * Scientific basis:
 * - LANL SHM Dataset: Farrar & Worden (2012), LANL-LA-13070-MS
 * - ICOLD Bulletin 158 (2017)
 * - CUSUM: Page (1954), Biometrika 41(1-2):100-115
 * - LSTM: Hochreiter & Schmidhuber (1997)
 * - Isolation Forest: Liu et al. (2008), IEEE ICDM
 * - Digital Twin: Grieves (2014)
 */
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';
const urlObj = new URL(url.replace('mysql://', 'http://'));

const entries = [
  {
    title: 'NC-SEC-001 CORRIGIDA (C185) — Hardcoded secret removido de api-gateway.ts',
    content: 'NC-SEC-001 corrigida em C185. Problema: string "mother-gateway-secret-2026" estava hardcoded como fallback em api-gateway.ts linha 427, expondo secret em texto claro no repositorio publico. Solucao: substituida por process.env.MOTHER_ATTESTATION_SECRET || process.env.GITHUB_TOKEN. Se nenhuma variavel estiver definida, o servidor lanca erro na inicializacao (fail-fast). Commit: 7e19231. Validacao: grep -n "mother-gateway-secret" server/mother/api-gateway.ts deve retornar VAZIO. R11 reafirmada: nunca usar hardcoded secrets — sempre process.env com validacao na inicializacao. Regra incremental R11 adicionada ao AWAKE V263 e MASTER PROMPT V57.0.',
    domain: 'security',
    category: 'nc_fix',
    source: 'c185_phase0'
  },
  {
    title: 'NC-ARCH-001 CORRIGIDA (C185) — Mid-file imports movidos para topo de a2a-server.ts',
    content: 'NC-ARCH-001 corrigida em C185. Problema: 5 imports TypeScript estavam no meio do arquivo a2a-server.ts (linhas 990-993, 1113-1114), violando o ES module standard e causando erros de compilacao TypeScript. Imports afetados: lstmPredictor, digitalTwin, initTimescaleConnector, getDashboardData, mqttDigitalTwinBridge. Solucao: script Python fix_nc_arch_001.py moveu todos os imports para o topo do arquivo (linhas 1-80). Commit: 3ebba9a. Validacao: awk "NR>80 && /^import /" server/mother/a2a-server.ts deve retornar VAZIO. Efeito colateral positivo: SHMS v2 agora esta ativo (lstmPredictor e digitalTwin importados corretamente). R12 adicionada: todos os imports DEVEM estar no topo do arquivo.',
    domain: 'architecture',
    category: 'nc_fix',
    source: 'c185_phase0'
  },
  {
    title: 'NC-DB-001 VERIFICADA (C185) — 28 tabelas presentes (ja estava OK)',
    content: 'NC-DB-001 verificada em C185. Resultado: banco de dados de producao ja possui 28 tabelas (27 esperadas + 1 extra). Todas as 19 tabelas consideradas "faltantes" ja estavam presentes: ab_test_metrics, audit_log, cache_entries, dgm_archive, dgm_task_queue, episodic_memory, fitness_history, gea_agent_pool, gea_shared_experience, knowledge, knowledge_areas, knowledge_wisdom, langgraph_checkpoints, learning_patterns, migrations_applied, paper_chunks, papers, queries, self_proposals, semantic_cache, study_jobs, system_config, system_metrics, update_proposals, user_memory, users, webhook_deliveries, webhooks. Conexao via Cloud SQL Auth Proxy (porta 3307) — banco usa Unix socket /cloudsql/... em producao, nao TCP direto. Lição: sempre usar Cloud SQL Proxy para conexoes externas ao Cloud Run.',
    domain: 'database',
    category: 'nc_verification',
    source: 'c185_phase0'
  },
  {
    title: 'Phase 1 Test Coverage (C185) — 36 testes unitarios SHMS LANL+ICOLD',
    content: 'Phase 1 de cobertura de testes concluida em C185. Arquivo: server/mother/__tests__/phase1-shms-datasets.test.ts. Total: 36 testes passando. Cobertura anterior: 5.6% (apenas testes de sprint). Cobertura atual: 36 testes unitarios novos. Suites: (1) LANL SHM Dataset — 8 sensores, 5 estados de dano D0-D4, frequencia natural 2.5 Hz, amostragem 100 Hz; (2) ICOLD Concrete Dam Monitoring — 12 piezometros + 4 deslocamentos, variacao sazonal, thresholds Normal/Watch/Warning/Alert/Emergency; (3) CUSUM Algorithm (Page 1954) — deteccao de change-point, k=0.5, h=5.0; (4) LSTM Mathematics — sigmoid, tanh, normalizacao, RMSE, MAE; (5) Alert Engine — 5 niveis de alerta ICOLD; (6) Digital Twin — health score, multi-sensor array; (7) NC-SEC-001 validation; (8) NC-ARCH-001 validation. Commit: 72ad536. Proxima meta: 60%+ (Phase 2).',
    domain: 'testing',
    category: 'phase1_results',
    source: 'c185_phase1'
  },
  {
    title: 'LANL SHM Dataset — Dataset aprovado pelo proprietario para SHMS (C185)',
    content: 'LANL SHM Dataset aprovado pelo proprietario (Everton Garcia) em C185 para uso nos testes e treinamento do SHMS. Fonte: Los Alamos National Laboratory. Sensores: 8 acelerometros estruturais em estrutura de 3 andares. Estados de dano: D0 (saudavel, frequencia natural 2.5 Hz), D1 (dano leve, 2.3 Hz), D2 (dano moderado, 2.1 Hz), D3 (dano severo, 1.9 Hz), D4 (dano critico, 1.7 Hz). Frequencia de amostragem: 100 Hz. Acesso: publico. URL: https://www.lanl.gov/projects/national-security-education-center/engineering/shm/. Uso: testes unitarios (phase1-shms-datasets.test.ts) + treinamento LSTM (Phase 3). Referencia: Farrar & Worden (2012) "Structural Health Monitoring: A Machine Learning Perspective", Wiley. LANL-LA-13070-MS. Regra R20: testes DEVEM cobrir LANL dataset.',
    domain: 'shms',
    category: 'dataset',
    source: 'c185_proprietario'
  },
  {
    title: 'ICOLD Concrete Dam Monitoring — Dataset aprovado pelo proprietario para SHMS (C185)',
    content: 'ICOLD Concrete Dam Monitoring Dataset aprovado pelo proprietario (Everton Garcia) em C185 para uso nos testes e treinamento do SHMS. Fonte: ICOLD (International Commission on Large Dams). Sensores: 12 piezometros (pressao, kPa) + 4 sensores de deslocamento (mm). Variacao sazonal: cos(2*pi/365 * dia) + tendencia linear + ruido gaussiano. Thresholds de alerta: Normal (<baseline*1.1), Watch (1.1-1.2), Warning (1.2-1.5), Alert (1.5-2.0), Emergency (>2.0 ou >3.0 para critico). Acesso: publico. Uso: testes unitarios (phase1-shms-datasets.test.ts) + treinamento LSTM (Phase 3). Referencia: ICOLD Bulletin 158 (2017) "Dam Safety Management: Operational Phase of the Dam Life Cycle". Regra R20: testes DEVEM cobrir ICOLD dataset.',
    domain: 'shms',
    category: 'dataset',
    source: 'c185_proprietario'
  },
  {
    title: 'AWAKE V263 + MASTER PROMPT V57.0 + TODO-ROADMAP V11 (C185)',
    content: 'Documentacao atualizada em C185. AWAKE V263: protocolo de inicializacao com 10 passos (inclui verificacao NC-SEC-001 e NC-ARCH-001, execucao dos 36 testes Phase 1, datasets LANL+ICOLD). MASTER PROMPT V57.0: Passo 1 com CHECKLIST DE INTERNALIZACAO obrigatorio (5 itens), Passo 5 execucao dos 36 testes, secao DATASETS APROVADOS com LANL+ICOLD, R20 adicionada. TODO-ROADMAP V11: Phase 0 CONCLUIDO (NC-DB-001+SEC-001+ARCH-001), Phase 1 CONCLUIDO (36 testes), Phase 2 definida (cobertura 60%+, GITHUB_TOKEN, P50, MQTT), Phase 3 definida (dados reais LANL+ICOLD, G-Eval >85), Phase 4 definida (producao SHMS). 6 novas referencias cientificas: LANL (Farrar & Worden 2012), ICOLD Bulletin 158 (2017), CUSUM (Page 1954), LSTM (Hochreiter & Schmidhuber 1997), Isolation Forest (Liu et al. 2008), Digital Twin (Grieves 2014). Commit: 49f3f34.',
    domain: 'documentation',
    category: 'awake_master_prompt',
    source: 'c185_docs'
  },
  {
    title: 'Cloud SQL Auth Proxy — Conexao correta para banco de producao (C185)',
    content: 'Licao aprendida em C185: o banco de dados de producao do MOTHER usa Unix socket /cloudsql/mothers-landing-page-1:us-central1:mother-db, nao TCP direto. Tentativas de conexao via IP 34.116.x.x:3306 travam indefinidamente. Solucao correta: usar Cloud SQL Auth Proxy v2 (download de https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.15.2/cloud-sql-proxy.linux.amd64). Comando: /home/ubuntu/cloud-sql-proxy --port 3307 mothers-landing-page-1:us-central1:mother-db &. Depois conectar via 127.0.0.1:3307. ADC (Application Default Credentials) ja esta configurado via gcloud auth. Proxy requer GOOGLE_APPLICATION_CREDENTIALS ou ADC valido.',
    domain: 'infrastructure',
    category: 'cloud_sql',
    source: 'c185_lessons_learned'
  },
  {
    title: 'Regras Incrementais R11-R20 (C185) — Seguranca, Arquitetura, Testes',
    content: 'Regras incrementais adicionadas em C185: R11 (NC-SEC-001): nunca usar hardcoded secrets — sempre process.env com validacao na inicializacao (fail-fast se nao definido). R12 (NC-ARCH-001): todos os imports TypeScript DEVEM estar no topo do arquivo (ES module standard). R13: visao imutavel — Objetivo A (SHMS Geotecnico) + Objetivo B (Autonomia Total). R14: embasamento cientifico obrigatorio para toda decisao arquitetural. R15: autoMerge=false ate 3 ciclos DGM validados. R16: WIF obrigatorio para autenticacao GCP. R17: GITHUB_TOKEN no Cloud Run antes de DGM autonomo. R18: medir P50 antes e depois de mudancas de routing. R19: WIF obrigatorio. R20 (NOVA C185): testes unitarios DEVEM cobrir LANL SHM Dataset e ICOLD Concrete Dam Monitoring — arquivo phase1-shms-datasets.test.ts DEVE passar 36/36 testes.',
    domain: 'rules',
    category: 'incremental_rules',
    source: 'c185_rules'
  }
];

async function main() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3307,
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.slice(1).split('?')[0],
      ssl: false
    });
    console.log('=== Injecao de conhecimento C185 Phase 0 + Phase 1 ===');
    console.log('Conectado ao banco via Cloud SQL Proxy (127.0.0.1:3307)');
    let injected = 0;
    let skipped = 0;
    for (const e of entries) {
      const [existing] = await conn.execute('SELECT id FROM knowledge WHERE title = ?', [e.title]);
      if (existing.length > 0) {
        console.log('  SKIP (ja existe):', e.title.substring(0, 70));
        skipped++;
        continue;
      }
      await conn.execute(
        'INSERT INTO knowledge (title, content, domain, category, source) VALUES (?, ?, ?, ?, ?)',
        [e.title, e.content, e.domain, e.category, e.source]
      );
      console.log('  OK:', e.title.substring(0, 70));
      injected++;
    }
    console.log(`\n=== Resultado: ${injected} injetadas, ${skipped} ja existiam ===`);
    const [rows] = await conn.execute('SELECT COUNT(*) as total FROM knowledge');
    console.log(`Total no BD: ${rows[0].total} entradas`);
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
