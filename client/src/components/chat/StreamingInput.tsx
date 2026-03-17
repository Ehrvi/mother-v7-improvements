import { useRef } from 'react';
import { Paperclip, Send, Square } from 'lucide-react';
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
  const { input, isStreaming, showDropZone, streamSpeed, stats, fileContext } = store;

  const avgQuality = stats.qualityScores.length > 0
    ? Math.round(stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length) : null;

  const lastModel = store.messages.filter(m => m.role === 'mother' && m.modelName).slice(-1)[0]?.modelName || null;

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    store.setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  return (
    <div className="flex-shrink-0 px-4 pb-4 pt-2" style={{ background: 'oklch(9% 0.02 280)' }}>
      <div className="max-w-3xl mx-auto">

        {/* File drop zone */}
        {showDropZone && (
          <div className="mb-2">
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

        {/* File context indicator */}
        {fileContext && (
          <div className="mb-2 px-3 py-2 flex items-center gap-2 rounded-xl border" style={{ borderColor: 'oklch(18% 0.02 280)', background: 'oklch(10% 0.02 280)' }}>
            <Paperclip className="w-3.5 h-3.5" style={{ color: 'oklch(68% 0.16 285)' }} />
            <span className="text-xs" style={{ color: 'oklch(68% 0.02 280)' }}>
              Arquivo(s) anexado(s) · {Math.round(fileContext.length / 1000)}k chars
            </span>
            <button onClick={() => { store.setFileContext(''); store.setShowDropZone(false); }}
              className="ml-auto text-xs px-2 py-0.5 rounded"
              style={{ color: 'oklch(62% 0.02 280)', background: 'oklch(18% 0.02 280)' }}>
              Remover
            </button>
          </div>
        )}

        {/* Input box */}
        <div className="flex items-end gap-2 px-4 py-3 rounded-2xl"
          style={{
            background: 'oklch(12% 0.02 280)',
            border: '1px solid oklch(22% 0.03 280)',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocusCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = 'oklch(40% 0.12 290)';
            el.style.boxShadow = '0 0 0 2px oklch(30% 0.08 290)';
          }}
          onBlurCapture={e => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.borderColor = 'oklch(22% 0.03 280)';
            el.style.boxShadow = 'none';
          }}
        >
          {/* File attach */}
          <button
            onClick={() => store.setShowDropZone(!showDropZone)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
            style={{ color: showDropZone ? 'oklch(68% 0.16 285)' : 'oklch(45% 0.02 280)' }}
            title="Anexar arquivo"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKey}
            placeholder="Pergunte algo à MOTHER..."
            rows={1}
            disabled={isStreaming}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'oklch(88% 0.02 280)', fontSize: 14, fontFamily: 'inherit',
              resize: 'none', minHeight: 22, maxHeight: 160, lineHeight: 1.5,
              padding: 0,
            }}
          />

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isStreaming ? (
              <button
                onClick={onStop}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{ background: 'oklch(40% 0.18 25)', color: 'white' }}
                title="Parar"
              >
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!input.trim()}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))', color: 'white' }}
                onMouseEnter={e => { if (!(e.currentTarget as HTMLButtonElement).disabled) e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
                title="Enviar (Enter)"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Speed calibrator */}
        <div className="flex items-center gap-1 mt-2 mb-1">
          <span className="text-[9px] uppercase tracking-wider mr-1" style={{ color: 'oklch(38% 0.02 280)' }}>Vel.:</span>
          {([0.5, 1, 1.5, 2] as const).map(s => (
            <button key={s}
              onClick={() => store.setStreamSpeed(s)}
              title={s === 0.5 ? 'Devagar' : s === 1 ? 'Normal' : s === 1.5 ? 'Rápido' : 'Instantâneo'}
              style={{
                padding: '2px 7px', borderRadius: 5, fontSize: '10px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.15s',
                border: `1px solid ${streamSpeed === s ? '#a78bfa' : 'rgba(124,58,237,0.2)'}`,
                background: streamSpeed === s ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.06)',
                color: streamSpeed === s ? '#a78bfa' : 'oklch(42% 0.02 280)',
                fontWeight: streamSpeed === s ? 700 : 400,
              }}>
              {s}×
            </button>
          ))}
        </div>

        {/* Bottom status bar */}
        <div className="flex items-center justify-between mt-1 px-1">
          <p className="text-[10px]" style={{ color: 'oklch(38% 0.02 280)' }}>
            Enter para enviar · Shift+Enter nova linha
          </p>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: 'oklch(42% 0.02 280)' }}>
            {stats.msgCount > 0 && <span>{stats.msgCount} msgs · ${stats.totalCost.toFixed(5)}</span>}
            {avgQuality && <span style={{ color: avgQuality >= 80 ? 'oklch(65% 0.18 145)' : 'oklch(65% 0.14 70)' }}>Q:{avgQuality}%</span>}
            {lastModel && <span>{lastModel}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
