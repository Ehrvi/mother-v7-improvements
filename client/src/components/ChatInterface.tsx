/**
 * ChatInterface.tsx — Main chat display with onboarding welcome screen
 * C227/C228 | Conselho v98 | 2026-03-10
 *
 * Gaps fixed (Diagnóstico UX/UI Chain 2):
 * - GAP-9: Version hardcoded "v12.0" → "v120.0" (versão correta)
 * - GAP-3: Ausência de onboarding → welcome screen com capacidades e exemplos
 * - GAP-7: Terminologia técnica → linguagem acessível ao usuário
 * - Texto em inglês → PT-BR
 *
 * Scientific basis:
 * - Nielsen (1994) H10: Help and documentation — onboarding reduces cognitive load
 * - Langevin et al. (CHI 2021): CUI heuristics — conversational agents need capability disclosure
 * - Fogg (2003) Persuasive Technology: first impression determines engagement
 */

import { useRef, useEffect } from 'react';
import { useMother } from '@/contexts/MotherContext';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { Brain, Database, Shield, Zap } from 'lucide-react';

// C227: Onboarding capability cards — disclose what MOTHER can do
const CAPABILITY_CARDS = [
  {
    icon: Brain,
    title: 'Análise Cognitiva',
    description: 'Respondo perguntas complexas com raciocínio multi-etapa e fontes científicas.',
    example: 'Explique o Teorema de Bayes com um exemplo prático',
  },
  {
    icon: Database,
    title: 'Dados Apollo',
    description: 'Acesso a 11.861 empresas APAC com análise de mercado e qualificação de leads.',
    example: 'Quais são as melhores empresas de mineração na Austrália?',
  },
  {
    icon: Shield,
    title: 'Monitoramento SHMS',
    description: 'Sistema de monitoramento geotécnico com sensores virtuais e alertas GISTM 2020.',
    example: 'Qual é o status atual dos sensores de vibração?',
  },
  {
    icon: Zap,
    title: 'Auto-Aperfeiçoamento',
    description: 'Aprendo com cada interação e melhoro continuamente via DGM (Darwin Gödel Machine).',
    example: 'Como você avalia suas próprias limitações?',
  },
];

export default function ChatInterface() {
  const { messages, isTyping, sendMessage } = useMother();
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
        /* C227: Onboarding welcome screen */
        <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-8">
          {/* Logo/avatar */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Brain className="w-10 h-10 text-white" />
          </div>

          {/* C228: Correct version string */}
          <div>
            <h2 className="text-2xl font-bold text-foreground">MOTHER v120.0</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sistema de Inteligência Artificial Autônoma — IntellTech
            </p>
          </div>

          {/* C227: Capability disclosure */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-2">
            {CAPABILITY_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.title}
                  onClick={() => sendMessage(card.example)}
                  className="text-left p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-blue-300 transition-all group cursor-pointer"
                  title={`Experimentar: ${card.example}`}
                  aria-label={`Iniciar conversa sobre ${card.title}: ${card.example}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                      <Icon className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{card.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {card.description}
                      </p>
                      <p className="text-xs text-blue-500 mt-1.5 truncate italic">
                        "{card.example}"
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Clique em um cartão para começar ou digite sua pergunta abaixo.
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
