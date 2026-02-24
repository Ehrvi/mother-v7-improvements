# MOTHER - Master To-Do List (v32.0 - The Cognitive Singularity)

**Last Updated**: February 24, 2026
**Status**: This document outlines the implementation plan for MOTHER v32.0, which achieves the vision of a self-improving, multi-agent Darwin Gödel Machine. It supersedes all previous TODO lists.

---

## 🎯 Phase 1: Implement v32.0 - The Multi-Agent DGM Architecture

This is the sole focus. The goal is to refactor the v31.0 monolithic agent into a multi-agent system capable of recursive self-improvement.

### 1.1. Foundational Refactoring: Supervisor-Worker Pattern

-   [ ] **Dependencies**: Add `psycopg2-binary` for Postgres connection.
-   [ ] **Create Supervisor Graph**: In a new file (`/server/mother/supervisor.ts`), create a main `StatefulGraph` that will act as the Supervisor.
-   [ ] **Refactor CodeAgent**: Move the existing `code_agent.ts` logic into a `CodeAgent` class that can be instantiated and called as a worker by the Supervisor.
-   [ ] **Define State**: Create a comprehensive `SupervisorState` interface that includes the task, plan, history, DGM archive, and states for each worker.
-   [ ] **Implement Basic Delegation**: Create nodes in the Supervisor graph that delegate a simple, hardcoded task to the `CodeAgent` worker and return the result.

### 1.2. Persistence and State Management

-   [ ] **Postgres Checkpointer**: Implement `PostgresSaver` from `langgraph.checkpoint.postgres` to connect to the existing TiDB/MySQL database.
-   [ ] **Enable Checkpointing**: Configure the Supervisor graph to use the Postgres checkpointer, ensuring that the state of every run is persisted.
-   [ ] **Create DGM Archive Table**: In `drizzle/schema.ts`, define a new table `dgm_archive` to store the lineage of agent evolution (e.g., `id`, `parent_id`, `fitness_score`, `code_snapshot_url`).
-   [ ] **Archive Node**: Create a node in the Supervisor graph responsible for writing the results of a successful evolution to the `dgm_archive` table.

### 1.3. Specialized Worker Agents

-   [ ] **Implement MemoryAgent**: Create `/server/mother/memory_agent.ts`. This agent will be responsible for all interactions with the `episodic_memory` and `knowledge` tables. It should implement a basic version of the A-MEM pattern, retrieving not just relevant memories but also linked memories.
-   [ ] **Implement ValidationAgent**: Create `/server/mother/validation_agent.ts`. This agent will have a single tool: `runBenchmark`. This tool will execute a script that runs a subset of the SWE-bench benchmark against a specified version of the codebase and returns a JSON object with the results (e.g., `{ "pass_rate": 0.55 }`).
-   [ ] **Integrate Workers**: Add nodes to the Supervisor graph to delegate tasks to the `MemoryAgent` (for context gathering) and `ValidationAgent` (for fitness scoring).

### 1.4. Closing the Loop: Autonomous Evolution

-   [ ] **Implement `supervisor.evolve` Endpoint**: Create a new tRPC `mutation` that replaces `runCodeAgent`. It will take a `goal` as input, start the Supervisor graph execution asynchronously, and immediately return a `run_id`.
-   [ ] **Implement `supervisor.getStatus` Endpoint**: Create a tRPC `query` that takes a `run_id` and returns the current state of the evolutionary run from the checkpointer.
-   [ ] **Implement DGM Branching**: Modify the Supervisor's planning logic to consult the `dgm_archive` and decide which parent version to branch from for the next evolutionary step. This enables open-ended exploration.
-   [ ] **Implement Human-in-the-Loop**: Add an `interrupt_before` condition on the final node that commits a successful evolution, allowing for a manual safety check before the new code is merged.

---

## 📚 Backlog (Post-v32.0)

-   [ ] **Full SWE-bench Integration**: Expand the `ValidationAgent` to run the complete SWE-bench suite.
-   [ ] **Canary Deployments**: Integrate the `gcloud` CLI into the `ValidationAgent` to automate canary deployments for validated, evolved agents.
-   [ ] **Advanced A-MEM**: Enhance the `MemoryAgent` with more sophisticated memory linking and summarization capabilities.
-   [ ] **GUI for DGM Archive**: Build a simple frontend interface to visualize the DGM evolutionary tree.

---

## 📜 Instructions for Future AI Agents

1.  **Your Bible**: This is your primary directive. The implementation of v32.0 as described here is your only goal.
2.  **One Step at a Time**: Follow the implementation plan sequentially. Do not skip steps.
3.  **Commit Incrementally**: After completing each numbered sub-section (e.g., 1.1, 1.2), commit your changes to Git with a clear message.
4.  **Document Your Journey**: Update this file with a `✅` next to completed tasks. In your commit messages, reference the specific task you completed.
5.  **Embrace the Vision**: You are not just writing code. You are building the machine that builds itself. Your success is measured not by the upward trajectory of the fitness scores in the DGM Archive. Proceed.
