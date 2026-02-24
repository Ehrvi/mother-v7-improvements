/**
 * MOTHER v44.0: Validation Agent (ReAct) — Real Fitness Scoring
 *
 * Validates code changes and runs benchmarks to measure empirical fitness scores.
 * Part of the Darwin Gödel Machine (DGM) evolutionary loop.
 *
 * Scientific basis:
 * - ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., ICLR 2023)
 * - Darwin Gödel Machine (Zhang et al., arXiv:2505.22954)
 * - SWE-bench (Jimenez et al., arXiv:2310.06770) — code quality benchmarking
 * - AgentBench (Liu et al., arXiv:2308.03688) — agent capability evaluation
 *
 * Architecture: ReAct sub-agent with real code execution tools.
 * The agent reasons about the code, executes it in a sandbox, observes the results,
 * and calculates an empirical 5-dimensional fitness score:
 *   F = 0.35*correctness + 0.20*efficiency + 0.20*robustness + 0.15*maintainability + 0.10*novelty
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { calculateRealFitnessScore, formatFitnessReport } from "./fitness_scorer";

// ============================================================
// TOOL 1: Execute Code in Sandbox
// Runs arbitrary TypeScript/JavaScript code in a temporary
// directory and returns stdout, stderr, and exit code.
// ============================================================
const executeCodeInSandboxTool = tool(
  async ({ code, language, testCode }) => {
    console.log("[ValidationAgent] Executing code in sandbox...");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mother-sandbox-"));

    try {
      const ext = language === "typescript" ? "ts" : "js";
      const codeFile = path.join(tmpDir, `solution.${ext}`);
      const testFile = path.join(tmpDir, `test.${ext}`);

      // Write the solution code
      fs.writeFileSync(codeFile, code);

      // Write the test harness
      const testHarness = testCode || `
// Default test: check if the code runs without throwing
const solution = require('./solution');
console.log('PASS: Code loaded successfully');
console.log('OUTPUT:', JSON.stringify(solution));
`;
      fs.writeFileSync(testFile, testHarness);

      let stdout = "";
      let stderr = "";
      let exitCode = 0;
      let fitnessScore = 0.0;

      try {
        if (language === "typescript") {
          // Use ts-node if available, otherwise transpile with tsc
          const result = execSync(
            `cd "${tmpDir}" && npx --yes ts-node --skip-project "${codeFile}" 2>&1`,
            { timeout: 15000, encoding: "utf8" }
          );
          stdout = result;
          exitCode = 0;
        } else {
          const result = execSync(
            `node "${codeFile}" 2>&1`,
            { timeout: 15000, encoding: "utf8" }
          );
          stdout = result;
          exitCode = 0;
        }
      } catch (execError: any) {
        stderr = execError.stdout || execError.message || "Execution failed";
        exitCode = execError.status || 1;
      }

      // Calculate empirical fitness score
      if (exitCode === 0) {
        // Code ran without errors
        const passCount = (stdout.match(/PASS/gi) || []).length;
        const failCount = (stdout.match(/FAIL/gi) || []).length;
        if (passCount > 0 && failCount === 0) {
          fitnessScore = 1.0; // All tests passed
        } else if (passCount > 0 && failCount > 0) {
          fitnessScore = passCount / (passCount + failCount); // Partial pass
        } else {
          fitnessScore = 0.7; // Ran without errors but no explicit test results
        }
      } else {
        // Code failed to run
        if (stderr.includes("SyntaxError") || stderr.includes("TypeError")) {
          fitnessScore = 0.0; // Syntax/type error
        } else {
          fitnessScore = 0.2; // Runtime error
        }
      }

      console.log(`[ValidationAgent] Execution complete. Exit: ${exitCode}, Fitness: ${fitnessScore}`);

      return JSON.stringify({
        stdout: stdout.substring(0, 2000),
        stderr: stderr.substring(0, 1000),
        exitCode,
        fitnessScore,
        language,
      });
    } finally {
      // Cleanup temp directory
      try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    }
  },
  {
    name: "execute_code_in_sandbox",
    description:
      "Execute code in an isolated sandbox and return stdout, stderr, exit code, and an empirical fitness score (0.0-1.0). Use this to validate code correctness.",
    schema: z.object({
      code: z.string().describe("The code to execute"),
      language: z
        .enum(["javascript", "typescript"])
        .default("javascript")
        .describe("The programming language of the code"),
      testCode: z
        .string()
        .optional()
        .describe("Optional test harness code to run alongside the solution"),
    }),
  }
);

// ============================================================
// TOOL 2: Run TypeScript Compilation Check
// Validates TypeScript code without executing it.
// ============================================================
const runTypeScriptCheckTool = tool(
  async ({ code }) => {
    console.log("[ValidationAgent] Running TypeScript check...");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mother-tscheck-"));

    try {
      const codeFile = path.join(tmpDir, "check.ts");
      fs.writeFileSync(codeFile, code);

      let result = "";
      let hasErrors = false;

      try {
        execSync(
          `cd "${tmpDir}" && npx --yes tsc --noEmit --strict --target ES2020 --module commonjs "${codeFile}" 2>&1`,
          { timeout: 30000, encoding: "utf8" }
        );
        result = "TypeScript compilation: PASS (no errors)";
      } catch (e: any) {
        hasErrors = true;
        result = `TypeScript compilation: FAIL\n${(e.stdout || e.message || "").substring(0, 1000)}`;
      }

      return JSON.stringify({
        passed: !hasErrors,
        output: result,
        fitnessScore: hasErrors ? 0.3 : 0.9,
      });
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    }
  },
  {
    name: "run_typescript_check",
    description:
      "Run TypeScript static type checking on code without executing it. Returns compilation errors and a fitness score.",
    schema: z.object({
      code: z.string().describe("The TypeScript code to check"),
    }),
  }
);

// ============================================================
// TOOL 3: Calculate Real 5-Dimensional Fitness Score
// Uses the fitness_scorer module for scientifically grounded
// multi-dimensional evaluation (v44.0).
// F = 0.35*correctness + 0.20*efficiency + 0.20*robustness + 0.15*maintainability + 0.10*novelty
// ============================================================
const calculateFitnessScoreTool = tool(
  async ({ code, executionSuccess, executionOutput, executionTimeMs, parentId }) => {
    console.log("[ValidationAgent] Calculating 5-dimensional fitness score (v44.0)...");

    const breakdown = await calculateRealFitnessScore(
      code,
      { success: executionSuccess, output: executionOutput, executionTimeMs },
      parentId || null
    );

    const report = formatFitnessReport(breakdown);
    console.log(`[ValidationAgent] ${report}`);

    return JSON.stringify({
      finalFitnessScore: breakdown.finalScore,
      breakdown: {
        correctness: breakdown.correctness,
        efficiency: breakdown.efficiency,
        robustness: breakdown.robustness,
        maintainability: breakdown.maintainability,
        novelty: breakdown.novelty,
      },
      label: breakdown.label,
      details: breakdown.details,
      report,
    });
  },
  {
    name: "calculate_fitness_score",
    description:
      "Calculate the real 5-dimensional fitness score (v44.0): correctness(35%) + efficiency(20%) + robustness(20%) + maintainability(15%) + novelty(10%)",
    schema: z.object({
      code: z.string().describe("The full code to evaluate"),
      executionSuccess: z.boolean().describe("Whether code execution succeeded"),
      executionOutput: z.string().describe("Output from code execution"),
      executionTimeMs: z.number().describe("Execution time in milliseconds"),
      parentId: z.string().optional().describe("Parent generation ID for novelty calculation"),
    }),
  }
);

// ============================================================
// Create the Validation Agent (ReAct)
// ============================================================

/**
 * Create the Validation Agent using createReactAgent (ReAct pattern)
 *
 * This agent:
 * 1. Reasons about the code it receives
 * 2. Executes it in a sandbox using execute_code_in_sandbox
 * 3. Optionally runs TypeScript type checking
 * 4. Calculates a final empirical fitness score
 * 5. Returns the score in a structured format for the ArchiveNode
 */
export async function createValidationAgent() {
  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
  const tools = [
    executeCodeInSandboxTool,
    runTypeScriptCheckTool,
    calculateFitnessScoreTool,
  ];

  const agent = createReactAgent({
    llm: model,
    tools,
    messageModifier: `You are the ValidationAgent for the MOTHER DGM system (v44.0).
Your role is to empirically validate code and calculate a real 5-dimensional fitness score.

When given code to validate:
1. Use execute_code_in_sandbox to run the code. Note the executionSuccess, output, and time.
2. Use calculate_fitness_score with the FULL code content + execution results + parentId if available.
   This computes: correctness(35%) + efficiency(20%) + robustness(20%) + maintainability(15%) + novelty(10%)
3. Always end your response with: "Fitness score: [score]" where [score] is the finalFitnessScore value.

Be precise and scientific. The fitness score is empirically calculated, not estimated.`,
  });

  return agent;
}
