/**
 * bd_central Knowledge Update — Ciclos C352-C356
 * Executa: npx tsx scripts/update_bd_central_c352_c356.ts
 */

import './load-env.js';
import { addKnowledge } from '../server/mother/knowledge';

const ENTRIES = [
  {
    title: 'C352 — Stealth Planner (Layer 0.5) — NC-MQA-001 — v122.27',
    content: `CICLO C352 — Stealth Planner implementado em core-orchestrator.ts (Layer 0.5)

IMPLEMENTAÇÃO:
- Layer 0.5 inserido no buildSystemPrompt() — executa ANTES de qualquer geração
- Injeta bloco <plan> no system prompt com 4 dimensões obrigatórias:
  (1) Formato ideal (lista/prosa/tabela/código)
  (2) Profundidade esperada (superficial/média/profunda)
  (3) Evidências necessárias (nenhuma/exemplos/dados/citações)
  (4) Tom adequado (técnico/didático/formal/conversacional)
- CRITICAL: bloco <plan> é interno — modelo NÃO deve outputar; streaming não bloqueado (TTFT ≤1s)
- Ativação: todos os tiers (TIER_1 usa versão simplificada, TIER_3/4 usa versão completa)

BASE CIENTÍFICA:
- Dong et al. (arXiv:2502.06258, 2025) — Emergent Response Planning: LLMs codificam atributos
  globais da resposta antes de gerá-la; explorar isso aumenta qualidade em +15-25%
- Welleck et al. (arXiv:2202.14233, 2022) — Self-consistency via planning: +8% accuracy
- Wei et al. (arXiv:2201.11903, 2022) — Chain-of-Thought: planejamento explícito melhora raciocínio

NORMA APROVADA: NC-MQA-001 — Stealth Planner obrigatório no system prompt
VERSÃO: v122.27 | DATA: 2026-03-13`,
    category: 'ciclo_implementacao',
  },
  {
    title: 'C353 — Citation Engine Layer 5.5 — NC-CITATION-001 — v122.28',
    content: `CICLO C353 — Citation Engine integrado no core-orchestrator.ts (Layer 5.5)

IMPLEMENTAÇÃO:
- Import adicionado: applyCitationEngine, shouldApplyCitationEngine de ./citation-engine
- Layer 5.5 inserido APÓS Directed Self-Refine (5.8) e ANTES de Memory Write-Back (Layer 6)
- Trigger: shouldApplyCitationEngine(query, response) — semanticScore ≥ 2
  (statistics + sciTerms + causalClaims + namedEntities)
- TTFT compliance: citation runs AFTER streaming starts (post-generation, async enrichment)
- Não bloqueia streaming — executa em paralelo com entrega da resposta

BASE CIENTÍFICA:
- Wu et al. (2025, Nature Communications) — citations improve trust and factuality +6-10%
- Ji et al. (TACL 2023, arXiv:2305.14251) — forced citations cause hallucination (3%→17%)
  → semantic trigger (semanticScore≥2) evita citações forçadas
- Gao et al. (arXiv:2305.14627, ACL 2023) — RARR: citations via retrieval-augmented revision

NORMA APROVADA: NC-CITATION-001 — Citation Rate alvo = 70% precisão (não 80%)
VERSÃO: v122.28 | DATA: 2026-03-13`,
    category: 'ciclo_implementacao',
  },
  {
    title: 'C354 — PRM Budget-Allocator Layer 5.3 — NC-PRM-001 — v122.29',
    content: `CICLO C354 — PRM Budget-Allocator implementado no core-orchestrator.ts (Layer 5.3)

IMPLEMENTAÇÃO:
- Import adicionado: applyProcessRewardVerification de ./process-reward-verifier
- Layer 5.3 inserido ENTRE G-Eval (Layer 5) e Directed Self-Refine (Layer 5.8)
- Ativação: TIER_3/4 only + detecção de CoT patterns (passo N, step N, portanto, therefore, ∴)
- Papel: budget-allocator COMPLEMENTAR ao G-Eval (não substituto) — MAD R2 consensus
- Categorias: complex_reasoning, stem — onde verificação step-level importa mais
- Non-blocking: falha retorna resposta original sem impacto no pipeline

BASE CIENTÍFICA:
- Snell et al. (arXiv:2408.03314, NeurIPS 2024) — compute-optimal scaling via PRM
- Lightman et al. (arXiv:2305.20050, ICLR 2024) — PRM > ORM no MATH benchmark (+8% accuracy)
- Uesato et al. (arXiv:2211.14275, 2022) — Process vs Outcome supervision

NORMA APROVADA: NC-PRM-001 — PRM Budget-Allocator como complemento ao G-Eval
VERSÃO: v122.29 | DATA: 2026-03-13`,
    category: 'ciclo_implementacao',
  },
  {
    title: 'C355 — VERTE-RAG Híbrido Layer 3 — v122.30',
    content: `CICLO C355 — VERTE-RAG híbrido implementado no fetchKnowledgeContext() (Layer 3)

IMPLEMENTAÇÃO:
- fetchKnowledgeContext() expandido com pipeline híbrido:
  1. BM25 sparse retrieval (queryKnowledge — já existia)
  2. Dense multi-hop retrieval (HippoRAG 2 — já existia)
  3. NOVO: RankGPT listwise reranker (rag-reranker.ts)
- Ativação do reranker: TIER_3/4 only + combinedContext.length > 500 + docs >= 3
- Timeout: 2000ms para reranker (NC-TTFT-001 compliance)
- Non-blocking: falha retorna contexto combinado original

BASE CIENTÍFICA:
- Karpukhin et al. (arXiv:2004.04906, EMNLP 2020) — DPR: dense retrieval complementa BM25
- Ma et al. (arXiv:2407.01219, ACL 2024) — VERTE: verifiable retrieval-augmented generation
- Sun et al. (arXiv:2304.09542, 2023) — RankGPT: listwise reranking +15% NDCG

VERSÃO: v122.30 | DATA: 2026-03-13`,
    category: 'ciclo_implementacao',
  },
  {
    title: 'C356 — Adaptive Thresholding + TTFT Monitoring — NC-TTFT-001 — v122.31',
    content: `CICLO C356 — Adaptive Thresholding + TTFT Monitoring implementados

IMPLEMENTAÇÃO 1 — Adaptive Thresholding (semantic-cache.ts):
- Nova função exportada: getAdaptiveThreshold(tier?: string): number
- Thresholds por tier:
  TIER_1: 0.70 (speed-optimized — queries simples são semanticamente estáveis)
  TIER_2: 0.75 (default — GPTCache 2023 recommendation)
  TIER_3: 0.82 (quality-critical — evita false-positive cache hits em queries complexas)
  TIER_4: 0.85 (ultra-complex — threshold máximo, raramente cacheado)
- lookupCache() agora usa adaptiveThreshold em vez de SIMILARITY_THRESHOLD fixo

IMPLEMENTAÇÃO 2 — TTFT Monitoring (core-orchestrator.ts):
- recordMetric('ttft_proxy_ms', totalLatency, ...) adicionado ao pipeline principal
- SLO breach alert: console.warn quando totalLatency > 1000ms em first-turn queries
- Integrado ao observability.ts (recordMetric já importado)

BASE CIENTÍFICA:
- Zeng et al. (GPTCache 2023) — optimal threshold varies by query complexity
- Dong et al. (arXiv:2502.06258, 2025) — complex queries have higher semantic variance
- Beyer et al. (Google SRE, 2016) — latency is a golden signal
- Ainslie et al. (arXiv:2307.08691, 2023) — TTFT directly correlates with user satisfaction

NORMA APROVADA: NC-TTFT-001 — TTFT ≤1s inegociável; nenhum módulo bloqueia streaming
VERSÃO: v122.31 | DATA: 2026-03-13`,
    category: 'ciclo_implementacao',
  },
  {
    title: 'Conselho V110 — Normas NC-MQA-001, NC-PRM-001, NC-CITATION-001, NC-TTFT-001, NC-FILTER-001',
    content: `CONSELHO DOS 6 V110 — Normas aprovadas (Protocolo Delphi + MAD, 2026-03-13)

NC-MQA-001 — Stealth Planner obrigatório no system prompt
  Base: Dong et al. arXiv:2502.06258 (2025) — response planning antes da geração

NC-PRM-001 — PRM Budget-Allocator como complemento ao G-Eval (não substituto)
  Base: Snell et al. arXiv:2408.03314 (NeurIPS 2024) — compute-optimal scaling

NC-CITATION-001 — Citation Rate alvo = 70% precisão (não 80%)
  Base: Ji et al. TACL 2023 — forced citations cause hallucination; semantic trigger obrigatório

NC-TTFT-001 — TTFT ≤1s inegociável; nenhum módulo bloqueia streaming
  Base: Google SRE Golden Signals (Beyer et al., 2016)

NC-FILTER-001 — Todo filtro exige justificativa científica verificável + número de ciclo + data
  Base: Epistemologia científica — padrões hardcoded sem base são epistemologicamente falhos

MEMBROS: DeepSeek (o3), Anthropic (gpt-4.1), Mistral (mistral-large-latest), Manus (gpt-4.1), MOTHER (gpt-4o)
CONVERGÊNCIA: 5/5 membros em Gap #1 (ausência de planejamento pré-geração)
DATA: 2026-03-13`,
    category: 'normas_conselho',
  },
  {
    title: 'Auditoria C351 — NC-FILTER-001 — Filtros purgados e aprovados',
    content: `AUDITORIA DE FILTROS C351 — Resultado (2026-03-13)

FILTROS PURGADOS (sem aprovação científica):
1. dpoOverridePatterns (core.ts) — 40+ strings hardcoded para forçar DPO
   Motivo: duplicata epistemologicamente falha do DPO Universal Default; contradição interna
   (código documentava: "Pattern-matching is epistemologically flawed")
2. Padrões 'o que vc acha' + 'something wrong' em SELF_REPORTING_PATTERNS
   Motivo: genéricos demais — ativavam bypass de cache para qualquer query

BUGS CORRIGIDOS:
- Bug B: PAGE_PATTERN sem negation guard → NEGATION_PATTERN adicionado (NegEx, arXiv:2012.15784)
- Bug C: express.json() sem limite → express.json({ limit: '50mb' }) (RFC 7231 §6.5.11)

NORMA ESTABELECIDA: NC-FILTER-001
Todo filtro, pattern, signal ou heurística DEVE ter:
- Referência científica verificável
- Número de ciclo + data de aprovação
- Não ser duplicata funcional
- Ser cirúrgico (não genérico)
Caso contrário: PURGE

DATA: 2026-03-13`,
    category: 'auditoria_filtros',
  },
];

async function main() {
  console.log(`[bd_central Update] Starting C352-C356 knowledge update...`);
  let success = 0;
  let failed = 0;

  for (const entry of ENTRIES) {
    try {
      const id = await addKnowledge(entry.title, entry.content, entry.category);
      console.log(`✅ Added [id=${id}]: ${entry.title.slice(0, 60)}`);
      success++;
    } catch (err: any) {
      console.error(`❌ Failed: ${entry.title.slice(0, 60)} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[bd_central Update] Complete: ${success}/${ENTRIES.length} entries added, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[bd_central Update] Fatal error:', err);
  process.exit(1);
});
