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
          console.log(`[AgenticLearning] Stored fact: "${decision.title}" (ID: ${id})`);
        } catch (e) {
          console.error('[AgenticLearning] Failed to store fact:', e);
        }
      }

      if (decision.learningType === 'study_topic' && decision.topic) {
        try {
          console.log(`[AgenticLearning] Studying topic: "${decision.topic}"`);
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
          console.log(`[AgenticLearning] Ingested ${papersIngested} papers on "${decision.topic}"`);
        } catch (e) {
          console.error('[AgenticLearning] Failed to study topic:', e);
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
    console.error('[AgenticLearning] Error in learning loop:', error);
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

    const content = typeof result === 'string' ? result : result?.content || '';
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
    console.error('[AgenticLearning] Analysis failed:', e);
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
  console.log(`[AgenticLearning] Force studying: "${topic}" (depth: ${depth})`);

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
    console.log(`[AgenticLearning] Ingested ${papersIngested} papers`);
  } catch (e) {
    console.error('[AgenticLearning] Paper ingestion failed:', e);
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
      console.log(`[AgenticLearning] Stored research summary (ID: ${id})`);
    }
  } catch (e) {
    console.error('[AgenticLearning] Web research failed:', e);
  }

  return { papersIngested, knowledgeAdded };
}
