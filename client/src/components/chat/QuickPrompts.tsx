/**
 * QuickPrompts v2 — Premium Welcome Hero
 *
 * Redesign: Animated gradient logo, staggered card entrance, glassmorphism cards
 * with hover lift effect. Centered vertically and horizontally.
 */

import { Brain, Dna, Code2, Sparkles, ArrowRight } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

const PROMPTS = [
  {
    icon: Brain,
    title: 'Arquitetura Cognitiva',
    desc: 'Como funciona o pipeline de 8 camadas?',
    query: 'Explique sua arquitetura cognitiva de 8 camadas e como cada uma contribui para o processamento.',
    gradient: 'linear-gradient(135deg, #7c3aed22, #6d28d922)',
    border: 'rgba(124, 58, 237, 0.2)',
    accent: '#a78bfa',
  },
  {
    icon: Dna,
    title: 'Darwin Gödel Machine',
    desc: 'Auto-evolução com provas formais',
    query: 'O que é o Darwin Gödel Machine e como ele te permite evoluir autonomamente?',
    gradient: 'linear-gradient(135deg, #06b6d422, #0891b222)',
    border: 'rgba(6, 182, 212, 0.2)',
    accent: '#22d3ee',
  },
  {
    icon: Code2,
    title: 'Code & Deploy',
    desc: 'Escreva, teste e deploy código',
    query: 'Me ajude a criar um novo componente React com TypeScript e testes unitários.',
    gradient: 'linear-gradient(135deg, #10b98122, #059669aa)',
    border: 'rgba(16, 185, 129, 0.2)',
    accent: '#34d399',
  },
  {
    icon: Sparkles,
    title: 'Pesquisa Científica',
    desc: 'arXiv, análise e síntese',
    query: 'Pesquise os últimos papers sobre retrieval-augmented generation no arXiv e faça uma síntese.',
    gradient: 'linear-gradient(135deg, #f59e0b22, #d9770622)',
    border: 'rgba(245, 158, 11, 0.2)',
    accent: '#fbbf24',
  },
];

interface QuickPromptsProps {
  onSendMessage: (text: string) => void;
}

export default function QuickPrompts({ onSendMessage }: QuickPromptsProps) {
  const { showWelcome, messages } = useChatStore();

  if (!showWelcome || messages.length > 0) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6 py-12">

      {/* Logo with glow */}
      <div className="relative mb-8 animate-scale-in">
        <div
          className="absolute inset-0 rounded-3xl blur-3xl"
          style={{ background: 'var(--gradient-glow)', transform: 'scale(3)', opacity: 0.6 }}
        />
        <div
          className="relative w-20 h-20 rounded-3xl flex items-center justify-center font-black text-3xl text-white"
          style={{
            background: 'var(--gradient-primary)',
            boxShadow: 'var(--shadow-glow-lg)',
            animation: 'float 6s ease-in-out infinite',
          }}
        >
          M
        </div>
      </div>

      {/* Title */}
      <h1
        className="text-4xl font-bold mb-2 animate-fade-in-up stagger-1"
        style={{
          background: 'linear-gradient(135deg, #f0f0ff 0%, #a78bfa 50%, #22d3ee 100%)',
          backgroundSize: '200% 200%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'gradient-shift 8s ease infinite, fade-in-up 0.6s var(--ease-out-expo) 0.05s both',
        }}
      >
        Como posso ajudar?
      </h1>

      <p className="text-sm mb-10 animate-fade-in-up stagger-2" style={{ color: 'var(--text-tertiary)', maxWidth: 400 }}>
        MOTHER · Sistema Cognitivo Autônomo com Darwin Gödel Machine
      </p>

      {/* Prompt Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {PROMPTS.map(({ icon: Icon, title, desc, query, gradient, border, accent }, i) => (
          <button
            key={title}
            onClick={() => onSendMessage(query)}
            className={`group relative flex flex-col gap-2 p-4 rounded-2xl text-left transition-all animate-fade-in-up stagger-${i + 2}`}
            style={{
              background: gradient,
              border: `1px solid ${border}`,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 8px 24px ${accent}22`;
              e.currentTarget.style.borderColor = accent;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.borderColor = border;
            }}
          >
            <div className="flex items-center justify-between">
              <Icon className="w-4.5 h-4.5" style={{ color: accent, width: 18, height: 18 }} />
              <ArrowRight
                className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                style={{ color: accent }}
              />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
