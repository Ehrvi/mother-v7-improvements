import { Message } from '@/contexts/MotherContext';
import { Streamdown } from 'streamdown';
import { Bot, User } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
        isUser ? 'bg-secondary' : 'bg-gradient-to-br from-blue-500 to-purple-600'
      }`}>
        {isUser ? (
          <User className="w-5 h-5 text-foreground" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl ${
          isUser 
            ? 'bg-secondary text-foreground' 
            : 'bg-card border border-blue-500/30 text-card-foreground shadow-lg shadow-blue-500/10'
        }`}>
          <div className="prose prose-sm prose-invert max-w-none">
            <Streamdown>{message.content}</Streamdown>
          </div>
        </div>
        <span className="text-xs text-muted-foreground mt-1 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
