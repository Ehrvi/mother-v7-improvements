import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'mother';
  content: string;
  timestamp: Date;
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
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

const MotherContext = createContext<MotherContextType | undefined>(undefined);

const MOTHER_API_URL = 'http://34.151.187.1:5000';

export function MotherProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('mother_messages');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isTyping, setIsTyping] = useState(false);
  const [apolloStats, setApolloStats] = useState<ApolloStats | null>({
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

  const sendMessage = useCallback(async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    setMessages(prev => {
      const updated = [...prev, userMessage];
      localStorage.setItem('mother_messages', JSON.stringify(updated));
      return updated;
    });

    // Show typing indicator
    setIsTyping(true);

    try {
      // Call Mother's API
      const response = await fetch(`${MOTHER_API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: content }),
      });

      if (!response.ok) {
        throw new Error('Mother API error');
      }

      const data = await response.json();

      // Add Mother's response
      const motherMessage: Message = {
        id: `mother-${Date.now()}`,
        role: 'mother',
        content: data.response || data.message || 'I received your message.',
        timestamp: new Date(),
      };

      setMessages(prev => {
        const updated = [...prev, motherMessage];
        localStorage.setItem('mother_messages', JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error('Error communicating with Mother:', error);
      
      // Add error message
      const errorMessage: Message = {
        id: `mother-${Date.now()}`,
        role: 'mother',
        content: 'I apologize, but I encountered an error processing your message. Please try again.',
        timestamp: new Date(),
      };

      setMessages(prev => {
        const updated = [...prev, errorMessage];
        localStorage.setItem('mother_messages', JSON.stringify(updated));
        return updated;
      });
    } finally {
      setIsTyping(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    localStorage.removeItem('mother_messages');
  }, []);

  return (
    <MotherContext.Provider value={{ messages, isTyping, apolloStats, sendMessage, clearMessages }}>
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
