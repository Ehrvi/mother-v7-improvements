/**
 * fitness-evaluator.ts — Calibrated DGM Fitness Evaluator
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 * C224 | Conselho v98 | 2026-03-10 — Added UX dimension
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.07983): fitness function drives self-improvement
 * - G-EVAL (arXiv:2303.16634): LLM-based evaluation with calibrated weights
 * - Conselho v98 consensus C224: latência 25%, qualidade 35%, código 20%, testes 10%, ux 10%
 * - Diagnóstico UX/UI Chain 2: DGM otimizava métricas técnicas sem considerar experiência do usuário
 * - Nielsen (1994): usability is a quality attribute — must be measured and optimized
 * - ISO 9241-11 (2018): usability = efetividade + eficiência + satisfação
 *
 * Calibration:
 * - Latency: P50 < 2s = 1.0, P50 < 5s = 0.7, P50 < 10s = 0.4, else 0.1
 * - Quality: G-EVAL score (0-1) using LLM judge
 * - Code: TypeScript compilation + ESLint score
 * - Tests: vitest pass rate
 * - UX: presence of user-facing improvements (error messages, accessibility, navigation)
 */

import type { SandboxExecutionResult } from "./sandbox-executor.js";

export interface FitnessWeights {
  latency: number;   // 0.25 (C224: 0.30 → 0.25)
  quality: number;   // 0.35
  code: number;      // 0.20
  tests: number;     // 0.10 (C224: 0.15 → 0.10)
  ux: number;        // 0.10 (C224: NEW — user experience dimension)
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
  /**
   * C224: UX score (0-1) — presence of user-facing improvements.
   * Heuristics: error messages in PT-BR, accessibility fixes, navigation improvements,
   * terminology simplification, onboarding elements.
   * Scientific basis: Nielsen (1994) 10 heuristics; ISO 9241-11 (2018)
   */
  uxScore?: number;
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
    ux: number;  // C224
  };
  /** Weighted contributions */
  contributions: {
    latency: number;
    quality: number;
    code: number;
    tests: number;
    ux: number;  // C224
  };
  /** Whether this proposal should be accepted */
  shouldAccept: boolean;
  /** Reason for accept/reject decision */
  reason: string;
  /** Detailed breakdown for audit */
  details: Record<string, unknown>;
}

// C224: Rebalanced weights to include UX dimension
// Scientific basis: Diagnóstico UX/UI (Conselho v98, 2026-03-10)
// DGM estava otimizando métricas técnicas sem considerar experiência do usuário
export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  latency: 0.25,  // C224: 0.30 → 0.25 (reduzido para acomodar UX)
  quality: 0.35,  // mantido — qualidade é a dimensão mais importante
  code: 0.20,     // mantido — manutenibilidade para auto-melhoria
  tests: 0.10,    // C224: 0.15 → 0.10 (reduzido para acomodar UX)
  ux: 0.10,       // C224: NOVO — experiência do usuário (Nielsen 1994, ISO 9241-11)
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
    const uxScore = this.scoreUX(input);  // C224: UX dimension

    const dimensions = {
      latency: latencyScore,
      quality: qualityScore,
      code: codeScore,
      tests: testScore,
      ux: uxScore,  // C224
    };

    const contributions = {
      latency: latencyScore * this.weights.latency,
      quality: qualityScore * this.weights.quality,
      code: codeScore * this.weights.code,
      tests: testScore * this.weights.tests,
      ux: uxScore * (this.weights.ux ?? 0.10),  // C224
    };

    const overall =
      contributions.latency +
      contributions.quality +
      contributions.code +
      contributions.tests +
      contributions.ux;  // C224

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
   * C224: Score UX dimension.
   * Detects user-facing improvements in the proposal code.
   * Scientific basis: Nielsen (1994) 10 heuristics; ISO 9241-11 (2018)
   * Heuristics checked:
   *   - H1: Error messages in PT-BR (not English)
   *   - H4: Consistency (Lucide icons, not emojis)
   *   - H6: Recognition over recall (labels, tooltips)
   *   - H9: Error recovery (user-friendly messages)
   *   - H10: Help and documentation (onboarding)
   */
  private scoreUX(input: FitnessEvaluationInput): number {
    // If explicit UX score provided, use it
    if (input.uxScore !== undefined) {
      return Math.max(0, Math.min(1, input.uxScore));
    }

    // Heuristic detection from proposal code
    const code = input.proposalCode;
    let score = 0.5; // neutral baseline

    // H9: PT-BR error messages (not English)
    if (/[\u00C0-\u00FF]/.test(code) && /erro|falha|tente novamente|não foi possível/i.test(code)) score += 0.15;
    // H1: Accessibility improvements (WCAG, aria-label, contrast)
    if (/aria-label|wcag|contrast|acessibilidade/i.test(code)) score += 0.15;
    // H10: Onboarding or help elements
    if (/onboarding|tutorial|welcome|bem-vindo|primeiro acesso/i.test(code)) score += 0.10;
    // H4: Lucide icons (consistent design system)
    if (/from 'lucide-react'|lucide/.test(code)) score += 0.05;
    // H6: Labels and tooltips
    if (/tooltip|title=|placeholder=|aria-describedby/i.test(code)) score += 0.05;

    return Math.max(0, Math.min(1, score));
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
