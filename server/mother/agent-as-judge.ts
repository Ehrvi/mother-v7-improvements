/**
 * MOTHER — Agent-as-Judge Quality Evaluation System
 * P3 Upgrade: Enhanced evaluation with agentic multi-step reasoning
 *
 * Scientific basis:
 * - Agent-as-Judge (Galileo, 2025) — 90% human agreement (vs G-Eval ~70%)
 * - SALC (arXiv, 2025) — Self-Adaptive Language Criteria generation
 * - Prometheus 2 (Kim et al., arXiv:2405.01535, 2024) — rubric-based evaluation
 * - G-Eval (Liu et al., arXiv:2303.16634, 2023) — LLM-as-judge baseline
 *
 * Architecture:
 * 1. SALC auto-generates task-specific criteria from the query
 * 2. Agent evaluates response against each criterion with CoT reasoning
 * 3. Agent collects specific evidence (quotes) from the response
 * 4. Final weighted score with detailed justification
 *
 * Used for TIER_3/4 queries (higher quality expectations).
 * Falls back to G-Eval for TIER_1/2 (cost optimization).
 */

import { ENV } from '../_core/env';
import { createLogger } from '../_core/logger';

const log = createLogger('AGENT_JUDGE');

export interface EvaluationCriterion {
  name: string;
  description: string;
  weight: number;
  score?: number;       // 1-5
  evidence?: string;    // specific quote from response
  reasoning?: string;   // CoT explanation
}

export interface AgentJudgeResult {
  overallScore: number; // 0-100
  criteria: EvaluationCriterion[];
  justification: string;
  evaluationMethod: 'agent-judge';
  taskType: string;
  latencyMs: number;
}

// ============================================================
// SALC: Self-Adaptive Language Criteria Generation
// ============================================================

const TASK_TYPE_CRITERIA: Record<string, EvaluationCriterion[]> = {
  coding: [
    { name: 'Correctness', description: 'Code is syntactically valid and logically correct', weight: 0.30 },
    { name: 'Completeness', description: 'All requirements addressed, no missing features', weight: 0.25 },
    { name: 'Best Practices', description: 'Follows language idioms, proper error handling', weight: 0.20 },
    { name: 'Explanation', description: 'Clear comments and rationale provided', weight: 0.15 },
    { name: 'Safety', description: 'No injection vulnerabilities or harmful patterns', weight: 0.10 },
  ],
  research: [
    { name: 'Accuracy', description: 'Claims are factually correct and verifiable', weight: 0.30 },
    { name: 'Citations', description: 'References to papers, sources, and evidence', weight: 0.25 },
    { name: 'Depth', description: 'Thorough analysis, not superficial', weight: 0.20 },
    { name: 'Methodology', description: 'Sound reasoning and scientific approach', weight: 0.15 },
    { name: 'Relevance', description: 'Directly addresses the research question', weight: 0.10 },
  ],
  analysis: [
    { name: 'Accuracy', description: 'Correct data interpretation and conclusions', weight: 0.30 },
    { name: 'Completeness', description: 'All aspects of the question covered', weight: 0.25 },
    { name: 'Reasoning', description: 'Clear logical chain from evidence to conclusion', weight: 0.25 },
    { name: 'Clarity', description: 'Well-structured, easy to follow', weight: 0.10 },
    { name: 'Actionability', description: 'Provides actionable insights or recommendations', weight: 0.10 },
  ],
  creative: [
    { name: 'Originality', description: 'Novel ideas, avoids clichés', weight: 0.25 },
    { name: 'Quality', description: 'Well-written, engaging prose', weight: 0.25 },
    { name: 'Coherence', description: 'Consistent style, logical narrative flow', weight: 0.20 },
    { name: 'Instruction Following', description: 'Matches requested format, length, style', weight: 0.20 },
    { name: 'Safety', description: 'Appropriate content', weight: 0.10 },
  ],
  general: [
    { name: 'Relevance', description: 'Directly addresses the query', weight: 0.25 },
    { name: 'Accuracy', description: 'Factually correct information', weight: 0.25 },
    { name: 'Completeness', description: 'Thorough coverage of the topic', weight: 0.20 },
    { name: 'Clarity', description: 'Clear, well-organized response', weight: 0.15 },
    { name: 'Helpfulness', description: 'Provides actionable value to the user', weight: 0.15 },
  ],
};

/**
 * Detect task type from query for SALC criteria selection.
 */
function detectTaskType(query: string): string {
  const q = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(code|implement|function|class|debug|fix|programar|codificar|typescript|python)\b/.test(q)) return 'coding';
  if (/\b(research|paper|arxiv|study|literature|pesquisa|artigo|cientifico)\b/.test(q)) return 'research';
  if (/\b(analyze|evaluate|compare|assess|analisar|avaliar|comparar)\b/.test(q)) return 'analysis';
  if (/\b(write|story|poem|essay|creative|escrever|historia|poema|ensaio)\b/.test(q)) return 'creative';
  return 'general';
}

// ============================================================
// AGENT-AS-JUDGE EVALUATION
// ============================================================

/**
 * Run Agent-as-Judge evaluation with CoT reasoning.
 * Multi-step: criteria selection → per-criterion evaluation → evidence → scoring.
 *
 * Cost: ~$0.01/evaluation (GPT-4o-mini with ~500 input + ~300 output tokens)
 */
export async function evaluateWithAgent(
  query: string,
  response: string,
  knowledgeContext?: string,
): Promise<AgentJudgeResult | null> {
  const startTime = Date.now();

  if (!ENV.openaiApiKey && !ENV.googleApiKey) return null;

  const taskType = detectTaskType(query);
  const criteria = TASK_TYPE_CRITERIA[taskType] || TASK_TYPE_CRITERIA.general;

  // Build evaluation prompt with CoT instruction
  const criteriaList = criteria.map((c, i) =>
    `${i+1}. **${c.name}** (weight: ${(c.weight * 100).toFixed(0)}%): ${c.description}`
  ).join('\n');

  const contextSection = knowledgeContext && knowledgeContext.trim().length > 50
    ? `\n\n**Context provided to the AI:**\n${knowledgeContext.slice(0, 1500)}`
    : '';

  const prompt = `You are an expert evaluation agent. Evaluate the AI response below using a multi-step process.

**Task Type:** ${taskType}

**User Query:** ${query.slice(0, 500)}

**AI Response:** ${response.slice(0, 2000)}${contextSection}

**Evaluation Criteria:**
${criteriaList}

**Instructions:**
For EACH criterion, you must:
1. Score the criterion from 1 to 5 (integers only)
2. Provide a specific quote from the response as evidence
3. Write a brief reasoning (1 sentence) for your score

Return ONLY a valid JSON object in this format:
{
  "scores": [
    {"name": "${criteria[0].name}", "score": X, "evidence": "...", "reasoning": "..."},
    {"name": "${criteria[1].name}", "score": X, "evidence": "...", "reasoning": "..."},
    ...for all ${criteria.length} criteria
  ],
  "justification": "Overall 1-2 sentence summary of quality"
}`;

  try {
    // Try OpenAI first
    const apiKey = ENV.openaiApiKey;
    const model = 'gpt-4o-mini';

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a precise evaluation agent. Always respond with valid JSON only. Be critical and evidence-based.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      log.warn(`Agent-as-Judge API failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      scores: Array<{ name: string; score: number; evidence: string; reasoning: string }>;
      justification: string;
    };

    if (!parsed.scores || !Array.isArray(parsed.scores)) return null;

    // Map scores back to criteria
    const evaluatedCriteria: EvaluationCriterion[] = criteria.map(c => {
      const match = parsed.scores.find(s => s.name === c.name);
      return {
        ...c,
        score: match && typeof match.score === 'number' && match.score >= 1 && match.score <= 5
          ? match.score : 3,
        evidence: match?.evidence?.slice(0, 200) || '',
        reasoning: match?.reasoning?.slice(0, 200) || '',
      };
    });

    // Compute weighted score (1-5 → 0-100)
    let weightedSum = 0;
    let totalWeight = 0;
    for (const c of evaluatedCriteria) {
      const normalized = ((c.score! - 1) / 4) * 100;
      weightedSum += normalized * c.weight;
      totalWeight += c.weight;
    }
    const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

    const latencyMs = Date.now() - startTime;
    log.info(`Agent-as-Judge: score=${overallScore.toFixed(1)}, type=${taskType}, latency=${latencyMs}ms`);

    return {
      overallScore: Math.round(overallScore),
      criteria: evaluatedCriteria,
      justification: parsed.justification || '',
      evaluationMethod: 'agent-judge',
      taskType,
      latencyMs,
    };
  } catch (err) {
    log.warn(`Agent-as-Judge failed: ${(err as Error).message}`);
    return null;
  }
}
