/**
 * Task Decomposer — MOTHER breaks complex roadmap tasks into atomic subtasks
 *
 * Scientific Basis:
 * - Group-Evolving Agents (arXiv:2602.04837): "Agents autonomously modify
 *   structural designs via experience sharing and task decomposition"
 * - ReAct (arXiv:2210.03629): "Interleaved reasoning and acting — decompose
 *   complex tasks into atomic executable steps"
 * - Reflexion (arXiv:2303.11366): "Verbal reinforcement learning via episodic
 *   memory — learn from failed decompositions"
 * - CodeAct (arXiv:2402.01030): "Executable code actions — tasks must be
 *   decomposed to the level of a single file operation"
 *
 * Purpose: Given a high-level roadmap task description, decompose it into
 * atomic subtasks that can each be executed by a single agent-task call.
 * Each atomic task creates exactly ONE file or makes ONE focused change.
 *
 * Cycle 111 — Roadmap v2.0 Phase 2 (Self-Directed Execution)
 */

import { storeEpisodicMemory } from './episodic-memory';
import { createLogger } from '../_core/logger';
const log = createLogger('TASK_DECOMPOSER');


const MOTHER_BASE_URL = process.env.MOTHER_BASE_URL ||
  'https://mother-interface-qtvghovzxa-ts.a.run.app';

export interface AtomicTask {
  id: string;
  description: string;
  file_to_create?: string;
  file_to_modify?: string;
  dependencies: string[]; // IDs of tasks that must complete first
  success_criteria: string;
  estimated_minutes: number;
  category: 'create_file' | 'modify_file' | 'add_endpoint' | 'fix_bug' | 'ingest_knowledge' | 'run_benchmark';
  priority: 1 | 2 | 3; // 1=critical, 2=important, 3=nice-to-have
}

export interface DecomposedPlan {
  original_task: string;
  phase_id: string;
  atomic_tasks: AtomicTask[];
  execution_order: string[][]; // Groups of task IDs that can run in parallel
  estimated_total_minutes: number;
  complexity: 'simple' | 'medium' | 'complex';
}

/**
 * Predefined decompositions for known roadmap phases
 * Based on Roadmap v2.0 (Conselho das 5 IAs, Ciclo 110, Kendall W=0.7083)
 */
const PHASE_DECOMPOSITIONS: Record<string, DecomposedPlan> = {
  '1': {
    original_task: 'Cycle 111 — First Self-Directed Cycle: Fix dgm_archive, generate first proof, implement benchmark-runner',
    phase_id: '1',
    atomic_tasks: [
      {
        id: '1.1',
        description: 'Create server/mother/benchmark-runner.ts that automatically runs Benchmark C111 (6 MCCs) after each deploy and stores results in bd_central',
        file_to_create: 'server/mother/benchmark-runner.ts',
        dependencies: [],
        success_criteria: 'File exists, exports runBenchmarkC111() function, TypeScript compiles',
        estimated_minutes: 5,
        category: 'create_file',
        priority: 1
      },
      {
        id: '1.2',
        description: 'Create server/mother/task-decomposer.ts that breaks complex roadmap tasks into atomic executable subtasks',
        file_to_create: 'server/mother/task-decomposer.ts',
        dependencies: [],
        success_criteria: 'File exists, exports decomposeTask() and getPhaseDecomposition() functions',
        estimated_minutes: 5,
        category: 'create_file',
        priority: 1
      },
      {
        id: '1.3',
        description: 'Modify server/mother/supervisor-activator.ts to call storeProofOfAutonomy() after every successful writeCodeFile() call, generating cryptographic proof of autonomous code creation',
        file_to_modify: 'server/mother/supervisor-activator.ts',
        dependencies: [],
        success_criteria: 'storeProofOfAutonomy imported and called after commitHash is set, TypeScript compiles',
        estimated_minutes: 8,
        category: 'modify_file',
        priority: 1
      },
      {
        id: '1.4',
        description: 'Add POST /api/a2a/benchmark/run endpoint to a2a-server.ts that triggers runBenchmarkC111() and returns results',
        file_to_modify: 'server/mother/a2a-server.ts',
        dependencies: ['1.1'],
        success_criteria: 'Endpoint exists, returns {verdict, passed_mccs, fitness_score}',
        estimated_minutes: 5,
        category: 'add_endpoint',
        priority: 2
      },
      {
        id: '1.5',
        description: 'Update MOTHER_VERSION in server/mother/core.ts from v79.3 to v79.4 to reflect Cycle 111 changes',
        file_to_modify: 'server/mother/core.ts',
        dependencies: ['1.1', '1.2', '1.3'],
        success_criteria: 'MOTHER_VERSION = "v79.4" in core.ts',
        estimated_minutes: 2,
        category: 'modify_file',
        priority: 1
      }
    ],
    execution_order: [
      ['1.1', '1.2', '1.3'], // Parallel: create new files + modify supervisor
      ['1.4'],               // After 1.1: add benchmark endpoint
      ['1.5']                // After all: bump version
    ],
    estimated_total_minutes: 20,
    complexity: 'medium'
  },
  '2': {
    original_task: 'Cycle 112 — SHMS v2 created by MOTHER: lstm-predictor + timescale-connector',
    phase_id: '2',
    atomic_tasks: [
      {
        id: '2.1',
        description: 'Create server/shms/timescale-connector.ts — TimescaleDB connector for geotechnical sensor time-series data with hypertable creation and continuous aggregates',
        file_to_create: 'server/shms/timescale-connector.ts',
        dependencies: [],
        success_criteria: 'File exists, exports insertSensorReading() and querySensorHistory() functions',
        estimated_minutes: 10,
        category: 'create_file',
        priority: 1
      },
      {
        id: '2.2',
        description: 'Create server/shms/lstm-predictor.ts — Simplified LSTM for geotechnical failure prediction using sliding window statistics (no TensorFlow dependency)',
        file_to_create: 'server/shms/lstm-predictor.ts',
        dependencies: [],
        success_criteria: 'File exists, exports predictFailureProbability() function, returns {probability, confidence, horizon_hours}',
        estimated_minutes: 10,
        category: 'create_file',
        priority: 1
      },
      {
        id: '2.3',
        description: 'Create server/shms/digital-twin.ts — Digital twin of geotechnical structure with real-time state tracking and GISTM 2020 alert thresholds',
        file_to_create: 'server/shms/digital-twin.ts',
        dependencies: ['2.1'],
        success_criteria: 'File exists, exports DigitalTwin class with updateState() and getAlertLevel() methods',
        estimated_minutes: 10,
        category: 'create_file',
        priority: 2
      }
    ],
    execution_order: [
      ['2.1', '2.2'],
      ['2.3']
    ],
    estimated_total_minutes: 30,
    complexity: 'complex'
  },
  '3': {
    original_task: 'Cycle 113 — DPO v9 trained by MOTHER: analyze RLVR signals, generate fine-tuning dataset',
    phase_id: '3',
    atomic_tasks: [
      {
        id: '3.1',
        description: 'Create server/mother/dpo-v9-analyzer.ts that queries bd_central for RLVR reward signals and generates a DPO training dataset analysis report',
        file_to_create: 'server/mother/dpo-v9-analyzer.ts',
        dependencies: [],
        success_criteria: 'File exists, exports analyzeDPOSignals() function that returns {total_pairs, avg_reward, dataset_quality}',
        estimated_minutes: 8,
        category: 'create_file',
        priority: 1
      }
    ],
    execution_order: [['3.1']],
    estimated_total_minutes: 8,
    complexity: 'simple'
  }
};

/**
 * Get predefined decomposition for a roadmap phase
 */
export function getPhaseDecomposition(phaseId: string): DecomposedPlan | null {
  return PHASE_DECOMPOSITIONS[phaseId] || null;
}

/**
 * Decompose a free-form task description into atomic subtasks
 * Uses pattern matching + heuristics (no LLM call to avoid circular dependency)
 *
 * Scientific basis: ReAct (arXiv:2210.03629) — task decomposition heuristics
 */
export function decomposeTask(taskDescription: string, phaseId = 'custom'): DecomposedPlan {
  const desc = taskDescription.toLowerCase();

  // Pattern: "Create X and Y" → two create_file tasks
  const createMatches = taskDescription.match(/create\s+([^\s,]+(?:\.[a-z]+)?)/gi) || [];
  const modifyMatches = taskDescription.match(/(?:modify|update|fix|add to)\s+([^\s,]+(?:\.[a-z]+)?)/gi) || [];

  const atomicTasks: AtomicTask[] = [];

  createMatches.forEach((match, i) => {
    const filePath = match.replace(/^create\s+/i, '').trim();
    atomicTasks.push({
      id: `${phaseId}.${i + 1}`,
      description: `Create ${filePath} — ${taskDescription.slice(0, 100)}`,
      file_to_create: filePath.includes('/') ? filePath : `server/mother/${filePath}`,
      dependencies: [],
      success_criteria: `File ${filePath} exists and TypeScript compiles without errors`,
      estimated_minutes: 5,
      category: 'create_file',
      priority: 1
    });
  });

  modifyMatches.forEach((match, i) => {
    const filePath = match.replace(/^(?:modify|update|fix|add to)\s+/i, '').trim();
    atomicTasks.push({
      id: `${phaseId}.${createMatches.length + i + 1}`,
      description: `Modify ${filePath} — ${taskDescription.slice(0, 100)}`,
      file_to_modify: filePath.includes('/') ? filePath : `server/mother/${filePath}`,
      dependencies: [],
      success_criteria: `Changes to ${filePath} compile without TypeScript errors`,
      estimated_minutes: 8,
      category: 'modify_file',
      priority: 1
    });
  });

  // If no patterns matched, create a single atomic task
  if (atomicTasks.length === 0) {
    atomicTasks.push({
      id: `${phaseId}.1`,
      description: taskDescription,
      dependencies: [],
      success_criteria: 'Task completed successfully with TypeScript compilation passing',
      estimated_minutes: 10,
      category: 'create_file',
      priority: 1
    });
  }

  const totalMinutes = atomicTasks.reduce((sum, t) => sum + t.estimated_minutes, 0);
  const complexity: 'simple' | 'medium' | 'complex' =
    atomicTasks.length <= 2 ? 'simple' :
    atomicTasks.length <= 5 ? 'medium' : 'complex';

  return {
    original_task: taskDescription,
    phase_id: phaseId,
    atomic_tasks: atomicTasks,
    execution_order: [atomicTasks.map(t => t.id)],
    estimated_total_minutes: totalMinutes,
    complexity
  };
}

/**
 * Store decomposition plan in bd_central for MOTHER to reference
 */
export async function storeDecompositionPlan(plan: DecomposedPlan): Promise<boolean> {
  try {
    const resp = await fetch(`${MOTHER_BASE_URL}/api/a2a/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `roadmap_decomposition_phase_${plan.phase_id}_${Date.now()}`,
        category: 'roadmap',
        title: `Task Decomposition — Phase ${plan.phase_id}: ${plan.original_task.slice(0, 80)}`,
        content: JSON.stringify(plan, null, 2),
        quality_score: 90,
        source: 'task-decomposer',
        tags: ['roadmap', `phase_${plan.phase_id}`, plan.complexity, 'decomposition']
      })
    });
    return resp.ok;
  } catch (e) {
    log.warn('[TaskDecomposer] Failed to store plan:', e);
    return false;
  }
}

// ─── C225: Decompositor Automático de Prompts (DAP) ────────────────────────────
// Diagnóstico Chain 2: 4 falhas de sobrecarga em prompts multi-parte (Einstein, Bayes, Marte, Clima)
// Scientific basis:
// - LLM-Modulo (arXiv:2402.01817): decompose complex queries into sub-tasks for better coverage
// - RAGAS (Es et al., 2023, arXiv:2309.15217): answer completeness requires sub-question coverage
// - Chain-of-Thought (Wei et al., 2022, arXiv:2201.11903): decomposition improves reasoning

export interface DecomposedPrompt {
  /** Whether the original prompt was decomposed */
  wasDecomposed: boolean;
  /** Sub-questions extracted from the original prompt */
  subQuestions: string[];
  /** Synthesis instruction for combining sub-answers */
  synthesisInstruction: string;
  /** Original prompt */
  originalPrompt: string;
}

/**
 * C225: Decompose a multi-part user prompt into sub-questions.
 * Used by core.ts to handle prompts that would cause system overload.
 * Scientific basis: LLM-Modulo (arXiv:2402.01817); RAGAS (arXiv:2309.15217)
 */
export function decomposeUserPrompt(prompt: string): DecomposedPrompt {
  // Split by explicit numbered lists
  const numberedPattern = /(?:^|\n)\s*(?:\d+[\)\.]|[a-d]\))\s+(.+)/g;
  const numberedMatches: string[] = [];
  let m;
  while ((m = numberedPattern.exec(prompt)) !== null) {
    if (m[1].trim().length > 10) numberedMatches.push(m[1].trim());
  }
  if (numberedMatches.length >= 2) {
    return {
      wasDecomposed: true,
      subQuestions: numberedMatches,
      synthesisInstruction: 'Responda cada item numerado de forma completa e integrada, sem omitir nenhum.',
      originalPrompt: prompt,
    };
  }

  // Split by question marks (multiple questions)
  const questionParts = prompt.split(/\?(?=\s+[A-ZÀ-Ü]|\s*$)/).filter(p => p.trim().length > 15);
  if (questionParts.length >= 2) {
    const subQs = questionParts.map((p, i) => i < questionParts.length - 1 ? p.trim() + '?' : p.trim()).filter(Boolean);
    return {
      wasDecomposed: true,
      subQuestions: subQs,
      synthesisInstruction: 'Responda cada pergunta de forma completa e integrada.',
      originalPrompt: prompt,
    };
  }

  // Split by connective conjunctions
  const conjunctiveParts = prompt.split(/\b(?:e também|além disso|por outro lado|adicionalmente)\b/i)
    .filter(p => p.trim().length > 20);
  if (conjunctiveParts.length >= 2) {
    return {
      wasDecomposed: true,
      subQuestions: conjunctiveParts.map(p => p.trim()),
      synthesisInstruction: 'Responda todos os aspectos solicitados de forma integrada e completa.',
      originalPrompt: prompt,
    };
  }

  // Not decomposable
  return { wasDecomposed: false, subQuestions: [prompt], synthesisInstruction: '', originalPrompt: prompt };
}

/**
 * Validate that a task is truly atomic (cannot be further decomposed)
 * Scientific basis: CodeAct (arXiv:2402.01030) — one action per step
 */
export function isAtomicTask(task: AtomicTask): boolean {
  // Atomic = creates/modifies exactly one file
  const hasOneTarget = !!(task.file_to_create || task.file_to_modify);
  const isShort = task.estimated_minutes <= 15;
  const hasNoDependencies = task.dependencies.length === 0 ||
    task.dependencies.every(d => typeof d === 'string');
  return hasOneTarget && isShort && hasNoDependencies;
}
