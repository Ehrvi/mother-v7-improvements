/**
 * MOTHER v65.0 — Right Panel Component
 * 
 * Displays:
 * 1. Knowledge Wisdom Map — W(d) = K_MOTHER(d) / K_SoA(d) × 100%
 *    Scientific basis: Chase & Simon (1973), Ericsson (2006)
 * 
 * 2. DGM Proposals — with SM-2 re-proposal scheduling
 *    Scientific basis: Wozniak (1990), Kingdon (1984)
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Brain, Dna, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Zap } from 'lucide-react';

// ─── Domain labels ────────────────────────────────────────────────────────────
const DOMAIN_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  machine_learning:    { label: 'Machine Learning',    emoji: '🧠', color: '#a78bfa' },
  software_engineering:{ label: 'Eng. de Software',   emoji: '⚙️', color: '#60a5fa' },
  mathematics:         { label: 'Matemática',          emoji: '∑',  color: '#34d399' },
  cognitive_science:   { label: 'Ciência Cognitiva',  emoji: '🔬', color: '#f472b6' },
  philosophy:          { label: 'Filosofia',           emoji: '💡', color: '#fbbf24' },
  business:            { label: 'Negócios',            emoji: '📈', color: '#fb923c' },
  health_fitness:      { label: 'Saúde & Fitness',    emoji: '💪', color: '#4ade80' },
  general:             { label: 'Conhecimento Geral',  emoji: '🌐', color: '#94a3b8' },
};

// ─── Wisdom bar component ─────────────────────────────────────────────────────
function WisdomBar({ percent, color }: { percent: number; color: string }) {
  const clampedPct = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{
          width: `${clampedPct}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          boxShadow: `0 0 6px ${color}66`,
        }}
      />
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    pending:       { icon: <AlertCircle className="w-2.5 h-2.5" />, label: 'Pendente',    cls: 'bg-[rgba(251,191,36,0.12)] border-[rgba(251,191,36,0.3)] text-amber-400' },
    approved:      { icon: <CheckCircle className="w-2.5 h-2.5" />, label: 'Aprovada',    cls: 'bg-[rgba(52,211,153,0.12)] border-[rgba(52,211,153,0.3)] text-emerald-400' },
    implementing:  { icon: <Zap className="w-2.5 h-2.5" />,         label: 'Impl.',       cls: 'bg-[rgba(96,165,250,0.12)] border-[rgba(96,165,250,0.3)] text-blue-400' },
    rejected:      { icon: <XCircle className="w-2.5 h-2.5" />,     label: 'Rejeitada',   cls: 'bg-[rgba(248,113,113,0.12)] border-[rgba(248,113,113,0.3)] text-red-400' },
    deployed:      { icon: <CheckCircle className="w-2.5 h-2.5" />, label: 'Deployada',   cls: 'bg-[rgba(167,139,250,0.12)] border-[rgba(167,139,250,0.3)] text-violet-400' },
    failed:        { icon: <XCircle className="w-2.5 h-2.5" />,     label: 'Falhou',      cls: 'bg-[rgba(248,113,113,0.12)] border-[rgba(248,113,113,0.3)] text-red-400' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ─── Knowledge Section ────────────────────────────────────────────────────────
function KnowledgeSection() {
  const { data: wisdom, isLoading } = trpc.proposals.knowledgeWisdom.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const totalChunks = wisdom?.reduce((s, d) => s + d.motherChunks, 0) ?? 0;
  const avgWisdom = wisdom && wisdom.length > 0
    ? Math.round(wisdom.reduce((s, d) => s + d.wisdomPercent, 0) / wisdom.length * 10) / 10
    : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8888aa]">
            Mapa de Conhecimento
          </span>
        </div>
        <div className="text-[9px] text-[#55556a]">W(d) = K/SoA × 100</div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.2)] rounded-lg p-2 text-center">
          <div className="text-base font-bold text-[#a78bfa]">{totalChunks}</div>
          <div className="text-[9px] text-[#55556a]">Chunks Indexados</div>
        </div>
        <div className="bg-[rgba(52,211,153,0.08)] border border-[rgba(52,211,153,0.2)] rounded-lg p-2 text-center">
          <div className="text-base font-bold text-emerald-400">{avgWisdom}%</div>
          <div className="text-[9px] text-[#55556a]">Sabedoria Média</div>
        </div>
      </div>

      {/* Domain list */}
      {isLoading ? (
        <div className="text-[10px] text-[#55556a] text-center py-3 animate-pulse">Carregando domínios...</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {(wisdom ?? []).map((d) => {
            const meta = DOMAIN_LABELS[d.domain] ?? { label: d.domain, emoji: '📚', color: '#94a3b8' };
            return (
              <div key={d.domain} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{meta.emoji}</span>
                    <span className="text-[10px] font-medium text-[#c4b5fd]">{meta.label}</span>
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: meta.color }}>
                    {d.wisdomPercent}%
                  </span>
                </div>
                <WisdomBar percent={d.wisdomPercent} color={meta.color} />
                <div className="flex justify-between mt-1">
                  <span className="text-[8px] text-[#55556a]">{d.motherChunks} chunks</span>
                  <span className="text-[8px] text-[#55556a]">SoA: {d.soaEstimate.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Proposals Section ────────────────────────────────────────────────────────
function ProposalsSection() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: proposals, isLoading, refetch } = trpc.proposals.listWithReproposal.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const pending   = proposals?.filter(p => p.status === 'pending') ?? [];
  const rejected  = proposals?.filter(p => p.status === 'rejected') ?? [];
  const approved  = proposals?.filter(p => ['approved', 'implementing', 'deployed'].includes(p.status)) ?? [];

  const renderProposal = (p: any) => {
    const isOpen = expanded === p.id;
    return (
      <div
        key={p.id}
        className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg overflow-hidden"
      >
        <button
          className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(255,255,255,0.03)] transition-colors"
          onClick={() => setExpanded(isOpen ? null : p.id)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <StatusBadge status={p.status} />
              {p.parentProposalId && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-[rgba(96,165,250,0.1)] border border-[rgba(96,165,250,0.2)] text-blue-400">
                  Re-proposta #{p.rejectionCount}
                </span>
              )}
            </div>
            <div className="text-[10px] font-medium text-[#e8e8f0] leading-tight truncate">{p.title}</div>
            <div className="text-[9px] text-[#55556a] mt-0.5">
              Trigger: <span className="text-[#a78bfa]">{p.metricTrigger}</span>
            </div>
          </div>
          {isOpen ? <ChevronDown className="w-3 h-3 text-[#55556a] flex-shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-[#55556a] flex-shrink-0 mt-0.5" />}
        </button>

        {isOpen && (
          <div className="px-2.5 pb-2.5 flex flex-col gap-2 border-t border-[rgba(255,255,255,0.04)]">
            <p className="text-[9px] text-[#8888aa] leading-relaxed mt-2">{p.description}</p>

            {/* Metric progress */}
            <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-2">
              <div className="text-[9px] text-[#55556a] mb-1">Progresso da Métrica</div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-red-400">{p.metricValue?.toFixed(1)}</span>
                <div className="flex-1 h-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (p.metricValue / p.metricTarget) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-emerald-400">{p.metricTarget?.toFixed(1)}</span>
              </div>
            </div>

            {/* Re-proposal info for rejected */}
            {p.status === 'rejected' && p.nextReproposalAt && (
              <div className="bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.15)] rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <RefreshCw className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[9px] font-semibold text-amber-400">Re-proposta Agendada (SM-2)</span>
                </div>
                <div className="text-[9px] text-[#8888aa]">
                  Em <span className="text-amber-300 font-semibold">{p.reproposalDaysRemaining}d</span>
                  {' '}· EF: {p.efFactor?.toFixed(2)} · Rejeições: {p.rejectionCount}
                </div>
                {p.improvementNotes && (
                  <div className="mt-1.5 text-[8px] text-[#55556a] italic leading-relaxed">
                    💡 {p.improvementNotes}
                  </div>
                )}
              </div>
            )}

            {/* Scientific basis */}
            {p.scientificBasis && (
              <div className="text-[8px] text-[#55556a] italic">
                📚 {p.scientificBasis.substring(0, 120)}...
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Dna className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8888aa]">
            Propostas DGM
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="text-[9px] text-[#55556a] hover:text-[#a78bfa] transition-colors"
          title="Atualizar"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="text-[10px] text-[#55556a] text-center py-3 animate-pulse">Carregando propostas...</div>
      ) : (
        <>
          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <div className="text-[9px] text-amber-400 font-semibold mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" />
                Aguardando Aprovação ({pending.length})
              </div>
              <div className="flex flex-col gap-1.5">{pending.map(renderProposal)}</div>
            </div>
          )}

          {/* Approved/Implementing */}
          {approved.length > 0 && (
            <div>
              <div className="text-[9px] text-emerald-400 font-semibold mb-1.5 flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" />
                Aprovadas / Em Execução ({approved.length})
              </div>
              <div className="flex flex-col gap-1.5">{approved.map(renderProposal)}</div>
            </div>
          )}

          {/* Rejected with re-proposal */}
          {rejected.length > 0 && (
            <div>
              <div className="text-[9px] text-red-400 font-semibold mb-1.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                Rejeitadas — Re-proposta Agendada ({rejected.length})
              </div>
              <div className="flex flex-col gap-1.5">{rejected.map(renderProposal)}</div>
            </div>
          )}

          {(!proposals || proposals.length === 0) && (
            <div className="text-[10px] text-[#55556a] text-center py-4">
              Nenhuma proposta DGM ainda.<br />
              <span className="text-[9px]">O motor DGM gera propostas após 10 queries.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main RightPanel ──────────────────────────────────────────────────────────
export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'proposals'>('proposals');

  return (
    <aside
      className="w-[260px] flex-shrink-0 flex flex-col border-l border-[rgba(124,58,237,0.15)] overflow-hidden"
      style={{ background: 'rgba(10,10,20,0.95)' }}
    >
      {/* Tab bar */}
      <div className="flex border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        {(['proposals', 'knowledge'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-[#a78bfa] border-b-2 border-[#a78bfa]'
                : 'text-[#55556a] hover:text-[#8888aa]'
            }`}
          >
            {tab === 'proposals' ? '🧬 DGM' : '🧠 Conhecimento'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'proposals' ? <ProposalsSection /> : <KnowledgeSection />}
      </div>
    </aside>
  );
}
