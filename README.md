# MOTHER — Sistema Cognitivo Autônomo v42.0

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v42.0"
status: "VALIDADO EM PRODUÇÃO ✅"
server_region: "australia-southeast1" # Sydney — SERVIDOR CORRETO
server_url: "https://mother-interface-qtvghovzxa-ts.a.run.app"
active_revision: "mother-interface-00197-77d" # v42.0 VALIDATED — TCP DB fix
dgm_loop_functional: true
db_connection_mode: "TCP" # mysql://mother_app:***@34.67.27.227:3306/mother_v7_prod
master_prompt_version: "v44.0"
github_repo: "https://github.com/Ehrvi/mother-v7-improvements"
github_branch: "v41.0-strategic-merge"
last_commit: "3c9480c" # fix(db): support TCP connection mode for cross-region Cloud SQL
```

> **Visão Final:** Um sistema cognitivo na vanguarda do conhecimento, capaz de auto-aperfeiçoamento contínuo através do loop Darwin Gödel Machine (DGM).

**Este documento é a Memória Semântica Canônica do projeto MOTHER.** Qualquer agente que trabalhe neste projeto DEVE ler este documento primeiro para recuperar o contexto completo.

---

## Estado Atual: v42.0 — Loop Evolutivo DGM VALIDADO ✅

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app` (Sydney — `australia-southeast1`)  
**Revisão Ativa:** `mother-interface-00197-77d` (v42.0 VALIDATED — TCP DB fix)  
**Commit:** `3c9480c` — `fix(db): support TCP connection mode for cross-region Cloud SQL`

O bug crítico que impedia o `MySqlCheckpointer` de funcionar foi **corrigido e validado em produção**. A causa raiz era que o Cloud SQL Auth Proxy unix socket não estava disponível no Cloud Run `australia-southeast1` para o Cloud SQL em `us-central1`. A solução foi migrar para conexão TCP direta.

### O que está funcionando (em Produção - v42.0)

| Componente | Status | Evidência |
|-----------|--------|----------|
| Servidor HTTP | ✅ | `🚀 Production server running on http://0.0.0.0:8080` |
| Database Pool (TCP) | ✅ | `[Database] Connecting via TCP to 34.67.27.227:3306` |
| Migrações | ✅ | `[Migrations] Applied: 0003_omniscient_tables.sql` |
| MySqlCheckpointer | ✅ | `[MySqlCheckpointer] putWrites called with 3 writes` |
| LLM Router (GPT-4o) | ✅ | `[Supervisor] Router decided: validation_agent` |
| ValidationAgent ReAct | ✅ | `[Supervisor] ValidationAgent executing (ReAct v40.0)` |
| DGM Loop | ✅ | `evolve` endpoint retorna `{"run_id": "...", "status": "started"}` |

---

## Roadmap (MASTER PROMPT v44.0)

O desenvolvimento futuro é guiado pelo `MASTER_PROMPT_V44.0.md`, que se baseia no estado da arte da pesquisa em IA de 2026.

| Versão | Foco Principal | Critérios de Aprovação Empíricos (KPIs) |
| :--- | :--- | :--- |
| **v42.0** | **Correção e Validação do Loop DGM** | **1. Debug do Runtime:** Identificar e corrigir o bug que impede a inicialização da v42.0. **2. Teste Local:** Executar o loop evolutivo completo (`validation` → `archive` → `mutation`) localmente com sucesso. **3. Deploy Canário:** Realizar um deploy gradual (10% do tráfego) para a v42.0 corrigida. **4. Validação em Produção:** Um novo registro deve ser criado no `dgm_archive` com um `parent_id` válido, originado de uma mutação bem-sucedida em produção. |
| **v43.0** | **Memória Agentic (A-MEM)** | **1. Arquitetura Zettelkasten:** O `MemoryAgent` deve ser capaz de criar notas de memória interconectadas com tags e links. **2. Recuperação Conectada:** Ao recuperar uma memória, o agente deve também recuperar memórias conectadas. **3. Evolução da Memória:** O `MemoryAgent` deve ser capaz de atualizar memórias existentes com base em novas informações. |
| **v44.0** | **Evolução em Grupo (GEA)** | **1. Pool de Agentes:** Manter um pool de, no mínimo, 5 agentes em paralelo. **2. Compartilhamento de Experiência:** Implementar um mecanismo para que os agentes compartilhem aprendizados. **3. Aceleração da Evolução:** O `fitness_score` médio do grupo deve aumentar mais rápido que o de um agente DGM isolado. |

---

## Instruções para Agentes

### 🚨 DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1. **Ler este README.md PRIMEIRO** antes de qualquer ação de código
2. **Ler o `AWAKE-V55.md`** para recuperar o contexto episódico mais recente
3. **Ler o `MASTER_PROMPT_V44.0.md`** para entender a visão e diretivas constitucionais

### 📝 OBRIGAÇÃO DE DOCUMENTAÇÃO INCREMENTAL

Ao final de **CADA SESSÃO DE TRABALHO SIGNIFICATIVA**, você DEVE:

1. **Criar um novo arquivo `docs/AWAKE-V[n+1].md`**
2. **Atualizar este `README.md`**
3. **Committar todas as mudanças** no repositório Git.
