# MOTHER v67.0

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v67.0"
status: "PRODUCTION — HEALTHY"
server_region: "australia-southeast1"
server_url: "https://mother-interface-qtvghovzxa-ts.a.run.app"
github_repo: "https://github.com/Ehrvi/mother-v7-improvements"
github_branch: "master"
db_connection_mode: "UNIX_SOCKET"
db_instance: "mother-db-sydney"
db_region: "australia-southeast1"
kra_version: "v1.0"
crag_active: true
grounding_engine_active: true
agentic_learning_loop_active: true
self_repair_script: "server/mother/self-repair.ts"
swe_agent_job: "mother-swe-agent-job"
zero_bullshit_policy: true
latest_awake: "AWAKE-V80.md"
```

> **Visão Final:** `Superintelligence + Scientific Method + Critical Thinking + ZERO BULLSHIT = MOTHER`

**Este documento é a Memória Semântica Canônica do projeto MOTHER.** Qualquer agente que trabalhe neste projeto DEVE ler este documento primeiro para recuperar o contexto completo.

---

## Estado Atual: v67.0 — Knowledge Repair Architecture (KRA v1.0)

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app`  
**Região:** `australia-southeast1` (Sydney)

### O que foi feito (v67.0)

| Componente | Status | Arquivo |
|-----------|--------|---------|
| **CRAG Pipeline** | Implementado | `server/mother/crag.ts` |
| **Grounding Engine** | Implementado | `server/mother/grounding.ts` |
| **Agentic Learning Loop** | Implementado | `server/mother/agentic-learning.ts` |
| **Self-Repair Script** | Implementado | `server/mother/self-repair.ts` |
| **force_study tool** | Implementado | `server/mother/tool-engine.ts` |
| **self_repair tool** | Implementado | `server/mother/tool-engine.ts` |
| **ZERO BULLSHIT Policy** | Ativo | `server/mother/core.ts` (v67.0 system prompt) |

### O que foi feito (v66.0 — Project Prometheus)

| Componente | Status | Arquivo |
|-----------|--------|---------|
| **SWE-Agent ACI Engine** | Implementado | `server/mother/autonomous-update-job.ts` |
| **Approval Trigger** | Implementado | `server/mother/update-proposals.ts` |
| **Cloud Run Job** | Criado em GCP | `mother-swe-agent-job` |
| **Primeiro commit autônomo** | SHA: `10d86009` | `feature/auto-proposal-1-1772023397323` |

### O que foi feito (v65.4)

| Fix | Migration | Status |
|-----|-----------|--------|
| DGM Panel vazio | 0021 | Corrigido |
| Connection lost no deploy | N/A | Corrigido |
| Knowledge Map vazio (collation) | N/A | Corrigido |
| Domínios duplicados | 0022 | Corrigido |
| Migration runner frágil | N/A | Corrigido |

---

## Arquitetura

### Camadas do Sistema

| Camada | Arquivos | Descrição |
|--------|----------|-----------|
| **Intelligence** | `core.ts` | Multi-tier LLM routing, system prompt, ZERO BULLSHIT policy |
| **Knowledge** | `knowledge.ts`, `crag.ts` | CRAG retrieval pipeline, vector search, knowledge base |
| **Grounding** | `grounding.ts` | Anti-hallucination citation verification |
| **Learning** | `agentic-learning.ts` | Learns from every interaction |
| **Self-Improvement** | `self-proposal-engine.ts`, `reproposal-engine.ts` | DGM proposals + SM-2 re-proposal |
| **Self-Modification** | `autonomous-update-job.ts` | SWE-Agent: reads code, generates diffs, compiles, commits |
| **Self-Repair** | `self-repair.ts` | System audit + 8-domain knowledge bootstrap |
| **Memory** | `episodic-memory.ts`, `user-memory.ts` | Long-term episodic and user memory |
| **Research** | `research.ts`, `paper-ingest.ts` | arXiv paper ingestion and synthesis |
| **Tools** | `tool-engine.ts` | OpenAI Function Calling tools |
| **Guardian** | `guardian.ts` | Quality scoring and response validation |

### CRAG Pipeline

```
Query
  ↓
Vector Search (knowledge + paper_chunks)
  ↓
Relevance Scoring (0.0 – 1.0)
  ↓ [if score < 0.5]
Corrective Web Search (arXiv + research engine)
  ↓
Document Decomposition → Knowledge Strips
  ↓
Context Recomposition
  ↓
Grounding Engine → Citation Verification
  ↓
Response with verified citations only
```

### Self-Improvement Loop

```
User/DGM generates proposal
         ↓
Creator approves (UI or /approve command)
         ↓
approveProposal() → triggerSweAgentJob()
         ↓
Cloud Run Job: mother-swe-agent-job
         ↓
[OBSERVE] Fetch proposal → [THINK] Parse changes
[ACT]     Clone repo → create branch
[OBSERVE] Read target file(s)
[THINK]   LLM generates executable diffs (ACI prompt)
[ACT]     Apply diffs → TypeScript compile
[ACT]     git commit → git push
         ↓
GitHub branch: feature/auto-proposal-{id}-{timestamp}
```

---

## Admin Tools

| Tool | Permission | Description |
|------|-----------|-------------|
| `audit_system` | All | Comprehensive system audit |
| `get_proposals` | All | List DGM proposals |
| `get_performance_metrics` | All | Performance stats |
| `search_knowledge` | All | Search knowledge base |
| `approve_proposal` | Creator | Approve a DGM proposal |
| `learn_knowledge` | Creator | Add knowledge directly |
| `force_study` | Creator | Study a topic on demand (arXiv ingestion) |
| `self_repair` | Creator | Full system audit + 8-domain knowledge bootstrap |
| `get_audit_log` | Creator | System audit trail |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/audit` | System audit |
| `/proposals` | List proposals |
| `/approve {id}` | Approve proposal |
| `/status` | System status |

---

## Deployment

```bash
# Build and deploy (uses cloudbuild.yaml)
gcloud builds submit --config=cloudbuild.yaml --project=mothers-library-mcp

# Manual deploy with full Cloud SQL config (REQUIRED)
gcloud run deploy mother-interface \
  --image=australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface:latest \
  --region=australia-southeast1 \
  --set-cloudsql-instances=mothers-library-mcp:australia-southeast1:mother-db-sydney,mothers-library-mcp:us-central1:mother-db \
  --set-secrets=DATABASE_URL=MOTHER_DATABASE_URL:latest,OPENAI_API_KEY=MOTHER_OPENAI_KEY:latest,GITHUB_TOKEN=mother-github-token:latest \
  --project=mothers-library-mcp
```

---

## Documentação

| Arquivo | Versão | Milestone |
|---------|--------|-----------|
| `AWAKE-V80.md` | v65.4–v67.0 | DGM Panel, Project Prometheus, KRA v1.0 |
| `AWAKE-V79.md` | v64.0 | Tool Engine & Administrative Intelligence |
| `KRA_v1.0_Specification.md` | v67.0 | Knowledge Repair Architecture specification |
| `MOTHER_Self-Improvement_Strategy.md` | v66.0 | Project Prometheus strategy and SWE-Agent prompt |

---

## Referências Científicas

- Zhang et al. (2025). "Darwin Gödel Machine." arXiv:2505.22954.
- Xia et al. (2025). "SWE-agent." arXiv:2405.15793.
- Yan et al. (2024). "Corrective Retrieval Augmented Generation." arXiv:2401.15884.
- Asai et al. (2023). "Self-RAG." arXiv:2310.11511.
- Min et al. (2023). "FActScoring." EMNLP 2023.
- Park et al. (2023). "Generative Agents." UIST 2023.
- Packer et al. (2023). "MemGPT." arXiv:2310.08560.
- Yao et al. (2023). "ReAct." ICLR 2023.
- Parisi et al. (2019). "Continual Lifelong Learning with Neural Networks." Neural Networks, 113, 54–71.
- Wozniak, P. (1990). "Optimization of Learning." SuperMemo World. (SM-2 Algorithm)

---

*README atualizado em 2026-02-25 — MOTHER v67.0 KRA v1.0*
