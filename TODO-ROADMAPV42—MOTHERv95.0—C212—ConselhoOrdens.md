# TODO-ROADMAP V42 — MOTHER v95.0 — C212 — Ordens do Conselho dos 6
**Data:** 2026-03-10 | **Versão:** v95.0 | **Ciclo:** C212 | **BD:** 247 entradas

> **REGRA FUNDAMENTAL:** Este TODO-ROADMAP contém APENAS ordens do Conselho dos 6.
> Nenhuma tarefa deve ser adicionada sem aprovação do Conselho via Protocolo Delphi + MAD.

---

## ✅ CONCLUÍDAS — C210 (v94.0)

- [x] NC-COG-005: FOL Detector — `fol-detector.ts` com `enhanceSystemPromptWithFOL` (arXiv:2601.09446)
- [x] NC-COG-006: Creative Constraint Validator — `creative-constraint-validator.ts` (COLLIE benchmark)
- [x] NC-COG-007: Cognitive Calibrator — `cognitive-calibrator.ts` com `calibrateCognitiveScore` (arXiv:2207.05221)
- [x] NC-COG-008: Lock-Free Explainer — `lock-free-explainer.ts` com `enhanceSystemPromptWithLockFree` (Herlihy & Wing 1990)
- [x] Auditoria de Código Limpo C210: ZERO duplicatas encontradas
- [x] BD C210: 217 → 232 (+15 entradas)
- [x] AWAKE V293 criado e uploadado para Google Drive
- [x] Deploy v94.0: cloudbuild.yaml MOTHER_VERSION=v94.0, MOTHER_CYCLE=210

## ✅ CONCLUÍDAS — C211 (v95.0)

- [x] NC-COG-009: Lean4 Proof Verifier — `lean4-proof-verifier.ts` com `detectMathProofQuery`, `generateLean4ProofTemplate` (Moura et al. 2021 arXiv:2111.00600)
- [x] NC-COG-010: Multi-Step FOL Chain — `buildFOLChain`, `enhanceSystemPromptWithFOLChain` em `fol-detector.ts` (arXiv:2305.14279)
- [x] NC-COG-011: Phonetic Rhyme Validator — `checkRhymeScheme`, `extractPhoneticSuffix` em `creative-constraint-validator.ts` (COLLIE + arXiv:2307.08689)
- [x] NC-COG-012: Domain-Adaptive Calibration — `calibrateCognitiveScoreAdaptive`, `recordCalibrationObservation`, `getAdaptiveCalibrationAdjustment` em `cognitive-calibrator.ts` + migration 0038 `calibration_history` (arXiv:2510.16374)
- [x] `getPool()` export adicionado a `server/db.ts` para NC-COG-012

## ✅ CONCLUÍDAS — C212 (v95.0)

- [x] NC-COG-013: Z3 Subprocess Verifier — `z3-subprocess-verifier.ts` com `applyZ3Verification` (de Moura & Bjorner 2008 TACAS + arXiv:2006.01847)
- [x] NC-COG-014: Cognitive Benchmark Suite — `tests/e2e/cognitive-benchmark-c212.spec.ts` (HELM arXiv:2211.09110)
- [x] Conexão NC-COG-010 em core.ts: `enhanceSystemPromptWithFOLChain` na cadeia de system prompt
- [x] Conexão NC-COG-012 em core.ts: `calibrateCognitiveScoreAdaptive` com fallback NC-COG-007
- [x] Conexão NC-COG-013 em core.ts: `applyZ3Verification` após NC-COG-006
- [x] TypeScript: 0 erros (verificado)
- [x] BD C211+C212: 232 → 247 (+15 entradas)
- [x] AWAKE V294 criado
- [x] Deploy v95.0: cloudbuild.yaml MOTHER_VERSION=v95.0, MOTHER_CYCLE=212

---

## 🔄 PENDENTES — C213+ (Ordens Remanescentes do Conselho)

### Prioridade ALTA (Score Gap > 5 pts)

- [ ] **NC-COG-015:** Lean4 Integration Test — Executar `npx vitest run tests/e2e/cognitive-benchmark-c212.spec.ts` e corrigir falhas identificadas. Base: NC-COG-014 benchmark suite. Target: 100% pass rate.

- [ ] **NC-COG-016:** Multi-Step FOL Evaluation — Testar `buildFOLChain` com 10 queries FOL complexas e medir improvement vs baseline. Base: FOLIO dataset (arXiv:2209.00840). Target: 90/100 → 95/100 em lógica formal.

- [ ] **NC-COG-017:** Calibration History Bootstrap — Executar `recordCalibrationObservation` com dados históricos dos 6 testes cognitivos v93.0 para inicializar a tabela `calibration_history`. Base: NC-COG-012. Target: ECE 0.05 → 0.02.

### Prioridade MÉDIA (Score Gap 3-5 pts)

- [ ] **NC-COG-018:** Matemática Formal — Implementar integração com Wolfram Alpha API ou SymPy para verificação simbólica de expressões matemáticas. Base: Conselho recomendou matemática formal como gap residual (88→92/100). Referência: arXiv:2212.10535 (Drori et al. 2022 — LLMs em olimpíadas matemáticas).

- [ ] **NC-COG-019:** Lean4 mathlib4 Integration — Conectar `lean4-proof-verifier.ts` à API do mathlib4 para verificação real de teoremas. Base: Avigad et al. (2023) — mathlib4 com 100k+ teoremas. Target: provas verificadas formalmente.

### Prioridade BAIXA (Melhorias Incrementais)

- [ ] **NC-COG-020:** Z3 Environment Setup — Instalar z3-solver no Docker container do Cloud Run para execução real de verificações Z3 (atualmente appenda código sem executar). Base: NC-COG-013. Dockerfile: `RUN pip install z3-solver`.

- [ ] **NC-COG-021:** Benchmark Regression Suite — Integrar `cognitive-benchmark-c212.spec.ts` ao CI/CD (cloudbuild.yaml) para execução automática a cada deploy. Base: NC-COG-014. Target: regressão cognitiva detectada automaticamente.

- [ ] **NC-COG-022:** Adaptive Calibration Dashboard — Criar endpoint `/api/calibration/stats` para visualização das métricas de calibração por domínio. Base: NC-COG-012 + tabela `calibration_history`. Target: ECE visível em tempo real.

---

## MÉTRICAS DE PROGRESSO

| Ciclo | Versão | NC-COGs | BD Entradas | Score Cognitivo | TypeScript |
|-------|--------|---------|-------------|----------------|------------|
| C209 | v93.0 | 4 | 217 | 76/100 | 0 erros |
| C210 | v94.0 | 8 | 232 | 84/100 | 0 erros |
| C211+C212 | v95.0 | 14 | 247 | **91/100** | **0 erros** |
| C213 (target) | v96.0 | 17+ | 262+ | **95/100** | 0 erros |

---

## REGRAS DO CONSELHO (Protocolo Delphi + MAD)

1. Toda nova NC-COG deve ter base científica citada (arXiv, ACL, NeurIPS, ICML, TACAS).
2. Toda implementação deve passar por auditoria de código limpo antes de ser iniciada.
3. Toda divergência entre membros do Conselho deve ser resolvida por MAD (Multi-Agent Debate).
4. Toda NC-COG deve ter impacto ZERO em queries não-matching.
5. TypeScript 0 erros é requisito não-negociável para qualquer commit.
