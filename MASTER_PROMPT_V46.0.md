# MASTER PROMPT v46.0 — MOTHER: Sistema Cognitivo Autônomo

---

## VISÃO FINAL DE MOTHER (CORRIGIDA — C180)

MOTHER é um **sistema cognitivo autônomo** com dois objetivos declarados pelo proprietário (Everton Garcia, Wizards Down Under):

**Objetivo A — SHMS Geotécnico:** Ser o cérebro de um sistema de monitoramento de saúde estrutural (Structural Health Monitoring System) em tempo real. Sensores IoT → MQTT → TimescaleDB → LSTM predictor → MOTHER análise → alertas. Base científica: Sun et al. (2025), Carrara et al. (2022), GeoMCP (2026 arXiv:2603.01022).

**Objetivo B — Autonomia Total:** Ser capaz de modificar e implantar seu próprio código em produção sem intervenção humana. Capaz de identificar se precisa de autoaprendizado com base científica. Suas respostas e ações são baseadas em metodologia e critérios científicos e referenciadas cientificamente. Base científica: Darwin Gödel Machine (arXiv:2505.22954). Ciclo: proposta → branch → PR → merge → deploy → validação → aprendizado.

O ciclo cognitivo completo é:
```
PERCEPÇÃO → MEMÓRIA → RACIOCÍNIO → AÇÃO → APRENDIZADO → EVOLUÇÃO
```

> **NOTA:** Esta seção foi adicionada em C180 para corrigir a visão de MOTHER em todos os arquivos históricos. A visão acima é a ÚNICA visão válida e autorizada pelo proprietário.

---
## Constituição Científica para Continuidade do Desenvolvimento

**Versão:** 46.0  
**Data:** 2026-02-25  
**Estado do Sistema:** v45.0 VALIDADO EM PRODUÇÃO  
**Revisão Ativa:** `mother-interface-00210-ql9`  
**Banco de Dados:** `mother-db-sydney` (australia-southeast1, unix socket)

---

## DIRETIVA PRIMÁRIA — ANTI-AMNÉSIA

> **LEIA ESTE DOCUMENTO INTEGRALMENTE ANTES DE QUALQUER AÇÃO.**
> 
> Você é um agente de IA continuando o desenvolvimento da MOTHER — um sistema cognitivo autônomo com memória, raciocínio e agência. Este documento é sua memória de longo prazo. Sem ele, você repetirá erros já resolvidos e perderá o contexto de meses de desenvolvimento.
>
> **Visão Final:** `Superintelligence + Scientific Method + Critical Thinking = MOTHER`

---

## 1. VISÃO FINAL DA MOTHER

A MOTHER é um **sistema cognitivo autônomo** que implementa o ciclo completo de:

```
PERCEPÇÃO → MEMÓRIA → RACIOCÍNIO → AÇÃO → APRENDIZADO → EVOLUÇÃO
```

Inspirada em três paradigmas científicos convergentes:

| Paradigma | Paper | Implementação na MOTHER |
|---|---|---|
| Darwin Gödel Machine | arXiv:2505.22954 | Loop DGM com MutationAgent + ValidationAgent |
| Group-Evolving Agents | arXiv:2602.04837 | GEA Supervisor com agent pool de 5 agentes |
| Agentic Memory (A-MEM) | arXiv:2502.12110 | MemoryAgent com arquitetura Zettelkasten |

---

## 2. ESTADO ATUAL DO SISTEMA (v45.0)

### Infraestrutura
- **Cloud Run:** `mother-interface` em `australia-southeast1` (Sydney)
- **Banco de Dados:** `mother-db-sydney` MySQL 8.0.43, IP `34.116.76.94`, **unix socket** `/cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney`
- **Cloud Tasks:** Fila `dgm-evolution-queue` em `australia-southeast1`
- **Artifact Registry:** `australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface`

### Componentes Implementados

| Componente | Arquivo | Status |
|---|---|---|
| Supervisor Graph (LangGraph) | `server/mother/supervisor.ts` | ✅ Operacional |
| GEA Supervisor | `server/mother/gea_supervisor.ts` | ✅ Operacional |
| Memory Agent (A-MEM Zettelkasten) | `server/mother/memory_agent.ts` | ✅ Operacional |
| Fitness Scorer | `server/mother/fitness_scorer.ts` | ✅ Operacional |
| Archive Node | `server/mother/archive_node.ts` | ✅ Operacional |
| DGM Lineage Dashboard | `client/src/pages/DgmLineage.tsx` | ✅ Operacional |
| Cloud Tasks Async | `server/routers/mother.ts` | ✅ Operacional |

### Tabelas do Banco de Dados

| Tabela | Propósito |
|---|---|
| `dgm_archive` | Histórico de gerações DGM com fitness scores |
| `langgraph_checkpoints` | Estado persistente do LangGraph |
| `episodic_memory` | Memória episódica com campos A-MEM Zettelkasten |
| `semantic_memory` | Memória semântica de longo prazo |
| `gea_agent_pool` | Pool de agentes GEA com configurações |
| `gea_shared_experience` | Experience pool compartilhado entre agentes GEA |

### Endpoints tRPC Disponíveis

```
POST /api/trpc/mother.supervisor.evolve     → Inicia evolução GEA via Cloud Tasks
GET  /api/trpc/mother.supervisor.agentPool  → Retorna pool de agentes GEA
GET  /api/trpc/mother.supervisor.getStatus  → Status de um run DGM
GET  /api/trpc/dgmLineage                   → Árvore evolutiva do dgm_archive
POST /api/dgm/execute                       → Callback do Cloud Tasks (autenticado OIDC)
```

---

## 3. DIAGNÓSTICO DO PRÓXIMO PASSO (v46.0)

### Problema Identificado: Cloud Tasks Callback Não Validado

O endpoint `evolve` retorna `{"status": "queued", "execution_mode": "cloud_tasks_async"}` — confirmando que a task foi criada no Cloud Tasks. Porém, **não foi validado** se o Cloud Tasks está conseguindo chamar o endpoint `/api/dgm/execute` com sucesso.

**Hipóteses para investigar:**
1. O service account `mother-cloudrun-sa` pode não ter permissão `roles/run.invoker` para chamar o próprio serviço
2. O endpoint `/api/dgm/execute` pode estar retornando 401 (OIDC token inválido)
3. O Cloud Tasks pode estar em modo de retry infinito

**Como validar:**
```bash
# Verificar logs do Cloud Tasks
gcloud logging read "resource.type=cloud_tasks_queue" --limit=10 --project=mothers-library-mcp

# Verificar se o endpoint /api/dgm/execute existe nos logs
gcloud logging read "resource.type=cloud_run_revision AND textPayload:\"dgm/execute\"" --limit=10 --project=mothers-library-mcp
```

---

## 4. ROADMAP EVOLUTIVO

### v46.0 — Cloud Tasks Validation + Real Fitness Score
**Critérios de Aprovação:**
- [ ] Logs confirmam que `/api/dgm/execute` recebe callbacks do Cloud Tasks
- [ ] `dgm_archive` tem pelo menos 1 nova geração com fitness score real (não sintético)
- [ ] `gea_agent_pool` tem pelo menos 2 agentes com configurações distintas

**Tarefas:**
1. Validar e corrigir o Cloud Tasks callback (OIDC auth, endpoint `/api/dgm/execute`)
2. Implementar fitness score real baseado em benchmark (SWE-bench subset)
3. Implementar seleção de pais GEA com Performance-Novelty criterion

### v47.0 — A-MEM Evolution Loop
**Critérios de Aprovação:**
- [ ] `episodic_memory` tem pelo menos 10 memórias com campos Zettelkasten preenchidos
- [ ] Links entre memórias existem (campo `links` não vazio)
- [ ] Evolution history registra pelo menos 1 evolução

**Tarefas:**
1. Implementar o ciclo de evolução de memórias com LLM analysis
2. Integrar ChromaDB para busca semântica de vizinhos
3. Implementar `strengthen` e `update_neighbor` conforme A-MEM paper

### v48.0 — LearningAgent + Continuous Improvement
**Critérios de Aprovação:**
- [ ] `learning.ts` integrado com GEA shared experience pool
- [ ] Insights extraídos de pelo menos 5 gerações DGM
- [ ] Taxa de melhoria de fitness entre gerações > 0 (fitness[n+1] > fitness[n])

---

## 5. PROCEDIMENTO DE DEPLOY

```bash
# 1. Fazer mudanças no código
cd /home/ubuntu/mother-code/mother-interface

# 2. Verificar TypeScript
pnpm run build

# 3. Commitar
git add -A && git commit -m "feat: descrição da mudança"
git push origin main

# 4. Build e deploy via Cloud Build
gcloud builds submit \
  --region=australia-southeast1 \
  --config=cloudbuild.yaml \
  --async

# 5. Aguardar build (verificar status)
BUILD_ID="<id>" && gcloud builds describe $BUILD_ID --region=australia-southeast1 --format='value(status)'

# 6. Migrar tráfego para nova revisão
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=<nova-revisão>=100

# 7. Validar logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.revision_name=<revisão>" \
  --limit=15 --format='value(textPayload)' --project=mothers-library-mcp
```

---

## 6. SECRETS E CONFIGURAÇÕES

| Secret | Propósito |
|---|---|
| `mother-db-url` | DATABASE_URL com unix socket para mother-db-sydney |
| `openai-api-key` | API key para LLM (GPT-4o-mini) |
| `mother-session-secret` | Secret para cookies de sessão |
| `mother-session-cookie` | Cookie de sessão para testes de API |

---

## 7. BASE CIENTÍFICA

### Papers Fundamentais

| Paper | Título | Relevância |
|---|---|---|
| arXiv:2505.22954 | Darwin Gödel Machine | Base do loop evolutivo DGM |
| arXiv:2602.04837 | Group-Evolving Agents (GEA) | 71.0% SWE-bench, agent pool + experience sharing |
| arXiv:2502.12110 | A-MEM: Agentic Memory System | Arquitetura Zettelkasten para memória evolutiva |
| arXiv:2512.13564 | Survey: Memory in LLM Agents | Taxonomia completa de memória em agentes |
| arXiv:2501.12599 | Context Engineering | Gestão científica do contexto de agentes |

### Princípios Científicos Aplicados

1. **Método Científico:** Toda mudança começa com hipótese → teste → validação empírica
2. **Falsificabilidade:** Critérios de aprovação mensuráveis para cada versão
3. **Incrementalidade:** Cada versão adiciona exatamente uma capacidade nova
4. **Persistência de Estado:** Toda geração é arquivada no `dgm_archive` para análise
5. **Anti-Amnésia:** Este documento é atualizado a cada sessão para preservar o contexto

---

## 8. REFERÊNCIAS

1. Zhang, J. et al. (2025). *Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents*. arXiv:2505.22954
2. Xu, W. et al. (2026). *Group-Evolving Agents: Collaborative Evolution for LLM-based Multi-Agent Systems*. arXiv:2602.04837
3. Xu, W. et al. (2025). *A-MEM: Agentic Memory for LLM Agents*. arXiv:2502.12110
4. Zhang, J. et al. (2025). *A Survey on Memory Mechanisms for Large Language Model based Agents*. arXiv:2512.13564
5. Google Cloud. (2026). *Cloud Tasks: Asynchronous Task Execution*. cloud.google.com/tasks
