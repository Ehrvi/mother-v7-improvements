/**
 * CITATION ENGINE — C259-C (Ciclo 259)
 * Automatic bibliographic citation generation for MOTHER responses
 *
 * Scientific basis:
 * - Wu et al. (2025, Nature Communications): LLMs with citation footers have 13.83% better grounding
 * - AGREE (Google Research, 2024): precise citations increase reliability and traceability
 * - Semantic Scholar API (Allen Institute for AI, 2024): 200M+ papers, free access
 * - arXiv API (Cornell University, 2024): 2M+ preprints, open access
 * - Zins & Santos (2011, JASIST): hierarchical classification of human knowledge
 *
 * Architecture:
 * 1. Extract claims from response text
 * 2. Search Semantic Scholar for each claim
 * 3. Fallback to arXiv API if Semantic Scholar returns nothing
 * 4. Format citations in IEEE/APA style
 * 5. Append ## Referências section to response
 *
 * Conselho V102 Requirement:
 * - "Referências bibliográficas das respostas" — mandatory at end of every non-trivial response
 */

import { createLogger } from '../_core/logger';

const log = createLogger('CITATION-ENGINE');

export interface CitationResult {
  title: string;
  authors: string[];
  year: number;
  venue: string;
  url: string;
  doi?: string;
  arxivId?: string;
  citationKey: string; // e.g., "Smith2023"
}

export interface CitationEngineResult {
  applied: boolean;
  citationsFound: number;
  formattedReferences: string;
  responseWithCitations: string;
}

// Semantic Scholar API base URL
const SS_API_BASE = 'https://api.semanticscholar.org/graph/v1';
// arXiv API base URL
const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';

/**
 * Search Semantic Scholar for a query term
 * Returns top-3 most relevant papers
 */
async function searchSemanticScholar(query: string, limit = 3): Promise<CitationResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query.slice(0, 200));
    const url = `${SS_API_BASE}/paper/search?query=${encodedQuery}&limit=${limit}&fields=title,authors,year,venue,externalIds,openAccessPdf`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MOTHER-CitationEngine/1.0 (Intelltech; contact@intelltech.com)',
      },
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!response.ok) {
      log.warn(`[CitationEngine] Semantic Scholar API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as { data?: Array<{
      paperId: string;
      title?: string;
      authors?: Array<{ name: string }>;
      year?: number;
      venue?: string;
      externalIds?: { DOI?: string; ArXiv?: string };
    }> };
    
    if (!data.data || data.data.length === 0) return [];

    return data.data.map((paper, i) => {
      const authors = (paper.authors || []).map(a => a.name);
      const firstAuthorLastName = authors[0]?.split(' ').pop() || 'Unknown';
      const year = paper.year || new Date().getFullYear();
      const arxivId = paper.externalIds?.ArXiv;
      const doi = paper.externalIds?.DOI;
      
      return {
        title: paper.title || 'Unknown Title',
        authors,
        year,
        venue: paper.venue || (arxivId ? 'arXiv' : 'Unknown Venue'),
        url: arxivId ? `https://arxiv.org/abs/${arxivId}` : (doi ? `https://doi.org/${doi}` : `https://www.semanticscholar.org/paper/${paper.paperId}`),
        doi,
        arxivId,
        citationKey: `${firstAuthorLastName}${year}${String.fromCharCode(97 + i)}`, // e.g., "Smith2023a"
      };
    });
  } catch (err) {
    log.warn('[CitationEngine] Semantic Scholar search failed:', (err as Error).message);
    return [];
  }
}

/**
 * Search arXiv API as fallback
 */
async function searchArXiv(query: string, limit = 3): Promise<CitationResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query.slice(0, 200));
    const url = `${ARXIV_API_BASE}?search_query=all:${encodedQuery}&start=0&max_results=${limit}&sortBy=relevance`;
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/atom+xml' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const text = await response.text();
    
    // Parse Atom XML manually (avoid xml2js dependency)
    const entries: CitationResult[] = [];
    const entryMatches = text.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
    
    let i = 0;
    for (const match of entryMatches) {
      if (i >= limit) break;
      const entry = match[1];
      
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || 'Unknown Title';
      
      const authorMatches = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)];
      const authors = authorMatches.map(m => m[1].trim());
      
      const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
      const year = publishedMatch ? parseInt(publishedMatch[1].slice(0, 4)) : new Date().getFullYear();
      
      const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
      const arxivUrl = idMatch?.[1]?.trim() || '';
      const arxivId = arxivUrl.split('/').pop() || '';
      
      const firstAuthorLastName = authors[0]?.split(' ').pop() || 'Unknown';
      
      entries.push({
        title,
        authors,
        year,
        venue: 'arXiv',
        url: arxivUrl,
        arxivId,
        citationKey: `${firstAuthorLastName}${year}${String.fromCharCode(97 + i)}`,
      });
      i++;
    }
    
    return entries;
  } catch (err) {
    log.warn('[CitationEngine] arXiv search failed:', (err as Error).message);
    return [];
  }
}

/**
 * Format a citation in IEEE style
 */
function formatIEEECitation(citation: CitationResult, index: number): string {
  const authorsStr = citation.authors.length > 3
    ? `${citation.authors[0]} et al.`
    : citation.authors.join(', ');
  
  const venueStr = citation.arxivId
    ? `*arXiv:${citation.arxivId}*`
    : `*${citation.venue}*`;
  
  const urlStr = citation.doi
    ? `DOI: ${citation.doi}`
    : citation.url;
  
  return `[${index}] ${authorsStr}, "${citation.title}," ${venueStr}, ${citation.year}. ${urlStr}`;
}

/**
 * Extract key technical claims from response text for citation search
 */
function extractClaimsForCitation(response: string, query: string): string[] {
  const claims: string[] = [];
  
  // Extract the query topic itself
  const queryWords = query.split(/\s+/).filter(w => w.length > 4).slice(0, 5).join(' ');
  if (queryWords) claims.push(queryWords);
  
  // Extract sentences with numbers/statistics (likely factual claims)
  const sentences = response.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (/\d+[%\+\-]|\d{4}|arXiv|paper|study|research|found|showed|demonstrated/i.test(sentence)) {
      const cleaned = sentence.replace(/\[[\d,\s]+\]/g, '').trim().slice(0, 150);
      if (cleaned.length > 30 && !claims.includes(cleaned)) {
        claims.push(cleaned);
      }
    }
    if (claims.length >= 3) break;
  }
  
  return claims.slice(0, 3);
}

/**
 * Main citation engine function
 * Searches for citations and appends ## Referências section to response
 *
 * @param query - Original user query
 * @param response - MOTHER's response text
 * @param category - Query category (research, stem, complex_reasoning trigger more citations)
 */
export async function applyCitationEngine(
  query: string,
  response: string,
  category: string
): Promise<CitationEngineResult> {
  // Only apply for non-trivial responses
  const trivialCategories = ['casual_conversation', 'greeting'];
  if (trivialCategories.includes(category) || response.length < 200) {
    return { applied: false, citationsFound: 0, formattedReferences: '', responseWithCitations: response };
  }

  // Skip if response already has a ## Referências section
  if (/##\s*Referências|##\s*References|##\s*Bibliography/i.test(response)) {
    log.info('[CitationEngine] Response already has references section — skipping');
    return { applied: false, citationsFound: 0, formattedReferences: '', responseWithCitations: response };
  }

  try {
    const claims = extractClaimsForCitation(response, query);
    const allCitations: CitationResult[] = [];
    const seenTitles = new Set<string>();

    // Search for each claim in parallel
    const searchPromises = claims.map(async (claim) => {
      // Try Semantic Scholar first
      let results = await searchSemanticScholar(claim, 2);
      
      // Fallback to arXiv if no results
      if (results.length === 0) {
        results = await searchArXiv(claim, 2);
      }
      
      return results;
    });

    const searchResults = await Promise.allSettled(searchPromises);
    
    for (const result of searchResults) {
      if (result.status === 'fulfilled') {
        for (const citation of result.value) {
          if (!seenTitles.has(citation.title)) {
            seenTitles.add(citation.title);
            allCitations.push(citation);
          }
        }
      }
    }

    if (allCitations.length === 0) {
      log.info('[CitationEngine] No citations found for this response');
      return { applied: false, citationsFound: 0, formattedReferences: '', responseWithCitations: response };
    }

    // Limit to top 5 citations
    const topCitations = allCitations.slice(0, 5);
    
    // Format references section
    const referencesSection = '\n\n---\n## Referências\n\n' +
      topCitations.map((c, i) => formatIEEECitation(c, i + 1)).join('\n\n');
    
    const responseWithCitations = response + referencesSection;
    
    log.info(`[CitationEngine] Applied: ${topCitations.length} citations added (Semantic Scholar + arXiv)`);
    
    return {
      applied: true,
      citationsFound: topCitations.length,
      formattedReferences: referencesSection,
      responseWithCitations,
    };
  } catch (err) {
    log.warn('[CitationEngine] Failed (non-blocking):', (err as Error).message);
    return { applied: false, citationsFound: 0, formattedReferences: '', responseWithCitations: response };
  }
}

/**
 * Check if citation engine should be applied
 */
export function shouldApplyCitationEngine(response: string, category: string): boolean {
  const trivialCategories = ['casual_conversation', 'greeting', 'simple_factual'];
  if (trivialCategories.includes(category)) return false;
  if (response.length < 200) return false;
  if (/##\s*Referências|##\s*References/i.test(response)) return false;
  return true;
}
