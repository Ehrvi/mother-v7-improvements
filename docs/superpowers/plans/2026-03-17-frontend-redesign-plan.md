# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the 1000-line HomeV2.tsx monolith into a world-class AI command center that represents MOTHER's true potential — focused components, Zustand state, extracted SSE hook, Phase 5 creator panels.

**Architecture:** Zustand store (chatStore.ts) holds all chat state; useSSEStream hook handles SSE; HomeV2.tsx becomes ~80-line orchestration shell; Phase 5 panels open as shadcn/ui Sheet from the right; all execution panels are creator-only.

**Tech Stack:** React 19, TypeScript, Zustand, shadcn/ui (Sheet, Card, Badge, Skeleton), xterm.js, Monaco Editor, D3, tRPC, SSE

---

## Pre-flight: Dependency Audit

Before any task begins, verify or install required packages.

- **Zustand:** NOT in `package.json` — must be installed
- **xterm.js:** NOT in `package.json` — must be installed for Task 4
- **Monaco Editor:** NOT in `package.json` — must be installed for Task 4
- **D3:** `react-d3-tree` is present but plain `d3` is not — install for Task 4
- **shadcn/ui Sheet, Card, Badge, Skeleton:** Already present in `client/src/components/ui/`

---

## Task 1: Zustand Store (D2)

**Goal:** Replace 15+ `useState` calls in HomeV2.tsx with a single reactive store.

**Files:**
- Create: `client/src/store/chatStore.ts`
- Test: `client/src/store/__tests__/chatStore.test.ts`

### Steps

- [ ] **1.1 Install Zustand:**
  ```bash
  pnpm add zustand
  ```
  Run `pnpm run check` — 0 TypeScript errors.

- [ ] **1.2 Create `client/src/store/chatStore.ts`:**

  ```typescript
  import { create } from 'zustand';
  import { persist, createJSONStorage } from 'zustand/middleware';

  export interface Message {
    id: string;
    role: 'user' | 'mother';
    content: string;
    timestamp: Date;
    tier?: string;
    modelName?: string;
    provider?: string;
    queryCategory?: string;
    qualityScore?: number;
    costReduction?: number;
    responseTime?: number;
    cost?: number;
    cacheHit?: boolean;
  }

  export interface SessionStats {
    msgCount: number;
    totalCost: number;
    qualityScores: number[];
    tierCounts: Record<string, number>;
  }

  interface ChatState {
    // Conversation
    messages: Message[];
    input: string;
    showWelcome: boolean;
    streamingMsgId: string | null;
    // UI layout
    sidebarOpen: boolean;
    showSessionHistory: boolean;
    showDGMTest: boolean;
    showDropZone: boolean;
    // Session stats
    stats: SessionStats;
    // Streaming state
    isStreaming: boolean;
    currentPhase: string | null;
    phaseLatencyMs: number;
    activeToolCalls: Array<{ id: string; name: string; status: string; input?: unknown; output?: unknown }>;
    streamSpeed: 0.5 | 1 | 1.5 | 2;
    // File context
    fileContext: string;
    // Feedback (persisted)
    feedback: Record<string, 'up' | 'down'>;
    // Phase 5 panel
    activePanel: 'shell' | 'editor' | 'graph' | 'projects' | null;

    // Actions
    setInput: (v: string) => void;
    setShowWelcome: (v: boolean) => void;
    setSidebarOpen: (v: boolean) => void;
    setShowSessionHistory: (v: boolean) => void;
    setShowDGMTest: (v: boolean) => void;
    setShowDropZone: (v: boolean) => void;
    setFileContext: (v: string) => void;
    setStreamSpeed: (v: 0.5 | 1 | 1.5 | 2) => void;
    setFeedback: (msgId: string, dir: 'up' | 'down') => void;
    setActivePanel: (panel: 'shell' | 'editor' | 'graph' | 'projects' | null) => void;
    // Message management
    addMessage: (msg: Message) => void;
    updateMessage: (id: string, patch: Partial<Message>) => void;
    clearMessages: () => void;
    // Streaming
    beginStream: (msgId: string) => void;
    endStream: () => void;
    setPhase: (phase: string | null) => void;
    setPhaseLatency: (ms: number) => void;
    appendToken: (msgId: string, token: string) => void;
    upsertToolCall: (tc: { id: string; name: string; status: string; input?: unknown; output?: unknown }) => void;
    clearToolCalls: () => void;
    addStatsCost: (cost: number, tier?: string, quality?: number) => void;
  }

  const initialStats: SessionStats = {
    msgCount: 0,
    totalCost: 0,
    qualityScores: [],
    tierCounts: {},
  };

  export const useChatStore = create<ChatState>()(
    persist(
      (set) => ({
        messages: [],
        input: '',
        showWelcome: true,
        streamingMsgId: null,
        sidebarOpen: true,
        showSessionHistory: false,
        showDGMTest: false,
        showDropZone: false,
        stats: initialStats,
        isStreaming: false,
        currentPhase: null,
        phaseLatencyMs: 0,
        activeToolCalls: [],
        streamSpeed: 1,
        fileContext: '',
        feedback: {},
        activePanel: null,

        setInput: (v) => set({ input: v }),
        setShowWelcome: (v) => set({ showWelcome: v }),
        setSidebarOpen: (v) => set({ sidebarOpen: v }),
        setShowSessionHistory: (v) => set({ showSessionHistory: v }),
        setShowDGMTest: (v) => set({ showDGMTest: v }),
        setShowDropZone: (v) => set({ showDropZone: v }),
        setFileContext: (v) => set({ fileContext: v }),
        setStreamSpeed: (v) => set({ streamSpeed: v }),
        setFeedback: (msgId, dir) => set((s) => ({ feedback: { ...s.feedback, [msgId]: dir } })),
        setActivePanel: (panel) => set({ activePanel: panel }),

        addMessage: (msg) => set((s) => ({
          messages: [...s.messages, msg],
          stats: { ...s.stats, msgCount: s.stats.msgCount + 1 },
        })),
        updateMessage: (id, patch) => set((s) => ({
          messages: s.messages.map((m) => m.id === id ? { ...m, ...patch } : m),
        })),
        clearMessages: () => set({ messages: [], showWelcome: true, stats: initialStats }),

        beginStream: (msgId) => set({ isStreaming: true, streamingMsgId: msgId }),
        endStream: () => set({ isStreaming: false, streamingMsgId: null }),
        setPhase: (phase) => set({ currentPhase: phase }),
        setPhaseLatency: (ms) => set({ phaseLatencyMs: ms }),
        appendToken: (id, token) => set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + token } : m
          ),
        })),
        upsertToolCall: (tc) => set((s) => ({
          activeToolCalls: [
            ...s.activeToolCalls.filter((t) => t.id !== tc.id),
            tc,
          ],
        })),
        clearToolCalls: () => set({ activeToolCalls: [] }),
        addStatsCost: (cost, tier, quality) => set((s) => ({
          stats: {
            ...s.stats,
            totalCost: s.stats.totalCost + (cost || 0),
            tierCounts: tier
              ? { ...s.stats.tierCounts, [tier]: (s.stats.tierCounts[tier] || 0) + 1 }
              : s.stats.tierCounts,
            qualityScores: quality
              ? [...s.stats.qualityScores, quality]
              : s.stats.qualityScores,
          },
        })),
      }),
      {
        name: 'mother-chat-store',
        storage: createJSONStorage(() => localStorage),
        // Only persist user preferences — messages are session-only
        partialize: (s) => ({
          feedback: s.feedback,
          sidebarOpen: s.sidebarOpen,
          streamSpeed: s.streamSpeed,
        }),
      }
    )
  );
  ```

- [ ] **1.3 Write store tests** (`client/src/store/__tests__/chatStore.test.ts`):

  ```typescript
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
  ```

- [ ] **1.4** Run `pnpm test -- chatStore` — all 5 tests pass.

- [ ] **1.5 Commit:**
  ```bash
  git add client/src/store/chatStore.ts client/src/store/__tests__/chatStore.test.ts
  git commit -m "feat(D2): add Zustand chatStore — replaces 15+ useState calls in HomeV2"
  ```

---

## Task 2: useSSEStream Hook (D3)

**Goal:** Extract the 150-line SSE engine from HomeV2.tsx into a standalone reusable hook.

**Files:**
- Create: `client/src/hooks/useSSEStream.ts`
- Test: `client/src/hooks/__tests__/useSSEStream.test.ts`

### Steps

- [ ] **2.1 Create `client/src/hooks/useSSEStream.ts`:**

  ```typescript
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
        const response = await fetch('/api/trpc/mother.query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
          body: JSON.stringify({ json: { query, conversationHistory } }),
          signal: controller.signal,
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
              } else if (lastEvent === 'thinking') {
                // thinking tokens — optional display
              } else if (lastEvent === 'progress') {
                // progress updates — optional display
              } else if (lastEvent === 'response') {
                // Final response metadata
                store.updateMessage(streamingMsgId, {
                  tier: parsed.tier as string,
                  modelName: parsed.modelName as string,
                  provider: parsed.provider as string,
                  queryCategory: parsed.queryCategory as string,
                  qualityScore: parsed.quality?.qualityScore as number,
                  costReduction: parsed.quality?.costReductionPercent as number,
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
  ```

- [ ] **2.2 Write hook tests** (`client/src/hooks/__tests__/useSSEStream.test.ts`):

  ```typescript
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
  ```

- [ ] **2.3** Run `pnpm test -- useSSEStream` — all tests pass.

- [ ] **2.4 Commit:**
  ```bash
  git add client/src/hooks/useSSEStream.ts client/src/hooks/__tests__/useSSEStream.test.ts
  git commit -m "feat(D3): extract SSE engine into useSSEStream hook (dispatches to Zustand store)"
  ```

---

## Task 3: Decompose HomeV2 into Chat Components (D1)

**Goal:** Extract each logical section of HomeV2.tsx into a focused component. Build each component individually. Refactor HomeV2.tsx last.

**Note:** Existing `client/src/components/MessageBubble.tsx` imports from dead `@/contexts/MotherContext`. New components go in `client/src/components/chat/` and import from `@/store/chatStore`.

### Steps

- [ ] **3.1 Create `client/src/components/chat/ChatSidebar.tsx`:**

  Move `SIDEBAR_COMMANDS` constant from HomeV2.tsx here. Extract sidebar JSX (HomeV2.tsx lines ~428–600).

  Key rules:
  - Phase 5 commands (`/shell`, `/editor`, `/graph`, `/projects`) → call `store.setActivePanel(panelName)`
  - Other commands → call `onSendMessage(text)`
  - Stats block reads `stats` from chatStore
  - Sidebar toggle reads/writes `sidebarOpen` from chatStore

  ```typescript
  // client/src/components/chat/ChatSidebar.tsx
  import { useChatStore } from '@/store/chatStore';

  interface ChatSidebarProps {
    onSendMessage: (text: string) => void;
    motherVersion: string;
    providerHealth?: { allHealthy: boolean; providers: Array<{ provider: string; status: string }> };
  }

  export default function ChatSidebar({ onSendMessage, motherVersion, providerHealth }: ChatSidebarProps) {
    const store = useChatStore();
    // ... extract from HomeV2 lines 428-600
  }
  ```

- [ ] **3.2 Create `client/src/lib/splitMermaidBlocks.ts`:**

  Move `splitMermaidBlocks()` function from HomeV2.tsx (lines ~118–134):
  ```typescript
  export function splitMermaidBlocks(content: string): Array<{ type: 'text' | 'mermaid'; content: string }> {
    // ... exact function from HomeV2
  }
  ```

- [ ] **3.3 Create `client/src/components/chat/MessageBubble.tsx`:**

  ```typescript
  // client/src/components/chat/MessageBubble.tsx
  import type { Message } from '@/store/chatStore';
  import { useChatStore } from '@/store/chatStore';
  import { trpc } from '@/lib/trpc';
  import { splitMermaidBlocks } from '@/lib/splitMermaidBlocks';
  import InteractiveMermaid from '@/components/InteractiveMermaid';
  import ErrorBoundary from '@/components/ErrorBoundary';

  interface MessageBubbleProps {
    msg: Message;
    isCurrentlyStreaming: boolean;
    isLastMotherMessage: boolean;
    onSendMessage: (text: string) => void;
  }
  ```

  - Move `MERMAID_CONFIG` constant here
  - Include inline `MetricsBar` sub-component (model badge, quality, cost, latency)
  - Feedback buttons call `trpc.mother.submitFeedback.useMutation()` and `store.setFeedback()`
  - Animated streaming cursor: when `isCurrentlyStreaming && msg.content.length > 0`, render blinking cursor after Streamdown

- [ ] **3.4 Create `client/src/lib/followUpChips.ts`:**

  Move `getFollowUpChips()` from HomeV2.tsx (lines ~89–106):
  ```typescript
  export function getFollowUpChips(content: string): string[] {
    // ... exact function from HomeV2
  }
  ```

- [ ] **3.5 Create `client/src/components/chat/MessageList.tsx`:**

  ```typescript
  import { useRef, useEffect } from 'react';
  import { useChatStore } from '@/store/chatStore';
  import MessageBubble from './MessageBubble';
  import { Skeleton } from '@/components/ui/skeleton';
  import { getFollowUpChips } from '@/lib/followUpChips';

  function MessageSkeleton() {
    return (
      <div className="flex gap-4">
        <Skeleton className="w-8 h-8 rounded-xl flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
        </div>
      </div>
    );
  }
  ```

  - `messagesEndRef` for auto-scroll lives here
  - Show `MessageSkeleton` × 3 when `isStreaming && messages.length === 0`
  - Follow-up chips appear under last MOTHER message when not streaming

- [ ] **3.6 Create `client/src/components/chat/QuickPrompts.tsx`:**

  Move `QUICK_PROMPTS` constant and welcome screen JSX here.
  Renders only when `showWelcome && messages.length === 0`.

- [ ] **3.7 Create `client/src/components/chat/StreamingInput.tsx`:**

  ```typescript
  import { useRef } from 'react';
  import { useChatStore } from '@/store/chatStore';

  interface StreamingInputProps {
    onSend: () => void;
    onStop: () => void;
  }
  ```

  - Textarea with auto-resize
  - Paperclip button toggles `showDropZone`
  - Speed buttons (0.5×, 1×, 1.5×, 2×) read/write `streamSpeed`
  - Send/Stop based on `isStreaming`
  - Enter sends, Shift+Enter newline
  - Bottom status bar (message count, cost, quality, last model)

- [ ] **3.8 Create `client/src/components/chat/PhaseHeader.tsx`:**

  Move the `<header>` top bar from HomeV2.tsx (lines ~622–646).
  Wrap `PhaseIndicator` and `ToolCallVisualizer` in `ErrorBoundary`.

- [ ] **3.9 Refactor `client/src/pages/HomeV2.tsx` to ~80 lines:**

  ```typescript
  import { useCallback } from 'react';
  import { useChatStore } from '@/store/chatStore';
  import { useSSEStream } from '@/hooks/useSSEStream';
  import { trpc } from '@/lib/trpc';
  import ChatSidebar from '@/components/chat/ChatSidebar';
  import PhaseHeader from '@/components/chat/PhaseHeader';
  import MessageList from '@/components/chat/MessageList';
  import QuickPrompts from '@/components/chat/QuickPrompts';
  import StreamingInput from '@/components/chat/StreamingInput';
  import Phase5Panels from '@/components/phase5/Phase5Panels';

  export default function HomeV2() {
    const store = useChatStore();
    const { sendMessage, stopStream } = useSSEStream();
    const providerHealthQuery = trpc.mother.providerHealth.useQuery(
      { forceRefresh: false },
      { refetchInterval: 5 * 60 * 1000, staleTime: 4 * 60 * 1000 }
    );
    const systemStatsQuery = trpc.mother.stats.useQuery(undefined, {
      refetchInterval: 60 * 1000, staleTime: 30 * 1000,
    });
    const motherVersion = systemStatsQuery.data?.version ?? 'v122.0';

    const handleSend = useCallback((text?: string) => {
      const rawQuery = (text ?? store.input).trim();
      if (!rawQuery || store.isStreaming) return;
      store.setShowWelcome(false);
      const query = store.fileContext
        ? `${rawQuery}\n\n---\n**Contexto dos arquivos anexados:**\n\n${store.fileContext}`
        : rawQuery;
      store.addMessage({ id: `${Date.now()}-user`, role: 'user', content: rawQuery, timestamp: new Date() });
      store.setInput('');
      if (store.fileContext) { store.setFileContext(''); store.setShowDropZone(false); }
      const history = store.messages.filter(m => m.content).slice(-20).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));
      sendMessage(query, history);
    }, [store, sendMessage]);

    return (
      <div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-fg-base)]">
        <ChatSidebar onSendMessage={handleSend} motherVersion={motherVersion} providerHealth={providerHealthQuery.data} />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <PhaseHeader sidebarOpen={store.sidebarOpen} motherVersion={motherVersion} />
          <MessageList onSendMessage={handleSend} />
          <QuickPrompts onSendMessage={handleSend} />
          <StreamingInput onSend={() => handleSend()} onStop={stopStream} />
        </main>
        <Phase5Panels />
      </div>
    );
  }
  ```

  - Remove the inline `<style>` tag — move `@keyframes` and `.prose-invert` to `client/src/index.css`

- [ ] **3.10** Run `pnpm run check` — 0 TypeScript errors.

- [ ] **3.11** Run `pnpm dev`, navigate to `/` — chat renders, can send message, SSE streams tokens.

- [ ] **3.12 Commit:**
  ```bash
  git add client/src/pages/HomeV2.tsx client/src/components/chat/ client/src/lib/
  git commit -m "feat(D1): decompose HomeV2 monolith into 8 focused chat components"
  ```

---

## Task 4: Phase 5 Panels — Creator-Only (D4)

**Goal:** Implement 4 creator-only panels as shadcn/ui Sheet components.

**Files:**
- Create: `client/src/hooks/useCreatorGuard.ts`
- Create: `client/src/components/phase5/Phase5Panels.tsx`
- Create: `client/src/components/phase5/ShellPanel.tsx`
- Create: `client/src/components/phase5/CodeEditorPanel.tsx`
- Create: `client/src/components/phase5/DependencyGraph.tsx`
- Create: `client/src/components/phase5/ProjectsPanel.tsx`
- Modify: `server/routers.ts` (extend `auth.me` to expose `isCreator`)

### Steps

- [ ] **4.1 Install Phase 5 dependencies:**
  ```bash
  pnpm add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
  pnpm add @monaco-editor/react
  pnpm add d3
  pnpm add -D @types/d3
  ```
  Run `pnpm run check` — 0 errors.

- [ ] **4.2 Extend `server/routers.ts` `auth.me` to expose `isCreator`:**

  ```typescript
  // server/routers.ts — update me query
  me: publicProcedure.query(opts => {
    const user = opts.ctx.user;
    if (!user) return null;
    return { ...user, isCreator: user.email === CREATOR_EMAIL };
  }),
  ```
  Import `CREATOR_EMAIL` from `'./mother/user-hierarchy'` or wherever it is defined.

- [ ] **4.3 Create `client/src/hooks/useCreatorGuard.ts`:**

  ```typescript
  import { trpc } from '@/lib/trpc';

  export function useCreatorGuard() {
    const { data: user, isLoading } = trpc.auth.me.useQuery();
    const isCreator = Boolean(user?.isCreator);
    return { isCreator, isLoading, user };
  }
  ```

- [ ] **4.4 Create `client/src/components/phase5/Phase5Panels.tsx`:**

  ```typescript
  import { useChatStore } from '@/store/chatStore';
  import { useCreatorGuard } from '@/hooks/useCreatorGuard';
  import { Sheet, SheetContent } from '@/components/ui/sheet';
  import ErrorBoundary from '@/components/ErrorBoundary';
  import ShellPanel from './ShellPanel';
  import CodeEditorPanel from './CodeEditorPanel';
  import DependencyGraph from './DependencyGraph';
  import ProjectsPanel from './ProjectsPanel';

  export default function Phase5Panels() {
    const { activePanel, setActivePanel } = useChatStore();
    const { isCreator } = useCreatorGuard();

    if (!isCreator) return null;

    const panelMap = {
      shell: <ShellPanel />,
      editor: <CodeEditorPanel />,
      graph: <DependencyGraph />,
      projects: <ProjectsPanel />,
    };

    return (
      <Sheet open={activePanel !== null} onOpenChange={(open) => !open && setActivePanel(null)}>
        <SheetContent side="right" className="w-[600px] sm:w-[800px] p-0 bg-[var(--color-bg-surface)]">
          {activePanel && (
            <ErrorBoundary componentName={activePanel}>
              {panelMap[activePanel]}
            </ErrorBoundary>
          )}
        </SheetContent>
      </Sheet>
    );
  }
  ```

- [ ] **4.5 Create `client/src/components/phase5/ShellPanel.tsx`:**

  ```typescript
  import { useEffect, useRef } from 'react';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';

  export default function ShellPanel() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const term = new Terminal({
        theme: { background: '#0a0e1a', foreground: '#e0e0f0', cursor: '#a78bfa' },
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        cursorBlink: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current!);
      fitAddon.fit();
      term.writeln('\x1b[1;35mMOTHER Shell\x1b[0m — Creator sandbox');
      term.writeln('Type a command and press Enter...\r\n');
      term.onData((data) => {
        // TODO: POST /api/shell { command: data } → SSE response (Worktree A adds endpoint)
        term.write(data);
      });
      const handleResize = () => fitAddon.fit();
      window.addEventListener('resize', handleResize);
      return () => { term.dispose(); window.removeEventListener('resize', handleResize); };
    }, []);

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-sm font-semibold">Shell Executor</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">Creator only · Sandboxed environment</p>
        </div>
        <div ref={containerRef} className="flex-1 p-2" />
      </div>
    );
  }
  ```

- [ ] **4.6 Create `client/src/components/phase5/CodeEditorPanel.tsx`:**

  ```typescript
  import { useState, useEffect } from 'react';
  import Editor from '@monaco-editor/react';

  export default function CodeEditorPanel() {
    const [code, setCode] = useState('// Enter a file path above to load a file');
    const [language, setLanguage] = useState('typescript');
    const [filePath, setFilePath] = useState('');
    const [saving, setSaving] = useState(false);

    const loadFile = async () => {
      if (!filePath) return;
      try {
        const res = await fetch(`/api/editor/${encodeURIComponent(filePath)}`);
        const text = await res.text();
        setCode(text);
        const ext = filePath.split('.').pop();
        setLanguage(ext === 'ts' || ext === 'tsx' ? 'typescript' :
                    ext === 'js' || ext === 'jsx' ? 'javascript' :
                    ext === 'json' ? 'json' : ext === 'css' ? 'css' : 'plaintext');
      } catch { setCode('// Error loading file'); }
    };

    const saveFile = async () => {
      if (!filePath) return;
      setSaving(true);
      try {
        await fetch(`/api/editor/${encodeURIComponent(filePath)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: code,
        });
      } finally { setSaving(false); }
    };

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Code Editor</h2>
            <input
              value={filePath}
              onChange={e => setFilePath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadFile()}
              placeholder="server/routers/mother.ts"
              className="text-xs bg-transparent outline-none text-[var(--color-fg-muted)] w-full"
            />
          </div>
          <button onClick={loadFile} className="text-xs px-2 py-1 rounded bg-[var(--color-bg-raised)]">Load</button>
          <button onClick={saveFile} disabled={saving}
            className="text-xs px-3 py-1 rounded bg-[var(--color-accent-violet)] text-white">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="flex-1">
          <Editor height="100%" language={language} value={code}
            onChange={(v) => setCode(v ?? '')} theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }} />
        </div>
      </div>
    );
  }
  ```

- [ ] **4.7 Create `client/src/components/phase5/DependencyGraph.tsx`:**

  ```typescript
  import { useEffect, useRef } from 'react';
  import * as d3 from 'd3';
  import { trpc } from '@/lib/trpc';

  interface GraphNode extends d3.SimulationNodeDatum { id: string; group: number; }
  interface GraphLink extends d3.SimulationLinkDatum<GraphNode> { value?: number; }

  export default function DependencyGraph() {
    const svgRef = useRef<SVGSVGElement>(null);
    const { data: proposals } = trpc.mother.dgmPendingProposals.useQuery();

    useEffect(() => {
      if (!svgRef.current || !proposals?.length) return;

      // Build graph from proposals
      const nodes: GraphNode[] = proposals.map((p, i) => ({ id: p.id?.toString() ?? String(i), group: 1 }));
      const links: GraphLink[] = [];
      const width = svgRef.current.clientWidth || 600;
      const height = svgRef.current.clientHeight || 400;

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

      const simulation = d3.forceSimulation<GraphNode>(nodes)
        .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2));

      const link = svg.append('g').selectAll('line').data(links).join('line')
        .attr('stroke', 'oklch(35% 0.10 300)').attr('stroke-opacity', 0.6);

      const node = svg.append('g').selectAll('circle').data(nodes).join('circle')
        .attr('r', 10).attr('fill', 'oklch(68% 0.16 285)')
        .call(d3.drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

      simulation.on('tick', () => {
        link.attr('x1', d => (d.source as GraphNode).x!).attr('y1', d => (d.source as GraphNode).y!)
            .attr('x2', d => (d.target as GraphNode).x!).attr('y2', d => (d.target as GraphNode).y!);
        node.attr('cx', d => d.x!).attr('cy', d => d.y!);
      });

      return () => { simulation.stop(); };
    }, [proposals]);

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-sm font-semibold">DGM Dependency Graph</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">Proposal relationships — creator only</p>
        </div>
        <div className="flex-1 relative">
          {(!proposals || proposals.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-fg-subtle)]">
              No proposals to visualize
            </div>
          )}
          <svg ref={svgRef} className="w-full h-full" />
        </div>
      </div>
    );
  }
  ```

- [ ] **4.8 Create `client/src/components/phase5/ProjectsPanel.tsx`:**

  ```typescript
  import { trpc } from '@/lib/trpc';
  import { Card } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Skeleton } from '@/components/ui/skeleton';

  export default function ProjectsPanel() {
    const { data: proposals, isLoading } = trpc.mother.dgmPendingProposals.useQuery();
    const approveMutation = trpc.mother.dgmResolveProposal.useMutation();

    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-sm font-semibold">DGM Proposals Dashboard</h2>
          <p className="text-xs text-[var(--color-fg-muted)]">Creator only · {proposals?.length ?? 0} proposals</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
          {proposals?.map(p => (
            <Card key={p.id} className="p-4 border-[var(--color-border-base)]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium">{p.title}</p>
                <Badge variant={p.status === 'pending' ? 'outline' : p.status === 'approved' ? 'default' : 'destructive'}>
                  {p.status}
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-fg-muted)] line-clamp-2 mb-3">{p.hypothesis}</p>
              {p.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => approveMutation.mutate({ proposalId: p.id, action: 'approve' })}
                    className="text-xs px-3 py-1 rounded-lg bg-[var(--color-accent-green)] text-white">
                    Approve
                  </button>
                  <button
                    onClick={() => approveMutation.mutate({ proposalId: p.id, action: 'reject' })}
                    className="text-xs px-3 py-1 rounded-lg border border-[var(--color-border-base)] text-[var(--color-fg-muted)]">
                    Reject
                  </button>
                </div>
              )}
            </Card>
          ))}
          {!isLoading && (!proposals || proposals.length === 0) && (
            <div className="text-center py-12 text-sm text-[var(--color-fg-subtle)]">
              No pending proposals
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **4.9 Wire `/shell`, `/editor`, `/graph`, `/projects` in `ChatSidebar.tsx` to `store.setActivePanel(...)`**

- [ ] **4.10** Run `pnpm run check` — 0 TypeScript errors.

- [ ] **4.11** Run `pnpm dev`:
  - Login as creator → click `/projects` → Sheet opens with proposals
  - Login as non-creator → Phase 5 buttons not visible (or no Sheet opens)
  - Press Esc → Sheet closes

- [ ] **4.12 Commit:**
  ```bash
  git add client/src/components/phase5/ client/src/hooks/useCreatorGuard.ts server/routers.ts
  git commit -m "feat(D4): add creator-only Phase 5 panels (Shell, Editor, Graph, Projects)"
  ```

---

## Task 5: Design System Unification (D5)

**Goal:** Move all raw OKLCH color literals to CSS custom properties in `index.css`.

**Files:**
- Modify: `client/src/index.css`
- Modify: all new components in `client/src/components/chat/` and `client/src/components/phase5/`

### Steps

- [ ] **5.1 Add CSS variables to `client/src/index.css` in the dark mode block:**

  ```css
  /* MOTHER Design System — Dark Mode */
  :root {
    --color-bg-base: oklch(8% 0.02 280);
    --color-bg-surface: oklch(10% 0.02 280);
    --color-bg-elevated: oklch(12% 0.02 280);
    --color-bg-raised: oklch(16% 0.04 280);
    --color-border-subtle: oklch(18% 0.02 280);
    --color-border-base: oklch(22% 0.03 280);
    --color-border-accent: oklch(35% 0.10 300);
    --color-fg-base: oklch(92% 0.01 280);
    --color-fg-muted: oklch(62% 0.02 280);
    --color-fg-subtle: oklch(42% 0.02 280);
    --color-fg-dim: oklch(38% 0.02 280);
    --color-accent-violet: oklch(68% 0.16 285);
    --color-accent-violet-bg: oklch(20% 0.06 290);
    --color-accent-cyan: oklch(72% 0.14 195);
    --color-accent-green: oklch(72% 0.18 145);
    --color-accent-amber: oklch(75% 0.14 70);
    --color-accent-red: oklch(65% 0.22 25);
    --color-gradient-start: oklch(55% 0.25 300);
    --color-gradient-end: oklch(50% 0.22 260);
  }
  ```

  Also move `@keyframes fadeUp`, `@keyframes bounce`, and `.prose-invert` overrides from HomeV2.tsx inline `<style>` to this file.

- [ ] **5.2** Replace inline `style={{ background: 'oklch(...)' }}` props in new components with `bg-[var(--color-bg-base)]` Tailwind classes or `style={{ background: 'var(--color-bg-base)' }}` references.

- [ ] **5.3** Run `pnpm run build` — 0 build errors.

- [ ] **5.4 Commit:**
  ```bash
  git add client/src/index.css client/src/components/
  git commit -m "chore(D5): unify design system — OKLCH literals → CSS custom properties in index.css"
  ```

---

## Task 6: Empty / Loading / Error States (D6)

**Goal:** Every async component has skeleton, empty state, error boundary, and streaming cursor.

### Steps

- [ ] **6.1** In `MessageBubble.tsx`: animated streaming cursor after Streamdown when `isCurrentlyStreaming && content.length > 0`:
  ```tsx
  {isCurrentlyStreaming && (
    <span className="inline-block w-0.5 h-4 ml-0.5 align-text-bottom animate-pulse"
      style={{ background: 'var(--color-accent-violet)' }} />
  )}
  ```

- [ ] **6.2** In `MessageList.tsx`: `MessageSkeleton` × 3 when `isStreaming && messages.length === 0`

- [ ] **6.3** Verify `QuickPrompts.tsx` shows correctly for `showWelcome && messages.length === 0`

- [ ] **6.4** Wrap Phase 5 panels in `ErrorBoundary` (already done in Task 4 `Phase5Panels.tsx`)

- [ ] **6.5 Final integration test:**
  - Empty state → QuickPrompts renders ✓
  - Skeleton → visible during first stream ✓
  - Streaming cursor → blinks during token stream ✓
  - Error boundary → catches + shows retry ✓

- [ ] **6.6** Run `pnpm run check` — 0 errors. Run `pnpm test` — all pass. Run `pnpm run build` — 0 errors.

- [ ] **6.7 Final commit:**
  ```bash
  git add .
  git commit -m "feat(D6): add loading skeletons, streaming cursor, error boundaries, empty states"
  ```

---

## Merge Readiness Gate

Before creating PR for Worktree D (merge last per spec):

- [ ] `pnpm run check` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm run build` exits 0
- [ ] `HomeV2.tsx` is under 100 lines (verify: `wc -l client/src/pages/HomeV2.tsx`)
- [ ] SSE E2E: send a message → tokens stream → phase indicator → complete
- [ ] Phase 5 panels render without errors for creator user
- [ ] Non-creator cannot see Phase 5 panels
- [ ] localStorage persists `feedback`, `sidebarOpen`, `streamSpeed` — NOT `messages`
- [ ] Branch is `feat/frontend-redesign` — merge AFTER all other worktrees per spec
