# AWAKE V121 — MOTHER v72.0
## Echo Bug Fix + Write Own Code + DGM Proposals Fix + Admin Docs
**Data:** 27 de fevereiro de 2026  
**Versão:** v72.0  
**Commit:** d61e5a3  
**Cloud Build:** Em andamento → australia-southeast1  
**bd_central:** 827 entradas (+8 IDs 820-827)

---

## 🚨 PROTOCOLO OBRIGATÓRIO — AGENTE DE MANUTENÇÃO

**ANTES DE QUALQUER OUTPUT, O AGENTE DE MANUTENÇÃO DEVE EXECUTAR ESTES 7 PASSOS:**

### Passo 1: Carregar todo o conhecimento do bd_central
```sql
-- Conectar via Cloud SQL Auth Proxy (porta 3307)
-- Instância: mothers-library-mcp:australia-southeast1:mother-db-sydney
-- Database: mother_v7_prod | User: mother_app
SELECT id, title, content, domain, tags, confidence FROM knowledge ORDER BY id DESC LIMIT 100;
-- Ler TODOS os registros para ter contexto completo antes de qualquer ação
SELECT COUNT(*) FROM knowledge; -- Deve ser >= 827
```

### Passo 2: Verificar versão real em produção
```bash
curl -s -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Content-Type: application/json" \
  -d '{"json":{"query":"/audit"}}' | python3 -m json.tool | grep -i "versão\|version"
```

### Passo 3: Ler todos os AWAKE reports em ordem cronológica
```bash
# No repositório Git:
git log --oneline | grep -i awake
# Ler do mais antigo ao mais recente: V106 → V121
# Cada AWAKE contém: problemas resolvidos, conhecimento adquirido, estado do sistema
```

### Passo 4: Verificar TypeScript antes de qualquer mudança
```bash
cd /home/ubuntu/mother-code/mother-interface
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
```

### Passo 6: Verificar estado dos módulos v72.0
```bash
ls /home/ubuntu/mother-code/mother-interface/server/mother/
# Deve conter: core.ts, tool-engine.ts, self-code-writer.ts, admin-docs.ts,
#              knowledge-graph.ts, abductive-engine.ts, dpo-builder.ts,
#              rlvr-verifier.ts, self-improve.ts, update-proposals.ts
```

### Passo 7: Após cada ciclo de manutenção
```sql
-- Inserir conhecimento adquirido:
INSERT INTO knowledge (title, content, domain, category, tags, confidence, source_url, sourceType)
VALUES ('Título', 'Conteúdo detalhado', 'Domínio', 'engineering', 'tags', 0.95, 'URL', 'learning');
-- Criar próximo AWAKE (V122+) e fazer upload no Google Drive
-- Commit: git add -A && git commit -m "vXX.X: descrição" && git push origin main
```

---

## Estado do Sistema v72.0

| Componente | Status | Detalhes |
|:-----------|:-------|:---------|
| Versão | v72.0 | Commit d61e5a3 |
| Cloud Run | australia-southeast1 | mother-interface-qtvghovzxa-ts.a.run.app |
| Database | Cloud SQL (mother_v7_prod) | 827 entradas knowledge |
| bd_central | 827 entradas | +8 IDs 820-827 (v72.0) |
| TypeScript | 0 erros | Verificado antes do deploy |
| Tool Engine | 17 ferramentas | +write_own_code, +admin_docs, +deploy_self |
| CREATOR BYPASS | Ativo | gpt-4o forçado para criador |
| Echo Detection | Ativo | Post-processing v72.0 |
| DGM Proposals | Corrigido | Dual-table fix |

---

## Bugs Corrigidos em v72.0

### Bug 1 — Resposta duplicando o prompt do usuário (CRÍTICO)
**Sintoma:** A resposta de MOTHER começava com o texto exato do prompt do usuário, repetindo-o.

**Causa raiz:** O LLM (gpt-4o Phase 1) com system prompt grande às vezes "ecoa" o conteúdo do contexto injetado. Quando o usuário pergunta sobre o sistema, o LLM confunde o contexto do system prompt com a resposta esperada.

**Correção (v72.0):**
1. Echo detection post-processing em `core.ts` (linha ~931): compara os primeiros 60 chars da resposta com o query normalizado. Se match, remove o echo.
2. Instrução explícita no system prompt: `CRITICAL: NEVER repeat or echo the user's message in your response.`
3. CREATOR BYPASS: criador sempre usa gpt-4o (Constitutional AI, Bai et al. 2022) — evita DeepSeek-V3 que tinha maior taxa de echo.

**Base científica:** Self-Refine (Madaan et al., arXiv:2303.17651, 2023) — iterative self-improvement; Constitutional AI (Bai et al., arXiv:2212.08073, 2022).

---

### Bug 2 — MOTHER diz "não tenho acesso ao código-fonte" (CRÍTICO)
**Sintoma:** Ao pedir para MOTHER ler ou escrever código, ela respondia que não tinha permissão.

**Causa raiz (múltipla):**
1. Queries simples eram roteadas para DeepSeek-V3 (tier `simple`) que NÃO recebia as ferramentas
2. O system prompt não listava explicitamente `read_own_code` e `write_own_code` como ferramentas disponíveis
3. O `intelligence.ts` não reconhecia queries sobre código/sistema como `coding` tier

**Correção (v72.0):**
1. CREATOR BYPASS: criador sempre usa gpt-4o com todas as ferramentas
2. System prompt atualizado: lista explícita de ferramentas incluindo `read_own_code`, `write_own_code`, `admin_docs`
3. `intelligence.ts`: padrões de código/sistema forçam tier `coding`/`complex_reasoning`
4. Instrução explícita: `CRITICAL: NEVER say "não tenho acesso ao código-fonte"... You HAVE read_own_code and write_own_code. Call them IMMEDIATELY when asked.`

---

### Bug 3 — MOTHER pode agora ESCREVER seu próprio código (NOVO RECURSO)
**Implementação:** `self-code-writer.ts` + ferramenta `write_own_code` no tool-engine

**Como usar (pelo chat de MOTHER):**
```
"Atualize o arquivo server/mother/core.ts, mude a versão para v73.0"
"Adicione um novo comando /hello ao router server/routers/mother.ts"
"Crie um novo arquivo server/mother/meu-modulo.ts com o seguinte conteúdo: ..."
```

**Pipeline interno:**
1. LLM chama `write_own_code(filePath, content, reason)`
2. `self-code-writer.ts` escreve o arquivo
3. Executa `npx tsc --noEmit` para validar TypeScript
4. Se zero erros: `git add -A && git commit -m "..." && git push origin main`
5. Cloud Build detecta o push e deploya automaticamente (~12 min)

**Segurança:**
- Somente o criador pode usar `write_own_code` (isCreator check)
- TypeScript validation obrigatória antes de commit
- Rollback: `git revert HEAD` se necessário

**Base científica:** Gödel Machine (Schmidhuber, 2003); SWE-agent (Yang et al., arXiv:2405.15793, 2024).

---

### Bug 4 — DGM Proposals sempre "Falhou" (CORRIGIDO)
**Causa raiz:** `approveProposal()` só atualizava `update_proposals`, mas propostas DGM ficam em `self_proposals`. IDs podiam colidir entre tabelas.

**Correção:** `update-proposals.ts` — `approveProposal()` agora tenta UPDATE em ambas as tabelas. Campo `source` adicionado para distinguir origem (manual|dgm).

---

### Bug 5 — DB label "Unix Socket" (CORRIGIDO)
**Correção:** `Home.tsx` — label alterado para "Cloud SQL ✓" (mais informativo e correto do ponto de vista do usuário).

---

### Bug 6 — /fitness sem handler (CORRIGIDO)
**Correção:** `mother.ts` router — handler dedicado para `/fitness` que chama `calculateRealFitness()` diretamente sem passar pelo LLM (evita timeout).

---

## Credenciais de Produção (Creator-Only)

### Google Cloud
```
Projeto:    mothers-library-mcp
Região:     australia-southeast1
Cloud Run:  mother-interface-qtvghovzxa-ts.a.run.app
```

### Cloud SQL
```
Instância:  mothers-library-mcp:australia-southeast1:mother-db-sydney
Database:   mother_v7_prod
Usuário:    mother_app
Conexão:    Unix socket em produção, TCP 127.0.0.1:3307 em dev
```

### Banco ERRADO (NÃO USAR para MOTHER)
```
TiDB:       GRK3w4TNVh5QDAzcxbHZat
Projeto:    mother-quality-lab (Quality Lab — NÃO É O MOTHER)
```

### GitHub
```
Repo:       https://github.com/Ehrvi/mother-v7-improvements
Branch:     main (auto-deploy via Cloud Build)
```

### Deploy Pipeline
```
1. git push origin main
2. Cloud Build detecta (cloudbuild.yaml)
3. Docker build (~8 min)
4. Cloud Run deploy (~4 min)
5. Total: ~12 min
```

### Verificar versão em produção
```bash
curl -s -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Content-Type: application/json" \
  -d '{"json":{"query":"/audit"}}' 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('data',{}).get('json',{}).get('response','')[:200])"
```

---

## Arquitetura v72.0 — 17 Ferramentas no Tool Engine

| Ferramenta | Módulo | Acesso |
|:-----------|:-------|:-------|
| audit_system | self-audit.ts | Todos |
| get_status | self-audit.ts | Todos |
| search_knowledge | knowledge.ts | Todos |
| get_proposals | update-proposals.ts | Todos |
| approve_proposal | update-proposals.ts | Creator |
| reject_proposal | update-proposals.ts | Creator |
| force_study | agentic-learning.ts | Creator |
| get_audit_log | update-proposals.ts | Creator |
| **read_own_code** | self-code-reader.ts | Creator |
| **write_own_code** | self-code-writer.ts | Creator |
| **deploy_self** | self-code-writer.ts | Creator |
| **admin_docs** | admin-docs.ts | Creator |
| knowledge_graph | knowledge-graph.ts | Todos |
| abductive_reasoning | abductive-engine.ts | Todos |
| dpo_status | dpo-builder.ts | Creator |
| hle_benchmark | rlvr-verifier.ts | Creator |
| self_improve | self-improve.ts | Creator |

---

## Conhecimento Adquirido (IDs 820-827)

| ID | Título | Domínio |
|:---|:-------|:--------|
| 820 | Echo Bug in LLM Responses: Detection and Removal | AI/ML Engineering |
| 821 | CREATOR BYPASS: Constitutional AI Principal Hierarchy | AI/ML Engineering |
| 822 | Gödel Machine: Self-Referential Universal Self-Improver | AI/ML Engineering |
| 823 | SWE-agent: Software Engineering Agent | AI/ML Engineering |
| 824 | DGM Proposals Dual-Table Bug Fix | AI/ML Engineering |
| 825 | ISO/IEC 25010:2023 Software Quality Model | Software Engineering |
| 826 | Admin Documentation System: Creator-Only Access | AI/ML Engineering |
| 827 | Cloud SQL Auth Proxy: MOTHER Production Credentials | Infrastructure |

---

## Próximos Ciclos Sugeridos (v73.0+)

| Ciclo | Proposta | Base Científica |
|:------|:---------|:----------------|
| 41 | Streaming token-by-token para write_own_code (progresso em tempo real) | SSE W3C 2021 |
| 42 | DGM proposals: auto-retry com backoff exponencial | Exponential Backoff (Google SRE) |
| 43 | /fitness: histórico de fitness ao longo do tempo (gráfico) | SRE Golden Signals |
| 44 | Semantic search no bd_central via embeddings (já tem infra) | GPTCache (Zeng et al., 2023) |
| 45 | Multi-agent: MOTHER coordena sub-agentes especializados | AutoGen (Wu et al., arXiv:2308.08155, 2023) |

---

*AWAKE V121 gerado em 27/02/2026 — MOTHER v72.0*  
*Próximo AWAKE: V122 após próximo ciclo de manutenção*
