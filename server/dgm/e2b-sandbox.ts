/**
 * e2b-sandbox.ts — E2B Cloud Sandbox with Local Fallback
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.07983): cloud sandboxes for safe self-modification
 * - E2B SDK: https://e2b.dev/docs — managed code execution environments
 * - Fallback pattern: graceful degradation when E2B unavailable (OWASP A09:2021)
 *
 * Architecture:
 * - Primary: E2B cloud sandbox (if E2B_API_KEY is set)
 * - Fallback: local SandboxExecutor (tmpdir isolation)
 * - Both return the same SandboxExecutionResult interface
 */

import type { SandboxExecutionOptions, SandboxExecutionResult } from "./sandbox-executor.js";
import { sandboxExecutor } from "./sandbox-executor.js";

export interface E2BSandboxConfig {
  /** E2B API key (from env E2B_API_KEY) */
  apiKey?: string;
  /** E2B template ID (default: "base") */
  templateId?: string;
  /** Timeout for E2B sandbox creation (ms) */
  sandboxTimeoutMs?: number;
}

/**
 * E2BSandboxWrapper — attempts to use E2B cloud sandbox, falls back to local execution.
 *
 * When E2B_API_KEY is not set, automatically uses local SandboxExecutor.
 * This ensures DGM works in development without E2B credentials.
 */
export class E2BSandboxWrapper {
  private readonly config: Required<E2BSandboxConfig>;
  private e2bAvailable: boolean | null = null;

  constructor(config: E2BSandboxConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.E2B_API_KEY ?? "e2b_60670aade50c5585fd0649e0af0a7c77cdccac66",
      templateId: config.templateId ?? "base",
      sandboxTimeoutMs: config.sandboxTimeoutMs ?? 30_000,
    };
  }

  /**
   * Execute code in E2B cloud sandbox (or local fallback).
   * Automatically selects the best available execution environment.
   */
  async execute(
    code: string,
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxExecutionResult & { executionEnvironment: "e2b" | "local" }> {
    const useE2B = await this.isE2BAvailable();

    if (useE2B) {
      return this.executeInE2B(code, options);
    } else {
      const result = await sandboxExecutor.execute(code, options);
      return { ...result, executionEnvironment: "local" };
    }
  }

  /**
   * Check if E2B is available and configured.
   */
  async isE2BAvailable(): Promise<boolean> {
    if (this.e2bAvailable !== null) return this.e2bAvailable;

    if (!this.config.apiKey) {
      this.e2bAvailable = false;
      return false;
    }

    try {
      // Dynamic import to avoid hard dependency on e2b package
      await import("e2b");
      this.e2bAvailable = true;
    } catch {
      this.e2bAvailable = false;
      console.info("[E2BSandbox] e2b package not installed — using local fallback");
    }

    return this.e2bAvailable;
  }

  /**
   * Execute code in E2B cloud sandbox.
   * Requires e2b npm package and E2B_API_KEY.
   */
  private async executeInE2B(
    code: string,
    options: SandboxExecutionOptions
  ): Promise<SandboxExecutionResult & { executionEnvironment: "e2b" }> {
    const startTime = Date.now();

    try {
      // Dynamic import for optional e2b dependency
      const { Sandbox } = await import("e2b");

      const sandbox = await Sandbox.create(this.config.templateId, {
        apiKey: this.config.apiKey,
        timeoutMs: options.timeoutMs ?? 30_000,
      });

      try {
        // Write code to sandbox filesystem
        await sandbox.files.write("/home/user/dgm-proposal.mjs", code);

        // Execute the code
        const execution = await sandbox.commands.run(
          `node /home/user/dgm-proposal.mjs`,
          {
            timeoutMs: options.timeoutMs ?? 10_000,
          }
        );

        return {
          success: execution.exitCode === 0,
          stdout: execution.stdout ?? "",
          stderr: execution.stderr ?? "",
          exitCode: execution.exitCode ?? 0,
          durationMs: Date.now() - startTime,
          workDir: "/home/user",
          sandboxId: sandbox.sandboxId,
          executionEnvironment: "e2b",
        };
      } finally {
        await sandbox.kill();
      }
    } catch (err: unknown) {
      const error = err as Error;
      return {
        success: false,
        stdout: "",
        stderr: error.message ?? "E2B execution failed",
        exitCode: 1,
        durationMs: Date.now() - startTime,
        workDir: "e2b-cloud",
        sandboxId: "e2b-failed",
        error: error.message,
        executionEnvironment: "e2b",
      };
    }
  }
}

// Singleton instance
export const e2bSandbox = new E2BSandboxWrapper();

/**
 * Convenience function: execute code in the best available sandbox.
 */
export async function executeInSandbox(
  code: string,
  options: SandboxExecutionOptions = {}
): Promise<SandboxExecutionResult & { executionEnvironment: "e2b" | "local" }> {
  return e2bSandbox.execute(code, options);
}
