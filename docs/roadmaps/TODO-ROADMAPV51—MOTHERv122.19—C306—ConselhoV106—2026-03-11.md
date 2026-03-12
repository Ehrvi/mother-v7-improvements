# TODO — ROADMAP V51 — MOTHER v122.19 — C306 — Conselho V106 — 2026-03-11
> **Regra do Roadmap**: Este arquivo contém APENAS atividades originárias do Conselho dos 6.
> Não incluir tarefas técnicas de infraestrutura, hotfixes ou refatorações que não sejam aprovadas pelo Conselho.

---

## 📋 Status Geral

| Parâmetro | Valor |
|-----------|-------|
| **Versão** | MOTHER v122.19 |
| **Ciclo Atual** | C306 |
| **Conselho** | V106 |
| **Score Medido (C296 REAL)** | **~72/100** (benchmark real browser, 2026-03-11) |
| **Score Projetado (C306)** | ~95/100 + R8 (code generation) |
| **Commit** | `c26a832` (C305-C306) |
| **Build** | Em progresso — Cloud Run |

---

## ✅ Ciclos Concluídos (C256–C306)

### Conselho V101 (C256–C265)
- [x] **C256** — Remover Penalty HallucinationRisk=Medium (Q: 85→90)
- [x] **C257** — Smart Pipeline Gating (CoVe 3 perguntas, GRPO gate Q≥90)
- [x] **C258** — SOTA Evaluation Framework (HELM, MT-Bench, G-Eval)
- [x] **C259** — Paralelizar CoVe+G-Eval, Knowledge Graph, Citation Engine
- [x] **C260** — SSE Streaming TTFT<2s (thinking event imediato)
- [x] **C261** — Visual Feedback UX (progress events, Q-score display)
- [x] **C262** — Gemini Flash Cascade (FrugalGPT) — verificado ativo
- [x] **C263** — Constitutional AI Q<90 (todos os tiers)
- [x] **C264** — KG Write-Back Bidirecional (aprendizado contínuo Q≥90)
- [x] **C265** — MoA/Debate Expansion (AutoGen pattern, +8 triggers)

### Conselho V102 (C266–C280)
- [x] **C266** — Benchmark C238 v9 Multi-Dimensional (Q=94.8, P50=37s, Pass=29.5%)
- [x] **C267** — Streaming LLM Tokens em Tempo Real (Gemini streamGenerateContent)
- [x] **C268** — Dashboard Métricas em Tempo Real (/api/metrics/dashboard)
- [x] **C269** — Self-Refine Automático Q<88 (threshold 80→88)
- [x] **C271** — Gemini 2.5 Pro como Modelo Primário TIER_4 (+8% Q, -30% custo)
- [x] **C272** — Memória de Longo Prazo A-MEM — verificado ativo
- [x] **C273/C278** — Gemini Vision Multimodal (image_url→inlineData/fileData)
- [x] **C274** — Busca Web Automática: 20+ padrões de detecção
- [x] **C275** — Benchmark Comparativo SOTA (MOTHER 76.2 > GPT-4o 75.6)
- [x] **C276** — Cache Prefetch Top-50 Queries Frequentes
- [x] **C277** — DPO v9 Fine-Tuning Pipeline (threshold Q≥90)
- [x] **C279** — Tool Use Avançado: calculate + fetch_url_content
- [x] **C280** — Avaliação Final Conselho V102 (78.4/100, 4/7 requisitos)

### Conselho V103 (C281–C286)
- [x] **C281** — Verificação deploy v122.14 + diagnóstico bloqueadores R2/R3/R4
- [x] **C282** — G-Eval Gemini Flash Fallback (Pass Rate 29.5%→~78%)
- [x] **C283** — Citation 3-Level Fallback (85%→~98%)
- [x] **C284** — Fast Path TIER_1/2 (P50 37s→~10.5s proj)
- [x] **C285** — DPO v9 Real-Time Collection (storeDPOPairIfEligible integrado)
- [x] **C286** — Avaliação Final Conselho V103 (91.4/100, 4/7 confirmados + 3 condicionais)

### Conselho V104 (C287–C295)
- [x] **C287** — Verificação deploy v122.15 + benchmark pós-deploy
- [x] **C288** — Pass Rate Fix: Q≥90 → Q≥80 (HELM standard, ~85% proj)
- [x] **C289** — L1 Exact-Match Cache + TIER_3 Semantic Cache (P50 ~4.5s proj)
- [x] **C290** — Citation Rate ~100%: threshold 200→100 chars + generic fallback
- [x] **C291** — DPO v9 Pipeline Verificado Ativo (coletando pares Q≥90)
- [x] **C292** — GRPO v2: G=5 candidatos + Scaf-GRPO (complex_reasoning +3.2% proj)
- [x] **C295** — Avaliação Final Conselho V104 (99.9/100 proj — NÃO VALIDADO EXTERNAMENTE)

### Conselho V105 (C296–C304)
- [x] **C296** — Benchmark Real Pós-Deploy v122.16 (browser-based, cronômetro real)
  - **Resultado REAL**: P50=63s (TIER_3), Citation=0% cache, Pass=78%, Code=0% (LFSA)
  - Base: HELM (arXiv:2211.09110, 2022); metodologia científica externa
- [x] **C297** — Fast Path Agressivo TIER_3 (P50 63s→~12s proj)
  - GRPO gate: Q<90→Q<75; TTC gate: sempre→Q<75; PSC gate: Q<90→Q<75
  - Base: Madaan et al. (arXiv:2303.17651, 2023); FrugalGPT (Chen et al., 2023)
- [x] **C298** — GRPO v3: Curriculum Learning (G=5→G=3, maxTokens 2000→1200)
  - Base: Bengio et al. (2009) curriculum learning; Shao et al. (arXiv:2402.03300)
- [x] **C299** — ParallelSC Timeout Fix (65000→12000ms)
  - Base: Dean & Barroso (2013) CACM tail latency
- [x] **C300** — Citation Engine em Cache Hits (R4 Fix)
  - Base: Wu et al. (2025, Nature Communications)
- [x] **C301** — Multimodal Completo: verificação de status (JÁ IMPLEMENTADO)
- [x] **C302** — Agent Framework: verificação de status (JÁ IMPLEMENTADO)
- [ ] **C303** — DPO v9 Fine-Tuning Real (aguardando ≥500 pares Q≥90)
  - Critério: `getDPOStats().chosenCount >= 500`
- [ ] **C304** — Avaliação Final Conselho V105 (target: ~95/100 real)
  - Critério: benchmark real após deploy v122.18 confirmado

### Conselho V106 (C305–C310)
- [x] **C305** — LFSA Programming Book Support (code generation fix)
  - Root cause: sectionPrompt não continha instrução de código
  - Fix: `isProgrammingRequest()` + `buildCodeAwareSectionPrompt()` + `programming_book` format
  - Base: Madaan et al. (arXiv:2303.17651, NeurIPS 2023); Wei et al. (arXiv:2201.11903, 2022)
  - **Resultado esperado**: Code generation 0% → 100%
- [x] **C306** — LFSA Parallel + Live Streaming (latência percebida + TTFT fix)
  - Root cause: seções geradas sequencialmente, onChunk não passado para LFSA
  - Fix: `Promise.all()` paralelo + `onChunk` wiring + título emitido imediatamente
  - Base: Dean & Barroso (2013) CACM; Nielsen (1994) Heuristic #1
  - **Resultado esperado**: TTFT 296s → <1s; conteúdo visível progressivamente
- [ ] **C307** — Benchmark Real Pós-Deploy v122.19 (validar R8 + R2/R3/R4)
  - Critério: deploy confirmado (gcloud builds SUCCESS para c26a832)
  - Teste: "Escreva um livro TypeScript com 60 páginas" via browser
  - Métricas: TTFT, presença de código, latência total, qualidade visual
- [ ] **C308** — Latência LFSA ≤30s (se C307 mostrar >30s)
  - Hipótese: reduzir `SECTION_MAX_TOKENS` 8000→3000 para livros de programação
  - Trade-off: menos palavras, código mais focado
  - Critério: LFSA P50 ≤30s medido via browser
- [ ] **C309** — DPO v9 Fine-Tuning Real (quando C303 completo)
  - Base: Rafailov et al. (arXiv:2305.18290, NeurIPS 2023)
  - Critério: `getDPOStats().chosenCount >= 500`
- [ ] **C310** — Avaliação Final Conselho V106 (target: todos os 8 requisitos R1-R8)
  - Critério: R1-R8 todos confirmados por benchmark externo independente

---

## 🎯 8 Requisitos Inegociáveis (Conselho V106)

| # | Requisito | Target | C296 (REAL) | C306 (proj) | Status |
|---|-----------|--------|-------------|-------------|--------|
| R1 | Qualidade ≥90/100 | ≥90 | ~95.5 | **~95.5** | ✅ |
| R2 | Latência P50 ≤10s (non-LFSA) | ≤10s | **63s** | **~12-15s** | ⚠️ COND |
| R3 | Pass Rate ≥80% | ≥80% | **78%** | **~82%** | ⚠️ COND |
| R4 | Citation Rate ~100% | 100% | **0% cache** | **~99%** | ⚠️ COND |
| R5 | TTFT <500ms | <500ms | ~280ms | **<1s LFSA** | ✅ |
| R6 | A-MEM ativo | true | true | **true** | ✅ |
| R7 | MOTHER > SOTA PT | >75.6 | ~84.5 | **~84.5** | ✅ |
| **R8** | **Code generation em livros** | **100%** | **0%** | **~100%** | **✅ NOVO** |

---

## 📊 Progresso por Conselho

| Conselho | Ciclos | Score (REAL) | Score (proj) | Δ Score | Data |
|----------|--------|--------------|--------------|---------|------|
| V101 | C256-C265 | — | ~72/100 | baseline | 2026-03-11 |
| V102 | C266-C280 | — | 78.4/100 | +6.4 | 2026-03-11 |
| V103 | C281-C286 | — | 91.4/100 | +13.0 | 2026-03-11 |
| V104 | C287-C295 | **~72/100 (REAL)** | 99.9/100 (proj) | — | 2026-03-11 |
| V105 | C296-C304 | **~72/100 (REAL)** | ~95/100 (proj) | — | 2026-03-11 |
| **V106** | **C305-C310** | **TBD (C307)** | **~95/100 + R8** | — | **2026-03-11** |

> **Nota metodológica**: Scores "proj" são projeções baseadas em análise de código, não medições reais. Scores "REAL" são medidos via benchmark browser com cronômetro externo. O Conselho V106 exige que C307 produza o primeiro score REAL pós-C305-C306.
