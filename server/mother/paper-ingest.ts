/**
 * MOTHER v55.1 - Scientific Paper Ingestion Pipeline
 *
 * Implements a full RAG pipeline for academic papers:
 * 1. arXiv metadata retrieval (title, authors, abstract, PDF URL)
 * 2. PDF download and text extraction (pdf-parse)
 * 3. Semantic chunking (token-aware, 512-token chunks with 64-token overlap)
 * 4. Embedding generation (text-embedding-3-small, 1536 dims)
 * 5. Indexed storage in `papers` + `paper_chunks` tables
 * 6. Knowledge layer integration (Source 4: External Knowledge Bases)
 *
 * Scientific basis:
 * - RAG (Lewis et al., NeurIPS 2020): Retrieval-Augmented Generation
 * - Neutrino (TechRxiv 2025): Structure-aware RAG for scientific literature
 * - Chunking strategies (IEEE 2025): 512-token chunks optimal for scientific text
 * - text-embedding-3-small: 62.3% MTEB score, 1536 dims, $0.02/1M tokens
 *
 * v55.1 fix: Uses raw SQL to match production DB column names (snake_case)
 * The production DB uses: arxiv_id, paper_id, chunk_index, token_count, content
 * (not the camelCase names in the Drizzle schema definition)
 */

import { getDb } from '../db';
import { getEmbedding } from './embeddings';
import { sql } from 'drizzle-orm';

// ==================== TYPES ====================

export interface ArxivPaperMetadata {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedDate: Date;
  pdfUrl: string;
  categories: string[];
}

export interface PaperIngestResult {
  arxivId: string;
  title: string;
  paperId: number;
  chunksCreated: number;
  skipped: boolean;
  error?: string;
}

// ==================== CONSTANTS ====================

const CHUNK_SIZE_TOKENS = 512;
const CHUNK_OVERLAP_TOKENS = 64;
const PDF_DOWNLOAD_TIMEOUT_MS = 30000;
const EMBEDDING_BATCH_SIZE = 10;

// ==================== ARXIV METADATA ====================

/**
 * Fetch paper metadata from arXiv API
 */
export async function fetchArxivMetadata(arxivUrl: string): Promise<ArxivPaperMetadata | null> {
  try {
    // Clean the arXiv ID from various URL formats
    let cleanId = arxivUrl
      .replace('http://arxiv.org/abs/', '')
      .replace('https://arxiv.org/abs/', '')
      .replace('http://arxiv.org/pdf/', '')
      .replace('https://arxiv.org/pdf/', '')
      .replace(/v\d+$/, ''); // Remove version suffix like v1, v2
    
    const url = `https://export.arxiv.org/api/query?id_list=${cleanId}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-Scientific-Agent/55.1' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return null;
    
    const xml = await response.text();
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
    if (!entry) return null;
    
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
    const abstract = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
    const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() || '';
    const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
    
    const authorMatches = entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g);
    const authors = [...authorMatches].map(m => m[1].trim());
    
    const categoryMatches = entry.matchAll(/term="([^"]+)"/g);
    const categories = [...categoryMatches].map(m => m[1]).filter(c => c.includes('.'));
    
    const idMatch = id.match(/abs\/(.+)$/);
    const paperId = idMatch?.[1] || cleanId;
    const pdfUrl = `https://arxiv.org/pdf/${paperId}`;
    
    return {
      arxivId: paperId,
      title,
      authors,
      abstract,
      publishedDate: new Date(published),
      pdfUrl,
      categories,
    };
  } catch (error) {
    console.error(`[PaperIngest] Failed to fetch arXiv metadata for ${arxivUrl}:`, error);
    return null;
  }
}

// ==================== PDF PROCESSING ====================

async function downloadAndExtractPdf(pdfUrl: string): Promise<string | null> {
  try {
    console.log(`[PaperIngest] Downloading PDF: ${pdfUrl}`);
    
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'MOTHER-Scientific-Agent/55.1',
        'Accept': 'application/pdf',
      },
      signal: AbortSignal.timeout(PDF_DOWNLOAD_TIMEOUT_MS),
    });
    
    if (!response.ok) {
      console.warn(`[PaperIngest] PDF download failed: ${response.status}`);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(buffer);
    
    console.log(`[PaperIngest] PDF downloaded: ${(pdfBuffer.length / 1024).toFixed(1)}KB`);
    
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(pdfBuffer);
    
    const text = data.text?.trim() || '';
    console.log(`[PaperIngest] Extracted ${text.length} chars from ${data.numpages} pages`);
    
    if (text.length < 200) {
      console.warn('[PaperIngest] Extracted text too short — likely image-based PDF');
      return null;
    }
    
    return text;
  } catch (error) {
    console.error('[PaperIngest] PDF extraction failed:', error);
    return null;
  }
}

// ==================== CHUNKING ====================

/**
 * Token-aware chunking with overlap
 * Chunk size: 512 tokens (~384 words), Overlap: 64 tokens (~48 words)
 * Per Neutrino (TechRxiv 2025): 512-token chunks optimal for scientific text
 */
function chunkText(text: string): string[] {
  const wordsPerChunk = Math.floor(CHUNK_SIZE_TOKENS * 0.75);
  const wordsOverlap = Math.floor(CHUNK_OVERLAP_TOKENS * 0.75);
  
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;
  
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);
    
    if (currentWordCount + words.length > wordsPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const overlapWords = currentChunk.trim().split(/\s+/).slice(-wordsOverlap);
      currentChunk = overlapWords.join(' ') + ' ' + paragraph;
      currentWordCount = overlapWords.length + words.length;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentWordCount += words.length;
    }
  }
  
  if (currentChunk.trim().length > 100) {
    chunks.push(currentChunk.trim());
  }
  
  // Fallback: sliding window on sentences
  if (chunks.length === 0 && text.length > 100) {
    const sentences = text.split(/[.!?]+\s+/).filter(s => s.length > 20);
    let chunk = '';
    let count = 0;
    
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).length;
      if (count + words > wordsPerChunk && chunk.length > 0) {
        chunks.push(chunk.trim());
        chunk = sentence;
        count = words;
      } else {
        chunk += (chunk ? ' ' : '') + sentence;
        count += words;
      }
    }
    if (chunk.trim().length > 50) chunks.push(chunk.trim());
  }
  
  console.log(`[PaperIngest] Created ${chunks.length} chunks`);
  return chunks;
}

// ==================== MAIN INGEST PIPELINE ====================

/**
 * Full paper ingestion pipeline
 * Uses raw SQL to match production DB column names (snake_case)
 */
export async function ingestPaper(arxivUrl: string): Promise<PaperIngestResult> {
  const db = await getDb();
  if (!db) {
    return { arxivId: arxivUrl, title: '', paperId: -1, chunksCreated: 0, skipped: false, error: 'Database not available' };
  }
  
  // 1. Fetch metadata
  const metadata = await fetchArxivMetadata(arxivUrl);
  if (!metadata) {
    return { arxivId: arxivUrl, title: '', paperId: -1, chunksCreated: 0, skipped: false, error: 'Failed to fetch arXiv metadata' };
  }
  
  console.log(`[PaperIngest] Processing: "${metadata.title.slice(0, 60)}..." (${metadata.arxivId})`);
  
  // 2. Check for duplicates using raw SQL (production uses arxiv_id snake_case)
  const existing = await db.execute(
    sql`SELECT id FROM papers WHERE arxiv_id = ${metadata.arxivId} LIMIT 1`
  );
  
  const existingRows = (existing as any)[0] as any[];
  if (existingRows && existingRows.length > 0) {
    console.log(`[PaperIngest] Paper already indexed: ${metadata.arxivId}`);
    return { arxivId: metadata.arxivId, title: metadata.title, paperId: existingRows[0].id, chunksCreated: 0, skipped: true };
  }
  
  // 3. Download and extract PDF text (fallback to abstract)
  let fullText = await downloadAndExtractPdf(metadata.pdfUrl);
  let textSource = 'pdf';
  
  if (!fullText) {
    console.log(`[PaperIngest] Using abstract as fallback for: ${metadata.arxivId}`);
    fullText = `Title: ${metadata.title}\n\nAuthors: ${metadata.authors.join(', ')}\n\nAbstract: ${metadata.abstract}`;
    textSource = 'abstract';
  }
  
  // 4. Insert paper record using raw SQL
  const authorsJson = JSON.stringify(metadata.authors);
  const publishedStr = metadata.publishedDate.toISOString().split('T')[0];
  
  const insertResult = await db.execute(
    sql`INSERT INTO papers (arxiv_id, title, authors, abstract, published_date, status) 
        VALUES (${metadata.arxivId}, ${metadata.title.slice(0, 999)}, ${authorsJson}, ${metadata.abstract.slice(0, 65000)}, ${publishedStr}, 'processing')`
  );
  
  const paperId = (insertResult as any)[0]?.insertId as number;
  if (!paperId) {
    return { arxivId: metadata.arxivId, title: metadata.title, paperId: -1, chunksCreated: 0, skipped: false, error: 'Failed to insert paper record' };
  }
  
  console.log(`[PaperIngest] Paper record created: ID ${paperId}`);
  
  // 5. Chunk text
  const chunks = chunkText(fullText);
  
  if (chunks.length === 0) {
    await db.execute(sql`UPDATE papers SET status = 'failed' WHERE id = ${paperId}`);
    return { arxivId: metadata.arxivId, title: metadata.title, paperId, chunksCreated: 0, skipped: false, error: 'No chunks generated' };
  }
  
  // 6. Generate embeddings and store chunks (batched)
  let chunksCreated = 0;
  
  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);
    
    await Promise.all(batch.map(async (chunkContent, batchIdx) => {
      const chunkIndex = batchStart + batchIdx;
      
      try {
        const embedding = await getEmbedding(chunkContent);
        const embeddingJson = JSON.stringify(embedding);
        const tokenCount = Math.floor(chunkContent.split(/\s+/).length / 0.75);
        
        // Use raw SQL with production column names: paper_id, chunk_index, content, token_count
        await db.execute(
          sql`INSERT INTO paper_chunks (paper_id, chunk_index, content, embedding, token_count) 
              VALUES (${paperId}, ${chunkIndex}, ${chunkContent.slice(0, 65000)}, ${embeddingJson}, ${tokenCount})`
        );
        
        chunksCreated++;
      } catch (err) {
        console.error(`[PaperIngest] Failed to embed chunk ${chunkIndex}:`, err);
      }
    }));
    
    if (batchStart + EMBEDDING_BATCH_SIZE < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // 7. Update paper status
  await db.execute(
    sql`UPDATE papers SET status = 'completed' WHERE id = ${paperId}`
  );
  
  console.log(`[PaperIngest] ✅ Indexed: "${metadata.title.slice(0, 50)}" — ${chunksCreated} chunks (source: ${textSource})`);
  
  return {
    arxivId: metadata.arxivId,
    title: metadata.title,
    paperId,
    chunksCreated,
    skipped: false,
  };
}

// ==================== BATCH INGEST ====================

/**
 * Ingest multiple papers from arXiv search results
 * Processes papers sequentially to respect arXiv rate limits (3s between requests)
 */
export async function ingestPapersFromSearch(arxivUrls: string[]): Promise<PaperIngestResult[]> {
  console.log(`[PaperIngest] Starting batch ingest of ${arxivUrls.length} papers`);
  
  const results: PaperIngestResult[] = [];
  
  for (const url of arxivUrls) {
    try {
      const result = await ingestPaper(url);
      results.push(result);
      
      if (!result.skipped && !result.error) {
        console.log(`[PaperIngest] ✅ ${result.arxivId}: ${result.chunksCreated} chunks`);
      }
      
      // Rate limit: 3 seconds between papers (arXiv API guideline)
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (err) {
      console.error(`[PaperIngest] Failed to ingest ${url}:`, err);
      results.push({ arxivId: url, title: '', paperId: -1, chunksCreated: 0, skipped: false, error: String(err) });
    }
  }
  
  const successful = results.filter(r => !r.error && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => r.error).length;
  
  console.log(`[PaperIngest] Batch complete: ${successful} indexed, ${skipped} skipped, ${failed} failed`);
  
  return results;
}

// ==================== SEMANTIC SEARCH OVER PAPER CHUNKS ====================

/**
 * Search indexed paper chunks using cosine similarity
 * Integrates with MOTHER knowledge layer (Source 4: External Knowledge Bases)
 * 
 * Uses raw SQL to match production DB column names (snake_case)
 */
export async function searchPaperChunks(query: string, topK: number = 5): Promise<Array<{
  text: string;
  similarity: number;
  paperId: number;
  arxivId: string;
  title: string;
  authors: string;
  chunkIndex: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const queryEmbedding = await getEmbedding(query);
    
    // Raw SQL query using production column names
    const chunksResult = await db.execute(
      sql`SELECT pc.id, pc.paper_id, pc.chunk_index, pc.content, pc.embedding,
               p.arxiv_id, p.title, p.authors
          FROM paper_chunks pc
          INNER JOIN papers p ON pc.paper_id = p.id
          WHERE pc.embedding IS NOT NULL
          LIMIT 500`
    );
    
    const chunks = (chunksResult as any)[0] as any[];
    
    if (!chunks || chunks.length === 0) {
      console.log('[PaperIngest] No paper chunks in database');
      return [];
    }
    
    const scored = chunks
      .map(c => {
        try {
          const chunkEmbedding = JSON.parse(c.embedding);
          const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
          return {
            text: c.content as string,
            similarity,
            paperId: c.paper_id as number,
            arxivId: c.arxiv_id as string || '',
            title: c.title as string || '',
            authors: c.authors as string || '',
            chunkIndex: c.chunk_index as number,
          };
        } catch {
          return null;
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    console.log(`[PaperIngest] Vector search: ${scored.length} relevant chunks found (from ${chunks.length} total)`);
    
    return scored;
  } catch (error) {
    console.error('[PaperIngest] Vector search failed:', error);
    return [];
  }
}

// ==================== COSINE SIMILARITY ====================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
