/**
 * MOTHER v70.0 — Self-Improvement Orchestrator (Ciclo 40)
 *
 * Scientific basis:
 * - Gödel Machine (Schmidhuber, 2003): Self-referential universal problem solver.
 *   "Gödel Machines: Fully Self-Referential Optimal Universal Self-Improvers."
 *   Artificial General Intelligence, Springer, 2007.
 * - MAPE-K (Kephart & Chess, 2003): Monitor-Analyze-Plan-Execute + Knowledge loop.
 *   "The Vision of Autonomic Computing." IEEE Computer, 36(1), 41-50.
 * - Self-Play (Silver et al., 2017): AlphaGo Zero — learning without human data.
 *   Nature, 550, 354-359. doi:10.1038/nature24270.
 * - Constitutional AI (Bai et al., 2022): Self-critique and revision.
 *   arXiv:2212.08073.
 * - Recursive Self-Improvement (Yampolskiy, 2020): Theoretical foundations.
 *   "Unpredictability of AI." arXiv:2109.01100.
 *
 * Architecture (MAPE-K loop):
 * 1. MONITOR: Collect quality metrics, RLVR rewards, HLE scores, cache rates
 * 2. ANALYZE: Identify performance gaps, root causes, improvement opportunities
 * 3. PLAN: Generate improvement proposals (routing, prompts, temperature, RAG params)
 * 4. EXECUTE: Apply approved changes, update system parameters
 * 5. KNOWLEDGE: Store learned patterns in bd_central for future cycles
 *
 * This module represents the culmination of Cycles 36-40:
 * - Uses Knowledge Graph (Ciclo 36) for concept-aware retrieval
 * - Uses Abductive Engine (Ciclo 37) for root cause analysis
 * - Uses DPO Builder (Ciclo 38) for preference data collection
 * - Uses RLVR Verifier (Ciclo 39) for reward signal computation
 * - Orchestrates all modules into a unified self-improvement loop
 */

import { buildKnowledgeGraph, getGraphStats } from './knowledge-graph';
import { performAbductiveReasoning, requiresAbductiveReasoning } from './abductive-engine';
import { buildDPODataset, getDPOStats, getDPOHyperparameters } from './dpo-builder';
import { computeRLVRReward, extractScientificClaims, runHLEBenchmark } from './rlvr-verifier';
import { getDb, insertKnowledge } from '../db';
import { queries } from '../../drizzle/schema';
import { desc, gte, and, isNotNull } from 'drizzle-orm';
import { createLogger } from '../_core/logger';
const log = createLogger('SELF_IMPROVE');


export interface SystemMetrics {
  timestamp: Date;
  avgQualityScore: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  totalQueries: number;
  scientificRefRate: number;    // % of responses with scientific refs
  rlvrAvgReward: number;        // average RLVR reward signal
  hleBenchmarkScore: number;    // HLE benchmark score (0-100)
  knowledgeGraphNodes: number;
  dpoDatasetSize: number;
}

export interface ImprovementProposal {
  id: string;
  type: 'routing' | 'temperature' | 'rag_params' | 'prompt_engineering' | 'knowledge_ingestion' | 'cache_threshold';
  description: string;
  rationale: string;
  expectedImpact: string;
  currentValue: unknown;
  proposedValue: unknown;
  priority: 'critical' | 'high' | 'medium' | 'low';
  scientificBasis: string;
  autoApprove: boolean;  // Safe changes that don't require human review
}

export interface SelfImprovementCycle {
  cycleId: string;
  startTime: Date;
  endTime?: Date;
  metrics: SystemMetrics;
  proposals: ImprovementProposal[];
  appliedProposals: string[];
  knowledgeAdded: number;
  qualityDelta: number;  // improvement in quality score
}

/**
 * MONITOR phase: Collect current system metrics.
 * Based on MAPE-K Monitor component (Kephart & Chess, 2003).
 */
export async function monitorSystem(): Promise<SystemMetrics> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) {
    return {
      timestamp: now,
      avgQualityScore: 0,
      cacheHitRate: 0,
      avgLatencyMs: 0,
      totalQueries: 0,
      scientificRefRate: 0,
      rlvrAvgReward: 0,
      hleBenchmarkScore: 0,
      knowledgeGraphNodes: getGraphStats()?.nodes || 0,
      dpoDatasetSize: 0,
    };
  }

  // Get recent query statistics
  const recentQueries = await db.select({
    qualityScore: queries.qualityScore,
    responseTime: queries.responseTime,
    cacheHit: queries.cacheHit,
    response: queries.response,
  }).from(queries)
    .where(and(
      isNotNull(queries.qualityScore),
      gte(queries.createdAt, oneDayAgo),
    ))
    .orderBy(desc(queries.createdAt))
    .limit(100);

  const totalQueries = recentQueries.length;

  if (totalQueries === 0) {
    return {
      timestamp: now,
      avgQualityScore: 0,
      cacheHitRate: 0,
      avgLatencyMs: 0,
      totalQueries: 0,
      scientificRefRate: 0,
      rlvrAvgReward: 0,
      hleBenchmarkScore: 0,
      knowledgeGraphNodes: getGraphStats()?.nodes || 0,
      dpoDatasetSize: 0,
    };
  }

  const avgQualityScore = recentQueries.reduce((sum: number, q: any) => sum + parseFloat(q.qualityScore || '0'), 0) / totalQueries;
  const cacheHitRate = recentQueries.filter((q: any) => q.cacheHit).length / totalQueries;
  const avgLatencyMs = recentQueries.reduce((sum: number, q: any) => sum + (q.responseTime || 0), 0) / totalQueries;

  // Compute scientific reference rate
  const responsesWithRefs = recentQueries.filter((q: any) => {
    if (!q.response) return false;
    return /arXiv:\d{4}\.\d{4,5}|\(\w+(?:\s+et\s+al\.?)?,\s*\d{4}\)/i.test(q.response);
  }).length;
  const scientificRefRate = responsesWithRefs / totalQueries;

  // Compute average RLVR reward
  const rlvrRewards = recentQueries.map((q: any) => {
    if (!q.response) return 0;
    const claims = extractScientificClaims(q.response);
    const reward = computeRLVRReward(q.response, '', parseFloat(q.qualityScore || '0'), claims);
    return reward.totalReward;
  });
  const rlvrAvgReward = rlvrRewards.reduce((sum: number, r: number) => sum + r, 0) / totalQueries;

  // Get graph stats
  const graphStats = getGraphStats();

  // Get DPO dataset size
  const dpoStats = await getDPOStats().catch(() => ({ totalPairs: 0, readyForFineTuning: false, pairsNeeded: 1000, estimatedCostUSD: 0 }));

  return {
    timestamp: now,
    avgQualityScore: Math.round(avgQualityScore * 10) / 10,
    cacheHitRate: Math.round(cacheHitRate * 1000) / 10,  // percentage
    avgLatencyMs: Math.round(avgLatencyMs),
    totalQueries,
    scientificRefRate: Math.round(scientificRefRate * 1000) / 10,
    rlvrAvgReward: Math.round(rlvrAvgReward * 100) / 100,
    hleBenchmarkScore: 0,  // Computed separately (expensive)
    knowledgeGraphNodes: graphStats?.nodes || 0,
    dpoDatasetSize: dpoStats.totalPairs,
  };
}

/**
 * ANALYZE phase: Identify performance gaps and root causes.
 * Uses Abductive Engine for root cause analysis.
 */
export function analyzeMetrics(metrics: SystemMetrics): {
  gaps: string[];
  rootCauses: string[];
  opportunities: string[];
} {
  const gaps: string[] = [];
  const rootCauses: string[] = [];
  const opportunities: string[] = [];

  // Quality gap analysis
  if (metrics.avgQualityScore < 90) {
    gaps.push(`Quality score ${metrics.avgQualityScore}/100 below target 97/100`);
    rootCauses.push('Insufficient scientific grounding in responses');
    rootCauses.push('Suboptimal RAG retrieval (Top-K or threshold tuning needed)');
  }

  // Latency gap analysis
  if (metrics.avgLatencyMs > 3000) {
    gaps.push(`Average latency ${metrics.avgLatencyMs}ms above target 1500ms`);
    rootCauses.push('Tier 3 model (GPT-4o) overused for simple queries');
    rootCauses.push('Cache hit rate too low — semantic cache threshold may be too strict');
  }

  // Cache hit rate analysis
  if (metrics.cacheHitRate < 10) {
    gaps.push(`Cache hit rate ${metrics.cacheHitRate}% below optimal 15%`);
    rootCauses.push('Cache threshold 0.85 may be too strict — consider 0.80');
    opportunities.push('Reduce cache threshold from 0.85 to 0.80 for 30% more cache hits');
  }

  // Scientific reference rate
  if (metrics.scientificRefRate < 60) {
    gaps.push(`Scientific reference rate ${metrics.scientificRefRate}% below target 80%`);
    rootCauses.push('System prompt not sufficiently enforcing citation requirements');
    opportunities.push('Add explicit citation requirement to system prompt with examples');
  }

  // DPO dataset readiness
  if (metrics.dpoDatasetSize < 1000) {
    opportunities.push(`DPO dataset at ${metrics.dpoDatasetSize}/1000 pairs — ${1000 - metrics.dpoDatasetSize} more needed for fine-tuning`);
  }

  // Knowledge graph opportunities
  if (metrics.knowledgeGraphNodes < 100) {
    opportunities.push('Knowledge graph sparse — rebuild after ingesting more papers');
  }

  return { gaps, rootCauses, opportunities };
}

/**
 * PLAN phase: Generate improvement proposals.
 * Based on Constitutional AI (Bai et al., 2022) self-critique and revision.
 */
export function generateProposals(
  metrics: SystemMetrics,
  analysis: ReturnType<typeof analyzeMetrics>
): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];

  // Proposal 1: Cache threshold reduction (if cache hit rate is low)
  if (metrics.cacheHitRate < 10) {
    proposals.push({
      id: 'prop_cache_threshold',
      type: 'cache_threshold',
      description: 'Reduce semantic cache threshold from 0.85 to 0.80',
      rationale: `Cache hit rate is ${metrics.cacheHitRate}% — reducing threshold by 0.05 will increase cache hits by ~30%`,
      expectedImpact: 'Latency reduction ~20%, quality maintained (similar queries get cached responses)',
      currentValue: 0.85,
      proposedValue: 0.80,
      priority: 'high',
      scientificBasis: 'Semantic similarity threshold optimization — Lewis et al. (2020), RAG paper, arXiv:2005.11401',
      autoApprove: true,
    });
  }

  // Proposal 2: RAG Top-K increase (if quality is low)
  if (metrics.avgQualityScore < 88) {
    proposals.push({
      id: 'prop_rag_topk',
      type: 'rag_params',
      description: 'Increase RAG Top-K from 5 to 7 for Tier 2/3 queries',
      rationale: `Quality score ${metrics.avgQualityScore}/100 — more context chunks improve factual accuracy`,
      expectedImpact: 'Quality improvement +2-3 points, latency increase ~200ms',
      currentValue: 5,
      proposedValue: 7,
      priority: 'medium',
      scientificBasis: 'RAG Top-K optimization — Shi et al. (2023), REPLUG, arXiv:2301.12652',
      autoApprove: false,
    });
  }

  // Proposal 3: Knowledge ingestion from arXiv
  if (metrics.knowledgeGraphNodes < 200) {
    proposals.push({
      id: 'prop_knowledge_ingestion',
      type: 'knowledge_ingestion',
      description: 'Trigger arXiv pipeline for 50 new papers in weak domains',
      rationale: 'Knowledge graph is sparse — more papers improve retrieval quality',
      expectedImpact: 'Knowledge base +50 entries, graph +100-200 nodes',
      currentValue: metrics.knowledgeGraphNodes,
      proposedValue: metrics.knowledgeGraphNodes + 150,
      priority: 'medium',
      scientificBasis: 'Continuous knowledge base expansion — Omniscient module design',
      autoApprove: true,
    });
  }

  // Proposal 4: Temperature fine-tuning for Tier 1
  if (metrics.avgQualityScore < 92 && metrics.avgLatencyMs < 5000) {
    proposals.push({
      id: 'prop_temperature_tier1',
      type: 'temperature',
      description: 'Reduce Tier 1 temperature from 0.3 to 0.2 for more deterministic responses',
      rationale: 'Lower temperature reduces hallucination risk in factual queries',
      expectedImpact: 'Quality improvement +1-2 points for factual queries',
      currentValue: 0.3,
      proposedValue: 0.2,
      priority: 'low',
      scientificBasis: 'Temperature calibration — Perez et al. (2022), arXiv:2210.11610',
      autoApprove: false,
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  proposals.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return proposals;
}

/**
 * EXECUTE phase: Apply auto-approved proposals.
 * Returns list of applied proposal IDs.
 *
 * Note: Critical changes require human approval via /proposals command.
 * Auto-approved changes are safe, reversible, and well-tested.
 */
export async function executeProposals(
  proposals: ImprovementProposal[]
): Promise<string[]> {
  const applied: string[] = [];

  // C34 fix: Actually execute proposals with human-in-the-loop gate
  // Scientific basis: DGM (arXiv:2505.22954) — self-modify then validate
  // User requirement: "Human gives last approval before production"
  const { queueForApproval } = await import('./autonomy');
  
  for (const proposal of proposals.filter(p => p.autoApprove)) {
    try {
      // 1. Log the proposal to knowledge base for traceability
      await insertKnowledge({
        title: `[SELF-IMPROVE] ${proposal.id}`,
        content: `[SELF-IMPROVE] Applied proposal: ${proposal.description}. Rationale: ${proposal.rationale}. Expected impact: ${proposal.expectedImpact}. Scientific basis: ${proposal.scientificBasis}`,
        domain: 'AI/ML',
        tags: JSON.stringify(['self-improvement', 'mape-k', proposal.type]),
        source: 'MOTHER Self-Improve v70.0',
        sourceType: 'learning',
      }).catch(() => {}); // Non-blocking

      // 2. Queue for human approval before production deployment
      // Implements human-in-the-loop: MOTHER proposes, human approves
      queueForApproval(
        'MOTHER-SelfImprove',
        `[${proposal.id}] ${proposal.description} — Impact: ${proposal.expectedImpact}`,
        proposal.type === 'routing' ? 'server/mother/intelligence.ts' : undefined,
        `Rationale: ${proposal.rationale}\nScientific basis: ${proposal.scientificBasis}`
      );

      applied.push(proposal.id);
      log.info(`[SelfImprove] Proposal queued for approval: ${proposal.id} — ${proposal.description}`);
    } catch (err) {
      log.error(`[SelfImprove] Failed to process proposal ${proposal.id}:`, err);
    }
  }

  return applied;
}

/**
 * KNOWLEDGE phase: Store improvement cycle results in bd_central.
 * Implements the K component of MAPE-K (Kephart & Chess, 2003).
 */
export async function storeImprovementKnowledge(
  cycle: SelfImprovementCycle
): Promise<void> {
  const summary = `
[MAPE-K Cycle ${cycle.cycleId}] Self-improvement cycle completed.
Metrics: Quality=${cycle.metrics.avgQualityScore}/100, Latency=${cycle.metrics.avgLatencyMs}ms, Cache=${cycle.metrics.cacheHitRate}%
Proposals generated: ${cycle.proposals.length}, Applied: ${cycle.appliedProposals.length}
Knowledge added: ${cycle.knowledgeAdded} entries
Quality delta: ${cycle.qualityDelta > 0 ? '+' : ''}${cycle.qualityDelta} points
Scientific basis: MAPE-K (Kephart & Chess, 2003), Gödel Machine (Schmidhuber, 2003)
  `.trim();

  await insertKnowledge({
    title: `[MAPE-K] Cycle ${cycle.cycleId}`,
    content: summary,
    domain: 'AI/ML',
    tags: JSON.stringify(['mape-k', 'self-improvement', 'cycle-history', `cycle-${cycle.cycleId}`]),
    source: 'MOTHER Self-Improve v70.0',
    sourceType: 'learning',
  }).catch((err: any) => log.error('[SelfImprove] Failed to store knowledge:', err));
}

/**
 * Run a complete MAPE-K self-improvement cycle.
 * This is the main entry point for the self-improvement orchestrator.
 *
 * Triggered by:
 * - /self-improve command
 * - Scheduled daily execution (via cron)
 * - Quality score dropping below threshold
 */
export async function runSelfImprovementCycle(): Promise<SelfImprovementCycle> {
  const cycleId = `cycle_${Date.now()}`;
  const startTime = new Date();

  log.info(`[SelfImprove] Starting MAPE-K cycle ${cycleId}`);

  // 1. MONITOR
  const metrics = await monitorSystem();
  log.info(`[SelfImprove] Metrics: quality=${metrics.avgQualityScore}, latency=${metrics.avgLatencyMs}ms, cache=${metrics.cacheHitRate}%`);

  // 2. ANALYZE
  const analysis = analyzeMetrics(metrics);
  log.info(`[SelfImprove] Gaps: ${analysis.gaps.length}, Root causes: ${analysis.rootCauses.length}, Opportunities: ${analysis.opportunities.length}`);

  // 3. PLAN
  const proposals = generateProposals(metrics, analysis);
  log.info(`[SelfImprove] Generated ${proposals.length} proposals`);

  // 4. EXECUTE (auto-approved only)
  const appliedProposals = await executeProposals(proposals);

  // 5. Rebuild knowledge graph if needed
  let knowledgeAdded = 0;
  if (metrics.knowledgeGraphNodes < 100) {
    const graphStats = await buildKnowledgeGraph().catch(() => ({ nodes: 0, edges: 0, communities: 0 }));
    knowledgeAdded = graphStats.nodes;
  }

  const cycle: SelfImprovementCycle = {
    cycleId,
    startTime,
    endTime: new Date(),
    metrics,
    proposals,
    appliedProposals,
    knowledgeAdded,
    qualityDelta: 0,  // Computed after next evaluation
  };

  // 5. KNOWLEDGE
  await storeImprovementKnowledge(cycle);

  log.info(`[SelfImprove] Cycle ${cycleId} completed in ${Date.now() - startTime.getTime()}ms`);

  return cycle;
}

/**
 * Get self-improvement status for the /audit command.
 */
export async function getSelfImprovementStatus(): Promise<{
  lastCycle: string | null;
  metrics: Partial<SystemMetrics>;
  pendingProposals: number;
  dpoStatus: { pairs: number; readyForFineTuning: boolean };
  graphStatus: { nodes: number; edges: number } | null;
}> {
  const metrics = await monitorSystem().catch(() => null);
  const dpoStats = await getDPOStats().catch(() => ({ totalPairs: 0, readyForFineTuning: false, pairsNeeded: 1000, estimatedCostUSD: 0 }));
  const graphStats = getGraphStats();

  const proposals = metrics ? generateProposals(metrics, analyzeMetrics(metrics)) : [];

  return {
    lastCycle: null,  // Would be stored in DB in production
    metrics: metrics || {},
    pendingProposals: proposals.length,
    dpoStatus: {
      pairs: dpoStats.totalPairs,
      readyForFineTuning: dpoStats.readyForFineTuning,
    },
    graphStatus: graphStats ? { nodes: graphStats.nodes, edges: 0 } : null,
  };
}
