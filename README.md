# MOTHER v45.0 — Sistema Cognitivo Autônomo

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v45.0"
status: "VALIDADO EM PRODUÇÃO ✅"
server_region: "australia-southeast1" # Sydney — SERVIDOR CORRETO
server_url: "https://mother-interface-qtvghovzxa-ts.a.run.app"
active_revision: "mother-interface-00210-ql9" # v45.0 VALIDATED — GEA + Cloud Tasks
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

## Estado Atual: v45.0 — GEA + Cloud Tasks Async + A-MEM Zettelkasten ✅

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app` (Sydney — `australia-southeast1`)  
**Revisão Ativa:** `mother-interface-00210-ql9` (v45.0 VALIDATED)

### O que está funcionando (em Produção - v45.0)

| Componente | Status | Evidência |
|-----------|--------|----------|
| Servidor HTTP | ✅ | `🚀 Production server running on http://0.0.0.0:8080` |
| Database (Unix Socket Sydney) | ✅ | `[Database] Connecting via unix socket: /cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney` |
| Migrações A-MEM | ✅ | `[Migrations] Applied: 0004_amem_zettelkasten.sql` |
| Migrações GEA | ✅ | `[Migrations] Applied: 0005_gea_agent_pool.sql` |
| GEA Agent Pool | ✅ NEW | `mother.supervisor.agentPool` → `{"pool_size": 0, "max_pool_size": 5}` |
| Cloud Tasks Async | ✅ NEW | `mother.supervisor.evolve` → `{"status": "queued", "execution_mode": "cloud_tasks_async"}` |
| DGM Lineage Dashboard | ✅ | Endpoint retorna árvore evolutiva com fitness scores reais |

---

## Roadmap

| Versão | Status | Foco Principal | KPIs de Aprovação |
| :--- | :--- | :--- | :--- |
| v42.0 | ✅ VALIDADO | Loop DGM completo | DGM loop funcional em produção |
| v43.0 | ✅ VALIDADO | Migração Sydney + Dashboard | Banco co-localizado + Lineage endpoint operacional |
| v44.0 | ✅ VALIDADO | Unix socket + A-MEM + Real Fitness Score | Unix socket + MemoryAgent Zettelkasten + Fitness 5D |
| **v45.0** | **✅ VALIDADO** | **GEA + Cloud Tasks Async** | **Agent pool + evolve queued via Cloud Tasks** |
| v46.0 | 🔄 PRÓXIMA | Cloud Tasks Validation + Real Fitness | Callback `/api/dgm/execute` funcionando + fitness real |
| v47.0 | 📋 PLANEJADA | A-MEM Evolution Loop | Memórias com links + evolution history |
| v48.0 | 📋 PLANEJADA | LearningAgent + Continuous Improvement | Taxa de melhoria de fitness > 0 entre gerações |

---

## Próximos Passos (v46.0)

1. **Validar Cloud Tasks callback** — verificar se `/api/dgm/execute` recebe as tasks
2. **Implementar fitness score real** — substituir score sintético por benchmark real
3. **Seleção de pais GEA** — Performance-Novelty criterion (arXiv:2602.04837)

---

## Instruções para Agentes

### 🚨 DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1. **Ler este README.md PRIMEIRO** antes de qualquer ação de código
2. **Ler o `AWAKE-V60.md`** para recuperar o contexto episódico mais recente
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
| `AWAKE-V60.md` | Registro da sessão v45.0 (GEA + Cloud Tasks + A-MEM) |
| `AWAKE-V59.md` | Registro da sessão v44.0 (unix socket, A-MEM, Real Fitness Score) |
| `AWAKE-V58.md` | Registro da sessão v43.0 (migração Sydney + DGM Lineage Dashboard) |
| `AWAKE-V57.md` | Registro da sessão v42.0 (resposta ao agente + MASTER PROMPT v45.0) |
| `AWAKE-V56.md` | Registro da sessão v41.0 (fix TCP connection bug) |

---

*README atualizado em 2026-02-25 — v45.0 VALIDADO EM PRODUÇÃO*
