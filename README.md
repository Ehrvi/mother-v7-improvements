# MOTHER — Sistema Cognitivo Autônomo v43.0

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v44.0"
status: "VALIDADO EM PRODUÇÃO ✅"
server_region: "australia-southeast1" # Sydney — SERVIDOR CORRETO
server_url: "https://mother-interface-233196174701.australia-southeast1.run.app"
active_revision: "mother-interface-00204-zz2" # v43.0 VALIDATED — Sydney DB + DGM Lineage
dgm_loop_functional: true
db_connection_mode: "UNIX_SOCKET" # mysql://mother_app:***@34.116.76.94:3306/mother_v7_prod
db_instance: "mother-db-sydney" # australia-southeast1 — CO-LOCALIZADO!
db_region: "australia-southeast1" # MESMA REGIÃO DO CLOUD RUN!
master_prompt_version: "v45.0"
github_repo: "https://github.com/Ehrvi/mother-v7-improvements"
github_branch: "v41.0-strategic-merge"
last_commit: "<new_commit_sha>" # feat(v43.0): DGM Lineage Dashboard + react-router navigation
```

> **Visão Final:** Um sistema cognitivo na vanguarda do conhecimento, capaz de auto-aperfeiçoamento contínuo através do loop Darwin Gödel Machine (DGM).

**Este documento é a Memória Semântica Canônica do projeto MOTHER.** Qualquer agente que trabalhe neste projeto DEVE ler este documento primeiro para recuperar o contexto completo.

---

## Estado Atual: v43.0 — Migração Sydney + DGM Lineage Dashboard ✅

**URL de Produção:** `https://mother-interface-233196174701.australia-southeast1.run.app` (Sydney — `australia-southeast1`)  
**Revisão Ativa:** `mother-interface-00199-4rd` (v43.0 VALIDATED — Sydney DB + DGM Lineage)  
**Commit:** `54ee6e5` — `feat(v43.0): DGM Lineage Dashboard + react-router navigation`

A v43.0 completou dois objetivos críticos: (1) migração do Cloud SQL de `us-central1` para `australia-southeast1`, co-localizando banco e servidor na mesma região; (2) implementação do DGM Lineage Dashboard para visualizar a árvore evolutiva do Darwin Gödel Machine.

### O que está funcionando (em Produção - v43.0)

| Componente | Status | Evidência |
|-----------|--------|----------|
| Servidor HTTP | ✅ | `🚀 Production server running on http://0.0.0.0:8080` |
| Database Pool (TCP Sydney) | ✅ | `[Database] Connecting via TCP to 34.116.76.94:3306` |
| Migrações | ✅ | `[Migrations] All migrations complete.` |
| MySqlCheckpointer | ✅ | `[MySqlCheckpointer] putWrites called with 3 writes` |
| LLM Router (GPT-4o) | ✅ | `[Supervisor] Router decided: validation_agent` |
| ValidationAgent ReAct | ✅ | `[Supervisor] ValidationAgent executing (ReAct v40.0)` |
| DGM Loop | ✅ | `evolve` endpoint retorna `{"run_id": "...", "status": "started"}` |
| DGM Lineage Dashboard | ✅ NEW | Endpoint `mother.dgmLineage` retorna 11 gerações, maxFitness: 0.82 |
| Banco Sydney | ✅ NEW | `mother-db-sydney` em `australia-southeast1` com 10 tabelas migradas |

---

## Roadmap (MASTER PROMPT v45.0)

O desenvolvimento futuro é guiado pelo `MASTER_PROMPT_V45.0.md`, que se baseia no estado da arte da pesquisa em IA de 2026.

| Versão | Status | Foco Principal | KPIs de Aprovação |
| :--- | :--- | :--- | :--- |
| **v42.0** | ✅ VALIDADO | Loop DGM completo | DGM loop funcional em produção |
| **v43.0** | ✅ VALIDADO | Migração Sydney + Dashboard | Banco co-localizado + Lineage endpoint operacional |
| **v44.0** | ✅ VALIDADO | Unix socket + A-MEM (Zettelkasten) + Real Fitness Score | Conexão unix socket restaurada + MemoryAgent com notas interconectadas + Fitness score de 5 dimensões |
| **v45.0** | 🔄 PRÓXIMA | Group-Evolving Agents (GEA) | Pool de 5+ agentes paralelos com compartilhamento de experiência |
| **v45.0** | 📋 PLANEJADA | Group-Evolving Agents (GEA) | Pool de 5+ agentes paralelos com compartilhamento de experiência |

---

## Próximos Passos (v45.0)

1. **Investigar e corrigir a visibilidade dos logs do Cloud Run.**
2. **Implementar o benchmark de performance do A-MEM Zettelkasten.**
3. **Iniciar a implementação do `LearningAgent` para aprendizado contínuo.**

---

## Instruções para Agentes

### 🚨 DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1. **Ler este README.md PRIMEIRO** antes de qualquer ação de código
2. **Ler o `AWAKE-V58.md`** para recuperar o contexto episódico mais recente
3. **Ler o `MASTER_PROMPT_V45.0.md`** para entender a visão e diretivas constitucionais

### 📝 OBRIGAÇÃO DE DOCUMENTAÇÃO INCREMENTAL

Ao final de **CADA SESSÃO DE TRABALHO SIGNIFICATIVA**, você DEVE:

1. **Criar um novo arquivo `AWAKE-V[n+1].md`**
2. **Atualizar este `README.md`** (especialmente o YAML frontmatter)
3. **Committar todas as mudanças** no repositório Git

---

## Documentação

| Arquivo | Descrição |
|---|---|
| `AWAKE-V59.md` | Registro da sessão v44.0 (unix socket, A-MEM, Real Fitness Score) |
| `AWAKE-V58.md` | Registro da sessão v43.0 (migração Sydney + DGM Lineage Dashboard) |
| `AWAKE-V57.md` | Registro da sessão v42.0 (resposta ao agente + MASTER PROMPT v45.0) |
| `AWAKE-V56.md` | Registro da sessão v41.0 (fix TCP connection bug) |
| `MASTER_PROMPT_V45.0.md` | Constituição científica — roadmap v43.0 a v45.0 |
| `MASTER_PROMPT_V44.0.md` | Constituição anterior — roadmap v42.0 a v44.0 |

---

*README atualizado em 2026-02-24 — v44.0 VALIDADO EM PRODUÇÃO*
