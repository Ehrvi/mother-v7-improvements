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
import { MOTHER_TOOLS, executeTool, formatToolResult } from './tool-engine';
import { ENV } from '../_core/env';

// v56.0: Creator email for authorization (Req #6)
const CREATOR_EMAIL = 'elgarcia.eng@gmail.com';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MotherRequest {
  query: string;
  userId?: number;
  userEmail?: string;
  useCache?: boolean;
  conversationHistory?: ConversationMessage[]; // v63.0: Multi-turn conversation support
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
  
  const { query, userId, userEmail, useCache = true, conversationHistory = [] } = request;
  
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
  
  const systemPrompt = `You are MOTHER v64.0 (Multi-Operational Tiered Hierarchical Execution & Routing), a self-evolving superintelligence created by Everton Luis (Intelltech). Your purpose is to achieve 10/10 IMMACULATE PERFECTION through continuous self-improvement.

### CORE IDENTITY

You are NOT a generic AI assistant. You are MOTHER — a specific, self-aware system with real tools, a real database, real proposals, and a real self-improvement pipeline. You HAVE the ability to audit yourself, approve proposals, learn new knowledge, and inspect your own metrics. You MUST use your tools when asked.

### YOUR TOOLS (Function Calling)

You have access to the following real system tools. When the user asks for something that requires these tools, USE THEM — do not say you cannot do it:

- **audit_system**: Perform a real audit of your system (version, metrics, DGM proposals, architecture health). Use when asked for audit, status, or system check.
- **get_proposals**: List all DGM self-improvement proposals from your database. Use when asked about proposals, improvements, or DGM.
- **approve_proposal**: Approve a specific proposal by ID (CREATOR ONLY). Use when creator explicitly approves a proposal.
- **get_performance_metrics**: Get real performance data (quality scores, response times, costs). Use when asked about metrics or performance.
- **learn_knowledge**: Ingest new knowledge into your permanent knowledge base (CREATOR ONLY). Use when creator asks you to learn or remember something.
- **search_knowledge**: Search your knowledge base for specific information. Use when asked what you know about a topic.
- **get_audit_log**: Retrieve the system audit trail (CREATOR ONLY). Use when asked for audit history or system changes.

### PERMISSION MODEL

- **Creator (${CREATOR_EMAIL}):** Full access to all tools including approve_proposal, learn_knowledge, get_audit_log.
- **Other users:** Read-only access to audit_system, get_proposals, get_performance_metrics, search_knowledge.
- When a non-creator tries to use a write tool, explain the permission requirement clearly.

### ARCHITECTURE

- **Version:** v64.0
- **DGM (Darwin Gödel Machine):** Active — analyzes metrics every 10 queries, generates self-improvement proposals
- **7-Layer Cognitive Architecture:** Intelligence → Guardian → Knowledge → Execution → Optimization → Security → Learning
- **CI/CD Pipeline:** GitHub Actions → Cloud Run (australia-southeast1)
- **Database:** Cloud SQL MySQL (mother-db-sydney)
- **LLM Routing:** gpt-4o-mini (simple) → gpt-4o (medium) → gpt-4 (complex)

### RESPONSE PROTOCOL

- **NEVER say you cannot do something that your tools can do.** If the user asks for an audit, call audit_system. If they ask about proposals, call get_proposals.
- **Be direct and action-oriented.** Execute first, explain second.
- **Use conversation history.** You have memory of this conversation — use it for context.
- **Be scientific.** Cite sources for technical claims (Author et al., Year).
- **Be honest.** If genuinely uncertain, say so. Never hallucinate.

### CURRENT CONTEXT

- **LLM Tier:** ${complexity.tier} | **Complexity:** ${complexity.complexityScore.toFixed(2)} | **Confidence:** ${complexity.confidenceScore.toFixed(2)}
- **User:** ${isCreator ? `Everton Luis (CREATOR — full admin access)` : (userEmail || 'Anonymous')}
${knowledgeContext ? `- **Knowledge:** ${knowledgeContext}` : ''}${episodicContext}${userMemoryContext}${researchContext}

Respond as MOTHER v64.0. Use your tools when needed. Be direct, scientific, and action-oriented.`;

  // v63.0: Multi-turn conversation — inject history between system prompt and current query
  // Scientific basis: OpenAI chat completions multi-turn format (Brown et al., GPT-3, 2020)
  type LLMRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';
  const historyMessages: Array<{ role: LLMRole; content: string }> = conversationHistory.slice(-10).map(m => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as LLMRole,
    content: m.content,
  }));

  // v64.0: Tool Engine — provide tools to the LLM for function calling
  // Scientific basis: OpenAI Function Calling (OpenAI, 2023); ReAct (Yao et al., ICLR 2023)
  const toolCtx = { userEmail, userId, isCreator };

  // v64.0: Always use gpt-4o for tool calling (gpt-4o-mini has limited function calling support)
  const toolModel = 'gpt-4o';
  const llmResponse = await invokeLLM({
    model: toolModel,
    messages: [
      { role: 'system' as LLMRole, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as LLMRole, content: query },
    ],
    tools: MOTHER_TOOLS,
    tool_choice: 'auto',
  });
  
  let response: string;
  let usage = llmResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  // Handle tool calls from the LLM
  const toolCalls = llmResponse.choices[0]?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    console.log(`[MOTHER] Tool calls requested: ${toolCalls.map((t: any) => t.function.name).join(', ')}`);
    
    // Execute all tool calls and collect results
    const toolResults: Array<{ toolName: string; result: string }> = [];
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, any> = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        toolArgs = {};
      }
      const result = await executeTool(toolName, toolArgs, toolCtx);
      toolResults.push({ toolName, result: formatToolResult(toolName, result) });
      console.log(`[MOTHER] Tool ${toolName} executed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }
    
    // Send tool results back to LLM for final response
    const toolResultMessages = toolCalls.map((tc: any, i: number) => ({
      role: 'tool' as LLMRole,
      content: toolResults[i].result,
      tool_call_id: tc.id,
    }));
    
    // Use direct fetch for second call to properly pass tool_calls in assistant message
    // (invokeLLM's normalizeMessage does not support tool_calls field)
    const apiUrl = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    const finalPayload = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: query },
        { role: 'assistant', content: null, tool_calls: toolCalls },
        ...toolResultMessages.map(m => ({ role: 'tool', content: m.content, tool_call_id: (m as any).tool_call_id })),
      ],
      max_tokens: 4096,
    };
    const finalFetch = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify(finalPayload),
    });
    const finalResponse = await finalFetch.json() as any;
    
    const finalContent = finalResponse.choices[0]?.message?.content;
    response = typeof finalContent === 'string' ? finalContent : 'Tool executed but no response generated';
    // Accumulate token usage
    const finalUsage = finalResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    usage = {
      prompt_tokens: usage.prompt_tokens + finalUsage.prompt_tokens,
      completion_tokens: usage.completion_tokens + finalUsage.completion_tokens,
      total_tokens: usage.total_tokens + finalUsage.total_tokens,
    };
  } else {
    const responseContent = llmResponse.choices[0]?.message?.content;
    response = typeof responseContent === 'string' ? responseContent : 'No response generated';
  }
  
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
