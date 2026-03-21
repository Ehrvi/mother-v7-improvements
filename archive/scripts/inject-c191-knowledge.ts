/**
 * inject-c191-knowledge.ts — Injeção de Conhecimento Ciclo 191
 * Colunas corretas: title, content, category, tags, source, sourceType, domain
 */

import mysql from 'mysql2/promise';

async function injectKnowledge() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL ?? '');
  console.log('[C191] Conectado ao TiDB Cloud');

  const records = [
    {
      title: 'C191 Phase 6 S3-4 — Resumo Completo',
      content: 'Ciclo 191 Phase 6 S3-4 executado em 2026-03-08. Tarefas: initTimescaleConnector() ativado no startup (FALSE POSITIVE), mqttDigitalTwinBridge.startSimulationFallback() ativado (FALSE POSITIVE), deploy-validator.ts criado, dashboard-shms.ts criado com endpoint GET /api/shms/v2/dashboard, multi-tenant-demo.ts criado como DEMO-ONLY (NÃO conectado), stripe-billing-demo.ts criado como DEMO-ONLY (NÃO conectado), R33 adicionado ao AWAKE V271. TypeScript: 0 erros. Score de maturidade: 52 → 58/100. Base científica: Conselho C188 Seções 9.3-9.4; Freedman et al. (2018) TimescaleDB; Sun et al. (2025) SHMS Digital Twin.',
      category: 'ciclo_summary',
      tags: 'ciclo191,phase6,timescaledb,mqtt,dashboard,deploy-validator,demo-only',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'MOTHER Ciclos',
    },
    {
      title: 'R33 — Módulos Comerciais = DEMO-ONLY até Score >= 75/100',
      content: 'REGRA R33 (Ciclo 191): Todos os módulos que visam comercialização (multi-tenant, billing, SLA, notificações multi-canal) devem ser criados como DEMO-ONLY: arquivo criado com aviso explícito, NÃO importado em production-entry.ts ou a2a-server.ts, NÃO conectado a endpoints de produção. Condição para conectar: Score de Maturidade MOTHER >= 75/100 + aprovação explícita do proprietário Everton Garcia, Wizards Down Under. Score atual: 58/100. Módulos DEMO existentes: multi-tenant-demo.ts, stripe-billing-demo.ts, tenant-isolation.ts (C127), billing-integration.ts (C129). Base científica: Lean Software Development (Poppendieck, 2003); Conselho C188 Seção 9.4.',
      category: 'rule',
      tags: 'R33,demo-only,comercial,multi-tenant,stripe,billing,regra',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'Regras AWAKE',
    },
    {
      title: 'C191 — TimescaleDB + MQTT Bridge Ativados no Startup (FALSE POSITIVES)',
      content: 'FALSE POSITIVES C191: timescale-connector.ts e mqtt-digital-twin-bridge.ts existiam desde C127/C129 e eram importados em a2a-server.ts, mas initTimescaleConnector() e mqttDigitalTwinBridge.startSimulationFallback() NUNCA eram chamados no startup de produção (production-entry.ts). Funções MORTAS → VIVAS em C191. Sequência de startup atualizada: t=2s warmCache(), t=3s initTimescaleConnector(), t=4s mqttDigitalTwinBridge.startSimulationFallback(), t=5s injectSprintKnowledge(), t=weekly scheduleLoRAPipeline(). Base científica: Freedman et al. (2018) TimescaleDB VLDB; Sun et al. (2025) DOI:10.1145/3777730.3777858.',
      category: 'architecture',
      tags: 'timescaledb,mqtt,startup,false-positive,production-entry,c191',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'Arquitetura MOTHER',
    },
    {
      title: 'C191 — deploy-validator.ts Criado (DGM Sprint 10)',
      content: 'deploy-validator.ts criado em server/mother/deploy-validator.ts. Funções exportadas: validateDeploy(), runPostDeployValidation(). Checks implementados: health-endpoint (crítico), typescript-compilation (crítico), database-connectivity (crítico), shms-analyze-regression (não-crítico), dgm-orchestrator-status (não-crítico), metrics-endpoint (não-crítico). Rollback automático acionado se qualquer check crítico falhar. Base científica: Google SRE Book (Beyer et al., 2016) Chapter 12; Humble & Farley (2010) Continuous Delivery.',
      category: 'architecture',
      tags: 'deploy-validator,dgm-sprint10,rollback,post-deploy,sre,c191',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'Arquitetura MOTHER',
    },
    {
      title: 'C191 — dashboard-shms.ts Criado com Endpoint GET /api/shms/v2/dashboard',
      content: 'dashboard-shms.ts criado em server/mother/dashboard-shms.ts. Endpoint: GET /api/shms/v2/dashboard. Função exportada: getDashboardData(structureId). Dados agregados: últimas leituras de sensores (TimescaleDB), previsões LSTM, status Digital Twin, alertas ICOLD 3-level (GREEN/YELLOW/RED). Fallback sintético calibrado quando TimescaleDB não disponível (R23 — sem sensores reais em Phase 6). Thresholds baseados em GISTM 2020 + ICOLD Bulletin 158. Base científica: Sun et al. (2025) DOI:10.1145/3777730.3777858; ICOLD Bulletin 158 (2014); GISTM 2020.',
      category: 'architecture',
      tags: 'dashboard,shms,icold,gistm,digital-twin,phase6,c191',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'SHMS Geotécnico',
    },
    {
      title: 'C191 — multi-tenant-demo.ts — DEMO-ONLY (NÃO CONECTADO) — R33',
      content: 'multi-tenant-demo.ts criado em server/mother/multi-tenant-demo.ts. STATUS: DEMO-ONLY — NÃO CONECTADO. AVISO: DEMO SOFTWARE — NÃO COMERCIAL. Diretriz do proprietário Everton Garcia, Wizards Down Under. 3 tenants fictícios: Mineradora Alpha (professional), Construtora Beta (starter), Hidrelétrica Gamma (enterprise). Planos: starter (5 sensores), professional (20 sensores), enterprise (ilimitado). Condição para conectar: Score >= 75/100 + aprovação do proprietário. Base científica: Conselho C188 Seção 9.4; ISO/IEC 27001:2022; NIST SP 800-53 Rev 5.',
      category: 'commercial',
      tags: 'multi-tenant,demo-only,R33,tenant-isolation,c191',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'Comercial DEMO',
    },
    {
      title: 'C191 — stripe-billing-demo.ts — DEMO-ONLY (NÃO CONECTADO) — R33',
      content: 'stripe-billing-demo.ts criado em server/mother/stripe-billing-demo.ts. STATUS: DEMO-ONLY — NÃO CONECTADO. SEM PAGAMENTOS REAIS. Planos (Conselho C188 Seção 9.4): Starter R$150/sensor/mês, Professional R$120/sensor/mês, Enterprise R$90/sensor/mês. MRR atual: R$0 (sem clientes reais). MRR projetado demo: R$3.600. MRR alvo C192: R$50.000. Condição para conectar: Score >= 75/100 + aprovação do proprietário. Base científica: Conselho C188 Seção 9.4; PCI DSS v4.0; ISO/IEC 27001:2022.',
      category: 'commercial',
      tags: 'stripe,billing,demo-only,R33,planos,precos,c191',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'Comercial DEMO',
    },
    {
      title: 'C191 — Score de Maturidade MOTHER: 52 → 58/100',
      content: 'Score de Maturidade MOTHER atualizado em C191: 52 → 58/100 (+6 pontos). Dimensões: DGM/Autonomia 48→52 (+4), SHMS/Geotécnico 55→65 (+10), Arquitetura 70→75 (+5), Comercial 5→8 (+3), Qualidade/Testes 40→42 (+2). Alvo C192: 65/100. Alvo para comercialização: 75/100. Base científica: CMMI Level 3 (SEI, 2010); ISO/IEC 15504 SPICE; Conselho C188 Seção 9.5.',
      category: 'maturity',
      tags: 'maturidade,score,cmmi,c191,58',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'Maturidade MOTHER',
    },
    {
      title: 'C192 — Tarefas Pendentes do Conselho C188 (Phase 7)',
      content: 'Tarefas pendentes para C192 Phase 7 S1-2: (1) Provisionar HiveMQ Cloud (MQTT_BROKER_URL) — Phase 6 S3-4 pendente. (2) Provisionar TimescaleDB Cloud (TIMESCALE_DB_URL) — Phase 6 S3-4 pendente. (3) DGM Sprint 10: autoMerge em dgm-orchestrator.ts — Conselho C188 Seção 9.4. (4) Conectar deploy-validator.ts em dgm-orchestrator.ts após triggerDeploy(). (5) Phase 7: Escalar para 3 estruturas monitoradas (dashboard-shms.ts). (6) Phase 7: SLA monitoring (DEMO-ONLY — R33). Base científica: Conselho C188 Seção 9.4-9.5; Fowler (2006) Continuous Integration.',
      category: 'pending_tasks',
      tags: 'c192,pendentes,hivemq,timescaledb,dgm-sprint10,phase7',
      source: 'C191_INJECT',
      sourceType: 'learning' as const,
      domain: 'MOTHER Ciclos',
    },
  ];

  let inserted = 0;
  for (const record of records) {
    try {
      await conn.execute(
        `INSERT INTO knowledge (title, content, category, tags, source, sourceType, domain, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [record.title, record.content, record.category, record.tags, record.source, record.sourceType, record.domain]
      );
      inserted++;
      console.log(`[C191] ✅ ${record.title}`);
    } catch (err: any) {
      console.error(`[C191] ❌ ${record.title}: ${err.message}`);
    }
  }

  await conn.end();
  console.log(`[C191] BD atualizado: ${inserted}/${records.length} registros inseridos`);
}

injectKnowledge().catch(console.error);
