# TODO-ROADMAP V21 — MOTHER v82.4 → v83.x
**Versão:** TODO-ROADMAP V21
**Sistema:** MOTHER v82.4
**Ciclo:** 194 — Phase 7 Semanas 5-6 (Concluída)
**Data:** 2026-03-08
**Anterior:** TODO V20 (Ciclo 193 — Phase 7 S3-4)
**Regra R30:** Este TODO contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho C188 (Seções 9.2-9.5). Base científica: Método Delphi (Dalkey & Helmer, 1963).
**Regra R33:** Módulos comerciais = DEMO-ONLY até Score ≥ 90/100. Score atual: **77/100**.

---

## TAREFAS CONCLUÍDAS (C189-C194)

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

### Phase 7 Semanas 5-6 (C194) — Conselho C188 Seção 9.4 ✅ CONCLUÍDA
- [x] **C194-1:** `mqtt-timescale-bridge.ts` — pipeline MQTT→sensor-validator→TimescaleDB
  - Subscreve `shms/+/sensor/+` → valida com `validateSensorReading()` → insere em `shms_ts_sensor_readings`
  - Buffer 5s/50 leituras para batch insert eficiente
  - Base científica: Sun et al. (2025) DOI:10.1145/3777730.3777858
- [x] **C194-2:** Endpoint histórico `GET /api/shms/v2/history/:structureId?hours=24`
  - Usa `queryRecentReadings()` de `timescale-pg-client.ts`
  - Adicionado em `shms-router.ts` + endpoint `/bridge/stats`
  - Base científica: ICOLD Bulletin 158 (2014)
- [x] **C194-3:** DGM Sprint 12 — cron diário autônomo
  - `setInterval(24h)` em `production-entry.ts` — primeiro ciclo em 10min
  - Base científica: Darwin Gödel Machine (arXiv:2505.22954)
- [x] **C194-4:** `sensor-validator.ts` integrado ao pipeline MQTT
  - `validateSensorReading()` chamado antes de inserção no TimescaleDB
  - Leituras inválidas logadas e descartadas
  - Base científica: GISTM 2020 Seção 7
- [x] **C194-5:** `notification-service.ts` — alertas ICOLD L2/L3
  - Trigger: sensor YELLOW ou RED → webhook + email
  - Deduplicação 5min para evitar spam
  - Base científica: ICOLD Bulletin 158 — sistema de alarme 3 níveis
- [x] BD MOTHER: 8 registros C194 injetados (TiDB Cloud)
- [x] AWAKE V274 gerado e sincronizado ao Google Drive
- [x] Deploy Cloud Run v82.4 — australia-southeast1

---

## TAREFAS PENDENTES (C195+)

### Phase 8 Semanas 1-2 (C195) — Conselho C188 Seção 9.5

- [ ] **C195-1:** Configurar env vars de notificação no Cloud Run
  - `NOTIFICATION_WEBHOOK_URL`, `NOTIFICATION_EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
  - Ativar `notification-service.ts` com credenciais reais de produção
  - Base científica: ICOLD Bulletin 158 — sistema de alarme operacional

- [ ] **C195-2:** Testes de integração MQTT→TimescaleDB
  - Injetar leituras sintéticas via MQTT e verificar hypertables
  - Validar `shms_ts_sensor_readings` e `shms_ts_alerts` com dados reais
  - Base científica: ISO/IEC 25010:2011 — software quality testing

- [ ] **C195-3:** DGM Sprint 13 — benchmark comparativo
  - Benchmark antes/depois Sprint 12 autoMerge
  - Gerar relatório de melhoria de fitness
  - Base científica: HELM (Liang et al., arXiv:2211.09110)

- [ ] **C195-4:** Endpoint `GET /api/shms/v2/alerts/:structureId`
  - Listar alertas históricos do TimescaleDB (`shms_ts_alerts`)
  - Filtros: `?level=YELLOW|RED&hours=24`
  - Base científica: ICOLD Bulletin 158 — análise histórica de alertas

- [ ] **C195-5:** Documentação técnica SHMS API v2 (OpenAPI/Swagger)
  - Documentar todos os endpoints v2 com exemplos
  - Validar com `openapi-spec-validator` (R25)
  - Base científica: Roy Fielding (2000) REST + ISO/IEC 25010:2011

### Phase 8 Semanas 3-4 (C196) — Conselho C188 Seção 9.5

- [ ] **C196-1:** Score de Maturidade ≥ 85/100 (alvo Phase 8)
  - Implementar testes automatizados (vitest) para SHMS pipeline completo
  - Cobertura: mqtt-timescale-bridge, sensor-validator, notification-service
  - Base científica: ISO/IEC 25010:2011 — software quality

- [ ] **C196-2:** HippoRAG2 — indexar papers C193-C196
  - Indexar novos papers no corpus científico (Sun 2025, ICOLD 158 updates)
  - Base científica: Gutierrez et al. (2025) arXiv:2405.14831v2

- [ ] **C196-3:** DGM Sprint 14 — auto-PR com revisão científica
  - Gerar PR automático com referências científicas no corpo
  - Base científica: Darwin Gödel Machine (arXiv:2505.22954)

### Módulos DEMO-ONLY (NÃO conectar até Score ≥ 90/100 — R33)

> **ATENÇÃO:** Os itens abaixo são DEMO-ONLY por diretriz do proprietário (Everton Garcia, Wizards Down Under). Score atual: **77/100**. Threshold R33: 90/100. Diferença: **13 pontos**. Estimativa: Ciclo 198+.

- [ ] **DEMO-ONLY C198+:** Conectar `multi-tenant-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
  - 3 tenants: IntellTech, Fortescue, Cliente Piloto
  - Base científica: Conselho C188 Seção 9.4

- [ ] **DEMO-ONLY C198+:** Conectar `stripe-billing-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
  - Planos: Starter R$150/sensor, Professional R$120/sensor, Enterprise R$90/sensor
  - Base científica: Conselho C188 Seção 9.4

- [ ] **DEMO-ONLY C198+:** Conectar `sla-monitor-demo.ts` (Score ≥ 90/100 + aprovação proprietário)
  - SLA 99.9% uptime monitoring
  - Base científica: ISO/IEC 20000-1:2018 + Google SRE Book

- [ ] **DEMO-ONLY C198+:** Conectar `tenant-isolation.ts` (Score ≥ 90/100 + aprovação proprietário)
  - Isolamento MQTT/API por tenant
  - Base científica: Conselho C188 Seção 9.4 (C127 — aguardando)

- [ ] **DEMO-ONLY C198+:** Conectar `billing-integration.ts` (Score ≥ 90/100 + aprovação proprietário)
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
| C193 | ~70/100 | +7 | HiveMQ Cloud ATIVO, TimescaleDB Cloud ATIVO, Sprint 11 |
| **C194** | **~77/100** | **+7** | **MQTT→TimescaleDB pipeline, DGM Sprint 12 cron, notification-service.ts** |
| C196 (alvo) | 85/100 | +8 | Testes automatizados, DGM Sprint 13, OpenAPI docs |
| C198+ (alvo) | **90/100** | +5 | **Threshold R33 — módulos comerciais** |

---

**TODO-ROADMAP V21 — MOTHER v82.4 — Ciclo 194 — Phase 7 Semanas 5-6 Concluídas**
**R30: Apenas tarefas do Conselho C188 | R33: DEMO-ONLY até Score ≥ 90/100 (atual: 77/100)**
**Próximo ciclo: C195 — Phase 8 S1-2 — Configurar notificações + testes integração MQTT + DGM Sprint 13**
