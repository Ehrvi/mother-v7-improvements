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
import { logger, startTimer, formatError } from './logger';

/**
 * Generic retry function with exponential backoff
 * @param operation - Async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @returns Result of the operation
 */
async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      logger.warn('Retry attempt failed', {
        attempt,
        maxAttempts,
        delayMs,
        ...formatError(error),
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError!;
}

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
  const timer = startTimer();
  
  try {
    // 1. Check if paper already exists before any heavy processing
    const existingPaper = await db.select().from(papers).where(eq(papers.arxivId, payload.arxivId)).limit(1);
    if (existingPaper.length > 0) {
      logger.info('Paper already exists, skipping', {
        arxivId: payload.arxivId,
        knowledgeAreaId: payload.knowledgeAreaId,
      });
      res.status(200).json({ success: true, message: 'Paper already exists' });
      return;
    }

    logger.info('Processing paper started', {
      arxivId: payload.arxivId,
      knowledgeAreaId: payload.knowledgeAreaId,
      title: payload.title,
    });

    // 2. Download and process PDF (with retry)
    const downloadTimer = startTimer();
    const pdfBuffer = await retry(() => downloadPdf(payload.pdfUrl), 3, 1000);
    const downloadDurationMs = downloadTimer.end();
    logger.info('[PROFILING] PDF downloaded', {
      arxivId: payload.arxivId,
      durationMs: downloadDurationMs,
      bufferSizeKB: Math.round(pdfBuffer.length / 1024),
    });

    const extractionTimer = startTimer();
    const text = await extractTextFromPdf(pdfBuffer);
    const extractionDurationMs = extractionTimer.end();
    logger.info('[PROFILING] Text extracted', {
      arxivId: payload.arxivId,
      durationMs: extractionDurationMs,
      textLength: text.length,
    });
    
    if (text.length < 1000) {
      logger.warn('Paper has insufficient text', {
        arxivId: payload.arxivId,
        textLength: text.length,
        knowledgeAreaId: payload.knowledgeAreaId,
      });
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

    // 3. Chunk text and generate embeddings (with retry)
    const chunkingTimer = startTimer();
    const chunks = chunkText(text);
    const chunkingDurationMs = chunkingTimer.end();
    logger.info('[PROFILING] Text chunked', {
      arxivId: payload.arxivId,
      durationMs: chunkingDurationMs,
      chunksCount: chunks.length,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    });

    const embeddingTimer = startTimer();
    const embeddings = await retry(() => generateEmbeddingsBatch(chunks.map(c => c.text)), 3, 1000);
    const embeddingDurationMs = embeddingTimer.end();
    logger.info('[PROFILING] Embeddings generated', {
      arxivId: payload.arxivId,
      durationMs: embeddingDurationMs,
      chunksCount: chunks.length,
    });
    const embeddingCost = (chunks.reduce((sum, c) => sum + c.tokenCount, 0) / 1000) * 0.00002;

    // 4. Save everything in a single atomic transaction
    const dbTimer = startTimer();
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
      logger.debug('Inserting paper data', {
        arxivId: paperData.arxivId,
        knowledgeAreaId: paperData.knowledgeAreaId,
        publishedDate: paperData.publishedDate,
        authorsLength: paperData.authors.length,
        abstractLength: paperData.abstract?.length || 0,
      });
      const paperResult = await tx.insert(papers).values(paperData);

      const paperId = Number(paperResult[0].insertId);

      // Insert all chunks in a single batch (v25.1 optimization)
      // This reduces N round-trips to 1 round-trip, fixing the 41% database bottleneck
      const chunkValues = chunks.map((chunk, j) => ({
        paperId,
        chunkIndex: j,
        text: chunk.text,
        embedding: JSON.stringify(embeddings[j]),
        tokenCount: chunk.tokenCount,
      }));
      await tx.insert(paperChunks).values(chunkValues);

      // Atomically update knowledge area stats
      await tx.update(knowledgeAreas)
        .set({
          papersCount: sql`${knowledgeAreas.papersCount} + 1`,
          chunksCount: sql`${knowledgeAreas.chunksCount} + ${chunks.length}`,
          cost: sql`${knowledgeAreas.cost} + ${embeddingCost}`,
        })
        .where(eq(knowledgeAreas.id, payload.knowledgeAreaId));
    });
    const dbDurationMs = dbTimer.end();
    logger.info('[PROFILING] Database transaction completed', {
      arxivId: payload.arxivId,
      durationMs: dbDurationMs,
    });

    const totalDurationMs = timer.end();
    logger.info('[PROFILING] Paper processed successfully', {
      arxivId: payload.arxivId,
      knowledgeAreaId: payload.knowledgeAreaId,
      chunksCount: chunks.length,
      cost: embeddingCost,
      totalDurationMs,
      downloadDurationMs,
      extractionDurationMs,
      chunkingDurationMs,
      embeddingDurationMs,
      dbDurationMs,
      pdfPercentage: Math.round(((downloadDurationMs + extractionDurationMs) / totalDurationMs) * 100),
      embeddingPercentage: Math.round((embeddingDurationMs / totalDurationMs) * 100),
      dbPercentage: Math.round((dbDurationMs / totalDurationMs) * 100),
    });
    res.status(200).json({ 
      success: true, 
      message: 'Paper processed successfully', 
      chunksCount: chunks.length,
      cost: embeddingCost 
    });
  } catch (error) {
    logger.error('Error processing paper', {
      arxivId: payload.arxivId,
      knowledgeAreaId: payload.knowledgeAreaId,
      publishedDate: payload.publishedDate,
      authorsCount: payload.authors?.length || 0,
      durationMs: timer.end(),
      ...formatError(error),
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
