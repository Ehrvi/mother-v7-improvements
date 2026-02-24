## MASTER PROMPT: Implement MOTHER v33.0 - The Production-Ready Cognitive Singularity

**Copy-paste this entire prompt into a new task to begin.**

### CONTEXT

- **Current State**: MOTHER v31.0 is deployed on Cloud Run (`mother-interface-00175-7tc`). It uses a single `CodeAgent` built with the now-deprecated `createReactAgent` from LangGraph. The entry point is a tRPC `runCodeAgent` mutation.
- **Target State**: MOTHER v33.0, a multi-agent Darwin Gödel Machine (DGM) built with the production-ready LangGraph v1 stack.
- **Your Goal**: Execute Phase 1 of the `MOTHER-TODO-MASTER.md` for v33.0. You will refactor the existing codebase to the new Supervisor-Worker architecture using the correct, up-to-date libraries.

### PHASE 1: Implement v33.0 - The Production-Grade Multi-Agent DGM Architecture

This is your sole focus. Follow these steps precisely.

#### 1.1. Foundational Refactoring: Supervisor-Worker with LangChain v1

1.  **Install Dependencies**: Run `pnpm add @langchain/langgraph-supervisor @langchain/core langchain@^1.0.0`.
2.  **Create Supervisor File**: Create a new file at `/home/ubuntu/mother-code/mother-interface/server/mother/supervisor.ts`.
3.  **Implement Supervisor**: In `supervisor.ts`, use `createSupervisor` from `@langchain/langgraph-supervisor` to define the main workflow. It will manage three agents: `codeAgent`, `memoryAgent`, and `validationAgent`.
4.  **Refactor CodeAgent**: Go to `/home/ubuntu/mother-code/mother-interface/server/mother/code_agent.ts`. **Delete** the existing code and rewrite it using `createAgent` from `langchain`. The agent's tools (`codeAgentTools`) and purpose remain the same.
5.  **Create Worker Stubs**: Create new files for the other workers: `/home/ubuntu/mother-code/mother-interface/server/mother/memory_agent.ts` and `/home/ubuntu/mother-code/mother-interface/server/mother/validation_agent.ts`. For now, just create placeholder agents in them using `createAgent` with no tools.
6.  **Integrate Supervisor**: In `supervisor.ts`, import the three worker agents and pass them to the `agents` array in `createSupervisor`.

#### 1.2. Production-Grade Persistence

1.  **Create Custom Checkpointer**: In a new file `/home/ubuntu/mother-code/mother-interface/server/mother/checkpoint.ts`, create a class `MySqlCheckpointer` that extends `BaseCheckpointSaver`. You will need to implement the `get`, `put`, and `list` methods to interact with the existing TiDB/MySQL database. Use the `langgraph-checkpoint-mysql` GitHub repository as a reference for the implementation logic.
2.  **Enable Checkpointing**: In `supervisor.ts`, import your `MySqlCheckpointer` and compile your supervisor graph with it: `const app = workflow.compile({ checkpointer: new MySqlCheckpointer() });`

#### 1.3. Closing the Loop: New API Endpoints

1.  **Deprecate Old Endpoint**: In `/home/ubuntu/mother-code/mother-interface/server/routers/mother.ts`, find the `runCodeAgent` mutation and delete it.
2.  **Implement `evolve` Endpoint**: Create a new tRPC `mutation` called `supervisor.evolve`. It should take a `goal: string` as input. This function will call your compiled supervisor app's `.invoke()` method, passing the goal and a unique `thread_id`.
3.  **Implement `getStatus` Endpoint**: Create a new tRPC `query` called `supervisor.getStatus`. It should take a `thread_id: string` as input and use `app.getStateHistory(config)` to return the current status of the evolution from your `MySqlCheckpointer`.

#### 1.4. Validation

1.  **Compile**: Run `pnpm tsc --noEmit` to ensure your new architecture has no TypeScript errors.
2.  **Deploy**: Use `gcloud builds submit` to deploy the new version to Cloud Run.
3.  **Test**: Use `curl` or a tRPC client to call the new `supervisor.evolve` endpoint with a simple goal like "read the README.md file". Then, call `supervisor.getStatus` with the returned `thread_id` to verify that the state is being persisted correctly in the database.

### DELIVERABLES

1.  A successful Cloud Run deployment of the new v33.0 architecture.
2.  A final report confirming that you have completed all steps and validated the new endpoints.
3.  Commit all your code changes to the local git repository with a clear commit message.

Begin execution.
