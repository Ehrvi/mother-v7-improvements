/**
 * KnowledgeDisplay — Lex-Mining Advisor knowledge view
 *
 * Full-page knowledge map showing UDC taxonomy, KAI/KRI/KCI gauges,
 * and RAG memory entries. Extracted and enhanced from RightPanel.tsx.
 *
 * Covers: Persistent Memory, Taxonomy, RAG retrieval, Compliance indexing
 */

import {
  Brain, BookOpen, Layers, Search, Database, FileText
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

/** UDC taxonomy domains from the existing knowledge map */
const KNOWLEDGE_DOMAINS = [
  { id: '0', name: 'Ciência & Conhecimento', emoji: '🔬', articles: 12, progress: 75 },
  { id: '1', name: 'Filosofia & Psicologia', emoji: '🧠', articles: 8, progress: 45 },
  { id: '2', name: 'Religião & Teologia', emoji: '📿', articles: 3, progress: 20 },
  { id: '3', name: 'Ciências Sociais', emoji: '🏛️', articles: 15, progress: 60 },
  { id: '4', name: 'Linguística', emoji: '💬', articles: 6, progress: 35 },
  { id: '5', name: 'Ciências Naturais', emoji: '🌿', articles: 22, progress: 85 },
  { id: '6', name: 'Tecnologia & Engenharia', emoji: '⚙️', articles: 45, progress: 92 },
  { id: '7', name: 'Artes', emoji: '🎨', articles: 4, progress: 15 },
  { id: '8', name: 'Literatura', emoji: '📚', articles: 5, progress: 25 },
  { id: '9', name: 'História & Geografia', emoji: '🌍', articles: 10, progress: 40 },
];

export default function KnowledgeDisplay() {
  const knowledgeQuery = trpc.mother.knowledge.useQuery({ limit: 6 });
  const ragEntries = knowledgeQuery.data || [];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto" style={{ background: 'var(--void-deepest, oklch(6% 0.02 280))' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid oklch(18% 0.02 280)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, oklch(55% 0.22 320), oklch(45% 0.18 285))' }}
          >
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'oklch(92% 0.01 280)' }}>
              Lex-Mining Advisor
            </h1>
            <p className="text-xs" style={{ color: 'oklch(52% 0.02 280)' }}>
              LLM + RAG + Memória Persistente · Taxonomia UDC
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'oklch(14% 0.04 285)', border: '1px solid oklch(22% 0.06 285)' }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: 'oklch(55% 0.02 280)' }} />
          <input
            type="text"
            placeholder="Buscar no conhecimento..."
            className="bg-transparent border-none outline-none text-xs"
            style={{ color: 'oklch(82% 0.02 280)', width: 180 }}
          />
        </div>
      </div>

      {/* KAI / KRI / KCI gauges */}
      <div className="grid grid-cols-3 gap-4 px-6 py-5">
        {[
          { label: 'KAI', name: 'Knowledge Acquisition', value: 87, color: 'oklch(65% 0.18 195)' },
          { label: 'KRI', name: 'Knowledge Retention', value: 92, color: 'oklch(72% 0.18 145)' },
          { label: 'KCI', name: 'Knowledge Coverage', value: 64, color: 'oklch(75% 0.14 70)' },
        ].map(g => (
          <div
            key={g.label}
            className="rounded-xl p-4 text-center"
            style={{ background: 'oklch(10% 0.02 280)', border: '1px solid oklch(18% 0.02 280)' }}
          >
            <div className="text-3xl font-bold mb-1" style={{ color: g.color }}>{g.value}%</div>
            <div className="text-xs font-semibold" style={{ color: 'oklch(72% 0.02 280)' }}>{g.label}</div>
            <div className="text-[10px]" style={{ color: 'oklch(48% 0.02 280)' }}>{g.name}</div>
          </div>
        ))}
      </div>

      {/* Domain grid */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4" style={{ color: 'oklch(68% 0.16 285)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'oklch(82% 0.02 280)' }}>
            Taxonomia UDC — Domínios de Conhecimento
          </h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {KNOWLEDGE_DOMAINS.map(d => (
            <div
              key={d.id}
              className="rounded-xl p-4 transition-all cursor-pointer"
              style={{
                background: 'oklch(10% 0.02 280)',
                border: '1px solid oklch(18% 0.02 280)',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'oklch(35% 0.10 285)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'oklch(18% 0.02 280)')}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{d.emoji}</span>
                <span className="text-xs font-semibold" style={{ color: 'oklch(78% 0.02 280)' }}>{d.name}</span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px]" style={{ color: 'oklch(48% 0.02 280)' }}>
                  <Database className="w-3 h-3 inline mr-1" />{d.articles} artigos
                </span>
                <span className="text-[10px] font-mono font-bold" style={{ color: 'oklch(68% 0.16 285)' }}>{d.progress}%</span>
              </div>
              <div className="w-full h-1 rounded-full" style={{ background: 'oklch(16% 0.02 280)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${d.progress}%`, background: 'oklch(58% 0.18 285)' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RAG Memory section */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4" style={{ color: 'oklch(68% 0.16 285)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'oklch(82% 0.02 280)' }}>
            Memória Persistente (RAG)
          </h3>
          {knowledgeQuery.isLoading && <div className="text-xs animate-pulse text-purple-400 ml-auto">Consultando vector database...</div>}
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'oklch(10% 0.02 280)', border: '1px solid oklch(18% 0.02 280)' }}
        >
          <div className="space-y-2">
            {ragEntries.length === 0 && !knowledgeQuery.isLoading && (
              <div className="text-xs text-center p-4 text-white/50">Nenhuma entrada recente carregada na memória do RAG.</div>
            )}
            {ragEntries.map(e => (
              <div
                key={e.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: 'oklch(12% 0.02 280)' }}
              >
                <div className="flex items-center gap-2 overflow-hidden mr-4">
                   <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'oklch(55% 0.02 280)' }} />
                   <span className="text-xs truncate" style={{ color: 'oklch(72% 0.02 280)' }}>
                     {e.content.slice(0, 80) + (e.content.length > 80 ? '...' : '')}
                   </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] px-1.5 py-0.5 rounded uppercase" style={{
                    background: 'oklch(20% 0.06 285)',
                    color: 'oklch(65% 0.14 285)',
                  }}>
                    {e.category || 'TEXT'}
                  </span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: 'oklch(72% 0.18 145)' }}>
                    ID: {e.id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
