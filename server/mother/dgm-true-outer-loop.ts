/**
 * DGM True Outer Loop — Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025)
 *
 * This module implements the TRUE DGM algorithm as described in the paper:
 * "An open-ended self-improving system that iteratively modifies its own code
 *  and empirically validates each change using benchmarks."
 *
 * Key differences from the previous dgm-orchestrator.ts:
 * 1. ARCHIVE: MAP-Elites-style population of agent variants (not linear evolution)
 * 2. EMPIRICAL FITNESS: Real query benchmarks (not static code analysis)
 * 3. PARENT SELECTION: score_child_prop with sigmoid probability (not always current)
 * 4. PARALLEL EXPLORATION: Multiple mutations per generation
 * 5. ENTRY-BASED MUTATION: Targeted mutation operators (solve_low_quality, etc.)
 * 6. SELF-REFERENTIAL: Agent modifies its OWN pipeline code
 *
 * Scientific basis:
 * - Darwin Gödel Machine (Zhang et al., arXiv:2505.22954, 2025)
 *   "Empirical validation replaces impractical theoretical proofs"
 * - MAP-Elites (Mouret & Clune, arXiv:1504.04909, 2015)
 *   "Illuminating search spaces by mapping elites"
 * - GEA: Group-Evolving Agents (Weng et al., arXiv:2602.04837, 2025)
 *   "Population-based agent evolution with shared experience"
 * - SICA: Self-Improving Coding Agent (arXiv:2504.15228, Bristol, 2025)
 *   "Validation before commit reduces failure rate from 83% to 17%"
 * - Gödel Machine (Schmidhuber, 2007)
 *   "Self-referential system that rewrites its own code"
 *
 * @module dgm-true-outer-loop
 */

import { createHash, randomUUID } from 'crypto';
import { createLogger } from '../_core/logger';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import { processQuery } from './core';
import { orchestrate as coreOrchestrate } from './core-orchestrator';
import { fitnessEvaluator } from './fitness-evaluator';
import { checkSafetyGate } from './safety-gate';
import { recordAuditEntry } from './audit-trail';
import { createProposal, applyProposal } from './self-modifier';

const log = createLogger('DGM-TRUE');

// ─── Proof Hash Utility ──────────────────────────────────────────────────────
// Gödel Machine (Schmidhuber, 2007): "Every self-modification must be verifiable"
// DGM (Zhang et al., 2025): "Empirical validation replaces impractical proofs"
// We use SHA-256 hashes as lightweight proof-of-state for every DGM operation.

function proofHash(data: unknown): string {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 0);
  return createHash('sha256').update(serialized).digest('hex');
}

// ─── Constants (from paper: arXiv:2505.22954 Section 3) ──────────────────────

/** Maximum generations before stopping (paper default: 80) */
const MAX_GENERATIONS = 80;

/** Number of self-improvement attempts per generation (paper default: 2) */
const SELFIMPROVE_SIZE = 2;

/** Maximum concurrent mutation workers (paper default: 2) */
const SELFIMPROVE_WORKERS = 2;

/** Minimum accuracy to enter archive when using 'keep_better' (paper: original - 0.1) */
const NOISE_LEEWAY = 0.1;

/** Timeout for a single self-improvement attempt in ms (paper: 30min = 1800s) */
const SELFIMPROVE_TIMEOUT_MS = 30 * 60 * 1000;

/** Minimum fitness score to auto-deploy (MOTHER existing threshold) */
const DEPLOY_THRESHOLD = 75;

/** Minimum benchmark accuracy to pass additional evaluation */
const TEST_MORE_THRESHOLD = 0.4;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * An agent variant in the archive.
 * Corresponds to a specific configuration of MOTHER's pipeline.
 *
 * arXiv:2505.22954 Section 3.1: "Each node in the evolutionary tree
 * represents a complete agent variant with its own codebase modifications."
 */
export interface AgentVariant {
  /** Unique identifier for this variant */
  id: string;
  /** Parent variant ID ('initial' for the base agent) */
  parentId: string;
  /** Generation number when this variant was created */
  generation: number;
  /** Number of children spawned from this variant */
  childrenCount: number;
  /** Accuracy score on benchmark (0-1) — the PRIMARY fitness metric */
  accuracyScore: number;
  /** Which benchmark queries were resolved, unresolved, or empty */
  resolvedIds: string[];
  unresolvedIds: string[];
  emptyPatchIds: string[];
  /** Total queries submitted for evaluation */
  totalSubmittedInstances: number;
  /** The code modifications (patches) from initial to this variant */
  patches: string[];
  /** Strategy description: what this variant changed */
  strategyDescription: string;
  /** 7-dimension fitness breakdown (MOTHER's existing evaluator) */
  fitnessBreakdown?: Record<string, number>;
  /** Timestamp of creation */
  createdAt: Date;
  /** Is this variant compiled and functional? */
  isCompiled: boolean;
  /** SHA-256 proof hash of this variant's complete state (Gödel Machine verifiability) */
  proofHash: string;
  /** SHA-256 hash of the diagnosis that produced this variant */
  diagnosisHash?: string;
  /** SHA-256 hash of the proposed code modification */
  modificationHash?: string;
  /** SHA-256 hash of the benchmark evaluation results */
  benchmarkHash?: string;
}

/**
 * Mutation entry: describes what to improve.
 *
 * arXiv:2505.22954 Section 3.2: "Selected parent agents analyze their own
 * benchmark evaluation logs to identify weaknesses or propose new features."
 */
export interface MutationEntry {
  /** Parent variant to mutate */
  parentId: string;
  /** Type of mutation to apply */
  entryType: MutationType;
  /** Specific target (e.g., a query ID that failed, or a module name) */
  target?: string;
}

/**
 * Mutation types inspired by DGM paper's entry selection (self_improve_step.py).
 * Adapted for MOTHER's domain (LLM pipeline vs coding agent).
 */
export type MutationType =
  | 'solve_low_quality'       // Fix queries with G-Eval < 70
  | 'solve_hallucination'     // Fix queries with low citation grounding
  | 'solve_slow_response'     // Optimize queries with latency > 5s
  | 'solve_cache_miss'        // Improve cache hit rate for frequent queries
  | 'solve_empty_response'    // Fix queries that returned empty/error
  | 'solve_stochasticity'     // Reduce variance in response quality
  | 'improve_tool_usage'      // Better ReAct tool detection/execution
  | 'improve_retrieval'       // Better RAG/HippoRAG2 retrieval
  | 'general_improvement';    // LLM-proposed open-ended improvement

/**
 * Parent selection method.
 *
 * arXiv:2505.22954 Algorithm 1 (DGM_outer.py lines 55-85):
 * - score_child_prop: P(parent) ∝ sigmoid(accuracy) × 1/(1+children)
 * - score_prop: P(parent) ∝ sigmoid(accuracy)
 * - random: uniform random
 * - best: deterministic top-K
 */
export type ParentSelectionMethod =
  | 'score_child_prop'  // Default: accuracy × inverse children (exploration bonus)
  | 'score_prop'        // Pure accuracy-proportional
  | 'random'            // Uniform random
  | 'best';             // Deterministic best

/**
 * Archive update strategy.
 *
 * arXiv:2505.22954 Section 3.3:
 * - keep_all: all compiled variants enter archive (maximum diversity)
 * - keep_better: only variants scoring above (initial - noise_leeway)
 */
export type ArchiveUpdateMethod = 'keep_all' | 'keep_better';

/**
 * Benchmark query for empirical evaluation.
 * Analogous to SWE-bench instances in the original DGM.
 */
export interface BenchmarkQuery {
  id: string;
  query: string;
  /** Expected quality criteria */
  expectedMinQuality: number;
  /** Category for stratified evaluation */
  category: string;
  /** Reference answer (if available) for G-Eval comparison */
  referenceAnswer?: string;
}

/**
 * Result of a single generation in the DGM outer loop.
 */
export interface GenerationResult {
  generation: number;
  mutations: MutationEntry[];
  childrenIds: string[];
  childrenCompiledIds: string[];
  archiveSize: number;
  bestAccuracy: number;
  timestamp: string;
  /** SHA-256 hash of this generation's complete state */
  generationHash: string;
}

/**
 * Full DGM run state (persisted to dgm_metadata JSONL).
 */
export interface DGMRunState {
  runId: string;
  currentGeneration: number;
  archive: string[];
  generationResults: GenerationResult[];
  startedAt: string;
  config: DGMConfig;
}

/**
 * Configuration for a DGM run.
 */
export interface DGMConfig {
  maxGenerations: number;
  selfImproveSize: number;
  selfImproveWorkers: number;
  parentSelectionMethod: ParentSelectionMethod;
  archiveUpdateMethod: ArchiveUpdateMethod;
  noiseLeeway: number;
  deployThreshold: number;
  /** Benchmark query sets: small (quick eval), medium (deeper eval), big (full eval) */
  benchmarkSmall: BenchmarkQuery[];
  benchmarkMedium: BenchmarkQuery[];
}

// ─── Archive Management ──────────────────────────────────────────────────────

/**
 * In-memory archive of agent variants.
 * Persisted to dgm_archive table and dgm_metadata JSONL.
 *
 * MAP-Elites analogy (arXiv:1504.04909):
 * - Each cell = a unique agent variant
 * - Fitness = accuracy on benchmark
 * - Behavioral descriptor = strategy type × mutation target
 */
const archive = new Map<string, AgentVariant>();

/**
 * Initialize the archive with the 'initial' variant (base MOTHER).
 */
async function initializeArchive(benchmarkSmall: BenchmarkQuery[]): Promise<void> {
  if (archive.has('initial')) return;

  // Evaluate the base MOTHER agent on the small benchmark
  const baseAccuracy = await evaluateVariant('initial', [], benchmarkSmall);

  const benchmarkHash = proofHash({ queries: benchmarkSmall.map(q => q.id), results: baseAccuracy.results });

  const initial: AgentVariant = {
    id: 'initial',
    parentId: '',
    generation: 0,
    childrenCount: 0,
    accuracyScore: baseAccuracy.accuracy,
    resolvedIds: baseAccuracy.resolvedIds,
    unresolvedIds: baseAccuracy.unresolvedIds,
    emptyPatchIds: baseAccuracy.emptyPatchIds,
    totalSubmittedInstances: benchmarkSmall.length,
    patches: [],
    strategyDescription: 'Base MOTHER agent (no modifications)',
    createdAt: new Date(),
    isCompiled: true,
    proofHash: '', // computed below
    benchmarkHash,
  };
  initial.proofHash = proofHash(initial);

  archive.set('initial', initial);

  // Persist to DB
  await persistVariantToDb(initial);

  log.info(`[ARCHIVE] PROOF initial.proofHash=${initial.proofHash.slice(0, 16)}...`);
  log.info(`[ARCHIVE] PROOF initial.benchmarkHash=${benchmarkHash.slice(0, 16)}...`);

  log.info(`[ARCHIVE] Initialized with base accuracy: ${(baseAccuracy.accuracy * 100).toFixed(1)}%`);
}

/**
 * Get the original (initial) accuracy score.
 */
function getOriginalScore(): number {
  const initial = archive.get('initial');
  return initial?.accuracyScore ?? 0;
}

/**
 * Update the archive with new compiled variants.
 *
 * arXiv:2505.22954 Algorithm 1, line 15:
 * "archive = update_archive(archive, children_compiled, method)"
 */
function updateArchive(newVariantIds: string[], method: ArchiveUpdateMethod, noiseLeeway: number): void {
  if (method === 'keep_better') {
    const threshold = getOriginalScore() - noiseLeeway;
    for (const id of newVariantIds) {
      const variant = archive.get(id);
      if (variant && variant.accuracyScore >= threshold) {
        // Already in archive map, just confirm
        log.info(`[ARCHIVE] Kept variant ${id} (accuracy ${(variant.accuracyScore * 100).toFixed(1)}% >= threshold ${(threshold * 100).toFixed(1)}%)`);
      } else if (variant) {
        archive.delete(id);
        log.info(`[ARCHIVE] Pruned variant ${id} (accuracy ${(variant.accuracyScore * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(1)}%)`);
      }
    }
  }
  // 'keep_all': all compiled variants already added to archive during mutation
  log.info(`[ARCHIVE] Size after update: ${archive.size} variants`);
}

// ─── Parent Selection ────────────────────────────────────────────────────────

/**
 * Select parents for mutation using the chosen strategy.
 *
 * arXiv:2505.22954 DGM_outer.py lines 55-85:
 * - score_child_prop: sigmoid(accuracy) × 1/(1+children)
 * - score_prop: sigmoid(accuracy)
 * - random: uniform
 * - best: top-K
 *
 * The sigmoid function: σ(x) = 1/(1+e^(-10(x-0.5)))
 * Centers the probability distribution around 50% accuracy.
 */
function selectParents(
  count: number,
  method: ParentSelectionMethod,
): string[] {
  const candidates: Array<{ id: string; accuracy: number; children: number }> = [];

  for (const [id, variant] of archive) {
    candidates.push({
      id,
      accuracy: variant.accuracyScore,
      children: variant.childrenCount,
    });
  }

  if (candidates.length === 0) return [];

  switch (method) {
    case 'score_child_prop': {
      // P(parent) ∝ sigmoid(accuracy) × 1/(1+children)
      const scores = candidates.map(c => {
        const sigmoid = 1 / (1 + Math.exp(-10 * (c.accuracy - 0.5)));
        const childPenalty = 1 / (1 + c.children);
        return sigmoid * childPenalty;
      });
      return weightedRandomSample(candidates.map(c => c.id), scores, count);
    }

    case 'score_prop': {
      // P(parent) ∝ sigmoid(accuracy)
      const scores = candidates.map(c => 1 / (1 + Math.exp(-10 * (c.accuracy - 0.5))));
      return weightedRandomSample(candidates.map(c => c.id), scores, count);
    }

    case 'best': {
      // Deterministic: top-K by accuracy
      const sorted = [...candidates].sort((a, b) => b.accuracy - a.accuracy);
      const topK = sorted.slice(0, Math.min(count, sorted.length));
      // Fill remaining with repetition
      const result: string[] = [];
      for (let i = 0; i < count; i++) {
        result.push(topK[i % topK.length].id);
      }
      return result;
    }

    case 'random':
    default: {
      return Array.from({ length: count }, () =>
        candidates[Math.floor(Math.random() * candidates.length)].id
      );
    }
  }
}

/**
 * Weighted random sampling with replacement.
 */
function weightedRandomSample(items: string[], weights: number[], count: number): string[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return items.slice(0, count);

  const probabilities = weights.map(w => w / totalWeight);
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let cumulative = 0;
    for (let j = 0; j < items.length; j++) {
      cumulative += probabilities[j];
      if (r <= cumulative) {
        result.push(items[j]);
        break;
      }
    }
    if (result.length <= i) result.push(items[items.length - 1]);
  }

  return result;
}

// ─── Mutation Entry Selection ────────────────────────────────────────────────

/**
 * Choose mutation entries for a generation.
 *
 * arXiv:2505.22954 self_improve_step.py — diagnose_problem():
 * The original DGM selects specific SWE-bench issues to improve.
 * MOTHER adaptation: selects specific weakness types to address.
 */
function chooseMutationEntries(
  parentIds: string[],
): MutationEntry[] {
  const entries: MutationEntry[] = [];

  for (const parentId of parentIds) {
    const parent = archive.get(parentId);
    if (!parent) continue;

    const totalIds = parent.resolvedIds.length + parent.unresolvedIds.length + parent.emptyPatchIds.length;

    // Decision tree for mutation type (adapted from DGM_outer.py lines 90-110)

    // 25% chance: fix empty responses (like solve_empty_patches)
    if (parent.emptyPatchIds.length >= 0.1 * totalIds && Math.random() < 0.25) {
      entries.push({ parentId, entryType: 'solve_empty_response', target: parent.emptyPatchIds[0] });
      continue;
    }

    // 25% chance: reduce stochasticity (like solve_stochasticity)
    if (Math.random() < 0.25) {
      entries.push({ parentId, entryType: 'solve_stochasticity' });
      continue;
    }

    // 20% chance: fix hallucination (MOTHER-specific)
    if (Math.random() < 0.20) {
      entries.push({ parentId, entryType: 'solve_hallucination' });
      continue;
    }

    // 15% chance: fix slow responses
    if (Math.random() < 0.15) {
      entries.push({ parentId, entryType: 'solve_slow_response' });
      continue;
    }

    // Default: pick a random unresolved query to improve
    if (parent.unresolvedIds.length > 0) {
      const target = parent.unresolvedIds[Math.floor(Math.random() * parent.unresolvedIds.length)];
      entries.push({ parentId, entryType: 'solve_low_quality', target });
    } else {
      entries.push({ parentId, entryType: 'general_improvement' });
    }
  }

  return entries;
}

// ─── Empirical Benchmark Evaluation ──────────────────────────────────────────

/**
 * Evaluate an agent variant on a benchmark query set.
 *
 * THIS IS THE KEY DIFFERENCE FROM MOTHER'S ORIGINAL DGM:
 * Instead of static code analysis (McCabe complexity, JSDoc coverage),
 * we run REAL queries through the pipeline and measure ACTUAL quality.
 *
 * arXiv:2505.22954 Section 3.3:
 * "Each agent's performance is quantitatively scored using benchmark tasks."
 *
 * Analogies:
 * - DGM paper uses SWE-bench (coding tasks) → MOTHER uses user query benchmark
 * - DGM measures % resolved issues → MOTHER measures % queries with G-Eval ≥ 70
 */
async function evaluateVariant(
  variantId: string,
  _patches: string[],
  benchmark: BenchmarkQuery[],
): Promise<{
  accuracy: number;
  resolvedIds: string[];
  unresolvedIds: string[];
  emptyPatchIds: string[];
  results: Array<{ id: string; quality: number; latency: number; error?: string }>;
}> {
  const results: Array<{ id: string; quality: number; latency: number; error?: string }> = [];
  const resolvedIds: string[] = [];
  const unresolvedIds: string[] = [];
  const emptyPatchIds: string[] = [];

  log.info(`[BENCHMARK] Evaluating variant ${variantId} on ${benchmark.length} queries...`);

  for (const query of benchmark) {
    try {
      const start = Date.now();
      const result = await processQuery({
        query: query.query,
        useCache: false,  // No cache — must test actual pipeline
        conversationHistory: [],
      });
      const latency = Date.now() - start;

      const qualityScore = result.quality?.qualityScore ?? 0;
      results.push({ id: query.id, quality: qualityScore, latency });

      if (!result.response || result.response.trim().length < 10) {
        emptyPatchIds.push(query.id);
      } else if (qualityScore >= query.expectedMinQuality) {
        resolvedIds.push(query.id);
      } else {
        unresolvedIds.push(query.id);
      }
    } catch (err) {
      results.push({ id: query.id, quality: 0, latency: 0, error: String(err) });
      emptyPatchIds.push(query.id);
    }
  }

  const accuracy = benchmark.length > 0 ? resolvedIds.length / benchmark.length : 0;

  log.info(`[BENCHMARK] Variant ${variantId}: accuracy=${(accuracy * 100).toFixed(1)}%, ` +
    `resolved=${resolvedIds.length}, unresolved=${unresolvedIds.length}, empty=${emptyPatchIds.length}`);

  return { accuracy, resolvedIds, unresolvedIds, emptyPatchIds, results };
}

// ─── Self-Improvement Step ───────────────────────────────────────────────────

/**
 * Execute a single self-improvement step.
 *
 * arXiv:2505.22954 self_improve_step.py:
 * 1. Diagnose problem (analyze benchmark failures)
 * 2. Generate code modification (via LLM)
 * 3. Apply modification
 * 4. Evaluate on benchmark
 * 5. Return metadata
 */
async function selfImproveStep(
  entry: MutationEntry,
  benchmarkSmall: BenchmarkQuery[],
  benchmarkMedium: BenchmarkQuery[],
): Promise<AgentVariant | null> {
  const runId = `dgm-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const parent = archive.get(entry.parentId);

  if (!parent) {
    log.error(`[SELF-IMPROVE] Parent ${entry.parentId} not found in archive`);
    return null;
  }

  log.info(`[SELF-IMPROVE] Starting ${runId}: parent=${entry.parentId}, type=${entry.entryType}, target=${entry.target || 'none'}`);

  try {
    // Step 1: DIAGNOSE — Generate problem statement from benchmark failures
    const problemStatement = await diagnoseProblem(entry, parent);
    if (!problemStatement) {
      log.warn(`[SELF-IMPROVE] Failed to diagnose problem for ${runId}`);
      return null;
    }
    const diagnosisHash = proofHash({ input: { entryType: entry.entryType, parentId: entry.parentId, target: entry.target }, output: problemStatement });
    log.info(`[PROOF] Step 1 DIAGNOSE hash=${diagnosisHash.slice(0, 16)}... (${problemStatement.length} chars)`);

    // Step 2: SELF-MODIFY — Ask LLM to propose code changes
    const modification = await generateModification(problemStatement, entry, parent);
    if (!modification) {
      log.warn(`[SELF-IMPROVE] Failed to generate modification for ${runId}`);
      return null;
    }
    const modificationHash = proofHash({ targetFile: modification.targetFile, proposedCode: modification.proposedCode, rationale: modification.rationale });
    log.info(`[PROOF] Step 2 MODIFY hash=${modificationHash.slice(0, 16)}... target=${modification.targetFile} (${modification.proposedCode.length} chars)`);

    // Step 3: SAFETY CHECK — Validate modification before applying
    const safetyResult = checkSafetyGate(modification.targetFile, modification.proposedCode, runId);
    const safetyHash = proofHash({ file: modification.targetFile, allowed: safetyResult.allowed, violations: safetyResult.violations, warnings: safetyResult.warnings });
    log.info(`[PROOF] Step 3 SAFETY hash=${safetyHash.slice(0, 16)}... allowed=${safetyResult.allowed}`);
    if (!safetyResult.allowed) {
      log.warn(`[SELF-IMPROVE] Safety gate blocked modification: ${safetyResult.violations.join(', ')}`);
      return null;
    }

    // Step 4: VALIDATE — Static fitness check (existing MOTHER evaluator)
    const fitnessResult = await fitnessEvaluator.evaluate({
      filePath: modification.targetFile,
      content: modification.proposedCode,
      cycleId: runId,
      agentId: parent.id,
    });
    const fitnessHash = proofHash({ overall: fitnessResult.overall, dimensions: fitnessResult.dimensions, file: modification.targetFile });
    log.info(`[PROOF] Step 4 FITNESS hash=${fitnessHash.slice(0, 16)}... overall=${fitnessResult.overall}`);

    if (fitnessResult.overall < 50) {
      log.warn(`[SELF-IMPROVE] Static fitness too low: ${fitnessResult.overall}`);
      return null;
    }

    // Step 5: APPLY — Create proposal and apply it
    const proposal = createProposal({
      targetFile: modification.targetFile,
      proposedCode: modification.proposedCode,
      rationale: modification.rationale,
      expectedImprovement: `DGM self-improvement (arXiv:2505.22954), mutation=${entry.entryType}`,
    });
    const proposalHash = proofHash({ proposalId: proposal.id, targetFile: modification.targetFile, rationale: modification.rationale });
    log.info(`[PROOF] Step 5 PROPOSAL hash=${proposalHash.slice(0, 16)}... id=${proposal.id}`);

    const applied = await applyProposal(proposal.id);
    if (!applied) {
      log.warn(`[SELF-IMPROVE] Failed to apply proposal ${proposal.id}`);
      return null;
    }

    // Step 6: EMPIRICAL EVALUATION — The core DGM innovation
    // First: small benchmark (quick check)
    const smallResult = await evaluateVariant(
      runId,
      [...parent.patches, modification.patch],
      benchmarkSmall,
    );
    const benchmarkHash = proofHash({ variantId: runId, accuracy: smallResult.accuracy, resolvedIds: smallResult.resolvedIds, results: smallResult.results });
    log.info(`[PROOF] Step 6 BENCHMARK hash=${benchmarkHash.slice(0, 16)}... accuracy=${(smallResult.accuracy * 100).toFixed(1)}%`);

    // If accuracy passes threshold, run deeper evaluation
    let finalResult = smallResult;
    if (smallResult.accuracy >= TEST_MORE_THRESHOLD && benchmarkMedium.length > 0) {
      log.info(`[SELF-IMPROVE] Small eval passed (${(smallResult.accuracy * 100).toFixed(1)}%), running deeper eval...`);
      const mediumResult = await evaluateVariant(
        runId,
        [...parent.patches, modification.patch],
        benchmarkMedium,
      );
      // Merge results
      finalResult = {
        accuracy: (smallResult.resolvedIds.length + mediumResult.resolvedIds.length) /
                  (benchmarkSmall.length + benchmarkMedium.length),
        resolvedIds: [...smallResult.resolvedIds, ...mediumResult.resolvedIds],
        unresolvedIds: [...smallResult.unresolvedIds, ...mediumResult.unresolvedIds],
        emptyPatchIds: [...smallResult.emptyPatchIds, ...mediumResult.emptyPatchIds],
        results: [...smallResult.results, ...mediumResult.results],
      };
    }

    // Step 7: CREATE VARIANT — Add to archive
    // Increment parent's children count
    parent.childrenCount++;

    const variant: AgentVariant = {
      id: runId,
      parentId: entry.parentId,
      generation: parent.generation + 1,
      childrenCount: 0,
      accuracyScore: finalResult.accuracy,
      resolvedIds: finalResult.resolvedIds,
      unresolvedIds: finalResult.unresolvedIds,
      emptyPatchIds: finalResult.emptyPatchIds,
      totalSubmittedInstances: benchmarkSmall.length + (finalResult.results.length - benchmarkSmall.length),
      patches: [...parent.patches, modification.patch],
      strategyDescription: `${entry.entryType}: ${modification.rationale}`,
      fitnessBreakdown: {
        overall: fitnessResult.overall,
        correctness: fitnessResult.dimensions?.correctness ?? 0,
        safety: fitnessResult.dimensions?.safety ?? 0,
      },
      createdAt: new Date(),
      isCompiled: true,
      proofHash: '', // computed below
      diagnosisHash,
      modificationHash,
      benchmarkHash,
    };
    variant.proofHash = proofHash(variant);

    log.info(`[PROOF] Step 7 VARIANT hash=${variant.proofHash.slice(0, 16)}... id=${runId}`);
    log.info(`[PROOF] CHAIN: parent=${parent.proofHash.slice(0, 12)}→diagnosis=${diagnosisHash.slice(0, 12)}→modify=${modificationHash.slice(0, 12)}→safety=${safetyHash.slice(0, 12)}→fitness=${fitnessHash.slice(0, 12)}→bench=${benchmarkHash.slice(0, 12)}→variant=${variant.proofHash.slice(0, 12)}`);

    archive.set(runId, variant);
    await persistVariantToDb(variant);

    // Record audit entry
    recordAuditEntry({
      action: 'agent_task',
      actor: 'DGM-TRUE-OUTER',
      actorType: 'agent',
      target: modification.targetFile,
      details: {
        runId,
        parentId: entry.parentId,
        mutationType: entry.entryType,
        accuracy: finalResult.accuracy,
        fitnessOverall: fitnessResult.overall,
        generation: variant.generation,
      },
      outcome: 'success',
    });

    log.info(`[SELF-IMPROVE] Success: ${runId} accuracy=${(finalResult.accuracy * 100).toFixed(1)}%, ` +
      `fitness=${fitnessResult.overall}, parent=${entry.parentId}`);

    return variant;

  } catch (err) {
    log.error(`[SELF-IMPROVE] Error in ${runId}: ${String(err)}`);
    return null;
  }
}

// ─── Problem Diagnosis ───────────────────────────────────────────────────────

/**
 * Diagnose why a specific benchmark query fails or what to improve.
 *
 * arXiv:2505.22954 self_improve_step.py — diagnose_problem():
 * Uses the MOTHER pipeline itself (self-referential) to analyze failures.
 *
 * Scientific basis:
 * - DGM (Zhang et al., 2025): "The agent analyzes its own evaluation logs"
 * - Gödel Machine (Schmidhuber, 2007): "Self-referential system that reasons about its own code"
 * - SICA (Bristol, 2025): "Same agent is both meta-agent and target agent"
 */
async function diagnoseProblem(
  entry: MutationEntry,
  parent: AgentVariant,
): Promise<string | null> {
  const mutationPrompts: Record<MutationType, string> = {
    solve_low_quality: `Analyze why MOTHER's pipeline produces low quality responses (G-Eval < 70) for certain queries.
The parent variant has ${parent.unresolvedIds.length} unresolved queries out of ${parent.totalSubmittedInstances}.
Target query: ${entry.target || 'general'}
Identify the specific weakness in the pipeline (retrieval? generation? grounding? tool use?) and propose a targeted fix.`,

    solve_hallucination: `Analyze why MOTHER's pipeline sometimes generates responses with low citation grounding.
Identify where in the pipeline (core-orchestrator L1-L7) citations get lost or hallucinated.
Propose a specific code change to improve citation accuracy.`,

    solve_slow_response: `Analyze MOTHER's pipeline for latency bottlenecks.
Identify the slowest stages (retrieval, LLM call, quality check, grounding) and propose optimizations.
Focus on: unnecessary sequential calls, missing caching, redundant RAG lookups.`,

    solve_cache_miss: `Analyze MOTHER's semantic cache (server/mother/semantic-cache.ts) for missed caching opportunities.
The current cache hit rate is suboptimal. Propose improvements to cache key generation,
similarity thresholds, or cache warming strategies.`,

    solve_empty_response: `Analyze why ${parent.emptyPatchIds.length} queries returned empty or error responses.
Check for: timeout issues, provider failures, context length overflow, malformed prompts.
Propose a fix to ensure robust fallback and graceful degradation.`,

    solve_stochasticity: `Analyze MOTHER's response quality variance across repeated queries.
The pipeline produces inconsistent quality. Identify sources of randomness
(temperature, provider selection, cache timing) and propose stabilization.`,

    improve_tool_usage: `Analyze MOTHER's ReAct tool detection (Layer 4.5) for missed or incorrect tool calls.
Improve the tool_choice logic, tool prompt engineering, or tool result synthesis.`,

    improve_retrieval: `Analyze MOTHER's RAG pipeline (HippoRAG2, knowledge base, vector search) for retrieval quality.
Identify missed relevant documents, irrelevant retrievals, or suboptimal chunk sizes.`,

    general_improvement: `Analyze MOTHER's overall pipeline and propose a high-impact improvement.
Focus on the weakest link in: cascade routing, retrieval, generation, quality, grounding, constitutional AI, citation.
The parent variant has accuracy ${(parent.accuracyScore * 100).toFixed(1)}% on the benchmark.`,
  };

  const basePrompt = mutationPrompts[entry.entryType];

  // Self-referential: MOTHER diagnoses MOTHER through its own processQuery pipeline
  // This leverages all existing capabilities: cascade routing, RAG, active study, etc.
  const diagnosticQuery = `[DGM DIAGNOSTIC — ${entry.entryType}]

You are operating as a DGM (Darwin Gödel Machine, arXiv:2505.22954) diagnostic agent.
Your task: analyze MOTHER's own pipeline and identify a specific, scientifically justified improvement.

CONTEXT:
${basePrompt}

SAFETY CONSTRAINTS (R1 — FORBIDDEN_PATHS):
The following files are PROTECTED and CANNOT be modified:
- server/mother/core-orchestrator.ts (core pipeline)
- server/mother/core.ts (entry point)
- server/mother/safety-gate.ts (safety — cannot modify itself)
- server/_core/* (infrastructure)
- .env*, Dockerfile, cloudbuild.yaml

WRITABLE targets for improvement (focus on these):
- server/mother/intelligence.ts (routing, model selection)
- server/mother/semantic-cache.ts (caching strategy)
- server/mother/calibration.ts (confidence calibration)
- server/mother/adaptive-calibration-v2.ts (temperature scaling)
- server/mother/hipporag2.ts (RAG retrieval)
- server/mother/guardian.ts (quality evaluation)
- server/mother/active-study.ts (proactive learning)
- server/mother/grounding.ts (citation grounding)
- server/mother/constitutional-ai.ts (safety filtering)
- server/mother/tts-engine.ts, whisper-stt.ts (multimodal)
- server/mother/persistent-shell.ts (code execution)
- server/mother/shms-*.ts (SHMS domain modules)

PARENT VARIANT METRICS:
- Accuracy: ${(parent.accuracyScore * 100).toFixed(1)}%
- Resolved: ${parent.resolvedIds.length}/${parent.totalSubmittedInstances}
- Unresolved: ${parent.unresolvedIds.join(', ') || 'none'}
- Empty: ${parent.emptyPatchIds.join(', ') || 'none'}
- Strategy: ${parent.strategyDescription}

RESPOND WITH A JSON OBJECT (and nothing else):
{
  "problem": "Clear description of the problem",
  "rootCause": "Technical root cause in the codebase",
  "targetFile": "server/mother/xxx.ts",
  "proposedFix": "Specific code change to make",
  "expectedImprovement": "What metric will improve and by how much",
  "scientificBasis": "arXiv paper or established method justifying this fix"
}`;

  try {
    // Use coreOrchestrate directly (bypasses LFSA interceptor — DGM queries are internal,
    // not user-facing long-form requests). This leverages the full 8-layer pipeline:
    // L1 cache → L2 routing → L3 context → L4 generation → L5 guardian.
    const result = await coreOrchestrate({
      query: diagnosticQuery,
      conversationHistory: [],
      metadata: { source: 'dgm-diagnose', mutationType: entry.entryType },
    });

    if (!result.response || result.response.trim().length < 20) {
      log.warn(`[DIAGNOSE] Empty response from coreOrchestrate (provider=${result.provider}, model=${result.model})`);
      return null;
    }

    log.info(`[DIAGNOSE] Diagnosis complete via MOTHER pipeline — provider=${result.provider}, model=${result.model}, quality=${result.qualityScore}, latency=${result.latencyMs}ms`);
    return result.response;
  } catch (err) {
    log.error(`[DIAGNOSE] coreOrchestrate failed: ${String(err)}`);
    return null;
  }
}

// ─── Code Modification Generation ────────────────────────────────────────────

/**
 * Generate a code modification based on the diagnosis.
 *
 * arXiv:2505.22954: "The DGM uses foundation models to propose code improvements."
 *
 * Self-referential: MOTHER generates code modifications for MOTHER
 * through its own processQuery pipeline, leveraging all existing
 * capabilities (cascade routing, RAG, active study, grounding).
 *
 * Scientific basis:
 * - DGM (Zhang et al., 2025): "Parent agent acts as its own code editor"
 * - SICA (arXiv:2504.15228): "Validation-before-commit reduces failure from 83% to 17%"
 * - Gödel Machine (Schmidhuber, 2007): "Self-referential code rewriting"
 */
async function generateModification(
  problemStatement: string,
  entry: MutationEntry,
  parent: AgentVariant,
): Promise<{
  targetFile: string;
  proposedCode: string;
  originalCode: string;
  rationale: string;
  patch: string;
} | null> {
  try {
    // Parse the problem statement to extract target file and diagnosis
    let diagnosis: { targetFile?: string; proposedFix?: string; problem?: string; scientificBasis?: string };
    try {
      const jsonMatch = problemStatement.match(/\{[\s\S]*\}/);
      diagnosis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      diagnosis = { problem: problemStatement };
    }

    const targetFile = diagnosis.targetFile || 'server/mother/intelligence.ts';
    const rationale = diagnosis.problem || `${entry.entryType} improvement`;
    const scientificBasis = diagnosis.scientificBasis || 'DGM arXiv:2505.22954';

    // Pre-check: verify target is not in FORBIDDEN_PATHS before spending LLM tokens
    const safetyPreCheck = checkSafetyGate(targetFile, '// pre-check', 'dgm-precheck');
    if (!safetyPreCheck.allowed) {
      log.warn(`[MODIFY] Target ${targetFile} is protected — redirecting to intelligence.ts`);
      // Fall back to a safe default target
      return generateModification(
        JSON.stringify({ ...diagnosis, targetFile: 'server/mother/intelligence.ts' }),
        entry,
        parent,
      );
    }

    // Read the current file content
    const fs = await import('fs');
    const path = await import('path');
    const fullPath = path.resolve(targetFile);

    let originalCode = '';
    try {
      originalCode = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      log.warn(`[MODIFY] Could not read ${targetFile}, using empty base`);
    }

    // Self-referential: use MOTHER's own pipeline to generate code modifications
    const modificationQuery = `[DGM CODE EVOLUTION — ${entry.entryType}]

You are operating as a DGM (Darwin Gödel Machine, arXiv:2505.22954) code evolution agent.
MOTHER is modifying its own code through self-referential improvement.

PROBLEM DIAGNOSIS:
${problemStatement}

TARGET FILE: ${targetFile}
SCIENTIFIC BASIS: ${scientificBasis}

ORIGINAL CODE (first 6000 chars):
\`\`\`typescript
${originalCode.slice(0, 6000)}
\`\`\`

RULES:
1. Output ONLY a JSON object with the modification (no markdown, no explanation outside JSON)
2. Preserve all existing functionality — only ADD or MODIFY relevant sections
3. Include scientific comments citing relevant arXiv papers
4. DO NOT introduce security vulnerabilities (OWASP Top 10)
5. Maintain TypeScript strict mode compatibility
6. Preserve all existing exports and interfaces
7. Every change MUST have a scientific justification

RESPOND WITH EXACTLY THIS JSON FORMAT:
{
  "targetFile": "${targetFile}",
  "rationale": "Why this change improves the system",
  "scientificBasis": "arXiv:XXXX.XXXXX — paper title and relevant finding",
  "codeChanges": "The specific code block to ADD or MODIFY (not the full file)",
  "insertAfterLine": "The line content after which to insert (for context matching)",
  "expectedMetricImprovement": "e.g., +5pp accuracy, -200ms latency, +10% cache hit rate"
}`;

    // Use coreOrchestrate directly (bypasses LFSA — code evolution is not long-form content)
    const result = await coreOrchestrate({
      query: modificationQuery,
      conversationHistory: [],
      metadata: { source: 'dgm-modify', mutationType: entry.entryType, targetFile },
    });

    if (!result.response || result.response.trim().length < 50) {
      log.warn(`[MODIFY] Empty response from coreOrchestrate (provider=${result.provider}, model=${result.model})`);
      return null;
    }

    log.info(`[MODIFY] Code generation via MOTHER — provider=${result.provider}, model=${result.model}, latency=${result.latencyMs}ms`);

    // Extract the code modification from MOTHER's response
    let modResult: {
      targetFile?: string;
      rationale?: string;
      scientificBasis?: string;
      codeChanges?: string;
      insertAfterLine?: string;
      expectedMetricImprovement?: string;
    } = {};
    try {
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) modResult = JSON.parse(jsonMatch[0]);
    } catch {
      // If JSON parse fails, use the raw response as the code change
      modResult = { codeChanges: result.response, rationale: rationale };
    }

    const proposedCode = modResult.codeChanges || result.response;
    if (!proposedCode || proposedCode.length < 20) return null;

    // Build a descriptive patch
    const patch = [
      `--- a/${targetFile}`,
      `+++ b/${targetFile}`,
      `@@ DGM mutation: ${entry.entryType} @@`,
      `@@ Scientific basis: ${modResult.scientificBasis || scientificBasis} @@`,
      `@@ Expected improvement: ${modResult.expectedMetricImprovement || 'unknown'} @@`,
      ``,
      `Rationale: ${modResult.rationale || rationale}`,
      ``,
      proposedCode,
    ].join('\n');

    log.info(`[MODIFY] Modification generated via MOTHER pipeline — target=${targetFile}, basis=${modResult.scientificBasis || scientificBasis}`);

    return {
      targetFile: modResult.targetFile || targetFile,
      proposedCode,
      originalCode,
      rationale: modResult.rationale || rationale,
      patch,
    };
  } catch (err) {
    log.error(`[MODIFY] Generation failed: ${String(err)}`);
    return null;
  }
}

// ─── Filter Compiled Variants ────────────────────────────────────────────────

/**
 * Filter out variants that didn't compile or have all empty responses.
 *
 * arXiv:2505.22954 DGM_outer.py — filter_compiled():
 * Only compiled, functional variants enter the archive.
 */
function filterCompiled(variantIds: string[]): string[] {
  return variantIds.filter(id => {
    const variant = archive.get(id);
    if (!variant) return false;
    if (!variant.isCompiled) return false;
    // Must have at least some resolved queries (not all empty)
    if (variant.resolvedIds.length === 0 && variant.emptyPatchIds.length === variant.totalSubmittedInstances) {
      return false;
    }
    return true;
  });
}

// ─── Full Evaluation Threshold ───────────────────────────────────────────────

/**
 * Get the threshold for full (deep) evaluation.
 * Only variants scoring above this threshold get the expensive full benchmark.
 *
 * arXiv:2505.22954 DGM_outer.py — get_full_eval_threshold():
 * Returns the second-highest accuracy in the archive (minimum 0.4).
 */
function getFullEvalThreshold(): number {
  const scores: number[] = [];
  for (const [, variant] of archive) {
    if (variant.totalSubmittedInstances > 0) {
      scores.push(variant.accuracyScore);
    }
  }
  scores.sort((a, b) => b - a);
  const threshold = scores.length > 1 ? scores[1] : (scores[0] ?? 0.4);
  return Math.max(threshold, 0.4);
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Persist a variant to the dgm_archive database table.
 */
async function persistVariantToDb(variant: AgentVariant): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      INSERT INTO dgm_archive (generation_id, parent_id, code_snapshot, fitness_score, benchmark_results)
      VALUES (
        ${variant.id},
        ${variant.parentId},
        ${variant.strategyDescription},
        ${variant.accuracyScore},
        ${JSON.stringify({
          resolvedIds: variant.resolvedIds,
          unresolvedIds: variant.unresolvedIds,
          emptyPatchIds: variant.emptyPatchIds,
          totalSubmittedInstances: variant.totalSubmittedInstances,
          fitnessBreakdown: variant.fitnessBreakdown,
          generation: variant.generation,
          childrenCount: variant.childrenCount,
          isCompiled: variant.isCompiled,
        })}
      )
    `);
  } catch (err) {
    log.warn(`[PERSIST] Failed to save variant to DB: ${String(err)}`);
  }
}

/**
 * Persist the DGM run state to a JSONL file (like dgm_metadata.jsonl in the paper).
 */
async function persistGenerationState(
  runId: string,
  generation: number,
  result: GenerationResult,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Also persist to fitness_history for cross-generation tracking
    for (const childId of result.childrenCompiledIds) {
      const variant = archive.get(childId);
      if (!variant) continue;

      await db.execute(sql`
        INSERT INTO fitness_history (agent_id, fitness_score, quality_score, generation_number, notes)
        VALUES (
          ${childId},
          ${variant.accuracyScore * 100},
          ${variant.fitnessBreakdown?.overall ?? 0},
          ${generation},
          ${JSON.stringify({
            parentId: variant.parentId,
            mutationType: variant.strategyDescription,
            archiveSize: result.archiveSize,
            runId,
          })}
        )
      `);
    }

    log.info(`[PERSIST] Saved generation ${generation} state: ${result.childrenCompiledIds.length} variants`);
  } catch (err) {
    log.warn(`[PERSIST] Failed to save generation state: ${String(err)}`);
  }
}

// ─── Default Benchmark Queries ───────────────────────────────────────────────

/**
 * Default benchmark queries for MOTHER evaluation.
 *
 * These are analogous to SWE-bench instances in the original DGM paper.
 * Categories: factual, analytical, creative, code, diagram, shms, conversational
 */
export const DEFAULT_BENCHMARK_SMALL: BenchmarkQuery[] = [
  // Factual queries
  { id: 'fact-001', query: 'O que é o Darwin Gödel Machine?', expectedMinQuality: 70, category: 'factual' },
  { id: 'fact-002', query: 'Explique como funciona a memória A-MEM com Zettelkasten', expectedMinQuality: 70, category: 'factual' },
  { id: 'fact-003', query: 'Quais são as 7 camadas da arquitetura MOTHER?', expectedMinQuality: 70, category: 'factual' },
  { id: 'fact-004', query: 'Como funciona o Constitutional AI?', expectedMinQuality: 70, category: 'factual' },
  { id: 'fact-005', query: 'O que é HippoRAG e como melhora a recuperação de informação?', expectedMinQuality: 70, category: 'factual' },

  // Analytical queries
  { id: 'anal-001', query: 'Compare transformer architecture com state space models para NLP', expectedMinQuality: 70, category: 'analytical' },
  { id: 'anal-002', query: 'Quais as vantagens e desvantagens do cascade routing vs single model?', expectedMinQuality: 70, category: 'analytical' },
  { id: 'anal-003', query: 'Analise o trade-off entre custo e qualidade no uso de múltiplos LLMs', expectedMinQuality: 70, category: 'analytical' },

  // Code queries
  { id: 'code-001', query: 'Escreva uma função TypeScript que implementa binary search com generics', expectedMinQuality: 65, category: 'code' },
  { id: 'code-002', query: 'Implemente um rate limiter com sliding window em TypeScript', expectedMinQuality: 65, category: 'code' },

  // Conversational
  { id: 'conv-001', query: 'Oi, tudo bem?', expectedMinQuality: 60, category: 'conversational' },
  { id: 'conv-002', query: 'Obrigado pela ajuda!', expectedMinQuality: 60, category: 'conversational' },

  // SHMS domain
  { id: 'shms-001', query: 'Qual a importância do monitoramento de piezômetros em barragens?', expectedMinQuality: 70, category: 'shms' },
  { id: 'shms-002', query: 'Como o LSTM pode prever anomalias em sensores de inclinômetro?', expectedMinQuality: 70, category: 'shms' },

  // Diagram
  { id: 'diag-001', query: 'Faça um diagrama da arquitetura do Darwin Gödel Machine', expectedMinQuality: 65, category: 'diagram' },
];

export const DEFAULT_BENCHMARK_MEDIUM: BenchmarkQuery[] = [
  // Deeper analytical
  { id: 'deep-001', query: 'Explique o teorema de incompletude de Gödel e sua relação com a Gödel Machine', expectedMinQuality: 75, category: 'analytical' },
  { id: 'deep-002', query: 'Compare MAP-Elites com algoritmos genéticos tradicionais para otimização multi-objetivo', expectedMinQuality: 75, category: 'analytical' },
  { id: 'deep-003', query: 'Analise como o Reflexion (Shinn et al., 2023) melhora o aprendizado de agentes LLM', expectedMinQuality: 75, category: 'analytical' },

  // Complex code
  { id: 'deepcode-001', query: 'Implemente um sistema de cache LRU thread-safe em TypeScript com TTL e eviction callback', expectedMinQuality: 65, category: 'code' },

  // Complex SHMS
  { id: 'deepshms-001', query: 'Projete um sistema de detecção de anomalias em tempo real para 6 tipos de sensores de barragem usando z-score adaptativo', expectedMinQuality: 70, category: 'shms' },
];

// ─── Main DGM Outer Loop ─────────────────────────────────────────────────────

/**
 * Run the complete DGM outer loop.
 *
 * This is the TRUE implementation of Algorithm 1 from arXiv:2505.22954.
 *
 * Pseudocode (from DGM_outer.py):
 *   archive = ['initial']
 *   for gen in range(max_generations):
 *     entries = choose_selfimproves(archive, size, method)
 *     children = parallel(self_improve(entry) for entry in entries)
 *     compiled = filter_compiled(children)
 *     archive = update_archive(archive, compiled, method)
 *     save_state(gen, archive)
 */
export async function runDGMOuterLoop(
  config?: Partial<DGMConfig>,
): Promise<DGMRunState> {
  const runId = `dgm-run-${Date.now()}`;
  const fullConfig: DGMConfig = {
    maxGenerations: config?.maxGenerations ?? MAX_GENERATIONS,
    selfImproveSize: config?.selfImproveSize ?? SELFIMPROVE_SIZE,
    selfImproveWorkers: config?.selfImproveWorkers ?? SELFIMPROVE_WORKERS,
    parentSelectionMethod: config?.parentSelectionMethod ?? 'score_child_prop',
    archiveUpdateMethod: config?.archiveUpdateMethod ?? 'keep_all',
    noiseLeeway: config?.noiseLeeway ?? NOISE_LEEWAY,
    deployThreshold: config?.deployThreshold ?? DEPLOY_THRESHOLD,
    benchmarkSmall: config?.benchmarkSmall ?? DEFAULT_BENCHMARK_SMALL,
    benchmarkMedium: config?.benchmarkMedium ?? DEFAULT_BENCHMARK_MEDIUM,
  };

  const state: DGMRunState = {
    runId,
    currentGeneration: 0,
    archive: ['initial'],
    generationResults: [],
    startedAt: new Date().toISOString(),
    config: fullConfig,
  };

  log.info(`[DGM-OUTER] Starting run ${runId} with config:`, {
    maxGenerations: fullConfig.maxGenerations,
    selfImproveSize: fullConfig.selfImproveSize,
    parentSelection: fullConfig.parentSelectionMethod,
    archiveUpdate: fullConfig.archiveUpdateMethod,
    benchmarkSmallSize: fullConfig.benchmarkSmall.length,
    benchmarkMediumSize: fullConfig.benchmarkMedium.length,
  });

  // Initialize archive with base evaluation
  await initializeArchive(fullConfig.benchmarkSmall);

  // ── Main evolutionary loop ──
  for (let gen = 0; gen < fullConfig.maxGenerations; gen++) {
    state.currentGeneration = gen;
    log.info(`\n[DGM-OUTER] ═══ Generation ${gen} ═══`);

    // 1. SELECT PARENTS
    const parentIds = selectParents(
      fullConfig.selfImproveSize,
      fullConfig.parentSelectionMethod,
    );
    log.info(`[DGM-OUTER] Selected parents: ${parentIds.join(', ')}`);

    // 2. CHOOSE MUTATION ENTRIES
    const entries = chooseMutationEntries(parentIds);
    log.info(`[DGM-OUTER] Mutation entries: ${entries.map(e => `${e.parentId}:${e.entryType}`).join(', ')}`);

    // 3. RUN SELF-IMPROVEMENTS IN PARALLEL
    const childPromises = entries.map(entry =>
      Promise.race([
        selfImproveStep(entry, fullConfig.benchmarkSmall, fullConfig.benchmarkMedium),
        new Promise<null>(resolve =>
          setTimeout(() => {
            log.warn(`[DGM-OUTER] Self-improve timeout for ${entry.parentId}:${entry.entryType}`);
            resolve(null);
          }, SELFIMPROVE_TIMEOUT_MS)
        ),
      ])
    );

    const children = await Promise.all(childPromises);
    const childrenIds = children.filter(Boolean).map(c => c!.id);

    // 4. FILTER COMPILED
    const compiledIds = filterCompiled(childrenIds);
    log.info(`[DGM-OUTER] Generation ${gen}: ${childrenIds.length} children, ${compiledIds.length} compiled`);

    // 5. UPDATE ARCHIVE
    updateArchive(compiledIds, fullConfig.archiveUpdateMethod, fullConfig.noiseLeeway);

    // 6. SAVE STATE
    const genResult: GenerationResult = {
      generation: gen,
      mutations: entries,
      childrenIds,
      childrenCompiledIds: compiledIds,
      archiveSize: archive.size,
      bestAccuracy: Math.max(...Array.from(archive.values()).map(v => v.accuracyScore)),
      timestamp: new Date().toISOString(),
      generationHash: '', // computed below
    };
    genResult.generationHash = proofHash(genResult);
    state.generationResults.push(genResult);
    state.archive = Array.from(archive.keys());

    await persistGenerationState(runId, gen, genResult);

    log.info(`[DGM-OUTER] Generation ${gen} complete: archive=${archive.size}, best=${(genResult.bestAccuracy * 100).toFixed(1)}%`);
    log.info(`[PROOF] Generation ${gen} hash=${genResult.generationHash.slice(0, 16)}... children=${childrenIds.length} compiled=${compiledIds.length}`);

    // Check convergence: if best accuracy hasn't improved in 5 generations, consider stopping
    if (gen >= 5) {
      const recent = state.generationResults.slice(-5);
      const recentBest = recent.map(r => r.bestAccuracy);
      if (recentBest.every(b => b === recentBest[0])) {
        log.info(`[DGM-OUTER] Convergence detected: no improvement in 5 generations. Stopping.`);
        break;
      }
    }
  }

  // Final summary
  const bestVariant = Array.from(archive.values()).sort((a, b) => b.accuracyScore - a.accuracyScore)[0];
  log.info(`\n[DGM-OUTER] ═══ Run Complete ═══`);
  log.info(`[DGM-OUTER] Generations: ${state.currentGeneration + 1}`);
  log.info(`[DGM-OUTER] Archive size: ${archive.size}`);
  log.info(`[DGM-OUTER] Best variant: ${bestVariant?.id} (accuracy ${((bestVariant?.accuracyScore ?? 0) * 100).toFixed(1)}%)`);
  log.info(`[DGM-OUTER] Initial accuracy: ${((getOriginalScore()) * 100).toFixed(1)}%`);
  log.info(`[DGM-OUTER] Improvement: ${(((bestVariant?.accuracyScore ?? 0) - getOriginalScore()) * 100).toFixed(1)}pp`);

  return state;
}

// ─── Single Generation (for manual/API use) ──────────────────────────────────

/**
 * Run a single DGM generation (for API endpoint or manual trigger).
 * Returns the generation result without running the full loop.
 */
export async function runSingleGeneration(
  config?: Partial<DGMConfig>,
): Promise<GenerationResult> {
  const fullConfig: DGMConfig = {
    maxGenerations: 1,
    selfImproveSize: config?.selfImproveSize ?? SELFIMPROVE_SIZE,
    selfImproveWorkers: config?.selfImproveWorkers ?? SELFIMPROVE_WORKERS,
    parentSelectionMethod: config?.parentSelectionMethod ?? 'score_child_prop',
    archiveUpdateMethod: config?.archiveUpdateMethod ?? 'keep_all',
    noiseLeeway: config?.noiseLeeway ?? NOISE_LEEWAY,
    deployThreshold: config?.deployThreshold ?? DEPLOY_THRESHOLD,
    benchmarkSmall: config?.benchmarkSmall ?? DEFAULT_BENCHMARK_SMALL,
    benchmarkMedium: config?.benchmarkMedium ?? DEFAULT_BENCHMARK_MEDIUM,
  };

  await initializeArchive(fullConfig.benchmarkSmall);

  const parentIds = selectParents(fullConfig.selfImproveSize, fullConfig.parentSelectionMethod);
  const entries = chooseMutationEntries(parentIds);

  const children = await Promise.all(
    entries.map(e => selfImproveStep(e, fullConfig.benchmarkSmall, fullConfig.benchmarkMedium))
  );

  const childrenIds = children.filter(Boolean).map(c => c!.id);
  const compiledIds = filterCompiled(childrenIds);

  updateArchive(compiledIds, fullConfig.archiveUpdateMethod, fullConfig.noiseLeeway);

  const result: GenerationResult = {
    generation: 0,
    mutations: entries,
    childrenIds,
    childrenCompiledIds: compiledIds,
    archiveSize: archive.size,
    bestAccuracy: Math.max(...Array.from(archive.values()).map(v => v.accuracyScore)),
    timestamp: new Date().toISOString(),
    generationHash: '',
  };
  result.generationHash = proofHash(result);

  log.info(`[PROOF] SingleGeneration hash=${result.generationHash.slice(0, 16)}... children=${childrenIds.length} compiled=${compiledIds.length}`);
  return result;
}

// ─── Archive Query API ───────────────────────────────────────────────────────

/**
 * Get the current archive state (for UI/API).
 */
export function getArchiveState(): {
  size: number;
  variants: Array<{
    id: string;
    parentId: string;
    generation: number;
    accuracy: number;
    childrenCount: number;
    strategy: string;
    isCompiled: boolean;
    createdAt: string;
    proofHash: string;
    diagnosisHash?: string;
    modificationHash?: string;
    benchmarkHash?: string;
  }>;
  bestVariantId: string | null;
  bestAccuracy: number;
  initialAccuracy: number;
  archiveHash: string;
} {
  const variants = Array.from(archive.values())
    .map(v => ({
      id: v.id,
      parentId: v.parentId,
      generation: v.generation,
      accuracy: v.accuracyScore,
      childrenCount: v.childrenCount,
      strategy: v.strategyDescription,
      isCompiled: v.isCompiled,
      createdAt: v.createdAt.toISOString(),
      proofHash: v.proofHash,
      diagnosisHash: v.diagnosisHash,
      modificationHash: v.modificationHash,
      benchmarkHash: v.benchmarkHash,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const best = variants[0];
  const archiveHash = proofHash(variants.map(v => v.proofHash));

  return {
    size: archive.size,
    variants,
    bestVariantId: best?.id ?? null,
    bestAccuracy: best?.accuracy ?? 0,
    initialAccuracy: getOriginalScore(),
    archiveHash,
  };
}

/**
 * Get the evolutionary tree (parent-child relationships).
 */
export function getEvolutionaryTree(): Array<{
  id: string;
  parentId: string;
  generation: number;
  accuracy: number;
  children: string[];
}> {
  const tree: Array<{
    id: string;
    parentId: string;
    generation: number;
    accuracy: number;
    children: string[];
  }> = [];

  for (const [id, variant] of archive) {
    const children = Array.from(archive.values())
      .filter(v => v.parentId === id)
      .map(v => v.id);

    tree.push({
      id,
      parentId: variant.parentId,
      generation: variant.generation,
      accuracy: variant.accuracyScore,
      children,
    });
  }

  return tree.sort((a, b) => a.generation - b.generation);
}
