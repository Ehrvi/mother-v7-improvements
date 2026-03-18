/**
 * AIAnalysisChat.tsx — Cognitive AI chat panel
 * Endpoint: POST /analyze
 *
 * Cognitive real-time element: NLP interface to the SHMS Cognitive Bridge.
 * Users query the system in natural language; AI returns structured analysis
 * backed by Digital Twin, G-Eval, and LSTM predictions.
 */
import { useShmsAnalyze } from '@/hooks/useShmsApi';
import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

export default function AIAnalysisChat({ structureId }: { structureId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: '🧠 Olá! Sou o assistente cognitivo do SHMS. Pergunte sobre a saúde estrutural, previsões, análises de risco, ou solicite recomendações. Utilizo Digital Twin, Neural EKF, e G-Eval para embasar minhas respostas.', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const analyze = useShmsAnalyze();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    const query = input.trim();
    setInput('');

    analyze.mutate({ structureId: structureId || 'all', query }, {
      onSuccess: (resp: any) => {
        const aiContent = resp?.analysis ?? resp?.response ?? resp?.message ?? JSON.stringify(resp);
        setMessages(prev => [...prev, { role: 'ai', content: typeof aiContent === 'string' ? aiContent : JSON.stringify(aiContent, null, 2), timestamp: new Date().toISOString() }]);
      },
      onError: (err: any) => {
        setMessages(prev => [...prev, { role: 'ai', content: `❌ Erro na análise: ${err.message}`, timestamp: new Date().toISOString() }]);
      },
    });
  };

  return (
    <div className="shms-animate-slide-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div className="shms-section-header">
        <span className="shms-section-header__title">🧠 AI Cognitiva — Cognitive Bridge</span>
        <span className="shms-badge shms-badge--blue">Digital Twin + G-Eval + LSTM</span>
      </div>

      {/* Chat messages */}
      <div className="shms-card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="shms-card__body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--shms-sp-3)' }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: 'var(--shms-sp-3)',
              borderRadius: 'var(--shms-radius)',
              background: m.role === 'user' ? 'var(--shms-accent-bg)' : 'var(--shms-bg-2)',
              border: `1px solid ${m.role === 'user' ? 'var(--shms-accent-border)' : 'var(--shms-border)'}`,
            }}>
              <div style={{ fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)', marginBottom: 4 }}>
                {m.role === 'user' ? '👤 Você' : '🧠 AI'} • {new Date(m.timestamp).toLocaleTimeString('pt-BR')}
              </div>
              <div style={{ fontSize: 'var(--shms-fs-sm)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.content}</div>
            </div>
          ))}
          {analyze.isPending && (
            <div style={{ alignSelf: 'flex-start', padding: 'var(--shms-sp-3)', fontSize: 'var(--shms-fs-sm)', color: 'var(--shms-text-dim)' }}>
              🧠 Analisando via Cognitive Bridge...
              <div className="shms-skeleton" style={{ height: 8, width: 60, marginTop: 4, borderRadius: 4 }} />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid var(--shms-border)', padding: 'var(--shms-sp-3)', display: 'flex', gap: 'var(--shms-sp-2)' }}>
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Pergunte sobre saúde estrutural, RUL, risco, estabilidade..."
            className="shms-btn" style={{ flex: 1, textAlign: 'left' }}
            disabled={analyze.isPending}
          />
          <button className="shms-btn shms-btn--accent" onClick={send} disabled={analyze.isPending || !input.trim()}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
