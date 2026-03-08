/**
 * dgm-cycle3-additions.ts — DGM Cycle 3 Sprint 8.5 (C184)
 * Autonomous improvements proposed by MOTHER's DGM self-improvement loop.
 *
 * This file contains:
 * 1. QueryComplexity enum (Sprint 3 pending item from TODO-ROADMAP V7)
 * 2. RLVR reward signal documentation (Sprint 8 quality improvement)
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.22954, 2025)
 * - RouteLLM (arXiv:2406.18665, 2024) — QueryComplexity enum
 * - DeepSeek-R1 (arXiv:2501.12948, 2025) — RLVR documentation
 * - G-Eval (arXiv:2303.16634, 2023) — quality evaluation
 *
 * @cycle C184
 * @sprint 8.5
 * @dgm_cycle 3
 * @autoMerge false (awaiting human review — R12)
 */

/**
 * QueryComplexity — Explicit enum for query complexity classification.
 *
 * Scientific basis: RouteLLM (Ong et al., arXiv:2406.18665, 2024)
 * Maps to routing tiers for DPO tier-gate bypass (Sprint 3, C183):
 * - SIMPLE → TIER_1 (score 0-25): DPO bypassed, gpt-4o-mini, P50 ~3s
 * - MEDIUM → TIER_2 (score 26-50): DPO bypassed, gpt-4o, P50 ~8s
 * - COMPLEX → TIER_3 (score 51-75): DPO active, P50 ~30s
 * - EXPERT → TIER_4 (score 76-100): DPO active, max quality, P50 ~75s
 *
 * Added by DGM Cycle 3 (Sprint 8.5, C184) — autonomous self-improvement.
 * @since C184
 */
export enum QueryComplexity {
  SIMPLE = 'SIMPLE',   // TIER_1: score 0-25, factual/greeting, P50 ~3s
  MEDIUM = 'MEDIUM',   // TIER_2: score 26-50, standard reasoning, P50 ~8s
  COMPLEX = 'COMPLEX', // TIER_3: score 51-75, multi-step/code, P50 ~30s
  EXPERT = 'EXPERT',   // TIER_4: score 76-100, system design/geotechnical, P50 ~75s
}

/**
 * Map RoutingTier to QueryComplexity enum.
 * Provides type-safe complexity classification for downstream consumers.
 * @since C184
 */
export type RoutingTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';

export function tierToComplexity(tier: RoutingTier): QueryComplexity {
  switch (tier) {
    case 'TIER_1': return QueryComplexity.SIMPLE;
    case 'TIER_2': return QueryComplexity.MEDIUM;
    case 'TIER_3': return QueryComplexity.COMPLEX;
    case 'TIER_4': return QueryComplexity.EXPERT;
    default: return QueryComplexity.MEDIUM;
  }
}

/**
 * RLVR Reward Signal — Layer 5.5 of MOTHER's 8-layer orchestration pipeline.
 *
 * RLVR (Reinforcement Learning from Verifiable Rewards) is implemented
 * asynchronously and non-blocking in Layer 5.5.
 *
 * Scientific basis:
 * - DeepSeek-R1 (arXiv:2501.12948, 2025) — RLVR for reasoning models
 * - GRPO (Group Relative Policy Optimization) — reward signal aggregation
 * - G-Eval (arXiv:2303.16634, 2023) — LLM-as-judge quality scoring
 *
 * Reward signal components (weighted sum):
 * - Faithfulness (30%): factual accuracy vs. knowledge base
 * - Relevance (25%): answer addresses the query
 * - Coherence (20%): logical structure and flow
 * - Depth (15%): technical detail appropriate to tier
 * - Obedience (10%): follows system instructions
 *
 * RLVR is async and non-blocking (Layer 5.5):
 * - Does NOT delay response delivery (Layer 7)
 * - Reward signal stored in episodic_memory for future DPO fine-tuning
 * - Low-quality responses (score < 0.7) flagged for DPO retraining queue
 *
 * @see core-orchestrator.ts Layer 5.5 implementation
 * @since C184 (DGM Cycle 3 Sprint 8.5 documentation improvement)
 */
export interface RLVRRewardSignal {
  faithfulness: number;  // 0-1, weight 30%
  relevance: number;     // 0-1, weight 25%
  coherence: number;     // 0-1, weight 20%
  depth: number;         // 0-1, weight 15%
  obedience: number;     // 0-1, weight 10%
  compositeScore: number; // weighted sum 0-1
  tier: RoutingTier;
  complexity: QueryComplexity;
  flaggedForRetraining: boolean; // true if compositeScore < 0.7
  timestamp: string;
}

/**
 * Compute composite RLVR reward score from individual components.
 * @since C184
 */
export function computeRLVRScore(signal: Omit<RLVRRewardSignal, 'compositeScore' | 'flaggedForRetraining' | 'timestamp' | 'complexity'>): RLVRRewardSignal {
  const compositeScore =
    signal.faithfulness * 0.30 +
    signal.relevance * 0.25 +
    signal.coherence * 0.20 +
    signal.depth * 0.15 +
    signal.obedience * 0.10;

  return {
    ...signal,
    complexity: tierToComplexity(signal.tier),
    compositeScore,
    flaggedForRetraining: compositeScore < 0.7,
    timestamp: new Date().toISOString(),
  };
}
