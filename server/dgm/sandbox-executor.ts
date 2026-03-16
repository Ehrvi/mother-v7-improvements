/**
 * sandbox-executor.ts — DGM Isolated Code Execution
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.07983): self-modifying agents require sandboxed execution
 * - OWASP A01:2021: code injection prevention via process isolation
 * - Martin (2008) Clean Code: single responsibility — executor only executes, does not evaluate
 *
 * Architecture: tmpdir isolation + timeout enforcement + automatic cleanup + rollback support
 */

import { execFile } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface SandboxExecutionOptions {
  /** Maximum execution time in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum memory in MB (default: 256) */
  maxMemoryMb?: number;
  /** Working directory (default: auto-generated tmpdir) */
  workDir?: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
  /** Whether to capture stdout/stderr (default: true) */
  captureOutput?: boolean;
}

export interface SandboxExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  workDir: string;
  sandboxId: string;
  error?: string;
}

export interface SandboxCheckpoint {
  sandboxId: string;
  workDir: string;
  snapshotPath: string;
  createdAt: Date;
}

/**
 * SandboxExecutor — executes TypeScript/JavaScript code in an isolated tmpdir
 * with automatic cleanup and rollback support.
 *
 * Usage:
 * ```ts
 * const executor = new SandboxExecutor();
 * const result = await executor.execute('console.log("hello")', { timeoutMs: 5000 });
 * ```
 */
export class SandboxExecutor {
  private readonly defaultTimeoutMs = 10_000;
  private readonly defaultMaxMemoryMb = 256;
  private activeWorkDirs = new Set<string>();

  /**
   * Execute TypeScript/JavaScript code in an isolated sandbox.
   * Creates a tmpdir, writes the code, runs it via node, then cleans up.
   */
  async execute(
    code: string,
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxExecutionResult> {
    const sandboxId = randomUUID();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxMemoryMb = options.maxMemoryMb ?? this.defaultMaxMemoryMb;
    const workDir =
      options.workDir ?? (await this.createIsolatedWorkDir(sandboxId));

    this.activeWorkDirs.add(workDir);
    const startTime = Date.now();

    try {
      // Strip TypeScript-only syntax (interfaces, type aliases, type annotations)
      // so Node.js can execute the code as plain JavaScript.
      // DGM-generated code is TypeScript — we need to transpile or strip types.
      const jsCode = stripTypeScriptSyntax(code);

      // Write code to isolated file
      const codeFile = path.join(workDir, "dgm-proposal.mjs");
      await fs.writeFile(codeFile, jsCode, "utf-8");

      // Execute with timeout and memory limit
      const { stdout, stderr } = await execFileAsync(
        "node",
        [
          `--max-old-space-size=${maxMemoryMb}`,
          "--experimental-vm-modules",
          codeFile,
        ],
        {
          timeout: timeoutMs,
          cwd: workDir,
          env: {
            ...process.env,
            NODE_ENV: "sandbox",
            SANDBOX_ID: sandboxId,
            ...options.env,
          },
          maxBuffer: 1024 * 1024 * 10, // 10MB output buffer
        }
      );

      return {
        success: true,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: 0,
        durationMs: Date.now() - startTime,
        workDir,
        sandboxId,
      };
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        killed?: boolean;
      };
      const isTimeout = error.killed || error.code === "ETIMEDOUT";

      return {
        success: false,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        exitCode: typeof error.code === "number" ? error.code : 1,
        durationMs: Date.now() - startTime,
        workDir,
        sandboxId,
        error: isTimeout
          ? `Execution timed out after ${timeoutMs}ms`
          : (error.message ?? "Unknown execution error"),
      };
    } finally {
      // Always cleanup — even on error
      await this.cleanup(workDir);
    }
  }

  /**
   * Create a checkpoint snapshot of the current workDir state.
   * Enables rollback if a DGM proposal corrupts the codebase.
   */
  async createCheckpoint(workDir: string): Promise<SandboxCheckpoint> {
    const sandboxId = randomUUID();
    const snapshotPath = path.join(os.tmpdir(), `mother-snapshot-${sandboxId}`);
    await fs.mkdir(snapshotPath, { recursive: true });

    // Copy all files to snapshot
    const files = await fs.readdir(workDir);
    for (const file of files) {
      await fs.copyFile(
        path.join(workDir, file),
        path.join(snapshotPath, file)
      );
    }

    return {
      sandboxId,
      workDir,
      snapshotPath,
      createdAt: new Date(),
    };
  }

  /**
   * Rollback workDir to a previously created checkpoint.
   */
  async rollback(checkpoint: SandboxCheckpoint): Promise<void> {
    const snapshotFiles = await fs.readdir(checkpoint.snapshotPath);
    for (const file of snapshotFiles) {
      await fs.copyFile(
        path.join(checkpoint.snapshotPath, file),
        path.join(checkpoint.workDir, file)
      );
    }
    // Cleanup snapshot after rollback
    await fs.rm(checkpoint.snapshotPath, { recursive: true, force: true });
  }

  /**
   * Cleanup all active sandboxes (call on server shutdown).
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.activeWorkDirs).map((dir) =>
      this.cleanup(dir)
    );
    await Promise.allSettled(cleanupPromises);
    this.activeWorkDirs.clear();
  }

  private async createIsolatedWorkDir(sandboxId: string): Promise<string> {
    const workDir = path.join(os.tmpdir(), `mother-sandbox-${sandboxId}`);
    await fs.mkdir(workDir, { recursive: true });
    return workDir;
  }

  private async cleanup(workDir: string): Promise<void> {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
      this.activeWorkDirs.delete(workDir);
    } catch {
      // Cleanup failure is non-fatal — log but continue
      console.warn(`[SandboxExecutor] Failed to cleanup: ${workDir}`);
    }
  }
}

/**
 * Strip TypeScript-only syntax so Node.js can execute the code as plain JS.
 * Removes: interface/type declarations, type annotations, 'export type', generics on calls.
 * Preserves runtime logic (functions, classes, variables, expressions).
 */
function stripTypeScriptSyntax(code: string): string {
  return code
    // Remove full 'export interface Foo { ... }' blocks (handles multi-line)
    .replace(/export\s+interface\s+\w+\s*\{[^}]*\}/g, '')
    // Remove full 'interface Foo { ... }' blocks
    .replace(/\binterface\s+\w+\s*\{[^}]*\}/g, '')
    // Remove 'export type Foo = ...' lines
    .replace(/export\s+type\s+\w+\s*=[^;]+;/g, '')
    // Remove 'type Foo = ...' lines
    .replace(/\btype\s+\w+\s*=[^;]+;/g, '')
    // Remove ': TypeName' annotations from parameters and variables (simple cases)
    .replace(/:\s*(?:string|number|boolean|void|any|unknown|never|null|undefined|Record<[^>]+>|Promise<[^>]+>|Array<[^>]+>|\w+(?:\[\])?)\s*([,)=;{])/g, '$1')
    // Remove 'as TypeName' casts
    .replace(/\bas\s+\w+(?:<[^>]+>)?\b/g, '')
    // Remove standalone 'export type { ... }' re-exports
    .replace(/export\s+type\s*\{[^}]*\}\s*;?/g, '')
    // Clean up empty lines left behind
    .replace(/\n{3,}/g, '\n\n');
}

// Singleton instance for server-wide use
export const sandboxExecutor = new SandboxExecutor();
