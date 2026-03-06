/**
 * MessageBubble.tsx — Ciclo 173 — MOTHER v81.7
 * Rich rendering: Mermaid (Sveidqvist 2014) + KaTeX (Khan Academy 2013) + Shiki (Pine Wu 2021)
 * via streamdown v1.4.0 — streaming-optimized markdown renderer
 */
import { Message } from '@/contexts/MotherContext';
import { Streamdown } from 'streamdown';
import type { MermaidConfig } from 'mermaid';
import { Bot, User, Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';

// Mermaid dark theme aligned with MOTHER cyberpunk design system
const MERMAID_CONFIG: MermaidConfig = {
  theme: 'dark',
  themeVariables: {
    primaryColor: '#B026FF',
    primaryTextColor: '#E0B3FF',
    primaryBorderColor: '#00F5FF',
    lineColor: '#00F5FF',
    secondaryColor: '#1a1a2e',
    tertiaryColor: '#0A0E1A',
    background: '#0A0E1A',
    mainBkg: '#1a1a2e',
    nodeBorder: '#B026FF',
    titleColor: '#E0B3FF',
    fontFamily: 'JetBrains Mono, monospace',
  },
};

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message.content]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-secondary/20 border border-secondary/40'
          : 'bg-gradient-to-br from-purple-900/60 to-cyan-900/40 border border-purple-500/40'
      }`}>
        {isUser ? (
          <User className="w-5 h-5 text-secondary" />
        ) : (
          <Bot className="w-5 h-5 text-purple-400" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Role label */}
        <span className={`text-xs font-medium mb-1 px-1 ${
          isUser ? 'text-secondary/70' : 'text-purple-400/70'
        }`}>
          {isUser ? 'You' : 'MOTHER'}
        </span>

        {/* Bubble */}
        <div className={`relative px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-secondary/10 border border-secondary/20 text-foreground'
            : 'bg-card/80 border border-purple-500/20 text-card-foreground shadow-lg shadow-purple-500/5'
        }`}>
          {/* Copy button — appears on hover */}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
              title="Copy response"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-green-400" />
                : <Copy className="w-3.5 h-3.5 text-muted-foreground/60" />
              }
            </button>
          )}

          {/* Rich content via Streamdown v1.4.0 */}
          {/* Supports: Mermaid diagrams, KaTeX math, Shiki syntax highlighting, GFM tables */}
          <div className="prose prose-sm prose-invert max-w-none">
            <Streamdown mermaidConfig={MERMAID_CONFIG}>
              {message.content}
            </Streamdown>
          </div>
        </div>

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground/50 mt-1 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
