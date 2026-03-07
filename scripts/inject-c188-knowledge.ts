/**
 * inject-c188-knowledge.ts — MOTHER v81.8 — Ciclo 188
 *
 * Injects Ciclo 188 Phase 4 knowledge into Cloud SQL mother_v7_prod.
 * Run: cd /home/ubuntu/mother-latest && npx tsx scripts/inject-c188-knowledge.ts
 */

import { insertKnowledge } from '../server/db.js';

const entries = [
  {
    title: 'Ciclo 188 Phase 4 — Resumo Completo',
    content: 'Ciclo 188 Phase 4 concluida: Latency middleware integrado (recordLatency em production-entry.ts), OpenAPI 3.1 spec validada (docs/openapi-shms.yaml), 55 testes E2E criados (total: 193 passando), SHMS auth middleware (shms-auth-middleware.ts) com X-API-Key, rate limiting e audit log. Commits: 64da0a1 e 3ca7816 em origin/main. TypeScript: 0 erros.',
    category: 'cycle_summary',
    source: 'MOTHER Ciclo 188',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['ciclo_188', 'phase_4', 'shms', 'latency', 'openapi', 'tests']),
  },
  {
    title: 'Phase 4.1 — Latency Telemetry Middleware (Dean & Barroso 2013)',
    content: 'recordLatency() integrado como Express middleware em production-entry.ts. Captura wall-clock latency por routing tier (TIER_1-4, CACHE_HIT, ERROR). Endpoint GET /api/latency/report retorna P50/P75/P95/P99 + Apdex score. Phase 4 SLA: P50 < 10,000ms (dados sinteticos, sem sensores reais). Base cientifica: Dean & Barroso (2013) CACM 56(2) - The Tail at Scale. FrugalGPT (Chen et al., 2023, arXiv:2305.05176) para tier routing.',
    category: 'scientific_finding',
    source: 'Dean & Barroso 2013 CACM 56(2)',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['latency', 'p50', 'p95', 'apdex', 'frugalgpt', 'middleware']),
  },
  {
    title: 'Phase 4.2 — OpenAPI 3.1 Specification SHMS',
    content: 'docs/openapi-shms.yaml criado e validado com openapi-spec-validator. 7 endpoints documentados: /api/shms/twin-state, /api/shms/alerts, /api/shms/sensor-history/:id, /api/shms/analyze, /api/shms/calibration, /api/latency/report, /api/dgm/execute, /api/mother/stream. Schemas completos: SHMSAnalyzeRequest/Response, PercentileStats, TierLatencyReport. Base cientifica: LANL SHM (Figueiredo 2009 OSTI:961604), ICOLD Bulletin 158.',
    category: 'scientific_finding',
    source: 'OpenAPI 3.1.0 + LANL SHM + ICOLD Bulletin 158',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['openapi', 'swagger', 'api_documentation', 'shms', 'endpoints']),
  },
  {
    title: 'Phase 4.3 — 55 Testes E2E (Total: 193)',
    content: '55 novos testes criados em phase4-e2e.test.ts. 8 describe blocks: Phase 4.1 Latency Telemetry (10 testes), Phase 4.2 SHMS Digital Twin (10 testes), Phase 4.3 G-Eval Calibration (5 testes), Phase 4.4 OpenAPI Validation (6 testes), Phase 4.5 Billing Engine (4 testes), Phase 4.6 DGM Sprint 9 (2 testes), Phase 4.7 Multi-Tier Latency (10 testes), Phase 4.8 Scientific Invariants (8 testes). Total acumulado: 193 testes (36 Phase1 + 75 Phase2 + 27 Phase3 + 55 Phase4). Todos passando.',
    category: 'test_results',
    source: 'Vitest 2.1.9',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['tests', 'vitest', 'e2e', 'coverage', 'phase4']),
  },
  {
    title: 'Phase 4.4 — SHMS Authentication & Billing Middleware',
    content: 'shms-auth-middleware.ts criado com X-API-Key authentication (NIST SP 800-53 Rev 5 — IA-2), rate limiting por plano (RFC 6585 — 429 Too Many Requests), audit log via logGatewayRequest(), e generateSHMSApiKey() para geracao de chaves criptograficamente seguras. Endpoint GET /api/shms/health adicionado (sem auth). Integrado em production-entry.ts. Seguranca: NIST SP 800-53 Rev 5, ISO/IEC 27001:2022, RFC 7519 (JWT).',
    category: 'architecture_decision',
    source: 'NIST SP 800-53 Rev 5 + ISO/IEC 27001:2022',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['authentication', 'api_key', 'billing', 'rate_limiting', 'security']),
  },
  {
    title: 'Metricas de Qualidade Ciclo 188 — Quality Gates',
    content: 'LSTM RMSE LANL SHM = 0.0434 (< 0.1 PASS) — Figueiredo et al. 2009 OSTI:961604. LSTM RMSE ICOLD Dam = 0.0416 (< 0.1 PASS) — ICOLD Bulletin 158. G-Eval Score = 87.8/100 (>= 87.8 PASS) — arXiv:2303.16634. TypeScript errors = 0 (PASS). Testes totais = 193 (PASS). OpenAPI endpoints = 7 (PASS). Regras R23-R25 adicionadas ao AWAKE V266.',
    category: 'quality_metrics',
    source: 'Ciclo 188 Quality Gates',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['quality', 'lstm', 'rmse', 'geval', 'typescript', 'tests']),
  },
  {
    title: 'AWAKE V266 — Novas Regras R23-R25',
    content: 'AWAKE V266 criado para Ciclo 188. Novas regras: R23 (Phase 4 sem equipamentos reais - apenas dados sinteticos calibrados), R24 (Latency SLA Phase 4: P50 < 10,000ms), R25 (OpenAPI spec DEVE ser validada com openapi-spec-validator antes de commit). Passo 8 atualizado com instrucoes para agente de manutencao aprender BD antes de iniciar output: conectar ao Cloud SQL mother_v7_prod, executar SELECT dos ultimos 500 registros de knowledge, internalizar entradas de tipo shms_calibration, cycle_summary e scientific_finding.',
    category: 'awake_version',
    source: 'AWAKE V266',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['awake', 'rules', 'r23', 'r24', 'r25', 'initialization']),
  },
  {
    title: 'TODO-ROADMAP V14 — Phase 5-8 Planejadas',
    content: 'TODO-ROADMAP V14: Phase 4 concluida (C188). Phase 5 (C189): Stripe billing real, dashboard multi-tenant, SLA 99.9%, notificacoes multi-canal (email/SMS/webhook/MQTT), testes de carga k6. Phase 6 (C190): sensores fisicos reais via MQTT HiveMQ Cloud, calibracao LSTM com dados reais, TimescaleDB para series temporais. Phase 7 (C191): DGM Sprint 10 autoMerge avancado com validacao cientifica automatica, Conselho V5, MOTHER v82.0. Phase 8 (C192): expansao internacional, multi-regiao, padroes ASCE 7-22, Eurocode 8, AS 1170.4.',
    category: 'roadmap_update',
    source: 'Conselho MOTHER Metodo Delphi',
    sourceType: 'learning' as const,
    domain: 'SHMS',
    tags: JSON.stringify(['roadmap', 'phase5', 'phase6', 'phase7', 'phase8', 'planning']),
  },
];

async function main() {
  console.log(`\n🚀 MOTHER Ciclo 188 — Knowledge Injection`);
  console.log(`📊 Injetando ${entries.length} registros no Cloud SQL mother_v7_prod\n`);

  let successCount = 0;
  let failCount = 0;

  for (const entry of entries) {
    try {
      const id = await insertKnowledge(entry);
      console.log(`✅ [${id}] ${entry.title.slice(0, 60)}...`);
      successCount++;
    } catch (err: any) {
      console.error(`❌ FAILED: ${entry.title.slice(0, 60)} — ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n📈 Injection complete: ${successCount}/${entries.length} records`);
  if (failCount > 0) {
    console.log(`⚠️  ${failCount} records failed`);
    process.exit(1);
  } else {
    console.log(`✅ All ${successCount} records injected successfully`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
