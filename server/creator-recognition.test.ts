/**
 * ITERATION 19: Creator Recognition Test
 * Validates that MOTHER recognizes Everton Luís Garcia as creator
 */

import { describe, it, expect } from 'vitest';
import { processQuery } from './mother/core';

describe('Iteration 19: Creator Recognition', () => {
  it('should recognize Everton (userId=1) as creator', async () => {
    const result = await processQuery({
      query: 'eu sou seu criador',
      userId: 1, // Everton Luís Garcia
      useCache: false,
    });

    // Should acknowledge creator relationship
    const response = result.response.toLowerCase();
    expect(
      response.includes('everton') || 
      response.includes('criador') || 
      response.includes('creator') ||
      response.includes('intelltech')
    ).toBe(true);

    console.log('[Test] Creator recognition response:', result.response.substring(0, 200));
  }, 30000);

  it('should NOT show creator context for non-creator (userId=2)', async () => {
    const result = await processQuery({
      query: 'eu sou seu criador',
      userId: 2, // Not Everton
      useCache: false,
    });

    // Should give generic response
    const response = result.response.toLowerCase();
    const hasCreatorContext = response.includes('everton') || response.includes('intelltech');
    
    expect(hasCreatorContext).toBe(false);

    console.log('[Test] Non-creator response:', result.response.substring(0, 200));
  }, 30000);

  it('should inject creator context in system prompt for userId=1', async () => {
    // This tests the system prompt injection logic
    const result = await processQuery({
      query: 'quem sou eu?',
      userId: 1,
      useCache: false,
    });

    const response = result.response.toLowerCase();
    expect(
      response.includes('everton') || 
      response.includes('criador') ||
      response.includes('creator')
    ).toBe(true);

    console.log('[Test] "Quem sou eu?" response:', result.response.substring(0, 200));
  }, 30000);
});
