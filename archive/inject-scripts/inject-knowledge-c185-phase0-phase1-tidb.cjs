/**
 * Knowledge injection — Ciclo 185 Phase 0 + Phase 1 (TiDB Cloud version)
 * Uses DATABASE_URL from environment (TiDB Cloud via gateway)
 */
const mysql = require('mysql2/promise');
const url = process.env.DATABASE_URL || '';

// Parse the URL — handle TiDB format with ssl param
const cleanUrl = url.replace(/\?ssl=.*$/, '');
const urlObj = new URL(cleanUrl.replace('mysql://', 'http://'));

const entries = [
  {
    title: 'NC-SEC-001 CORRIGIDA (C185) — Hardcoded secret removido de api-gateway.ts',
    content: 'NC-SEC-001 corrigida em C185. Problema: string "mother-gateway-secret-2026" estava hardcoded como fallback em api-gateway.ts linha 427, expondo secret em texto claro no repositorio publico. Solucao: substituida por process.env.MOTHER_ATTESTATION_SECRET || process.env.GITHUB_TOKEN. Se nenhuma variavel estiver definida, o servidor lanca erro na inicializacao (fail-fast). Commit: 7e19231. Validacao: grep -n "mother-gateway-secret" server/mother/api-gateway.ts deve retornar VAZIO. R11 reafirmada: nunca usar hardcoded secrets — sempre process.env com validacao na inicializacao.',
    domain: 'security',
    category: 'nc_fix',
    source: 'c185_phase0'
  },
  {
    title: 'NC-ARCH-001 CORRIGIDA (C185) — Mid-file imports movidos para topo de a2a-server.ts',
    content: 'NC-ARCH-001 corrigida em C185. Problema: 5 imports TypeScript estavam no meio do arquivo a2a-server.ts (linhas 990-993, 1113-1114), violando o ES module standard e causando erros de compilacao TypeScript. Imports afetados: lstmPredictor, digitalTwin, initTimescaleConnector, getDashboardData, mqttDigitalTwinBridge. Solucao: script Python fix_nc_arch_001.py moveu todos os imports para o topo do arquivo. Commit: 3ebba9a. Validacao: awk "NR>80 && /^import /" server/mother/a2a-server.ts deve retornar VAZIO. Efeito colateral positivo: SHMS v2 agora esta ativo. R12 adicionada: todos os imports DEVEM estar no topo do arquivo.',
    domain: 'architecture',
    category: 'nc_fix',
    source: 'c185_phase0'
  },
  {
    title: 'NC-DB-001 VERIFICADA (C185) — 28 tabelas presentes (ja estava OK)',
    content: 'NC-DB-001 verificada em C185. Resultado: banco de dados de producao ja possui 28 tabelas (27 esperadas + 1 extra). Todas as 19 tabelas consideradas faltantes ja estavam presentes. Banco usa TiDB Cloud (gateway03.us-east-1.prod.aws.tidbcloud.com:4000) — nao Cloud SQL. Licao: sempre verificar o tipo de banco antes de tentar conexao direta. Cloud SQL Proxy foi iniciado desnecessariamente (instancia mothers-library-mcp:australia-southeast1:mother-db-sydney).',
    domain: 'database',
    category: 'nc_verification',
    source: 'c185_phase0'
  },
  {
    title: 'Phase 1 Test Coverage (C185) — 36 testes unitarios SHMS LANL+ICOLD',
    content: 'Phase 1 de cobertura de testes concluida em C185. Arquivo: server/mother/__tests__/phase1-shms-datasets.test.ts. Total: 36 testes passando. Cobertura anterior: 5.6%. Suites: (1) LANL SHM Dataset — 8 sensores, 5 estados de dano D0-D4, frequencia natural 2.5 Hz; (2) ICOLD Concrete Dam Monitoring — 12 piezometros + 4 deslocamentos, thresholds Normal/Watch/Warning/Alert/Emergency; (3) CUSUM Algorithm (Page 1954) — deteccao de change-point; (4) LSTM Mathematics — sigmoid, tanh, normalizacao, RMSE, MAE; (5) Alert Engine — 5 niveis de alerta ICOLD; (6) Digital Twin — health score, multi-sensor array; (7) NC-SEC-001 validation; (8) NC-ARCH-001 validation. Commit: 72ad536. Proxima meta: 60%+ (Phase 2).',
    domain: 'testing',
    category: 'phase1_results',
    source: 'c185_phase1'
  },
  {
    title: 'LANL SHM Dataset — Dataset aprovado pelo proprietario para SHMS (C185)',
    content: 'LANL SHM Dataset aprovado pelo proprietario (Everton Garcia) em C185. Fonte: Los Alamos National Laboratory. Sensores: 8 acelerometros estruturais em estrutura de 3 andares. Estados de dano: D0 (saudavel, frequencia natural 2.5 Hz), D1 (2.3 Hz), D2 (2.1 Hz), D3 (1.9 Hz), D4 (1.7 Hz). Frequencia de amostragem: 100 Hz. Acesso: publico. Uso: testes unitarios + treinamento LSTM (Phase 3). Referencia: Farrar & Worden (2012) "Structural Health Monitoring: A Machine Learning Perspective", Wiley. LANL-LA-13070-MS. Regra R20: testes DEVEM cobrir LANL dataset.',
    domain: 'shms',
    category: 'dataset',
    source: 'c185_proprietario'
  },
  {
    title: 'ICOLD Concrete Dam Monitoring — Dataset aprovado pelo proprietario para SHMS (C185)',
    content: 'ICOLD Concrete Dam Monitoring Dataset aprovado pelo proprietario (Everton Garcia) em C185. Fonte: ICOLD (International Commission on Large Dams). Sensores: 12 piezometros (pressao, kPa) + 4 sensores de deslocamento (mm). Variacao sazonal: cos(2*pi/365 * dia) + tendencia linear + ruido gaussiano. Thresholds: Normal (<1.1x), Watch (1.1-1.2x), Warning (1.2-1.5x), Alert (1.5-2.0x), Emergency (>2.0x). Acesso: publico. Referencia: ICOLD Bulletin 158 (2017) "Dam Safety Management". Regra R20: testes DEVEM cobrir ICOLD dataset.',
    domain: 'shms',
    category: 'dataset',
    source: 'c185_proprietario'
  },
  {
    title: 'AWAKE V263 + MASTER PROMPT V57.0 + TODO-ROADMAP V11 (C185)',
    content: 'Documentacao atualizada em C185. AWAKE V263: protocolo de inicializacao com 10 passos (inclui verificacao NC-SEC-001, NC-ARCH-001, execucao dos 36 testes Phase 1, datasets LANL+ICOLD). MASTER PROMPT V57.0: Passo 1 com CHECKLIST DE INTERNALIZACAO obrigatorio (5 itens), Passo 5 execucao dos 36 testes, secao DATASETS APROVADOS, R20 adicionada. TODO-ROADMAP V11: Phase 0 CONCLUIDO, Phase 1 CONCLUIDO, Phase 2-4 definidas. 6 novas referencias cientificas: LANL (Farrar & Worden 2012), ICOLD Bulletin 158 (2017), CUSUM (Page 1954), LSTM (Hochreiter & Schmidhuber 1997), Isolation Forest (Liu et al. 2008), Digital Twin (Grieves 2014). Commit: 49f3f34.',
    domain: 'documentation',
    category: 'awake_master_prompt',
    source: 'c185_docs'
  },
  {
    title: 'Regras Incrementais R11-R20 (C185) — Seguranca, Arquitetura, Testes',
    content: 'Regras incrementais R11-R20 consolidadas em C185: R11: nunca usar hardcoded secrets. R12: todos os imports TypeScript no topo do arquivo. R13: visao imutavel SHMS+Autonomia. R14: embasamento cientifico obrigatorio. R15: autoMerge=false ate 3 ciclos DGM validados. R16: WIF obrigatorio para GCP. R17: GITHUB_TOKEN no Cloud Run antes de DGM autonomo. R18: medir P50 antes e depois de mudancas. R19: WIF obrigatorio. R20 (NOVA): testes DEVEM cobrir LANL SHM Dataset e ICOLD Concrete Dam Monitoring — phase1-shms-datasets.test.ts DEVE passar 36/36 testes.',
    domain: 'rules',
    category: 'incremental_rules',
    source: 'c185_rules'
  },
  {
    title: 'TiDB Cloud — Banco de dados de producao de MOTHER (C185)',
    content: 'Banco de dados de producao de MOTHER usa TiDB Cloud (gateway03.us-east-1.prod.aws.tidbcloud.com:4000), nao Cloud SQL. DATABASE_URL tem formato: mysql://user:pass@gateway03.us-east-1.prod.aws.tidbcloud.com:4000/dbname?ssl={"rejectUnauthorized":true}. Para conexao direta: usar host/port/user/pass do URL com ssl: { rejectUnauthorized: true }. Scripts de injecao de conhecimento devem usar TiDB, nao Cloud SQL Proxy. O Cloud SQL Proxy (mothers-library-mcp:australia-southeast1:mother-db-sydney) e uma instancia separada nao usada pelo sistema principal.',
    domain: 'infrastructure',
    category: 'tidb_cloud',
    source: 'c185_lessons_learned'
  }
];

async function main() {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || 4000,
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.slice(1).split('?')[0],
      ssl: { rejectUnauthorized: true }
    });
    console.log('=== Injecao de conhecimento C185 Phase 0 + Phase 1 (TiDB Cloud) ===');
    console.log(`Conectado a ${urlObj.hostname}:${urlObj.port}`);
    let injected = 0;
    let skipped = 0;
    for (const e of entries) {
      const [existing] = await conn.execute('SELECT id FROM knowledge WHERE title = ?', [e.title]);
      if (existing.length > 0) {
        console.log('  SKIP:', e.title.substring(0, 70));
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
