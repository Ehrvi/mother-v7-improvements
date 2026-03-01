/**
 * MOTHER v79.0 — Core Orchestrator
 * Ciclo 86: Identity fix — import MOTHER_IDENTITY_FACTS_SECTION + ARCHITECTURE_FACTS_SECTION
 * Ciclo 88: SRP Phase 11 — extracted callProvider, streamResponse, GovernanceResult, layers 5-7
 * Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66
 *
 * Scientific basis:
 * - Neuro-Symbolic AI Survey (arXiv:2501.05435, 2024) — hybrid neural/symbolic architecture
 * - ACAR (arXiv:2602.21231, 2026) — adaptive complexity routing with auditable traces
 * - Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025) — self-improving AI agents
 * - Me-Agent (2026) — persistent memory and dynamic personalization
 * - HippoRAG 2 (arXiv:2502.14802, ICML 2025) — non-parametric continual learning
 * - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal reinforcement learning
 * - Constitutional AI (Bai et al., arXiv:2212.08073, Anthropic 2022) — safety constraints
 *
 * Architecture: 7 conditional layers (replaces 21 sequential steps)
 * - Layer 1: Intake + Semantic Cache Lookup (fast path: ~0.1s)
 * - Layer 2: Adaptive Routing (complexity classification: ~0.05s)
 * - Layer 3: Context Assembly (parallel: bd_central + episodic + omniscient: ~1-3s)
 * - Layer 4: Neural Generation (provider call with circuit breaker: ~0.5-8s)
 * - Layer 5: Symbolic Governance (quality gate + faithfulness: ~0.2s)
 * - Layer 6: Memory Write-Back (async: fire-and-forget)
 * - Layer 7: DGM Meta-Observation (async: self-improvement loop)
 *
 * Expected improvement: P95 latency 15s → 2s (-87%), error rate 40% → <5%
 */

import {
  buildRoutingDecision,
  recordRoutingDecision,
  type RoutingDecision as AdaptiveRoutingDecision,
} from './adaptive-router';
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
import { callProvider, streamResponse } from './core-provider-caller';
import {
  fetchKnowledgeContext,
  fetchEpisodicContext,
  buildConversationContext,
  buildSystemPrompt,
  buildMessages,
  type ContextBundle,
} from './core-prompt-builder';
import {
  layer5_symbolicGovernance,
  layer6_memoryWriteBack,
  layer7_dgmMetaObservation,
  type GovernanceResult,
} from './core-governance-layers';

// ============================================================
// TYPES
// ============================================================

export interface OrchestratorRequest {
  query: string;
  userId?: string;
  sessionId?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk?: (chunk: string) => void;  // streaming callback
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
}

export interface LayerTrace {
  layer: number;
  name: string;
  durationMs: number;
  status: 'ok' | 'skipped' | 'error' | 'cached';
  detail?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

// Ciclo 86: Bumped to v78.9 — identity fix (MOTHER_IDENTITY_FACTS_SECTION + ARCHITECTURE_FACTS_SECTION injected)
export const ORCHESTRATOR_VERSION = 'v79.0'; // Ciclo 89: DPO identity v2 DEiQ0bzJ integrated
export const ORCHESTRATOR_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  timeoutMs: 20000,
  cooldownMs: 30000,
  windowMs: 60000,
};

// ============================================================
// LAYER 1: INTAKE + SEMANTIC CACHE
// ============================================================

async function layer1_intakeAndCache(
  req: OrchestratorRequest,
): Promise<{ fromCache: boolean; cachedResponse?: string; similarity?: number; durationMs: number }> {
  const start = Date.now();

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
): { routing: AdaptiveRoutingDecision; durationMs: number } {
  const start = Date.now();
  const availableProviders = new Set<string>();

  // Check circuit breakers for available providers
  for (const provider of ['openai', 'anthropic', 'google', 'mistral', 'deepseek']) {
    if (isProviderAvailable(provider, ORCHESTRATOR_CIRCUIT_CONFIG)) {
      availableProviders.add(provider);
    }
  }

  const routing = buildRoutingDecision(req.query, availableProviders);

  return { routing, durationMs: Date.now() - start };
}

// ============================================================
// LAYER 3: CONTEXT ASSEMBLY (parallel)
// ============================================================

async function layer3_contextAssembly(
  req: OrchestratorRequest,
  routing: AdaptiveRoutingDecision,
): Promise<ContextBundle> {
  const start = Date.now();

  // For TIER_1, skip heavy context assembly (latency optimization)
  if (routing.tier === 'TIER_1') {
    return {
      knowledgeContext: '',
      episodicContext: '',
      conversationContext: buildConversationContext(req.conversationHistory),
      durationMs: Date.now() - start,
    };
  }

  // Parallel context assembly for TIER_2+
  const [knowledgeContext, episodicContext] = await Promise.allSettled([
    fetchKnowledgeContext(req.query, routing.tier),
    fetchEpisodicContext(req.userId, req.query),
  ]);

  return {
    knowledgeContext: knowledgeContext.status === 'fulfilled' ? knowledgeContext.value : '',
    episodicContext: episodicContext.status === 'fulfilled' ? episodicContext.value : '',
    conversationContext: buildConversationContext(req.conversationHistory),
    durationMs: Date.now() - start,
  };
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
}

async function layer4_neuralGeneration(
  req: OrchestratorRequest,
  routing: AdaptiveRoutingDecision,
  context: ContextBundle,
): Promise<GenerationResult> {
  const start = Date.now();

  const systemPrompt = buildSystemPrompt(context, routing);
  const messages = buildMessages(req.query, systemPrompt);

  // Try primary provider with circuit breaker
  try {
    const response = await withCircuitBreaker(
      routing.primaryProvider,
      (signal) => callProvider(
        routing.primaryProvider,
        routing.primaryModel,
        messages,
        routing.temperature,
        routing.maxTokens,
        req.onChunk,
        signal,
      ),
      ORCHESTRATOR_CIRCUIT_CONFIG,
    );

    return {
      response,
      provider: routing.primaryProvider,
      model: routing.primaryModel,
      durationMs: Date.now() - start,
      usedFallback: false,
    };
  } catch (primaryErr: any) {
    console.warn(`[Orchestrator] Primary provider ${routing.primaryProvider} failed: ${primaryErr.message}`);

    // Try secondary provider if available
    if (routing.secondaryProvider && routing.secondaryModel) {
      try {
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
          ORCHESTRATOR_CIRCUIT_CONFIG,
        );

        return {
          response,
          provider: routing.secondaryProvider,
          model: routing.secondaryModel,
          durationMs: Date.now() - start,
          usedFallback: true,
        };
      } catch (secondaryErr: any) {
        console.warn(`[Orchestrator] Secondary provider ${routing.secondaryProvider} failed: ${secondaryErr.message}`);
      }
    }

    // Final fallback: gpt-4o-mini (most reliable)
    const fallbackResponse = await callProvider(
      'openai', 'gpt-4o-mini', messages, 0.3, 1024, req.onChunk,
    );

    return {
      response: fallbackResponse,
      provider: 'openai',
      model: 'gpt-4o-mini',
      durationMs: Date.now() - start,
      usedFallback: true,
    };
  }
}


// ============================================================
// LAYER 5: SYMBOLIC GOVERNANCE (quality gate)




// ============================================================
// MAIN ORCHESTRATE FUNCTION
// ============================================================

/**
 * Main entry point for MOTHER v78.9 orchestration.
 * Replaces the 21-step sequential pipeline in core.ts.
 *
 * 7 conditional layers, P95 target: <2s (TIER_1), <5s (TIER_2), <10s (TIER_3/4)
 */
export async function orchestrate(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const startTotal = Date.now();
  const layers: LayerTrace[] = [];

  // ── Layer 1: Intake + Cache ──────────────────────────────
  const l1 = await layer1_intakeAndCache(req);
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
  const l2 = layer2_adaptiveRouting(req);
  layers.push({
    layer: 2,
    name: 'Adaptive Routing',
    durationMs: l2.durationMs,
    status: 'ok',
    detail: l2.routing.rationale,
  });

  // ── Layer 3: Context Assembly ────────────────────────────
  const l3 = await layer3_contextAssembly(req, l2.routing);
  layers.push({
    layer: 3,
    name: 'Context Assembly',
    durationMs: l3.durationMs,
    status: 'ok',
    detail: `knowledge=${l3.knowledgeContext.length}c, episodic=${l3.episodicContext.length}c`,
  });

  // ── Layer 4: Neural Generation ───────────────────────────
  let l4: GenerationResult;
  const l4Start = Date.now();
  try {
    l4 = await layer4_neuralGeneration(req, l2.routing, l3);
    layers.push({
      layer: 4,
      name: 'Neural Generation',
      durationMs: l4.durationMs,
      status: 'ok',
      detail: `${l4.provider}/${l4.model}${l4.usedFallback ? ' (fallback)' : ''}`,
    });
  } catch (err: any) {
    layers.push({
      layer: 4,
      name: 'Neural Generation',
      durationMs: Date.now() - l4Start,
      status: 'error',
      detail: err.message,
    });
    throw err;
  }

  // ── Layer 5: Symbolic Governance ─────────────────────────
  const l5 = await layer5_symbolicGovernance(req.query, l4.response, l2.routing.tier);
  layers.push({
    layer: 5,
    name: 'Symbolic Governance',
    durationMs: l5.durationMs,
    status: l5.passed ? 'ok' : 'error',
    detail: `score=${l5.qualityScore}, issues=[${l5.issues.join(', ')}]`,
  });

  // ── Layer 6: Memory Write-Back (async) ───────────────────
  layer6_memoryWriteBack(req, l4.response, l4.provider, l4.model, l2.routing.tier, l5.qualityScore);
  layers.push({
    layer: 6,
    name: 'Memory Write-Back',
    durationMs: 0,
    status: 'ok',
    detail: 'async fire-and-forget',
  });

  // ── Layer 7: DGM Meta-Observation (async) ────────────────
  const totalLatency = Date.now() - startTotal;
  layer7_dgmMetaObservation(req, l4.response, l5.qualityScore, totalLatency, l2.routing.tier);
  layers.push({
    layer: 7,
    name: 'DGM Meta-Observation',
    durationMs: 0,
    status: 'ok',
    detail: 'async self-improvement loop',
  });

  // Record routing stats
  recordRoutingDecision(l2.routing, totalLatency);

  return {
    response: l4.response,
    provider: l4.provider,
    model: l4.model,
    tier: l2.routing.tier,
    latencyMs: totalLatency,
    fromCache: false,
    qualityScore: l5.qualityScore,
    layers,
    version: ORCHESTRATOR_VERSION,
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
