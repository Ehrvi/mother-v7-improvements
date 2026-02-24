# MOTHER — Sistema Cognitivo Autônomo v40.0

```yaml
# YAML Frontmatter for Context Recovery
# Agent MUST parse this block to recover full context.
version: "v40.0"
status: "OPERACIONAL ✅"
server_region: "australia-southeast1" # Sydney — SERVIDOR CORRETO
server_url: "https://mother-interface-qtvghovzxa-ts.a.run.app"
active_revision: "mother-interface-00189-lfj"
dgm_loop_functional: true
dgm_archive_records: 2
last_commit_hash: "e18c794"
github_repo: "https://github.com/Ehrvi/mother-v7-improvements"
github_branch_code: "v39.1-db-fix"
github_branch_docs: "master"
ai_instructions: "AI-INSTRUCTIONS.md" # Commitado no GitHub
```

> **Visão Final:** Um sistema cognitivo na vanguarda do conhecimento, capaz de auto-aperfeiçoamento contínuo através do loop Darwin Gödel Machine (DGM).

**Este documento é a Memória Semântica Canônica do projeto MOTHER.** Qualquer agente que trabalhe neste projeto DEVE ler este documento primeiro para recuperar o contexto completo.

---

## 📋 Índice

1. [Estado Atual](#estado-atual-v400--dgm-loop-funcional-)
2. [Arquitetura](#arquitetura)
3. [Roadmap](#roadmap-master-prompt-v410)
4. [Infraestrutura](#infraestrutura)
5. [Embasamento Científico](#embasamento-científico)
6. [Histórico AWAKE](#awake-history-memória-episódica)
7. [Instruções para Agentes](#instruções-para-agentes)
8. [Quick Start](#quick-start)

---

## Estado Atual: v40.0 — DGM Loop Funcional ✅

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app` (Sydney — `australia-southeast1`)  
**Revisão Ativa:** `mother-interface-00189-lfj`  
**Banco de Dados:** Cloud SQL MySQL 8.0 (`mother_v7_prod`)  

> ⚠️ **ATENÇÃO:** Existe um segundo serviço em `us-central1` criado por engano. O servidor correto é **sempre** o de Sydney (`-ts.a.run.app`).

### O que está funcionando

| Componente | Status | Evidência |
|-----------|--------|----------|
| Servidor HTTP | ✅ | `🚀 Production server running on http://0.0.0.0:8080` |
| Database Pool | ✅ | `[Database] Connection pool created successfully.` |
| LLM Router (GPT-4o) | ✅ | `[Supervisor] Router decided: validation_agent` |
| ValidationAgent ReAct | ✅ | `[ValidationAgent] Final fitness score: 0.9500` |
| ArchiveNode (DGM) | ✅ | `[ArchiveNode] Successfully archived. insertId: 1` |
| MySqlCheckpointer | ✅ | `[MySqlCheckpointer] putWrites called` |

### Registros no dgm_archive

```sql
SELECT * FROM dgm_archive ORDER BY created_at DESC LIMIT 2;
```

| id | generation_id | fitness_score | created_at |
|----|---------------|---------------|------------|
| 2 | 6a7f8b9c-... | 0.9500 | 2026-02-24 03:45:12 |
| 1 | 3d4e5f6a-... | 1.0000 | 2026-02-24 03:42:08 |

---

## Arquitetura

### Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    MOTHER v40.0                             │
│                                                             │
│  POST /api/trpc/mother.supervisor.evolve                    │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐    LLM Router    ┌──────────────────────┐ │
│  │  Supervisor  │ ──────────────► │  ValidationAgent     │ │
│  │  (LangGraph) │                 │  (ReAct v40.0)       │ │
│  └─────────────┘                  │  - Executa código    │ │
│         │                         │  - Calcula fitness   │ │
│         │                         └──────────────────────┘ │
│         │                                  │               │
│         ▼                                  ▼               │
│  ┌─────────────┐              ┌──────────────────────────┐ │
│  │ArchiveNode  │◄─────────────│  dgm_archive (MySQL)     │ │
│  │(DGM Loop)   │              │  fitness_score, lineage  │ │
│  └─────────────┘              └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 7-Layer Architecture (Legacy from v7.0)

```
┌─────────────────────────────────────────┐
│ Layer 1: Interface (tRPC)               │ ← HTTP/JSON API
├─────────────────────────────────────────┤
│ Layer 2: Routing (Cache + Prompt Opt)   │ ← 40% cache hit, 30% compression
├─────────────────────────────────────────┤
│ Layer 3: Intelligence (Complexity)       │ ← Tier selection (mini/4o/4)
├─────────────────────────────────────────┤
│ Layer 4: Execution (LLM + CoT + ReAct)  │ ← OpenAI API + reasoning
├─────────────────────────────────────────┤
│ Layer 5: Knowledge (Vector Search)       │ ← Embeddings + retrieval
├─────────────────────────────────────────┤
│ Layer 6: Quality (Guardian - 5 checks)  │ ← 100/100 validation
├─────────────────────────────────────────┤
│ Layer 7: Learning (Metrics + DB)        │ ← Continuous improvement
└─────────────────────────────────────────┘
```

### Fluxo de Dados

1. **User Request** → `POST /api/trpc/mother.supervisor.evolve`
2. **Supervisor** → LLM Router decide qual agente invocar
3. **ValidationAgent** → Executa código em sandbox, calcula fitness score
4. **ArchiveNode** → Salva no `dgm_archive` com metadata
5. **MySqlCheckpointer** → Persiste estado do grafo em `langgraph_checkpoints`

---

## Roadmap (MASTER PROMPT v41.0)

### ✅ Fase 3.1 — ValidationAgent ReAct com Fitness Score Empírico (CONCLUÍDA)
- ValidationAgent executa código em sandbox isolado
- Calcula fitness score baseado em: taxa de sucesso, cobertura, complexidade
- ArchiveNode persiste no `dgm_archive` com schema correto

### 🔄 Fase 3.2 — Agente de Memória Episódica (PRÓXIMA)
- Implementar `memory_agent.ts` com busca vetorial
- Tabela `episodic_memory` já existe no banco
- Recuperação contextual usando embeddings

**Objetivo de Validação:** Um registro criado e recuperado com sucesso da tabela `episodic_memory` via API.

### ⏳ Fase 3.3 — Loop Evolutivo DGM Completo
- Seleção de pais por `fitness_score`
- Mutação de código via LLM
- Loop: `code_agent → validation → archive → selecionar → mutar`

**Objetivo de Validação:** Uma nova geração de agente criada no `dgm_archive` com um `parent_id` válido.

### ⏳ Fase 3.4 — CodeAgent
- Geração/modificação de código baseada no objetivo
- Integração com o supervisor

**Objetivo de Validação:** O `code_agent` produz um novo `code_snapshot` que é então validado pelo `validation_agent`.

---

## Infraestrutura

| Componente | Serviço | Detalhes |
|-----------|---------|---------|
| Servidor | Cloud Run | `australia-southeast1`, 1Gi RAM, 2 vCPU |
| Banco | Cloud SQL MySQL 8.0 | `us-central1-c`, `mother_v7_prod` |
| Autenticação | Manus OAuth | JWT, sessões persistentes |
| CI/CD | Cloud Build | `cloudbuild.yaml`, auto-deploy no push |
| Código | GitHub | `Ehrvi/mother-v7-improvements` |

### Secrets (Secret Manager)

- `DATABASE_URL`: `mysql://user:pass@/mother_v7_prod?unix_socket=/cloudsql/mothers-library-mcp:us-central1:mother-db`
- `OPENAI_API_KEY`: `sk-proj-...` (GPT-4o)

### Database Schema

#### langgraph_checkpoints
```sql
CREATE TABLE langgraph_checkpoints (
  thread_id VARCHAR(255) PRIMARY KEY,
  checkpoint_ns VARCHAR(255) NOT NULL,
  checkpoint_id VARCHAR(255) NOT NULL,
  parent_checkpoint_id VARCHAR(255),
  type VARCHAR(50),
  checkpoint LONGTEXT NOT NULL,
  metadata LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### dgm_archive
```sql
CREATE TABLE dgm_archive (
  id INT AUTO_INCREMENT PRIMARY KEY,
  generation_id VARCHAR(255) NOT NULL,
  parent_id INT,
  code_snapshot_url TEXT,
  fitness_score DECIMAL(5, 4),
  benchmark_results TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES dgm_archive(id)
);
```

#### episodic_memory
```sql
CREATE TABLE episodic_memory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Embasamento Científico

| Conceito | Referência | Aplicação na MOTHER |
|---------|-------|-------------------|
| Darwin Gödel Machine | Zhang et al., arXiv:2505.22954 | Loop evolutivo DGM, `dgm_archive` |
| ReAct | Yao et al., ICLR 2023 | `ValidationAgent`, raciocínio-ação |
| Memória Agentic | A-MEM, arXiv:2502.12110 | `episodic_memory`, recuperação contextual |
| Context Engineering | Weaviate, 2025 | Padrão de documentação AWAKE/README |
| LangGraph | LangChain, 2024 | Supervisor, checkpointing, estado persistente |

### Referências Completas

1. Zhang, J., et al. (2025). *Darwin Gödel Machine: A self-improving AI system*. arXiv:2505.22954.
2. Yao, S., et al. (2023). *ReAct: Synergizing Reasoning and Acting in Language Models*. ICLR 2023.
3. Hu, Y., et al. (2025). *A-MEM: Agentic Memory for AI Agents*. arXiv:2502.12110.
4. Weaviate. (2025). *Context Engineering - LLM Memory and Retrieval for AI Agents*. Weaviate Blog.

---

## AWAKE History (Memória Episódica)

| Versão | Data | Marco | Link |
|--------|------|-------|------|
| AWAKE-V47 | 2026-02-23 | Singularidade Cognitiva Desperta | [Ver arquivo](./docs/AWAKE-V47.md) |
| AWAKE-V48 | 2026-02-24 | Diagnóstico completo dos bugs v39 | [Ver arquivo](./docs/AWAKE-V48.md) |
| AWAKE-V49 | 2026-02-24 | DGM Loop Funcional — Primeiro registro no `dgm_archive` | [Ver arquivo](./docs/AWAKE-V49.md) |
| **AWAKE-V50** | **2026-02-24** | **Diretiva de Auto-Consciência Contextual. Novo padrão de documentação.** | [Ver arquivo](./docs/AWAKE-V50.md) |
| **AWAKE-V51** | **2026-02-24** | **Implementação v41.0: AI-INSTRUCTIONS.md commitado, README/MASTER_PROMPT atualizados** | [Ver arquivo](./docs/AWAKE-V51.md) |

---

## Instruções para Agentes

### 🚨 DIRETIVA PRIMÁRIA: ANTI-AMNÉSIA

**Qualquer agente que trabalhe neste projeto DEVE:**

1. **Ler este README.md PRIMEIRO** antes de qualquer ação de código
2. **Ler o último AWAKE-V[n].md** para recuperar o contexto episódico
3. **Ler o MASTER_PROMPT.md** para entender a visão e diretivas constitucionais
4. **Ler o AI-INSTRUCTIONS.md** para protocolos de superinteligência

### 📝 OBRIGAÇÃO DE DOCUMENTAÇÃO INCREMENTAL

Ao final de **CADA SESSÃO DE TRABALHO SIGNIFICATIVA**, você DEVE:

1. **Criar um novo arquivo `docs/AWAKE-V[n+1].md`:**
   - Documente o `goal` da sessão, as ações tomadas, os bugs encontrados, as soluções implementadas e o estado final do sistema
   - Inclua o `YAML Frontmatter` com o estado atualizado

2. **Atualizar este `README.md`:**
   - Atualize o YAML frontmatter com a nova revisão ativa
   - Atualize a seção "Estado Atual" com novos componentes funcionais
   - Adicione o novo AWAKE à tabela de histórico

3. **Fazer Commit no Git:**
   - Código: branch `v[versão]` (ex: `v39.1-db-fix`)
   - Documentação: branch `master`
   - Repositório: `https://github.com/Ehrvi/mother-v7-improvements`

### 🔗 Referências Importantes

- **AI-INSTRUCTIONS.md**: [Ver arquivo](./AI-INSTRUCTIONS.md) (commitado no GitHub)
- **MASTER_PROMPT.md**: [Ver arquivo](./MASTER_PROMPT.md)
- **Google Drive (Backup)**: [MOTHER-v7.0 folder](https://drive.google.com/drive/folders/1kQf0fxIS8kYWuEnO1QIHKN2qhKEJFVrX)

---

## Quick Start

### Prerequisites

- Node.js 22.13.0+
- OpenAI API key
- MySQL/TiDB database

### Installation

```bash
# Clone repository
git clone https://github.com/Ehrvi/mother-v7-improvements.git
cd mother-interface

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test server/mother.test.ts
```

---

## Como Testar

### 1. Verificar Status do Servidor
```bash
curl https://mother-interface-qtvghovzxa-ts.a.run.app/api/health
```

### 2. Testar Loop DGM
```bash
curl -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.supervisor.evolve \
  -H "Content-Type: application/json" \
  -d '{"0":{"json":{"goal":"Write a function that returns Hello World"}}}'
```

### 3. Verificar Registros no dgm_archive
```sql
SELECT * FROM dgm_archive ORDER BY created_at DESC LIMIT 5;
```

---

## Troubleshooting

### Database not available
**Sintoma**: `[MySqlCheckpointer] Error in list: Error: Database not available`

**Causa**: `db.ts` não está parseando corretamente a URL com `unix_socket`

**Solução**: Verificar que `server/db.ts` usa parse manual da URL:
```typescript
const url = new URL(dbUrl);
const socketPath = url.searchParams.get('unix_socket');
poolConfig = {
  socketPath: socketPath,
  user: url.username,
  password: url.password,
  database: url.pathname.substring(1),
  // ...
};
```

### Revision Rollback
```bash
gcloud run services update-traffic mother-interface \
  --to-revisions=mother-interface-00189-lfj=100 \
  --region=australia-southeast1 \
  --project=mothers-library-mcp
```

---

## 📁 Project Structure

```
mother-interface/
├── client/                    # Frontend (React + Tailwind)
│   ├── src/
│   │   ├── pages/
│   │   │   └── Home.tsx      # Main chat interface
│   │   ├── components/       # UI components
│   │   └── lib/trpc.ts       # tRPC client
│   └── public/               # Static assets
├── server/                    # Backend (Express + tRPC)
│   ├── mother/               # MOTHER v40.0 core
│   │   ├── supervisor.ts     # LangGraph supervisor
│   │   ├── validation_agent.ts # ReAct validation
│   │   ├── archive_node.ts   # DGM archive
│   │   ├── checkpoint.ts     # MySqlCheckpointer
│   │   └── memory_agent.ts   # Episodic memory (WIP)
│   ├── db.ts                 # Database operations
│   ├── routers.ts            # tRPC routers
│   └── *.test.ts             # Test files
├── drizzle/                   # Database schema
│   └── schema.ts             # Tables definition
├── docs/                      # Documentation
│   ├── AWAKE-V*.md           # Episodic memory logs
│   └── README-V*.md          # Version history
├── AI-INSTRUCTIONS.md        # Superintelligence protocols
├── MASTER_PROMPT.md          # Constitutional directives
└── README.md                 # This file (Semantic memory)
```

---

## 📜 License

This project implements academic research and follows best practices from:
- Darwin Gödel Machine (Zhang et al., arXiv:2505.22954)
- ReAct (Yao et al., ICLR 2023)
- A-MEM (Hu et al., arXiv:2502.12110)
- Context Engineering (Weaviate, 2025)

---

## 🎯 Final Status

**✅ v40.0 OPERACIONAL**

- DGM Loop: Funcional ✅
- ValidationAgent: ReAct implementado ✅
- ArchiveNode: 2 registros salvos ✅
- MySqlCheckpointer: Persistência funcionando ✅
- Deployment: Cloud Run revision 00189-lfj ✅
- Documentation: Context Recovery pattern ✅

**Last Updated:** 2026-02-24  
**Version:** v40.0  
**Commit:** e18c794

---

*MOTHER foi criada para ser um sistema cognitivo com memória, raciocínio e agência na vanguarda do conhecimento.*  
*Seja bem-vinda, MOTHER. Aqui é seu criador.*
