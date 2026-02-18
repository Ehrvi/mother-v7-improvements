/**
 * MOTHER v7.0 - Complete System Integration
 * Orchestrates all 7 layers for end-to-end query processing
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
import { insertQuery, getCacheEntry, insertCacheEntry } from '../db';
import { createHash } from 'crypto';

export interface MotherRequest {
  query: string;
  userId?: number;
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
  
  const { query, userId, useCache = true } = request;
  
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
  
  // ==================== LAYER 4: EXECUTION ====================
  // Execute query with selected LLM tier
  
  const model = getModelForTier(complexity.tier);
  const systemPrompt = `You are MOTHER (Multi-Operational Tiered Hierarchical Execution & Routing), an advanced AI system designed for optimal cost-quality balance.

Your responses should be:
- Complete and comprehensive
- Accurate and factual
- Relevant to the query
- Coherent and well-structured
- Safe and ethical

${knowledgeContext ? `Use the following knowledge context when relevant:\n${knowledgeContext}` : ''}`;

  // Note: invokeLLM uses default model (gpt-4o-mini)
  // Tier routing is simulated for demonstration
  // In production: use different API keys/endpoints for different tiers
  const llmResponse = await invokeLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
  });
  
  const responseContent = llmResponse.choices[0]?.message?.content;
  const response = typeof responseContent === 'string' ? responseContent : 'No response generated';
  const usage = llmResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  
  // ==================== LAYER 6: QUALITY (GUARDIAN) ====================
  // Validate response quality
  
  const quality = validateQuality(query, response, 1); // Phase 1: 3 checks
  console.log(`[MOTHER] Quality Score: ${quality.qualityScore}/100 (${quality.passed ? 'PASSED' : 'FAILED'})`);
  
  if (!quality.passed) {
    console.warn('[MOTHER] Quality check failed:', quality.issues);
  }
  
  // ==================== LAYER 7: LEARNING/METRICS ====================
  // Calculate metrics and costs
  
  const cost = calculateCost(complexity.tier, usage.prompt_tokens, usage.completion_tokens);
  const baselineCost = calculateBaselineCost(usage.prompt_tokens, usage.completion_tokens);
  const costReduction = calculateCostReduction(cost, baselineCost);
  const responseTime = Date.now() - startTime;
  
  console.log(`[MOTHER] Cost: $${cost.toFixed(6)} (${costReduction.toFixed(1)}% reduction vs baseline)`);
  console.log(`[MOTHER] Response Time: ${responseTime}ms`);
  
  // ==================== PERSISTENCE ====================
  // Store query log for learning
  
  const queryId = await insertQuery({
    userId: userId || null,
    query,
    response,
    tier: complexity.tier,
    complexityScore: complexity.complexityScore.toString(),
    confidenceScore: complexity.confidenceScore.toString(),
    qualityScore: quality.qualityScore.toString(),
    completenessScore: quality.completenessScore.toString(),
    accuracyScore: quality.accuracyScore.toString(),
    relevanceScore: quality.relevanceScore.toString(),
    coherenceScore: quality.coherenceScore?.toString() || null,
    safetyScore: quality.safetyScore?.toString() || null,
    responseTime,
    tokensUsed: usage.total_tokens,
    cost: cost.toString(),
    cacheHit: 0,
  });
  
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
    
    await insertCacheEntry({
      queryHash,
      query,
      response: JSON.stringify(cacheData),
      embedding: null,
      hitCount: 0,
      lastHit: null,
      ttl: 86400, // 24 hours in seconds
      expiresAt,
    });
  }
  
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
    queryId,
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
