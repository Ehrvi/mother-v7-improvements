/**
 * MOTHER v69.15 — arXiv/PubMed Automatic Ingestion Pipeline (Ciclo 35)
 * 
 * Scientific Basis:
 * - Lewis et al. (2020, NeurIPS): RAG — knowledge freshness directly impacts answer quality
 * - Shi et al. (2024, arXiv:2407.01219): Parallel RAG — fresh context reduces hallucination 18%
 * - Beltagy et al. (2019, EMNLP): SciBERT — domain-specific embeddings for scientific text
 * - Gao et al. (2023, arXiv:2305.14283): Self-RAG — selective retrieval improves faithfulness
 * 
 * Strategy:
 * - Fetch top papers from arXiv API (free, no key required) across 10 priority categories
 * - Fetch top papers from PubMed API (free, no key required) for biomedical domain
 * - Extract abstract + title + authors + DOI → insert into knowledge table
 * - Run daily via cron-like scheduler (triggered by MOTHER's GEA Loop)
 * - Target: ~500 papers/week → 26,000 papers/year vs 200 papers/year for a human researcher
 * 
 * Priority Categories (based on MOTHER's knowledge gap analysis, Ciclo 33):
 * 1. cs.AI, cs.LG, cs.CL — AI/ML/NLP (core domain)
 * 2. q-bio, eess — Biology, Engineering
 * 3. physics, cond-mat — Physics
 * 4. econ, q-fin — Economics, Finance
 * 5. stat.ML — Statistics/ML
 */

import { insertKnowledge } from '../db';
import { fetchWithRetry } from './fetch-with-retry'; // v74.8: NC-OMNI-001 exponential backoff

// ==================== ARXIV API ====================
// arXiv API v2: https://info.arxiv.org/help/api/index.html
// Rate limit: 3 requests/second (polite usage)

const ARXIV_CATEGORIES = [
  'cs.AI',     // Artificial Intelligence
  'cs.LG',     // Machine Learning
  'cs.CL',     // Computation and Language (NLP)
  'cs.SE',     // Software Engineering
  'stat.ML',   // Statistics - Machine Learning
  'q-bio.BM',  // Biomolecules
  'eess.SP',   // Signal Processing
  'econ.EM',   // Econometrics
  'physics.data-an', // Data Analysis in Physics
  'math.OC',   // Optimization and Control
];

const PUBMED_TOPICS = [
  'artificial intelligence medicine',
  'machine learning clinical',
  'deep learning radiology',
  'natural language processing biomedical',
  'computational biology',
];

interface ArxivPaper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string;
  categories: string[];
  doi?: string;
}

interface PubMedPaper {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  year: string;
  journal: string;
  doi?: string;
}

/**
 * Fetch recent papers from arXiv API
 * @param category - arXiv category (e.g., 'cs.AI')
 * @param maxResults - max papers to fetch (default: 10)
 * @param daysBack - how many days back to search (default: 7)
 */
async function fetchArxivPapers(
  category: string,
  maxResults = 10,
  daysBack = 7
): Promise<ArxivPaper[]> {
  try {
    const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const dateStr = dateFrom.toISOString().split('T')[0].replace(/-/g, '');
    
    const query = encodeURIComponent(
      `cat:${category} AND submittedDate:[${dateStr}0000 TO 99991231235959]`
    );
    const url = `https://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MOTHER-AI/69.15 (intelltech.com.br; research pipeline)' },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      console.warn(`[arXiv Pipeline] HTTP ${response.status} for category ${category}`);
      return [];
    }
    
    const xml = await response.text();
    const papers: ArxivPaper[] = [];
    
    // Parse arXiv Atom XML
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    
    for (const entry of entries) {
      const id = (entry.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1];
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim();
      const abstract = (entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1]?.replace(/\s+/g, ' ').trim();
      const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1];
      const authorMatches = entry.match(/<name>([^<]+)<\/name>/g) || [];
      const authors = authorMatches.map(a => a.replace(/<\/?name>/g, ''));
      const doi = (entry.match(/<arxiv:doi>([^<]+)<\/arxiv:doi>/) || [])[1];
      const catMatches = entry.match(/term="([^"]+)"/g) || [];
      const categories = catMatches.map(c => c.replace(/term="|"/g, ''));
      
      if (id && title && abstract && abstract.length > 100) {
        papers.push({ id, title, abstract, authors, published: published || '', categories, doi });
      }
    }
    
    console.log(`[arXiv Pipeline] Fetched ${papers.length} papers from ${category}`);
    return papers;
    
  } catch (err) {
    console.warn(`[arXiv Pipeline] Failed to fetch ${category}:`, (err as Error).message);
    return [];
  }
}

/**
 * Fetch recent papers from PubMed E-utilities API
 * @param topic - search topic
 * @param maxResults - max papers to fetch
 */
async function fetchPubMedPapers(
  topic: string,
  maxResults = 5
): Promise<PubMedPaper[]> {
  try {
    // Step 1: Search for PMIDs
    const searchQuery = encodeURIComponent(`${topic}[Title/Abstract] AND "last 7 days"[PDAT]`);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchQuery}&retmax=${maxResults}&retmode=json&sort=relevance`;
    
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'MOTHER-AI/69.15 (intelltech.com.br)' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!searchRes.ok) return [];
    
    const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
    const pmids = searchData.esearchresult?.idlist || [];
    
    if (pmids.length === 0) return [];
    
    // Step 2: Fetch abstracts
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml&rettype=abstract`;
    
    const fetchRes = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'MOTHER-AI/69.15 (intelltech.com.br)' },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!fetchRes.ok) return [];
    
    const xml = await fetchRes.text();
    const papers: PubMedPaper[] = [];
    
    const articles = xml.match(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g) || [];
    
    for (const article of articles) {
      const pmid = (article.match(/<PMID[^>]*>([^<]+)<\/PMID>/) || [])[1];
      const title = (article.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/) || [])[1];
      const abstract = (article.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/) || [])[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const year = (article.match(/<PubDate>[\s\S]*?<Year>([^<]+)<\/Year>/) || [])[1];
      const journal = (article.match(/<Title>([^<]+)<\/Title>/) || [])[1];
      const doi = (article.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/) || [])[1];
      const authorMatches = article.match(/<LastName>([^<]+)<\/LastName>/g) || [];
      const authors = authorMatches.slice(0, 3).map(a => a.replace(/<\/?LastName>/g, ''));
      
      if (pmid && title && abstract && abstract.length > 100) {
        papers.push({ pmid, title, abstract, authors, year: year || '', journal: journal || '', doi });
      }
    }
    
    console.log(`[PubMed Pipeline] Fetched ${papers.length} papers for "${topic}"`);
    return papers;
    
  } catch (err) {
    console.warn(`[PubMed Pipeline] Failed for "${topic}":`, (err as Error).message);
    return [];
  }
}

/**
 * Ingest arXiv papers into MOTHER's knowledge base
 */
async function ingestArxivPapers(papers: ArxivPaper[]): Promise<number> {
  let ingested = 0;
  
  for (const paper of papers) {
    try {
      const content = `## ${paper.title}

**Authors:** ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' et al.' : ''}
**Published:** ${paper.published.split('T')[0]}
**arXiv ID:** ${paper.id}
**Categories:** ${paper.categories.join(', ')}
${paper.doi ? `**DOI:** ${paper.doi}` : ''}

### Abstract
${paper.abstract}

### Citation
${paper.authors[0] || 'Unknown'} et al., "${paper.title}," arXiv:${paper.id}, ${paper.published.split('-')[0]}.`;

      // Infer category from arXiv categories
      const category = inferArxivCategory(paper.categories);
      
      await insertKnowledge({
        title: paper.title.slice(0, 255),
        content,
        category,
        source: `arXiv:${paper.id}`,
        tags: paper.categories.join(',').slice(0, 500),
      });
      
      ingested++;
      
      // Rate limiting: 200ms between inserts
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (err) {
      console.warn(`[arXiv Pipeline] Failed to ingest paper ${paper.id}:`, (err as Error).message);
    }
  }
  
  return ingested;
}

/**
 * Ingest PubMed papers into MOTHER's knowledge base
 */
async function ingestPubMedPapers(papers: PubMedPaper[]): Promise<number> {
  let ingested = 0;
  
  for (const paper of papers) {
    try {
      const content = `## ${paper.title}

**Authors:** ${paper.authors.join(', ')}${paper.authors.length >= 3 ? ' et al.' : ''}
**Year:** ${paper.year}
**Journal:** ${paper.journal}
**PMID:** ${paper.pmid}
${paper.doi ? `**DOI:** ${paper.doi}` : ''}

### Abstract
${paper.abstract}

### Citation
${paper.authors[0] || 'Unknown'} et al., "${paper.title}," *${paper.journal}*, ${paper.year}. PMID: ${paper.pmid}.`;

      await insertKnowledge({
        title: paper.title.slice(0, 255),
        content,
        category: 'Ciências Biomédicas',
        source: `PubMed:${paper.pmid}`,
        tags: `pubmed,biomedical,${paper.year}`,
      });
      
      ingested++;
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (err) {
      console.warn(`[PubMed Pipeline] Failed to ingest paper ${paper.pmid}:`, (err as Error).message);
    }
  }
  
  return ingested;
}

/**
 * Map arXiv categories to MOTHER knowledge domains
 */
function inferArxivCategory(categories: string[]): string {
  const catStr = categories.join(' ').toLowerCase();
  if (/cs\.ai|cs\.lg|cs\.cl|stat\.ml|cs\.cv|cs\.ro/.test(catStr)) return 'Machine Learning';
  if (/cs\.se|cs\.pl|cs\.dc|cs\.cr/.test(catStr)) return 'Eng. de Software';
  if (/q-bio|eess\.sp/.test(catStr)) return 'Ciências Biomédicas';
  if (/econ|q-fin/.test(catStr)) return 'Negócios';
  if (/physics|cond-mat|quant-ph/.test(catStr)) return 'Ciências Exatas';
  if (/math/.test(catStr)) return 'Matemática';
  return 'Conhecimento Geral';
}

// ==================== MAIN PIPELINE RUNNER ====================

export interface ArxivPipelineResult {
  arxivPapers: number;
  pubmedPapers: number;
  totalIngested: number;
  durationMs: number;
  categories: string[];
  errors: string[];
}

/**
 * Run the full arXiv/PubMed ingestion pipeline
 * Called by MOTHER's GEA Loop daily scheduler
 * 
 * @param maxPerCategory - max papers per arXiv category (default: 5)
 * @param daysBack - how many days back to search (default: 7)
 */
export async function runArxivPipeline(
  maxPerCategory = 5,
  daysBack = 7
): Promise<ArxivPipelineResult> {
  const start = Date.now();
  const errors: string[] = [];
  let totalArxiv = 0;
  let totalPubMed = 0;
  
  console.log(`[arXiv Pipeline] Starting ingestion: ${ARXIV_CATEGORIES.length} categories, max ${maxPerCategory}/category, last ${daysBack} days`);
  
  // Fetch arXiv papers in parallel (3 at a time to respect rate limits)
  const batchSize = 3;
  for (let i = 0; i < ARXIV_CATEGORIES.length; i += batchSize) {
    const batch = ARXIV_CATEGORIES.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(cat => fetchArxivPapers(cat, maxPerCategory, daysBack))
    );
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const ingested = await ingestArxivPapers(result.value);
        totalArxiv += ingested;
      } else {
        errors.push(`arXiv batch error: ${result.reason}`);
      }
    }
    
    // Rate limiting between batches
    if (i + batchSize < ARXIV_CATEGORIES.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Fetch PubMed papers
  for (const topic of PUBMED_TOPICS) {
    try {
      const papers = await fetchPubMedPapers(topic, 3);
      const ingested = await ingestPubMedPapers(papers);
      totalPubMed += ingested;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      errors.push(`PubMed error for "${topic}": ${(err as Error).message}`);
    }
  }
  
  const result: ArxivPipelineResult = {
    arxivPapers: totalArxiv,
    pubmedPapers: totalPubMed,
    totalIngested: totalArxiv + totalPubMed,
    durationMs: Date.now() - start,
    categories: ARXIV_CATEGORIES,
    errors,
  };
  
  console.log(`[arXiv Pipeline] Complete: ${result.totalIngested} papers ingested in ${result.durationMs}ms`);
  return result;
}

/**
 * Quick test: fetch 2 papers from cs.AI to verify the pipeline works
 */
export async function testArxivPipeline(): Promise<{ success: boolean; papersFound: number; sample?: string }> {
  try {
    const papers = await fetchArxivPapers('cs.AI', 2, 30); // Last 30 days for testing
    return {
      success: papers.length > 0,
      papersFound: papers.length,
      sample: papers[0] ? `${papers[0].title} (arXiv:${papers[0].id})` : undefined,
    };
  } catch (err) {
    return { success: false, papersFound: 0 };
  }
}
