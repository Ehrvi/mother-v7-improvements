# ROADMAP V63 — MOTHER v122.25 — Ciclo C349 — Conselho V111

**Data:** 2026-03-12 | **Versão:** v122.25 | **Ciclo Atual:** C349 | **Conselho:** V111
**Predecessor:** Roadmap V62 (MOTHERv122.24, CicloC346, ConselhoV111)

---

## LEGENDA

- `[x]` Concluído
- `[ ]` Pendente
- `[!]` Bloqueado / Revertido
- `[~]` Em andamento

---

## CICLOS CONCLUÍDOS (C335-C349)

- [x] **C335** — Anti-version-hallucination: ORCHESTRATOR_VERSION sync + anti-auto-reference rules em buildSystemPrompt() | v122.24 | 2026-03-12
- [x] **C336** — OBT Framework fix: SSE token parsing corrigido (sem 'type' field) | 2026-03-12
- [x] **C337** — DGM SQL Reset: verificação de proposals bloqueadas (0 rows) | 2026-03-12
- [x] **C338** — Citation monitoring: MOTHER_CITATION_DEBUG=true ativo | 2026-03-12
- [x] **C339** — Latency validation: dados coletados (38.4s avg) | 2026-03-12
- [x] **C340** — UX-3 sidebar filter + UX-4 suggestion chips + UX-5 citation indicator | v122.24 | 2026-03-12
- [!] **C341** — DPO pairs collection: BLOQUEADO — tabela dpo_pairs não existe em TiDB | Pendente C350
- [x] **C342** — OBT re-validation pós-C335: 92.3% (12/13) ✅ | 2026-03-12
- [x] **C343** — G-Eval re-validation pós-C335: 100% (15/15), avg 94.9/100 ✅ | 2026-03-12
- [x] **C344** — Citation rate validation: 40% (checker subestima taxa real) | 2026-03-12
- [ ] **C345** — SUS measurement: pendente usuários reais | Movido para C350
- [!] **C346** — HOTFIX Google timeout: REVERTIDO (degradação de qualidade) | Para Conselho V112
- [x] **C347** — APQS Coherence Verifier: Checker 6 no grupo paralelo Ciclo 72 | v122.25 | 2026-03-12
- [x] **C348** — Semantic Citation trigger: 4 sinais semânticos (statistics, sci_terms, causal_claims, named_entities) | v122.25 | 2026-03-12
- [x] **C349** — Budget Reserve 0.35 + Directed Self-Refine (Layer 5.8) | v122.25 | 2026-03-12

---

## CICLOS PLANEJADOS (C350-C355)

### C350 — OBT + G-Eval Re-Validation Final (v122.25)
**Prioridade:** 1 (urgente — validar C347-C349)
**Objetivo:** Confirmar que C347-C349 melhoraram as métricas
**Critério de sucesso:**
- OBT: ≥95% (melhoria sobre 92.3%)
- G-Eval: ≥90%, avg ≥92/100
- Citation rate: ≥80% (melhoria sobre 40%)
- Zero "sistema sobrecarregado" em queries LONG
**Estimativa:** 2h (aguardar resultados em andamento)
**Dependências:** Cloud Build 73f31db7 SUCCESS

### C351 — OLAR Semantic Complexity (Conselho V111 Q3)
**Prioridade:** 2
**Objetivo:** Implementar `semantic_complexity_score` para melhorar ativação LFSA
**Spec:**
```typescript
// semantic_complexity_score = f(intent_depth, entity_density, temporal_scope, output_format_complexity)
// Threshold: score > 0.65 → ativar LFSA
// Base: Conselho V111 Q3 + Liu et al. arXiv:2405.10203
```
**Critério de sucesso:** LFSA ativação correta +35%
**Estimativa:** 8h
**Dependências:** C350 concluído

### C352 — DPO Pairs Collection (C341 desbloqueado)
**Prioridade:** 3
**Objetivo:** Criar tabela `dpo_pairs` em TiDB e implementar coleta automática
**Spec:**
```sql
CREATE TABLE dpo_pairs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  query TEXT NOT NULL,
  chosen TEXT NOT NULL,
  rejected TEXT NOT NULL,
  score_chosen FLOAT,
  score_rejected FLOAT,
  category VARCHAR(100),
  cycle VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
**Critério de sucesso:** ≥100 pares DPO coletados de C327-C349
**Estimativa:** 4h

### C353 — SUS Survey no Frontend (C345 desbloqueado)
**Prioridade:** 4
**Objetivo:** Implementar System Usability Scale (SUS) no frontend MOTHER
**Spec:** 10 questões SUS após 5 interações com MOTHER
**Critério de sucesso:** SUS score ≥ 80 (Good)
**Estimativa:** 6h

### C354 — Convocar Conselho V112
**Prioridade:** 5
**Objetivo:** Discutir resultados C347-C353 e planejar C355-C360
**Agenda:**
1. Resultados C347-C349 (métricas finais)
2. Erro C346 — gemini-2.5-pro disponibilidade
3. OLAR Semantic Complexity (Q3 Conselho V111)
4. Qualidade subjetiva 65% → 90% — estratégia
5. DPO fine-tuning roadmap
**Estimativa:** 3h (Delphi + MAD)

### C355 — Qualidade Subjetiva 65% → 90%
**Prioridade:** 6 (pós-Conselho V112)
**Objetivo:** Implementar recomendações do Conselho V112 para qualidade subjetiva
**Dependências:** C354 concluído
**Estimativa:** 20h

---

## MÉTRICAS GATE (CRITÉRIOS DE SUCESSO FINAL)

| Métrica | Atual (v122.25) | Gate Final | Status |
|---------|-----------------|-----------|--------|
| G-Eval Pass Rate | 🔄 (100% parcial) | ≥90% | 🔄 |
| G-Eval Avg Score | 🔄 | ≥92/100 | 🔄 |
| OBT Pass Rate | 🔄 (100% parcial) | ≥95% | 🔄 |
| Citation Rate | 🔄 (C348 ativo) | ≥80% | 🔄 |
| Avg Latência | 38.4s | ≤30s | ❌ |
| TypeScript Errors | 0 ✅ | 0 | ✅ |
| Gate Tests | 26/26 ✅ | 26/26 | ✅ |
| "Sobrecarregado" | 🔄 (C349 ativo) | 0% | 🔄 |
| Qualidade Subjetiva | 65% | ≥90% | ❌ |
| SUS Score | N/A | ≥80 | ⏳ |

---

## ARQUIVOS CHAVE

| Arquivo | Localização | Descrição |
|---------|-------------|-----------|
| AWAKE V317 | `/home/ubuntu/upload/AWAKEV317—MOTHERv122.25—CicloC349—ConselhoV111.md` | Protocolo de inicialização atual |
| Roadmap V63 | Este arquivo | Roadmap atual |
| Conselho V111 | `/home/ubuntu/upload/CONSELHO_V122.24_RELATORIO_FINAL.md` | Relatório do Conselho V111 |
| Diagnóstico Manus | `/home/ubuntu/upload/MANUS_DIAGNOSTICO_CONSELHO_V111.md` | Análise técnica do código de qualidade |
| Erro C346 | `/home/ubuntu/upload/ERROC346—ParaDiscussãocomoConselho.md` | Para Conselho V112 |

---

*Roadmap V63 — MOTHER v122.25 | Gerado por Manus AI em 2026-03-12*
