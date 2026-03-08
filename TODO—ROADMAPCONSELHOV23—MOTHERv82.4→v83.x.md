# TODO-ROADMAP V23 — MOTHER v82.4 → v83.x
**Versão:** TODO-ROADMAP V23
**Sistema:** MOTHER v82.4
**Ciclo:** 195 — Sprint 2 ATIVO
**Data:** 2026-03-08
**Anterior:** TODO V22 (Ciclo 194 — Sprint 1 Concluído)
**Regra R30:** Este TODO contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho dos 6 IAs (Protocolo Delphi + MAD — 3 Rodadas). Base científica: Método Delphi (Dalkey & Helmer, 1963).
**Regra R33:** Módulos comerciais = DEMO-ONLY até Score ≥ 90/100. Score atual: **77/100**.
**Regra R34:** Roadmap exclusivo do Conselho dos 6 IAs — não adicionar tarefas externas.
**Regra R38:** MOTHER = PRÉ-PRODUÇÃO OFICIAL. Sem dados reais de sensores. Dados sintéticos = CORRETO.
**Conselho:** DeepSeek R1/V3 | Anthropic Claude Opus | Gemini 2.5 Pro | Mistral Large | MOTHER v82.4 | MANUS
**Kendall W:** 0.82 (p < 0.001) | **Consenso:** 3/3 votações

---

## TAREFAS CONCLUÍDAS (C189-C195)

### Phase 5 Semanas 3-4 (C189) — Conselho C188 Seção 9.2
- [x] `pnpm db:push` — FALSE POSITIVE (tabelas já existiam)
- [x] JWT_SECRET configurado via Secret Manager
- [x] `triggerDeploy` conectado em `dgm-orchestrator.ts`
- [x] `memory_agent` conectado em `learning.ts`
- [x] `HippoRAG2` conectado em `knowledge.ts`
- [x] `sensor-validator.ts` criado em `server/shms/` (GISTM 2020 + ICOLD 158)
- [x] `shms-geval-geotechnical.ts` conectado em `shms-analyze-endpoint.ts`
- [x] `min-instances=1` no Cloud Run
- [x] Cache write em `core.ts` — FALSE POSITIVE (já implementado L1959)
- [x] SHMS v1 deprecation notice em `shms-api.ts`
- [x] NC-ARCH-002: 4 routers criados (`auth`, `shms`, `dgm`, `metrics`)
- [x] `connection-registry.ts` criado (R27)
- [x] `active-study` trigger em `core.ts` — FALSE POSITIVE (já implementado L682 desde C56)

### Phase 6 Semanas 1-2 (C190) — Conselho C188 Seção 9.3
- [x] NC-ARCH-002 COMPLETO: 4 routers montados em `production-entry.ts`
- [x] `lora-trainer.ts` ATIVO: `scheduleLoRAPipeline()` chamado no startup (P0 CRÍTICO)
- [x] `finetuning-pipeline.ts` importado em `dgm-orchestrator.ts`

### Phase 6 Semanas 3-4 (C191) — Conselho C188 Seção 9.3
- [x] `initTimescaleConnector()` chamado no startup (t=3s) — FALSE POSITIVE resolvido
- [x] `mqttDigitalTwinBridge.startSimulationFallback()` chamado no startup (t=4s) — FALSE POSITIVE resolvido
- [x] `deploy-validator.ts` criado (6 checks + rollback automático)
- [x] `dashboard-shms.ts` criado (`GET /api/shms/v2/dashboard` — ICOLD 3-level)
- [x] `multi-tenant-demo.ts` criado — DEMO-ONLY (R33)
- [x] `stripe-billing-demo.ts` criado — DEMO-ONLY (R33)
- [x] R33 adicionado ao AWAKE V271

### Phase 7 Semanas 1-2 (C192) — Conselho C188 Seção 9.4
- [x] DGM Sprint 10: `autoMerge` em `dgm-orchestrator.ts` (fitness ≥ 80)
- [x] `deploy-validator.ts` CONECTADO em `dgm-orchestrator.ts` após `triggerDeploy()`
- [x] Dashboard escalado: 3 estruturas (`STRUCTURE_001-003`)
- [x] `sla-monitor-demo.ts` criado — DEMO-ONLY (R33)
- [x] R33 CORRIGIDO: threshold 75/100 → **90/100** (diretriz do proprietário)

### Phase 7 Semanas 3-4 (C193) — Conselho C188 Seção 9.4
- [x] **C193-1:** HiveMQ Cloud ATIVO — `MQTT_BROKER_URL` configurado no Cloud Run
- [x] **C193-2:** TimescaleDB Cloud ATIVO — `TIMESCALE_DB_URL` configurado no Cloud Run
- [x] `timescale-pg-client.ts` criado — pool PostgreSQL dedicado + 3 hypertables
- [x] `mqtt-connector.ts` atualizado — usa broker MQTT real (HiveMQ) com fallback sintético (R38)
- [x] **C193-3:** DGM Sprint 11 benchmark pós-autoMerge em `dgm-orchestrator.ts`
- [x] **C193-4:** Dashboard escalado: 5 estruturas (`STRUCTURE_001-005`)
- [x] BD MOTHER: 8 registros C193 injetados (TiDB Cloud)

### Phase 7 Semanas 5-6 (C194) — Conselho C188 Seção 9.4 ✅ CONCLUÍDA
- [x] **C194-1:** `mqtt-timescale-bridge.ts` — pipeline MQTT→sensor-validator→TimescaleDB (dados sintéticos — R38)
- [x] **C194-2:** Endpoint histórico `GET /api/shms/v2/history/:structureId?hours=24`
- [x] **C194-3:** DGM Sprint 12 — cron diário autônomo
- [x] **C194-4:** `sensor-validator.ts` integrado ao pipeline MQTT
- [x] **C194-5:** `notification-service.ts` — alertas ICOLD L2/L3
- [x] BD MOTHER: 8 registros C194 injetados (TiDB Cloud)
- [x] AWAKE V274 gerado e sincronizado ao Google Drive
- [x] Deploy Cloud Run v82.4 — australia-southeast1

### Sprint 1 — Conselho dos 6 IAs (C194) ✅ CONCLUÍDO
**Protocolo Delphi + MAD — 3 Rodadas | Kendall W = 0.82 | Score: 77/100**
- [x] **NC-001 [CRÍTICA]:** `server/_core/cors-config.ts` — CORS whitelist por ambiente (OWASP A01:2021)
- [x] **NC-002 [CRÍTICA]:** Suite de testes automatizados vitest (IEEE 1028-2008)
  - `vitest.config.ts` — 80% coverage threshold
  - `tests/setup.ts` — mocks de DB, MQTT, TimescaleDB, HiveMQ
  - `server/mother/__tests__/core.test.ts` — testes do módulo core MOTHER
  - `server/shms/__tests__/shms-api.test.ts` — testes SHMS + ICOLD L1/L2/L3
- [x] **NC-003 [CRÍTICA]:** `server/mother/dgm-cycle3.ts` — DGM MCC stopping criterion (arXiv:2505.22954)
- [x] **NC-004 [CRÍTICA]:** `server/shms/mqtt-bridge.ts` — MQTT bridge real com alertas ICOLD (ICOLD 158 §4.3)
- [x] **NC-006 [ALTA]:** `server/_core/rate-limiter.ts` — Rate limiting 100/1000 req/min (OWASP API4:2023)
- [x] **NC-007 [ALTA]:** `server/_core/structured-logger.ts` — Structured logging (OpenTelemetry CNCF 2023)
- [x] **SHMS SQL:** `drizzle/migrations/001_shms_timescaledb_conselho.sql`
- [x] **BD MOTHER:** 10 registros C194-Conselho injetados
- [x] **GitHub PR #2:** sprint1/nc-001-004-conselho-6-ias
- [x] **AWAKE V275:** Gerado com R34-R37 + PASSO 14

### Sprint 1 Complemento — C195 ✅ CONCLUÍDO
- [x] **C195-CORS:** CORS wildcard completamente removido de `production-entry.ts` e `shms-api.ts`
  - Zero wildcards `Access-Control-Allow-Origin: *` em todo o codebase
  - `corsConfig` middleware aplicado no startup (linha 190 de `production-entry.ts`)
  - Base científica: OWASP A01:2021 — Broken Access Control
- [x] **AWAKE V276:** Gerado com R38 (PRÉ-PRODUÇÃO OFICIAL) + PASSO 15 + 15 passos de inicialização
- [x] **TODO V23:** Criado com roadmap limpo (apenas tarefas do Conselho)
- [x] **BD MOTHER:** Registros C195 injetados (R38, CORS completo, Sprint 2 ativo)

---

## TAREFAS PENDENTES (Sprint 2-5)

### Sprint 2 (Mar Semanas 3-4 — C195) — Conselho dos 6 IAs 🔄 ATIVO

> **R38:** Todos os testes e integrações usam dados **sintéticos calibrados** (GISTM 2020 + ICOLD 158). Não há dados reais de sensores — este é o estado correto para pré-produção.

- [ ] **C195-1 [ALTA]:** Testes de integração MQTT→TimescaleDB com dados sintéticos
  - Injetar leituras sintéticas via MQTT e verificar hypertables `shms_ts_sensor_readings`
  - Validar pipeline completo: MQTT → sensor-validator → TimescaleDB
  - Dados: sintéticos calibrados conforme GISTM 2020 thresholds (R38)
  - Base científica: ISO/IEC 25010:2011 — software quality testing; IEEE 829-2008

- [ ] **C195-2 [ALTA]:** DGM Sprint 13 — benchmark comparativo
  - Benchmark antes/depois Sprint 12 autoMerge
  - Gerar relatório de melhoria de fitness com métricas HELM
  - Base científica: HELM (Liang et al., arXiv:2211.09110)

- [ ] **C195-3 [MÉDIA]:** Endpoint `GET /api/shms/v2/alerts/:structureId`
  - Listar alertas históricos do TimescaleDB (`shms_ts_alerts`)
  - Filtros: `?level=YELLOW|RED&hours=24`
  - Base científica: ICOLD Bulletin 158 — análise histórica de alertas

- [ ] **C195-4 [MÉDIA]:** Documentação técnica SHMS API v2 (OpenAPI/Swagger)
  - Documentar todos os endpoints v2 com exemplos
  - Validar com `openapi-spec-validator` (R25)
  - Base científica: Roy Fielding (2000) REST + ISO/IEC 25010:2011

### Sprint 3 (Abr Semanas 5-8 — C196) — Conselho dos 6 IAs

- [ ] **C196-1 [CRÍTICA]:** Score de Maturidade ≥ 85/100 (alvo Sprint 3)
  - Implementar testes automatizados (vitest) para SHMS pipeline completo
  - Cobertura: mqtt-timescale-bridge, sensor-validator, notification-service
  - Base científica: ISO/IEC 25010:2011 — software quality

- [ ] **C196-2 [ALTA]:** Redis Cache para SHMS Real-Time (<100ms)
  - Implementar Redis como camada de cache para queries SHMS
  - Votação 1 do Conselho: CONSENSO UNÂNIME 5/5
  - Base científica: Dean & Barroso (2013) — tail latency SLA

- [ ] **C196-3 [ALTA]:** HippoRAG2 — indexar papers C193-C196
  - Indexar novos papers no corpus científico (Sun 2025, ICOLD 158 updates)
  - Base científica: Gutierrez et al. (2025) arXiv:2405.14831v2

- [ ] **C196-4 [MÉDIA]:** DGM Sprint 14 — auto-PR com revisão científica
  - Gerar PR automático com referências científicas no corpo
  - Base científica: Darwin Gödel Machine (arXiv:2505.22954)

### Sprint 4 (Mai Semanas 9-12 — C197) — Conselho dos 6 IAs

- [ ] **C197-1 [CRÍTICA]:** DGM Autônomo — ciclo completo sem intervenção humana
  - Proposta → branch → PR → merge → deploy → validação → aprendizado
  - Integrar dgm-cycle3.ts MCC com dgm-orchestrator.ts autoMerge
  - Base científica: Darwin Gödel Machine (arXiv:2505.22954)

- [ ] **C197-2 [CRÍTICA]:** Curriculum Learning para SHMS
  - Implementar curriculum progressivo: dados sintéticos → dados reais (quando autorizado)
  - Votação 2 do Conselho: DPO + Constitutional AI (MAIORIA 3/5)
  - Base científica: Bengio et al. (2009) — Curriculum Learning

- [ ] **C197-3 [ALTA]:** Fine-tuning DPO com dados geotécnicos
  - Dataset: leituras ICOLD sintéticas + análises MOTHER + feedback do proprietário
  - Base científica: Rafailov et al. (2023) — DPO arXiv:2305.18290

### Sprint 5 (Jun Semanas 13-16 — C198) — Conselho dos 6 IAs

- [ ] **C198-1 [CRÍTICA]:** Score de Maturidade ≥ 90/100 (alvo final — threshold R33)
  - Integração completa de todos os módulos Sprint 1-4
  - Validação final pelo proprietário Everton Garcia
  - Base científica: ISO/IEC 25010:2011 — software quality

- [ ] **C198-2 [CRÍTICA]:** Integração Final SHMS + DGM + Aprendizado
  - Pipeline completo: Sensor → MQTT → TimescaleDB → LSTM → MOTHER → Alerta
  - DGM autônomo com curriculum learning ativo
  - Base científica: Sun et al. (2025) + Darwin Gödel Machine

- [ ] **C198-3 [ALTA]:** GRPO Fine-tuning (Sprint 5 — Votação 2 reservado)
  - Implementar GRPO após DPO estar estável
  - Base científica: DeepSeek R1 (2025) — GRPO

### Módulos DEMO-ONLY (NÃO conectar até Score ≥ 90/100 — R33)

> **ATENÇÃO:** Os itens abaixo são DEMO-ONLY por diretriz do proprietário (Everton Garcia, Wizards Down Under). Score atual: **77/100**. Threshold R33: 90/100. Diferença: **13 pontos**. Estimativa: Ciclo 198+ (Sprint 5).

- [ ] **DEMO-ONLY C198+:** Conectar `multi-tenant-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
- [ ] **DEMO-ONLY C198+:** Conectar `stripe-billing-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
- [ ] **DEMO-ONLY C198+:** Conectar `sla-monitor-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
- [ ] **DEMO-ONLY C198+:** Conectar `tenant-isolation.ts` (Score ≥ 90/100 + aprovação proprietário)
- [ ] **DEMO-ONLY C198+:** Conectar `billing-integration.ts` (Score ≥ 90/100 + aprovação proprietário)

---

## SCORE DE MATURIDADE

| Ciclo | Score | Incremento | Evento Principal |
|-------|-------|-----------|-----------------|
| C188 (baseline) | 30.4/100 | — | Conselho C188 diagnóstico |
| C189 | ~45/100 | +14.6 | sensor-validator, NC-ARCH-002 parcial |
| C190 | ~52/100 | +7 | NC-ARCH-002 completo, lora-trainer ativo |
| C191 | ~58/100 | +6 | TimescaleDB init, MQTT bridge, deploy-validator |
| C192 | ~63/100 | +5 | DGM autoMerge, deploy-validator conectado, R33 corrigido |
| C193 | ~70/100 | +7 | HiveMQ Cloud ATIVO, TimescaleDB Cloud ATIVO, Sprint 11 |
| C194 | ~77/100 | +7 | MQTT→TimescaleDB pipeline, DGM Sprint 12 cron, notification-service.ts |
| **C194+S1** | **~77/100** | **0** | **Sprint 1 Conselho: NC-001 a NC-007 (score consolidado)** |
| **C195** | **~77/100** | **0** | **CORS completo (zero wildcards) + R38 + AWAKE V276 + TODO V23** |
| C195 Sprint 2 (alvo) | 82/100 | +5 | Testes integração sintéticos, DGM Sprint 13, endpoints alertas |
| C196 Sprint 3 (alvo) | 86/100 | +4 | SHMS Real + Redis Cache |
| C197 Sprint 4 (alvo) | 89/100 | +3 | DGM Autônomo + Curriculum Learning |
| C198 Sprint 5 (alvo) | **90/100** | **+1** | **Threshold R33 — módulos comerciais** |

---

**TODO-ROADMAP V23 — MOTHER v82.4 — Ciclo 195 + Sprint 2 ATIVO**
**R30: Apenas tarefas do Conselho C188/C194 | R33: DEMO-ONLY até Score ≥ 90/100 (atual: 77/100)**
**R34: Roadmap exclusivo do Conselho dos 6 IAs (Delphi + MAD — 3 Rodadas)**
**R38: PRÉ-PRODUÇÃO OFICIAL — Dados sintéticos — Sem sensores reais — NÃO É NC**
**Próximo: Sprint 2 (C195) — Mar S3-4 — NC-008 a NC-011**
**GitHub PR #2:** https://github.com/Ehrvi/mother-v7-improvements/pull/2
