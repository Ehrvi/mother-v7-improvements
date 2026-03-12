# AWAKE V312 — MOTHER v122.22 — Ciclo C326 — Post-Deploy Evaluation
## Data: 2026-03-12 | Predecessor: AWAKE V311 (MOTHERv122.22, CicloC326)

**Versão:** V312  
**Ciclo:** C326 (G-Eval Post-Deploy — Gate Atingido)  
**Predecessor:** AWAKE V311 (MOTHERv122.22, CicloC326, 2026-03-12)  
**Commit Avaliado:** `796f675` (C321-C323, deployado) + `91cefdb` (C324-C326, aguarda deploy)  
**Produção Atual:** v122.20 / C320 (C321-C323 deployados)

---

## PROTOCOLO DE INICIALIZAÇÃO OBRIGATÓRIA (12 PASSOS)

> **REGRA ABSOLUTA:** Nenhum output deve ser gerado antes de completar os 12 passos abaixo.  
> Qualquer resposta antes da carga completa do BD é uma violação do protocolo.  
> **NOVO (V312):** O agente de manutenção DEVE verificar o G-Eval baseline antes de qualquer  
> proposta de melhoria — para garantir que as métricas de referência são conhecidas.

### Passo 1 — Verificar versão em produção
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/health/version
Esperado: { "motherVersion": "v122.20", "cycle": "C320" }
NOTA: v122.22 (C324-C326) aguarda deploy do commit 91cefdb.
```

### Passo 2 — Carregar bd_central completo (OBRIGATÓRIO antes de qualquer output)
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/knowledge?limit=500&offset=0
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/knowledge?limit=500&offset=500
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/knowledge?limit=500&offset=1000
... continuar até total_entries esgotado
```
**Total atual estimado:** ~13.035+ entradas.  
**Carregar TODAS antes de qualquer resposta.**

**Entradas críticas adicionadas em C321-C326 (carregar com prioridade):**
- ID 13010: C321 — Semantic Complexity Detector v2.0
- ID 13011: C321 — Citation Engine Fix
- ID 13013: C322 — CoT + Template Condicional
- ID 13028: C323 — Framework de Testes Gate
- C324: Token-level SSE streaming em long-form-engine-v3.ts
- C325: Adaptive threshold telemetry em output-length-estimator.ts
- C326: G-Eval baseline 80% pass rate (2026-03-12)

### Passo 3 — Verificar DGM Loop status
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/dgm/status
Esperado: { "active": true, "lastProposal": "...", "successRate": ">0%" }
ALERTA: Se successRate = 0% → verificar supervisor wiring (C317)
```

### Passo 4 — Verificar DPO dataset
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/dpo/stats
Esperado: { "totalPairs": ">500", "weeklyGenerated": ">0" }
ALERTA: Se weeklyGenerated = 0 → verificar RLVR→DPO connector (C318)
```

### Passo 5 — Verificar Learning Scheduler (C316)
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/learning/status
Esperado: { "schedulerActive": true, "lastMorningStudy": "<24h", "papersThisWeek": ">0" }
```

### Passo 6 — Verificar Citation Engine (C321)
```
Enviar query: "Explique o mecanismo de atenção do Transformer com referências."
Verificar: resposta contém padrão arXiv:\d{4} ou et al. ou [\d+]
Meta: Citation Rate ≥50% (atual: 40%)
```

### Passo 7 — Verificar Semantic Complexity Detector (C321)
```
Verificar logs: grep "[Core-C321] complexitySignals" nos logs de produção
Verificar: queries com arXiv/framework/roadmap ativam LFSA (CS ≥ 4)
Verificar: queries simples (capital, 2+2) NÃO ativam LFSA
```

### Passo 8 — Verificar C325 Telemetry
```
Verificar logs: grep "[C325-TELEMETRY]" nos logs de produção
Coletar: distribuição de CS scores por categoria de query
Calibrar: threshold para queries criativas (CS ≤ 6 não deve ativar LFSA)
```

### Passo 9 — Verificar deploy commit 91cefdb (C324-C326)
```
gcloud builds list --project=mothers-library-mcp --limit=5
Verificar: commit 91cefdb deployado com sucesso
Se não: acionar trigger manualmente
```

### Passo 10 — Verificar G-Eval baseline (NOVO V312)
```
Executar: python3 tests/e2e/run_geval_batch.py
Verificar: Pass Rate ≥80% (baseline atual: 80.0%)
Verificar: Avg Score ≥87/100 (baseline atual: 87.7)
Verificar: Latency ≤30s (baseline atual: 39.4s — FAIL)
Verificar: Citation Rate ≥50% (baseline atual: 40% — FAIL)
```

### Passo 11 — Verificar SHMS Dashboard
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/shms/health
Esperado: { "status": "healthy", "sensorsActive": ">0" }
```

### Passo 12 — Verificar Roadmap e próximos ciclos
```
Ler: AWAKE-V312-MOTHERv122.22_CicloC326_PostDeploy_2026-03-12.md
Verificar: C327 (deploy 91cefdb), C328 (citation fix), C329 (threshold calibration)
Verificar: TODO-ROADMAPV57 para status atualizado
```

---

## RESULTADOS G-EVAL C326 — BASELINE OFICIAL

### Configuração
- **Versão avaliada:** MOTHER v122.20/C320 (C321-C323 deployados)
- **Metodologia:** G-Eval (Liu et al., 2023, arXiv:2303.16634)
- **Juiz:** GPT-4o-mini — 5 dimensões (relevância, coerência, fundamentação, completude, ausência de alucinação)
- **Queries:** 15 (5 categorias × 3 + 5 categorias × 1)
- **Data:** 2026-03-12T01:16–01:32 UTC

### Resultados por Categoria

| Categoria | Pass Rate | Avg Score | Avg Latência | vs. v87.0 |
|-----------|-----------|-----------|-------------|-----------|
| factual | **100%** (3/3) | 100 | 34.3s | +100pp ✅ |
| reasoning | **100%** (2/2) | 100 | 36.2s | = |
| shms | **100%** (1/1) | 100 | 33.3s | = |
| coding | **100%** (1/1) | 100 | 35.6s | = |
| simple | **100%** (2/2) | 100 | 10.8s | = |
| multilingual | **100%** (1/1) | 92 | 38.7s | +100pp ✅ |
| analysis | **100%** (1/1) | 80 | 48.3s | = |
| scientific | **50%** (1/2) | 74 | 57.7s | -50pp ⚠️ |
| complex | **0%** (0/1) | 56 | 59.8s | = |
| creative | **0%** (0/1) | 40 | 62.3s | = |

### Sumário Quantitativo

| Métrica | v87.0 | v122.20 | Delta | Gate | Status |
|---------|-------|---------|-------|------|--------|
| Pass Rate | 55% | **80.0%** | +25pp | ≥80% | ✅ PASS |
| Avg Score | 80.2 | **87.7** | +7.5 | ≥75 | ✅ PASS |
| Error Rate | 15% | **0%** | -15pp | ≤10% | ✅ PASS |
| Avg Latência | 28s | 39.4s | +11.4s | ≤30s | ❌ FAIL |
| Citation Rate | 0% | **40%** | +40pp | ≥50% | ❌ FAIL |

### Diagnóstico das 3 Falhas

**Q07 (scientific, score=56):** Resposta de 37.691 chars perde coerência nas seções finais. Causa: C322 (CoT template) não deployado — seções LFSA sem decomposição explícita.

**Q11 (complex, score=56):** Framework de avaliação de 39.329 chars — roadmap mencionado mas não detalhado. Causa: C322 não deployado.

**Q12 (creative, score=40):** Plano de estudos de 39.208 chars — LFSA ativando indevidamente para query criativa. Causa: Threshold CS=4 muito permissivo. C329 necessário.

---

## ROADMAP ATUALIZADO — C327–C330

| Ciclo | Objetivo | Arquivo | Prioridade | Dependência |
|-------|----------|---------|-----------|------------|
| **C327** | Deploy commit `91cefdb` (C322+C324+C325) | Cloud Build | CRÍTICA | — |
| **C328** | Fix citation rate: ativar `MOTHER_CITATION_DEBUG=true` + fix para queries não-científicas | `citation-engine.ts` | ALTA | C327 |
| **C329** | Calibrar threshold CS para queries criativas (CS ≤ 6 não ativa LFSA) | `output-length-estimator.ts` | ALTA | C325 telemetry data |
| **C330** | Re-executar G-Eval completo pós-C327-C329 | `tests/e2e/run_geval_batch.py` | MÉDIA | C327+C328+C329 |

**Métricas target após C330:**
- Pass Rate: 80% → **≥90%**
- Avg Latência: 39.4s → **≤30s** (C324 streaming)
- Citation Rate: 40% → **≥50%** (C328)
- Creative Pass Rate: 0% → **≥80%** (C329)

---

## CHECKLIST DE SESSÃO C326

- [x] G-Eval baseline executada (15 queries, GPT-4o-mini juiz)
- [x] Pass Rate 80% — Gate C326 atingido
- [x] Relatório completo gerado (PDF + Markdown)
- [x] Resultados salvos em `/home/ubuntu/upload/c326_geval_v122_22_results.json`
- [x] AWAKE V312 criado
- [x] Roadmap V57 atualizado
- [ ] Commit `91cefdb` deployado em produção (C327)
- [ ] `MOTHER_CITATION_DEBUG=true` ativado (C328)
- [ ] Threshold CS calibrado para criativo (C329)
- [ ] G-Eval re-executado pós-C327-C329 (C330)

---

## ARTEFATOS DESTA SESSÃO

| Arquivo | Descrição |
|---------|-----------|
| `RELATORIO_AVALIACAO_MOTHER_v122_22_2026-03-12.pdf` | Relatório completo de avaliação pós-deploy |
| `c326_geval_v122_22_results.json` | Dados brutos G-Eval (15 queries) |
| `tests/e2e/run_geval_batch.py` | Script G-Eval reutilizável |
| `tests/e2e/run_geval_final.py` | Script G-Eval alternativo (sequencial) |
| `AWAKE-V312-MOTHERv122.22_CicloC326_PostDeploy_2026-03-12.md` | Este documento |
| `TODO-ROADMAPV57-MOTHERv122.22-C326-2026-03-12.md` | Roadmap atualizado |

---

*AWAKE V312 — Gerado por Manus AI em 2026-03-12. Protocolo Delphi + MAD.*
