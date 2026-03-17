import { useEffect, useRef, useMemo } from 'react';
import { useChatStore } from '@/store/chatStore';
import { Skeleton } from '@/components/ui/skeleton';
import MessageBubble from './MessageBubble';

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

interface MessageListProps {
  onSendMessage: (text: string) => void;
}

export default function MessageList({ onSendMessage }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const store = useChatStore();
  const { messages, isStreaming, streamingMsgId } = store;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const visibleMessages = useMemo(() => messages.filter(msg => {
    if (msg.role === 'mother' && msg.content === '' && isStreaming && msg.id === streamingMsgId) return false;
    if (msg.role === 'mother' && msg.content === '') return false;
    return true;
  }), [messages, isStreaming, streamingMsgId]);

  // Show skeleton when streaming with no messages yet
  if (isStreaming && messages.length === 0) {
    return (
      <div className="px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <MessageSkeleton />
          <MessageSkeleton />
          <MessageSkeleton />
          <div ref={messagesEndRef} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {visibleMessages.map((msg, msgIdx) => {
          const isCurrentlyStreaming = isStreaming && msg.id === streamingMsgId;
          const isLastMother = msg.role === 'mother' && msg.content && msgIdx === visibleMessages.length - 1 && !isStreaming;
          return (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isCurrentlyStreaming={isCurrentlyStreaming}
              isLastMotherMessage={Boolean(isLastMother)}
              onSendMessage={onSendMessage}
            />
          );
        })}

        {/* Typing indicator */}
        {isStreaming && visibleMessages[visibleMessages.length - 1]?.role === 'user' && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm text-white"
              style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))' }}>M</div>
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
              style={{ background: 'oklch(12% 0.02 280)', border: '1px solid oklch(18% 0.02 280)' }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                  background: 'oklch(68% 0.16 285)',
                  animation: `bounce 1.4s ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
