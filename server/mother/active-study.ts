/**
 * MOTHER v75.6 — Active Academic Study
 *
 * Implements proactive, autonomous academic knowledge acquisition from
 * Semantic Scholar and arXiv. Solves the "passive auto-study" problem
 * where MOTHER only studies when explicitly triggered.
 *
 * Scientific basis:
 * - Proactive Agents (arXiv:2410.12361, 2024):
 *   "Shifting LLM Agents from Reactive Responses to Active Assistance —
 *   proactive agents capable of anticipating and initiating tasks without
 *   explicit human instructions"
 *
 * - NeurIPS 2024 Uncertainty (Kapoor et al., arXiv:2406.08391):
 *   "Fine-tuning on correct/incorrect examples creates uncertainty estimates
 *   with good generalization." Objective uncertainty triggers are more reliable
 *   than subjective LLM self-assessment.
 *
 * - Agentic RAG (Singh et al., arXiv:2501.09136, 2025):
 *   "Agentic RAG transcends limitations by embedding autonomous agents that
 *   dynamically manage retrieval strategies."
 *
 * - Semantic Scholar API (Allen Institute for AI):
 *   Free academic paper search with citation counts, abstracts, and PDF links.
 *   Covers NeurIPS, ICML, ACL, EMNLP, ICLR, CVPR — venues not indexed by arXiv alone.
 *   Endpoint: https://api.semanticscholar.org/graph/v1/paper/search
 *
 * Architecture:
 * 1. searchSemanticScholar(): Search Semantic Scholar for high-quality papers
 * 2. shouldTriggerActiveStudy(): Determine if proactive study is needed
 * 3. triggerActiveStudy(): Execute background academic study
 * 4. enrichResearchWithSemanticScholar(): Augment existing research pipeline
 */

import { addKnowledge } from './knowledge';
import { ingestPapersFromSearch } from './paper-ingest';

// ==================== TYPES ====================

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract: string;
  year: number;
  citationCount: number;
  isOpenAccess: boolean;
  openAccessPdf?: { url: string };
  authors: Array<{ name: string }>;
  fieldsOfStudy: string[];
  externalIds?: { ArXiv?: string };
}

export interface ActiveStudyResult {
  triggered: boolean;
  papersFound: number;
  papersIngested: number;
  knowledgeAdded: number;
  sources: string[];
  reason: string;
}

export interface ActiveStudyConfig {
  minCitationCount: number;    // Minimum citations for quality filter
  minYear: number;             // Minimum publication year
  maxPapers: number;           // Maximum papers to ingest per study session
  requireOpenAccess: boolean;  // Only ingest open-access papers
}

// ==================== CONFIGURATION ====================

/**
 * Active study configuration based on quality criteria.
 * Conservative defaults to ensure high-quality knowledge ingestion.
 */
const DEFAULT_STUDY_CONFIG: ActiveStudyConfig = {
  minCitationCount: 5,      // Minimum 5 citations — filters out very new/unknown papers
  minYear: 2020,            // Recent papers only (last 5 years)
  maxPapers: 3,             // Max 3 papers per session to avoid overloading
  requireOpenAccess: false, // Accept non-open-access (we use abstract only if no PDF)
};

// ==================== SEMANTIC SCHOLAR API ====================

/**
 * Search Semantic Scholar for high-quality academic papers.
 *
 * Scientific basis: Semantic Scholar covers 200M+ papers across all fields.
 * Quality filter: citationCount > 5 ensures established, peer-reviewed work.
 *
 * API: https://api.semanticscholar.org/graph/v1/paper/search
 * No API key required for basic usage (rate limit: 100 req/5min).
 */
export async function searchSemanticScholar(
  query: string,
  maxResults: number = 5,
  config: ActiveStudyConfig = DEFAULT_STUDY_CONFIG
): Promise<SemanticScholarPaper[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const fields = 'title,abstract,year,citationCount,isOpenAccess,openAccessPdf,authors,fieldsOfStudy,externalIds';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&fields=${fields}&limit=${maxResults}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MOTHER-Scientific-Agent/75.6',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[ActiveStudy] Semantic Scholar API returned ${response.status}`);
      return [];
    }

    const data = await response.json() as { data?: SemanticScholarPaper[] };
    const papers = data.data || [];

    // Quality filter: citation count and year
    const filtered = papers.filter(p =>
      p.citationCount >= config.minCitationCount &&
      p.year >= config.minYear &&
      p.abstract && p.abstract.length > 100
    );

    console.log(`[ActiveStudy] Semantic Scholar: ${papers.length} results, ${filtered.length} after quality filter`);
    return filtered;
  } catch (error) {
    console.error('[ActiveStudy] Semantic Scholar search failed:', error);
    return [];
  }
}

/**
 * Determine if active academic study should be triggered.
 *
 * Triggers when:
 * 1. Query is STEM/research category with insufficient context
 * 2. CRAG returned 0 documents (no bd_central data on topic)
 * 3. Query contains academic keywords (paper, study, research, etc.)
 *
 * Scientific basis: Proactive Agents (arXiv:2410.12361) — agents should
 * anticipate knowledge needs and act without explicit instructions.
 */
export function shouldTriggerActiveStudy(
  query: string,
  cragDocumentCount: number,
  category: string,
  omniscientResultCount: number
): { should: boolean; reason: string; priority: 'high' | 'medium' | 'low' } {
  // High priority: STEM/research with zero documents
  if (
    ['complex_reasoning', 'research', 'stem'].includes(category) &&
    cragDocumentCount === 0 &&
    omniscientResultCount === 0
  ) {
    return {
      should: true,
      reason: `Zero knowledge found for ${category} query — active study required`,
      priority: 'high',
    };
  }

  // Medium priority: any category with zero CRAG documents
  if (cragDocumentCount === 0) {
    return {
      should: true,
      reason: 'No bd_central documents found — proactive study will enrich knowledge base',
      priority: 'medium',
    };
  }

  // Medium priority: academic keywords in query
  const academicKeywords = /\b(paper|study|research|artigo|estudo|pesquisa|literature|survey|review|state.of.the.art|estado da arte|benchmark|dataset|model|algorithm|neural|transformer|attention|embedding|fine.tun|pre.train)\b/i;
  if (academicKeywords.test(query) && cragDocumentCount < 2) {
    return {
      should: true,
      reason: 'Academic query with insufficient context — Semantic Scholar study triggered',
      priority: 'medium',
    };
  }

  return {
    should: false,
    reason: 'Sufficient context available — active study not needed',
    priority: 'low',
  };
}

/**
 * Execute active academic study for a given query.
 * Searches Semantic Scholar + arXiv and ingests high-quality papers.
 *
 * Runs asynchronously (fire-and-forget for non-blocking generation).
 * Results are available for future queries via bd_central.
 *
 * Scientific basis:
 * - Continual Learning (Parisi et al., Neural Networks 2019): Catastrophic forgetting prevention
 * - Online Learning (Cesa-Bianchi & Lugosi, 2006): Learning from sequential data streams
 */
export async function triggerActiveStudy(
  query: string,
  priority: 'high' | 'medium' | 'low' = 'medium',
  config: ActiveStudyConfig = DEFAULT_STUDY_CONFIG
): Promise<ActiveStudyResult> {
  console.log(`[ActiveStudy] Triggered for query: "${query.slice(0, 80)}..." (priority: ${priority})`);

  let papersIngested = 0;
  let knowledgeAdded = 0;
  const sources: string[] = [];

  try {
    // Step 1: Search Semantic Scholar
    const maxPapers = priority === 'high' ? config.maxPapers : Math.ceil(config.maxPapers / 2);
    const s2Papers = await searchSemanticScholar(query, maxPapers * 2, config);

    if (s2Papers.length > 0) {
      // Collect arXiv URLs from Semantic Scholar results
      const arxivUrls: string[] = [];
      for (const paper of s2Papers.slice(0, maxPapers)) {
        const arxivId = paper.externalIds?.ArXiv;
        if (arxivId) {
          arxivUrls.push(`https://arxiv.org/abs/${arxivId}`);
        }
      }

      // Ingest arXiv papers found via Semantic Scholar
      if (arxivUrls.length > 0) {
        try {
          const ingestResults = await ingestPapersFromSearch(arxivUrls);
          const ingested = ingestResults.filter(r => !r.skipped && !r.error);
          papersIngested += ingested.length;
          sources.push(...arxivUrls.slice(0, ingested.length));
          console.log(`[ActiveStudy] Ingested ${ingested.length} papers from Semantic Scholar → arXiv`);
        } catch (ingestErr) {
          console.error('[ActiveStudy] Paper ingestion failed:', ingestErr);
        }
      }

      // Store Semantic Scholar abstracts as knowledge entries (for papers without arXiv)
      for (const paper of s2Papers.slice(0, maxPapers)) {
        if (!paper.externalIds?.ArXiv && paper.abstract) {
          try {
            const authors = paper.authors.slice(0, 3).map(a => a.name).join(', ');
            const citation = `${authors} (${paper.year}). ${paper.title}. Semantic Scholar: ${paper.paperId}`;
            const content = `## ${paper.title}\n\n**Authors:** ${authors}\n**Year:** ${paper.year}\n**Citations:** ${paper.citationCount}\n**Fields:** ${paper.fieldsOfStudy.join(', ')}\n\n**Abstract:**\n${paper.abstract}\n\n**Citation:** ${citation}`;

            await addKnowledge(
              `[S2] ${paper.title}`,
              content,
              'research',
              'active_study_semantic_scholar'
            );
            knowledgeAdded++;
            sources.push(`https://www.semanticscholar.org/paper/${paper.paperId}`);
          } catch (addErr) {
            console.error('[ActiveStudy] Failed to add Semantic Scholar knowledge:', addErr);
          }
        }
      }
    }

    return {
      triggered: true,
      papersFound: s2Papers.length,
      papersIngested,
      knowledgeAdded,
      sources,
      reason: `Active study complete: ${s2Papers.length} papers found, ${papersIngested} ingested, ${knowledgeAdded} abstracts stored`,
    };
  } catch (error) {
    console.error('[ActiveStudy] Active study failed:', error);
    return {
      triggered: true,
      papersFound: 0,
      papersIngested: 0,
      knowledgeAdded: 0,
      sources: [],
      reason: `Active study failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Augment the existing research pipeline with Semantic Scholar results.
 * Called from research.ts to add S2 results alongside arXiv results.
 *
 * Returns formatted context string for injection into system prompt.
 */
export async function enrichResearchWithSemanticScholar(
  query: string,
  maxResults: number = 3
): Promise<string> {
  try {
    const papers = await searchSemanticScholar(query, maxResults);
    if (papers.length === 0) return '';

    const context = papers
      .slice(0, maxResults)
      .map((p, i) => {
        const authors = p.authors.slice(0, 2).map(a => a.name).join(', ');
        const arxivId = p.externalIds?.ArXiv ? ` | arXiv:${p.externalIds.ArXiv}` : '';
        return `[S2 Paper ${i + 1} | ${p.year} | ${p.citationCount} citations${arxivId}]\n**${p.title}**\nAuthors: ${authors}\n${p.abstract?.slice(0, 500) || 'No abstract available'}`;
      })
      .join('\n\n');

    return `\n\n## 📖 SEMANTIC SCHOLAR — HIGH-QUALITY ACADEMIC PAPERS\n${context}`;
  } catch (error) {
    console.error('[ActiveStudy] Semantic Scholar enrichment failed:', error);
    return '';
  }
}
