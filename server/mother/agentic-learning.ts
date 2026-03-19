/**
 * MOTHER v67.0 - Agentic Learning Loop
 *
 * Implements proactive, autonomous knowledge acquisition from every interaction.
 * After each user conversation, this agent analyzes the exchange and decides
 * whether to acquire new knowledge, update existing knowledge, or study a topic.
 *
 * Scientific basis:
 * - Continual Learning (Parisi et al., Neural Networks 2019): Catastrophic forgetting prevention
 * - Online Learning (Cesa-Bianchi & Lugosi, 2006): Learning from sequential data streams
 * - Self-Directed Learning (Zimmerman, 2002): Metacognitive regulation of learning
 * - MemGPT (Packer et al., arXiv:2310.08560, 2023): LLMs as OS with memory management
 * - Generative Agents (Park et al., arXiv:2304.03442, 2023): Memory reflection and synthesis
 */

import { invokeLLM } from '../_core/llm';
import { addKnowledge } from './knowledge';
import { ingestPapersFromSearch } from './paper-ingest';
import type { ResearchResult } from './research';
import { createLogger } from '../_core/logger';
const log = createLogger('AGENTIC_LEARNING');


export interface LearningDecision {
  shouldLearn: boolean;
  learningType: 'store_fact' | 'study_topic' | 'update_existing' | 'none';
  topic?: string;
  content?: string;
  title?: string;
  category?: string;
  confidence: number;
  reason: string;
}

export interface AgenticLearningResult {
  learned: boolean;
  decisions: LearningDecision[];
  knowledgeIdsAdded: number[];
  papersIngested: number;
  reason: string;
}

/**
 * Main Agentic Learning Loop.
 * Runs after every user interaction to identify and capture learning opportunities.
 *
 * @param query - The user's query
 * @param response - MOTHER's response
 * @param knowledgeContext - The knowledge context used to generate the response
 * @param qualityScore - The quality score of the response (0-100)
 * @param userId - The user ID (for personalization)
 */
export async function agenticLearningLoop(
  query: string,
  response: string,
  knowledgeContext: string,
  qualityScore: number,
  userId?: number
): Promise<AgenticLearningResult> {
  // Only run if quality is acceptable (avoid learning from bad responses)
  if (qualityScore < 60) {
    return {
      learned: false,
      decisions: [],
      knowledgeIdsAdded: [],
      papersIngested: 0,
      reason: `Quality score ${qualityScore} below threshold (60)`,
    };
  }

  try {
    // Step 1: Analyze the conversation for learning opportunities
    const decisions = await analyzeLearningOpportunities(query, response, knowledgeContext);

    if (decisions.length === 0 || decisions.every(d => !d.shouldLearn)) {
      return {
        learned: false,
        decisions,
        knowledgeIdsAdded: [],
        papersIngested: 0,
        reason: 'No learning opportunities identified',
      };
    }

    const knowledgeIdsAdded: number[] = [];
    let papersIngested = 0;

    // Step 2: Execute each learning decision
    for (const decision of decisions) {
      if (!decision.shouldLearn) continue;

      if (decision.learningType === 'store_fact' && decision.content && decision.title) {
        try {
          const id = await addKnowledge(
            decision.title,
            decision.content,
            decision.category || 'learned',
            'agentic_learning'
          );
          knowledgeIdsAdded.push(id);
          log.info(`[AgenticLearning] Stored fact: "${decision.title}" (ID: ${id})`);
        } catch (e) {
          log.error('[AgenticLearning] Failed to store fact:', e);
        }
      }

      if (decision.learningType === 'study_topic' && decision.topic) {
        try {
          log.info(`[AgenticLearning] Studying topic: "${decision.topic}"`);
          // Ingest papers from arXiv about this topic
          const { conductResearch: doResearch } = await import('./research');
          const researchResult: ResearchResult = await doResearch(decision.topic);
          const arxivUrls = researchResult.sources
            .filter(s => s.type === 'arxiv')
            .slice(0, 3)
            .map(s => s.url);
          const ingestResult = arxivUrls.length > 0 ? await ingestPapersFromSearch(arxivUrls) : [];
          const ingestCount = ingestResult.filter(r => !r.skipped && !r.error).length;
          papersIngested += ingestCount;
          log.info(`[AgenticLearning] Ingested ${papersIngested} papers on "${decision.topic}"`);
        } catch (e) {
          log.error('[AgenticLearning] Failed to study topic:', e);
        }
      }
    }

    return {
      learned: knowledgeIdsAdded.length > 0 || papersIngested > 0,
      decisions,
      knowledgeIdsAdded,
      papersIngested,
      reason: `Stored ${knowledgeIdsAdded.length} facts, ingested ${papersIngested} papers`,
    };
  } catch (error) {
    log.error('[AgenticLearning] Error in learning loop:', error);
    return {
      learned: false,
      decisions: [],
      knowledgeIdsAdded: [],
      papersIngested: 0,
      reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Use an LLM to analyze the conversation and identify learning opportunities.
 * Based on Generative Agents memory reflection (Park et al., 2023).
 */
async function analyzeLearningOpportunities(
  query: string,
  response: string,
  knowledgeContext: string
): Promise<LearningDecision[]> {
  const analysisPrompt = `You are MOTHER's learning agent. Analyze this conversation and identify learning opportunities.

User Query: "${query.slice(0, 300)}"

MOTHER's Response: "${response.slice(0, 500)}"

Existing Knowledge Context Used: "${knowledgeContext.slice(0, 500) || 'None — MOTHER had no relevant knowledge'}"

Identify up to 3 learning opportunities. For each, decide:
1. "store_fact": A specific, verifiable fact from the conversation that should be stored permanently
2. "study_topic": A topic where MOTHER clearly lacked knowledge and should proactively study (search arXiv)
3. "none": No learning needed

Return a JSON array of learning decisions:
[
  {
    "shouldLearn": boolean,
    "learningType": "store_fact" | "study_topic" | "none",
    "topic": "topic to study (for study_topic)",
    "title": "concise title for the knowledge entry (for store_fact)",
    "content": "full content to store (for store_fact)",
    "category": "machine_learning | science | business | health | general | user_preference",
    "confidence": 0.0-1.0,
    "reason": "why this is a learning opportunity"
  }
]

Be conservative. Only suggest learning when there is a CLEAR opportunity. Return ONLY the JSON array.`;

  try {
    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: analysisPrompt }],
      maxTokens: 800,
    });

    const content = typeof result === 'string' ? result : (result?.choices?.[0]?.message?.content as string) || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((d: Partial<LearningDecision>) => d.confidence && d.confidence >= 0.7)
          .map((d: Partial<LearningDecision>) => ({
            shouldLearn: d.shouldLearn || false,
            learningType: d.learningType || 'none',
            topic: d.topic,
            content: d.content,
            title: d.title,
            category: d.category,
            confidence: d.confidence || 0,
            reason: d.reason || '',
          }));
      }
    }
  } catch (e) {
    log.error('[AgenticLearning] Analysis failed:', e);
  }

  return [];
}

/**
 * Force MOTHER to study a specific topic.
 * Called by the admin `force_study` tool.
 *
 * @param topic - The topic to study
 * @param depth - How many papers to ingest (default: 5)
 */
export async function forceStudy(
  topic: string,
  depth: number = 5
): Promise<{ papersIngested: number; knowledgeAdded: number }> {
  log.info(`[AgenticLearning] Force studying: "${topic}" (depth: ${depth})`);

  let papersIngested = 0;
  let knowledgeAdded = 0;

  // Step 1: Ingest arXiv papers
  try {
    const { conductResearch: doResearch } = await import('./research');
    const researchResult: ResearchResult = await doResearch(topic);
    const arxivUrls = researchResult.sources
      .filter(s => s.type === 'arxiv')
      .slice(0, depth)
      .map(s => s.url);
    const ingestResult = arxivUrls.length > 0 ? await ingestPapersFromSearch(arxivUrls) : [];
    const ingestCount = ingestResult.filter(r => !r.skipped && !r.error).length;
    papersIngested = ingestCount;
    log.info(`[AgenticLearning] Ingested ${papersIngested} papers`);
  } catch (e) {
    log.error('[AgenticLearning] Paper ingestion failed:', e);
  }

  // Step 2: Conduct web research and store summary
  try {
    const { conductResearch: doResearch2 } = await import('./research');
    const webResults = await doResearch2(topic);
    if (webResults && webResults.sources && webResults.sources.length > 0) {
      const summary = webResults.sources
        .slice(0, 3)
        .map((r: { snippet: string; url?: string }) => r.snippet)
        .join('\n\n');

      const id = await addKnowledge(
        `Research Summary: ${topic}`,
        summary,
        'research',
        'force_study'
      );
      knowledgeAdded++;
      log.info(`[AgenticLearning] Stored research summary (ID: ${id})`);
    }
  } catch (e) {
    log.error('[AgenticLearning] Web research failed:', e);
  }

  return { papersIngested, knowledgeAdded };
}

// ============================================================
// v82.0 SOTA UPGRADES
// ============================================================

/**
 * Validate a fact before storing — check if it contradicts existing knowledge.
 * Uses embedding similarity to find related facts, then LLM to check for contradiction.
 *
 * Scientific basis:
 * - FACTTRACK (arXiv:2407.16347, 2025): Time-aware fact tracking with validity intervals
 * - Contradiction Detection in RAG (2025): LLM as context validator
 * - SimpleMem (2026): Semantic lossless compression prevents duplicate storage
 */
export async function validateFactBeforeStoring(
  title: string,
  content: string,
  category: string
): Promise<{ isValid: boolean; isDuplicate: boolean; contradictsId?: number; reason: string }> {
  try {
    const { queryKnowledge } = await import('./knowledge');
    const existing = await queryKnowledge(content.slice(0, 200));

    if (!existing || existing.length === 0) {
      return { isValid: true, isDuplicate: false, reason: 'No existing related facts' };
    }

    // Check for exact duplicate (high similarity)
    for (const fact of existing.slice(0, 3)) {
      if (fact.content && content.length > 0) {
        const overlap = calculateTextOverlap(content, fact.content);
        if (overlap > 0.85) {
          return { isValid: false, isDuplicate: true, reason: `Duplicate of existing fact: "${fact.content.slice(0, 80)}..."` };
        }
      }
    }

    // LLM contradiction check (only if we have closely related facts)
    const relatedFacts = existing.slice(0, 3).map((f, i) =>
      `[${i + 1}] ${f.content.slice(0, 200)}`
    ).join('\n');

    const result = await invokeLLM({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Does the NEW FACT contradict any EXISTING FACT?

NEW FACT: ${title}: ${content.slice(0, 200)}

EXISTING FACTS:
${relatedFacts}

Answer with JSON only: {"contradicts": false} or {"contradicts": true, "contradictedFactId": number, "reason": "brief explanation"}`,
      }],
      maxTokens: 150,
    });

    const llmContent = typeof result === 'string' ? result :
      (typeof result?.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content : '');
    const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.contradicts) {
        return {
          isValid: false,
          isDuplicate: false,
          contradictsId: parsed.contradictedFactId,
          reason: `Contradicts fact: ${parsed.reason}`,
        };
      }
    }

    return { isValid: true, isDuplicate: false, reason: 'Validated — no contradictions found' };
  } catch (error) {
    log.error('[AgenticLearning] Fact validation failed (proceeding with storage):', error);
    return { isValid: true, isDuplicate: false, reason: 'Validation failed — proceeding cautiously' };
  }
}

/**
 * Prune stale knowledge entries that are unused and old.
 * Implements active forgetting to maintain signal-to-noise ratio.
 *
 * Scientific basis:
 * - ALMA (Xiong et al., 2026, arXiv:2602.07755): Meta-learned memory designs
 *   include forgetting mechanisms that outperform unlimited accumulation
 * - SleepGate (Xie, 2026, arXiv:2603.14517): Targeted forgetting
 * - CL Survey (arXiv:2603.12658, 2026): Without consolidation, S/N degrades
 */
export async function pruneStaleKnowledge(): Promise<{ archived: number }> {
  try {
    const { getDb: getDatabase } = await import('../db');
    const db = await getDatabase();
    if (!db) return { archived: 0 };

    // Soft-archive: tag entries with 0 access, 90+ days old, non-core category
    const result = await (db as any).execute(
      `UPDATE knowledge
       SET tags = CONCAT(COALESCE(tags, '[]'), ',"archived"')
       WHERE accessCount = 0
       AND createdAt < NOW() - INTERVAL 90 DAY
       AND (category IS NULL OR category NOT IN ('core', 'system', 'episodic_memory'))
       AND (tags IS NULL OR tags NOT LIKE '%archived%')
       LIMIT 30`
    );

    const archived = (result as any)?.affectedRows || 0;
    if (archived > 0) {
      log.info(`[AgenticLearning] Pruned ${archived} stale knowledge entries`);
    }
    return { archived };
  } catch (error) {
    log.error('[AgenticLearning] Pruning failed:', error);
    return { archived: 0 };
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Calculate text overlap ratio between two strings.
 * Uses word-level Jaccard similarity.
 */
function calculateTextOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

