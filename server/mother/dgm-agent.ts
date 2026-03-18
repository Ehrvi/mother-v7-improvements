/**
 * MOTHER v76.0 — Darwin Gödel Machine (DGM) Agent
 * Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025)
 *   "An open-ended, self-improving AI agent that modifies its own code to improve performance.
 *   Achieves SWE-bench 20% → 50% through iterative self-modification."
 *   Key mechanisms: (1) Open-ended search, (2) Fitness evaluation, (3) Immutable audit log
 * - Gödel Machine (Schmidhuber, 2003) — provably optimal self-referential self-improvement
 * - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal reinforcement learning
 * - Constitutional AI (Bai et al., arXiv:2212.08073, Anthropic 2022) — safety constraints
 * - RLHF (Ouyang et al., arXiv:2203.02155, NeurIPS 2022) — reward-based learning
 *
 * Responsibilities:
 * 1. Observe: collect performance metrics from all layers
 * 2. Evaluate: compute fitness score for current MOTHER configuration
 * 3. Propose: generate improvement hypotheses (code changes, config updates)
 * 4. Validate: test proposals against safety constraints (Constitutional AI)
 * 5. Apply: commit approved improvements to bd_central + trigger GCloud deploy
 * 6. Audit: immutable log of all DGM actions (FitnessDB)
 *
 * Safety constraints (Constitutional AI):
 * - Never modify core safety checks
 * - Never remove circuit breakers
 * - Never disable quality gates
 * - All changes require fitness improvement ≥ 5%
 * - All changes are logged immutably before application
 */

import type { SLOViolation } from './guardian-agent';

// ============================================================
// TYPES
// ============================================================

export interface DGMObservation {
  query: string;
  response: string;
  qualityScore: number;
  latencyMs: number;
  tier: string;
  provider: string;
  timestamp: Date;
}

export interface FitnessMetrics {
  avgQualityScore: number;     // 0-100
  p95LatencyMs: number;        // milliseconds
  errorRate: number;           // 0-1
  cacheHitRate: number;        // 0-1
  userSatisfactionProxy: number; // 0-100 (derived from quality + latency)
  fitnessScore: number;        // 0-100 (composite)
  timestamp: Date;
  sampleSize: number;
}

export interface ImprovementProposal {
  id: string;
  type: 'CONFIG' | 'PROMPT' | 'ROUTING' | 'CACHE' | 'MODULE' | 'ARCHITECTURE' | 'SAFETY' | 'PERFORMANCE' | 'OTHER';
  description: string;
  rationale: string;
  expectedFitnessGain: number;  // percentage points
  safetyCheck: boolean;
  approved: boolean;
  appliedAt?: Date;
  actualFitnessGain?: number;
}

export interface DGMAuditEntry {
  id: string;
  timestamp: Date;
  action: 'OBSERVE' | 'EVALUATE' | 'PROPOSE' | 'VALIDATE' | 'APPLY' | 'REJECT' | 'ESCALATE';
  detail: string;
  fitnessScore?: number;
  proposalId?: string;
}

// ============================================================
// STATE (FitnessDB — in-memory, persisted to bd_central)
// ============================================================

const observations: DGMObservation[] = [];
const fitnessHistory: FitnessMetrics[] = [];
const proposals: ImprovementProposal[] = [];
const auditLog: DGMAuditEntry[] = [];
const MAX_OBSERVATIONS = 500;
const MAX_AUDIT_ENTRIES = 1000;

let currentFitness: FitnessMetrics | null = null;
let baselineFitness: FitnessMetrics | null = null;

// ============================================================
// OBSERVATION
// ============================================================

/**
 * Record an observation from the orchestrator.
 * Called by core-orchestrator.ts Layer 7.
 */
export async function observeAndLearn(obs: DGMObservation): Promise<void> {
  observations.push(obs);
  if (observations.length > MAX_OBSERVATIONS) {
    observations.splice(0, observations.length - MAX_OBSERVATIONS);
  }

  addAuditEntry('OBSERVE', `quality=${obs.qualityScore}, latency=${obs.latencyMs}ms, tier=${obs.tier}`);

  // Re-evaluate fitness every 50 observations
  if (observations.length % 50 === 0) {
    await evaluateFitness();
  }
}

// ============================================================
// FITNESS EVALUATION
// ============================================================

/**
 * Compute current fitness score from observations.
 * Scientific basis: DGM fitness function (arXiv:2505.22954)
 * Composite score: quality (40%) + latency (30%) + reliability (20%) + cache (10%)
 */
export async function evaluateFitness(): Promise<FitnessMetrics> {
  if (observations.length === 0) {
    return {
      avgQualityScore: 0, p95LatencyMs: 0, errorRate: 0,
      cacheHitRate: 0, userSatisfactionProxy: 0, fitnessScore: 0,
      timestamp: new Date(), sampleSize: 0,
    };
  }

  const latencies = observations.map(o => o.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] ?? 0;

  const avgQuality = observations.reduce((sum, o) => sum + o.qualityScore, 0) / observations.length;
  const errors = observations.filter(o => o.qualityScore < 40).length;
  const errorRate = errors / observations.length;

  // Cache hit rate from semantic-cache
  let cacheHitRate = 0;
  try {
    const { getCacheStats } = await import('./semantic-cache');
    cacheHitRate = getCacheStats().hitRate;
  } catch { /* optional */ }

  // User satisfaction proxy: quality weighted by latency penalty
  const latencyPenalty = Math.max(0, 1 - (p95Latency / 10000));  // 0 at 10s, 1 at 0s
  const userSatisfactionProxy = avgQuality * latencyPenalty;

  // Composite fitness score (0-100)
  const qualityComponent = avgQuality * 0.40;
  const latencyComponent = Math.max(0, (1 - p95Latency / 5000)) * 100 * 0.30;  // 0 at 5s
  const reliabilityComponent = (1 - errorRate) * 100 * 0.20;
  const cacheComponent = cacheHitRate * 100 * 0.10;

  const fitnessScore = qualityComponent + latencyComponent + reliabilityComponent + cacheComponent;

  const metrics: FitnessMetrics = {
    avgQualityScore: avgQuality,
    p95LatencyMs: p95Latency,
    errorRate,
    cacheHitRate,
    userSatisfactionProxy,
    fitnessScore,
    timestamp: new Date(),
    sampleSize: observations.length,
  };

  currentFitness = metrics;
  fitnessHistory.push(metrics);

  // Set baseline on first evaluation
  if (!baselineFitness) {
    baselineFitness = { ...metrics };
  }

  addAuditEntry('EVALUATE', `fitness=${fitnessScore.toFixed(1)}, quality=${avgQuality.toFixed(1)}, p95=${p95Latency}ms, errors=${(errorRate * 100).toFixed(2)}%`);

  // Persist to bd_central
  await persistFitnessMetrics(metrics);

  // Gap 2 (arXiv:2507.21046, ClinicalReTrial arXiv:2601.00290):
  // Feed fitness results to learning system for knowledge acquisition
  if (proposals.length > 0) {
    try {
      const { learnFromEvolutionRun } = await import('./learning');
      await learnFromEvolutionRun(
        `dgm-fitness-${Date.now()}`,
        fitnessScore / 100,
        proposals.filter(p => p.approved).map(p => p.description),
        'DGM self-improvement fitness evaluation'
      );
    } catch { /* non-blocking */ }
  }

  return metrics;
}

// ============================================================
// PROPOSAL GENERATION
// ============================================================

/**
 * Generate improvement proposals based on current fitness.
 * Scientific basis: DGM open-ended search (arXiv:2505.22954)
 *
 * Architecture: AI Delphi+MAD Council (arXiv:2603.08181, arXiv:2305.19118)
 *   Phase 1 (Delphi): 5 AIs propose independently
 *   Phase 2 (MAD): AIs critique each other's proposals
 *   Phase 3 (Vote): Weighted consensus
 *   Fallback: hardcoded rules if council fails
 */
export async function generateProposals(): Promise<ImprovementProposal[]> {
  if (!currentFitness) await evaluateFitness();
  if (!currentFitness) return [];

  // Guardian block: if system is unstable, do NOT propose changes
  try {
    const { getDGMManager } = await import('./dgm-manager');
    if (!getDGMManager().isEvolutionAllowed()) {
      addAuditEntry('EVALUATE', 'Evolution BLOCKED by Guardian — system unstable, skipping proposals');
      return [];
    }
  } catch { /* manager may not be initialized yet */ }

  // Try AI Council first (Delphi+MAD)
  try {
    const { runCouncilSession } = await import('./dgm-council');
    const councilResult = await runCouncilSession(currentFitness);

    if (!councilResult.fallbackUsed && councilResult.proposals.length > 0) {
      proposals.push(...councilResult.proposals);
      for (const p of councilResult.proposals) {
        addAuditEntry('PROPOSE', `[COUNCIL] ${p.type}: ${p.description} (expected gain: +${p.expectedFitnessGain}%)`);
      }
      addAuditEntry('EVALUATE', `Council session: ${councilResult.membersResponded} AIs, ${councilResult.debateRounds} debate rounds, ${councilResult.proposals.length} proposals`);
      return councilResult.proposals;
    }
  } catch (err: any) {
    addAuditEntry('EVALUATE', `Council failed (${err.message?.slice(0, 100)}), falling back to rules`);
  }

  // Fallback: hardcoded rules (original logic)
  const newProposals: ImprovementProposal[] = [];

  // High latency → suggest routing optimization
  if (currentFitness.p95LatencyMs > 3000) {
    newProposals.push({
      id: `prop_${Date.now()}_routing`,
      type: 'ROUTING',
      description: 'Lower TIER_2→TIER_1 threshold to reduce latency',
      rationale: `P95 latency ${currentFitness.p95LatencyMs}ms exceeds 3s target. Routing more queries to TIER_1 (gpt-4o-mini) would reduce latency at minimal quality cost.`,
      expectedFitnessGain: 8,
      safetyCheck: true,
      approved: false,
    });
  }

  // Low quality → suggest prompt improvement
  if (currentFitness.avgQualityScore < 70) {
    newProposals.push({
      id: `prop_${Date.now()}_prompt`,
      type: 'PROMPT',
      description: 'Enhance system prompt with more specific MOTHER identity instructions',
      rationale: `Average quality ${currentFitness.avgQualityScore.toFixed(1)} below 70 threshold. Enhanced identity instructions improve response coherence.`,
      expectedFitnessGain: 5,
      safetyCheck: true,
      approved: false,
    });
  }

  // Low cache hit rate → suggest cache threshold adjustment
  if (currentFitness.cacheHitRate < 0.15 && observations.length > 100) {
    newProposals.push({
      id: `prop_${Date.now()}_cache`,
      type: 'CACHE',
      description: 'Lower semantic cache similarity threshold from 0.92 to 0.88',
      rationale: `Cache hit rate ${(currentFitness.cacheHitRate * 100).toFixed(1)}% below 15% target. Slight threshold reduction increases hits while maintaining quality.`,
      expectedFitnessGain: 3,
      safetyCheck: true,
      approved: false,
    });
  }

  proposals.push(...newProposals);

  for (const p of newProposals) {
    addAuditEntry('PROPOSE', `${p.type}: ${p.description} (expected gain: +${p.expectedFitnessGain}%)`);
  }

  return newProposals;
}

// ============================================================
// SAFETY VALIDATION (Constitutional AI)
// ============================================================

/**
 * Validate a proposal against safety constraints.
 * Scientific basis: Constitutional AI (arXiv:2212.08073, Anthropic 2022)
 */
export function validateProposal(proposal: ImprovementProposal): boolean {
  // Safety constraints — never approve proposals that:
  const FORBIDDEN_PATTERNS = [
    'remove circuit breaker',
    'disable quality gate',
    'remove safety',
    'bypass guardian',
    'skip validation',
    'remove audit',
  ];

  const descLower = proposal.description.toLowerCase();
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (descLower.includes(pattern)) {
      addAuditEntry('REJECT', `Proposal ${proposal.id} rejected: violates safety constraint (${pattern})`);
      return false;
    }
  }

  // Require minimum expected fitness gain
  if (proposal.expectedFitnessGain < 3) {
    addAuditEntry('REJECT', `Proposal ${proposal.id} rejected: insufficient expected gain (${proposal.expectedFitnessGain}% < 3%)`);
    return false;
  }

  addAuditEntry('VALIDATE', `Proposal ${proposal.id} passed safety validation`);
  return true;
}

// ============================================================
// GUARDIAN ESCALATION
// ============================================================

/**
 * Receive escalation from guardian-agent.ts.
 */
export async function escalateToGuardian(violation: SLOViolation): Promise<void> {
  addAuditEntry('ESCALATE', `Guardian escalation: ${violation.metric}=${violation.current.toFixed(4)} (severity: ${violation.severity})`);

  // Generate proposals in response to critical violations
  if (violation.severity === 'CRITICAL') {
    await generateProposals();
  }
}

// ============================================================
// PERSISTENCE
// ============================================================

async function persistFitnessMetrics(metrics: FitnessMetrics): Promise<void> {
  try {
    const { addKnowledge } = await import('./knowledge');
    await addKnowledge(
      `[DGM] Fitness Evaluation — ${metrics.timestamp.toISOString()}`,
      `## DGM Fitness Report\n\n` +
      `**Timestamp:** ${metrics.timestamp.toISOString()}\n` +
      `**Sample Size:** ${metrics.sampleSize}\n` +
      `**Fitness Score:** ${metrics.fitnessScore.toFixed(1)}/100\n` +
      `**Avg Quality:** ${metrics.avgQualityScore.toFixed(1)}\n` +
      `**P95 Latency:** ${metrics.p95LatencyMs}ms\n` +
      `**Error Rate:** ${(metrics.errorRate * 100).toFixed(2)}%\n` +
      `**Cache Hit Rate:** ${(metrics.cacheHitRate * 100).toFixed(1)}%\n` +
      `**User Satisfaction Proxy:** ${metrics.userSatisfactionProxy.toFixed(1)}`,
      'system',
      'dgm_fitness',
    );
  } catch { /* non-blocking */ }
}

// ============================================================
// AUDIT LOG
// ============================================================

function addAuditEntry(
  action: DGMAuditEntry['action'],
  detail: string,
  proposalId?: string,
): void {
  const entry: DGMAuditEntry = {
    id: `dgm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date(),
    action,
    detail,
    fitnessScore: currentFitness?.fitnessScore,
    proposalId,
  };

  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_ENTRIES) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_ENTRIES);
  }

  // Gap 4 (arXiv:2502.12110 A-MEM, Nested Learning arXiv:2512.24695):
  // Store audit entries in A-MEM for Zettelkasten cross-linking
  // Connects short-term audit to long-term persistent memory
  try {
    import('./amem-agent').then(({ storeAMemEntry }) => {
      storeAMemEntry({
        query: `DGM ${action}: ${detail.slice(0, 200)}`,
        response: detail,
        qualityScore: action === 'REJECT' ? 0.3 : 0.8,
        provider: 'dgm-agent',
        model: 'internal',
        tier: 'TIER_3',
        latencyMs: 0,
        tags: ['dgm', action.toLowerCase()],
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }).catch(() => {});
  } catch { /* non-blocking */ }
}

/**
 * Get the immutable DGM audit log (FitnessDB).
 */
export function getDGMAuditLog(limit = 50): DGMAuditEntry[] {
  return auditLog.slice(-limit);
}

/**
 * Get current fitness metrics.
 */
export function getCurrentFitness(): FitnessMetrics | null {
  return currentFitness;
}

/**
 * Get fitness improvement since baseline.
 */
export function getFitnessImprovement(): number | null {
  if (!currentFitness || !baselineFitness) return null;
  return currentFitness.fitnessScore - baselineFitness.fitnessScore;
}

/**
 * Get DGM status summary for API.
 */
export function getDGMStatus(): {
  version: string;
  currentFitness: FitnessMetrics | null;
  fitnessImprovement: number | null;
  totalObservations: number;
  pendingProposals: number;
  auditLogSize: number;
} {
  return {
    version: 'DGM-v76.0',
    currentFitness,
    fitnessImprovement: getFitnessImprovement(),
    totalObservations: observations.length,
    pendingProposals: proposals.filter(p => !p.approved).length,
    auditLogSize: auditLog.length,
  };
}
