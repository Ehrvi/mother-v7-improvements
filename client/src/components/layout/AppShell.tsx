/**
 * AppShell — 3-zone adaptive layout
 *
 * The root layout for the AI-semantic UX:
 *   Left Rail:  ChatSidebar (existing + product nav)
 *   Main Zone:  SemanticDisplayRouter (dynamic content)
 *   Right:      Phase5Panels (existing)
 *
 * Scientific basis:
 *   - Shneiderman (1996): Overview + Detail panels
 *   - Material Design 3: Adaptive layouts with persistent navigation
 *   - ISO 9241-11:2018: Usability = Effectiveness + Efficiency + Satisfaction
 */

import { useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useSSEStream } from '@/hooks/useSSEStream';
import { trpc } from '@/lib/trpc';
import ChatSidebar from '@/components/chat/ChatSidebar';
import SemanticDisplayRouter, { SemanticModeIndicator } from '@/components/SemanticDisplayRouter';
import Phase5Panels from '@/components/phase5/Phase5Panels';

export default function AppShell() {
  const store = useChatStore();
  const { sendMessage, stopStream } = useSSEStream();

  // Provider health (refetch every 5 min)
  const providerHealthQuery = trpc.mother.providerHealth.useQuery(
    { forceRefresh: false },
    { refetchInterval: 5 * 60 * 1000, staleTime: 4 * 60 * 1000 }
  );

  // System stats (refetch every 60s)
  const systemStatsQuery = trpc.mother.stats.useQuery(undefined, {
    refetchInterval: 60 * 1000, staleTime: 30 * 1000,
  });

  const motherVersion = systemStatsQuery.data?.version ?? 'v122.0';

  /** Handle send: supports text param or input field */
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
      {/* Left Rail: Sidebar */}
      <ChatSidebar
        onSendMessage={handleSend}
        motherVersion={motherVersion}
        providerHealth={providerHealthQuery.data as { allHealthy: boolean; providers: Array<{ provider: string; status: string; displayName?: string }> } | undefined}
      />

      {/* Main Zone: Semantic Display Router */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Semantic mode indicator bar */}
        <div
          className="flex items-center justify-between px-4 py-1.5 flex-shrink-0"
          style={{ borderBottom: '1px solid oklch(14% 0.02 280)', background: 'oklch(8% 0.02 280)' }}
        >
          <SemanticModeIndicator />
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono" style={{ color: 'oklch(38% 0.02 280)' }}>
              {motherVersion}
            </span>
          </div>
        </div>

        {/* Dynamic content area */}
        <SemanticDisplayRouter onSendMessage={handleSend} onStopStream={stopStream} />
      </main>

      {/* Right: Phase 5 panels (editor, shell, graph, projects) */}
      <Phase5Panels />
    </div>
  );
}
