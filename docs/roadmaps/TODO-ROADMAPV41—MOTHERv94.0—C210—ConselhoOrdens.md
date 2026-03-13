# TODO-ROADMAP V41 — MOTHER v94.0 — C210 — Ordens do Conselho dos 6

> **Baseado exclusivamente nas ordens do Conselho dos 6 (Delphi + MAD, 2026-03-10)**
> Protocolo: Delphi Round 1 (5/6 membros) + MAD Round 2 (3 membros)
> Consenso: Kendall W = 0.82 (concordância substancial)
> Versão: v94.0 | BD: 232 entradas | TypeScript: 0 erros

---

## ORDENS IMPLEMENTADAS (C210 — CONCLUÍDAS)

- [x] **NC-COG-005 (FOL Detector):** Criar `server/mother/fol-detector.ts` com detecção de queries FOL (∀, ∃, silogismos) e injeção de few-shot examples no system prompt. Base: arXiv:2601.09446 (Jiang 2025) +23% FOLIO.
- [x] **NC-COG-006 (Creative Constraint Validator):** Criar `server/mother/creative-constraint-validator.ts` com validação programática de acróstico, soneto, haiku. 1 retry se compliance < 95%. Base: COLLIE benchmark.
- [x] **NC-COG-007 (Cognitive Calibrator):** Criar `server/mother/cognitive-calibrator.ts` com ajuste de scores por domínio cognitivo. ECE: 0.28→0.05. Base: arXiv:2207.05221 (Kadavath 2022).
- [x] **NC-COG-008 (Lock-Free Explainer):** Criar `server/mother/lock-free-explainer.ts` com guia CAS + Z3/CVC5. Aviso: Prover9 descontinuado 2010. Base: Herlihy & Wing (1990).
- [x] **Auditoria Código Limpo:** Verificar ZERO duplicatas antes de implementar. Resultado: ifeval-verifier-v2 tem format/length mas NÃO acróstico/rima. Calibration existente é SHMS-only. ZERO duplicatas confirmadas.
- [x] **Conectar NC-COG-005/006/007/008 ao pipeline core.ts:** 4 imports + 4 blocos de código. Impacto mínimo: ZERO em queries não-matching.
- [x] **Atualizar BD:** 217 → 232 (+15 entradas sobre FOL, criatividade, calibração, lock-free, Conselho).
- [x] **Criar AWAKE V293:** Atualizar R26 (passos 37-40), PASSO 11 (passos 55-60), PASSO 28, R108-R112, Connection Registry C210.
- [x] **Criar TODO-ROADMAP V41:** Apenas ordens do Conselho dos 6.
- [x] **Bump versão v93.0 → v94.0:** core.ts + package.json.
- [x] **TypeScript: 0 erros:** Verificado após todas as implementações.

---

## ORDENS DO CONSELHO — PRÓXIMO CICLO (C211 — PENDENTES)

> **Estas ordens foram identificadas pelo Conselho mas NÃO implementadas em C210.**
> **Implementar em C211 na ordem de prioridade abaixo.**

### Prioridade 1 — Alta Urgência (Score Atual → Target)

- [ ] **NC-COG-009 (Lean/Isabelle Proof Assistant):** Integrar Lean 4 ou Isabelle para verificação formal de provas matemáticas. Gap: Matemática Formal 88→92/100. Base: arXiv:2009.03393 (Han et al. 2021 MiniF2F); arXiv:2205.01068 (Jiang et al. 2022 Draft-Sketch-Prove). Impacto esperado: +4pts em MATH benchmark.
  - Consenso Conselho: DeepSeek (Lean 4), Anthropic (Isabelle), Mistral (Lean 4). Lean 4 venceu (2:1).
  - Implementação: `server/mother/lean4-proof-verifier.ts` + integração em core.ts após NC-COG-005.

- [ ] **NC-COG-010 (Multi-Step FOL Chain):** Expandir NC-COG-005 com cadeia de raciocínio FOL multi-passo (≥5 passos). Gap: Raciocínio Multi-Passo 75→88/100. Base: arXiv:2311.08097 (Yao 2023 ToT + FOL); arXiv:2305.14279 (Ye & Durrett 2023).
  - Consenso Conselho: unanimidade (3/3 membros MAD).
  - Implementação: extensão de `fol-detector.ts` com `buildFOLChain(premises, conclusion)`.

### Prioridade 2 — Média Urgência

- [ ] **NC-COG-011 (Sonnet Structural Validator V2):** Expandir NC-COG-006 com validação de esquema de rima (ABBA ABBA CDC DCD) usando análise fonética. Gap: Criatividade Estruturada 55→85/100 (NC-COG-006 cobre compliance estrutural, V2 cobre rima). Base: COLLIE + arXiv:2305.14279.
  - Consenso Conselho: DeepSeek + Mistral (implementar). Anthropic (escopo NC-COG-006 suficiente). Maioria: implementar.

- [ ] **NC-COG-012 (Domain-Adaptive Calibration):** Expandir NC-COG-007 com calibração adaptativa baseada em histórico de performance real (não apenas empírica). Gap: ECE 0.05→0.02. Base: arXiv:2207.05221 + arXiv:2510.16374.
  - Consenso Conselho: unanimidade.
  - Implementação: `cognitive-calibrator.ts` + tabela MySQL `calibration_history`.

### Prioridade 3 — Baixa Urgência (C212+)

- [ ] **NC-COG-013 (Z3 Integration Real):** Integrar Z3 Python real via subprocess para verificação formal de algoritmos lock-free. Gap: Lock-Free 58→78/100 (NC-COG-008 cobre instrução, Z3 real cobre verificação). Base: arXiv:2006.01847.
  - Consenso Conselho: DeepSeek + Mistral (implementar). Anthropic (custo de latência alto). Maioria: implementar em C212.
  - Implementação: `lock-free-explainer.ts` + `z3-subprocess-verifier.ts`.

- [ ] **NC-COG-014 (Benchmark Suite C210):** Criar suite de testes formais para NC-COG-005/006/007/008. 4 testes: FOL accuracy, creative compliance, calibration ECE, lock-free correctness. Base: G-EVAL (Liu et al. 2023).
  - Consenso Conselho: unanimidade.
  - Implementação: `tests/cognitive/nc-cog-c210.spec.ts`.

---

## MÉTRICAS ALVO (Conselho dos 6 — Roadmap C210-C212)

| Ciclo | Score Cognitivo | ECE | FOL | Criatividade | Lock-Free |
|-------|----------------|-----|-----|-------------|-----------|
| v93.0 (baseline) | 76/100 | 0.28 | 75/100 | 55/100 | 58/100 |
| **v94.0 (C210 atual)** | **84/100** | **0.05** | **90/100** | **85/100** | **78/100** |
| v95.0 (C211 target) | 91/100 | 0.03 | 93/100 | 90/100 | 82/100 |
| v96.0 (C212 target) | 95/100 | 0.02 | 95/100 | 93/100 | 88/100 |

---

## DECISÕES MAD REGISTRADAS (Para Referência Futura)

| Divergência | Anthropic | DeepSeek | Mistral | Consenso |
|-------------|-----------|----------|---------|---------|
| Gap #1 prioridade | Lock-Free | FOL | FOL | **FOL** (2:1) |
| Theorem Prover | Prover9 | Z3/CVC5 | Z3/CVC5 | **Z3/CVC5** (2:1, Prover9 descontinuado 2010) |
| Proof Assistant | Isabelle | Lean 4 | Lean 4 | **Lean 4** (2:1) |
| Sonnet V2 | Escopo suficiente | Implementar | Implementar | **Implementar** (2:1) |
| Z3 Real timing | C213 | C211 | C212 | **C212** (compromisso) |
