import { Bot } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <div className="flex gap-3">
      {/* Mother's Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <Bot className="w-5 h-5 text-white" />
      </div>

      {/* Typing Animation */}
      <div className="flex items-center px-4 py-3 rounded-2xl bg-card border border-blue-500/30 shadow-lg shadow-blue-500/10">
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
