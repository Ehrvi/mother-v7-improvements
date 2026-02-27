/**
 * MOTHER v75.0: Multi-LLM Orchestration — NC-ORCH-001 + NC-ORCH-002
 *
 * Implements two advanced orchestration patterns for maximum quality:
 *
 * 1. Mixture of Agents (MoA) — NC-ORCH-001
 *    Multiple LLMs generate responses in parallel, then an aggregator
 *    synthesizes the best elements from all responses.
 *    Scientific basis: Wang et al. (arXiv:2406.04692, 2024) — MoA achieves
 *    65.1% on AlpacaEval 2.0, surpassing GPT-4o (57.5%) using open-source models.
 *    Key insight: "LLMs tend to generate better responses when they can see
 *    other models' outputs, even if those models are weaker."
 *
 * 2. Multi-Agent Debate — NC-ORCH-002
 *    Two LLMs debate a topic for N rounds, then a judge synthesizes.
 *    Scientific basis: Du et al. (arXiv:2305.14325, 2023) — Society of Mind:
 *    debate improves factual accuracy by 11% on arithmetic and reasoning tasks.
 *    Liang et al. (arXiv:2305.19118, 2023) — debate reduces hallucination by 15%.
 *
 * Routing logic:
 * - MoA: triggered for complex_reasoning and research queries (complexity > 0.7)
 * - Debate: triggered for ambiguous queries or when Guardian score < 70
 * - Single model: simple/general/coding queries (cost optimization)
 *
 * Cost management:
 * - MoA uses 3 models: DeepSeek + Gemini + Claude (proposers) + GPT-4o (aggregator)
 * - Debate uses 2 models: Claude (proposer 1) + GPT-4o (proposer 2) + Gemini (judge)
 * - Both patterns are ~3-4x more expensive than single model
 * - Only triggered for queries where quality gain justifies cost
 */
import { invokeLLM, type InvokeResult } from '../_core/llm';
import { createLogger } from '../_core/logger';

// Helper to extract text content from InvokeResult
function extractContent(result: InvokeResult): string {
  const msg = result.choices?.[0]?.message;
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((c: any) => (typeof c === 'string' ? c : c.text || c.value || ''))
      .join('');
  }
  return '';
}

const log = createLogger('ORCHESTRATION');

// ── Types ─────────────────────────────────────────────────────────────────────
export interface OrchestrationResult {
  response: string;
  pattern: 'moa' | 'debate' | 'single';
  proposerResponses?: string[];
  debateRounds?: Array<{ round: number; model1: string; model2: string }>;
  aggregatorModel: string;
  totalTokens?: number;
  qualityGain?: number; // estimated quality improvement vs single model
}

export interface OrchestrationContext {
  query: string;
  systemPrompt: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  knowledgeContext?: string;
}

// ── Routing: When to use MoA vs Debate vs Single ──────────────────────────────
export function shouldUseMoA(complexityScore: number, category: string): boolean {
  // MoA for complex/research queries with high complexity
  // Scientific basis: Wang et al. (2024) — MoA benefits most on complex tasks
  return (
    (category === 'complex_reasoning' || category === 'research') &&
    complexityScore >= 0.7
  );
}

export function shouldUseDebate(query: string, guardianScore?: number): boolean {
  // Debate for ambiguous queries or low Guardian scores
  // Scientific basis: Du et al. (2023) — debate most effective for ambiguous/controversial topics
  if (guardianScore !== undefined && guardianScore < 70) return true;

  const debateTriggers = [
    /qual.*melhor/i,
    /compare/i,
    /diferença.*entre/i,
    /vantagem.*desvantagem/i,
    /prós.*contras/i,
    /verdade.*ou/i,
    /correto.*ou/i,
    /deveria/i,
    /recomenda/i,
    /versus|vs\./i,
  ];
  return debateTriggers.some(p => p.test(query));
}

// ── Mixture of Agents (MoA) ───────────────────────────────────────────────────
/**
 * MoA: 3 proposers in parallel → 1 aggregator synthesizes.
 *
 * Proposers (parallel, ~same cost as single GPT-4o call):
 * - DeepSeek V3: factual grounding, cost efficiency
 * - Gemini 2.5 Flash: reasoning, multimodal understanding
 * - Claude Sonnet 4.5: nuanced analysis, safety
 *
 * Aggregator (sequential):
 * - GPT-4o: synthesizes the best elements from all 3 responses
 *
 * Scientific basis: Wang et al. (arXiv:2406.04692, 2024)
 * "The aggregator sees all proposer outputs and synthesizes a response
 * that is consistently better than any individual proposer."
 */
export async function runMoA(ctx: OrchestrationContext): Promise<OrchestrationResult> {
  log.info('MoA orchestration started', { query: ctx.query.slice(0, 80) });

  const proposerConfigs = [
    { provider: 'deepseek' as const, model: 'deepseek-chat', role: 'Factual Grounding Specialist' },
    { provider: 'google' as const, model: 'gemini-2.5-flash', role: 'Reasoning and Analysis Specialist' },
    { provider: 'anthropic' as const, model: 'claude-sonnet-4-5', role: 'Nuanced Analysis Specialist' },
  ];

  // Run all 3 proposers in parallel
  const proposerPromises = proposerConfigs.map(async (config) => {
    try {
      const response = await invokeLLM({
        provider: config.provider,
        model: config.model,
        messages: [
          {
            role: 'system',
            content: `${ctx.systemPrompt}\n\nYou are the ${config.role} in a Mixture of Agents system. Provide your best, most detailed response. Your response will be synthesized with other specialists' responses.${ctx.knowledgeContext ? `\n\nKnowledge context:\n${ctx.knowledgeContext}` : ''}`,
          },
          ...(ctx.conversationHistory || []),
          { role: 'user', content: ctx.query },
        ],
      });
      return extractContent(response);
    } catch (err) {
      log.warn(`MoA proposer ${config.provider} failed`, { error: String(err) });
      return null;
    }
  });

  const proposerResults = await Promise.all(proposerPromises) as (InvokeResult | null)[];
  const validResponses = proposerResults.filter((r): r is InvokeResult => r !== null).map(extractContent);

  if (validResponses.length === 0) {
    throw new Error('All MoA proposers failed');
  }

  // Aggregator: GPT-4o synthesizes the best elements
  const aggregatorPrompt = `You are the Aggregator in a Mixture of Agents (MoA) system.
You have received ${validResponses.length} independent responses from specialist AI models.
Your task: synthesize the BEST elements from all responses into a single, superior response.

Rules:
1. Include ALL important information from any proposer
2. Resolve contradictions by choosing the most accurate/well-reasoned position
3. Improve clarity and structure beyond any individual response
4. Cite the source of key insights as [Proposer 1], [Proposer 2], [Proposer 3]
5. The final response must be BETTER than any individual proposer

${validResponses.map((r, i) => `=== PROPOSER ${i + 1} RESPONSE ===\n${r}`).join('\n\n')}

=== SYNTHESIZED RESPONSE ===`;

  const aggregatedResponse = await invokeLLM({
    provider: 'openai',
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `${ctx.systemPrompt}\n\nYou are the MoA Aggregator. Synthesize the proposer responses into the best possible answer.`,
      },
      { role: 'user', content: aggregatorPrompt },
    ],
  });

  log.info('MoA completed', { proposers: validResponses.length, aggregator: 'gpt-4o' });

  return {
    response: extractContent(aggregatedResponse),
    pattern: 'moa',
    proposerResponses: validResponses,
    aggregatorModel: 'gpt-4o',
    qualityGain: 15, // ~15% quality improvement based on Wang et al. (2024)
  };
}

// ── Multi-Agent Debate ────────────────────────────────────────────────────────
/**
 * Debate: 2 agents argue for N rounds → judge synthesizes.
 *
 * Agent 1 (Claude Sonnet 4.5): Initial position
 * Agent 2 (GPT-4o): Counter-position + critique
 * Rounds: 2 (default) — each agent responds to the other
 * Judge (Gemini 2.5 Flash): Synthesizes the debate into final answer
 *
 * Scientific basis: Du et al. (arXiv:2305.14325, 2023)
 * "When models are encouraged to debate, they are more likely to
 * converge on correct answers and less likely to hallucinate."
 */
export async function runDebate(
  ctx: OrchestrationContext,
  rounds = 2
): Promise<OrchestrationResult> {
  log.info('Debate orchestration started', { query: ctx.query.slice(0, 80), rounds });

  const debateHistory: Array<{ round: number; model1: string; model2: string }> = [];
  let agent1Messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let agent2Messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  const systemBase = `${ctx.systemPrompt}${ctx.knowledgeContext ? `\n\nKnowledge context:\n${ctx.knowledgeContext}` : ''}`;

  // Round 0: Initial responses
  const [agent1Initial, agent2Initial] = await Promise.all([
    invokeLLM({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      messages: [
        { role: 'system', content: `${systemBase}\n\nYou are Agent 1 in a multi-agent debate. Provide your initial, well-reasoned response. Be thorough and cite evidence.` },
        ...(ctx.conversationHistory || []),
        { role: 'user', content: ctx.query },
      ],
    }),
    invokeLLM({
      provider: 'openai',
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `${systemBase}\n\nYou are Agent 2 in a multi-agent debate. Provide your initial, well-reasoned response. Be thorough and cite evidence.` },
        ...(ctx.conversationHistory || []),
        { role: 'user', content: ctx.query },
      ],
    }),
  ]);

  agent1Messages.push({ role: 'assistant', content: extractContent(agent1Initial) });
  agent2Messages.push({ role: 'assistant', content: extractContent(agent2Initial) });

  // Debate rounds
  for (let round = 1; round <= rounds; round++) {
    const [agent1Reply, agent2Reply] = await Promise.all([
      invokeLLM({
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: `${systemBase}\n\nYou are Agent 1 in round ${round} of a debate. Review Agent 2's response and either defend your position with new evidence, concede valid points, or refine your answer.` },
          { role: 'user', content: ctx.query },
          ...agent1Messages,
          { role: 'user', content: `Agent 2 responded: "${agent2Messages[agent2Messages.length - 1].content}"\n\nYour response:` },
        ],
      }),
      invokeLLM({
        provider: 'openai',
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: `${systemBase}\n\nYou are Agent 2 in round ${round} of a debate. Review Agent 1's response and either defend your position with new evidence, concede valid points, or refine your answer.` },
          { role: 'user', content: ctx.query },
          ...agent2Messages,
          { role: 'user', content: `Agent 1 responded: "${agent1Messages[agent1Messages.length - 1].content}"\n\nYour response:` },
        ],
      }),
    ]);

    agent1Messages.push({ role: 'assistant', content: extractContent(agent1Reply) });
    agent2Messages.push({ role: 'assistant', content: extractContent(agent2Reply) });
    debateHistory.push({ round, model1: extractContent(agent1Reply).slice(0, 100), model2: extractContent(agent2Reply).slice(0, 100) });
  }

  // Judge synthesizes
  const judgePrompt = `You are the Judge in a multi-agent debate.
Two AI agents have debated the following question:
"${ctx.query}"

=== AGENT 1 (Claude) FINAL POSITION ===
${agent1Messages[agent1Messages.length - 1].content}

=== AGENT 2 (GPT-4o) FINAL POSITION ===
${agent2Messages[agent2Messages.length - 1].content}

Your task: Synthesize the debate into the most accurate, complete, and balanced final answer.
- Accept valid points from both agents
- Resolve contradictions by choosing the better-supported position
- Add any important nuances that both agents may have missed
- Provide a definitive, high-quality response`;

  const judgeResponse = await invokeLLM({
    provider: 'google',
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: `${systemBase}\n\nYou are the Judge in a multi-agent debate. Synthesize the best answer from both agents.` },
      { role: 'user', content: judgePrompt },
    ],
  });

  log.info('Debate completed', { rounds, judge: 'gemini-2.5-flash' });

  return {
    response: extractContent(judgeResponse),
    pattern: 'debate',
    debateRounds: debateHistory,
    aggregatorModel: 'gemini-2.5-flash',
    qualityGain: 11, // ~11% factual accuracy improvement based on Du et al. (2023)
  };
}

// ── Main Orchestration Entry Point ────────────────────────────────────────────
/**
 * Decide which orchestration pattern to use and execute it.
 * Called by core.ts for complex_reasoning and research queries.
 */
export async function orchestrate(
  ctx: OrchestrationContext,
  options: {
    complexityScore?: number;
    category?: string;
    guardianScore?: number;
    forceMoA?: boolean;
    forceDebate?: boolean;
  } = {}
): Promise<OrchestrationResult> {
  const { complexityScore = 0.5, category = 'general', guardianScore, forceMoA, forceDebate } = options;

  if (forceMoA || shouldUseMoA(complexityScore, category)) {
    log.info('Using MoA orchestration', { complexityScore, category });
    return runMoA(ctx);
  }

  if (forceDebate || shouldUseDebate(ctx.query, guardianScore)) {
    log.info('Using Debate orchestration', { guardianScore });
    return runDebate(ctx);
  }

  // Fallback: single model (handled by core.ts)
  throw new Error('No orchestration pattern matched — use single model');
}
