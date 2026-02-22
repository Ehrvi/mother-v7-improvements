/**
 * MOTHER Omniscient - Async Orchestrator (v20.1)
 * 
 * Fully asynchronous orchestrator that returns immediately and processes discovery in background.
 * This solves the orchestrator timeout issue by moving searchArxiv to a background process.
 * 
 * Architecture:
 * 1. Create knowledge area with status 'discovering' (sync, <1s)
 * 2. Return immediately with areaId (total time: <2s)
 * 3. Background process: Search arXiv + Enqueue tasks (async, no timeout)
 * 4. Workers process papers asynchronously (no timeout limit)
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { knowledgeAreas } from '../../drizzle/schema';
import { searchArxiv } from './arxiv';
import { enqueueOmniscientTasksBatch, type OmniscientTaskPayload } from '../_core/cloudTasks';

export interface StudyOptionsAsync {
  maxPapers?: number; // Max papers to process (default: 100)
  dateRange?: { start: string; end: string }; // Date range filter (YYYY-MM-DD)
}

export interface StudyResultAsync {
  knowledgeAreaId: number;
  papersEnqueued: number;
  message: string;
}

/**
 * Study a knowledge area asynchronously with instant return
 * 
 * This function:
 * 1. Creates a knowledge area with status 'discovering'
 * 2. Returns immediately (< 2s)
 * 3. Processes discovery and enqueuing in background
 * 
 * @param name - Knowledge area name (used as arXiv query)
 * @param description - Optional description
 * @param options - Study options (maxPapers, dateRange)
 * @returns Study result with areaId (papersEnqueued will be 0 initially)
 */
export async function studyKnowledgeAreaAsync(
  name: string,
  description?: string,
  options: StudyOptionsAsync = {}
): Promise<StudyResultAsync> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log(`\n🚀 [Async Orchestrator v20.1] Initiating study: "${name}"`);

  // Create knowledge area with status 'discovering'
  const areaResult = await db.insert(knowledgeAreas).values({
    name,
    description: description || `Study of ${name} from arXiv`,
    status: 'pending', // Will be updated to 'in_progress' after discovery
    papersCount: 0,
    chunksCount: 0,
    cost: '0.0000',
  });

  const areaId = Number(areaResult[0].insertId);
  console.log(`✅ Knowledge area created with ID: ${areaId}. Discovery will run in background.`);

  // Fire-and-forget: Process discovery in background
  processDiscoveryInBackground(areaId, name, options).catch(error => {
    console.error(`[Background Discovery] Error for area ${areaId}:`, error);
  });

  return {
    knowledgeAreaId: areaId,
    papersEnqueued: 0, // Will be updated in background
    message: `Study initiated! Discovery and processing will run asynchronously. Check area status for progress.`,
  };
}

/**
 * Background process: Search arXiv and enqueue papers
 * This runs asynchronously without blocking the HTTP response
 */
async function processDiscoveryInBackground(
  areaId: number,
  name: string,
  options: StudyOptionsAsync
) {
  const db = await getDb();
  if (!db) return;

  try {
    const maxPapers = options.maxPapers || 100;

    console.log(`\n[Background Discovery] Starting for area ${areaId}...`);

    // Search arXiv
    const arxivPapers = await searchArxiv({
      query: name,
      maxResults: maxPapers,
      startDate: options.dateRange?.start ? new Date(options.dateRange.start) : undefined,
      endDate: options.dateRange?.end ? new Date(options.dateRange.end) : undefined,
    });

    console.log(`[Background Discovery] Found ${arxivPapers.length} papers for area ${areaId}`);

    if (arxivPapers.length === 0) {
      await db.update(knowledgeAreas)
        .set({ status: 'completed' })
        .where(eq(knowledgeAreas.id, areaId));
      return;
    }

    // Enqueue papers as Cloud Tasks
    const payloads: OmniscientTaskPayload[] = arxivPapers.map(paper => ({
      knowledgeAreaId: areaId,
      arxivId: paper.id,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      publishedDate: paper.publishedDate,
      pdfUrl: paper.pdfUrl,
    }));

    const taskNames = await enqueueOmniscientTasksBatch(payloads);
    console.log(`[Background Discovery] Enqueued ${taskNames.length}/${arxivPapers.length} tasks for area ${areaId}`);

    // Update status to 'in_progress'
    await db.update(knowledgeAreas)
      .set({ status: 'in_progress' })
      .where(eq(knowledgeAreas.id, areaId));

    console.log(`[Background Discovery] Completed for area ${areaId}`);

  } catch (error) {
    console.error(`[Background Discovery] Error for area ${areaId}:`, error);

    // Mark as failed
    await db.update(knowledgeAreas)
      .set({ status: 'failed' })
      .where(eq(knowledgeAreas.id, areaId));
  }
}
