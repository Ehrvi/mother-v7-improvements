/**
 * MOTHER v45.0: Group-Evolving Agents (GEA) Supervisor
 *
 * Scientific basis: Group-Evolving Agents (Weng et al., arXiv:2602.04837)
 *
 * Key innovation over tree-structured DGM (v41.0-v44.0):
 * - Treats a GROUP of agents as the fundamental evolutionary unit
 * - Enables explicit experience sharing and reuse within the group
 * - Performance-Novelty criterion for parent selection
 * - Shared experience pool: all children benefit from all parents' discoveries
 *
 * Architecture:
 * - AgentPool: N=5 agents maintained in gea_agent_pool table
 * - ParentSelection: top-K=3 by Performance-Novelty score
 * - ExperiencePool: shared strategies from all parents → shared_experience table
 * - ChildGeneration: new agents synthesize from the shared experience pool
 *
 * Result: 71.0% vs 56.7% on SWE-bench Verified (GEA vs tree-structured DGM)
 */

import { getDb } from '../db';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { invokeSupervisor } from './supervisor';

const POOL_SIZE = 5;
const PARENT_K = 3;
const NOVELTY_WEIGHT = 0.3; // Performance-Novelty: 70% performance, 30% novelty

/**
 * GEA Agent representation
 */
export interface GEAAgent {
  id: string;
  generationId: string;
  parentIds: string[];
  fitnessScore: number;
  noveltyScore: number;
  performanceNoveltyScore: number;
  strategies: string[]; // Learned strategies/tools
  createdAt: Date;
}

/**
 * Shared Experience Entry
 */
export interface SharedExperience {
  id: number;
  sourceAgentId: string;
  experienceType: 'strategy' | 'tool' | 'workflow' | 'insight';
  content: string;
  fitnessImpact: number;
  usageCount: number;
  createdAt: Date;
}

/**
 * Calculate novelty score for an agent relative to the pool
 * Novelty = average Jaccard distance from all other agents in strategy space
 */
async function calculateNoveltyScore(
  agentStrategies: string[],
  poolAgents: GEAAgent[]
): Promise<number> {
  if (poolAgents.length === 0) return 1.0;

  const agentStrategySet = new Set(agentStrategies);
  let totalNovelty = 0;

  for (const poolAgent of poolAgents) {
    const poolStrategySet = new Set(poolAgent.strategies);
    // Count intersection manually to avoid downlevelIteration requirement
    let intersectionCount = 0;
    agentStrategies.forEach(s => { if (poolStrategySet.has(s)) intersectionCount++; });
    const unionCount = agentStrategySet.size + poolStrategySet.size - intersectionCount;
    const jaccardSimilarity = unionCount > 0 ? intersectionCount / unionCount : 0;
    totalNovelty += (1 - jaccardSimilarity);
  }

  return totalNovelty / poolAgents.length;
}

/**
 * Get the current agent pool from the database
 */
export async function getAgentPool(): Promise<GEAAgent[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const rows = await (db as any).$client.query(
      `SELECT * FROM gea_agent_pool ORDER BY performance_novelty_score DESC LIMIT ${POOL_SIZE}`
    );
    const rowData = Array.isArray(rows[0]) ? rows[0] : [];
    return rowData.map((row: any) => ({
      id: row.agent_id,
      generationId: row.generation_id,
      parentIds: row.parent_ids ? JSON.parse(row.parent_ids) : [],
      fitnessScore: row.fitness_score || 0,
      noveltyScore: row.novelty_score || 0,
      performanceNoveltyScore: row.performance_novelty_score || 0,
      strategies: row.strategies ? JSON.parse(row.strategies) : [],
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[GEA] Error getting agent pool:', error);
    return [];
  }
}

/**
 * Get shared experience pool from top-K parents
 */
async function getSharedExperiencePool(parentIds: string[]): Promise<SharedExperience[]> {
  const db = await getDb();
  if (!db || parentIds.length === 0) return [];

  try {
    const placeholders = parentIds.map(() => '?').join(',');
    const rows = await (db as any).$client.query(
      `SELECT * FROM shared_experience 
       WHERE source_agent_id IN (${placeholders}) 
       ORDER BY fitness_impact DESC, usage_count DESC 
       LIMIT 20`,
      parentIds
    );
    const rowData = Array.isArray(rows[0]) ? rows[0] : [];
    return rowData.map((row: any) => ({
      id: row.id,
      sourceAgentId: row.source_agent_id,
      experienceType: row.experience_type,
      content: row.content,
      fitnessImpact: row.fitness_impact,
      usageCount: row.usage_count,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[GEA] Error getting shared experience pool:', error);
    return [];
  }
}

/**
 * Select top-K parents using Performance-Novelty criterion
 * Score = (1 - NOVELTY_WEIGHT) * fitness + NOVELTY_WEIGHT * novelty
 */
export async function selectParents(pool: GEAAgent[]): Promise<GEAAgent[]> {
  if (pool.length === 0) return [];

  // Recalculate novelty scores relative to the current pool
  const agentsWithNovelty = await Promise.all(
    pool.map(async (agent) => {
      const otherAgents = pool.filter(a => a.id !== agent.id);
      const novelty = await calculateNoveltyScore(agent.strategies, otherAgents);
      const performanceNoveltyScore =
        (1 - NOVELTY_WEIGHT) * agent.fitnessScore + NOVELTY_WEIGHT * novelty;
      return { ...agent, noveltyScore: novelty, performanceNoveltyScore };
    })
  );

  // Sort by Performance-Novelty score and take top-K
  agentsWithNovelty.sort((a, b) => b.performanceNoveltyScore - a.performanceNoveltyScore);
  const parents = agentsWithNovelty.slice(0, Math.min(PARENT_K, agentsWithNovelty.length));

  console.log(`[GEA] Selected ${parents.length} parents:`,
    parents.map(p => `${p.id.slice(0, 8)} (fitness=${p.fitnessScore.toFixed(2)}, novelty=${p.noveltyScore.toFixed(2)})`));

  return parents;
}

/**
 * Extract strategies from a completed evolution run using LLM
 */
async function extractStrategies(runId: string, goal: string): Promise<string[]> {
  const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0 });

  try {
    const response = await llm.invoke([
      new HumanMessage(`
You are analyzing a completed AI agent evolution run. Extract 3-5 key strategies or insights that contributed to success.

Goal: ${goal}
Run ID: ${runId}

Return a JSON array of strategy strings. Each strategy should be a concise, reusable description.
Example: ["Use TypeScript strict mode for type safety", "Implement retry logic with exponential backoff"]

Return ONLY the JSON array, no other text.
      `)
    ]);

    const content = response.content.toString().trim();
    const strategies = JSON.parse(content);
    return Array.isArray(strategies) ? strategies : [];
  } catch (error) {
    console.error('[GEA] Error extracting strategies:', error);
    return [`Completed goal: ${goal.slice(0, 100)}`];
  }
}

/**
 * Store a new agent in the pool
 */
async function storeAgentInPool(
  agentId: string,
  generationId: string,
  parentIds: string[],
  fitnessScore: number,
  noveltyScore: number,
  strategies: string[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const performanceNoveltyScore =
    (1 - NOVELTY_WEIGHT) * fitnessScore + NOVELTY_WEIGHT * noveltyScore;

  try {
    await (db as any).$client.query(
      `INSERT INTO gea_agent_pool 
       (agent_id, generation_id, parent_ids, fitness_score, novelty_score, performance_novelty_score, strategies, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       fitness_score = VALUES(fitness_score),
       novelty_score = VALUES(novelty_score),
       performance_novelty_score = VALUES(performance_novelty_score),
       strategies = VALUES(strategies)`,
      [agentId, generationId, JSON.stringify(parentIds), fitnessScore, noveltyScore,
        performanceNoveltyScore, JSON.stringify(strategies)]
    );

    console.log(`[GEA] Agent ${agentId.slice(0, 8)} stored in pool (fitness=${fitnessScore.toFixed(2)}, novelty=${noveltyScore.toFixed(2)}, pn=${performanceNoveltyScore.toFixed(2)})`);

    // Prune pool to maintain POOL_SIZE
    await (db as any).$client.query(
      `DELETE FROM gea_agent_pool WHERE agent_id NOT IN (
        SELECT agent_id FROM (
          SELECT agent_id FROM gea_agent_pool ORDER BY performance_novelty_score DESC LIMIT ${POOL_SIZE}
        ) AS top_agents
      )`
    );
  } catch (error) {
    console.error('[GEA] Error storing agent in pool:', error);
  }
}

/**
 * Store shared experience from a successful agent
 */
async function storeSharedExperience(
  agentId: string,
  strategies: string[],
  fitnessScore: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    for (const strategy of strategies) {
      await (db as any).$client.query(
        `INSERT INTO shared_experience 
         (source_agent_id, experience_type, content, fitness_impact, usage_count, created_at)
         VALUES (?, 'strategy', ?, ?, 0, NOW())`,
        [agentId, strategy, fitnessScore]
      );
    }
    console.log(`[GEA] Stored ${strategies.length} shared experiences from agent ${agentId.slice(0, 8)}`);
  } catch (error) {
    console.error('[GEA] Error storing shared experience:', error);
  }
}

/**
 * Generate an enhanced goal using the shared experience pool
 * This is the core GEA innovation: children benefit from all parents' discoveries
 */
async function generateEnhancedGoal(
  baseGoal: string,
  sharedExperiences: SharedExperience[]
): Promise<string> {
  if (sharedExperiences.length === 0) return baseGoal;

  const experienceSummary = sharedExperiences
    .slice(0, 10)
    .map(e => `- [fitness_impact: ${e.fitnessImpact.toFixed(2)}] ${e.content}`)
    .join('\n');

  const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0.3 });

  try {
    const response = await llm.invoke([
      new HumanMessage(`
You are enhancing an AI agent's goal with shared experience from a group of parent agents.

Original Goal: ${baseGoal}

Shared Experience Pool (strategies that worked well):
${experienceSummary}

Create an enhanced version of the goal that incorporates the most relevant strategies from the experience pool.
Keep the core objective the same but add specific implementation guidance based on what worked before.
Return ONLY the enhanced goal text, no other text.
      `)
    ]);

    const enhanced = response.content.toString().trim();
    console.log(`[GEA] Enhanced goal with ${sharedExperiences.length} shared experiences`);
    return enhanced;
  } catch (error) {
    console.error('[GEA] Error generating enhanced goal:', error);
    return baseGoal;
  }
}

/**
 * Main GEA Evolution Loop
 *
 * Implements the GEA paradigm (arXiv:2602.04837):
 * 1. Get current agent pool
 * 2. Select top-K parents by Performance-Novelty criterion
 * 3. Aggregate experience from all parents into shared pool
 * 4. Generate enhanced goal using shared experience
 * 5. Execute evolution run with enhanced goal
 * 6. Extract strategies from result
 * 7. Store new agent in pool with novelty score
 * 8. Share successful experiences back to pool
 */
export async function invokeGEASupervisor(
  baseGoal: string,
  runId: string
): Promise<void> {
  console.log(`[GEA] Starting GEA evolution loop for run ${runId}`);
  console.log(`[GEA] Base goal: ${baseGoal.slice(0, 100)}...`);

  try {
    // Step 1: Get current agent pool
    const pool = await getAgentPool();
    console.log(`[GEA] Current pool size: ${pool.length}/${POOL_SIZE}`);

    // Step 2: Select parents by Performance-Novelty criterion
    const parents = await selectParents(pool);
    const parentIds = parents.map(p => p.id);

    // Step 3: Get shared experience from parents
    const sharedExperiences = await getSharedExperiencePool(parentIds);
    console.log(`[GEA] Retrieved ${sharedExperiences.length} shared experiences from ${parents.length} parents`);

    // Step 4: Generate enhanced goal using shared experience pool
    const enhancedGoal = await generateEnhancedGoal(baseGoal, sharedExperiences);

    // Step 5: Execute evolution run with enhanced goal (using existing DGM supervisor)
    console.log(`[GEA] Invoking DGM supervisor with enhanced goal...`);
    const result = await invokeSupervisor(enhancedGoal, runId);

    // Step 6: Extract fitness score from result
    const lastMessage = result.messages?.[result.messages.length - 1];
    const messageContent = lastMessage?.content?.toString() || '';

    // Parse fitness score from ValidationAgent output
    const fitnessMatch = messageContent.match(/fitness[_\s]score[:\s]+([0-9.]+)/i) ||
      messageContent.match(/score[:\s]+([0-9.]+)/i);
    const fitnessScore = fitnessMatch ? parseFloat(fitnessMatch[1]) : 0.5;

    // Step 7: Extract strategies from the run
    const strategies = await extractStrategies(runId, baseGoal);

    // Step 8: Calculate novelty and store agent in pool
    const noveltyScore = await calculateNoveltyScore(strategies, pool);
    await storeAgentInPool(runId, runId, parentIds, fitnessScore, noveltyScore, strategies);

    // Step 9: If fitness is good, share experience back to pool
    if (fitnessScore > 0.6) {
      await storeSharedExperience(runId, strategies, fitnessScore);
      console.log(`[GEA] High-fitness agent (${fitnessScore.toFixed(2)}) shared ${strategies.length} experiences`);
    }

    console.log(`[GEA] Evolution complete: fitness=${fitnessScore.toFixed(2)}, novelty=${noveltyScore.toFixed(2)}, strategies=${strategies.length}`);

  } catch (error) {
    console.error(`[GEA] Evolution error for run ${runId}:`, error);
    throw error;
  }
}
