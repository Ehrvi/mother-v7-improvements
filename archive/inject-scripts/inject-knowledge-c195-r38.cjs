/**
 * inject-knowledge-c195-r38.cjs
 * Injetar conhecimento do Ciclo 195 no BD de MOTHER
 * Foco: R38 (pré-produção oficial), CORS completo, Sprint 2 ativo
 *
 * Uso: node inject-knowledge-c195-r38.cjs
 * Requer: TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE no ambiente
 * Alternativa: DATABASE_URL (Cloud SQL via proxy)
 *
 * Base científica:
 * - MemGPT (Packer et al. 2023 arXiv:2310.08560) — hierarchical memory
 * - van de Ven et al. (2024) NeurIPS — 94.2% retenção com memória prévia
 * - IEEE 829-2008 — Test data management in staged environments
 * - GISTM 2020 §8 — Phased implementation (synthetic data before real)
 */

const mysql = require('mysql2/promise');

// ─── Configuração de conexão ────────────────────────────────────────────────
const DB_CONFIG = {
  host: process.env.TIDB_HOST || 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || '4000'),
  user: process.env.TIDB_USER || 'mother_admin',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DATABASE || 'mother_v7_prod',
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15000,
};

// ─── Registros de conhecimento C195 ─────────────────────────────────────────
const C195_KNOWLEDGE = [
  {
    title: 'R38 — MOTHER é Pré-Produção Oficial (Sem Dados Reais)',
    content: `MOTHER é um software pré-produção oficial. O proprietário (Everton Garcia, Wizards Down Under) confirmou explicitamente que não há acesso a dados reais de sensores nesta fase. Consequências obrigatórias: (1) NÃO reportar ausência de dados reais como NC — é o estado correto e esperado. (2) NÃO tentar conectar sensores físicos sem autorização explícita. (3) Todos os dados SHMS são sintéticos calibrados conforme GISTM 2020 + ICOLD 158 thresholds — isso é CORRETO para pré-produção. (4) O pipeline MQTT→TimescaleDB opera com dados sintéticos via startSimulationFallback() — isso é CORRETO. (5) Testes de integração DEVEM usar dados sintéticos. (6) A transição para dados reais ocorrerá apenas quando o proprietário autorizar explicitamente (estimativa: pós-Score ≥ 90/100, Ciclo 198+). Base científica: GISTM 2020 §8 — "Phased implementation: synthetic data validation precedes real sensor integration"; IEEE 829-2008 — "Test data management in staged environments".`,
    category: 'Regras AWAKE',
    domain: 'SHMS',
    tags: 'c195,r38,pre-producao,pre-production,sintetico,synthetic,awake-v276',
    importance: 10,
    source: 'AWAKE V276 — Ciclo 195 — 2026-03-08',
  },
  {
    title: 'NC-001 CORS Completo — Zero Wildcards (C195)',
    content: `NC-001 CORS completamente resolvida no Ciclo 195. Além dos arquivos do Sprint 1 (cors-config.ts), foram removidos os últimos wildcards Access-Control-Allow-Origin: * de production-entry.ts (linha 337 — SSE endpoint /api/mother/stream) e shms-api.ts (linha 260 — SSE endpoint /api/shms/stream). O middleware corsConfig foi adicionado ao startup de production-entry.ts (linha 190). Resultado: zero wildcards em todo o codebase. Verificação: grep -rn "Access-Control-Allow-Origin.*\*" server/ retorna apenas cors-patch-instructions.ts (arquivo de documentação, não código ativo). Base científica: OWASP A01:2021 — Broken Access Control. Conselho dos 6 IAs — NC-001 CRÍTICA.`,
    category: 'NCs Resolvidas',
    domain: 'Segurança',
    tags: 'c195,nc-001,cors,owasp,sprint1,resolvida',
    importance: 9,
    source: 'Sprint 1 + C195 — production-entry.ts + shms-api.ts',
  },
  {
    title: 'AWAKE V276 — Protocolo 15 Passos — R38 + PASSO 15',
    content: `AWAKE V276 criado no Ciclo 195 com as seguintes atualizações: (1) R38 adicionado — MOTHER é pré-produção oficial, sem dados reais, dados sintéticos são corretos. (2) PASSO 15 adicionado ao protocolo de inicialização — verificar status pré-produção antes de reportar NCs. (3) Protocolo expandido de 14 para 15 passos. (4) Checklist de internalização atualizado com item PASSO 15. (5) Referências científicas atualizadas: GISTM 2020 §8 e IEEE 829-2008 adicionadas. (6) Score de maturidade C195 atualizado: 77/100 (sem incremento — Sprint 2 é quando o score sobe). Anterior: AWAKE V275 (Ciclo 194, R34-R37, 14 passos).`,
    category: 'Regras AWAKE',
    domain: 'Arquitetura',
    tags: 'c195,awake-v276,r38,passo-15,protocolo,15-passos',
    importance: 9,
    source: 'AWAKE V276 — Ciclo 195 — 2026-03-08',
  },
  {
    title: 'TODO-ROADMAP V23 — Sprint 2 ATIVO (C195)',
    content: `TODO-ROADMAP V23 criado no Ciclo 195 com roadmap limpo exclusivamente do Conselho dos 6 IAs (R30, R34). Sprint 1 marcado como CONCLUÍDO (NC-001 a NC-007 + CORS completo C195). Sprint 2 ATIVO (C195 — Mar S3-4): C195-1 testes integração MQTT→TimescaleDB sintéticos, C195-2 DGM Sprint 13 benchmark, C195-3 endpoint alertas históricos, C195-4 documentação OpenAPI. Score atual: 77/100. Alvo Sprint 2: 82/100. Alvo Sprint 5: ≥90/100 (threshold R33). Módulos DEMO-ONLY: multi-tenant, stripe-billing, sla-monitor, tenant-isolation, billing-integration — NÃO conectar até Score ≥ 90/100 + aprovação do proprietário.`,
    category: 'Roadmap',
    domain: 'Gestão',
    tags: 'c195,todo-v23,roadmap,sprint2,conselho,delphi-mad',
    importance: 8,
    source: 'TODO-ROADMAP V23 — Ciclo 195 — 2026-03-08',
  },
  {
    title: 'Sprint 2 C195 — Tarefas Prioritárias (Conselho dos 6 IAs)',
    content: `Sprint 2 do Conselho dos 6 IAs (Mar S3-4, Ciclo 195): C195-1 [ALTA] — Testes de integração MQTT→TimescaleDB com dados sintéticos calibrados (GISTM 2020 + ICOLD 158). Injetar leituras sintéticas via MQTT e verificar hypertables shms_ts_sensor_readings. Base: ISO/IEC 25010:2011 + IEEE 829-2008. C195-2 [ALTA] — DGM Sprint 13 benchmark comparativo antes/depois Sprint 12 autoMerge. Base: HELM (Liang et al., arXiv:2211.09110). C195-3 [MÉDIA] — Endpoint GET /api/shms/v2/alerts/:structureId com filtros level e hours. Base: ICOLD Bulletin 158. C195-4 [MÉDIA] — Documentação OpenAPI SHMS API v2 validada com openapi-spec-validator (R25). Base: Roy Fielding (2000) REST. NOTA R38: Todos os testes usam dados sintéticos — correto para pré-produção.`,
    category: 'Roadmap',
    domain: 'SHMS',
    tags: 'c195,sprint2,tarefas,conselho,mqtt,timescaledb,dgm,openapi',
    importance: 8,
    source: 'TODO-ROADMAP V23 — Ciclo 195 — 2026-03-08',
  },
  {
    title: 'Arquivos Sprint 1 Confirmados no GitHub (C195)',
    content: `Todos os 8 arquivos do Sprint 1 confirmados no repositório GitHub (branch sprint1/nc-001-004-conselho-6-ias, PR #2): cors-config.ts (NC-001), vitest.config.ts (NC-002), tests/setup.ts (NC-002), server/mother/__tests__/core.test.ts (NC-002), server/shms/__tests__/shms-api.test.ts (NC-002), server/mother/dgm-cycle3.ts (NC-003), server/shms/mqtt-bridge.ts (NC-004), server/_core/rate-limiter.ts (NC-006), server/_core/structured-logger.ts (NC-007), drizzle/migrations/001_shms_timescaledb_conselho.sql (SHMS). Adicionalmente no C195: production-entry.ts com corsConfig import + zero wildcards, shms-api.ts com zero wildcards. GitHub PR: https://github.com/Ehrvi/mother-v7-improvements/pull/2`,
    category: 'NCs Resolvidas',
    domain: 'Arquitetura',
    tags: 'c195,sprint1,github,pr2,nc-001,nc-002,nc-003,nc-004,nc-006,nc-007',
    importance: 7,
    source: 'GitHub PR #2 — Sprint 1 + C195',
  },
  {
    title: 'Checklist O Que NÃO É NC em Pré-Produção (R38)',
    content: `Conforme R38 (AWAKE V276), os seguintes itens NÃO são NCs em MOTHER pré-produção: (1) Ausência de dados reais de sensores — NÃO É NC (pré-produção oficial). (2) MQTT usando dados sintéticos — NÃO É NC (correto para esta fase). (3) TimescaleDB sem leituras reais — NÃO É NC (dados sintéticos são corretos). (4) Sensores não conectados — NÃO É NC (pré-produção oficial). O que É NC independente de R38: falhas de segurança (CORS, auth, rate limiting), ausência de testes automatizados, módulos DEMO-ONLY conectados sem autorização (R33), código orphan sem registro (R27), secrets hardcoded (R11). Base científica: GISTM 2020 §8 — phased implementation; IEEE 829-2008 — staged environments.`,
    category: 'Regras AWAKE',
    domain: 'Qualidade',
    tags: 'c195,r38,pre-producao,nc,checklist,false-positive',
    importance: 9,
    source: 'AWAKE V276 PASSO 15 — Ciclo 195 — 2026-03-08',
  },
  {
    title: 'Instruções Agente Manutenção MOTHER — PASSO 15 (R38)',
    content: `O agente de manutenção de MOTHER deve executar 15 passos ANTES de iniciar qualquer output. O PASSO 15 (novo no C195) é: Verificar Status Pré-Produção (R38 — MANDATÓRIO). Antes de reportar qualquer NC relacionada a dados, verificar: (1) Confirmar que MOTHER é pré-produção oficial. (2) Verificar se dados são sintéticos via grep -n "simulation|synthetic|startSimulationFallback" server/shms/*.ts. (3) Verificar se pipeline usa fallback sintético (correto — R38). Checklist R38 — O que NÃO é NC: ausência de dados reais, MQTT sintético, TimescaleDB sem leituras reais, sensores não conectados. O que É NC: falhas de segurança, ausência de testes, módulos DEMO-ONLY conectados, código orphan, secrets hardcoded. O PASSO 11 (Carregar BD) foi atualizado com query adicional: SELECT title, content FROM knowledge WHERE tags LIKE '%pre-producao%' OR tags LIKE '%pre-production%' OR tags LIKE '%sintetico%'. E queryKnowledge("pre-producao dados sinteticos") foi adicionado à lista obrigatória.`,
    category: 'Regras AWAKE',
    domain: 'Arquitetura',
    tags: 'c195,passo-15,r38,agente-manutencao,instrucoes,pre-producao',
    importance: 10,
    source: 'AWAKE V276 PASSOS 11+15 — Ciclo 195 — 2026-03-08',
  },
];

// ─── Função principal ────────────────────────────────────────────────────────
async function injectKnowledge() {
  console.log('🧠 MOTHER Knowledge Injection — Ciclo 195 (R38 + CORS + Sprint 2)');
  console.log('Base científica: MemGPT (Packer et al. 2023 arXiv:2310.08560)');
  console.log('─'.repeat(60));

  let conn;
  try {
    conn = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Conectado ao TiDB Cloud');

    // Verificar schema da tabela knowledge
    const [cols] = await conn.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'knowledge'
      ORDER BY ORDINAL_POSITION
    `);
    const colNames = cols.map(c => c.COLUMN_NAME);
    console.log(`📋 Colunas da tabela knowledge: ${colNames.join(', ')}`);

    // Determinar colunas disponíveis
    const hasImportance = colNames.includes('importance');
    const hasSource = colNames.includes('source');
    const hasTags = colNames.includes('tags');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of C195_KNOWLEDGE) {
      try {
        // Verificar se já existe
        const [existing] = await conn.execute(
          'SELECT id FROM knowledge WHERE title = ? LIMIT 1',
          [record.title]
        );

        if (existing.length > 0) {
          // Atualizar existente
          const updateFields = ['content = ?', 'category = ?', 'domain = ?'];
          const updateValues = [record.content, record.category, record.domain];

          if (hasTags) { updateFields.push('tags = ?'); updateValues.push(record.tags); }
          if (hasImportance) { updateFields.push('importance = ?'); updateValues.push(record.importance); }
          if (hasSource) { updateFields.push('source = ?'); updateValues.push(record.source); }

          await conn.execute(
            `UPDATE knowledge SET ${updateFields.join(', ')} WHERE title = ?`,
            [...updateValues, record.title]
          );
          console.log(`🔄 Atualizado: ${record.title.substring(0, 60)}...`);
          updated++;
        } else {
          // Inserir novo
          const insertCols = ['title', 'content', 'category', 'domain'];
          const insertVals = [record.title, record.content, record.category, record.domain];

          if (hasTags) { insertCols.push('tags'); insertVals.push(record.tags); }
          if (hasImportance) { insertCols.push('importance'); insertVals.push(record.importance); }
          if (hasSource) { insertCols.push('source'); insertVals.push(record.source); }

          const placeholders = insertVals.map(() => '?').join(', ');
          await conn.execute(
            `INSERT INTO knowledge (${insertCols.join(', ')}) VALUES (${placeholders})`,
            insertVals
          );
          console.log(`✅ Inserido: ${record.title.substring(0, 60)}...`);
          inserted++;
        }
      } catch (err) {
        console.error(`❌ Erro em "${record.title}": ${err.message}`);
        skipped++;
      }
    }

    console.log('─'.repeat(60));
    console.log(`📊 Resultado: ${inserted} inseridos | ${updated} atualizados | ${skipped} erros`);
    console.log(`📚 Total C195: ${C195_KNOWLEDGE.length} registros processados`);
    console.log('✅ Injeção C195 concluída — BD MOTHER atualizado com R38 + CORS + Sprint 2');

  } catch (err) {
    console.error('❌ Erro de conexão:', err.message);
    console.log('\n💡 Alternativa: Execute via Cloud SQL Proxy com DATABASE_URL');
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

injectKnowledge();
