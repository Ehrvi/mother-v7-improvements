# TODO-ROADMAP V20 — MOTHER v82.3 → v83.x
**Versão:** TODO-ROADMAP V20
**Sistema:** MOTHER v82.3
**Ciclo:** 193 — Phase 7 Semanas 3-4 (Concluída)
**Data:** 2026-03-08
**Anterior:** TODO V19 (Ciclo 192 — Phase 7 S1-2)
**Regra R30:** Este TODO contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho C188 (Seções 9.2-9.5). Base científica: Método Delphi (Dalkey & Helmer, 1963).
**Regra R33:** Módulos comerciais = DEMO-ONLY até Score ≥ 90/100. Score atual: 70/100.

---

## TAREFAS CONCLUÍDAS (C189-C193)

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
- [x] **C193-1:** HiveMQ Cloud ATIVO — `MQTT_BROKER_URL` configurado no Cloud Run (revisão 00684-bht)
- [x] **C193-2:** TimescaleDB Cloud ATIVO — `TIMESCALE_DB_URL` configurado no Cloud Run
- [x] `timescale-pg-client.ts` criado — pool PostgreSQL dedicado + 3 hypertables
- [x] `mqtt-connector.ts` atualizado — usa broker MQTT real (HiveMQ) com fallback
- [x] **C193-3:** DGM Sprint 11 benchmark pós-autoMerge em `dgm-orchestrator.ts`
- [x] **C193-4:** Dashboard escalado: 5 estruturas (`STRUCTURE_001-005`)
- [x] BD MOTHER: 8 registros C193 injetados (TiDB Cloud)

---

## TAREFAS PENDENTES (C194+)

### Phase 7 Semanas 5-6 (C194) — Conselho C188 Seção 9.4

- [ ] **C194-1:** Script de ingestão MQTT → TimescaleDB
  - Subscrever tópicos `shms/+/sensor/+` → inserir em `shms_ts_sensor_readings`
  - Usar `insertSensorReading()` de `timescale-pg-client.ts`
  - Base científica: Sun et al. (2025) DOI:10.1145/3777730.3777858

- [ ] **C194-2:** Endpoint histórico de séries temporais
  - `GET /api/shms/v2/history/:structureId?hours=24`
  - Usa `queryRecentReadings()` de `timescale-pg-client.ts`
  - Adicionar em `shms-router.ts`
  - Base científica: ICOLD Bulletin 158 (2014) — análise histórica de dados de sensores

- [ ] **C194-3:** DGM Sprint 12 — ciclo autônomo agendado
  - Agendar `runDGMCycle()` automaticamente 1x/dia (cron diário)
  - Adicionar em `production-entry.ts` startup
  - Base científica: Darwin Gödel Machine (arXiv:2505.22954) — continuous self-improvement

- [ ] **C194-4:** Conectar `sensor-validator.ts` ao pipeline MQTT
  - Validar leituras antes de inserir no TimescaleDB
  - Integrar `validateSensorReading()` no fluxo MQTT → TimescaleDB
  - Base científica: GISTM 2020 Seção 7 — validação de dados de sensores

- [ ] **C194-5:** `notification-service.ts` — alertas ICOLD
  - Trigger: sensor YELLOW ou RED → notificação por email/webhook
  - Criar `server/mother/notification-service.ts`
  - Base científica: ICOLD Bulletin 158 — sistema de alarme 3 níveis

### Phase 8 (C195+) — Conselho C188 Seção 9.5

- [ ] **C195-1:** Score de Maturidade ≥ 80/100 (alvo Phase 8)
  - Implementar testes automatizados (vitest) para SHMS pipeline
  - Base científica: ISO/IEC 25010:2011 — software quality

- [ ] **C195-2:** DGM Sprint 13 — auto-PR com revisão científica
  - Gerar PR automático com referências científicas no corpo
  - Base científica: Darwin Gödel Machine (arXiv:2505.22954)

- [ ] **C195-3:** HippoRAG2 — indexar papers C193-C195
  - Indexar novos papers no corpus científico
  - Base científica: Gutierrez et al. (2025) arXiv:2405.14831v2

### Módulos DEMO-ONLY (NÃO conectar até Score ≥ 90/100 — R33)

> **ATENÇÃO:** Os itens abaixo são DEMO-ONLY por diretriz do proprietário (Everton Garcia, Wizards Down Under). Score atual: 70/100. Threshold R33: 90/100. Diferença: 20 pontos. Estimativa: Ciclo 200+.

- [ ] **DEMO-ONLY C200+:** Conectar `multi-tenant-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
  - 3 tenants: IntellTech, Fortescue, Cliente Piloto
  - Base científica: Conselho C188 Seção 9.4

- [ ] **DEMO-ONLY C200+:** Conectar `stripe-billing-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
  - Planos: Starter R$150/sensor, Professional R$120/sensor, Enterprise R$90/sensor
  - Base científica: Conselho C188 Seção 9.4

- [ ] **DEMO-ONLY C200+:** Conectar `sla-monitor-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
  - SLA 99.9% uptime monitoring
  - Base científica: ISO/IEC 20000-1:2018 + Google SRE Book

- [ ] **DEMO-ONLY C200+:** Conectar `tenant-isolation.ts` (Score ≥ 90/100 + aprovação proprietário)
  - Isolamento MQTT/API por tenant
  - Base científica: Conselho C188 Seção 9.4 (C127 — aguardando)

- [ ] **DEMO-ONLY C200+:** Conectar `billing-integration.ts` (Score ≥ 90/100 + aprovação proprietário)
  - Usage-based billing
  - Base científica: Conselho C188 Seção 9.4 (C129 — aguardando)

---

## SCORE DE MATURIDADE

| Ciclo | Score | Incremento | Evento Principal |
|-------|-------|-----------|-----------------|
| C188 (baseline) | 30.4/100 | — | Conselho C188 diagnóstico |
| C189 | ~45/100 | +14.6 | sensor-validator, NC-ARCH-002 parcial |
| C190 | ~52/100 | +7 | NC-ARCH-002 completo, lora-trainer ativo |
| C191 | ~58/100 | +6 | TimescaleDB init, MQTT bridge, deploy-validator |
| C192 | ~63/100 | +5 | DGM autoMerge, deploy-validator conectado, R33 corrigido |
| **C193** | **~70/100** | **+7** | **HiveMQ Cloud ATIVO, TimescaleDB Cloud ATIVO, Sprint 11** |
| C195 (alvo) | 80/100 | +10 | Testes automatizados, DGM Sprint 13 |
| C200+ (alvo) | **90/100** | +10 | **Threshold R33 — módulos comerciais** |

---

**TODO-ROADMAP V20 — MOTHER v82.3 — Ciclo 193 — Phase 7 Semanas 3-4 Concluídas**
**R30: Apenas tarefas do Conselho C188 | R33: DEMO-ONLY até Score ≥ 90/100 (atual: 70/100)**
**Próximo ciclo: C194 — Phase 7 S5-6 — Script MQTT→TimescaleDB + DGM Sprint 12**
