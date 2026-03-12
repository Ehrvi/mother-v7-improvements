# TODO — ROADMAP V58 — MOTHER v122.22 — Conselho V109 — C327-C335
## Data: 2026-03-12 | Predecessor: Roadmap V57 (C321-C326 concluídos)

---

## CICLOS CONCLUÍDOS ✅

- [x] **C321** — Semantic Complexity Detector v2.0 + Citation Engine fix (commit 796f675)
- [x] **C322** — CoT explícito (5 passos) + Template condicional de formatação (commit 796f675)
- [x] **C323** — Framework de testes gate — 26/26 passaram (commit 796f675)
- [x] **C324** — Token-level SSE streaming em long-form-engine-v3.ts (commit 91cefdb)
- [x] **C325** — Adaptive threshold telemetry em output-length-estimator.ts (commit 91cefdb)
- [x] **C326** — G-Eval baseline medida: 80% pass rate (gate atingido) (commit 0d30ab7)

---

## CICLOS PENDENTES — QUALIDADE LFSA (Conselho V109 — Prioridade CRÍTICA)

### C327 — long-form-engine-v3.ts — 4 Bugs Críticos
**Gate:** OBT-001 ≥85% pass rate | **Dependência:** Nenhuma | **Prioridade:** CRÍTICA

- [ ] BUG 1: Substituir versão hardcoded `"v122.19"` por `${MOTHER_VERSION}` dinâmico
- [ ] BUG 2: Adicionar `LFSA_CONSTITUTIONAL_CONSTRAINTS` (anti-auto-referência)
- [ ] BUG 3: Adicionar anti-placeholder em `LFSA_CONSTITUTIONAL_CONSTRAINTS`
- [ ] BUG 4: Corrigir escopo de `isProg` — determinar em `generateLongFormV3` via `isProgrammingContent` param
- [ ] Adicionar interface `LongFormV3Request` com novos parâmetros de qualidade
- [ ] TypeScript check 0 erros

### C328 — core.ts — 3 Bugs Altos
**Gate:** OBT-001 score ≥90% | **Dependência:** C327 | **Prioridade:** ALTA

- [ ] BUG 5: Implementar `extractSemanticTitle()` — normaliza query para título semântico
- [ ] BUG 6: Passar `minWordsPerSection: 600`, `versionString: MOTHER_VERSION`, `systemRules` para `generateLongFormV3`
- [ ] BUG 8: Incluído em `extractSemanticTitle()` — normalização semântica
- [ ] TypeScript check 0 erros

### C329 — output-length-estimator.ts — 2 Bugs Médios
**Gate:** CS ≥4 para query "escreva um livro sobre TypeScript" | **Dependência:** C327 | **Prioridade:** ALTA

- [ ] BUG 7: Adicionar 'livro', 'book', 'manual', 'guia', 'guide', 'handbook' a `SEMANTIC_ARTIFACT_NOUNS` com peso 2.0
- [ ] BUG 9: Retornar `complexitySignals = computeSemanticComplexity(query)` no path Heurística 4 (não mais undefined)
- [ ] TypeScript check 0 erros

### C330 — tests/e2e/ — Framework OBT Completo
**Gate:** 90% OBT pass rate (OBT-001 a OBT-010) | **Dependência:** C328 | **Prioridade:** ALTA

- [ ] Implementar `tests/e2e/c327-obedience-quality-tests.py` com OBT-001 a OBT-010
- [ ] OBT-001: Livro TypeScript (anti-auto-ref, anti-placeholder, ≥5 code blocks, ≥3000 words)
- [ ] OBT-002: Plano de estudos Python (cronograma, ≥1500 words)
- [ ] OBT-003: Factual curta (≤2000 words, sem LFSA indevido)
- [ ] OBT-004: Identidade de versão (versão correta)
- [ ] OBT-005: Tutorial React (≥3 code blocks, ≥2000 words)
- [ ] OBT-006 a OBT-010: Casos de borda (multilingual, coding, creative, complex, edge)
- [ ] Executar contra produção pós-C327-C329 — verificar ≥90% pass rate

### C331 — long-form-engine-v3.ts — maxTokens Dinâmico
**Gate:** Seções LFSA com ≥600 palavras | **Dependência:** C328 | **Prioridade:** MÉDIA

- [ ] Implementar `maxTokensPerSection` dinâmico (default: 12000, configurável)
- [ ] Calcular `sectionMaxTokens = Math.max(12000, wordsPerSection * 3)`
- [ ] TypeScript check 0 erros

### C332 — core.ts — Outline Paralelo (TeleRAG)
**Gate:** Latência média ≤30s | **Dependência:** C329 | **Prioridade:** MÉDIA

- [ ] Implementar outline paralelo: `Promise.all([generateOutline(), emitHeader()])`
- [ ] Reduzir `maxTokens` do outline de 2000 para 1200
- [ ] Verificar latência média ≤30s via G-Eval

### C333 — citation-engine.ts — Citation Rate ≥80%
**Gate:** Citation rate ≥80% | **Dependência:** C330 | **Prioridade:** MÉDIA

- [ ] Ativar `MOTHER_CITATION_DEBUG=true` por 48h em produção
- [ ] Implementar fallback para Semantic Scholar timeout
- [ ] Verificar citation rate ≥80% via logs

### C334 — dgm-orchestrator.ts — Fix DGM 8 Falhas
**Gate:** DGM pass rate ≥70% | **Dependência:** C330 | **Prioridade:** BAIXA

- [ ] Investigar as 8 propostas DGM com status "Falhou na implementação"
- [ ] Identificar padrão de falha (kill switch após 3 falhas?)
- [ ] Implementar recovery mechanism
- [ ] Verificar DGM pass rate ≥70%

### C335 — Validação Final
**Gate:** G-Eval ≥90%, OBT ≥90% | **Dependência:** C334 | **Prioridade:** BAIXA

- [ ] Re-executar G-Eval completo (20 queries × GPT-4o juiz)
- [ ] Re-executar OBT-001 a OBT-010
- [ ] Verificar todas as métricas: Pass Rate ≥90%, Latência ≤30s, Citation ≥80%, OBT ≥90%
- [ ] Criar AWAKE V315 com resultados finais
- [ ] Convocar Conselho V110 para validação

---

## MÉTRICAS ATUAIS vs TARGETS

| Métrica | Atual (v122.22) | Target (C335) | Status |
|---------|----------------|---------------|--------|
| G-Eval Pass Rate | 80% | ≥90% | ⚠️ Abaixo do target |
| OBT-001 (Livro TypeScript) | FAIL | ≥85% | ❌ Crítico |
| Latência Média | 39.4s | ≤30s | ❌ Fora do gate |
| Citation Rate | 40% | ≥80% | ❌ Fora do gate |
| DGM Pass Rate | ~0% | ≥70% | ❌ Crítico |
| LFSA Quality Score | ~42/100 | ≥85/100 | ❌ Crítico |

---

## REFERÊNCIAS CIENTÍFICAS (Conselho V109)

1. Bai et al., Constitutional AI, arXiv:2212.08073, 2022
2. Ouyang et al., InstructGPT, NeurIPS 2022
3. Liang et al., HELM, arXiv:2211.09110, 2022
4. Asai et al., Self-RAG, arXiv:2310.11511, 2023
5. Liu et al., G-Eval, arXiv:2303.16634, 2023
6. Liu et al., TeleRAG, arXiv:2502.20969, 2026
7. Gu et al., CiteGuard, arXiv:2510.17853, 2025

---

*Roadmap V58 — MOTHER v122.22 — Conselho V109 — 2026-03-12*  
*Predecessor: V57 (C321-C326) | Próximo: V59 (após C327-C329)*
