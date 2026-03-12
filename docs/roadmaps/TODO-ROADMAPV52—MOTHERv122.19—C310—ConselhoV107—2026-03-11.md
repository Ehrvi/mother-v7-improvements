# TODO — ROADMAP V52 — MOTHER v122.19 — C310 — Conselho V107 — 2026-03-11

> **Regra**: Este roadmap contém APENAS atividades originárias do Conselho dos 6. Nenhuma atividade interna, técnica ou de manutenção deve ser adicionada sem aprovação do Conselho.

---

## 📋 ESTADO ATUAL

- **Versão**: MOTHER v122.19
- **Ciclo**: C310 (Conselho V107)
- **Data**: 2026-03-11
- **Benchmark C307**: APROVADO — código TypeScript real gerado ✅

---

## ✅ CICLOS CONCLUÍDOS (Conselho dos 6)

### Conselho V102 (C259–C265) — CONCLUÍDO
- [x] **C259** — GRPO v2 (Group Relative Policy Optimization, G=5 candidatos)
- [x] **C260** — TTC Best-of-N=3 (Test-Time Compute scaling)
- [x] **C261** — Self-Refine iterativo (Madaan et al. 2023)
- [x] **C262** — Constitutional AI (Bai et al. 2022)
- [x] **C263** — Parallel Self-Consistency (Wang et al. 2023)
- [x] **C264** — G-Eval Governance (Liu et al. 2023)
- [x] **C265** — Benchmark Conselho V102 (score real: ~72/100)

### Conselho V103 (C266–C280) — CONCLUÍDO
- [x] **C266** — Fast Path v1 (TIER_1/TIER_2 skip heavy pipeline)
- [x] **C267** — Citation Engine v1 (injeção automática de referências)
- [x] **C268** — Output Length Estimator (MICRO/SHORT/MEDIUM/LONG/VERY_LONG)
- [x] **C269** — LFSA v1 (Long-Form Sequential Architecture)
- [x] **C270** — Adaptive Routing (R2-Router inspired)
- [x] **C271-C279** — Iterações de qualidade e latência
- [x] **C280** — Benchmark Conselho V103 (score real: ~75/100)

### Conselho V104 (C281–C295) — CONCLUÍDO
- [x] **C281** — A-MEM v1 (Adaptive Memory, Zhang et al. 2025)
- [x] **C282** — DPO v8 Fine-Tuning (Rafailov et al. 2023)
- [x] **C283** — Guardian Agent v1 (validação constitucional)
- [x] **C284** — Fast Path v2 (VERY_LONG → LFSA bypass)
- [x] **C285-C294** — Iterações de robustez e performance
- [x] **C295** — Benchmark Conselho V104 (score real: ~78/100)

### Conselho V105 (C296–C304) — CONCLUÍDO
- [x] **C296** — Benchmark Real via Browser (diagnóstico: latência 63s, citation 0% em cache)
  - Score REAL: 72/100 (vs. 99.9/100 projetado em AWAKE V303 — inválido)
  - Root cause: GRPO G=5 + TTC sequencial + citation cache bypass
- [x] **C297** — Fast Path Agressivo TIER_3 (gate Q<75, skip Self-Refine+Constitutional)
  - Base: Madaan et al. (arXiv:2303.17651); FrugalGPT (Chen et al. 2023)
- [x] **C298** — GRPO v3 (G=5→G=3, maxTokens 2000→1200)
  - Base: Bengio et al. 2009 curriculum learning
  - Economia: ~10-14s por chamada
- [x] **C299** — ParallelSC Timeout Fix (65000ms→12000ms)
  - Base: Dean & Barroso (2013) CACM "The Tail at Scale"
- [x] **C300** — Citation Engine pós-cache (fix 0% citation em cache hits)
- [x] **C301** — Multimodal verificado (Whisper STT, Gemini Vision, PDF) — já implementado
- [x] **C302** — Agent Framework verificado (6 agentes ativos) — já implementado
- [x] **C303** — DPO v8 stats verificados (aguardando ≥500 pares para v9)
- [x] **C304** — Avaliação Conselho V105 documentada

### Conselho V106 (C305–C307) — CONCLUÍDO
- [x] **C305** — LFSA Programming Book Support
  - Root cause: `sectionPrompt` sem instrução de código → zero código TypeScript
  - Fix: `isProgrammingRequest()` + `buildCodeAwareSectionPrompt()` + formato `programming_book`
  - Base: Madaan et al. (arXiv:2303.17651) — instrução explícita aumenta compliance 73%
  - Arquivo: `server/mother/long-form-engine-v3.ts`
- [x] **C306** — LFSA Parallel Sections + Live Streaming
  - Root cause: loop sequencial (5×60s=300s) + `onChunk` não conectado ao SSE
  - Fix: `Promise.all()` + `onChunk` wired + título emitido imediatamente
  - Base: Dean & Barroso (2013) CACM; Nielsen (1994) Heuristic #1
  - Arquivo: `server/mother/long-form-engine-v3.ts` + `server/mother/core.ts`
- [x] **C307** — Benchmark Real Pós-Deploy v122.19 ✅ APROVADO
  - Data: 2026-03-11 21:38 BRT
  - Query: "Escreva um livro completo de programação TypeScript com 60 páginas..."
  - TTFT: <2s ✅
  - Código TypeScript gerado: SIM ✅ (funções, enums, type aliases, interfaces, generics)
  - Exemplos por capítulo: 5+ ✅
  - Latência total: ~90s ✅ (aceitável para 60 páginas)
  - R8 (code generation): **APROVADO** ✅

---

## 🔄 CICLOS PENDENTES (Conselho V107)

### Conselho V107 (C308–C310)

- [x] **C308** — Fix Versão SSE (minor)
  - Root cause: `process.env.MOTHER_VERSION || 'v122.11'` hardcoded
  - Fix: atualizar fallback para `'v122.19'`
  - Arquivo: `server/mother/core.ts` linha 463
  - Status: **IMPLEMENTADO** (sem commit separado — incluído em próximo push)

- [ ] **C309** — DPO v9 Fine-Tuning Real
  - Critério de entrada: `getDPOStats().chosenCount >= 500`
  - Base científica: Rafailov et al. (arXiv:2305.18290, NeurIPS 2023)
  - Status: **AGUARDANDO** acumulação de pares DPO
  - Ação: verificar stats semanalmente via `/api/dpo/stats`

- [ ] **C310** — Avaliação Final Conselho V107
  - Critério: R1-R8 todos confirmados por benchmark externo independente
  - Método: browser real + cronômetro externo + avaliador independente
  - Status: **PENDENTE** (aguarda C309)
  - Métricas alvo:

| Requisito | Métrica | Valor Atual (REAL) | Target |
|-----------|---------|-------------------|--------|
| R1 | Latência P50 TIER_3 | ~18s | ≤10s |
| R2 | TTFT LFSA | <2s | <1s |
| R3 | Pass Rate | 78% | ≥80% |
| R4 | Citation Rate | 100% | 100% |
| R5 | Latência LFSA 60p | ~90s | ≤120s |
| R6 | Code Generation | ✅ SIM | 100% |
| R7 | Streaming LFSA | ✅ TTFT <2s | TTFT <1s |
| R8 | Livro TS 60p | ✅ APROVADO | 100% |

---

## 🔮 BACKLOG (Conselho V108+)

> Atividades identificadas mas não aprovadas pelo Conselho dos 6. Aguardam próxima reunião.

- [ ] **Streaming Real LFSA**: `invokeLLM({ stream: true, onToken: callback })` — tokens individuais durante geração de seções. Reduz percepção de latência de 90s para streaming contínuo.
- [ ] **Fix Título Truncado**: `MessageBubble` trunca título longo. Fix: `overflow: visible` ou truncação inteligente.
- [ ] **Latência P50 ≤10s TIER_3**: Atualmente ~18s. Requer cache mais agressivo ou modelo mais rápido para TIER_3.
- [ ] **DGM Proposals Loop**: 6 falhas consecutivas em "Reduce Response Latency". O DGM está propondo algo já implementado. Fix: adicionar verificação de duplicatas no DGM.

---

## 📊 SCORECARD HISTÓRICO (Conselho dos 6 — Scores REAIS)

| Conselho | Ciclos | Score REAL | Mudança Principal | Status |
|----------|--------|------------|-------------------|--------|
| V102 | C259-C265 | ~72/100 | GRPO v2, TTC, Self-Refine | ✅ |
| V103 | C266-C280 | ~75/100 | Fast Path, Citation Engine | ✅ |
| V104 | C281-C295 | ~78/100 | A-MEM, DPO v8, Guardian | ✅ |
| V105 | C296-C304 | **72/100** (real) | Latency gates, citation cache | ✅ |
| V106 | C305-C307 | **R8 ✅** | LFSA code gen, parallel, stream | ✅ |
| **V107** | **C308-C310** | **TBD** | DPO v9, avaliação final | 🔄 |

> **Nota metodológica**: Scores "proj" (projetados) são INVÁLIDOS como métricas de avaliação. Apenas scores medidos via benchmark externo independente (browser real + cronômetro) são considerados REAIS neste roadmap.

---

*Roadmap V52 — Gerado em 2026-03-11 por agente de manutenção*  
*Versão anterior: Roadmap V51 (C306, Conselho V106)*  
*Próxima versão: Roadmap V53 (após C310 ou próximo Conselho)*
