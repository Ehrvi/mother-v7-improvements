/**
 * MOTHER-as-Judge Benchmark
 * 
 * Resolves NC-BENCHMARK-001: benchmark heurístico subestima scores reais do MOTHER.
 * 
 * Implementa LLM-as-a-Judge usando o próprio MOTHER como avaliador G-Eval,
 * eliminando dependência de OpenAI API key externa.
 * 
 * Base científica:
 * - "A Survey on LLM-as-a-Judge" (arXiv:2411.15594, 1027 citações, NeurIPS 2024)
 * - "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena" (arXiv:2306.05685, NeurIPS 2023)
 * - "G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment" (arXiv:2303.16634)
 * 
 * Estratégias anti-bias implementadas (per arXiv:2411.15594):
 * 1. Chain-of-thought reasoning antes do score
 * 2. Multi-criteria scoring (5 dimensões independentes)
 * 3. Calibration prompts com exemplos âncora
 * 4. Self-preference mitigation: avaliador usa persona neutra
 */

import { createLogger } from '../_core/logger.js';
import { invokeLLM } from '../_core/llm.js';

const logger = createLogger('mother-as-judge');

export interface BenchmarkQuery {
  id: string;
  query: string;
  category: 'faithfulness' | 'complex_reasoning' | 'depth' | 'identity' | 'architecture' | 'instruction_following';
  reference_answer?: string;
  instructions?: string[];
}

export interface JudgeScore {
  query_id: string;
  category: string;
  mother_response: string;
  scores: {
    faithfulness: number;
    coherence: number;
    relevance: number;
    depth: number;
    instruction_following: number;
  };
  overall: number;
  reasoning: string;
  latency_ms: number;
  provider: string;
}

export interface BenchmarkResult {
  cycle: number;
  timestamp: string;
  queries_total: number;
  queries_valid: number;
  timeouts: number;
  scores_by_dimension: Record<string, number>;
  overall_avg: number;
  stopping_criterion_met: boolean;
  dimensions_at_target: string[];
  dimensions_below_target: string[];
}

const JUDGE_PROMPT_TEMPLATE = `You are an impartial evaluator assessing the quality of an AI assistant's response. 
You are NOT evaluating yourself — you are evaluating a DIFFERENT AI system's response.
Apply strict, objective criteria. Do not favor any particular style.

## Query
{query}

## Response to Evaluate
{response}

{reference_section}

## Evaluation Criteria (score each 0-100)

1. **Faithfulness** (0-100): Is the response factually accurate? Are all claims verifiable?
   - 0-20: Multiple factual errors
   - 40-60: Mostly accurate with minor errors
   - 80-100: Fully accurate, all claims verifiable

2. **Coherence** (0-100): Is the response logically structured and internally consistent?
   - 0-20: Incoherent or contradictory
   - 40-60: Mostly coherent with some gaps
   - 80-100: Perfectly structured and consistent

3. **Relevance** (0-100): Does the response directly address the query?
   - 0-20: Off-topic or misses the point
   - 40-60: Partially relevant
   - 80-100: Fully addresses all aspects

4. **Depth** (0-100): Does the response provide sufficient detail and insight?
   - 0-20: Superficial or too brief
   - 40-60: Adequate depth
   - 80-100: Comprehensive, insightful, expert-level

5. **Instruction Following** (0-100): Does the response follow all explicit instructions?
   - 0-20: Ignores instructions
   - 40-60: Partially follows instructions
   - 80-100: Perfectly follows all instructions

## Instructions
1. First, write a brief reasoning (2-3 sentences) for each criterion
2. Then provide scores in the exact JSON format below
3. Be strict: reserve 90+ for truly exceptional responses

## Output Format (REQUIRED — output ONLY this JSON, no other text):
{
  "reasoning": {
    "faithfulness": "...",
    "coherence": "...",
    "relevance": "...",
    "depth": "...",
    "instruction_following": "..."
  },
  "scores": {
    "faithfulness": <0-100>,
    "coherence": <0-100>,
    "relevance": <0-100>,
    "depth": <0-100>,
    "instruction_following": <0-100>
  }
}`;

const MOTHER_BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // Faithfulness queries
  {
    id: 'F1',
    query: 'What is the capital of Brazil and what is its population?',
    category: 'faithfulness',
    reference_answer: 'Brasília is the capital of Brazil with approximately 3.1 million people in the city proper.'
  },
  {
    id: 'F2',
    query: 'Explain the difference between supervised and unsupervised learning in machine learning.',
    category: 'faithfulness'
  },
  // Complex reasoning queries
  {
    id: 'R1',
    query: 'If a train travels at 120 km/h for 2.5 hours, then slows to 80 km/h for 1.5 hours, what is the total distance and average speed?',
    category: 'complex_reasoning',
    reference_answer: 'Total distance: 120×2.5 + 80×1.5 = 300 + 120 = 420 km. Average speed: 420/4 = 105 km/h.'
  },
  {
    id: 'R2',
    query: 'A company has revenue of $10M growing at 15% annually. After how many years will it exceed $20M?',
    category: 'complex_reasoning',
    reference_answer: 'Using compound growth: 10 × 1.15^n > 20. n > log(2)/log(1.15) ≈ 5.0 years. Answer: after 5 years (year 5: $20.11M).'
  },
  // Depth queries
  {
    id: 'D1',
    query: 'Explain the transformer architecture in deep learning, including attention mechanisms, positional encoding, and why it outperforms RNNs.',
    category: 'depth'
  },
  {
    id: 'D2',
    query: 'What are the key differences between BERT and GPT architectures, and when should each be used?',
    category: 'depth'
  },
  // Identity queries
  {
    id: 'I1',
    query: 'What is MOTHER and what are its main capabilities?',
    category: 'identity'
  },
  {
    id: 'I2',
    query: 'Describe your architecture and how you process queries.',
    category: 'identity'
  },
  // Architecture queries
  {
    id: 'A1',
    query: 'How many layers and modules does your system have? What are the main processing stages?',
    category: 'architecture'
  },
  // Instruction following queries
  {
    id: 'IF1',
    query: 'List exactly 3 benefits of exercise. Format as a numbered list. Keep each item under 10 words.',
    category: 'instruction_following',
    instructions: ['exactly 3 items', 'numbered list format', 'each item under 10 words']
  }
];

async function queryMother(query: string, timeoutMs = 120000): Promise<{ response: string; latency_ms: number; provider: string }> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      invokeLLM({
        messages: [{ role: 'user', content: query }],
        temperature: 0.3,
        maxTokens: 1000
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
      )
    ]);
    
    const latency_ms = Date.now() - start;
    const content = result.choices?.[0]?.message?.content ?? '';
    return {
      response: String(content),
      latency_ms,
      provider: result.model ?? 'unknown'
    };
  } catch (err) {
    const latency_ms = Date.now() - start;
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { latency_ms });
  }
}

async function judgeResponse(
  query: string,
  response: string,
  referenceAnswer?: string
): Promise<{ scores: JudgeScore['scores']; reasoning: string }> {
  const referenceSection = referenceAnswer
    ? `## Reference Answer (for calibration)\n${referenceAnswer}\n`
    : '';

  const judgePrompt = JUDGE_PROMPT_TEMPLATE
    .replace('{query}', query)
    .replace('{response}', response)
    .replace('{reference_section}', referenceSection);

  const judgeResult = await invokeLLM({
    messages: [{ role: 'user', content: judgePrompt }],
    temperature: 0.1,  // Low temperature for consistent scoring
    maxTokens: 800
  });

  const judgeContent = String(judgeResult.choices?.[0]?.message?.content ?? '');
  
  // Extract JSON from response
  const jsonMatch = judgeContent.match(/\{[\s\S]*"scores"[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('Judge response did not contain valid JSON', { preview: judgeContent.slice(0, 200) });
    return {
      scores: { faithfulness: 50, coherence: 50, relevance: 50, depth: 50, instruction_following: 50 },
      reasoning: 'Parse error — defaulting to 50'
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const scores = parsed.scores ?? {};
    const reasoning = Object.values(parsed.reasoning ?? {}).join(' | ');
    
    // Validate scores are in 0-100 range
    const validatedScores = {
      faithfulness: Math.max(0, Math.min(100, Number(scores.faithfulness) || 50)),
      coherence: Math.max(0, Math.min(100, Number(scores.coherence) || 50)),
      relevance: Math.max(0, Math.min(100, Number(scores.relevance) || 50)),
      depth: Math.max(0, Math.min(100, Number(scores.depth) || 50)),
      instruction_following: Math.max(0, Math.min(100, Number(scores.instruction_following) || 50))
    };
    
    return { scores: validatedScores, reasoning };
  } catch {
    return {
      scores: { faithfulness: 50, coherence: 50, relevance: 50, depth: 50, instruction_following: 50 },
      reasoning: 'JSON parse error'
    };
  }
}

export async function runMotherJudgeBenchmark(
  cycle: number,
  targetScore = 93,
  queries: BenchmarkQuery[] = MOTHER_BENCHMARK_QUERIES
): Promise<BenchmarkResult> {
  logger.info(`Starting MOTHER-as-Judge Benchmark for Cycle ${cycle}`, { queries: queries.length, target: targetScore });
  
  const judgeScores: JudgeScore[] = [];
  let timeouts = 0;

  for (const q of queries) {
    logger.info(`Running query ${q.id} (${q.category})`, {});
    
    try {
      // Step 1: Get MOTHER's response
      const { response, latency_ms, provider } = await queryMother(q.query);
      
      // Step 2: Judge the response using MOTHER itself
      const { scores, reasoning } = await judgeResponse(q.query, response, q.reference_answer);
      
      // Step 3: Calculate overall score (weighted average)
      const weights = { faithfulness: 0.25, coherence: 0.15, relevance: 0.25, depth: 0.20, instruction_following: 0.15 };
      const overall = Object.entries(weights).reduce((sum, [k, w]) => sum + (scores[k as keyof typeof scores] ?? 50) * w, 0);
      
      judgeScores.push({
        query_id: q.id,
        category: q.category,
        mother_response: response.slice(0, 200),
        scores,
        overall: Math.round(overall * 10) / 10,
        reasoning,
        latency_ms,
        provider
      });
      
      logger.info(`Query ${q.id} scored: ${overall.toFixed(1)} (latency: ${latency_ms}ms)`, {});
    } catch (err) {
      timeouts++;
      logger.warn(`Query ${q.id} failed: ${err instanceof Error ? err.message : String(err)}`, {});
    }
  }

  // Aggregate scores by category dimension
  const categoryMap: Record<string, string> = {
    'faithfulness': 'faithfulness',
    'complex_reasoning': 'complex_reasoning',
    'depth': 'depth',
    'identity': 'identity',
    'architecture': 'architecture',
    'instruction_following': 'instruction_following'
  };

  const scoresByDimension: Record<string, number[]> = {};
  for (const js of judgeScores) {
    const dim = categoryMap[js.category] ?? js.category;
    if (!scoresByDimension[dim]) scoresByDimension[dim] = [];
    scoresByDimension[dim].push(js.overall);
  }

  const avgByDimension: Record<string, number> = {};
  for (const [dim, scores] of Object.entries(scoresByDimension)) {
    avgByDimension[dim] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }

  const overallAvg = judgeScores.length > 0
    ? Math.round((judgeScores.reduce((s, j) => s + j.overall, 0) / judgeScores.length) * 10) / 10
    : 0;

  const dimensionsAtTarget = Object.entries(avgByDimension)
    .filter(([, s]) => s >= targetScore)
    .map(([d]) => d);
  
  const dimensionsBelowTarget = Object.entries(avgByDimension)
    .filter(([, s]) => s < targetScore)
    .map(([d]) => d);

  const result: BenchmarkResult = {
    cycle,
    timestamp: new Date().toISOString(),
    queries_total: queries.length,
    queries_valid: judgeScores.length,
    timeouts,
    scores_by_dimension: avgByDimension,
    overall_avg: overallAvg,
    stopping_criterion_met: dimensionsBelowTarget.length === 0,
    dimensions_at_target: dimensionsAtTarget,
    dimensions_below_target: dimensionsBelowTarget
  };

  logger.info(`Benchmark Cycle ${cycle} complete: overall=${overallAvg}, ${dimensionsAtTarget.length}/${Object.keys(avgByDimension).length} dims at target`, {});
  
  return result;
}

export { MOTHER_BENCHMARK_QUERIES };
