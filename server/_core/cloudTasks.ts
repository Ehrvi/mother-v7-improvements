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

// Construct queue path
const queuePath = client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

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
        serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
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
  // Parallelize task enqueuing with Promise.all for O(1) latency
  const taskPromises = payloads.map(payload => 
    enqueueOmniscientTask(payload).catch(error => {
      console.error(`❌ Failed to enqueue task for paper ${payload.arxivId}:`, error);
      return null; // Return null for failed tasks to prevent Promise.all rejection
    })
  );

  const results = await Promise.all(taskPromises);
  
  // Filter out null results (failed tasks)
  const successfulTaskNames = results.filter((name): name is string => name !== null);

  console.log(`✅ Enqueued ${successfulTaskNames.length}/${payloads.length} tasks in parallel.`);

  return successfulTaskNames;
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
