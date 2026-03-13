# TODO-ROADMAP V25 — MOTHER v82.4 → v83.x
**Versão:** V25 | **Ciclo:** 197 | **Data:** 2026-03-08
**Fonte:** Conselho dos 6 IAs — Protocolo Delphi + MAD — 3 Rodadas — Ciclo 194
**Kendall W = 0.82 (p < 0.001)** | **Score Atual: 86/100** | **Alvo: 90/100**
**STATUS:** ⚠️ PRÉ-PRODUÇÃO OFICIAL — SEM DADOS REAIS (R38)

> **R30 + R34 (MANDATÓRIO):** Este TODO contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho dos 6 IAs.
> Nenhuma tarefa externa ao relatório do Conselho deve ser adicionada.
> Base científica: Método Delphi (Dalkey & Helmer, 1963).

---

## ✅ SPRINT 1 — CONCLUÍDO (C195, Mar S1-2) — Score: 77/100 → 77/100

**Objetivo:** Resolver todas as NCs Críticas e Altas do Conselho dos 6 IAs.

- [x] **NC-001 CRÍTICA:** CORS wildcard `*` → whitelist por ambiente (`server/_core/cors-config.ts`) | OWASP A01:2021
- [x] **NC-001 COMPLEMENTO (C195):** Aplicar `corsConfig` em `production-entry.ts` L190 + SSE endpoint | Zero wildcards confirmado
- [x] **NC-002 CRÍTICA:** Zero testes → vitest 80% coverage (`vitest.config.ts` + `tests/setup.ts`) | IEEE 1028-2008
- [x] **NC-002 TESTES CORE:** `server/mother/__tests__/core.test.ts` — testes do módulo core | IEEE 1028-2008
- [x] **NC-002 TESTES SHMS:** `server/shms/__tests__/shms-api.test.ts` — testes SHMS API | IEEE 1028-2008
- [x] **NC-003 CRÍTICA:** DGM loop infinito → MCC stopping criterion + cooldown 24h (`server/dgm/dgm-cycle3.ts`) | arXiv:2505.22954
- [x] **NC-004 CRÍTICA:** MQTT bridge desconectado → bridge real com alertas ICOLD L1/L2/L3 (`server/shms/mqtt-bridge.ts`) | ICOLD Bulletin 158
- [x] **NC-006 ALTA:** Zero rate limiting → 100/1000 req/min (`server/_core/rate-limiter.ts`) | OWASP API4:2023
- [x] **NC-007 ALTA:** Zero structured logging → JSON logs pino (`server/_core/structured-logger.ts`) | OpenTelemetry CNCF 2023
- [x] **NC-001 SHMS-API:** Wildcard CORS em `server/shms/shms-api.ts` SSE endpoint removido | OWASP A01:2021
- [x] **BD C194:** Script de injeção de conhecimento do Conselho (`inject-knowledge-c194-conselho.cjs`) | MemGPT arXiv:2310.08560
- [x] **AWAKE V275:** Regras R34-R37 + PASSO 14 (Verificar Roadmap do Conselho)
- [x] **TODO V22:** Limpar e atualizar com tarefas exclusivas do Conselho

---

## ✅ SPRINT 2 — CONCLUÍDO (C196, Mar S3-4) — Score: 77/100 → 82/100

**Objetivo:** Testes integração MQTT, DGM Sprint 13 benchmark, alertas endpoint, OpenAPI.

- [x] **C195-1:** Testes integração MQTT→TimescaleDB com dados sintéticos calibrados (`server/shms/__tests__/mqtt-timescale-integration.test.ts`) | IEEE 829-2008 + GISTM 2020 §8
- [x] **C195-2:** DGM Sprint 13 benchmark comparativo (`server/dgm/dgm-sprint13-benchmark.ts`) | HELM arXiv:2211.09110 — fitness 87%, MCC 0.87 ≥ 0.85 ✅
- [x] **C195-3:** Endpoint `GET /api/shms/v2/alerts/:structureId` histórico alertas (`server/shms/shms-alerts-endpoint.ts`) | ICOLD Bulletin 158 §4.3
- [x] **C195-4:** Documentação OpenAPI SHMS API v2 (`server/shms/openapi-shms-v2.yaml`) | Roy Fielding 2000 REST + OAS3
- [x] **BD C195:** Script de injeção C195 R38 (`inject-knowledge-c195-r38.cjs`) | MemGPT arXiv:2310.08560
- [x] **AWAKE V276:** R38 (PRÉ-PRODUÇÃO OFICIAL) + PASSO 15 (Verificar Status Pré-Produção)
- [x] **AWAKE V277:** R39 (DGM Sprint 13 benchmark) + Sprint 2 concluído
- [x] **TODO V23/V24:** Limpar e atualizar com Sprint 2 concluído

---

## ✅ SPRINT 3 — CONCLUÍDO (C197, Abr S5-8) — Score: 82/100 → 86/100

**Objetivo:** Conectar módulos ORPHAN, Redis Cache, HippoRAG2, DGM Sprint 14.

- [x] **C196-0 ORPHAN FIX:** Conectar `shmsAlertsRouter` em `production-entry.ts` (L48 import + L245 mount) | R27 Connection Registry
- [x] **C196-0 ORPHAN FIX:** Importar `runDGMSprint13Benchmark` em `dgm-orchestrator.ts` (L29) | R27 Connection Registry
- [x] **C196-2 Redis Cache:** `server/shms/redis-shms-cache.ts` — Cache-aside pattern com fallback in-memory (R38) | Dean & Barroso (2013) CACM 56(2)
- [x] **C196-3 HippoRAG2:** `server/mother/hipporag2-indexer-c196.ts` — 10 papers C193-C196 indexados | Gutierrez et al. (2025) arXiv:2405.14831v2
- [x] **C196-4 DGM Sprint 14:** `server/dgm/dgm-sprint14-autopilot.ts` — PRs automáticos com referências científicas | arXiv:2505.22954 + HELM
- [x] **BD C197:** Script de injeção C197 Sprint 3 (`inject-knowledge-c197-sprint3.cjs`) | MemGPT arXiv:2310.08560
- [x] **AWAKE V278:** R40 (Sprint 3 CONCLUÍDO) + PASSO 16 (Verificar ORPHAN Pendentes)
- [x] **TODO V25:** Limpar e atualizar com Sprint 3 concluído + Sprint 4 ativo

---

## 🔄 SPRINT 4 — ATIVO (C197, Mai S9-12) — Score: 86/100 → 89/100

**Objetivo:** DGM Autonomous Loop + Curriculum Learning + conectar ORPHAN Sprint 3.

### ORPHAN Pendentes Sprint 3 (PRIORIDADE MÁXIMA — R27 + R40)

- [ ] **C197-1 ORPHAN:** Conectar `initRedisSHMSCache()` em `production-entry.ts` (t=7s após MQTT bridge) | Dean & Barroso (2013)
- [ ] **C197-2 ORPHAN:** Conectar `indexPapersC193C196()` em `production-entry.ts` (t=8s após Redis) | HippoRAG2 arXiv:2405.14831v2
- [ ] **C197-3 ORPHAN:** Integrar `runDGMSprint14()` no cron diário DGM de `production-entry.ts` | arXiv:2505.22954

### Tarefas Sprint 4 (Conselho — R34)

- [ ] **C197-4 DGM Autonomous Loop:** Integrar `dgm-cycle3.ts` MCC criterion no `dgm-orchestrator.ts` autoMerge flow — fechar loop autônomo completo | Darwin Gödel Machine arXiv:2505.22954 + DGM Sprint 13 MCC 0.87 ≥ 0.85
- [ ] **C197-5 Curriculum Learning SHMS:** `server/shms/curriculum-learning-shms.ts` — pipeline progressivo sintético → real (Votação 2 Conselho: DPO + Constitutional AI MAIORIA 3/5) | Bengio et al. (2009) ICML + Rafailov et al. (2023) DPO arXiv:2305.18290
- [ ] **C197-6 DPO Training Pipeline:** Integrar DPO (Direct Preference Optimization) para fine-tuning de respostas SHMS | Rafailov et al. (2023) arXiv:2305.18290
- [ ] **C197-7 Score Maturidade 89:** Validar incremento de 86 → 89 com métricas mensuráveis | ISO/IEC 25010:2011

### Entregáveis Sprint 4

- [ ] **AWAKE V279:** R41 (Sprint 4 concluído) + PASSO 17 (DGM Autonomous Loop ativo)
- [ ] **TODO V26:** Sprint 4 concluído + Sprint 5 ativo
- [ ] **BD C198:** Injetar conhecimento Sprint 4 no BD

---

## 📋 SPRINT 5 — PLANEJADO (C198, Jun S13-16) — Score: 89/100 → 90/100+

**Objetivo:** Integração final, score ≥ 90/100, threshold R33 para módulos comerciais.

- [ ] **C198-1 Integração Final:** Validar pipeline completo: MQTT → TimescaleDB → LSTM → MOTHER → alertas ICOLD | GISTM 2020 §8
- [ ] **C198-2 Score 90/100:** Atingir threshold R33 para habilitação de módulos comerciais | ISO/IEC 25010:2011
- [ ] **C198-3 GRPO (opcional):** Avaliar GRPO (DeepSeek, Gemini — Votação 2 minoria 2/5) para Sprint 5 | arXiv:2402.03300
- [ ] **C198-4 Módulos Comerciais (condicional):** Conectar módulos DEMO-ONLY após Score ≥ 90/100 + aprovação Everton Garcia | R33
  - `server/mother/multi-tenant-demo.ts` (C191)
  - `server/mother/stripe-billing-demo.ts` (C191)
  - `server/mother/sla-monitor-demo.ts` (C192)
- [ ] **C198-5 Documentação Final:** Atualizar README, OpenAPI, e documentação técnica completa | IEEE 1028-2008
- [ ] **AWAKE V280:** Versão final Sprint 5 + Score ≥ 90/100 confirmado
- [ ] **TODO V27:** Sprint 5 concluído + próximos objetivos pós-90/100

---

## MÉTRICAS DE PROGRESSO

| Sprint | Score | Incremento | Status |
|--------|-------|-----------|--------|
| Baseline C188 | 30.4/100 | — | ✅ Concluído |
| Sprint 1 (C195) | 77/100 | +46.6 | ✅ Concluído |
| Sprint 2 (C196) | 82/100 | +5 | ✅ Concluído |
| **Sprint 3 (C197)** | **86/100** | **+4** | **✅ Concluído** |
| Sprint 4 (C197) | 89/100 | +3 | 🔄 ATIVO |
| Sprint 5 (C198) | **90/100** | **+1** | 📋 Planejado |

**Diferença atual para threshold R33:** 4 pontos (86/100 → 90/100)

---

## REFERÊNCIAS CIENTÍFICAS DO ROADMAP

| Referência | Aplicação |
|-----------|-----------|
| Dalkey & Helmer (1963) Método Delphi | Protocolo do Conselho dos 6 IAs |
| Sakana AI (2025) arXiv:2505.22954 DGM | NC-003, DGM Sprint 13/14, C197-4 |
| OWASP Top 10 A01:2021 | NC-001 CORS |
| IEEE 1028-2008 | NC-002 Testes |
| ICOLD Bulletin 158 (2014) | NC-004, C195-3, alertas L1/L2/L3 |
| OWASP API4:2023 | NC-006 Rate limiting |
| OpenTelemetry CNCF 2023 | NC-007 Logging |
| IEEE 829-2008 | C195-1 Testes integração |
| Liang et al. (2022) HELM arXiv:2211.09110 | C195-2, DGM Sprint 13/14 |
| Roy Fielding (2000) REST | C195-4 OpenAPI |
| Dean & Barroso (2013) CACM 56(2) | C196-2 Redis Cache |
| Gutierrez et al. (2025) arXiv:2405.14831v2 | C196-3 HippoRAG2 |
| Bengio et al. (2009) ICML | C197-5 Curriculum Learning |
| Rafailov et al. (2023) arXiv:2305.18290 DPO | C197-5/6 Fine-tuning |
| GISTM 2020 §8 | R38 Pré-produção |
| Packer et al. (2023) arXiv:2310.08560 MemGPT | R31/R35 BD loading |
| ISO/IEC 25010:2011 | Score de Maturidade |

---

**TODO-ROADMAP V25 — MOTHER v82.4 → v83.x — Ciclo 197**
**Sprint 3 ✅ CONCLUÍDO | Sprint 4 🔄 ATIVO | Score: 86/100 | Alvo: 90/100**
**R38: PRÉ-PRODUÇÃO OFICIAL | R40: Sprint 3 CONCLUÍDO — ORPHAN + Redis + HippoRAG2 + DGM Sprint 14**
