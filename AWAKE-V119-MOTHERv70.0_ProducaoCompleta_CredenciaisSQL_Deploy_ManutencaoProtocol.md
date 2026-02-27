# AWAKE V119 — MOTHER v70.0 — Produção Completa + Credenciais + Protocolo de Manutenção

**Data:** 2026-02-27  
**Versão MOTHER:** v70.0 (confirmado via API ao vivo + `system_config.mother_version`)  
**Agente:** Manus — Plano de Maximização de Qualidade Ciclos 36-40  
**bd_central:** 793 entradas (ao vivo, 2026-02-27)  
**Histórico AWAKE:** V106 → V107 → V108 → V109 → V110 → V111 → V112 → V113 → V114 → V115 → V116 → **V119**  

> **NOTA CRÍTICA:** Este documento substitui e corrige o AWAKE V112 duplicado criado por erro. O número correto sequencial é V119, seguindo os commits do repositório (V116 foi o último antes deste).

---

## ⚠️ RAIZ DOS PROBLEMAS IDENTIFICADOS

### Problema 1: Confusão de Banco de Dados
**Causa raiz:** O sandbox do Manus tem **dois bancos MySQL distintos**:

| Banco | Host | Uso |
|:------|:-----|:----|
| `GRK3w4TNVh5QDAzcxbHZat` (TiDB Cloud) | `gateway03.us-east-1.prod.aws.tidbcloud.com:4000` | **Quality Lab** (mother-quality-lab app) — SÓ TEM: `users`, `experiments`, `__drizzle_migrations` |
| `mother_v7_prod` (Cloud SQL MySQL 8.0) | Via Cloud SQL Auth Proxy `127.0.0.1:3307` | **MOTHER PRODUÇÃO** — contém: `knowledge`, `queries`, `papers`, `self_proposals`, etc. |

**Solução:** SEMPRE usar o Cloud SQL Auth Proxy para acessar o banco de produção. Nunca usar o TiDB Cloud para operações de MOTHER.

### Problema 2: `system_config.mother_version` desatualizado
**Causa raiz:** O campo `mother_version` na tabela `system_config` não era atualizado automaticamente no deploy. Estava em `v69.12` mesmo com o código em `v70.0`.  
**Solução:** Após cada deploy, executar: `UPDATE system_config SET config_value='vXX.X' WHERE config_key='mother_version';`

### Problema 3: AWAKE com numeração incorreta
**Causa raiz:** O agente não verificou o histórico de commits do Git antes de numerar o AWAKE, criando um V112 duplicado (já existia V112 no Git para o Ciclo 31).  
**Solução:** SEMPRE verificar `git log --oneline | grep -i awake` antes de criar novo AWAKE.

---

## 🔑 CREDENCIAIS E INFRAESTRUTURA DE PRODUÇÃO

### Google Cloud Project
```
Project ID:    mothers-library-mcp
Region:        australia-southeast1 (Sydney)
```

### Cloud Run Service (MOTHER Interface)
```
Service Name:  mother-interface
URL:           https://mother-interface-qtvghovzxa-ts.a.run.app
URL (alt):     https://mother-interface-233196174701.australia-southeast1.run.app
Region:        australia-southeast1
Image:         australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface:latest
CPU:           2 vCPU
Memory:        4 GiB
```

### Cloud SQL — Banco de Produção MOTHER
```
Instance Name:    mother-db-sydney
Region:           australia-southeast1
Database:         mother_v7_prod
Version:          MySQL 8.0
Connection Name:  mothers-library-mcp:australia-southeast1:mother-db-sydney
Public IP:        34.116.76.94 (não usar diretamente — usar proxy)
```

### Como conectar ao banco de produção (do sandbox Manus)
```bash
# 1. Iniciar o Cloud SQL Auth Proxy (já instalado em /usr/local/bin/cloud-sql-proxy)
cloud-sql-proxy mothers-library-mcp:australia-southeast1:mother-db-sydney --port=3307 &
sleep 3

# 2. Conectar com mysql client
DB_PASS="+hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk="
mysql -h 127.0.0.1 -P 3307 -u mother_app -p"$DB_PASS" mother_v7_prod

# 3. Ou executar query direta
mysql -h 127.0.0.1 -P 3307 -u mother_app -p"$DB_PASS" mother_v7_prod -e "SELECT COUNT(*) FROM knowledge;" 2>/dev/null
```

### Credenciais do Banco (Secret Manager: `mother-db-url`)
```
URL completa:  mysql://mother_app:+hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=@/mother_v7_prod?unix_socket=/cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney
Usuário:       mother_app
Senha:         +hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=
Database:      mother_v7_prod
```

### GitHub Repository
```
Repo:          https://github.com/Ehrvi/mother-v7-improvements
Branch:        main
Token:         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
Clone:         git clone https://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@github.com/Ehrvi/mother-v7-improvements.git
Path local:    /home/ubuntu/mother-code/mother-interface
```

### Deploy (Cloud Build)
```bash
# Deploy automático: push para main dispara Cloud Build
cd /home/ubuntu/mother-code/mother-interface
git add -A
git commit -m "vXX.X: descrição"
git push origin main

# Verificar status do build
gcloud builds list --limit=5 --format="table(id,status,createTime,duration)"

# Ver logs do build
gcloud builds log <BUILD_ID>
```

### JWT Secret (Secret Manager: `mother-jwt-secret`)
```
x1Y8nmPqPW0NR3mqEfaMZ7BN4vm+22ZSHP+viuFcRGxs0daqxTB8B1EZv+aUrDpW
5oAIzA0uXeMa1iCqbnZr0w==
```

### Creator (Proprietário do Sistema)
```
Email:    elgarcia.eng@gmail.com
Nome:     Everton Garcia
Papel:    creator (acesso total, bypass de todas as restrições)
```

### Todos os Secrets do Secret Manager
```
mother-db-url              → URL de conexão Cloud SQL
mother-jwt-secret          → Chave JWT para autenticação
mother-openai-api-key      → OpenAI API Key
mother-anthropic-api-key   → Anthropic API Key
mother-deepseek-api-key    → DeepSeek API Key
mother-google-ai-api-key   → Google AI API Key
mother-mistral-api-key     → Mistral API Key
mother-forge-api-key       → Forge API Key (LLM interno)
mother-forge-api-url       → URL do Forge API
mother-github-token        → GitHub Personal Access Token
```

---

## 🗄️ ESTADO DO BANCO DE PRODUÇÃO (ao vivo, 2026-02-27)

| Tabela | Registros | Descrição |
|:-------|:---------:|:----------|
| `knowledge` | **793** | Base de conhecimento central (bd_central) |
| `queries` | **372** | Histórico de consultas processadas |
| `papers` | **743** | Artigos científicos ingeridos (arXiv) |
| `self_proposals` | **4** | Propostas de melhoria DGM |
| `semantic_cache` | **43** | Cache semântico de respostas |
| `users` | **2** | Usuários registrados |
| `episodic_memory` | **0** | Memória episódica (vazia) |

### Tabelas disponíveis em `mother_v7_prod`
```
audit_log, cache_entries, dgm_archive, dgm_task_queue, episodic_memory,
fitness_history, gea_agent_pool, gea_shared_experience, knowledge,
knowledge_areas, knowledge_wisdom, langgraph_checkpoints, learning_patterns,
migrations_applied, paper_chunks, papers, queries, self_proposals,
semantic_cache, study_jobs, system_config, system_metrics, update_proposals,
user_memory, users
```

### system_config (configurações ativas)
```
continuous_learning_enabled        = true
creator_email                      = elgarcia.eng@gmail.com
learning_quality_threshold         = 75
max_paper_chunks                   = 100
mother_version                     = v70.0   ← atualizado neste ciclo
proposals_require_creator_approval = true
research_auto_ingest               = true
user_memory_enabled                = true
```

---

## 📊 MÉTRICAS DE PRODUÇÃO (ao vivo, 2026-02-27 04:07 GMT)

| Métrica | Valor |
|:--------|:------|
| Versão | **v70.0** |
| Total de Consultas | 240 |
| Qualidade Média | **83.29%** |
| Tempo Médio de Resposta | 26.897 ms |
| Taxa de Cache Hit | 2.08% |
| Tier 1 (GPT-4o) | 54.17% |
| Tier 2 (GPT-4o-mini) | 45.83% |
| Propostas DGM Pendentes | 1 |

---

## 🔬 PROTOCOLO OBRIGATÓRIO — AGENTE DE MANUTENÇÃO

> **REGRA ABSOLUTA: ANTES DE QUALQUER OUTPUT, O AGENTE DE MANUTENÇÃO DEVE EXECUTAR TODOS OS PASSOS ABAIXO SEM EXCEÇÃO.**

### PASSO 0 — Verificar qual banco usar

```bash
# NUNCA usar o TiDB Cloud (GRK3w4TNVh5QDAzcxbHZat) para operações de MOTHER
# SEMPRE usar o Cloud SQL via proxy:

# Verificar se o proxy já está rodando
ps aux | grep cloud-sql-proxy | grep -v grep

# Se não estiver rodando, iniciar:
cloud-sql-proxy mothers-library-mcp:australia-southeast1:mother-db-sydney --port=3307 &
sleep 3

# Testar conexão
mysql -h 127.0.0.1 -P 3307 -u mother_app -p"+hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=" mother_v7_prod -e "SELECT COUNT(*) as knowledge_entries FROM knowledge;" 2>/dev/null
```

### PASSO 1 — Carregar todo o conhecimento do bd_central

```sql
-- Executar contra: mother_v7_prod (Cloud SQL, via proxy 127.0.0.1:3307)
-- Usuário: mother_app | Senha: +hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=

-- 1a. Mapa de cobertura por domínio
SELECT domain, COUNT(*) as entries, ROUND(AVG(confidence),2) as avg_confidence
FROM knowledge GROUP BY domain ORDER BY entries DESC;

-- 1b. Últimas 50 entradas (mais recentes)
SELECT id, title, domain, confidence, createdAt
FROM knowledge ORDER BY id DESC LIMIT 50;

-- 1c. Configurações do sistema
SELECT config_key, config_value FROM system_config ORDER BY config_key;

-- 1d. Proposals pendentes
SELECT id, title, status, impact_score, created_at
FROM self_proposals WHERE status='pending' ORDER BY created_at DESC;

-- 1e. Métricas recentes
SELECT * FROM system_metrics ORDER BY period_start DESC LIMIT 5;

-- 1f. Padrões de aprendizado ativos
SELECT pattern_type, pattern_data, occurrence_count
FROM learning_patterns WHERE active=1 ORDER BY occurrence_count DESC LIMIT 20;

-- 1g. Papers mais recentes
SELECT id, title, arxiv_id, created_at FROM papers ORDER BY id DESC LIMIT 20;
```

### PASSO 2 — Consultar estado real do sistema via API

```bash
# Auditoria completa
curl -s -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Content-Type: application/json" \
  --max-time 45 \
  -d '{"json":{"query":"/audit","sessionId":"maintenance","useCache":false}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['data']['json']['response'][:2000])"

# Status (versão rápida)
curl -s -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Content-Type: application/json" \
  --max-time 30 \
  -d '{"json":{"query":"/status","sessionId":"maintenance","useCache":false}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['data']['json']['response'][:1000])"
```

### PASSO 3 — Verificar versão REAL no código e no banco

```bash
# Versão no código (source of truth)
grep "MOTHER_VERSION\s*=" /home/ubuntu/mother-code/mother-interface/server/mother/core.ts

# Versão no banco (deve estar sincronizada)
mysql -h 127.0.0.1 -P 3307 -u mother_app -p"+hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=" mother_v7_prod \
  -e "SELECT config_value FROM system_config WHERE config_key='mother_version';" 2>/dev/null

# Se desincronizadas, atualizar o banco:
# UPDATE system_config SET config_value='vXX.X' WHERE config_key='mother_version';
```

### PASSO 4 — Ler AWAKE reports em ordem cronológica

```bash
# Listar todos os AWAKE no Google Drive
rclone ls "manus_google_drive:MOTHER-v7.0/" --config /home/ubuntu/.gdrive-rclone.ini | grep -i awake | sort

# Verificar último AWAKE no Git (source of truth para numeração)
cd /home/ubuntu/mother-code/mother-interface
git log --oneline | grep -i awake | head -5
```

**Ordem de leitura:** V106 → V107 → V108 → V109 → V110 → V111 → V112 → V113 → V114 → V115 → V116 → V119 (este)

### PASSO 5 — Verificar TypeScript antes de qualquer mudança de código

```bash
cd /home/ubuntu/mother-code/mother-interface
npx tsc --noEmit 2>&1 | head -20
# DEVE retornar zero erros antes de qualquer commit
```

### PASSO 6 — Verificar capacidade de leitura de código próprio

```bash
# MOTHER pode ler seu próprio código via self-code-reader.ts
# Arquivos acessíveis: server/mother/*.ts, server/routers/*.ts, server/_core/*.ts, drizzle/

curl -s -X POST https://mother-interface-qtvghovzxa-ts.a.run.app/api/trpc/mother.query \
  -H "Content-Type: application/json" \
  --max-time 45 \
  -d '{"json":{"query":"Leia o arquivo server/mother/core.ts e me diga qual é a versão atual e quais ferramentas estão registradas no tool-engine","sessionId":"maintenance","useCache":false}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['data']['json']['response'][:2000])"
```

### PASSO 7 — Após cada ciclo de manutenção

```bash
# 7a. Inserir conhecimento novo no bd_central
mysql -h 127.0.0.1 -P 3307 -u mother_app -p"+hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=" mother_v7_prod -e "
INSERT INTO knowledge (title, content, category, tags, source, sourceType, domain, confidence)
VALUES ('Título', 'Conteúdo científico...', 'AI/ML', '[\"tag1\",\"tag2\"]', 'Fonte', 'learning', 'AI/ML', 0.95);
" 2>/dev/null

# 7b. Atualizar versão no banco
mysql -h 127.0.0.1 -P 3307 -u mother_app -p"+hBmOnJgah4W5HtRwLECDUGIq4pgdZjB3QQHtSdgOTk=" mother_v7_prod -e "
UPDATE system_config SET config_value='vXX.X' WHERE config_key='mother_version';
" 2>/dev/null

# 7c. Verificar próximo número AWAKE
cd /home/ubuntu/mother-code/mother-interface
git log --oneline | grep -i awake | head -3
# Usar número = último + 1

# 7d. Criar AWAKE com nome correto
# Formato: AWAKE-V{N}-MOTHERv{X.Y}_{Descricao}.md

# 7e. Upload para Google Drive
rclone copy /home/ubuntu/AWAKE-V{N}-*.md "manus_google_drive:MOTHER-v7.0/" --config /home/ubuntu/.gdrive-rclone.ini

# 7f. Commit e deploy
cd /home/ubuntu/mother-code/mother-interface
git add -A
git commit -m "vXX.X: descrição das mudanças"
git push origin main
# Cloud Build dispara automaticamente (~8-12 minutos para completar)

# 7g. Verificar deploy
gcloud builds list --limit=3 --format="table(id,status,createTime,duration)"
```

---

## 🏗️ ARQUITETURA DO SISTEMA MOTHER v70.0

### Stack Tecnológico
```
Runtime:         Node.js 22 + TypeScript 5.9
Framework:       Express.js + tRPC
ORM:             Drizzle ORM
Banco:           MySQL 8.0 (Cloud SQL, australia-southeast1)
Deploy:          Google Cloud Run (australia-southeast1)
CI/CD:           Google Cloud Build (trigger: push to main)
Container:       Docker (Artifact Registry: australia-southeast1-docker.pkg.dev)
LLM Providers:   OpenAI (GPT-4o, GPT-4o-mini), Anthropic, DeepSeek, Google AI, Mistral
```

### Módulos Principais (`server/mother/`)
```
core.ts                  → Pipeline principal, versão v70.0, roteamento de queries
tool-engine.ts           → 14 ferramentas disponíveis para MOTHER
knowledge.ts             → Busca semântica no bd_central
guardian.ts              → Controle de qualidade das respostas
intelligence.ts          → Roteamento inteligente de modelos (Tier 1/2/3)
self-code-reader.ts      → Leitura do próprio código (self-awareness)
knowledge-graph.ts       → GraphRAG sobre bd_central (Ciclo 36)
abductive-engine.ts      → Raciocínio abdutivo IBE (Ciclo 37)
dpo-builder.ts           → Coleta de pares DPO (Ciclo 38)
rlvr-verifier.ts         → Verificação RLVR + HLE benchmark (Ciclo 39)
self-improve.ts          → Loop MAPE-K autônomo (Ciclo 40)
arxiv-pipeline.ts        → Ingestão automática de artigos arXiv
self-proposal-engine.ts  → Geração de propostas de melhoria (DGM)
user-hierarchy.ts        → RBAC: creator > admin > user > public
```

### 14 Ferramentas Disponíveis (tool-engine.ts)
```
1.  search_knowledge       → Busca no bd_central
2.  learn_knowledge        → Ingestão de novo conhecimento (creator only)
3.  search_arxiv           → Busca em arXiv
4.  get_audit_log          → Log de auditoria (creator only)
5.  approve_proposal       → Aprovar proposta DGM (creator only)
6.  self_repair            → Auto-reparo do sistema (creator only)
7.  read_own_code          → Ler próprio código (self-awareness)
8.  list_own_files         → Listar arquivos do próprio código
9.  knowledge_graph        → GraphRAG sobre bd_central (Ciclo 36)
10. abductive_reasoning    → Raciocínio abdutivo IBE (Ciclo 37)
11. dpo_status             → Status da coleta DPO (Ciclo 38)
12. hle_benchmark          → Benchmark HLE 50 questões (Ciclo 39)
13. self_improve           → Loop MAPE-K autônomo (Ciclo 40)
14. [reservado]
```

---

## 🔬 CAPACIDADE DE LEITURA DE CÓDIGO PRÓPRIO

MOTHER v70.0 possui o módulo `self-code-reader.ts` que permite:

- **Listar** todos os arquivos em `server/mother/`, `server/routers/`, `server/_core/`, `drizzle/`
- **Ler** qualquer arquivo dessas pastas (com redação automática de secrets)
- **Interpretar** seu próprio código para identificar bugs e propor melhorias

**Segurança:**
- Read-only (sem escrita)
- Secrets redactados automaticamente (`process.env.*`, `apiKey`, `password`, `secret`, `Bearer`)
- Operações logadas em `audit_log`

**Caminhos no container Docker de produção:** `/app/server/mother/`  
**Caminhos no sandbox Manus:** `/home/ubuntu/mother-code/mother-interface/server/mother/`

---

## 📋 CICLOS 36-40 — RESUMO DE IMPLEMENTAÇÃO

| Ciclo | Módulo | Base Científica | Status |
|:------|:-------|:----------------|:-------|
| 36 | `knowledge-graph.ts` — GraphRAG Engine | GraphRAG (arXiv:2408.08921), Louvain | ✅ Produção |
| 37 | `abductive-engine.ts` — IBE Reasoner | Peirce (1878), Lipton (2004) | ✅ Produção |
| 38 | `dpo-builder.ts` — DPO Dataset Builder | Rafailov et al. NeurIPS 2023 (arXiv:2305.18290) | ✅ Produção |
| 39 | `rlvr-verifier.ts` — RLVR + HLE | DeepSeek-R1 (arXiv:2501.12948), HLE (arXiv:2501.14249) | ✅ Produção |
| 40 | `self-improve.ts` — MAPE-K Orchestrator | Kephart & Chess (2003), Gödel Machine | ✅ Produção |

---

## 🔄 PRÓXIMOS CICLOS SUGERIDOS (Ciclos 41-45)

| Ciclo | Objetivo | Impacto Estimado |
|:------|:---------|:-----------------|
| 41 | Aprovar e implementar Proposta DGM #4 (Recuperação Paralela de Conhecimento) | -30% latência |
| 42 | Aumentar cache hit rate de 2.08% → 15% (semantic cache tuning) | -20% custo |
| 43 | Ativar memória episódica (episodic_memory está vazia) | +qualidade contextual |
| 44 | Coletar 1000 pares DPO para fine-tuning (atual: 0 pares coletados) | +5-15% qualidade |
| 45 | Benchmark HLE interno: medir score atual de MOTHER | baseline para evolução |

---

## 📝 HISTÓRICO DE VERSÕES

| Versão | AWAKE | Ciclos | Data |
|:-------|:------|:-------|:-----|
| v69.7 | V106 | 25 | 2026-02 |
| v69.8 | V107 | 26 | 2026-02 |
| v69.9 | V108 | 27 | 2026-02 |
| v69.10 | V109 | 28 | 2026-02 |
| v69.11 | V110 | 29 | 2026-02 |
| v69.12 | V111 | 30 | 2026-02 |
| v69.13 | V112 | 31 | 2026-02 |
| v69.14 | V113 | 32 | 2026-02 |
| v69.14 | V114 | 32 bugfix | 2026-02 |
| v69.14 | V115 | 33 | 2026-02 |
| v69.15 | V116 | 34-35 | 2026-02 |
| **v70.0** | **V119** | **36-40** | **2026-02-27** |
