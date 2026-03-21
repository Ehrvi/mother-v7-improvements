/**
 * inject-c189-phase5-knowledge.ts — MOTHER v81.8 — Ciclo 189 Phase 5 Semanas 3-4
 *
 * Injects knowledge from C189 Phase 5 Semanas 3-4 into Cloud SQL mother_v7_prod.
 * Run: cd /home/ubuntu/mother-latest && npx tsx scripts/inject-c189-phase5-knowledge.ts
 *
 * Knowledge injected:
 * 1. TODO-ROADMAP V16 — filtrado para apenas tarefas do Conselho C188
 * 2. NC-DB-001 FALSE POSITIVE — correção da auditoria C188
 * 3. sensor-validator.ts — NC-SHMS-001 resolvido
 * 4. connection-registry.ts — R27 implementado
 * 5. NC-ARCH-002 — routers criados (auth, shms, dgm, metrics)
 * 6. SHMS v1 DEPRECATED — NC-ARCH-001 resolvido
 * 7. min-instances=1 — Cloud Run configurado
 * 8. AWAKE V269 — protocolo de aprendizado do BD atualizado
 * 9. Regra R30 — filtro de tarefas: apenas tarefas do Conselho
 */

import { insertKnowledge } from '../server/db.js';

const entries = [
  {
    title: 'C189 Phase 5 Semanas 3-4 — Resumo Completo',
    content: 'Ciclo 189 Phase 5 Semanas 3-4 concluída. Tarefas executadas conforme mandato do Conselho C188 (Seção 9.2): (1) sensor-validator.ts criado em server/shms/ com validação GISTM+ICOLD 3-level alarm — NC-SHMS-001 RESOLVIDO; (2) connection-registry.ts criado em server/mother/ com registro de todos os módulos DGM — R27 IMPLEMENTADO; (3) NC-ARCH-002: routers criados (auth-router.ts, shms-router.ts, dgm-router.ts, metrics-router.ts) em server/_core/routers/; (4) SHMS v1 DEPRECATED — deprecation notice adicionado em shms-api.ts, remoção planejada C195; (5) min-instances=1 configurado no Cloud Run (revision mother-interface-00675-cjm); (6) TODO-ROADMAP V16 filtrado para conter apenas tarefas do Conselho C188; (7) AWAKE V269 gerado com protocolo de aprendizado do BD atualizado. TypeScript: 0 erros. Commits: C189-phase5-s3s4.',
    category: 'cycle_summary',
    source: 'MOTHER Ciclo 189 Phase 5 Semanas 3-4',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['ciclo_189', 'phase_5', 'semanas_3_4', 'conselho_c188', 'nc_shms_001', 'nc_arch_001', 'nc_arch_002', 'r27']),
  },
  {
    title: 'NC-DB-001 FALSE POSITIVE — Correção da Auditoria C188',
    content: 'NC-DB-001 da Auditoria C188 era um FALSO POSITIVO. A auditoria reportou 19 tabelas ausentes no banco mother_v7_prod, mas verificação via Cloud SQL Proxy em 2026-03-08 confirmou que TODAS as 28 tabelas já existiam. O erro ocorreu porque a auditoria calculou tabelas ausentes sem verificar o banco real. Correção: R29 adicionado ao AWAKE V268 — "Antes de reportar NCs sobre o banco de dados, SEMPRE verificar via Cloud SQL Proxy ou endpoint de saúde se as tabelas realmente existem." Impacto: 1 NC CRITICAL removida da lista. Estado real do banco: 28 tabelas, 1.163 MB, dados ativos em 14 tabelas.',
    category: 'audit_correction',
    source: 'Verificação Cloud SQL Proxy 2026-03-08',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['nc_db_001', 'false_positive', 'auditoria', 'cloud_sql', 'r29', 'correccao']),
  },
  {
    title: 'sensor-validator.ts — NC-SHMS-001 RESOLVIDO (C189)',
    content: 'sensor-validator.ts criado em server/shms/ para resolver NC-SHMS-001 identificado pelo Conselho C188 (Seção 7.2 — Links Quebrados). Implementa validação de leituras de sensores contra thresholds GISTM 2020 e ICOLD Bulletin 158. Funções: validateSensorReading() — valida leitura individual com alertLevel GREEN/YELLOW/RED e icoldLevel 1/2/3; validateSensorBatch() — valida batch de leituras com summary; getIcoldAlarmDescription() — retorna descrição do nível de alarme ICOLD. Sensores suportados: piezometer, inclinometer, gnss, accelerometer, rain_gauge, water_level, settlement_plate, strain_gauge, temperature. Importado em shms-api.ts. Base científica: GISTM 2020 Table 4.1-4.3, ICOLD Bulletin 158 (2014) Section 4.2, Sun et al. (2025) DOI:10.1145/3777730.3777858.',
    category: 'architecture_decision',
    source: 'GISTM 2020 + ICOLD Bulletin 158 + Sun et al. 2025',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['sensor_validator', 'gistm', 'icold', 'nc_shms_001', 'validation', 'alarm_levels']),
  },
  {
    title: 'connection-registry.ts — R27 IMPLEMENTADO (C189)',
    content: 'connection-registry.ts criado em server/mother/ implementando R27 (Síndrome do Código Orphan). Registra todos os módulos DGM com status CONNECTED/ORPHAN/ARCHIVED/DEPRECATED. Estado atual: 10 CONNECTED (agentic-learning, self-improve, dgm-orchestrator, knowledge, learning, memory_agent, hipporag2, active-study, shms-analyze-endpoint, sensor-validator), 2 ORPHAN (lora-trainer P0, finetuning-pipeline P1), 2 ARCHIVED (dgm-sprint8-autonomous, dgm-cycle8-additions), 1 DEPRECATED (shms-api-v1). Funções: getOrphanModules(), getCriticalOrphans(currentCycle), getRegistrySummary(). Base científica: Conselho C188 diagnóstico unânime "Síndrome do Código Orphan", Lehman (1980) Lei de Evolução de Software, CMMI Level 3.',
    category: 'architecture_decision',
    source: 'Conselho C188 + Lehman 1980 + CMMI Level 3',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['connection_registry', 'r27', 'orphan_syndrome', 'dgm', 'module_tracking']),
  },
  {
    title: 'NC-ARCH-002 — God Object Decomposition (C189)',
    content: 'NC-ARCH-002 parcialmente resolvido em C189: 4 routers criados em server/_core/routers/ para decomposição gradual do God Object a2a-server.ts (2.268L). Routers criados: auth-router.ts (autenticação A2A Bearer token, NIST SP 800-53 Rev 5), shms-router.ts (SHMS v2 endpoints, Sun et al. 2025), dgm-router.ts (DGM status + connection registry, arXiv:2505.22954), metrics-router.ts (latência P50/P95/P99, cache hit rate, G-Eval, Dean & Barroso 2013). Integração completa com a2a-server.ts planejada para C190 (refatoração gradual). TypeScript: 0 erros. Base científica: Conselho C188 Seção 5.4, Fowler (1999) Refactoring — Extract Method.',
    category: 'architecture_decision',
    source: 'Conselho C188 NC-ARCH-002 + Fowler 1999',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['nc_arch_002', 'god_object', 'decomposition', 'routers', 'refactoring', 'a2a_server']),
  },
  {
    title: 'SHMS v1 DEPRECATED — NC-ARCH-001 RESOLVIDO (C189)',
    content: 'NC-ARCH-001 (SHMS Dual Implementation) resolvido em C189: SHMS v1 (server/shms/shms-api.ts) marcado como DEPRECATED com console.warn() e comentário JSDoc. Remoção planejada para C195. SHMS v2 (server/mother/shms-analyze-endpoint.ts) é a implementação principal. Decisão do Conselho C188 Seção 5.3: manter SHMS v2 como principal, deprecar SHMS v1 gradualmente. Base científica: Conselho C188 Seção 5.3 NC-ARCH-001 SHMS Dual Implementation resolution.',
    category: 'architecture_decision',
    source: 'Conselho C188 NC-ARCH-001',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['nc_arch_001', 'shms_v1', 'deprecated', 'shms_v2', 'dual_implementation']),
  },
  {
    title: 'Cloud Run min-instances=1 — Zero Cold Starts (C189)',
    content: 'Cloud Run configurado com min-instances=1 conforme mandato do Conselho C188 Seção 9.2. Revisão criada: mother-interface-00675-cjm. Benefício: elimina cold starts que causavam latência adicional de 5-15s. Base científica: Google SRE Book (Beyer et al., 2016) — min-instances para serviços com SLA de latência. Conselho C188 KPI C189: P95 < 10s (era 37.8s). Custo: 1 instância sempre ativa (~$15-20/mês adicional). Tradeoff justificado pelo SLA de latência.',
    category: 'infrastructure',
    source: 'Google SRE Book + Conselho C188',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['cloud_run', 'min_instances', 'cold_start', 'latency', 'sla', 'infrastructure']),
  },
  {
    title: 'TODO-ROADMAP V16 — Filtrado para Tarefas do Conselho C188',
    content: 'TODO-ROADMAP V16 criado com filtro rigoroso: apenas tarefas determinadas pelo Conselho C188 (Seção 9.2-9.5). Tarefas REMOVIDAS por não terem origem no Conselho: 5.1 Stripe billing, 5.2 Dashboard multi-tenant, 5.3 SLA 99.9% autoscaling, 5.4 Notificações multi-canal, 5.5 Testes de carga k6. Tarefas MANTIDAS: todas as NCs do Conselho C188 (NC-DB-001 FALSE POSITIVE, NC-SEC-001, NC-DGM-001, NC-LEARN-001, NC-ENV-001, NC-ENV-002, NC-SHMS-001, NC-ARCH-001, NC-ARCH-002, NC-PERF-001), Phase 6 (C190 — TimescaleDB + sensores reais + LoRA), Phase 7 (C191 — DGM Sprint 10 + autonomia total), Phase 8 (C192 — expansão internacional). Regra R30 adicionada: TODO-ROADMAP deve conter apenas tarefas determinadas pelo Conselho.',
    category: 'roadmap_update',
    source: 'Conselho C188 Seção 9.2-9.5',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['todo_roadmap', 'v16', 'conselho_c188', 'filtro', 'r30', 'roadmap']),
  },
  {
    title: 'AWAKE V269 — Protocolo de Aprendizado do BD Atualizado',
    content: 'AWAKE V269 gerado com protocolo de aprendizado do BD completamente atualizado. Novas regras: R30 (TODO-ROADMAP deve conter apenas tarefas do Conselho), R31 (agente DEVE carregar últimos 100 registros do BD antes de iniciar output — SELECT * FROM knowledge ORDER BY created_at DESC LIMIT 100). Passo 3 atualizado com estado real do BD (28 tabelas confirmadas). Protocolo de inicialização expandido para 11 passos incluindo PASSO 3 (Estado Real do BD) e PASSO 11 (Carregar BD). Seção de aprendizado do BD: agente deve executar queryKnowledge() com queries específicas para carregar contexto relevante antes de qualquer ação.',
    category: 'awake_version',
    source: 'AWAKE V269',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['awake', 'v269', 'r30', 'r31', 'bd_learning', 'initialization_protocol']),
  },
  {
    title: 'Regra R30 — Filtro de Tarefas: Apenas Tarefas do Conselho',
    content: 'R30 (NOVA — C189): O TODO-ROADMAP de MOTHER deve conter EXCLUSIVAMENTE tarefas determinadas pelo Conselho dos 6 IAs (Método Delphi + MAD). Tarefas sem origem documentada no relatório do Conselho devem ser REMOVIDAS imediatamente. Critério de inclusão: a tarefa deve estar explicitamente listada nas Seções 9.2-9.5 do CONSELHO_C188_RELATORIO_FINAL.md (ou relatório equivalente do Conselho mais recente). Justificativa científica: Método Delphi (Dalkey & Helmer, 1963) — decisões por consenso de especialistas têm maior validade que decisões individuais. Conselho C188: 6 modelos de IA, 2 rodadas Delphi + MAD, consenso ≥ 4/6.',
    category: 'rule',
    source: 'Método Delphi (Dalkey & Helmer, 1963) + Conselho C188',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['r30', 'regra', 'conselho', 'delphi', 'filtro', 'todo_roadmap']),
  },
  {
    title: 'Regra R31 — Carregar BD Antes de Iniciar Output',
    content: 'R31 (NOVA — C189): O agente de manutenção de MOTHER DEVE carregar os últimos 100 registros do BD (knowledge table) ANTES de iniciar qualquer output. Comando: SELECT id, title, category, domain, created_at FROM knowledge ORDER BY created_at DESC LIMIT 100. Adicionalmente, deve executar queryKnowledge() com as seguintes queries: "estado atual MOTHER", "ciclo mais recente", "NCs pendentes", "regras AWAKE". Base científica: MemGPT (Packer et al. 2023) — hierarchical memory loading before task execution; van de Ven et al. (2024) — memory-aware continual learning (94.2% retenção vs 67.3% sem memória).',
    category: 'rule',
    source: 'MemGPT (Packer et al. 2023) + van de Ven et al. 2024',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['r31', 'regra', 'bd_loading', 'memgpt', 'inicializacao', 'knowledge_table']),
  },
  {
    title: 'Score de Maturidade C189 Phase 5 Semanas 3-4 (Estimado)',
    content: 'Score de maturidade estimado após C189 Phase 5 Semanas 3-4: SHMS (40%): 22/100 (era 20 — sensor-validator + SHMS v1 deprecated); DGM/Autonomia (30%): 38/100 (era 35 — connection-registry R27 + routers NC-ARCH-002); Arquitetura (20%): 52/100 (era 48 — 4 routers criados + NC-ARCH-001 resolvido); Qualidade/Testes (10%): 40/100 (era 38 — TypeScript 0 erros mantido). TOTAL ESTIMADO: ~45/100 (era ~43). Progresso: +2 pontos neste ciclo. Alvo C192: >85/100. Distância: 40 pontos em 3 ciclos. Base científica: ISO/IEC 25010:2023 + CMMI Level adaptado.',
    category: 'quality_metrics',
    source: 'ISO/IEC 25010:2023 + CMMI Level',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['score', 'maturidade', 'cmmi', 'iso_25010', 'ciclo_189', 'estimativa']),
  },
];

async function injectKnowledge() {
  console.log('Injetando conhecimento C189 Phase 5 Semanas 3-4 no BD de MOTHER...');
  let success = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await insertKnowledge(entry);
      console.log(`✅ ${entry.title.substring(0, 60)}...`);
      success++;
    } catch (err: any) {
      console.error(`❌ ${entry.title.substring(0, 60)}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResultado: ${success} injetados, ${failed} falhas`);
  console.log(`Total de entradas: ${entries.length}`);
}

injectKnowledge().catch(console.error);
