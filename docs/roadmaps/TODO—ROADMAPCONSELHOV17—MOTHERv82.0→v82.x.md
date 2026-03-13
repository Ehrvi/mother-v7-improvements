# TODO — ROADMAP CONSELHO V17 — MOTHER v82.0 → v82.x
**Versão:** TODO-ROADMAP V17
**Sistema:** MOTHER v82.0
**Ciclo:** 190 — Phase 6 Semanas 1-2 (Concluída)
**Data:** 2026-03-08
**Método:** Delphi + MAD (Conselho dos 6 IAs)
**Regra R30:** Este TODO-ROADMAP contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho C188 (Seção 9.2-9.5).
**Regra R32:** Antes de implementar qualquer tarefa, verificar se já está implementada (grep + inspeção direta).

---

## VISÃO FINAL DE MOTHER (IMUTÁVEL — R13)
- **Objetivo A:** SHMS Geotécnico — sensores IoT → MQTT → TimescaleDB → LSTM → MOTHER análise → alertas
- **Objetivo B:** Autonomia Total via DGM — proposta → branch → PR → merge → deploy → validação → aprendizado
- **Proprietário:** Everton Garcia, Wizards Down Under

---

## SCORE DE MATURIDADE (Conselho C188 → C190)
| Dimensão | Score C188 | Score C189 | Score C190 (estimado) | Alvo C192 |
|----------|-----------|-----------|----------------------|-----------|
| SHMS (40%) | 15/100 | 22/100 | 22/100 | 85/100 |
| DGM/Autonomia (30%) | 22/100 | 38/100 | 48/100 | 75/100 |
| Arquitetura (20%) | 38/100 | 52/100 | 70/100 | 80/100 |
| Qualidade/Testes (10%) | 28/100 | 40/100 | 40/100 | 85/100 |
| **TOTAL** | **30.4/100** | **~45/100** | **~52/100** | **>85/100** |

---

## PHASE 5 — CONCLUÍDA (Ciclo 189 — Semanas 1-4)
### Objetivos: Resolver NCs Críticas + Conectar SHMS Básico (Conselho C188 Seção 9.2)

**NCs Resolvidas em C189 (Semanas 1-2):**
- [x] **NC-DB-001 (CRITICAL — FALSE POSITIVE)** — Todas as 28 tabelas já existiam em `mother_v7_prod`. R29 adicionado.
- [x] **NC-SEC-001 (CRITICAL)** — `env.ts`: JWT_SECRET fail-fast + MQTT/SHMS env vars. JWT_SECRET via Secret Manager.
- [x] **NC-DGM-001 (HIGH)** — `dgm-orchestrator.ts`: `triggerDeploy` importado e chamado. Loop DGM fechado.
- [x] **NC-LEARN-001 (HIGH)** — `knowledge.ts`: HippoRAG2 Source 5. `learning.ts`: memory_agent conectado.
- [x] **NC-ENV-001 (HIGH)** — `env.ts`: MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD, SHMS_SENSOR_SECRET adicionados.
- [x] **NC-ENV-002 (HIGH)** — `env.ts`: OPENAI_API_KEY_EXTRA adicionado.

**NCs Resolvidas em C189 (Semanas 3-4):**
- [x] **NC-SHMS-001 (HIGH)** — `sensor-validator.ts` criado. Validação GISTM 2020 + ICOLD Bulletin 158.
- [x] **NC-ARCH-001 (HIGH)** — SHMS v1 DEPRECATED. Remoção planejada C195.
- [x] **NC-ARCH-002 (HIGH) — PARCIAL** — 4 routers criados em `server/_core/routers/`.
- [x] **R27** — `connection-registry.ts` criado.
- [x] **min-instances=1** — Cloud Run configurado.

---

## PHASE 6 — CONCLUÍDA (Ciclo 190 — Semanas 1-2)
### Objetivos: NC-ARCH-002 Completo + LoRA Ativo + FALSE POSITIVES Documentados (Conselho C188 Seção 9.3)

**Tarefas Executadas em C190:**
- [x] **NC-ARCH-002 COMPLETO (HIGH)** — 4 routers montados em `production-entry.ts` com `app.use()`. Rotas: `/auth/*`, `/api/shms/v2/*`, `/api/dgm/*`, `/api/metrics/*`. Base científica: Fowler (1999) Refactoring — Extract Module. Roy Fielding (2000) REST.
- [x] **lora-trainer.ts CONECTADO (P0 CRÍTICO)** — `scheduleLoRAPipeline()` chamado em startup. `runLoRAPipeline()` triggerado em `dgm-orchestrator.ts` após fitness ≥ 75. Base científica: Hu et al. (2025) LoRA-XS arXiv:2405.09673.
- [x] **finetuning-pipeline.ts IMPORTADO (P1)** — `initiateFineTuning` importado em `dgm-orchestrator.ts`. Pronto para uso quando HF_TOKEN disponível.
- [x] **NC-PERF-001 FALSE POSITIVE DOCUMENTADO** — `insertCacheEntry` + `insertSemanticCacheEntry` já implementados em `core.ts` L1959-1974 desde v74.0. R32 adicionado.
- [x] **active-study trigger FALSE POSITIVE DOCUMENTADO** — `shouldTriggerActiveStudy` + `triggerActiveStudy` já implementados em `core.ts` L682-690 desde C56. Não era tarefa pendente.
- [x] **BD MOTHER** — 8 registros C190 injetados (ciclo_summary, nc_resolution, connection_activated, false_positives, maturity_score, R32, pending_tasks).
- [x] **TypeScript** — 0 erros após todas as mudanças.

**KPIs C190 — Resultado:**
| KPI | Alvo | Resultado | Status |
|-----|------|-----------|--------|
| NC-ARCH-002 completo | Sim | ✅ 4 routers montados | ✅ |
| lora-trainer conectado | Sim | ✅ scheduleLoRAPipeline ativo | ✅ |
| TypeScript errors | 0 | 0 | ✅ |
| FALSE POSITIVES documentados | Sim | 2 (NC-PERF-001, active-study) | ✅ |
| BD injection | 8+ registros | 8 | ✅ |

**Tarefas C190 Pendentes para C191 (Semanas 3-4):**
- [ ] **6.3** — Provisionar TimescaleDB Cloud. Hypertables para séries temporais. Base científica: Freedman et al. (2018).
- [ ] **6.4** — Integrar 1 sensor piloto real via MQTT HiveMQ Cloud. Protocolo: MQTTS (TLS 1.3). Base científica: GISTM 2020, ISO/IEC 20922:2016.
- [ ] **6.5** — Dashboard básico para 1 estrutura monitorada. Visualização Digital Twin + alertas ICOLD 3-level. Base científica: Sun et al. (2025).

---

## PHASE 7 — PLANEJADA (Ciclo 191)
### Objetivos: DGM Sprint 10 + Autonomia Total (Conselho C188 Seção 9.4)

| Tarefa | Arquivo | Tempo | Conselho C188 |
|--------|---------|-------|---------------|
| DGM Sprint 10: autoMerge ativo | `dgm-orchestrator.ts` | 8h | Seção 9.4 |
| Validação pós-deploy automática | `deploy-validator.ts` | 8h | Seção 9.4 |
| Alertas ICOLD em produção | `shms-alert-system.ts` | 8h | Seção 9.4 |
| Multi-tenant (3 clientes) | `tenant-configs` | 16h | Seção 9.4 |
| Stripe billing | `billing-agent.ts` | 16h | Seção 9.4 |

- [ ] **7.1** — DGM Sprint 10: autoMerge com validação científica. Score mínimo G-Eval ≥ 90/100. Base científica: arXiv:2505.22954 (DGM), arXiv:2312.10997.
- [ ] **7.2** — Validação pós-deploy automática. Rollback automático se NC crítica detectada. Base científica: Google SRE Book (2016).
- [ ] **7.3** — Alertas ICOLD 3-level em produção. P95 < 500ms. Base científica: Sun et al. (2025), ICOLD Bulletin 158.
- [ ] **7.4** — Multi-tenant (3 clientes ativos). Base científica: Conselho C188 Seção 9.4.
- [ ] **7.5** — Stripe billing real. Planos: Starter (R$150/sensor), Professional (R$120/sensor), Enterprise (R$90/sensor). Base científica: Conselho C188 Seção 9.4.
- [ ] **7.6** — Conselho de IAs V5 — Revisão do Roadmap. Método Delphi Round 5.

> **NOTA R32:** Antes de implementar 7.3 (active-study), verificar se já está implementado em `core.ts`. Verificação C190 confirmou que active-study JÁ ESTÁ implementado desde C56 — remover da lista se confirmado.

**KPIs C191:**
- Deploys automáticos: 0 → ≥1/semana
- Alertas ICOLD: 0 → ≥1/dia
- Clientes ativos: 0 → 3
- Cobertura testes: 7.5% → 20%

---

## PHASE 8 — PLANEJADA (Ciclo 192)
### Objetivos: SOTA — Expansão e Certificação (Conselho C188 Seção 9.5)

- [ ] **8.1** — 10+ sensores reais integrados. Base científica: GISTM 2020.
- [ ] **8.2** — LSTM RMSE < 0.01 com dados reais. Base científica: Hundman et al. (2018).
- [ ] **8.3** — Cache hit rate > 80%. Base científica: GPTCache (Zeng et al., 2023).
- [ ] **8.4** — Arquivos mortos < 5%. Base científica: Conselho C188 Seção 2.1.
- [ ] **8.5** — Cobertura testes > 30%. Base científica: CMMI Level 3.
- [ ] **8.6** — Certificação ISO/IEC 27001 iniciada. Base científica: ISO/IEC 27001:2022.
- [ ] **8.7** — Multi-região: AWS Sydney + GCP Sydney + Azure Australia East. Base científica: Google SRE Book.
- [ ] **8.8** — Suporte a idiomas: Português, Inglês, Espanhol. Base científica: Conselho C188 Seção 9.5.
- [ ] **8.9** — Integração com padrões internacionais: ASCE 7-22, Eurocode 8, AS 1170.4. Base científica: ICOLD Bulletin 158.
- [ ] **8.10** — MOTHER v82.0 Major version bump. Consolidação de todas as features Phase 1-8.

**KPIs C192 (SOTA):**
| KPI | Alvo |
|-----|------|
| Score de maturidade | 52 → 85+ |
| NCs totais | 0 → <5 (novas) |
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

O Conselho de 6 IAs opera pelo Método Delphi com as seguintes regras: todas as decisões técnicas requerem consenso de ≥ 4 dos 6 membros; mudanças de arquitetura requerem análise de impacto em todos os módulos; novos datasets científicos devem ter referência publicada e peer-reviewed; cada Phase deve ter métricas mensuráveis e critérios de sucesso claros; rollback automático se qualquer NC crítica detectada em produção; e a Visão Final de MOTHER (Objetivo A + Objetivo B) é imutável e não pode ser alterada sem autorização explícita do proprietário (Everton Garcia, Wizards Down Under).

**R30 (C189):** Este TODO-ROADMAP contém EXCLUSIVAMENTE tarefas determinadas pelo Conselho dos 6 IAs. Tarefas sem origem documentada no relatório do Conselho devem ser REMOVIDAS imediatamente.

**R32 (C190):** Antes de implementar qualquer tarefa do Conselho, verificar se já está implementada via `grep -n "nome_da_função"`. Se encontrada: registrar como FALSE POSITIVE no BD e remover da lista. Base científica: Lean Software Development (Poppendieck, 2003) — eliminar desperdício.

---

**TODO-ROADMAP V17 — MOTHER v82.0 → v82.x**
**Visão Final: Objetivo A (SHMS Geotécnico) + Objetivo B (Autonomia Total via DGM)**
**Proprietário: Everton Garcia, Wizards Down Under**
**Ciclo 190 Phase 6 Semanas 1-2 ✅ | NC-ARCH-002 COMPLETO | lora-trainer ATIVO | Score: ~52/100**
**Filtro R30: Apenas tarefas do Conselho C188 (Seção 9.2-9.5)**
**Regra R32: Verificar FALSE POSITIVES antes de implementar**
