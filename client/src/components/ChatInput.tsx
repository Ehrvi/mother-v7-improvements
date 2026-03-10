/**
 * ChatInput.tsx — Chat input with Stop/Regenerar controls and cache indicator
 * C226 | Conselho v98 | 2026-03-10
 *
 * Gaps fixed (Diagnóstico UX/UI Chain 2):
 * - GAP-5: Ausência de controle de geração (Stop / Regenerar) — CRÍTICA
 * - GAP-2: Cache semântico sem indicador visual — ALTA
 * - Placeholder em inglês ("Type your message") → PT-BR
 *
 * Scientific basis:
 * - Nielsen Heuristic H3: User control and freedom — users need Stop and Undo
 * - Nielsen Heuristic H1: Visibility of system status — cache hits must be visible
 * - Langevin et al. (CHI 2021): CUI heuristics — conversational agents need abort controls
 */

import { useState, KeyboardEvent } from 'react';
import { useMother } from '@/contexts/MotherContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Square, RotateCcw, Zap } from 'lucide-react';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const { sendMessage, isTyping, stopGeneration, regenerateLastMessage, lastResponseFromCache } = useMother();

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    stopGeneration?.();
  };

  const handleRegenerate = async () => {
    await regenerateLastMessage?.();
  };

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
      {/* C226: Cache indicator — shown when last response came from semantic cache */}
      {lastResponseFromCache && !isTyping && (
        <div className="container max-w-4xl mx-auto mb-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
          <Zap className="w-3 h-3 flex-shrink-0" />
          <span>
            Resposta do cache semântico — pode não cobrir todos os aspectos da pergunta.{' '}
            <button
              onClick={handleRegenerate}
              className="underline hover:text-amber-800 font-medium"
            >
              Gerar nova resposta
            </button>
          </span>
        </div>
      )}

      <div className="container max-w-4xl mx-auto flex gap-3 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem para MOTHER... (Enter para enviar, Shift+Enter para nova linha)"
          className="min-h-[60px] max-h-[200px] resize-none bg-card border-border focus:border-blue-500 transition-colors"
          disabled={isTyping}
          aria-label="Campo de mensagem para MOTHER"
        />

        <div className="flex flex-col gap-2">
          {/* C226: Stop button — shown while generating */}
          {isTyping ? (
            <Button
              onClick={handleStop}
              size="lg"
              variant="outline"
              className="h-[60px] px-4 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 transition-all"
              title="Parar geração (Esc)"
              aria-label="Parar geração de resposta"
            >
              <Square className="w-5 h-5 fill-current" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              size="lg"
              className="h-[60px] px-6 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
              title="Enviar mensagem (Enter)"
              aria-label="Enviar mensagem"
            >
              <Send className="w-5 h-5" />
            </Button>
          )}

          {/* C226: Regenerate button — shown after a response, not while generating */}
          {!isTyping && regenerateLastMessage && (
            <Button
              onClick={handleRegenerate}
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all text-xs"
              title="Regenerar última resposta"
              aria-label="Regenerar última resposta"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Regenerar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
