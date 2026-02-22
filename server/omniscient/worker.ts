/**
 * Omniscient Worker Endpoint (v19.4 Omega Fix)
 * 
 * Processes a single paper from Cloud Tasks queue.
 * This endpoint is called by Cloud Tasks for each paper in a study job.
 * 
 * v19.4 Optimizations:
 * 1. Parallel I/O (Promise.all for PDF download + DB check)
 * 2. Transaction-based chunk insertion (atomic, parallel)
 * 3. SQL-based atomic updates (no SELECT before UPDATE)
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
  publishedDate: Date;
  pdfUrl: string;
}

/**
 * Process a single paper (called by Cloud Tasks)
 */
export async function processOmniscientPaper(
  req: Request,
  res: Response
): Promise<void> {
  const db = await getDb();
  if (!db) {
    res.status(500).json({ success: false, error: 'Database not available' });
    return;
  }

  const payload: WorkerPayload = req.body;
  const { knowledgeAreaId, arxivId, title, authors, abstract, publishedDate, pdfUrl } = payload;

  try {
    console.log(`\n[Worker v19.4] Processing paper: ${arxivId}`);

    // Optimization 1: Parallel I/O (download PDF + check if paper exists)
    const [pdfBuffer, existingPaper] = await Promise.all([
      downloadPdf(pdfUrl),
      db.select().from(papers).where(eq(papers.arxivId, arxivId)).limit(1),
    ]);

    if (existingPaper.length > 0) {
      console.log(`  ⚠️ Paper ${arxivId} already exists. Skipping.`);
      res.status(200).json({ success: true, message: 'Paper already exists' });
      return;
    }

    const text = await extractTextFromPdf(pdfBuffer);
    if (text.length < 1000) {
      console.warn(`  ⚠️ Text too short (${text.length} chars), skipping.`);
      res.status(200).json({ success: false, reason: 'Text too short' });
      return;
    }

    const chunks = chunkText(text);
    const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));
    const embeddingCost = (chunks.reduce((sum, c) => sum + c.tokenCount, 0) / 1000) * 0.00002;

    // Optimization 2: Use transaction for atomicity
    await db.transaction(async (tx) => {
      const paperResult = await tx.insert(papers).values({
        knowledgeAreaId,
        arxivId,
        title,
        authors: authors.join(', '),
        abstract,
        publishedDate,
        pdfUrl,
        chunksCount: chunks.length,
      });
      const paperId = Number(paperResult[0].insertId);

      // Optimization 3: Insert chunks in parallel
      const chunkInsertPromises = chunks.map((chunk, j) =>
        tx.insert(paperChunks).values({
          paperId,
          chunkIndex: j,
          text: chunk.text,
          embedding: JSON.stringify(embeddings[j]),
          tokenCount: chunk.tokenCount,
        })
      );
      await Promise.all(chunkInsertPromises);

      // Optimization 4: Use SQL for atomic updates
      await tx.update(knowledgeAreas)
        .set({
          papersCount: sql`${knowledgeAreas.papersCount} + 1`,
          chunksCount: sql`${knowledgeAreas.chunksCount} + ${chunks.length}`,
          cost: sql`${knowledgeAreas.cost} + ${embeddingCost}`,
        })
        .where(eq(knowledgeAreas.id, knowledgeAreaId));
    });

    console.log(`  ✅ Paper ${arxivId} processed successfully!`);
    res.status(200).json({ success: true, arxivId, chunksCreated: chunks.length });

  } catch (error) {
    console.error(`\n❌ [Worker v19.4] Error processing ${arxivId}:`, error);
    res.status(500).json({ success: false, error: String(error), arxivId });
  }
}
