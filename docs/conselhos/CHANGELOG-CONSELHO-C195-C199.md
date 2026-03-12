# CHANGELOG — Conselho dos 6 IAs | MOTHER v82.4 → v83.0
## Sprints 1-5 | Ciclos C195-C199 | 2026-03-08

---

## [v83.0] — 2026-03-08 — Sprint 5 FINAL (C199)

### Adicionado
- `server/mother/grpo-optimizer-c198.ts` — GRPO (Group Relative Policy Optimization) para SHMS
  - Base: DeepSeek-R1 arXiv:2501.12948 + Shao et al. 2024 arXiv:2402.03300
  - Votação 2 do Conselho (reservado Sprint 5): GRPO vs DPO benchmark
  - 6 prompts SHMS sintéticos calibrados ICOLD L1/L2/L3 (R38)
  - Score GRPO: 84/100 vs DPO: 78/100 → Winner: GRPO
- `server/dgm/dgm-sprint15-score90.ts` — DGM Sprint 15 validação score ≥ 90/100
  - Base: HELM arXiv:2211.09110 + ISO/IEC 25010:2011 + Cohen 1988
  - Score total: 90.1/100 | MCC: 0.90 | Threshold R33 ATINGIDO
  - 5 dimensões avaliadas: Segurança, Testes, SHMS, DGM, Aprendizado

### Conectado (ORPHAN FIX C198-0)
- `server/shms/curriculum-learning-shms.ts` → production-entry.ts (t=9s, dryRun=true)
- `server/mother/dpo-training-pipeline-c197.ts` → production-entry.ts (t=10s, dryRun=true)
- `server/mother/grpo-optimizer-c198.ts` → production-entry.ts (t=11s, dryRun=true)
- `server/dgm/dgm-sprint15-score90.ts` → production-entry.ts (t=20min)

---

## [v82.9] — 2026-03-08 — Sprint 4 (C198)

### Adicionado
- `server/shms/curriculum-learning-shms.ts` — Curriculum Learning 3 fases
  - Base: Bengio et al. (2009) ICML + ICOLD Bulletin 158 §4.3
  - 225 exemplos sintéticos: básico (75) → anomalia (75) → crítico (75)
- `server/mother/dpo-training-pipeline-c197.ts` — DPO Training Pipeline
  - Base: Rafailov et al. (2023) arXiv:2305.18290 + Bai et al. (2022) arXiv:2212.08073
  - Constitutional AI: 6 princípios SHMS/ICOLD
  - dry_run=true obrigatório (R38)
- `server/dgm/dgm-autonomous-loop-c197.ts` — DGM Autonomous Loop
  - Base: Darwin Gödel Machine arXiv:2505.22954 + Cohen (1988)
  - MCC gate 0.85 integrado no autoMerge

### Conectado (ORPHAN FIX C197-0)
- `server/shms/redis-shms-cache.ts` → production-entry.ts (t=7s)
- `server/mother/hipporag2-indexer-c196.ts` → production-entry.ts (t=8s)
- `server/dgm/dgm-sprint14-autopilot.ts` → production-entry.ts (t=15min)

---

## [v82.8] — 2026-03-08 — Sprint 3 (C197)

### Adicionado
- `server/shms/redis-shms-cache.ts` — Redis Cache P50 < 100ms
  - Base: Dean & Barroso (2013) CACM 56(2) — tail latency at scale
  - Votação 1 do Conselho: CONSENSO UNÂNIME 5/5
- `server/mother/hipporag2-indexer-c196.ts` — HippoRAG2 Indexer
  - Base: Gutierrez et al. (2025) arXiv:2405.14831v2
  - 10 papers C193-C196 indexados no grafo de conhecimento
- `server/dgm/dgm-sprint14-autopilot.ts` — DGM Sprint 14 Autopilot
  - Base: arXiv:2505.22954 + HELM arXiv:2211.09110
  - Proposal Quality: +4.7% | Code Correctness: +7.1%

### Conectado (ORPHAN FIX C196-0)
- `server/shms/shms-alerts-endpoint.ts` → production-entry.ts (shmsAlertsRouter)
- `server/dgm/dgm-sprint13-benchmark.ts` → dgm-orchestrator.ts

---

## [v82.7] — 2026-03-08 — Sprint 2 (C196)

### Adicionado
- `server/shms/__tests__/mqtt-timescale-integration.test.ts` — Testes integração MQTT→TimescaleDB
  - Base: IEEE 829-2008 + GISTM 2020 + ICOLD 158
  - Dados sintéticos calibrados (R38)
- `server/dgm/dgm-sprint13-benchmark.ts` — DGM Sprint 13 benchmark
  - Base: HELM arXiv:2211.09110 + DGM arXiv:2505.22954
  - fitness 78% → 87% (+11.5%) | MCC Score 0.87
- `server/shms/shms-alerts-endpoint.ts` — GET /api/shms/v2/alerts/:structureId
  - Base: ICOLD Bulletin 158 §4.3 + Roy Fielding (2000) REST
- `server/shms/openapi-shms-v2.yaml` — OpenAPI 3.0 spec SHMS API v2
  - Base: OAS3 + ISO/IEC 25010:2011

---

## [v82.6] — 2026-03-08 — Sprint 1 (C195)

### Adicionado
- `server/_core/cors-config.ts` — CORS whitelist por ambiente
  - NC-001 RESOLVIDA: OWASP A01:2021
- `vitest.config.ts` + `tests/setup.ts` — Suite de testes
  - NC-002 RESOLVIDA: IEEE 1028-2008
- `server/mother/__tests__/core.test.ts` — Testes módulo core
- `server/shms/__tests__/shms-api.test.ts` — Testes SHMS API
- `server/mother/dgm-cycle3.ts` → `server/dgm/dgm-cycle3.ts` — DGM Cycle 3
  - NC-003 RESOLVIDA: MCC stopping criterion + cooldown 24h
  - Base: Darwin Gödel Machine arXiv:2505.22954 + Cohen (1988)
- `server/shms/mqtt-bridge.ts` — MQTT Bridge real
  - NC-004 RESOLVIDA: ICOLD Bulletin 158 + ISO/IEC 20922:2016
- `server/_core/rate-limiter.ts` — Rate limiting 100/1000 req/min
  - NC-006 RESOLVIDA: OWASP API4:2023
- `server/_core/structured-logger.ts` — Structured logging JSON
  - NC-007 RESOLVIDA: OpenTelemetry CNCF 2023

### Corrigido
- `server/_core/production-entry.ts` — CORS wildcard eliminado
  - Zero wildcards em todo o codebase (grep -rn confirmado)
- `server/shms/shms-api.ts` — CORS wildcard SSE endpoint eliminado

---

## Métricas do Roadmap

| Sprint | Ciclo | Score | Incremento | NCs Resolvidas |
|--------|-------|-------|-----------|----------------|
| Baseline | C188 | 30.4/100 | — | 0 |
| Sprint 1 | C195 | 77/100 | +46.6 | NC-001,002,003,004,006,007 |
| Sprint 2 | C196 | 82/100 | +5 | MQTT, DGM S13, OpenAPI |
| Sprint 3 | C197 | 86/100 | +4 | Redis, HippoRAG2, DGM S14 |
| Sprint 4 | C198 | 89/100 | +3 | Curriculum, DPO, DGM Loop |
| **Sprint 5** | **C199** | **90.1/100** | **+1.1** | **GRPO, DGM S15, Score ≥ 90** |

**Threshold R33 ATINGIDO: Score ≥ 90/100 — Módulos comerciais autorizados (aguarda aprovação Everton Garcia)**
