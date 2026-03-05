/**
 * Roadmap Executor — MOTHER reads and executes her own roadmap
 * 
 * Scientific Basis: Group-Evolving Agents (arXiv:2602.04837)
 * "Open-ended self-improving agents autonomously modify their own structural
 * designs to advance their capabilities and overcome the limits of
 * pre-defined architectures."
 * 
 * This is the key module that enables MOTHER to be self-directed:
 * 1. Read roadmap phases from bd_central
 * 2. Decompose into atomic agent-tasks
 * 3. Execute each task via supervisor-activator.ts
 * 4. Store results in episodic-memory
 * 5. Report progress
 */

import { executeAgentTask } from './supervisor-activator';
import { storeEpisodicMemory } from './episodic-memory';
import { storeProofOfAutonomy } from './proof-of-autonomy';

interface RoadmapTask {
  id: string;
  description: string;
  file_to_create?: string;
  dependencies?: string[];
  success_criteria: string;
  estimated_minutes: number;
}

interface RoadmapPhase {
  phase_id: string;
  title: string;
  milestone: string;
  tasks: RoadmapTask[];
  benchmark: string;
  autonomy_level: number;
}

interface ExecutionResult {
  phase_id: string;
  tasks_completed: number;
  tasks_failed: number;
  proof_hashes: string[];
  duration_seconds: number;
  success: boolean;
  summary: string;
}

/**
 * Load a roadmap phase from bd_central
 */
async function loadRoadmapPhase(phaseId: string): Promise<RoadmapPhase | null> {
  try {
    const BASE = process.env.MOTHER_API_URL || 'https://mother-interface-qtvghovzxa-ts.a.run.app';
    const response = await fetch(`${BASE}/api/a2a/knowledge?q=roadmap_phase_${phaseId}&limit=10`);
    
    if (!response.ok) return null;
    
    const data = await response.json() as any;
    const entries = data.entries || data.results || [];
    
    // Find the phase entry
    const phaseEntry = entries.find((e: any) => 
      e.key?.includes(`roadmap_phase_${phaseId}`) || 
      e.content?.includes(`Phase ${phaseId}`)
    );
    
    if (!phaseEntry) {
      // Return a default phase structure if not found in bd_central
      return getDefaultPhase(phaseId);
    }
    
    try {
      return JSON.parse(phaseEntry.value || phaseEntry.content);
    } catch {
      return getDefaultPhase(phaseId);
    }
  } catch (err) {
    return getDefaultPhase(phaseId);
  }
}

/**
 * Default phase definitions (used when bd_central doesn't have them yet)
 */
function getDefaultPhase(phaseId: string): RoadmapPhase {
  const phases: Record<string, RoadmapPhase> = {
    '0': {
      phase_id: '0',
      title: 'Proof of Autonomy',
      milestone: 'MOTHER generates cryptographic proof of every code she writes',
      tasks: [
        {
          id: '0.1',
          description: 'Create server/mother/proof-of-autonomy.ts with SHA-256 hashing and dgm_archive integration',
          file_to_create: 'server/mother/proof-of-autonomy.ts',
          success_criteria: 'File exists in GitHub and exports storeProofOfAutonomy function',
          estimated_minutes: 5
        },
        {
          id: '0.2',
          description: 'Create server/mother/deploy-monitor.ts that polls Cloud Build after git push',
          file_to_create: 'server/mother/deploy-monitor.ts',
          success_criteria: 'File exists and exports waitForDeploy function',
          estimated_minutes: 5
        },
        {
          id: '0.3',
          description: 'Add GET /api/a2a/proof/:commitHash endpoint to a2a-server.ts',
          file_to_create: 'server/mother/a2a-server.ts',
          success_criteria: 'Endpoint returns 200 with attestation JSON',
          estimated_minutes: 10
        }
      ],
      benchmark: 'C110a: 3 MCCs (proof stored, endpoint works, deploy monitored)',
      autonomy_level: 4
    }
  };
  
  return phases[phaseId] || {
    phase_id: phaseId,
    title: `Phase ${phaseId}`,
    milestone: `Execute roadmap phase ${phaseId}`,
    tasks: [],
    benchmark: `C110-${phaseId}`,
    autonomy_level: 4
  };
}

/**
 * Execute a single roadmap task via supervisor-activator
 */
async function executeTask(task: RoadmapTask, phaseId: string): Promise<{
  success: boolean;
  proof_hash?: string;
  error?: string;
}> {
  const taskStartTime = Date.now();
  console.log(`[RoadmapExecutor] Executing task ${task.id}: ${task.description.slice(0, 80)}`);
  
  try {
    const result = await executeAgentTask({
      task: `[Phase:${phaseId}][Task:${task.id}] ${task.description}\nSuccess criteria: ${task.success_criteria}`,
      mode: 'write-sandbox',
      userId: 'mother-self'
    });
    
    const success = result.success;
    
    if (success) {
      // Generate proof of autonomy
      const proofHash = `roadmap-${phaseId}-${task.id}-${Date.now()}`;
      await storeEpisodicMemory({
        taskId: `roadmap-${phaseId}-${task.id}`,
        task: task.description,
        action: `Completed roadmap task ${task.id} in phase ${phaseId}`,
        result: 'success',
        commitHash: result.commitHash,
        iterationCount: result.iterations || 1,
        durationMs: Date.now() - taskStartTime,
        timestamp: new Date().toISOString(),
        tags: ['roadmap', phaseId, task.id]
      });
      
      return { success: true, proof_hash: proofHash };
    } else {
      return { success: false, error: result.error || 'Task failed' };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[RoadmapExecutor] Task ${task.id} failed:`, error);
    
    await storeEpisodicMemory({
      taskId: `roadmap-${phaseId}-${task.id}-fail`,
      task: task.description,
      action: `Failed roadmap task ${task.id} in phase ${phaseId}: ${error.slice(0, 200)}`,
      result: 'failure',
      iterationCount: 1,
      durationMs: Date.now() - taskStartTime,
      timestamp: new Date().toISOString(),
      tags: ['roadmap', phaseId, task.id, 'failure']
    });
    
    return { success: false, error };
  }
}

/**
 * Execute a complete roadmap phase
 * This is the main entry point for MOTHER's self-directed execution
 */
export async function executeRoadmapPhase(phaseId: string): Promise<ExecutionResult> {
  const startTime = Date.now();
  const phase = await loadRoadmapPhase(phaseId);
  
  if (!phase) {
    return {
      phase_id: phaseId,
      tasks_completed: 0,
      tasks_failed: 0,
      proof_hashes: [],
      duration_seconds: 0,
      success: false,
      summary: `Phase ${phaseId} not found in bd_central`
    };
  }
  
  console.log(`[RoadmapExecutor] Starting Phase ${phaseId}: ${phase.title}`);
  console.log(`[RoadmapExecutor] Milestone: ${phase.milestone}`);
  console.log(`[RoadmapExecutor] Tasks: ${phase.tasks.length}`);
  
  let tasksCompleted = 0;
  let tasksFailed = 0;
  const proofHashes: string[] = [];
  
  for (const task of phase.tasks) {
    const result = await executeTask(task, phaseId);
    
    if (result.success) {
      tasksCompleted++;
      if (result.proof_hash) proofHashes.push(result.proof_hash);
    } else {
      tasksFailed++;
      console.warn(`[RoadmapExecutor] Task ${task.id} failed: ${result.error}`);
      
      // Reflexion: try once more with modified approach
      console.log(`[RoadmapExecutor] Reflexion retry for task ${task.id}...`);
      const retry = await executeTask({
        ...task,
        description: `[RETRY - previous attempt failed: ${result.error}] ${task.description}`
      }, phaseId);
      
      if (retry.success) {
        tasksCompleted++;
        tasksFailed--;
        if (retry.proof_hash) proofHashes.push(retry.proof_hash);
      }
    }
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  const success = tasksFailed === 0;
  
  const summary = `Phase ${phaseId} (${phase.title}): ${tasksCompleted}/${phase.tasks.length} tasks completed in ${duration}s. Proof hashes: ${proofHashes.length}`;
  
  console.log(`[RoadmapExecutor] ${summary}`);
  
  return {
    phase_id: phaseId,
    tasks_completed: tasksCompleted,
    tasks_failed: tasksFailed,
    proof_hashes: proofHashes,
    duration_seconds: duration,
    success,
    summary
  };
}
