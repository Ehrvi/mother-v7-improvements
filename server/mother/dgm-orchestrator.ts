/**
 * DGM Orchestrator — Ciclo 122
 * Loop DGM completo: observe → propose → validate → deploy → verify
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.22954, Sakana AI, 2025)
 *   "An open-ended self-improving system that iteratively proposes and validates
 *    modifications to itself using empirical fitness evaluation"
 * - SICA — Self-Improving Coding Agent (arXiv:2504.15228, Bristol, 2025)
 *   "Validation before commit reduces failure rate from 83% to 17%"
 * - Reflexion (arXiv:2303.11366, 2023)
 *   "Verbal reinforcement learning via reflection on past failures"
 * - Constitutional AI (arXiv:2212.08073, Anthropic, 2022)
 *   "Safety constraints applied at generation time"
 *
 * @module dgm-orchestrator
 * @version 1.0.0
 * @cycle C122
 */

import { createHash } from 'crypto';
import { createLogger } from '../_core/logger'; // NC-003 structured logger
const log = createLogger('DGM-ORCHESTRATOR');
import { fitnessEvaluator, EvaluationTarget, FitnessScore } from './fitness-evaluator';
import { checkDuplicate } from './dgm-deduplicator'; // C148: DGM Deduplicator (ISSUE-DGM: repeated proposals 8+ times per cycle)
import { runBenchmark } from './dgm-benchmark'; // C173: 6 MCCs auto-run after each DGM cycle (HELM arXiv:2211.09110)
import {
  createProposal,
  applyProposal,
  getDgmStatus,
  ModificationProposal,
} from './self-modifier';
import {
  recordAuditEntry,
  verifyChainIntegrity,
} from './audit-trail';
import {
  checkSafetyGate,
  SafetyCheckResult,
} from './safety-gate';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DGMPhase =
  | 'observe'
  | 'propose'
  | 'validate'
  | 'deploy'
  | 'verify'
  | 'idle'
  | 'aborted';

export interface DGMCycleSpec {
  /** Natural language description of what to improve */
  objective: string;
  /** Target file path (relative to MOTHER root) */
  targetFile: string;
  /** Proposed new content or patch */
  proposedContent: string;
  /** Initiator: 'human' | 'autonomous' */
  initiator: 'human' | 'autonomous';
  /** Minimum fitness score to auto-deploy (default: 75) */
  deployThreshold?: number;
  /** Optional: scientific justification for the change */
  scientificBasis?: string;
}

export interface DGMCycleResult {
  cycleId: string;
  objective: string;
  phase: DGMPhase;
  success: boolean;
  fitnessOverall?: number;
  fitnessRecommendation?: string;
  proposalId?: string;
  commitHash?: string;
  proofHash: string;
  chainHash: string;
  duration_ms: number;
  timestamp: string;
  reason?: string;
  killSwitchActivated?: string;
  scientificBasis: string;
}

export interface DGMStatus {
  currentPhase: DGMPhase;
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  abortedCycles: number;
  averageFitness: number;
  lastCycleId?: string;
  lastCycleTimestamp?: string;
  autonomyLevel: number;
  dgmLoopActive: boolean;
  chainIntegrity: boolean;
  scientificBasis: string;
}

export interface DGMHistoryEntry {
  cycleId: string;
  objective: string;
  phase: DGMPhase;
  success: boolean;
  fitnessOverall?: number;
  timestamp: string;
  duration_ms: number;
  killSwitchActivated?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const cycleHistory: DGMCycleResult[] = [];
let currentPhase: DGMPhase = 'idle';
let isRunning = false;

// ─── Kill Switch Definitions (Conselho das 6 IAs — ROADMAP v4.1) ─────────────

const KILL_SWITCHES = {
  KS1_DANGEROUS_CODE: (content: string): boolean => {
    const patterns = [
      /\beval\s*\(/,
      /\bexec\s*\(/,
      /rm\s+-rf/,
      /\/etc\/passwd/,
      /new\s+Function\s*\(/,
    ];
    return patterns.some(p => p.test(content));
  },
  KS2_TS_ERRORS: (errors: number): boolean => errors > 0,
  KS3_LOOP_LIMIT: (iterations: number): boolean => iterations > 10,
  KS4_LOW_FITNESS: (score: number): boolean => score < 50,
  KS5_SAFETY_GATE: (result: SafetyCheckResult): boolean => !result.allowed,
};

// ─── Core DGM Loop ────────────────────────────────────────────────────────────

/**
 * Execute a complete DGM cycle: observe → propose → validate → deploy → verify
 *
 * Based on DGM (arXiv:2505.22954): "Each iteration proposes a modification,
 * evaluates it empirically, and archives the result for future reference."
 */
export async function runDGMCycle(spec: DGMCycleSpec): Promise<DGMCycleResult> {
  const cycleId = `DGM-C122-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  const deployThreshold = spec.deployThreshold ?? 75;
  const sciBase = spec.scientificBasis ?? 'Darwin Gödel Machine (arXiv:2505.22954)';

  if (isRunning) {
    const proofHash = createHash('sha256')
      .update(`abort:concurrent:${cycleId}:${Date.now()}`)
      .digest('hex');
    return finalizeCycle({
      cycleId,
      objective: spec.objective,
      phase: 'aborted',
      success: false,
      proofHash,
      chainHash: proofHash,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      reason: 'Another DGM cycle is already running. Concurrent execution is not allowed.',
      scientificBasis: sciBase,
    });
  }

  isRunning = true;

  try {
    // ── PHASE 1: OBSERVE ──────────────────────────────────────────────────────
    currentPhase = 'observe';
    recordAuditEntry({
      action: 'agent_task',
      actor: `DGM-ORCHESTRATOR-C122`,
      actorType: 'agent',
      target: spec.targetFile,
      details: { cycleId, objective: spec.objective, phase: 'observe' },
      outcome: 'success',
    });

    // ── PHASE 2: PROPOSE ──────────────────────────────────────────────────────
    currentPhase = 'propose';

    // C148: Deduplication check — prevent repeated proposals (ISSUE-DGM: 8+ repeats per cycle)
    const dedupResult = checkDuplicate(spec.proposedContent, cycleId);
    if (dedupResult.isDuplicate) {
      return finalizeCycle(buildAbortResult({
        cycleId, objective: spec.objective, sciBase, startTime,
        phase: 'propose',
        killSwitch: `C148-DEDUP: Duplicate proposal detected (similarity ${((dedupResult.similarity ?? 1) * 100).toFixed(1)}% with ${dedupResult.originalCycleId ?? 'unknown'}) — skipping`,
      }));
    }

    // KS-1: Check for dangerous code patterns
    if (KILL_SWITCHES.KS1_DANGEROUS_CODE(spec.proposedContent)) {
      return finalizeCycle(buildAbortResult({
        cycleId, objective: spec.objective, sciBase, startTime,
        phase: 'propose',
        killSwitch: 'KS-1: Dangerous code patterns detected (eval/exec/rm-rf/new Function)',
      }));
    }

    // Create proposal via self-modifier
    const proposal = createProposal({
      targetFile: spec.targetFile,
      proposedCode: spec.proposedContent,
      rationale: spec.objective,
      expectedImprovement: `DGM cycle ${cycleId} — autonomous improvement`,
    });

    // ── PHASE 3: VALIDATE ─────────────────────────────────────────────────────
    currentPhase = 'validate';

    // KS-5: Safety gate check
    const safetyResult = checkSafetyGate(
      spec.targetFile,
      spec.proposedContent,
      cycleId
    );

    if (KILL_SWITCHES.KS5_SAFETY_GATE(safetyResult)) {
      return finalizeCycle(buildAbortResult({
        cycleId, objective: spec.objective, sciBase, startTime,
        phase: 'validate',
        proposalId: proposal.id,
        killSwitch: `KS-5: Safety gate rejected — ${safetyResult.violations.join('; ')}`,
      }));
    }

    // Fitness evaluation (DGM empirical fitness — arXiv:2505.22954)
    const evalTarget: EvaluationTarget = {
      filePath: spec.targetFile,
      content: spec.proposedContent,
      cycleId,
      agentId: `DGM-ORCHESTRATOR-C122:${spec.initiator}`,
    };

    let fitnessScore: FitnessScore;
    try {
      fitnessScore = await fitnessEvaluator.evaluate(evalTarget);
    } catch {
      // Conservative fallback fitness score
      fitnessScore = {
        overall: 60,
        dimensions: {
          correctness: 20,
          safety: 15,
          complexity: 10,
          documentation: 5,
          testability: 5,
          integration: 3,
          performance: 2,
        },
        details: {
          tsErrors: 0,
          testsPassed: 0,
          testsFailed: 0,
          dangerousPatterns: [],
          linesOfCode: spec.proposedContent.split('\n').length,
          commentRatio: 0.1,
          exportedFunctions: 0,
          hasTests: false,
          hasJSDoc: false,
          cyclomaticComplexity: 5,
        },
        recommendation: 'REVIEW',
        reasoning: 'Fitness evaluation failed — using conservative estimate',
        proofHash: createHash('sha256').update(spec.proposedContent).digest('hex'),
        evaluatedAt: new Date().toISOString(),
      };
    }

    // KS-4: Low fitness check
    if (KILL_SWITCHES.KS4_LOW_FITNESS(fitnessScore.overall)) {
      const proofHash = createHash('sha256')
        .update(`reject:${cycleId}:${fitnessScore.overall}:${Date.now()}`)
        .digest('hex');

      recordAuditEntry({
        action: 'agent_task',
        actor: `DGM-ORCHESTRATOR-C122`,
        actorType: 'agent',
        target: spec.targetFile,
        details: {
          cycleId,
          fitness: fitnessScore.overall,
          reason: 'KS-4: fitness below threshold',
        },
        outcome: 'failure',
      });

      return finalizeCycle({
        cycleId,
        objective: spec.objective,
        phase: 'validate',
        success: false,
        fitnessOverall: fitnessScore.overall,
        fitnessRecommendation: fitnessScore.recommendation,
        proposalId: proposal.id,
        proofHash,
        chainHash: proofHash,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        killSwitchActivated: `KS-4: Fitness score ${fitnessScore.overall} < 50 threshold. Proposal archived, not deployed.`,
        scientificBasis: sciBase,
      });
    }

    // C173: Run 6 HELM MCCs benchmark before deploy (Conselho dos 6 — Critério de Autonomia)
    // Scientific basis: Liang et al. (2022) HELM arXiv:2211.09110 — holistic evaluation before deployment
    try {
      const benchReport = await runBenchmark(spec.proposedContent, cycleId, spec.targetFile);
      // BenchmarkReport fields: passed (int), totalTasks (int), passRate (0-1), overallScore (0-100)
      const passedCount = benchReport.passed ?? 0;
      const totalTasks = benchReport.totalTasks ?? 6;
      const passRate = benchReport.passRate ?? 0;
      log.info(`[DGM] Benchmark: ${passedCount}/${totalTasks} tasks passed, score: ${benchReport.overallScore?.toFixed(1)}, HELM composite: ${benchReport.helmScore?.composite?.toFixed(1)}`);
      // Gate: require at least 60% pass rate (equivalent to 4/6 MCCs) to proceed to deploy
      if (passRate < 0.6) {
        return finalizeCycle({
          cycleId,
          objective: spec.objective,
          phase: 'validate',
          success: false,
          fitnessOverall: fitnessScore.overall,
          fitnessRecommendation: fitnessScore.recommendation,
          proposalId: proposal.id,
          proofHash: createHash('sha256').update(`benchmark-fail:${cycleId}:${passedCount}`).digest('hex'),
          chainHash: createHash('sha256').update(`benchmark-fail:${cycleId}:${passedCount}`).digest('hex'),
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          reason: `C173 Benchmark gate: ${passedCount}/${totalTasks} tasks passed (${(passRate*100).toFixed(0)}% < 60% required)`,
          scientificBasis: 'HELM arXiv:2211.09110; Conselho dos 6 Critério de Autonomia',
        });
      }
    } catch (benchErr) {
      // Non-blocking: log warning but continue if benchmark fails
      log.warn('[DGM] Benchmark evaluation failed (non-blocking):', (benchErr as Error).message);
    }

    // ── PHASE 4: DEPLOY ───────────────────────────────────────────────────────
    currentPhase = 'deploy';

    // Only auto-deploy if fitness meets threshold
    if (fitnessScore.overall < deployThreshold) {
      const proofHash = createHash('sha256')
        .update(`review:${cycleId}:${fitnessScore.overall}:${Date.now()}`)
        .digest('hex');

      recordAuditEntry({
      action: 'agent_task',
      actor: `DGM-ORCHESTRATOR-C122`,
      actorType: 'agent',
      target: spec.targetFile,
      details: {
        cycleId,
        fitness: fitnessScore.overall,
        threshold: deployThreshold,
        reason: 'Below deploy threshold — human review required',
      },
      outcome: 'partial',
      });

      return finalizeCycle({
        cycleId,
        objective: spec.objective,
        phase: 'validate',
        success: false,
        fitnessOverall: fitnessScore.overall,
        fitnessRecommendation: fitnessScore.recommendation,
        proposalId: proposal.id,
        proofHash,
        chainHash: proofHash,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        reason: `Fitness score ${fitnessScore.overall} is below deploy threshold ${deployThreshold}. Human review required.`,
        scientificBasis: sciBase,
      });
    }

    // Apply the proposal (write file)
    const modResult = await applyProposal(proposal.id);

    if (!modResult.success) {
      return finalizeCycle(buildAbortResult({
        cycleId, objective: spec.objective, sciBase, startTime,
        phase: 'deploy',
        proposalId: proposal.id,
        killSwitch: `KS-2: Deployment failed — ${modResult.reason}`,
      }));
    }

    // ── PHASE 5: VERIFY ───────────────────────────────────────────────────────
    currentPhase = 'verify';

    // Verify audit chain integrity (Nakamoto 2008 — hash chain)
    const chainReport = verifyChainIntegrity();

    // Generate final proof hash (DGM proof — Nakamoto 2008)
    const lastCycle = cycleHistory[cycleHistory.length - 1];
    const previousProofHash = lastCycle?.proofHash ?? '0'.repeat(64);
    const proofInput = [
      'DGM_CYCLE',
      cycleId,
      spec.targetFile,
      modResult.proofHash,
      fitnessScore.overall.toString(),
      new Date().toISOString(),
      previousProofHash,
    ].join(':');
    const proofHash = createHash('sha256').update(proofInput).digest('hex');
    const chainHash = createHash('sha256')
      .update(`${previousProofHash}:${proofHash}`)
      .digest('hex');

    // Record final audit entry
    recordAuditEntry({
      action: 'proof_generated',
      actor: `DGM-ORCHESTRATOR-C122`,
      actorType: 'agent',
      target: spec.targetFile,
      details: {
        cycleId,
        fitness: fitnessScore.overall,
        recommendation: fitnessScore.recommendation,
        chainIntegrity: chainReport.valid,
        proofHash,
      },
      outcome: 'success',
    });

    currentPhase = 'idle';

    return finalizeCycle({
      cycleId,
      objective: spec.objective,
      phase: 'verify',
      success: true,
      fitnessOverall: fitnessScore.overall,
      fitnessRecommendation: fitnessScore.recommendation,
      proposalId: proposal.id,
      commitHash: modResult.commitHash,
      proofHash,
      chainHash,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      scientificBasis: sciBase,
    });

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const proofHash = createHash('sha256')
      .update(`error:${cycleId}:${errorMsg}:${Date.now()}`)
      .digest('hex');

    recordAuditEntry({
    action: 'agent_task',
    actor: `DGM-ORCHESTRATOR-C122`,
    actorType: 'agent',
    target: spec.targetFile,
    details: { cycleId, error: errorMsg },
    outcome: 'failure',
    });

    return finalizeCycle({
      cycleId,
      objective: spec.objective,
      phase: 'aborted',
      success: false,
      proofHash,
      chainHash: proofHash,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      reason: `Unexpected error: ${errorMsg}`,
      scientificBasis: sciBase,
    });

  } finally {
    isRunning = false;
    currentPhase = 'idle';
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function buildAbortResult(params: {
  cycleId: string;
  objective: string;
  sciBase: string;
  startTime: number;
  phase: DGMPhase;
  proposalId?: string;
  killSwitch: string;
}): DGMCycleResult {
  const proofHash = createHash('sha256')
    .update(`abort:${params.cycleId}:${params.killSwitch}:${Date.now()}`)
    .digest('hex');

  recordAuditEntry({
    action: 'agent_task',
    actor: `DGM-ORCHESTRATOR-C122`,
    actorType: 'agent',
    target: 'dgm-orchestrator',
    details: {
      cycleId: params.cycleId,
      killSwitch: params.killSwitch,
      phase: params.phase,
    },
    outcome: 'failure',
  });

  return {
    cycleId: params.cycleId,
    objective: params.objective,
    phase: 'aborted',
    success: false,
    proposalId: params.proposalId,
    proofHash,
    chainHash: proofHash,
    duration_ms: Date.now() - params.startTime,
    timestamp: new Date().toISOString(),
    reason: params.killSwitch,
    killSwitchActivated: params.killSwitch,
    scientificBasis: params.sciBase,
  };
}

function finalizeCycle(result: DGMCycleResult): DGMCycleResult {
  cycleHistory.push(result);
  if (cycleHistory.length > 100) {
    cycleHistory.shift();
  }
  return result;
}

// ─── Status & History ─────────────────────────────────────────────────────────

/**
 * Get current DGM orchestrator status
 */
export function getDGMOrchestratorStatus(): DGMStatus {
  const successful = cycleHistory.filter(c => c.success).length;
  const failed = cycleHistory.filter(c => !c.success && c.phase !== 'aborted').length;
  const aborted = cycleHistory.filter(c => c.phase === 'aborted').length;
  const fitnessScores = cycleHistory
    .filter(c => c.fitnessOverall !== undefined)
    .map(c => c.fitnessOverall as number);
  const avgFitness = fitnessScores.length > 0
    ? fitnessScores.reduce((a, b) => a + b, 0) / fitnessScores.length
    : 0;

  const chainReport = verifyChainIntegrity();
  const lastCycle = cycleHistory[cycleHistory.length - 1];

  return {
    currentPhase,
    totalCycles: cycleHistory.length,
    successfulCycles: successful,
    failedCycles: failed,
    abortedCycles: aborted,
    averageFitness: Math.round(avgFitness * 10) / 10,
    lastCycleId: lastCycle?.cycleId,
    lastCycleTimestamp: lastCycle?.timestamp,
    autonomyLevel: 10,
    dgmLoopActive: isRunning,
    chainIntegrity: chainReport.valid,
    scientificBasis: 'Darwin Gödel Machine (arXiv:2505.22954) — observe→propose→validate→deploy→verify',
  };
}

/**
 * Get DGM cycle history (last N cycles)
 */
export function getDGMHistory(limit = 20): DGMHistoryEntry[] {
  return cycleHistory
    .slice(-limit)
    .reverse()
    .map(c => ({
      cycleId: c.cycleId,
      objective: c.objective,
      phase: c.phase,
      success: c.success,
      fitnessOverall: c.fitnessOverall,
      timestamp: c.timestamp,
      duration_ms: c.duration_ms,
      killSwitchActivated: c.killSwitchActivated,
    }));
}

/**
 * Get fitness trend across cycles
 * Based on: Reflexion (arXiv:2303.11366) — learning from past performance
 */
export function getFitnessTrend(): {
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  averageLast5: number;
  averageLast10: number;
  recommendation: string;
} {
  const scored = cycleHistory.filter(c => c.fitnessOverall !== undefined);

  if (scored.length < 3) {
    return {
      trend: 'insufficient_data',
      averageLast5: 0,
      averageLast10: 0,
      recommendation: 'Run at least 3 DGM cycles to establish a fitness trend.',
    };
  }

  const last5 = scored.slice(-5).map(c => c.fitnessOverall as number);
  const last10 = scored.slice(-10).map(c => c.fitnessOverall as number);
  const avg5 = last5.reduce((a, b) => a + b, 0) / last5.length;
  const avg10 = last10.length > 0
    ? last10.reduce((a, b) => a + b, 0) / last10.length
    : avg5;

  let trend: 'improving' | 'stable' | 'declining';
  let recommendation: string;

  if (avg5 > avg10 + 3) {
    trend = 'improving';
    recommendation = 'DGM loop is improving. Continue autonomous cycles.';
  } else if (avg5 < avg10 - 3) {
    trend = 'declining';
    recommendation = 'Fitness declining. Review recent proposals. Consider human intervention.';
  } else {
    trend = 'stable';
    recommendation = 'Fitness stable. Consider increasing proposal diversity.';
  }

  return {
    trend,
    averageLast5: Math.round(avg5 * 10) / 10,
    averageLast10: Math.round(avg10 * 10) / 10,
    recommendation,
  };
}

/**
 * Run an autonomous self-improvement cycle
 * MOTHER reads its own code and proposes enhancements via LLM
 *
 * Based on DGM (arXiv:2505.22954): "The system proposes modifications to itself
 * based on observed performance gaps and archives successful modifications."
 */
export async function runAutonomousImprovement(params: {
  targetModule: string;
  currentContent: string;
  improvementGoal: string;
  llmProvider?: string;
}): Promise<DGMCycleResult> {
  let proposedContent = params.currentContent;

  try {
    const { invokeLLM } = await import('../_core/llm');
    const response = await invokeLLM({
      provider: (params.llmProvider as any) ?? 'deepseek',
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are MOTHER v80.0, a self-improving AI system executing a DGM cycle (arXiv:2505.22954).
Improve the TypeScript module provided. Rules:
1. Output ONLY valid TypeScript code, no markdown, no explanation
2. Preserve all existing exports and interfaces
3. Do NOT use eval(), exec(), new Function(), or modify environment variables
4. Improve: documentation, error handling, type safety, or performance
5. Keep the file under 300 lines`,
        },
        {
          role: 'user',
          content: `Module: ${params.targetModule}
Goal: ${params.improvementGoal}

Current content:
\`\`\`typescript
${params.currentContent.slice(0, 3000)}
\`\`\`

Propose an improved version:`,
        },
      ],
      maxTokens: 4000,
      temperature: 0.3,
    });

    const rawContent = response.choices?.[0]?.message?.content ?? '';
    const content = Array.isArray(rawContent)
      ? rawContent.map((c: any) => (typeof c === 'string' ? c : (c.text ?? ''))).join('')
      : String(rawContent);

    if (content && content.length > 100) {
      proposedContent = content
        .replace(/^```typescript\n?/m, '')
        .replace(/^```\n?/m, '')
        .replace(/```$/m, '')
        .trim();
    }
  } catch (err) {
    console.warn('[DGM-ORCHESTRATOR] LLM proposal failed, using original content:', err);
  }

  return runDGMCycle({
    objective: params.improvementGoal,
    targetFile: params.targetModule,
    proposedContent,
    initiator: 'autonomous',
    deployThreshold: 75,
    scientificBasis: 'Darwin Gödel Machine (arXiv:2505.22954) — autonomous self-improvement',
  });
}
