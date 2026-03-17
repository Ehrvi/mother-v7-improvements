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
import { SessionHistory } from '@/components/SessionHistory';
import { DGMTestPanel } from '@/components/DGMTestPanel';

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
      <ChatSidebar
        onSendMessage={handleSend}
        motherVersion={motherVersion}
        providerHealth={providerHealthQuery.data as { allHealthy: boolean; providers: Array<{ provider: string; status: string; displayName?: string }> } | undefined}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <PhaseHeader sidebarOpen={store.sidebarOpen} motherVersion={motherVersion} />
        <div className="flex-1 overflow-y-auto relative">
          <MessageList onSendMessage={handleSend} />
          <QuickPrompts onSendMessage={handleSend} />
        </div>
        {store.showSessionHistory && (
          <SessionHistory onSelectSession={() => store.setShowSessionHistory(false)} />
        )}
        {store.showDGMTest && (
          <div
            onClick={() => store.setShowDGMTest(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
          >
            <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '720px', width: '100%' }}>
              <button
                onClick={() => store.setShowDGMTest(false)}
                style={{
                  position: 'absolute', top: -12, right: -12, zIndex: 10,
                  background: '#2d2d4e', border: '1px solid #4040a0', borderRadius: '50%',
                  width: 28, height: 28, color: '#e0e0ff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700,
                }}
              >
                X
              </button>
              <DGMTestPanel />
            </div>
          </div>
        )}
        <StreamingInput onSend={() => handleSend()} onStop={stopStream} />
      </main>
      <Phase5Panels />
    </div>
  );
}
