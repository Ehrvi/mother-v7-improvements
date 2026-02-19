import { describe, it, expect } from 'vitest';
import { ENV } from './_core/env';

describe('OpenAI API Key Validation', () => {
  it('should have OPENAI_API_KEY configured', () => {
    expect(ENV.openaiApiKey).toBeDefined();
    expect(ENV.openaiApiKey).not.toBe('');
    expect(ENV.openaiApiKey).toMatch(/^sk-/);
  });

  it('should successfully call OpenAI API', async () => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENV.openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "test"' }],
        max_tokens: 5
      })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBeGreaterThan(0);
  }, 30000); // 30s timeout for API call
});
