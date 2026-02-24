/**
 * MOTHER v44.0: Real Fitness Scorer
 *
 * Implements a multi-dimensional fitness scoring system for the DGM evolutionary loop.
 *
 * Scientific basis:
 *   - Darwin Gödel Machine (Zhang et al., arXiv:2505.22954) — fitness-based selection
 *   - SWE-bench (Jimenez et al., arXiv:2310.06770) — code quality benchmarking
 *   - AgentBench (Liu et al., arXiv:2308.03688) — agent capability evaluation
 *   - HumanEval (Chen et al., arXiv:2107.03374) — functional correctness
 *
 * Fitness Dimensions (5-dimensional vector, weighted sum → scalar [0,1]):
 *
 *   F = w1*correctness + w2*efficiency + w3*robustness + w4*maintainability + w5*novelty
 *
 *   Where:
 *     correctness    (w=0.35): Does the code execute correctly? Are tests passing?
 *     efficiency     (w=0.20): Execution time, memory usage, algorithmic complexity
 *     robustness     (w=0.20): Error handling, edge cases, type safety
 *     maintainability(w=0.15): Code quality, documentation, structure
 *     novelty        (w=0.10): Semantic distance from parent generation (DGM-specific)
 *
 * This replaces the synthetic score (random 0.3-0.9) with empirically measurable metrics.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getDb } from "../db";
import { dgmArchive } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getEmbedding, cosineSimilarity } from "./embeddings";

// ─── Weights (sum = 1.0) ──────────────────────────────────────────────────────
const WEIGHTS = {
  correctness: 0.35,
  efficiency: 0.20,
  robustness: 0.20,
  maintainability: 0.15,
  novelty: 0.10,
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FitnessBreakdown {
  correctness: number;
  efficiency: number;
  robustness: number;
  maintainability: number;
  novelty: number;
  finalScore: number;
  label: "EXCELLENT" | "GOOD" | "ACCEPTABLE" | "POOR";
  details: Record<string, unknown>;
}

// ─── Dimension 1: Correctness ─────────────────────────────────────────────────
/**
 * Measures functional correctness via execution in sandbox.
 * Score components:
 *   - Execution success (0.6): Does the code run without throwing?
 *   - Output validity (0.4): Is the output non-empty and non-error?
 */
export function scoreCorrectness(
  executionSuccess: boolean,
  executionOutput: string,
  executionTimeMs: number
): number {
  const executionBase = executionSuccess ? 0.6 : 0.0;
  const outputValid = executionOutput && executionOutput.length > 0
    && !executionOutput.toLowerCase().includes("error")
    && !executionOutput.toLowerCase().includes("exception")
    ? 0.4 : 0.0;
  return executionBase + outputValid;
}

// ─── Dimension 2: Efficiency ──────────────────────────────────────────────────
/**
 * Measures execution efficiency.
 * Score components:
 *   - Execution time (0.5): < 100ms = 1.0, < 500ms = 0.7, < 2000ms = 0.4, else 0.1
 *   - Code density (0.3): Lines of code vs. functionality ratio
 *   - No busy loops (0.2): Absence of while(true), infinite loops
 */
export function scoreEfficiency(
  executionTimeMs: number,
  codeLines: number,
  codeContent: string
): number {
  // Time score
  let timeScore: number;
  if (executionTimeMs < 100) timeScore = 1.0;
  else if (executionTimeMs < 500) timeScore = 0.7;
  else if (executionTimeMs < 2000) timeScore = 0.4;
  else timeScore = 0.1;

  // Code density (penalize extremely long or extremely short code)
  let densityScore: number;
  if (codeLines >= 5 && codeLines <= 200) densityScore = 1.0;
  else if (codeLines > 200 && codeLines <= 500) densityScore = 0.7;
  else if (codeLines < 5) densityScore = 0.3;
  else densityScore = 0.4;

  // No busy loops
  const hasBusyLoop = /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(codeContent);
  const loopScore = hasBusyLoop ? 0.0 : 1.0;

  return 0.5 * timeScore + 0.3 * densityScore + 0.2 * loopScore;
}

// ─── Dimension 3: Robustness ──────────────────────────────────────────────────
/**
 * Measures error handling and type safety.
 * Score components:
 *   - TypeScript compilation (0.5): No type errors
 *   - Error handling (0.3): try/catch blocks present
 *   - Null safety (0.2): Optional chaining, null checks
 */
export function scoreRobustness(
  compilationSuccess: boolean,
  codeContent: string
): number {
  const compilationScore = compilationSuccess ? 0.5 : 0.0;

  // Error handling: count try/catch blocks
  const tryCatchCount = (codeContent.match(/try\s*\{/g) || []).length;
  const errorHandlingScore = tryCatchCount > 0 ? Math.min(0.3, tryCatchCount * 0.1) : 0.0;

  // Null safety: optional chaining (?.) and nullish coalescing (??)
  const optionalChaining = (codeContent.match(/\?\./g) || []).length;
  const nullishCoalescing = (codeContent.match(/\?\?/g) || []).length;
  const nullSafetyScore = (optionalChaining + nullishCoalescing) > 0 ? 0.2 : 0.0;

  return compilationScore + errorHandlingScore + nullSafetyScore;
}

// ─── Dimension 4: Maintainability ─────────────────────────────────────────────
/**
 * Measures code quality and documentation.
 * Score components:
 *   - Comments (0.3): JSDoc and inline comments
 *   - Function structure (0.3): Named functions, arrow functions
 *   - Naming conventions (0.2): camelCase, descriptive names
 *   - No magic numbers (0.2): Constants defined, not raw numbers
 */
export function scoreMaintainability(codeContent: string): number {
  // Comments
  const commentLines = (codeContent.match(/\/\/.*|\/\*[\s\S]*?\*\//g) || []).length;
  const totalLines = codeContent.split("\n").length;
  const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;
  const commentScore = Math.min(0.3, commentRatio * 1.5);

  // Function structure
  const namedFunctions = (codeContent.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(/g) || []).length;
  const functionScore = namedFunctions > 0 ? Math.min(0.3, namedFunctions * 0.05) : 0.0;

  // Naming conventions (camelCase or PascalCase identifiers)
  const camelCaseCount = (codeContent.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || []).length;
  const namingScore = camelCaseCount > 2 ? 0.2 : 0.0;

  // No magic numbers (penalize raw numbers > 10 that aren't 0, 1, 2)
  const magicNumbers = (codeContent.match(/\b(?!0\b|1\b|2\b)\d{2,}\b/g) || []).length;
  const magicScore = magicNumbers === 0 ? 0.2 : Math.max(0, 0.2 - magicNumbers * 0.02);

  return commentScore + functionScore + namingScore + magicScore;
}

// ─── Dimension 5: Novelty ─────────────────────────────────────────────────────
/**
 * Measures semantic novelty vs. parent generation (DGM-specific).
 * High novelty = exploration; Low novelty = exploitation.
 * Optimal range: 0.3-0.7 (neither too similar nor too different from parent).
 *
 * Score: bell curve centered at 0.5 semantic distance from parent.
 */
export async function scoreNovelty(
  codeContent: string,
  parentId: string | null
): Promise<number> {
  if (!parentId) return 0.5; // No parent = neutral novelty

  try {
    const db = await getDb();
    if (!db) return 0.5;

    const parentRows = await db.select({ codeSnapshot: dgmArchive.codeSnapshot })
      .from(dgmArchive)
      .where(eq(dgmArchive.generationId, parentId))
      .limit(1);

    if (!parentRows.length || !parentRows[0].codeSnapshot) return 0.5;

    const parentCode = parentRows[0].codeSnapshot;

    // Generate embeddings for both code snippets
    const [currentEmb, parentEmb] = await Promise.all([
      getEmbedding(codeContent.slice(0, 2000)),
      getEmbedding(parentCode.slice(0, 2000)),
    ]);

    const similarity = cosineSimilarity(currentEmb, parentEmb);
    const distance = 1 - similarity; // 0 = identical, 1 = completely different

    // Bell curve: optimal distance is 0.3-0.7
    // Score = 1.0 at distance=0.5, decreases toward 0 and 1
    const optimalDistance = 0.5;
    const spread = 0.25;
    const noveltyScore = Math.exp(-Math.pow(distance - optimalDistance, 2) / (2 * spread * spread));

    return Math.min(1.0, Math.max(0.0, noveltyScore));
  } catch {
    return 0.5; // Neutral on error
  }
}

// ─── Main Fitness Calculator ──────────────────────────────────────────────────
/**
 * Calculate the complete 5-dimensional fitness score.
 *
 * @param codeContent - The code to evaluate
 * @param executionResult - Result from sandbox execution
 * @param parentId - Parent generation ID for novelty calculation
 * @returns FitnessBreakdown with all dimensions and final score
 */
export async function calculateRealFitnessScore(
  codeContent: string,
  executionResult: {
    success: boolean;
    output: string;
    executionTimeMs: number;
  },
  parentId: string | null = null
): Promise<FitnessBreakdown> {
  const codeLines = codeContent.split("\n").length;

  // Run TypeScript compilation check
  let compilationSuccess = true;
  let compilationErrors = "";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mother-fitness-"));
  try {
    const codeFile = path.join(tmpDir, "check.ts");
    fs.writeFileSync(codeFile, codeContent);
    execSync(
      `cd "${tmpDir}" && npx --yes tsc --noEmit --strict --target ES2020 --module commonjs "${codeFile}" 2>&1`,
      { timeout: 15000, encoding: "utf8" }
    );
  } catch (e: any) {
    compilationSuccess = false;
    compilationErrors = (e.stdout || e.message || "").substring(0, 500);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  }

  // Calculate all dimensions
  const correctness = scoreCorrectness(
    executionResult.success,
    executionResult.output,
    executionResult.executionTimeMs
  );

  const efficiency = scoreEfficiency(
    executionResult.executionTimeMs,
    codeLines,
    codeContent
  );

  const robustness = scoreRobustness(compilationSuccess, codeContent);

  const maintainability = scoreMaintainability(codeContent);

  const novelty = await scoreNovelty(codeContent, parentId);

  // Weighted sum
  const finalScore = Math.min(1.0, Math.max(0.0,
    WEIGHTS.correctness * correctness +
    WEIGHTS.efficiency * efficiency +
    WEIGHTS.robustness * robustness +
    WEIGHTS.maintainability * maintainability +
    WEIGHTS.novelty * novelty
  ));

  const label: FitnessBreakdown["label"] =
    finalScore >= 0.85 ? "EXCELLENT" :
    finalScore >= 0.70 ? "GOOD" :
    finalScore >= 0.50 ? "ACCEPTABLE" : "POOR";

  return {
    correctness,
    efficiency,
    robustness,
    maintainability,
    novelty,
    finalScore,
    label,
    details: {
      executionSuccess: executionResult.success,
      executionTimeMs: executionResult.executionTimeMs,
      codeLines,
      compilationSuccess,
      compilationErrors: compilationErrors || null,
      weights: WEIGHTS,
    },
  };
}

// ─── Fitness Score Summary ────────────────────────────────────────────────────
export function formatFitnessReport(breakdown: FitnessBreakdown): string {
  return [
    `Fitness Score: ${breakdown.finalScore.toFixed(4)} [${breakdown.label}]`,
    `  ├─ Correctness    (35%): ${breakdown.correctness.toFixed(3)}`,
    `  ├─ Efficiency     (20%): ${breakdown.efficiency.toFixed(3)}`,
    `  ├─ Robustness     (20%): ${breakdown.robustness.toFixed(3)}`,
    `  ├─ Maintainability(15%): ${breakdown.maintainability.toFixed(3)}`,
    `  └─ Novelty        (10%): ${breakdown.novelty.toFixed(3)}`,
    `  Details: ${JSON.stringify(breakdown.details).slice(0, 200)}`,
  ].join("\n");
}
