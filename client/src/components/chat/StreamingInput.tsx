/**
 * StreamingInput v2 — Prominent Glowing Input Bar
 *
 * Redesign:
 *   - Centered, max-width constrained
 *   - Purple glow aura on focus
 *   - Gradient send button
 *   - Clean status line (no speed calibrator clutter)
 *   - Entrance animation
 */

import { useRef, useState } from 'react';
import { Paperclip, Send, Square, ArrowUp } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import { FileDropZone } from '@/components/FileDropZone';

interface StreamingInputProps {
  onSend: () => void;
  onStop: () => void;
}

export default function StreamingInput({ onSend, onStop }: StreamingInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const store = useChatStore();
  const { input, isStreaming, showDropZone, fileContext } = store;
  const [focused, setFocused] = useState(false);

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    store.setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <div
      className="flex-shrink-0 px-6 pb-5 pt-3 animate-fade-in-up"
      style={{ background: 'linear-gradient(to top, var(--bg-void) 60%, transparent)' }}
    >
      <div className="max-w-2xl mx-auto">

        {/* File drop zone */}
        {showDropZone && (
          <div className="mb-3">
            <ErrorBoundary componentName="FileDropZone">
              <FileDropZone
                onFilesProcessed={(content: string) => {
                  store.setFileContext(store.fileContext ? `${store.fileContext}\n\n${content}` : content);
                  store.setShowDropZone(false);
                }}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* File context badge */}
        {fileContext && (
          <div
            className="mb-3 px-3 py-2 flex items-center gap-2 rounded-xl"
            style={{ background: 'var(--accent-primary-dim)', border: '1px solid var(--border-accent)' }}
          >
            <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(fileContext.length / 1000)}k chars anexados
            </span>
            <button
              onClick={() => { store.setFileContext(''); store.setShowDropZone(false); }}
              className="ml-auto text-[10px] px-2 py-0.5 rounded-md"
              style={{ color: 'var(--text-tertiary)', background: 'var(--bg-elevated)' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ═══ Input Box with Glow ═══ */}
        <div
          className="relative rounded-2xl transition-all"
          style={{
            boxShadow: focused
              ? '0 0 0 1px var(--accent-primary), var(--shadow-glow-md)'
              : '0 0 0 1px var(--border-default)',
            background: 'var(--bg-surface)',
            transitionDuration: 'var(--duration-normal)',
          }}
        >
          {/* Glow aura behind (only on focus) */}
          {focused && (
            <div
              className="absolute -inset-1 rounded-3xl pointer-events-none"
              style={{
                background: 'var(--gradient-glow)',
                filter: 'blur(20px)',
                opacity: 0.5,
              }}
            />
          )}

          <div className="relative flex items-end gap-2 px-4 py-3">
            {/* Attach */}
            <button
              onClick={() => store.setShowDropZone(!showDropZone)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: showDropZone ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              title="Anexar arquivo"
              aria-label="Anexar arquivo"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Pergunte algo à MOTHER..."
              rows={1}
              disabled={isStreaming}
              aria-label="Message input"
              data-chat-input="true"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
                resize: 'none', minHeight: 24, maxHeight: 160, lineHeight: 1.6,
                padding: '2px 0',
              }}
            />

            {/* Send / Stop */}
            {isStreaming ? (
              <button
                onClick={onStop}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl transition-all"
                style={{ background: 'var(--error)', color: 'white' }}
                title="Parar geração"
                aria-label="Parar geração"
              >
                <Square className="w-3 h-3" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!input.trim()}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl transition-all disabled:opacity-30"
                style={{
                  background: input.trim() ? 'var(--gradient-primary)' : 'var(--bg-elevated)',
                  color: 'white',
                  boxShadow: input.trim() ? 'var(--shadow-glow-sm)' : 'none',
                }}
                title="Enviar (Enter)"
                aria-label="Enviar mensagem"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Status line */}
        <div className="flex items-center justify-center mt-2 gap-2">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Enter para enviar · Shift+Enter nova linha
          </span>
        </div>
      </div>
    </div>
  );
}
