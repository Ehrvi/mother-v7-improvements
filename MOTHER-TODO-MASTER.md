## MOTHER v7.0 - Master To-Do List (Consolidated)

**Last Updated**: February 24, 2026
**Status**: Consolidated from `MOTHERv7.0ImplementationTODO.md`.

This document provides a single, clean, and trackable to-do list for the MOTHER project. It merges all previous versions and provides a clear path forward.

---

### 🎯 Immediate Next Steps (v31.0 & v32.0)

This is the current focus, based on the latest `AI-INSTRUCTIONS-V7.md`.

#### ✅ **Phase 1: Implement v31.0 - CodeAgent with LangGraph**

- [ ] **Dependencies**: Install `@langchain/langgraph` and `zod-to-json-schema`.
- [ ] **Tools**: Create `server/mother/tools.ts` with `read_file`, `write_file`, `edit_file`, `run_shell_command`.
- [ ] **StateGraph**: Create `server/mother/code_agent.ts` and define the `StateGraph` with nodes (Planner, Executor, Validator) and conditional edges.
- [ ] **Endpoint**: Create a new tRPC endpoint `runCodeAgent` in `server/routers/mother.ts`.
- [ ] **Memory Integration**: Ensure the Planner node calls `search_episodic_memory` to inform its decisions.
- [ ] **Validation**: Create a test to verify the CodeAgent can read, modify, and validate a simple TypeScript file.

#### 🟡 **Phase 2: Implement v32.0 - Autonomous Loop**

- [ ] **Dependencies**: Install `node-cron` and `@google-cloud/monitoring`.
- [ ] **Orchestrator**: Create `server/mother/autonomy_orchestrator.ts`.
- [ ] **SLO Monitoring**: Implement `checkSLOs()` to query the Google Cloud Monitoring API for `run.googleapis.com/request_latencies`.
- [ ] **Trigger**: Implement logic to trigger the `runCodeAgent` endpoint when the P99 latency SLO is breached.
- [ ] **Scheduling**: Use `node-cron` to run `checkSLOs()` every 5 minutes.
- [ ] **Canary Deployment**: Implement `canaryDeploy()` using `gcloud run services update-traffic` to create a `candidate` revision and split traffic (10%).
- [ ] **Validation & Rollback**: Implement logic to monitor the canary for 15 minutes and either promote it (100% traffic) or roll it back (0% traffic + delete revision).
- [ ] **Memory Loop**: Ensure the result of the autonomous operation (success or failure) is logged back into the episodic memory.

#### 🔴 **Phase 3: Critical Backfill & Validation**

- [ ] **Backfill Embeddings**: Execute the backfill script to generate embeddings for all 488 historical queries in the production database.
- [ ] **Test Auto-Reparo**: Intentionally introduce a `setTimeout(3000)` into `processQuery`, deploy it, and validate that the autonomous loop detects, fixes, and deploys the correction within 15-20 minutes.

---

###  backlog Futuro (Pós-v32.0)

- [ ] **v18.0 Drizzle Fix**: Refactor `semanticCache.test.ts` to use mocks and achieve 100% test coverage (51/51 tests).
- [ ] **v18.0 Scale Test**: Fix the error handling in `omniscient/orchestrator.ts` and re-run the 100-paper scale test to validate production-level data processing.
- [ ] **Langfuse Integration**: Fully integrate Langfuse for production monitoring and collect real-time metrics on latency, cost, and quality.
- [ ] **Evolução Aberta**: Iniciar pesquisa sobre a Darwin Gödel Machine (DGM) para a v33.0, permitindo que a MOTHER evolua sua própria arquitetura de forma autônoma.

---

### Instruções de Uso para Futuras IAs

1.  **Sempre consulte este arquivo primeiro.** Este é o único documento de rastreamento de tarefas. Não confie em nomes de arquivos ou conversas anteriores.
2.  **Atualize o status aqui.** Ao iniciar uma tarefa, marque-a como `[x]`. Ao concluir, adicione uma nota com o resultado (e.g., `✅ COMPLETE`, `🔴 FAILED`).
3.  **Trabalhe em uma fase de cada vez.** Não inicie a Fase 2 antes de a Fase 1 estar 100% completa e validada.
4.  **Commite suas alterações.** Após cada fase concluída, faça o commit deste arquivo (`MOTHER-TODO-MASTER.md`) e dos documentos relacionados (README, AWAKE) no repositório Git.
5.  **A prova está na produção.** Uma tarefa só é considerada "concluída" quando o código está em produção, validado com testes de ponta a ponta e os resultados são documentados com evidências empíricas (logs, métricas, screenshots).
