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

      {/* Input bar */}
      <StreamingInput onSend={() => onSendMessage()} onStop={onStopStream} />
    </>
  );
}
