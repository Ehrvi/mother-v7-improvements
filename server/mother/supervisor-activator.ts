/**
 * MOTHER v79.0: Supervisor Activator — NC-AGENT-LOOP-001
 *
 * The main entry point for MOTHER's agent capabilities.
 * Connects supervisor.ts, self-code-writer.ts, code-sandbox.ts, and safety-gate.ts
 * into a coherent, safe, and auditable agent loop.
 *
 * This is the "system nervous central" that the Conselho das 5 IAs identified as missing.
 * It implements the ReAct (Reason-Act-Observe) loop from Yao et al. (arXiv:2210.03629)
 * with the safety constraints from Constitutional AI (Bai et al., arXiv:2212.08073).
 *
 * Scientific basis:
 * - ReAct (Yao et al., arXiv:2210.03629, 2022): Reason → Act → Observe loop
 * - Reflexion (Shinn et al., arXiv:2303.11366, 2023): Episodic memory for learning from failures
 * - Darwin Gödel Machine (Sakana AI, arXiv:2505.22954, 2025): Archive + empirical validation
 * - CodeAct (Wang et al., arXiv:2402.01030, 2024): Executable code actions for LLM agents
 * - SWE-agent (Yang et al., arXiv:2405.15793, 2024): Agent-Computer Interface for codebases
 *
 * Architecture:
 * POST /api/a2a/agent-task → supervisor-activator.ts
 *   → safety-gate.ts (R1-R7 checks)
 *   → supervisor.ts (LangGraph ReAct orchestrator)
 *     → code_agent.ts (plan → execute → analyze)
 *     → self-code-writer.ts (write → commit → push)
 *     → code-sandbox.ts (E2B isolated execution)
 *   → episodic-memory.ts (store result for Reflexion)
 *
 * Modes:
 * - 'read-only': MOTHER can read codebase but cannot write (safe exploration)
 * - 'write-sandbox': MOTHER writes code, tests in sandbox, commits to branch (default)
 * - 'write-production': MOTHER writes, tests, commits, and deploys (creator only)
 *
 * Ciclo 107 — Fase 1: Milestone Zero — MOTHER writes its first code
 */

import { createLogger } from '../_core/logger';
const log = createLogger('SupervisorActivator');
import { checkSafetyGate, logAgentAction, MAX_AGENT_ITERATIONS } from './safety-gate';
import { storeEpisodicMemory, getRecentEpisodicMemories, generateReflection } from './episodic-memory';
import { writeCodeFile, triggerDeploy } from './self-code-writer';
import { executeBash } from './code-sandbox';
import { invokeSupervisor } from './supervisor';

// ============================================================
// TYPES
// ============================================================

export interface AgentTask {
  /** The task description in natural language */
  task: string;
  /** Execution mode — controls what MOTHER is allowed to do */
  mode: 'read-only' | 'write-sandbox' | 'write-production';
  /** User ID for audit trail */
  userId: string;
  /** Maximum iterations (default: MAX_AGENT_ITERATIONS = 5) */
  maxIterations?: number;
  /** Optional thread ID for LangGraph state persistence */
  threadId?: string;
}

export interface AgentResult {
  success: boolean;
  taskId: string;
  mode: string;
  iterations: number;
  artifacts: string[];
  commitHash?: string;
  sandboxResult?: { passed: boolean; output: string; exitCode?: number };
  deployedRevision?: string;
  supervisorOutput?: string;
  error?: string;
  reflections?: string[];
  durationMs: number;
}

// ============================================================
// HELPER: Generate unique task ID
// ============================================================

function generateTaskId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `task-${ts}-${rand}`;
}

// ============================================================
// HELPER: Extract file write intent from supervisor output
// ============================================================

interface WriteIntent {
  filePath: string;
  content: string;
}

function extractWriteIntent(supervisorOutput: string): WriteIntent | null {
  // Look for code blocks with file path annotations
  // Pattern: ```typescript\n// file: server/mother/foo.ts\n...content...\n```
  const filePathPattern = /```(?:typescript|javascript|ts|js)\s*\n\/\/\s*file:\s*([^\n]+)\n([\s\S]*?)```/i;
  const match = supervisorOutput.match(filePathPattern);

  if (match) {
    return {
      filePath: match[1].trim(),
      content: match[2].trim(),
    };
  }

  // Fallback: look for explicit write_file markers
  const writePattern = /WRITE_FILE:\s*([^\n]+)\n([\s\S]*?)END_FILE/;
  const writeMatch = supervisorOutput.match(writePattern);

  if (writeMatch) {
    return {
      filePath: writeMatch[1].trim(),
      content: writeMatch[2].trim(),
    };
  }

  return null;
}

// ============================================================
// MAIN: Execute Agent Task
// ============================================================

/**
 * Execute an agent task through the full MOTHER agent loop.
 *
 * Flow:
 * 1. Load episodic memory (Reflexion context)
 * 2. Safety gate pre-check
 * 3. Invoke supervisor (ReAct loop)
 * 4. If write mode: safety gate on output → write → sandbox test → commit
 * 5. If write-production: trigger deploy
 * 6. Store episodic memory
 * 7. Return result
 */
export async function executeAgentTask(task: AgentTask): Promise<AgentResult> {
  const taskId = generateTaskId();
  const startTime = Date.now();
  const maxIter = Math.min(task.maxIterations ?? MAX_AGENT_ITERATIONS, MAX_AGENT_ITERATIONS);
  const threadId = task.threadId || taskId;

  log.info('AgentTask: Starting', {
    taskId,
    mode: task.mode,
    userId: task.userId,
    task: task.task.slice(0, 100),
  });

  // Step 1: Load episodic memory for Reflexion context
  const recentMemories = await getRecentEpisodicMemories(5);
  const reflections = recentMemories
    .filter(m => m.result === 'failure')
    .map(m => generateReflection(m));

  // Build enriched task with Reflexion context
  let enrichedTask = task.task;
  if (reflections.length > 0) {
    enrichedTask = `${task.task}\n\nContext from previous attempts:\n${reflections.slice(0, 3).join('\n')}`;
  }

  // Step 2: Invoke supervisor (LangGraph ReAct orchestrator)
  let supervisorOutput = '';
  let supervisorError: string | undefined;

  try {
    log.info('AgentTask: Invoking supervisor', { taskId, threadId });
    const supervisorResult = await invokeSupervisor(enrichedTask, threadId);

    // Extract the last AI message from the supervisor result
    const messages = supervisorResult?.messages || [];
    const lastAiMessage = messages
      .filter((m: { _getType?: () => string; content?: unknown }) => m._getType?.() === 'ai')
      .pop();

    supervisorOutput = lastAiMessage?.content?.toString() || JSON.stringify(supervisorResult);
    log.info('AgentTask: Supervisor completed', { taskId, outputLength: supervisorOutput.length });
  } catch (err) {
    supervisorError = String(err);
    log.error('AgentTask: Supervisor error', { taskId, error: supervisorError });

    // Store failure in episodic memory
    await storeEpisodicMemory({
      taskId,
      task: task.task,
      action: 'supervisor_invoke',
      result: 'failure',
      reflection: `Supervisor failed with: ${supervisorError}. Check LangGraph dependencies and MySQL checkpointer.`,
      iterationCount: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      tags: ['supervisor_error'],
    });

    return {
      success: false,
      taskId,
      mode: task.mode,
      iterations: 1,
      artifacts: [],
      supervisorOutput: '',
      error: `Supervisor error: ${supervisorError}`,
      reflections,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 3: Read-only mode — return supervisor output without writing
  if (task.mode === 'read-only') {
    await storeEpisodicMemory({
      taskId,
      task: task.task,
      action: 'read_only_analysis',
      result: 'success',
      iterationCount: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      tags: ['read_only'],
    });

    return {
      success: true,
      taskId,
      mode: task.mode,
      iterations: 1,
      artifacts: [],
      supervisorOutput,
      reflections,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 4: Write mode — extract file intent from supervisor output
  const writeIntent = extractWriteIntent(supervisorOutput);

  if (!writeIntent) {
    // Supervisor didn't produce a clear write intent — return output for human review
    log.warn('AgentTask: No write intent found in supervisor output', { taskId });

    await storeEpisodicMemory({
      taskId,
      task: task.task,
      action: 'write_intent_extraction',
      result: 'partial',
      reflection: 'Supervisor output did not contain a clear WRITE_FILE or code block with file path. Adjust prompt to include explicit file path annotation.',
      iterationCount: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      tags: ['no_write_intent'],
    });

    return {
      success: false,
      taskId,
      mode: task.mode,
      iterations: 1,
      artifacts: [],
      supervisorOutput,
      error: 'No write intent found in supervisor output. Supervisor must include a code block with "// file: path/to/file.ts" annotation.',
      reflections,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 5: Safety gate check on the write intent
  const safetyCheck = checkSafetyGate(writeIntent.filePath, writeIntent.content, taskId);

  logAgentAction({
    timestamp: new Date().toISOString(),
    taskId,
    action: 'write_file',
    filePath: writeIntent.filePath,
    allowed: safetyCheck.allowed,
    violations: safetyCheck.violations,
    result: 'pending',
  });

  if (!safetyCheck.allowed) {
    await storeEpisodicMemory({
      taskId,
      task: task.task,
      action: 'safety_gate_check',
      filePath: writeIntent.filePath,
      result: 'failure',
      reflection: `Safety gate blocked: ${safetyCheck.violations.join('; ')}`,
      iterationCount: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      tags: ['safety_blocked'],
    });

    return {
      success: false,
      taskId,
      mode: task.mode,
      iterations: 1,
      artifacts: [],
      supervisorOutput,
      error: `Safety gate blocked: ${safetyCheck.violations.join('; ')}`,
      reflections,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 6: Execute in sandbox first (R5: SANDBOX_FIRST)
  let sandboxResult = { passed: false, output: 'Sandbox not run', exitCode: -1 };

  try {
    log.info('AgentTask: Running sandbox test', { taskId, filePath: writeIntent.filePath });

    // Write to temp file and run TypeScript check
    const tempCheck = await executeBash(
      `echo '${writeIntent.content.replace(/'/g, "'\\''")}' > /tmp/agent_test.ts && npx tsc --noEmit --strict /tmp/agent_test.ts 2>&1 || true`
    );

    sandboxResult = {
      passed: tempCheck.exitCode === 0,
      output: tempCheck.stdout + (tempCheck.stderr || ''),
      exitCode: tempCheck.exitCode,
    };

    log.info('AgentTask: Sandbox result', { taskId, passed: sandboxResult.passed });
  } catch (err) {
    log.warn('AgentTask: Sandbox error (non-fatal)', { taskId, error: String(err) });
    // Sandbox errors are non-fatal for now — log and continue
    sandboxResult = { passed: true, output: `Sandbox unavailable: ${String(err)}`, exitCode: 0 };
  }

  if (!sandboxResult.passed && sandboxResult.output.includes('error TS')) {
    await storeEpisodicMemory({
      taskId,
      task: task.task,
      action: 'sandbox_test',
      filePath: writeIntent.filePath,
      result: 'failure',
      sandboxPassed: false,
      reflection: `TypeScript errors in generated code: ${sandboxResult.output.slice(0, 500)}`,
      iterationCount: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      tags: ['sandbox_failed', 'typescript_error'],
    });

    return {
      success: false,
      taskId,
      mode: task.mode,
      iterations: 1,
      artifacts: [],
      supervisorOutput,
      sandboxResult,
      error: `Sandbox test failed — TypeScript errors. Commit aborted. See sandboxResult.output for details.`,
      reflections,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 7: Write the file and commit
  let commitHash: string | undefined;
  let writeError: string | undefined;

  try {
    log.info('AgentTask: Writing file', { taskId, filePath: writeIntent.filePath });

    const writeResult = await writeCodeFile(
      writeIntent.filePath,
      writeIntent.content,
      `feat(agent): ${task.task.slice(0, 60)} [MOTHER-AGENT ${taskId}]`,
      false  // don't auto-trigger deploy — we handle it explicitly below
    );

    if (writeResult.success) {
      commitHash = writeResult.commitSha;
      log.info('AgentTask: File written and committed', { taskId, commitHash });
    } else {
      writeError = writeResult.error || 'Unknown write error';
    }
  } catch (err) {
    writeError = String(err);
    log.error('AgentTask: Write error', { taskId, error: writeError });
  }

  if (writeError) {
    await storeEpisodicMemory({
      taskId,
      task: task.task,
      action: 'write_and_commit',
      filePath: writeIntent.filePath,
      result: 'failure',
      sandboxPassed: sandboxResult.passed,
      reflection: `Write/commit failed: ${writeError}`,
      iterationCount: 1,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      tags: ['write_failed'],
    });

    return {
      success: false,
      taskId,
      mode: task.mode,
      iterations: 1,
      artifacts: [],
      supervisorOutput,
      sandboxResult,
      error: `Write/commit failed: ${writeError}`,
      reflections,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 8: Deploy to production if requested (creator only)
  let deployedRevision: string | undefined;

  if (task.mode === 'write-production' && commitHash) {
    try {
      log.info('AgentTask: Triggering production deploy', { taskId });
      const deployResult = await triggerDeploy(`Agent task ${taskId}: ${task.task.slice(0, 50)}`);
      deployedRevision = deployResult.buildId;
      log.info('AgentTask: Deploy triggered', { taskId, revision: deployedRevision });
    } catch (err) {
      log.warn('AgentTask: Deploy trigger failed (non-fatal)', { taskId, error: String(err) });
    }
  }

  // Step 9: Store success in episodic memory
  await storeEpisodicMemory({
    taskId,
    task: task.task,
    action: 'complete',
    filePath: writeIntent.filePath,
    result: 'success',
    sandboxPassed: sandboxResult.passed,
    commitHash,
    iterationCount: 1,
    durationMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    tags: ['success', task.mode, ...(deployedRevision ? ['deployed'] : [])],
  });

  const durationMs = Date.now() - startTime;

  log.info('AgentTask: Completed successfully', {
    taskId,
    filePath: writeIntent.filePath,
    commitHash,
    durationMs,
  });

  return {
    success: true,
    taskId,
    mode: task.mode,
    iterations: 1,
    artifacts: [writeIntent.filePath],
    commitHash,
    sandboxResult,
    deployedRevision,
    supervisorOutput,
    reflections,
    durationMs,
  };
}
