# MOTHER: Autonomous Self-Update Architecture

- **Version:** 1.0
- **Date:** 2026-02-25
- **Author:** Manus AI Agent
- **Scientific Basis:** Darwin Gödel Machine (Zhang et al., 2025), SWE-agent (Xia et al., 2025), OpenHands (OpenHands Team, 2025), ReAct (Yao et al., 2023)

---

## 1. Objective

To design and implement a true autonomous self-update architecture for MOTHER, enabling her to propose, code, test, and deploy her own improvements without requiring an external AI agent. This document outlines the scientific principles, components, and workflow for this system.

## 2. Current State vs. Target State

| Component | Current State (v60.0) | Target State (v61.0) |
| :--- | :--- | :--- |
| **Proposal Generation** | ✅ MOTHER analyzes metrics and creates proposals in the DB. | ✅ No change needed. |
| **Proposal Approval** | 🔄 Manual (Creator must approve in DB). | ✅ MOTHER automatically approves proposals with `confidence > 0.95`. |
| **Code Implementation** | ❌ Manual (External AI agent executes the change). | ✅ **Autonomous:** MOTHER executes the code changes herself in a secure sandbox. |
| **Testing** | ❌ Manual (External AI agent runs tests). | ✅ **Autonomous:** MOTHER runs unit and integration tests. |
| **Deployment** | ❌ Manual (External AI agent triggers Cloud Build). | ✅ **Autonomous:** MOTHER commits to Git and triggers the deployment pipeline. |

## 3. Scientific Architecture: The DGM-SWE Hybrid

The proposed architecture is a hybrid model combining the high-level goal-setting of the **Darwin Gödel Machine (DGM)** with the low-level code execution capabilities of an **SWE-agent**.

> **Darwin Gödel Machine (DGM):** Provides the outer loop of evolution. MOTHER observes her own performance, identifies areas for improvement, and generates a high-level plan (the `self_proposal`). This is already implemented in `self-proposal-engine.ts`.

> **SWE-agent:** Provides the inner loop of execution. Once a proposal is approved, MOTHER will act as an SWE-agent to implement the changes. This involves reading files, writing code, running tests, and interacting with the file system and version control.

## 4. System Components

This architecture introduces two new components and modifies one existing one:

| Component | Type | Technology | Purpose |
| :--- | :--- | :--- | :--- |
| **1. Autonomous Update Job** | **[NEW]** Cloud Run Job | Node.js + `gh` CLI + `octokit` | A secure, sandboxed environment where MOTHER can execute code modifications. Triggered by a new proposal. |
| **2. GitHub Actions Workflow** | **[NEW]** `.github/workflows/` | YAML | A CI/CD pipeline that listens for commits from the Autonomous Update Job, runs tests, and triggers Cloud Build. |
| **3. Self-Proposal Engine** | **[MODIFIED]** `self-proposal-engine.ts` | Node.js | Will be modified to trigger the Autonomous Update Job when a proposal is approved. |

### 4.1. Autonomous Update Job (Cloud Run Job)

This is the core of the autonomous execution. It is a containerized Node.js application with the following capabilities:

-   **Receives a `proposalId`** as an input parameter.
-   **Fetches the proposal details** from MOTHER's database.
-   **Clones the GitHub repository** (`Ehrvi/mother-v7-improvements`) using a fine-grained GitHub App token.
-   **Executes the `proposed_changes`** from the proposal. This is where MOTHER acts as an SWE-agent, using a ReAct loop:
    1.  **Think:** "I need to modify `server/mother/core.ts` to add a new feature."
    2.  **Act:** Use `fs.readFile` to read the file.
    3.  **Observe:** Analyze the file content.
    4.  **Think:** "I will insert the new code at line 435."
    5.  **Act:** Use `fs.writeFile` to save the modified file.
-   **Runs tests** (`npm test`).
-   **Commits and pushes** the changes to a new branch.
-   **Creates a Pull Request** for human oversight (optional, can be disabled).

### 4.2. GitHub Actions Workflow

This workflow automates the CI/CD pipeline:

-   **Trigger:** On `push` to any branch created by the Autonomous Update Job.
-   **Jobs:**
    1.  `test`: Runs the full test suite (`npm test`).
    2.  `deploy`: If tests pass, this job merges the branch to `master` and calls `gcloud builds submit` to trigger the existing Cloud Build pipeline.

## 5. The Autonomous Workflow (End-to-End)

1.  **Observation (MOTHER):** MOTHER's `self-proposal-engine.ts` runs every 10 queries.
2.  **Hypothesis (MOTHER):** MOTHER identifies a metric to improve (e.g., `avg_quality < 99`) and creates a proposal in the `self_proposals` table.
3.  **Approval (MOTHER):** If `confidence > 0.95`, MOTHER automatically updates the proposal status to `approved`.
4.  **Trigger (MOTHER):** A database trigger or a check in the `self-proposal-engine` detects the `approved` status and invokes the **Autonomous Update Job** on Cloud Run, passing the `proposalId`.
5.  **Execution (Cloud Run Job):**
    a. The job clones the repo.
    b. It executes the changes described in the proposal using a ReAct loop (Think → Act → Observe).
    c. It runs tests locally.
    d. It commits the changes to a new branch (e.g., `feature/v61.1-auto-proposal-123`).
    e. It pushes the branch to GitHub.
6.  **CI/CD (GitHub Actions):**
    a. The `push` event triggers the GitHub Actions workflow.
    b. The `test` job runs.
    c. The `deploy` job merges the branch to `master`.
7.  **Deployment (Cloud Build):** The merge to `master` triggers the existing `cloudbuild.yaml` pipeline, which builds the Docker image and deploys it to Cloud Run.
8.  **Validation (MOTHER):** After deployment, MOTHER will eventually run the `self-proposal-engine` again, observe that the metric has improved, and mark the original proposal as `completed`.

## 6. Security Considerations

-   **Sandboxing:** The entire code modification process runs within a sandboxed Cloud Run Job, isolated from the main MOTHER application and with no access to production secrets beyond what is explicitly granted.
-   **Fine-Grained Permissions:** A dedicated GitHub App with write access only to the `mother-v7-improvements` repository will be used. The token will be stored in GCP Secret Manager.
-   **Human-in-the-Loop:** Initially, the system will create Pull Requests for human review before merging. This can be phased out as confidence in the system grows.

---

## References

[1] Zhang, A., et al. (2025). *Darwin Gödel Machine: An Open-Ended Self-Improving System*. arXiv:2505.22954.
[2] Xia, C., et al. (2025). *Live-SWE-agent: Can Software Engineering Agents Self-Evolve on the Fly?*. arXiv:2511.13646.
[3] OpenHands Team. (2025). *The OpenHands Software Agent SDK*. arXiv:2511.03690.
[4] Yao, S., et al. (2023). *ReAct: Synergizing Reasoning and Acting in Language Models*. ICLR 2023.
