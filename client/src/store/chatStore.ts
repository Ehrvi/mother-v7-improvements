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
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  clearMessages: () => void;
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
      partialize: (s) => ({
        feedback: s.feedback,
        sidebarOpen: s.sidebarOpen,
        streamSpeed: s.streamSpeed,
      }),
    }
  )
);
