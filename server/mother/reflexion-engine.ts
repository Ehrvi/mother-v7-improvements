/**
 * MOTHER v87.0 — Reflexion Engine (C201-4a)
 * Ciclo 201: Sprint 2 — Ativar Memória Cognitiva
 *
 * Implements the Reflexion framework for verbal reinforcement learning.
 * MOTHER analyzes failure patterns and stores verbal reflections in episodic memory
 * to improve future responses without gradient updates.
 *
 * Scientific basis:
 * - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023):
 *   "Language agents with verbal reinforcement learning. Agents reflect on failures
 *    and store reflections in episodic memory for future use. No gradient updates needed.
 *    Key finding: Reflexion improves task success rate by 22% on HotpotQA."
 * - Self-Evolving AI Agents Survey (arXiv:2508.07407, 2025):
 *   "Three paradigms: experience accumulation, self-refinement, behavior optimization.
 *    Reflexion is the foundation of self-refinement."
 * - G-EVAL (Liu et al., arXiv:2303.16634, 2023):
 *   "LLM-as-judge with 7 dimensions: coherence, consistency, fluency, relevance,
 *    depth, instruction_following, factuality."
 *
 * Architecture:
 * 1. OBSERVE: Collect (query, response, quality_score) after each interaction
 * 2. EVALUATE: Identify failure patterns (quality < threshold)
 * 3. REFLECT: Generate verbal reflection on root cause
 * 4. STORE: Save reflection in episodic memory (A-MEM)
 * 5. RETRIEVE: Load relevant reflections before next similar query
 *
 * Integration: Called from Layer 7 (DGM Meta-Observation) in core-orchestrator.ts
 */

import { createLogger } from '../_core/logger';
const log = createLogger('ReflexionEngine');

// ============================================================
// TYPES
// ============================================================

export interface ReflexionObservation {
  query: string;
  response: string;
  qualityScore: number;       // 0-1 from G-EVAL
  provider: string;
  model: string;
  tier: string;
  latencyMs: number;
  sessionId?: string;
  failureReason?: string;     // From Guardian G-EVAL
  timestamp: string;
}

export interface ReflexionAnalysis {
  hasFailure: boolean;
  failureType: FailureType | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reflection: string;
  actionableInsight: string;
  shouldStore: boolean;
}

export type FailureType =
  | 'low_quality'           // G-EVAL score < 0.6
  | 'high_latency'          // Latency > 30s
  | 'provider_fallback'     // Used fallback provider
  | 'incomplete_response'   // Response truncated or incomplete
  | 'factual_error'         // Known factual error detected
  | 'instruction_violation' // Failed to follow instructions
  | 'context_loss';         // Lost context from previous turns

export interface ReflexionStats {
  totalObservations: number;
  totalFailures: number;
  failureRate: number;
  topFailureTypes: Array<{ type: FailureType; count: number }>;
  avgQualityScore: number;
  avgLatencyMs: number;
  improvementTrend: 'improving' | 'stable' | 'degrading';
}

// ============================================================
// CONFIGURATION
// ============================================================

const MOTHER_BASE_URL = process.env.MOTHER_BASE_URL ||
  'https://mother-interface-qtvghovzxa-ts.a.run.app';

// Reflexion thresholds (Shinn et al., 2023)
const QUALITY_FAILURE_THRESHOLD = 0.60;   // Below this → generate reflection
const LATENCY_FAILURE_THRESHOLD_MS = 30000; // Above this → high latency failure
const MIN_REFLECTION_QUALITY = 0.40;       // Below this → critical failure

// In-memory failure pattern tracking (rolling window: last 100 observations)
const observationWindow: ReflexionObservation[] = [];
const MAX_WINDOW_SIZE = 100;

// Failure type counters for pattern detection
const failureCounters: Record<FailureType, number> = {
  low_quality: 0,
  high_latency: 0,
  provider_fallback: 0,
  incomplete_response: 0,
  factual_error: 0,
  instruction_violation: 0,
  context_loss: 0,
};

// ============================================================
// OBSERVE: Collect observations
// ============================================================

/**
 * Record an observation in the rolling window.
 * Called from Layer 7 (DGM Meta-Observation) after each response.
 */
export function observeInteraction(obs: ReflexionObservation): void {
  observationWindow.push(obs);
  if (observationWindow.length > MAX_WINDOW_SIZE) {
    observationWindow.shift(); // Remove oldest
  }
}

// ============================================================
// EVALUATE: Identify failure patterns
// ============================================================

/**
 * Analyze an observation and identify failure patterns.
 * Returns a ReflexionAnalysis with reflection and actionable insights.
 *
 * Scientific basis: Reflexion (arXiv:2303.11366) — "evaluate the current trajectory"
 */
export function evaluateObservation(obs: ReflexionObservation): ReflexionAnalysis {
  const failures: FailureType[] = [];

  // Check quality failure
  if (obs.qualityScore < QUALITY_FAILURE_THRESHOLD) {
    failures.push('low_quality');
    failureCounters.low_quality++;
  }

  // Check latency failure
  if (obs.latencyMs > LATENCY_FAILURE_THRESHOLD_MS) {
    failures.push('high_latency');
    failureCounters.high_latency++;
  }

  // Check provider fallback
  if (obs.failureReason?.includes('fallback') || obs.failureReason?.includes('circuit')) {
    failures.push('provider_fallback');
    failureCounters.provider_fallback++;
  }

  // Check incomplete response
  if (obs.response.length < 100 && obs.tier !== 'TIER_1') {
    failures.push('incomplete_response');
    failureCounters.incomplete_response++;
  }

  // Check instruction violation
  if (obs.failureReason?.includes('instruction') || obs.qualityScore < 0.5) {
    failures.push('instruction_violation');
    failureCounters.instruction_violation++;
  }

  if (failures.length === 0) {
    return {
      hasFailure: false,
      failureType: null,
      severity: 'low',
      reflection: '',
      actionableInsight: '',
      shouldStore: false,
    };
  }

  const primaryFailure = failures[0];
  const severity = computeSeverity(obs.qualityScore, obs.latencyMs, failures.length);
  const reflection = buildReflection(obs, primaryFailure, severity);
  const actionableInsight = buildActionableInsight(primaryFailure, obs);

  return {
    hasFailure: true,
    failureType: primaryFailure,
    severity,
    reflection,
    actionableInsight,
    shouldStore: severity !== 'low', // Only store medium/high/critical failures
  };
}

// ============================================================
// REFLECT: Generate verbal reflections
// ============================================================

/**
 * Generate a detailed verbal reflection using LLM.
 * For critical failures only — uses gpt-4o-mini for cost efficiency.
 *
 * Scientific basis: Reflexion (arXiv:2303.11366) — "verbal reflection on failure"
 */
export async function generateDetailedReflection(
  obs: ReflexionObservation,
  analysis: ReflexionAnalysis,
): Promise<string> {
  if (!analysis.hasFailure || analysis.severity === 'low') return '';

  try {
    const { ENV } = await import('../_core/env');
    if (!ENV.openaiApiKey) return analysis.reflection;

    const prompt = `You are MOTHER's Reflexion module (Shinn et al., arXiv:2303.11366, NeurIPS 2023).

Analyze this failed interaction and generate a verbal reflection:

QUERY: ${obs.query.slice(0, 400)}
QUALITY SCORE: ${obs.qualityScore.toFixed(2)} (threshold: ${QUALITY_FAILURE_THRESHOLD})
FAILURE TYPE: ${analysis.failureType}
SEVERITY: ${analysis.severity}
PROVIDER: ${obs.provider} / ${obs.model}
LATENCY: ${obs.latencyMs}ms

Generate a reflection in this exact format:
"Root cause: [specific root cause]. Pattern: [recurring pattern if any]. Fix: [specific actionable fix for next time]. Confidence: [high/medium/low]."

Keep it under 2 sentences. Be specific and actionable.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return analysis.reflection;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || analysis.reflection;
  } catch (err: any) {
    log.warn('generateDetailedReflection failed:', err.message);
    return analysis.reflection;
  }
}

// ============================================================
// STORE: Save reflections in episodic memory
// ============================================================

/**
 * Store a reflection in episodic memory via A-MEM.
 * Called when severity is medium/high/critical.
 */
export async function storeReflection(
  obs: ReflexionObservation,
  analysis: ReflexionAnalysis,
  detailedReflection: string,
): Promise<boolean> {
  if (!analysis.shouldStore) return false;

  try {
    const { storeAMemEntry } = await import('./amem-agent');
    return await storeAMemEntry({
      query: obs.query,
      response: obs.response,
      qualityScore: obs.qualityScore,
      provider: obs.provider,
      model: obs.model,
      tier: obs.tier,
      latencyMs: obs.latencyMs,
      sessionId: obs.sessionId,
      tags: ['reflexion', analysis.failureType || 'unknown', analysis.severity],
      reflection: detailedReflection || analysis.reflection,
      timestamp: obs.timestamp,
    });
  } catch (err: any) {
    log.warn('storeReflection failed:', err.message);
    return false;
  }
}

// ============================================================
// RETRIEVE: Load relevant reflections
// ============================================================

/**
 * Retrieve relevant reflections for a query.
 * Called before generating a response to learn from past failures.
 */
export async function retrieveRelevantReflections(
  query: string,
  limit = 3,
): Promise<string> {
  try {
    const params = new URLSearchParams({
      q: `reflexion ${query}`,
      category: 'episodic_memory',
      limit: limit.toString(),
    });

    const response = await fetch(`${MOTHER_BASE_URL}/api/a2a/knowledge/search?${params}`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) return '';

    const data = await response.json();
    const entries = (data.results || [])
      .filter((e: any) => e.tags?.includes('reflexion'))
      .slice(0, limit);

    if (entries.length === 0) return '';

    const reflections = entries
      .map((e: any) => {
        try {
          const content = JSON.parse(e.content);
          return content.reflection || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    if (reflections.length === 0) return '';

    return `## Past Failure Reflections (Reflexion, arXiv:2303.11366)\n${reflections.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}`;
  } catch {
    return '';
  }
}

// ============================================================
// STATS: Failure pattern analysis
// ============================================================

/**
 * Get Reflexion statistics for monitoring dashboard.
 */
export function getReflexionStats(): ReflexionStats {
  const total = observationWindow.length;
  const failures = observationWindow.filter(o => o.qualityScore < QUALITY_FAILURE_THRESHOLD);

  const avgQuality = total > 0
    ? observationWindow.reduce((sum, o) => sum + o.qualityScore, 0) / total
    : 0;

  const avgLatency = total > 0
    ? observationWindow.reduce((sum, o) => sum + o.latencyMs, 0) / total
    : 0;

  // Trend: compare first half vs second half of window
  const halfSize = Math.floor(total / 2);
  let trend: 'improving' | 'stable' | 'degrading' = 'stable';
  if (halfSize > 5) {
    const firstHalf = observationWindow.slice(0, halfSize);
    const secondHalf = observationWindow.slice(halfSize);
    const firstAvg = firstHalf.reduce((s, o) => s + o.qualityScore, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, o) => s + o.qualityScore, 0) / secondHalf.length;
    if (secondAvg > firstAvg + 0.05) trend = 'improving';
    else if (secondAvg < firstAvg - 0.05) trend = 'degrading';
  }

  const topFailureTypes = (Object.entries(failureCounters) as [FailureType, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));

  return {
    totalObservations: total,
    totalFailures: failures.length,
    failureRate: total > 0 ? failures.length / total : 0,
    topFailureTypes,
    avgQualityScore: avgQuality,
    avgLatencyMs: avgLatency,
    improvementTrend: trend,
  };
}

// ============================================================
// HELPERS
// ============================================================

function computeSeverity(
  qualityScore: number,
  latencyMs: number,
  failureCount: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (qualityScore < MIN_REFLECTION_QUALITY || failureCount >= 3) return 'critical';
  if (qualityScore < 0.5 || latencyMs > 45000) return 'high';
  if (qualityScore < QUALITY_FAILURE_THRESHOLD || latencyMs > LATENCY_FAILURE_THRESHOLD_MS) return 'medium';
  return 'low';
}

function buildReflection(
  obs: ReflexionObservation,
  failureType: FailureType,
  severity: string,
): string {
  const reflections: Record<FailureType, string> = {
    low_quality: `Root cause: Response quality ${obs.qualityScore.toFixed(2)} below threshold ${QUALITY_FAILURE_THRESHOLD}. Fix: Use higher-capability model (${obs.tier === 'TIER_1' ? 'upgrade to TIER_2' : 'try anthropic fallback'}).`,
    high_latency: `Root cause: Response latency ${obs.latencyMs}ms exceeds ${LATENCY_FAILURE_THRESHOLD_MS}ms threshold. Fix: Reduce context size or use faster model.`,
    provider_fallback: `Root cause: Primary provider ${obs.provider} unavailable, used fallback. Fix: Monitor circuit breaker state and pre-warm alternative provider.`,
    incomplete_response: `Root cause: Response too short (${obs.response.length} chars) for ${obs.tier} query. Fix: Increase max_tokens and verify prompt completeness.`,
    factual_error: `Root cause: Factual error detected in response. Fix: Increase retrieval depth and enable Guardian G-EVAL factuality check.`,
    instruction_violation: `Root cause: Failed to follow instructions (quality=${obs.qualityScore.toFixed(2)}). Fix: Use DPO v8e model for instruction-following queries.`,
    context_loss: `Root cause: Lost context from previous conversation turns. Fix: Increase conversationHistory window from 6 to 10 turns.`,
  };

  return reflections[failureType] || `Root cause: Unknown failure (severity=${severity}). Fix: Review logs.`;
}

function buildActionableInsight(failureType: FailureType, obs: ReflexionObservation): string {
  const insights: Record<FailureType, string> = {
    low_quality: `Next time query "${obs.query.slice(0, 50)}..." arrives: use ${obs.tier === 'TIER_1' ? 'TIER_2 routing' : 'anthropic/claude-opus'} instead of ${obs.provider}/${obs.model}.`,
    high_latency: `Reduce context to <4000 chars for ${obs.provider} queries. Current: ${obs.response.length} chars response.`,
    provider_fallback: `Pre-warm ${obs.provider} circuit breaker. Consider adding ${obs.provider === 'openai' ? 'anthropic' : 'openai'} as primary for this query type.`,
    incomplete_response: `Increase max_tokens for ${obs.tier} queries. Current response: ${obs.response.length} chars.`,
    factual_error: `Enable HippoRAG2 retrieval for all tiers, not just TIER_2+.`,
    instruction_violation: `Route instruction-following queries to DPO v8e model regardless of tier.`,
    context_loss: `Increase conversationHistory window. Current: 6 turns.`,
  };

  return insights[failureType] || 'Review logs for actionable insight.';
}
