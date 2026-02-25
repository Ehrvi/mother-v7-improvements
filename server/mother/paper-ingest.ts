/**
 * MOTHER v55.0 - Scientific Paper Ingestion Pipeline
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
 * - Chunking strategies (IEEE 2025): Semantic vs fixed-size chunking impact on RAG
 * - text-embedding-3-small: 62.3% MTEB score, 1536 dims, $0.02/1M tokens
 *
 * Architecture decision:
 * - Chunk size: 512 tokens (optimal for scientific text per Neutrino 2025)
 * - Overlap: 64 tokens (12.5% overlap prevents context loss at boundaries)
 * - Embedding model: text-embedding-3-small (cost-effective, high quality)
 * - Storage: MySQL `papers` + `paper_chunks` tables (already in schema)
 */

import { getDb } from '../db';
import { papers, paperChunks } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { getEmbedding } from './embeddings';

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
const EMBEDDING_BATCH_SIZE = 10; // Process 10 chunks at a time to avoid rate limits

// ==================== ARXIV METADATA ====================

/**
 * Fetch paper metadata from arXiv API (no PDF download needed for metadata)
 * Returns structured metadata for a given arXiv ID
 */
export async function fetchArxivMetadata(arxivId: string): Promise<ArxivPaperMetadata | null> {
  try {
    const cleanId = arxivId.replace('http://arxiv.org/abs/', '').replace('https://arxiv.org/abs/', '');
    const url = `https://export.arxiv.org/api/query?id_list=${cleanId}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-Scientific-Agent/55.0' },
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
    
    // Extract authors
    const authorMatches = entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g);
    const authors = [...authorMatches].map(m => m[1].trim());
    
    // Extract categories
    const categoryMatches = entry.matchAll(/term="([^"]+)"/g);
    const categories = [...categoryMatches].map(m => m[1]).filter(c => c.includes('.'));
    
    // Build PDF URL from arXiv ID
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
    console.error(`[PaperIngest] Failed to fetch arXiv metadata for ${arxivId}:`, error);
    return null;
  }
}

// ==================== PDF PROCESSING ====================

/**
 * Download PDF from arXiv and extract text
 * Uses pdf-parse for text extraction
 * Falls back to abstract-only if PDF download fails
 */
async function downloadAndExtractPdf(pdfUrl: string): Promise<string | null> {
  try {
    console.log(`[PaperIngest] Downloading PDF: ${pdfUrl}`);
    
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'MOTHER-Scientific-Agent/55.0',
        'Accept': 'application/pdf',
      },
      signal: AbortSignal.timeout(PDF_DOWNLOAD_TIMEOUT_MS),
    });
    
    if (!response.ok) {
      console.warn(`[PaperIngest] PDF download failed: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('pdf')) {
      console.warn(`[PaperIngest] Unexpected content type: ${contentType}`);
      return null;
    }
    
    const buffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(buffer);
    
    console.log(`[PaperIngest] PDF downloaded: ${(pdfBuffer.length / 1024).toFixed(1)}KB`);
    
    // Use pdf-parse for text extraction
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
 * Simple token-aware chunking using word count approximation
 * (1 token ≈ 0.75 words for English scientific text)
 * 
 * Uses sliding window with overlap to prevent context loss at boundaries.
 * Chunk size: 512 tokens, Overlap: 64 tokens
 * 
 * Scientific basis: Neutrino (TechRxiv 2025) found 512-token chunks
 * optimal for scientific literature retrieval tasks.
 */
function chunkText(text: string): string[] {
  // Approximate tokens: 1 token ≈ 0.75 words
  const wordsPerChunk = Math.floor(CHUNK_SIZE_TOKENS * 0.75);
  const wordsOverlap = Math.floor(CHUNK_OVERLAP_TOKENS * 0.75);
  
  // Split into paragraphs first (respect natural boundaries)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
  
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;
  
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);
    
    if (currentWordCount + words.length > wordsPerChunk && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap from previous chunk
      const overlapWords = currentChunk.trim().split(/\s+/).slice(-wordsOverlap);
      currentChunk = overlapWords.join(' ') + ' ' + paragraph;
      currentWordCount = overlapWords.length + words.length;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentWordCount += words.length;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim().length > 100) {
    chunks.push(currentChunk.trim());
  }
  
  // If no paragraphs found, fall back to sliding window on sentences
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
  
  console.log(`[PaperIngest] Created ${chunks.length} chunks (avg ${Math.floor(text.length / Math.max(chunks.length, 1))} chars/chunk)`);
  return chunks;
}

// ==================== MAIN INGEST PIPELINE ====================

/**
 * Full paper ingestion pipeline:
 * 1. Check if paper already indexed (deduplication by arxivId)
 * 2. Fetch metadata from arXiv API
 * 3. Download and parse PDF (fallback to abstract if PDF fails)
 * 4. Chunk text with overlap
 * 5. Generate embeddings for each chunk
 * 6. Store paper metadata + chunks in database
 * 
 * @param arxivUrl - arXiv URL or ID (e.g., "https://arxiv.org/abs/2301.12345" or "2301.12345")
 * @returns Ingest result with paper ID and chunk count
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
  
  // 2. Check for duplicates
  const existing = await db.select({ id: papers.id }).from(papers).where(eq(papers.arxivId, metadata.arxivId)).limit(1);
  if (existing.length > 0) {
    console.log(`[PaperIngest] Paper already indexed: ${metadata.arxivId}`);
    return { arxivId: metadata.arxivId, title: metadata.title, paperId: existing[0].id, chunksCreated: 0, skipped: true };
  }
  
  // 3. Download and extract PDF text (fallback to abstract)
  let fullText = await downloadAndExtractPdf(metadata.pdfUrl);
  let textSource = 'pdf';
  
  if (!fullText) {
    console.log(`[PaperIngest] Using abstract as fallback for: ${metadata.arxivId}`);
    // Use abstract + title as the text to index
    fullText = `Title: ${metadata.title}\n\nAuthors: ${metadata.authors.join(', ')}\n\nAbstract: ${metadata.abstract}`;
    textSource = 'abstract';
  }
  
  // 4. Insert paper record
  const [paperInsert] = await db.insert(papers).values({
    arxivId: metadata.arxivId,
    title: metadata.title,
    authors: JSON.stringify(metadata.authors),
    abstract: metadata.abstract,
    publishedDate: metadata.publishedDate,
    pdfUrl: metadata.pdfUrl,
    status: 'processing',
  });
  
  const paperId = (paperInsert as any).insertId as number;
  console.log(`[PaperIngest] Paper record created: ID ${paperId}`);
  
  // 5. Chunk text
  const chunks = chunkText(fullText);
  
  if (chunks.length === 0) {
    await db.update(papers).set({ status: 'failed' }).where(eq(papers.id, paperId));
    return { arxivId: metadata.arxivId, title: metadata.title, paperId, chunksCreated: 0, skipped: false, error: 'No chunks generated' };
  }
  
  // 6. Generate embeddings and store chunks (batched)
  let chunksCreated = 0;
  
  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);
    
    await Promise.all(batch.map(async (chunkText, batchIdx) => {
      const chunkIndex = batchStart + batchIdx;
      
      try {
        const embedding = await getEmbedding(chunkText);
        
        await db.insert(paperChunks).values({
          paperId,
          chunkIndex,
          text: chunkText,
          embedding: JSON.stringify(embedding),
          tokenCount: Math.floor(chunkText.split(/\s+/).length / 0.75),
        });
        
        chunksCreated++;
      } catch (err) {
        console.error(`[PaperIngest] Failed to embed chunk ${chunkIndex}:`, err);
      }
    }));
    
    // Small delay between batches to respect rate limits
    if (batchStart + EMBEDDING_BATCH_SIZE < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // 7. Update paper status
  await db.update(papers).set({
    status: 'completed',
    chunksCount: chunksCreated,
  }).where(eq(papers.id, paperId));
  
  console.log(`[PaperIngest] ✅ Indexed: "${metadata.title.slice(0, 50)}" — ${chunksCreated} chunks (source: ${textSource})`);
  
  return {
    arxivId: metadata.arxivId,
    title: metadata.title,
    paperId,
    chunksCreated,
    skipped: false,
  };
}

// ==================== BATCH INGEST FROM RESEARCH RESULTS ====================

/**
 * Ingest multiple papers from arXiv search results
 * Called by research.ts after finding papers
 * 
 * @param arxivUrls - Array of arXiv URLs or IDs
 * @returns Array of ingest results
 */
export async function ingestPapersFromSearch(arxivUrls: string[]): Promise<PaperIngestResult[]> {
  console.log(`[PaperIngest] Starting batch ingest of ${arxivUrls.length} papers`);
  
  const results: PaperIngestResult[] = [];
  
  // Process papers sequentially to avoid overwhelming the arXiv API
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
 * Integrates with the MOTHER knowledge layer (Source 4: External Knowledge Bases)
 * 
 * @param query - Natural language query
 * @param topK - Number of top results to return (default: 5)
 * @returns Relevant paper chunks with metadata
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
    // Get query embedding
    const queryEmbedding = await getEmbedding(query);
    
    // Fetch all paper chunks with paper metadata
    const chunks = await db
      .select({
        id: paperChunks.id,
        paperId: paperChunks.paperId,
        chunkIndex: paperChunks.chunkIndex,
        text: paperChunks.text,
        embedding: paperChunks.embedding,
        arxivId: papers.arxivId,
        title: papers.title,
        authors: papers.authors,
      })
      .from(paperChunks)
      .innerJoin(papers, eq(paperChunks.paperId, papers.id))
      .limit(500); // Limit to avoid memory issues
    
    if (chunks.length === 0) {
      console.log('[PaperIngest] No paper chunks in database');
      return [];
    }
    
    // Calculate cosine similarity for each chunk
    const scored = chunks
      .filter(c => c.embedding)
      .map(c => {
        try {
          const chunkEmbedding = JSON.parse(c.embedding!);
          const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
          return { ...c, similarity };
        } catch {
          return { ...c, similarity: 0 };
        }
      })
      .filter(c => c.similarity > 0.3) // Minimum relevance threshold
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    console.log(`[PaperIngest] Vector search: ${scored.length} relevant chunks found (from ${chunks.length} total)`);
    
    return scored.map(c => ({
      text: c.text,
      similarity: c.similarity,
      paperId: c.paperId,
      arxivId: c.arxivId || '',
      title: c.title || '',
      authors: c.authors || '',
      chunkIndex: c.chunkIndex,
    }));
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
