/**
 * fitness-evaluator.ts — Calibrated DGM Fitness Evaluator
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.07983): fitness function drives self-improvement
 * - G-EVAL (arXiv:2303.16634): LLM-based evaluation with calibrated weights
 * - Conselho dos 6 IAs consensus: latência 30%, qualidade 35%, código 20%, testes 15%
 *
 * Calibration:
 * - Latency: P50 < 2s = 1.0, P50 < 5s = 0.7, P50 < 10s = 0.4, else 0.1
 * - Quality: G-EVAL score (0-1) using LLM judge
 * - Code: TypeScript compilation + ESLint score
 * - Tests: vitest pass rate
 */

import type { SandboxExecutionResult } from "./sandbox-executor.js";

export interface FitnessWeights {
  latency: number;   // 0.30
  quality: number;   // 0.35
  code: number;      // 0.20
  tests: number;     // 0.15
}

export interface FitnessEvaluationInput {
  /** The DGM proposal code */
  proposalCode: string;
  /** Execution result from sandbox */
  executionResult: SandboxExecutionResult;
  /** Latency measurements (ms) for recent responses */
  latencyMeasurementsMs: number[];
  /** Quality score from G-EVAL (0-1), if available */
  qualityScore?: number;
  /** TypeScript compilation errors */
  tsErrors: number;
  /** ESLint errors */
  eslintErrors: number;
  /** Test results */
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface FitnessScore {
  /** Overall fitness score (0-1) */
  overall: number;
  /** Individual dimension scores */
  dimensions: {
    latency: number;
    quality: number;
    code: number;
    tests: number;
  };
  /** Weighted contributions */
  contributions: {
    latency: number;
    quality: number;
    code: number;
    tests: number;
  };
  /** Whether this proposal should be accepted */
  shouldAccept: boolean;
  /** Reason for accept/reject decision */
  reason: string;
  /** Detailed breakdown for audit */
  details: Record<string, unknown>;
}

export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  latency: 0.30,
  quality: 0.35,
  code: 0.20,
  tests: 0.15,
};

/**
 * FitnessEvaluator — evaluates DGM proposals using calibrated multi-dimensional scoring.
 *
 * Consensus from Conselho dos 6 IAs:
 * - Quality is the most important dimension (35%) — MOTHER must produce excellent output
 * - Latency is second (30%) — users expect fast responses
 * - Code quality (20%) — maintainability matters for self-improvement
 * - Tests (15%) — regression prevention
 */
export class FitnessEvaluator {
  private readonly weights: FitnessWeights;
  /** Minimum overall score to accept a proposal */
  private readonly acceptanceThreshold = 0.60;

  constructor(weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS) {
    // Validate weights sum to 1.0
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Fitness weights must sum to 1.0, got ${sum}`);
    }
    this.weights = weights;
  }

  /**
   * Evaluate a DGM proposal and return a calibrated fitness score.
   */
  evaluate(input: FitnessEvaluationInput): FitnessScore {
    const latencyScore = this.scoreLatency(input.latencyMeasurementsMs);
    const qualityScore = this.scoreQuality(input);
    const codeScore = this.scoreCode(input);
    const testScore = this.scoreTests(input.testResults);

    const dimensions = {
      latency: latencyScore,
      quality: qualityScore,
      code: codeScore,
      tests: testScore,
    };

    const contributions = {
      latency: latencyScore * this.weights.latency,
      quality: qualityScore * this.weights.quality,
      code: codeScore * this.weights.code,
      tests: testScore * this.weights.tests,
    };

    const overall =
      contributions.latency +
      contributions.quality +
      contributions.code +
      contributions.tests;

    const shouldAccept = overall >= this.acceptanceThreshold;
    const reason = this.generateReason(overall, dimensions, shouldAccept);

    return {
      overall: Math.round(overall * 1000) / 1000,
      dimensions,
      contributions,
      shouldAccept,
      reason,
      details: {
        weights: this.weights,
        acceptanceThreshold: this.acceptanceThreshold,
        executionSuccess: input.executionResult.success,
        executionDurationMs: input.executionResult.durationMs,
        latencyP50Ms: this.percentile(input.latencyMeasurementsMs, 50),
        latencyP95Ms: this.percentile(input.latencyMeasurementsMs, 95),
        tsErrors: input.tsErrors,
        eslintErrors: input.eslintErrors,
        codeLength: input.proposalCode.length,
      },
    };
  }

  /**
   * Score latency dimension.
   * Calibration: P50 < 2s = 1.0, < 5s = 0.7, < 10s = 0.4, else 0.1
   */
  private scoreLatency(measurements: number[]): number {
    if (measurements.length === 0) return 0.5; // No data — neutral score

    const p50 = this.percentile(measurements, 50);

    if (p50 < 2_000) return 1.0;
    if (p50 < 5_000) return 0.7;
    if (p50 < 10_000) return 0.4;
    return 0.1;
  }

  /**
   * Score quality dimension.
   * Uses G-EVAL score if available, otherwise estimates from execution result.
   */
  private scoreQuality(input: FitnessEvaluationInput): number {
    // If G-EVAL score provided, use it directly
    if (input.qualityScore !== undefined) {
      return Math.max(0, Math.min(1, input.qualityScore));
    }

    // Estimate quality from execution result
    if (!input.executionResult.success) return 0.1;

    // Penalize for stderr output (warnings/errors)
    const stderrPenalty = input.executionResult.stderr.length > 0 ? 0.1 : 0;

    // Base quality from successful execution
    return Math.max(0.1, 0.7 - stderrPenalty);
  }

  /**
   * Score code quality dimension.
   * Based on TypeScript errors and ESLint violations.
   */
  private scoreCode(input: FitnessEvaluationInput): number {
    // TypeScript errors are critical — each one reduces score significantly
    const tsScore = Math.max(0, 1.0 - input.tsErrors * 0.2);

    // ESLint errors are less critical — each one reduces score slightly
    const eslintScore = Math.max(0, 1.0 - input.eslintErrors * 0.05);

    // Execution failure is a hard penalty
    const executionBonus = input.executionResult.success ? 0.1 : -0.3;

    return Math.max(0, Math.min(1, (tsScore + eslintScore) / 2 + executionBonus));
  }

  /**
   * Score test dimension.
   * Based on test pass rate.
   */
  private scoreTests(testResults?: FitnessEvaluationInput["testResults"]): number {
    if (!testResults || testResults.total === 0) return 0.5; // No tests — neutral

    const passRate = testResults.passed / testResults.total;
    return Math.round(passRate * 1000) / 1000;
  }

  /**
   * Generate a human-readable reason for the accept/reject decision.
   */
  private generateReason(
    overall: number,
    dimensions: FitnessScore["dimensions"],
    shouldAccept: boolean
  ): string {
    const parts: string[] = [];

    if (shouldAccept) {
      parts.push(`✅ ACEITO (score=${overall.toFixed(3)})`);
    } else {
      parts.push(`❌ REJEITADO (score=${overall.toFixed(3)} < threshold=${this.acceptanceThreshold})`);
    }

    // Identify weak dimensions
    const weakDimensions = Object.entries(dimensions)
      .filter(([, score]) => score < 0.5)
      .map(([dim, score]) => `${dim}=${score.toFixed(2)}`);

    if (weakDimensions.length > 0) {
      parts.push(`Dimensões fracas: ${weakDimensions.join(", ")}`);
    }

    // Identify strong dimensions
    const strongDimensions = Object.entries(dimensions)
      .filter(([, score]) => score >= 0.8)
      .map(([dim, score]) => `${dim}=${score.toFixed(2)}`);

    if (strongDimensions.length > 0) {
      parts.push(`Dimensões fortes: ${strongDimensions.join(", ")}`);
    }

    return parts.join(" | ");
  }

  /**
   * Calculate the nth percentile of an array of numbers.
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Compare two fitness scores and return the better one.
   * Used by DGM to decide if a proposal improves over baseline.
   */
  compare(
    baseline: FitnessScore,
    proposal: FitnessScore
  ): { improved: boolean; delta: number; reason: string } {
    const delta = proposal.overall - baseline.overall;
    const improved = delta > 0.01; // Minimum 1% improvement required

    return {
      improved,
      delta: Math.round(delta * 1000) / 1000,
      reason: improved
        ? `Proposal improves by ${(delta * 100).toFixed(1)}% (${baseline.overall.toFixed(3)} → ${proposal.overall.toFixed(3)})`
        : `No significant improvement (delta=${(delta * 100).toFixed(1)}%)`,
    };
  }
}

// Singleton instance with consensus weights from Conselho dos 6 IAs
export const fitnessEvaluator = new FitnessEvaluator(DEFAULT_FITNESS_WEIGHTS);
