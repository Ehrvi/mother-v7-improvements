/**
 * MotherContext.tsx — Global state for MOTHER chat interface
 * C226 | Conselho v98 | 2026-03-10
 *
 * Gaps fixed (Diagnóstico UX/UI Chain 2):
 * - GAP-5: Added stopGeneration() — Nielsen H3: User control and freedom
 * - GAP-5: Added regenerateLastMessage() — allows retry without re-typing
 * - GAP-2: Added lastResponseFromCache flag — cache transparency for users
 * - GAP-8: Error messages now in PT-BR (not English)
 *
 * Scientific basis:
 * - Nielsen (1994) H3: User control and freedom — emergency exits
 * - Nielsen (1994) H1: Visibility of system status — cache transparency
 * - Langevin et al. (CHI 2021): CUI heuristics — abort controls required
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'mother';
  content: string;
  timestamp: Date;
  fromCache?: boolean;  // C226: track cache origin for transparency
}

export interface ApolloStats {
  totalCompanies: number;
  topCountries: Array<{ country: string; score: number; companies: number }>;
  dataQualityIssues: number;
}

interface MotherContextType {
  messages: Message[];
  isTyping: boolean;
  apolloStats: ApolloStats | null;
  lastResponseFromCache: boolean;  // C226: cache indicator
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;      // C226: stop/abort
  regenerateLastMessage: () => Promise<void>;  // C226: regenerate
  clearMessages: () => void;
}

const MotherContext = createContext<MotherContextType | undefined>(undefined);

// Use the production MOTHER API (Cloud Run)
const MOTHER_API_URL = typeof window !== 'undefined' ? '' : 'http://localhost:3000';

export function MotherProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('mother_messages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isTyping, setIsTyping] = useState(false);
  const [lastResponseFromCache, setLastResponseFromCache] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');

  const [apolloStats] = useState<ApolloStats | null>({
    totalCompanies: 11861,
    topCountries: [
      { country: 'Indonesia', score: 52.5, companies: 1617 },
      { country: 'Philippines', score: 46.5, companies: 1124 },
      { country: 'Malaysia', score: 44.9, companies: 1105 },
      { country: 'Australia', score: 44.7, companies: 1541 },
      { country: 'South Korea', score: 42.7, companies: 454 },
    ],
    dataQualityIssues: 3,
  });

  const sendMessage = useCallback(async (content: string, skipUserMessage = false) => {
    if (!skipUserMessage) {
      lastUserMessageRef.current = content;
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages(prev => {
        const updated = [...prev, userMessage];
        try { localStorage.setItem('mother_messages', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }

    setIsTyping(true);
    setLastResponseFromCache(false);

    // C226: Create AbortController for Stop functionality
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${MOTHER_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        response?: string;
        message?: string;
        cacheHit?: boolean;
        fromCache?: boolean;
      };

      // C226: Track cache origin
      const fromCache = !!(data.cacheHit || data.fromCache);
      setLastResponseFromCache(fromCache);

      const motherMessage: Message = {
        id: `mother-${Date.now()}`,
        role: 'mother',
        content: data.response || data.message || 'Recebi sua mensagem.',
        timestamp: new Date(),
        fromCache,
      };

      setMessages(prev => {
        const updated = [...prev, motherMessage];
        try { localStorage.setItem('mother_messages', JSON.stringify(updated)); } catch {}
        return updated;
      });
    } catch (error) {
      // C226: Don't show error if user intentionally stopped
      if (error instanceof Error && error.name === 'AbortError') {
        const stoppedMessage: Message = {
          id: `mother-${Date.now()}`,
          role: 'mother',
          content: '⏹ Geração interrompida pelo usuário.',
          timestamp: new Date(),
        };
        setMessages(prev => {
          const updated = [...prev, stoppedMessage];
          try { localStorage.setItem('mother_messages', JSON.stringify(updated)); } catch {}
          return updated;
        });
        return;
      }

      console.error('[MOTHER] Erro ao comunicar com o servidor:', error);

      // C226: PT-BR error messages (GAP-8 fix)
      const errorMessage: Message = {
        id: `mother-${Date.now()}`,
        role: 'mother',
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.',
        timestamp: new Date(),
      };

      setMessages(prev => {
        const updated = [...prev, errorMessage];
        try { localStorage.setItem('mother_messages', JSON.stringify(updated)); } catch {}
        return updated;
      });
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  }, []);

  // C226: Stop generation — aborts current fetch request
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // C226: Regenerate last message — removes last MOTHER response and re-sends last user message
  const regenerateLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current || isTyping) return;

    // Remove last MOTHER message
    setMessages(prev => {
      const lastMotherIdx = [...prev].reverse().findIndex(m => m.role === 'mother');
      if (lastMotherIdx === -1) return prev;
      const actualIdx = prev.length - 1 - lastMotherIdx;
      const updated = prev.filter((_, i) => i !== actualIdx);
      try { localStorage.setItem('mother_messages', JSON.stringify(updated)); } catch {}
      return updated;
    });

    // Re-send last user message (skip adding user message again)
    await sendMessage(lastUserMessageRef.current, true);
  }, [isTyping, sendMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    lastUserMessageRef.current = '';
    setLastResponseFromCache(false);
    try { localStorage.removeItem('mother_messages'); } catch {}
  }, []);

  return (
    <MotherContext.Provider value={{
      messages,
      isTyping,
      apolloStats,
      lastResponseFromCache,
      sendMessage,
      stopGeneration,
      regenerateLastMessage,
      clearMessages,
    }}>
      {children}
    </MotherContext.Provider>
  );
}

export function useMother() {
  const context = useContext(MotherContext);
  if (context === undefined) {
    throw new Error('useMother must be used within a MotherProvider');
  }
  return context;
}
