# MOTHER v47.1 — Arquitetura Cognitiva Científica

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v47.1"
status: "VALIDADO EM PRODUÇÃO ✅"
server_region: "australia-southeast1" # Sydney — SERVIDOR CORRETO
server_url: "https://mother-interface-qtvghovzxa-ts.a.run.app"
active_revision: "mother-interface-00217-xyz" # v47.1 HOTFIX — Strategy parser fix
dgm_loop_functional: true
db_connection_mode: "UNIX_SOCKET"
db_instance: "mother-db-sydney" # australia-southeast1 — CO-LOCALIZADO!
db_region: "australia-southeast1"
master_prompt_version: "v47.0"
github_repo: "https://github.com/Ehrvi/mother-v7-improvements"
github_branch: "v41.0-strategic-merge"
```

> **Visão Final:** `Superintelligence + Scientific Method + Critical Thinking = MOTHER`

**Este documento é a Memória Semântica Canônica do projeto MOTHER.** Qualquer agente que trabalhe neste projeto DEVE ler este documento primeiro para recuperar o contexto completo.

---

## Estado Atual: v47.1 — Arquitetura Cognitiva Científica ✅

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app` (Sydney — `australia-southeast1`)  
**Revisão Ativa:** `mother-interface-00217-xyz` (v47.1 VALIDATED)

### O que está funcionando (em Produção - v47.1)

| Componente | Status | Evidência |
|-----------|--------|----------|
| **Fitness History Tracking** | ✅ | `[GEA] Fitness history logged: gen=1, fitness=0.500, label=ACCEPTABLE` |
| **Embedding-Based Novelty** | ✅ | `[GEA] Agent ... stored in pool (fitness=0.50, novelty=0.64, pn=0.54)` |
| **Learn from Evolution** | ✅ | `[Learning] Storing 1 new insights from evolution run...` (implícito) |
| **Strategy Parser Robustness** | ✅ | `[GEA] Extracted 3 strategies from run...` (sem `SyntaxError`) |
| DGM/GEA Loop Completo | ✅ | `[DGM] GEA evolution completed for run_id=...` |

---

## Roadmap

| Versão | Status | Foco Principal | KPIs de Aprovação |
| :--- | :--- | :--- | :--- |
| v45.0 | ✅ VALIDADO | GEA + Cloud Tasks Async | Agent pool + evolve queued via Cloud Tasks |
| v46.0 | ✅ VALIDADO | Cloud Tasks Bug Fix & Validation | Callback `/api/dgm/execute` funcionando sem `TypeError` |
| **v47.0** | **✅ VALIDADO** | **Arquitetura Cognitiva Científica** | **Fitness history + embedding novelty + learn from evolution** |
| v48.0 | 🔄 PRÓXIMA | Análise de Fitness & Otimização PN | Taxa de melhoria de fitness > 0; Análise de `fitness_history` |
| v49.0 | 📋 PLANEJADA | Expansão do LearningAgent | Aprender com falhas; extrair insights mais complexos |

---

## Próximos Passos (v48.0)

1.  **Analisar `fitness_history`** — Criar scripts para analisar os dados da tabela `fitness_history` e visualizar a tendência de fitness ao longo do tempo.
2.  **Otimizar `NOVELTY_WEIGHT`** — Com base na análise de fitness, ajustar o peso da novidade no critério de Performance-Novelty para otimizar a exploração vs. explotação.
3.  **Refinar `LearningAgent`** — Melhorar o `LearningAgent` para extrair insights mais profundos das execuções de evolução, incluindo a análise de falhas.

---

## Instruções para Agentes

### 🚨 DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1.  **Ler este README.md PRIMEIRO** antes de qualquer ação de código
2.  **Ler o `AWAKE-V62.md`** para recuperar o contexto episódico mais recente
3.  **Ler o `MASTER_PROMPT_V47.0.md`** (a ser criado) para entender a visão e diretivas constitucionais

### 📝 OBRIGAÇÃO DE DOCUMENTAÇÃO INCREMENTAL

Ao final de **CADA SESSÃO DE TRABALHO SIGNIFICATIVA**, você DEVE:

1.  **Criar um novo arquivo `AWAKE-V[n+1].md`**
2.  **Atualizar este `README.md`** (especialmente o YAML frontmatter)
3.  **Committar todas as mudanças** no repositório Git

---

## Documentação

| Arquivo | Descrição |
|---|---|
| `MOTHER_v47_Scientific_Documentation.md` | **NOVO** - Documentação científica completa da arquitetura v47.0 |
| `AWAKE-V62.md` | **NOVO** - Registro da sessão v47.0 (Arquitetura Cognitiva Científica) |
| `AWAKE-V61.md` | Registro da sessão v46.0 (Async/await bug fix & GEA validation) |
| `AWAKE-V60.md` | Registro da sessão v45.0 (GEA + Cloud Tasks + A-MEM) |

---

*README atualizado em 2026-02-25 — v47.1 VALIDADO EM PRODUÇÃO*
