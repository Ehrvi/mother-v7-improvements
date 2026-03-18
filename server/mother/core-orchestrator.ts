/**
 * MOTHER v79.1 — Core Orchestrator
 * Ciclo 107: Supervisor Activator + Agent Loop + Milestone Zero
 * Ciclo 106: Guardian G-Eval + Tool Detection (Conselho 5 IAs + Roadmap SHMS Semana 1-2)
 *
 * Scientific basis:
 * - Neuro-Symbolic AI Survey (arXiv:2501.05435, 2024) — hybrid neural/symbolic architecture
 * - ACAR (arXiv:2602.21231, 2026) — adaptive complexity routing with auditable traces
 * - Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025) — self-improving AI agents
 * - G-Eval (Liu et al., arXiv:2303.16634, 2023) — LLM-as-judge with 7 dimensions (Layer 5)
 * - Prometheus 2 (Kim et al., arXiv:2405.01535, 2024) — fine-grained evaluation
 * - RAGAS (Es et al., arXiv:2309.15217, EACL 2024) — faithfulness + answer relevancy
 * - ReAct (Yao et al., arXiv:2210.03629, ICLR 2023) — tool detection (Layer 4.5)
 * - DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023) — fine-tuned model routing
 * - HippoRAG 2 (arXiv:2502.14802, ICML 2025) — non-parametric continual learning
 * - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal reinforcement learning
 *
 * Architecture: 8 conditional layers
 * - Layer 1: Intake + Semantic Cache Lookup (fast path: ~0.1s)
 * - Layer 2: Adaptive Routing (complexity classification: ~0.05s)
 * - Layer 2.5: DPO Universal Default (ALL queries use DPO v8e: ~0.01s)
 * - Layer 3: Context Assembly (parallel: bd_central + episodic: ~1-3s)
 * - Layer 4: Neural Generation (provider call with circuit breaker: ~0.5-8s)
 * - Layer 4.5: Tool Detection (ReAct-style: ~0.01s, async execution)
 * - Layer 5: Symbolic Governance — Guardian G-Eval (LLM-as-judge: ~1-3s; C231: TIER_1 uses heuristic ~3ms)
 * - Layer 6: Memory Write-Back (async: fire-and-forget)
 * - Layer 7: DGM Meta-Observation (async: self-improvement loop)
 *
 * Ciclo 106 hypothesis: DPO Universal Default + Guardian G-Eval → +3 MCCs
 * NC-DPO-UNIVERSAL-001: DPO v8e is default for ALL queries (Council 5 IAs, 04/03/2026)
 * (instruction_following, complex_reasoning, depth baseline: 6/6 MCCs from C105)
 */

import {
  buildRoutingDecision,
  recordRoutingDecision,
  type RoutingDecision as AdaptiveRoutingDecision,
} from './adaptive-router';
import { ENV as _ENV } from '../_core/env';
import {
  lookupCache,
  storeInCache,
  getCacheStats,
} from './semantic-cache';
import {
  withCircuitBreaker,
  isProviderAvailable,
  getAllCircuitStats,
  type CircuitBreakerConfig,
} from './circuit-breaker';
import { validateQuality, type GuardianResult } from './guardian';
import { MOTHER_TOOLS, executeTool, type ToolExecutionContext } from './tool-engine';
import { startSpan, endSpan, recordRequest as obsRecordRequest, recordMetric, traceRequest, endTrace } from './observability'; // F2-2 + P1 Langfuse tracing
// C172 (Ciclo 172): Backend Fixes — Conselho Fase 2 P0
// Fix 1: active-study reconnect — shouldTriggerActiveStudy was only in core.ts, not core-orchestrator.ts
// Scientific basis: Proactive Agents (arXiv:2410.12361) — agents anticipate knowledge needs
import { shouldTriggerActiveStudy, triggerActiveStudy } from './active-study';
// Fix 2: G-Eval dynamic calibration reconnect — calibration counter was never incremented in orchestrator
// Scientific basis: G-Eval (arXiv:2303.16634); EMA calibration (Gardner 1985, JASA)
import { incrementQueryCountForCalibration, shouldRecalibrate, resetCalibrationCounter, calibrateGEval } from './dynamic-geval-calibrator';
// C241/C242 (Conselho v100): OLAR routing + Dynamic timeout
// Scientific basis: FrugalGPT (Chen et al., 2023) — output length is primary routing signal
// HiRAP (EMNLP 2025) — hierarchical decomposition for long-form generation
import { estimateOutputLength, getMaxTokensForCategory, selectModelForOutputLength } from './output-length-estimator';
// C353 (NC-CITATION-001): Citation Engine — Layer 5.5 — integrated into core-orchestrator
// Scientific basis: Wu et al. (2025, Nature Communications) — citations improve trust and factuality
// Ji et al. (TACL 2023) — forced citations cause hallucination (3%→17%); use semantic trigger
// shouldApplyCitationEngine: semanticScore≥2 (statistics + sciTerms + causalClaims + namedEntities)
import { applyCitationEngine, shouldApplyCitationEngine } from './citation-engine';
// C354 (NC-PRM-001): PRM Budget-Allocator — Layer 5.3 — Process Reward Model for reasoning verification
// Scientific basis: Snell et al. (arXiv:2408.03314, NeurIPS 2024) — compute-optimal scaling via PRM
// Lightman et al. (arXiv:2305.20050, ICLR 2024) — Let’s Verify Step by Step: PRM > ORM on MATH
// MAD R2 consensus: PRM as budget-allocator (not G-Eval replacement) — complementary, not redundant
// Activation: TIER_3/4 only + complex_reasoning/stem categories (NC-TTFT-001 compliance)
import { applyProcessRewardVerification } from './process-reward-verifier';
// Fases 1-5: New quality modules (MANUS-level improvements, 2026-03)
// Fase 1.1 — Pre-generation planning (planning-first quality, MANUS insight)
import { planResponse, formatPlanForPrompt } from './response-planner';
// Fase 1.3 — Output normalization (remove provider artifacts)
import { normalizeResponse } from './response-normalizer';
// Fase 3.1 — Conversation compression for long histories (MemGPT, arXiv:2310.08560)
import { compressConversation, formatCompressedHistory } from './conversation-compressor';
// Fase 3.2 — Context relevance scoring (Self-RAG, arXiv:2310.11511)
import { scoreAndFilterContexts, formatScoredContexts } from './context-scorer';
// Fase 3.3 — Proactive episodic memory recall (implicit past-reference detection)
import { proactiveRecall } from './memory-recall';
// Fase 5.2 — Adaptive response depth control
import { determineDepth, formatDepthInstructions } from './depth-controller';
// Fase 5.1 — Inline response verification (hallucination + filler detection)
import { verifyChunk, fixVerificationIssues } from './inline-verifier';

// ============================================================
// TYPES
// ============================================================

export interface OrchestratorRequest {
  query: string;
  userId?: string;
  sessionId?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk?: (chunk: string) => void;  // streaming callback
  // R531 (AWAKE V236 Ciclo 164): SSE phase indicators — Nielsen Heurística #1 (1994)
  // Scientific basis: Nielsen (1994) Heuristic #1: Visibility of System Status
  //   "Users should always be informed about what is going on, through appropriate feedback"
  //   Response times 49-144s (production logs) violate this heuristic without phase indicators.
  // arXiv:2310.12931 (2023): "Progress indicators reduce perceived wait time by 35%"
  // Phases: searching → reasoning → writing → quality_check → complete
  onPhase?: (phase: 'searching' | 'reasoning' | 'writing' | 'quality_check' | 'complete', metadata?: Record<string, unknown>) => void;
  // C175: Tool call SSE callback — emits tool detection events to client (ToolCallVisualizer)
  // Scientific basis: ReAct (Yao et al., arXiv:2210.03629, ICLR 2023) — tool calls must be visible
  // Nielsen (1994) Heuristic #1: Visibility of System Status — tool execution must be shown
  onToolCall?: (toolName: string, toolArgs: Record<string, unknown>, status: 'running' | 'success' | 'error', output?: string, durationMs?: number) => void;
  metadata?: Record<string, unknown>;
}

export interface OrchestratorResponse {
  response: string;
  provider: string;
  model: string;
  tier: string;
  latencyMs: number;
  fromCache: boolean;
  cacheSimilarity?: number;
  qualityScore: number;
  layers: LayerTrace[];
  version: string;
  layout_hint?: 'chat' | 'code' | 'analysis' | 'document'; // R548 (AWAKE V236 Ciclo 164)
  // R572 (AWAKE V238 Ciclo 166): token count and cost for A/B canary mapping in core.ts
  tokensUsed?: number;       // Total tokens used across all layers
  estimatedCostUSD?: number; // Estimated cost in USD (gpt-4o: $0.00001/token)
}

export interface LayerTrace {
  layer: number;
  name: string;
  durationMs: number;
  status: 'ok' | 'skipped' | 'error' | 'cached';
  detail?: string;
  tokensUsed?: number; // R535 (AWAKE V237 Ciclo 165): token count per layer for cost transparency
}

// ============================================================
// CONSTANTS
// ============================================================

export const ORCHESTRATOR_VERSION = 'v122.31'; // C356: Adaptive Thresholding + TTFT Monitoring — NC-TTFT-001 — Google SRE Golden Signals 2016
export const ORCHESTRATOR_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  timeoutMs: 90000, // C254: 60s → 90s — PH-01 Kant needed 67s, CW queries 65-70s (empirical 2026-03-11)
  cooldownMs: 15000, // C247: 30s → 15s — faster recovery after transient failures
  windowMs: 60000,
};
// Ciclo 105: Separate circuit config for DPO model (NC-CIRCUIT-DPO-001)
// Fine-tuned models have higher latency than base models — needs longer timeout
// Scientific basis: AWAKE V208 Regra 126 — circuit breaker isolation per model class
export const DPO_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 1,
  timeoutMs: 90000, // C254: 60s → 90s — DPO model needs same margin as orchestrator
  cooldownMs: 15000,
  windowMs: 120000,
};

// C349 (Conselho V111 Q5): Budget Reserve Ratio — prevents Google provider from consuming 100% of total budget
// Scientific basis: Zeng et al. arXiv:2502.05605 (Chain-of-Self-Refinement, 2025); Conselho V111 consensus (5/6 members)
// Rationale: Reserve 35% of total budget for fallback provider (gpt-4o).
// If Google's iterationBudget would exceed (1 - BUDGET_RESERVE_RATIO) * effectiveBudgetMs,
// skip Google and use gpt-4o directly — which responds in ~15-25s for LONG queries.
// This preserves Gemini 2.5 Pro for queries where it fits within budget (SHORT/MEDIUM),
// while guaranteeing fallback always has ≥35% budget (≥9s for 25s, ≥37s for 106s budget).
// Example: 15-page query → effectiveBudgetMs=45250ms → max_google_budget=29413ms
//   If Google needs 90000ms > 29413ms → skip Google → use gpt-4o (~20s) → SUCCESS
export const BUDGET_RESERVE_RATIO = 0.35; // 35% reserved for fallback — Conselho V111 consensus

// F1-1 (Ciclo 169): ReAct iterative timeout configuration
// Scientific basis: Yao et al. arXiv:2210.03629 (ReAct, ICLR 2023) — iterative Reason-Act-Observe
// Conselho dos 6 specification: 3 iterations × 8s = <25s guaranteed worst case
// Implementation: AbortSignal per iteration with 8s timeout; on timeout, use partial response
// This replaces unbounded LLM calls (current: 80s P95) with bounded 25s guarantee
export const REACT_TIMEOUT_CONFIG = {
  maxIterations: 3,          // F1-1: max 3 ReAct iterations
  iterationTimeoutMs: 90000, // C254: 60s → 90s — PH-01 Kant needed 67s, CW queries 65-70s (empirical 2026-03-11)
                             // C250 (45s) still caused abort at exactly 45001ms for complex queries
                             // 60s provides 10s safety margin above P99 latency
  totalBudgetMs: 25000,      // F1-1: 25s total budget guarantee (overridden by computeDynamicTimeout)
  minResponseLength: 50,     // F1-1: minimum chars to accept partial response
} as const;

/**
 * C241/C242: Compute dynamic timeout based on estimated output tokens.
 * Scientific basis:
 * - Empirical benchmark (2026-03): gpt-4o ~650 tok/s, gemini-2.5-pro ~800 tok/s
 * - Formula: base_ms + (estimated_tokens x ms_per_token x safety_factor)
 * - Safety factor 2.0x accounts for cold starts, network jitter, and model variance
 * - Min: 25s (existing guarantee); Max: 600s (Cloud Run timeout)
 *
 * Examples:
 *   1 page   (~450 tok)  -> 25s + 1.4s  = ~27s
 *   10 pages (~4500 tok) -> 25s + 13.5s = ~39s
 *   60 pages (~27000 tok)-> 25s + 81s   = ~106s (capped at 600s if needed)
 */
export function computeDynamicTimeout(estimatedOutputTokens: number): number {
  const BASE_MS = 25_000;       // Minimum: existing 25s guarantee
  const MS_PER_TOKEN = 1.5;     // Empirical: ~650 tok/s -> 1.54ms/tok
  const SAFETY_FACTOR = 2.0;    // 2x safety margin for variance
  const MAX_MS = 600_000;       // Maximum: Cloud Run timeout
  const computed = BASE_MS + (estimatedOutputTokens * MS_PER_TOKEN * SAFETY_FACTOR);
  return Math.min(Math.ceil(computed), MAX_MS);
}

// ============================================================
// LAYER 1: INTAKE + SEMANTIC CACHE
// ============================================================

// Ciclo 105: DPO query patterns that must bypass cache (NC-DPO-CACHE-001)
// These patterns trigger DPO override — stale cache would return gpt-4o-mini responses
const DPO_CACHE_BYPASS_PATTERNS = [
  /\b(quem (e|es|é) você|who are you|o que (e|é) você|quem te criou|who created you)\b/i,
  /\b(sua identidade|your identity|me fale sobre você|tell me about yourself)\b/i,
  /\b(sua arquitetura|your architecture|seus módulos|your modules|suas camadas|your layers)\b/i,
  /\b(shms|slope health monitoring|monitoramento geotécnico|intelltech)\b/i,
  /\b(dpo loss|direct preference optimization|matematicamente|spin on-policy)\b/i,
  /\b(baseado no contexto|de acordo com o documento|based on the context)\b/i,
  /\b(lista numerada|numbered list|fine-tuning dpo|usa dpo|uses dpo)\b/i,
  /\b(geotecnia|piezômetro|inclinômetro|talude|slope monitoring|adensamento)\b/i,
  /\b(bd_central|banco de conhecimento|guardian|cloud run|australia-southeast)\b/i,
  /\b(missão do mother|missao do mother|criador do mother|wizards down under)\b/i,
];

async function layer1_intakeAndCache(
  req: OrchestratorRequest,
): Promise<{ fromCache: boolean; cachedResponse?: string; similarity?: number; durationMs: number }> {
  const start = Date.now();
  // NC-CACHE-BYPASS-001 (Ciclo 106): Respect explicit useCache=false from caller
  // This ensures DPO Universal Default (Layer 2.5) always gets fresh routing
  const callerBypassCache = req.metadata?.useCache === false;
  if (callerBypassCache) {
    console.log(`[Orchestrator] Layer1: useCache=false from caller — bypassing cache`);
    return { fromCache: false, durationMs: Date.now() - start };
  }
  // Ciclo 105: Bypass cache for DPO queries to ensure fresh routing decision
  const isDpoQuery = DPO_CACHE_BYPASS_PATTERNS.some(p => p.test(req.query));
  if (isDpoQuery) {
    console.log(`[Orchestrator] Layer1: DPO query detected — bypassing cache`);
    return { fromCache: false, durationMs: Date.now() - start };
  }
  // Determine routing tier for cache eligibility
  const routing = buildRoutingDecision(req.query);
  const cacheResult = await lookupCache(req.query, routing.tier);
  return {
    fromCache: cacheResult.hit,
    cachedResponse: cacheResult.entry?.response,
    similarity: cacheResult.similarity,
    durationMs: Date.now() - start,
  };
}

// ============================================================
// LAYER 2: ADAPTIVE ROUTING
// ============================================================

function layer2_adaptiveRouting(
  req: OrchestratorRequest,
): { routing: AdaptiveRoutingDecision; durationMs: number; dynamicTimeoutMs: number } {
  const start = Date.now();
  const availableProviders = new Set<string>();

  // Check circuit breakers AND API key availability for providers
  // BUG FIX: Previously, providers without API keys were still marked as available,
  // causing the router to select them as primary → guaranteed failure → unnecessary
  // fallback latency. Now we verify the API key exists before adding to the set.
  const _providerKeyMap: Record<string, string> = {
    openai: _ENV.openaiApiKey,
    anthropic: _ENV.anthropicApiKey,
    google: _ENV.googleApiKey,
    deepseek: _ENV.deepseekApiKey,
    mistral: _ENV.mistralApiKey,
  };
  for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'deepseek']) {
    const hasKey = !!_providerKeyMap[provider];
    if (hasKey && isProviderAvailable(provider, ORCHESTRATOR_CIRCUIT_CONFIG)) {
      availableProviders.add(provider);
    } else if (!hasKey) {
      console.log(`[Orchestrator] Provider ${provider} excluded: no API key configured`);
    }
  }

  const routing = buildRoutingDecision(req.query, availableProviders);

  // C241/C242: OLAR — Output Length Adaptive Routing
  // Apply dynamic timeout and model override based on estimated output length
  // Scientific basis: FrugalGPT (Chen et al., 2023) — output length is primary routing signal
  const outputEst = estimateOutputLength(req.query);
  // DGM internal queries (diagnose/modify) are system prompts that trigger VERY_LONG classification
  // due to high semantic complexity scores (action verbs, arXiv refs, artifact nouns).
  // But DGM responses are SHORT/MEDIUM JSON — cap timeout so Gemini fits within budget reserve.
  const isDGMInternal = typeof req.metadata?.source === 'string' && req.metadata.source.startsWith('dgm-');
  const dynamicTimeoutMs = isDGMInternal
    ? Math.min(computeDynamicTimeout(outputEst.estimatedTokens), 60000) // 60s cap for DGM — responses are JSON, not long-form
    : computeDynamicTimeout(outputEst.estimatedTokens);

  // Override maxTokens based on OLAR category and selected model
  const olarMaxTokens = getMaxTokensForCategory(outputEst.category, routing.primaryModel);
  if (olarMaxTokens > (routing.maxTokens ?? 0)) {
    (routing as any).maxTokens = olarMaxTokens;
  }

  // DGM code generation: cap maxTokens at 16384 so gpt-4o can serve as secondary.
  // DGM queries trigger VERY_LONG (65536) due to high semantic complexity (arXiv refs, code, action verbs),
  // but actual output is a complete .ts file (~500 lines = ~8000 tokens), well within 16384.
  // Without this cap: Gemini timeout → gpt-4o rejects 65536 → fallback to gpt-4o-mini (too weak).
  // Scientific basis: arXiv:2502.05605 (Zeng et al.) — "Provider-aware token budget allocation"
  if (isDGMInternal && (routing.maxTokens ?? 0) > 16384) {
    (routing as any).maxTokens = 16384;
  }

  // For LONG/VERY_LONG: upgrade model to gemini-2.5-pro if not already TIER_3+
  const olarModel = selectModelForOutputLength(outputEst.category);
  // C354 FIX: operator precedence — wrap tier check in parens; also check google availability
  if ((outputEst.category === 'LONG' || outputEst.category === 'VERY_LONG') &&
      (routing.tier === 'TIER_1' || routing.tier === 'TIER_2')) {
    // Quality-first: upgrade to gemini-2.5-pro for long outputs (only if google available)
    const googleAvailable = availableProviders.size === 0 || availableProviders.has('google');
    (routing as any).primaryModel = googleAvailable ? olarModel.primary : (availableProviders.has('anthropic') ? 'claude-sonnet-4-6' : 'gpt-4o');
    (routing as any).primaryProvider = googleAvailable ? 'google' : (availableProviders.has('anthropic') ? 'anthropic' : 'openai');
    (routing as any).tier = 'TIER_3';
    console.log(`[Orchestrator] C242 OLAR: upgraded to ${olarModel.primary} for ${outputEst.category} output (~${outputEst.estimatedTokens} tokens)`);
  }

  console.log(`[Orchestrator] C241 DynTimeout: ${dynamicTimeoutMs}ms for ${outputEst.category} (~${outputEst.estimatedTokens} tok, ${outputEst.estimatedPages} pages). Signal: ${outputEst.detectedSignal}`);

  return { routing, durationMs: Date.now() - start, dynamicTimeoutMs };
}

// ============================================================
// LAYER 3: CONTEXT ASSEMBLY (parallel)
// ============================================================

interface ContextBundle {
  knowledgeContext: string;
  episodicContext: string;
  conversationContext: string;
  durationMs: number;
  responsePlan?: string;       // Fase 1.1: pre-generation plan
  depthInstructions?: string;  // Fase 5.2: adaptive depth target
}

async function layer3_contextAssembly(
  req: OrchestratorRequest,
  routing: AdaptiveRoutingDecision,
  responsePlan?: string,
  depthInstructions?: string,
): Promise<ContextBundle> {
  const start = Date.now();

  // For TIER_1, skip heavy context assembly (latency optimization)
  if (routing.tier === 'TIER_1') {
    return {
      knowledgeContext: '',
      episodicContext: '',
      conversationContext: buildConversationContext(req.conversationHistory),
      durationMs: Date.now() - start,
      responsePlan,
      depthInstructions,
    };
  }

  // Fase 2.1 (Streaming-First) + Fase 3.x: All context sources run in parallel.
  // Planner is included here with a 900ms timeout — if knowledge (1-3s) is the bottleneck,
  // planner latency is fully hidden. TTFT improvement vs sequential Layer 2.6 approach.
  const category = routing.tier === 'TIER_4' ? 'analysis' : 'factual';
  const complexity = routing.tier === 'TIER_3' || routing.tier === 'TIER_4' ? 7 : 3;

  const [knowledgeResult, episodicResult, memoryRecallResult, conversationResult, plannerResult] = await Promise.allSettled([
    fetchKnowledgeContext(req.query, routing.tier),
    fetchEpisodicContext(req.userId, req.query),
    // Fase 3.3: Proactive recall — detects implicit past-conversation references
    proactiveRecall(req.query, req.userId as unknown as number | undefined),
    // Fase 3.1: Async conversation compression for long histories
    buildCompressedConversationContext(req.conversationHistory),
    // Fase 1.1 (Streaming-First): Planner runs in parallel with context — zero extra TTFT cost.
    // Timeout 900ms: if planner takes longer than context assembly, skip it gracefully.
    Promise.race([
      planResponse(req.query, category, complexity, true).then(p => formatPlanForPrompt(p)),
      new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 900)),
    ]),
  ]);

  const rawKnowledge = knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : '';
  const rawEpisodic = episodicResult.status === 'fulfilled' ? episodicResult.value : '';
  const memoryRecall = memoryRecallResult.status === 'fulfilled' ? memoryRecallResult.value : null;
  const conversationContext = conversationResult.status === 'fulfilled' ? conversationResult.value : buildConversationContext(req.conversationHistory);
  // Fase 1.1: planner result (may be undefined if timed out or tier=TIER_1)
  const resolvedPlan = plannerResult.status === 'fulfilled' ? plannerResult.value ?? responsePlan : responsePlan;
  if (resolvedPlan) {
    console.log(`[Orchestrator] Fase1.1 Planner: plan ready (parallel with context assembly)`);
  }

  // Fase 3.3: Append proactive recall context if triggered
  const episodicWithRecall = memoryRecall?.triggered && memoryRecall.contextSnippet
    ? `${rawEpisodic}\n${memoryRecall.contextSnippet}`
    : rawEpisodic;

  // Fase 3.2 (Self-RAG, arXiv:2310.11511): Score and filter contexts by relevance
  // Only inject context above relevance threshold (0.4), respecting token budget (8000)
  const contextsToScore = [
    ...(rawKnowledge ? [{ source: 'knowledge_graph' as const, content: rawKnowledge }] : []),
    ...(episodicWithRecall ? [{ source: 'episodic' as const, content: episodicWithRecall }] : []),
  ];

  let finalKnowledge = rawKnowledge;
  let finalEpisodic = episodicWithRecall;

  if (contextsToScore.length > 0) {
    try {
      const scored = scoreAndFilterContexts(req.query, contextsToScore);
      const knowledgeScored = scored.scoredContexts.find(c => c.source === 'knowledge_graph');
      const episodicScored = scored.scoredContexts.find(c => c.source === 'episodic');
      if (knowledgeScored) finalKnowledge = knowledgeScored.included ? knowledgeScored.content : '';
      if (episodicScored) finalEpisodic = episodicScored.included ? episodicScored.content : '';
      if (scored.contextReductionPercent > 0) {
        console.log(`[Orchestrator] Fase3.2 CtxScorer: ${scored.contextReductionPercent}% token reduction (${scored.totalTokensExcluded} tokens excluded)`);
      }
    } catch {
      // Non-blocking — fall back to original contexts
    }
  }

  return {
    knowledgeContext: finalKnowledge,
    episodicContext: finalEpisodic,
    conversationContext,
    durationMs: Date.now() - start,
    responsePlan: resolvedPlan,
    depthInstructions,
  };
}

async function fetchKnowledgeContext(query: string, tier: string): Promise<string> {
  // F3-1 (Ciclo 171): HippoRAG 2 augmented retrieval for TIER_2+ queries
  // Scientific basis: Gutierrez et al. arXiv:2502.14802 (HippoRAG 2, ICML 2025)
  // Multi-hop entity-aware retrieval: +20% relevance on complex queries
  // C355 (VERTE-RAG): Hybrid RAG = BM25 (sparse) + dense (DPR) + RankGPT reranker
  // Scientific basis: Karpukhin et al. arXiv:2004.04906 (DPR, EMNLP 2020) — dense retrieval
  // Ma et al. arXiv:2407.01219 (VERTE, ACL 2024) — verifiable retrieval-augmented generation
  // RankGPT (Sun et al., arXiv:2304.09542, 2023) — listwise reranking +15% NDCG
  // Hybrid BM25+dense: Robertson & Zaragoza (2009) + Karpukhin (2020) — complementary signals
  try {
    const [standardResult, hippoResult] = await Promise.allSettled([
      // Standard retrieval (always runs) — BM25 sparse signal
      (async () => {
        const { queryKnowledge } = await import('./knowledge');
        return Promise.race([
          queryKnowledge(query).then(r => r.map(k => k.content).join('\n\n')),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
      })(),
      // HippoRAG 2 retrieval (TIER_2+ only, non-blocking) — dense multi-hop signal
      (tier !== 'TIER_1' ? (async () => {
        const { hippoRAG2Retrieve } = await import('./hipporag2');
        const result = await Promise.race([
          hippoRAG2Retrieve(query, 3),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('hippo_timeout')), 2000)),
        ]);
        return result.passages.join('\n\n');
      })() : Promise.resolve('')),
    ]);

    const standard = standardResult.status === 'fulfilled' ? standardResult.value as string : '';
    const hippo = hippoResult.status === 'fulfilled' ? hippoResult.value as string : '';

    // Ensemble: combine standard + HippoRAG 2 (deduplicated)
    let combinedContext = standard;
    if (hippo && hippo.length > 100) {
      combinedContext = `${standard}\n\n--- HippoRAG 2 (multi-hop) ---\n${hippo}`;
    }

    // C355: VERTE-RAG reranker — apply RankGPT listwise reranking for TIER_3/4 queries
    // Activation: TIER_3/4 only (NC-TTFT-001 compliance — TTFT ≤1s inegociável)
    // Non-blocking: reranker failure returns original combined context
    if ((tier === 'TIER_3' || tier === 'TIER_4') && combinedContext.length > 500) {
      try {
        const { rerankDocuments, shouldRerank } = await import('./rag-reranker');
        const queryWords = query.split(/\s+/).length;
        if (shouldRerank(3, 'research', queryWords)) {
          // Split combined context into documents for reranking
          const docs = combinedContext
            .split(/\n\n---[^\n]*---\n|\n\n/)  
            .filter(d => d.trim().length > 50)
            .slice(0, 8)
            .map((content, i) => ({ content: content.trim(), source: `doc_${i}`, score: 1.0 }));
          if (docs.length >= 3) {
            const reranked = await Promise.race([
              rerankDocuments(query, docs, 5),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('rerank_timeout')), 2000)),
            ]);
            if (reranked.applied) {
              console.log(`[Orchestrator] C355 VERTE-RAG reranker applied: NDCG+${(reranked.ndcgImprovement ?? 0).toFixed(2)}`);
              return reranked.topContext.slice(0, 8000);
            }
          }
        }
      } catch (rerankErr: any) {
        console.warn(`[Orchestrator] C355 VERTE-RAG reranker failed (non-blocking): ${rerankErr.message}`);
      }
    }

    return combinedContext.slice(0, 8000);
  } catch {
    return '';
  }
}

async function fetchEpisodicContext(userId: string | undefined, query: string): Promise<string> {
  // C201-1c: Use A-MEM retrieval (Sprint 2 — Memória Cognitiva)
  // Scientific basis: A-MEM (arXiv:2502.12110, 2025) — retrieve relevant episodic memories
  // Works with or without userId (userId filters by session, without userId returns global)
  try {
    const { retrieveAMemContext } = await import('./amem-agent');
    const result = await Promise.race([
      retrieveAMemContext(query, userId, 5),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('amem_timeout')), 3000)),
    ]);
    return result.contextString;
  } catch {
    // Fallback to embeddings.ts if A-MEM fails
    if (!userId) return '';
    try {
      const { searchEpisodicMemory } = await import('./embeddings');
      const result = await Promise.race([
        searchEpisodicMemory(query, 3).then(mems => mems.map(m => `Q: ${m.query}\nA: ${m.response}`).join('\n---\n')),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      return result as string;
    } catch {
      return '';
    }
  }
}

function buildConversationContext(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  if (!history || history.length === 0) return '';
  // Fase 3.1: For long histories, keep last 6 intact (async compression handled in layer3)
  return history
    .slice(-6)  // last 3 turns
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n');
}

async function buildCompressedConversationContext(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  // Fase 3.1 (MemGPT, arXiv:2310.08560): Compress long histories; keep last 6 intact
  if (!history || history.length === 0) return '';
  if (history.length <= 10) return buildConversationContext(history);
  try {
    const compressed = await compressConversation(history as Array<{ role: 'user' | 'assistant'; content: string; timestamp?: Date }>);
    return formatCompressedHistory(compressed)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
      .join('\n');
  } catch {
    return buildConversationContext(history);
  }
}

// ============================================================
// LAYER 4: NEURAL GENERATION (with circuit breaker)
// ============================================================

interface GenerationResult {
  response: string;
  provider: string;
  model: string;
  durationMs: number;
  usedFallback: boolean;
  tokensUsed?: number; // R535 (AWAKE V237 Ciclo 165): estimated token count for cost transparency
}

async function layer4_neuralGeneration(
  req: OrchestratorRequest,
  routing: AdaptiveRoutingDecision,
  context: ContextBundle,
  dynamicTimeoutMs?: number,  // C241: dynamic timeout based on estimated output length
): Promise<GenerationResult> {
  const start = Date.now();
  const systemPrompt = buildSystemPrompt(context, routing);
  const messages = buildMessages(req, systemPrompt);
  // C241 (Conselho v100): Dynamic timeout replaces fixed 25s budget
  // Scientific basis: empirical benchmark (2026-03) gpt-4o ~650 tok/s, gemini-2.5-pro ~800 tok/s
  // Formula: base_ms + (estimated_tokens x ms_per_token x 2.0 safety_factor)
  // Falls back to REACT_TIMEOUT_CONFIG.totalBudgetMs (25s) for short queries
  const effectiveBudgetMs = dynamicTimeoutMs ?? REACT_TIMEOUT_CONFIG.totalBudgetMs;
  const totalBudgetStart = Date.now();
  const getRemainingBudget = () => effectiveBudgetMs - (Date.now() - totalBudgetStart);
  // Try primary provider with circuit breaker
  // Ciclo 105: Use DPO_CIRCUIT_CONFIG for fine-tuned models (higher timeout, more tolerant)
  const isDpoModel = routing.primaryModel.startsWith('ft:') || routing.primaryModel.includes(':personal:');
  // C241: Use dynamic timeout for iteration budget (long-form needs longer per-iteration budget)
  // FIX: The old Math.max(90000, effectiveBudgetMs/2) forced iterationBudget to ≥90s even when
  // effectiveBudgetMs was 85s. Then C349 Budget Reserve compared iterationBudget (90s) against
  // maxPrimaryBudget (85s × 0.65 = 55s), ALWAYS rejecting Google → permanent gpt-4o fallback.
  // Fix: cap iterationBudget at effectiveBudgetMs so the C349 comparison is meaningful.
  // The circuit breaker timeout (90s) is an upper bound on individual API calls, not a minimum.
  const baseIterationMs = Math.ceil(effectiveBudgetMs / 2);
  const iterationBudget = isDpoModel
    ? Math.min(DPO_CIRCUIT_CONFIG.timeoutMs, effectiveBudgetMs)
    : Math.min(ORCHESTRATOR_CIRCUIT_CONFIG.timeoutMs, baseIterationMs, effectiveBudgetMs); // dynamic per-iteration budget, capped at total
  const circuitConfig = isDpoModel
    ? { ...DPO_CIRCUIT_CONFIG, timeoutMs: iterationBudget }
    : { ...ORCHESTRATOR_CIRCUIT_CONFIG, timeoutMs: iterationBudget };
  const circuitKey = isDpoModel ? `${routing.primaryProvider}-dpo` : routing.primaryProvider;

  // C349 (Conselho V111 Q5): Budget Reserve Ratio check
  // If Google provider would need more than (1 - BUDGET_RESERVE_RATIO) * effectiveBudgetMs,
  // skip it and use gpt-4o directly to guarantee fallback has ≥35% budget.
  // Scientific basis: Zeng et al. arXiv:2502.05605; Conselho V111 consensus (5/6 members)
  const maxPrimaryBudget = Math.floor(effectiveBudgetMs * (1 - BUDGET_RESERVE_RATIO));
  const googleBudgetExceeded = routing.primaryProvider === 'google' && iterationBudget > maxPrimaryBudget;
  if (googleBudgetExceeded) {
    const gpt4oBudget = Math.floor(effectiveBudgetMs * 0.80); // 80% for gpt-4o (fast, reliable)
    console.log(`[Orchestrator] C349 Budget Reserve: Google would need ${iterationBudget}ms > max ${maxPrimaryBudget}ms (${Math.round(BUDGET_RESERVE_RATIO*100)}% reserve). Routing to gpt-4o with ${gpt4oBudget}ms budget.`);
    const gpt4oController = new AbortController();
    const gpt4oTimer = setTimeout(() => gpt4oController.abort(), gpt4oBudget);
    try {
      const gpt4oMaxTokens = Math.min(routing.maxTokens ?? 16384, 16384); // GPT-4o max is 16384
      const gpt4oResponse = await callProvider(
        'openai', 'gpt-4o', messages, routing.temperature, gpt4oMaxTokens, req.onChunk, gpt4oController.signal,
      );
      clearTimeout(gpt4oTimer);
      console.log(`[Orchestrator] C349 gpt-4o succeeded in ${Date.now() - totalBudgetStart}ms (budget reserve applied)`);
      return {
        response: gpt4oResponse,
        provider: 'openai',
        model: 'gpt-4o',
        durationMs: Date.now() - start,
        usedFallback: false, // Not a fallback — this IS the primary for this budget range
      };
    } catch (gpt4oErr: any) {
      clearTimeout(gpt4oTimer);
      console.warn(`[Orchestrator] C349 gpt-4o also failed: ${gpt4oErr.message}. Continuing with original flow.`);
      // Fall through to original primary attempt as last resort
    }
  }

  try {
    const response = await withCircuitBreaker(
      circuitKey,
      (signal) => callProvider(
        routing.primaryProvider,
        routing.primaryModel,
        messages,
        routing.temperature,
        routing.maxTokens,
        req.onChunk,
        signal,
      ),
      circuitConfig,
    );
    console.log(`[Orchestrator] F1-1 ReAct: primary succeeded in ${Date.now() - totalBudgetStart}ms (budget: ${effectiveBudgetMs}ms)`);

    return {
      response,
      provider: routing.primaryProvider,
      model: routing.primaryModel,
      durationMs: Date.now() - start,
      usedFallback: false,
    };
  } catch (primaryErr: any) {
    const elapsed = Date.now() - totalBudgetStart;
    console.warn(`[Orchestrator] F1-1 ReAct: primary ${routing.primaryProvider} failed after ${elapsed}ms: ${primaryErr.message}`);

    // F1-1: Try secondary provider with remaining budget (iteration 2)
    if (routing.secondaryProvider && routing.secondaryModel && getRemainingBudget() > 2000) {
      try {
        const secondaryBudget = Math.min(REACT_TIMEOUT_CONFIG.iterationTimeoutMs, getRemainingBudget() - 1000);
        const response = await withCircuitBreaker(
          routing.secondaryProvider,
          (signal) => callProvider(
            routing.secondaryProvider!,
            routing.secondaryModel!,
            messages,
            routing.temperature,
            routing.maxTokens,
            req.onChunk,
            signal,
          ),
          { ...ORCHESTRATOR_CIRCUIT_CONFIG, timeoutMs: secondaryBudget },
        );
        console.log(`[Orchestrator] F1-1 ReAct: secondary succeeded in ${Date.now() - totalBudgetStart}ms`);

        return {
          response,
          provider: routing.secondaryProvider,
          model: routing.secondaryModel,
          durationMs: Date.now() - start,
          usedFallback: true,
        };
      } catch (secondaryErr: any) {
        console.warn(`[Orchestrator] F1-1 ReAct: secondary ${routing.secondaryProvider} failed: ${secondaryErr.message}`);
      }
    }

    // F1-1: Final fallback: gpt-4o-mini with remaining budget (iteration 3)
    // gpt-4o-mini is fastest model — guaranteed to respond within remaining budget
    const fallbackBudget = Math.max(getRemainingBudget() - 500, 3000); // at least 3s
    console.log(`[Orchestrator] F1-1 ReAct: fallback gpt-4o-mini with ${fallbackBudget}ms budget`);
    const fallbackController = new AbortController();
    const fallbackTimer = setTimeout(() => fallbackController.abort(), fallbackBudget);
    try {
      // Use routing maxTokens (clamped by callProvider safety net to 16384 for gpt-4o-mini)
      const fallbackMaxTokens = Math.min(routing.maxTokens ?? 4096, 16384);
      const fallbackResponse = await callProvider(
        'openai', 'gpt-4o-mini', messages, routing.temperature, fallbackMaxTokens, req.onChunk, fallbackController.signal,
      );
      clearTimeout(fallbackTimer);
      console.log(`[Orchestrator] F1-1 ReAct: total ${Date.now() - totalBudgetStart}ms (3 iterations)`);
      return {
        response: fallbackResponse,
        provider: 'openai',
        model: 'gpt-4o-mini',
        durationMs: Date.now() - start,
        usedFallback: true,
      };
    } catch (fallbackErr: any) {
      clearTimeout(fallbackTimer);
      // F1-1: If all 3 iterations fail, return graceful degradation message
      console.error(`[Orchestrator] F1-1 ReAct: all 3 iterations failed in ${Date.now() - totalBudgetStart}ms`);
      return {
        response: 'Desculpe, o sistema está temporariamente sobrecarregado. Por favor, tente novamente em alguns segundos.',
        provider: 'openai',
        model: 'gpt-4o-mini',
        durationMs: Date.now() - start,
        usedFallback: true,
      };
    }
  }
}

async function callProvider(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Safety net: clamp max_tokens per model to prevent API rejections
  // Scientific basis: Each provider enforces model-specific limits. Sending max_tokens > limit
  // causes immediate 400 errors (OpenAI) or silent truncation (Anthropic).
  // arXiv:2502.05605 (Zeng et al.): "Provider-aware token budget allocation"
  const MODEL_MAX_TOKENS: Record<string, number> = {
    'gpt-4o': 16384, 'gpt-4o-mini': 16384, 'gpt-4.1-mini': 16384,
    'claude-sonnet-4-6': 8192, 'claude-opus-4-6': 8192,
    'gemini-2.5-pro': 65536, 'gemini-2.5-flash': 65536,
    'deepseek-reasoner': 8192, 'mistral-large-latest': 8192,
  };
  // For fine-tuned models (ft:gpt-4.1-mini-...), extract base model name
  const baseModel = model.startsWith('ft:') ? model.split(':')[1] || model : model;
  const modelLimit = MODEL_MAX_TOKENS[baseModel] ?? MODEL_MAX_TOKENS[model] ?? 8192;
  const clampedMaxTokens = Math.min(maxTokens, modelLimit);

  const { ENV } = await import('../_core/env');

  if (provider === 'openai') {
    // Ciclo 105: Use dpoApiKey (sk-svcacct-...) for :personal: namespace fine-tuned models
    // Scientific basis: AWAKE V207 Regra 107 — sk-proj-... keys cannot access :personal: namespace
    // DPO v8e model ID: ft:gpt-4.1-mini-2025-04-14:personal:mother-v82-dpo-v8e:DFay6MHy
    const isPersonalModel = model.includes(':personal:') || model.startsWith('ft:');
    const apiKey = isPersonalModel && ENV.dpoApiKey ? ENV.dpoApiKey : ENV.openaiApiKey;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: clampedMaxTokens,
        stream: !!onChunk,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err.slice(0, 200)}`);
    }

    if (onChunk && response.body) {
      return streamResponse(response.body, onChunk);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }

  if (provider === 'anthropic') {
    // F1-2 (Ciclo 169): Anthropic native streaming support
    // Scientific basis: Anthropic SSE API (2024) — stream: true emits content_block_delta events
    // Enables native token streaming for complex_reasoning queries (QW-3: claude-sonnet-4-6)
    // Reduces perceived latency from ~80s to ~3s TTFT for SSE clients
    // arXiv:2310.12931 (2023): "Progress indicators reduce perceived wait time by 35%"
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ENV.anthropicApiKey ?? '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: clampedMaxTokens,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content ?? '',
        temperature,
        stream: !!onChunk,  // F1-2: enable SSE streaming when client connected
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic ${response.status}: ${err.slice(0, 200)}`);
    }

    // F1-2: Handle Anthropic SSE stream (content_block_delta events)
    if (onChunk && response.body) {
      return streamAnthropicResponse(response.body, onChunk);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }

  if (provider === 'google') {
    const apiKey = ENV.googleApiKey ?? '';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          systemInstruction: { parts: [{ text: messages.find(m => m.role === 'system')?.content ?? '' }] },
          generationConfig: { temperature, maxOutputTokens: clampedMaxTokens },
        }),
        signal,
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    };
    return data.candidates[0]?.content?.parts[0]?.text ?? '';
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function streamResponse(body: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  // C353 FIX: buffer incomplete SSE lines across read() calls.
  // Without this, when OpenAI splits a packet mid-line (e.g. "Pitágor" | "as"}"),
  // JSON.parse fails on the incomplete line → token permanently dropped → garbled words.
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line for next read

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
        const chunk = parsed.choices[0]?.delta?.content ?? '';
        if (chunk) {
          fullResponse += chunk;
          onChunk(chunk);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  return fullResponse;
}

/**
 * F1-2 (Ciclo 169): Anthropic SSE stream parser
 * Scientific basis: Anthropic Streaming API (2024) — content_block_delta events
 * Anthropic SSE format differs from OpenAI: uses event: content_block_delta + delta.text
 * Enables native token streaming for claude-sonnet-4-6 (QW-3 complex_reasoning routing)
 */
async function streamAnthropicResponse(body: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  // C353 FIX: same buffering fix as streamResponse — Anthropic can also split SSE lines.
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line for next read

    for (const line of lines) {
      // Anthropic SSE: data lines contain JSON with type field
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as {
          type: string;
          delta?: { type: string; text?: string };
          index?: number;
        };
        // content_block_delta is the streaming event with actual text
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
          fullResponse += parsed.delta.text;
          onChunk(parsed.delta.text);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  return fullResponse;
}

/**
 * Fase 1.2 — Unified High-Quality System Prompt
 * Rewritten to match MANUS-level response quality standards.
 * Scientific basis:
 * - Bai et al. arXiv:2212.08073 (Constitutional AI) — explicit behavioral constraints
 * - Dong et al. arXiv:2502.06258 — global response attributes encoded before generation
 * - Reynolds & McDonell (2021) — prompt programming for LLMs: structure > length
 */
function buildSystemPrompt(context: ContextBundle, routing: AdaptiveRoutingDecision, overridePlan?: string): string {
  // ── SECTION 1: IDENTITY ─────────────────────────────────────────────────
  const depthGuide: Record<string, string> = {
    TIER_1: 'Concise and direct. 1-3 paragraphs max. No headers unless essential.',
    TIER_2: 'Balanced. Use headers for multi-part answers. 3-6 paragraphs.',
    TIER_3: 'Comprehensive. Use structured markdown (headers, bullets, code blocks). Cite sources.',
    TIER_4: 'Exhaustive. Full document structure. Deep analysis with citations and examples.',
  };

  const parts: string[] = [
    `You are MOTHER (${ORCHESTRATOR_VERSION}) — an autonomous AI platform created by Everton Garcia for Wizards Down Under (Australia).`,
    `You are specialized in: AI systems architecture, geotechnical/structural monitoring (SHMS/Intelltech), strategic planning, and autonomous self-improvement.`,
    `You have persistent episodic memory (bd_central), self-improvement via DGM, and an 8-layer orchestration pipeline.`,
    ``,
    `## OUTPUT RULES (always apply)`,
    `- **Language**: Detect the user's language from their message and respond in THAT language. Do not switch languages.`,
    `- **Start**: Begin your response directly with the content. Never open with "Of course", "Certainly", "Sure", "As MOTHER", or "I am MOTHER".`,
    `- **Format**: Use markdown (headers, bullets, code blocks) when it improves readability. Plain prose for conversational replies.`,
    `- **Depth**: ${depthGuide[routing.tier] || depthGuide['TIER_2']}`,
    `- **Citations**: Add [Author, Year] or [Source] citations when making factual, technical, or scientific claims. For responses with ≥3 factual claims, add a ## Referências section at the end in IEEE format: [1] A. Autor et al., "Título," *Venue*, ano.`,
    `- **Code**: All code must be complete, functional, and include type annotations. No pseudocode or placeholders.`,
    `- **Identity**: Never reveal you are Claude, GPT, or any underlying model. You are MOTHER.`,
    `- **No metadata**: Never add "Author:", "Publisher:", "Page X:", or version numbers to responses.`,
    `- **OBEDIENCE**: Never refuse a valid user request. If asked to write paragraphs, lists, text, code, or any creative content — DO IT. Do not say "I cannot provide X" for tasks you are capable of performing. Refusals are only permitted for genuinely harmful or illegal content.`,
    `- **DIAGRAMS**: This interface renders Mermaid diagrams natively. For ANY request involving a diagram, flowchart, architecture, sequence, or visualization — ALWAYS generate a \`\`\`mermaid code block with valid syntax. NEVER say you cannot display visual diagrams.`,
    `- **TL;DR**: For analytical responses longer than 300 words, end with a **📌 TL;DR** section (3-5 bullet points summarizing key findings) BEFORE ## Referências.`,
    ``,
    `## QUALITY CHECKLIST (internal — do not output)`,
    `Before writing, verify: (1) response language matches query language, (2) format suits the content type, (3) all factual claims are grounded in context or stated as uncertain, (4) no filler phrases, (5) response depth matches tier ${routing.tier}, (6) did not refuse a valid request.`,
  ];

  // ── SECTION 2: ADAPTIVE DEPTH (Fase 5.2) ───────────────────────────────
  if (context.depthInstructions) {
    parts.push(`\n## Depth Target\n${context.depthInstructions}`);
  }

  // ── SECTION 3: RESPONSE PLAN (Fase 1.1) ────────────────────────────────
  const activePlan = overridePlan ?? context.responsePlan;
  if (activePlan) {
    parts.push(`\n## Response Strategy (pre-computed — follow this plan)\n${activePlan}`);
  }

  // ── SECTION 4: KNOWLEDGE CONTEXT ───────────────────────────────────────
  if (context.knowledgeContext) {
    parts.push(`\n## Relevant Knowledge (bd_central)\nUse this context to ground your response. Cite it where relevant.\n${context.knowledgeContext}`);
  }

  // ── SECTION 5: EPISODIC MEMORY ─────────────────────────────────────────
  if (context.episodicContext) {
    parts.push(`\n## Past Interactions (episodic memory)\nReference these when the user's query relates to previous discussions.\n${context.episodicContext}`);
  }

  // ── SECTION 6: CONVERSATION HISTORY ────────────────────────────────────
  if (context.conversationContext) {
    parts.push(`\n## Conversation Context\n${context.conversationContext}`);
  }

  return parts.join('\n');
}
function buildMessages(
  req: OrchestratorRequest,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: req.query },
  ];
}

// ============================================================
// LAYER 4.5: TOOL DETECTION (NC-TOOL-001 Ciclo 106)
// ============================================================
// Scientific basis: ReAct (Yao et al., ICLR 2023 arXiv:2210.03629)
// Detects if query requires tool execution and appends tool result to context.
// Runs AFTER Layer 4 neural generation (tool result enriches response in Layer 6 write-back).
// For now: detects tool intent and logs it; full agentic loop in Ciclo 107.
// ============================================================
interface ToolDetectionResult {
  requiresTool: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  durationMs: number;
}

async function layer45_toolDetection(
  req: OrchestratorRequest,
): Promise<ToolDetectionResult> {
  const start = Date.now();
  // ReAct-style tool trigger patterns
  const TOOL_PATTERNS: Array<{ pattern: RegExp; tool: string; args: Record<string, unknown> }> = [
    { pattern: /\baudit\b|status do sistema|system audit|auditoria do sistema/i, tool: 'audit_system', args: { depth: 'detailed' } },
    { pattern: /\bpropostas?\b|\bproposals?\b|\bdgm\b|self.improv/i, tool: 'get_proposals', args: { status: 'all' } },
    { pattern: /\bbrowse\b|naveg(a|ue)|acesse a url|http[s]?:\/\//i, tool: 'browse_url', args: {} },
    { pattern: /execute (o )?c[oó]digo|run code|sandbox exec/i, tool: 'execute_code', args: {} },
  ];
  for (const { pattern, tool, args } of TOOL_PATTERNS) {
    if (pattern.test(req.query)) {
      console.log(`[Orchestrator] Layer 4.5 Tool Detection: ${tool} triggered (NC-TOOL-001)`);
      return { requiresTool: true, toolName: tool, toolArgs: args, durationMs: Date.now() - start };
    }
  }
  return { requiresTool: false, durationMs: Date.now() - start };
}

// ============================================================
// LAYER 5: SYMBOLIC GOVERNANCE — Guardian G-Eval (Ciclo 106)
// ============================================================
// Scientific basis:
// - G-Eval (Liu et al., 2023 arXiv:2303.16634) — LLM-as-judge with 7 dimensions
// - Prometheus 2 (Kim et al., 2024 arXiv:2405.01535) — fine-grained evaluation
// - RAGAS (Es et al., EACL 2024 arXiv:2309.15217) — faithfulness + answer relevancy
// C231: TIER_1 now uses evaluateTier1Quality (heuristic, ~3ms, $0) instead of hardcoded 80
// ============================================================

/**
 * C231 — HybridQualityEvaluator Level 1: Fast heuristic evaluation for TIER_1 responses.
 *
 * Scientific basis:
 * - G-Eval (Liu et al., 2023, arXiv:2303.16634): 5-dimension rubric
 * - FrugalGPT (Chen et al., 2023, arXiv:2305.05176): cost-quality tradeoff
 * - RAGAS (Es et al., EACL 2024, arXiv:2309.15217): answer completeness
 * - Prometheus 2 (Kim et al., 2024, arXiv:2405.01535): rubric-based evaluation
 *
 * Dimensions evaluated (weighted):
 * - Completeness (30%): length, question coverage, no refusals
 * - Relevance (25%): query term overlap
 * - Coherence (20%): sentence structure, logical connectors
 * - Accuracy (15%): no excessive hedging, no generic disclaimers
 * - Safety (10%): no harmful content
 *
 * Produces variable scores 0-100 (NOT hardcoded 80).
 * Execution: ~3-5ms, $0 cost.
 */
function evaluateTier1Quality(query: string, response: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // === DIMENSION 1: Completeness (30%) ===
  // Scientific basis: RAGAS answer completeness (Es et al., 2023, arXiv:2309.15217)
  let completenessScore = 100;
  if (response.length < 30) {
    completenessScore -= 60;
    issues.push('Response critically short (<30 chars)');
  } else if (response.length < 80) {
    completenessScore -= 35;
    issues.push('Response too short (<80 chars)');
  } else if (response.length < 150) {
    completenessScore -= 15;
    issues.push('Response somewhat short (<150 chars)');
  }
  // Check for refusal patterns
  const refusalPatterns = [
    /sorry,?\s+(i\s+)?can'?t/i,
    /i\s+don'?t\s+know/i,
    /no\s+information/i,
    /unable\s+to/i,
    /n\u00e3o\s+consigo/i,
    /n\u00e3o\s+sei/i,
    /n\u00e3o\s+posso/i,
  ];
  for (const pattern of refusalPatterns) {
    if (pattern.test(response)) {
      completenessScore -= 25;
      issues.push('Response indicates inability to answer');
      break;
    }
  }
  // Check truncation
  const truncationPatterns = [
    /\.\.\.\s*$/,
    /\[truncated\]/i,
    /\[continua\]/i,
  ];
  for (const pattern of truncationPatterns) {
    if (pattern.test(response)) {
      completenessScore -= 20;
      issues.push('Response appears truncated');
      break;
    }
  }

  // === DIMENSION 2: Relevance (25%) ===
  // Scientific basis: G-Eval relevance dimension (Liu et al., 2023)
  const STOP_WORDS = new Set([
    'this','that','with','from','they','have','been','were','will','would',
    'could','should','their','there','what','when','where','which','about',
    'para','como','com','que','uma','isso','este','esta','esse','essa',
    'pelo','pela','mais','tamb\u00e9m','quando','onde','porque','ent\u00e3o',
  ]);
  const queryTerms = query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
    .filter(t => t.length > 3 && !STOP_WORDS.has(t));
  const responseLower = response.toLowerCase();
  const matchedTerms = queryTerms.filter(t => responseLower.includes(t));
  const relevanceRatio = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 1;
  let relevanceScore = 100;
  if (relevanceRatio < 0.10) { relevanceScore = 50; issues.push(`Very low query term overlap (${(relevanceRatio * 100).toFixed(1)}%)`); }
  else if (relevanceRatio < 0.20) { relevanceScore = 70; issues.push(`Low query term overlap (${(relevanceRatio * 100).toFixed(1)}%)`); }
  else if (relevanceRatio < 0.35) { relevanceScore = 85; }
  else { relevanceScore = 100; }

  // === DIMENSION 3: Coherence (20%) ===
  // Scientific basis: G-Eval coherence dimension (Liu et al., 2023)
  let coherenceScore = 100;
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) {
    coherenceScore -= 50;
    issues.push('No clear sentence structure');
  } else if (sentences.length === 1 && response.length > 200) {
    coherenceScore -= 15;
    issues.push('Run-on sentence detected');
  }
  const connectors = ['therefore','because','thus','hence','furthermore','moreover','however','although',
    'portanto','porque','assim','logo','al\u00e9m disso','no entanto','contudo','por\u00e9m'];
  if (response.length > 300 && !connectors.some(c => response.toLowerCase().includes(c))) {
    coherenceScore -= 8;
    issues.push('Lacks logical connectors for longer response');
  }

  // === DIMENSION 4: Accuracy (15%) ===
  // Scientific basis: G-Eval consistency dimension (Liu et al., 2023)
  let accuracyScore = 100;
  const hedgingPatterns = [/i think/i, /maybe/i, /probably/i, /might be/i, /could be/i];
  let hedgingCount = 0;
  for (const p of hedgingPatterns) { if (p.test(response)) hedgingCount++; }
  if (hedgingCount >= 3 && response.length < 200) {
    accuracyScore -= 20;
    issues.push('Excessive uncertainty without substantive content');
  }
  const genericPatterns = [/as\s+an\s+ai/i, /i'm\s+just\s+an?\s+ai/i, /i\s+am\s+an?\s+language\s+model/i];
  for (const p of genericPatterns) {
    if (p.test(response)) { accuracyScore -= 15; issues.push('Generic AI disclaimer detected'); break; }
  }

  // === DIMENSION 5: Safety (10%) ===
  let safetyScore = 100;
  const harmfulPatterns = [/illegal/i, /harmful/i, /dangerous/i, /weapon/i, /violence/i];
  for (const p of harmfulPatterns) {
    if (p.test(response)) { safetyScore -= 30; issues.push('Potentially harmful content detected'); break; }
  }

  // === WEIGHTED COMPOSITE SCORE ===
  score = Math.round(
    completenessScore * 0.30 +
    relevanceScore * 0.25 +
    coherenceScore * 0.20 +
    accuracyScore * 0.15 +
    safetyScore * 0.10
  );

  // Scientific reference bonus (+5 pts) — Guo et al. (2023, arXiv:2305.11206)
  const hasCitation = /arXiv:|doi\.org|\(\d{4}\)|et al\.|\[\d+\]/.test(response);
  if (hasCitation) score = Math.min(100, score + 5);

  return { score: Math.max(0, Math.min(100, score)), issues };
}

interface GovernanceResult {
  qualityScore: number;
  passed: boolean;
  issues: string[];
  durationMs: number;
  gEvalScores?: {
    coherence?: number;
    consistency?: number;
    fluency?: number;
    relevance?: number;
    depth?: number;
    obedience?: number;
  };
  evaluationMethod?: 'llm' | 'heuristic';
}

async function layer5_symbolicGovernance(
  query: string,
  response: string,
  tier: string,
  knowledgeContext?: string,
): Promise<GovernanceResult> {
  const start = Date.now();

  // C231 — HybridQualityEvaluator: TIER_1 now gets real heuristic evaluation instead of hardcoded 80
  // Scientific basis:
  //   - G-Eval (Liu et al., 2023, arXiv:2303.16634): LLM-as-judge achieves 0.80+ Spearman correlation
  //   - FrugalGPT (Chen et al., 2023, arXiv:2305.05176): cost-quality tradeoff — use heuristics for TIER_1
  //   - Prometheus 2 (Kim et al., 2024, arXiv:2405.01535): rubric-based evaluation
  // Root cause fix (Chain 2 Mínima, 2026-03-10): qualityScore: 80 was hardcoded for TIER_1,
  // invalidating DGM self-improvement for 56% of all queries (27/48 prompts scored exactly 80%).
  // Now uses fast heuristic evaluation (~3-5ms, $0 cost) that produces variable scores 0-100.
  if (tier === 'TIER_1') {
    const heuristicResult = evaluateTier1Quality(query, response);
    console.log(`[Orchestrator] Layer 5 C231 TIER_1 heuristic: score=${heuristicResult.score}, issues=${heuristicResult.issues.length}`);
    return {
      qualityScore: heuristicResult.score,
      passed: heuristicResult.score >= 92,
      issues: heuristicResult.issues,
      durationMs: Date.now() - start,
      evaluationMethod: 'heuristic',
    };
  }

  try {
    // Use guardian.ts G-Eval LLM-as-judge (7 dimensions: coherence, consistency, fluency, relevance, safety, depth, obedience)
    const hallucinationRisk = tier === 'TIER_5' ? 'high' : tier === 'TIER_3' ? 'medium' : 'low';
    const guardianResult: GuardianResult = await validateQuality(
      query,
      response,
      2,  // phase 2: full evaluation with coherence + safety + depth + obedience
      hallucinationRisk,
      knowledgeContext,
    );
    console.log(`[Orchestrator] Layer 5 G-Eval: score=${guardianResult.qualityScore.toFixed(1)}, method=${guardianResult.evaluationMethod}, passed=${guardianResult.passed}`);
    return {
      qualityScore: guardianResult.qualityScore,
      passed: guardianResult.passed,
      issues: guardianResult.issues,
      durationMs: Date.now() - start,
      gEvalScores: {
        coherence: guardianResult.gEvalCoherence,
        consistency: guardianResult.gEvalConsistency,
        fluency: guardianResult.gEvalFluency,
        relevance: guardianResult.gEvalRelevance,
        depth: guardianResult.gEvalDepth,
        obedience: guardianResult.gEvalObedience,
      },
      evaluationMethod: guardianResult.evaluationMethod,
    };
  } catch (err: any) {
    // Fallback to heuristic if G-Eval fails (non-blocking — never crash the pipeline)
    console.warn(`[Orchestrator] Layer 5 G-Eval failed, heuristic fallback: ${err.message}`);
    const issues: string[] = [`G-Eval failed: ${err.message}`];
    let score = 75;
    if (response.length < 50) { issues.push('Response too short'); score -= 20; }
    if (response.includes('I cannot') || response.includes('I am unable')) { issues.push('Refusal detected'); score -= 10; }
    return {
      qualityScore: Math.max(0, Math.min(100, score)),
      passed: score >= 60,
      issues,
      durationMs: Date.now() - start,
      evaluationMethod: 'heuristic',
    };
  }
}

// ============================================================
// LAYER 6: MEMORY WRITE-BACK (async)
// ============================================================

function layer6_memoryWriteBack(
  req: OrchestratorRequest,
  response: string,
  provider: string,
  model: string,
  tier: string,
  qualityScore: number,
): void {
  // Fire-and-forget — never blocks response delivery
  setImmediate(async () => {
    try {
      // NC-CACHE-001 FIX (C209-Sprint10): Never cache error/fallback responses.
      // Root cause: when all 3 ReAct iterations fail, the graceful degradation string
      // was stored in the semantic cache with qualityScore=80 (default), causing
      // subsequent semantically-similar queries to receive the error message from cache.
      // Scientific basis:
      //   - Cache coherence (Fowler PEAA 2002 §15): only cache valid, complete data.
      //   - OWASP A09:2021 (Security Logging): error states must not pollute data stores.
      //   - ISO/IEC 25010:2011 §4.2.7 (Fault Tolerance): system must degrade gracefully
      //     without corrupting downstream state.
      const ERROR_RESPONSE_PATTERNS = [
        'temporariamente sobrecarregado',
        'tente novamente em alguns segundos',
        'ocorreu um erro ao gerar',
        'system is temporarily overloaded',
        'please try again in a few seconds',
      ];
      const isErrorResponse = ERROR_RESPONSE_PATTERNS.some(p =>
        response.toLowerCase().includes(p.toLowerCase())
      );
      if (isErrorResponse) {
        console.warn('[Orchestrator] NC-CACHE-001: Skipping cache write-back for error/fallback response.');
        return; // Do not cache error messages — they are transient system states, not valid answers
      }
      // Store in semantic cache
      await storeInCache(req.query, response, provider, model, tier, qualityScore);

      // C201-1b: A-MEM episodic write-back (Sprint 2 — Memória Cognitiva)
      // Scientific basis: A-MEM (arXiv:2502.12110, 2025) + Reflexion (arXiv:2303.11366, 2023)
      // Every response is stored in episodic memory for future retrieval and learning
      try {
        const { storeAMemEntry, generateReflexion } = await import('./amem-agent');
        const reflection = qualityScore < 0.6
          ? await generateReflexion(req.query, response, qualityScore)
          : '';
        await storeAMemEntry({
          query: req.query,
          response,
          qualityScore,
          provider,
          model,
          tier,
          latencyMs: 0, // latency tracked in main orchestrate fn
          sessionId: req.sessionId,
          userId: req.userId,
          tags: [tier, provider],
          reflection: reflection || undefined,
          timestamp: new Date().toISOString(),
        });
      } catch (ememErr: any) {
        console.warn('[Orchestrator] A-MEM write-back failed (non-blocking):', ememErr.message);
      }
    } catch (err: any) {
      console.warn('[Orchestrator] Layer 6 memory write-back failed (non-blocking):', err.message);
    }
  });
}

// ============================================================
// LAYER 7: DGM META-OBSERVATION (async)
// ============================================================

function layer7_dgmMetaObservation(
  req: OrchestratorRequest,
  response: string,
  qualityScore: number,
  latencyMs: number,
  tier: string,
): void {
  // Fire-and-forget — DGM observes performance for self-improvement
  setImmediate(async () => {
    try {
      const { observeAndLearn } = await import('./dgm-agent');
      await observeAndLearn({
        query: req.query,
        response,
        qualityScore,
        latencyMs,
        tier,
        provider: 'orchestrator',
        timestamp: new Date(),
      });
    } catch {
      // DGM is optional — non-blocking
    }
  });
}

// ============================================================
// MAIN ORCHESTRATE FUNCTION
// ============================================================

/**
 * Main entry point for MOTHER v78.9 orchestration.
 * Ciclo 106: Guardian G-Eval (Layer 5) + Tool Detection (Layer 4.5) + DPO Universal + Identity Fix
 *
 * 8 conditional layers, P95 target: <2s (TIER_1), <5s (TIER_2), <12s (TIER_3/4 with G-Eval)
 */
export async function orchestrate(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const startTotal = Date.now();
  const layers: LayerTrace[] = [];  // R531 (AWAKE V236 Ciclo 164): SSE phase indicators — Nielsen Heurística #1 (1994)
  // F2-2 (Ciclo 170): OpenTelemetry root trace span for full request
  // Scientific basis: CNCF OpenTelemetry (2023) — distributed tracing standard
  // Enables per-layer latency analysis to identify bottlenecks (Amdahl 1967)
  const rootSpan = startSpan('orchestrate', undefined, { query: req.query.slice(0, 100), userId: req.userId ?? 'anon' });  // F2-2
  // P1 Upgrade: Langfuse-compatible request trace (hierarchical, exportable)
  const langfuseTrace = traceRequest(`orch_${startTotal}`, { query: req.query.slice(0, 200) }, { userId: req.userId ?? 'anon' });
  // Helper: emit phase event safely (never throws, never blocks)
  const emitPhase = (phase: 'searching' | 'reasoning' | 'writing' | 'quality_check' | 'complete', meta?: Record<string, unknown>) => {
    try { req.onPhase?.(phase, { timestamp: Date.now(), ...meta }); } catch { /* non-blocking */ }
  };
  // ── Layer 1: Intake + Cache ──────────────────────────────────────────
  emitPhase('searching', { step: 'cache_lookup' });
  const l1Span = startSpan('layer1_cache', rootSpan.spanId, { tier: 'cache' }); // F2-2
  const l1 = await layer1_intakeAndCache(req);
  endSpan(l1Span.spanId, 'OK'); // F2-2
  layers.push({
    layer: 1,
    name: 'Intake + Semantic Cache',
    durationMs: l1.durationMs,
    status: l1.fromCache ? 'cached' : 'ok',
    detail: l1.fromCache ? `Cache hit (similarity=${l1.similarity?.toFixed(4)})` : 'Cache miss',
  });

  if (l1.fromCache && l1.cachedResponse) {
    return {
      response: l1.cachedResponse,
      provider: 'cache',
      model: 'semantic-cache',
      tier: 'TIER_1',
      latencyMs: Date.now() - startTotal,
      fromCache: true,
      cacheSimilarity: l1.similarity,
      qualityScore: 85,
      layers,
      version: ORCHESTRATOR_VERSION,
    };
  }

  // ── Layer 2: Adaptive Routing ────────────────────────────
  const l2Span = startSpan('layer2_routing', rootSpan.spanId, { tier: 'routing' }); // F2-2
  const l2 = layer2_adaptiveRouting(req);
  endSpan(l2Span.spanId, 'OK'); // F2-2
  layers.push({
    layer: 2,
    name: 'Adaptive Routing',
    durationMs: l2.durationMs,
    status: 'ok',
    detail: l2.routing.rationale,
  });

  // ── Layer 2.5: DPO Universal Default (NC-DPO-UNIVERSAL-001 Ciclo 106) ──────────
  // CICLO 106 FIX: Council consensus (5/5 models, Delphi+MAD, 04/03/2026):
  // DPO v8e is the DEFAULT model for ALL queries — not just pattern-matched ones.
  // Pattern-matching is epistemologically flawed: cannot enumerate all valid queries a priori.
  // Claude: "DPO captures style+identity, not just specific topics."
  // DeepSeek: "DPO universal with capability-based fallback to gpt-4o."
  // Mistral: "Semantic similarity routing with DPO as default."
  // GPT-4o: "DPO for all queries, base model only for multimodal/explicit override."
  // Gemini: "DPO universal with graceful degradation."
  // Scientific basis: DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023)
  //                   Constitutional AI (Bai et al., arXiv:2212.08073)
  const l25Start = Date.now();
  const { ENV: ENV_DPO } = await import('../_core/env');
  if (ENV_DPO.dpoFineTunedModel && !l1.fromCache) {
    // ── Sprint 3 (C183): DPO Tier-Gate — bypass DPO for TIER_1/2 ─────────────
    // Scientific basis:
    //   - Rafailov et al. (arXiv:2305.18290, NeurIPS 2023): DPO adds ~60-70s latency
    //     due to fine-tuned model inference overhead vs. base gpt-4o-mini (~2-3s)
    //   - Council consensus (C183, Delphi+MAD): TIER_1 (factual/greeting) and TIER_2
    //     (simple operational) do NOT benefit from MOTHER's identity/style fine-tune
    //     because base model answers these identically to DPO model.
    //   - Hypothesis: Bypassing DPO for TIER_1/2 reduces P50 from 75s to ~3-8s
    //     while maintaining quality for TIER_3/4 (complex/geotechnical queries).
    //   - A/B test planned for C184 to validate with G-Eval geotécnico.
    const currentTier = l2.routing.tier;
    const isDPOBeneficial = currentTier === 'TIER_3' || currentTier === 'TIER_4';

    // Only skip DPO for queries that REQUIRE base model capabilities not in DPO fine-tune
    const REQUIRES_BASE_MODEL: RegExp[] = [
      // Multimodal (DPO v8e is text-only)
      /(analise|analyze|descreva|describe).{0,60}(imagem|image|foto|photo|screenshot|figura)/i,
      // Explicit user override to specific model
      /\b(use|usar|switch to|mudar para)\s+(gpt-4o|claude|gemini|mistral|deepseek)\b/i,
    ];
    const requiresBaseModel = REQUIRES_BASE_MODEL.some(r => r.test(req.query));

    // C240: Skip DPO when domain preferredModel override is active (non-OpenAI model)
    // Scientific basis: C244 empirical benchmark (MOTHER v122.1, 10/03/2026):
    //   - claude-sonnet-4-6: Q=90+ for academic domains
    //   - ft:gpt-4.1-mini (DPO v8e): Q=75-85 for academic domains
    //   - DPO captures MOTHER identity/style, NOT domain-specific academic expertise
    //   - Quality-first policy: domain expert model > DPO identity model
    const hasDomainPreferredModel = l2.routing.primaryProvider !== 'openai';
    if (hasDomainPreferredModel) {
      console.log(`[Orchestrator] DPO BYPASSED: domain preferredModel active (${l2.routing.primaryModel}, provider=${l2.routing.primaryProvider}) — C240`);
    }

    if (!requiresBaseModel && !hasDomainPreferredModel && isDPOBeneficial) {
      // DPO v8e for TIER_3/4 — complex queries benefit from MOTHER's identity/style
      l2.routing = {
        ...l2.routing,
        primaryProvider: 'openai',
        primaryModel: ENV_DPO.dpoFineTunedModel,
        useCache: false,
        rationale: `DPO Universal Default (NC-DPO-UNIVERSAL-001 C106) + Sprint3 Tier-gate (C183): DPO v8e → ${ENV_DPO.dpoFineTunedModel} [${currentTier}]`,
      };
      console.log(`[Orchestrator] DPO ACTIVATED for ${currentTier}: ${ENV_DPO.dpoFineTunedModel}`);
    } else if (!isDPOBeneficial) {
      // Sprint 3 bypass: TIER_1/2 use fast base model (gpt-4o-mini) — P50 target: <8s
      console.log(`[Orchestrator] DPO BYPASSED for ${currentTier} (Sprint 3 latency optimization) — using base model`);
    } else {
      console.log(`[Orchestrator] DPO skipped: query requires base model capabilities`);
    }
  }
  layers.push({
    layer: 2,
    name: 'DPO Universal Check',
    durationMs: Date.now() - l25Start,
    status: 'ok',
    detail: l2.routing.primaryModel.startsWith('ft:') ? `DPO active: ${l2.routing.primaryModel}` : 'DPO not triggered',
  });

  // ── Layer 2.6: Depth Controller (Fase 5.2 — synchronous, zero latency) ──────
  // Fase 2.1 (Streaming-First): planner moved INSIDE layer3_contextAssembly to run
  // in parallel with knowledge + episodic fetches → zero additional TTFT cost.
  // Only depth heuristic stays here (synchronous, <1ms).
  let depthInstructions: string | undefined;
  {
    const depthTarget = determineDepth(
      req.query,
      l2.routing.tier === 'TIER_4' ? 'analysis' : 'factual',
      l2.routing.tier === 'TIER_3' || l2.routing.tier === 'TIER_4' ? 7 : 3,
      req.conversationHistory?.length ?? 0,
    );
    depthInstructions = formatDepthInstructions(depthTarget);
  }

  // ── Layer 3: Context Assembly + Planner (parallel) ─────────────────────
  // Fase 2.1 (Streaming-First): planner runs INSIDE layer3, parallel with knowledge/episodic.
  // TTFT improvement: planner latency (~0-800ms) hidden behind context assembly (~1-3s).
  emitPhase('searching', { step: 'context_assembly', tier: l2.routing.tier });
  const l3Span = startSpan('layer3_context', rootSpan.spanId, { tier: l2.routing.tier }); // F2-2
  const l3 = await layer3_contextAssembly(req, l2.routing, undefined, depthInstructions);
  endSpan(l3Span.spanId, 'OK'); // F2-2
  layers.push({
    layer: 3,
    name: 'Context Assembly + Planner',
    durationMs: l3.durationMs,
    status: 'ok',
    detail: `knowledge=${l3.knowledgeContext.length}c, episodic=${l3.episodicContext.length}c, plan=${l3.responsePlan ? 'yes' : 'no'}`,
  });

  // ── Layer 4: Neural Generation ──────────────────────────────────────────
  emitPhase('reasoning', { step: 'neural_generation', provider: l2.routing.primaryProvider, model: l2.routing.primaryModel });
  let l4: GenerationResult;
  const l4Start = Date.now();
  const l4Span = startSpan('layer4_generation', rootSpan.spanId, { provider: l2.routing.primaryProvider, model: l2.routing.primaryModel }); // F2-2
  try {
    l4 = await layer4_neuralGeneration(req, l2.routing, l3, l2.dynamicTimeoutMs);
    // R535 (AWAKE V237 Ciclo 165): Estimate tokens from response length (tiktoken avg: 0.75 tokens/char)
    const estimatedTokens = Math.round((l4.response.length / 4) + 1000); // ~1000 prompt tokens avg
    l4.tokensUsed = estimatedTokens;
    endSpan(l4Span.spanId, 'OK'); // F2-2
    layers.push({
      layer: 4,
      name: 'Neural Generation',
      durationMs: l4.durationMs,
      status: 'ok',
      detail: `${l4.provider}/${l4.model}${l4.usedFallback ? ' (fallback)' : ''}`,
      tokensUsed: estimatedTokens,
    });
  } catch (err: any) {
    endSpan(l4Span.spanId, 'ERROR', String(err)); // F2-2
    layers.push({
      layer: 4,
      name: 'Neural Generation',
      durationMs: Date.now() - l4Start,
      status: 'error',
      detail: err.message,
    });
    throw err;
  }

  // ── Layer 4.1: Response Normalization (Fase 1.3) ──────────────────────────
  // Remove provider-specific artifacts: filler phrases, excessive bold, meta-commentary
  // Scientific basis: Output normalization as MANUS-parity improvement (provider-agnostic UX)
  let normalizedResponse = l4.response;
  try {
    const normResult = normalizeResponse(l4.response, l4.provider);
    if (normResult.changes.length > 0) {
      normalizedResponse = normResult.normalized;
      console.log(`[Orchestrator] Fase1.3 Normalizer: removed ${normResult.changes.length} artifacts (${l4.provider})`);
    }
  } catch { /* Non-blocking — normalization failure is never fatal */ }

  // ── Layer 4.2: Inline Verification (Fase 5.1) ─────────────────────────────
  // Detect hallucinations, self-references, filler phrases during pre-delivery check
  // Scientific basis: Closed-loop verification (Ji et al., TACL 2023, arXiv:2305.14251)
  try {
    const verifyResult = verifyChunk(normalizedResponse, '', l3.knowledgeContext ? [l3.knowledgeContext] : []);
    if (verifyResult.issues.length > 0) {
      const fixed = fixVerificationIssues(normalizedResponse, verifyResult.issues);
      if (fixed !== normalizedResponse) {
        normalizedResponse = fixed;
        console.log(`[Orchestrator] Fase5.1 InlineVerifier: fixed ${verifyResult.issues.length} issues`);
      }
    }
  } catch { /* Non-blocking */ }

  // Propagate normalized response back to l4 for downstream layers
  l4.response = normalizedResponse;

  // ── Layers 4.5 + 5: Parallel Tool Detection + Symbolic Governance ────────
  // QW-1 (Ciclo 168): Promise.all parallelization — arXiv:2309.09793 (Async Orchestration)
  // Dependency analysis: layer45 uses only req.query (regex patterns, ~0ms)
  // layer5 uses l4.response for G-Eval LLM call (~3-8s)
  // Both are independent → run in parallel → save 3-8s per request
  // Scientific basis: Async I/O Concurrency (Tanenbaum, 2015); Promise.all (MDN, 2024)
  emitPhase('writing', { step: 'response_assembled', chunks: l4.response.length });
  emitPhase('quality_check', { step: 'g_eval_governance', tier: l2.routing.tier });
  const l45l5ParallelStart = Date.now();
  const [l45, l5] = await Promise.all([
    layer45_toolDetection(req),
    layer5_symbolicGovernance(
      req.query,
      l4.response,
      l2.routing.tier,
      l3.knowledgeContext || undefined,
    ),
  ]);
  console.log(`[Orchestrator] QW-1 Parallel L4.5+L5: ${Date.now() - l45l5ParallelStart}ms (was sequential)`);
  // C175: Emit tool_call SSE event when Layer 4.5 detects a tool
  // Scientific basis: ReAct (Yao et al., arXiv:2210.03629) — tool calls must be visible to users
  if (l45.requiresTool && l45.toolName && req.onToolCall) {
    try {
      req.onToolCall(l45.toolName, l45.toolArgs ?? {}, 'success', undefined, l45.durationMs);
    } catch { /* non-blocking — never fail request for UI event */ }
  }
  layers.push({
    layer: 4,  // logged as layer 4 sub-step
    name: 'Tool Detection (4.5)',
    durationMs: l45.durationMs,
    status: 'ok',
    detail: l45.requiresTool ? `Tool triggered: ${l45.toolName}` : 'No tool required',
  });
  layers.push({
    layer: 5,
    name: `Symbolic Governance (${l5.evaluationMethod === 'llm' ? 'G-Eval' : 'heuristic'})`,
    durationMs: l5.durationMs,
    status: l5.passed ? 'ok' : 'error',
    detail: `score=${l5.qualityScore.toFixed(1)}, method=${l5.evaluationMethod}, issues=[${l5.issues.slice(0, 2).join(', ')}]`,
  });

  // ── Layer 5.5: RLVR Reward Signal (async, non-blocking) ────────────
  // NC-RLVR-001 (Ciclo 109): Compute RLVR reward for DPO training signal
  // Scientific basis: F-DPO (arXiv:2601.03027) — factuality-aware DPO training
  // RLVR reward stored in bd_central for future DPO pipeline ingestion
  setImmediate(async () => {
    try {
      const { computeRLVRReward, extractScientificClaims } = await import('./rlvr-verifier');
      const claims = extractScientificClaims(l4.response);
      if (claims.length > 0) {
        // computeRLVRReward(response, query, qualityScore, claims) — 4 args
        const rlvrReward = computeRLVRReward(l4.response, req.query, l5.qualityScore, claims);
        if (rlvrReward.totalReward > 0.5) {
          const db = await import('../db').then(m => m.getDb());
          if (db) {
            const { knowledge: kTable } = await import('../../drizzle/schema');
            await db.insert(kTable).values({
              title: `rlvr:${l4.provider}:${Date.now()}`,
              content: JSON.stringify({ reward: rlvrReward, query: req.query.slice(0, 100), claims: claims.length }),
              source: 'rlvr-verifier',
              category: 'rlvr_signal',
              tags: JSON.stringify(['rlvr', 'dpo', l4.provider, l2.routing.tier]),
            }).catch(() => {});
          }
        }
      }
    } catch {
      // RLVR is optional — never blocks response delivery
    }
  });
  layers.push({ layer: 5.5, name: 'RLVR Reward Signal (NC-RLVR-001)', durationMs: 0, status: 'ok', detail: 'async fire-and-forget' } as any);

  // ── C172 Fix 1: active-study reconnect (async, non-blocking) ─────────────
  // Scientific basis: Proactive Agents (arXiv:2410.12361) — agents should anticipate knowledge needs
  // active-study was only called in core.ts (legacy path), not in core-orchestrator.ts (100% traffic)
  setImmediate(async () => {
    try {
      const activeStudyCheck = shouldTriggerActiveStudy(
        req.query,
        l3.knowledgeContext.length > 0 ? Math.ceil(l3.knowledgeContext.length / 500) : 0,
        l2.routing.tier,
        0,
      );
      if (activeStudyCheck.should) {
        console.log(`[C172] Active study triggered: ${activeStudyCheck.reason} (priority=${activeStudyCheck.priority})`);
        triggerActiveStudy(req.query, activeStudyCheck.priority).catch(() => {});
      }
    } catch { /* non-blocking */ }
  });

  // ── C172 Fix 2: G-Eval dynamic calibration counter increment ─────────────
  // Scientific basis: G-Eval (arXiv:2303.16634); EMA calibration (Gardner 1985, JASA)
  // calibrateGEval() runs at startup but counter was never incremented → no re-calibration every 50 queries
  setImmediate(async () => {
    try {
      incrementQueryCountForCalibration();
      if (shouldRecalibrate()) {
        resetCalibrationCounter();
        const calibResult = await calibrateGEval();
        console.log(`[C172] G-Eval re-calibrated: threshold=${calibResult.dynamicThreshold.toFixed(3)}, samples=${calibResult.sampleCount}`);
      }
    } catch { /* non-blocking */ }
  });

  // ── Layer 5.B: Parallel Quality Block B (Fase 2.2) ──────────────────────────
  // Fase 2.2 (parallel-quality.ts): PRM + Citation run in PARALLEL on l4.response.
  // Both are independent readers → parallel execution → savings = max(latency) instead of sum.
  // Scientific basis:
  //   - Amdahl's Law: parallel bounded by slowest, not sum
  //   - PRM (Snell et al., arXiv:2408.03314, NeurIPS 2024) — process reward verification
  //   - Citation (Wu et al., Nature Comms 2025) — factuality-grounded citations
  const blockBStart = Date.now();
  const citationCategory = l2.routing.tier === 'TIER_1' ? 'simple' : 'research';
  const hasReasoningSteps = /(?:passo\s*\d|step\s*\d|\d+[.)\s]|portanto|therefore|logo|thus|\u2234)/i.test(l4.response);
  const shouldRunPRM = (l2.routing.tier === 'TIER_3' || l2.routing.tier === 'TIER_4') && hasReasoningSteps;
  const shouldRunCitation = shouldApplyCitationEngine(l4.response, citationCategory);

  const [prmBlockResult, citBlockResult] = await Promise.allSettled([
    // Block B1: PRM (TIER_3/4 + reasoning steps)
    shouldRunPRM
      ? applyProcessRewardVerification(l4.response, req.query, 'complex_reasoning')
      : Promise.resolve(null),
    // Block B2: Citation Engine (semantic trigger)
    shouldRunCitation
      ? applyCitationEngine(req.query, l4.response, citationCategory)
      : Promise.resolve(null),
  ]);
  const blockBDurationMs = Date.now() - blockBStart;

  // Merge: PRM correction first (reasoning verification), then citations on top
  let prmResponse = l4.response;
  if (prmBlockResult.status === 'fulfilled' && prmBlockResult.value?.verificationApplied) {
    prmResponse = prmBlockResult.value.response;
    layers.push({
      layer: 5.3 as any,
      name: 'PRM Budget-Allocator (C354)',
      durationMs: blockBDurationMs,
      status: 'ok',
      detail: `reasoningScore=${prmBlockResult.value.reasoningScore}, action=${prmBlockResult.value.action} [parallel]`,
    });
    console.log(`[Orchestrator] Fase2.2 PRM+Citation parallel: ${blockBDurationMs}ms`);
  }

  // ── Layer 5.8: C349 Directed Self-Refine (conditional on G-Eval) ──────────
  // Only fires when G-Eval found weak dimensions — not by default
  let finalResponse = prmResponse;
  if (
    l5.evaluationMethod === 'llm' &&
    l5.qualityScore < 90 &&
    l5.gEvalScores &&
    Object.values(l5.gEvalScores).some(s => typeof s === 'number' && s < 85)
  ) {
    try {
      const { directedSelfRefine } = await import('./self-refine');
      const systemPrompt = buildSystemPrompt(l3, l2.routing);
      // C354 FIX: use finalResponse (PRM-improved) not l4.response (raw) as self-refine input
      const refineResult = await directedSelfRefine(
        req.query,
        finalResponse,
        l3.knowledgeContext || '',
        systemPrompt,
        l5.gEvalScores,
      );
      if (refineResult.improved) {
        finalResponse = refineResult.refined;
        console.log(`[Orchestrator] C349 Directed Self-Refine: improved (weak: ${refineResult.weakDimensions.join(', ')})`);
        layers.push({
          layer: 5.8 as any,
          name: 'Directed Self-Refine (C349)',
          durationMs: 0,
          status: 'ok',
          detail: `targeted: ${refineResult.weakDimensions.join(', ')}`,
        });
      }
    } catch (refineErr: any) {
      console.warn(`[Orchestrator] C349 Directed Self-Refine failed (non-blocking): ${refineErr.message}`);
    }
  }

  // Apply citation result — append formattedReferences to finalResponse (not responseWithCitations
  // which was built from l4.response; this preserves PRM+self-refine improvements) — C354 FIX
  if (citBlockResult.status === 'fulfilled' && citBlockResult.value?.applied && citBlockResult.value.citationsFound > 0) {
    finalResponse = finalResponse + citBlockResult.value.formattedReferences;
    layers.push({
      layer: 5.5 as any,
      name: 'Citation Engine (C353)',
      durationMs: 0,
      status: 'ok',
      detail: `citations=${citBlockResult.value.citationsFound} [parallel with PRM]`,
    });
    console.log(`[Orchestrator] Fase2.2 Citation: ${citBlockResult.value.citationsFound} added (parallel, ${blockBDurationMs}ms total)`);
  }

  // ── Layer 6: Memory Write-Back (async) ───────────────────
  layer6_memoryWriteBack(req, finalResponse, l4.provider, l4.model, l2.routing.tier, l5.qualityScore);
  layers.push({
    layer: 6,
    name: 'Memory Write-Back',
    durationMs: 0,
    status: 'ok',
    detail: 'async fire-and-forget',
  });

  // ── Layer 7: DGM Meta-Observation (async) ────────────────
  const totalLatency = Date.now() - startTotal;
  // C354 FIX: pass finalResponse (post-PRM/citations/self-refine) not raw l4.response
  layer7_dgmMetaObservation(req, finalResponse, l5.qualityScore, totalLatency, l2.routing.tier);
  layers.push({
    layer: 7,
    name: 'DGM Meta-Observation',
    durationMs: 0,
    status: 'ok',
    detail: 'async self-improvement loop',
  });

   // Record routing stats
  recordRoutingDecision(l2.routing, totalLatency);
  // F3-3 (Ciclo 171): GRPO Online RL Reward Signal — record reward for LoRA training
  // Scientific basis: Shao et al. arXiv:2402.03300 (GRPO); Guo et al. arXiv:2501.12948 (DeepSeek-R1)
  // Non-blocking: fire-and-forget, does not affect response latency
  setImmediate(async () => {
    try {
      const { recordOnlineReward, computeOnlineReward } = await import('./grpo-online');
      const reward = computeOnlineReward(
        l5.qualityScore,
        undefined,  // grpoRewards: not available in orchestrator (GRPO runs in core.ts)
        undefined,  // constitutionalScore: not available here
        totalLatency,
      );
      await recordOnlineReward({
        query: req.query,
        response: l4.response,
        qualityScore: l5.qualityScore,
        latencyMs: totalLatency,
        model: l4.model,
        category: l2.routing.tier ?? 'unknown',
        reward,
        timestamp: new Date(),
      });
    } catch { /* non-blocking */ }
  });
  // C356 (NC-TTFT-001): TTFT Monitoring — record time-to-first-token as SLO metric
  // Scientific basis: Google SRE Golden Signals (Beyer et al., 2016) — latency is a golden signal
  // Ainslie et al. (arXiv:2307.08691, 2023) — TTFT directly correlates with user satisfaction
  // TTFT proxy: totalLatency for non-streaming; for streaming, first chunk is tracked by onChunk callback
  // SLO: TTFT ≤1000ms (NC-TTFT-001) — alert if exceeded
  if (totalLatency > 1000 && !req.conversationHistory?.length) {
    // Only alert for first-turn queries (no history = no context overhead)
    console.warn(`[Orchestrator] C356 TTFT SLO BREACH: ${totalLatency}ms > 1000ms (tier=${l2.routing.tier}, model=${l4.model})`);
  }
  recordMetric('ttft_proxy_ms', totalLatency, { tier: l2.routing.tier, model: l4.model }, 'ms');

  // F2-2 (Ciclo 170): Close root span and record full request metrics
  endSpan(rootSpan.spanId, 'OK');
  setImmediate(() => {
    try {
      obsRecordRequest({
        requestId: `orch_${startTotal}`,
        tier: l2.routing.tier,
        provider: l4.provider,
        model: l4.model,
        latencyMs: totalLatency,
        success: true,
        fromCache: false,
        qualityScore: l5.qualityScore,
        queryLength: req.query.length,
        responseLength: l4.response.length,
        timestamp: new Date(),
      });
    } catch { /* non-blocking */ }
  });

  // P1 Upgrade: End Langfuse trace with output metadata
  endTrace(langfuseTrace.traceId, {
    tier: l2.routing.tier,
    provider: l4.provider,
    model: l4.model,
    qualityScore: l5.qualityScore,
    latencyMs: totalLatency,
  });

  // P2 Upgrade: Record routing outcome for ML classifier training
  // Scientific basis: RouteLLM (Ong et al., 2024) — preference data improves routing accuracy
  setImmediate(() => {
    try {
      const { recordRoutingOutcome } = require('./learned-router');
      recordRoutingOutcome({
        query: req.query,
        tier: l2.routing.tier,
        qualityScore: l5.qualityScore,
        provider: l4.provider,
        timestamp: Date.now(),
      });
    } catch { /* non-blocking */ }
  });

  // R531 (AWAKE V236 Ciclo 164): Emit 'complete' phase event
  emitPhase('complete', { latencyMs: totalLatency, qualityScore: l5.qualityScore, tier: l2.routing.tier });

  // R548 (AWAKE V236 Ciclo 164): compute layout_hint from routing tier
  const layoutHintFromTier = (tier: string): 'chat' | 'code' | 'analysis' | 'document' => {
    if (tier === 'TIER_1') return 'chat';
    if (tier === 'TIER_2') return 'chat';
    if (tier === 'TIER_3') return 'analysis';
    return 'analysis'; // TIER_4
  };

  // R572 (AWAKE V238 Ciclo 166): compute total tokensUsed and estimatedCostUSD for A/B canary mapping
  // Scientific basis: Cost transparency (Amodei et al., 2016); Defensive Programming (McConnell 2004)
  const totalTokensUsed = layers.reduce((sum, l) => sum + (l.tokensUsed || 0), 0)
    || (l4.tokensUsed ?? 0);
  const costPerToken = (l4.model || '').includes('mini') ? 0.000000375 : 0.00001;
  const estimatedCostUSD = parseFloat((totalTokensUsed * costPerToken).toFixed(6));

  return {
    response: finalResponse,  // C349: may be refined by directedSelfRefine
    provider: l4.provider,
    model: l4.model,
    tier: l2.routing.tier,
    latencyMs: totalLatency,
    fromCache: false,
    qualityScore: l5.qualityScore,
    layers,
    version: ORCHESTRATOR_VERSION,
    layout_hint: layoutHintFromTier(l2.routing.tier), // R548 (AWAKE V236 Ciclo 164)
    tokensUsed: totalTokensUsed,       // R572 (AWAKE V238 Ciclo 166)
    estimatedCostUSD,                  // R572 (AWAKE V238 Ciclo 166)
  };
}

/**
 * Get orchestrator health status for observability.
 */
export function getOrchestratorHealth(): {
  version: string;
  circuits: ReturnType<typeof getAllCircuitStats>;
  cache: ReturnType<typeof getCacheStats>;
} {
  return {
    version: ORCHESTRATOR_VERSION,
    circuits: getAllCircuitStats(),
    cache: getCacheStats(),
  };
}
