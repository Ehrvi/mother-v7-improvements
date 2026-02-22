/**
 * Omniscient Worker Endpoint (v20.4 Synchronous Architecture)
 * 
 * Implements fully synchronous processing aligned with Cloud Run serverless constraints.
 * 
 * Architecture:
 * 1. processPaper() - Called by Cloud Tasks, processes paper synchronously within HTTP request lifecycle
 * 2. No background loops or polling - each Cloud Tasks invocation processes exactly one paper
 * 
 * v20.4 eliminates the background loop pattern incompatible with Cloud Run serverless.
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
 * Process a paper synchronously (called by Cloud Tasks)
 * Downloads PDF, extracts text, generates embeddings, and saves everything atomically
 * Returns HTTP 200 only after processing is complete
 */
export async function processPaper(req: Request, res: Response): Promise<void> {
  const db = await getDb();
  if (!db) {
    res.status(500).json({ success: false, error: 'Database not available' });
    return;
  }

  const payload: WorkerPayload = req.body;
  
  try {
    // 1. Check if paper already exists before any heavy processing
    const existingPaper = await db.select().from(papers).where(eq(papers.arxivId, payload.arxivId)).limit(1);
    if (existingPaper.length > 0) {
      console.log(`[v20.4] Paper ${payload.arxivId} already exists. Skipping.`);
      res.status(200).json({ success: true, message: 'Paper already exists' });
      return;
    }

    console.log(`[v20.4] 🔄 Processing paper: ${payload.arxivId}`);

    // 2. Download and process PDF
    const pdfBuffer = await downloadPdf(payload.pdfUrl);
    const text = await extractTextFromPdf(pdfBuffer);
    
    if (text.length < 1000) {
      console.log(`[v20.4] ⚠️ Paper ${payload.arxivId} has insufficient text (${text.length} chars)`);
      // Save as 'failed' to avoid retrying
      await db.insert(papers).values({
        knowledgeAreaId: payload.knowledgeAreaId,
        arxivId: payload.arxivId,
        title: payload.title,
        authors: payload.authors.join(', '),
        abstract: payload.abstract,
        publishedDate: new Date(payload.publishedDate),
        pdfUrl: payload.pdfUrl,
        status: 'failed',
        chunksCount: 0,
      });
      res.status(200).json({ success: false, message: 'Insufficient text content' });
      return;
    }

    // 3. Chunk text and generate embeddings
    const chunks = chunkText(text);
    const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));
    const embeddingCost = (chunks.reduce((sum, c) => sum + c.tokenCount, 0) / 1000) * 0.00002;

    // 4. Save everything in a single atomic transaction
    await db.transaction(async (tx) => {
      // Insert paper with 'completed' status
      const paperData = {
        knowledgeAreaId: payload.knowledgeAreaId,
        arxivId: payload.arxivId,
        title: payload.title,
        authors: payload.authors.join(', '),
        abstract: payload.abstract,
        publishedDate: new Date(payload.publishedDate),
        pdfUrl: payload.pdfUrl,
        status: 'completed' as const,
        chunksCount: chunks.length,
      };
      console.log(`[v20.4] 📝 Inserting paper data:`, JSON.stringify({
        arxivId: paperData.arxivId,
        knowledgeAreaId: paperData.knowledgeAreaId,
        publishedDate: paperData.publishedDate,
        authorsLength: paperData.authors.length,
        abstractLength: paperData.abstract?.length || 0,
      }));
      const paperResult = await tx.insert(papers).values(paperData);

      const paperId = Number(paperResult[0].insertId);

      // Insert all chunks in parallel
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

      // Atomically update knowledge area stats
      await tx.update(knowledgeAreas)
        .set({
          papersCount: sql`${knowledgeAreas.papersCount} + 1`,
          chunksCount: sql`${knowledgeAreas.chunksCount} + ${chunks.length}`,
          cost: sql`${knowledgeAreas.cost} + ${embeddingCost}`,
        })
        .where(eq(knowledgeAreas.id, payload.knowledgeAreaId));
    });

    console.log(`[v20.4] ✅ Processed paper: ${payload.arxivId} (${chunks.length} chunks, cost: $${embeddingCost.toFixed(8)})`);
    res.status(200).json({ 
      success: true, 
      message: 'Paper processed successfully', 
      chunksCount: chunks.length,
      cost: embeddingCost 
    });
  } catch (error) {
    console.error(`[v20.4] ❌ Error processing paper ${payload.arxivId}:`, error);
    console.error(`[v20.4] 🔍 Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      payload: {
        arxivId: payload.arxivId,
        knowledgeAreaId: payload.knowledgeAreaId,
        publishedDate: payload.publishedDate,
        authorsCount: payload.authors?.length || 0,
      }
    });
    
    // Try to save as 'failed' to avoid infinite retries
    try {
      await db.insert(papers).values({
        knowledgeAreaId: payload.knowledgeAreaId,
        arxivId: payload.arxivId,
        title: payload.title,
        authors: payload.authors.join(', '),
        abstract: payload.abstract,
        publishedDate: new Date(payload.publishedDate),
        pdfUrl: payload.pdfUrl,
        status: 'failed',
        chunksCount: 0,
      });
    } catch (insertError) {
      console.error(`[v20.4] ❌ Failed to save error state for paper ${payload.arxivId}:`, insertError);
    }
    
    res.status(500).json({ success: false, error: String(error) });
  }
}
