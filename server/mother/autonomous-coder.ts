/**
 * autonomous-coder.ts — Ciclo 123 — MOTHER v80.4
 *
 * MOTHER gera código TypeScript completo via LLM sem intervenção humana.
 * Integra com DGM Orchestrator para ciclo completo de auto-evolução.
 *
 * Embasamento Científico:
 * - Live-SWE-agent (arXiv:2511.13646): autonomous software engineering agents
 * - SICA (arXiv:2504.15228): self-improving coding agents, 67% failure without isolation
 * - AlphaCode 2 (DeepMind, 2023): competitive programming via LLM
 * - Reflexion (arXiv:2303.11366): verbal reinforcement learning for code generation
 * - Constitutional AI (arXiv:2212.08073): safety constraints in code generation
 *
 * @module autonomous-coder
 * @version 1.0.0
 * @cycle C123
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fitnessEvaluator, type FitnessScore } from "./fitness-evaluator";
import { checkSafetyGate } from "./safety-gate";
import { recordAuditEntry } from "./audit-trail";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CodeGenerationRequest {
  /** Module name (e.g., "billing-agent", "alert-router") */
  moduleName: string;
  /** Human-readable description of what the module should do */
  description: string;
  /** Target directory relative to mother-latest root */
  targetDir: "server/mother" | "server/shms" | "subprojects/shms-agent/src" | "server/autogen";
  /** Optional: existing modules to integrate with */
  integrations?: string[];
  /** Optional: scientific papers to reference */
  scientificBasis?: string[];
  /** Optional: specific endpoints to implement */
  endpoints?: string[];
  /** Optional: interfaces/types the module must implement */
  requiredInterfaces?: string[];
  /** Minimum fitness score to accept (default: 75) */
  minFitnessScore?: number;
  /** Maximum retries if fitness < threshold (default: 3) */
  maxRetries?: number;
}

export interface CodeGenerationResult {
  success: boolean;
  moduleName: string;
  filePath: string;
  code: string;
  fitnessScore: FitnessScore | null;
  sha256: string;
  attempts: number;
  generationTimeMs: number;
  model: string;
  scientificBasis: string[];
  error?: string;
}

export interface CoderStatus {
  totalGenerated: number;
  totalAccepted: number;
  totalRejected: number;
  averageFitness: number;
  averageAttempts: number;
  lastGeneratedAt: string | null;
  history: Array<{
    moduleName: string;
    fitness: number;
    accepted: boolean;
    timestamp: string;
    sha256: string;
  }>;
}

// ─── State ───────────────────────────────────────────────────────────────────

const coderHistory: CoderStatus["history"] = [];
let totalGenerated = 0;
let totalAccepted = 0;
let totalRejected = 0;
let fitnessSum = 0;
let attemptsSum = 0;

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are MOTHER's Autonomous Coder — an expert TypeScript software engineer.
Your task is to generate production-quality TypeScript modules for MOTHER v80.x, a self-evolving AI system.

STRICT RULES:
1. Output ONLY valid TypeScript code — no markdown, no explanations, no code fences
2. Every module MUST have a JSDoc header with: description, scientific basis (arXiv/RFC/ISO), @module, @version, @cycle
3. Every exported function MUST have JSDoc with @param and @returns
4. Use strict TypeScript types — no 'any' unless absolutely necessary
5. Include error handling with try/catch for all async operations
6. Follow MOTHER's coding conventions:
   - Import from relative paths (e.g., "../_core/llm", "./safety-gate")
   - Use async/await, never callbacks
   - Export named exports (no default class exports)
   - Include SHA-256 proof generation for critical operations
7. Safety constraints (Constitutional AI arXiv:2212.08073):
   - Never write to paths outside WRITABLE_PATHS
   - Never execute shell commands directly
   - Never expose secrets or API keys
   - Never implement infinite loops without exit conditions
8. Code must compile with TypeScript strict mode
9. Include at least 3 scientific references in the header comment`;

// ─── Core Generation Function ─────────────────────────────────────────────────

/**
 * Generates a complete TypeScript module via LLM with fitness evaluation.
 * Implements Reflexion (arXiv:2303.11366) — retries with feedback on failure.
 *
 * @param request - Code generation specification
 * @returns Generated code with fitness score and cryptographic proof
 */
export async function generateModule(
  request: CodeGenerationRequest
): Promise<CodeGenerationResult> {
  const startTime = Date.now();
  const minFitness = request.minFitnessScore ?? 75;
  const maxRetries = request.maxRetries ?? 3;

  let lastCode = "";
  let lastFitness: FitnessScore | null = null;
  let attempts = 0;
  let lastError = "";

  // Safety check before any generation
  const absolutePath = path.join("/home/ubuntu/mother-latest", request.targetDir, `${request.moduleName}.ts`);
  const safetyCheck = checkSafetyGate(
    absolutePath,
    `// Autonomous generation request for ${request.moduleName}`,
    `autonomous-coder-${request.moduleName}`
  );

  if (!safetyCheck.allowed) {
    return {
      success: false,
      moduleName: request.moduleName,
      filePath: "",
      code: "",
      fitnessScore: null,
      sha256: "",
      attempts: 0,
      generationTimeMs: Date.now() - startTime,
      model: "none",
      scientificBasis: [],
      error: `Safety gate blocked: ${safetyCheck.violations.join("; ")}`,
    };
  }

  // Build generation prompt
  const buildPrompt = (feedback?: string): string => {
    const integrationsList = request.integrations?.length
      ? `\n\nIntegrate with these existing MOTHER modules:\n${request.integrations.map(m => `- ${m}`).join("\n")}`
      : "";

    const endpointsList = request.endpoints?.length
      ? `\n\nImplement these A2A endpoints:\n${request.endpoints.map(e => `- ${e}`).join("\n")}`
      : "";

    const sciList = request.scientificBasis?.length
      ? `\n\nScientific basis to reference:\n${request.scientificBasis.map(s => `- ${s}`).join("\n")}`
      : "";

    const feedbackSection = feedback
      ? `\n\nPREVIOUS ATTEMPT FAILED. Feedback:\n${feedback}\n\nFix ALL issues and regenerate the complete module.`
      : "";

    return `Generate a complete TypeScript module for MOTHER v80.x.

Module name: ${request.moduleName}
Target: ${request.targetDir}/${request.moduleName}.ts
Cycle: C123
Description: ${request.description}${integrationsList}${endpointsList}${sciList}${feedbackSection}

Remember: Output ONLY the TypeScript code. No markdown. No explanations.`;
  };

  // Reflexion loop — retry with feedback (arXiv:2303.11366)
  for (attempts = 1; attempts <= maxRetries; attempts++) {
    const prompt = buildPrompt(attempts > 1 ? lastError : undefined);

    try {
      // Dynamic import to avoid circular deps
      const { invokeLLM } = await import("../_core/llm");
      const response = await invokeLLM({
        provider: "deepseek",
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 4000,
      });

      const rawContent = response.choices?.[0]?.message?.content ?? "";
      const content = typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((c: unknown) => (typeof c === "object" && c !== null && "text" in c ? (c as { text: string }).text : String(c))).join("")
          : String(rawContent);

      // Strip markdown code fences if present
      lastCode = content
        .replace(/^```typescript\n?/m, "")
        .replace(/^```ts\n?/m, "")
        .replace(/^```\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      // Write to temp file for fitness evaluation
      const tempPath = path.join("/tmp", `mother-coder-${request.moduleName}-${Date.now()}.ts`);
      fs.writeFileSync(tempPath, lastCode, "utf-8");

      // Evaluate fitness
      const fitnessResult = await fitnessEvaluator.evaluate({
        filePath: tempPath,
        content: lastCode,
        cycleId: "C123",
        agentId: "autonomous-coder",
      });

      // Cleanup temp file
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

      lastFitness = fitnessResult;

      if (fitnessResult.overall >= minFitness) {
        // Accepted — write to final location
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, lastCode, "utf-8");

        const sha256 = crypto.createHash("sha256").update(lastCode).digest("hex");

        // Audit trail
        recordAuditEntry({
          action: "code_write",
          actor: "autonomous-coder",
          actorType: "agent",
          target: absolutePath,
          details: {
            moduleName: request.moduleName,
            fitness: fitnessResult.overall,
            attempts,
            sha256: sha256.slice(0, 16),
            recommendation: fitnessResult.recommendation,
          },
          outcome: "success",
          durationMs: Date.now() - startTime,
        });

        // Update stats
        totalGenerated++;
        totalAccepted++;
        fitnessSum += fitnessResult.overall;
        attemptsSum += attempts;
        coderHistory.push({
          moduleName: request.moduleName,
          fitness: fitnessResult.overall,
          accepted: true,
          timestamp: new Date().toISOString(),
          sha256,
        });

        return {
          success: true,
          moduleName: request.moduleName,
          filePath: absolutePath,
          code: lastCode,
          fitnessScore: fitnessResult,
          sha256,
          attempts,
          generationTimeMs: Date.now() - startTime,
          model: "deepseek-chat",
          scientificBasis: request.scientificBasis ?? ["arXiv:2511.13646", "arXiv:2303.11366"],
        };
      }

      // Build feedback for next attempt (Reflexion pattern)
      lastError = buildFeedback(fitnessResult, lastCode);

    } catch (err) {
      lastError = `LLM error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // All attempts exhausted — rejected
  totalGenerated++;
  totalRejected++;
  if (lastFitness) {
    fitnessSum += lastFitness.overall;
    attemptsSum += attempts - 1;
    coderHistory.push({
      moduleName: request.moduleName,
      fitness: lastFitness.overall,
      accepted: false,
      timestamp: new Date().toISOString(),
      sha256: crypto.createHash("sha256").update(lastCode).digest("hex"),
    });
  }

  return {
    success: false,
    moduleName: request.moduleName,
    filePath: "",
    code: lastCode,
    fitnessScore: lastFitness,
    sha256: crypto.createHash("sha256").update(lastCode).digest("hex"),
    attempts: attempts - 1,
    generationTimeMs: Date.now() - startTime,
    model: "deepseek-chat",
    scientificBasis: request.scientificBasis ?? [],
    error: `Max retries (${maxRetries}) exhausted. Last fitness: ${lastFitness?.overall ?? 0}. ${lastError}`,
  };
}

/**
 * Builds structured feedback for Reflexion retry loop.
 * Based on arXiv:2303.11366 — verbal reinforcement learning.
 */
function buildFeedback(fitness: FitnessScore, code: string): string {
  const issues: string[] = [];
  const dims = fitness.dimensions;

  if (dims.correctness < 25) {
    issues.push(`CORRECTNESS (${dims.correctness}/35): Missing error handling, incomplete logic, or syntax issues`);
  }
  if (dims.safety < 15) {
    issues.push(`SAFETY (${dims.safety}/25): Dangerous patterns detected — no shell exec, no hardcoded secrets`);
  }
  if (dims.documentation < 7) {
    issues.push(`DOCUMENTATION (${dims.documentation}/10): Missing JSDoc headers, @param, @returns annotations`);
  }
  if (dims.complexity < 10) {
    issues.push(`COMPLEXITY (${dims.complexity}/15): Functions too long or cyclomatic complexity too high`);
  }
  if (!code.includes("@module") || !code.includes("@cycle")) {
    issues.push("HEADER: Missing @module or @cycle JSDoc tags in file header");
  }
  if (!code.includes("arXiv") && !code.includes("RFC") && !code.includes("ISO")) {
    issues.push("SCIENTIFIC BASIS: Missing scientific references in header");
  }

  return issues.length > 0
    ? `Fitness score: ${fitness.overall}/100 (${fitness.recommendation})\nIssues to fix:\n${issues.map(i => `- ${i}`).join("\n")}`
    : `Fitness score: ${fitness.overall}/100 — below threshold. Improve overall code quality.`;
}

/**
 * Generates multiple modules in sequence.
 *
 * @param requests - Array of generation requests
 * @returns Array of results in generation order
 */
export async function generateModuleBatch(
  requests: CodeGenerationRequest[]
): Promise<CodeGenerationResult[]> {
  const results: CodeGenerationResult[] = [];

  for (const request of requests) {
    const result = await generateModule(request);
    results.push(result);

    if (!result.success) {
      console.warn(`[autonomous-coder] Module ${request.moduleName} rejected (fitness=${result.fitnessScore?.overall ?? 0}). Continuing.`);
    }
  }

  return results;
}

/**
 * Returns current coder statistics.
 */
export function getCoderStatus(): CoderStatus {
  return {
    totalGenerated,
    totalAccepted,
    totalRejected,
    averageFitness: totalGenerated > 0 ? Math.round(fitnessSum / totalGenerated) : 0,
    averageAttempts: totalGenerated > 0 ? Math.round((attemptsSum / totalGenerated) * 10) / 10 : 0,
    lastGeneratedAt: coderHistory.length > 0
      ? coderHistory[coderHistory.length - 1].timestamp
      : null,
    history: [...coderHistory].slice(-20),
  };
}
