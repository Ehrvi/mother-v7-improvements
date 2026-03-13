# MOTHER Knowledge Repair Architecture (KRA) v1.0

**Date:** 2026-02-25  
**Author:** Manus AI (for MOTHER)  
**Status:** PROPOSED  
**Scientific Framework:** CRAG (Yan et al., 2024), Self-RAG (Asai et al., 2023), Knowledge Graphs (Pan et al., 2024), Agentic RAG (Mialon et al., 2023)

---

## 1. Executive Summary

This document specifies the **Knowledge Repair Architecture (KRA) v1.0**, a comprehensive overhaul of MOTHER's knowledge systems. The audit of the current architecture (v66.0) revealed critical flaws: (1) **No Grounding Mechanism:** MOTHER hallucinates facts and citations because her responses are not grounded in retrieved knowledge. The system prompt instructs her to be scientific, but the `core.ts` response generation does not enforce it. (2) **Passive Knowledge Acquisition:** Knowledge is only acquired when a user explicitly calls `learn_knowledge` or when the `research` tool finds an arXiv paper. There is no proactive learning from interactions. (3) **Naive RAG:** The current RAG pipeline in `knowledge.ts` is a simple `Promise.all()` over four sources with basic term-overlap relevance. It lacks modern RAG features like self-correction, query rewriting, or dynamic source selection. (4) **No Long-Term Memory Consolidation:** Episodic memory (`db-episodic-memory.ts`) and user memory (`user-memory.ts`) are retrieved but never consolidated into the core knowledge base.

KRA v1.0 addresses these flaws by implementing a state-of-the-art, agentic, and self-correcting knowledge pipeline. It introduces a **Grounding Engine** to eliminate hallucinations, an **Agentic Learning Loop** for proactive knowledge acquisition, and a **CRAG/Self-RAG pipeline** for robust retrieval.

---

## 2. KRA v1.0 Architecture

The new architecture is composed of three main components:

| Component | Description | Files to Modify |
|---|---|---|
| **1. Grounding Engine** | A new module that sits between the LLM response and the user. It verifies every factual claim in the response against the retrieved knowledge context. If a claim is ungrounded, it is either rewritten or flagged with a "[Citation Needed]" warning. | `core.ts`, `grounding.ts` (new) |
| **2. Agentic Learning Loop** | An agent that runs after every user interaction. It analyzes the conversation, identifies knowledge gaps or learning opportunities, and automatically calls the `learn_knowledge` tool to update the knowledge base. | `learning.ts`, `tool-engine.ts` |
| **3. CRAG/Self-RAG Pipeline** | Replaces the existing `queryKnowledge` function with a multi-step, self-correcting retrieval pipeline based on Corrective-RAG and Self-RAG principles. | `knowledge.ts`, `research.ts` |

### 2.1. Grounding Engine

**Workflow:**
1.  **Claim Extraction:** After the LLM generates a response in `core.ts`, the Grounding Engine will parse the response and extract all factual claims (e.g., "Schmidhuber proposed DGM in 2006").
2.  **Source Verification:** For each claim, it will search the `knowledgeContext` (the data retrieved by RAG) for supporting evidence.
3.  **Citation Injection:** If evidence is found, the engine will append a citation marker (e.g., `[1]`) to the claim and store the source URL.
4.  **Hallucination Flagging:** If no evidence is found, the claim is flagged. The engine will then choose one of two actions:
    *   **Rewrite:** Call the LLM again with a prompt to rewrite the sentence to be more general or to explicitly state the uncertainty.
    *   **Flag:** Append a `[Citation Needed]` or `[Unverified Claim]` warning to the sentence.
5.  **Final Response:** The final, grounded response with citations is returned to the user.

### 2.2. Agentic Learning Loop

**Workflow:**
1.  **Trigger:** After a response is sent to the user, the `learnFromResponse` function in `learning.ts` will be expanded into a full agentic loop.
2.  **Analysis:** The agent will receive the full conversation history and the final response.
3.  **Learning Decision:** It will call an LLM with a specific prompt to decide if there is a learning opportunity. The prompt will ask:
    *   "Did the user provide new, verifiable information?"
    *   "Did MOTHER express uncertainty about a topic that she should know?"
    *   "Is there a core concept in this conversation that should be added to the knowledge base for future reference?"
4.  **Tool Call:** If the LLM returns `true`, the agent will formulate a call to the `learn_knowledge` tool, generating a title and content for the new knowledge entry.
5.  **Knowledge Ingestion:** The `learn_knowledge` tool will be executed, adding the new information to the database with embeddings.

### 2.3. CRAG/Self-RAG Pipeline

This replaces the current `queryKnowledge` function with a more robust, multi-step process:

**Workflow:**
1.  **Query Analysis & Rewriting:** The initial user query is analyzed. If it is ambiguous or too broad, an LLM is used to rewrite it into a more precise search query.
2.  **Retrieval & Grading (Self-Correction):**
    *   Retrieve documents from all sources (`knowledge` DB, `paper_chunks` vector search, etc.).
    *   For each retrieved document, a lightweight LLM call (a "retrieval grader") assesses its relevance to the rewritten query.
    *   If relevance is low, the document is discarded. If relevance is high, it is kept.
    *   If no documents are deemed relevant, the system performs **web search** (`research.ts`) to find new information.
3.  **Knowledge Graph Augmentation:**
    *   The retrieved documents are passed to an LLM to extract key entities and relationships, forming a mini Knowledge Graph.
    *   This graph is used to enrich the context, providing structured information that is less prone to misinterpretation.
4.  **Final Context Generation:** The graded, relevant documents and the knowledge graph are combined into the final `knowledgeContext` string to be passed to the main response-generation LLM.

---

## 3. Implementation Plan

This will be implemented via a **Self-Repair Script** executed by the SWE-Agent.

**Script Name:** `KRA_v1.0_self_repair.json`

**High-Level Steps:**
1.  **Create `grounding.ts`:** Implement the `GroundingEngine` class with `extractClaims`, `verifyClaims`, and `injectCitations` methods.
2.  **Modify `core.ts`:**
    *   Integrate the `GroundingEngine` after the main LLM call.
    *   Modify the system prompt to instruct the LLM to generate claims that can be verified by the provided context.
3.  **Modify `learning.ts`:**
    *   Expand `learnFromResponse` into the full `AgenticLearningLoop`.
    *   Create the new LLM prompt for the learning decision.
4.  **Modify `knowledge.ts`:**
    *   Replace the existing `queryKnowledge` function with the new CRAG/Self-RAG pipeline.
    *   Implement the retrieval grader and query rewriter functions.
5.  **Modify `tool-engine.ts`:**
    *   Add a new tool: `force_study(topic: string)`, which allows an admin to trigger the research and learning pipeline for a specific topic.
6.  **Database Migrations:**
    *   Add a `citations` table to store citation data (claim, source_url, paper_id, etc.).
    *   Add a `knowledge_graph_cache` table to store temporary knowledge graphs for recent queries.

---

## 4. Validation and Testing

1.  **Unit Tests:** Each new function (`GroundingEngine`, `AgenticLearningLoop`, CRAG components) will have dedicated unit tests.
2.  **Integration Test:** A full integration test will be created to simulate a user query that triggers all new components.
3.  **Hallucination Benchmark:** A set of 20 questions known to cause hallucinations in the current model will be run against the new system. The goal is a >95% reduction in ungrounded claims.
4.  **Scientific Citation Test:** A set of 10 queries requiring scientific knowledge will be run. The goal is for >80% of factual claims to be correctly cited with a valid arXiv or database source.

---

## 5. Next Steps

1.  Create the `KRA_v1.0_self_repair.json` script.
2.  Create a new DGM proposal to execute this script.
3.  Approve the proposal and trigger the SWE-Agent.
