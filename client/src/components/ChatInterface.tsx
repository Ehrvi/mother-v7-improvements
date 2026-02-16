import { useEffect, useRef } from 'react';
import { useMother } from '@/contexts/MotherContext';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

export default function ChatInterface() {
  const { messages, isTyping } = useMother();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 animate-pulse" />
          <h2 className="text-2xl font-bold text-foreground">Mother v12.0</h2>
          <p className="text-muted-foreground max-w-md">
            Your autonomous AI system for Apollo Project management and Intelltech expansion.
            Ask me anything about the 11,861 companies in the APAC database.
          </p>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isTyping && <TypingIndicator />}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
