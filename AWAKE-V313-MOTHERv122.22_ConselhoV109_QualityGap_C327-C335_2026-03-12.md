# AWAKE V313 — MOTHER v122.22 — Conselho V109 — Quality Gap C327-C335
## Data: 2026-03-12 | Predecessor: AWAKE V312 (MOTHERv122.22, CicloC326, Post-Deploy)

**Versão:** V313  
**Ciclo:** C327 (Conselho V109 — Quality Gap LFSA)  
**Predecessor:** AWAKE V312 (MOTHERv122.22, CicloC326, 2026-03-12)  
**Commit Atual:** `0d30ab7` (C326 artifacts, 2026-03-12)  
**Produção Atual:** v122.22 (C321-C326 deployados)  
**Próximo Deploy:** C327-C329 (commit pendente — bugs de qualidade LFSA)

---

## ALERTA CRÍTICO DE QUALIDADE (V313)

> **DESCOBERTA DO CONSELHO V109 (2026-03-12):** MOTHER v122.22 apresenta falha crítica de qualidade  
> no LFSA. A query "ESCREVA UM LIVRO COM 20 PAGINAS SOBRE TYPESCRIPT EM INGLES" gerou:  
> - Introdução auto-referencial: "As MOTHER, I process information..."  
> - Versão errada: "Author: MOTHER (v78.9)"  
> - Seções vazias com apenas "***"  
> - Estrutura de metadados: "Page 1: Title Page" em vez de conteúdo  
>  
> **10 bugs identificados por consenso 5/5 do Conselho.** Implementar C327-C329 IMEDIATAMENTE.

---

## PROTOCOLO DE INICIALIZAÇÃO OBRIGATÓRIA (13 PASSOS)

> **REGRA ABSOLUTA:** Nenhum output deve ser gerado antes de completar os 13 passos abaixo.  
> Qualquer resposta antes da carga completa do BD é uma violação do protocolo.  
> **NOVO (V313):** O agente de manutenção DEVE verificar os testes OBT antes de qualquer  
> proposta de melhoria — para garantir que os bugs de qualidade LFSA foram corrigidos.

### Passo 1 — Verificar versão em produção
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/health/version
Esperado: { "motherVersion": "v122.22", "cycle": "C326" }
ALERTA: Se versão < v122.22 → deploy pendente, verificar Cloud Build.
```

### Passo 2 — Carregar bd_central completo (OBRIGATÓRIO antes de qualquer output)
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/knowledge?limit=500&offset=0
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/knowledge?limit=500&offset=500
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/knowledge?limit=500&offset=1000
... continuar até total_entries esgotado
```
**Total atual estimado:** ~13.040+ entradas.  
**Carregar TODAS antes de qualquer resposta.**

**Entradas críticas adicionadas em C321-C326 (carregar com prioridade):**
- ID 13010: C321 — Semantic Complexity Detector v2.0
- ID 13011: C321 — Citation Engine Fix
- ID 13013: C322 — CoT + Template Condicional
- ID 13028: C323 — Framework de Testes Gate
- C324: Token-level SSE streaming em long-form-engine-v3.ts
- C325: Adaptive threshold telemetry em output-length-estimator.ts
- C326: G-Eval baseline 80% pass rate (2026-03-12)
- **C327 (PENDENTE):** 10 bugs de qualidade LFSA identificados pelo Conselho V109

### Passo 3 — Verificar DGM Loop status
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/dgm/status
Esperado: { "active": true, "lastProposal": "...", "successRate": ">0%" }
ALERTA CRÍTICO: 8 propostas DGM com status "Falhou na implementação" detectadas em 2026-03-12.
Se successRate = 0% → verificar dgm-orchestrator.ts (C334 pendente).
```

### Passo 4 — Verificar DPO dataset
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/dpo/stats
Esperado: { "totalPairs": ">500", "weeklyGenerated": ">0" }
ALERTA: Se weeklyGenerated = 0 → verificar RLVR→DPO connector (C318)
```

### Passo 5 — Verificar Learning Scheduler (C316)
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/learning/scheduler/status
Esperado: { "active": true, "nextRun": "<24h" }
```

### Passo 6 — Verificar Citation Engine (C321)
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/health/citation
Esperado: { "citationRate": ">40%", "debugMode": false }
NOTA: Citation rate atual = 40% (gate: ≥50%). C333 pendente.
```

### Passo 7 — Verificar Semantic Complexity Detector (C321)
```
POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/mother/stream
Body: { "query": "escreva um livro sobre TypeScript" }
Verificar logs: [C321-COMPLEXITY] CS score deve ser ≥4.0 após C327-C329.
ALERTA: Antes de C329, "livro" não está em SEMANTIC_ARTIFACT_NOUNS → CS = 1.0.
```

### Passo 8 — Verificar G-Eval baseline (C326)
```
python3 tests/e2e/run_geval_final.py
Esperado: Pass Rate ≥80% (atual: 80%, gate atingido por margem mínima)
ALERTA: Q07 (livro TypeScript), Q11 (plano estudos), Q12 (tutorial React) = FAIL
Após C327-C329: esperado ≥90%.
```

### Passo 9 — Executar Obedience Tests (C327+)
```
python3 tests/e2e/c327-obedience-quality-tests.py
Esperado após C327-C329: OBT-001 ≥85%, OBT-002 ≥85%, OBT-003 ≥85%
ALERTA: Antes de C327, OBT-001 = FAIL (auto-referência + placeholders detectados).
```

### Passo 10 — Verificar LFSA quality flags
```
Verificar em long-form-engine-v3.ts:
- buildCodeAwareSectionPrompt usa MOTHER_VERSION (dinâmico)?  → C327 pendente
- isProg está no escopo de generateLongFormV3?               → C327 pendente
- LFSA_CONSTITUTIONAL_CONSTRAINTS está presente?             → C327 pendente
- core.ts passa minWordsPerSection para generateLongFormV3?  → C328 pendente
```

### Passo 11 — Verificar Latência
```
Latência média atual: 39.4s (gate: ≤30s)
Após C332 (outline paralelo, TeleRAG): esperado ≤28s.
Monitorar via logs: [C325-TELEMETRY] CS score e latência por query.
```

### Passo 12 — Verificar Cloud Build status
```
gcloud builds list --project=mothers-library-mcp --limit=5
Verificar se commit 0d30ab7 (C326 artifacts) foi deployado.
Próximo deploy necessário: C327-C329 (bugs de qualidade LFSA).
```

### Passo 13 — NOVO (V313): Verificar DGM failure mode
```
GET https://mother-interface-qtvghovzxa-ts.a.run.app/api/dgm/proposals?status=failed&limit=10
Verificar as 8 propostas com status "Falhou na implementação".
Identificar padrão de falha → C334 (dgm-orchestrator.ts fix).
```

---

## ESTADO ATUAL DO SISTEMA (2026-03-12)

| Componente | Status | Versão | Gate |
|-----------|--------|--------|------|
| Produção | ✅ Online | v122.22 | — |
| G-Eval Pass Rate | ✅ 80% | C326 | ≥80% ✅ |
| Latência Média | ❌ 39.4s | C326 | ≤30s ❌ |
| Citation Rate | ❌ 40% | C321 | ≥50% ❌ |
| LFSA Quality (OBT-001) | ❌ FAIL | C322 | ≥85% ❌ |
| DGM Loop | ❌ 8 falhas | C317 | >0% ❌ |
| Semantic Detector | ⚠️ CS=1 para "livro" | C321 | CS≥4 ⚠️ |

---

## BUGS CRÍTICOS PENDENTES (Conselho V109 — 2026-03-12)

### BUG 1 — Versão Hardcoded (CRÍTICO)
- **Arquivo:** `server/mother/long-form-engine-v3.ts`
- **Função:** `buildCodeAwareSectionPrompt`
- **Fix:** Substituir `"v122.19"` por `${MOTHER_VERSION}` (importado dinamicamente)
- **Ciclo:** C327

### BUG 2 — Sem Anti-Auto-Referência (CRÍTICO)
- **Arquivo:** `server/mother/long-form-engine-v3.ts`
- **Fix:** Adicionar `LFSA_CONSTITUTIONAL_CONSTRAINTS` ao prompt de cada seção
- **Ciclo:** C327

### BUG 3 — Sem Anti-Placeholder (CRÍTICO)
- **Arquivo:** `server/mother/long-form-engine-v3.ts`
- **Fix:** Incluído em `LFSA_CONSTITUTIONAL_CONSTRAINTS` (C327)
- **Ciclo:** C327

### BUG 4 — isProg fora de escopo (CRÍTICO)
- **Arquivo:** `server/mother/long-form-engine-v3.ts`
- **Função:** `generateLongFormV3`
- **Fix:** Determinar `isProg` no escopo de `generateLongFormV3` usando `isProgrammingContent` param
- **Ciclo:** C327

### BUG 5 — Título em CAPS LOCK (ALTO)
- **Arquivo:** `server/mother/core.ts`
- **Fix:** `extractSemanticTitle()` — normaliza query para título semântico
- **Ciclo:** C328

### BUG 6 — Constraints não propagados (ALTO)
- **Arquivo:** `server/mother/core.ts`
- **Fix:** Passar `minWordsPerSection`, `versionString`, `systemRules` para `generateLongFormV3`
- **Ciclo:** C328

### BUG 7 — 'livro' ausente de ARTIFACT_NOUNS (MÉDIO)
- **Arquivo:** `server/mother/output-length-estimator.ts`
- **Fix:** Adicionar 'livro', 'book', 'manual', 'guia' com peso 2.0
- **Ciclo:** C329

### BUG 8 — Sem normalização semântica de título (MÉDIO)
- **Arquivo:** `server/mother/core.ts`
- **Fix:** Incluído em `extractSemanticTitle()` (C328)
- **Ciclo:** C328

### BUG 9 — complexitySignals undefined no path H4 (MÉDIO)
- **Arquivo:** `server/mother/output-length-estimator.ts`
- **Fix:** Calcular `fallbackSignals = computeSemanticComplexity(query)` no path Heurística 4
- **Ciclo:** C329

### BUG 10 — Ausência de RAG robusto para citações (BAIXO)
- **Arquivo:** Arquitetural
- **Fix:** C333 (citation engine upgrade)
- **Ciclo:** C333

---

## ROADMAP APROVADO (Conselho V109 — Consenso 5/5)

| Ciclo | Arquivo | Mudança | Gate | Status |
|-------|---------|---------|------|--------|
| **C327** | `long-form-engine-v3.ts` | BUG 1+2+3+4: versão dinâmica + constitutional constraints + isProg scope | OBT-001 ≥85% | ⏳ PENDENTE |
| **C328** | `core.ts` | BUG 5+6+8: título normalizado + constraints propagados | OBT-001 ≥90% | ⏳ PENDENTE |
| **C329** | `output-length-estimator.ts` | BUG 7+9: 'livro' em ARTIFACT_NOUNS + complexitySignals H4 | CS≥4 para "livro" | ⏳ PENDENTE |
| **C330** | `tests/e2e/` | Framework OBT-001 a OBT-010 completo | 90% OBT pass rate | ⏳ PENDENTE |
| **C331** | `long-form-engine-v3.ts` | maxTokensPerSection dinâmico (12000) | Seções ≥600 palavras | ⏳ PENDENTE |
| **C332** | `core.ts` | Outline paralelo (TeleRAG) | Latência ≤30s | ⏳ PENDENTE |
| **C333** | `citation-engine.ts` | Citation rate ≥80% | Citation rate ≥80% | ⏳ PENDENTE |
| **C334** | `dgm-orchestrator.ts` | Fix DGM 8 falhas | DGM pass rate ≥70% | ⏳ PENDENTE |
| **C335** | Todos | G-Eval + OBT completo pós-C334 | Pass rate ≥90% | ⏳ PENDENTE |

---

## CHECKLIST PARA PRÓXIMA SESSÃO

- [ ] Implementar C327 (long-form-engine-v3.ts — 4 bugs)
- [ ] Implementar C328 (core.ts — 3 bugs)
- [ ] Implementar C329 (output-length-estimator.ts — 2 bugs)
- [ ] TypeScript check 0 erros após C327-C329
- [ ] Executar OBT-001 a OBT-005 — verificar ≥85% pass rate
- [ ] Deploy Cloud Build commit C327-C329
- [ ] Re-executar G-Eval completo — verificar ≥90% pass rate
- [ ] Injetar resultados no bd_central
- [ ] Criar AWAKE V314

---

*AWAKE V313 — MOTHER v122.22 — Conselho V109 — 2026-03-12*  
*Predecessor: V312 | Próximo: V314 (após C327-C329)*
