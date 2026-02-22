/**
 * MOTHER Omniscient - Async Orchestrator (v19.0)
 * 
 * Refactored orchestrator that uses Google Cloud Tasks for async processing.
 * This solves the Cloud Run 600s timeout issue by enqueuing papers as separate tasks.
 * 
 * Architecture:
 * 1. Search arXiv for papers (sync, <10s)
 * 2. Create knowledge area in database (sync, <1s)
 * 3. Enqueue each paper as a Cloud Task (sync, <1s per paper)
 * 4. Return immediately with jobId (total time: <30s for 100 papers)
 * 5. Workers process papers asynchronously (no timeout limit)
 */

import { getDb } from '../db';
import { knowledgeAreas } from '../../drizzle/schema';
import { searchArxiv } from './arxiv';
import { jobQueue, type StudyJob } from './queue';
import { enqueueOmniscientTasksBatch, type OmniscientTaskPayload } from '../_core/cloudTasks';

export interface StudyOptionsAsync {
  maxPapers?: number; // Max papers to process (default: 100)
  dateRange?: { start: string; end: string }; // Date range filter (YYYY-MM-DD)
}

export interface StudyResultAsync {
  job: StudyJob;
  knowledgeAreaId: number;
  papersEnqueued: number;
  message: string;
}

/**
 * Study a knowledge area asynchronously using Cloud Tasks
 * 
 * This function:
 * 1. Searches arXiv for papers
 * 2. Creates a knowledge area in the database
 * 3. Enqueues each paper as a Cloud Task
 * 4. Returns immediately (no waiting for processing)
 * 
 * @param name - Knowledge area name (used as arXiv query)
 * @param description - Optional description
 * @param options - Study options (maxPapers, dateRange)
 * @returns Study result with jobId and papers enqueued count
 */
export async function studyKnowledgeAreaAsync(
  name: string,
  description?: string,
  options: StudyOptionsAsync = {}
): Promise<StudyResultAsync> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const maxPapers = options.maxPapers || 100;

  console.log(`\n🚀 [Async Orchestrator] Starting study: "${name}"`);
  console.log(`  Max papers: ${maxPapers}`);
  console.log(`  Date range: ${options.dateRange ? `${options.dateRange.start} to ${options.dateRange.end}` : 'All time'}`);

  // Create job in queue (knowledgeAreaId will be set later)
  const job = jobQueue.createJob(0, name);
  console.log(`  Job ID: ${job.id}`);

  try {
    // LAYER 1: Discovery (Search arXiv)
    console.log(`\n[1/3] Searching arXiv...`);
    jobQueue.updateJob(job.id, {
      status: 'discovering',
      currentStep: 'Searching arXiv for papers...',
    });

    const arxivPapers = await searchArxiv({
      query: name,
      maxResults: maxPapers,
      startDate: options.dateRange?.start ? new Date(options.dateRange.start) : undefined,
      endDate: options.dateRange?.end ? new Date(options.dateRange.end) : undefined,
    });
    console.log(`✅ Found ${arxivPapers.length} papers`);

    if (arxivPapers.length === 0) {
      jobQueue.updateJob(job.id, {
        status: 'completed',
        currentStep: 'No papers found',
      });

      return {
        job: jobQueue.getJob(job.id)!,
        knowledgeAreaId: 0,
        papersEnqueued: 0,
        message: 'No papers found for this query',
      };
    }

    // LAYER 2: Create Knowledge Area
    console.log(`\n[2/3] Creating knowledge area...`);
    jobQueue.updateJob(job.id, {
      status: 'discovering', // Use valid JobStatus
      currentStep: 'Creating knowledge area in database...',
    });

    const areaResult = await db.insert(knowledgeAreas).values({
      name,
      description: description || `Study of ${name} from arXiv`,
      status: 'in_progress',
      papersCount: 0,
      chunksCount: 0,
      cost: '0.0000',
    });

    const areaId = Number(areaResult[0].insertId);
    console.log(`✅ Knowledge area created with ID: ${areaId}`);

    // LAYER 3: Enqueue Papers as Cloud Tasks
    console.log(`\n[3/3] Enqueuing ${arxivPapers.length} papers to Cloud Tasks...`);
    jobQueue.updateJob(job.id, {
      status: 'retrieving', // Use valid JobStatus
      currentStep: `Enqueuing ${arxivPapers.length} papers...`,
    });

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
    console.log(`✅ Enqueued ${taskNames.length}/${arxivPapers.length} tasks`);

    // Update job status
    jobQueue.updateJob(job.id, {
      status: 'processing',
      progress: 0,
      total: taskNames.length,
      currentStep: `Processing ${taskNames.length} papers asynchronously...`,
    });

    console.log(`\n✅ Study initiated successfully!`);
    console.log(`  Knowledge Area ID: ${areaId}`);
    console.log(`  Papers enqueued: ${taskNames.length}`);
    console.log(`  Job ID: ${job.id}`);
    console.log(`  Status: Workers will process papers asynchronously`);

    return {
      job: jobQueue.getJob(job.id)!,
      knowledgeAreaId: areaId,
      papersEnqueued: taskNames.length,
      message: `Study initiated! ${taskNames.length} papers are being processed asynchronously. Check job status for progress.`,
    };

  } catch (error) {
    console.error(`\n❌ Study failed:`, error);

    jobQueue.updateJob(job.id, {
      status: 'failed',
      errorMessage: String(error),
      currentStep: `Failed: ${error}`,
    });

    throw error;
  }
}
