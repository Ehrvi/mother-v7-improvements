# TODO — ROADMAP V62 — MOTHER v122.24 — Ciclo C346 — Conselho V111
**Data:** 2026-03-12 | **Versão:** v122.24 | **Predecessor:** Roadmap V61

---

## LEGENDA

- [x] CONCLUÍDO
- [~] REVERTIDO / CANCELADO
- [ ] PENDENTE
- [!] BLOQUEADO

---

## CICLOS CONCLUÍDOS (C335-C344)

- [x] **C335** — Anti-Version-Hallucination: ORCHESTRATOR_VERSION v82.4→v122.24, buildSystemPrompt dinâmico, ANTI-PATTERN RULES | Deploy: f56514ef SUCCESS
- [x] **C336** — OBT Framework Validation: 76.9% pré-deploy | SSE token parsing fix
- [x] **C337** — DGM SQL Reset: 0 proposals bloqueadas | Sistema limpo
- [x] **C338** — Citation Rate Monitoring: MOTHER_CITATION_DEBUG=true ativo | Baseline 40%
- [x] **C339** — Latency Validation: avg 38.4s | G-Eval smart sampling implementado
- [x] **C340** — UX Improvements: UX-3 sidebar filter + UX-4 suggestion chips + UX-5 citation indicator | Deploy: 9fb1699a SUCCESS
- [x] **C341** — DPO Pairs: Bloqueado (sem tabela TiDB) — registrado para C350
- [x] **C342** — OBT Re-Validation pós-C335: **92.3%** (12/13) ✅ Gate PASS
- [x] **C343** — G-Eval Re-Validation pós-C335: **100%** (15/15) ✅ Gate PASS | avg 94.9/100
- [x] **C344** — Citation Rate Validation: 40% ❌ Gate FAIL | Fix em C348
- [~] **C345** — SUS Measurement: Pendente (requer usuários reais) — movido para C350
- [~] **C346** — HOTFIX Google Timeout: REVERTIDO (degradação de qualidade) | Solução correta em C349

---

## CONSELHO V111 — SESSÃO 2026-03-12

- [x] **Convocação do Conselho V111** — Protocolo Delphi + MAD | 6 membros | 2 rodadas
- [x] **Diagnóstico de Manus** — Alignment Tax Invertido identificado como causa central
- [x] **Pesquisa estado da arte** — arXiv:2501.07889, arXiv:2502.05605, arXiv:2405.10203
- [x] **Relatório Final V111** — CONSELHO_V111_RELATORIO_FINAL.md gerado
- [x] **bd_central atualizado** — 9 entradas do Conselho V111 | Total: 262 entradas
- [x] **AWAKE V316** — Escrito com seção de inicialização do agente atualizada
- [x] **Roadmap V62** — Este arquivo

---

## CICLOS APROVADOS PELO CONSELHO V111 (PRÓXIMOS)

### C347 — APQS: Adaptive Parallel Quality Stack ⭐ PRIORIDADE 1
**Objetivo:** Implementar grupos paralelos de qualidade no core-orchestrator.ts
**Spec técnica:**
```typescript
// core-orchestrator.ts
interface QualityLayerSpec {
  name: string;
  activationCondition: (q: QueryAnalysis) => boolean;
  parallelGroup: 0 | 1 | 2 | 3; // 0=sequencial, 1-3=paralelo
  timeoutMs: number;
  fallbackBehavior: 'skip' | 'degrade' | 'critical';
}
// Grupo 0 (sequencial): OLAR + G-Eval
// Grupo 1 (paralelo): Self-Refine + Constitutional AI
// Grupo 2 (paralelo): F-DPO + CitationEngine
// Grupo 3 (paralelo): LongCoT + TTC
```
**Critério de sucesso:** OBT ≥95% | G-Eval avg ≥92 | Latência +≤8s
**Estimativa:** 16 horas
**Base:** Zhang et al. arXiv:2501.07889 | Kumar & Li NeurIPS 2024
- [ ] Implementar `QualityLayerSpec` interface
- [ ] Implementar grupos paralelos com `Promise.allSettled()`
- [ ] Implementar ativação condicional baseada em `query_analysis`
- [ ] Implementar `fallbackBehavior` para cada camada
- [ ] Atualizar MOTHER_VERSION para v122.25
- [ ] TypeScript check (0 erros)
- [ ] OBT re-validation (meta ≥95%)
- [ ] G-Eval re-validation (meta ≥92 avg)
- [ ] Deploy + Cloud Build

### C348 — Semantic Citation Trigger + OLAR Semantic Complexity ⭐ PRIORIDADE 2
**Objetivo:** (1) Semantic citation trigger via embedding similarity. (2) OLAR semantic complexity score.
**Spec técnica:**
```typescript
// citation-engine.ts
async function shouldApplyCitationEngine(query: string, response: string): Promise<boolean> {
  const embedding = await getEmbedding(response);
  const factualSimilarity = await cosineSimilarity(embedding, FACTUAL_CORPUS_CENTROID);
  return factualSimilarity > 0.72; // threshold consensuado pelo Conselho V111
}

// output-length-estimator.ts
function computeSemanticComplexityScore(query: string): number {
  const intentDepth = analyzeIntentDepth(query);
  const entityDensity = countEntities(query) / query.split(' ').length;
  const temporalScope = detectTemporalScope(query);
  const outputFormatComplexity = estimateOutputFormat(query);
  return (intentDepth * 0.4) + (entityDensity * 0.2) + (temporalScope * 0.2) + (outputFormatComplexity * 0.2);
}
```
**Critério de sucesso:** Citation rate ≥80% | LFSA ativação correta ≥90%
**Estimativa:** 12 horas
**Base:** Liu et al. arXiv:2405.10203 | Wu et al. Nature Communications 2025
- [ ] Implementar semantic citation trigger com embedding similarity
- [ ] Implementar `computeSemanticComplexityScore()` no OLAR
- [ ] Treinar MLP classifier em 500 exemplos anotados (ou usar heurística)
- [ ] Fix OBT-007-A checker (detectar citações inline [1], [2])
- [ ] Atualizar MOTHER_VERSION para v122.26
- [ ] TypeScript check (0 erros)
- [ ] Citation rate validation (meta ≥80%)
- [ ] OBT-007-A re-validation
- [ ] Deploy + Cloud Build

### C349 — Budget Reserve + G-Eval Directed Self-Refine ⭐ PRIORIDADE 3
**Objetivo:** (1) Fix C346 sem degradar qualidade. (2) Self-Refine direcionado por G-Eval scores.
**Spec técnica:**
```typescript
// core-orchestrator.ts
const BUDGET_RESERVE_RATIO = 0.35;

function shouldSkipGoogleProvider(remainingBudget: number, totalBudget: number): boolean {
  return remainingBudget < totalBudget * BUDGET_RESERVE_RATIO;
}

// Em executeIteration():
if (provider === 'google' && shouldSkipGoogleProvider(remainingBudget, totalBudget)) {
  logger.warn('[OLAR] Budget reserve threshold reached, skipping Google provider');
  return await callFallbackProvider(query, context);
}

// self-refine.ts
async function directedSelfRefine(response: string, gevalScores: GEvalScores): Promise<string> {
  const weakDimensions = Object.entries(gevalScores)
    .filter(([_, score]) => score < 85)
    .map(([dim]) => dim);
  
  if (weakDimensions.length === 0) return response; // já está bom
  
  const refinementPrompt = `Melhore especificamente: ${weakDimensions.join(', ')}. Não altere o que já está bom.`;
  return await llm.refine(response, refinementPrompt);
}
```
**Critério de sucesso:** Zero "sistema sobrecarregado" para queries LONG | G-Eval avg ≥95
**Estimativa:** 8 horas
**Base:** Zeng et al. arXiv:2502.05605 | Conselho V111 Q4+Q5
- [ ] Implementar `BUDGET_RESERVE_RATIO = 0.35` em `core-orchestrator.ts`
- [ ] Implementar `shouldSkipGoogleProvider()` function
- [ ] Implementar `directedSelfRefine()` com G-Eval scores por dimensão
- [ ] Integrar G-Eval scores como input do Self-Refine Phase 3
- [ ] Atualizar MOTHER_VERSION para v122.27
- [ ] TypeScript check (0 erros)
- [ ] Teste: query "escreva um resumo de 15 páginas" → DEVE responder sem "sobrecarregado"
- [ ] G-Eval re-validation (meta ≥95 avg)
- [ ] Deploy + Cloud Build

---

## CICLOS FUTUROS PLANEJADOS

### C350 — SUS Survey + DPO Pairs Collection
- [ ] Implementar SUS survey no frontend (10 perguntas padrão)
- [ ] Criar tabela `dpo_pairs` em TiDB Cloud
- [ ] Implementar coleta automática de pares DPO via API
- [ ] Meta: 500 pares para fine-tuning

### C351 — OBT Re-Validation Completa (pós-C347-C349)
- [ ] Executar OBT framework completo (13 testes)
- [ ] Meta: ≥95% pass rate
- [ ] Documentar resultados

### C352 — G-Eval Re-Validation Completa (pós-C347-C349)
- [ ] Executar G-Eval final (15 queries)
- [ ] Meta: ≥95% pass rate, avg ≥95
- [ ] Documentar resultados

---

## MÉTRICAS ALVO (pós-C347-C349)

| Métrica | Atual (v122.24) | Meta C347 | Meta C348 | Meta C349 | Gate Final |
|---------|-----------------|-----------|-----------|-----------|-----------|
| G-Eval Pass Rate | 100% ✅ | 100% | 100% | 100% | ≥90% |
| G-Eval Avg Score | 94.9 ✅ | ≥92 | ≥93 | ≥95 | ≥90 |
| OBT Pass Rate | 92.3% ✅ | ≥95% | ≥95% | ≥95% | ≥90% |
| Citation Rate | 40% ❌ | 40% | ≥80% | ≥80% | ≥80% |
| Avg Latência | 38.4s ❌ | ≤35s | ≤32s | ≤30s | ≤30s |
| Qualidade Subjetiva | 65% ❌ | ≥80% | ≥85% | ≥90% | ≥90% |
| "Sobrecarregado" | ~30% queries longas ❌ | ~30% | ~30% | 0% | 0% |

---

*Roadmap V62 — MOTHER v122.24 — Conselho V111 — 2026-03-12*
*Gerado por Manus AI com base nos resultados do Conselho dos 6 V111*
