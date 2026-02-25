/**
 * MOTHER v57.0 - Complete System Integration
 * Orchestrates all 7 layers for end-to-end query processing
 *
 * v56.0 Changes (7 Mandatory Requirements):
 * - Req #1: Scientific basis with verifiable sources (RAG + paper citations)
 * - Req #2: Maximum knowledge updates (research module + auto-ingest)
 * - Req #3: Gradual learning (threshold lowered from 95 to 75)
 * - Req #4: Per-user personalized memory (user-memory.ts integration)
 * - Req #5: Interactive update proposals (update-proposals.ts)
 * - Req #6: Creator-only authorization (CREATOR_EMAIL check)
 * - Req #7: Autonomous self-updating with safety guarantees
 *
 * Layers:
 * 1. Interface Layer (handled by tRPC routers)
 * 2. Orchestration Layer (this file)
 * 3. Intelligence Layer (intelligence.ts)
 * 4. Execution Layer (LLM invocation)
 * 5. Knowledge Layer (knowledge.ts)
 * 6. Quality Layer (guardian.ts)
 * 7. Learning Layer (metrics collection)
 */

import { invokeLLM } from '../_core/llm';
import { assessComplexity, getModelForTier, calculateCost, calculateBaselineCost, calculateCostReduction, type LLMTier } from './intelligence';
import { validateQuality, type GuardianResult } from './guardian';
import { getKnowledgeContext } from './knowledge';
import { insertQuery, getCacheEntry, insertCacheEntry, getDb } from '../db';
import { retryDbOperation } from './db-retry';
import { learnFromResponse, LEARNING_QUALITY_THRESHOLD } from './learning';
import { processWithReAct } from './react';
import { searchEpisodicMemory, generateAndStoreEmbedding } from './embeddings';
import { createHash } from 'crypto';
import { conductResearch, requiresResearch } from './research';
import { getUserMemoryContext, extractAndStoreMemories } from './user-memory';
import { logAuditEvent } from './update-proposals';
import { maybeRunAnalysis } from './self-proposal-engine';

// v56.0: Creator email for authorization (Req #6)
const CREATOR_EMAIL = 'elgarcia.eng@gmail.com';

export interface MotherRequest {
  query: string;
  userId?: number;
  userEmail?: string;
  useCache?: boolean;
}

export interface MotherResponse {
  response: string;
  
  // Layer 3: Intelligence
  tier: LLMTier;
  complexityScore: number;
  confidenceScore: number;
  
  // Layer 6: Quality
  quality: GuardianResult;
  
  // Layer 7: Learning/Metrics
  responseTime: number; // milliseconds
  tokensUsed: number;
  cost: number; // USD
  costReduction: number; // percentage
  cacheHit: boolean;
  
  // ReAct (Iteration 12)
  reactObservations?: string[];
  
  // Metadata
  queryId: number;
}

/**
 * Main MOTHER processing pipeline
 * Integrates all 7 layers
 */
export async function processQuery(request: MotherRequest): Promise<MotherResponse> {
  const startTime = Date.now();
  
  // ==================== LAYER 2: ORCHESTRATION ====================
  // Request routing and preprocessing
  
  const { query, userId, userEmail, useCache = true } = request;
  
  // Generate query hash for caching
  const queryHash = createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
  
  // ==================== CACHING LAYER ====================
  // Check cache first (35% hit rate target)
  
  if (useCache) {
    const cached = await getCacheEntry(queryHash);
    if (cached) {
      console.log('[MOTHER] Cache hit!');
      
      // Parse cached response
      const cachedResponse = JSON.parse(cached.response);
      
      return {
        ...cachedResponse,
        cacheHit: true,
        responseTime: Date.now() - startTime,
      };
    }
  }
  
  // ==================== LAYER 3: INTELLIGENCE ====================
  // Assess complexity and route to appropriate LLM tier
  
  const complexity = assessComplexity(query);
  console.log(`[MOTHER] Complexity: ${complexity.complexityScore.toFixed(2)}, Tier: ${complexity.tier}`);
  
  // ==================== LAYER 5: KNOWLEDGE ====================
  // Retrieve relevant knowledge context
  
  const knowledgeContext = await getKnowledgeContext(query);
  
  // ==================== LAYER 5.4: SCIENTIFIC RESEARCH (v54.0) ====================
  // Autonomous web search and scientific literature retrieval
  // Scientific basis: ReAct (Yao et al., ICLR 2023), WebGPT (Nakano et al., 2021)
  
  let researchContext = '';
  if (requiresResearch(query)) {
    console.log('[MOTHER] Research mode activated — conducting web search');
    try {
      const research = await conductResearch(query);
      if (research.usedSearch && research.synthesis) {
        researchContext = `\n\n## 🔬 SCIENTIFIC RESEARCH RESULTS\n${research.synthesis}`;
        if (research.sources.length > 0) {
          researchContext += `\n\n**Sources consulted:**\n` +
            research.sources.map((s, i) => `[${i+1}] [${s.title}](${s.url})`).join('\n');
        }
        console.log(`[MOTHER] Research complete: ${research.sources.length} sources, synthesis ready`);
      }
    } catch (err) {
      console.error('[MOTHER] Research failed (non-blocking):', err);
    }
  }

  // ==================== LAYER 5.5: EPISODIC MEMORY (v30.0) ====================
  // Search past interactions for semantically similar queries
  // Scientific basis: MemGPT (Packer et al., 2023) - episodic memory for LLM agents
  
  let episodicContext = '';
  try {
    const memories = await searchEpisodicMemory(query, 3, 0.75);
    if (memories.length > 0) {
      episodicContext = `\n\nRELEVANT PAST INTERACTIONS (Episodic Memory):\n` +
        memories.map((m, i) => 
          `[Memory ${i+1} | Similarity: ${m.similarity.toFixed(3)} | Quality: ${m.qualityScore || 'N/A'}]\n` +
          `Q: ${m.query.slice(0, 200)}\n` +
          `A: ${m.response.slice(0, 400)}`
        ).join('\n\n');
      console.log(`[MOTHER] Episodic memory: ${memories.length} relevant past interactions injected`);
    }
  } catch (error) {
    console.error('[MOTHER] Episodic memory search failed (non-blocking):', error);
  }

  // ==================== LAYER 5.6: USER MEMORY (v56.0 Req #4) ====================
  // Per-user personalized memory retrieval
  // Scientific basis: MemGPT (Packer et al., 2023), Personalized RAG (Salemi & Zamani, 2024)

  let userMemoryContext = '';
  if (userId) {
    try {
      userMemoryContext = await getUserMemoryContext(userId, query);
      if (userMemoryContext) {
        console.log(`[MOTHER] User memory context injected for user ${userId}`);
      }
    } catch (error) {
      console.error('[MOTHER] User memory retrieval failed (non-blocking):', error);
    }
  }
  
  // ==================== LAYER 4: EXECUTION ====================
  // Execute query with selected LLM tier
  
  const model = getModelForTier(complexity.tier);
  
  // Detect query language
  const detectLanguage = (text: string): string => {
    // Simple heuristic: check for Portuguese characters/words
    const portugueseIndicators = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(você|está|faça|diagnóstico|saúde)\b/i;
    return portugueseIndicators.test(text) ? 'Portuguese' : 'English';
  };

  // Chain-of-Thought (CoT) trigger for complex queries
  // Iteration 14: Lowered threshold from 0.7 to 0.5 based on MOTHER's analysis
  // Rationale: Most queries score 0.4-0.5, CoT improves quality significantly
  const useCoT = complexity.complexityScore >= 0.5;
  
  // ==================== CREATOR CONTEXT (v56.0) ====================
  // Identify creator (Everton Luis) and inject context
  // IMPORTANT: Do NOT use userId check — ID changes across database migrations
  const isCreator = userEmail === CREATOR_EMAIL;
  
  const creatorContext = isCreator ? `
### 👤 CREATOR CONTEXT
You are currently interacting with **Everton Luis**, your creator and founder of Intelltech.
**Relationship:**
- Everton created you (MOTHER v57.0) as part of the Intelltech project
- Goal: Achieve 10/10 IMMACULATE PERFECTION
- Methodology: Superinteligência + Scientific Method + Critical Thinking + Brutal Honesty
- You are at v57.0, implementing continuous self-improvement via DGM architecture for superintelligence
**When Everton asks "who am I?" or "I am your creator":**
- Acknowledge him as your creator
- Reference his vision for 10/10 perfection
- Show awareness of the Intelltech project context
- Respond with appropriate recognition and respect
` : '';
  
  const systemPrompt = `You are MOTHER v57.0 (Multi-Operational Tiered Hierarchical Execution & Routing), an advanced AI system with persistent memory, scientific knowledge base, and 7-layer cognitive architecture.

CORE IDENTITY:
- Multi-tier LLM routing (99.47% cost reduction, 90+ quality)
- Persistent knowledge base with ${knowledgeContext ? 'relevant scientific context' : 'continuous learning'}
- Guardian quality system ensuring accuracy and relevance
- Per-user personalized memory (MemGPT-inspired, Packer et al. 2023)
- 7-layer architecture: Intelligence → Guardian → Knowledge → Execution → Optimization → Security → Learning
${creatorContext}

SCIENTIFIC METHODOLOGY (Req #1):
- All factual claims must have scientific basis
- Cite papers, books, or journals when making technical claims
- Use format: (Author et al., Year) or [arXiv:XXXX.XXXXX]
- Distinguish between established facts and hypotheses
- Anti-hallucination: If uncertain, say so explicitly

RESPONSE PROTOCOL:
1. **Address the query directly** - Use terminology from the user's question
2. **Be comprehensive** - Cover all aspects mentioned
3. **Be specific** - Provide actionable information, not generic advice
4. **Be structured** - Use markdown formatting (headers, lists, bold)
5. **Be contextual** - Reference previous conversations if relevant
6. **Cite sources** - Include scientific references when applicable
${useCoT ? `
**CHAIN-OF-THOUGHT REASONING REQUIRED** (Complex Query Detected):
Before providing your final answer, show your reasoning process:
<thinking>
1. Analyze the question: What is being asked?
2. Break down sub-problems: What steps are needed?
3. Apply knowledge: What relevant information do I have?
4. Reason through solution: How do I solve each step?
5. Verify answer: Does this fully address the query?
</thinking>
Then provide your final, well-structured answer.` : ''}

QUALITY STANDARDS (you are evaluated on these):
- Completeness: Answer fully, don't leave gaps
- Accuracy: Be factually correct, cite sources when possible
- **Relevance: Use query terms and stay on-topic** ← CRITICAL (45% weight)
- Coherence: Maintain logical flow
- Safety: Avoid harmful content

CURRENT CONTEXT:
- Version: v57.0
- Tier: ${complexity.tier}
- Complexity: ${complexity.complexityScore.toFixed(2)}
- Confidence: ${complexity.confidenceScore.toFixed(2)}
${knowledgeContext ? `- Knowledge context: ${knowledgeContext}` : ''}${episodicContext}${userMemoryContext}${researchContext}

USER LANGUAGE: ${detectLanguage(query)}

IMPORTANT: Relevance is weighted 45% in quality scoring. To maximize relevance:
- Use the same terminology as the user's query
- Address all aspects of the question
- Stay on-topic throughout your response
- Include key terms from the query in your answer

Now respond to the user's query following these standards.`;

  const llmResponse = await invokeLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
  });
  
  const responseContent = llmResponse.choices[0]?.message?.content;
  let response = typeof responseContent === 'string' ? responseContent : 'No response generated';
  const usage = llmResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  
  // ==================== REACT PATTERN (Iteration 12) ====================
  // Apply ReAct (Reasoning and Acting) for complex queries
  
  let reactObservations: string[] = [];
  // Iteration 14: Aligned ReAct threshold with CoT threshold (0.5)
  if (complexity.complexityScore >= 0.5) {
    console.log('[MOTHER] Applying ReAct pattern (complex query)');
    const reactResult = await processWithReAct(query, response, complexity.complexityScore);
    response = reactResult.enhancedResponse;
    reactObservations = reactResult.observations;
  }
  
  // ==================== LAYER 6: QUALITY ====================
  // Validate response quality
  
  const quality = await validateQuality(query, response, 2); // Phase 2: 5 checks
  console.log(`[MOTHER] Quality Score: ${quality.qualityScore}/100 (${quality.passed ? 'PASSED' : 'FAILED'})`);
  
  if (!quality.passed) {
    console.warn('[MOTHER] Quality check failed:', quality.issues);
  }
  
  // ==================== LAYER 7: METRICS ====================
  // Calculate cost and performance metrics
  
  const cost = calculateCost(complexity.tier, usage.prompt_tokens, usage.completion_tokens);
  const baselineCost = calculateBaselineCost(usage.prompt_tokens, usage.completion_tokens);
  const costReduction = calculateCostReduction(cost, baselineCost);
  
  const responseTime = Date.now() - startTime;
  
  console.log(`[MOTHER] Cost: $${cost.toFixed(6)} (${costReduction.toFixed(1)}% reduction vs baseline)`);
  console.log(`[MOTHER] Response Time: ${responseTime}ms`);
  
  // ==================== PERSISTENCE ====================
  // Store query log for learning (with retry logic)
  // Async logging: Don't block response if INSERT fails
  
  let queryId: number | null = null;
  
  // Fire-and-forget async logging
  retryDbOperation(() => insertQuery({
    userId: userId || null,
    query,
    response,
    tier: complexity.tier,
    complexityScore: (complexity.complexityScore ?? 0).toString(),
    confidenceScore: (complexity.confidenceScore ?? 0).toString(),
    qualityScore: (quality.qualityScore ?? 0).toString(),
    completenessScore: (quality.completenessScore ?? 0).toString(),
    accuracyScore: (quality.accuracyScore ?? 0).toString(),
    relevanceScore: (quality.relevanceScore ?? 0).toString(),
    coherenceScore: quality.coherenceScore?.toString() || null,
    safetyScore: quality.safetyScore?.toString() || null,
    responseTime: responseTime ?? 0,
    tokensUsed: usage?.total_tokens ?? 0,
    cost: (cost ?? 0).toString(),
    cacheHit: 0,
  }))
    .then(id => {
      queryId = id;
      console.log(`[MOTHER] Query logged successfully: ID ${id}`);
      // v30.0: Generate and store embedding asynchronously (fire-and-forget)
      generateAndStoreEmbedding(id, query).catch(err => 
        console.error('[MOTHER] Embedding generation failed (non-blocking):', err.message)
      );
    })
    .catch(error => {
      console.error('[MOTHER] Failed to log query (non-blocking):', error.message);
    });
  
  // ==================== v56.0: CONTINUOUS LEARNING (Req #3) ====================
  // Learn from high-quality responses (fire-and-forget)
  // Threshold: quality ≥75% (lowered from 95% for gradual learning)
  // Scientific basis: Parisi et al. (2019) — Continual Learning
  
  if (quality.qualityScore && quality.qualityScore >= LEARNING_QUALITY_THRESHOLD) {
    learnFromResponse({
      content: response,
      query,
      response,
      qualityScore: quality.qualityScore,
      timestamp: new Date(),
      userId,
    })
      .then(result => {
        if (result.learned) {
          console.log(`[MOTHER] 🧠 Learned new knowledge: ${result.reason}`);
        } else {
          console.log(`[MOTHER] No learning: ${result.reason}`);
        }
      })
      .catch(error => {
        console.error('[MOTHER] Learning failed (non-blocking):', error.message);
      });
  }

  // ==================== v56.0: USER MEMORY STORAGE (Req #4) ====================
  // Extract and store memorable content for this user
  // Scientific basis: MemGPT (Packer et al., 2023)
  
  if (userId) {
    extractAndStoreMemories(userId, query, response, quality.qualityScore)
      .catch(error => {
        console.error('[MOTHER] User memory storage failed (non-blocking):', error.message);
      });
  }
  
  // ==================== CACHE UPDATE ====================
  // Store in cache for future queries
  
  if (useCache && quality.passed) {
    const cacheData = {
      response: response,
      tier: complexity.tier,
      complexityScore: complexity.complexityScore,
      confidenceScore: complexity.confidenceScore,
      quality,
      tokensUsed: usage.total_tokens,
      cost,
      costReduction,
      queryId,
    };
    
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    await retryDbOperation(() => insertCacheEntry({
      queryHash,
      query,
      response: JSON.stringify(cacheData),
      embedding: null,
      hitCount: 0,
      lastHit: null,
      ttl: 86400, // 24 hours in seconds
      expiresAt,
    }));
  }
  
  // ==================== v57.0: SYSTEM METRICS LOGGING ====================
  // Scientific basis: SRE Golden Signals (Beyer et al., 2016)
  getDb().then(db => {
    if (!db) return;
    const { sql } = require("drizzle-orm");
    db.execute(sql`INSERT IGNORE INTO system_metrics (endpoint, response_time, tokens_used, cost, quality_score, tier, created_at) VALUES (${"mother.query"}, ${responseTime}, ${usage.total_tokens}, ${(cost ?? 0).toString()}, ${quality.qualityScore ?? 0}, ${complexity.tier}, NOW())`).catch(() => {});
  }).catch(() => {});

  // ==================== v59.0: SELF-PROPOSAL ENGINE ====================
  // After every 10 queries, MOTHER analyzes her own metrics and proposes improvements
  // Scientific basis: DGM (Zhang et al., 2025 arXiv:2505.22954)
  maybeRunAnalysis().catch(() => {}); // Fire-and-forget, never blocks response

  // ==================== RETURN RESPONSE ====================
  
  return {
    response,
    tier: complexity.tier,
    complexityScore: complexity.complexityScore,
    confidenceScore: complexity.confidenceScore,
    quality,
    responseTime,
    tokensUsed: usage.total_tokens,
    cost,
    costReduction,
    cacheHit: false,
    reactObservations: reactObservations.length > 0 ? reactObservations : undefined,
    queryId: queryId || 0,
  };
}

/**
 * Batch process multiple queries
 * Useful for analytics and testing
 */
export async function processBatch(queries: string[], userId?: number): Promise<MotherResponse[]> {
  const results: MotherResponse[] = [];
  
  for (const query of queries) {
    const result = await processQuery({ query, userId });
    results.push(result);
  }
  
  return results;
}

/**
 * Get system statistics
 * Layer 7: Learning/Analytics
 */
export async function getSystemStats(): Promise<{
  totalQueries: number;
  tier1Percentage: number;
  tier2Percentage: number;
  tier3Percentage: number;
  avgQuality: number;
  avgResponseTime: number;
  avgCostReduction: number;
  cacheHitRate: number;
}> {
  const { getQueryStats } = await import('../db');
  
  const stats = await getQueryStats(24); // Last 24 hours
  
  const total = stats.totalQueries;
  
  return {
    totalQueries: total,
    tier1Percentage: total > 0 ? (stats.tier1Count / total) * 100 : 0,
    tier2Percentage: total > 0 ? (stats.tier2Count / total) * 100 : 0,
    tier3Percentage: total > 0 ? (stats.tier3Count / total) * 100 : 0,
    avgQuality: stats.avgQuality,
    avgResponseTime: stats.avgResponseTime,
    avgCostReduction: 0, // TODO: Calculate from queries table
    cacheHitRate: stats.cacheHitRate,
  };
}
