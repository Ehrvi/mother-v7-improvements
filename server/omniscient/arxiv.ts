/**
 * MOTHER Omniscient - arXiv API Client
 * 
 * Provides functions to search and retrieve academic papers from arXiv.org
 * 
 * API Documentation: https://arxiv.org/help/api/user-manual
 */

import { parseStringPromise } from 'xml2js';

/**
 * arXiv Paper metadata
 */
export interface ArxivPaper {
  id: string; // arXiv ID (e.g., "2301.12345")
  title: string;
  authors: string[]; // Array of author names
  abstract: string;
  publishedDate: Date;
  pdfUrl: string;
  categories: string[]; // arXiv categories (e.g., ["cs.AI", "cs.LG"])
}

/**
 * arXiv Search Options
 */
export interface ArxivSearchOptions {
  query: string; // Search query (e.g., "quantum computing")
  maxResults?: number; // Maximum number of results (default: 100)
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate'; // Sort order (default: relevance)
  sortOrder?: 'ascending' | 'descending'; // Sort direction (default: descending)
  startDate?: Date; // Filter papers published after this date
  endDate?: Date; // Filter papers published before this date
}

/**
 * arXiv API Base URL
 */
const ARXIV_API_BASE_URL = 'http://export.arxiv.org/api/query';

/**
 * Rate limit delay (3 seconds between requests to avoid 503 errors)
 */
const RATE_LIMIT_DELAY_MS = 3000;

/**
 * Last request timestamp (for rate limiting)
 */
let lastRequestTime = 0;

/**
 * Wait for rate limit delay
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

/**
 * Build arXiv API query URL
 */
function buildQueryUrl(options: ArxivSearchOptions): string {
  const {
    query,
    maxResults = 100,
    sortBy = 'relevance',
    sortOrder = 'descending',
  } = options;
  
  // Encode query (replace spaces with +)
  const encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
  
  // Build URL
  const url = new URL(ARXIV_API_BASE_URL);
  url.searchParams.set('search_query', `all:${encodedQuery}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', maxResults.toString());
  url.searchParams.set('sortBy', sortBy);
  url.searchParams.set('sortOrder', sortOrder);
  
  return url.toString();
}

/**
 * Parse arXiv API XML response
 */
async function parseArxivResponse(xml: string): Promise<ArxivPaper[]> {
  const result = await parseStringPromise(xml);
  
  // Extract entries from feed
  const entries = result.feed?.entry || [];
  
  // Parse each entry
  const papers: ArxivPaper[] = entries.map((entry: any) => {
    // Extract arXiv ID from entry.id (format: http://arxiv.org/abs/2301.12345v1)
    const idMatch = entry.id[0].match(/arxiv\.org\/abs\/([0-9.]+)/);
    const arxivId = idMatch ? idMatch[1] : '';
    
    // Extract title (remove newlines and extra spaces)
    const title = entry.title[0].replace(/\s+/g, ' ').trim();
    
    // Extract authors
    const authors = entry.author?.map((author: any) => author.name[0]) || [];
    
    // Extract abstract (remove newlines and extra spaces)
    const abstract = entry.summary[0].replace(/\s+/g, ' ').trim();
    
    // Extract published date
    const publishedDate = new Date(entry.published[0]);
    
    // Extract PDF URL
    const pdfLink = entry.link?.find((link: any) => link.$.title === 'pdf');
    const pdfUrl = pdfLink ? pdfLink.$.href : '';
    
    // Extract categories
    const categories = entry.category?.map((cat: any) => cat.$.term) || [];
    
    return {
      id: arxivId,
      title,
      authors,
      abstract,
      publishedDate,
      pdfUrl,
      categories,
    };
  });
  
  return papers;
}

/**
 * Search arXiv for papers
 * 
 * @param options - Search options
 * @returns Array of papers
 * 
 * @example
 * const papers = await searchArxiv({
 *   query: 'quantum computing',
 *   maxResults: 100,
 *   sortBy: 'relevance',
 * });
 */
export async function searchArxiv(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
  // Wait for rate limit
  await waitForRateLimit();
  
  // Build query URL
  const url = buildQueryUrl(options);
  
  console.log(`[arXiv] Searching: ${options.query} (max ${options.maxResults} results)`);
  
  try {
    // Fetch from arXiv API
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`arXiv API error: ${response.status} ${response.statusText}`);
    }
    
    // Parse XML response
    const xml = await response.text();
    const papers = await parseArxivResponse(xml);
    
    // Filter by date range if specified
    let filteredPapers = papers;
    
    if (options.startDate) {
      filteredPapers = filteredPapers.filter(
        paper => paper.publishedDate >= options.startDate!
      );
    }
    
    if (options.endDate) {
      filteredPapers = filteredPapers.filter(
        paper => paper.publishedDate <= options.endDate!
      );
    }
    
    console.log(`[arXiv] Found ${filteredPapers.length} papers`);
    
    return filteredPapers;
  } catch (error) {
    console.error('[arXiv] Search error:', error);
    throw error;
  }
}

/**
 * Download PDF from arXiv
 * 
 * @param pdfUrl - PDF URL from arXiv
 * @returns PDF buffer
 * 
 * @example
 * const pdfBuffer = await downloadPdf('http://arxiv.org/pdf/2301.12345v1');
 */
export async function downloadPdf(pdfUrl: string): Promise<Buffer> {
  // Wait for rate limit
  await waitForRateLimit();
  
  console.log(`[arXiv] Downloading PDF: ${pdfUrl}`);
  
  try {
    const response = await fetch(pdfUrl);
    
    if (!response.ok) {
      throw new Error(`PDF download error: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[arXiv] Downloaded PDF: ${buffer.length} bytes`);
    
    return buffer;
  } catch (error) {
    console.error('[arXiv] PDF download error:', error);
    throw error;
  }
}

/**
 * Get paper by arXiv ID
 * 
 * @param arxivId - arXiv ID (e.g., "2301.12345")
 * @returns Paper metadata
 * 
 * @example
 * const paper = await getPaperById('2301.12345');
 */
export async function getPaperById(arxivId: string): Promise<ArxivPaper | null> {
  const papers = await searchArxiv({
    query: `id:${arxivId}`,
    maxResults: 1,
  });
  
  return papers.length > 0 ? papers[0] : null;
}

/**
 * TODO (Phase 5): Implement retry logic with exponential backoff
 * TODO (Phase 5): Implement caching for repeated searches
 * TODO (Phase 5): Implement batch downloading (10 PDFs in parallel)
 * TODO (Phase 5): Implement error recovery (partial success handling)
 */
