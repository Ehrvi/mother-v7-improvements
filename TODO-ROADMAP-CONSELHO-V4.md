# TODO — ROADMAP CONSELHO V4 | MOTHER v81.8 → v82.x
## Aprovado pelo Conselho dos 6 IAs | Método Delphi | 07/03/2026
### Base científica: Darwin Gödel Machine (arXiv:2505.22954) | Lei de Lehman (1980) | ISO/IEC 25010:2011

---

> **REGRA MANDATÓRIA:** Antes de iniciar qualquer sprint, o agente de manutenção DEVE:
> 1. Ler este arquivo TODO completo
> 2. Executar `check_knowledge.cjs` para carregar o BD de conhecimento
> 3. Ler o AWAKE mais recente em `/home/ubuntu/council/`
> 4. Verificar o estado de produção via `curl https://mother-interface-*.run.app/health`

---

## SPRINT 1 — AUTONOMIA DE CÓDIGO (Semanas 1-2) [MANDATÓRIO — BLOQUEANTE]
> **Critério de sucesso:** PR criado por MOTHER → deploy em produção em <30 minutos
> **Dependências:** GITHUB_TOKEN, GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT

### 3.1 — GitHub Read Service
- [ ] Criar `server/mother/github-read-service.ts` com Octokit REST
  - [ ] Método `readFile(path, branch)` — GET /repos/{owner}/{repo}/contents/{path}
  - [ ] Método `listDirectory(path)` — lista arquivos de um diretório
  - [ ] Método `getCommitHistory(path, limit)` — GET /repos/{owner}/{repo}/commits
  - [ ] Método `getOpenIssues()` — GET /repos/{owner}/{repo}/issues
  - [ ] Método `compareBranches(base, head)` — GET /repos/{owner}/{repo}/compare
  - [ ] Método `searchCode(query)` — GET /search/code
  - [ ] Testes unitários para GitHubReadService
- [ ] Adicionar `@octokit/rest` e `@octokit/graphql` ao package.json
- [ ] Adicionar `GITHUB_TOKEN` ao Secret Manager (GCP) e env.ts
- [ ] Verificar que GITHUB_TOKEN tem permissões: contents:read, issues:read, pull_requests:read

### 3.2 — GitHub Write Service
- [ ] Criar `server/mother/github-write-service.ts` com Octokit REST
  - [ ] Método `createProposalBranch(proposalId)` — cria branch `dgm/proposal-{id}-{ts}`
  - [ ] Método `commitFile(branch, path, content, message)` — PUT /repos/{owner}/{repo}/contents/{path}
  - [ ] Método `createPR(branch, title, body)` — POST /repos/{owner}/{repo}/pulls
  - [ ] Método `createIssue(title, body, labels)` — POST /repos/{owner}/{repo}/issues
  - [ ] Método `addPRComment(prNumber, comment)` — POST /repos/{owner}/{repo}/issues/{number}/comments
  - [ ] Método `mergePR(prNumber)` — PUT /repos/{owner}/{repo}/pulls/{number}/merge
  - [ ] Testes unitários para GitHubWriteService
- [ ] Verificar que GITHUB_TOKEN tem permissões: contents:write, pull_requests:write, issues:write
- [ ] Implementar rate limiting (GitHub API: 5000 req/hora para PAT)

### 3.3 — Cloud Run Auto-Deploy via GitHub Actions
- [ ] Criar `.github/workflows/mother-auto-deploy.yml`
  - [ ] Trigger: `pull_request` closed + merged + branch starts with `dgm/`
  - [ ] Step: Authenticate to GCP via Workload Identity Federation
  - [ ] Step: TypeScript check (`npx tsc --noEmit`) — BLOQUEANTE se falhar
  - [ ] Step: Testes unitários (`pnpm test`) — BLOQUEANTE se falhar
  - [ ] Step: Quality gate (`node scripts/quality-gate.js`) — BLOQUEANTE se falhar
  - [ ] Step: Deploy staging (`google-github-actions/deploy-cloudrun@v2` com `--tag=staging`)
  - [ ] Step: Smoke tests em staging (`node scripts/smoke-test.js $STAGING_URL`)
  - [ ] Step: Deploy produção (`--traffic=100`)
  - [ ] Step: Health check pós-deploy (`node scripts/health-check.js $PROD_URL`)
  - [ ] Step: Rollback automático se health check falhar
- [ ] Criar `scripts/quality-gate.js`
  - [ ] Verificar 0 erros TypeScript
  - [ ] Verificar cobertura de testes >70%
  - [ ] Verificar latência P50 não regrediu >10%
  - [ ] Verificar qualidade G-Eval >70/100
  - [ ] Verificar que não adicionou módulos mortos
- [ ] Criar `scripts/smoke-test.js`
  - [ ] POST /api/mother com query simples → resposta em <30s
  - [ ] GET /health → status 200
  - [ ] GET /api/metrics → dados válidos
- [ ] Criar `scripts/health-check.js`
  - [ ] 3 tentativas com 30s entre cada
  - [ ] Rollback automático via `gcloud run services update-traffic`
- [ ] Configurar GCP: Workload Identity Federation para GitHub Actions
  - [ ] Criar service account `github-actions-deployer@mothers-library-mcp.iam.gserviceaccount.com`
  - [ ] Permissões: Cloud Run Admin, Cloud Build Editor, Storage Object Admin
  - [ ] Criar Workload Identity Pool e Provider
  - [ ] Adicionar secrets ao repositório GitHub: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
- [ ] Integrar GitHubWriteService no DGM orchestrator
  - [ ] Após proposta aprovada: criar branch + commit + PR automaticamente
  - [ ] Registrar PR number em `self_proposals` tabela
- [ ] Teste end-to-end: MOTHER cria proposta → branch → PR → merge → deploy → health check

---

## SPRINT 2 — FIX CRÍTICO (Semana 3)
> **Critério de sucesso:** DGM com 0 falhas repetidas, schema sincronizado, respostas em português

- [ ] **NC-TS-001 (CRÍTICO):** Corrigir `await` ausente em `dgm-orchestrator.ts:200`
  - [ ] `const db = getDb()` → `const db = await getDb()`
  - [ ] Verificar todos os outros usos de `getDb()` no arquivo
  - [ ] Adicionar teste de integração assíncrono para `getDb()`
- [ ] **NC-SCHEMA-DRIFT-002:** Adicionar 17 colunas ausentes ao schema Drizzle de `selfProposals`
  - [ ] `proposed_changes: text('proposed_changes')`
  - [ ] `validation_score: decimal('validation_score', { precision: 5, scale: 2 })`
  - [ ] `test_results: json('test_results')`
  - [ ] `benchmark_before: json('benchmark_before')`
  - [ ] `benchmark_after: json('benchmark_after')`
  - [ ] `deployment_status: varchar('deployment_status', { length: 50 })`
  - [ ] `rollback_reason: text('rollback_reason')`
  - [ ] `github_branch: varchar('github_branch', { length: 200 })`
  - [ ] `github_pr_number: int('github_pr_number')`
  - [ ] `github_pr_url: text('github_pr_url')`
  - [ ] Adicionar enum `status` com valores: 'pending', 'approved', 'rejected', 'deployed', 'failed', 'rolled_back'
  - [ ] Executar migração Drizzle: `pnpm run db:push`
- [ ] **NC-LANG-001:** Adicionar instrução de idioma no `buildSystemPrompt()`
  - [ ] Detectar idioma da query (usar `franc` ou regex simples)
  - [ ] Adicionar ao system prompt: "Responda SEMPRE no mesmo idioma da query do usuário."
- [ ] Verificar que DGM agora persiste propostas corretamente no banco
- [ ] Testar: 10 queries em português → 10 respostas em português

---

## SPRINT 3 — LATÊNCIA (Semanas 4-5)
> **Critério de sucesso:** P50 <10s para 60% das queries (queries simples)

- [ ] Implementar classificador de complexidade em `core-orchestrator.ts`
  - [ ] Enum `QueryComplexity { SIMPLE, MEDIUM, COMPLEX }`
  - [ ] Critérios SIMPLE: <20 tokens, sem código, sem análise profunda
  - [ ] Critérios MEDIUM: 20-100 tokens, ou contém código
  - [ ] Critérios COMPLEX: >100 tokens, ou análise comparativa, ou domínio técnico
- [ ] Implementar routing por complexidade na L2
  - [ ] SIMPLE (60%): `gpt-4o-mini` direto → P50 alvo ~3s
  - [ ] MEDIUM (25%): `gpt-4o` → P50 alvo ~8s
  - [ ] COMPLEX (15%): DPO + `ft:gpt-4.1-mini` → P50 alvo ~75s (aceitável)
- [ ] Desativar DPO para queries SIMPLE e MEDIUM
- [ ] Adicionar métrica `query_complexity` ao log de queries
- [ ] Benchmark A/B: 100 queries antes/depois do routing
- [ ] Verificar que qualidade não regrediu para queries COMPLEX

---

## SPRINT 4 — CACHE (Semana 6)
> **Critério de sucesso:** Cache hit rate >35%

- [ ] Alterar `CACHE_THRESHOLD` de 0.92 para 0.85 em `semantic-cache.ts`
- [ ] Implementar warm cache na inicialização
  - [ ] Identificar top 50 queries mais frequentes do BD
  - [ ] Pre-carregar embeddings e respostas no startup
- [ ] Implementar cache TTL diferenciado por categoria
  - [ ] Queries factuais: TTL 7 dias
  - [ ] Queries de código: TTL 1 dia
  - [ ] Queries de análise: TTL 12 horas
- [ ] Adicionar métrica `cache_hit_rate` ao dashboard
- [ ] Medir hit rate após 48h em produção

---

## SPRINT 5 — LIMPEZA (Semanas 7-8)
> **Critério de sucesso:** <20 módulos mortos, código morto documentado

- [ ] Executar análise BFS de grafo de importações (script Python do C176)
- [ ] Criar diretório `/archive/` no repositório
- [ ] Arquivar módulos SHMS SaaS (12 módulos) → `/archive/shms-saas/`
  - [ ] `shms-demo-alert.ts`, `shms-demo-daq.ts`, `shms-demo-billing.ts`
  - [ ] `shms-client-portal.ts`, `shms-client-impl.ts`, `shms-compliance-engine.ts`
  - [ ] `shms-integration-engine.ts`, `shms-multi-region-display.ts`
  - [ ] Criar README em `/archive/shms-saas/README.md` com: origem, motivo, quando se perdeu, importância, se vale restaurar
- [ ] Arquivar módulos Omniscient (10 módulos) → `/archive/omniscient/`
- [ ] Arquivar módulos Ferramentas não usadas (19 módulos) → `/archive/tools/`
- [ ] Arquivar módulos Agentes/UI (8 módulos) → `/archive/agents-ui/`
- [ ] Arquivar módulos Memória/Misc (7 módulos) → `/archive/memory-misc/`
- [ ] Manter módulos Digital Twin para Sprint 6 (NÃO arquivar)
- [ ] Atualizar fluxograma de produção após limpeza

---

## SPRINT 6 — SHMS FASE 1 (Semanas 9-10)
> **Critério de sucesso:** Dados de sensor → análise MOTHER em <5s

- [ ] Restaurar `timescale-connector.ts` (conexão TimescaleDB)
  - [ ] Verificar se TimescaleDB ainda está configurado no GCP
  - [ ] Atualizar credenciais se necessário
  - [ ] Testes de conexão
- [ ] Restaurar `mqtt-digital-twin-bridge.ts` (recepção MQTT)
  - [ ] Configurar broker MQTT (Cloud IoT Core ou Mosquitto)
  - [ ] Testes com dados simulados de sensor
- [ ] Restaurar `digital-twin.ts` (modelo digital da estrutura)
  - [ ] Atualizar para API atual de MOTHER
  - [ ] Integrar com TimescaleDB
- [ ] Restaurar `lstm-predictor.ts` (previsão de anomalias)
  - [ ] Verificar se modelo LSTM ainda existe
  - [ ] Re-treinar se necessário com dados históricos
- [ ] Criar endpoint `/api/shms/analyze` em `production-entry.ts`
- [ ] Criar endpoint `/api/shms/structures` — lista estruturas monitoradas
- [ ] Criar endpoint `/api/shms/alerts` — alertas ativos
- [ ] Teste end-to-end: dados de sensor simulados → análise MOTHER → resposta

---

## SPRINT 7 — SHMS FASE 2 (Semanas 11-12)
> **Critério de sucesso:** Alerta gerado em <5s após anomalia detectada

- [ ] Integrar sensores IoT reais via MQTT
- [ ] Implementar sistema de alertas por email/SMS
- [ ] Criar dashboard de monitoramento em tempo real
- [ ] Implementar thresholds de alerta por tipo de sensor
- [ ] Documentar API SHMS para clientes

---

## SPRINT 8 — QUALIDADE (Semanas 13-14)
> **Critério de sucesso:** Qualidade G-Eval >85/100

- [ ] Calibrar G-Eval para domínio geotécnico
  - [ ] Criar conjunto de referência com 50 pares query/resposta geotécnicos
  - [ ] Ajustar pesos dos critérios para domínio técnico
- [ ] Ajustar RLVR para recompensar respostas técnicas precisas
- [ ] Implementar feedback loop: qualidade baixa → DPO fine-tuning automático
- [ ] Benchmark: 100 queries antes/depois da calibração

---

## SPRINT 9 — DGM CICLO COMPLETO (Semanas 15-16)
> **Critério de sucesso:** 1 ciclo completo autônomo sem intervenção humana

- [ ] Verificar que Sprint 1 (auto-deploy) está funcionando
- [ ] Verificar que Sprint 2 (await fix) está funcionando
- [ ] Executar ciclo DGM completo: proposta → branch → PR → merge → deploy → validação
- [ ] Documentar o ciclo para referência futura
- [ ] Ajustar critérios de qualidade do DGM com base nos resultados

---

## SPRINT 10 — PRODUÇÃO SHMS (Semanas 17-20)
> **Critério de sucesso:** SHMS pronto para clientes pagantes

- [ ] Critérios de prontidão:
  - [ ] P50 <10s ✓ (Sprint 3)
  - [ ] Qualidade >85/100 ✓ (Sprint 8)
  - [ ] DGM funcional ✓ (Sprint 9)
  - [ ] SHMS integrado ✓ (Sprint 6-7)
  - [ ] 0 NCs críticas ✓ (Sprint 2)
  - [ ] Auto-deploy funcionando ✓ (Sprint 1)
- [ ] Documentação completa da API SHMS
- [ ] Plano de pricing e onboarding
- [ ] Primeiro cliente piloto
- [ ] Monitoramento de SLA

---

## BUGS CRÍTICOS (Resolver IMEDIATAMENTE, antes de qualquer sprint)

- [ ] **BUG-001 (NC-TS-001):** `await getDb()` em `dgm-orchestrator.ts:200` — 1 linha, 30 segundos
- [ ] **BUG-002 (NC-LANG-001):** Instrução de idioma no system prompt — 1 linha

---

## MÉTRICAS DE ACOMPANHAMENTO

| Métrica | Atual | S1 | S2 | S3 | S4 | S6 | S8 | S10 |
|---------|-------|----|----|----|----|----|----|-----|
| Latência P50 | 75s | 75s | 75s | <10s | <10s | <10s | <10s | <10s |
| Cache Hit Rate | 12% | 12% | 12% | 12% | >35% | >35% | >35% | >40% |
| Qualidade | 75.1 | 75.1 | 75.1 | 75.1 | 75.1 | 75.1 | >85 | >85 |
| DGM Funcional | Não | Não | Sim | Sim | Sim | Sim | Sim | Sim |
| Auto-Deploy | Não | Sim | Sim | Sim | Sim | Sim | Sim | Sim |
| SHMS | Não | Não | Não | Não | Não | Sim | Sim | Sim |
| Módulos Mortos | 78 | 78 | 78 | 78 | 78 | <20 | <20 | <20 |

---

## REFERÊNCIAS CIENTÍFICAS

1. Zhang et al. (2025) arXiv:2505.22954 — Darwin Gödel Machine: base do DGM de MOTHER
2. Lehman (1980) DOI:10.1109/PROC.1980.11805 — Lei da Complexidade Crescente: explica os 78 módulos mortos
3. Sun et al. (2025) DOI:10.1145/3777730.3777858 — DL para SHM: base científica do SHMS
4. Carrara et al. (2022) arXiv:2211.10351 — Deep learning para SHM com LSTM
5. Tang et al. (2025) DOI:10.1038/s41467-025-63913-1 — Riscos de IA autônoma: guia o design do auto-deploy
6. Dean & Barroso (2013) DOI:10.1145/2408776.2408794 — Tail at Scale: explica P90=166s
7. GeoMCP (2026) arXiv:2603.01022 — IA em geotecnia: relevante para SHMS
8. Google Cloud (2024) — GitHub Actions + Cloud Run: arquitetura do auto-deploy
9. ISO/IEC 25010:2011 — Modelo de qualidade de software: base da auditoria C176

---

*Gerado por MANUS em 07/03/2026 após Conselho V4 (Delphi 3 rodadas).*
*Última atualização: Ciclo 177 | Versão MOTHER: v81.8*
