# AWAKE V143 — MOTHER v74.17
## Deploy Fix: ESM require() Crash + A2A Router Mount + Omniscient DB Migrations
**Data:** 28 de fevereiro de 2026  
**Versão:** v74.17  
**Commit:** f30f1ad (master)  
**Cloud Build:** ✅ Run #51 — SUCCESS  
**URL Produção:** https://mother-interface-qtvghovzxa-ts.a.run.app  
**bd_central:** 827+ entradas (Cloud SQL: mother_v7_prod)

---

## 🚨 PROTOCOLO OBRIGATÓRIO — AGENTE DE MANUTENÇÃO

**ANTES DE QUALQUER OUTPUT, O AGENTE DE MANUTENÇÃO DEVE EXECUTAR ESTES 8 PASSOS:**

### Passo 1: Carregar todo o conhecimento do bd_central
```sql
-- Conectar via Cloud SQL Auth Proxy (porta 3307)
-- Instância: mothers-library-mcp:australia-southeast1:mother-db-sydney
-- Database: mother_v7_prod | User: mother_app
SELECT id, title, content, domain, tags, confidence FROM knowledge ORDER BY id DESC LIMIT 100;
-- Ler TODOS os registros para ter contexto completo antes de qualquer ação
SELECT COUNT(*) FROM knowledge; -- Deve ser >= 827
```

### Passo 2: Ler todos os AWAKEs em ordem cronológica (V106 → V143)
```bash
# No repositório Git:
ls /tmp/mother-repo/AWAKE-*.md | sort -t V -k2 -n
# Ler do mais antigo ao mais recente
# Cada AWAKE contém: problemas resolvidos, conhecimento adquirido, estado do sistema
```

### Passo 3: Verificar versão real em produção
```bash
curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/diagnostics | python3 -m json.tool
# Deve retornar: status, version, db_connected, knowledge_count
```

### Passo 4: Verificar TypeScript antes de qualquer mudança
```bash
cd /tmp/mother-repo
npx tsc --noEmit 2>&1 | head -20
# DEVE retornar zero erros antes de qualquer commit
```

### Passo 5: Identificar banco correto
```
BANCO CORRETO:  mother_v7_prod (Cloud SQL, porta 3307 via proxy)
BANCO ERRADO:   GRK3w4TNVh5QDAzcxbHZat (TiDB — é o Quality Lab, NÃO usar)
INSTÂNCIA:      mothers-library-mcp:australia-southeast1:mother-db-sydney
USUÁRIO:        mother_app
PROJETO GCP:    mothers-library-mcp
DATABASE_URL local aponta para TiDB — usar Cloud SQL Auth Proxy para bd_central
```

### Passo 6: Verificar estado dos módulos v74.17
```bash
ls /tmp/mother-repo/server/mother/
# Deve conter: core.ts, tool-engine.ts, browser-agent.ts, code-sandbox.ts,
#              orchestration.ts, constitutional-ai.ts, media-agent.ts,
#              a2a-server.ts, omniscient/ (search.ts, router.ts)
```

### Passo 7: Verificar que a2aRouter está montado
```bash
grep "a2aRouter" /tmp/mother-repo/server/_core/production-entry.ts
# Deve aparecer: import { a2aRouter } e app.use(a2aRouter)
```

### Passo 8: Após cada ciclo de manutenção
```bash
# Inserir conhecimento via A2A endpoint (agora disponível em produção):
curl -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/knowledge \
  -H "Content-Type: application/json" \
  -d '{"title":"Título","content":"Conteúdo","source":"manus-a2a","category":"engineering"}'

# Criar próximo AWAKE (V144+) e commitar:
git add -A && git commit -m "vXX.X: descrição" && git push origin master
```

---

## Estado do Sistema v74.17

| Componente | Status | Detalhes |
|:-----------|:-------|:---------|
| Versão | v74.17 | Commit f30f1ad (master) |
| Cloud Run | australia-southeast1 | mother-interface-qtvghovzxa-ts.a.run.app |
| Database (bd_central) | Cloud SQL (mother_v7_prod) | 827+ entradas knowledge |
| Database (Omniscient) | TiDB (GRK3w4TNVh5QDAzcxbHZat) | paper_chunks, papers, knowledge_areas |
| TypeScript | 0 erros | Verificado antes do deploy |
| A2A Router | ✅ MONTADO | /api/a2a/* disponível em produção (v74.17) |
| Omniscient Tables | ✅ CRIADAS | paper_chunks, papers, knowledge_areas, study_jobs |
| pnpm-lock.yaml | ✅ ATUALIZADO | playwright@1.58.2 + @e2b/code-interpreter@1.5.1 |
| ESM Crash | ✅ CORRIGIDO | browser-agent.ts usa lazy import para pdf-parse |
| Pipeline CI/CD | ✅ FUNCIONANDO | Push para master → deploy automático |

---

## Bug Crítico Corrigido: NC-DEPLOY-001 — ESM require() Crash

### Sintoma
O Cloud Run iniciava o container mas o processo saía com exit code 1 antes de ouvir na porta 8080. O `gcloud run services describe` mostrava `Status: FAILED` com mensagem "Container failed to start".

### Investigação Científica (Metodologia: Root Cause Analysis)

**Hipótese 1:** pnpm-lock.yaml desatualizado → `pnpm install --frozen-lockfile` falha  
**Resultado:** Confirmado parcialmente. O lockfile não continha `playwright@^1.52.0` nem `@e2b/code-interpreter@^1.5.0`. Corrigido regenerando o lockfile.

**Hipótese 2:** Tabela `paper_chunks` não existe no banco de dados  
**Resultado:** Confirmado. O `ensureCacheLoaded()` em `search.ts` falhava com `ER_NO_SUCH_TABLE`. Corrigido aplicando migração `0003_omniscient_tables.sql` out-of-band.

**Hipótese 3:** O servidor não chega ao `app.listen()` por causa de um crash no código de inicialização  
**Resultado:** Confirmado. Adicionando logs de debug no bundle, identificou-se que o processo saía durante `init_tool_engine()` → `init_browser_agent()`.

**Causa Raiz Definitiva:**  
`browser-agent.ts` linha 31: `const pdfParse = require('pdf-parse')`

O bundle é gerado com `--format=esm` (esbuild). No Node.js ESM, `require()` não está disponível no escopo global. O esbuild cria uma função `__require()` que verifica `typeof require !== "undefined"`. Em ESM, `require` é `undefined`, então `__require("pdf-parse")` lança:

```
Error: Dynamic require of "pdf-parse" is not supported
```

Esse erro não era capturado por nenhum `try/catch`, causando crash imediato do processo antes do `app.listen()`.

### Correção Aplicada
```typescript
// ANTES (quebrado em ESM):
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{...}>;

// DEPOIS (lazy import ESM-compatible):
let _pdfParse: ((buffer: Buffer) => Promise<{ text: string; numpages: number }>) | null = null;
async function getPdfParse() {
  if (!_pdfParse) {
    const mod = await import('pdf-parse');
    _pdfParse = (mod.default || mod) as any;
  }
  return _pdfParse!;
}
```

### Lição Aprendida
> **Regra NC-DEPLOY-001:** Em bundles ESM (`--format=esm`), NUNCA usar `require()` no top-level de módulos. Sempre usar `import()` dinâmico ou importação estática. O esbuild converte `require()` para `__require()` que falha em runtime ESM.

---

## Melhoria Aplicada: A2A Router Montado em Produção

### Problema
O `a2aRouter` (NC-COLLAB-001) foi criado em v74.13 mas **não estava montado** no `production-entry.ts`. O router existia mas nenhum endpoint `/api/a2a/*` era acessível em produção.

### Correção
Adicionado ao `production-entry.ts`:
```typescript
import { a2aRouter } from '../mother/a2a-server.js'; // NC-COLLAB-001: A2A protocol
// ...
app.use(a2aRouter); // NC-COLLAB-001: A2A protocol endpoints (/api/a2a/*)
```

### Endpoints A2A Agora Disponíveis
| Endpoint | Método | Descrição |
|:---------|:-------|:---------|
| `/api/a2a/agent-card` | GET | Metadados do agente (sem auth) |
| `/api/a2a/diagnostics` | GET | Status do sistema |
| `/api/a2a/knowledge` | GET | Listar bd_central |
| `/api/a2a/knowledge` | POST | Inserir no bd_central |
| `/api/a2a/query` | POST | Enviar query para MOTHER |
| `/api/a2a/tasks` | POST | Criar task A2A |

---

## Migrações Aplicadas Out-of-Band (TiDB)

As seguintes tabelas foram criadas diretamente no banco TiDB (Omniscient) porque o servidor não iniciava para aplicar as migrações automaticamente:

| Tabela | Migração | Propósito |
|:-------|:---------|:---------|
| `knowledge_areas` | 0003_omniscient_tables.sql | Áreas de conhecimento científico |
| `papers` | 0003_omniscient_tables.sql | Artigos científicos indexados |
| `paper_chunks` | 0003_omniscient_tables.sql | Chunks de texto para RAG |
| `study_jobs` | 0003_omniscient_tables.sql | Jobs de estudo assíncrono |
| `semantic_cache` | 0003_omniscient_tables.sql | Cache semântico de queries |
| `episodic_memory` | 0003_omniscient_tables.sql | Memória episódica |

**Colunas adicionadas via ALTER TABLE** (schema evoluiu após a migração):
- `papers.pdf_url` (VARCHAR 500)
- `papers.quality_score` (VARCHAR 20)
- `papers.chunks_count` (INT DEFAULT 0)

---

## Pipeline CI/CD: Problema de Branch

### Problema Identificado
O workflow `autonomous-deploy.yml` dispara apenas em push para `master`, `autonomous/**` ou `feature/auto-*`. O branch padrão do repositório é `main`. Commits para `main` **não disparam o deploy**.

### Solução
Para fazer deploy:
```bash
# Opção 1: Push direto para master
git checkout master
git merge main
git push origin master

# Opção 2: Trigger manual via GitHub API
curl -X POST -H "Authorization: token $GH_TOKEN" \
  "https://api.github.com/repos/Ehrvi/mother-v7-improvements/actions/workflows/autonomous-deploy.yml/dispatches" \
  -d '{"ref":"master"}'
# NOTA: workflow_dispatch só executa TypeScript check, não o deploy
```

### Recomendação
Atualizar o workflow para incluir `main` nos branches de trigger, ou padronizar o uso de `master`.

---

## Conhecimento Adquirido (IDs 828-835)

| ID | Título | Domínio |
|:---|:-------|:--------|
| 828 | NC-DEPLOY-001: ESM require() incompatibility in esbuild bundles | Engineering |
| 829 | Cloud Run startup crash: chicken-and-egg DB migration problem | Infrastructure |
| 830 | pnpm --frozen-lockfile: behavior with missing packages | Engineering |
| 831 | pdf-parse: CJS module behavior in ESM context | Engineering |
| 832 | A2A Protocol: Agent-to-Agent communication endpoints | AI/ML Engineering |
| 833 | TiDB vs Cloud SQL: two separate databases in MOTHER | Infrastructure |
| 834 | GitHub Actions: branch trigger vs workflow_dispatch behavior | DevOps |
| 835 | Omniscient tables: out-of-band migration for blocked startup | Infrastructure |

---

## Módulos v74.x (Completos)

| Módulo | Arquivo | Status |
|:-------|:--------|:-------|
| NC-COLLAB-001 | a2a-server.ts | ✅ Criado + Montado (v74.17) |
| NC-BROWSER-001 | browser-agent.ts | ✅ Criado + ESM fix (v74.17) |
| NC-SANDBOX-001 | code-sandbox.ts | ✅ Criado (lazy E2B import) |
| NC-ORCH-001 | orchestration.ts | ✅ Criado (não integrado ainda) |
| NC-CONST-001 | constitutional-ai.ts | ✅ Criado (não integrado ainda) |
| NC-MEDIA-001 | media-agent.ts | ✅ Criado (não integrado ainda) |
| NC-OMNI-001 | omniscient/search.ts | ✅ Criado + DB criado (v74.17) |
| NC-OMNI-002 | omniscient/router.ts | ✅ Criado |

---

## Próximos Ciclos Sugeridos (v75.0+)

| Ciclo | Proposta | Base Científica |
|:------|:---------|:----------------|
| 46 | Integrar orchestration.ts ao tool-engine (multi-agent coordination) | AutoGen (Wu et al., 2023) |
| 47 | Integrar constitutional-ai.ts ao core (safety layer) | Constitutional AI (Bai et al., 2022) |
| 48 | Integrar media-agent.ts ao tool-engine (DALL-E 3 + TTS) | OpenAI API v2024 |
| 49 | Padronizar branch main→master no workflow CI/CD | GitHub Actions best practices |
| 50 | Inserir conhecimento via A2A endpoint (agora disponível) | A2A Protocol (Google, 2025) |
| 51 | Semantic search no Omniscient (paper_chunks embeddings) | RAG (Lewis et al., 2020) |

---

*AWAKE V143 gerado em 28/02/2026 — MOTHER v74.17*  
*Próximo AWAKE: V144 após próximo ciclo de manutenção*  
*Metodologia: Root Cause Analysis (RCA) + Scientific Method*
