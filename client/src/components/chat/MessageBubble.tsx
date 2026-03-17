import { Streamdown } from 'streamdown';
import type { MermaidConfig } from 'mermaid';
import { Cpu, Shield, TrendingDown, Zap } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useChatStore, type Message } from '@/store/chatStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import InteractiveMermaid from '@/components/InteractiveMermaid';
import { splitMermaidBlocks } from '@/lib/splitMermaidBlocks';
import { getFollowUpChips } from '@/lib/followUpChips';

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
  msg: Message;
  isCurrentlyStreaming: boolean;
  isLastMotherMessage: boolean;
  onSendMessage: (text: string) => void;
}

function MetricsBar({ msg }: { msg: Message }) {
  if (!msg.tier) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-0.5">
      <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
        style={{ background: 'oklch(20% 0.06 290)', border: '1px solid oklch(28% 0.08 290)', color: 'oklch(68% 0.16 285)' }}>
        <Cpu className="w-2.5 h-2.5" />{msg.modelName || msg.tier}
      </span>
      {msg.qualityScore !== undefined && (() => {
        const q = msg.qualityScore!;
        const c = q >= 80 ? 'oklch(72% 0.18 145)' : q >= 70 ? 'oklch(75% 0.14 70)' : 'oklch(65% 0.22 25)';
        const bg = q >= 80 ? 'oklch(16% 0.06 145)' : q >= 70 ? 'oklch(16% 0.06 70)' : 'oklch(16% 0.06 25)';
        const border = q >= 80 ? 'oklch(25% 0.08 145)' : q >= 70 ? 'oklch(25% 0.08 70)' : 'oklch(25% 0.08 25)';
        return (
          <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
            style={{ background: bg, border: `1px solid ${border}`, color: c }}>
            <Shield className="w-2.5 h-2.5" />{q >= 80 ? '' : q >= 70 ? '' : '⚠ '}{q}%
          </span>
        );
      })()}
      {msg.cost !== undefined && (
        <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
          style={{ background: 'oklch(16% 0.06 70)', border: '1px solid oklch(25% 0.08 70)', color: 'oklch(75% 0.14 70)' }}>
          <TrendingDown className="w-2.5 h-2.5" />${msg.cost.toFixed(6)}
        </span>
      )}
      {msg.responseTime !== undefined && (
        <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
          style={{ background: 'oklch(16% 0.06 260)', border: '1px solid oklch(25% 0.08 260)', color: 'oklch(65% 0.14 260)' }}>
          <Zap className="w-2.5 h-2.5" />{(msg.responseTime / 1000).toFixed(1)}s
        </span>
      )}
      {msg.cacheHit && (
        <span className="text-[10px] px-2 py-1 rounded-md"
          style={{ background: 'oklch(20% 0.06 290)', border: '1px solid oklch(28% 0.08 290)', color: 'oklch(68% 0.16 285)' }}>
          ⚡ Cache
        </span>
      )}
    </div>
  );
}

export default function MessageBubble({ msg, isCurrentlyStreaming, isLastMotherMessage, onSendMessage }: MessageBubbleProps) {
  const store = useChatStore();
  const { feedback } = store;
  const submitFeedbackMutation = trpc.mother.submitFeedback.useMutation();

  const hasMermaid = !isCurrentlyStreaming && /```mermaid/i.test(msg.content);
  const segments = hasMermaid ? splitMermaidBlocks(msg.content) : null;

  return (
    <div
      className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
      style={{ animation: 'fadeUp 0.2s ease' }}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5"
        style={msg.role === 'mother'
          ? { background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))', color: 'white' }
          : { background: 'oklch(22% 0.06 260)', color: 'oklch(72% 0.12 260)' }
        }
      >
        {msg.role === 'mother' ? 'M' : 'U'}
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-2 min-w-0 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

        {msg.role === 'user' ? (
          <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
            style={{
              background: 'oklch(22% 0.06 260)',
              border: '1px solid oklch(30% 0.08 260)',
              color: 'oklch(88% 0.02 280)',
            }}>
            {msg.content}
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none w-full" style={{ color: 'oklch(88% 0.02 280)' }}>
            {segments ? (
              segments.map((seg, i) => seg.type === 'mermaid' ? (
                <ErrorBoundary key={i} componentName="InteractiveMermaid">
                  <InteractiveMermaid chart={seg.content} mermaidConfig={MERMAID_CONFIG} />
                </ErrorBoundary>
              ) : seg.content.trim() ? (
                <ErrorBoundary key={i} componentName="Streamdown">
                  <Streamdown
                    shikiTheme={['github-dark', 'github-dark']}
                    className="text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_code]:text-[13px] [&_pre]:text-[13px] [&_blockquote]:border-l-2 [&_table]:text-sm"
                  >
                    {seg.content}
                  </Streamdown>
                </ErrorBoundary>
              ) : null)
            ) : (
              <ErrorBoundary componentName="Streamdown">
                <Streamdown
                  key={isCurrentlyStreaming ? `${msg.id}-streaming` : `${msg.id}-final`}
                  mermaidConfig={MERMAID_CONFIG}
                  isAnimating={isCurrentlyStreaming}
                  parseIncompleteMarkdown={isCurrentlyStreaming}
                  shikiTheme={['github-dark', 'github-dark']}
                  className="text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_code]:text-[13px] [&_pre]:text-[13px] [&_blockquote]:border-l-2 [&_table]:text-sm"
                >
                  {msg.content}
                </Streamdown>
              </ErrorBoundary>
            )}

            {/* Streaming cursor */}
            {isCurrentlyStreaming && msg.content.length > 0 && (
              <span
                className="inline-block w-0.5 h-4 ml-0.5 align-text-bottom animate-pulse"
                style={{ background: 'var(--color-accent-violet, oklch(68% 0.16 285))' }}
              />
            )}
          </div>
        )}

        {/* Streaming indicator (empty content) */}
        {msg.role === 'mother' && isCurrentlyStreaming && msg.content === '' && (
          <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
            style={{ background: 'oklch(12% 0.02 280)', border: '1px solid oklch(18% 0.02 280)' }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                background: 'oklch(68% 0.16 285)',
                animation: `bounce 1.4s ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Metrics bar */}
        <MetricsBar msg={msg} />

        <span className="text-[10px]" style={{ color: 'oklch(38% 0.02 280)' }}>
          {msg.timestamp instanceof Date
            ? msg.timestamp.toLocaleTimeString()
            : new Date(msg.timestamp).toLocaleTimeString()}
        </span>

        {/* Follow-up chips + feedback — last completed MOTHER message only */}
        {msg.role === 'mother' && msg.content && isLastMotherMessage && (
          <div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {getFollowUpChips(msg.content).map(chip => (
                <button key={chip}
                  onClick={() => onSendMessage(chip)}
                  className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                  style={{
                    border: '1px solid oklch(28% 0.08 290)',
                    background: 'oklch(14% 0.04 290)',
                    color: 'oklch(68% 0.16 285)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'oklch(20% 0.06 290)';
                    e.currentTarget.style.borderColor = 'oklch(45% 0.12 290)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'oklch(14% 0.04 290)';
                    e.currentTarget.style.borderColor = 'oklch(28% 0.08 290)';
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
            {/* Feedback buttons */}
            <div className="flex items-center gap-1 mt-1.5">
              {(['up', 'down'] as const).map(dir => (
                <button key={dir}
                  onClick={() => {
                    if (feedback[msg.id] !== dir) {
                      store.setFeedback(msg.id, dir);
                      submitFeedbackMutation.mutate({ queryId: msg.id, feedback: dir });
                    }
                  }}
                  title={dir === 'up' ? 'Boa resposta' : 'Resposta ruim'}
                  style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${feedback[msg.id] === dir ? (dir === 'up' ? 'oklch(55% 0.18 145)' : 'oklch(55% 0.18 25)') : 'oklch(22% 0.02 280)'}`,
                    background: feedback[msg.id] === dir ? (dir === 'up' ? 'oklch(20% 0.08 145)' : 'oklch(20% 0.08 25)') : 'transparent',
                    color: feedback[msg.id] === dir ? (dir === 'up' ? 'oklch(65% 0.18 145)' : 'oklch(65% 0.18 25)') : 'oklch(38% 0.02 280)',
                    transition: 'all 0.15s',
                  }}>
                  {dir === 'up' ? '👍' : '👎'}
                </button>
              ))}
              {feedback[msg.id] && (
                <span className="text-[10px] ml-1" style={{ color: 'oklch(50% 0.02 280)' }}>
                  {feedback[msg.id] === 'up' ? 'Obrigado pelo feedback!' : 'Vou melhorar.'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
