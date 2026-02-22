/**
 * Langfuse Integration Tests
 * 
 * Validates Langfuse credentials and tracing functionality.
 */

import { describe, it, expect } from 'vitest';
import { getLangfuse, createTrace, traceLLMCall } from './langfuse';

describe('Langfuse Integration', () => {
  it('should create Langfuse instance with valid credentials', () => {
    const langfuse = getLangfuse();
    expect(langfuse).toBeDefined();
    expect(langfuse).toHaveProperty('trace');
    expect(langfuse).toHaveProperty('generation');
    expect(langfuse).toHaveProperty('shutdown');
  });

  it('should create a trace with metadata', () => {
    const trace = createTrace('test-trace', 'user-123', { test: true });
    expect(trace).toBeDefined();
    expect(trace).toHaveProperty('generation');
    expect(trace).toHaveProperty('span');
  });

  it('should trace LLM call with success', async () => {
    const result = await traceLLMCall({
      name: 'test-llm-call',
      model: 'gpt-4o-mini',
      prompt: 'Test prompt',
      userId: 'user-123',
      metadata: { test: true },
      execute: async () => {
        // Simulate LLM call
        return { content: 'Test response', usage: { total_tokens: 10 } };
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBe('Test response');
  });

  it('should trace LLM call with error', async () => {
    await expect(async () => {
      await traceLLMCall({
        name: 'test-llm-error',
        model: 'gpt-4o-mini',
        prompt: 'Test prompt',
        execute: async () => {
          throw new Error('Simulated LLM error');
        },
      });
    }).rejects.toThrow('Simulated LLM error');
  });

  it('should handle array prompt format', async () => {
    const result = await traceLLMCall({
      name: 'test-array-prompt',
      model: 'gpt-4o-mini',
      prompt: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ],
      execute: async () => {
        return { content: 'Hi there!' };
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBe('Hi there!');
  });
});
