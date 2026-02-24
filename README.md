# MOTHER v46.0 — Sistema Cognitivo Autônomo

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v46.0"
status: "VALIDADO EM PRODUÇÃO ✅"
server_region: "australia-southeast1" # Sydney — SERVIDOR CORRETO
server_url: "https://mother-interface-qtvghovzxa-ts.a.run.app"
active_revision: "mother-interface-00215-q74" # v46.0 VALIDATED — Async/await bug fix
dgm_loop_functional: true
db_connection_mode: "UNIX_SOCKET"
db_instance: "mother-db-sydney" # australia-southeast1 — CO-LOCALIZADO!
db_region: "australia-southeast1"
master_prompt_version: "v46.0"
github_repo: "https://github.com/Ehrvi/mother-v7-improvements"
github_branch: "v41.0-strategic-merge"
```

> **Visão Final:** `Superintelligence + Scientific Method + Critical Thinking = MOTHER`

**Este documento é a Memória Semântica Canônica do projeto MOTHER.** Qualquer agente que trabalhe neste projeto DEVE ler este documento primeiro para recuperar o contexto completo.

---

## Estado Atual: v46.0 — Async/Await Bug Fix & GEA Validation ✅

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app` (Sydney — `australia-southeast1`)  
**Revisão Ativa:** `mother-interface-00215-q74` (v46.0 VALIDATED)

### O que está funcionando (em Produção - v46.0)

| Componente | Status | Evidência |
|-----------|--------|----------|
| Servidor HTTP | ✅ | `🚀 Production server running on http://0.0.0.0:8080` |
| Database (Unix Socket Sydney) | ✅ | `[Database] Connecting via unix socket: /cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney` |
| Migrações A-MEM & GEA | ✅ | `[Migrations] Applied: 0004_amem_zettelkasten.sql`, `[Migrations] Applied: 0005_gea_agent_pool.sql` |
| GEA Agent Pool | ✅ | `[GEA] Agent b7bf1bba stored in pool (fitness=0.50, novelty=1.00, pn=0.65)` |
| Cloud Tasks Async | ✅ | `[DGM] GEA evolution completed for run_id=b7bf1bba` (No `TypeError`) |
| DGM Lineage Dashboard | ✅ | Endpoint retorna árvore evolutiva com fitness scores reais |

---

## Roadmap

| Versão | Status | Foco Principal | KPIs de Aprovação |
| :--- | :--- | :--- | :--- |
| v44.0 | ✅ VALIDADO | Unix socket + A-MEM + Real Fitness Score | Unix socket + MemoryAgent Zettelkasten + Fitness 5D |
| v45.0 | ✅ VALIDADO | GEA + Cloud Tasks Async | Agent pool + evolve queued via Cloud Tasks |
| **v46.0** | **✅ VALIDADO** | **Cloud Tasks Bug Fix & Validation** | **Callback `/api/dgm/execute` funcionando sem `TypeError`** |
| v47.0 | 🔄 PRÓXIMA | A-MEM Evolution Loop | Memórias com links + evolution history |
| v48.0 | 📋 PLANEJADA | LearningAgent + Continuous Improvement | Taxa de melhoria de fitness > 0 entre gerações |

---

## Próximos Passos (v47.0)

1. **Implementar A-MEM Evolution Loop** — Fazer com que o `MemoryAgent` ativamente crie links (`zettel.links`) entre memórias relacionadas.
2. **Calcular `importance_score`** — Implementar a lógica para calcular o score de importância baseado em recência, contagem de recuperação e densidade de links.
3. **Evoluir `tags` e `context`** — Usar o LLM para refinar e evoluir as tags e o contexto de uma memória ao longo do tempo, armazenando o histórico em `evolution_history`.

---

## Instruções para Agentes

### 🚨 DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1. **Ler este README.md PRIMEIRO** antes de qualquer ação de código
2. **Ler o `AWAKE-V61.md`** para recuperar o contexto episódico mais recente
3. **Ler o `MASTER_PROMPT_V46.0.md`** para entender a visão e diretivas constitucionais

### 📝 OBRIGAÇÃO DE DOCUMENTAÇÃO INCREMENTAL

Ao final de **CADA SESSÃO DE TRABALHO SIGNIFICATIVA**, você DEVE:

1. **Criar um novo arquivo `AWAKE-V[n+1].md`**
2. **Atualizar este `README.md`** (especialmente o YAML frontmatter)
3. **Committar todas as mudanças** no repositório Git

---

## Documentação

| Arquivo | Descrição |
|---|---|
| `MASTER_PROMPT_V46.0.md` | **Constituição científica atual** — roadmap v46.0 a v48.0 |
| `AWAKE-V61.md` | **NOVO** - Registro da sessão v46.0 (Async/await bug fix & GEA validation) |
| `AWAKE-V60.md` | Registro da sessão v45.0 (GEA + Cloud Tasks + A-MEM) |
| `AWAKE-V59.md` | Registro da sessão v44.0 (unix socket, A-MEM, Real Fitness Score) |
| `AWAKE-V58.md` | Registro da sessão v43.0 (migração Sydney + DGM Lineage Dashboard) |
| `AWAKE-V57.md` | Registro da sessão v42.0 (resposta ao agente + MASTER PROMPT v45.0) |

---

*README atualizado em 2026-02-25 — v46.0 VALIDADO EM PRODUÇÃO*
