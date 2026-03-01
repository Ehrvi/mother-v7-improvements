/**
 * MOTHER v78.9 — Core Provider Caller
 * SRP Phase 11 (Ciclo 88): Extracted from core-orchestrator.ts
 *
 * Handles all LLM provider API calls (OpenAI, Anthropic, Google)
 * and streaming response processing.
 *
 * Scientific basis:
 * - Circuit Breaker pattern (Nygard, "Release It!", 2007)
 * - Streaming SSE protocol (WHATWG Streams API)
 */

export async function callProvider(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { ENV } = await import('../_core/env');
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: !!onChunk,
      }),
      signal,
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err.slice(0, 200)}`);
    }
    if (onChunk && response.body) {
      return streamResponse(response.body, onChunk);
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }
  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ENV.anthropicApiKey ?? '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content ?? '',
        temperature,
      }),
      signal,
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic ${response.status}: ${err.slice(0, 200)}`);
    }
    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  }
  if (provider === 'google') {
    const apiKey = ENV.googleApiKey ?? '';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          systemInstruction: { parts: [{ text: messages.find(m => m.role === 'system')?.content ?? '' }] },
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
        signal,
      }
    );
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google ${response.status}: ${err.slice(0, 200)}`);
    }
    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    };
    return data.candidates[0]?.content?.parts[0]?.text ?? '';
  }
  throw new Error(`Unknown provider: ${provider}`);
}

export async function streamResponse(body: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as { choices: Array<{ delta: { content?: string } }> };
        const chunk = parsed.choices[0]?.delta?.content ?? '';
        if (chunk) {
          fullResponse += chunk;
          onChunk(chunk);
        }
      } catch { /* skip malformed chunks */ }
    }
  }
  return fullResponse;
}
