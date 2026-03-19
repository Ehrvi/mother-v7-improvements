import { useRef, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseSSEStreamReturn {
  sendMessage: (query: string, conversationHistory: ConversationTurn[]) => Promise<void>;
  stopStream: () => void;
  isStreaming: boolean;
}

export function useSSEStream(): UseSSEStreamReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const store = useChatStore();

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (
    query: string,
    conversationHistory: ConversationTurn[]
  ) => {
    const streamingMsgId = `${Date.now()}-mother`;
    store.addMessage({ id: streamingMsgId, role: 'mother', content: '', timestamp: new Date() });
    store.beginStream(streamingMsgId);
    store.clearToolCalls();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedText = '';
    let pendingRenderFrame: ReturnType<typeof setTimeout> | null = null;

    const flushRender = () => {
      if (pendingRenderFrame) clearTimeout(pendingRenderFrame);
      const speed = store.streamSpeed;
      const delay = speed >= 2 ? 0 : speed >= 1.5 ? 30 : speed >= 1 ? 50 : 80;
      pendingRenderFrame = setTimeout(() => {
        store.updateMessage(streamingMsgId, { content: accumulatedText });
      }, delay);
    };

    try {
      const response = await fetch('/api/mother/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ query, useCache: true, conversationHistory }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            lastEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const rawData = line.slice(5).trim();
            if (rawData === '[DONE]') break;

            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(rawData); } catch { continue; }

            if (lastEvent === 'token' || lastEvent === '') {
              const token = (parsed.text as string) ?? '';
              accumulatedText += token;
              flushRender();
            } else if (lastEvent === 'phase') {
              store.setPhase(parsed.phase as string);
              if (parsed.latencyMs) store.setPhaseLatency(parsed.latencyMs as number);
            } else if (lastEvent === 'tool_call') {
              store.upsertToolCall({
                id: parsed.id as string,
                name: parsed.name as string,
                status: (parsed.status as string) ?? 'running',
                input: parsed.input,
                output: parsed.output,
              });
            } else if (lastEvent === 'response') {
              // SOTA FIX: Use server's final response as definitive content when available
              // The streaming onChunk tokens may be incomplete/garbled (long-form engine issue),
              // but result.response always has the complete, correct response.
              const serverResponse = parsed.response as string | undefined;
              if (serverResponse && serverResponse.length > accumulatedText.length) {
                accumulatedText = serverResponse;
                store.updateMessage(streamingMsgId, { content: accumulatedText });
              }
              store.updateMessage(streamingMsgId, {
                tier: parsed.tier as string,
                modelName: parsed.modelName as string,
                provider: parsed.provider as string,
                queryCategory: (parsed.layout_hint as string) || (parsed.queryCategory as string),
                qualityScore: (parsed.quality as Record<string, number>)?.qualityScore,
                costReduction: (parsed.quality as Record<string, number>)?.costReductionPercent,
                responseTime: parsed.totalMs as number,
                cost: parsed.cost as number,
                cacheHit: parsed.cacheHit as boolean,
              });
              store.addStatsCost(
                parsed.cost as number,
                parsed.tier as string,
                (parsed.quality as Record<string, number>)?.qualityScore
              );
            } else if (lastEvent === 'done') {
              if (pendingRenderFrame) clearTimeout(pendingRenderFrame);
              store.updateMessage(streamingMsgId, { content: accumulatedText });
            } else if (lastEvent === 'error') {
              store.updateMessage(streamingMsgId, { content: `⚠️ ${(parsed.message as string) ?? 'Unknown error'}` });
            }
            lastEvent = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        store.updateMessage(streamingMsgId, { content: `⚠️ Connection error: ${(err as Error).message}` });
      }
    } finally {
      if (pendingRenderFrame) clearTimeout(pendingRenderFrame);
      store.endStream();
      setTimeout(() => store.setPhase(null), 2000);
      setTimeout(() => store.clearToolCalls(), 5000);
    }
  }, [store]);

  return { sendMessage, stopStream, isStreaming: store.isStreaming };
}
