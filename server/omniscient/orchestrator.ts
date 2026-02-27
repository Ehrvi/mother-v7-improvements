/**
 * MOTHER Omniscient - Study Orchestrator
 * 
 * Orchestrates the 7-layer pipeline for studying knowledge areas:
 * 1. Discovery: Search arXiv for papers
 * 2. Retrieval: Download PDFs
 * 3. Processing: Extract text + chunk
 * 4. Indexing: Generate embeddings + store
 * 5. Validation: Quality checks
 * 6. Integration: Update knowledge base
 * 7. Completion: Update metrics
 */

import { getDb } from '../db';
import { knowledgeAreas, papers, paperChunks } from '../../drizzle/schema';
import { searchArxiv, downloadPdf } from './arxiv';
import { extractTextFromPdf, chunkText } from './pdf';
import { generateEmbeddingsBatch } from './embeddings';
import { jobQueue, type StudyJob } from './queue';
import { eq } from 'drizzle-orm';
import { reliabilityLogger } from '../mother/reliability-logger'; // v74.9: NC-PATCH-001 monitoring integration

export interface StudyOptions {
  maxPapers?: number; // Max papers to process (default: 100)
  dateRange?: { start: string; end: string }; // Date range filter (YYYY-MM-DD)
  minQuality?: number; // Minimum quality score (0-100, default: 70)
}

export interface StudyResult {
  job: StudyJob;
  knowledgeAreaId: number;
  papersProcessed: number;
  chunksCreated: number;
  totalCost: number;
}

/**
 * Study a knowledge area by processing papers from arXiv
 * 
 * @param name Knowledge area name (e.g., "quantum computing")
 * @param description Optional description
 * @param options Study options (max papers, date range, etc.)
 * @returns Study result with job info and metrics
 * 
 * @example
 * const result = await studyKnowledgeArea("quantum computing", "Study quantum computing papers", { maxPapers: 50 });
 * console.log(`Processed ${result.papersProcessed} papers, created ${result.chunksCreated} chunks`);
 */
export async function studyKnowledgeArea(
  name: string,
  description?: string,
  options: StudyOptions = {}
): Promise<StudyResult> {
  const {
    maxPapers = 100,
    dateRange,
    minQuality = 70,
  } = options;

  console.log(`\n=== MOTHER Omniscient: Studying "${name}" ===`);
  reliabilityLogger.info('omniscient', `Starting study: "${name}"`, { maxPapers, minQuality });
  console.log(`Max papers: ${maxPapers}, Min quality: ${minQuality}`);

  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // LAYER 1: Create knowledge area entry
  console.log(`[1/7] Creating knowledge area: "${name}"...`);
  const result = await db.insert(knowledgeAreas).values({
    name,
    description: description || `Knowledge area: ${name}`,
    status: 'pending',
    papersCount: 0,
    chunksCount: 0,
  });
  
  const areaId = Number(result[0].insertId);
  const [area] = await db.select().from(knowledgeAreas).where(eq(knowledgeAreas.id, areaId));

  console.log(`✅ Knowledge area created (ID: ${area.id})`);

  // Create job
  const job = jobQueue.createJob(area.id, name);

  try {
    // LAYER 2: Discovery (Search arXiv)
    console.log(`[2/7] Searching arXiv for "${name}" papers...`);
    jobQueue.updateJob(job.id, {
      status: 'discovering',
      currentStep: `Searching arXiv for "${name}" papers...`,
    });

    await db!.update(knowledgeAreas)
      .set({ status: 'in_progress' })
      .where(eq(knowledgeAreas.id, areaId));

    const arxivPapers = await searchArxiv({ query: name, maxResults: maxPapers });
    console.log(`✅ Found ${arxivPapers.length} papers`);

    jobQueue.updateJob(job.id, {
      total: arxivPapers.length,
      currentStep: `Found ${arxivPapers.length} papers, starting processing...`,
    });

    // LAYER 3-6: Process each paper
    console.log(`[3/7] Processing ${arxivPapers.length} papers...`);
    let papersProcessed = 0;
    let chunksCreated = 0;
    let totalCost = 0;
    const errors: string[] = [];

    for (let i = 0; i < arxivPapers.length; i++) {
      const arxivPaper = arxivPapers[i];
      console.log(`\n--- Paper ${i + 1}/${arxivPapers.length} ---`);
      console.log(`Title: ${arxivPaper.title}`);
      console.log(`arXiv ID: ${arxivPaper.id}`);
      console.log(`Authors: ${arxivPaper.authors.join(', ')}`);

      try {
        // Update progress
        jobQueue.updateJob(job.id, {
          status: 'retrieving',
          progress: i,
          currentStep: `Processing paper ${i + 1}/${arxivPapers.length}: ${arxivPaper.title.substring(0, 50)}...`,
        });

        // LAYER 3: Retrieval (Download PDF)
        console.log(`Downloading PDF...`);
        const pdfBuffer = await downloadPdf(arxivPaper.pdfUrl);
        console.log(`✅ Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        // LAYER 4: Processing (Extract text + chunk)
        console.log(`Extracting text...`);
        jobQueue.updateJob(job.id, {
          status: 'processing',
          currentStep: `Extracting text from paper ${i + 1}/${arxivPapers.length}...`,
        });

        const text = await extractTextFromPdf(pdfBuffer);
        console.log(`✅ Extracted ${text.length} characters`);

        if (text.length < 1000) {
          console.warn(`⚠️  Text too short (${text.length} chars), skipping paper`);
          errors.push(`${arxivPaper.id}: Text too short`);
          continue;
        }

        console.log(`Chunking text...`);
        const chunks = chunkText(text);
        console.log(`✅ Created ${chunks.length} chunks`);

        // Store paper in database
        const paperResult = await db!.insert(papers).values({
          knowledgeAreaId: areaId,
          arxivId: arxivPaper.id,
          title: arxivPaper.title,
          authors: arxivPaper.authors.join(', '),
          abstract: arxivPaper.abstract,
          publishedDate: arxivPaper.publishedDate,
          pdfUrl: arxivPaper.pdfUrl,
          chunksCount: chunks.length,
        });
        
        const paperId = Number(paperResult[0].insertId);
        const [paper] = await db!.select().from(papers).where(eq(papers.id, paperId));

        // LAYER 5: Indexing (Generate embeddings + store)
        console.log(`Generating embeddings for ${chunks.length} chunks...`);
        jobQueue.updateJob(job.id, {
          status: 'indexing',
          currentStep: `Generating embeddings for paper ${i + 1}/${arxivPapers.length}...`,
        });

        const embeddings = await generateEmbeddingsBatch(chunks.map(c => c.text));
        const embeddingCost = (chunks.reduce((sum, c) => sum + c.tokenCount, 0) / 1000) * 0.00002;
        totalCost += embeddingCost;

        // Store chunks with embeddings
        for (let j = 0; j < chunks.length; j++) {
          await db!.insert(paperChunks).values({
            paperId,
            chunkIndex: j,
            text: chunks[j].text,
            embedding: JSON.stringify(embeddings[j]),
            tokenCount: chunks[j].tokenCount,
          });
        }

        papersProcessed++;
        chunksCreated += chunks.length;
        console.log(`✅ Paper processed successfully (${chunks.length} chunks stored)`);

      } catch (error) {
        console.error(`❌ Error processing paper ${arxivPaper.id}:`, error);
        errors.push(`${arxivPaper.id}: ${error}`);
        // Continue with next paper (partial success)
      }
    }

    // LAYER 7: Completion (Update metrics)
    console.log(`\n[7/7] Finalizing...`);
    jobQueue.updateJob(job.id, {
      status: 'validating',
      currentStep: 'Updating knowledge area metrics...',
    });

    await db!.update(knowledgeAreas)
      .set({
        status: 'completed',
        papersCount: papersProcessed,
        chunksCount: chunksCreated,
        cost: totalCost.toFixed(4),
        completedAt: new Date(),
      })
      .where(eq(knowledgeAreas.id, area.id));

    jobQueue.updateJob(job.id, {
      status: 'completed',
      progress: arxivPapers.length,
      currentStep: `Completed! Processed ${papersProcessed}/${arxivPapers.length} papers, created ${chunksCreated} chunks`,
    });

     console.log(`✅ Study completed!`);
    reliabilityLogger.info('omniscient', `Study completed: "${name}" — ${papersProcessed} papers, ${chunksCreated} chunks`, { papersProcessed, chunksCreated, totalCost });;
    console.log(`Papers processed: ${papersProcessed}/${arxivPapers.length}`);
    console.log(`Chunks created: ${chunksCreated}`);
    console.log(`Total cost: $${totalCost.toFixed(4)}`);
    if (errors.length > 0) {
      console.log(`Errors: ${errors.length} papers failed`);
      errors.forEach(err => console.log(`  - ${err}`));
    }

    return {
      job: jobQueue.getJob(job.id)!,
      knowledgeAreaId: area.id,
      papersProcessed,
      chunksCreated,
      totalCost,
    };

  } catch (error) {
    console.error(`\n❌ Study failed:`, error);

    // Mark as failed
    await db!.update(knowledgeAreas)
      .set({ status: 'failed' })
      .where(eq(knowledgeAreas.id, area.id));

    jobQueue.updateJob(job.id, {
      status: 'failed',
      errorMessage: String(error),
      currentStep: `Failed: ${error}`,
    });

    throw error;
  }
}
