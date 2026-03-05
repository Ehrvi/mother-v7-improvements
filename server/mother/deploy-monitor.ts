/**
 * Deploy Monitor — MOTHER tracks Cloud Build status after git push
 * 
 * Scientific Basis: DGM Empirical Validation (arXiv:2505.22954)
 * "Fitness is measured empirically by running the agent and observing outcomes"
 * 
 * Pattern: After git push, poll Cloud Build every 30s until SUCCESS or FAILURE
 * Store result in episodic-memory for learning
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { storeEpisodicMemory } from './episodic-memory';

const execAsync = promisify(exec);

export interface BuildStatus {
  id: string;
  status: 'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | 'CANCELLED' | 'UNKNOWN';
  startTime?: string;
  finishTime?: string;
  logUrl?: string;
  duration?: number;
}

export interface DeployResult {
  success: boolean;
  buildId: string;
  revision?: string;
  duration_seconds: number;
  error?: string;
  log_url?: string;
}

/**
 * Get the latest Cloud Build status
 */
async function getLatestBuildStatus(): Promise<BuildStatus> {
  try {
    const { stdout } = await execAsync(
      'gcloud builds list --project=mothers-library-mcp --limit=1 --format=json --filter="source.repoSource.repoName=mother-v7-improvements" 2>/dev/null || ' +
      'gcloud builds list --project=mothers-library-mcp --limit=1 --format=json 2>/dev/null',
      { timeout: 15000 }
    );
    
    const builds = JSON.parse(stdout.trim() || '[]');
    if (builds.length === 0) {
      return { id: 'unknown', status: 'UNKNOWN' };
    }
    
    const build = builds[0];
    return {
      id: build.id,
      status: build.status as BuildStatus['status'],
      startTime: build.startTime,
      finishTime: build.finishTime,
      logUrl: build.logUrl,
    };
  } catch (err) {
    return { id: 'unknown', status: 'UNKNOWN' };
  }
}

/**
 * Wait for Cloud Build to complete after git push
 * Polls every 30 seconds, times out after 15 minutes
 */
export async function waitForDeploy(
  taskDescription: string,
  maxWaitMinutes = 15
): Promise<DeployResult> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  let lastBuildId = '';
  
  console.log(`[DeployMonitor] Waiting for deploy: ${taskDescription}`);
  
  // Wait 30s for Cloud Build to pick up the push
  await new Promise(r => setTimeout(r, 30000));
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await getLatestBuildStatus();
    
    if (status.id !== lastBuildId && lastBuildId !== '') {
      // New build detected
      console.log(`[DeployMonitor] New build detected: ${status.id}`);
    }
    lastBuildId = status.id;
    
    if (status.status === 'SUCCESS') {
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[DeployMonitor] Build SUCCESS in ${duration}s`);
      
      // Store success in episodic memory
      await storeEpisodicMemory({
        taskId: `deploy-${status.id}`,
        task: taskDescription,
        action: `Deploy completed: build ${status.id}`,
        result: 'success',
        iterationCount: 1,
        durationMs: duration * 1000,
        timestamp: new Date().toISOString(),
        tags: ['deploy', 'success', status.id]
      });
      
      return { success: true, buildId: status.id, duration_seconds: duration, log_url: status.logUrl };
    }
    
    if (status.status === 'FAILURE' || status.status === 'TIMEOUT' || status.status === 'CANCELLED') {
      const duration = Math.round((Date.now() - startTime) / 1000);
      const error = `Build ${status.id} ${status.status}`;
      console.error(`[DeployMonitor] Build FAILED: ${error}`);
      
      // Store failure in episodic memory for learning
      await storeEpisodicMemory({
        taskId: `deploy-${status.id}`,
        task: taskDescription,
        action: `Deploy failed: build ${status.id} (${status.status})`,
        result: 'failure',
        iterationCount: 1,
        durationMs: duration * 1000,
        timestamp: new Date().toISOString(),
        tags: ['deploy', 'failure', status.id, status.status]
      });
      
      return { success: false, buildId: status.id, duration_seconds: duration, error, log_url: status.logUrl };
    }
    
    console.log(`[DeployMonitor] Build ${status.id}: ${status.status} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
    await new Promise(r => setTimeout(r, 30000)); // Poll every 30s
  }
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  return { success: false, buildId: lastBuildId, duration_seconds: duration, error: 'Timeout waiting for deploy' };
}
