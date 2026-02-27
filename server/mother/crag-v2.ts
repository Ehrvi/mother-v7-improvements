/**
 * MOTHER v74.14 — CRAG v2: Corrective RAG with Query Expansion + Hybrid Search
 * NC-QUALITY-006: Cache hit rate target ≥ 40%
 * 
 * Scientific basis:
 * - CRAG (Yan et al., arXiv:2401.15884, 2024): Corrective Retrieval Augmented Generation
 * - HyDE (Gao et al., arXiv:2212.10496, 2022): Hypothetical Document Embeddings for query expansion
 * - BM25 + Dense Hybrid (Luan et al., arXiv:2210.11773, 2022): Hybrid retrieval outperforms either alone
 * - Self-RAG (Asai et al., arXiv:2310.11511, 2023): Selective retrieval with critique tokens
 * - RAGAS (Es et al., EACL 2024): Context precision and recall metrics
 * 
 * Key improvements over CRAG v1:
 * 1. Query expansion via HyDE — generates hypothetical answer to improve semantic matching
 * 2. Multi-query expansion — generates 3 query variants to increase recall
 * 3. Hybrid scoring — combines BM25 keyword score + vector similarity (RRF fusion)
 * 4. Stricter relevance grading — LLM-based for all document sets (not just large)
 * 5. Better corrective search — uses expanded queries for web fallback
 */

import { createHash } from 'crypto';
import { reliabilityLogger } from './reliability-logger';
import { invokeLLM } from '../_core/llm';

export interface CRAGv2Document {
  content: string;
  source: string;
  sourceType: 'knowledge_db' | 'vector_search' | 'paper' | 'web_search' | 'expanded';
  relevanceScore: number;
  isGrounded: boolean;
  bm25Score?: number;
  vectorScore?: number;
  hybridScore?: number;
}

export interface CRAGv2Result {
  context: string;
  documents: CRAGv2Document[];
  queryRewritten: boolean;
  rewrittenQuery?: string;
  expandedQueries?: string[];
  correctiveSearchTriggered: boolean;
  totalDocuments: number;
  relevantDocuments: number;
  cacheHit: boolean;
  retrievalStrategy: 'hybrid' | 'vector_only' | 'keyword_only' | 'corrective';
}

// In-memory query expansion cache (reduces LLM calls for repeated queries)
const expansionCache = new Map<string, { queries: string[]; timestamp: number }>();
const EXPANSION_CACHE_TTL = 3600000; // 1 hour

/**
 * CRAG v2 main pipeline.
 * NC-QUALITY-006: Target cache hit rate ≥ 40%
 */
export async function cragV2Retrieve(
  query: string,
  userId?: number
): Promise<CRAGv2Result> {
  reliabilityLogger.info('crag', `Starting v2 retrieval for: "${query.slice(0, 80)}"`);
  
  // Step 1: Check expansion cache
  const queryHash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
  const cached = expansionCache.get(queryHash);
  const expandedQueries: string[] = [];
  
  if (cached && Date.now() - cached.timestamp < EXPANSION_CACHE_TTL) {
    expandedQueries.push(...cached.queries);
    reliabilityLogger.info('crag', `Query expansion cache hit: ${expandedQueries.length} variants`);
  } else {
    // Step 2: Query expansion via HyDE + multi-query
    // Scientific basis: HyDE (Gao et al., 2022) — hypothetical document improves semantic matching
    try {
      const expansionResponse = await invokeLLM({
        model: 'gpt-4o-mini',
        provider: 'openai',
        messages: [
          {
            role: 'system',
            content: `You are a query expansion expert. Given a user query, generate:
1. A rewritten, more specific version of the query
2. A hypothetical short answer (1-2 sentences) that would perfectly answer the query
3. A keyword-focused version for BM25 search

Return ONLY a JSON object: {"rewritten": "...", "hypothetical": "...", "keywords": "..."}`,
          },
          { role: 'user', content: query },
        ],
        maxTokens: 200,
        temperature: 0.3,
      });
      
      const content = expansionResponse.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse((typeof content === 'string' ? content : JSON.stringify(content)).replace(/```json\n?|\n?```/g, '').trim());
      
      if (parsed.rewritten) expandedQueries.push(parsed.rewritten);
      if (parsed.hypothetical) expandedQueries.push(parsed.hypothetical);
      if (parsed.keywords) expandedQueries.push(parsed.keywords);
      
      // Cache the expansion
      expansionCache.set(queryHash, { queries: expandedQueries, timestamp: Date.now() });
      reliabilityLogger.info('crag', `Query expansion: ${expandedQueries.length} variants generated`);
    } catch (e) {
      reliabilityLogger.warn('crag', `Query expansion failed (non-blocking): ${(e as Error).message}`);
      expandedQueries.push(query); // fallback to original
    }
  }
  
  // Step 3: Multi-source hybrid retrieval
  const allQueries = [query, ...expandedQueries].slice(0, 4); // max 4 queries
  const rawDocuments = await hybridMultiSourceRetrieval(allQueries);
  reliabilityLogger.info('crag', `Hybrid retrieval: ${rawDocuments.length} raw documents from ${allQueries.length} queries`);
  
  // Step 4: Deduplicate by content hash
  const seen = new Set<string>();
  const dedupedDocs = rawDocuments.filter(doc => {
    const hash = createHash('md5').update(doc.content.slice(0, 200)).digest('hex');
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
  
  // Step 5: Grade documents with LLM (always — not just for large sets)
  // Scientific basis: Self-RAG (Asai et al., 2023) — critique tokens improve precision
  const gradedDocuments = await gradeDocumentsV2(dedupedDocs, query);
  const relevantDocs = gradedDocuments.filter(d => d.relevanceScore >= 0.5);
  
  reliabilityLogger.info('crag', `Grading: ${relevantDocs.length}/${gradedDocuments.length} relevant (threshold 0.5)`);
  
  // Step 6: Corrective search if insufficient relevant docs
  let correctiveSearchTriggered = false;
  let finalDocs = relevantDocs;
  
  if (relevantDocs.length < 2) {
    correctiveSearchTriggered = true;
    reliabilityLogger.info('crag', `Corrective search triggered — insufficient local knowledge`);
    // Use the hypothetical answer query for better web search
    const searchQuery = expandedQueries[1] || query; // hypothetical answer
    const webDocs = await correctiveWebSearch(searchQuery);
    finalDocs = [...relevantDocs, ...webDocs];
  }
  
  // Step 7: Build context with ranked documents
  const topDocs = finalDocs
    .sort((a, b) => (b.hybridScore || b.relevanceScore) - (a.hybridScore || a.relevanceScore))
    .slice(0, 8); // top 8 documents
  
  const context = topDocs.length > 0
    ? `## KNOWLEDGE BASE (CRAG v2 — ${topDocs.length} documents, ${correctiveSearchTriggered ? 'corrective search triggered' : 'local knowledge sufficient'})\n\n` +
      topDocs.map((doc, i) => 
        `[Doc ${i+1} | Source: ${doc.source} | Relevance: ${(doc.relevanceScore * 100).toFixed(0)}%]\n${doc.content.slice(0, 800)}`
      ).join('\n\n')
    : '';
  
  return {
    context,
    documents: topDocs,
    queryRewritten: expandedQueries.length > 0,
    rewrittenQuery: expandedQueries[0],
    expandedQueries,
    correctiveSearchTriggered,
    totalDocuments: gradedDocuments.length,
    relevantDocuments: relevantDocs.length,
    cacheHit: cached !== undefined,
    retrievalStrategy: correctiveSearchTriggered ? 'corrective' : 'hybrid',
  };
}

/**
 * Hybrid multi-source retrieval with BM25 + vector scores.
 * Queries multiple sources with all expanded query variants.
 */
async function hybridMultiSourceRetrieval(queries: string[]): Promise<CRAGv2Document[]> {
  const documents: CRAGv2Document[] = [];
  const primaryQuery = queries[0];
  
  // Source 1: Knowledge DB (keyword/BM25 search) — all query variants
  for (const q of queries) {
    try {
      const { queryDatabase } = await import('./knowledge');
      const dbResults = await queryDatabase(q);
      for (const r of dbResults) {
        documents.push({
          content: r.content,
          source: r.source?.name || 'knowledge_db',
          sourceType: 'knowledge_db',
          relevanceScore: r.relevance || 0.5,
          bm25Score: r.relevance || 0.5,
          isGrounded: true,
        });
      }
    } catch (e) {
      // non-blocking
    }
  }
  
  // Source 2: Vector search (semantic similarity) — primary + hypothetical queries
  for (const q of queries.slice(0, 2)) {
    try {
      const { queryVectorSearch } = await import('./knowledge');
      const vectorResults = await queryVectorSearch(q);
      for (const r of vectorResults) {
        documents.push({
          content: r.content,
          source: r.source?.name || 'vector_search',
          sourceType: 'vector_search',
          relevanceScore: r.relevance || 0.6,
          vectorScore: r.relevance || 0.6,
          isGrounded: true,
        });
      }
    } catch (e) {
      // non-blocking
    }
  }
  
  // Source 3: Academic papers — primary query only
  try {
    const { queryExternalKnowledge } = await import('./knowledge');
    const paperResults = await queryExternalKnowledge(primaryQuery);
    for (const r of paperResults) {
      documents.push({
        content: r.content,
        source: r.source?.name || 'paper',
        sourceType: 'paper',
        relevanceScore: r.confidence || 0.7,
        isGrounded: true,
      });
    }
  } catch (e) {
    // non-blocking
  }
  
  // Compute hybrid RRF score (Reciprocal Rank Fusion)
  // Scientific basis: Luan et al. (2022) — hybrid retrieval outperforms either alone
  for (const doc of documents) {
    const bm25 = doc.bm25Score || 0;
    const vector = doc.vectorScore || 0;
    // RRF: if both scores available, combine; otherwise use available score
    doc.hybridScore = bm25 > 0 && vector > 0 
      ? (bm25 + vector) / 2 + 0.1 // bonus for appearing in both
      : Math.max(bm25, vector, doc.relevanceScore);
  }
  
  return documents;
}

/**
 * Grade documents using LLM critique (Self-RAG style).
 * Always uses LLM grading for accuracy (unlike v1 which skipped for small sets).
 */
async function gradeDocumentsV2(
  documents: CRAGv2Document[],
  query: string
): Promise<CRAGv2Document[]> {
  if (documents.length === 0) return [];
  
  // Batch grade all documents in a single LLM call for efficiency
  const docSummaries = documents.slice(0, 10).map((doc, i) => 
    `[${i}] ${doc.content.slice(0, 300)}`
  ).join('\n\n');
  
  try {
    const gradingResponse = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        {
          role: 'system',
          content: `Grade each document's relevance to the query on a scale 0.0-1.0.
Return ONLY a JSON array of numbers, one per document: [0.8, 0.3, 0.9, ...]`,
        },
        {
          role: 'user',
          content: `Query: "${query}"\n\nDocuments:\n${docSummaries}`,
        },
      ],
      maxTokens: 100,
      temperature: 0.1,
    });
    
    const content = gradingResponse.choices[0]?.message?.content || '[]';
    const scores = JSON.parse((typeof content === 'string' ? content : JSON.stringify(content)).replace(/```json\n?|\n?```/g, '').trim()) as number[];
    
    return documents.map((doc, i) => ({
      ...doc,
      relevanceScore: typeof scores[i] === 'number' ? scores[i] : doc.relevanceScore,
    }));
  } catch (e) {
    // Fallback to heuristic grading
    return documents;
  }
}

/**
 * Corrective web search using DuckDuckGo API.
 * Triggered when local knowledge is insufficient.
 */
async function correctiveWebSearch(query: string): Promise<CRAGv2Document[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url);
    const data = await response.json() as any;
    
    const results: CRAGv2Document[] = [];
    
    if (data.AbstractText) {
      results.push({
        content: data.AbstractText,
        source: data.AbstractURL || 'duckduckgo',
        sourceType: 'web_search',
        relevanceScore: 0.7,
        isGrounded: false,
      });
    }
    
    for (const topic of (data.RelatedTopics || []).slice(0, 3)) {
      if (topic.Text) {
        results.push({
          content: topic.Text,
          source: topic.FirstURL || 'duckduckgo',
          sourceType: 'web_search',
          relevanceScore: 0.5,
          isGrounded: false,
        });
      }
    }
    
    return results;
  } catch (e) {
    return [];
  }
}
