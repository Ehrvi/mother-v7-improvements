/**
 * MOTHER Omniscient - Integration Tests
 * 
 * Tests arXiv API integration and PDF processing
 */

import { describe, it, expect } from 'vitest';
import { searchArxiv, downloadPdf, getPaperById } from './arxiv';
import { processPdf, chunkText, countTokens } from './pdf';

describe('MOTHER Omniscient - arXiv Integration', () => {
  it('should search arXiv for papers', async () => {
    const papers = await searchArxiv({
      query: 'quantum computing',
      maxResults: 5,
    });
    
    expect(papers).toBeDefined();
    expect(papers.length).toBeGreaterThan(0);
    expect(papers.length).toBeLessThanOrEqual(5);
    
    // Verify paper structure
    const paper = papers[0];
    expect(paper.id).toBeDefined();
    expect(paper.title).toBeDefined();
    expect(paper.authors).toBeDefined();
    expect(paper.abstract).toBeDefined();
    expect(paper.publishedDate).toBeInstanceOf(Date);
    expect(paper.pdfUrl).toBeDefined();
    expect(paper.categories).toBeDefined();
    
    console.log(`✓ Found ${papers.length} papers on quantum computing`);
    console.log(`  First paper: ${paper.title}`);
    console.log(`  Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? '...' : ''}`);
  }, 30000); // 30s timeout for API call
  
  it('should get paper by arXiv ID', async () => {
    // Use a known paper ID (Attention Is All You Need - Transformer paper)
    const paper = await getPaperById('1706.03762');
    
    expect(paper).toBeDefined();
    expect(paper?.id).toContain('1706.03762');
    expect(paper?.title).toContain('Attention');
    
    console.log(`✓ Retrieved paper: ${paper?.title}`);
  }, 30000);
  
  it('should download PDF from arXiv', async () => {
    // Search for a paper
    const papers = await searchArxiv({
      query: 'machine learning',
      maxResults: 1,
    });
    
    expect(papers.length).toBeGreaterThan(0);
    
    const paper = papers[0];
    const pdfBuffer = await downloadPdf(paper.pdfUrl);
    
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000); // PDFs are typically >1KB
    
    console.log(`✓ Downloaded PDF: ${pdfBuffer.length} bytes`);
  }, 60000); // 60s timeout for PDF download
});

describe('MOTHER Omniscient - PDF Processing', () => {
  it('should count tokens correctly', () => {
    const text = 'This is a test sentence with multiple words.';
    const tokenCount = countTokens(text);
    
    expect(tokenCount).toBeGreaterThan(0);
    expect(tokenCount).toBeLessThan(20); // Should be ~10 tokens
    
    console.log(`✓ Counted ${tokenCount} tokens in: "${text}"`);
  });
  
  it('should chunk text with overlap', () => {
    const text = Array(100).fill('This is a test sentence.').join(' ');
    const chunks = chunkText(text, {
      chunkSize: 50,
      overlap: 10,
    });
    
    expect(chunks.length).toBeGreaterThan(1);
    
    // Verify chunk structure
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(chunk.text).toBeDefined();
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeLessThanOrEqual(60); // Allow some margin
    });
    
    console.log(`✓ Created ${chunks.length} chunks (avg ${Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)} tokens/chunk)`);
  });
});

describe('MOTHER Omniscient - End-to-End', () => {
  it('should process a paper from arXiv end-to-end', async () => {
    console.log('\n=== End-to-End Test: arXiv → PDF → Chunks ===\n');
    
    // Step 1: Search for a paper
    console.log('Step 1: Searching arXiv...');
    const papers = await searchArxiv({
      query: 'attention mechanism',
      maxResults: 1,
    });
    
    expect(papers.length).toBeGreaterThan(0);
    const paper = papers[0];
    console.log(`✓ Found paper: ${paper.title}`);
    console.log(`  arXiv ID: ${paper.id}`);
    console.log(`  Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? '...' : ''}`);
    console.log(`  Published: ${paper.publishedDate.toISOString().split('T')[0]}`);
    
    // Step 2: Download PDF
    console.log('\nStep 2: Downloading PDF...');
    const pdfBuffer = await downloadPdf(paper.pdfUrl);
    console.log(`✓ Downloaded: ${pdfBuffer.length} bytes`);
    
    // Step 3: Process PDF (extract text + chunk)
    console.log('\nStep 3: Processing PDF...');
    const chunks = await processPdf(pdfBuffer, {
      chunkSize: 1000,
      overlap: 200,
    });
    
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`✓ Created ${chunks.length} chunks`);
    console.log(`  Average tokens/chunk: ${Math.round(chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length)}`);
    console.log(`  First chunk preview: ${chunks[0].text.substring(0, 100)}...`);
    
    // Step 4: Verify chunk quality
    console.log('\nStep 4: Verifying chunk quality...');
    const avgTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length;
    expect(avgTokens).toBeGreaterThan(500); // Should be ~1000 tokens/chunk
    expect(avgTokens).toBeLessThan(1500);
    
    console.log(`✓ Chunk quality verified`);
    console.log('\n=== End-to-End Test PASSED ===\n');
  }, 120000); // 120s timeout for full pipeline
});

/**
 * TODO (Phase 5): Add tests for embeddings generation
 * TODO (Phase 5): Add tests for vector search
 * TODO (Phase 5): Add tests for job orchestration
 * TODO (Phase 5): Add tests for error recovery
 * TODO (Phase 5): Add tests for rate limiting
 */
