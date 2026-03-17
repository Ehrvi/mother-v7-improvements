import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSSEStream } from '../useSSEStream';
import { useChatStore } from '@/store/chatStore';

function makeSSEStream(events: string[]) {
  const body = events.join('\n') + '\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

beforeEach(() => {
  useChatStore.setState({ messages: [], isStreaming: false });
});

describe('useSSEStream', () => {
  it('streams tokens into store messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream([
        'event: token\ndata: {"text":"hello"}',
        'event: done\ndata: {"total_ms":100}',
      ]),
    }));

    const { result } = renderHook(() => useSSEStream());
    await act(async () => {
      await result.current.sendMessage('test query', []);
    });

    const msgs = useChatStore.getState().messages;
    expect(msgs.some(m => m.role === 'mother' && m.content.includes('hello'))).toBe(true);
  });

  it('stopStream calls abort', async () => {
    const abort = vi.fn();
    vi.stubGlobal('AbortController', vi.fn(() => ({ abort, signal: {} })));
    const { result } = renderHook(() => useSSEStream());
    result.current.stopStream();
    expect(abort).toHaveBeenCalled();
  });

  it('error event sets error content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream(['event: error\ndata: {"message":"Something failed"}']),
    }));

    const { result } = renderHook(() => useSSEStream());
    await act(async () => { await result.current.sendMessage('q', []); });

    const msgs = useChatStore.getState().messages;
    expect(msgs.some(m => m.content.includes('Something failed'))).toBe(true);
  });
});
