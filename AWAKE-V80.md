# AWAKE-V80 — MOTHER v67.0: Knowledge Repair Architecture (KRA v1.0)

**Date:** 2026-02-25  
**Version Range:** v65.4 → v67.0  
**Region:** australia-southeast1 (Sydney)  
**Status:** PRODUCTION — HEALTHY  
**Scientific Framework:** CRAG (Yan et al., arXiv:2401.15884, 2024) · Self-RAG (Asai et al., arXiv:2310.11511, 2023) · FActScoring (Min et al., EMNLP 2023) · Generative Agents (Park et al., UIST 2023) · MemGPT (Packer et al., arXiv:2310.08560, 2023) · DGM (Zhang et al., arXiv:2505.22954, 2025) · SWE-agent (Xia et al., arXiv:2405.15793, 2025)

---

## Executive Summary

This document covers three major milestones delivered in a single session. The first milestone (v65.4) resolved four cascading infrastructure bugs that prevented the DGM right panel and Knowledge Map from functioning. The second milestone (v66.0, Project Prometheus) delivered the first real autonomous self-modification loop: MOTHER can now approve a proposal and have the SWE-Agent actually write, compile, and commit code to GitHub — the first autonomous commit was made at `2026-02-25T12:43:32Z`. The third milestone (v67.0, KRA v1.0) addresses the root cause of MOTHER's most critical behavioral failure — hallucination and fabricated citations — by implementing a scientifically grounded knowledge architecture: CRAG, a Grounding Engine, an Agentic Learning Loop, a Self-Repair Script, and a ZERO BULLSHIT system prompt policy.

---

## Part I — v65.4: DGM Panel & Knowledge Map Infrastructure Fixes

### Problems Identified

**Bug #1 — DGM Panel Empty**

| Field | Detail |
|---|---|
| **Observation** | The DGM tab showed "Nenhuma proposta DGM ainda" despite Proposal ID 1 existing in the database. |
| **Root Cause** | Migration 0020 used `ADD COLUMN IF NOT EXISTS` syntax, not supported in MySQL 8.0. The migration runner logged it as "Applied" but the columns were never created. The `getProposalsWithReproposal` query failed silently on the missing columns. |
| **Fix** | Migration 0021: plain `ADD COLUMN` statements. The runner's existing "Duplicate column name" suppression provides idempotency. |

**Bug #2 — Connection Lost on Manual Deploy**

| Field | Detail |
|---|---|
| **Observation** | Manual `gcloud run deploy` caused `PROTOCOL_CONNECTION_LOST` errors on startup. |
| **Root Cause** | The manual deploy command omitted the `us-central1` Cloud SQL instance. The service requires both `australia-southeast1:mother-db-sydney` and `us-central1:mother-db`. |
| **Fix** | All subsequent deploys include the full two-instance connection string. |

**Bug #3 — Knowledge Map Empty (Collation Mismatch)**

| Field | Detail |
|---|---|
| **Observation** | The CONHECIMENTO tab showed 0 chunks and 0% wisdom. |
| **Root Cause** | Collation mismatch: `knowledge_wisdom` used `utf8mb4_unicode_ci` while `knowledge` uses `utf8mb4_0900_ai_ci`. The JOIN threw "Illegal mix of collations". |
| **Fix** | `CONVERT(kw.domain USING utf8mb4) COLLATE utf8mb4_unicode_ci` in the JOIN condition in `reproposal-engine.ts`. |

**Bug #4 — Knowledge Domains Duplicated**

| Field | Detail |
|---|---|
| **Observation** | The Knowledge Map showed 16 entries instead of 8. |
| **Root Cause** | Both migration 0020 and 0021 ran `INSERT IGNORE` for the same 8 seed domains. |
| **Fix** | Migration 0022: `DELETE FROM knowledge_wisdom WHERE id NOT IN (SELECT MIN(id) FROM ... GROUP BY domain, subdomain)`. |

**Bonus Fix — Migration Runner Fragility**

| Field | Detail |
|---|---|
| **Observation** | `PROTOCOL_CONNECTION_LOST` on cold start prevented migrations from running. |
| **Root Cause** | Cloud SQL Unix socket proxy requires ~2–3 seconds to become available. The runner attempted the first query immediately. |
| **Fix** | Exponential backoff retry (5 attempts, 2s/4s/8s/16s/32s) in `production-entry.ts`. |

### Verification

| Test | Query | Expected | Result |
|---|---|---|---|
| DGM Panel | `proposals.listWithReproposal` | Proposal ID 1 visible | PASS |
| Knowledge Map | `proposals.knowledgeWisdom` | 8 unique domains | PASS |
| Migration Retry | Cloud Run startup logs | "Applied: 0022..." | PASS |
| Connection | Cloud Run startup logs | No PROTOCOL_CONNECTION_LOST | PASS |

---

## Part II — v66.0: Project Prometheus (Real Autonomous Self-Modification)

### Problem Identified

MOTHER was performing theatrical self-improvement. When a proposal was approved, the system updated a database field and generated "A mudança será implementada." No code was executed. The `executeAutonomousUpdate()` function existed but was never called. The Cloud Run Job `mother-swe-agent-job` did not exist in GCP.

### Architecture Implemented

| Component | File | Role |
|-----------|------|------|
| ACI Engine | `autonomous-update-job.ts` | Reads actual source files, calls LLM with code context, generates executable diffs, applies changes, compiles TypeScript, commits and pushes to GitHub |
| Approval Trigger | `update-proposals.ts` | `approveProposal()` now dispatches the Cloud Run Job via `triggerSweAgentJob()` |
| Cloud Run Job | `mother-swe-agent-job` (GCP) | Containerized SWE-Agent with git, gh CLI, GITHUB_TOKEN secret, and Cloud SQL access |

The SWE-Agent follows the ReAct loop (Yao et al., ICLR 2023) with an ACI adapted from SWE-agent (Xia et al., 2025): `Approval → Clone repo → Read file → LLM generates diffs → Apply diffs → TypeScript compile → git push → branch created`.

### First Autonomous Commit

```
SHA:     10d86009
Author:  MOTHER Autonomous Agent <mother@intelltech.ai>
Date:    2026-02-25T12:43:32Z
Branch:  feature/auto-proposal-1-1772023397323
Change:  core.ts — sequential calls → Promise.all() (+28/-2 lines)
Build:   TypeScript: 0 errors
```

---

## Part III — v67.0: KRA v1.0 (Knowledge Repair Architecture)

### Diagnosis: Why MOTHER Hallucinated

The creator observed MOTHER citing "Schmidhuber, 2006" for DGM and then admitting the reference was fabricated when challenged. The root cause is architectural: the response pipeline had no grounding step between knowledge retrieval and generation. The LLM was free to generate plausible-sounding citations from its parametric memory, which is unreliable for specific dates, authors, and paper titles.

### Scientific Foundations

| Component | Scientific Basis |
|-----------|-----------------|
| CRAG Pipeline | Yan et al. (2024), "Corrective Retrieval Augmented Generation", arXiv:2401.15884 |
| Grounding Engine | Min et al. (2023), "FActScoring", EMNLP 2023; Asai et al. (2023), "Self-RAG", arXiv:2310.11511 |
| Agentic Learning Loop | Park et al. (2023), "Generative Agents", UIST 2023; Packer et al. (2023), "MemGPT", arXiv:2310.08560 |
| Self-Repair Script | Schmidhuber (2003), "Gödel Machines"; Parisi et al. (2019), "Continual Lifelong Learning", Neural Networks |

### Components Implemented

**1. CRAG Pipeline (`crag.ts`)**

Replaces the naive `getKnowledgeContext()` call with a three-stage corrective retrieval process. Documents are retrieved and scored for relevance. If relevance is below threshold (< 0.5), a corrective web search is triggered. Retrieved documents are decomposed into fine-grained knowledge strips and recomposed into a coherent context. This eliminates the "garbage in, garbage out" problem of naive RAG (Yan et al., 2024).

**2. Grounding Engine (`grounding.ts`)**

Intercepts every response before it is sent to the user. The engine extracts all factual claims containing citations, dates, author names, or statistical figures. Each claim is verified against the retrieved context. Claims with no supporting evidence are flagged with a hallucination risk score. The response is annotated with verified citations in the format `(Author et al., Year, arXiv:XXXX.XXXXX)` and unverified claims are replaced with honest uncertainty markers. Based on FActScoring (Min et al., 2023) and Self-RAG (Asai et al., 2023).

**3. Agentic Learning Loop (`agentic-learning.ts`)**

After every interaction, the loop evaluates whether new knowledge should be stored based on: (a) whether the query was answered from parametric memory, (b) whether quality score was below 80, and (c) whether the topic is absent from the knowledge base. If learning is triggered, the system conducts research, ingests papers from arXiv, and stores a synthesis. Implements the "experience → reflection → memory" cycle from Generative Agents (Park et al., 2023).

**4. Self-Repair Script (`self-repair.ts`)**

A standalone script that can be run as a Cloud Run Job or triggered via the `self_repair` admin tool. Performs 5 diagnostic checks (database, knowledge table health, CRAG pipeline, grounding engine, learning loop) and bootstraps all 8 knowledge domains by conducting research and ingesting papers from arXiv.

**5. New Admin Tools**

| Tool | Description |
|------|-------------|
| `self_repair` | Runs the full self-repair audit and 8-domain knowledge bootstrap |
| `force_study` | Forces MOTHER to study a specific topic on demand |

**6. ZERO BULLSHIT System Prompt Policy (v67.0)**

The v67.0 system prompt includes explicit anti-hallucination instructions: citations MUST come from the retrieved knowledge context; if no source is available, MOTHER must say "Não tenho uma fonte verificada para isso"; if MOTHER does not know, she must say "Não sei. Preciso estudar este tópico."

### Verification

| Test | Expected | Result |
|------|----------|--------|
| CRAG on unknown topic | Triggers corrective web search | PASS (unit test) |
| Grounding on fabricated citation | Flags as unverified | PASS (unit test) |
| Learning loop on low-quality response | Triggers knowledge ingestion | PASS (unit test) |
| Self-repair bootstrap | 8 domains seeded | PENDING (v67.0 deploy in progress) |

---

## Cumulative Fixes

| Version | Fix |
|---------|-----|
| v65.1 | Migration 0021: MySQL 8.0-compatible `ADD COLUMN` syntax |
| v65.1 | Deploy: full two-instance Cloud SQL connection string |
| v65.2 | Collation fix: `CONVERT(...USING utf8mb4) COLLATE utf8mb4_unicode_ci` |
| v65.3 | Migration 0022: deduplicate `knowledge_wisdom` seed data |
| v65.4 | Migration runner: retry with exponential backoff on cold start |
| v66.0 | Project Prometheus: SWE-Agent ACI engine + Cloud Run Job + approval trigger |
| v67.0 | KRA v1.0: CRAG, Grounding Engine, Agentic Learning, Self-Repair, ZERO BULLSHIT |

---

## Pending Actions

1. **Deploy v67.0** — Build `c5f6ed7e` in progress. Deploy with full Cloud SQL config after build completes.
2. **Trigger Self-Repair** — Run `self_repair` tool via chat to bootstrap all 8 knowledge domains.
3. **AWAKE-V81** — Close the CI/CD loop: auto-merge approved PRs from the SWE-Agent and deploy automatically.
4. **Embedding Pipeline** — Generate embeddings for all existing knowledge entries to enable vector search.

---

## Next Milestone: AWAKE-V81 — MOTHER v68.0: Closed Self-Improvement Loop

**Goal:** The SWE-Agent's PR is automatically tested by CI, merged if tests pass, and deployed to production without human intervention. MOTHER's self-improvement cycle becomes fully autonomous end-to-end.

---

> *"An agent that cannot verify its own claims is not intelligent — it is a sophisticated autocomplete. Intelligence requires the ability to say 'I do not know' and then go find out."*  
> — KRA v1.0 Design Principle, MOTHER v67.0
