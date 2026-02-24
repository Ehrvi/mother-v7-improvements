/**
 * Google Cloud Tasks Client
 * 
 * Provides a wrapper around @google-cloud/tasks for enqueuing async jobs.
 * Used by Omniscient to process papers without hitting Cloud Run timeout.
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import type { protos } from '@google-cloud/tasks';

// Initialize Cloud Tasks client
const client = new CloudTasksClient();

// Configuration from environment
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'mothers-library-mcp';
const LOCATION = process.env.GCP_LOCATION || 'australia-southeast1';
const QUEUE_NAME = 'omniscient-study-queue';
const DISCOVERY_QUEUE_NAME = 'discovery-queue';

// Construct queue paths
const queuePath = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);
const discoveryQueuePath = client.queuePath(PROJECT_ID, LOCATION, DISCOVERY_QUEUE_NAME);

export interface OmniscientTaskPayload {
  knowledgeAreaId: number;
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedDate: Date;
  pdfUrl: string;
}

/**
 * Enqueue a single paper processing task
 * 
 * @param payload - Paper metadata and PDF URL
 * @returns Task name (for tracking)
 */
export async function enqueueOmniscientTask(
  payload: OmniscientTaskPayload
): Promise<string> {
  const url = process.env.CLOUD_RUN_URL || 'https://mother-interface-233196174701.australia-southeast1.run.app';
  const taskEndpoint = `${url}/api/tasks/omniscient-worker`;

  const task: protos.google.cloud.tasks.v2.ITask = {
    httpRequest: {
      httpMethod: 'POST',
      url: taskEndpoint,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        // CRITICAL: Use hardcoded service account (not env var) to ensure OIDC token generation
        serviceAccountEmail: 'mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com',
      },
    },
  };

  const request = {
    parent: queuePath,
    task,
  };

  const [response] = await client.createTask(request);
  return response.name!;
}

/**
 * Enqueue multiple paper processing tasks in batch
 * 
 * @param payloads - Array of paper metadata
 * @returns Array of task names
 */
export async function enqueueOmniscientTasksBatch(
  payloads: OmniscientTaskPayload[]
): Promise<string[]> {
  // Parallelize task enqueuing with Promise.allSettled for best-effort processing
  // (some tasks may fail due to transient errors, but we continue with successful ones)
  const taskPromises = payloads.map(payload => 
    enqueueOmniscientTask(payload).catch(error => {
      console.error(`❌ Failed to enqueue task for paper ${payload.arxivId}:`, error);
      return null; // Return null for failed tasks (best-effort)
    })
  );

  const results = await Promise.all(taskPromises);
  const successfulTasks = results.filter((name): name is string => name !== null);
  
  console.log(`✅ Enqueued ${successfulTasks.length}/${payloads.length} tasks in parallel.`);

  // If ALL tasks failed, throw error to alert orchestrator
  if (successfulTasks.length === 0 && payloads.length > 0) {
    throw new Error(`Failed to enqueue all ${payloads.length} tasks`);
  }

  return successfulTasks;
}

export interface DiscoveryTaskPayload {
  areaId: number;
  name: string;
  options: {
    maxPapers?: number;
    dateRange?: { start: string; end: string };
  };
}

/**
 * Enqueue a discovery task to the discovery-queue
 * 
 * @param payload - Discovery task payload
 * @returns Task name (for tracking)
 */
export async function enqueueDiscoveryTask(
  payload: DiscoveryTaskPayload
): Promise<string> {
  const url = process.env.CLOUD_RUN_URL || 'https://mother-interface-233196174701.australia-southeast1.run.app';
  const taskEndpoint = `${url}/api/tasks/discovery-worker`;

  const task: protos.google.cloud.tasks.v2.ITask = {
    httpRequest: {
      httpMethod: 'POST',
      url: taskEndpoint,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        // CRITICAL: Use hardcoded service account (not env var) to ensure OIDC token generation
        serviceAccountEmail: 'mother-cloudrun-sa@mothers-library-mcp.iam.gserviceaccount.com',
      },
    },
  };

  const request = {
    parent: discoveryQueuePath,
    task,
  };

  const [response] = await client.createTask(request);
  console.log(`✅ Discovery task enqueued: ${response.name}`);
  return response.name!;
}

/**
 * Get queue statistics (for monitoring)
 */
export async function getQueueStats() {
  try {
    const [queue] = await client.getQueue({ name: queuePath });
    return {
      name: queue.name,
      state: queue.state,
      rateLimits: queue.rateLimits,
      retryConfig: queue.retryConfig,
    };
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    return null;
  }
}
