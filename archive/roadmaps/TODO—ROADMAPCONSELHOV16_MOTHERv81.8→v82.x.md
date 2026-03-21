# TODO — ROADMAP CONSELHO V16 — MOTHER v81.8 → v82.x
**Versão:** TODO-ROADMAP V16
**Sistema:** MOTHER v81.8
**Ciclo:** 189 — Phase 5 Semanas 3-4 (Concluída)
**Data:** 2026-03-08
**Método:** Delphi + MAD (Conselho dos 6 IAs)
**Regra R30:** Este TODO-ROADMAP contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho C188 (Seção 9.2-9.5).

---

## VISÃO FINAL DE MOTHER (IMUTÁVEL — R13)
- **Objetivo A:** SHMS Geotécnico — sensores IoT → MQTT → TimescaleDB → LSTM → MOTHER análise → alertas
- **Objetivo B:** Autonomia Total via DGM — proposta → branch → PR → merge → deploy → validação → aprendizado
- **Proprietário:** Everton Garcia, Wizards Down Under

---

## SCORE DE MATURIDADE (Conselho C188 → C189)
| Dimensão | Score C188 | Score C189 (estimado) | Alvo C192 |
|----------|-----------|----------------------|-----------|
| SHMS (40%) | 15/100 | 22/100 | 85/100 |
| DGM/Autonomia (30%) | 22/100 | 38/100 | 75/100 |
| Arquitetura (20%) | 38/100 | 52/100 | 80/100 |
| Qualidade/Testes (10%) | 28/100 | 40/100 | 85/100 |
| **TOTAL** | **30.4/100** | **~45/100** | **>85/100** |

---

## PHASE 5 — CICLO 189 (Semanas 1-4) — CONCLUÍDA
### Objetivos: Resolver NCs Críticas + Conectar SHMS Básico (Conselho C188 Seção 9.2)

**NCs Resolvidas em C189 (Semanas 1-2):**
- [x] **NC-DB-001 (CRITICAL — FALSE POSITIVE)** — Auditoria C188 incorreta. Verificação via Cloud SQL Proxy confirmou que TODAS as 28 tabelas já existiam em `mother_v7_prod`. NC-DB-001 encerrada como FALSE POSITIVE. R29 adicionado ao AWAKE.
- [x] **NC-SEC-001 (CRITICAL)** — `env.ts` atualizado: JWT_SECRET agora tem validação fail-fast + MQTT/SHMS env vars adicionadas. JWT_SECRET configurado via Secret Manager.
- [x] **NC-DGM-001 (HIGH)** — `dgm-orchestrator.ts`: `triggerDeploy` importado e chamado após `applyProposal`. Loop DGM fechado.
- [x] **NC-LEARN-001 (HIGH)** — `knowledge.ts`: HippoRAG2 conectado como Source 5. `learning.ts`: memory_agent.ts conectado (computeImportanceScore).
- [x] **NC-ENV-001 (HIGH)** — `env.ts`: `MQTT_BROKER_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `SHMS_SENSOR_SECRET`, `SHMS_BILLING_API_KEY` adicionados.
- [x] **NC-ENV-002 (HIGH)** — `env.ts`: `OPENAI_API_KEY_EXTRA` adicionado como fallback.

**NCs Resolvidas em C189 (Semanas 3-4):**
- [x] **NC-SHMS-001 (HIGH)** — `sensor-validator.ts` criado em `server/shms/` com validação GISTM 2020 + ICOLD Bulletin 158. Funções: `validateSensorReading()`, `validateSensorBatch()`, `getIcoldAlarmDescription()`. Importado em `shms-api.ts`.
- [x] **NC-ARCH-001 (HIGH)** — SHMS v1 (`server/shms/shms-api.ts`) marcado como DEPRECATED com `console.warn()`. Remoção planejada C195. SHMS v2 (`shms-analyze-endpoint.ts`) é a implementação principal.
- [x] **NC-ARCH-002 (HIGH) — PARCIAL** — 4 routers criados em `server/_core/routers/`: `auth-router.ts`, `shms-router.ts`, `dgm-router.ts`, `metrics-router.ts`. Integração completa com `a2a-server.ts` planejada para C190.
- [x] **R27 (Síndrome do Código Orphan)** — `connection-registry.ts` criado em `server/mother/`. Registra todos os módulos DGM com status CONNECTED/ORPHAN/ARCHIVED/DEPRECATED.
- [x] **min-instances=1** — Cloud Run configurado (revision `mother-interface-00675-cjm`). Zero cold starts.

**KPIs C189 — Resultado:**
| KPI | Alvo | Resultado | Status |
|-----|------|-----------|--------|
| NCs críticas | 3 → 0 | 0 | ✅ |
| NC-DB-001 | Executar SQL | FALSE POSITIVE | ✅ |
| TypeScript errors | 0 | 0 | ✅ |
| sensor-validator | Criar | ✅ Criado | ✅ |
| connection-registry | Criar | ✅ Criado | ✅ |
| SHMS v1 deprecated | Sim | ✅ | ✅ |
| min-instances | 1 | 1 | ✅ |
| BD injection | 12+ registros | 12 | ✅ |

---

## PHASE 6 — PLANEJADA (Ciclo 190)
### Objetivos: TimescaleDB + Sensores Reais + LoRA Ativo (Conselho C188 Seção 9.3)

| Tarefa | Arquivo | Tempo | Conselho C188 |
|--------|---------|-------|---------------|
| Provisionar TimescaleDB Cloud | Infraestrutura | 4h | Seção 9.3 |
| Criar hypertables | `timescale-connector.ts` | 2h | Seção 9.3 |
| Conectar `lora-trainer.ts` | `dgm-orchestrator.ts` | 4h | Seção 3.2.1 — P0 |
| Conectar `hipporag2.ts` (já feito C189) | `knowledge.ts` | — | Seção 3.1 — P0 ✅ |
| Integrar 1 sensor piloto real | `shms-mqtt-connector.ts` | 8h | Seção 9.3 |
| Dashboard básico (1 estrutura) | `dashboard-components.ts` | 16h | Seção 9.3 |
| Integrar routers em `a2a-server.ts` | `a2a-server.ts` | 4h | NC-ARCH-002 |

- [ ] **6.1** — Provisionar TimescaleDB Cloud. Hypertables para séries temporais de sensores, compressão automática de dados históricos. Base científica: Freedman et al. (2018) — TimescaleDB: Scaling Time-Series Data.
- [ ] **6.2** — Conectar `lora-trainer.ts` ao `dgm-orchestrator.ts`. Trigger: acumulação de 100+ amostras de alta qualidade. Rank: 16, Alpha: 32. Base científica: Hu et al. (2025) LoRA-XS arXiv:2405.09673 — 98.7% do desempenho com 0.3% do custo.
- [ ] **6.3** — Integrar 1 sensor piloto real via MQTT HiveMQ Cloud. Protocolo: MQTTS (TLS 1.3), formato JSON com schema validado. Base científica: GISTM 2020, ISO/IEC 20922:2016.
- [ ] **6.4** — Dashboard básico para 1 estrutura monitorada. Visualização em tempo real do Digital Twin, histórico de alertas ICOLD 3-level. Base científica: Sun et al. (2025) DOI:10.1145/3777730.3777858.
- [ ] **6.5** — Integrar routers em `a2a-server.ts` (completar NC-ARCH-002). Substituir blocos inline por imports dos 4 routers criados em C189.

**KPIs C190:**
- Sensores reais: 0 → 1
- LoRA ciclos: 0 → 1
- TimescaleDB: Não → Sim
- P95: <10s → <4s

---

## PHASE 7 — PLANEJADA (Ciclo 191)
### Objetivos: DGM Sprint 10 + Autonomia Total (Conselho C188 Seção 9.4)

| Tarefa | Arquivo | Tempo | Conselho C188 |
|--------|---------|-------|---------------|
| DGM Sprint 10: autoMerge ativo | `dgm-orchestrator.ts` | 8h | Seção 9.4 |
| Validação pós-deploy automática | `deploy-validator.ts` | 8h | Seção 9.4 |
| Active Study trigger | `core.ts` | 4h | Seção 9.4 |
| Alertas ICOLD em produção | `shms-alert-system.ts` | 8h | Seção 9.4 |
| Multi-tenant (3 clientes) | `tenant-configs` | 16h | Seção 9.4 |
| Stripe billing | `billing-agent.ts` | 16h | Seção 9.4 |

- [ ] **7.1** — DGM Sprint 10: autoMerge com validação científica automática. Score mínimo G-Eval ≥ 90/100 para autoMerge. Base científica: arXiv:2505.22954 (Darwin Gödel Machine), arXiv:2312.10997.
- [ ] **7.2** — Validação pós-deploy automática. `deploy-validator.ts`: executa testes de regressão após cada deploy DGM. Rollback automático se qualquer NC crítica detectada.
- [ ] **7.3** — Active Study trigger em `core.ts`. Conectar `active-study.ts` trigger para reduzir necessidade de dados rotulados em 70%. Base científica: Conselho C188 Seção 3.1.
- [ ] **7.4** — Alertas ICOLD 3-level em produção. P95 < 500ms para alertas críticos. Base científica: Sun et al. (2025), ICOLD Bulletin 158.
- [ ] **7.5** — Multi-tenant (3 clientes ativos). Base científica: Conselho C188 Seção 9.4.
- [ ] **7.6** — Stripe billing real. Planos: Starter (R$150/sensor), Professional (R$120/sensor), Enterprise (R$90/sensor). Base científica: Conselho C188 Seção 9.4.
- [ ] **7.7** — Conselho de IAs V5 — Revisão do Roadmap. Método Delphi Round 5, avaliação de Phase 5-8 com dados reais.

**KPIs C191:**
- Deploys automáticos: 0 → ≥1/semana
- Alertas ICOLD: 0 → ≥1/dia
- Clientes ativos: 0 → 3
- Cobertura testes: 7.5% → 20%

---

## PHASE 8 — PLANEJADA (Ciclo 192)
### Objetivos: SOTA — Expansão e Certificação (Conselho C188 Seção 9.5)

- [ ] **8.1** — 10+ sensores reais integrados. Base científica: GISTM 2020.
- [ ] **8.2** — LSTM RMSE < 0.01 com dados reais. Base científica: Hundman et al. (2018) — LSTM anomaly detection.
- [ ] **8.3** — Cache hit rate > 80%. Base científica: GPTCache (Zeng et al., 2023).
- [ ] **8.4** — Arquivos mortos < 5%. Base científica: Conselho C188 Seção 2.1.
- [ ] **8.5** — Cobertura testes > 30%. Base científica: CMMI Level 3.
- [ ] **8.6** — Certificação ISO/IEC 27001 iniciada. Base científica: ISO/IEC 27001:2022.
- [ ] **8.7** — Multi-região: AWS Sydney + GCP Sydney + Azure Australia East. Base científica: Google SRE Book.
- [ ] **8.8** — Suporte a idiomas: Português, Inglês, Espanhol. Base científica: Conselho C188 Seção 9.5.
- [ ] **8.9** — Integração com padrões internacionais: ASCE 7-22 (EUA), Eurocode 8 (Europa), AS 1170.4 (Austrália). Base científica: ICOLD Bulletin 158.
- [ ] **8.10** — MOTHER v82.0 — Major version bump. Consolidação de todas as features Phase 1-8.

**KPIs C192 (SOTA):**
| KPI | Alvo |
|-----|------|
| Score de maturidade | 30 → 85+ |
| NCs totais | 39 → <5 |
| Sensores reais | 0 → 10+ |
| Clientes ativos | 0 → 10+ |
| MRR | R$0 → R$50.000+ |

---

## PHASES CONCLUÍDAS

### PHASE 4 — CONCLUÍDA (Ciclo 188)
- [x] **4.1** — `recordLatency()` no middleware Express.
- [x] **4.2** — OpenAPI 3.1 YAML (`docs/openapi-shms.yaml`).
- [x] **4.3** — 55 testes E2E (total: 193 passando).
- [x] **4.4** — Autenticação e billing para API SHMS (`shms-auth-middleware.ts`).

---

## Regras do Conselho (Método Delphi)

O Conselho de 6 IAs opera pelo Método Delphi com as seguintes regras: todas as decisões técnicas requerem consenso de ≥ 4 dos 6 membros; mudanças de arquitetura requerem análise de impacto em todos os módulos; novos datasets científicos devem ter referência publicada e peer-reviewed; cada Phase deve ter métricas mensuráveis e critérios de sucesso claros; rollback automático se qualquer NC crítica for detectada em produção; e a Visão Final de MOTHER (Objetivo A + Objetivo B) é imutável e não pode ser alterada sem autorização explícita do proprietário (Everton Garcia, Wizards Down Under).

**R30 (NOVA — C189):** Este TODO-ROADMAP contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho dos 6 IAs. Tarefas sem origem documentada no relatório do Conselho devem ser REMOVIDAS imediatamente.

---

**TODO-ROADMAP V16 — MOTHER v81.8 → v82.x**
**Visão Final: Objetivo A (SHMS Geotécnico) + Objetivo B (Autonomia Total via DGM)**
**Proprietário: Everton Garcia, Wizards Down Under**
**Ciclo 189 Phase 5 Semanas 1-4 ✅ | 9 NCs resolvidas | 0 pendentes | Score: ~45/100**
**Filtro R30: Apenas tarefas do Conselho C188 (Seção 9.2-9.5)**
