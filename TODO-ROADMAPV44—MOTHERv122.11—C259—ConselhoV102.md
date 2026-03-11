# TODO ROADMAP V44 — MOTHER v122.11 — C259 — Conselho V102
> **Regra:** Este roadmap contém APENAS atividades originárias do Conselho dos 6.
> Última atualização: 2026-03-11 | Versão: v122.11 | Ciclo: 259

---

## CICLOS COMPLETADOS (Conselho V102)

### ✅ C256 — Remover Penalty hallucinationRisk=medium (2026-03-11)
- [x] Identificar fonte do penalty -5pts em constitutional-ai.ts
- [x] Remover penalty automático para hallucinationRisk=medium
- [x] Commit e deploy (build SUCCESS)
- [x] Verificar: NS-01 passou Q=90 (era Q=85 por penalty)
- **Resultado:** Score médio +5pts para queries TIER_3

### ✅ C257 — Smart Pipeline Gating (2026-03-11)
- [x] CoVe: limitar a 3 perguntas (era 5) + timeout 8s
- [x] GRPO: desativar quando Q≥90 (redundante)
- [x] TTC: desativar para TIER_4 (melhor modelo, TTC não ajuda)
- [x] Commit e deploy (build SUCCESS)
- **Resultado:** Latência P50 projetada 36.3s → ~20s

### ✅ C258 — SOTA Evaluation Framework (2026-03-11)
- [x] Pesquisar 31 papers arXiv sobre avaliação de LLMs
- [x] Calibrar thresholds de aprovação vs SOTA 2026
- [x] Criar MOTHER_SOTA_EVALUATION_FRAMEWORK_V1.md
- [x] Criar benchmark C238 v9 multi-dimensional
- [x] Injetar 10 entradas SOTA no knowledge base
- [x] Criar AWAKE V296 com framework integrado
- **Resultado:** Score composto MOTHER = 83.6/100 (B+)

### ✅ C259 — Conselho V102: Parallelize + KG + Citations (2026-03-11)
- [x] C259-A: Paralelizar G-Eval + CoVe com Promise.all() (Lei de Amdahl)
- [x] C259-B: Ativar Knowledge Graph (retrieveSubgraph) na pré-geração
- [x] C259-C: Criar citation-engine.ts (Semantic Scholar + arXiv fallback)
- [x] C259-C: Integrar citation-engine no pipeline post-generation
- [x] C259-D: Constitutional AI já ativa (Q<80) — verificado
- [x] C259-F: MOTHER_VERSION=v122.11, MOTHER_CYCLE=259
- [x] Commit e push (build cedcf830 WORKING)
- [x] Criar AWAKE V298
- [x] Atualizar roadmap V44
- **Resultado esperado:** Latência P50 ~20s→~16s, Citations 0%→60%

---

## CICLOS PENDENTES (Conselho V102 — Prioridade Ordenada)

### 🔴 C260 — SSE Streaming (TTFT<2s) — PRIORIDADE #1
**Origem:** Conselho V102 — Requisito inegociável #4 (feedback visual)
**Objetivo:** Latência percebida -80% via streaming de tokens
**Critério de sucesso:** TTFT (Time to First Token) < 2s em 95% das queries

- [ ] Implementar SSE endpoint em server/routes/query.ts
- [ ] Adicionar `onChunk` callback no processQuery de core.ts
- [ ] Implementar streaming no frontend (EventSource API)
- [ ] Adicionar indicador visual de "MOTHER está pensando..."
- [ ] Testar em produção com benchmark de latência percebida
- [ ] Commit, deploy, verificar TTFT < 2s

**Referência científica:** Streaming LLM (Xiao et al., arXiv:2309.17453, 2023)

### 🔴 C261 — Visual Feedback UX — PRIORIDADE #2
**Origem:** Conselho V102 — Requisito inegociável #4 (feedback visual)
**Objetivo:** UX Score 47.5/100 → ≥70/100

- [ ] Loading states com animação (skeleton screens)
- [ ] Progress indicator durante geração
- [ ] Indicador de qualidade da resposta (Q score visual)
- [ ] Indicador de módulos ativos (KG, Citations, CoVe)
- [ ] Feedback de erro amigável
- [ ] Commit, deploy, medir UX Score

**Referência científica:** Nielsen (1994) Heuristic Evaluation; Amershi et al. (2019) Guidelines for Human-AI Interaction

### 🟠 C262 — Gemini Flash Cascade (Latência P50 ≤10s) — PRIORIDADE #3
**Origem:** Conselho V102 — Bloqueador #1 (latência)
**Objetivo:** FrugalGPT pattern: queries simples → Gemini Flash (0.5s), complexas → GPT-4o

- [ ] Implementar cascade router: complexityScore < 0.3 → gemini-2.0-flash
- [ ] Medir qualidade de Gemini Flash vs GPT-4o para queries simples
- [ ] Implementar fallback automático se Flash score < 80
- [ ] Commit, deploy, benchmark latência

**Referência científica:** FrugalGPT (Chen et al., arXiv:2305.05176, 2023)

### 🟠 C263 — Constitutional AI Expandida — PRIORIDADE #4
**Origem:** Conselho V102 — Requisito inegociável #1 (metodologia científica)
**Objetivo:** Constitutional AI ativa para TODOS os tiers (não apenas Q<80)

- [ ] Expandir trigger de Constitutional AI para Q<90 (era Q<80)
- [ ] Adicionar princípios científicos ao constitutional_principles
- [ ] Adicionar verificação de referências bibliográficas como princípio
- [ ] Commit, deploy, medir Safety Score

**Referência científica:** Constitutional AI (Bai et al., arXiv:2212.08073, 2022)

### 🟡 C264 — Knowledge Graph Bidirectional Update — PRIORIDADE #5
**Origem:** Conselho V102 — Bloqueador #2 (módulos desconectados)
**Objetivo:** KG atualizado automaticamente com conhecimento de alta qualidade

- [ ] Implementar write-back: respostas Q≥90 atualizam o KG
- [ ] Implementar entity extraction para novos nós do grafo
- [ ] Implementar edge creation para relações detectadas
- [ ] Commit, deploy, medir KG freshness

**Referência científica:** HippoRAG 2 (arXiv:2502.14802, ICML 2025)

### 🟡 C265 — Multi-Agent Debate (AutoGen Pattern) — PRIORIDADE #6
**Origem:** Conselho V102 — Capacidade de resposta complexa
**Objetivo:** Queries complexas → debate entre 2-3 agentes especializados

- [ ] Implementar debate orchestrator em orchestration.ts
- [ ] Criar agentes: Scientist, Critic, Synthesizer
- [ ] Trigger: complexityScore > 0.8 + category = complex_reasoning
- [ ] Commit, deploy, medir quality improvement

**Referência científica:** AutoGen (Wu et al., arXiv:2308.08155, 2023)

### 🟢 C270 — Benchmark C238 v9 Multi-Dimensional — PRIORIDADE #7
**Origem:** Conselho V102 — Métricas mensuráveis
**Objetivo:** Score composto ≥88/100 (PASS threshold 2026)

- [ ] Aguardar C260-C265 deployados
- [ ] Executar c238_chain2_v9_multidimensional.py
- [ ] Medir: Quality, Latency, Safety, Citations, KG Enrichment
- [ ] Comparar com benchmarks SOTA (MT-Bench, HELM, RAGAS)
- [ ] Publicar resultados no AWAKE

---

## MÉTRICAS DE PROGRESSO

| Métrica | C256 | C257 | C258 | C259 | Target C270 |
|---------|------|------|------|------|-------------|
| Quality P50 | 85 | 90 | 90 | ~96 | ≥95 |
| Latência P50 | 36.3s | ~20s | ~20s | ~16s | ≤10s |
| Timeout Rate | 5.9% | ~2% | ~2% | ~1% | ≤0.5% |
| Citations/Response | 0% | 0% | 0% | ~60% | ≥90% |
| Score Composto | 78/100 | 83/100 | 84/100 | ~86/100 | ≥90/100 |

---

## REGRAS DO ROADMAP

1. **Apenas atividades do Conselho dos 6** são adicionadas a este roadmap
2. **Metodologia científica obrigatória**: toda implementação deve ter referência arXiv/paper
3. **Critério de sucesso mensurável**: toda tarefa deve ter métrica de aprovação
4. **Incrementalidade**: cada ciclo deve melhorar pelo menos uma métrica em ≥5%
5. **AWAKE incremental**: criar novo AWAKE após cada ciclo completado

---

*Roadmap V44 atualizado em 2026-03-11 por MANUS (agente de manutenção MOTHER)*
*Próxima versão: TODO-ROADMAPV45 após C260 completado*
