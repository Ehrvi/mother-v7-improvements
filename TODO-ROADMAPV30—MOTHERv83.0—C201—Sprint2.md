# TODO-ROADMAP V30 — MOTHER v83.0 — CICLO C201 — SPRINT 2
## Conselho dos 6 IAs | Protocolo Delphi + MAD | Kendall W = 0.82
## Data: 2026-03-09 | Ciclo: 201 | Fase: Sprint 2 — Ativar Memória Cognitiva

**Base Científica:**
- HippoRAG2 (Gutierrez et al., arXiv:2502.14802, ICML 2025) — non-parametric continual learning
- Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal reinforcement learning
- MemGPT (Packer et al., arXiv:2310.08560, NeurIPS 2023) — hierarchical memory management
- A-MEM (Xu et al., arXiv:2502.12110, 2025) — agentic memory for LLM agents
- G-EVAL (Liu et al., arXiv:2303.16634, 2023) — LLM-as-judge evaluation

---

## STATUS SPRINT 1 (C200) — CONCLUÍDO ✅
**Score:** 90.1/100 → **91.0/100** (+0.9 pontos)
**Entregáveis:** 12 arquivos criados, 3 NCs corrigidas, deploy Cloud Run `00712-2jf` ativo
**BD:** 7.444 registros (17 entradas C200 injetadas)

---

## SPRINT 2 — C201 (Semana 2): Ativar Memória Cognitiva
**Objetivo:** Fechar o ciclo cognitivo MEMÓRIA → APRENDIZADO
**Critério de Sucesso:** ≥50 entradas episódicas após 10 queries, recall@10 ≥80%, cache hit rate ≥25%

### C201-1: Ativar Escrita Episódica (NC-MEM-001 CRÍTICA)
- [ ] C201-1a: Criar `server/mother/amem-agent.ts` — A-MEM agent com escrita episódica após cada resposta
- [ ] C201-1b: Atualizar Layer 6 em `server/mother/core-orchestrator.ts` — ativar write-back episódico real
- [ ] C201-1c: Verificar `server/mother/episodic-memory.ts` — confirmar que storeEpisodicMemory funciona

### C201-2: Ativar HippoRAG2 Retrieval Obrigatório (NC-MEM-002 ALTA)
- [ ] C201-2a: Atualizar `fetchEpisodicContext` em `core-orchestrator.ts` — usar `episodic-memory.ts` em vez de `embeddings.ts`
- [ ] C201-2b: Ativar HippoRAG2 para TIER_1 também (não apenas TIER_2+)
- [ ] C201-2c: Criar `server/mother/hipporag2-indexer-c201.ts` — re-indexar com text-embedding-3-large + papers C200-C201

### C201-3: Reduzir Threshold Semantic Cache (NC-MEM-003 MÉDIA)
- [ ] C201-3a: Atualizar `SIMILARITY_THRESHOLD` em `server/mother/semantic-cache.ts` de 0.82 → 0.78 (Conselho: ≥25% hit rate)

### C201-4: Criar Reflexion Engine (NC-MEM-004 ALTA)
- [ ] C201-4a: Criar `server/mother/reflexion-engine.ts` — análise de padrões de falha + verbal reinforcement
- [ ] C201-4b: Integrar Reflexion no Layer 7 (DGM Meta-Observation) de `core-orchestrator.ts`

### C201-5: Long-form Exporter (Feature — Sprint 4 antecipado)
- [ ] C201-5a: Criar `server/mother/long-form-exporter.ts` — exportação MD + LaTeX + PDF
- [ ] C201-5b: Conectar exporter no `long-form-routes.ts` — endpoint `/api/long-form/{jobId}/export`

### C201-6: Injeção de Conhecimento no BD
- [ ] C201-6a: Script `inject-knowledge-c201-sprint2.cjs` com 20+ entradas de conhecimento do Sprint 2
- [ ] C201-6b: Executar injeção no BD Cloud SQL `mother_v7_prod`

### C201-7: AWAKE V282
- [ ] C201-7a: Criar `AWAKEV282—MOTHERv83.0—Ciclo201—2026-03-09.md` com regras R48-R52
- [ ] C201-7b: Atualizar R26 (passo 20 — verificar memória episódica ativa)
- [ ] C201-7c: Upload para Google Drive `MOTHER-v7.0/`

### C201-8: Commit + Deploy
- [ ] C201-8a: `git add -A && git commit -m "feat(c201-sprint2): Ativar Memória Cognitiva — HippoRAG2 + Reflexion + episodic write-back"`
- [ ] C201-8b: `gcloud builds submit` — Cloud Build deploy produção

---

## SPRINTS FUTUROS (Referência — Conselho dos 6 IAs)

### SPRINT 3 (C202): DGM Loop Completo
- [ ] Conectar pipeline DGM completo (dgm-loop-activator.ts)
- [ ] Adicionar failure_reason na tabela dgm_proposals
- [ ] 1 ciclo DGM completo com fitness > 0, sem crashes
**Critério:** 1 ciclo DGM completo executado com sucesso

### SPRINT 4 (C203): Long-form Output Completo
- [ ] Integrar long-form com core-orchestrator.ts
- [ ] LaTeX + PDF export completo
**Critério:** Gerar 20 páginas com 1 prompt em <5 minutos

### SPRINT 5 (C204): UX/UI Gen 4
- [ ] ExpandableSidebar.tsx (140px ↔ 280px)
- [ ] MotherMonitor.tsx (dashboard SSE)
- [ ] DGMPanel.tsx
**Critério:** UX ≥65/100

### SPRINTS 6-10 (C205-C209): Multi-Provider, DGM Validação, LaTeX, Monitor, Feedback Cognitivo
- [ ] Multi-Provider + CI/CD (S6)
- [ ] DGM Validação extensiva (S7)
- [ ] LaTeX Editor completo (S8)
- [ ] Monitor MOTHER Computer (S9)
- [ ] Feedback Cognitivo Real (S10)

---

## INDICADORES DE PROGRESSO

| Indicador | C200 (S1) | C201 (S2) Meta | Objetivo Final |
|-----------|-----------|----------------|----------------|
| Score Geral | 91.0/100 | **92.0/100** | 95/100 |
| Memória Episódica | 0 entradas | **≥50 entradas** | ≥500 entradas |
| HippoRAG2 recall@10 | N/A | **≥80%** | ≥90% |
| Cache hit rate | ~15% | **≥25%** | ≥40% |
| DGM ciclos/semana | 0 | 0 (S3) | ≥3 |
| UX Score | 43/100 | 43/100 (S5) | ≥85/100 |

---

**MOTHER v83.0 — Ciclo 201 — Sprint 2 — Memória Cognitiva**
**Próximo após C201:** Sprint 3 (C202) — DGM Loop Completo
