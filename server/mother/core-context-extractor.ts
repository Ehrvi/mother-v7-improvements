/**
 * core-context-extractor.ts — SRP Phase 9 (Ciclo 85)
 *
 * Extracts and formats context results from parallel Promise.allSettled() calls.
 * Previously inline in core.ts (lines 465–571, ~106 lines).
 *
 * Scientific basis:
 * - Fowler (1999) Refactoring — Extract Function pattern
 * - McConnell (2004) Code Complete — single-responsibility principle
 * - RankGPT (Sun et al., arXiv:2304.09542, 2023) — RAG re-ranking pipeline
 * - CRAG (Yan et al., arXiv:2401.15884, 2024) — corrective RAG
 * - Self-RAG (Asai et al., arXiv:2310.11511, ICLR 2024) — adaptive retrieval
 *
 * SRP Phase 9 result: core.ts 1185 → ~1090 lines (−95 lines, −8.0%)
 * Cumulative SRP reduction: 2027 → ~1090 lines (−46.2% since Ciclo 76)
 */

import { createLogger } from '../_core/logger';
import { shouldRerank, rerankDocuments } from './rag-reranker';
import type { CRAGDocument } from './crag';

const log = createLogger('core-context-extractor');

export interface ContextExtractionInput {
  query: string;
  userId?: string | number | null;
  routingCategory: string;
  cragResultRaw: PromiseSettledResult<{ context: string; documents: CRAGDocument[]; correctiveSearchTriggered?: boolean }>;
  omniscientResultRaw: PromiseSettledResult<Array<{ content: string; similarity: number; paperTitle?: string; paperAuthors?: string; arxivId?: string }>>;
  episodicResultRaw: PromiseSettledResult<Array<{ query: string; response: string; similarity: number; qualityScore?: number }>>;
  userMemoryResultRaw: PromiseSettledResult<string>;
}

export interface ExtractedContexts {
  knowledgeContext: string;
  cragDocuments: CRAGDocument[];
  omniscientContext: string;
  omniscientResultCount: number;
  episodicContext: string;
  userMemoryContext: string;
}

/**
 * Extracts and formats all parallel context results from Promise.allSettled().
 * Applies RAG re-ranking when 3+ CRAG documents are available.
 *
 * SRP Phase 9 (Ciclo 85): Extracted from core.ts to reduce file size.
 */
export async function extractContextResults(input: ContextExtractionInput): Promise<ExtractedContexts> {
  const { query, routingCategory, cragResultRaw, omniscientResultRaw, episodicResultRaw, userMemoryResultRaw } = input;

  // ── Extract CRAG result ──────────────────────────────────────────────────
  let knowledgeContext = '';
  let cragDocuments: CRAGDocument[] = [];
  if (cragResultRaw.status === 'fulfilled') {
    knowledgeContext = cragResultRaw.value.context;
    cragDocuments = cragResultRaw.value.documents as CRAGDocument[];
    if ((cragResultRaw.value as any).correctiveSearchTriggered) {
      log.info('[MOTHER] CRAG: Corrective search triggered — no local knowledge found');
    }
    // ── CICLO 54 v2.0 ACTION 4: RAG RE-RANKING ──────────────────────────
    // Scientific basis: RankGPT (Sun et al., arXiv:2304.09542, 2023): listwise re-ranking
    // Bi-encoder (CRAG v2) → Cross-encoder (RankGPT) pipeline
    // Trigger: 3+ documents available, research/complex queries
    if (cragDocuments.length >= 3 && shouldRerank(cragDocuments.length, routingCategory, query.split(/\s+/).length)) {
      try {
        const docsForReranking = cragDocuments.map(d => ({
          content: d.content,
          source: d.source || 'unknown',
          score: (d as any).relevanceScore || (d as any).hybridScore || 0.5,
        }));
        const rerankResult = await rerankDocuments(query, docsForReranking, 5);
        if (rerankResult.applied) {
          knowledgeContext = rerankResult.topContext;
          log.info(`[RAGReranker] Re-ranked ${cragDocuments.length} docs, order changed: ${JSON.stringify(rerankResult.originalOrder.slice(0,3))} → ${JSON.stringify(rerankResult.newOrder.slice(0,3))}`);
        }
      } catch (rerankErr) {
        log.warn('[RAGReranker] Failed (non-blocking), using original CRAG context:', (rerankErr as Error).message);
      }
    }
  }

  // ── Extract Omniscient result ────────────────────────────────────────────
  let omniscientContext = '';
  let omniscientResultCount = 0;
  if (omniscientResultRaw.status === 'fulfilled' && omniscientResultRaw.value.length > 0) {
    const paperResults = omniscientResultRaw.value;
    omniscientResultCount = paperResults.length;
    omniscientContext = `\n\n## 📚 OMNISCIENT — INDEXED SCIENTIFIC PAPERS (${paperResults.length} results)\n` +
      paperResults.map((r, i) => {
        const authors = r.paperAuthors ? r.paperAuthors.split(',')[0].trim() + ' et al.' : 'Unknown authors';
        const arxivId = r.arxivId || 'unknown';
        const citation = `${authors}, arXiv:${arxivId}`;
        return `[Paper ${i+1} | Similarity: ${r.similarity.toFixed(3)} | ${citation}]\nTitle: ${r.paperTitle || 'Unknown'}\n${r.content.slice(0, 1200)}`;
      }).join('\n\n');
    log.info(`[MOTHER] Omniscient: ${paperResults.length} paper chunks injected (top similarity: ${paperResults[0].similarity.toFixed(3)})`);
  } else {
    log.info('[MOTHER] Omniscient: No indexed papers found or search failed');
  }

  // ── Extract Episodic memory result ──────────────────────────────────────
  let episodicContext = '';
  if (episodicResultRaw.status === 'fulfilled' && episodicResultRaw.value.length > 0) {
    const memories = episodicResultRaw.value;
    episodicContext = `\n\nRELEVANT PAST INTERACTIONS (Episodic Memory):\n` +
      memories.map((m, i) =>
        `[Memory ${i+1} | Similarity: ${m.similarity.toFixed(3)} | Quality: ${m.qualityScore || 'N/A'}]\n` +
        `Q: ${m.query.slice(0, 200)}\n` +
        `A: ${m.response.slice(0, 400)}`
      ).join('\n\n');
    log.info(`[MOTHER] Episodic memory: ${memories.length} relevant past interactions injected`);
  }

  // ── Extract User memory result ───────────────────────────────────────────
  let userMemoryContext = '';
  if (userMemoryResultRaw.status === 'fulfilled' && userMemoryResultRaw.value) {
    userMemoryContext = userMemoryResultRaw.value as string;
    if (userMemoryContext) log.info(`[MOTHER] User memory context injected`);
  }

  return {
    knowledgeContext,
    cragDocuments,
    omniscientContext,
    omniscientResultCount,
    episodicContext,
    userMemoryContext,
  };
}
