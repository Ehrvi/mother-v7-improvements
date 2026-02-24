/**
 * MOTHER v31.0 - CodeAgent with LangGraph createReactAgent
 * Scientific basis:
 *   - ReAct (Yao et al., ICLR 2023, 7,404 citations)
 *   - SICA Self-Improving Coding Agent (Robeyns et al., Bristol 2025)
 *   - TraceCoder Observe->Analyze->Repair (Huang et al., Feb 2026)
 *
 * Architecture: createReactAgent (LangGraph prebuilt) with custom tools
 * - Model: gpt-4o (temperature=0 for deterministic code generation)
 * - Tools: read_file, write_file, edit_file, run_shell, list_files
 * - Memory: episodic context injected via system prompt
 * - Max iterations: 25 recursion limit (prevents infinite loops)
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { codeAgentTools } from './tools';
import { searchEpisodicMemory } from './embeddings';

// ============================================================
// Model - gpt-4o for code generation (deterministic)
// ============================================================
const model = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// ============================================================
// System Prompt Builder
// ============================================================
function buildSystemPrompt(task: string, episodicContext: string): string {
  const memorySection = episodicContext
    ? '## Relevant Past Interactions (Episodic Memory)\n' + episodicContext + '\n'
    : '';

  return [
    'You are MOTHER\'s CodeAgent - an autonomous software engineering agent.',
    '',
    'Your task: ' + task,
    '',
    memorySection,
    '## Available Tools',
    '- read_file: Read any file in the codebase',
    '- write_file: Write a file (validates TypeScript syntax for .ts files)',
    '- edit_file: Make targeted find-and-replace edits (preferred for small changes)',
    '- run_shell: Execute whitelisted commands (pnpm, git, gcloud, cat, ls, grep, find, echo, wc, head, tail, diff)',
    '- list_files: List directory contents',
    '',
    '## Rules',
    '1. Always read a file before editing it',
    '2. Prefer edit_file over write_file for small changes',
    '3. After writing code, run the TypeScript compiler: run_shell with "pnpm tsc --noEmit"',
    '4. If a command fails, analyze the error and retry (max 2 retries)',
    '5. When the task is complete, summarize what you did',
    '6. Be precise and surgical - make the minimum changes needed',
    '',
    '## Task Completion',
    'When done, end your response with: TASK_COMPLETE: <brief summary>',
  ].join('\n');
}

// ============================================================
// Compile the agent (done once at module load)
// ============================================================
const codeAgent = createReactAgent({
  llm: model,
  tools: codeAgentTools,
});

// ============================================================
// Public API
// ============================================================
export interface CodeAgentInput {
  task: string;
  userId?: number;
}

export interface CodeAgentResult {
  success: boolean;
  result: string;
  iterations: number;
  status: string;
  messages: string[];
}

export async function runCodeAgent(input: CodeAgentInput): Promise<CodeAgentResult> {
  const startTime = Date.now();
  console.log('[CodeAgent] Starting task:', input.task.substring(0, 100));

  // Retrieve episodic memory for context
  let episodicContext = '';
  try {
    const memories = await searchEpisodicMemory(input.task, 3);
    if (memories.length > 0) {
      episodicContext = memories
        .map((m, i) => (i + 1) + '. [Sim: ' + m.similarity.toFixed(3) + '] Q: ' + m.query + '\n   A: ' + m.response.substring(0, 200) + '...')
        .join('\n');
      console.log('[CodeAgent] Injected', memories.length, 'episodic memories');
    }
  } catch (e) {
    console.warn('[CodeAgent] Episodic memory retrieval failed:', e);
  }

  const systemPrompt = buildSystemPrompt(input.task, episodicContext);

  try {
    const finalState = await codeAgent.invoke(
      {
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(input.task),
        ],
      },
      { recursionLimit: 25 }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const messages = finalState.messages ?? [];
    const iterations = Math.floor(messages.length / 2);
    console.log('[CodeAgent] Completed in', elapsed + 's, messages:', messages.length);

    // Extract the final AI message
    const lastAiMessage = [...messages]
      .reverse()
      .find((m: any) => m._getType?.() === 'ai' || m.type === 'ai');

    const lastContent = lastAiMessage
      ? (typeof lastAiMessage.content === 'string' ? lastAiMessage.content : JSON.stringify(lastAiMessage.content))
      : 'Task completed';

    const isComplete = lastContent.includes('TASK_COMPLETE:');
    const result = isComplete
      ? (lastContent.split('TASK_COMPLETE:')[1]?.trim() ?? 'Task completed')
      : lastContent;

    // Build human-readable message log
    const messageLog = (messages as any[]).map((m) => {
      const type = m._getType?.() || m.type || 'unknown';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const toolCalls = (m.tool_calls ?? []).map((tc: any) => '[TOOL: ' + tc.name + ']').join(' ');
      if (type === 'system') return null;
      if (type === 'human') return 'USER: ' + content;
      if (type === 'ai') return ('AGENT: ' + content.substring(0, 300) + ' ' + toolCalls).trim();
      if (type === 'tool') return 'TOOL_RESULT: ' + content.substring(0, 200);
      return type.toUpperCase() + ': ' + content.substring(0, 200);
    }).filter(Boolean) as string[];

    return { success: true, result, iterations, status: 'completed', messages: messageLog };
  } catch (e: any) {
    console.error('[CodeAgent] Fatal error:', e);
    return { success: false, result: 'Fatal error: ' + e.message, iterations: 0, status: 'failed', messages: [] };
  }
}
