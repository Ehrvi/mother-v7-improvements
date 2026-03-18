/**
 * MOTHER — SEAL-RAG: Search → Extract → Assess → Loop
 * P4 Upgrade: "Replace, Don't Expand" strategy for multi-hop RAG
 *
 * Scientific basis:
 * - SEAL-RAG (Lahmy & Yozevitch, arXiv:2512.10787, 2025)
 *   +3-13pp accuracy vs Self-RAG on HotpotQA
 *   +8pp accuracy on 2WikiMultiHopQA
 *   96% evidence precision vs CRAG 22%
 * - Fixed retrieval depth k — predictable cost profile
 * - Entity-anchored gap detection for targeted micro-queries
 *
 * Key innovation: Instead of EXPANDING context with more documents,
 * REPLACE low-quality documents with gap-closing evidence.
 * This prevents context dilution while maintaining fixed k.
 */

import { createLogger } from '../_core/logger';
import { invokeLLM } from '../_core/llm';

const log = createLogger('SEAL_RAG');

export interface SEALDocument {
  content: string;
  source: string;
  relevanceScore: number;
  gapClosingScore: number;  // how well this doc fills identified gaps
  entities: string[];
  isOriginal: boolean;
  replacedBy?: string;
}

export interface GapSpecification {
  missingEntities: string[];
  missingRelations: string[];
  microQueries: string[];
  gapDescription: string;
}

export interface SEALResult {
  documents: SEALDocument[];
  context: string;
  gapSpec: GapSpecification | null;
  iterations: number;
  replacementsMade: number;
  evidencePrecision: number;  // fraction of docs that close gaps
  strategy: 'seal' | 'standard';
  fixedK: number;
}

// ============================================================
// MULTI-HOP DETECTION
// ============================================================

/**
 * Detect if a query likely requires multi-hop reasoning.
 * Multi-hop indicators: comparison, bridge entities, temporal chains.
 */
export function isMultiHopQuery(query: string): boolean {
  const q = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Comparison patterns
  if (/\b(compare|versus|vs|difference|between|melhor|pior|comparar|diferenca|versus)\b/.test(q)) return true;
  // Bridge patterns (A of B, A that B)
  if (/\b(who|what|where).*\b(that|which|whose|who)\b/.test(q)) return true;
  // Temporal chains
  if (/\b(before|after|then|first|next|followed|antes|depois|primeiro|seguinte)\b/.test(q) &&
      /\b(and|also|then|e|tambem|entao)\b/.test(q)) return true;
  // Multi-entity questions
  const entities = q.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  if (entities && entities.length >= 2) return true;
  // Explicit multi-step
  if (/\b(step.?by.?step|passo.?a.?passo|multi.?hop|chain)\b/.test(q)) return true;

  return false;
}

// ============================================================
// SEAL CYCLE: Search → Extract → Assess → Loop
// ============================================================

/**
 * SEAL-RAG main pipeline.
 *
 * @param query - User query
 * @param initialDocs - Documents from initial retrieval (e.g., from CRAG v2)
 * @param k - Fixed retrieval depth (default 5)
 * @param maxIterations - Maximum SEAL loop iterations (default 2)
 */
export async function sealRetrieve(
  query: string,
  initialDocs: Array<{ content: string; source: string; relevanceScore: number }>,
  k = 5,
  maxIterations = 2,
): Promise<SEALResult> {
  // Initialize document slots (fixed-k)
  let documents: SEALDocument[] = initialDocs.slice(0, k).map(doc => ({
    content: doc.content,
    source: doc.source,
    relevanceScore: doc.relevanceScore,
    gapClosingScore: 0,
    entities: extractEntities(doc.content),
    isOriginal: true,
  }));

  // Pad to k if needed
  while (documents.length < k && initialDocs.length > documents.length) {
    const nextDoc = initialDocs[documents.length];
    documents.push({
      content: nextDoc.content,
      source: nextDoc.source,
      relevanceScore: nextDoc.relevanceScore,
      gapClosingScore: 0,
      entities: extractEntities(nextDoc.content),
      isOriginal: true,
    });
  }

  let totalReplacements = 0;
  let iterations = 0;
  let gapSpec: GapSpecification | null = null;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations++;

    // ── STEP 1: EXTRACT — Build entity/relation inventory ──
    const allEntities = new Set<string>();
    for (const doc of documents) {
      for (const entity of doc.entities) {
        allEntities.add(entity.toLowerCase());
      }
    }

    // ── STEP 2: ASSESS — Detect gaps via LLM ──
    gapSpec = await detectGaps(query, documents, allEntities);

    if (!gapSpec || gapSpec.missingEntities.length === 0 && gapSpec.missingRelations.length === 0) {
      log.info(`SEAL iter ${iter+1}: No gaps detected — stopping`);
      break;
    }

    log.info(`SEAL iter ${iter+1}: Gaps detected — ${gapSpec.missingEntities.length} missing entities, ${gapSpec.microQueries.length} micro-queries`);

    // ── STEP 3: LOOP — Generate micro-queries and retrieve gap-closing evidence ──
    const gapClosingDocs: SEALDocument[] = [];
    for (const microQuery of gapSpec.microQueries.slice(0, 3)) {
      const retrieved = await retrieveForMicroQuery(microQuery);
      for (const doc of retrieved) {
        gapClosingDocs.push({
          content: doc.content,
          source: doc.source,
          relevanceScore: doc.relevanceScore,
          gapClosingScore: computeGapClosingScore(doc.content, gapSpec),
          entities: extractEntities(doc.content),
          isOriginal: false,
        });
      }
    }

    if (gapClosingDocs.length === 0) {
      log.info(`SEAL iter ${iter+1}: No gap-closing docs found — stopping`);
      break;
    }

    // ── STEP 4: REPLACE — Swap lowest-scoring docs with gap-closing evidence ──
    // Sort gap-closing docs by their gap-closing score (descending)
    gapClosingDocs.sort((a, b) => b.gapClosingScore - a.gapClosingScore);

    // Find the weakest original documents
    const replaceable = documents
      .map((doc, idx) => ({ doc, idx }))
      .sort((a, b) => a.doc.relevanceScore - b.doc.relevanceScore);

    let replacementsThisIter = 0;
    for (const gapDoc of gapClosingDocs) {
      if (replacementsThisIter >= 2) break; // max 2 replacements per iteration
      const weakest = replaceable.find(r =>
        gapDoc.gapClosingScore > r.doc.relevanceScore * 1.2 // must be significantly better
      );
      if (weakest) {
        const oldSource = documents[weakest.idx].source;
        documents[weakest.idx] = gapDoc;
        documents[weakest.idx].replacedBy = oldSource;
        replacementsThisIter++;
        totalReplacements++;
        // Remove from replaceable pool
        replaceable.splice(replaceable.indexOf(weakest), 1);
      }
    }

    log.info(`SEAL iter ${iter+1}: ${replacementsThisIter} replacements made (total: ${totalReplacements})`);
  }

  // Compute evidence precision (fraction of docs that close gaps)
  const evidencePrecision = documents.length > 0
    ? documents.filter(d => d.gapClosingScore > 0 || d.relevanceScore >= 0.7).length / documents.length
    : 0;

  // Build context
  const context = documents.length > 0
    ? `## KNOWLEDGE BASE (SEAL-RAG — ${documents.length} docs, ${totalReplacements} replacements, ${iterations} iterations)\n\n` +
      documents.map((doc, i) =>
        `[Doc ${i+1} | Source: ${doc.source} | Relevance: ${(doc.relevanceScore * 100).toFixed(0)}% | Gap-closing: ${(doc.gapClosingScore * 100).toFixed(0)}%${doc.replacedBy ? ` | Replaced: ${doc.replacedBy}` : ''}]\n${doc.content.slice(0, 800)}`
      ).join('\n\n')
    : '';

  return {
    documents,
    context,
    gapSpec,
    iterations,
    replacementsMade: totalReplacements,
    evidencePrecision,
    strategy: 'seal',
    fixedK: k,
  };
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function extractEntities(text: string): string[] {
  // Simple entity extraction: capitalized phrases + technical terms
  const entities: string[] = [];
  const capitalizedMatches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  if (capitalizedMatches) entities.push(...capitalizedMatches);
  // Technical terms
  const techMatches = text.match(/\b[A-Z]{2,}(?:-\d+)?\b/g);
  if (techMatches) entities.push(...techMatches);
  return [...new Set(entities)].slice(0, 20);
}

async function detectGaps(
  query: string,
  documents: SEALDocument[],
  knownEntities: Set<string>,
): Promise<GapSpecification | null> {
  try {
    const docSummaries = documents.map((d, i) =>
      `[${i}] Entities: ${d.entities.slice(0, 5).join(', ')}. Content: ${d.content.slice(0, 200)}`
    ).join('\n');

    const response = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        {
          role: 'system',
          content: `You analyze whether retrieved documents fully answer a multi-hop query. Identify missing information.
Return ONLY JSON: {"missingEntities": ["..."], "missingRelations": ["A→B"], "microQueries": ["..."], "gapDescription": "..."}
If no gaps exist, return {"missingEntities": [], "missingRelations": [], "microQueries": [], "gapDescription": "complete"}`,
        },
        {
          role: 'user',
          content: `Query: "${query.slice(0, 300)}"\n\nRetrieved documents:\n${docSummaries}\n\nKnown entities: ${[...knownEntities].slice(0, 20).join(', ')}`,
        },
      ],
      maxTokens: 200,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(
      (typeof content === 'string' ? content : JSON.stringify(content))
        .replace(/```json\n?|\n?```/g, '')
        .trim()
    );

    return {
      missingEntities: parsed.missingEntities || [],
      missingRelations: parsed.missingRelations || [],
      microQueries: parsed.microQueries || [],
      gapDescription: parsed.gapDescription || '',
    };
  } catch (err) {
    log.warn(`Gap detection failed: ${(err as Error).message}`);
    return null;
  }
}

function computeGapClosingScore(content: string, gapSpec: GapSpecification): number {
  const contentLower = content.toLowerCase();
  let score = 0;
  let total = 0;

  for (const entity of gapSpec.missingEntities) {
    total++;
    if (contentLower.includes(entity.toLowerCase())) score++;
  }
  for (const relation of gapSpec.missingRelations) {
    total++;
    const parts = relation.split(/→|->/);
    const found = parts.filter(p => contentLower.includes(p.trim().toLowerCase()));
    if (found.length >= parts.length * 0.5) score++;
  }

  return total > 0 ? score / total : 0;
}

async function retrieveForMicroQuery(
  query: string,
): Promise<Array<{ content: string; source: string; relevanceScore: number }>> {
  try {
    const { queryKnowledge } = await import('./knowledge');
    const results = await queryKnowledge(query);
    return results.slice(0, 3).map((r: any) => ({
      content: r.content || '',
      source: r.source || 'micro_query',
      relevanceScore: r.relevance || 0.6,
    }));
  } catch {
    return [];
  }
}
