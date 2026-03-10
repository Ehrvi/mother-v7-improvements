/**
 * Parallel Map Engine — server/mother/parallel-map-engine.ts
 * MOTHER v96.0 | Ciclo C214 | NC-SENS-006
 *
 * Enables MOTHER to spawn parallel subtasks for homogeneous operations,
 * similar to Manus's `map` tool — up to 50 parallel subtasks.
 *
 * Scientific basis:
 * - Shen et al. (2024) "HuggingGPT: Solving AI Tasks with ChatGPT and its Friends in HuggingFace"
 *   arXiv:2303.17580 — parallel task decomposition
 * - Wu et al. (2023) "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation"
 *   arXiv:2308.08155 — multi-agent parallel execution
 * - Dean & Ghemawat (2008) "MapReduce: Simplified Data Processing on Large Clusters"
 *   OSDI 2004 — map-reduce paradigm
 */

import { invokeLLM, type InvokeResult } from '../_core/llm';

export interface MapSubtask {
  id: string;
  input: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface MapJobResult {
  jobId: string;
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;
  results: MapSubtask[];
  totalDurationMs: number;
  successRate: number;
}

export interface MapJobConfig {
  promptTemplate: string;    // Template with {{input}} placeholder
  inputs: string[];          // Array of inputs to process in parallel
  maxConcurrency?: number;   // Max parallel executions (default: 10, max: 50)
  timeoutMs?: number;        // Per-subtask timeout (default: 30000)
  model?: string;            // LLM model to use
}

const MAX_CONCURRENCY = 50;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Detect if a query requires parallel map processing.
 */
export function detectMapRequest(query: string): {
  isMapRequest: boolean;
  estimatedSubtasks: number;
  reason: string;
} {
  const mapPatterns = [
    { pattern: /analyze\s+(?:each|all|every)\s+\d+/i, tasks: 'multiple' },
    { pattern: /for\s+each\s+(?:of\s+)?(?:the\s+)?\d+/i, tasks: 'multiple' },
    { pattern: /process\s+(?:all|each|every)\s+(?:the\s+)?\d+/i, tasks: 'multiple' },
    { pattern: /\b(\d+)\s+(?:companies|items|records|entries|files|urls|domains)\b/i, tasks: 'counted' },
    { pattern: /in\s+parallel|simultaneously|concurrently|at\s+the\s+same\s+time/i, tasks: 'parallel' },
  ];

  for (const { pattern, tasks } of mapPatterns) {
    const match = query.match(pattern);
    if (match) {
      const countMatch = query.match(/\b(\d+)\b/);
      const estimatedSubtasks = countMatch ? parseInt(countMatch[1]) : 5;
      return {
        isMapRequest: true,
        estimatedSubtasks: Math.min(estimatedSubtasks, MAX_CONCURRENCY),
        reason: `Query requires parallel processing (${tasks}): "${match[0]}"`,
      };
    }
  }

  return { isMapRequest: false, estimatedSubtasks: 0, reason: 'No parallel processing required' };
}

/**
 * Execute a parallel map job with controlled concurrency.
 * Uses Promise.allSettled with concurrency limiting.
 */
export async function executeMapJob(config: MapJobConfig): Promise<MapJobResult> {
  const jobId = `map-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const concurrency = Math.min(config.maxConcurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  // Create subtasks
  const subtasks: MapSubtask[] = config.inputs.map((input, idx) => ({
    id: `${jobId}-${idx}`,
    input,
    prompt: config.promptTemplate.replace('{{input}}', input),
    status: 'pending' as const,
  }));

  // Execute with concurrency control
  const results: MapSubtask[] = [];
  const queue = [...subtasks];

  async function processSubtask(subtask: MapSubtask): Promise<MapSubtask> {
    subtask.status = 'running';
    subtask.startedAt = new Date();

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Subtask timeout')), timeoutMs)
      );

      const llmPromise = invokeLLM({
        messages: [{ role: 'user', content: subtask.prompt }],
        model: config.model,
        maxTokens: 1000,
      });

      const response: InvokeResult = await Promise.race([llmPromise, timeoutPromise]);
      const firstChoice = response.choices?.[0];
      const content = firstChoice?.message?.content;
      subtask.result = typeof content === 'string' ? content : JSON.stringify(content);
      subtask.status = 'completed';
    } catch (err) {
      subtask.error = err instanceof Error ? err.message : String(err);
      subtask.status = 'failed';
    }

    subtask.completedAt = new Date();
    subtask.durationMs = subtask.completedAt.getTime() - (subtask.startedAt?.getTime() ?? 0);
    return subtask;
  }

  // Process in batches of `concurrency`
  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.allSettled(batch.map(processSubtask));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Should not happen since processSubtask catches errors internally
        results.push({ ...batch[0], status: 'failed', error: result.reason?.message });
      }
    }
  }

  const completedSubtasks = results.filter(r => r.status === 'completed').length;
  const failedSubtasks = results.filter(r => r.status === 'failed').length;

  return {
    jobId,
    totalSubtasks: subtasks.length,
    completedSubtasks,
    failedSubtasks,
    results,
    totalDurationMs: Date.now() - startTime,
    successRate: completedSubtasks / subtasks.length,
  };
}

/**
 * Format map job results for user presentation.
 */
export function formatMapJobResults(job: MapJobResult): string {
  const lines = [
    `## Parallel Map Job — ${job.jobId}`,
    `**Subtasks:** ${job.completedSubtasks}/${job.totalSubtasks} completed | ${job.failedSubtasks} failed`,
    `**Success Rate:** ${(job.successRate * 100).toFixed(1)}%`,
    `**Total Duration:** ${(job.totalDurationMs / 1000).toFixed(1)}s`,
    '',
    '### Results:',
  ];

  for (const subtask of job.results) {
    lines.push(`\n**[${subtask.id}]** Input: \`${subtask.input.slice(0, 50)}...\``);
    if (subtask.status === 'completed' && subtask.result) {
      lines.push(subtask.result.slice(0, 500));
    } else if (subtask.status === 'failed') {
      lines.push(`❌ Error: ${subtask.error}`);
    }
  }

  return lines.join('\n');
}
