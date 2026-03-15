# MOTHER v122.26 — Instruções Detalhadas

> **Darwin Gödel Machine — Sistema Cognitivo Autônomo**

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura do Sistema](#2-arquitetura-do-sistema)
3. [Requisitos e Pré-requisitos](#3-requisitos-e-pré-requisitos)
4. [Configuração Local (Desenvolvimento)](#4-configuração-local-desenvolvimento)
5. [Variáveis de Ambiente](#5-variáveis-de-ambiente)
6. [Como Rodar o Projeto](#6-como-rodar-o-projeto)
7. [Pipeline de Processamento de Queries](#7-pipeline-de-processamento-de-queries)
8. [Comandos Slash (Sidebar)](#8-comandos-slash-sidebar)
9. [Ferramentas Administrativas (Tools)](#9-ferramentas-administrativas-tools)
10. [Sistema DGM (Darwin Gödel Machine)](#10-sistema-dgm-darwin-gödel-machine)
11. [Base de Conhecimento (Knowledge Base)](#11-base-de-conhecimento-knowledge-base)
12. [SHMS — Monitoramento Estrutural](#12-shms--monitoramento-estrutural)
13. [Deploy em Produção (Google Cloud Run)](#13-deploy-em-produção-google-cloud-run)
14. [Banco de Dados](#14-banco-de-dados)
15. [Troubleshooting — Problemas Comuns](#15-troubleshooting--problemas-comuns)
16. [Estrutura de Arquivos Críticos](#16-estrutura-de-arquivos-críticos)
17. [Referências Científicas](#17-referências-científicas)

---

## 1. Visão Geral

**MOTHER** é um sistema de superinteligência autônoma que combina:

- **Multi-tier LLM routing** — GPT-4o-mini (simples) → GPT-4o (médio) → GPT-4 (complexo)
- **Darwin Gödel Machine (DGM)** — auto-melhoria autônoma com geração e aplicação de código
- **CRAG v2** — Corrective Retrieval-Augmented Generation para respostas com citações verificadas
- **Aprendizado Contínuo** — memória episódica, padrões extraídos de cada interação
- **Conselho dos 6 IAs** — coordenação multi-provider (OpenAI, Anthropic, Google, DeepSeek, Mistral)
- **SHMS** — Monitoramento de saúde estrutural de barragens (digital twin + sensores IoT)
- **SWE-Agent** — agente que lê código, gera diffs, compila e faz commits autônomos no GitHub

**URL de Produção:** `https://mother-interface-qtvghovzxa-ts.a.run.app`
**Região:** `australia-southeast1` (Sydney)

---

## 2. Arquitetura do Sistema

### 2.1 Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| **Backend** | Node.js + Express.js + tRPC |
| **Banco de Dados** | MySQL (Cloud SQL) + PostgreSQL/TimescaleDB (SHMS) |
| **ORM** | Drizzle ORM |
| **LLM Providers** | OpenAI, Anthropic, Google (Gemini), DeepSeek, Mistral |
| **Streaming** | Server-Sent Events (SSE) |
| **Deploy** | Google Cloud Run + Cloud Build |
| **IoT** | MQTT (HiveMQ Cloud) |
| **Sandbox** | E2B Code Interpreter |

### 2.2 Fluxo de Dados

```
┌──────────────────────────────────────────────────┐
│          Frontend (React + TypeScript)            │
│  HomeV2.tsx — chat interface principal            │
│  SSE streaming, indicador de fases, tools        │
└──────────────┬───────────────────────────────────┘
               │ tRPC + REST APIs
               ↓
┌──────────────────────────────────────────────────┐
│          Backend (Express + Node.js)              │
├──────────────────────────────────────────────────┤
│  /api/trpc/*        → tRPC procedures            │
│  /api/mother/stream → SSE streaming (principal)   │
│  /api/a2a/*         → Agent-to-Agent protocol     │
│  /api/shms/v2/*     → Digital Twin REST API       │
│  /api/health        → Health check                │
│  /.well-known/agent.json → A2A discovery          │
└──────────────┬───────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────┐
│        Core Intelligence (9 camadas)              │
│  1. Semantic Cache    6. Self-Refine              │
│  2. Complexity Anal.  7. Constitutional AI        │
│  3. CRAG v2 Retrieval 8. Guardian (scoring)       │
│  4. Tool Engine       9. Learning Loop            │
│  5. MoA/Debate                                    │
└──────────────┬───────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────┐
│           Data Layer                              │
│  MySQL (Cloud SQL) — queries, knowledge, cache    │
│  TimescaleDB — SHMS time-series sensor data       │
└──────────────────────────────────────────────────┘
```

---

## 3. Requisitos e Pré-requisitos

### 3.1 Software Necessário

- **Node.js** >= 20.x (recomendado: 22.x)
- **npm** >= 10.x
- **Git** >= 2.x
- **Google Cloud SDK** (para deploy)
- **MySQL** 8.x (local ou Cloud SQL via proxy)

### 3.2 Contas e API Keys Necessárias

| Serviço | Obrigatório? | Para quê |
|---------|-------------|----------|
| **OpenAI** | Sim | LLM principal (GPT-4o, GPT-4o-mini, embeddings) |
| **Anthropic** | Opcional | Multi-provider (Claude) |
| **Google AI** | Opcional | Multi-provider (Gemini) |
| **DeepSeek** | Opcional | Multi-provider (reasoning) |
| **Mistral** | Opcional | Multi-provider |
| **GitHub** | Sim | SWE-Agent commits autônomos |
| **Google Cloud** | Sim (produção) | Cloud Run, Cloud SQL, Secret Manager |
| **E2B** | Opcional | Sandbox para execução de código |
| **HiveMQ** | Opcional | SHMS IoT sensors |

---

## 4. Configuração Local (Desenvolvimento)

### 4.1 Clonar o Repositório

```bash
git clone https://github.com/Ehrvi/mother-v7-improvements.git
cd mother-v7-improvements
```

### 4.2 Instalar Dependências

```bash
npm install
```

### 4.3 Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
cp .env.example .env  # se existir
# ou crie manualmente (veja seção 5)
```

### 4.4 Configurar Banco de Dados Local

**Opção A — MySQL Local:**
```bash
# Instalar MySQL 8.x
# Criar banco de dados
mysql -u root -p -e "CREATE DATABASE mother_dev;"

# Configurar no .env:
# DATABASE_URL=mysql://root:senha@localhost:3306/mother_dev
```

**Opção B — Cloud SQL Proxy (recomendado para dev com dados reais):**
```bash
# Instalar cloud-sql-proxy
gcloud auth application-default login

cloud-sql-proxy \
  mothers-library-mcp:australia-southeast1:mother-db-sydney \
  --port=3306

# Configurar no .env:
# DATABASE_URL=mysql://user:pass@127.0.0.1:3306/mother
```

### 4.5 Rodar Migrações

```bash
npm run db:push
```

### 4.6 Iniciar em Modo Desenvolvimento

```bash
npm run dev
```

Acesse: `http://localhost:3000`

---

## 5. Variáveis de Ambiente

### 5.1 Variáveis Obrigatórias

```env
# Banco de Dados (MySQL)
DATABASE_URL=mysql://user:password@host:3306/database

# LLM Principal
OPENAI_API_KEY=sk-proj-...

# Autenticação
JWT_SECRET=<mínimo 32 caracteres — gere com: openssl rand -hex 32>

# Versão
MOTHER_VERSION=v122.26
MOTHER_CYCLE=200
NODE_ENV=development
```

### 5.2 Variáveis Opcionais (Multi-Provider)

```env
# Providers adicionais para Conselho dos 6
OPENAI_API_KEY_EXTRA_SVCACCT=sk-svcacct-...  # Modelo DPO fine-tuned
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIzaSy...
DEEPSEEK_API_KEY=sk-...
MISTRAL_API_KEY=...
```

### 5.3 Variáveis para Funcionalidades Específicas

```env
# SWE-Agent (DGM auto-commits)
GITHUB_TOKEN=ghp_...

# Conta do Criador (permissões administrativas)
CREATOR_EMAIL=seu-email@example.com

# E2B Sandbox (execução de código remota)
E2B_API_KEY=e2b_...

# SHMS — Monitoramento Estrutural
MQTT_BROKER_URL=mqtts://broker.hivemq.com:8883
MQTT_USERNAME=...
MQTT_PASSWORD=...
TIMESCALE_DB_URL=postgres://user:pass@host/dbname
```

### 5.4 Variáveis de Build (Frontend — Vite)

```env
# Prefixo VITE_ — embarcadas no bundle JavaScript no build time
VITE_APP_ID=mother-interface
VITE_APP_TITLE=MOTHER v122.26
VITE_APP_LOGO=/logo.png
VITE_FRONTEND_FORGE_API_KEY=...
VITE_FRONTEND_FORGE_API_URL=https://api.openai.com
```

---

## 6. Como Rodar o Projeto

### 6.1 Desenvolvimento

```bash
npm run dev
# Inicia Vite dev server + tsx watch
# Frontend: http://localhost:3000
# API: http://localhost:3000/api/*
```

### 6.2 Build de Produção

```bash
npm run build
# 1. Vite build (frontend → dist/public/)
# 2. esbuild (backend → dist/index.js)
```

### 6.3 Rodar em Produção (Local)

```bash
npm run build
npm run start
# Executa: NODE_ENV=production node dist/index.js
```

### 6.4 Verificação de Tipos

```bash
npm run check
# Executa: tsc --noEmit
```

### 6.5 Testes

```bash
npm run test
# Executa: vitest run
```

---

## 7. Pipeline de Processamento de Queries

Quando um usuário envia uma mensagem, ela passa por 9 camadas:

### Camada 1 — Semantic Cache
- Verifica se a pergunta já foi respondida recentemente (TTL: 72h)
- Se encontrar → retorna resposta cacheada instantaneamente
- Arquivo: `server/mother/semantic-cache.ts`

### Camada 2 — Análise de Complexidade
- Classifica a query como simples/média/complexa
- Roteia para o modelo adequado:
  - **Simples** → GPT-4o-mini (mais barato, mais rápido)
  - **Média** → GPT-4o (balanceado)
  - **Complexa** → GPT-4 (máxima qualidade)
- Arquivo: `server/mother/intelligence.ts`

### Camada 3 — CRAG v2 Retrieval
- Busca vetorial na base de conhecimento
- Se relevância < 0.5 → busca corretiva na web (arXiv, pesquisa)
- Decompõe documentos em "knowledge strips"
- Arquivo: `server/mother/crag-v2.ts`

### Camada 4 — Tool Engine
- Executa ferramentas via OpenAI Function Calling
- Tools: audit_system, search_knowledge, get_proposals, etc.
- Estilo ReAct (Reasoning + Acting)
- Arquivo: `server/mother/tool-engine.ts`

### Camada 5 — MoA/Debate (Mixture of Agents)
- Orquestração multi-expert para queries complexas
- Self-Consistency (múltiplos caminhos de raciocínio)
- Tree-of-Thoughts para problemas difíceis
- Arquivo: `server/mother/orchestration.ts`

### Camada 6 — Self-Refine
- Se a qualidade < 90 → loop corretivo (re-prompt + retry)
- Arquivo: `server/mother/self-refine.ts`

### Camada 7 — Constitutional AI
- Aplica princípios de segurança (honestidade, utilidade, segurança)
- Filtra outputs potencialmente danosos
- Arquivo: `server/mother/constitutional-ai.ts`

### Camada 8 — Guardian (Quality Scoring)
- Avalia completude, precisão, relevância, coerência, segurança
- Score de 0 a 100
- Se score < 90 → volta para Self-Refine
- Arquivo: `server/mother/guardian.ts`

### Camada 9 — Learning Loop
- Armazena query/resposta no banco
- Extrai padrões para melhoria contínua
- Atualiza memória episódica com embeddings
- Arquivo: `server/mother/agentic-learning.ts`

---

## 8. Comandos Slash (Sidebar)

Os comandos da sidebar são atalhos especiais processados em `server/routers/mother.ts`:

### Diagnóstico

| Comando | Descrição | O que faz |
|---------|-----------|-----------|
| `/audit` | Auditoria do sistema | Executa auditoria completa: métricas, status de cada módulo, saúde dos providers |
| `/status` | Status operacional | Retorna versão, contagem de queries, cache hit rate, memória, uptime |

### Evolução DGM

| Comando | Descrição | O que faz |
|---------|-----------|-----------|
| `/proposals` | Propostas de melhoria | Lista todas as propostas geradas pelo DGM (pendentes, aprovadas, rejeitadas) |
| `/fitness` | Score de aptidão | Calcula: 0.35×correctness + 0.20×efficiency + 0.20×robustness + 0.15×maintainability + 0.10×novelty |
| `/approve {id}` | Aprovar proposta | Aprova uma proposta DGM → dispara SWE-Agent para aplicar mudanças |

### Conhecimento

| Comando | Descrição | O que faz |
|---------|-----------|-----------|
| `/knowledge` | Base de conhecimento | Mostra domínios, "wisdom %" (% de cobertura), total de entradas |
| `/research` | Pesquisa científica | Dispara ingestão de papers do arXiv, síntese e extração de conhecimento |

### Fase 5 (Avançado)

| Comando | Descrição | O que faz |
|---------|-----------|-----------|
| `/shell` | Shell remoto | Executa comandos em sandbox E2B (execução segura na nuvem) |
| `/sse` | SSE hub | Hub de streaming interno (monitoramento de eventos SSE) |
| `/es` | Event stream | Visualizador de event stream |
| `/editor` | Editor de código | Leitura/escrita direta de arquivos do repositório |
| `/graph` | Grafo de dependências | Visualização do grafo de dependências do sistema |
| `/projects` | Dashboard de projetos | Painel de gerenciamento de projetos |

### Outros Comandos

| Comando | Descrição |
|---------|-----------|
| `/calibrate` | Calibração de pesos G-Eval (7 dias de dados) |
| `/learn {topic}` | Força aprendizado sobre um tópico específico |

---

## 9. Ferramentas Administrativas (Tools)

As tools são funções executadas via OpenAI Function Calling dentro do pipeline de processamento:

| Tool | Permissão | Descrição |
|------|-----------|-----------|
| `audit_system` | Todos | Auditoria completa do sistema (8 domínios) |
| `get_proposals` | Todos | Lista propostas DGM |
| `get_performance_metrics` | Todos | Métricas de performance (latência P50/P95/P99, custos) |
| `search_knowledge` | Todos | Busca na base de conhecimento (similaridade vetorial) |
| `approve_proposal` | Creator | Aprova proposta DGM → dispara SWE-Agent |
| `learn_knowledge` | Creator | Adiciona conhecimento diretamente à base |
| `force_study` | Creator | Estuda um tópico sob demanda (ingestão arXiv) |
| `self_repair` | Creator | Auditoria completa + bootstrap de 8 domínios de conhecimento |
| `get_audit_log` | Creator | Trilha de auditoria do sistema |

### Permissões

- **Creator** — Conta com email = `CREATOR_EMAIL`. Tem acesso total (aprovar propostas, forçar aprendizado, auto-reparo)
- **Admin** — Acesso intermediário
- **User** — Acesso básico (fazer perguntas, ver propostas)

---

## 10. Sistema DGM (Darwin Gödel Machine)

### 10.1 O que é

O DGM é o mecanismo de auto-melhoria da MOTHER. Ele:

1. **Analisa** o desempenho do sistema (métricas de qualidade, latência, erros)
2. **Gera propostas** de melhoria (mudanças de código, novos recursos)
3. **Aguarda aprovação** do Creator
4. **Aplica mudanças** automaticamente via SWE-Agent

### 10.2 Ciclo de Vida de uma Proposta

```
1. DGM identifica oportunidade de melhoria
         ↓
2. self-proposal-engine.ts gera proposta
   (título, descrição, mudanças de código, fitness esperado)
         ↓
3. Proposta salva no banco (status: pending)
         ↓
4. Creator vê em /proposals
         ↓
5. Creator aprova com /approve {id}
         ↓
6. approveProposal() → triggerSweAgentJob()
         ↓
7. Cloud Run Job: mother-swe-agent-job
   [OBSERVE] Fetch proposta
   [THINK]   Parse mudanças
   [ACT]     Clone repo → create branch
   [OBSERVE] Read arquivo(s) alvo
   [THINK]   LLM gera diffs executáveis
   [ACT]     Apply diffs → TypeScript compile
   [ACT]     git commit → git push
         ↓
8. Branch criada: feature/auto-proposal-{id}-{timestamp}
         ↓
9. Creator revisa e faz merge manual
```

### 10.3 Fitness Score

A "aptidão" do sistema é calculada como:

```
Fitness = 0.35 × correctness
        + 0.20 × efficiency
        + 0.20 × robustness
        + 0.15 × maintainability
        + 0.10 × novelty
```

- **correctness** — precisão das respostas (Guardian score)
- **efficiency** — latência e uso de recursos
- **robustness** — estabilidade sob carga
- **maintainability** — qualidade do código
- **novelty** — capacidade de inovação

---

## 11. Base de Conhecimento (Knowledge Base)

### 11.1 Como Funciona

- Conhecimento é armazenado como entradas vetorizadas (text-embedding-3-small)
- Organizado em **domínios** (ex: AI/ML, geotechnical, physics, etc.)
- Cada entrada tem: título, conteúdo, domínio, confiança, fonte, embedding

### 11.2 Fontes de Conhecimento

1. **Ingestão Manual** — Creator usa `learn_knowledge` ou `/learn`
2. **Pesquisa arXiv** — `/research` ingere papers automaticamente
3. **Aprendizado por Interação** — Cada query gera aprendizado implícito
4. **Self-Repair** — Bootstrap de 8 domínios fundamentais

### 11.3 CRAG Pipeline

```
Query do usuário
  ↓
Busca vetorial (cosine similarity) na knowledge base
  ↓
Score de relevância (0.0 a 1.0)
  ↓
Se score ≥ 0.5 → usa documentos encontrados
Se score < 0.5 → busca corretiva (web/arXiv)
  ↓
Decomposição em knowledge strips
  ↓
Recomposição do contexto
  ↓
Grounding Engine → verificação de citações
  ↓
Resposta com citações verificadas
```

---

## 12. SHMS — Monitoramento Estrutural

### 12.1 O que é

Sistema de Monitoramento de Saúde Estrutural para barragens geotécnicas:

- **Digital Twin** — modelo digital da barragem
- **Sensores IoT** — piezômetros, inclinômetros, medidores de nível
- **MQTT** — ingestão de dados em tempo real
- **TimescaleDB** — armazenamento de séries temporais
- **LSTM** — predição de anomalias

### 12.2 Endpoints SHMS

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/shms/v2/state` | GET | Estado atual do digital twin |
| `/api/shms/v2/analysis` | POST | Análise geotécnica |
| `/api/shms/v2/alerts` | GET | Alertas ativos |
| `/api/shms/v2/calibration` | POST | Calibração de sensores |
| `/api/shms/v2/predictions` | GET | Predições LSTM |

### 12.3 Páginas Frontend

- `/shms` — Dashboard principal
- `/shms/2d` — Visualização 2D
- `/shms/3d` — Visualização 3D

---

## 13. Deploy em Produção (Google Cloud Run)

### 13.1 Build e Deploy Automático

```bash
# Via Cloud Build (recomendado)
gcloud builds submit --config=cloudbuild.yaml --project=mothers-library-mcp
```

### 13.2 Deploy Manual

```bash
gcloud run deploy mother-interface \
  --image=australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface:latest \
  --region=australia-southeast1 \
  --set-cloudsql-instances=mothers-library-mcp:australia-southeast1:mother-db-sydney,mothers-library-mcp:us-central1:mother-db \
  --set-secrets=DATABASE_URL=MOTHER_DATABASE_URL:latest,OPENAI_API_KEY=MOTHER_OPENAI_KEY:latest,GITHUB_TOKEN=mother-github-token:latest \
  --project=mothers-library-mcp
```

### 13.3 Secrets no GCP

Os secrets são gerenciados pelo **Google Secret Manager**:

| Secret Name | Variável | Descrição |
|-------------|----------|-----------|
| `MOTHER_DATABASE_URL` | `DATABASE_URL` | Connection string MySQL |
| `MOTHER_OPENAI_KEY` | `OPENAI_API_KEY` | API key OpenAI |
| `mother-github-token` | `GITHUB_TOKEN` | Token GitHub para SWE-Agent |

### 13.4 Cloud SQL

- **Instância principal:** `mother-db-sydney` (australia-southeast1)
- **Instância backup:** `mother-db` (us-central1)
- **Conexão:** Unix socket (`/cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney`)

---

## 14. Banco de Dados

### 14.1 Schema Principal (MySQL — Drizzle ORM)

| Tabela | Descrição |
|--------|-----------|
| `users` | Autenticação, roles (creator/admin/user), status de aprovação |
| `queries` | Log de todas as Q&A com quality scores, provider, modelo, custo |
| `knowledge` | Base de conhecimento persistente, tags de domínio, embeddings |
| `learning_patterns` | Padrões aprendidos de interações |
| `cache_entries` | Cache query-resposta (TTL 24h, meta 35% hit rate) |
| `semantic_cache` | Cache baseado em embeddings (TTL 72h) |
| `system_metrics` | Agregação periódica (P50/P95/P99 latência, custos) |
| `episodic_memory` | Memória episódica com índice vetorial (A-MEM + Zettelkasten) |
| `audit_log` | Ações administrativas (propostas, aprovações, mudanças) |
| `migrations_applied` | Controle de migrações SQL aplicadas |

### 14.2 Migrações

```bash
# Gerar e aplicar migrações
npm run db:push
# Executa: drizzle-kit generate && drizzle-kit migrate
```

Schema definido em: `drizzle/schema.ts`

---

## 15. Troubleshooting — Problemas Comuns

### "Resposta não recebida. Tente novamente."

**Causa mais provável:** Falha na conexão com a API OpenAI ou timeout no streaming SSE.

**Soluções:**
1. Verificar se `OPENAI_API_KEY` está configurada e válida
2. Verificar logs do servidor: procurar erros em `/api/mother/stream`
3. Verificar se o banco de dados está acessível (`DATABASE_URL`)
4. No Network tab do DevTools, verificar se as requests para `auth.me` estão retornando 200
5. Verificar se o JWT_SECRET está configurado (necessário para autenticação)

### Requests "auth.me" falhando em loop

**Causa:** Cookie de sessão inválido ou JWT_SECRET não configurado.

**Soluções:**
1. Limpar cookies do navegador para `localhost:3000`
2. Verificar se `JWT_SECRET` está no `.env`
3. Fazer login novamente

### "logs" e "stream" aparecendo no Network tab sem resposta

**Causa:** SSE streaming não consegue se conectar ao backend.

**Soluções:**
1. Verificar se o servidor está rodando (`npm run dev`)
2. Verificar se a porta 3000 não está em uso por outro processo
3. Verificar se `OPENAI_API_KEY` está válida (o stream depende dela)

### Erro de conexão com Cloud SQL

**Causa:** Cloud SQL Proxy não está rodando ou credenciais inválidas.

**Soluções:**
1. Iniciar o Cloud SQL Proxy
2. Verificar `gcloud auth application-default login`
3. Verificar se o formato da `DATABASE_URL` está correto

### Build falha com erros TypeScript

```bash
npm run check  # Ver erros de tipo
npm run build  # Tentar build completo
```

### Propostas DGM não aparecem

1. Verificar se o cron job de propostas está ativo
2. Verificar no banco: `SELECT * FROM update_proposals ORDER BY created_at DESC LIMIT 10;`
3. Executar `/proposals` no chat

---

## 16. Estrutura de Arquivos Críticos

```
mother-v7-improvements/
├── client/                          # Frontend React
│   └── src/
│       ├── pages/
│       │   ├── HomeV2.tsx           # Interface principal do chat
│       │   ├── Login.tsx            # Página de login
│       │   └── shms/               # Páginas SHMS
│       ├── components/              # Componentes React
│       └── lib/                     # Utilitários frontend
├── server/                          # Backend Node.js
│   ├── _core/
│   │   ├── index.ts                 # Entry point dev
│   │   └── production-entry.ts      # Entry point produção (~915 linhas)
│   ├── mother/                      # Core Intelligence
│   │   ├── core.ts                  # Orquestrador principal (~2000+ linhas)
│   │   ├── intelligence.ts          # Análise de complexidade + routing
│   │   ├── crag-v2.ts              # CRAG Pipeline
│   │   ├── tool-engine.ts          # OpenAI Function Calling tools
│   │   ├── guardian.ts             # Quality scoring (0-100)
│   │   ├── grounding.ts           # Anti-hallucination, citações
│   │   ├── self-refine.ts         # Loop de auto-refinamento
│   │   ├── constitutional-ai.ts   # Segurança (Constitutional AI)
│   │   ├── orchestration.ts       # MoA/Debate orquestração
│   │   ├── knowledge.ts           # CRUD base de conhecimento
│   │   ├── episodic-memory.ts     # Memória episódica vetorial
│   │   ├── user-memory.ts         # Memória por usuário
│   │   ├── agentic-learning.ts    # Aprendizado contínuo
│   │   ├── research.ts            # Pesquisa arXiv
│   │   ├── self-proposal-engine.ts # DGM geração de propostas
│   │   ├── autonomous-update-job.ts # SWE-Agent
│   │   ├── update-proposals.ts    # Gerenciamento de propostas
│   │   ├── self-audit-engine.ts   # Auditoria de 8 domínios
│   │   ├── semantic-cache.ts      # Cache semântico (72h)
│   │   ├── shms-digital-twin.ts   # SHMS digital twin
│   │   ├── lstm-predictor-c207.ts # LSTM anomaly detection
│   │   └── long-form-engine-v3.ts # Geração de documentos longos
│   ├── routers/
│   │   └── mother.ts              # tRPC router + slash commands
│   └── db.ts                      # Conexão DB + queries
├── drizzle/
│   └── schema.ts                  # Schema do banco (Drizzle ORM)
├── shared/                         # Tipos compartilhados (frontend + backend)
├── .env.production                 # Variáveis de build (Vite)
├── cloudbuild.yaml                 # Google Cloud Build config
├── Dockerfile                      # Container image config
├── package.json                    # Dependências e scripts
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite config
└── README.md                       # Memória semântica canônica
```

---

## 17. Referências Científicas

| Paper | Aplicação na MOTHER |
|-------|-------------------|
| Zhang et al. (2025). "Darwin Gödel Machine." arXiv:2505.22954 | DGM — auto-melhoria autônoma |
| Xia et al. (2025). "SWE-agent." arXiv:2405.15793 | SWE-Agent — commits autônomos |
| Yan et al. (2024). "CRAG." arXiv:2401.15884 | CRAG Pipeline — retrieval corretivo |
| Asai et al. (2023). "Self-RAG." arXiv:2310.11511 | Retrieval seletivo |
| Dhuliawala et al. (2023). "CoVe." arXiv:2309.11495 | Chain-of-Verification |
| Bai et al. (2022). "Constitutional AI." Anthropic | Segurança por princípios |
| Liu et al. (2023). "G-Eval." arXiv:2303.16634 | Avaliação de qualidade |
| Yao et al. (2023). "ReAct." ICLR 2023 | Reasoning + Acting (tools) |
| Park et al. (2023). "Generative Agents." UIST 2023 | Memória episódica |
| Packer et al. (2023). "MemGPT." arXiv:2310.08560 | Gestão de memória |
| Hochreiter & Schmidhuber (1997). "LSTM." Neural Computation | SHMS anomaly detection |
| ICOLD Bulletin 158 (2014) | Padrões de monitoramento de barragens |
| Wozniak (1990). "SM-2 Algorithm." SuperMemo World | Re-proposal scheduling |

---

*Documento gerado em 2026-03-15 — MOTHER v122.26*
