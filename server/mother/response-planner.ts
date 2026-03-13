/**
 * Response Planning Layer — Pre-generation planning for quality-first responses
 * Scientific basis: Plan-and-Solve (Wang et al., arXiv:2305.04091, 2023)
 * Inspired by: MANUS AI planning module — structured planning before execution
 */

import { invokeLLM } from '../_core/llm';
import { createLogger } from '../_core/logger';

const log = createLogger('PLANNER');

export interface ResponsePlan {
  strategy: 'direct_answer' | 'step_by_step' | 'analysis' | 'creative' | 'code' | 'conversational';
  keyPoints: string[];
  requiresCitations: boolean;
  targetLength: 'short' | 'medium' | 'long';
  tone: 'formal' | 'technical' | 'educational' | 'conversational';
  structureHint: string;
  language: 'pt-BR' | 'en-US' | 'auto';
  planningTimeMs: number;
}

/**
 * Plan the response before generating it.
 * Uses a fast model to analyze the query and create a structured plan.
 * This plan is then injected into the main LLM's system prompt.
 */
export async function planResponse(
  query: string,
  category: string,
  complexityScore: number,
  contextAvailable: boolean,
): Promise<ResponsePlan> {
  const start = Date.now();

  // Fast-path: simple/conversational queries don't need planning
  if (complexityScore < 0.3 && category === 'simple') {
    return {
      strategy: 'conversational',
      keyPoints: [],
      requiresCitations: false,
      targetLength: 'short',
      tone: 'conversational',
      structureHint: '',
      language: detectLanguage(query),
      planningTimeMs: Date.now() - start,
    };
  }

  try {
    const planPrompt = `Analyze this query and create a response plan. Return ONLY valid JSON.

Query: "${query.slice(0, 500)}"
Category: ${category}
Complexity: ${complexityScore.toFixed(2)}
Context available: ${contextAvailable}

Return JSON:
{
  "strategy": "direct_answer|step_by_step|analysis|creative|code|conversational",
  "keyPoints": ["point1", "point2", "point3"],
  "requiresCitations": true/false,
  "targetLength": "short|medium|long",
  "tone": "formal|technical|educational|conversational",
  "structureHint": "suggested markdown structure (e.g. '## Overview\\n## Details\\n## Conclusion')"
}`;

    const result = await invokeLLM({
      model: 'deepseek-chat',
      provider: 'deepseek',
      messages: [{ role: 'user', content: planPrompt }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const content = result.choices?.[0]?.message?.content || '';
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        strategy: parsed.strategy || 'direct_answer',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
        requiresCitations: !!parsed.requiresCitations,
        targetLength: parsed.targetLength || 'medium',
        tone: parsed.tone || 'formal',
        structureHint: parsed.structureHint || '',
        language: detectLanguage(query),
        planningTimeMs: Date.now() - start,
      };
    }
  } catch (err) {
    log.warn('[Planner] Planning failed, using defaults:', (err as Error).message);
  }

  // Fallback: heuristic planning
  return heuristicPlan(query, category, complexityScore);
}

/**
 * Format the plan as instructions for the main LLM.
 */
export function formatPlanForPrompt(plan: ResponsePlan): string {
  if (plan.strategy === 'conversational') return '';

  const parts: string[] = ['### RESPONSE PLAN (follow this structure)'];

  parts.push(`Strategy: ${plan.strategy}`);
  parts.push(`Tone: ${plan.tone}`);
  parts.push(`Length: ${plan.targetLength}`);

  if (plan.keyPoints.length > 0) {
    parts.push(`Key points to cover:\n${plan.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
  }

  if (plan.requiresCitations) {
    parts.push('Citations: REQUIRED — cite sources inline [1], [2] and add ## References section');
  }

  if (plan.structureHint) {
    parts.push(`Structure:\n${plan.structureHint}`);
  }

  return parts.join('\n');
}

function detectLanguage(text: string): 'pt-BR' | 'en-US' | 'auto' {
  const ptIndicators = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(você|está|faça|como|sobre|para|pode|quero|preciso)\b/i;
  if (ptIndicators.test(text)) return 'pt-BR';
  const enIndicators = /\b(the|is|are|what|how|can|please|would|should|explain)\b/i;
  if (enIndicators.test(text)) return 'en-US';
  return 'auto';
}

function heuristicPlan(query: string, category: string, complexity: number): ResponsePlan {
  const isCode = /\b(code|implement|function|class|bug|fix|create.*component|build.*api)\b/i.test(query);
  const isAnalysis = /\b(analis|compar|avaliar|evaluate|review|assess|explain.*difference)\b/i.test(query);
  const isCreative = /\b(escreva|write|create|generate|draft|compose)\b/i.test(query);

  return {
    strategy: isCode ? 'code' : isAnalysis ? 'analysis' : isCreative ? 'creative' : complexity > 0.6 ? 'step_by_step' : 'direct_answer',
    keyPoints: [],
    requiresCitations: ['research', 'complex_reasoning', 'stem'].includes(category),
    targetLength: complexity > 0.7 ? 'long' : complexity > 0.4 ? 'medium' : 'short',
    tone: isCode ? 'technical' : isAnalysis ? 'formal' : 'educational',
    structureHint: '',
    language: detectLanguage(query),
    planningTimeMs: 0,
  };
}
