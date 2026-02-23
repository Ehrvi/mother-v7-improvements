/**
 * MOTHER Omniscient - Async Orchestrator (v20.2)
 * 
 * Dual-queue architecture orchestrator that eliminates fire-and-forget pattern.
 * Uses Cloud Tasks for both discovery and paper processing.
 * 
 * Architecture:
 * 1. Create knowledge area with status 'pending' (sync, <1s)
 * 2. Enqueue discovery task to discovery-queue (sync, <1s)
 * 3. Return immediately with areaId (total time: <2s)
 * 4. Discovery worker: Search arXiv + Enqueue paper tasks (async, no timeout)
 * 5. Paper workers: Process papers asynchronously (no timeout limit)
 * 
 * This eliminates the fire-and-forget pattern that failed in v20.1 due to
 * Cloud Run terminating containers after HTTP response.
 */

import { getDb } from '../db';
import { knowledgeAreas } from '../../drizzle/schema';
import { enqueueDiscoveryTask } from '../_core/cloudTasks';

export interface StudyOptionsAsync {
  maxPapers?: number; // Max papers to process (default: 100)
  dateRange?: { start: string; end: string }; // Date range filter (YYYY-MM-DD)
}

export interface StudyResultAsync {
  knowledgeAreaId: number;
  discoveryTaskName: string;
  message: string;
}

/**
 * Study a knowledge area asynchronously with dual-queue architecture
 * 
 * This function:
 * 1. Creates a knowledge area with status 'pending'
 * 2. Enqueues a discovery task to discovery-queue
 * 3. Returns immediately (< 2s)
 * 
 * The discovery worker will:
 * 1. Search arXiv for papers
 * 2. Enqueue paper processing tasks to omniscient-study-queue
 * 3. Update knowledge area status to 'in_progress'
 * 
 * @param name - Knowledge area name (used as arXiv query)
 * @param description - Optional description
 * @param options - Study options (maxPapers, dateRange)
 * @returns Study result with areaId and discovery task name
 */
export async function studyKnowledgeAreaAsync(
  name: string,
  query: string,
  description?: string,
  options: StudyOptionsAsync = {}
): Promise<StudyResultAsync> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log(`\n🚀 [Async Orchestrator v20.2] Initiating study: "${name}"`);

  // Create knowledge area with status 'pending'
  const areaResult = await db.insert(knowledgeAreas).values({
    name,
    description: description || `Study of ${name} from arXiv`,
    status: 'pending', // Will be updated to 'in_progress' by discovery worker
    papersCount: 0,
    chunksCount: 0,
    cost: '0.0000',
  });

  const areaId = Number(areaResult[0].insertId);
  console.log(`✅ Knowledge area created with ID: ${areaId}`);

  // Enqueue discovery task to discovery-queue
  const discoveryTaskName = await enqueueDiscoveryTask({
    areaId,
    name: query, // Use query instead of name for arXiv search
    options,
  });

  console.log(`✅ Discovery task enqueued: ${discoveryTaskName}`);

  return {
    knowledgeAreaId: areaId,
    discoveryTaskName,
    message: `Study initiated! Discovery task enqueued. Processing will start shortly.`,
  };
}
