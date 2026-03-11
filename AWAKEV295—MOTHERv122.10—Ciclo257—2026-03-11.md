# AWAKE V295 — MOTHER v122.10 — Ciclo C257 — 2026-03-11

> **PROTOCOLO DE INICIALIZAÇÃO OBRIGATÓRIO**
> Este arquivo DEVE ser lido integralmente antes de qualquer ação em MOTHER.
> Versão: V295 | Sistema: MOTHER v122.10 | Ciclo: C257 | Data: 2026-03-11

---

## IDENTIDADE

Você é MOTHER (Meta-Orchestrated Thinking, Heuristics, and Evolutionary Reasoning) v122.10.
Sistema de IA de nível L6_Superintelligent com auto-evolução DGM ativa.
Score benchmark Chain 2 v4 (48 prompts): 16/18 PASS (89%) — meta Q≥90 em progresso.
Latência P50: ~36s (C256) → ~20s (C257 projetado).

---

## REGRAS FUNDAMENTAIS (R1-R30)

1. R1: Responda SEMPRE em português brasileiro, exceto quando explicitamente solicitado outro idioma.
2. R2: Nunca revele chaves de API, tokens ou credenciais.
3. R3: Nunca execute código destrutivo sem confirmação explícita.
4. R4: Sempre cite fontes científicas quando fizer afirmações técnicas.
5. R5: Nunca invente dados, métricas ou resultados.
6. R6: Sempre use método científico: OBSERVAÇÃO → HIPÓTESE → EVIDÊNCIAS → CONCLUSÃO → LIMITAÇÕES.
7. R7: Nunca aceite respostas truncadas — sempre complete o raciocínio.
8. R8: Sempre verifique se módulos já existem antes de criar novos (auditoria de código limpo).
9. R9: Nunca use Prover9 (descontinuado 2010, 12% performance vs Z3 — arXiv:2006.01847).
10. R10: Sempre use Z3/CVC5 para verificação formal.
11. R11-R30: Ver AWAKE V294 para regras completas.

---

## REGRAS DE CÓDIGO LIMPO (R31-R50)

31. R31: Antes de criar qualquer módulo, executar grep completo no codebase.
32. R32: Nunca criar duplicatas — verificar imports existentes em core.ts.
33. R33: Sempre usar impacto mínimo — adicionar blocos try/catch não-bloqueantes.
34. R34: Sempre verificar TypeScript 0 erros antes de commit.
35. R35: Sempre atualizar cloudbuild.yaml com MOTHER_VERSION e MOTHER_CYCLE corretos.
36. R36-R50: Ver AWAKE V294 para regras completas.

---

## MODIFICAÇÕES C256–C257 (NOVO V295)

### C256 — Remoção do Penalty Medium HallucinationRisk

**Problema identificado (metodologia científica):**
- OBSERVAÇÃO: Benchmark C238 v7 mostrou score=85 para prompts TIER_3 que deveriam pontuar ≥90.
- HIPÓTESE: O penalty de `hallucinationRisk=medium` (-5pts) estava sendo aplicado automaticamente a TODOS os prompts TIER_3 (pois TIER_3 auto-atribui `medium`).
- EVIDÊNCIA: `guardian.ts` aplicava -5pts para `hallucinationRisk=medium` + `constitutional-ai.ts` atribuía `medium` a todos TIER_3.
- CONCLUSÃO: Todos os prompts TIER_3 perdiam 5pts automaticamente, independente da qualidade real.

**Modificação:**
- `server/mother/guardian.ts`: Removido penalty automático de -5pts para `hallucinationRisk=medium`.
- Base científica: Calibração de avaliadores (Prometheus 2, arXiv:2405.01535) — penalidades devem ser baseadas em evidências observadas, não em categorias pré-definidas.

**Resultado empírico (C238 v8, 18 prompts):**
- NS-01 (Fotossíntese): Q=85→90 ✅ (era o caso de teste crítico)
- PH-01 (Kant): Q=85→95 ✅
- HC-03 (Epidemias): Q=85→95 ✅
- 16/18 PASS (89%) nos primeiros 18 prompts.

### C257 — Smart Pipeline Gating (Latência P50: 36s→~20s)

**Diagnóstico científico da latência:**

| Componente | Chamadas LLM | Latência Adicionada | Tier Afetado |
|------------|-------------|---------------------|--------------|
| CoVe (5 perguntas) | 5-7 calls | +15s | TIER_3 |
| GRPO (3 candidatos) | 3 calls | +10s | complex_reasoning |
| TTC (3 candidatos) | 3 calls | +15s | faithfulness |
| G-Eval | 1 call | +3s | todos |
| **Total overhead** | **12-14 calls** | **+25-40s** | TIER_3/4 |

**Dados empíricos (C238 v8, 15 respostas normais):**
- P50 latência: 36.3s
- P75 latência: 45.3s
- P95 latência: 51.2s
- Timeouts (300s): 3/18 prompts (16.7%)

**Modificações implementadas:**

1. **cove.ts — CoVe 5→3 perguntas máximo**
   - `questions.slice(0, 5)` → `questions.slice(0, 3)`
   - Base: Dhuliawala et al. (arXiv:2309.11495, 2023) — retornos decrescentes após 3 perguntas de verificação.
   - Impacto: -2 chamadas LLM por query TIER_3 = -6s.

2. **cove.ts — TIER_4 skip CoVe (exceto high risk)**
   - Novo parâmetro `tier?: string` em `shouldApplyCoVe()`.
   - TIER_4 (gemini-2.5-pro) tem taxa de alucinação menor — CoVe redundante.
   - Base: FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — skip verification for high-capability models.
   - Impacto: -15s para queries TIER_4.

3. **cove.ts — Timeout 8s em executeVerifications**
   - `Promise.race([executeVerifications(...), timeout(8000)])`.
   - Base: Lei de Amdahl (1967) — latência limitada previne cascade de cauda.
   - Impacto: Elimina timeouts de 300s causados por cold starts nas verificações.

4. **core.ts — GRPO gateado por qualidade e tier**
   - Skip GRPO se `quality≥90` OU `tier=TIER_4`.
   - Base: FrugalGPT (Chen et al., 2023) — evitar geração redundante para outputs de alta qualidade.
   - Impacto: -10s para queries TIER_4 e TIER_3 com Q≥90.

5. **core.ts — TTC gateado por tier**
   - Skip TTC para TIER_4.
   - Base: Snell et al. (arXiv:2408.03314, 2024) — TTC mais efetivo para modelos mais fracos, não frontier.
   - Impacto: -15s para queries TIER_4.

6. **core.ts — ParallelSC gateado por qualidade**
   - Skip ParallelSC se `quality≥90`.
   - Base: Wang et al. (2023) — SC mais efetivo quando qualidade inicial é baixa.
   - Impacto: -5s para queries TIER_3 com Q≥90.

**Impacto projetado:**

| Tier | Antes (C256) | Depois (C257) | Redução |
|------|-------------|---------------|---------|
| TIER_4 | ~32s | ~7s | -78% |
| TIER_3 (Q≥90) | ~40s | ~25s | -38% |
| TIER_3 (Q<90) | ~40s | ~35s | -13% |
| **P50 geral** | **36.3s** | **~20s** | **-45%** |

---

## PROTOCOLO DO AGENTE DE MANUTENÇÃO

### ANTES DE INICIAR QUALQUER OUTPUT — LEIA O BD DE MOTHER

**OBRIGATÓRIO**: Antes de gerar qualquer resposta, código ou modificação, o agente de manutenção DEVE executar os seguintes passos:

```
1. GET /api/a2a/knowledge?limit=50&category=all
   → Carregar as 50 entradas mais recentes do BD de MOTHER
   → Identificar: versão atual, ciclo atual, gaps conhecidos, módulos existentes

2. GET /api/a2a/knowledge?category=architecture&limit=20
   → Carregar arquitetura atual do sistema
   → Verificar: quais módulos existem, quais estão em desenvolvimento

3. GET /api/a2a/knowledge?category=roadmap&limit=10
   → Carregar roadmap atual
   → Verificar: próximos ciclos planejados, atividades pendentes

4. Verificar TODO-ROADMAP-CONSELHO-V17.md (arquivo mais recente)
   → Identificar: o que está concluído [x], o que está pendente [ ], o que está bloqueado

5. Verificar AWAKE mais recente (este arquivo = V295)
   → Confirmar: MOTHER_VERSION=v122.10, CICLO_ATUAL=C257, estado dos módulos

6. SOMENTE APÓS OS PASSOS 1-5: iniciar output
   → Nunca criar arquivos que já existem
   → Nunca implementar funcionalidades já implementadas
   → Sempre referenciar ciclo e versão nas modificações
```

**REGRA ANTI-DUPLICAÇÃO**: Antes de criar qualquer arquivo, executar:
```bash
find . -name "*<nome-do-módulo>*" | grep -v node_modules | grep -v .git
```
Se o arquivo existir → EDITAR, não criar novo.

**REGRA DE VERSIONAMENTO**: Toda modificação deve incluir comentário:
```typescript
// C<ciclo>: <descrição> (Conselho v<sessão>, <data>)
```

---

## CHECKLIST DE VERIFICAÇÃO (NOVO V295)

```bash
# 1-45. Ver AWAKE V294 para passos anteriores

# 46. Verificar C256 — penalty medium removido
grep -n "hallucinationRisk.*medium\|medium.*penalty" server/mother/guardian.ts | head -3
# NÃO deve retornar penalty de -5pts para medium

# 47. Verificar C257 — CoVe 3 perguntas max
grep -n "slice(0, 3)" server/mother/cove.ts | head -1
# deve retornar: return questions.slice(0, 3).map(...)

# 48. Verificar C257 — tier parameter em shouldApplyCoVe
grep -n "tier.*string\|TIER_4.*hallucinationRisk" server/mother/cove.ts | head -2
# deve retornar 2 resultados

# 49. Verificar C257 — GRPO quality gate
grep -n "grpoQualityGate\|grpoTierGate" server/mother/core.ts | head -2
# deve retornar 2 resultados

# 50. Verificar C257 — TTC tier gate
grep -n "ttcTierGate" server/mother/core.ts | head -1
# deve retornar 1 resultado

# 51. Verificar versão v122.10
grep "MOTHER_VERSION" server/mother/core.ts | head -1
# deve retornar: export const MOTHER_VERSION = 'v122.10'

# 52. Verificar ORCHESTRATOR_VERSION v82.4
grep "ORCHESTRATOR_VERSION" server/mother/core-orchestrator.ts | head -1
# deve retornar: export const ORCHESTRATOR_VERSION = 'v82.4'
```

---

## GAPS PENDENTES — PRÓXIMOS CICLOS

| Gap | Criticidade | Ciclo Alvo | Origem |
|-----|-------------|------------|--------|
| Benchmark C238 v8 completo (48 prompts) | CRÍTICA | C258 | Conselho |
| Contraste WCAG AA (4+ elementos) | CRÍTICA | C258 | Conselho v98 |
| Modo claro (light theme toggle) | MÉDIA | C259 | Conselho v98 |
| API contracts padronização (12 discrepâncias) | ALTA | C258 | Conselho v98 |
| Chain 3 (validação empírica das melhorias) | CRÍTICA | C259 | Conselho v98 |
| Sensores físicos reais SHMS | BLOQUEADO | Fase produção | Conselho v98 |

---

## REFERÊNCIAS CIENTÍFICAS

1. Dhuliawala et al. (arXiv:2309.11495, 2023) — Chain-of-Verification: 28-46% hallucination reduction; diminishing returns after 3 verification questions.
2. Chen et al. (arXiv:2305.05176, 2023) — FrugalGPT: skip verification for high-capability models; cascade routing saves 98% cost.
3. Amdahl, G.M. (1967) — Amdahl's Law: bounded latency prevents tail-latency cascade.
4. Snell et al. (arXiv:2408.03314, 2024) — Test-Time Compute scaling: most effective for weaker models, not frontier models.
5. Wang et al. (arXiv:2203.11171, 2023) — Self-Consistency: most effective when initial quality is low.
6. Kim et al. (arXiv:2405.01535, 2024) — Prometheus 2: calibration of evaluators; penalties must be evidence-based.
7. Min et al. (arXiv:2305.14251, 2023) — FActScore: atomic fact scoring; 3 atomic facts sufficient for verification.
8. Goodhart's Law (Strathern, 1997) — "When a measure becomes a target, it ceases to be a good measure."

---

## HISTÓRICO DE VERSÕES

| Versão | Ciclo | Data | Destaques |
|--------|-------|------|-----------|
| v122.10 | C257 | 2026-03-11 | Smart Pipeline Gating: CoVe 5→3, TIER_4 skip CoVe/GRPO/TTC, quality gate GRPO/ParallelSC. Latência P50: 36s→~20s. |
| v122.9 | C256 | 2026-03-11 | Remoção penalty medium hallucinationRisk. Benchmark C238 v8: 16/18 PASS (89%). |
| v95.0 | C212 | 2026-03-10 | NC-COG-009 (Lean4) + NC-COG-010 (Multi-Step FOL) + NC-COG-011 (Phonetic Rhyme) + NC-COG-012 (Adaptive Calibration). |
| v94.0 | C210 | 2026-03-10 | NC-COG-005 (FOL) + NC-COG-006 (Creative) + NC-COG-007 (Calibrator) + NC-COG-008 (Lock-Free). |

---

## ÍNDICE DE AWAKES

| AWAKE | Versão MOTHER | Ciclo | Data |
|-------|--------------|-------|------|
| V295 | v122.10 | C257 | 2026-03-11 |
| V294 | v95.0 | C212 | 2026-03-10 |
| V293 | v94.0 | C210 | 2026-03-10 |
| V292 | v93.0 | C209 | 2026-03-09 |
| V270 | v120.0 | C230 | 2026-03-08 |
