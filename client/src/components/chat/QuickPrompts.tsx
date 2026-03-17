import { Brain, Dna, Database, BarChart3, Sparkles } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

const QUICK_PROMPTS = [
  { icon: Brain, label: 'Arquitetura cognitiva', query: 'Explique sua arquitetura cognitiva de 7 camadas e como cada uma contribui para o processamento.' },
  { icon: Dna, label: 'Darwin Gödel Machine', query: 'O que é o Darwin Gödel Machine e como ele te permite evoluir e melhorar autonomamente?' },
  { icon: Database, label: 'Memória A-MEM', query: 'Como funciona seu sistema de memória A-MEM com links Zettelkasten e importance scoring?' },
  { icon: BarChart3, label: 'GEA & Fitness', query: 'Explique o sistema GEA (Group-Evolving Agents) e como o fitness score é calculado.' },
  { icon: Sparkles, label: 'Visão final', query: 'Qual é a visão final de MOTHER como superinteligência cognitiva autônoma?' },
];

interface QuickPromptsProps {
  onSendMessage: (text: string) => void;
}

export default function QuickPrompts({ onSendMessage }: QuickPromptsProps) {
  const { showWelcome, messages } = useChatStore();

  if (!showWelcome || messages.length > 0) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 py-8 px-4">
      <div>
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center font-black text-4xl text-white mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))' }}>
          M
        </div>
        <h2 className="text-3xl font-bold mb-2" style={{ color: 'oklch(92% 0.01 280)' }}>MOTHER</h2>
        <p className="text-base" style={{ color: 'oklch(62% 0.02 280)' }}>Sistema Cognitivo Autônomo · Darwin Gödel Machine</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {QUICK_PROMPTS.map(({ icon: Icon, label, query }) => (
          <button key={label}
            onClick={() => onSendMessage(query)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all"
            style={{
              background: 'oklch(12% 0.03 285)',
              border: '1px solid oklch(20% 0.04 285)',
              color: 'oklch(82% 0.04 280)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'oklch(16% 0.05 285)';
              e.currentTarget.style.borderColor = 'oklch(45% 0.12 285)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'oklch(12% 0.03 285)';
              e.currentTarget.style.borderColor = 'oklch(20% 0.04 285)';
            }}
          >
            <Icon className="w-5 h-5 flex-shrink-0" style={{ color: 'oklch(68% 0.16 285)' }} />
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: 'oklch(42% 0.02 280)' }}>
        Enter para enviar · Shift+Enter para nova linha · Paperclip para arquivos
      </p>
    </div>
  );
}
