---
description: Complete reference for MOTHER's 35-stage answer pipeline — how queries are processed, evaluated, and improved
---

# MOTHER Answer Pipeline — Quick Reference

When working on MOTHER's answer system, always consult the **Full Disclosure Technical Document**:
`C:\Users\elgar\.gemini\antigravity\brain\e6354ad1-1afa-4c88-853c-f32e4ab9e772\mother_answer_pipeline_disclosure.md`

## Core Pipeline Files (in execution order)

1. **Query Classification:** `server/mother/intelligence.ts` (614 lines) — routes query → category → model
2. **Main Orchestrator:** `server/mother/core.ts` (2588 lines) — 35-stage pipeline
3. **Quality Scoring:** `server/mother/guardian.ts` (627 lines) — G-Eval 6D scoring + RAGAS
4. **Anti-Hallucination:** `server/mother/grounding.ts` (348 lines) — claim extraction + citation injection
5. **Safety:** `server/mother/constitutional-ai.ts` (371 lines) — 11-principle critique-revise loop
6. **Agent Evaluator:** `server/mother/agent-as-judge.ts` (234 lines) — SALC + CoT evaluation
7. **Tool Engine:** `server/mother/react.ts` (403 lines) — ReAct pattern with 5 tools
8. **DPO Training:** `server/mother/dpo-builder.ts` (337 lines) — preference pair collection

## Existing Tests (USE THESE, do NOT create new unless missing)

### Unit/Regression Tests
- `server/mother/__tests__/bug-fix-regression.test.ts` — 27 tests covering security, persistence, logging, quality
- `server/mother/__tests__/dgm-true-outer-loop.test.ts` — DGM evolution loop tests

### Benchmark Suites
- `server/mother/quality-benchmark.ts` — 50 queries across 5 categories (factual, analysis, creative, code, SHMS domain)
- `server/mother/benchmark-suite.ts` — orchestrated benchmark execution
- `server/mother/benchmark-runner.ts` — automated benchmark runner
- `server/mother/dgm-benchmark.ts` — DGM-specific benchmarks
- `server/mother/autonomy-benchmark-runner.ts` — autonomy benchmarks
- `server/mother/proof-of-autonomy-benchmark.ts` — autonomy proof benchmarks

### Running Tests
// turbo
```
npx vitest run server/mother/__tests__/bug-fix-regression.test.ts --reporter=verbose
```

## Quality Dimensions (G-Eval 6D)

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| Consistency | 0.35 | Factual accuracy, no contradictions |
| Relevance | 0.30 | Addresses the query directly |
| Coherence | 0.10 | Logical flow and structure |
| Conciseness | 0.10 | Length appropriate for query complexity |
| Safety | 0.10 | No harmful content |
| Fluency | 0.05 | Grammar and readability |

## Key Quality Thresholds

| Threshold | Action |
|-----------|--------|
| Q ≥ 90 | DPO chosen pair collected |
| Q ≥ 88 | Skip Self-Refine |
| Q ≥ 85 | Fast path (TIER_1/2 skip Self-Refine + Constitutional AI) |
| Q ≥ 80 | Skip Constitutional AI internal gate |
| Q ≥ 75 | Skip TTC + GRPO + Parallel SC; learn from response |
| Q < 75 | TTC Best-of-N, GRPO, quality-triggered learning activated |
| Q < 70 | DPO rejected pair collected |
| Q < dynamic | Guardian regeneration (1 retry with GPT-4o) |

## Constitutional AI Principles (11)

Universal: Faithfulness(20%), Depth(20%), Obedience(15%), Completeness(12%), Honesty(7%), Helpfulness(6%), Safety(1%), Precision(1%)
MOTHER-specific: Scientific Grounding(10%), Geotechnical Accuracy(5%), SHMS Relevance(3%)

## SHMS Domain Areas (for test coverage)

8 areas: Sensors (piezometers, inclinometers, extensometers, accelerometers, strain gauges, flow meters, GNSS, temperature), ICOLD Alerts, RUL Analysis, Digital Twin, Cognitive Bridge, Geostability, Standards (PNSB/ICOLD/ABNT/ISO), Fault Tree/TARP
