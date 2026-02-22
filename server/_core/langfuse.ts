/**
 * Langfuse Observability Integration
 * 
 * Provides LLM tracing and monitoring capabilities for MOTHER v14.
 * Tracks all LLM invocations with metrics: latency, cost, quality, errors.
 */

import { Langfuse } from 'langfuse-node';
import { ENV } from './env';

// Singleton Langfuse instance
let langfuseInstance: Langfuse | null = null;

/**
 * Get or create Langfuse instance
 */
export function getLangfuse(): Langfuse {
  if (!langfuseInstance) {
    langfuseInstance = new Langfuse({
      secretKey: ENV.langfuseSecretKey,
      publicKey: ENV.langfusePublicKey,
      baseUrl: ENV.langfuseBaseUrl,
    });
  }
  return langfuseInstance;
}

/**
 * Trace an LLM generation with Langfuse
 * 
 * @param name - Name of the trace (e.g., "llm-generation", "query-routing")
 * @param userId - User ID for tracking
 * @param metadata - Additional metadata
 * @returns Langfuse trace object
 */
export function createTrace(name: string, userId?: string, metadata?: Record<string, any>) {
  const langfuse = getLangfuse();
  return langfuse.trace({
    name,
    userId,
    metadata,
  });
}

/**
 * Shutdown Langfuse (flush pending traces)
 * Call this before process exit or in cleanup handlers
 */
export async function shutdownLangfuse() {
  if (langfuseInstance) {
    await langfuseInstance.shutdownAsync();
  }
}

/**
 * Wrapper for LLM calls with automatic tracing
 * 
 * @example
 * const result = await traceLLMCall({
 *   name: "query-routing",
 *   model: "gpt-4o-mini",
 *   prompt: "Classify this query...",
 *   userId: "user-123",
 *   execute: async () => {
 *     return await openai.chat.completions.create({...});
 *   }
 * });
 */
export async function traceLLMCall<T>(options: {
  name: string;
  model: string;
  prompt: string | Array<{ role: string; content: string }>;
  userId?: string;
  metadata?: Record<string, any>;
  execute: () => Promise<T>;
}): Promise<T> {
  const { name, model, prompt, userId, metadata, execute } = options;

  const trace = createTrace(name, userId, {
    ...metadata,
    prompt_length: typeof prompt === 'string' ? prompt.length : JSON.stringify(prompt).length,
  });

  const generation = trace.generation({
    name: `${name}-generation`,
    model,
    input: prompt,
  });

  try {
    const startTime = Date.now();
    const result = await execute();
    const endTime = Date.now();

    generation.end({
      output: result,
      metadata: {
        latency_ms: endTime - startTime,
      },
    });

    return result;
  } catch (error: any) {
    generation.end({
      level: 'ERROR',
      statusMessage: error.message,
    });
    throw error;
  } finally {
    // Shutdown in background to avoid blocking
    shutdownLangfuse().catch(console.error);
  }
}
