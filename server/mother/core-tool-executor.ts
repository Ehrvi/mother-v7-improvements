/**
 * core-tool-executor.ts — SRP Phase 10 (Ciclo 86)
 *
 * Extracted from core.ts: Two-Phase Tool Execution path (lines 753-912)
 * Fowler (Refactoring, 2018) — Extract Method pattern
 *
 * Scientific basis:
 *   - SRP (Martin, Clean Architecture, 2017) — Single Responsibility Principle
 *   - FrugalGPT (Chen et al., arXiv:2305.05176, 2023): cascade routing saves 98%
 *   - RouteLLM (Ong et al., arXiv:2406.18665, 2024): routing with preference data
 *   - OpenAI Cookbook (2024): gpt-4o has best tool-use accuracy for Phase 1
 *   - MoA (Wang et al., arXiv:2406.04692, 2024): 65.1% AlpacaEval 2.0
 *   - Multi-Agent Debate (Du et al., arXiv:2305.14325, 2023): +11% factual accuracy
 *
 * Responsibility: Execute the two-phase LLM pipeline (Phase 1: tool detection,
 *   Phase 2: generation with specialized model or orchestration).
 * Inputs: query, systemPrompt, historyMessages, routing, toolCtx, etc.
 * Outputs: { response, usage }
 */

import { invokeLLM } from '../_core/llm';
import { MOTHER_TOOLS, executeTool, formatToolResult, type ToolExecutionContext } from './tool-engine';
import { orchestrate, shouldUseMoA, shouldUseDebate } from './orchestration';
import { createLogger } from '../_core/logger';
import { ENV } from '../_core/env';
import type { LLMProvider } from './intelligence';

const log = createLogger('TOOL-EXECUTOR');

type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolExecutorInput {
  query: string;
  systemPrompt: string;
  historyMessages: Array<{ role: LLMRole; content: string; tool_call_id?: string }>;
  selectedProvider: LLMProvider;
  selectedModel: string;
  selectedTemperature: number;
  routingDecision: {
    category: string;
    model: { provider: LLMProvider; modelName: string };
  };
  complexity: { complexityScore: number };
  knowledgeContext: string | null;
  toolCtx: ToolExecutionContext;
  onChunk?: (chunk: string) => void;
}

export interface ToolExecutorOutput {
  response: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Executes the two-phase LLM pipeline:
 * - Phase 1: gpt-4o for tool detection (T=0.1, deterministic)
 * - Phase 2: routingDecision.model for generation (or MoA/Debate orchestration)
 *
 * Extracted from core.ts SRP Phase 10 (Ciclo 86).
 * Scientific basis: FrugalGPT (arXiv:2305.05176) + RouteLLM (arXiv:2406.18665)
 */
export async function executeTwoPhase(input: ToolExecutorInput): Promise<ToolExecutorOutput> {
  const {
    query,
    systemPrompt,
    historyMessages,
    selectedProvider,
    selectedModel,
    selectedTemperature,
    routingDecision,
    complexity,
    knowledgeContext,
    toolCtx,
    onChunk,
  } = input;

  // ── PHASE 1: Tool detection (always gpt-4o) ──────────────────────────────
  // v74.11 NC-QUALITY-002: Phase 1 uses T=0.1 for deterministic tool detection
  // Scientific basis: OpenAI Cookbook (2024) — function calling accuracy peaks at T≤0.2
  const toolDetectionResponse = await invokeLLM({
    model: 'gpt-4o',
    provider: 'openai',
    messages: [
      { role: 'system' as LLMRole, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as LLMRole, content: query },
    ],
    tools: MOTHER_TOOLS,
    tool_choice: 'auto',
    temperature: 0.1, // v74.11: deterministic tool detection
  });

  let response: string;
  let usage = toolDetectionResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolCalls = toolDetectionResponse.choices[0]?.message?.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    // ── Tool execution path: gpt-4o handles tool result synthesis ────────────
    log.info(`[TOOL-EXECUTOR] Tool calls requested: ${toolCalls.map((t: any) => t.function.name).join(', ')}`);
    const toolResults: Array<{ toolName: string; result: string }> = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, any> = {};
      try { toolArgs = JSON.parse(toolCall.function.arguments || '{}'); } catch { toolArgs = {}; }
      const result = await executeTool(toolName, toolArgs, toolCtx);
      toolResults.push({ toolName, result: formatToolResult(toolName, result) });
      log.info(`[TOOL-EXECUTOR] Tool ${toolName} executed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }

    const toolResultMessages = toolCalls.map((tc: any, i: number) => ({
      role: 'tool' as LLMRole,
      content: toolResults[i].result,
      tool_call_id: tc.id,
    }));

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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ENV.openaiApiKey}` },
      body: JSON.stringify(finalPayload),
    });
    const finalResponse = await finalFetch.json() as any;
    const finalContent = finalResponse.choices[0]?.message?.content;
    response = typeof finalContent === 'string' ? finalContent : 'Tool executed but no response generated';
    const finalUsage = finalResponse.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    usage = {
      prompt_tokens: usage.prompt_tokens + finalUsage.prompt_tokens,
      completion_tokens: usage.completion_tokens + finalUsage.completion_tokens,
      total_tokens: usage.total_tokens + finalUsage.total_tokens,
    };

  } else {
    // ── PHASE 2: No tools — use routingDecision.model for generation ─────────
    // v74.11 NC-QUALITY-003: ALL categories MUST go through Phase 2 with the correct specialized model.
    // Scientific basis:
    //   - FrugalGPT (Chen et al., arXiv:2305.05176, 2023): route to specialized models per category
    //   - RouteLLM (Ong et al., arXiv:2406.18665, 2024): quality improves when correct model is used
    //   - Commey et al. (arXiv:2601.22025, 2026): task-specific prompts outperform generic ones
    // ── NC-ORCH-001: ORCHESTRATION LAYER (Ciclo 46) ──────────────────────────
    // Scientific basis:
    //   - MoA (Wang et al., arXiv:2406.04692, 2024): 65.1% AlpacaEval 2.0, beats GPT-4o (57.5%)
    //   - Multi-Agent Debate (Du et al., arXiv:2305.14325, 2023): +11% factual accuracy
    //   - Society of Mind (Liang et al., arXiv:2305.19118, 2023): -15% hallucination
    const useOrchestration = !onChunk && (
      shouldUseMoA(complexity.complexityScore, routingDecision.category) ||
      shouldUseDebate(query)
    );

    if (useOrchestration) {
      log.info(`[TOOL-EXECUTOR] Phase 2: ORCHESTRATION (MoA/Debate) — category=${routingDecision.category} complexity=${complexity.complexityScore.toFixed(2)}`);
      try {
        const orchResult = await orchestrate(
          {
            query,
            systemPrompt,
            conversationHistory: historyMessages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : '',
            })),
            knowledgeContext: knowledgeContext || undefined,
          },
          {
            complexityScore: complexity.complexityScore,
            category: routingDecision.category,
          }
        );
        response = orchResult.response;
        log.info(`[TOOL-EXECUTOR] Orchestration complete: pattern=${orchResult.pattern}, tokens=${orchResult.totalTokens || 0}`);
        const orchTokens = orchResult.totalTokens || 0;
        usage = {
          prompt_tokens: usage.prompt_tokens + Math.floor(orchTokens * 0.7),
          completion_tokens: usage.completion_tokens + Math.floor(orchTokens * 0.3),
          total_tokens: usage.total_tokens + orchTokens,
        };
      } catch (orchErr) {
        log.warn('[TOOL-EXECUTOR] Orchestration failed, falling back to single model:', (orchErr as Error).message);
        log.info(`[TOOL-EXECUTOR] Phase 2 (fallback): calling ${selectedProvider}/${selectedModel} T=${selectedTemperature}`);
        const phase2Response = await invokeLLM({
          model: selectedModel,
          provider: selectedProvider,
          messages: [
            { role: 'system' as LLMRole, content: systemPrompt },
            ...historyMessages,
            { role: 'user' as LLMRole, content: query },
          ],
          temperature: selectedTemperature,
        });
        const phase2Content = phase2Response.choices[0]?.message?.content;
        response = typeof phase2Content === 'string' ? phase2Content : 'No response generated';
        const phase2Usage = phase2Response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        usage = {
          prompt_tokens: usage.prompt_tokens + phase2Usage.prompt_tokens,
          completion_tokens: usage.completion_tokens + phase2Usage.completion_tokens,
          total_tokens: usage.total_tokens + phase2Usage.total_tokens,
        };
      }
    } else {
      log.info(`[TOOL-EXECUTOR] Phase 2: calling ${selectedProvider}/${selectedModel} T=${selectedTemperature} for ${routingDecision.category}`);
      const phase2Response = await invokeLLM({
        model: selectedModel,
        provider: selectedProvider,
        messages: [
          { role: 'system' as LLMRole, content: systemPrompt },
          ...historyMessages,
          { role: 'user' as LLMRole, content: query },
        ],
        ...(onChunk ? { onChunk } : {}),
        temperature: selectedTemperature,
      });
      const phase2Content = phase2Response.choices[0]?.message?.content;
      response = typeof phase2Content === 'string' ? phase2Content : 'No response generated';
      const phase2Usage = phase2Response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      usage = {
        prompt_tokens: usage.prompt_tokens + phase2Usage.prompt_tokens,
        completion_tokens: usage.completion_tokens + phase2Usage.completion_tokens,
        total_tokens: usage.total_tokens + phase2Usage.total_tokens,
      };
    }
  }

  return { response, usage };
}
