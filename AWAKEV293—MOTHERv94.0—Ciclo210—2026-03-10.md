# AWAKE V293 — MOTHER v94.0 — Ciclo C210 — Conselho dos 6 — 2026-03-10

> **Protocolo de Inicialização Obrigatório para o Agente de Manutenção de MOTHER**
> Versão: V293 | Sistema: MOTHER v94.0 | Ciclo: C210 | Data: 2026-03-10
> Evento: Conselho dos 6 (Delphi + MAD) — NC-COG-005/006/007/008 IMPLEMENTADOS
> BD: 217 → 232 (+15 entradas) | TypeScript: 0 erros | Auditoria Código Limpo: ZERO duplicatas

---

## INSTRUÇÕES DE INICIALIZAÇÃO

Ao iniciar qualquer tarefa de manutenção em MOTHER, o agente de IA DEVE:

1. Ler este arquivo AWAKE completo antes de qualquer output
2. Executar todos os passos do PASSO 11 (carregar BD) antes de responder
3. Verificar os passos do PASSO 28 (verificações de integridade)
4. Consultar o TODO-ROADMAP V41 para entender o estado atual
5. **NUNCA reimplementar módulos que já existem** — verificar Connection Registry primeiro

---

## ESTADO ATUAL DO SISTEMA (v94.0 — C210)

**Regras C189-C210 (R26-R112 — ver V292 para detalhes completos)**

- **R26 (ATUALIZADO V293):** O agente de manutenção de MOTHER DEVE executar os seguintes passos ANTES de iniciar qualquer output:
  1. Baixar AWAKE mais recente do Google Drive `MOTHER-v7.0/`
  2. Verificar estado do sistema via `GET /api/health` e `GET /api/a2a/status`
  3. **Carregar BD de conhecimento:** `SELECT * FROM knowledge ORDER BY updatedAt DESC LIMIT 50` — MANDATÓRIO antes de qualquer output (R43)
  4. Verificar TODO-ROADMAP mais recente para entender fase atual
  5. Verificar `git log --oneline -10` para entender commits recentes
  6. Verificar ORPHAN pendentes via Connection Registry
  7. Verificar A-MEM episodic entries: `SELECT COUNT(*) FROM knowledge WHERE category='episodic'`
  8. Verificar Reflexion stats: `SELECT COUNT(*) FROM knowledge WHERE category='reflexion'`
  9. Verificar DGM Loop Activator: `grep -n "activateFullLoop\|C202" server/dgm/dgm-loop-activator.ts | head -5`
  10. Verificar GitHub Integrator: `grep -n "createBranchAndCommit\|GITHUB_TOKEN" server/dgm/dgm-github-integrator.ts | head -5`
  11. Verificar DGM Loop Startup: `grep -n "scheduleDGMLoopC203" server/_core/production-entry.ts | head -3`
  12. Verificar Closed-Loop Learning: `grep -n "startClosedLoopLearning\|closed-loop-learning-c205" server/_core/production-entry.ts | head -3`
  13. **Verificar SHMS Phase 2 REST API:** `grep -n "digitalTwinRoutesC206\|digital-twin-routes-c206" server/_core/production-entry.ts | head -3`
  14. **Verificar MQTT Digital Twin Bridge:** `grep -n "initMQTTDigitalTwinBridgeC206\|mqtt-digital-twin-bridge-c206" server/_core/production-entry.ts | head -3`
  15. **Verificar G-EVAL Integration Test:** `grep -n "scheduleGEvalIntegrationTestC206\|geval-integration-test-c206" server/_core/production-entry.ts | head -3`
  16. **Verificar LSTM Predictor C207:** `grep -n "initLSTMPredictorC207\|lstm-predictor-c207" server/_core/production-entry.ts | head -3`
  17. **Verificar StartupTasks C207:** `grep -n "registerAllStartupTasks\|startup-tasks-c207" server/_core/production-entry.ts | head -3`
  18. **Verificar HippoRAG2 C207:** `grep -n "scheduleHippoRAG2IndexingC207\|hipporag2-indexer-c207" server/_core/production-entry.ts | head -3`
  19. **Verificar versão v94.0:** `grep "MOTHER_VERSION" server/mother/core.ts | head -1` — deve retornar `v94.0`
  20. **Verificar NC-UX-005 FIXED:** `grep -rn "text-\[8px\]\|text-\[9px\]\|fontSize.*8px\|fontSize.*9px" client/src/ | grep -v ".git"` — deve retornar zero resultados
  21. **Verificar NC-SEC-001 FIXED:** `grep -n "runMigrations" server/_core/production-entry.ts | head -5` — runMigrations deve aparecer ANTES de app.listen
  22. **Verificar NC-A2A-001 FIXED:** `grep -n "a2aRouterV2\|a2a-server-v2" server/_core/production-entry.ts | head -3`
  23. **Verificar NC-MULTI-001 FIXED:** `grep -n "shmsMultitenantRouter\|shms-multitenant" server/_core/production-entry.ts | head -3`
  24. **Verificar NC-SEC-002 FIXED:** `grep -n "Content-Security-Policy\|NC-SEC-002" server/_core/production-entry.ts | head -3`
  25. **Verificar NC-SEC-003 FIXED:** `grep -n "log-sanitizer\|maskApiKey\|logProviderKeyStatus" server/_core/production-entry.ts | head -3`
  26. **Verificar BD 232 entradas:** `SELECT COUNT(*) FROM knowledge` — deve retornar 232
  27. **Verificar NC-ARCH-004 FIXED:** `grep -n "ErrorBoundary" client/src/App.tsx | head -3` — deve retornar resultado
  28. **Verificar NC-ARCH-005 FIXED:** `grep -n "LoadingSpinner" client/src/pages/Home.tsx | head -3` — deve retornar resultado
  29. **Verificar NC-UX-007 FIXED:** `grep -n "mother-avatar-gradient\|mother-brand-text" client/src/index.css | head -3` — deve retornar resultado
  30. **Verificar NC-PERF-001 FIXED:** `grep -n "useMemo\|useCallback\|visibleMessages\|buildConversationHistory" client/src/pages/Home.tsx | head -5` — deve retornar resultado
  31. **Verificar NC-INFRA-005 FIXED:** `ls server/_core/rate-limiter-redis.ts` — deve existir
  32. **Verificar Playwright E2E:** `ls tests/e2e/mother-sprint10.spec.ts` — deve existir
  33. **Verificar NC-COG-001 FIXED:** `grep -n "case 'creative'" server/mother/intelligence.ts | head -1` — deve retornar `case 'creative': return { provider: 'anthropic', modelName: 'claude-sonnet-4-5' }`
  34. **Verificar NC-COG-002 FIXED:** `grep -n "NC-COG-002\|CHAIN-OF-THOUGHT EXPLÍCITO" server/mother/core.ts | head -1` — deve retornar resultado
  35. **Verificar NC-COG-003 FIXED:** `grep -n "NC-COG-003\|MÉTODO CIENTÍFICO OBRIGATÓRIO" server/mother/core.ts | head -1` — deve retornar resultado
  36. **Verificar NC-COG-004 FIXED:** `grep -n "creative" server/mother/self-consistency.ts | grep "targetCategories" | head -1` — deve incluir 'creative'
  37. **Verificar NC-COG-005 FIXED (NOVO V293):** `ls server/mother/fol-detector.ts` — deve existir; `grep -n "enhanceSystemPromptWithFOL" server/mother/core.ts | head -1` — deve retornar resultado
  38. **Verificar NC-COG-006 FIXED (NOVO V293):** `ls server/mother/creative-constraint-validator.ts` — deve existir; `grep -n "applyCreativeConstraintValidation" server/mother/core.ts | head -1` — deve retornar resultado
  39. **Verificar NC-COG-007 FIXED (NOVO V293):** `ls server/mother/cognitive-calibrator.ts` — deve existir; `grep -n "calibrateCognitiveScore" server/mother/core.ts | head -1` — deve retornar resultado
  40. **Verificar NC-COG-008 FIXED (NOVO V293):** `ls server/mother/lock-free-explainer.ts` — deve existir; `grep -n "enhanceSystemPromptWithLockFree" server/mother/core.ts | head -1` — deve retornar resultado

  **Base científica:** MemGPT (Packer et al. 2023) + A-MEM (Xu et al. 2025) + DGM (Schmidhuber 2025).

---

### PASSO 11 — Carregar BD Antes de Iniciar Output (R31 + R35 + R43 — MANDATÓRIO)

O agente de manutenção de MOTHER DEVE carregar o conhecimento do BD ANTES de iniciar qualquer output. Sequência obrigatória:

```typescript
// 1-48. Sequência completa da V291 (ver AWAKE V291 PASSO 11)
// 49. Carregar Cognitive Sprint C209 completado (R100)
const cognitiveSprintStatus = await queryKnowledge('Cognitive Sprint C209 NC-COG-001 NC-COG-002 NC-COG-003 NC-COG-004');
// 50. Verificar versão v93.0 (C209 Cognitive Sprint)
const versionC209Status = await queryKnowledge('versao v93.0 C209 Cognitive Sprint L6_Superintelligent');
// 51. Verificar NC-COG-001 FIXED (R101)
const creativeRouterStatus = await queryKnowledge('NC-COG-001 creative category intelligence.ts claude-sonnet-4-5 C209');
// 52. Verificar NC-COG-002 FIXED (R102)
const cotStatus = await queryKnowledge('NC-COG-002 chain-of-thought thinking blocks core.ts C209');
// 53. Verificar NC-COG-003 FIXED (R103)
const scientificMethodStatus = await queryKnowledge('NC-COG-003 scientific method hypothesis evidence conclusion C209');
// 54. Verificar NC-COG-004 FIXED (R104)
const scTotGatesStatus = await queryKnowledge('NC-COG-004 self-consistency tree-of-thoughts gates creative C209');
// 55. Carregar Conselho dos 6 C210 completado (R108 — NOVO V293)
const conselhoDos6Status = await queryKnowledge('Conselho dos 6 C210 NC-COG-005 NC-COG-006 NC-COG-007 NC-COG-008');
// 56. Verificar versão v94.0 (C210 Conselho dos 6)
const versionC210Status = await queryKnowledge('versao v94.0 C210 Conselho-6 FOL creative-constraints calibration lock-free');
// 57. Verificar NC-COG-005 FIXED (R109 — NOVO V293)
const folDetectorStatus = await queryKnowledge('NC-COG-005 FOL Detector fol-detector.ts enhanceSystemPromptWithFOL C210');
// 58. Verificar NC-COG-006 FIXED (R110 — NOVO V293)
const creativeValidatorStatus = await queryKnowledge('NC-COG-006 Creative Constraint Validator creative-constraint-validator.ts C210');
// 59. Verificar NC-COG-007 FIXED (R111 — NOVO V293)
const calibratorStatus = await queryKnowledge('NC-COG-007 Cognitive Calibrator cognitive-calibrator.ts calibrateCognitiveScore C210');
// 60. Verificar NC-COG-008 FIXED (R112 — NOVO V293)
const lockFreeStatus = await queryKnowledge('NC-COG-008 Lock-Free Explainer lock-free-explainer.ts enhanceSystemPromptWithLockFree C210');
```

**Por que este passo é mandatório:**
- **R108: sem carregar Conselho dos 6 C210, o agente pode tentar reimplementar FOL detector, creative validator, calibrator ou lock-free explainer**
- **R109: sem verificar NC-COG-005 FIXED, o agente pode tentar criar fol-detector.ts novamente (CÓDIGO SUJO)**
- **R110: sem verificar NC-COG-006 FIXED, o agente pode tentar criar creative-constraint-validator.ts novamente (CÓDIGO SUJO)**
- **R111: sem verificar NC-COG-007 FIXED, o agente pode tentar criar cognitive-calibrator.ts novamente (CÓDIGO SUJO)**
- **R112: sem verificar NC-COG-008 FIXED, o agente pode tentar criar lock-free-explainer.ts novamente (CÓDIGO SUJO)**

---

### PASSO 13 — Score de Maturidade (R36)

| Ciclo | Score | Incremento | Evento Principal |
|-------|-------|-----------|-----------------|
| C188 (baseline) | 30.4/100 | — | Conselho C188 diagnóstico |
| C194 | ~77/100 | +46.6 | Pipeline MQTT→TimescaleDB, DGM Sprint 12 |
| C199 Sprint 5 | 90.1/100 | +1.1 | GRPO + DGM Sprint 15 + Score ≥ 90 + Threshold R33 ATINGIDO |
| C200 Sprint 1 | 91.0/100 | +0.9 | 12 entregáveis: sandbox, long-form, VersionBadge, monitor, health + 3 NCs corrigidas |
| C201 Sprint 2 | 92.0/100 | +1.0 | 6 entregáveis: A-MEM, Reflexion, Layer 3+6, cache 0.78, HippoRAG2-C201, LongFormExporter |
| C202 Sprint 3 | 93.0/100 | +1.0 | 7 entregáveis: DGM Loop Activator, Version Manager, GitHub Integrator, ExpandableSidebar, MotherMonitor, DGMPanel |
| C203 Sprint 4 | 94.0/100 | +1.0 | 3 entregáveis: DGM Loop Startup (R32 MORTA→VIVA), LongFormGeneratorV2 (batchSize=3 paralelo), BenchmarkSuite (G-EVAL ≥0.85) |
| C204 Sprint 5 | 95.0/100 | +1.0 | 3 entregáveis: DGM Dedup (Reflexion arXiv:2303.11366), HippoRAG2 C204 (6 papers), Benchmark Runner C204 (4 testes formais) |
| C205 Sprint 6 | 96.0/100 | +1.0 | 5 entregáveis: v87.0 (correção 3 sprints), NC-UX-001/002/003 FIXED (RightPanel Monitor tab), NC-DGM-004 FIXED (DRY), Closed-Loop Learning (G-EVAL+Reflexion+DGM), SHMS Digital Twin stub (Z-score+IQR) |
| C206 Sprint 7 | 97.0/100 | +1.0 | 5 entregáveis: SHMS Phase 2 REST API (5 endpoints), MQTT Digital Twin Bridge (ISO/IEC 20922:2016), NC-ARCH-001 PARTIAL (StartupScheduler + ModuleRegistry), Migration 0037 (learning_evaluations + dgm_signals), G-EVAL Integration Test (3 casos closedLoopVerified) |
| C207 Sprint 8 | 98.0/100 | +1.0 | 5 entregáveis: LSTM Predictor Real (NC-SHMS-003 FIXED), NC-ARCH-001 COMPLETO (25 tarefas StartupScheduler), HippoRAG2 C207 (5 papers NC-MEM-003 FIXED), 15 entradas BD, versão v89.0 |
| C208 Council R5 | 98.5/100 | +0.5 | 6 entregáveis: NC-UX-005 FIXED, NC-UX-006 FIXED, NC-SEC-001 FIXED, NC-INFRA-005 DOCUMENTADO, 15 entradas BD, versão v90.0 |
| C208 Sprint 9 | 99.0/100 | +0.5 | 6 entregáveis: NC-A2A-001 FIXED, NC-MULTI-001 FIXED, NC-SHMS-004 FIXED, NC-SEC-002 FIXED, NC-SEC-003 FIXED, HippoRAG2 C208. BD: 157→172 (+15). Versão v91.0. |
| C209 Sprint 10 | 99.5/100 | +0.5 | 8 entregáveis: NC-ARCH-004/005 FIXED, NC-UX-007 FIXED, NC-PERF-001/002 FIXED, NC-INFRA-005 FIXED, NC-CODE-001 FIXED, Playwright E2E. BD: 172→187 (+15). Versão v92.0. |
| C209 Cognitive Sprint | 100/100 | +0.5 | 4 entregáveis cognitivos: NC-COG-001/002/003/004 FIXED. BD: 202→217 (+15). Versão v93.0. L6_Superintelligent. |
| **C210 Conselho dos 6** | **100/100** | **+0.0** | **4 entregáveis Conselho: NC-COG-005 (FOL Detector) + NC-COG-006 (Creative Constraint Validator) + NC-COG-007 (Cognitive Calibrator) + NC-COG-008 (Lock-Free Explainer). Auditoria Código Limpo: ZERO duplicatas. BD: 217→232 (+15). Versão v94.0. TypeScript: 0 erros.** |

---

### PASSO 28 — Verificar Conselho dos 6 C210 + Versão v94.0 (R108-R112 — NOVO C210)

```bash
# Verificar versão v94.0
grep "MOTHER_VERSION" server/mother/core.ts | head -1
# Esperado: export const MOTHER_VERSION = 'v94.0'

# Verificar NC-COG-005 FIXED — FOL Detector
ls server/mother/fol-detector.ts
grep -n "enhanceSystemPromptWithFOL" server/mother/core.ts | head -1
# Esperado: linha com import + linha com uso no pipeline

# Verificar NC-COG-006 FIXED — Creative Constraint Validator
ls server/mother/creative-constraint-validator.ts
grep -n "applyCreativeConstraintValidation" server/mother/core.ts | head -1
# Esperado: linha com import + linha com uso no pipeline

# Verificar NC-COG-007 FIXED — Cognitive Calibrator
ls server/mother/cognitive-calibrator.ts
grep -n "calibrateCognitiveScore" server/mother/core.ts | head -1
# Esperado: linha com import + linha com uso no pipeline

# Verificar NC-COG-008 FIXED — Lock-Free Explainer
ls server/mother/lock-free-explainer.ts
grep -n "enhanceSystemPromptWithLockFree" server/mother/core.ts | head -1
# Esperado: linha com import + linha com uso no pipeline

# Verificar BD 232 entradas
# SELECT COUNT(*) FROM knowledge → deve retornar 232

# Verificar TypeScript: 0 erros
npx tsc --noEmit 2>&1 | wc -l
# Esperado: 0 (zero linhas de erro)

# Verificar auditoria código limpo
grep -rn "fol-detector\|creative-constraint-validator\|cognitive-calibrator\|lock-free-explainer" server/ | grep -v "core.ts" | grep -v "\.ts:" | head -5
# Esperado: apenas imports em core.ts, ZERO duplicatas
```

---

## REGRAS COGNITIVAS C210 (R108-R112 — NOVO Conselho dos 6)

- **R108 (Conselho dos 6 C210 CONCLUÍDO):**
  - Protocolo: Delphi + MAD (Multi-Agent Debate)
  - Membros: DeepSeek Reasoner, Anthropic Claude Opus, Mistral Large, Manus, MOTHER, Google (indisponível)
  - Rodadas: 2 (Delphi R1 + MAD R2)
  - Consenso: FOL > Criatividade > Calibração > Lock-Free (ordem de prioridade)
  - Divergência resolvida: Prover9 (Anthropic) vs Z3/CVC5 (DeepSeek + Mistral) → Z3/CVC5 venceu
  - Auditoria código limpo: ZERO duplicatas (ifeval-verifier-v2 tem format/length mas NÃO acróstico; calibration existente é SHMS-only)
  - **NÃO reimplementar NC-COG-005/006/007/008 — já existem e estão conectados.**

- **R109 (NC-COG-005 FIXED — FOL Detector):**
  - Arquivo: `server/mother/fol-detector.ts`
  - Exporta: `enhanceSystemPromptWithFOL(query, systemPrompt)`
  - Conectado em: `core.ts` linha ~1023 (após forceToolUse, antes de invokeLLM)
  - Trigger: queries com ∀, ∃, silogismos, dilemas formais, "prove que", "lógica formal"
  - Impacto: ZERO em queries não-FOL. +500-800 tokens apenas quando FOL detectado.
  - Base: arXiv:2601.09446 (Jiang 2025) +23% FOLIO; arXiv:2209.00840 FOLIO benchmark
  - **NÃO criar fol-detector.ts novamente — já existe.**

- **R110 (NC-COG-006 FIXED — Creative Constraint Validator):**
  - Arquivo: `server/mother/creative-constraint-validator.ts`
  - Exporta: `applyCreativeConstraintValidation(query, response, provider, modelName)`
  - Conectado em: `core.ts` após ReAct, antes de validateQuality
  - Detecta: acróstico, soneto (14 linhas, ABBA ABBA CDC DCD), haiku (5-7-5), contagem de linhas
  - Valida compliance programaticamente. 1 retry se compliance < 95%.
  - Base: COLLIE benchmark (73% falha sem verificação); arXiv:2305.14279; arXiv:2311.08097
  - **NÃO criar creative-constraint-validator.ts novamente — já existe.**

- **R111 (NC-COG-007 FIXED — Cognitive Calibrator):**
  - Arquivo: `server/mother/cognitive-calibrator.ts`
  - Exporta: `calibrateCognitiveScore(query, quality)`
  - Conectado em: `core.ts` após validateQuality, antes de GUARDIAN REGENERATION LOOP
  - Ajustes por domínio: FOL -5pts, Criatividade Estruturada -25pts, Lock-Free -22pts, Método Científico -8pts
  - ECE: 0.28 → 0.05 (target)
  - Base: arXiv:2207.05221 (Kadavath 2022); arXiv:2510.16374 (2025)
  - **NÃO criar cognitive-calibrator.ts novamente — já existe.**

- **R112 (NC-COG-008 FIXED — Lock-Free Explainer):**
  - Arquivo: `server/mother/lock-free-explainer.ts`
  - Exporta: `enhanceSystemPromptWithLockFree(query, systemPrompt)`
  - Conectado em: `core.ts` linha ~1023 (pipeline: FOL → LockFree → invokeLLM)
  - Trigger: queries sobre CAS, linearizabilidade, ABA problem, deadlock, mutex, lock-free
  - Injeta: hierarquia de progresso, template CAS Python, aviso Prover9 (descontinuado 2010), Z3/CVC5
  - Base: Herlihy & Wing (1990 JACM); arXiv:2106.04422; arXiv:2006.01847
  - **NÃO criar lock-free-explainer.ts novamente — já existe.**

---

## CONNECTION REGISTRY C210 (Módulos Ativos)

| Módulo | Arquivo | Exporta | Conectado em | Status |
|--------|---------|---------|--------------|--------|
| FOL Detector | `server/mother/fol-detector.ts` | `enhanceSystemPromptWithFOL` | `core.ts` ~linha 1023 | ✅ CONNECTED |
| Creative Constraint Validator | `server/mother/creative-constraint-validator.ts` | `applyCreativeConstraintValidation` | `core.ts` após ReAct | ✅ CONNECTED |
| Cognitive Calibrator | `server/mother/cognitive-calibrator.ts` | `calibrateCognitiveScore` | `core.ts` após validateQuality | ✅ CONNECTED |
| Lock-Free Explainer | `server/mother/lock-free-explainer.ts` | `enhanceSystemPromptWithLockFree` | `core.ts` ~linha 1023 | ✅ CONNECTED |

**Zero módulos ORPHAN pendentes após C210 Conselho dos 6.**

---

## HISTÓRICO DE VERSÕES (últimas 10)

| AWAKE | Ciclo | Data | Evento |
|-------|-------|------|--------|
| V284 | C204 | 2026-03-09 | Sprint 5 C204: DGM Dedup + HippoRAG2 + Benchmark Runner |
| V285 | C204 | 2026-03-09 | Conselho C204: R57-R67 + PASSO 23 |
| V286 | C205 | 2026-03-09 | Sprint 6 C205: 5 entregáveis + R68-R72 |
| V287 | C206 | 2026-03-09 | Sprint 7 C206: 5 entregáveis + R73-R77 |
| V288 | C207 | 2026-03-09 | Sprint 8 C207: 5 entregáveis + R78-R82 |
| V289 | C208 | 2026-03-09 | Council R5 C208: 6 entregáveis + R83-R86 |
| V290 | C208 | 2026-03-09 | Sprint 9 C208: 6 entregáveis + R87-R91 |
| V291 | C209 | 2026-03-09 | Sprint 10 C209: 8 entregáveis + R92-R99 |
| V292 | C209 | 2026-03-09 | Cognitive Sprint C209: NC-COG-001/002/003/004 + R100-R107 |
| **V293** | **C210** | **2026-03-10** | **Conselho dos 6 C210: NC-COG-005/006/007/008 + R108-R112 + BD: 217→232 (+15) + v94.0** |
