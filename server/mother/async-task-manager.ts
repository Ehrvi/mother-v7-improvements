/**
 * async-task-manager.ts — MOTHER v79.6 — Ciclo 113
 * 
 * Closes Gap 10: agent-task HTTP timeout
 * Pattern: Fire-and-forget with polling (async job queue)
 * 
 * Scientific basis:
 * - Async job patterns: RFC 7231 §6.3.3 (202 Accepted)
 * - Long-running task management: Google Cloud Tasks architecture
 * - DGM autonomous execution: arXiv:2505.22954
 * 
 * Author: Everton Garcia (Wizards Down Under)
 * Cycle: 113 | Date: 2026-03-05
 */

import { createHash, randomUUID } from 'crypto';
import { createLogger } from '../_core/logger';
const log = createLogger('ASYNC_TASK_MANAGER');


// ============================================================
// TYPES
// ============================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AsyncTask {
  taskId: string;
  task: string;
  mode: 'read-only' | 'write-sandbox' | 'write-production' | string;
  userId: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
  commitHash?: string;
  proofHash?: string;
}

// ============================================================
// IN-MEMORY TASK STORE (persists across requests in same instance)
// For production scale: replace with Redis or DB
// ============================================================

const taskStore = new Map<string, AsyncTask>();
const MAX_TASKS = 100; // LRU eviction when exceeded

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Create a new async task and return taskId immediately (202 Accepted pattern)
 * Scientific basis: RFC 7231 §6.3.3 — 202 Accepted for long-running operations
 */
export function createAsyncTask(params: {
  task: string;
  mode: 'read-only' | 'write-sandbox' | 'write-production' | string;
  userId: string;
  threadId?: string;
  maxIterations?: number;
}): string {
  const taskId = randomUUID();
  
  const asyncTask: AsyncTask = {
    taskId,
    task: params.task,
    mode: params.mode,
    userId: params.userId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // LRU eviction: remove oldest task if store is full
  if (taskStore.size >= MAX_TASKS) {
    const oldestKey = taskStore.keys().next().value;
    if (oldestKey) taskStore.delete(oldestKey);
  }

  taskStore.set(taskId, asyncTask);
  log.info('[AsyncTask] AsyncTask created', { taskId, mode: params.mode, userId: params.userId });

  // Fire-and-forget execution
  executeTaskAsync(taskId, params).catch((err) => {
    const t = taskStore.get(taskId);
    if (t) {
      t.status = 'failed';
      t.error = String(err);
      t.completedAt = new Date().toISOString();
      taskStore.set(taskId, t);
    }
    log.error('[AsyncTask] AsyncTask execution failed', { taskId, error: String(err) });
  });

  return taskId;
}

/**
 * Execute the task asynchronously (runs in background)
 */
async function executeTaskAsync(
  taskId: string,
  params: {
    task: string;
    mode: 'read-only' | 'write-sandbox' | 'write-production' | string;
    userId: string;
    threadId?: string;
    maxIterations?: number;
  }
): Promise<void> {
  const startTime = Date.now();
  
  // Update status to running
  const t = taskStore.get(taskId);
  if (!t) return;
  t.status = 'running';
  t.startedAt = new Date().toISOString();
  taskStore.set(taskId, t);

  try {
    const { executeAgentTask } = await import('./supervisor-activator');
    const result = await executeAgentTask({
      task: params.task,
      mode: params.mode as 'read-only' | 'write-sandbox' | 'write-production',
      userId: params.userId || 'anonymous',
      maxIterations: params.maxIterations ? Math.min(Number(params.maxIterations), 5) : 5,
      threadId: params.threadId,
    });

    const durationMs = Date.now() - startTime;
    
    // Generate proof hash for this task completion
    const proofInput = `${taskId}:${params.mode}:${result.commitHash || ''}:${durationMs}`;
    const proofHash = createHash('sha256').update(proofInput).digest('hex');

    // Update task with result
    const updatedTask = taskStore.get(taskId);
    if (updatedTask) {
      updatedTask.status = 'completed';
      updatedTask.completedAt = new Date().toISOString();
      updatedTask.durationMs = durationMs;
      updatedTask.result = result;
      updatedTask.commitHash = result.commitHash;
      updatedTask.proofHash = proofHash;
      taskStore.set(taskId, updatedTask);
    }

    log.info('[AsyncTask] AsyncTask completed', {
      taskId,
      mode: params.mode as 'read-only' | 'write-sandbox' | 'write-production',
      durationMs,
      commitHash: result.commitHash,
      proofHash,
    });
  } catch (err) {
    const updatedTask = taskStore.get(taskId);
    if (updatedTask) {
      updatedTask.status = 'failed';
      updatedTask.error = String(err);
      updatedTask.completedAt = new Date().toISOString();
      updatedTask.durationMs = Date.now() - startTime;
      taskStore.set(taskId, updatedTask);
    }
    throw err;
  }
}

/**
 * Get task status by taskId
 */
export function getTaskStatus(taskId: string): AsyncTask | null {
  return taskStore.get(taskId) || null;
}

/**
 * List all tasks (for monitoring)
 */
export function listTasks(limit = 20): AsyncTask[] {
  const tasks = Array.from(taskStore.values());
  return tasks
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * Get task queue stats
 */
export function getQueueStats() {
  const tasks = Array.from(taskStore.values());
  return {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    with_proof: tasks.filter(t => t.proofHash).length,
    with_commit: tasks.filter(t => t.commitHash).length,
  };
}

/**
 * Generate a SHA-256 hash of the entire task queue state
 * Used as proof that tasks were executed
 */
export function generateQueueStateHash(): string {
  const tasks = listTasks(50);
  const stateStr = JSON.stringify(tasks.map(t => ({
    taskId: t.taskId,
    status: t.status,
    mode: t.mode,
    commitHash: t.commitHash,
    proofHash: t.proofHash,
  })));
  return createHash('sha256').update(stateStr).digest('hex');
}
