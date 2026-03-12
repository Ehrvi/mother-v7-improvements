# TODO — ROADMAP V60 — MOTHER v122.24 — Ciclo C340 — Conselho V110
**Data:** 2026-03-12 | **Versão:** v122.24 | **Ciclo atual:** C340
---
## CICLOS CONCLUÍDOS ✅
### Conselho V108 (C321-C326)
- [x] **C321** — Semantic Complexity Detector v2.0 + Citation Engine fix | commit 796f675
- [x] **C322** — CoT explícito (5 passos) + Template condicional de formatação | commit 796f675
- [x] **C323** — Framework de testes gate — 26/26 passaram | commit 796f675
- [x] **C324** — Token-level SSE streaming no LFSA (TTFT 28s→2.1s) | commit 91cefdb
- [x] **C325** — Adaptive threshold telemetry [C325-TELEMETRY] logs | commit 91cefdb
- [x] **C326** — G-Eval baseline: 55%→80% pass rate ✅ gate atingido | commit 91cefdb
### Conselho V109 (C327-C334)
- [x] **C327** — LFSA_CONSTITUTIONAL_CONSTRAINTS (8 proibições + exemplos negativos) + isProg scope fix + versionStr dinâmico | commit 5a765f4
- [x] **C328** — extractSemanticTitle() normaliza CAPS LOCK + propagação de systemRules para LFSA | commit 5a765f4
- [x] **C329** — 'livro/book/manual/novel/tese/thesis' em SEMANTIC_ARTIFACT_NOUNS + H4 complexitySignals | commit 5a765f4
- [x] **C330** — OBT Framework 13 testes (OBT-001 a OBT-007) implementado | commit 5a765f4
- [x] **C331** — maxTokensPerSection dinâmico: `Math.max(12000, wordsPerSection * 3)` | commit 5a765f4
- [x] **C332** — Outline tokens 2000→1200 (-40% latência) + instrução conciseness | commit 5a765f4
- [x] **C333** — MOTHER_CITATION_DEBUG=true em cloudbuild.yaml | commit 5a765f4
- [x] **C334** — DGM rejection_count reset + MOTHER_CYCLE=334 em cloudbuild.yaml | commit 5a765f4
### Conselho V110 (C335-C340)
- [x] **C335** — Anti-version-hallucination fix: ORCHESTRATOR_VERSION v82.4→v122.24 + ANTI-PATTERN RULES em buildSystemPrompt() | commit 5a765f4 | Cloud Build f56514ef
- [x] **C336** — OBT framework: SSE token parsing fix + execução pré-deploy (76.9% → ≥85% esperado pós-C335) | commit 5a765f4
- [x] **C337** — DGM SQL reset verificado: 0 proposals bloqueadas (sistema já limpo) | SQL executado 2026-03-12
- [x] **C338** — Citation monitoring: MOTHER_CITATION_DEBUG=true ativo, monitoramento iniciado | baseline 40%
- [x] **C339** — Latency validation: dados G-Eval coletados (40.5s avg), aguarda re-medição pós-deploy C335 | _smart_sample() corrigido
- [x] **C340** — SUS UX improvements: UX-3 sidebar filter, UX-4 suggestion chips, UX-5 citation indicator | commit c2042b3 | Cloud Build 9fb1699a
---
## CICLOS PENDENTES 🔲
### C341 — Fine-tuning DPO Update (ALTA PRIORIDADE)
- [ ] **C341** — Atualizar DPO fine-tuned model com pares de C327-C340
  - **Gate:** >500 pares de preferência coletados
  - **Dependência:** Deploy C335 + C340 em produção (Cloud Builds f56514ef + 9fb1699a)
  - **Ação:** Coletar pares de `conversation_logs` onde MOTHER gerou respostas com citações + sem auto-referência
  - **Script:** `python3 scripts/collect_dpo_pairs.py --min-quality=0.8 --limit=1000`

### C342 — OBT Re-validation Post-Deploy (ALTA PRIORIDADE)
- [ ] **C342** — Re-executar OBT framework após deploy C335
  - **Gate:** ≥85% pass rate (atual: 76.9%)
  - **Arquivo:** `tests/e2e/c330-obt-framework.py`
  - **Esperado:** OBT-001 (anti-auto-referência) + OBT-003 (versão correta) agora devem passar

### C343 — G-Eval Re-validation Post-Deploy (ALTA PRIORIDADE)
- [ ] **C343** — Re-executar G-Eval completo após deploy C335
  - **Gate:** Pass Rate ≥85% (atual: 73.3% com bug de truncation)
  - **Arquivo:** `tests/e2e/run_geval_final.py` (com _smart_sample() corrigido)
  - **Esperado:** Q06, Q07, Q11, Q12 agora com scores corretos (não truncados)

### C344 — Citation Rate Validation (MÉDIA PRIORIDADE)
- [ ] **C344** — Validar citation rate após 48h de MOTHER_CITATION_DEBUG=true
  - **Gate:** Citation rate ≥60% (atual: 40%)
  - **Ação se <60%:** Revisar `applyCitationEngine` timeout (8s → 15s)

### C345 — SUS Measurement Post-UX (BAIXA PRIORIDADE)
- [ ] **C345** — Medir SUS após C340 UX improvements
  - **Gate:** SUS ≥80 (atual: 72)
  - **Método:** Teste com 5 usuários (Brooke 1996, SUS scale)

---
## MÉTRICAS ATUAIS
| Métrica | Baseline v87.0 | v122.22 | v122.24 (atual) | Gate Final |
|---------|---------------|---------|-----------------|-----------|
| G-Eval Pass Rate | 55% | 80% ✅ | 73.3%* | ≥90% |
| OBT Pass Rate | 0% | — | 76.9%** | ≥90% |
| Citation Rate | 0% | 40% | 40% | ≥80% |
| Avg Latência | 28s | 39.4s | 40.5s | ≤30s |
| SUS Score | 72 | 72 | 72*** | ≥85 |
| TypeScript Errors | — | 0 ✅ | 0 ✅ | 0 |
| Gate Tests | — | 26/26 ✅ | 26/26 ✅ | 26/26 |
| bd_central | 5k | 13.9k | 13.967k | — |

*73.3% com bug de truncation no G-Eval judge (corrigido em C335 — aguarda re-medição)
**76.9% pré-deploy C335 (OBT-001/OBT-003 devem passar após C335)
***SUS 72 → esperado ≥76 após C340 UX improvements

---
## ARQUIVOS CHAVE
| Arquivo | Propósito | Último ciclo |
|---------|-----------|-------------|
| `server/mother/long-form-engine-v3.ts` | LFSA engine | C327, C331, C332 |
| `server/mother/core.ts` | Core engine | C328, C335 (v122.24) |
| `server/mother/core-orchestrator.ts` | Orchestrator | C335 (ORCHESTRATOR_VERSION, ANTI-PATTERN RULES) |
| `server/mother/output-length-estimator.ts` | Complexity detector | C329 |
| `server/mother/citation-engine.ts` | Citation engine | C321, C333 |
| `cloudbuild.yaml` | CI/CD | C333, C334, C335 |
| `tests/c321-c323-gate-tests.spec.ts` | Gate tests | 26/26 |
| `tests/e2e/c330-obt-framework.py` | OBT framework | C330, C336 (SSE fix) |
| `tests/e2e/run_geval_final.py` | G-Eval | C335 (_smart_sample fix) |
| `client/src/components/RightPanel.tsx` | DGM proposals UI | C340 (UX-3) |
| `client/src/components/ChatInterface.tsx` | Chat onboarding | C340 (UX-4) |
| `client/src/components/MessageBubble.tsx` | Message rendering | C340 (UX-5) |

---
## REGRAS CRÍTICAS DESCOBERTAS (C335-C340)
1. **ORCHESTRATOR_VERSION SYNC:** Ao atualizar MOTHER_VERSION em `core.ts`, SEMPRE atualizar ORCHESTRATOR_VERSION em `core-orchestrator.ts` no mesmo commit.
2. **G-Eval LFSA:** Usar `_smart_sample(text, 6000)` para respostas >2500 chars — evita truncation bias.
3. **OBT SSE parsing:** Tokens simples não têm campo `type` — usar `data.text || data.token || data.content` em vez de `data.type === 'token'`.

---
*Roadmap V60 gerado por Manus AI em 2026-03-12 | Conselho V110 (5/5 consenso)*
