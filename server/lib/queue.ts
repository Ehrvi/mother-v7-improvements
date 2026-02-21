/**
 * BullMQ Job Queue System
 * 
 * Purpose: Process heavy queries asynchronously to improve throughput
 * 
 * Strategy:
 * - Tier 3 (gpt-4) queries → Queue (background processing)
 * - Tier 1-2 (gpt-4o-mini, gpt-4o) → Direct processing (fast enough)
 * - Job monitoring and retry logic
 * - Dashboard for job statistics
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisClient } from './redis';
import { logger } from './logger';

/**
 * Job data structure for MOTHER queries
 */
export interface MotherQueryJob {
  query: string;
  userId?: number;
  tier: string;
  queryHash: string;
  timestamp: number;
}

/**
 * Job result structure
 */
export interface MotherQueryResult {
  response: string;
  tier: string;
  complexityScore: number;
  quality: any;
  tokensUsed: number;
  cost: number;
  processingTime: number;
}

let motherQueue: Queue<MotherQueryJob, MotherQueryResult> | null = null;
let motherWorker: Worker<MotherQueryJob, MotherQueryResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get or create MOTHER query queue
 */
export function getMotherQueue(): Queue<MotherQueryJob, MotherQueryResult> | null {
  // If Redis is not configured, return null (graceful degradation)
  const redisClient = getRedisClient();
  if (!redisClient) {
    logger.warn('BullMQ not available - Redis not configured');
    return null;
  }

  // Return existing queue
  if (motherQueue) {
    return motherQueue;
  }

  // Create new queue
  try {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    motherQueue = new Queue<MotherQueryJob, MotherQueryResult>('mother-queries', {
      connection: {
        host: redisHost,
        port: redisPort,
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2s delay
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000, // Keep max 1000 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
          count: 100, // Keep max 100 failed jobs
        },
      },
    });

    logger.info('BullMQ queue created successfully');
    return motherQueue;
  } catch (error) {
    logger.error('Failed to create BullMQ queue:', error);
    return null;
  }
}

/**
 * Add query to processing queue
 */
export async function enqueueQuery(
  job: MotherQueryJob,
  priority?: number
): Promise<Job<MotherQueryJob, MotherQueryResult> | null> {
  const queue = getMotherQueue();
  if (!queue) {
    logger.warn('Cannot enqueue query - queue not available');
    return null;
  }

  try {
    const addedJob = await queue.add('process-query', job, {
      priority: priority || 0, // Lower number = higher priority
      jobId: job.queryHash, // Use query hash as job ID for deduplication
    });

    logger.info(`Query enqueued: ${job.queryHash.substring(0, 8)} (priority: ${priority || 0})`);
    return addedJob;
  } catch (error) {
    logger.error('Failed to enqueue query:', error);
    return null;
  }
}

/**
 * Start worker to process queued jobs
 */
export function startWorker(): Worker<MotherQueryJob, MotherQueryResult> | null {
  // If Redis is not configured, return null
  const redisClient = getRedisClient();
  if (!redisClient) {
    logger.warn('Cannot start worker - Redis not configured');
    return null;
  }

  // Return existing worker
  if (motherWorker) {
    return motherWorker;
  }

  try {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    motherWorker = new Worker<MotherQueryJob, MotherQueryResult>(
      'mother-queries',
      async (job: Job<MotherQueryJob, MotherQueryResult>) => {
        const startTime = Date.now();
        logger.info(`Processing job ${job.id}: ${job.data.query.substring(0, 50)}...`);

        try {
          // Import processQuery dynamically to avoid circular dependency
          const { processQuery } = await import('../mother/core');

          // Process the query
          const result = await processQuery({
            query: job.data.query,
            userId: job.data.userId,
            useCache: true,
          });

          const processingTime = Date.now() - startTime;

          logger.info(`Job ${job.id} completed in ${processingTime}ms`);

          return {
            response: result.response,
            tier: result.tier,
            complexityScore: result.complexityScore,
            quality: result.quality,
            tokensUsed: result.tokensUsed,
            cost: result.cost,
            processingTime,
          };
        } catch (error) {
          logger.error(`Job ${job.id} failed:`, error);
          throw error; // Will trigger retry
        }
      },
      {
        connection: {
          host: redisHost,
          port: redisPort,
          password: process.env.REDIS_PASSWORD,
        },
        concurrency: 5, // Process up to 5 jobs concurrently
        limiter: {
          max: 10, // Max 10 jobs per duration
          duration: 1000, // 1 second
        },
      }
    );

    // Event listeners
    motherWorker.on('completed', (job) => {
      logger.info(`✅ Job ${job.id} completed`);
    });

    motherWorker.on('failed', (job, error) => {
      logger.error(`❌ Job ${job?.id} failed:`, error);
    });

    motherWorker.on('error', (error) => {
      logger.error('Worker error:', error);
    });

    logger.info('BullMQ worker started successfully (concurrency: 5)');
    return motherWorker;
  } catch (error) {
    logger.error('Failed to start worker:', error);
    return null;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
} | null> {
  const queue = getMotherQueue();
  if (!queue) return null;

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  } catch (error) {
    logger.error('Failed to get queue stats:', error);
    return null;
  }
}

/**
 * Get job by ID
 */
export async function getJob(
  jobId: string
): Promise<Job<MotherQueryJob, MotherQueryResult> | null> {
  const queue = getMotherQueue();
  if (!queue) return null;

  try {
    const job = await queue.getJob(jobId);
    return job || null;
  } catch (error) {
    logger.error(`Failed to get job ${jobId}:`, error);
    return null;
  }
}

/**
 * Initialize queue events for monitoring
 */
export function initQueueEvents(): QueueEvents | null {
  const redisClient = getRedisClient();
  if (!redisClient) return null;

  if (queueEvents) return queueEvents;

  try {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');

    queueEvents = new QueueEvents('mother-queries', {
      connection: {
        host: redisHost,
        port: redisPort,
        password: process.env.REDIS_PASSWORD,
      },
    });

    queueEvents.on('completed', ({ jobId }) => {
      logger.info(`[Queue Event] Job ${jobId} completed`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`[Queue Event] Job ${jobId} failed: ${failedReason}`);
    });

    logger.info('Queue events initialized');
    return queueEvents;
  } catch (error) {
    logger.error('Failed to initialize queue events:', error);
    return null;
  }
}

/**
 * Graceful shutdown
 */
export async function closeQueue(): Promise<void> {
  if (motherWorker) {
    await motherWorker.close();
    motherWorker = null;
    logger.info('Worker closed');
  }

  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
    logger.info('Queue events closed');
  }

  if (motherQueue) {
    await motherQueue.close();
    motherQueue = null;
    logger.info('Queue closed');
  }
}

/**
 * Clean old jobs (maintenance)
 */
export async function cleanOldJobs(): Promise<{
  completed: number;
  failed: number;
} | null> {
  const queue = getMotherQueue();
  if (!queue) return null;

  try {
    // Clean completed jobs older than 1 hour
    const completedCleaned = await queue.clean(3600 * 1000, 1000, 'completed');
    
    // Clean failed jobs older than 24 hours
    const failedCleaned = await queue.clean(86400 * 1000, 100, 'failed');

    logger.info(`Cleaned ${completedCleaned.length} completed jobs, ${failedCleaned.length} failed jobs`);

    return {
      completed: completedCleaned.length,
      failed: failedCleaned.length,
    };
  } catch (error) {
    logger.error('Failed to clean old jobs:', error);
    return null;
  }
}
