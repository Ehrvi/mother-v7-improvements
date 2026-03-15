/**
 * Stream Router — SSE streaming endpoint for /api/mother/stream
 * Extracted from production-entry.ts so it works in BOTH dev and production modes.
 *
 * Scientific basis: Server-Sent Events (W3C, 2021); OpenAI Streaming (2023)
 * Reduces perceived latency from ~40s to ~1-2s TTFT (Time To First Token)
 */

import { Router, Request, Response } from 'express';
import { processQuery as _processQuery } from '../../mother/core.js';

// Optional: sdk for user auth — gracefully skip if not available
let sdk: any = null;
try {
  const sdkModule = await import('../sdk.js');
  sdk = sdkModule.sdk;
} catch {
  // sdk not available in dev mode — that's fine, auth will be skipped
}

export const streamRouter = Router();

streamRouter.post('/', async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { query, useCache, conversationHistory } = req.body;

    // Authenticate user from session cookie (if sdk available)
    let userEmail: string | undefined;
    let userId: number | undefined;
    if (sdk) {
      try {
        const authenticatedUser = await sdk.authenticateRequest(req);
        userEmail = authenticatedUser.email ?? undefined;
        userId = authenticatedUser.id;
      } catch {
        // Unauthenticated request — guest/anonymous
      }
    }

    if (!query) {
      sendEvent('error', { message: 'Missing query parameter' });
      return res.end();
    }

    const _ttftStart = Date.now();
    sendEvent('thinking', {
      message: '\ud83e\udde0 MOTHER está processando...',
      timestamp: _ttftStart,
      version: process.env.MOTHER_VERSION || 'v122.26',
    });
    sendEvent('progress', {
      phase: 'routing',
      message: 'Analisando complexidade da query...',
      ttft_ms: Date.now() - _ttftStart,
    });

    let _streamingTokenCount = 0;
    const result = await _processQuery({
      query,
      userId,
      userEmail,
      useCache,
      conversationHistory,
      onChunk: (chunk: string) => {
        try {
          _streamingTokenCount++;
          sendEvent('token', { text: chunk, streaming: true, token_index: _streamingTokenCount });
        } catch { /* non-blocking */ }
      },
      onPhase: (phase: string, meta?: Record<string, unknown>) => {
        try {
          sendEvent('phase', { phase, elapsed_ms: Date.now() - _ttftStart, ...meta });
          const phaseMessages: Record<string, string> = {
            'routing': 'Roteando para o modelo ideal...',
            'retrieval': 'Buscando conhecimento relevante...',
            'generation': 'Gerando resposta com IA...',
            'quality': 'Validando qualidade (Guardian)...',
            'grounding': 'Verificando fontes e citações...',
            'cove': 'Verificando consistência (CoVe)...',
            'constitutional': 'Aplicando princípios constitucionais...',
            'citation': 'Buscando referências científicas...',
          };
          if (phaseMessages[phase]) {
            sendEvent('progress', { phase, message: phaseMessages[phase], elapsed_ms: Date.now() - _ttftStart });
          }
        } catch { /* non-blocking */ }
      },
      onToolCall: (toolName: string, toolArgs: Record<string, unknown>, status: string, output?: string, durationMs?: number) => {
        try {
          sendEvent('tool_call', {
            id: `tc-${Date.now()}`,
            name: toolName,
            input: toolArgs,
            status,
            output,
            durationMs,
            timestamp: Date.now(),
          });
        } catch { /* non-blocking */ }
      },
    });

    sendEvent('progress', { phase: 'validating', message: 'Validando qualidade (Guardian)...', elapsed_ms: Date.now() - _ttftStart });

    const finalText = result.response || '';
    const CHUNK_SIZE = 16;
    if (_streamingTokenCount === 0) {
      for (let i = 0; i < finalText.length; i += CHUNK_SIZE) {
        sendEvent('token', { text: finalText.slice(i, i + CHUNK_SIZE) });
      }
    } else {
      sendEvent('stream_complete', { tokens_sent: _streamingTokenCount, elapsed_ms: Date.now() - _ttftStart });
    }

    const totalTime = Date.now() - _ttftStart;
    sendEvent('response', {
      ...result,
      ttft_ms: totalTime,
      streaming_chunks: Math.ceil(finalText.length / CHUNK_SIZE),
    });
    sendEvent('done', {
      message: 'Processamento concluído',
      total_ms: totalTime,
      quality_score: result.quality?.qualityScore,
      citations_count: (result as any).citations?.length ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stream] processQuery threw — sending error + degradation response:', message);
    sendEvent('error', { message });
    const degradationText = 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente em alguns segundos.';
    sendEvent('token', { text: degradationText });
    sendEvent('response', {
      response: degradationText,
      tier: 'TIER_1',
      provider: 'error',
      modelName: 'fallback',
      quality: { qualityScore: 0, passed: false },
      responseTime: 0,
      cost: 0,
      cacheHit: false,
    });
    sendEvent('done', { message: 'Error fallback', total_ms: 0, quality_score: 0 });
  } finally {
    res.end();
  }
});
