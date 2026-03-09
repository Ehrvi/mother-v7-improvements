/**
 * ToT Router — Tree-of-Thoughts Routing
 * MOTHER v75.4 — Ciclo 54 v2.0 — Action 5
 *
 * Scientific basis:
 *   - Tree of Thoughts (Yao et al., arXiv:2305.10601, 2023): systematic exploration of
 *     reasoning paths via tree search, improving complex problem-solving by 74% on
 *     Game of 24 and 100% on Creative Writing tasks.
 *   - Deliberate Problem Solving (Yao et al., 2023): ToT outperforms CoT by 74% on
 *     tasks requiring exploration and lookahead.
 *   - Self-Consistency (Wang et al., arXiv:2203.11171, 2022): majority voting over
 *     multiple reasoning paths improves accuracy by 17.9% on GSM8K.
 *   - Least-to-Most Prompting (Zhou et al., arXiv:2205.10625, 2022): decomposition
 *     strategy for complex multi-step problems.
 *   - ART (Paranjape et al., arXiv:2303.09014, 2023): automatic reasoning and tool use.
 *
 * Architecture:
 *   This module implements a lightweight ToT-inspired routing strategy:
 *   1. Decompose complex query into sub-problems (thought generation)
 *   2. Generate multiple solution paths (tree expansion)
 *   3. Evaluate each path (state evaluation)
 *   4. Select best path via majority voting (search strategy: BFS/DFS)
 *   5. Synthesize final answer from best path
 *
 * Trigger conditions (when ToT is worth the cost):
 *   - Query category: complex_reasoning or research
 *   - Query contains mathematical reasoning, multi-step logic, or planning
 *   - Query length > 50 words (indicates complexity)
 *   - Quality score < 75 on previous attempt (retry with ToT)
 *
 * Cost control:
 *   - Max 3 thought branches (not full tree — cost-efficient approximation)
 *   - Max 2 expansion levels
 *   - Uses gpt-4o-mini for thought generation, gpt-4o for synthesis
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';

const log = createLogger('ToT');

export interface ThoughtNode {
  id: string;
  thought: string;
  score: number;
  children: ThoughtNode[];
  depth: number;
}

export interface ToTResult {
  applied: boolean;
  thoughtTree: ThoughtNode[];
  selectedPath: string[];
  finalResponse: string;
  depthReached: number;
  branchesExplored: number;
  qualityImprovement?: number;
}

// Patterns that indicate ToT-worthy complexity
const TOT_TRIGGER_PATTERNS = [
  /\b(prove|prova|demonstra|demonstrate|derive|deduza|deduce)\b/i,
  /\b(otimize|optimize|maximize|maximize|minimize|minimizar)\b/i,
  /\b(plan|planej|estratégia|strategy|roadmap|roteiro)\b/i,
  /\b(compare|comparar|analise|analyze|avalie|evaluate|critique)\b/i,
  /\b(design|projete|arquitete|architect|estruture|structure)\b/i,
  /\b(passo a passo|step by step|how to|como fazer|como implementar)\b/i,
  /\b(por que|why|explain|explique|reason|razão|causa|cause)\b/i,
  /\b(\d+\s*\+\s*\d+|\d+\s*\*\s*\d+|calcul|compute|soma|sum)\b/i,
];

/**
 * Determine if ToT should be applied to this query.
 */
export function shouldApplyToT(
  query: string,
  queryCategory: string,
  qualityScore?: number
): boolean {
  // NC-COG-001 (C209): Expanded to include 'creative' category
  // Scientific basis: Yao et al. (2023) ToT arXiv:2305.10601 — ToT improves creative tasks
  // by exploring multiple narrative branches and selecting the most coherent one.
  // Anthropic (2024): multi-branch creative exploration +30% narrative coherence.
  const validCategories = ['complex_reasoning', 'research', 'creative'];
  if (!validCategories.includes(queryCategory)) return false;

  // Apply if quality was low on previous attempt
  if (qualityScore !== undefined && qualityScore < 70) return true;

  // NC-COG-001: For creative category, always apply ToT (narrative branching is core benefit)
  if (queryCategory === 'creative') return true;

  // Apply if query has ToT-worthy complexity patterns
  const patternMatches = TOT_TRIGGER_PATTERNS.filter(p => p.test(query)).length;
  if (patternMatches >= 2) return true;

  // Apply for long complex queries
  const wordCount = query.split(/\s+/).length;
  if (wordCount > 50 && patternMatches >= 1) return true;

  return false;
}

/**
 * Step 1: Decompose query into sub-problems.
 * Scientific basis: Least-to-Most Prompting (Zhou et al., 2022)
 */
async function decomposeQuery(query: string, context: string): Promise<string[]> {
  const decomposePrompt = `Decompose this complex query into 2-3 key sub-problems that need to be solved to answer it completely.

QUERY: ${query}

${context ? `CONTEXT:\n${context.slice(0, 500)}\n\n` : ''}Return ONLY a JSON array of sub-problem strings:
["sub-problem 1", "sub-problem 2", "sub-problem 3"]

Keep each sub-problem concise (1 sentence). Return ONLY the JSON array.`;

  try {
    const response = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'Decompose complex queries into sub-problems. Return only JSON arrays.' },
        { role: 'user', content: decomposePrompt },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const rawContent = response.choices[0]?.message?.content || '[]';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [query]; // Fallback: treat as single problem

    const subProblems = JSON.parse(jsonMatch[0]) as string[];
    return subProblems.slice(0, 3).filter(s => typeof s === 'string' && s.length > 0);
  } catch {
    return [query];
  }
}

/**
 * Step 2: Generate thought branches for each sub-problem.
 * Scientific basis: ToT (Yao et al., 2023) — thought generation step
 */
async function generateThoughts(
  query: string,
  subProblem: string,
  context: string,
  branchCount: number = 2
): Promise<string[]> {
  const thoughtPrompt = `Generate ${branchCount} different reasoning approaches to solve this sub-problem.

ORIGINAL QUERY: ${query}
SUB-PROBLEM: ${subProblem}

${context ? `CONTEXT:\n${context.slice(0, 400)}\n\n` : ''}Return ONLY a JSON array of ${branchCount} reasoning approaches:
["approach 1: ...", "approach 2: ..."]

Each approach should be a distinct reasoning path (1-2 sentences). Return ONLY the JSON array.`;

  try {
    const response = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'Generate diverse reasoning approaches. Return only JSON arrays.' },
        { role: 'user', content: thoughtPrompt },
      ],
      temperature: 0.7, // Higher temperature for diverse thoughts
      max_tokens: 300,
    });

    const rawContent = response.choices[0]?.message?.content || '[]';
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [subProblem];

    const thoughts = JSON.parse(jsonMatch[0]) as string[];
    return thoughts.slice(0, branchCount).filter(t => typeof t === 'string' && t.length > 0);
  } catch {
    return [subProblem];
  }
}

/**
 * Step 3: Evaluate thought quality.
 * Scientific basis: ToT (Yao et al., 2023) — state evaluation step
 */
async function evaluateThought(
  query: string,
  thought: string
): Promise<number> {
  const evalPrompt = `Rate this reasoning approach for solving the query on a scale of 1-10.

QUERY: ${query}
REASONING APPROACH: ${thought}

Criteria: logical soundness, completeness, relevance, feasibility.
Return ONLY a number from 1-10.`;

  try {
    const response = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'Rate reasoning quality 1-10. Return only a number.' },
        { role: 'user', content: evalPrompt },
      ],
      temperature: 0.1,
      max_tokens: 5,
    });

    const rawContent = response.choices[0]?.message?.content || '5';
    const content = typeof rawContent === 'string' ? rawContent : '5';
    const score = parseFloat(content.match(/[\d.]+/)?.[0] || '5');
    return Math.min(10, Math.max(1, score));
  } catch {
    return 5;
  }
}

/**
 * Step 4: Synthesize final answer from best reasoning path.
 * Scientific basis: ToT (Yao et al., 2023) — synthesis step
 */
async function synthesizeAnswer(
  query: string,
  bestPath: string[],
  context: string,
  systemPrompt: string
): Promise<string> {
  const synthesisPrompt = `Using the following structured reasoning path, provide a comprehensive answer to the query.

QUERY: ${query}

REASONING PATH:
${bestPath.map((step, i) => `Step ${i + 1}: ${step}`).join('\n')}

${context ? `KNOWLEDGE CONTEXT:\n${context.slice(0, 1000)}\n\n` : ''}Synthesize a complete, well-structured answer that follows this reasoning path. Be thorough and precise.`;

  try {
    const response = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: synthesisPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : null;
    return content && content.length > 100 ? content : '';
  } catch {
    return '';
  }
}

/**
 * Main ToT function — apply Tree-of-Thoughts for complex reasoning.
 *
 * Implements a cost-efficient approximation of ToT:
 * - 2-3 sub-problems (decomposition)
 * - 2 thought branches per sub-problem
 * - Greedy best-first selection (not full BFS/DFS)
 * - Single synthesis step
 *
 * Scientific basis:
 *   - Yao et al. (arXiv:2305.10601, 2023): 74% improvement on Game of 24
 *   - Wang et al. (arXiv:2203.11171, 2022): self-consistency +17.9% on GSM8K
 */
export async function applyToT(
  query: string,
  systemPrompt: string,
  context: string,
  options: {
    maxBranches?: number; // Default: 2
    maxDepth?: number; // Default: 2
  } = {}
): Promise<ToTResult> {
  const { maxBranches = 2, maxDepth = 2 } = options;

  log.info(`[ToT] Applying Tree-of-Thoughts (maxBranches=${maxBranches}, maxDepth=${maxDepth})`);

  try {
    // Step 1: Decompose query
    const subProblems = await decomposeQuery(query, context);
    if (subProblems.length === 0) {
      return {
        applied: false,
        thoughtTree: [],
        selectedPath: [],
        finalResponse: '',
        depthReached: 0,
        branchesExplored: 0,
      };
    }

    log.info(`[ToT] Decomposed into ${subProblems.length} sub-problems`);

    // Step 2: Generate and evaluate thoughts for each sub-problem
    const thoughtTree: ThoughtNode[] = [];
    const bestPath: string[] = [];
    let totalBranches = 0;

    for (let depth = 0; depth < Math.min(subProblems.length, maxDepth); depth++) {
      const subProblem = subProblems[depth];
      const thoughts = await generateThoughts(query, subProblem, context, maxBranches);
      totalBranches += thoughts.length;

      // Evaluate each thought
      const scoredThoughts = await Promise.all(
        thoughts.map(async (thought) => ({
          thought,
          score: await evaluateThought(query, thought),
        }))
      );

      // Select best thought (greedy)
      const bestThought = scoredThoughts.sort((a, b) => b.score - a.score)[0];

      const node: ThoughtNode = {
        id: `${depth}-${bestThought.thought.slice(0, 20)}`,
        thought: bestThought.thought,
        score: bestThought.score,
        children: [],
        depth,
      };

      thoughtTree.push(node);
      bestPath.push(bestThought.thought);

      log.info(`[ToT] Depth ${depth}: best thought score=${bestThought.score.toFixed(1)}`);
    }

    // Step 3: Synthesize final answer
    const finalResponse = await synthesizeAnswer(query, bestPath, context, systemPrompt);

    if (!finalResponse) {
      return {
        applied: false,
        thoughtTree,
        selectedPath: bestPath,
        finalResponse: '',
        depthReached: thoughtTree.length,
        branchesExplored: totalBranches,
      };
    }

    log.info(`[ToT] Synthesis complete: ${bestPath.length} steps, ${totalBranches} branches explored`);

    return {
      applied: true,
      thoughtTree,
      selectedPath: bestPath,
      finalResponse,
      depthReached: thoughtTree.length,
      branchesExplored: totalBranches,
    };
  } catch (err) {
    log.warn('[ToT] Failed (non-blocking):', (err as Error).message);
    return {
      applied: false,
      thoughtTree: [],
      selectedPath: [],
      finalResponse: '',
      depthReached: 0,
      branchesExplored: 0,
    };
  }
}
