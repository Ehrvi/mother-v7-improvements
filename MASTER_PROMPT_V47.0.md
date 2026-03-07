# MASTER PROMPT v47.0 — MOTHER: Sistema Cognitivo Autônomo
## Constituição Científica para Continuidade do Desenvolvimento
**Versão:** 47.0
**Data:** 2026-03-07
**Estado do Sistema:** v81.8 | Ciclo 178 | Pós-Conselho V4 (Delphi 3 rodadas)
**Banco de Dados:** `mother-db-sydney` (australia-southeast1, unix socket)
**Revisão Cloud Run:** `mother-interface-00046-vkz`

---

## ⚠️ DIRETIVA PRIMÁRIA — ANTI-AMNÉSIA + APRENDIZADO DO BD

> **LEIA ESTE DOCUMENTO INTEGRALMENTE ANTES DE QUALQUER AÇÃO.**
>
> Você é um agente de IA continuando o desenvolvimento da MOTHER — um sistema cognitivo autônomo com memória, raciocínio e agência. Este documento é sua memória de longo prazo. Sem ele, você repetirá erros já resolvidos e perderá o contexto de meses de desenvolvimento.
>
> **MANDATÓRIO:** Antes de iniciar qualquer output, execute o PROTOCOLO DE INICIALIZAÇÃO abaixo. Pular qualquer etapa invalida o ciclo e pode causar regressões.

### PROTOCOLO DE INICIALIZAÇÃO OBRIGATÓRIO (v47.0)

```bash
# ETAPA 1: Carregar BD de conhecimento
node check_knowledge.cjs
# Verificar: entradas com categoria council_verdict, root_cause_analysis, roadmap_sprint

# ETAPA 2: Verificar NC crítica ativa
grep -n "const db = getDb()" server/mother/dgm-orchestrator.ts
# Se retornar resultado: NC-TS-001 ainda aberta — CORRIGIR ANTES DE QUALQUER OUTRA AÇÃO

# ETAPA 3: Verificar estado de produção
curl -s https://mother-interface-00046-vkz.a.run.app/health | jq .

# ETAPA 4: Ler TODO do Roadmap
cat TODO-ROADMAP-CONSELHO-V4.md | head -100
# Identificar próximo [ ] no Sprint atual

# ETAPA 5: Verificar git status
git log --oneline -5 && git status
```

**Somente após as 5 etapas: iniciar output.**

---

## 1. VISÃO FINAL DA MOTHER

MOTHER é um **sistema cognitivo autônomo** com dois objetivos declarados pelo proprietário (Everton Garcia, Wizards Down Under):

**Objetivo A — SHMS Geotécnico:** Ser o cérebro de um sistema de monitoramento de saúde estrutural (Structural Health Monitoring System) em tempo real. Sensores IoT → MQTT → TimescaleDB → LSTM predictor → MOTHER análise → alertas. Base científica: Sun et al. (2025), Carrara et al. (2022), GeoMCP (2026 arXiv:2603.01022).

**Objetivo B — Autonomia Total:** Ser capaz de modificar e implantar seu próprio código em produção sem intervenção humana. Capaz de identificar se precisa de autoaprendizado com base científica. Suas respostas e ações são baseadas em metodologia e critérios científicos e referenciadas cientificamente. Base científica: Darwin Gödel Machine (arXiv:2505.22954). Ciclo: proposta → branch → PR → merge → deploy → validação → aprendizado.

O ciclo completo é:
```
PERCEPÇÃO → MEMÓRIA → RACIOCÍNIO → AÇÃO → APRENDIZADO → EVOLUÇÃO
```

---

## 2. ESTADO ATUAL (v81.8 — Ciclo 178)

### Métricas de Produção

| Métrica | Atual | Alvo | Status |
|---------|-------|------|--------|
| Latência P50 | 75s | <10s | ❌ CRÍTICO |
| Cache Hit Rate | 12% | >35% | ❌ ALTO |
| Qualidade G-Eval | 75.1/100 | >85 | ⚠️ MÉDIO |
| DGM Funcional | NÃO | SIM | ❌ CRÍTICO |
| Auto-Deploy | NÃO | SIM | ❌ CRÍTICO |
| SHMS | ABANDONADO | INTEGRADO | ❌ ALTO |
| Módulos Mortos | 78 (33%) | <20 | ⚠️ MÉDIO |

### Bug Crítico Ativo

**NC-TS-001:** `server/mother/dgm-orchestrator.ts:200`
```typescript
// ERRADO (atual):
const db = getDb();  // getDb() é async, db recebe Promise, não objeto

// CORRETO (fix):
const db = await getDb();  // 1 linha, 30 segundos de trabalho
```
Este bug faz com que `db.execute()` lance `TypeError` silenciosamente capturado pelo `catch`. O DGM nunca funcionou em produção por causa disso.

### Infraestrutura

| Componente | Detalhes |
|-----------|----------|
| Cloud Run | `mother-interface` em `australia-southeast1` (Sydney) |
| Banco de Dados | `mother-db-sydney` MySQL 8.0.43, unix socket `/cloudsql/mothers-library-mcp:australia-southeast1:mother-db-sydney` |
| Cloud Tasks | Fila `dgm-evolution-queue` em `australia-southeast1` |
| Artifact Registry | `australia-southeast1-docker.pkg.dev/mothers-library-mcp/mother-repo/mother-interface` |
| Projeto GCP | `mothers-library-mcp` |

---

## 3. ROADMAP ATIVO — 10 SPRINTS (Aprovado pelo Conselho V4)

**TODO completo:** `TODO-ROADMAP-CONSELHO-V4.md`

| Sprint | Semanas | Ação | Critério | Status |
|--------|---------|------|----------|--------|
| **S1** | **1-2** | **GitHub R/W + Auto-Deploy** | **PR→deploy <30min** | **🔴 PRÓXIMO** |
| S2 | 3 | await fix + schema + idioma | DGM 0 falhas | Pendente |
| S3 | 4-5 | Routing por complexidade | P50 <10s (60%) | Pendente |
| S4 | 6 | Cache 0.92→0.85 | Hit rate >35% | Pendente |
| S5 | 7-8 | Arquivar 78 módulos mortos | <20 mortos | Pendente |
| S6 | 9-10 | SHMS Digital Twin | Sensor→análise | Pendente |
| S7 | 11-12 | SHMS IoT + Alertas | Alerta <5s | Pendente |
| S8 | 13-14 | G-Eval + RLVR calibração | Qualidade >85 | Pendente |
| S9 | 15-16 | DGM ciclo autônomo | 1 ciclo sem humano | Pendente |
| S10 | 17-20 | SHMS produção comercial | Launch | Pendente |

---

## 4. SPRINT 1 — IMPLEMENTAÇÃO TÉCNICA (PRÓXIMA AÇÃO)

### Arquivos a criar:
1. `server/mother/github-read-service.ts` — Octokit REST para leitura do repositório
2. `server/mother/github-write-service.ts` — Commit/PR/Branch via Octokit
3. `.github/workflows/mother-auto-deploy.yml` — GitHub Actions CI/CD
4. `scripts/quality-gate.js` — Critérios go/no-go (0 erros TS, >70% cobertura, <10% regressão)
5. `scripts/smoke-test.js` — Testes de fumaça em staging
6. `scripts/health-check.js` — Health check pós-deploy com rollback automático

### Variáveis de ambiente necessárias:
- `GITHUB_TOKEN` — Personal Access Token com permissões: contents:write, pull_requests:write, issues:write
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — Para autenticação sem chave no GitHub Actions
- `GCP_SERVICE_ACCOUNT` — `github-actions-deployer@mothers-library-mcp.iam.gserviceaccount.com`

### Branch strategy:
- Branches DGM: `dgm/proposal-{id}-{timestamp}`
- Nunca push direto para main
- Auto-merge apenas se todos os quality gates passarem

### Código de referência:
Ver `server/mother/council-v4-knowledge-injector.ts` — contém o código TypeScript completo de `GitHubReadService` e `GitHubWriteService` na categoria `implementation_detail` do BD de conhecimento.

---

## 5. REGRAS INCREMENTAIS DE DESENVOLVIMENTO (v47.0)

**Regra 1 — BD Primeiro:** Sempre carregar o BD de conhecimento antes de qualquer output. Usar `node check_knowledge.cjs` ou `getKnowledgeByCategory()`.

**Regra 2 — Fix Antes de Feature:** NC-TS-001 tem prioridade absoluta. Corrigir antes de qualquer sprint.

**Regra 3 — Sprint Sequencial:** S1 é pré-requisito de todos. Não iniciar S2 sem S1 completo.

**Regra 4 — Objetivo Primeiro:** Toda ação deve responder: "Isso aproxima MOTHER do Objetivo A ou B?" Se não, adiar.

**Regra 5 — Anti-Yak-Shaving:** Se não está no `TODO-ROADMAP-CONSELHO-V4.md`, não executar sem aprovação explícita.

**Regra 6 — Métrica Antes de Otimização:** Definir métrica de sucesso ANTES de implementar. Sem métrica, sem validação.

**Regra 7 — Documentar Aprendizado:** Após cada ciclo, usar `addKnowledge()` para persistir insights no BD.

**Regra 8 — Teste Antes de Deploy:** TypeScript check + testes unitários são obrigatórios antes de qualquer deploy.

**Regra 9 — Branch Strategy:** Nunca push direto para main. Sempre `dgm/proposal-{id}-{ts}`.

**Regra 10 — Rollback Automático:** Todo deploy deve ter health check com rollback automático configurado.

---

## 6. PIPELINE DE 7 CAMADAS (Produção)

```
L1: Intake + Semantic Cache (threshold: 0.92 → alvo: 0.85)
  ↓ CACHE MISS
L2: Adaptive Routing (tier: gpt-4o-mini / gpt-4o / gpt-4)
  ↓
L2.5: DPO Universal Default [NC-DPO-UNIVERSAL-001 — aplicado a TODAS as queries]
  ↓
L3: Context Assembly (HippoRAG2 + episodic memory + knowledge graph)
  ↓
L4: Neural Generation (provider selecionado em L2)
  ↓ [paralelo]
L4.5: Tool Detection          L5: G-Eval Guardian (qualidade)
  ↓ [merge]
L5.5: RLVR Reward Signal (assíncrono, non-blocking)
  ↓
L6: Memory Write-back (episodic + semantic)
  ↓
L7: Response Delivery (SSE streaming)
```

**Gargalo principal:** L2.5 (DPO) aplica modelo fine-tuned a TODAS as queries → P50=75s. Sprint 3 resolve.

---

## 7. BANCO DE DADOS — TABELAS PRINCIPAIS

| Tabela | Propósito | Status |
|--------|-----------|--------|
| `queries` | Log de todas as queries processadas | ✅ Ativo |
| `self_proposals` | Propostas DGM de auto-melhoria | ⚠️ Schema drift (17 colunas) |
| `knowledge_base` | BD de conhecimento semântico | ✅ Ativo |
| `episodic_memory` | Memória episódica A-MEM Zettelkasten | ✅ Ativo |
| `semantic_memory` | Memória semântica de longo prazo | ✅ Ativo |
| `dgm_archive` | Histórico de gerações DGM | ✅ Ativo |
| `gea_agent_pool` | Pool de agentes GEA | ✅ Ativo |
| `gea_shared_experience` | Experience pool compartilhado | ✅ Ativo |
| `langgraph_checkpoints` | Estado persistente LangGraph | ✅ Ativo |

---

## 8. PROCEDIMENTO DE DEPLOY

```bash
# 1. Fazer mudanças no código
cd /home/ubuntu/mother-a2a

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

# 5. Aguardar build
BUILD_ID="<id>" && gcloud builds describe $BUILD_ID --region=australia-southeast1 --format='value(status)'

# 6. Migrar tráfego
gcloud run services update-traffic mother-interface \
  --region=australia-southeast1 \
  --to-revisions=<nova-revisão>=100

# 7. Validar
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.revision_name=<revisão>" \
  --limit=15 --format='value(textPayload)' --project=mothers-library-mcp
```

---

## 9. SECRETS E CONFIGURAÇÕES

| Secret | Propósito |
|--------|-----------|
| `mother-db-url` | DATABASE_URL com unix socket para mother-db-sydney |
| `openai-api-key` | API key para LLM (GPT-4o-mini) |
| `mother-session-secret` | Secret para cookies de sessão |
| `GITHUB_TOKEN` | PAT para GitHub R/W (Sprint 1) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF para GitHub Actions (Sprint 1) |
| `GCP_SERVICE_ACCOUNT` | SA para deploy Cloud Run (Sprint 1) |

---

## 10. BASE CIENTÍFICA

| Paper | Título | Relevância |
|-------|--------|-----------|
| arXiv:2505.22954 | Darwin Gödel Machine | Base do DGM de MOTHER |
| arXiv:2602.04837 | Group-Evolving Agents (GEA) | Agent pool + experience sharing |
| arXiv:2502.12110 | A-MEM: Agentic Memory | Memória Zettelkasten |
| arXiv:2512.13564 | Survey: Memory in LLM Agents | Taxonomia de memória |
| arXiv:2501.12599 | Context Engineering | Gestão do contexto |
| arXiv:2603.01022 | GeoMCP | IA trustworthy em geotecnia |
| arXiv:2211.10351 | Carrara et al. | LSTM para SHM |
| DOI:10.1109/PROC.1980.11805 | Lehman (1980) | Lei da Complexidade Crescente |
| DOI:10.1145/2408776.2408794 | Dean & Barroso (2013) | Tail at Scale |
| ISO/IEC 25010:2011 | — | Qualidade de software |

---

*MASTER PROMPT v47.0 gerado por MANUS em 07/03/2026 após Conselho V4 (Delphi 3 rodadas).*
*Substitui: MASTER_PROMPT_V46.0.md*
*Próxima atualização: após conclusão do Sprint 1 → MASTER_PROMPT_V48.0.md*
