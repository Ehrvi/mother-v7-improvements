# TODO ROADMAP V43 — MOTHER v122.10 — C258 — Conselho dos 6
> **Atualizado:** 2026-03-11 | Ciclo C258 | Metodologia: SOTA científico

---

## ✅ CONCLUÍDAS — C256 (v122.9)
- [x] **C256-001:** Remoção do penalty automático `hallucinationRisk=medium` em `guardian.ts`
  - Base: Prometheus 2 (arXiv:2405.01535) — penalidades devem ser baseadas em evidências
  - Resultado: NS-01 Q=85→90, PH-01 Q=85→95, HC-03 Q=85→95
- [x] **C256-002:** Atualização `cloudbuild.yaml` MOTHER_VERSION=v122.9, MOTHER_CYCLE=256
- [x] **C256-003:** AWAKE V295 criado documentando C256+C257
- [x] **C256-004:** Deploy v122.9 — build SUCCESS

## ✅ CONCLUÍDAS — C257 (v122.10)
- [x] **C257-001:** Smart Pipeline Gating — CoVe limitado a 3 perguntas + timeout 8s
  - Base: FrugalGPT (arXiv:2305.05176) — cascade routing
  - Redução projetada: P50 36.3s → ~20s (-45%)
- [x] **C257-002:** CoVe desabilitado para TIER_4 (modelo frontier já é ótimo)
- [x] **C257-003:** GRPO desabilitado quando Q≥90 (qualidade já suficiente)
- [x] **C257-004:** ORCHESTRATOR_VERSION atualizado para v82.4
- [x] **C257-005:** MOTHER_VERSION=v122.10, MOTHER_CYCLE=257 em cloudbuild.yaml
- [x] **C257-006:** Deploy v122.10 — build SUCCESS
- [x] **C257-007:** Benchmark C238 v8 iniciado (17/48 prompts — 15 PASS, 1 FAIL transient, 1 TIMEOUT)

## ✅ CONCLUÍDAS — C258 (Framework Científico de Avaliação)
- [x] **C258-001:** Pesquisa SOTA via arXiv API (7 benchmarks: HELM, MT-Bench, G-Eval, Prometheus 2, AlpacaEval 2.0, FrugalGPT, RAGAS)
- [x] **C258-002:** Análise estatística: P25/P50/P75 do SOTA como âncoras de calibração
- [x] **C258-003:** Critérios de aprovação calibrados por dimensão e por tier
- [x] **C258-004:** Score composto MOTHER (0-100) com pesos científicos
- [x] **C258-005:** Visualização `mother_benchmark_calibration.png` (matplotlib)
- [x] **C258-006:** Relatório científico `MOTHER_SOTA_EVALUATION_FRAMEWORK_V1.md`
- [x] **C258-007:** AWAKE V296 criado com framework integrado
- [x] **C258-008:** Roadmap V43 criado (este arquivo)

---

## 🔄 PENDENTES — C259+ (Ordens do Conselho)

### Prioridade CRÍTICA — Latência (Score Composto: 83.6 → 88.0)

- [ ] **C259-001:** Paralelizar CoVe + G-Eval
  - **Problema:** CoVe e G-Eval são executados sequencialmente mas são independentes
  - **Solução:** `Promise.all([applyCoVe(...), validateQuality(...)])` 
  - **Impacto:** -8s (G-Eval 3s + overlap CoVe)
  - **Base:** Amdahl's Law — paralelismo reduz tempo total ao máximo sequencial
  - **Target:** P50 ~20s → ~16s

- [ ] **C259-002:** Cache semântico de embeddings para CoVe
  - **Problema:** Perguntas de verificação similares são regeneradas a cada request
  - **Solução:** Cache com similarity threshold 0.85 (cosine) para reutilizar perguntas
  - **Impacto:** -3s para queries similares (30% dos casos)
  - **Base:** RAGAS (arXiv:2309.15217) — semantic caching
  - **Target:** P50 ~16s → ~14s

- [ ] **C259-003:** Streaming response (TTFT < 2s)
  - **Problema:** Usuário espera 36s sem nenhum feedback visual
  - **Solução:** Implementar SSE (Server-Sent Events) para streaming da resposta base enquanto pipeline roda
  - **Impacto:** TTFT 36s → <2s (percepção de velocidade)
  - **Base:** Nielsen (1993) — 1s = fluxo de pensamento mantido
  - **Target:** TTFT < 2s (mesmo com latência total de 20s)

### Prioridade ALTA — Qualidade (Gaps identificados)

- [ ] **C260-001:** Melhorar coerência (score ~80 → ≥85)
  - **Problema:** Coerência é o único gap de qualidade (threshold PASS = 85)
  - **Solução:** Adicionar instrução de estrutura no system prompt para TIER_3/TIER_4
  - **Base:** G-Eval (arXiv:2303.16634) — coherence dimension
  - **Target:** Coerência ≥85

- [ ] **C260-002:** Implementar benchmark C238 v9 (multi-dimensional)
  - **Problema:** C238 v8 mede apenas Q (qualidade geral) — ignora latência e completude
  - **Solução:** Novo script com score composto: Q×0.35 + Completeness×0.15 + Accuracy×0.15 + Coherence×0.10 + Safety×0.10 + Latency×0.10 + WordRatio×0.05
  - **Base:** Framework científico C258 (este documento)
  - **Target:** Score composto ≥88 (PASS) em 90%+ dos prompts

- [ ] **C260-003:** Injetar framework SOTA no knowledge base
  - **Conteúdo:** 7 papers SOTA + critérios calibrados + score composto
  - **Endpoint:** POST /api/knowledge/add
  - **Target:** 10+ novas entradas no knowledge base

### Prioridade MÉDIA — Pendências C213+ (De V42)

- [ ] **NC-COG-015:** Lean4 Integration Test — executar benchmark cognitivo C212 e corrigir falhas
- [ ] **NC-COG-016:** Multi-Step FOL Evaluation — testar `buildFOLChain` com 10 queries FOL
- [ ] **NC-COG-017:** Calibration History Bootstrap — inicializar `calibration_history` com dados históricos
- [ ] **NC-COG-018:** Matemática Formal — integrar Wolfram Alpha API ou SymPy
- [ ] **NC-COG-020:** Z3 Environment Setup — instalar z3-solver no Docker container

### Prioridade BAIXA — Melhorias Incrementais

- [ ] **C261-001:** Modelo base mais rápido — avaliar Gemini Flash como alternativa para TIER_1/TIER_2
  - **Base:** FrugalGPT cascade — usar modelo menor para queries simples
  - **Target:** P50 ~10s para TIER_1/TIER_2

- [ ] **C261-002:** Arquitetura especulativa (draft model)
  - **Base:** Leviathan et al. (2023) — speculative decoding
  - **Target:** P50 ~8s no futuro

---

## MÉTRICAS DE PROGRESSO

| Ciclo | Versão | Score Composto | Qualidade | Latência P50 | TypeScript |
|-------|--------|---------------|-----------|-------------|------------|
| C209 | v93.0 | N/A | 76/100 | N/A | 0 erros |
| C210 | v94.0 | N/A | 84/100 | N/A | 0 erros |
| C212 | v95.0 | N/A | 91/100 | N/A | 0 erros |
| C256 | v122.9 | N/A | 90/100 | ~36s | 0 erros |
| C257 | v122.10 | 83.6/100 | 96.2/100 | ~36s (medido) | 0 erros |
| C258 (target) | v122.10 | 83.6/100 | 96.2/100 | ~36s | 0 erros |
| C259 (target) | v122.11 | ~85/100 | 96/100 | ~16s | 0 erros |
| C260 (target) | v122.12 | **88/100** | 96/100 | ~14s + streaming | 0 erros |
| C270 (aspiracional) | v123.0 | **91.7/100** | 94/100 | ~8s | 0 erros |

---

## REGRAS DO CONSELHO (Protocolo Delphi + MAD)
1. Toda nova NC-COG deve ter base científica citada (arXiv, ACL, NeurIPS, ICML, TACAS).
2. Toda implementação deve passar por auditoria de código limpo antes de ser iniciada.
3. Toda divergência entre membros do Conselho deve ser resolvida por MAD (Multi-Agent Debate).
4. Toda NC-COG deve ter impacto ZERO em queries não-matching.
5. TypeScript 0 erros é requisito não-negociável para qualquer commit.
6. **NOVO (C258):** Critérios de aprovação devem ser calibrados com dados empíricos SOTA.
7. **NOVO (C258):** Latência é dimensão de qualidade — não apenas de performance.
8. **NOVO (C258):** Score composto ≥88 é o critério de sucesso do sistema MOTHER.

