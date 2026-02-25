/**
 * MOTHER v59.0 — Self-Proposal Engine
 * 
 * MOTHER autonomously analyzes her own metrics and generates improvement proposals.
 * This is the core of the Darwin Gödel Machine (DGM) self-improvement loop.
 * 
 * Scientific Basis:
 * - Darwin Gödel Machine (Zhang et al., 2025) [arXiv:2505.22954]
 *   "An open-ended self-improving system that iteratively modifies itself"
 * - Gödel Agent (Ren et al., 2024) [arXiv:2410.04444]
 *   "Recursive self-improvement through formal reasoning"
 * - LIVE-SWE-AGENT (Xia et al., 2025) [arXiv:2511.13646]
 *   "Continuous software evolution in production environments"
 * 
 * Architecture:
 * 1. OBSERVE: Read system metrics from DB (latency, quality, cost, errors)
 * 2. ANALYZE: Identify the metric furthest from its target
 * 3. HYPOTHESIZE: Generate a testable improvement hypothesis
 * 4. PROPOSE: Insert into self_proposals table (requires creator approval)
 * 5. EVALUATE: After deployment, measure fitness delta
 */

import { getDb } from '../db';
import { logAuditEvent } from './update-proposals';

// ============================================================
// TYPES
// ============================================================

export interface SystemMetricsSummary {
  avgQuality: number;
  avgResponseTime: number;
  avgCost: number;
  totalQueries: number;
  tier1Percentage: number;
  cacheHitRate: number;
  knowledgeEntries: number;
  learningRate: number; // % of queries that resulted in learning
}

export interface SelfProposal {
  id?: number;
  title: string;
  description: string;
  hypothesis: string;
  metricTrigger: string;
  metricValue: number;
  metricTarget: number;
  proposedChanges: string; // JSON
  fitnessFunction: string;
  status: 'pending' | 'approved' | 'implementing' | 'testing' | 'deployed' | 'rejected' | 'failed';
  versionTag: string;
  scientificBasis: string;
}

// ============================================================
// METRIC TARGETS (IMMACULATE PERFECTION = 10/10)
// ============================================================

const METRIC_TARGETS = {
  avgQuality: 100,          // Target: 100/100
  avgResponseTime: 2000,    // Target: < 2000ms (currently ~4400ms)
  cacheHitRate: 0.35,       // Target: 35% cache hit rate
  tier1Percentage: 85,      // Target: 85% queries handled by tier-1 (cheapest)
  knowledgeEntries: 100,    // Target: 100+ knowledge entries
  learningRate: 0.5,        // Target: 50% of queries result in learning
};

// ============================================================
// CORE: READ SYSTEM METRICS
// ============================================================

export async function readSystemMetrics(): Promise<SystemMetricsSummary | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    // Read from queries table (last 24h)
    // v63.0 FIX: Use camelCase column names matching the actual DB schema
    const [queryStats] = await (db as any).$client.query(`
      SELECT 
        AVG(CAST(qualityScore AS FLOAT)) as avg_quality,
        AVG(responseTime) as avg_response_time,
        AVG(CAST(cost AS FLOAT)) as avg_cost,
        COUNT(*) as total_queries,
        SUM(CASE WHEN tier = 'gpt-4o-mini' THEN 1 ELSE 0 END) / COUNT(*) * 100 as tier1_pct,
        SUM(cacheHit) / COUNT(*) as cache_hit_rate
      FROM queries
      WHERE createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    // Read knowledge count
    const [knowledgeStats] = await (db as any).$client.query(`
      SELECT COUNT(*) as count FROM knowledge
    `).catch(() => [[{ count: 0 }]]);

    // Read learning rate (queries that triggered learning)
    // v63.0 FIX: Use camelCase column names matching the actual DB schema
    const [learningStats] = await (db as any).$client.query(`
      SELECT COUNT(*) as learned_count FROM knowledge
      WHERE createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `).catch(() => [[{ learned_count: 0 }]]);

    const stats = queryStats[0] || {};
    const totalQueries = Number(stats.total_queries) || 0;
    const learnedCount = Number(learningStats[0]?.learned_count) || 0;

    return {
      avgQuality: Number(stats.avg_quality) || 0,
      avgResponseTime: Number(stats.avg_response_time) || 0,
      avgCost: Number(stats.avg_cost) || 0,
      totalQueries,
      tier1Percentage: Number(stats.tier1_pct) || 0,
      cacheHitRate: Number(stats.cache_hit_rate) || 0,
      knowledgeEntries: Number(knowledgeStats[0]?.count) || 0,
      learningRate: totalQueries > 0 ? learnedCount / totalQueries : 0,
    };
  } catch (error) {
    console.error('[SelfProposal] Failed to read metrics:', error);
    return null;
  }
}

// ============================================================
// CORE: ANALYZE AND GENERATE PROPOSAL
// ============================================================

export async function analyzeAndPropose(): Promise<SelfProposal | null> {
  const metrics = await readSystemMetrics();
  if (!metrics) {
    console.log('[SelfProposal] No metrics available yet — skipping analysis');
    return null;
  }

  console.log('[SelfProposal] Analyzing metrics:', metrics);

  // Find the metric with the largest gap from its target
  const gaps = [
    {
      metric: 'avgQuality',
      current: metrics.avgQuality,
      target: METRIC_TARGETS.avgQuality,
      gap: METRIC_TARGETS.avgQuality - metrics.avgQuality,
      priority: 10, // Highest priority
    },
    {
      metric: 'avgResponseTime',
      current: metrics.avgResponseTime,
      target: METRIC_TARGETS.avgResponseTime,
      gap: metrics.avgResponseTime > METRIC_TARGETS.avgResponseTime
        ? metrics.avgResponseTime - METRIC_TARGETS.avgResponseTime
        : 0,
      priority: 8,
    },
    {
      metric: 'cacheHitRate',
      current: metrics.cacheHitRate,
      target: METRIC_TARGETS.cacheHitRate,
      gap: (METRIC_TARGETS.cacheHitRate - metrics.cacheHitRate) * 100,
      priority: 6,
    },
    {
      metric: 'knowledgeEntries',
      current: metrics.knowledgeEntries,
      target: METRIC_TARGETS.knowledgeEntries,
      gap: Math.max(0, METRIC_TARGETS.knowledgeEntries - metrics.knowledgeEntries),
      priority: 7,
    },
  ];

  // Sort by priority * gap (weighted)
  gaps.sort((a, b) => (b.gap * b.priority) - (a.gap * a.priority));
  const topGap = gaps[0];

  if (topGap.gap <= 0) {
    console.log('[SelfProposal] All metrics at target — IMMACULATE PERFECTION achieved!');
    await logAuditEvent({
      action: 'IMMACULATE_PERFECTION_ACHIEVED',
      actorType: 'mother',
      targetType: 'system',
      targetId: 'all_metrics',
      details: 'All system metrics have reached their targets. MOTHER has achieved IMMACULATE PERFECTION.',
      success: true,
    });
    return null;
  }

  // Generate proposal based on the top gap
  const proposal = generateProposalForMetric(topGap.metric, topGap.current, topGap.target, metrics);

  // Check if a similar proposal already exists (avoid duplicates)
  const exists = await checkProposalExists(topGap.metric);
  if (exists) {
    console.log(`[SelfProposal] Proposal for ${topGap.metric} already exists — skipping`);
    return null;
  }

  // Insert into self_proposals table
  const id = await insertSelfProposal(proposal);
  if (id) {
    proposal.id = id;
    console.log(`[SelfProposal] ✅ New proposal created: ID ${id} — "${proposal.title}"`);
    
    await logAuditEvent({
      action: 'SELF_PROPOSAL_CREATED',
      actorType: 'mother',
      targetType: 'self_proposal',
      targetId: String(id),
      details: `MOTHER generated proposal: "${proposal.title}". Metric: ${topGap.metric} = ${topGap.current.toFixed(2)} (target: ${topGap.target})`,
      success: true,
    });
  }

  return proposal;
}

// ============================================================
// PROPOSAL TEMPLATES BY METRIC
// ============================================================

function generateProposalForMetric(
  metric: string,
  current: number,
  target: number,
  allMetrics: SystemMetricsSummary
): SelfProposal {
  const proposals: Record<string, SelfProposal> = {
    avgQuality: {
      title: 'Improve Quality Scoring: Add Semantic Similarity Check',
      description: `Current average quality score is ${current.toFixed(1)}/100. Target is ${target}/100. The quality scoring system needs to be enhanced with semantic similarity checking between query and response to improve relevance scoring.`,
      hypothesis: 'Adding a semantic similarity check between the user query and the generated response will increase the average quality score from ' + current.toFixed(1) + ' to ' + (current + 2).toFixed(1) + ' by ensuring responses are more topically aligned.',
      metricTrigger: 'avgQuality',
      metricValue: current,
      metricTarget: target,
      proposedChanges: JSON.stringify({
        files: ['server/mother/guardian.ts'],
        changes: [
          'Add semantic similarity check using cosine similarity between query embedding and response embedding',
          'Weight relevance score at 50% (up from 45%) in quality calculation',
          'Add citation bonus: +5 points if response contains scientific citations'
        ]
      }),
      fitnessFunction: 'Average quality score across 20 test queries. Pass if avg_quality >= ' + (current + 1.5).toFixed(1),
      status: 'pending',
      versionTag: 'v60.0',
      scientificBasis: 'ROUGE (Lin, 2004); BERTScore (Zhang et al., 2020 arXiv:1904.09675); Guardian Quality System (MOTHER v56.0)',
    },
    avgResponseTime: {
      title: 'Reduce Response Latency: Implement Parallel Knowledge Retrieval',
      description: `Current average response time is ${current.toFixed(0)}ms. Target is ${target}ms. The sequential knowledge retrieval pipeline can be parallelized to reduce latency.`,
      hypothesis: 'Running knowledge retrieval, episodic memory search, and user memory retrieval in parallel (Promise.all) instead of sequentially will reduce average response time from ' + current.toFixed(0) + 'ms to below ' + target + 'ms.',
      metricTrigger: 'avgResponseTime',
      metricValue: current,
      metricTarget: target,
      proposedChanges: JSON.stringify({
        files: ['server/mother/core.ts'],
        changes: [
          'Wrap getKnowledgeContext(), searchEpisodicMemory(), and getUserMemoryContext() in Promise.all()',
          'Add 2s timeout to each retrieval to prevent blocking',
          'Pre-warm the DB connection pool on startup'
        ]
      }),
      fitnessFunction: 'Average response time across 10 test queries. Pass if avg_response_time <= ' + target + 'ms',
      status: 'pending',
      versionTag: 'v60.0',
      scientificBasis: 'Amdahl\'s Law (Amdahl, 1967); Node.js Event Loop (Node.js Foundation, 2023); Promise.all() MDN Web Docs',
    },
    knowledgeEntries: {
      title: 'Bootstrap Knowledge Base: Ingest Intelltech Domain Papers',
      description: `Current knowledge base has ${current} entries. Target is ${target}. Ingesting domain-specific papers from arXiv about AI, geotechnics, and mining will accelerate MOTHER's knowledge growth.`,
      hypothesis: 'Ingesting 10 curated papers from arXiv covering AI systems, geotechnical monitoring, and mining operations will increase knowledge entries from ' + current + ' to ' + (current + 30) + ' and improve response quality for Intelltech-specific queries.',
      metricTrigger: 'knowledgeEntries',
      metricValue: current,
      metricTarget: target,
      proposedChanges: JSON.stringify({
        files: ['server/mother/paper-ingest.ts', 'server/routers/mother.ts'],
        changes: [
          'Add scheduled paper ingestion job (daily at 3am UTC)',
          'Ingest papers: arXiv:2505.22954 (DGM), arXiv:2210.03629 (ReAct), arXiv:2201.11903 (CoT)',
          'Add Intelltech domain papers: geotechnical monitoring, slope stability, SHMS'
        ]
      }),
      fitnessFunction: 'Count of knowledge entries after ingestion. Pass if knowledge_count >= ' + (current + 10),
      status: 'pending',
      versionTag: 'v59.0',
      scientificBasis: 'RAG (Lewis et al., 2020 arXiv:2005.11401); arXiv API Documentation; SHMS (Slope Health Monitoring Systems)',
    },
    cacheHitRate: {
      title: 'Improve Cache Hit Rate: Semantic Query Deduplication',
      description: `Current cache hit rate is ${(current * 100).toFixed(1)}%. Target is ${(target * 100).toFixed(0)}%. Implementing semantic query deduplication will allow similar queries to hit the cache.`,
      hypothesis: 'Using cosine similarity (threshold 0.92) to match semantically similar queries to cached responses will increase cache hit rate from ' + (current * 100).toFixed(1) + '% to ' + (target * 100).toFixed(0) + '%.',
      metricTrigger: 'cacheHitRate',
      metricValue: current,
      metricTarget: target,
      proposedChanges: JSON.stringify({
        files: ['server/mother/core.ts', 'server/db.ts'],
        changes: [
          'Add semantic cache lookup: search cache_entries by embedding similarity before exact hash match',
          'Use cosine similarity threshold of 0.92 for cache hits',
          'Increase cache TTL from 24h to 72h for high-quality responses'
        ]
      }),
      fitnessFunction: 'Cache hit rate across 50 test queries (including semantic variants). Pass if cache_hit_rate >= ' + (target * 100).toFixed(0) + '%',
      status: 'pending',
      versionTag: 'v60.0',
      scientificBasis: 'Semantic Caching (Bang et al., 2023); GPTCache (Zeng et al., 2023); Cosine Similarity (Salton & McGill, 1983)',
    },
  };

  return proposals[metric] || proposals['avgQuality'];
}

// ============================================================
// DB OPERATIONS
// ============================================================

async function checkProposalExists(metricTrigger: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const [rows] = await (db as any).$client.query(
      `SELECT id FROM self_proposals WHERE metric_trigger = ? AND status IN ('pending', 'approved', 'implementing') LIMIT 1`,
      [metricTrigger]
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function insertSelfProposal(proposal: SelfProposal): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [result] = await (db as any).$client.query(
      `INSERT INTO self_proposals 
        (title, description, hypothesis, metric_trigger, metric_value, metric_target, 
         proposed_changes, fitness_function, status, version_tag, scientific_basis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        proposal.title,
        proposal.description,
        proposal.hypothesis,
        proposal.metricTrigger,
        proposal.metricValue,
        proposal.metricTarget,
        proposal.proposedChanges,
        proposal.fitnessFunction,
        proposal.status,
        proposal.versionTag,
        proposal.scientificBasis,
      ]
    );
    return (result as any).insertId || null;
  } catch (error) {
    console.error('[SelfProposal] Failed to insert proposal:', error);
    return null;
  }
}

// ============================================================
// GET PROPOSALS
// ============================================================

export async function getSelfProposals(status?: string): Promise<SelfProposal[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const whereClause = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const [rows] = await (db as any).$client.query(
      `SELECT * FROM self_proposals ${whereClause} ORDER BY created_at DESC LIMIT 20`,
      params
    );
    return (rows || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      hypothesis: r.hypothesis,
      metricTrigger: r.metric_trigger,
      metricValue: r.metric_value,
      metricTarget: r.metric_target,
      proposedChanges: r.proposed_changes,
      fitnessFunction: r.fitness_function,
      status: r.status,
      versionTag: r.version_tag,
      scientificBasis: r.scientific_basis,
    }));
  } catch (error) {
    console.error('[SelfProposal] Failed to get proposals:', error);
    return [];
  }
}

// ============================================================
// TRIGGER: Run analysis after every N queries
// Called from core.ts after each successful query
// ============================================================

let queryCountSinceLastAnalysis = 0;
const ANALYSIS_INTERVAL = 10; // Run analysis every 10 queries

export async function maybeRunAnalysis(): Promise<void> {
  queryCountSinceLastAnalysis++;
  if (queryCountSinceLastAnalysis >= ANALYSIS_INTERVAL) {
    queryCountSinceLastAnalysis = 0;
    console.log('[SelfProposal] Running autonomous metric analysis...');
    analyzeAndPropose().catch(err => 
      console.error('[SelfProposal] Analysis failed (non-blocking):', err)
    );
  }
}
