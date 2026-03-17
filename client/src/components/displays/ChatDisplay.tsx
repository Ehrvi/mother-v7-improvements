/**
 * ChatDisplay — Standard chat interface display component
 *
 * Extracted from HomeV2.tsx to work within the SemanticDisplayRouter.
 * This is the default display mode when no specific semantic context is detected.
 *
 * Contains: MessageList, QuickPrompts, StreamingInput
 */

import PhaseHeader from '@/components/chat/PhaseHeader';
import MessageList from '@/components/chat/MessageList';
import QuickPrompts from '@/components/chat/QuickPrompts';
import StreamingInput from '@/components/chat/StreamingInput';
import { SessionHistory } from '@/components/SessionHistory';
import { DGMTestPanel } from '@/components/DGMTestPanel';
import { useChatStore } from '@/store/chatStore';

interface ChatDisplayProps {
  onSendMessage: (text?: string) => void;
  onStopStream: () => void;
}

export default function ChatDisplay({ onSendMessage, onStopStream }: ChatDisplayProps) {
  const store = useChatStore();

  return (
    <>
      {/* Phase header (streaming status) */}
      <PhaseHeader sidebarOpen={store.sidebarOpen} motherVersion="" />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto relative">
        <MessageList onSendMessage={(text: string) => onSendMessage(text)} />
        <QuickPrompts onSendMessage={(text: string) => onSendMessage(text)} />
      </div>

      {/* Session history overlay */}
      {store.showSessionHistory && (
        <SessionHistory onSelectSession={() => store.setShowSessionHistory(false)} />
      )}

      {/* DGM test overlay */}
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

      {/* Input bar */}
      <StreamingInput onSend={() => onSendMessage()} onStop={onStopStream} />
    </>
  );
}
