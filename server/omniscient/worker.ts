/**
 * Omniscient Worker Endpoint
 * 
 * Processes a single paper from Cloud Tasks queue.
 * This endpoint is called by Cloud Tasks for each paper in a study job.
 */

import { Request, Response } from 'express';
import { getDb } from '../db';
import { papers, paperChunks, knowledgeAreas } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
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
  
  try {
    const payload: WorkerPayload = req.body;

    console.log(`\n[Worker] Processing paper: ${payload.arxivId}`);
    console.log(`  Title: ${payload.title}`);
    console.log(`  Knowledge Area: ${payload.knowledgeAreaId}`);

    // Step 1: Download PDF
    console.log(`  [1/5] Downloading PDF...`);
    const pdfBuffer = await downloadPdf(payload.pdfUrl);
    console.log(`  ✅ Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // Step 2: Extract text
    console.log(`  [2/5] Extracting text...`);
    const text = await extractTextFromPdf(pdfBuffer);
    console.log(`  ✅ Extracted ${text.length} characters`);

    // Validate text length
    if (text.length < 1000) {
      console.warn(`  ⚠️  Text too short (${text.length} chars), skipping paper`);
      res.status(200).json({
        success: false,
        reason: 'Text too short',
        arxivId: payload.arxivId,
      });
      return;
    }

    // Step 3: Chunk text
    console.log(`  [3/5] Chunking text...`);
    const chunks = chunkText(text);
    console.log(`  ✅ Created ${chunks.length} chunks`);

    // Step 4: Store paper in database
    console.log(`  [4/5] Storing paper metadata...`);
    const paperResult = await db.insert(papers).values({
      knowledgeAreaId: payload.knowledgeAreaId,
      arxivId: payload.arxivId,
      title: payload.title,
      authors: payload.authors.join(', '),
      abstract: payload.abstract,
      publishedDate: payload.publishedDate,
      pdfUrl: payload.pdfUrl,
      chunksCount: chunks.length,
    });

    const paperId = Number(paperResult[0].insertId);
    console.log(`  ✅ Paper stored with ID: ${paperId}`);

    // Step 5: Generate embeddings and store chunks
    console.log(`  [5/5] Generating embeddings for ${chunks.length} chunks...`);
    const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));
    const embeddingCost = (chunks.reduce((sum, c) => sum + c.tokenCount, 0) / 1000) * 0.00002;

    // Store chunks with embeddings
    for (let j = 0; j < chunks.length; j++) {
      await db.insert(paperChunks).values({
        paperId,
        chunkIndex: j,
        text: chunks[j].text,
        embedding: JSON.stringify(embeddings[j]),
        tokenCount: chunks[j].tokenCount,
      });
    }

    console.log(`  ✅ Paper processed successfully!`);
    console.log(`  📊 Stats: ${chunks.length} chunks, $${embeddingCost.toFixed(4)} cost`);

    // Update knowledge area stats (increment counters)
    // Note: Using raw SQL for increment operations
    // This is a simplified version - in production, use proper atomic updates
    const [area] = await db.select().from(knowledgeAreas).where(eq(knowledgeAreas.id, payload.knowledgeAreaId));
    if (area) {
      await db
        .update(knowledgeAreas)
        .set({
          papersCount: (area.papersCount || 0) + 1,
          chunksCount: (area.chunksCount || 0) + chunks.length,
          cost: String((parseFloat(area.cost || '0') + embeddingCost).toFixed(4)),
        })
        .where(eq(knowledgeAreas.id, payload.knowledgeAreaId));
    }

    res.status(200).json({
      success: true,
      paperId,
      arxivId: payload.arxivId,
      chunksCreated: chunks.length,
      cost: embeddingCost,
    });

  } catch (error) {
    console.error(`\n❌ [Worker] Error processing paper:`, error);
    res.status(500).json({
      success: false,
      error: String(error),
      arxivId: req.body.arxivId,
    });
  }
}
