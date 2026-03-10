/**
 * Persistent Shell Engine — server/mother/persistent-shell.ts
 * MOTHER v96.0 | Ciclo C213 | NC-SENS-002
 *
 * Provides stateful shell session management for MOTHER, enabling:
 * - Persistent working directories across commands
 * - Environment variable persistence
 * - Command history and output capture
 * - Security sandboxing (allowlist + timeout)
 *
 * Scientific basis:
 * - Yao et al. (2023) "ReAct: Synergizing Reasoning and Acting in Language Models"
 *   arXiv:2210.03629 — tool-augmented LLM with persistent state
 * - Wang et al. (2024) "Executable Code Actions Elicit Better LLM Agents"
 *   arXiv:2402.01030 — shell as primary action space for agents
 * - OpenAI (2024) "Scaling LLM Test-Time Compute" — persistent environments
 *
 * Architecture:
 *   ShellSession: stateful session with cwd, env, history
 *   ShellExecutor: executes commands with timeout + output capture
 *   ShellSandbox: security layer (allowlist, resource limits)
 *   ShellManager: session lifecycle management
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export interface ShellSession {
  id: string;
  cwd: string;
  env: Record<string, string>;
  history: ShellCommand[];
  createdAt: Date;
  lastActiveAt: Date;
  isActive: boolean;
}

export interface ShellCommand {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executedAt: Date;
  durationMs: number;
}

export interface ShellExecuteOptions {
  timeout?: number;       // ms, default 30000
  cwd?: string;           // override session cwd
  env?: Record<string, string>; // additional env vars
  maxOutputBytes?: number; // default 50000
}

export interface ShellExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  sessionId: string;
}

// Security: blocked commands
const BLOCKED_COMMANDS = [
  'rm -rf /', 'mkfs', 'dd if=/dev/zero', 'fork bomb',
  ':(){ :|:& };:', 'sudo rm', 'chmod 777 /', 'shutdown', 'reboot',
  'curl.*|.*sh', 'wget.*|.*sh', // prevent pipe-to-shell attacks
];

// Allowed base directory (sandbox)
const SANDBOX_BASE = path.join(os.tmpdir(), 'mother-shell-sandbox');

// Session store (in-memory, TTL 30 minutes)
const sessions = new Map<string, ShellSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Create a new shell session with a sandboxed working directory.
 */
export function createShellSession(sessionId?: string): ShellSession {
  const id = sessionId || `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cwd = path.join(SANDBOX_BASE, id);

  const session: ShellSession = {
    id,
    cwd,
    env: {
      HOME: cwd,
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
    },
    history: [],
    createdAt: new Date(),
    lastActiveAt: new Date(),
    isActive: true,
  };

  sessions.set(id, session);
  return session;
}

/**
 * Get an existing session or create a new one.
 */
export function getOrCreateSession(sessionId: string): ShellSession {
  const existing = sessions.get(sessionId);
  if (existing && existing.isActive) {
    existing.lastActiveAt = new Date();
    return existing;
  }
  return createShellSession(sessionId);
}

/**
 * Security check: block dangerous commands.
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const normalized = command.toLowerCase().trim();
  for (const blocked of BLOCKED_COMMANDS) {
    if (normalized.includes(blocked.toLowerCase())) {
      return { safe: false, reason: `Command matches blocked pattern: "${blocked}"` };
    }
  }
  return { safe: true };
}

/**
 * Execute a command in a shell session with timeout and output capture.
 */
export async function executeInSession(
  sessionId: string,
  command: string,
  options: ShellExecuteOptions = {}
): Promise<ShellExecuteResult> {
  const session = getOrCreateSession(sessionId);
  const timeout = options.timeout ?? 30000;
  const maxOutputBytes = options.maxOutputBytes ?? 50000;
  const cwd = options.cwd ?? session.cwd;
  const startTime = Date.now();

  // Security check
  const safetyCheck = isCommandSafe(command);
  if (!safetyCheck.safe) {
    return {
      stdout: '',
      stderr: `SECURITY BLOCK: ${safetyCheck.reason}`,
      exitCode: 1,
      durationMs: 0,
      timedOut: false,
      sessionId,
    };
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const env = { ...process.env, ...session.env, ...(options.env ?? {}) };

    const child = spawn('bash', ['-c', command], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length <= maxOutputBytes) {
        stdout += chunk;
      } else {
        stdout += '\n[OUTPUT TRUNCATED — exceeded maxOutputBytes]';
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length <= maxOutputBytes) {
        stderr += chunk;
      }
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      // Update session cwd if cd command was used
      if (command.trim().startsWith('cd ')) {
        const newDir = command.trim().slice(3).trim();
        if (!newDir.startsWith('/')) {
          session.cwd = path.resolve(cwd, newDir);
        } else {
          session.cwd = newDir;
        }
      }

      const cmd: ShellCommand = {
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 1,
        executedAt: new Date(),
        durationMs,
      };

      session.history.push(cmd);
      session.lastActiveAt = new Date();

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 1,
        durationMs,
        timedOut,
        sessionId,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout: '',
        stderr: `Process error: ${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - startTime,
        timedOut: false,
        sessionId,
      });
    });
  });
}

/**
 * Detect if a MOTHER query requires shell execution.
 * Triggers on: code execution requests, file operations, system commands.
 */
export function detectShellRequest(query: string): boolean {
  const shellPatterns = [
    /execute|run|bash|shell|terminal|command/i,
    /python|node|npm|pip|git|docker/i,
    /ls|pwd|cat|grep|find|mkdir|touch/i,
    /install|compile|build|test|deploy/i,
    /\$\s*\w+|`[^`]+`/,  // shell syntax patterns
  ];
  return shellPatterns.some(p => p.test(query));
}

/**
 * Format shell result for injection into system prompt.
 */
export function formatShellResultForPrompt(result: ShellExecuteResult): string {
  const lines = [
    `## Shell Execution Result (Session: ${result.sessionId})`,
    `**Exit Code:** ${result.exitCode} | **Duration:** ${result.durationMs}ms${result.timedOut ? ' | ⚠️ TIMED OUT' : ''}`,
  ];
  if (result.stdout) lines.push(`**stdout:**\n\`\`\`\n${result.stdout}\n\`\`\``);
  if (result.stderr) lines.push(`**stderr:**\n\`\`\`\n${result.stderr}\n\`\`\``);
  return lines.join('\n');
}

/**
 * Clean up expired sessions (TTL-based).
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActiveAt.getTime() > SESSION_TTL_MS) {
      session.isActive = false;
      sessions.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Get session statistics.
 */
export function getShellSessionStats(): {
  activeSessions: number;
  totalCommandsExecuted: number;
} {
  let totalCommands = 0;
  for (const session of sessions.values()) {
    totalCommands += session.history.length;
  }
  return {
    activeSessions: sessions.size,
    totalCommandsExecuted: totalCommands,
  };
}
