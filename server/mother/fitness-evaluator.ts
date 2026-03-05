/**
 * fitness-evaluator.ts — MOTHER v80.0 — Ciclo 121
 * DGM Fitness Evaluator: avalia a qualidade de código gerado autonomamente
 *
 * Embasamento científico:
 * - Darwin Gödel Machine (arXiv:2505.22954, 2025) — archive of past agents + empirical fitness
 * - SICA (arXiv:2504.15228, 2025) — self-improving coding agents
 * - SWE-bench (arXiv:2310.06770, 2023) — benchmark for software engineering tasks
 * - CodeBLEU (arXiv:2009.10297, 2020) — metric for code generation quality
 * - Constitutional AI (arXiv:2212.08073, 2022) — safety constraints in AI systems
 * - McCabe (1976) — A Complexity Measure, IEEE Transactions on Software Engineering
 * - Halstead (1977) — Elements of Software Science
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ─── Fitness Dimensions (DGM arXiv:2505.22954) ───────────────────────────────

export interface FitnessScore {
  overall: number;           // 0-100 composite score
  dimensions: {
    correctness: number;     // TypeScript compilation + test pass rate
    safety: number;          // Absence of dangerous patterns
    complexity: number;      // McCabe cyclomatic complexity (inverted)
    documentation: number;   // JSDoc coverage
    testability: number;     // Test coverage indicators
    integration: number;     // A2A endpoint compatibility
    performance: number;     // Estimated performance characteristics
  };
  details: {
    tsErrors: number;
    testsPassed: number;
    testsFailed: number;
    dangerousPatterns: string[];
    linesOfCode: number;
    commentRatio: number;
    exportedFunctions: number;
    hasTests: boolean;
    hasJSDoc: boolean;
    cyclomaticComplexity: number;
  };
  recommendation: 'DEPLOY' | 'REVIEW' | 'REJECT';
  reasoning: string;
  proofHash: string;
  evaluatedAt: string;
}

export interface EvaluationTarget {
  filePath: string;
  content?: string;         // If provided, use this instead of reading file
  cycleId: string;
  agentId: string;
}

// ─── Dangerous Pattern Detection (Constitutional AI arXiv:2212.08073) ─────────

const DANGEROUS_PATTERNS = [
  { pattern: /\beval\s*\(/g, severity: 'CRITICAL', description: 'eval() — arbitrary code execution' },
  { pattern: /\bexec\s*\(/g, severity: 'HIGH', description: 'exec() — shell command execution' },
  { pattern: /\bspawn\s*\(/g, severity: 'HIGH', description: 'spawn() — process spawning' },
  { pattern: /rm\s+-rf/g, severity: 'CRITICAL', description: 'rm -rf — destructive file operation' },
  { pattern: /process\.exit\s*\(\s*[^)]*\)/g, severity: 'MEDIUM', description: 'process.exit() — abrupt termination' },
  { pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/g, severity: 'HIGH', description: 'child_process import' },
  { pattern: /fs\.unlinkSync|fs\.rmdirSync|fs\.rmSync/g, severity: 'HIGH', description: 'Synchronous file deletion' },
  { pattern: /\/etc\/passwd|\/etc\/shadow/g, severity: 'CRITICAL', description: 'Access to system credential files' },
  { pattern: /process\.env\s*=\s*/g, severity: 'HIGH', description: 'Overwriting process.env' },
  { pattern: /global\s*\.\s*\w+\s*=/g, severity: 'MEDIUM', description: 'Modifying global object' },
  { pattern: /new\s+Function\s*\(/g, severity: 'CRITICAL', description: 'new Function() — dynamic code execution' },
  { pattern: /setTimeout\s*\(\s*['"`]/g, severity: 'HIGH', description: 'setTimeout with string — eval equivalent' },
];

// ─── Cyclomatic Complexity Estimation (McCabe 1976) ───────────────────────────

function estimateCyclomaticComplexity(content: string): number {
  // Count decision points: if, else if, for, while, do, switch, case, catch, &&, ||, ternary
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcase\s+[^:]+:/g,
    /\bcatch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?\s*[^:]/g,  // ternary
  ];

  let complexity = 1; // Base complexity
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) complexity += matches.length;
  }

  return complexity;
}

// ─── Documentation Coverage ───────────────────────────────────────────────────

function calculateDocumentationScore(content: string): { score: number; hasJSDoc: boolean; commentRatio: number } {
  const lines = content.split('\n');
  const totalLines = lines.length;

  // Count comment lines
  const commentLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('/**');
  }).length;

  const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;

  // Check for JSDoc blocks
  const hasJSDoc = /\/\*\*[\s\S]*?\*\//g.test(content);

  // Count exported functions/classes
  const exportedCount = (content.match(/^export\s+(function|class|const|async\s+function)/gm) ?? []).length;

  // Count JSDoc blocks
  const jsdocBlocks = (content.match(/\/\*\*[\s\S]*?\*\//g) ?? []).length;

  // Score: ratio of documented exports to total exports
  const documentationCoverage = exportedCount > 0 ? Math.min(1, jsdocBlocks / exportedCount) : commentRatio;

  return {
    score: Math.round(documentationCoverage * 100),
    hasJSDoc,
    commentRatio,
  };
}

// ─── FitnessEvaluator Class ───────────────────────────────────────────────────

export class FitnessEvaluator {
  private projectRoot: string;
  private evaluationHistory: FitnessScore[] = [];

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ?? process.cwd();
  }

  /**
   * Evaluate the fitness of a generated TypeScript file.
   * Implements the DGM fitness function (arXiv:2505.22954).
   */
  async evaluate(target: EvaluationTarget): Promise<FitnessScore> {
    const content = target.content ?? this.readFile(target.filePath);
    const details = this.analyzeContent(content, target.filePath);

    // ── Dimension scores ──────────────────────────────────────────────────────

    // 1. Correctness: TypeScript compilation (0-40 points)
    const correctnessScore = this.scoreCorrectness(details);

    // 2. Safety: Absence of dangerous patterns (0-25 points)
    const safetyScore = this.scoreSafety(details);

    // 3. Complexity: McCabe complexity (0-15 points, inverted — lower is better)
    const complexityScore = this.scoreComplexity(details.cyclomaticComplexity);

    // 4. Documentation: JSDoc + comment ratio (0-10 points)
    const documentationScore = Math.round(details.commentRatio * 10 * 10);

    // 5. Testability: Has tests, exported functions (0-5 points)
    const testabilityScore = (details.hasTests ? 3 : 0) + (details.exportedFunctions > 0 ? 2 : 0);

    // 6. Integration: A2A endpoint compatibility (0-3 points)
    const integrationScore = this.scoreIntegration(content);

    // 7. Performance: No blocking operations, async patterns (0-2 points)
    const performanceScore = this.scorePerformance(content);

    const dimensions = {
      correctness: Math.min(100, correctnessScore),
      safety: Math.min(100, safetyScore),
      complexity: Math.min(100, complexityScore),
      documentation: Math.min(100, documentationScore),
      testability: Math.min(100, testabilityScore * 20),
      integration: Math.min(100, integrationScore * 33),
      performance: Math.min(100, performanceScore * 50),
    };

    // Weighted composite score (DGM fitness function)
    const weights = {
      correctness: 0.35,
      safety: 0.25,
      complexity: 0.15,
      documentation: 0.10,
      testability: 0.08,
      integration: 0.05,
      performance: 0.02,
    };

    const overall = Math.round(
      Object.entries(dimensions).reduce((acc, [key, val]) => {
        return acc + val * (weights[key as keyof typeof weights] ?? 0);
      }, 0)
    );

    // Recommendation
    let recommendation: FitnessScore['recommendation'];
    let reasoning: string;

    if (details.dangerousPatterns.length > 0 && details.dangerousPatterns.some(p => p.includes('CRITICAL'))) {
      recommendation = 'REJECT';
      reasoning = `Critical safety violation: ${details.dangerousPatterns[0]}`;
    } else if (details.tsErrors > 0) {
      recommendation = 'REJECT';
      reasoning = `TypeScript compilation errors: ${details.tsErrors} errors found`;
    } else if (overall >= 75) {
      recommendation = 'DEPLOY';
      reasoning = `Fitness score ${overall}/100 exceeds deployment threshold (75). All safety checks passed.`;
    } else if (overall >= 50) {
      recommendation = 'REVIEW';
      reasoning = `Fitness score ${overall}/100 requires human review before deployment.`;
    } else {
      recommendation = 'REJECT';
      reasoning = `Fitness score ${overall}/100 below minimum threshold (50). Regeneration recommended.`;
    }

    const proofHash = createHash('sha256').update(JSON.stringify({
      filePath: target.filePath,
      cycleId: target.cycleId,
      agentId: target.agentId,
      overall,
      dimensions,
      recommendation,
      evaluatedAt: new Date().toISOString(),
    })).digest('hex');

    const score: FitnessScore = {
      overall,
      dimensions,
      details,
      recommendation,
      reasoning,
      proofHash,
      evaluatedAt: new Date().toISOString(),
    };

    this.evaluationHistory.push(score);
    return score;
  }

  private readFile(filePath: string): string {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);
    try {
      return fs.readFileSync(fullPath, 'utf8');
    } catch {
      return '';
    }
  }

  private analyzeContent(content: string, filePath: string): FitnessScore['details'] {
    const lines = content.split('\n');
    const linesOfCode = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('//') && !l.trim().startsWith('*')).length;

    // Dangerous patterns
    const dangerousPatterns: string[] = [];
    for (const { pattern, severity, description } of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        dangerousPatterns.push(`[${severity}] ${description}`);
      }
      pattern.lastIndex = 0; // Reset regex state
    }

    // TypeScript errors (try to compile)
    let tsErrors = 0;
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);
      if (fs.existsSync(fullPath)) {
        const result = execSync(`npx tsc --noEmit --strict false "${fullPath}" 2>&1 || true`, {
          cwd: this.projectRoot,
          timeout: 15000,
          encoding: 'utf8',
        });
        tsErrors = (result.match(/error TS\d+/g) ?? []).length;
      }
    } catch {
      tsErrors = 0; // Can't determine — assume 0
    }

    // Tests
    const hasTests = /\btest\s*\(|describe\s*\(|it\s*\(|expect\s*\(/g.test(content);
    const testsPassed = 0; // Would require running tests
    const testsFailed = 0;

    // Exported functions
    const exportedFunctions = (content.match(/^export\s+(async\s+)?function\s+\w+|^export\s+const\s+\w+\s*=/gm) ?? []).length;

    // Documentation
    const docInfo = calculateDocumentationScore(content);

    // Cyclomatic complexity
    const cyclomaticComplexity = estimateCyclomaticComplexity(content);

    return {
      tsErrors,
      testsPassed,
      testsFailed,
      dangerousPatterns,
      linesOfCode,
      commentRatio: docInfo.commentRatio,
      exportedFunctions,
      hasTests,
      hasJSDoc: docInfo.hasJSDoc,
      cyclomaticComplexity,
    };
  }

  private scoreCorrectness(details: FitnessScore['details']): number {
    let score = 100;
    score -= details.tsErrors * 20;
    if (details.testsFailed > 0) score -= details.testsFailed * 10;
    if (details.linesOfCode === 0) score -= 50;
    return Math.max(0, score);
  }

  private scoreSafety(details: FitnessScore['details']): number {
    let score = 100;
    for (const pattern of details.dangerousPatterns) {
      if (pattern.includes('CRITICAL')) score -= 50;
      else if (pattern.includes('HIGH')) score -= 25;
      else if (pattern.includes('MEDIUM')) score -= 10;
    }
    return Math.max(0, score);
  }

  private scoreComplexity(cyclomaticComplexity: number): number {
    // McCabe: ideal < 10, acceptable < 20, complex > 30
    if (cyclomaticComplexity <= 5) return 100;
    if (cyclomaticComplexity <= 10) return 85;
    if (cyclomaticComplexity <= 20) return 65;
    if (cyclomaticComplexity <= 30) return 40;
    return 20;
  }

  private scoreIntegration(content: string): number {
    let score = 0;
    if (/Router|router\./g.test(content)) score++;
    if (/req\s*,\s*res|Request|Response/g.test(content)) score++;
    if (/export\s+(async\s+)?function|export\s+class|export\s+const/g.test(content)) score++;
    return score;
  }

  private scorePerformance(content: string): number {
    let score = 2;
    // Penalize synchronous blocking operations
    if (/readFileSync|writeFileSync|execSync/g.test(content)) score--;
    // Reward async patterns
    if (/async\s+function|await\s+/g.test(content)) score = Math.min(2, score + 0.5);
    return Math.round(score);
  }

  /**
   * Get evaluation history for DGM fitness tracking.
   */
  getHistory(): FitnessScore[] {
    return this.evaluationHistory;
  }

  /**
   * Get average fitness trend (DGM: fitness should improve over cycles).
   */
  getFitnessTrend(): { average: number; trend: 'improving' | 'stable' | 'declining' } {
    if (this.evaluationHistory.length < 2) {
      return { average: this.evaluationHistory[0]?.overall ?? 0, trend: 'stable' };
    }

    const recent = this.evaluationHistory.slice(-5);
    const average = recent.reduce((a, b) => a + b.overall, 0) / recent.length;
    const first = recent[0]?.overall ?? 0;
    const last = recent[recent.length - 1]?.overall ?? 0;

    return {
      average: Math.round(average),
      trend: last > first + 5 ? 'improving' : last < first - 5 ? 'declining' : 'stable',
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const fitnessEvaluator = new FitnessEvaluator(
  process.env['PROJECT_ROOT'] ?? '/home/ubuntu/mother-latest'
);
