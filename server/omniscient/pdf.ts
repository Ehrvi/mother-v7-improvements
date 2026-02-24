/**
 * MOTHER Omniscient - PDF Processing
 * 
 * Provides functions to extract text from PDF files and chunk them for embeddings
 */

import { get_encoding } from 'tiktoken';
import { PDFParse } from 'pdf-parse';

/**
 * Text chunk with metadata
 */
export interface TextChunk {
  index: number; // Chunk index (0-based)
  text: string; // Chunk text
  tokenCount: number; // Number of tokens in chunk
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  chunkSize?: number; // Target chunk size in tokens (default: 4000)
  overlap?: number; // Overlap between chunks in tokens (default: 200)
}

/**
 * Extract text from PDF buffer
 * 
 * LIMITATION (MVP): Uses simple text extraction that works for basic PDFs.
 * For production, integrate pdf-parse or pdfjs-dist for better accuracy with:
 * - Multi-column layouts
 * - Tables and figures
 * - Complex formatting
 * - Image-based PDFs (OCR)
 * 
 * @param pdfBuffer - PDF file buffer
 * @returns Extracted text
 * 
 * @example
 * const pdfBuffer = await downloadPdf('http://arxiv.org/pdf/2301.12345v1');
 * const text = await extractTextFromPdf(pdfBuffer);
 * console.log(text);
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    // Use pdf-parse library (v2 API) for proper PDF text extraction
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    
    const text = result.text.trim();
    
    console.log(`[PDF] Extracted ${text.length} characters using pdf-parse`);
    console.log(`[PDF] Pages: ${result.pages?.length || 'unknown'}`);
    
    if (text.length < 100) {
      console.warn('[PDF] Extracted text is suspiciously short, PDF might be image-based or encrypted');
      console.warn('[PDF] Consider using OCR for image-based PDFs');
    }
    
    return text;
  } catch (error) {
    console.error('[PDF] Text extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error}`);
  }
}

/**
 * Count tokens in text using tiktoken (cl100k_base encoding for GPT-4/GPT-3.5)
 * 
 * @param text - Input text
 * @returns Token count
 */
export function countTokens(text: string): number {
  const encoding = get_encoding('cl100k_base');
  const tokens = encoding.encode(text);
  encoding.free(); // Free memory
  return tokens.length;
}

/**
 * Split text into chunks with overlap
 * 
 * Strategy:
 * 1. Split by sentences (using '. ' as delimiter)
 * 2. Group sentences into chunks of ~chunkSize tokens
 * 3. Add overlap by including last N tokens from previous chunk
 * 
 * @param text - Input text
 * @param options - Chunking options
 * @returns Array of text chunks
 */
export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const {
    chunkSize = 4000,
    overlap = 200,
  } = options;
  
  // Split text into sentences
  const sentences = text.split(/\.\s+/).map(s => s + '.');
  
  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let currentTokenCount = 0;
  let chunkIndex = 0;
  let previousChunkEnd = ''; // For overlap
  
  for (const sentence of sentences) {
    const sentenceTokenCount = countTokens(sentence);
    
    // If adding this sentence would exceed chunk size, start new chunk
    if (currentTokenCount + sentenceTokenCount > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        tokenCount: currentTokenCount,
      });
      
      // Start new chunk with overlap from previous chunk
      const overlapText = getLastNTokens(currentChunk, overlap);
      previousChunkEnd = overlapText;
      currentChunk = overlapText + ' ' + sentence;
      currentTokenCount = countTokens(currentChunk);
    } else {
      // Add sentence to current chunk
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
      currentTokenCount += sentenceTokenCount;
    }
  }
  
  // Add final chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex,
      text: currentChunk.trim(),
      tokenCount: currentTokenCount,
    });
  }
  
  console.log(`[PDF] Created ${chunks.length} chunks (avg ${Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)} tokens/chunk)`);
  
  return chunks;
}

/**
 * Get last N tokens from text
 * 
 * @param text - Input text
 * @param tokenCount - Number of tokens to extract
 * @returns Text containing last N tokens
 */
function getLastNTokens(text: string, tokenCount: number): string {
  const encoding = get_encoding('cl100k_base');
  const tokens = encoding.encode(text);
  
  if (tokens.length <= tokenCount) {
    encoding.free();
    return text;
  }
  
  // Get last N tokens
  const lastTokens = tokens.slice(-tokenCount);
  const decoded = new TextDecoder().decode(encoding.decode(lastTokens));
  
  encoding.free();
  return decoded;
}

/**
 * Process PDF: Extract text and chunk it
 * 
 * @param pdfBuffer - PDF file buffer
 * @param options - Chunking options
 * @returns Array of text chunks
 * 
 * @example
 * const pdfBuffer = await downloadPdf('http://arxiv.org/pdf/2301.12345v1');
 * const chunks = await processPdf(pdfBuffer, { chunkSize: 1000, overlap: 200 });
 */
export async function processPdf(
  pdfBuffer: Buffer,
  options: ChunkingOptions = {}
): Promise<TextChunk[]> {
  // Extract text from PDF
  const text = await extractTextFromPdf(pdfBuffer);
  
  // Chunk text
  const chunks = chunkText(text, options);
  
  return chunks;
}

/**
 * TODO (Phase 5): Implement better PDF text extraction using pdf-parse or pdfjs-dist
 * TODO (Phase 5): Implement table extraction from PDFs
 * TODO (Phase 5): Implement figure/image extraction from PDFs
 * TODO (Phase 5): Implement citation extraction from PDFs
 * TODO (Phase 5): Implement smart chunking (respect paragraph/section boundaries)
 */
