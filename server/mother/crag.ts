/**
 * MOTHER v67.0 - CRAG/Self-RAG Knowledge Pipeline
 *
 * Replaces the naive multi-source RAG with a self-correcting, agentic pipeline.
 *
 * Pipeline:
 * 1. Query Analysis & Rewriting (if ambiguous)
 * 2. Multi-source Retrieval (DB + vector + papers)
 * 3. Retrieval Grading (Self-RAG critique tokens)
 * 4. Corrective Retrieval (web search if no relevant docs found)
 * 5. Context Generation (structured, ranked context)
 *
 * Scientific basis:
 * - CRAG (Yan et al., arXiv:2401.15884, 2024): Corrective RAG with web search fallback
 * - Self-RAG (Asai et al., arXiv:2310.11511, 2023): Retrieve, critique, generate
 * - HyDE (Gao et al., arXiv:2212.10496, 2022): Hypothetical Document Embeddings for query expansion
 * - RAG Survey (Gao et al., arXiv:2312.10997, 2023): Comprehensive RAG survey
 * - Adaptive RAG (Jeong et al., arXiv:2403.14403, 2024): Dynamic retrieval strategy selection
 */

import { invokeLLM } from '../_core/llm';
import { getEmbedding } from './embeddings';
import { conductResearch } from './research';

export interface CRAGDocument {
  content: string;
  source: string;
  sourceType: 'knowledge_db' | 'vector_search' | 'paper' | 'web_search';
  relevanceScore: number;
  isGrounded: boolean;
}

export interface CRAGResult {
  context: string;
  documents: CRAGDocument[];
  queryRewritten: boolean;
  rewrittenQuery?: string;
  correctiveSearchTriggered: boolean;
  totalDocuments: number;
  relevantDocuments: number;
}

/**
 * Main CRAG pipeline entry point.
 * Replaces the simple `queryKnowledge` function.
 */
export async function cragRetrieve(
  query: string,
  userId?: number
): Promise<CRAGResult> {
  console.log(`[CRAG] Starting retrieval for: "${query.slice(0, 80)}"`);

  // Step 1: Analyze query and decide retrieval strategy
  const { needsRetrieval, rewrittenQuery, queryType } = await analyzeQuery(query);

  if (!needsRetrieval) {
    console.log('[CRAG] Query does not require retrieval (conversational)');
    return {
      context: '',
      documents: [],
      queryRewritten: false,
      correctiveSearchTriggered: false,
      totalDocuments: 0,
      relevantDocuments: 0,
    };
  }

  const effectiveQuery = rewrittenQuery || query;

  // Step 2: Multi-source retrieval
  const rawDocuments = await multiSourceRetrieval(effectiveQuery);
  console.log(`[CRAG] Retrieved ${rawDocuments.length} raw documents`);

  // Step 3: Grade each document for relevance (Self-RAG critique)
  const gradedDocuments = await gradeDocuments(rawDocuments, effectiveQuery);
  const relevantDocs = gradedDocuments.filter(d => d.relevanceScore >= 0.5);
  console.log(`[CRAG] ${relevantDocs.length}/${rawDocuments.length} documents deemed relevant`);

  // Step 4: Corrective retrieval if no relevant documents found
  let correctiveSearchTriggered = false;
  let allDocuments = relevantDocs;

  if (relevantDocs.length === 0 && queryType !== 'conversational') {
    console.log('[CRAG] No relevant documents found. Triggering corrective web search...');
    correctiveSearchTriggered = true;
    try {
      const webResults = await conductResearch(effectiveQuery);
      if (webResults && webResults.sources && webResults.sources.length > 0) {
        const webDocs: CRAGDocument[] = webResults.sources.map((r: { snippet: string; url?: string; title?: string }) => ({
          content: r.snippet || '',
          source: r.url || r.title || 'web_search',
          sourceType: 'web_search' as const,
          relevanceScore: 0.7, // Assume moderate relevance for web results
          isGrounded: true,
        }));
        allDocuments = [...relevantDocs, ...webDocs];
        console.log(`[CRAG] Corrective search added ${webDocs.length} documents`);
      }
    } catch (error) {
      console.error('[CRAG] Corrective search failed:', error);
    }
  }

  // Step 5: Generate structured context
  const context = generateContext(allDocuments, effectiveQuery);

  return {
    context,
    documents: allDocuments,
    queryRewritten: !!rewrittenQuery,
    rewrittenQuery: rewrittenQuery || undefined,
    correctiveSearchTriggered,
    totalDocuments: rawDocuments.length,
    relevantDocuments: allDocuments.length,
  };
}

/**
 * Analyze the query to determine retrieval strategy.
 * Based on Adaptive RAG (Jeong et al., 2024).
 */
async function analyzeQuery(query: string): Promise<{
  needsRetrieval: boolean;
  rewrittenQuery: string | null;
  queryType: 'factual' | 'analytical' | 'conversational' | 'technical';
}> {
  // Fast heuristics first (no LLM call needed)
  const conversationalPatterns = [
    /^(olá|oi|tudo bem|como vai|bom dia|boa tarde|boa noite)/i,
    /^(hello|hi|hey|how are you|good morning)/i,
    /^(obrigado|obrigada|valeu|thanks|thank you)/i,
  ];

  for (const pattern of conversationalPatterns) {
    if (pattern.test(query.trim())) {
      return { needsRetrieval: false, rewrittenQuery: null, queryType: 'conversational' };
    }
  }

  // For short, simple queries, skip rewriting
  if (query.length < 30) {
    return { needsRetrieval: true, rewrittenQuery: null, queryType: 'factual' };
  }

  // For longer queries, use LLM to classify and potentially rewrite
  try {
    const analysisPrompt = `Analyze this user query and respond with a JSON object:

Query: "${query.slice(0, 300)}"

Respond with:
{
  "needsRetrieval": boolean (true if factual/technical knowledge is needed, false if purely conversational),
  "queryType": "factual" | "analytical" | "conversational" | "technical",
  "rewrittenQuery": string or null (if the query is ambiguous or in Portuguese, rewrite it in clear English for better search results; otherwise null)
}

Return ONLY the JSON object.`;

    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: analysisPrompt }],
      maxTokens: 200,
    });

    const content = typeof result === 'string' ? result : (result?.choices?.[0]?.message?.content as string) || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        needsRetrieval: parsed.needsRetrieval !== false,
        rewrittenQuery: parsed.rewrittenQuery || null,
        queryType: parsed.queryType || 'factual',
      };
    }
  } catch {
    // Default to retrieval on error
  }

  return { needsRetrieval: true, rewrittenQuery: null, queryType: 'factual' };
}

/**
 * Retrieve documents from all available sources.
 */
async function multiSourceRetrieval(query: string): Promise<CRAGDocument[]> {
  const documents: CRAGDocument[] = [];

  // Source 1: Knowledge DB (keyword search)
  try {
    const { queryDatabase } = await import('./knowledge');
    const dbResults = await queryDatabase(query);
    for (const r of dbResults) {
      documents.push({
        content: r.content,
        source: r.source?.name || 'knowledge_db',
        sourceType: 'knowledge_db',
        relevanceScore: r.relevance || 0.5,
        isGrounded: true,
      });
    }
  } catch (e) {
    console.error('[CRAG] DB retrieval failed:', e);
  }

  // Source 2: Vector search (semantic similarity)
  try {
    const { queryVectorSearch } = await import('./knowledge');
    const vectorResults = await queryVectorSearch(query);
    for (const r of vectorResults) {
      documents.push({
        content: r.content,
        source: r.source?.name || 'vector_search',
        sourceType: 'vector_search',
        relevanceScore: r.relevance || 0.6,
        isGrounded: true,
      });
    }
  } catch (e) {
    console.error('[CRAG] Vector search failed:', e);
  }

  // Source 3: Academic papers (RAG over paper_chunks)
  try {
    const { queryExternalKnowledge } = await import('./knowledge');
    const paperResults = await queryExternalKnowledge(query);
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
    console.error('[CRAG] Paper retrieval failed:', e);
  }

  return documents;
}

/**
 * Grade each document for relevance using a lightweight LLM call.
 * Based on Self-RAG critique tokens (Asai et al., 2023).
 */
async function gradeDocuments(
  documents: CRAGDocument[],
  query: string
): Promise<CRAGDocument[]> {
  if (documents.length === 0) return [];

  // For small sets, use LLM grading; for large sets, use heuristics
  if (documents.length <= 5) {
    try {
      const gradingPrompt = `You are a relevance grader. Given a user query and a list of retrieved documents, score each document's relevance from 0.0 to 1.0.

Query: "${query.slice(0, 200)}"

Documents:
${documents.map((d, i) => `[${i}] ${d.content.slice(0, 200)}`).join('\n\n')}

Return a JSON array of numbers (one per document, in order), representing relevance scores from 0.0 (irrelevant) to 1.0 (highly relevant).
Example: [0.9, 0.2, 0.7, 0.1, 0.8]
Return ONLY the JSON array.`;

      const result = await invokeLLM({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: gradingPrompt }],
        maxTokens: 100,
      });

      const content = typeof result === 'string' ? result : (result?.choices?.[0]?.message?.content as string) || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scores = JSON.parse(jsonMatch[0]);
        if (Array.isArray(scores) && scores.length === documents.length) {
          return documents.map((doc, i) => ({
            ...doc,
            relevanceScore: typeof scores[i] === 'number' ? scores[i] : doc.relevanceScore,
          }));
        }
      }
    } catch {
      // Fall through to return documents with original scores
    }
  }

  return documents;
}

/**
 * Generate a structured, ranked context string from the retrieved documents.
 */
function generateContext(documents: CRAGDocument[], query: string): string {
  if (documents.length === 0) return '';

  // Sort by relevance score descending
  const sorted = [...documents].sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Take top 5 most relevant
  const top = sorted.slice(0, 5);

  const contextParts = top.map((doc, i) => {
    const sourceLabel = doc.sourceType === 'paper'
      ? `📄 ${doc.source}`
      : doc.sourceType === 'web_search'
      ? `🌐 ${doc.source}`
      : `🧠 ${doc.source}`;
    return `[Fonte ${i + 1}: ${sourceLabel} | Relevância: ${(doc.relevanceScore * 100).toFixed(0)}%]\n${doc.content.slice(0, 600)}`;
  });

  return `\n\n**Conhecimento Recuperado (CRAG):**\n${contextParts.join('\n\n')}`;
}
