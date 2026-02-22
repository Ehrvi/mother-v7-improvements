/**
 * Omniscient Worker Endpoint (v20.0 Asynchronous Architecture)
 * 
 * Implements fully asynchronous processing with database-driven status tracking.
 * 
 * Architecture:
 * 1. enqueuePaper() - Called by Cloud Tasks, inserts paper with status='pending', returns HTTP 200 immediately
 * 2. processPendingPapers() - Background loop that polls for pending papers and processes them
 * 
 * v20.0 resolves the fundamental timeout issue by decoupling task acknowledgment from processing.
 */

import { Request, Response } from 'express';
import { getDb } from '../db';
import { papers, paperChunks, knowledgeAreas } from '../../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { downloadPdf } from './arxiv';
import { extractTextFromPdf, chunkText } from './pdf';
import { generateEmbeddingsBatch } from './embeddings';

export interface WorkerPayload {
  knowledgeAreaId: number;
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedDate: string;
  pdfUrl: string;
}

/**
 * Enqueue a paper for processing (called by Cloud Tasks)
 * Returns HTTP 200 immediately after inserting paper with status='pending'
 */
export async function enqueuePaper(req: Request, res: Response): Promise<void> {
  const db = await getDb();
  if (!db) {
    res.status(500).json({ success: false, error: 'Database not available' });
    return;
  }

  const payload: WorkerPayload = req.body;
  try {
    // Check if paper already exists
    const existingPaper = await db.select().from(papers).where(eq(papers.arxivId, payload.arxivId)).limit(1);
    if (existingPaper.length > 0) {
      console.log(`[v20.0] Paper ${payload.arxivId} already exists. Skipping.`);
      res.status(200).json({ success: true, message: 'Paper already exists' });
      return;
    }

    await db.insert(papers).values({
      knowledgeAreaId: payload.knowledgeAreaId,
      arxivId: payload.arxivId,
      title: payload.title,
      authors: payload.authors.join(', '),
      abstract: payload.abstract,
      publishedDate: new Date(payload.publishedDate),
      pdfUrl: payload.pdfUrl,
      status: 'pending',
    });
    console.log(`[v20.0] ✅ Enqueued paper: ${payload.arxivId}`);
    res.status(200).json({ success: true, message: 'Paper enqueued for processing' });
  } catch (error) {
    console.error(`[v20.0] ❌ Error enqueuing paper ${payload.arxivId}:`, error);
    res.status(500).json({ success: false, error: String(error) });
  }
}

/**
 * Process pending papers in a loop (background processing)
 * Polls database for papers with status='pending', processes them, and updates status
 */
async function processPendingPapers() {
  const db = await getDb();
  if (!db) {
    console.error('[v20.0] Database not available for processing loop.');
    return;
  }

  console.log('[v20.0] 🚀 Starting background processing loop...');

  while (true) {
    try {
      const pendingPapers = await db.select().from(papers).where(eq(papers.status, 'pending')).limit(10);
      
      if (pendingPapers.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s if no papers
        continue;
      }

      console.log(`[v20.0] 📋 Found ${pendingPapers.length} pending papers`);

      for (const paper of pendingPapers) {
        try {
          // Mark as processing
          await db.update(papers).set({ status: 'processing' }).where(eq(papers.id, paper.id));
          console.log(`[v20.0] 🔄 Processing paper: ${paper.arxivId}`);

          // Download and process PDF
          const pdfBuffer = await downloadPdf(paper.pdfUrl!);
          const text = await extractTextFromPdf(pdfBuffer);
          
          if (text.length < 1000) {
            console.log(`[v20.0] ⚠️ Paper ${paper.arxivId} has insufficient text (${text.length} chars)`);
            await db.update(papers).set({ status: 'failed' }).where(eq(papers.id, paper.id));
            continue;
          }

          // Chunk and generate embeddings
          const chunks = chunkText(text);
          const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));
          const embeddingCost = (chunks.reduce((sum, c) => sum + c.tokenCount, 0) / 1000) * 0.00002;

          // Store chunks and update status atomically
          await db.transaction(async (tx) => {
            await tx.update(papers).set({ chunksCount: chunks.length, status: 'completed' }).where(eq(papers.id, paper.id));

            const chunkInsertPromises = chunks.map((chunk, j) =>
              tx.insert(paperChunks).values({
                paperId: paper.id,
                chunkIndex: j,
                text: chunk.text,
                embedding: JSON.stringify(embeddings[j]),
                tokenCount: chunk.tokenCount,
              })
            );
            await Promise.all(chunkInsertPromises);

            await tx.update(knowledgeAreas)
              .set({
                papersCount: sql`${knowledgeAreas.papersCount} + 1`,
                chunksCount: sql`${knowledgeAreas.chunksCount} + ${chunks.length}`,
                cost: sql`${knowledgeAreas.cost} + ${embeddingCost}`,
              })
              .where(eq(knowledgeAreas.id, paper.knowledgeAreaId!));
          });

          console.log(`[v20.0] ✅ Processed paper: ${paper.arxivId} (${chunks.length} chunks)`);
        } catch (error) {
          console.error(`[v20.0] ❌ Error processing paper ${paper.arxivId}:`, error);
          await db.update(papers).set({ status: 'failed' }).where(eq(papers.id, paper.id));
        }
      }
    } catch (error) {
      console.error('[v20.0] ❌ Error in processing loop:', error);
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s on error
    }
  }
}

// Start background processing loop
processPendingPapers();
