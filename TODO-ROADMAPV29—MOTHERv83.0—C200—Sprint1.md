# TODO-ROADMAP V29 — MOTHER v83.0 — CICLO C200 — SPRINT 1
## Conselho dos 6 IAs | Protocolo Delphi + MAD | Kendall W = 0.82
## Data: 2026-03-08 | Ciclo: 200 | Fase: Sprint 1 — Limpeza Técnica + Quick Wins

**Base Científica:** Martin (2008) Clean Code | ISO/IEC 25010:2011 | OWASP A01:2021 | arXiv:2505.22954

---

## SPRINT 1 — C200 (Semana 1): Limpeza Técnica + Quick Wins
**Objetivo:** Eliminar dívida técnica crítica, criar 4 arquivos faltantes (NC-ARCH-005), resolver NCs de alta visibilidade
**Critério de Sucesso:** `tsc --noEmit` sem erros, versão dinâmica no título, 0 conflitos de migração

### C200-0: 4 Arquivos Faltantes DGM (NC-ARCH-005 CRÍTICA)
- [ ] C200-0a: `server/dgm/sandbox-executor.ts` — execução isolada de código (tmpdir + timeout + cleanup)
- [ ] C200-0b: `server/dgm/cryptographic-proof.ts` — prova SHA256 de autonomia DGM
- [ ] C200-0c: `server/dgm/e2b-sandbox.ts` — wrapper E2B com fallback local
- [ ] C200-0d: `server/mother/curriculum-v2.ts` — curriculum learning v2 com 10+ tarefas SHMS

### C200-1: Fitness Evaluator Calibrado (NC-DGM-003 MÉDIA)
- [ ] C200-1a: `server/dgm/fitness-evaluator.ts` — avaliação de fitness calibrada (latência 30%, qualidade 35%, código 20%, testes 15%)

### C200-2: Long-form Output (Feature — Sprint 4 antecipado por consenso)
- [ ] C200-2a: `server/mother/long-form-generator.ts` — gerador hierárquico de documentos longos (até 60 páginas)
- [ ] C200-2b: `server/mother/long-form-queue.ts` — fila assíncrona de jobs com progresso
- [ ] C200-2c: `server/routes/long-form-routes.ts` — REST + SSE endpoints para geração

### C200-3: UX/UI Quick Wins (NC-UI-001 ALTA)
- [ ] C200-3a: `client/src/components/VersionBadge.tsx` — badge de versão dinâmica via /api/health
- [ ] C200-3b: `client/src/components/SessionHistory.tsx` — histórico de sessões com busca e filtros
- [ ] C200-3c: `server/routes/monitor-routes.ts` — SSE endpoint de monitoramento em tempo real
- [ ] C200-3d: `server/routes/health.ts` — health check endpoint com versão dinâmica

### C200-4: Correções de NCs
- [ ] C200-4a: NC-UI-001 — versão dinâmica no client/index.html (remover v82.4 hardcoded)
- [ ] C200-4b: NC-DB-001 — script de correção de migrações duplicadas
- [ ] C200-4c: NC-ARCH-001 — iniciar refatoração God Object server/index.ts (módulo app-initializer)
- [ ] C200-4d: `.bak` adicionado ao `.gitignore`

### C200-5: Injeção de Conhecimento no BD
- [ ] C200-5a: Script `inject-knowledge-c200-sprint1.cjs` com 25+ entradas de conhecimento do Sprint 1
- [ ] C200-5b: Executar injeção no BD Cloud SQL `mother_v7_prod`

### C200-6: AWAKE V281
- [ ] C200-6a: Criar `AWAKEV281—MOTHERv83.0—Ciclo200—2026-03-08.md` com regras incrementais R43+
- [ ] C200-6b: Atualizar R26 (seção de inicialização do agente) com instrução de carregar BD antes do output
- [ ] C200-6c: Upload para Google Drive `MOTHER-v7.0/`

### C200-7: Commit + Deploy
- [ ] C200-7a: `git add -A && git commit -m "feat(c200): Sprint 1 — 4 DGM files + long-form + UX + NC fixes"`
- [ ] C200-7b: `git push origin main`
- [ ] C200-7c: Deploy Cloud Run `australia-southeast1` via `gcloud run deploy`

---

## SPRINTS FUTUROS (Referência — Conselho dos 6 IAs)

### SPRINT 2 (C201): Ativar Memória Cognitiva
- [ ] Ativar escrita episódica após cada resposta (server/mother/amem-agent.ts)
- [ ] Adicionar retrieval obrigatório antes de gerar resposta (server/mother/core-orchestrator.ts)
- [ ] Reduzir threshold de cache de 0.95 para 0.85 (server/mother/semantic-cache.ts)
- [ ] Re-indexar embeddings com text-embedding-3-large
- [ ] Ativar Reflexion para analisar padrões de falha

### SPRINT 3 (C202): DGM Loop Completo
- [ ] Conectar pipeline DGM completo (dgm-loop-activator.ts)
- [ ] Adicionar failure_reason na tabela dgm_proposals
- [ ] 1 ciclo DGM completo com fitness > 0

### SPRINT 4 (C203): UX/UI Gen 4 Completo
- [ ] ExpandableSidebar.tsx (140px ↔ 280px)
- [ ] MotherMonitor.tsx (dashboard SSE)
- [ ] DGMPanel.tsx (painel com failure_reason)

### SPRINT 5 (C204): Multi-Provider + CI/CD
- [ ] Routing para DeepSeek, Gemini, Claude, Mistral
- [ ] ≥50 testes unitários com Vitest
- [ ] Pipeline CI/CD com pnpm test obrigatório

### SPRINTS 6-10 (C205-C209): DGM Validação, LaTeX, Monitor, Feedback Cognitivo
- [ ] S6: DGM 10 ciclos/semana + rollback automático
- [ ] S7: LaTeX Editor integrado + exportação PDF
- [ ] S8: Monitor MOTHER Computer + Cloud Monitoring
- [ ] S9: Feedback Cognitivo Real (ciclo RESPOSTA → G-EVAL → MEMÓRIA → DGM)
- [ ] S10: SOTA — Score ≥90/100 em todas as dimensões

---

## ROADMAP DE INDICADORES

| Indicador | Atual (C199) | Meta S1 (C200) | Meta S3 (C202) | Meta S10 (C209) |
|-----------|-------------|----------------|----------------|-----------------|
| DGM Ciclos/semana | 0 | 0 | 1 | 10 |
| Memória Episódica (entradas) | 0 | 0 | 100 | 1000 |
| UX Score | 43 | 50 | 55 | 85 |
| Arquivos Mortos (%) | 41 | 35 | 25 | 5 |
| Testes em CI | 0 | 5 | 20 | 80 |
| Long-form (páginas max) | 3 | 20 | 40 | 60 |
| HippoRAG2 recall@10 | 0% | 0% | 85% | 95% |
| Score Geral | 90.1/100 | 91/100 | 93/100 | 97/100 |

---

*TODO-ROADMAP V29 | Ciclo C200 | Sprint 1 | 2026-03-08 | Conselho dos 6 IAs*
