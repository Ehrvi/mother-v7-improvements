/**
 * MOTHER v39.0: Validation Agent
 * 
 * Validates code changes and runs benchmarks to measure fitness scores.
 * Part of the Darwin Gödel Machine (DGM) evolutionary loop.
 * 
 * Based on:
 * - SWE-bench (https://www.swebench.com/)
 * - Automated testing and validation patterns
 */

import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Calculate fitness score by executing generated code
 * 
 * @param codeString - The TypeScript code to execute
 * @param expectedOutput - The expected output (for now, hardcoded)
 * @returns Object with fitnessScore (0.0-1.0) and benchmarkResults
 */
export function calculateFitnessScore(
  codeString: string,
  expectedOutput: string = "Hello, World!"
): { fitnessScore: number; benchmarkResults: string } {
  console.log("[ValidationAgent] Calculating fitness score...");
  console.log("[ValidationAgent] Expected output:", expectedOutput);

  try {
    // Create temporary file for code execution
    const tempDir = "/tmp/mother-validation";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `test-${Date.now()}.ts`);
    fs.writeFileSync(tempFile, codeString);

    // Execute code with ts-node
    const stdout = execSync(`npx ts-node ${tempFile}`, {
      encoding: "utf-8",
      timeout: 10000, // 10 second timeout
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Clean up
    fs.unlinkSync(tempFile);

    // Compare output
    const actualOutput = stdout.trim();
    const matches = actualOutput === expectedOutput;

    const fitnessScore = matches ? 1.0 : 0.0;
    const benchmarkResults = JSON.stringify({
      expectedOutput,
      actualOutput,
      matches,
      executionSuccess: true,
      timestamp: new Date().toISOString(),
    });

    console.log("[ValidationAgent] Fitness score:", fitnessScore);
    console.log("[ValidationAgent] Benchmark results:", benchmarkResults);

    return { fitnessScore, benchmarkResults };
  } catch (error) {
    console.error("[ValidationAgent] Error executing code:", error);

    const benchmarkResults = JSON.stringify({
      expectedOutput,
      actualOutput: null,
      matches: false,
      executionSuccess: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });

    return { fitnessScore: 0.0, benchmarkResults };
  }
}

/**
 * Real tool: Run Benchmark
 * 
 * Executes generated code and calculates fitness score based on output comparison.
 */
const runBenchmarkTool = tool(
  async ({ codeString, expectedOutput }) => {
    console.log("[ValidationAgent] Running benchmark with code execution");
    console.log("[ValidationAgent] Code length:", codeString.length, "chars");
    console.log("[ValidationAgent] Expected output:", expectedOutput);

    const { fitnessScore, benchmarkResults } = calculateFitnessScore(
      codeString,
      expectedOutput
    );

    return `Benchmark completed. Fitness score: ${fitnessScore}, Results: ${benchmarkResults}`;
  },
  {
    name: "run_benchmark",
    description:
      "Run a benchmark by executing generated code and comparing output to expected result",
    schema: z.object({
      codeString: z.string().describe("The TypeScript code to execute"),
      expectedOutput: z
        .string()
        .describe("The expected output from the code")
        .default("Hello, World!"),
    }),
  }
);

/**
 * Tool: Validate Code Syntax
 * 
 * Validates TypeScript syntax without executing the code.
 */
const validateCodeTool = tool(
  async ({ codeString }) => {
    console.log("[ValidationAgent] Validating code syntax");

    try {
      // Create temporary file for syntax validation
      const tempDir = "/tmp/mother-validation";
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFile = path.join(tempDir, `validate-${Date.now()}.ts`);
      fs.writeFileSync(tempFile, codeString);

      // Run TypeScript compiler in check mode
      execSync(`npx tsc --noEmit ${tempFile}`, {
        encoding: "utf-8",
        timeout: 5000,
      });

      // Clean up
      fs.unlinkSync(tempFile);

      return `Code validation passed. No syntax errors found.`;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return `Code validation failed: ${errorMessage}`;
    }
  },
  {
    name: "validate_code",
    description: "Validate TypeScript code syntax without executing it",
    schema: z.object({
      codeString: z.string().describe("The TypeScript code to validate"),
    }),
  }
);

/**
 * Create the Validation Agent using createReactAgent
 */
export async function createValidationAgent() {
  const model = new ChatOpenAI({ model: "gpt-4o-mini" });
  const tools = [runBenchmarkTool, validateCodeTool];

  const agent = createReactAgent({
    llm: model,
    tools,
  });

  return agent;
}
