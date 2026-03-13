# TODO — ROADMAP V61 — MOTHER v122.24 — Ciclo C346 — Conselho V110
**Data:** 2026-03-12 | **Versão:** MOTHER v122.24 | **Próximo ciclo:** C347

---

## CICLOS CONCLUÍDOS ✅

### Conselho V108 (C318-C326)
- [x] **C318** — RLVR→DPO connector automático | commit 3f2a1b8
- [x] **C319** — Hygiene: remover imports não utilizados (circuit-breaker, cragRetrieve) | commit 3f2a1b8
- [x] **C320** — Gate tests: 26/26 passando | commit 3f2a1b8
- [x] **C321** — Citation Engine Fix: shouldApplyCitationEngine (Conselho dos 6) | commit 3f2a1b8
- [x] **C322** — LFSA Fix: wordsPerSection 2000→1500 + max(wordsPerSection * 3) | commit 5a765f4
- [x] **C323** — LFSA Fix: outline tokens 2000→1200 (-40% latência) | commit 5a765f4
- [x] **C324** — LFSA Fix: conciseness instruction | commit 5a765f4
- [x] **C325** — MOTHER_CITATION_DEBUG=true em cloudbuild.yaml | commit 5a765f4
- [x] **C326** — DGM rejection_count reset + MOTHER_CYCLE=326 | commit 5a765f4

### Conselho V109 (C327-C334)
- [x] **C327** — LFSA v3.0: Plan→Execute→Assemble com seções paralelas | commit 5a765f4
- [x] **C328** — Core: OLAR integration + computeDynamicTimeout | commit 5a765f4
- [x] **C329** — output-length-estimator.ts: detector de complexidade semântica | commit 5a765f4
- [x] **C330** — OBT Framework: 7 testes comportamentais (OBT-001 a OBT-007) | commit 5a765f4
- [x] **C331** — LFSA: wordsPerSection 1500→1000 + max(wordsPerSection * 3) | commit 5a765f4
- [x] **C332** — Outline tokens 2000→1200 (-40% latência) + instrução conciseness | commit 5a765f4
- [x] **C333** — MOTHER_CITATION_DEBUG=true em cloudbuild.yaml | commit 5a765f4
- [x] **C334** — DGM rejection_count reset + MOTHER_CYCLE=334 em cloudbuild.yaml | commit 5a765f4

### Conselho V110 (C335-C346)
- [x] **C335** — Anti-version-hallucination fix: ORCHESTRATOR_VERSION v82.4→v122.24 + ANTI-PATTERN RULES em buildSystemPrompt() | commit 5a765f4 | Cloud Build f56514ef ✅
- [x] **C336** — OBT framework: SSE token parsing fix + execução pré-deploy | commit 5a765f4
- [x] **C337** — DGM SQL reset verificado: 0 proposals bloqueadas | SQL executado 2026-03-12
- [x] **C338** — Citation monitoring: MOTHER_CITATION_DEBUG=true ativo | baseline 40%
- [x] **C339** — Latency validation: G-Eval _smart_sample() corrigido | 38.4s avg
- [x] **C340** — SUS UX improvements: UX-3 sidebar filter, UX-4 suggestion chips, UX-5 citation indicator | commit c2042b3 ✅
- [x] **C341** — DPO pairs collection: BLOQUEADO (acesso Cloud SQL requer proxy) | aguardar 7 dias produção
- [x] **C342** — OBT re-validation: **92.3% (12/13)** ✅ GATE PASS | OBT-001/003 PASS (C335 funcionou)
- [x] **C343** — G-Eval re-validation: **100% (15/15)** ✅ | avg score 94.9/100 | GATE PASS
- [x] **C344** — Citation rate validation: 40% ❌ (gate ≥50%) | análise: checker subestima taxa real
- [x] **C346** — HOTFIX 'sistema sobrecarregado': REVERTIDO por degradação de qualidade | ver ERRO-C346-ParaConselho.md

---

## CICLOS PENDENTES 🔲

### C347 — Citation Checker Refinement (ALTA PRIORIDADE)
- [ ] **C347** — Refinar OBT-007 e G-Eval citation checker para aceitar formato "Autor (Ano)"
  - **Gate:** OBT ≥95% (13/13), Citation Rate ≥60%
  - **Arquivos:** `tests/e2e/c330-obt-framework.py`, `tests/e2e/run_geval_final.py`
  - **Ação:** Adicionar padrão `r'[A-Z][a-z]+\s+et\s+al\.,?\s+\d{4}'` e `r'[A-Z][a-z]+,\s+\d{4}'`

### C348 — Fix 'Sistema Sobrecarregado' (CRÍTICA — CONSELHO V111)
- [ ] **C348** — Implementar solução aprovada pelo Conselho para bug C346
  - **Opções:** Ver ERRO-C346-ParaConselho.md
  - **Recomendação:** Opção B (Budget Split 70/30) como fix imediato
  - **Gate:** MOTHER responde a query "escreva um resumo de 15 páginas" sem erro

### C349 — Latência P95 Investigation (MÉDIA PRIORIDADE)
- [ ] **C349** — Investigar P95=61.4s em queries creative/complex
  - **Gate:** P95 ≤45s
  - **Análise:** creative (61.4s) e complex (57.0s) são LFSA — latência esperada
  - **Ação:** Verificar se LFSA pode usar streaming para reduzir TTFT

### C341-B — DPO Pairs Collection (ALTA PRIORIDADE — aguardar 7 dias)
- [ ] **C341-B** — Re-executar coleta de pares DPO após 7 dias de produção
  - **Gate:** >500 pares de preferência
  - **Script:** `python3 scripts/collect_dpo_pairs.py --min-quality=0.8 --limit=1000`
  - **Dependência:** Acesso ao Cloud SQL via proxy

### C345 — SUS Measurement Post-UX (BAIXA PRIORIDADE)
- [ ] **C345** — Medir SUS após C340 UX improvements
  - **Gate:** SUS ≥80 (atual: 72)
  - **Método:** Teste com 5 usuários (Brooke 1996, SUS scale)

---

## MÉTRICAS ATUAIS

| Métrica | Baseline v87.0 | v122.22 | v122.24 (atual) | Gate Final |
|---------|---------------|---------|-----------------|-----------|
| G-Eval Pass Rate | 55% | 80% ✅ | **100%** ✅ | ≥90% |
| G-Eval Avg Score | — | 85 | **94.9** ✅ | ≥85 |
| OBT Pass Rate | 0% | — | **92.3%** ✅ | ≥90% |
| Citation Rate | 0% | 40% | **40%** ❌ | ≥80% |
| Avg Latência | 28s | 39.4s | **38.4s** ❌ | ≤30s |
| P95 Latência | — | — | **61.4s** | ≤45s |
| TypeScript Errors | — | 0 ✅ | **0** ✅ | 0 |
| Gate Tests | — | 26/26 ✅ | **26/26** ✅ | 26/26 |
| bd_central | 5k | 13.9k | **250** | — |
| Bug Aberto | — | — | **1** ⚠️ | 0 |

---

## BUGS ABERTOS

| Bug | Descrição | Prioridade | Ciclo |
|-----|-----------|-----------|-------|
| **BUG-001** | 'Sistema sobrecarregado' para LONG/VERY_LONG quando Google lento | CRÍTICA | C348 |
| **BUG-002** | OBT-007-A falso negativo (checker não detecta "Autor, Ano") | BAIXA | C347 |
| **BUG-003** | G-Eval citation checker subestima taxa real | BAIXA | C347 |

---

## REGRAS CRÍTICAS

1. **ORCHESTRATOR_VERSION SYNC (C335):** Ao atualizar `MOTHER_VERSION`, SEMPRE atualizar `ORCHESTRATOR_VERSION` no mesmo commit.
2. **G-Eval LFSA (C335):** Usar `_smart_sample(text, 6000)` para respostas >2500 chars.
3. **OBT SSE (C336):** Usar `data.text || data.token || data.content` para tokens SSE.
4. **OLAR Budget Reserve (C346):** `timeoutMs_primary < totalBudgetMs × 0.70` — reservar ≥30% para fallback.
5. **Qualidade LONG/VERY_LONG (C346):** NUNCA substituir gemini-2.5-pro sem aprovação do Conselho.

---

*Roadmap V61 gerado por Manus AI em 2026-03-12 | Conselho V110 (5/5 consenso)*
