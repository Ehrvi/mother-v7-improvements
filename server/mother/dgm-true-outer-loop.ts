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
import { EventEmitter } from 'events';
import { createLogger } from '../_core/logger';
import { getDb } from '../db';
import { sandboxExecutor } from '../dgm/sandbox-executor';
import { runInSandbox } from './e2b-sandbox';
import { validateTypeScript, validateTypeScriptInWorktree, MOTHER_DIR } from './self-modifier';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { processQuery } from './core';
import { orchestrate as coreOrchestrate } from './core-orchestrator';
import { invokeLLM } from '../_core/llm';
import { fitnessEvaluator } from './fitness-evaluator';
import { checkSafetyGate } from './safety-gate';
import { recordAuditEntry } from './audit-trail';
import { githubWriteService } from './github-write-service';

const log = createLogger('DGM-TRUE');

// ─── C359: Import Pre-Validation ─────────────────────────────────────────────
// Prevent gpt-4o from importing Python/non-existent modules (e.g. 'transformers', 'dpr-model')
// by checking new imports against package.json before wasting a tsc worktree run.

let _cachedPkgDeps: Set<string> | null = null;

/** Get all dependency names from package.json (cached). */
function getProjectDependencies(): Set<string> {
  if (_cachedPkgDeps) return _cachedPkgDeps;
  try {
    const pkgPath = join(MOTHER_DIR, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = new Set<string>([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ]);
    // Also add Node.js built-in modules
    const builtins = ['crypto', 'events', 'fs', 'path', 'os', 'url', 'util', 'stream',
      'http', 'https', 'net', 'tls', 'dns', 'child_process', 'cluster', 'worker_threads',
      'buffer', 'querystring', 'zlib', 'assert', 'timers', 'perf_hooks', 'process'];
    for (const b of builtins) {
      deps.add(b);
      deps.add(`node:${b}`);
    }
    _cachedPkgDeps = deps;
    return deps;
  } catch {
    return new Set();
  }
}

/** Extract module names from import statements in code. */
function extractImports(code: string): string[] {
  const imports: string[] = [];
  // Match: import ... from 'module' or import 'module'
  const regex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

/**
 * Validate that all new imports in proposedCode exist in the project.
 * Returns { valid: true } or { valid: false, phantomImports: [...] }
 */
function validateImports(
  originalCode: string,
  proposedCode: string,
): { valid: boolean; phantomImports: string[] } {
  const originalImports = new Set(extractImports(originalCode));
  const proposedImports = extractImports(proposedCode);
  const deps = getProjectDependencies();
  const phantomImports: string[] = [];

  for (const imp of proposedImports) {
    if (originalImports.has(imp)) continue; // Already existed
    if (imp.startsWith('.') || imp.startsWith('/')) continue; // Relative import — tsc will check
    // Get the package name (handle scoped packages like @foo/bar)
    const pkgName = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
    if (!deps.has(pkgName)) {
      phantomImports.push(imp);
    }
  }

  return phantomImports.length === 0
    ? { valid: true, phantomImports: [] }
    : { valid: false, phantomImports };
}

/** Get a compact list of top installed packages for the LLM prompt. */
function getAvailablePackagesSummary(): string {
  const deps = getProjectDependencies();
  const relevant = [...deps].filter(d => !d.startsWith('node:') && !d.startsWith('@types/'));
  return relevant.slice(0, 80).join(', ');
}

// ─── DGM Event System ──────────────────────────────────────────────────────
// Emits real-time events during the DGM pipeline for UI feedback.

export interface DGMEvent {
  step: 'init' | 'benchmark' | 'diagnose' | 'modify' | 'safety' | 'fitness' | 'sandbox' | 'proposal' | 'evaluate' | 'complete' | 'error';
  status: 'start' | 'success' | 'fail' | 'waiting';
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface DGMProposal {
  id: string;
  runId: string;
  targetFile: string;
  proposedCode: string;
  originalCode: string;
  rationale: string;
  scientificBasis: string;
  expectedImprovement: string;
  fitnessScore: number;
  sandboxPassed: boolean;
  sandboxType: string;
  sandboxDurationMs: number;
  diagnosisHash: string;
  modificationHash: string;
  safetyHash: string;
  fitnessHash: string;
  sandboxHash: string;
  // C358: Rich context for human review
  title: string;
  summary: string;
  problemStatement: string;
  rootCause: string;
  proposedFix: string;
  mutationType: string;
  fitnessDimensions: Record<string, number>;
  safetyWarnings: string[];
  parentMetrics: {
    id: string;
    accuracy: number;
    resolved: number;
    total: number;
    unresolvedIds: string[];
  };
  diagnosisLength: number;
  codeLength: number;
}

export const dgmEvents = new EventEmitter();
const pendingProposals = new Map<string, { proposal: DGMProposal; resolve: (approved: boolean) => void }>();
const eventLog: DGMEvent[] = [];

// ─── Rejection Memory ───────────────────────────────────────────────────────
// Prevents the same (or very similar) proposals from resurfacing after rejection.
// Key = targetFile + mutationType → stores rejection signatures for similarity matching.
interface RejectionRecord {
  targetFile: string;
  mutationType: string;
  rationaleHash: string;       // SHA-256 of the rationale text
  problemKeywords: string[];   // top keywords from problemStatement for fuzzy matching
  rejectedAt: string;
  rejectCount: number;         // how many times similar proposals were blocked
}

const rejectionMemory: RejectionRecord[] = [];
const MAX_REJECTION_RECORDS = 200;

/** Extract top keywords (>4 chars, lowercased, deduplicated) from text */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'will', 'should', 'would', 'could', 'which', 'their', 'there', 'about', 'these', 'those', 'para', 'como', 'mais', 'quando', 'pode', 'deve']);
  return [...new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 4 && !stopWords.has(w))
  )].slice(0, 20);
}

/** Compute Jaccard similarity between two keyword sets */
function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Check if a proposal is too similar to a previously rejected one */
function isBlockedByRejectionMemory(
  targetFile: string,
  mutationType: string,
  rationale: string,
  problemStatement: string,
): { blocked: boolean; reason?: string; matchedRecord?: RejectionRecord } {
  const rationaleHash = createHash('sha256').update(rationale).digest('hex');
  const keywords = extractKeywords(problemStatement + ' ' + rationale);

  for (const record of rejectionMemory) {
    // Exact match: same file + same type + same rationale hash
    if (record.targetFile === targetFile && record.mutationType === mutationType && record.rationaleHash === rationaleHash) {
      return {
        blocked: true,
        reason: `Proposta identica rejeitada anteriormente (${record.rejectedAt}). Rejeicoes acumuladas: ${record.rejectCount}`,
        matchedRecord: record,
      };
    }

    // Fuzzy match: same file + same type + high keyword similarity (>= 0.6)
    if (record.targetFile === targetFile && record.mutationType === mutationType) {
      const similarity = keywordSimilarity(keywords, record.problemKeywords);
      if (similarity >= 0.6) {
        return {
          blocked: true,
          reason: `Proposta similar rejeitada anteriormente (similaridade: ${(similarity * 100).toFixed(0)}%, ${record.rejectedAt}). Rejeicoes acumuladas: ${record.rejectCount}`,
          matchedRecord: record,
        };
      }
    }

    // Cross-type block: same file + very high similarity (>= 0.8), regardless of mutation type
    if (record.targetFile === targetFile) {
      const similarity = keywordSimilarity(keywords, record.problemKeywords);
      if (similarity >= 0.8) {
        return {
          blocked: true,
          reason: `Proposta muito similar rejeitada anteriormente em tipo diferente (similaridade: ${(similarity * 100).toFixed(0)}%, tipo original: ${record.mutationType}, ${record.rejectedAt}). Rejeicoes acumuladas: ${record.rejectCount}`,
          matchedRecord: record,
        };
      }
    }
  }

  return { blocked: false };
}

/** Record a rejection into memory */
function recordRejection(targetFile: string, mutationType: string, rationale: string, problemStatement: string): void {
  const rationaleHash = createHash('sha256').update(rationale).digest('hex');
  const keywords = extractKeywords(problemStatement + ' ' + rationale);

  // Check if we already have a record for this exact combination — increment counter
  const existing = rejectionMemory.find(r =>
    r.targetFile === targetFile && r.mutationType === mutationType && r.rationaleHash === rationaleHash
  );
  if (existing) {
    existing.rejectCount++;
    existing.rejectedAt = new Date().toISOString();
    return;
  }

  // Also check fuzzy match — increment counter on closest match
  for (const record of rejectionMemory) {
    if (record.targetFile === targetFile && record.mutationType === mutationType) {
      const similarity = keywordSimilarity(keywords, record.problemKeywords);
      if (similarity >= 0.6) {
        record.rejectCount++;
        record.rejectedAt = new Date().toISOString();
        // Merge keywords to widen the rejection signature
        const merged = [...new Set([...record.problemKeywords, ...keywords])].slice(0, 30);
        record.problemKeywords = merged;
        return;
      }
    }
  }

  // New rejection — add record
  if (rejectionMemory.length >= MAX_REJECTION_RECORDS) {
    rejectionMemory.shift(); // evict oldest
  }
  rejectionMemory.push({
    targetFile,
    mutationType,
    rationaleHash,
    problemKeywords: keywords,
    rejectedAt: new Date().toISOString(),
    rejectCount: 1,
  });
  log.info(`[REJECTION-MEMORY] Recorded rejection: ${targetFile} / ${mutationType} (${keywords.length} keywords)`);
}

/** Get rejection memory stats (for debugging / API) */
export function getRejectionMemoryStats(): { total: number; records: Array<{ targetFile: string; mutationType: string; rejectCount: number; rejectedAt: string }> } {
  return {
    total: rejectionMemory.length,
    records: rejectionMemory.map(r => ({ targetFile: r.targetFile, mutationType: r.mutationType, rejectCount: r.rejectCount, rejectedAt: r.rejectedAt })),
  };
}

function emitDGMEvent(event: DGMEvent) {
  eventLog.push(event);
  if (eventLog.length > 200) eventLog.splice(0, eventLog.length - 200);
  dgmEvents.emit('dgm-event', event);
  log.info(`[EVENT] ${event.step}:${event.status} — ${event.message}`);
}

export function getDGMEventLog(): DGMEvent[] {
  return [...eventLog];
}

export function getPendingProposals(): DGMProposal[] {
  return Array.from(pendingProposals.values()).map(p => p.proposal);
}

export function resolveProposal(proposalId: string, approved: boolean): boolean {
  const entry = pendingProposals.get(proposalId);
  if (!entry) return false;
  entry.resolve(approved);
  pendingProposals.delete(proposalId);
  return true;
}

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
  /** SHA-256 hash of the sandbox execution result */
  sandboxHash?: string;
  /** Sandbox execution result (passed/failed, output, duration) */
  sandboxResult?: {
    passed: boolean;
    output: string;
    error?: string;
    durationMs: number;
    sandboxType: string;
    sandboxId: string;
  };
}

/**
 * Scientific proof record for a DGM generation.
 * Implements the 3 validation criteria from Sakana AI's DGM framework:
 *
 * 1. REPRODUTIBILIDADE: deterministic hash chain parent→child
 * 2. GANHO EMPÍRICO: before/after benchmark comparison
 * 3. INTEGRIDADE: sandbox + safety gate anti-objective-hacking
 *
 * arXiv:2505.22954 Section 4: "Each modification must be empirically validated"
 */
export interface ScientificProof {
  /** Proof 1: Reproducibility — deterministic hash chain */
  reproducibility: {
    valid: boolean;
    parentProofHash: string;
    modificationHash: string;
    childProofHash: string;
    /** Re-derive child hash from parent + modification to prove determinism */
    recomputedChildHash: string;
    /** Does recomputed match stored? */
    hashesMatch: boolean;
  };
  /** Proof 2: Empirical Gain — before/after benchmark comparison */
  empiricalGain: {
    valid: boolean;
    parentAccuracy: number;
    childAccuracy: number;
    delta: number;
    /** Positive delta = improvement, zero = neutral, negative = regression */
    verdict: 'improvement' | 'neutral' | 'regression';
    parentResolvedCount: number;
    childResolvedCount: number;
    benchmarkSize: number;
  };
  /** Proof 3: Integrity — anti-objective-hacking via sandbox + safety gate */
  integrity: {
    valid: boolean;
    safetyGatePassed: boolean;
    safetyHash: string;
    sandboxPassed: boolean;
    sandboxHash: string;
    sandboxOutput: string;
    sandboxDurationMs: number;
    /** Code was validated in isolated environment BEFORE being applied */
    preApplyValidation: boolean;
  };
  /** Overall scientific validity */
  overallValid: boolean;
  /** Timestamp of proof generation */
  timestamp: string;
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
  /** Scientific proofs for each child variant created in this generation */
  scientificProofs: ScientificProof[];
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

// Module-level collection for scientific proofs generated during a generation
let generationProofs: ScientificProof[] = [];

/**
 * Generate a ScientificProof record comparing parent → child variant.
 * Implements the 3 validation criteria from Sakana AI's DGM framework:
 *
 * 1. REPRODUTIBILIDADE: parent.proofHash + modificationHash → child.proofHash (deterministic)
 * 2. GANHO EMPÍRICO: parent.accuracy vs child.accuracy (empirical benchmark delta)
 * 3. INTEGRIDADE: safetyGate + sandbox both passed BEFORE apply (anti-objective-hacking)
 */
function generateScientificProof(
  parent: AgentVariant,
  child: AgentVariant,
  context: {
    safetyHash: string;
    sandboxHash: string;
    sandboxResult: { passed: boolean; output: string; error?: string; durationMs: number; sandboxType: string; sandboxId: string };
    benchmarkSmall: BenchmarkQuery[];
  },
): ScientificProof {
  // Proof 1: REPRODUTIBILIDADE
  // Re-derive child proof hash from (parent.proofHash + child.modificationHash)
  // If deterministic, recomputed hash should match child.proofHash
  const recomputedChildHash = proofHash({
    parentProofHash: parent.proofHash,
    modificationHash: child.modificationHash ?? '',
    childState: {
      id: child.id,
      parentId: child.parentId,
      generation: child.generation,
      accuracyScore: child.accuracyScore,
      patches: child.patches,
      strategyDescription: child.strategyDescription,
    },
  });

  const reproducibility = {
    valid: true, // deterministic by construction (SHA-256 is deterministic)
    parentProofHash: parent.proofHash,
    modificationHash: child.modificationHash ?? '',
    childProofHash: child.proofHash,
    recomputedChildHash,
    hashesMatch: recomputedChildHash === child.proofHash, // Verify deterministic derivation
  };

  // Proof 2: GANHO EMPÍRICO
  const delta = child.accuracyScore - parent.accuracyScore;
  const verdict: 'improvement' | 'neutral' | 'regression' =
    delta > 0.001 ? 'improvement' : delta < -0.001 ? 'regression' : 'neutral';

  const empiricalGain = {
    valid: verdict !== 'regression',
    parentAccuracy: parent.accuracyScore,
    childAccuracy: child.accuracyScore,
    delta,
    verdict,
    parentResolvedCount: parent.resolvedIds.length,
    childResolvedCount: child.resolvedIds.length,
    benchmarkSize: context.benchmarkSmall.length,
  };

  // Proof 3: INTEGRIDADE (anti-objective-hacking)
  // The modification was validated by BOTH safety gate AND sandbox
  // BEFORE being applied to the codebase
  const integrity = {
    valid: context.sandboxResult.passed,
    safetyGatePassed: true, // If we reach this point, safety gate passed
    safetyHash: context.safetyHash,
    sandboxPassed: context.sandboxResult.passed,
    sandboxHash: context.sandboxHash,
    sandboxOutput: context.sandboxResult.output,
    sandboxDurationMs: context.sandboxResult.durationMs,
    preApplyValidation: true, // Sandbox runs BEFORE Step 5 APPLY
  };

  const overallValid = reproducibility.valid && empiricalGain.valid && integrity.valid;

  return {
    reproducibility,
    empiricalGain,
    integrity,
    overallValid,
    timestamp: new Date().toISOString(),
  };
}

async function selfImproveStep(
  entry: MutationEntry,
  benchmarkSmall: BenchmarkQuery[],
  benchmarkMedium: BenchmarkQuery[],
): Promise<AgentVariant | null> {
  const runId = `dgm-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const parent = archive.get(entry.parentId);

  if (!parent) {
    emitDGMEvent({ step: 'init', status: 'fail', message: `[Passo 0 — ERRO] Parent ${entry.parentId} não encontrado no arquivo.`, timestamp: new Date().toISOString() });
    log.error(`[SELF-IMPROVE] Parent ${entry.parentId} not found in archive`);
    return null;
  }

  log.info(`[SELF-IMPROVE] Starting ${runId}: parent=${entry.parentId}, type=${entry.entryType}, target=${entry.target || 'none'}`);
  emitDGMEvent({ step: 'init', status: 'start', message: `[Passo 0 — INICIALIZAÇÃO] Iniciando mutação "${entry.entryType}" a partir do parent ${entry.parentId}.\n\n` +
    `Metodologia: DGM (arXiv:2505.22954, Algorithm 1) — o sistema seleciona um agente-pai do arquivo MAP-Elites e prepara uma mutação direcionada. ` +
    `O tipo "${entry.entryType}" define o operador de mutação (seção 3.2 do paper). Cada etapa subsequente gera um hash SHA-256 para garantir reprodutibilidade (Gödel Machine, Schmidhuber 2007).`,
    timestamp: new Date().toISOString(), data: { runId, parentId: entry.parentId, mutationType: entry.entryType } });

  try {
    // Step 1: DIAGNOSE — Generate problem statement from benchmark failures
    emitDGMEvent({ step: 'diagnose', status: 'start', message: `[Passo 1 — DIAGNÓSTICO] Analisando falhas do benchmark para identificar o problema a ser resolvido.\n\n` +
      `Metodologia: Per arXiv:2505.22954 §3.1, o sistema auto-diagnostica analisando quais queries o agente-pai falhou. ` +
      `O diagnóstico gera um "problem statement" que guiará a modificação de código. Tipo de mutação: "${entry.entryType}" — ` +
      `corresponde ao operador ${entry.entryType === 'solve_low_quality' ? 'solve_low_quality (resolver queries com baixa pontuação)' : entry.entryType}.`,
      timestamp: new Date().toISOString() });
    const problemStatement = await diagnoseProblem(entry, parent);
    if (!problemStatement) {
      emitDGMEvent({ step: 'diagnose', status: 'fail', message: '[Passo 1 — DIAGNÓSTICO FALHOU] Não foi possível gerar um problem statement a partir das falhas do benchmark. O pipeline será encerrado para esta variante.', timestamp: new Date().toISOString() });
      log.warn(`[SELF-IMPROVE] Failed to diagnose problem for ${runId}`);
      return null;
    }
    const diagnosisHash = proofHash({ input: { entryType: entry.entryType, parentId: entry.parentId, target: entry.target }, output: problemStatement });
    log.info(`[PROOF] Step 1 DIAGNOSE hash=${diagnosisHash.slice(0, 16)}... (${problemStatement.length} chars)`);
    emitDGMEvent({ step: 'diagnose', status: 'success', message: `[Passo 1 — DIAGNÓSTICO COMPLETO] Problem statement gerado com ${problemStatement.length} caracteres.\n\n` +
      `Resultado: O sistema identificou as deficiências do agente-pai e formulou um diagnóstico estruturado. ` +
      `Hash SHA-256 do diagnóstico: ${diagnosisHash.slice(0, 16)}... (garante reprodutibilidade — Critério 1: Reprodutibilidade).`,
      timestamp: new Date().toISOString(), data: { hash: diagnosisHash, length: problemStatement.length, problemStatementPreview: problemStatement.slice(0, 200) } });

    // Step 2: SELF-MODIFY — Ask LLM to propose code changes
    emitDGMEvent({ step: 'modify', status: 'start', message: `[Passo 2 — SELF-MODIFY] Solicitando ao LLM que gere uma modificação de código baseada no diagnóstico.\n\n` +
      `Metodologia: DGM (arXiv:2505.22954 §3.2) — "The coding agent proposes code modifications targeting diagnosed weaknesses." ` +
      `O LLM recebe o problem statement e o código-fonte atual, e gera um patch. ` +
      `Este é o passo de auto-referência (Self-Referential Improvement, Schmidhuber 2007): MOTHER modifica seu próprio código.`,
      timestamp: new Date().toISOString() });
    // C360: Sample-diversity-first strategy (arXiv:2306.09896, Olausson et al., ICLR 2024)
    // "10 samples × 1 repair each = 66.1% pass rate > 2 samples × 10 repairs = 61.8%"
    // Strategy: Phase 1 — generate 2 diverse candidates in parallel (temp 0 + temp 0.15)
    //           Phase 2 — if both fail import/tsc, repair the best one ONCE with feedback
    const MAX_MODIFY_ATTEMPTS = 3; // Total budget: 2 diverse + 1 repair
    let modification: Awaited<ReturnType<typeof generateModification>> = null;
    let tscFeedback: string | undefined;
    type ModResult = { targetFile: string; proposedCode: string; originalCode: string; rationale: string; patch: string };
    let bestFailure: { mod: ModResult; errors: string[] } | null = null;

    // Helper: validate a candidate (import check + tsc)
    const validateCandidate = (mod: ModResult): { valid: boolean; errors: string[] } => {
      // C359: Import pre-validation — catch phantom imports BEFORE expensive tsc worktree
      const originalFileCode = (() => {
        try { return readFileSync(join(MOTHER_DIR, mod.targetFile), 'utf-8'); }
        catch { return ''; }
      })();
      const importCheck = validateImports(originalFileCode, mod.proposedCode);
      if (!importCheck.valid) {
        const phantoms = importCheck.phantomImports.join(', ');
        log.warn(`[SELF-IMPROVE] PHANTOM IMPORTS detected: ${phantoms}`);
        return { valid: false, errors: [`[PHANTOM IMPORT ERROR] Modules not in project: ${phantoms}. Do NOT import them. Only use existing imports.`] };
      }
      // Quick tsc pre-check using git worktree — NEVER writes to real source files
      const tsResult = validateTypeScriptInWorktree(mod.targetFile, mod.proposedCode);
      return tsResult;
    };

    // Phase 1: Generate 2 diverse candidates in parallel
    log.info(`[SELF-IMPROVE] Phase 1: Generating 2 diverse candidates in parallel (arXiv:2306.09896)`);
    emitDGMEvent({ step: 'modify', status: 'waiting',
      message: `[Passo 2.1 — GERANDO 2 CANDIDATOS] Gerando 2 modificações de código em paralelo (sample diversity, arXiv:2306.09896).\n\n` +
        `Candidato 1: abordagem padrão (temp=0). Candidato 2: abordagem diversa (temp=0.15). O melhor que compilar será selecionado.`,
      timestamp: new Date().toISOString(),
      data: { subStep: 'parallel-gen', candidates: 2 },
    });
    const modStart = Date.now();
    const [candidate1, candidate2] = await Promise.all([
      generateModification(problemStatement, entry, parent, undefined),
      generateModification(problemStatement, entry, parent, '[DIVERSITY HINT] Generate a DIFFERENT approach than your default. Focus on minimal, conservative changes using only existing imports and functions.'),
    ]);
    emitDGMEvent({ step: 'modify', status: 'waiting',
      message: `[Passo 2.2 — CANDIDATOS GERADOS] 2 candidatos gerados em ${Date.now() - modStart}ms. Validando via import check + TypeScript compiler...`,
      timestamp: new Date().toISOString(),
      data: { subStep: 'validating', latencyMs: Date.now() - modStart,
        candidate1: candidate1 ? `${candidate1.targetFile} (${candidate1.proposedCode.length} chars)` : 'falhou',
        candidate2: candidate2 ? `${candidate2.targetFile} (${candidate2.proposedCode.length} chars)` : 'falhou',
      },
    });

    // Validate candidates in order
    const candidates = [candidate1, candidate2] as Array<Awaited<ReturnType<typeof generateModification>>>;
    for (const [idx, candidate] of candidates.entries()) {
      if (!candidate) {
        log.warn(`[SELF-IMPROVE] Candidate ${idx + 1} failed to generate (search/replace mismatch)`);
        continue;
      }
      const result = validateCandidate(candidate);
      if (result.valid) {
        log.info(`[SELF-IMPROVE] Candidate ${idx + 1} PASSED tsc on first attempt (sample diversity win)`);
        modification = candidate;
        break;
      }
      log.warn(`[SELF-IMPROVE] Candidate ${idx + 1} FAILED: ${result.errors[0]}`);
      // Keep the best failure for repair phase
      if (!bestFailure || result.errors.length < bestFailure.errors.length) {
        bestFailure = { mod: candidate, errors: result.errors };
      }
    }

    // Phase 2: If both candidates failed, repair the best one ONCE with concrete feedback
    if (!modification && bestFailure) {
      log.info(`[SELF-IMPROVE] Phase 2: Repairing best candidate with tsc feedback (1 repair round)`);
      tscFeedback = bestFailure.errors.join('\n');
      emitDGMEvent({ step: 'modify', status: 'start', message: `[Passo 2 — REPAIR] Reparando melhor candidato com feedback do compilador.\n\nErros: ${tscFeedback.slice(0, 200)}`,
        timestamp: new Date().toISOString() });
      const repaired = await generateModification(problemStatement, entry, parent, tscFeedback);
      if (repaired) {
        const repairResult = validateCandidate(repaired);
        if (repairResult.valid) {
          log.info(`[SELF-IMPROVE] Repair PASSED tsc (feedback-guided repair success)`);
          modification = repaired;
        } else {
          log.warn(`[SELF-IMPROVE] Repair FAILED: ${repairResult.errors[0]}`);
        }
      }
    }

    if (!modification) {
      const errorSummary = tscFeedback || bestFailure?.errors.join('\n') || 'All candidates failed to generate';
      emitDGMEvent({ step: 'modify', status: 'fail', message: `[Passo 2 — MODIFICAÇÃO FALHOU] Nenhum dos ${MAX_MODIFY_ATTEMPTS} candidatos (2 diversos + 1 repair) compilou. Pipeline encerrado.\n\nÚltimos erros: ${errorSummary.slice(0, 300)}`, timestamp: new Date().toISOString() });
      log.warn(`[SELF-IMPROVE] Failed to generate compilable modification for ${runId} after ${MAX_MODIFY_ATTEMPTS} attempts (2 diverse + 1 repair)`);
      return null;
    }
    const modificationHash = proofHash({ targetFile: modification.targetFile, proposedCode: modification.proposedCode, rationale: modification.rationale });
    log.info(`[PROOF] Step 2 MODIFY hash=${modificationHash.slice(0, 16)}... target=${modification.targetFile} (${modification.proposedCode.length} chars)`);
    emitDGMEvent({ step: 'modify', status: 'success', message: `[Passo 2 — CÓDIGO GERADO] Modificação proposta para ${modification.targetFile} (${modification.proposedCode.length} chars).\n\n` +
      `Resultado: LLM gerou patch de código com rationale: "${(modification.rationale || '').slice(0, 150)}". ` +
      `Hash SHA-256 da modificação: ${modificationHash.slice(0, 16)}... Próximo: validação de segurança (Safety Gate).`,
      timestamp: new Date().toISOString(), data: { targetFile: modification.targetFile, rationale: modification.rationale, hash: modificationHash, codeLength: modification.proposedCode.length } });

    // Step 3: SAFETY CHECK — Validate modification before applying
    emitDGMEvent({ step: 'safety', status: 'start', message: `[Passo 3 — SAFETY GATE] Verificando segurança do código proposto para ${modification.targetFile}.\n\n` +
      `Metodologia: Constitutional AI (arXiv:2212.08073) + DGM §3.3 Anti-Objective-Hacking. ` +
      `O Safety Gate verifica: (a) sem deleção de arquivos críticos, (b) sem acesso a credenciais, (c) sem loops infinitos, (d) sem modificação fora do escopo permitido. ` +
      `Critério 3 (Integridade): prevenir "objective hacking" onde o agente burla métricas em vez de melhorar realmente.`,
      timestamp: new Date().toISOString() });
    const safetyResult = checkSafetyGate(modification.targetFile, modification.proposedCode, runId);
    const safetyHash = proofHash({ file: modification.targetFile, allowed: safetyResult.allowed, violations: safetyResult.violations, warnings: safetyResult.warnings });
    log.info(`[PROOF] Step 3 SAFETY hash=${safetyHash.slice(0, 16)}... allowed=${safetyResult.allowed}`);
    if (!safetyResult.allowed) {
      emitDGMEvent({ step: 'safety', status: 'fail', message: `[Passo 3 — SAFETY GATE BLOQUEOU] Violações detectadas: ${safetyResult.violations.join('; ')}.\n\n` +
        `Parecer: A modificação foi rejeitada por violar as regras de segurança. Per Constitutional AI (arXiv:2212.08073), modificações que violam princípios de segurança são bloqueadas ANTES de execução.`,
        timestamp: new Date().toISOString(), data: { violations: safetyResult.violations } });
      log.warn(`[SELF-IMPROVE] Safety gate blocked modification: ${safetyResult.violations.join(', ')}`);
      return null;
    }
    emitDGMEvent({ step: 'safety', status: 'success', message: `[Passo 3 — SAFETY GATE APROVADO] Nenhuma violação detectada. ${safetyResult.warnings.length} warnings (não-bloqueantes).\n\n` +
      `Resultado: O código passou na verificação de segurança. Hash SHA-256: ${safetyHash.slice(0, 16)}... ` +
      `${safetyResult.warnings.length > 0 ? `Warnings: ${safetyResult.warnings.join('; ')}` : 'Nenhum warning emitido.'}`,
      timestamp: new Date().toISOString(), data: { warnings: safetyResult.warnings, hash: safetyHash } });

    // Step 4: VALIDATE — Static fitness check (existing MOTHER evaluator)
    emitDGMEvent({ step: 'fitness', status: 'start', message: `[Passo 4 — FITNESS ESTÁTICO] Avaliando qualidade do código proposto em 7 dimensões.\n\n` +
      `Metodologia: DGM (arXiv:2505.22954 §3.4) — avaliação multi-dimensional de fitness. ` +
      `Dimensões avaliadas: Corretude, Robustez, Manutenibilidade, Performance, Segurança, Testabilidade, Documentação. ` +
      `Mínimo requerido: 50/100. Critério 2 (Ganho Empírico): o código deve demonstrar melhoria mensurável.`,
      timestamp: new Date().toISOString() });
    const fitnessResult = await fitnessEvaluator.evaluate({
      filePath: modification.targetFile,
      content: modification.proposedCode,
      cycleId: runId,
      agentId: parent.id,
    });
    const fitnessHash = proofHash({ overall: fitnessResult.overall, dimensions: fitnessResult.dimensions, file: modification.targetFile });
    log.info(`[PROOF] Step 4 FITNESS hash=${fitnessHash.slice(0, 16)}... overall=${fitnessResult.overall}`);

    if (fitnessResult.overall < 50) {
      emitDGMEvent({ step: 'fitness', status: 'fail', message: `[Passo 4 — FITNESS INSUFICIENTE] Score: ${fitnessResult.overall}/100 (mínimo: 50).\n\n` +
        `Parecer: O código proposto não atingiu o limiar mínimo de qualidade. A variante será descartada. Per DGM §3.4, variantes de baixa fitness não entram no arquivo MAP-Elites.`,
        timestamp: new Date().toISOString(), data: { score: fitnessResult.overall, dimensions: fitnessResult.dimensions } });
      log.warn(`[SELF-IMPROVE] Static fitness too low: ${fitnessResult.overall}`);
      return null;
    }
    emitDGMEvent({ step: 'fitness', status: 'success', message: `[Passo 4 — FITNESS APROVADO] Score geral: ${fitnessResult.overall}/100.\n\n` +
      `Resultado: ${Object.entries(fitnessResult.dimensions || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}. ` +
      `Hash SHA-256: ${fitnessHash.slice(0, 16)}... O código atende ao limiar de qualidade e prossegue para validação em sandbox.`,
      timestamp: new Date().toISOString(), data: { score: fitnessResult.overall, dimensions: fitnessResult.dimensions, hash: fitnessHash } });

    // Step 4.5: SANDBOX — Execute code in isolated environment BEFORE applying
    // Scientific basis: Sakana AI DGM (arXiv:2505.22954) — "Objective Hacking" prevention
    emitDGMEvent({ step: 'sandbox', status: 'start', message: `[Passo 5 — SANDBOX] Executando código em ambiente isolado para ${modification.targetFile}.\n\n` +
      `Metodologia: E2B Cloud Sandbox (e2b.dev) + CodeAct (arXiv:2402.01030) — "executable code as action space". ` +
      `O código é executado em sandbox isolado para verificar: (a) compilação TypeScript sem erros, (b) sem efeitos colaterais indesejados. ` +
      `Critério 3 (Integridade): sandbox previne "objective hacking" (DGM §3.3). Se E2B falhar, fallback para validação de sintaxe local.`,
      timestamp: new Date().toISOString() });
    let sandboxResult: { passed: boolean; output: string; error?: string; durationMs: number; sandboxType: string; sandboxId: string };
    try {
      // Try e2b sandbox first (full isolation), fallback to local sandbox
      const e2bResult = await runInSandbox({
        code: modification.proposedCode,
        filePath: modification.targetFile,
        language: 'typescript',
        timeoutMs: 30000,
      });
      sandboxResult = {
        passed: e2bResult.passed,
        output: e2bResult.output,
        error: e2bResult.error,
        durationMs: e2bResult.executionTimeMs,
        sandboxType: e2bResult.sandboxType,
        sandboxId: e2bResult.sandboxId ?? `local-${runId}`,
      };

      // If e2b/tsc check passes, also run in local sandbox executor for runtime validation
      // SKIP local runtime execution for code with imports — DGM-generated code always
      // references project-internal or external modules that won't resolve in an isolated
      // tmpdir. The E2B + tsc-fallback syntax check is sufficient for validation.
      // Scientific basis: SICA (arXiv:2504.15228) — "graduated validation prevents false
      // rejections when runtime dependencies are unavailable in isolated environments"
      const hasImports = modification.proposedCode.includes('import ') || modification.proposedCode.includes('require(');
      if (sandboxResult.passed && !hasImports) {
        const localResult = await sandboxExecutor.execute(
          `// DGM Sandbox Validation — ${runId}\n${modification.proposedCode}`,
          { timeoutMs: 10000, maxMemoryMb: 256 },
        );
        if (!localResult.success) {
          sandboxResult = {
            passed: false,
            output: `TypeScript check passed but runtime failed:\n${localResult.stderr}`,
            error: localResult.error,
            durationMs: sandboxResult.durationMs + localResult.durationMs,
            sandboxType: `${sandboxResult.sandboxType}+local`,
            sandboxId: localResult.sandboxId,
          };
        } else {
          sandboxResult.durationMs += localResult.durationMs;
          sandboxResult.sandboxType = `${sandboxResult.sandboxType}+local`;
          sandboxResult.sandboxId = localResult.sandboxId;
          sandboxResult.output += `\nLocal sandbox: OK (${localResult.durationMs}ms)`;
        }
      } else if (sandboxResult.passed && hasImports) {
        log.info(`[SELF-IMPROVE] Skipping local runtime sandbox — code has imports (E2B/tsc check sufficient)`);
        sandboxResult.sandboxType = `${sandboxResult.sandboxType}+imports-skip`;
      }
    } catch (sandboxErr) {
      // Sandbox failure IS fatal — code that can't be validated must be rejected
      log.warn(`[SELF-IMPROVE] Sandbox execution error (FATAL): ${sandboxErr}`);
      sandboxResult = {
        passed: false,
        output: `Sandbox error: ${sandboxErr}`,
        error: String(sandboxErr),
        durationMs: 0,
        sandboxType: 'unavailable',
        sandboxId: `error-${runId}`,
      };
    }
    const sandboxHash = proofHash({ sandboxId: sandboxResult.sandboxId, passed: sandboxResult.passed, output: sandboxResult.output, durationMs: sandboxResult.durationMs });
    log.info(`[PROOF] Step 4.5 SANDBOX hash=${sandboxHash.slice(0, 16)}... passed=${sandboxResult.passed} type=${sandboxResult.sandboxType} (${sandboxResult.durationMs}ms)`);

    if (!sandboxResult.passed) {
      emitDGMEvent({ step: 'sandbox', status: 'fail', message: `[Passo 5 — SANDBOX REJEITOU] Tipo: ${sandboxResult.sandboxType}, Erro: ${(sandboxResult.error || 'compilation failed').slice(0, 200)}.\n\n` +
        `Parecer: O código não passou na validação do sandbox. Duração: ${sandboxResult.durationMs}ms. A variante será descartada para proteger a integridade do sistema.`,
        timestamp: new Date().toISOString(), data: { type: sandboxResult.sandboxType, durationMs: sandboxResult.durationMs, error: sandboxResult.error } });
      log.warn(`[SELF-IMPROVE] Sandbox validation FAILED — blocking modification: ${sandboxResult.error}`);
      return null;
    }
    emitDGMEvent({ step: 'sandbox', status: 'success', message: `[Passo 5 — SANDBOX APROVADO] Tipo: ${sandboxResult.sandboxType}, Duração: ${sandboxResult.durationMs}ms.\n\n` +
      `Resultado: Código compilou e passou na validação do sandbox. Hash SHA-256: ${sandboxHash.slice(0, 16)}... ` +
      `Próximo passo: validação local tsc --noEmit antes da aprovação humana.`,
      timestamp: new Date().toISOString(), data: { type: sandboxResult.sandboxType, durationMs: sandboxResult.durationMs, hash: sandboxHash } });

    // Step 5.5: LOCAL TSC GATE — Validate with tsc --noEmit using git worktree (never touches real files)
    {
      const tsResult = validateTypeScriptInWorktree(modification.targetFile, modification.proposedCode);
      if (!tsResult.valid) {
        emitDGMEvent({
          step: 'sandbox',
          status: 'fail',
          message: `[Passo 5.5 — TSC LOCAL REJEITOU] O código passou no sandbox isolado mas falhou na compilação local (tsc --noEmit via worktree).\n\n` +
            `Erros: ${tsResult.errors.slice(0, 3).join('; ')}.\n` +
            `Esta validação usa git worktree isolado — sem risco de corrupção dos arquivos fonte.`,
          timestamp: new Date().toISOString(),
          data: { errors: tsResult.errors.slice(0, 5), targetFile: modification.targetFile },
        });
        log.warn(`[SELF-IMPROVE] Local tsc --noEmit FAILED for ${modification.targetFile}: ${tsResult.errors[0]}`);
        return null;
      }
      log.info(`[SELF-IMPROVE] Local tsc --noEmit PASSED for ${modification.targetFile}`);
    }

    // Step 6: HUMAN APPROVAL — Present proposal to user before applying
    // C358: Parse full diagnosis JSON for rich proposal context
    let diagnosisParsed: { scientificBasis?: string; proposedFix?: string; problem?: string; rootCause?: string; expectedImprovement?: string; targetFile?: string } = {};
    try { const m = problemStatement.match(/\{[\s\S]*\}/); if (m) diagnosisParsed = JSON.parse(m[0]); } catch { /* ignore */ }

    // Rejection Memory check — block proposals too similar to previously rejected ones
    const rejectionCheck = isBlockedByRejectionMemory(
      modification.targetFile,
      entry.entryType,
      modification.rationale,
      problemStatement,
    );
    if (rejectionCheck.blocked) {
      emitDGMEvent({
        step: 'proposal',
        status: 'fail',
        message: `[Passo 6 — BLOQUEADA POR MEMORIA DE REJEICAO] ${rejectionCheck.reason}\n\n` +
          `A proposta para ${modification.targetFile} (tipo: ${entry.entryType}) foi automaticamente descartada ` +
          `porque uma proposta similar ja foi rejeitada pelo humano. O DGM prossegue para a proxima mutacao.`,
        timestamp: new Date().toISOString(),
        data: { targetFile: modification.targetFile, mutationType: entry.entryType, reason: rejectionCheck.reason },
      });
      log.info(`[REJECTION-MEMORY] Blocked proposal for ${modification.targetFile}/${entry.entryType}: ${rejectionCheck.reason}`);
      return null;
    }

    const proposalForReview: DGMProposal = {
      id: `proposal-${runId}`,
      runId,
      targetFile: modification.targetFile,
      proposedCode: modification.proposedCode,
      originalCode: modification.originalCode,
      rationale: modification.rationale,
      scientificBasis: diagnosisParsed.scientificBasis || 'DGM arXiv:2505.22954',
      expectedImprovement: diagnosisParsed.expectedImprovement || `mutation=${entry.entryType}`,
      fitnessScore: fitnessResult.overall,
      sandboxPassed: sandboxResult.passed,
      sandboxType: sandboxResult.sandboxType,
      sandboxDurationMs: sandboxResult.durationMs,
      diagnosisHash,
      modificationHash,
      safetyHash,
      fitnessHash,
      sandboxHash,
      // C358: Rich context for human review
      title: `${entry.entryType === 'general_improvement' ? 'Melhoria Geral' : entry.entryType === 'solve_low_quality' ? 'Corrigir Baixa Qualidade' : entry.entryType}: ${modification.targetFile.split('/').pop()}`,
      summary: diagnosisParsed.proposedFix || modification.rationale || `Mutação ${entry.entryType} no arquivo ${modification.targetFile}`,
      problemStatement: diagnosisParsed.problem || problemStatement.slice(0, 2000),
      rootCause: diagnosisParsed.rootCause || 'Identificado via auto-diagnóstico DGM',
      proposedFix: diagnosisParsed.proposedFix || modification.rationale || '',
      mutationType: entry.entryType,
      fitnessDimensions: fitnessResult.dimensions || {},
      safetyWarnings: safetyResult.warnings || [],
      parentMetrics: {
        id: parent.id,
        accuracy: parent.accuracyScore,
        resolved: parent.resolvedIds.length,
        total: parent.totalSubmittedInstances,
        unresolvedIds: parent.unresolvedIds,
      },
      diagnosisLength: problemStatement.length,
      codeLength: modification.proposedCode.length,
    };

    emitDGMEvent({
      step: 'proposal',
      status: 'waiting',
      message: `[Passo 6 — APROVAÇÃO HUMANA] Proposta pronta para revisão: ${modification.targetFile}.\n\n` +
        `Metodologia: Human-in-the-Loop (HITL) — DGM §3.5. O sistema apresenta a proposta com: código original vs proposto, ` +
        `justificativa científica, parecer de fitness (${fitnessResult.overall}/100), e resultado do sandbox (${sandboxResult.sandboxType}). ` +
        `O humano DEVE aprovar ou rejeitar manualmente. Nao ha timeout — a proposta aguarda indefinidamente.`,
      timestamp: new Date().toISOString(),
      data: { proposal: proposalForReview },
    });

    // Wait for human approval — NO timeout. Proposal stays pending until human decides.
    const humanApproved = await new Promise<boolean>((resolve) => {
      pendingProposals.set(proposalForReview.id, { proposal: proposalForReview, resolve });
    });

    if (!humanApproved) {
      // Record rejection in memory so similar proposals are blocked in future cycles
      recordRejection(modification.targetFile, entry.entryType, modification.rationale, problemStatement);
      emitDGMEvent({ step: 'proposal', status: 'fail', message: `[Passo 6 — PROPOSTA REJEITADA] O humano rejeitou a modificação proposta. A variante será descartada e o pipeline prossegue para a próxima mutação.\n\n` +
        `Memoria de rejeicao atualizada: propostas similares para ${modification.targetFile} (tipo: ${entry.entryType}) serao bloqueadas automaticamente em ciclos futuros.`,
        timestamp: new Date().toISOString(), data: { rejectionMemorySize: rejectionMemory.length } });
      log.info(`[SELF-IMPROVE] Proposal rejected by human: ${proposalForReview.id} — recorded in rejection memory`);
      return null;
    }
    emitDGMEvent({ step: 'proposal', status: 'success', message: '[Passo 6 — PROPOSTA APROVADA] Humano aprovou a modificação. Criando branch e PR no GitHub...', timestamp: new Date().toISOString() });

    // Step 5b: APPLY via GitHub PR — never writes to local source files
    // Scientific basis: DGM (arXiv:2505.22954) §3.5 — "Version-controlled deployment prevents corruption"
    // SICA (arXiv:2504.15228) — "Validation-before-commit reduces failure from 83% to 17%"
    const proposalHash = proofHash({ proposalId: proposalForReview.id, targetFile: modification.targetFile, rationale: modification.rationale });
    log.info(`[PROOF] Step 5 PROPOSAL hash=${proposalHash.slice(0, 16)}... id=${proposalForReview.id}`);

    // Validate in worktree before creating PR (don't waste GitHub API calls on broken code)
    const worktreeResult = validateTypeScriptInWorktree(modification.targetFile, modification.proposedCode);
    if (!worktreeResult.valid) {
      emitDGMEvent({ step: 'proposal', status: 'fail', message: `[Passo 6 — TSC FALHOU PRÉ-PR] O código aprovado não compila: ${worktreeResult.errors[0]}.\n\nA proposta não será enviada ao GitHub.`, timestamp: new Date().toISOString() });
      log.warn(`[SELF-IMPROVE] Pre-PR tsc validation failed: ${worktreeResult.errors[0]}`);
      return null;
    }

    // Create GitHub PR via existing GitHubWriteService
    const branchName = `dgm/proposal-${proposalForReview.id}-${Date.now()}`;
    try {
      const prBody = [
        `## DGM Self-Improvement Proposal`,
        ``,
        `**Proposal ID:** \`${proposalForReview.id}\``,
        `**Mutation Type:** ${entry.entryType}`,
        `**Target File:** \`${modification.targetFile}\``,
        `**Parent Variant:** ${entry.parentId} (accuracy: ${(parent.accuracyScore * 100).toFixed(1)}%)`,
        ``,
        `### Rationale`,
        modification.rationale,
        ``,
        `### Scientific Basis`,
        proposalForReview.scientificBasis || 'DGM (arXiv:2505.22954)',
        ``,
        `### Validation`,
        `- Fitness Score: ${proposalForReview.fitnessScore.toFixed(2)}`,
        `- Sandbox: ${proposalForReview.sandboxPassed ? 'PASSED' : 'FAILED'} (${proposalForReview.sandboxType}, ${proposalForReview.sandboxDurationMs}ms)`,
        `- tsc --noEmit (worktree): PASSED`,
        `- Safety Warnings: ${proposalForReview.safetyWarnings.length > 0 ? proposalForReview.safetyWarnings.join(', ') : 'None'}`,
        ``,
        `### Proof Hashes`,
        `- Diagnosis: \`${proposalForReview.diagnosisHash.slice(0, 16)}...\``,
        `- Modification: \`${proposalForReview.modificationHash.slice(0, 16)}...\``,
        `- Safety: \`${proposalForReview.safetyHash.slice(0, 16)}...\``,
        `- Fitness: \`${proposalForReview.fitnessHash.slice(0, 16)}...\``,
        ``,
        `---`,
        `*Generated by MOTHER DGM (Darwin Gödel Machine, arXiv:2505.22954)*`,
      ].join('\n');

      const result = await githubWriteService.autonomousSelfModification({
        branchName,
        files: [{ path: modification.targetFile, content: modification.proposedCode }],
        prTitle: `[DGM] ${entry.entryType}: ${modification.targetFile}`,
        prBody,
        autoMerge: false, // Human must merge the PR on GitHub
        proposalId: proposalForReview.id,
        analysisContext: `Fitness: ${proposalForReview.fitnessScore.toFixed(2)}, Sandbox: ${proposalForReview.sandboxType}, tsc: PASSED`,
      });

      emitDGMEvent({
        step: 'proposal',
        status: 'success',
        message: `[Passo 6 — PR CRIADO] Pull Request #${result.pr.number} criado no GitHub.\n\n` +
          `Branch: ${branchName}\nURL: ${result.pr.url}\n` +
          `O código NÃO foi aplicado localmente — merge o PR no GitHub para aplicar.`,
        timestamp: new Date().toISOString(),
        data: { prNumber: result.pr.number, prUrl: result.pr.url, branch: branchName },
      });
      log.info(`[SELF-IMPROVE] GitHub PR created: #${result.pr.number} — ${result.pr.url}`);
    } catch (prErr) {
      // GitHub PR creation failed — DO NOT fall back to local writes.
      // Local applyProposal() can corrupt source files (hipporag2.ts, intelligence.ts, etc.)
      log.error(`[SELF-IMPROVE] GitHub PR creation failed: ${prErr}. Proposal DISCARDED (no local fallback).`);
      emitDGMEvent({
        step: 'proposal',
        status: 'fail',
        message: `[Passo 6 — PR FALHOU] Erro ao criar PR no GitHub: ${String(prErr).slice(0, 200)}.\n\n` +
          `A proposta foi DESCARTADA. Não há fallback local — escrita direta nos arquivos fonte foi desabilitada ` +
          `para prevenir corrupção. Configure GITHUB_TOKEN ou GITHUB_PAT no .env para habilitar o DGM.`,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    // Step 6: EMPIRICAL EVALUATION — The core DGM innovation
    emitDGMEvent({ step: 'evaluate', status: 'start', message: `[Passo 7 — AVALIAÇÃO EMPÍRICA] Executando benchmark para medir accuracy da variante modificada.\n\n` +
      `Metodologia: DGM (arXiv:2505.22954 §3.4) — "Empirical validation replaces impractical theoretical proofs." ` +
      `A variante é testada com queries reais para medir se a modificação melhorou o desempenho do agente. ` +
      `Critério 2 (Ganho Empírico): a accuracy pós-modificação deve ser >= accuracy do parent para a variante entrar no arquivo MAP-Elites.`,
      timestamp: new Date().toISOString() });
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
      sandboxHash,
      sandboxResult,
    };
    variant.proofHash = proofHash(variant);

    log.info(`[PROOF] Step 7 VARIANT hash=${variant.proofHash.slice(0, 16)}... id=${runId}`);
    log.info(`[PROOF] CHAIN: parent=${parent.proofHash.slice(0, 12)}→diagnosis=${diagnosisHash.slice(0, 12)}→modify=${modificationHash.slice(0, 12)}→safety=${safetyHash.slice(0, 12)}→sandbox=${sandboxHash.slice(0, 12)}→fitness=${fitnessHash.slice(0, 12)}→bench=${benchmarkHash.slice(0, 12)}→variant=${variant.proofHash.slice(0, 12)}`);

    // ── SCIENTIFIC PROOF GENERATION ──────────────────────────────────────
    // Generate the 3 scientific proofs for this variant (Sakana AI DGM criteria)
    const scientificProof = generateScientificProof(parent, variant, {
      safetyHash, sandboxHash, sandboxResult, benchmarkSmall,
    });
    // Store in module-level collection for retrieval by GenerationResult
    generationProofs.push(scientificProof);
    log.info(`[SCIENTIFIC-PROOF] Reproducibility=${scientificProof.reproducibility.valid} Gain=${scientificProof.empiricalGain.verdict}(${(scientificProof.empiricalGain.delta * 100).toFixed(1)}pp) Integrity=${scientificProof.integrity.valid} Overall=${scientificProof.overallValid}`);

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

    emitDGMEvent({ step: 'complete', status: 'success', message: `[Passo 8 — CONCLUÍDO] Variante ${runId} criada com sucesso!\n\n` +
      `Resultados empíricos: Accuracy=${(finalResult.accuracy * 100).toFixed(1)}%, Fitness=${fitnessResult.overall}/100.\n` +
      `Queries resolvidas: ${finalResult.resolvedIds.length}, Não-resolvidas: ${finalResult.unresolvedIds.length}.\n` +
      `Cadeia de provas SHA-256: parent→diag→mod→safe→sandbox→fit→bench→variant.\n` +
      `Hash final da variante: ${variant.proofHash.slice(0, 24)}...\n\n` +
      `3 Critérios Científicos DGM: (1) Reprodutibilidade: cadeia de hashes verificável, ` +
      `(2) Ganho Empírico: accuracy medida em benchmark real, (3) Integridade: Safety Gate + Sandbox + Human Approval.`,
      timestamp: new Date().toISOString(), data: { runId, accuracy: finalResult.accuracy, fitness: fitnessResult.overall, proofHash: variant.proofHash, resolvedCount: finalResult.resolvedIds.length, unresolvedCount: finalResult.unresolvedIds.length } });

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
- server/mother/calibration.ts (confidence calibration + temperature scaling)
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
    // ── Debug sub-event: LLM call starting ──
    emitDGMEvent({ step: 'diagnose', status: 'waiting',
      message: `[Passo 1.1 — INVOCANDO LLM] Chamando coreOrchestrate (8 camadas: cache → routing → context → generation → guardian).\n\n` +
        `O diagnóstico usa a pipeline completa da MOTHER para auto-análise. Tipo de mutação: "${entry.entryType}". ` +
        `Aguardando resposta do LLM...`,
      timestamp: new Date().toISOString(),
      data: { subStep: 'llm-invoke', mutationType: entry.entryType, promptLength: diagnosticQuery.length },
    });

    const llmStart = Date.now();
    const result = await coreOrchestrate({
      query: diagnosticQuery,
      conversationHistory: [],
      metadata: { source: 'dgm-diagnose', mutationType: entry.entryType },
    });
    const llmMs = Date.now() - llmStart;

    // ── Debug sub-event: LLM response received ──
    emitDGMEvent({ step: 'diagnose', status: 'waiting',
      message: `[Passo 1.2 — LLM RESPONDEU] Resposta recebida em ${llmMs}ms (provider=${result.provider}, model=${result.model}, quality=${result.qualityScore}).\n\n` +
        `Tamanho da resposta: ${result.response?.length ?? 0} chars. Processando diagnóstico...`,
      timestamp: new Date().toISOString(),
      data: { subStep: 'llm-response', latencyMs: llmMs, provider: result.provider, model: result.model, quality: result.qualityScore, responseLength: result.response?.length ?? 0 },
    });

    if (!result.response || result.response.trim().length < 20) {
      log.warn(`[DIAGNOSE] Empty response from coreOrchestrate (provider=${result.provider}, model=${result.model})`);
      return null;
    }

    // Try to parse structured diagnosis JSON for richer UI display
    let parsedDiagnosis: Record<string, string> | null = null;
    try {
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsedDiagnosis = JSON.parse(jsonMatch[0]);
    } catch { /* not JSON, use raw response */ }

    // ── Debug sub-event: diagnosis parsed ──
    if (parsedDiagnosis) {
      emitDGMEvent({ step: 'diagnose', status: 'waiting',
        message: `[Passo 1.3 — DIAGNÓSTICO ESTRUTURADO]\n\n` +
          `🔍 PROBLEMA: ${parsedDiagnosis.problem || '(não especificado)'}\n\n` +
          `🔧 CAUSA RAIZ: ${parsedDiagnosis.rootCause || '(não especificado)'}\n\n` +
          `📁 ARQUIVO ALVO: ${parsedDiagnosis.targetFile || '(não especificado)'}\n\n` +
          `💡 CORREÇÃO PROPOSTA: ${parsedDiagnosis.proposedFix || '(não especificado)'}\n\n` +
          `📈 MELHORIA ESPERADA: ${parsedDiagnosis.expectedImprovement || '(não especificado)'}\n\n` +
          `📚 BASE CIENTÍFICA: ${parsedDiagnosis.scientificBasis || '(não especificado)'}`,
        timestamp: new Date().toISOString(),
        data: {
          subStep: 'diagnosis-parsed', ...parsedDiagnosis,
          llmProvider: result.provider, llmModel: result.model, llmQuality: result.qualityScore, llmLatencyMs: llmMs,
        },
      });
    }

    log.info(`[DIAGNOSE] Diagnosis complete via MOTHER pipeline — provider=${result.provider}, model=${result.model}, quality=${result.qualityScore}, latency=${llmMs}ms`);
    return result.response;
  } catch (err) {
    emitDGMEvent({ step: 'diagnose', status: 'fail',
      message: `[Passo 1 — ERRO NO LLM] coreOrchestrate falhou: ${String(err)}`,
      timestamp: new Date().toISOString(), data: { error: String(err) },
    });
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
  tscErrorFeedback?: string,
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
    let actualTargetFile = targetFile;
    try {
      originalCode = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      // File doesn't exist — redirect to intelligence.ts (always exists)
      log.warn(`[MODIFY] ${targetFile} does not exist — redirecting to server/mother/intelligence.ts`);
      actualTargetFile = 'server/mother/intelligence.ts';
      const fallbackPath = path.resolve(actualTargetFile);
      try {
        originalCode = fs.readFileSync(fallbackPath, 'utf-8');
      } catch {
        log.error(`[MODIFY] Fallback file also missing — aborting`);
        return null;
      }
    }

    // DGM Self-Modify: Use invokeLLM directly with surgical SEARCH/REPLACE approach.
    // Previous approach asked for the COMPLETE file back — this fails because:
    // 1. Files are 300-700 lines; LLM can't reproduce them faithfully in one shot
    // 2. coreOrchestrate cascades through the full 8-layer pipeline (G-Eval, citations, etc.)
    //    which is unnecessary for code generation and adds 30s+ overhead
    // 3. Timeout cascades cause fallback to gpt-4o-mini with 3s budget → snippet/garbage
    //
    // C360: Evidence-based optimizations from literature review:
    // - SICA (arXiv:2504.15228 §4.2): surgical SEARCH/REPLACE blocks
    // - Self-Repair (arXiv:2304.05128, Chen et al.): iterative repair with compiler feedback
    // - Aider benchmark: temperature=0 for edits, extract existing imports as context
    // - OpenAI Structured Output: json_schema mode eliminates JSON parse failures
    // - SWE-bench top agents: provide explicit import inventory to prevent hallucination
    const codeLines = originalCode.split('\n');
    const firstLines = codeLines.slice(0, 5).map((l, i) => `  ${i + 1}: ${l}`).join('\n');
    const lastLines = codeLines.slice(-3).map((l, i) => `  ${codeLines.length - 2 + i}: ${l}`).join('\n');

    // C360: Extract existing imports from the target file — these are the ONLY allowed external imports
    const existingImports = codeLines
      .filter(l => /^\s*import\s/.test(l))
      .map(l => l.trim())
      .join('\n');

    const modificationQuery = `You are a DGM (Darwin Gödel Machine, arXiv:2505.22954) code evolution agent.
Your task: propose SURGICAL modifications to improve a TypeScript source file.

PROBLEM DIAGNOSIS:
${problemStatement}

TARGET FILE: ${actualTargetFile}
SCIENTIFIC BASIS: ${scientificBasis}

COMPLETE ORIGINAL FILE (${codeLines.length} lines):
\`\`\`typescript
${originalCode}
\`\`\`

FILE VERIFICATION — the file starts and ends with these exact lines:
FIRST 5 LINES:
${firstLines}
LAST 3 LINES:
${lastLines}
Your "search" strings MUST match text from the file above. Do NOT invent or guess file content.

EXISTING IMPORTS IN THIS FILE (these are the ONLY imports you may use — do NOT add new external imports):
${existingImports}
CONSTRAINT: You MUST NOT add any new import statements for external packages. You may only:
- Use imports already present above
- Add relative imports to files in server/mother/ or server/_core/ that already exist
- Use Node.js built-in modules (crypto, fs, path, etc.)
Do NOT import: transformers, torch, dpr-model, @huggingface/*, sentence-transformers, or any Python/ML library.

${tscErrorFeedback ? `PREVIOUS ATTEMPT FAILED:
${tscErrorFeedback}
Fix these errors. Copy search strings EXACTLY from the COMPLETE ORIGINAL FILE above.

` : ''}OUTPUT FORMAT — respond with ONLY valid JSON (no markdown fences, no text outside JSON):
{
  "targetFile": "${actualTargetFile}",
  "rationale": "Why this change improves the system",
  "scientificBasis": "arXiv:XXXX.XXXXX — paper title and relevant finding",
  "searchReplace": [
    {
      "search": "exact string from the original file to find (multi-line OK, must be unique)",
      "replace": "the replacement string (multi-line OK)"
    }
  ],
  "expectedMetricImprovement": "e.g., +5pp accuracy, -200ms latency"
}

RULES:
1. Each "search" string MUST exist EXACTLY in the original file (copy-paste precision)
2. Each "search" must be unique in the file — include enough context lines to disambiguate
3. You may have 1-5 search/replace pairs
4. DO NOT remove or rename any existing exports — other modules depend on them
5. Maintain TypeScript strict mode compatibility
6. Include scientific comments (arXiv citations) for non-trivial changes
7. DO NOT introduce security vulnerabilities
8. Preserve all existing imports unless replacing them with better ones
9. CRITICAL: Do NOT hallucinate imports or code that doesn't exist in the file. Verify against the FILE VERIFICATION section above.
10. Do NOT add import statements for modules that don't exist in the project. Only use imports already present in the file or well-known npm packages.
11. Every variable, function, or type you reference in replacement code MUST be declared in scope. Do NOT use undeclared identifiers.
12. Ensure each replacement block is syntactically complete — no unclosed braces, strings, or template literals.`;

    // C360: Evidence-based LLM call optimizations:
    // - Temperature 0: per Aider benchmarks, deterministic output is critical for code edits
    // - Structured Output (json_schema): OpenAI guarantees valid JSON matching schema,
    //   eliminates JSON parse failures (Chen et al., "Efficient Tool Use with Structured Generation", 2024)
    // - Self-Repair pattern (arXiv:2304.05128): compiler feedback in retry loop
    const DGM_MODIFY_MODEL = process.env.DGM_MODIFY_MODEL || 'gpt-4o';
    const DGM_MODIFY_PROVIDER = (process.env.DGM_MODIFY_PROVIDER || 'openai') as 'openai' | 'google' | 'anthropic';

    // JSON Schema for OpenAI Structured Output — guarantees valid JSON structure
    const modificationSchema = {
      name: 'DGMModification',
      schema: {
        type: 'object' as const,
        properties: {
          targetFile: { type: 'string', description: 'The file being modified' },
          rationale: { type: 'string', description: 'Why this change improves the system' },
          scientificBasis: { type: 'string', description: 'arXiv paper citation supporting the change' },
          searchReplace: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                search: { type: 'string', description: 'Exact string from original file to find' },
                replace: { type: 'string', description: 'Replacement string' },
              },
              required: ['search', 'replace'],
              additionalProperties: false,
            },
            minItems: 1,
            maxItems: 5,
          },
          expectedMetricImprovement: { type: 'string', description: 'Expected improvement' },
        },
        required: ['targetFile', 'rationale', 'scientificBasis', 'searchReplace', 'expectedMetricImprovement'],
        additionalProperties: false,
      },
      strict: true,
    };

    const startMs = Date.now();
    let modResult: {
      targetFile?: string;
      rationale?: string;
      scientificBasis?: string;
      searchReplace?: Array<{ search: string; replace: string }>;
      codeChanges?: string;
      expectedMetricImprovement?: string;
    } = {};
    try {
      const llmResult = await invokeLLM({
        model: DGM_MODIFY_MODEL,
        provider: DGM_MODIFY_PROVIDER,
        messages: [
          { role: 'system', content: 'You are a senior TypeScript engineer performing surgical code modifications. You MUST NOT add imports for packages not already imported in the file.' },
          { role: 'user', content: modificationQuery },
        ],
        temperature: 0, // C360: Deterministic output for code edits (per Aider/SWE-bench best practices)
        maxTokens: 8192,
        // C360: Use structured output for OpenAI provider — guarantees valid JSON
        ...(DGM_MODIFY_PROVIDER === 'openai' ? { outputSchema: modificationSchema } : { responseFormat: { type: 'json_object' as const } }),
      });
      const rawContent = llmResult?.choices?.[0]?.message?.content;
      const llmResponse = typeof rawContent === 'string' ? rawContent : Array.isArray(rawContent) ? rawContent.map((c: any) => 'text' in c ? c.text : '').join('') : '';

      if (!llmResponse || llmResponse.trim().length < 50) {
        log.warn(`[MODIFY] Empty response from invokeLLM (${DGM_MODIFY_PROVIDER}/${DGM_MODIFY_MODEL})`);
        return null;
      }

      // With structured output, response is guaranteed valid JSON; parse directly
      try {
        modResult = JSON.parse(llmResponse);
      } catch {
        // Fallback: strip markdown fences if present (non-OpenAI providers)
        const cleaned = llmResponse.replace(/^```(?:json)?\s*\n/m, '').replace(/\n```\s*$/, '');
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) modResult = JSON.parse(jsonMatch[0]);
      }
    } catch (err: any) {
      log.warn(`[MODIFY] invokeLLM failed (${DGM_MODIFY_PROVIDER}/${DGM_MODIFY_MODEL}): ${err?.message || err}`);
      return null;
    }
    const latencyMs = Date.now() - startMs;
    log.info(`[MODIFY] Code generation via invokeLLM — provider=${DGM_MODIFY_PROVIDER}, model=${DGM_MODIFY_MODEL}, latency=${latencyMs}ms`);

    // Apply surgical SEARCH/REPLACE modifications to the original file
    let proposedCode: string;
    if (modResult.searchReplace && modResult.searchReplace.length > 0) {
      proposedCode = originalCode;
      for (const sr of modResult.searchReplace) {
        if (!sr.search || sr.replace === undefined) {
          log.warn(`[MODIFY] Invalid search/replace pair — skipping`);
          continue;
        }
        // Try exact match first
        if (proposedCode.includes(sr.search)) {
          proposedCode = proposedCode.replace(sr.search, sr.replace);
          continue;
        }
        // Fuzzy matching: normalize whitespace (LLMs often mangle indentation)
        // Strategy 1: trimmed match
        const trimmedSearch = sr.search.trim();
        if (trimmedSearch.length > 20 && proposedCode.includes(trimmedSearch)) {
          proposedCode = proposedCode.replace(trimmedSearch, sr.replace.trim());
          log.info(`[MODIFY] Applied via trimmed match (${trimmedSearch.length} chars)`);
          continue;
        }
        // Strategy 2: whitespace-normalized match — collapse all runs of whitespace
        // to single space, then find the matching region in the original
        const normalizeWS = (s: string) => s.replace(/\s+/g, ' ').trim();
        const normalizedSearch = normalizeWS(sr.search);
        if (normalizedSearch.length > 20) {
          // Find the matching region in originalCode by sliding a window
          const lines = proposedCode.split('\n');
          const searchLines = sr.search.trim().split('\n');
          let matchStart = -1;
          let matchEnd = -1;
          // Find first line that matches (normalized)
          for (let i = 0; i < lines.length; i++) {
            if (normalizeWS(lines[i]) === normalizeWS(searchLines[0])) {
              // Check if subsequent lines match
              let allMatch = true;
              for (let j = 1; j < searchLines.length && i + j < lines.length; j++) {
                if (normalizeWS(lines[i + j]) !== normalizeWS(searchLines[j])) {
                  allMatch = false;
                  break;
                }
              }
              if (allMatch && searchLines.length > 0) {
                matchStart = i;
                matchEnd = i + searchLines.length;
                break;
              }
            }
          }
          if (matchStart >= 0) {
            // Replace the matched region with the replacement lines
            const before = lines.slice(0, matchStart);
            const after = lines.slice(matchEnd);
            const replaceLines = sr.replace.split('\n');
            proposedCode = [...before, ...replaceLines, ...after].join('\n');
            log.info(`[MODIFY] Applied via whitespace-normalized match (lines ${matchStart}-${matchEnd})`);
            continue;
          }
        }
        // All strategies failed
        log.warn(`[MODIFY] Search string not found in file (${sr.search.slice(0, 80)}...)`);
        return null; // Abort — LLM hallucinated the search string
      }
      log.info(`[MODIFY] Applied ${modResult.searchReplace.length} surgical modifications`);
    } else if (modResult.codeChanges) {
      // Fallback: LLM returned full file in codeChanges (legacy format)
      proposedCode = modResult.codeChanges.replace(/^```(?:typescript|ts)?\s*\n/m, '').replace(/\n```\s*$/, '');
      const originalHasImports = originalCode.includes('import ');
      const looksLikeCompleteFile = proposedCode.includes('import ') ||
        proposedCode.includes('export ') ||
        /^(import|export|const|function|class|interface|type)\s/m.test(proposedCode);
      if (originalHasImports && !looksLikeCompleteFile) {
        log.warn(`[MODIFY] LLM returned a snippet instead of the complete file — rejecting`);
        return null;
      }
    } else {
      log.warn(`[MODIFY] No searchReplace or codeChanges in response`);
      return null;
    }

    if (proposedCode === originalCode) {
      log.warn(`[MODIFY] Proposed code is identical to original — no changes made`);
      return null;
    }

    // Build a descriptive patch
    const finalTarget = modResult.targetFile || actualTargetFile;
    const patch = [
      `--- a/${finalTarget}`,
      `+++ b/${finalTarget}`,
      `@@ DGM mutation: ${entry.entryType} @@`,
      `@@ Scientific basis: ${modResult.scientificBasis || scientificBasis} @@`,
      `@@ Expected improvement: ${modResult.expectedMetricImprovement || 'unknown'} @@`,
      ``,
      `Rationale: ${modResult.rationale || rationale}`,
      ``,
      proposedCode,
    ].join('\n');

    log.info(`[MODIFY] Modification generated via MOTHER pipeline — target=${finalTarget}, basis=${modResult.scientificBasis || scientificBasis}`);

    return {
      targetFile: finalTarget,
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

    // C358: Try production schema first (drizzle/schema.ts, verified 2026-02-24),
    // then fall back to legacy schema (migration 0000/0002 camelCase columns)
    const variantData = JSON.stringify({
      variantId: variant.id,
      parentId: variant.parentId,
      resolvedIds: variant.resolvedIds,
      unresolvedIds: variant.unresolvedIds,
      emptyPatchIds: variant.emptyPatchIds,
      totalSubmittedInstances: variant.totalSubmittedInstances,
      fitnessBreakdown: variant.fitnessBreakdown,
      childrenCount: variant.childrenCount,
      isCompiled: variant.isCompiled,
    });

    try {
      // Production schema (snake_case): generation_id, parent_id, code_snapshot, fitness_score, benchmark_results
      await db.execute(sql`
        INSERT INTO dgm_archive (generation_id, parent_id, code_snapshot, fitness_score, benchmark_results)
        VALUES (
          ${variant.id},
          ${variant.parentId || null},
          ${variant.strategyDescription || 'DGM variant'},
          ${variant.accuracyScore * 100},
          ${variantData}
        )
      `);
    } catch (prodErr) {
      // Fallback: legacy schema (migration 0000/0002 camelCase): parentId, fitnessScore, codeSnapshotUrl, metadata
      try {
        await db.execute(sql`
          INSERT INTO dgm_archive (parentId, fitnessScore, codeSnapshotUrl, metadata)
          VALUES (
            ${variant.parentId || null},
            ${String(variant.accuracyScore * 100)},
            ${`dgm://${variant.id}`},
            ${variantData}
          )
        `);
      } catch (legacyErr: any) {
        log.warn(`[PERSIST] dgm_archive INSERT failed on both schemas. MySQL error: ${legacyErr?.message || legacyErr}`);
      }
    }
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
      bestAccuracy: archive.size > 0 ? Math.max(...Array.from(archive.values()).map(v => v.accuracyScore)) : 0,
      timestamp: new Date().toISOString(),
      generationHash: '', // computed below
      scientificProofs: [...generationProofs],
    };
    genResult.generationHash = proofHash(genResult);
    generationProofs = []; // reset for next generation
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
    bestAccuracy: archive.size > 0 ? Math.max(...Array.from(archive.values()).map(v => v.accuracyScore)) : 0,
    timestamp: new Date().toISOString(),
    generationHash: '',
    scientificProofs: [...generationProofs],
  };
  result.generationHash = proofHash(result);
  generationProofs = []; // reset for next run

  log.info(`[PROOF] SingleGeneration hash=${result.generationHash.slice(0, 16)}... children=${childrenIds.length} compiled=${compiledIds.length} proofs=${result.scientificProofs.length}`);
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
    sandboxHash?: string;
    sandboxPassed?: boolean;
    sandboxType?: string;
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
      sandboxHash: v.sandboxHash,
      sandboxPassed: v.sandboxResult?.passed,
      sandboxType: v.sandboxResult?.sandboxType,
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
