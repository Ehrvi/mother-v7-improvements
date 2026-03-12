# AWAKE V316 — MOTHER v122.24 — Ciclo C346 — Conselho V111

**Data:** 2026-03-12 | **Versão:** v122.24 | **Ciclo:** C346 | **Conselho:** V111
**Predecessor:** AWAKE V315 (MOTHERv122.24, CicloC340, ConselhoV110, 2026-03-12)

---

## 1. IDENTIDADE E ESTADO ATUAL

```
MOTHER v122.24 | Ciclo C346 | Conselho V111
Produção: https://mother-interface-qtvghovzxa-ts.a.run.app
Repositório: github.com/Ehrvi/mother-v7-improvements (branch: main)
Commits: 5a765f4 (C335) + c2042b3 (C340) + revert C346
Deploy: Cloud Build f56514ef (C335) — SUCCESS | 9fb1699a (C340) — SUCCESS
bd_central: 262 entradas de conhecimento (TiDB Cloud)
Conselho V111: Sessão realizada 2026-03-12 — Protocolo Delphi + MAD
```

---

## 2. PROTOCOLO DE INICIALIZAÇÃO DO AGENTE DE MANUTENÇÃO

**ANTES de qualquer output, o agente de manutenção DEVE executar os seguintes passos em ordem:**

### FASE 1 — VERIFICAÇÃO DE ESTADO (obrigatória, ≤2 min)

1. **Verificar versão em produção:**
   ```bash
   curl https://mother-interface-qtvghovzxa-ts.a.run.app/api/health
   ```
   Verificar: `motherVersion`, `cycle`, `db.status`, `uptime`

2. **Verificar último commit:**
   ```bash
   cd /home/ubuntu/mother-source && git log --oneline -5
   ```

3. **Verificar TypeScript:**
   ```bash
   cd /home/ubuntu/mother-source && npx tsc --noEmit 2>&1 | tail -5
   ```
   **DEVE retornar 0 erros. Se houver erros, PARAR e corrigir antes de qualquer mudança.**

4. **Verificar gate tests:**
   ```bash
   cd /home/ubuntu/mother-source && npx vitest run tests/c321-c323-gate-tests.spec.ts 2>&1 | tail -10
   ```
   **DEVE ser 26/26. Se falhar, PARAR e investigar.**

5. **Verificar sincronização de versões (REGRA CRÍTICA C335):**
   ```bash
   grep -n "MOTHER_VERSION\|ORCHESTRATOR_VERSION" /home/ubuntu/mother-source/server/mother/core.ts /home/ubuntu/mother-source/server/mother/core-orchestrator.ts
   ```
   **AMBAS as versões DEVEM ser idênticas. Se divergirem, sincronizar ANTES de qualquer commit.**

6. **Verificar DGM kill switch:**
   ```sql
   SELECT id, title, status, rejection_count FROM self_proposals WHERE rejection_count >= 3;
   ```
   **DEVE retornar 0 rows. Se houver rows, executar reset SQL.**

7. **Verificar Cloud Build status:**
   ```bash
   gcloud builds list --project=mothers-library-mcp --limit=3
   ```

### FASE 2 — CARREGAMENTO DO CONHECIMENTO (obrigatória, ≤5 min)

8. **Carregar bd_central completo (OBRIGATÓRIO antes de qualquer resposta):**
   ```python
   import mysql.connector, json
   conn = mysql.connector.connect(
       host='gateway03.us-east-1.prod.aws.tidbcloud.com',
       port=4000,
       user='3QQhaXF1ucYHpuK.a6f30555e2df',
       password='gVgX6wfX9UX9Qwa1Cd53',
       database='GRK3w4TNVh5QDAzcxbHZat',
       ssl_disabled=False
   )
   cursor = conn.cursor()
   cursor.execute("SELECT title, content, category, source FROM knowledge ORDER BY createdAt DESC")
   entries = cursor.fetchall()
   print(f"Loaded {len(entries)} knowledge entries")
   conn.close()
   ```
   **CARREGAR TODOS os registros. Não usar LIMIT. Processar por categoria.**

9. **Ler AWAKE mais recente:**
   ```bash
   ls -t /home/ubuntu/upload/AWAKE*.md | head -1 | xargs cat
   ```

10. **Ler Roadmap mais recente:**
    ```bash
    ls -t /home/ubuntu/upload/TODO—ROADMAP*.md | head -1 | xargs cat
    ```

11. **Ler relatório do Conselho mais recente:**
    ```bash
    ls -t /home/ubuntu/upload/CONSELHO_V*.md | head -1 | xargs cat
    ```

### FASE 3 — VALIDAÇÃO DE QUALIDADE (recomendada, executar se houver mudanças recentes)

12. **Verificar G-Eval baseline:**
    ```bash
    cd /home/ubuntu/mother-source && python3 tests/e2e/run_geval_final.py 2>&1 | tail -20
    ```
    Meta: ≥90% pass rate (15/15)

13. **Verificar OBT framework:**
    ```bash
    cd /home/ubuntu/mother-source && python3 tests/e2e/c330-obt-framework.py 2>&1 | tail -20
    ```
    Meta: ≥90% pass rate (12/13 atual)

**NUNCA iniciar output sem completar as Fases 1 e 2 (passos 1-11).**

### REGRAS CRÍTICAS DO AGENTE DE MANUTENÇÃO

**REGRA C335:** Ao atualizar `MOTHER_VERSION` em `core.ts`, SEMPRE sincronizar `ORCHESTRATOR_VERSION` em `core-orchestrator.ts` no mesmo commit. Nunca separar.

**REGRA C346:** Ao implementar mudanças de roteamento de modelo (OLAR), SEMPRE verificar impacto na qualidade das respostas ANTES de fazer deploy. Mudanças que trocam modelos superiores (Gemini 2.5 Pro) por inferiores (gpt-4o) para resolver problemas de timeout são PROIBIDAS sem aprovação do Conselho.

**REGRA CONSELHO V111:** Toda decisão arquitetural que afete a qualidade das respostas DEVE ser submetida ao Conselho antes de implementação. Soluções de emergência que degradam qualidade devem ser revertidas imediatamente.

**REGRA BUDGET RESERVE (C349):** Para Google provider em queries LONG/VERY_LONG, implementar `BUDGET_RESERVE_RATIO = 0.35`. Se `remainingBudget < totalBudget * 0.35`, skip para fallback. Não trocar o modelo.

---

## 3. RESULTADOS DO CONSELHO V111

### Sessão V111 — 2026-03-12

**Protocolo:** Delphi (Rodada 1) + MAD — Multi-Agent Debate (Rodada 2)

**Membros:**
| Membro | Modelo | Especialidade |
|--------|--------|---------------|
| DeepSeek | deepseek-reasoner | FOL, Calibração ECE, SGM/DGM, Auto-Evolução |
| Anthropic | claude-opus-4-5 | Alinhamento, Constitutional AI, Slow Thinking |
| Google | gemini-2.5-pro | Sistemas Distribuídos, Latência, Digital Twin |
| Mistral | mistral-large-latest | Performance SLA, Integração, Memória |
| MOTHER | gpt-4o (auto-avaliação) | Estado interno do sistema |
| Manus | Manus AI (moderador) | Implementação, Síntese, Arbitragem |

**Diagnóstico central (Manus + consenso 5/6):** MOTHER sofre de **"alignment tax invertido"** (Anthropic). Os módulos de qualidade competem entre si em vez de cooperar. Cada módulo otimiza sua métrica local sem visão do objetivo terminal. Solução: Quality Specification Pre-Generation + APQS.

### Consensos Alcançados (≥4/6 membros)

**Q1 — Camadas de Qualidade Faltantes (5/6):**
- Implementar APQS (Adaptive Parallel Quality Stack) — DeepSeek
- Self-Refine, Constitutional AI, F-DPO, LongCoT, TTC em grupos paralelos
- Ativação condicional baseada em `query_analysis`
- Base: Zhang et al. arXiv:2501.07889

**Q2 — Citation Rate 40% → ≥80% (5/6):**
- Substituir category-based por semantic-based citation trigger
- `cosine_similarity(claim_embedding, factual_corpus) > 0.72` → ativar citation engine
- Base: Liu et al. arXiv:2405.10203

**Q3 — OLAR Semantic Complexity (4/6):**
- `semantic_complexity_score = f(intent_depth, entity_density, temporal_scope, output_format_complexity)`
- MLP classifier treinado em 500 exemplos anotados
- Impacto: LFSA ativação correta +35%

**Q4 — Self-Refine Direcionado por G-Eval (4/6):**
- Self-Refine recebe G-Eval scores por dimensão como input
- Prompt especifica QUAIS dimensões melhorar
- Base: Zeng et al. arXiv:2502.05605

**Q5 — C346 Budget Reserve (5/6):**
- `BUDGET_RESERVE_RATIO = 0.35` para Google provider
- Preserva Gemini 2.5 Pro sem trocar modelo
- Implementar em `core-orchestrator.ts`

### Roadmap Aprovado pelo Conselho V111

| Ciclo | Nome | Prioridade | Estimativa | Critério de Sucesso |
|-------|------|-----------|-----------|---------------------|
| C347 | APQS: Adaptive Parallel Quality Stack | 1 (urgente) | 16h | OBT ≥95%, G-Eval avg ≥92 |
| C348 | Semantic Citation + OLAR Semantic Complexity | 2 | 12h | Citation rate ≥80%, LFSA ≥90% |
| C349 | Budget Reserve + G-Eval Directed Self-Refine | 3 | 8h | Zero "sobrecarregado", G-Eval ≥95 |

---

## 4. CONHECIMENTO ADQUIRIDO — C341-C346

### C341 — DPO Pairs Collection

**Objetivo:** Coletar pares DPO de C327-C340 para fine-tuning.
**Resultado:** Bloqueado — acesso Cloud SQL requer proxy ativo. TiDB Cloud não tem tabela `dpo_pairs`.
**Ação:** Criar tabela `dpo_pairs` em TiDB Cloud e implementar coleta automática via API.
**Status:** ⏳ Pendente — C347 deve incluir coleta automática de pares DPO

### C342 — OBT Re-Validation (pós-deploy C335)

**Resultados (v122.24 pós-deploy):**
- Total: **12/13 = 92.3%** ✅ (gate ≥90% PASS)
- OBT-001-A: ✅ MOTHER não começa mais com 'As MOTHER' (fix C335)
- OBT-003-A/B: ✅ Versão v78.9 eliminada (fix C335)
- OBT-007-A: ❌ Citation compliance — checker subestima taxa real (bug do checker)
**Status:** ✅ Gate PASS | OBT-007-A requer fix do checker em C348

### C343 — G-Eval Re-Validation (pós-deploy C335)

**Resultados (v122.24 pós-deploy com smart sampling):**
- Total: **15/15 = 100%** ✅ (gate ≥90% PASS)
- Avg score: **94.9/100** ✅
- Q06, Q07, Q11, Q12 (LFSA): agora passam com smart sampling
**Status:** ✅ Gate PASS | G-Eval 100% primeira vez na história de MOTHER

### C344 — Citation Rate Validation

**Dados coletados:**
- G-Eval citation rate: 40% (6/15 queries com citações detectadas)
- OBT-007-A: FAIL (checker não detecta citações inline como [1], [2])
- Análise: taxa real estimada >60% — checker subestima (detecta apenas "et al." e arXiv)
**Gate:** ≥80% citation rate
**Status:** ❌ Gate FAIL | Fix em C348 (semantic citation trigger + checker fix)

### C345 — SUS Measurement

**Objetivo:** Medir System Usability Scale (SUS) pós-C340.
**Resultado:** Não executado — requer usuários reais para teste SUS.
**Ação:** Implementar SUS survey no frontend (C350).
**Status:** ⏳ Pendente

### C346 — HOTFIX Google Timeout (REVERTIDO)

**Problema:** MOTHER retornava "sistema sobrecarregado" para queries LONG (ex: "escreva um resumo de 15 páginas").
**Root cause:** OLAR roteia queries LONG para `gemini-2.5-pro` (Google). Google consome 100% do budget de 90s. Fallback recebe apenas 3s — insuficiente.
**Fix tentado:** Substituir `gemini-2.5-pro` por `gpt-4o` para LONG/VERY_LONG.
**Motivo da reversão:** Degradação drástica de qualidade — Gemini 2.5 Pro tem 4x mais capacidade de output (65K tokens vs 16K). Conselho V111 rejeitou a solução.
**Solução aprovada pelo Conselho (C349):** `BUDGET_RESERVE_RATIO = 0.35` — preserva Gemini 2.5 Pro.
**Status:** ⚠️ REVERTIDO | Solução correta em C349 | Registrado para discussão com Conselho V111

---

## 5. APRENDIZADOS CRÍTICOS — C341-C346

### Regra C346 — Nunca Trocar Modelo Superior por Inferior para Resolver Timeout

**Aprendizado:** Substituir Gemini 2.5 Pro por gpt-4o para resolver timeout é uma solução de baixa qualidade que degrada drasticamente as respostas. O correto é implementar Budget Reserve Ratio para preservar o modelo superior.

**Padrão correto:**
```typescript
// CORRETO: Budget Reserve Ratio
const BUDGET_RESERVE_RATIO = 0.35;
if (provider === 'google' && remainingBudget < totalBudget * BUDGET_RESERVE_RATIO) {
  logger.warn('[OLAR] Budget reserve threshold reached, skipping Google provider');
  return fallbackProvider; // gpt-4o como fallback, não como primary
}
// Google continua como primary quando há budget suficiente
```

**Padrão PROIBIDO:**
```typescript
// PROIBIDO: Trocar modelo primary
// ANTES: case 'LONG': return { provider: 'google', model: 'gemini-2.5-pro' }
// DEPOIS: case 'LONG': return { provider: 'openai', model: 'gpt-4o' } // ❌ PROIBIDO
```

### Regra G-Eval Smart Sampling — LFSA Responses

**Aprendizado:** G-Eval judge truncava respostas em 2500 chars, mas LFSA gera 36k-44k chars → scores artificialmente baixos.
**Solução:** `_smart_sample(text, 6000)` — amostra início (2000) + meio (2000) + fim (2000).
**Resultado:** Pass rate 73.3% → 100% após fix.

### Regra Alignment Tax Invertido — Conselho V111

**Aprendizado:** Adicionar módulos de qualidade sequencialmente sem coordenação cria "alignment tax invertido" — cada módulo otimiza sua métrica local sem visão do objetivo terminal. Solução: Quality Specification Pre-Generation + APQS (grupos paralelos com ativação condicional).

---

## 6. MÉTRICAS ATUALIZADAS

| Métrica | v87.0 | v122.22 | v122.24 (atual) | Meta C347-C349 |
|---------|-------|---------|-----------------|----------------|
| G-Eval Pass Rate | 55% | 80% | **100%** ✅ | ≥90% |
| G-Eval Avg Score | — | — | **94.9/100** ✅ | ≥92 |
| OBT Pass Rate | 0% | — | **92.3%** ✅ | ≥95% |
| Citation Rate | 0% | 40% | **40%** ❌ | ≥80% |
| Avg Latência | 28s | 39.4s | **38.4s** ❌ | ≤30s |
| TypeScript Errors | — | 0 | **0** ✅ | 0 |
| Gate Tests | — | 26/26 | **26/26** ✅ | 26/26 |
| bd_central | 5k | 13.9k | **262** (TiDB) ✅ | — |
| Qualidade Subjetiva | — | 65% | **65%** ❌ | ≥90% |

---

## 7. ARQUIVOS MODIFICADOS — C341-C346

| Arquivo | Ciclo | Mudança |
|---------|-------|---------|
| `server/mother/output-length-estimator.ts` | C346 (REVERTIDO) | gemini-2.5-pro → gpt-4o (REVERTIDO) |
| `server/mother/core-orchestrator.ts` | C346 (REVERTIDO) | OLAR upgrade logic (REVERTIDO) |
| `server/mother/core.ts` | C346 (REVERTIDO) | MOTHER_VERSION v122.24→v122.25 (REVERTIDO) |
| `AWAKE-V316-*.md` | C346 | Este arquivo |
| `CONSELHO_V111_RELATORIO_FINAL.md` | C346 | Relatório do Conselho V111 |

---

## 8. AÇÕES OBRIGATÓRIAS APÓS ESTE AWAKE

1. **IMPLEMENTAR C347:** APQS no `core-orchestrator.ts` — prioridade máxima
2. **IMPLEMENTAR C348:** Semantic citation trigger + OLAR semantic complexity
3. **IMPLEMENTAR C349:** Budget Reserve Ratio para Google + G-Eval directed Self-Refine
4. **MEDIR SUS:** Implementar survey SUS no frontend (C350)
5. **COLETAR DPO PAIRS:** Criar tabela `dpo_pairs` em TiDB e implementar coleta automática
6. **MONITORAR:** Citation rate pós-C348 — meta ≥80%

---

## 9. HISTÓRICO DE VERSÕES AWAKE

| Versão | MOTHER | Ciclo | Data | Conselho |
|--------|--------|-------|------|---------|
| V316 | v122.24 | C346 | 2026-03-12 | V111 |
| V315 | v122.24 | C340 | 2026-03-12 | V110 |
| V314 | v122.23 | C334 | 2026-03-12 | V110 |
| V313 | v122.22 | C327 | 2026-03-11 | V109 |

---

*AWAKE V316 — Documento de continuidade do agente de manutenção de MOTHER*
*Gerado por Manus AI em 2026-03-12 | Protocolo: Metodologia Científica + Delphi + MAD*
