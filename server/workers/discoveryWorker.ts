/**
 * MOTHER Omniscient - Discovery Worker (v20.2)
 * 
 * Handles discovery tasks from the discovery-queue.
 * This worker searches arXiv and enqueues paper processing tasks.
 * 
 * Architecture:
 * 1. Receive discovery task from discovery-queue
 * 2. Search arXiv for papers
 * 3. Enqueue paper processing tasks to omniscient-study-queue
 * 4. Update knowledge area status
 */

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { knowledgeAreas } from '../../drizzle/schema';
import { searchArxiv } from '../omniscient/arxiv';
import { enqueueOmniscientTasksBatch, type OmniscientTaskPayload } from '../_core/cloudTasks';

export interface DiscoveryTaskPayload {
  areaId: number;
  name: string;
  options: {
    maxPapers?: number;
    dateRange?: { start: string; end: string };
  };
}

/**
 * Handle discovery request from Cloud Tasks
 * 
 * This endpoint is called by the discovery-queue to process discovery tasks.
 * It searches arXiv and enqueues paper processing tasks.
 */
export async function handleDiscoveryRequest(req: Request, res: Response) {
  try {
    const payload: DiscoveryTaskPayload = req.body;
    const { areaId, name, options } = payload;

    console.log(`\n🔍 [Discovery Worker v20.2] Starting discovery for area ${areaId}: "${name}"`);

    const db = await getDb();
    if (!db) {
      console.error('[Discovery Worker] Database not available');
      return res.status(500).send('Database not available');
    }

    // Search arXiv
    const maxPapers = options.maxPapers || 100;
    const arxivPapers = await searchArxiv({
      query: name,
      maxResults: maxPapers,
      startDate: options.dateRange?.start ? new Date(options.dateRange.start) : undefined,
      endDate: options.dateRange?.end ? new Date(options.dateRange.end) : undefined,
    });

    console.log(`[Discovery Worker] Found ${arxivPapers.length} papers for area ${areaId}`);

    if (arxivPapers.length === 0) {
      // No papers found - mark as completed
      await db.update(knowledgeAreas)
        .set({ status: 'completed' })
        .where(eq(knowledgeAreas.id, areaId));

      console.log(`[Discovery Worker] No papers found for area ${areaId}. Marked as completed.`);
      return res.status(200).send('Discovery complete (no papers found)');
    }

    // Enqueue papers as Cloud Tasks to omniscient-study-queue
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
    console.log(`[Discovery Worker] Enqueued ${taskNames.length}/${arxivPapers.length} tasks for area ${areaId}`);

    // Update status to 'in_progress'
    await db.update(knowledgeAreas)
      .set({ status: 'in_progress' })
      .where(eq(knowledgeAreas.id, areaId));

    console.log(`✅ [Discovery Worker] Discovery complete for area ${areaId}. ${taskNames.length} tasks enqueued.`);

    return res.status(200).send(`Discovery complete: ${taskNames.length} tasks enqueued`);

  } catch (error) {
    console.error('[Discovery Worker] Error:', error);

    // Try to mark area as failed
    try {
      const payload: DiscoveryTaskPayload = req.body;
      const db = await getDb();
      if (db) {
        await db.update(knowledgeAreas)
          .set({ status: 'failed' })
          .where(eq(knowledgeAreas.id, payload.areaId));
      }
    } catch (updateError) {
      console.error('[Discovery Worker] Failed to update area status:', updateError);
    }

    return res.status(500).send('Discovery failed');
  }
}
