import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';

beforeEach(() => {
  useChatStore.setState({
    messages: [], isStreaming: false, streamingMsgId: null,
    feedback: {}, sidebarOpen: true, streamSpeed: 1,
  });
});

describe('chatStore', () => {
  it('addMessage appends to messages', () => {
    useChatStore.getState().addMessage({ id: '1', role: 'user', content: 'hi', timestamp: new Date() });
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0].content).toBe('hi');
  });

  it('appendToken accumulates text', () => {
    useChatStore.getState().addMessage({ id: 'm1', role: 'mother', content: '', timestamp: new Date() });
    useChatStore.getState().appendToken('m1', 'hello');
    useChatStore.getState().appendToken('m1', ' world');
    expect(useChatStore.getState().messages[0].content).toBe('hello world');
  });

  it('beginStream sets isStreaming=true and streamingMsgId', () => {
    useChatStore.getState().beginStream('msg-42');
    expect(useChatStore.getState().isStreaming).toBe(true);
    expect(useChatStore.getState().streamingMsgId).toBe('msg-42');
  });

  it('endStream resets streaming state', () => {
    useChatStore.getState().beginStream('msg-42');
    useChatStore.getState().endStream();
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().streamingMsgId).toBeNull();
  });

  it('messages are NOT in persisted partialize', () => {
    const partializer = (s: ReturnType<typeof useChatStore.getState>) =>
      ({ feedback: s.feedback, sidebarOpen: s.sidebarOpen, streamSpeed: s.streamSpeed });
    useChatStore.getState().addMessage({ id: '1', role: 'user', content: 'test', timestamp: new Date() });
    const partial = partializer(useChatStore.getState());
    expect('messages' in partial).toBe(false);
  });
});
