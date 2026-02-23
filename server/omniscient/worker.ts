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
import { extractTextFromPdf } from './pdf';
import { processTextWithPython, PythonProcessResult } from './worker-python-helper';
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
  // Extract traceId for correlation
  const traceId = req.headers['x-cloud-trace-context']?.toString().split('/')[0] || 'no-trace';
  const startTime = Date.now();
  
  // Log entry ALWAYS - to detect code drift
  logger.info('📥 Paper Worker invoked', {
    traceId,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body || {}),
    hasArxivId: !!req.body?.arxivId,
    hasKnowledgeAreaId: !!req.body?.knowledgeAreaId,
  });

  const db = await getDb();
  if (!db) {
    logger.error('❌ Database not available', { traceId });
    res.status(500).json({ success: false, error: 'Database not available' });
    return;
  }

  const payload: WorkerPayload = req.body;
  const timer = startTimer();
  
  try {
    // Validate payload
    if (!payload?.arxivId || !payload?.knowledgeAreaId) {
      logger.error('❌ Invalid payload', { traceId, payload });
      res.status(400).json({ success: false, message: 'Invalid payload: missing arxivId or knowledgeAreaId' });
      return;
    }
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
    const pdfBuffer = await retry(() => downloadPdf(payload.pdfUrl), 3, 1000);
    const text = await extractTextFromPdf(pdfBuffer);
    
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

    // 3. Chunk text and generate embeddings via isolated Python process
    const processResult: PythonProcessResult = await retry(() => processTextWithPython(text), 3, 1000);
    
    if (!processResult.success) {
      throw new Error(`Python processor failed: ${processResult.error}`);
    }
    
    const chunks = (processResult.chunks || []).map(c => ({
      text: c.text,
      tokenCount: c.tokens,
    }));
    const embeddings = (processResult.chunks || []).map(c => c.embedding);
    const embeddingCost = ((processResult.total_tokens || 0) / 1000) * 0.00002;

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
      logger.debug('Inserting paper data', {
        arxivId: paperData.arxivId,
        knowledgeAreaId: paperData.knowledgeAreaId,
        publishedDate: paperData.publishedDate,
        authorsLength: paperData.authors.length,
        abstractLength: paperData.abstract?.length || 0,
      });
      const paperResult = await tx.insert(papers).values(paperData);

      const paperId = Number(paperResult[0].insertId);

      // Insert all chunks in parallel
      const chunkInsertPromises = chunks.map((chunk: any, j: number) =>
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

    logger.info('Paper processed successfully', {
      arxivId: payload.arxivId,
      knowledgeAreaId: payload.knowledgeAreaId,
      chunksCount: chunks.length,
      cost: embeddingCost,
      durationMs: timer.end(),
    });
    res.status(200).json({ 
      success: true, 
      message: 'Paper processed successfully', 
      chunksCount: chunks.length,
      cost: embeddingCost 
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('🔥 Unhandled Paper Worker exception', {
      traceId,
      arxivId: payload.arxivId,
      knowledgeAreaId: payload.knowledgeAreaId,
      publishedDate: payload.publishedDate,
      authorsCount: payload.authors?.length || 0,
      duration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
    
    res.status(500).json({ success: false, error: 'Internal Server Error', message: String(error) });
  }
}
