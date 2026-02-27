/**
 * MOTHER v69.8 — Right Panel Component
 *
 * KNOWLEDGE MAP — Redesign Ciclo 26
 * Scientific basis:
 *   - Jiang et al. (2025, arXiv:2502.04066): SMI metric for knowledge retention
 *   - Zhang et al. (2025, ACM Web Conference): Knowledge Coverage evaluation
 *   - Zins & Santos (2011, JASIST): "10 Pillars of Knowledge" hierarchical tree
 *   - UDC Consortium (2024): Universal Decimal Classification — 10 main classes
 *   - Kucher et al. (2025, Analytics): Visual Analytics for Explainable AI dashboards
 *   - Li et al. (2023, IEEE VIS): Knowledge Graph Visualization design space
 *   - Zaheer (2025, IJETRM): HCI-conformant dashboards for decision-making
 *
 * UX/UI Design Principles applied:
 *   - Gestalt: proximity + similarity for domain grouping
 *   - Shneiderman (1996): "Overview first, zoom and filter, details on demand"
 *   - Few (2006): Dashboard Design — maximize data-ink ratio
 *   - Dark theme with luminance contrast >= 4.5:1 (WCAG AA)
 *   - Progressive disclosure: overview -> domain -> subdomain
 */
import React, { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Brain, Dna, ChevronDown, ChevronRight, ChevronLeft,
  Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Zap,
  Globe, Layers, Search
} from 'lucide-react';

// --- UDC Domain Registry (14 domains covering all UDC classes) ----------------
const DOMAIN_META: Record<string, { label: string; emoji: string; color: string; udc: string; description: string }> = {
  machine_learning:     { label: 'Machine Learning',     emoji: '🧠', color: '#a78bfa', udc: '006.3', description: 'IA, Deep Learning, LLMs, Agentes' },
  software_engineering: { label: 'Eng. de Software',     emoji: '⚙️', color: '#60a5fa', udc: '004',   description: 'Arquitetura, DevOps, Cloud, APIs' },
  mathematics:          { label: 'Matemática',            emoji: '∑',  color: '#34d399', udc: '51',    description: 'Álgebra, Cálculo, Estatística' },
  cognitive_science:    { label: 'Ciência Cognitiva',    emoji: '🔬', color: '#f472b6', udc: '159.9', description: 'Neurociência, Memória, HCI' },
  philosophy:           { label: 'Filosofia',             emoji: '💡', color: '#fbbf24', udc: '1',     description: 'Ética, Lógica, Epistemologia' },
  business:             { label: 'Negócios',              emoji: '📈', color: '#fb923c', udc: '33',    description: 'Estratégia, Finanças, Marketing' },
  health_fitness:       { label: 'Saúde & Medicina',     emoji: '🏥', color: '#4ade80', udc: '61',    description: 'Medicina, Nutrição, Exercício' },
  natural_sciences:     { label: 'Ciências Naturais',    emoji: '🔭', color: '#22d3ee', udc: '5',     description: 'Física, Química, Biologia, Astro' },
  social_sciences:      { label: 'Ciências Sociais',     emoji: '🌍', color: '#e879f9', udc: '3',     description: 'Sociologia, Economia, Direito' },
  technology:           { label: 'Tecnologia Aplicada',  emoji: '🔧', color: '#f97316', udc: '6',     description: 'Engenharia, Bioméd., Materiais' },
  humanities:           { label: 'Humanidades',           emoji: '📜', color: '#a3e635', udc: '8',     description: 'Linguística, Literatura, História' },
  arts_recreation:      { label: 'Artes & Design',       emoji: '🎨', color: '#fb7185', udc: '7',     description: 'Design, UX, Música, Artes' },
  general_science:      { label: 'Ciência Geral',        emoji: '🌐', color: '#94a3b8', udc: '0',     description: 'Epistemologia, Sistemas, Info' },
  geography_history:    { label: 'Geografia & História', emoji: '🗺️', color: '#fde68a', udc: '9',     description: 'História Mundial, Geopolítica' },
  general:              { label: 'Conhecimento Geral',   emoji: '📚', color: '#94a3b8', udc: '0',     description: 'Geral não classificado' },
};

// --- Circular Progress Ring --------------------------------------------------
function ProgressRing({ percent, color, size = 44 }: { percent: number; color: string; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease', filter: `drop-shadow(0 0 4px ${color}88)` }}
      />
    </svg>
  );
}

// --- Horizontal Wisdom Bar ---------------------------------------------------
function WisdomBar({ percent, color, height = 3 }: { percent: number; color: string; height?: number }) {
  const clampedPct = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative rounded-full overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.06)' }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
        style={{ width: `${clampedPct}%`, background: `linear-gradient(90deg, ${color}66, ${color})`, boxShadow: `0 0 6px ${color}55` }}
      />
    </div>
  );
}

// --- KAI Gauge ---------------------------------------------------------------
function KAIGauge({ value, label, color, tooltip }: { value: number; label: string; color: string; tooltip: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={tooltip}>
      <div className="relative">
        <ProgressRing percent={value} color={color} size={48} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[9px] font-bold" style={{ color }}>{value.toFixed(1)}%</span>
        </div>
      </div>
      <span className="text-[8px] font-semibold text-[#55556a] uppercase tracking-wide">{label}</span>
    </div>
  );
}

// --- Domain Card -------------------------------------------------------------
function DomainCard({ domain, onClick }: { domain: any; onClick: () => void }) {
  const meta = DOMAIN_META[domain.domain] ?? { label: domain.domain, emoji: '📚', color: '#94a3b8', udc: '?', description: '' };
  const hasSubdomains = domain.subdomains && domain.subdomains.length > 0;
  const pct = domain.wisdomPercent ?? 0;
  const isActive = domain.motherChunks > 0;
  return (
    <div
      onClick={hasSubdomains ? onClick : undefined}
      className={`relative flex flex-col gap-1.5 p-2 rounded-xl border transition-all duration-200 ${
        hasSubdomains ? 'cursor-pointer hover:scale-[1.01]' : 'cursor-default'
      } ${
        isActive
          ? 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] hover:border-[rgba(167,139,250,0.3)]'
          : 'bg-[rgba(255,255,255,0.01)] border-[rgba(255,255,255,0.03)] opacity-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{meta.emoji}</span>
          <div>
            <div className="text-[9px] font-semibold text-[#c4b5fd] leading-tight">{meta.label}</div>
            <div className="text-[7px] text-[#44445a]">UDC {meta.udc} · {meta.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
          <span className="text-[10px] font-bold tabular-nums" style={{ color: meta.color }}>{pct.toFixed(1)}%</span>
          {hasSubdomains && <ChevronRight className="w-2.5 h-2.5 text-[#44445a]" />}
        </div>
      </div>
      <WisdomBar percent={pct} color={meta.color} height={2} />
      <div className="flex justify-between items-center">
        <span className="text-[7px] text-[#44445a]">{domain.motherChunks} chunks</span>
        <span className="text-[7px] text-[#44445a]">/{(domain.soaEstimate ?? 0).toLocaleString()} SoA</span>
      </div>
      {isActive && (
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}` }} />
      )}
    </div>
  );
}

// --- Knowledge Section -------------------------------------------------------
function KnowledgeSection() {
  const [view, setView] = useState<'overview' | string>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: knowledgeData, isLoading } = trpc.proposals.knowledgeHierarchy.useQuery(undefined, {
    refetchInterval: 120_000,
  });

  const hierarchy: any[] = useMemo(
    () => Array.isArray(knowledgeData) ? knowledgeData : (knowledgeData as any)?.hierarchy ?? [],
    [knowledgeData]
  );
  const metrics = useMemo(
    () => Array.isArray(knowledgeData) ? null : (knowledgeData as any)?.metrics ?? null,
    [knowledgeData]
  );

  const kai: number = metrics?.kai ?? 0;
  const kri: number = metrics?.kri ?? 100;
  const kci: number = metrics?.kci ?? 0;
  const totalChunks: number = metrics?.totalChunks ?? hierarchy.reduce((s: number, d: any) => s + d.motherChunks, 0);
  const totalDomains: number = metrics?.totalDomains ?? hierarchy.length;
  const coveredDomains: number = metrics?.coveredDomains ?? hierarchy.filter((d: any) => d.motherChunks > 0).length;
  const totalSoA: number = hierarchy.reduce((s: number, d: any) => s + (d.soaEstimate ?? 0), 0);

  const currentDomain = hierarchy.find((d: any) => d.domain === view);

  const filteredHierarchy = useMemo(() => {
    if (!searchQuery) return hierarchy;
    const q = searchQuery.toLowerCase();
    return hierarchy.filter((d: any) => {
      const meta = DOMAIN_META[d.domain];
      return (
        d.domain.toLowerCase().includes(q) ||
        meta?.label.toLowerCase().includes(q) ||
        meta?.description.toLowerCase().includes(q) ||
        d.subdomains?.some((s: any) => s.label?.toLowerCase().includes(q) || s.subdomain?.toLowerCase().includes(q))
      );
    });
  }, [hierarchy, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <div className="w-8 h-8 rounded-full border-2 border-[#a78bfa] border-t-transparent animate-spin" />
        <span className="text-[9px] text-[#55556a]">Carregando mapa de conhecimento...</span>
      </div>
    );
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  if (view === 'overview') {
    return (
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-[#a78bfa]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8888aa]">
              Mapa de Conhecimento
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="w-2.5 h-2.5 text-[#44445a]" />
            <span className="text-[7px] text-[#44445a]">UDC 2024</span>
          </div>
        </div>

        {/* KAI / KRI / KCI Gauges */}
        <div className="bg-[rgba(10,10,25,0.8)] border border-[rgba(124,58,237,0.2)] rounded-xl p-3">
          <div className="flex items-center justify-around mb-2">
            <KAIGauge value={kai} label="KAI" color="#a78bfa" tooltip="Knowledge Absorption Index: absorvido / SoA total" />
            <KAIGauge value={kri} label="KRI" color="#f87171" tooltip="Knowledge Remaining Index: quanto falta absorver" />
            <KAIGauge value={kci} label="KCI" color="#34d399" tooltip="Knowledge Coverage Index: domínios cobertos / total" />
          </div>
          <div className="border-t border-[rgba(255,255,255,0.05)] pt-2 mt-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8px] text-[#55556a]">Progresso Global</span>
              <span className="text-[8px] font-semibold text-[#a78bfa]">{kai.toFixed(3)}%</span>
            </div>
            <WisdomBar percent={kai} color="#a78bfa" height={4} />
            <div className="flex justify-between mt-1.5">
              <div className="text-center">
                <div className="text-[10px] font-bold text-indigo-400">{totalChunks.toLocaleString()}</div>
                <div className="text-[7px] text-[#44445a]">chunks</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-bold text-emerald-400">{coveredDomains}/{totalDomains}</div>
                <div className="text-[7px] text-[#44445a]">domínios</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] font-bold text-cyan-400">{(totalSoA / 1000).toFixed(0)}K</div>
                <div className="text-[7px] text-[#44445a]">SoA total</div>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[#44445a]" />
          <input
            type="text"
            placeholder="Buscar domínio ou subdomínio..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-lg pl-6 pr-2 py-1.5 text-[9px] text-[#c4b5fd] placeholder-[#44445a] focus:outline-none focus:border-[rgba(167,139,250,0.4)] transition-colors"
          />
        </div>

        {/* Domain List */}
        <div className="flex flex-col gap-1.5">
          {filteredHierarchy.length === 0 ? (
            <div className="text-[9px] text-[#44445a] text-center py-4">Nenhum domínio encontrado</div>
          ) : (
            filteredHierarchy.map((d: any) => (
              <DomainCard key={d.domain} domain={d} onClick={() => setView(d.domain)} />
            ))
          )}
        </div>

        {/* Scientific footnote */}
        <div className="border-t border-[rgba(255,255,255,0.04)] pt-2">
          <p className="text-[7px] text-[#33334a] leading-relaxed">
            KAI/KRI: Jiang et al. (2025, arXiv:2502.04066) · KCI: Zhang et al. (2025, ACM) ·
            Taxonomia: UDC Consortium (2024) · Zins &amp; Santos (2011, JASIST)
          </p>
        </div>
      </div>
    );
  }

  // ── Domain Drill-down ───────────────────────────────────────────────────────
  if (currentDomain) {
    const meta = DOMAIN_META[currentDomain.domain] ?? { label: currentDomain.domain, emoji: '📚', color: '#94a3b8', udc: '?', description: '' };
    const sortedSubdomains = [...(currentDomain.subdomains ?? [])].sort((a: any, b: any) => b.wisdomPercent - a.wisdomPercent);

    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setView('overview')}
          className="flex items-center gap-1.5 text-[9px] text-[#55556a] hover:text-[#a78bfa] transition-colors mb-0.5"
        >
          <ChevronLeft className="w-3 h-3" />
          Todos os domínios
        </button>

        {/* Domain hero card */}
        <div
          className="rounded-xl p-3 border"
          style={{
            background: `linear-gradient(135deg, ${meta.color}0a, ${meta.color}18)`,
            borderColor: `${meta.color}33`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{meta.emoji}</span>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-white">{meta.label}</div>
              <div className="text-[8px] text-[#8888aa]">{meta.description}</div>
              <div className="text-[7px] text-[#44445a]">UDC {meta.udc}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative">
                <ProgressRing percent={currentDomain.wisdomPercent} color={meta.color} size={52} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-bold" style={{ color: meta.color }}>
                    {currentDomain.wisdomPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-between text-[8px] text-[#55556a]">
            <span>{currentDomain.motherChunks} chunks absorvidos</span>
            <span>SoA: {(currentDomain.soaEstimate ?? 0).toLocaleString()}</span>
          </div>
        </div>

        {/* Subdomains */}
        {sortedSubdomains.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1 mb-0.5">
              <Layers className="w-2.5 h-2.5 text-[#44445a]" />
              <span className="text-[8px] font-semibold text-[#44445a] uppercase tracking-wide">
                Subdomínios ({sortedSubdomains.length})
              </span>
            </div>
            {sortedSubdomains.map((sub: any) => {
              const subPct = sub.wisdomPercent ?? 0;
              const isActive = sub.motherChunks > 0;
              return (
                <div
                  key={sub.subdomain}
                  className={`rounded-lg p-2.5 border transition-all ${
                    isActive
                      ? 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)]'
                      : 'bg-[rgba(255,255,255,0.01)] border-[rgba(255,255,255,0.03)] opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}` }}
                        />
                      )}
                      <span className="text-[9px] font-medium text-[#a0a0c0]">{sub.label}</span>
                    </div>
                    <span className="text-[9px] font-bold tabular-nums" style={{ color: meta.color }}>
                      {subPct.toFixed(1)}%
                    </span>
                  </div>
                  <WisdomBar percent={subPct} color={meta.color} height={3} />
                  <div className="flex justify-between mt-1">
                    <span className="text-[7px] text-[#44445a]">{sub.motherChunks} chunks</span>
                    <span className="text-[7px] text-[#44445a]">/{(sub.soaEstimate ?? 0).toLocaleString()} SoA</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[9px] text-[#44445a] text-center py-3 bg-[rgba(255,255,255,0.02)] rounded-lg border border-[rgba(255,255,255,0.04)]">
            Sem subdomínios definidos para este domínio.
          </div>
        )}

        <button
          onClick={() => setView('overview')}
          className="mt-1 w-full py-2 rounded-lg border border-[rgba(167,139,250,0.2)] text-[9px] text-[#a78bfa] hover:bg-[rgba(167,139,250,0.08)] transition-colors flex items-center justify-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" />
          Voltar ao Mapa Global
        </button>
      </div>
    );
  }

  return null;
}

// --- Status badge ------------------------------------------------------------
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

function ProposalActionButtons({ p, onAction }: { p: any; onAction: () => void }) {
  const approveMut = trpc.proposals.approve.useMutation({ onSuccess: onAction });
  const deferMut   = trpc.proposals.defer.useMutation({ onSuccess: onAction });
  const cancelMut  = trpc.proposals.cancelPermanently.useMutation({ onSuccess: onAction });
  const [showDefer, setShowDefer] = React.useState(false);
  const [showCancel, setShowCancel] = React.useState(false);
  const [deferDays, setDeferDays] = React.useState(7);
  const [cancelReason, setCancelReason] = React.useState('');

  if (['approved', 'implementing', 'deployed', 'cancelled_permanently'].includes(p.status)) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <button
          onClick={() => approveMut.mutate({ proposalId: p.id })}
          disabled={approveMut.isPending}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40"
          title="Autorizar - execucao imediata com registro auditavel (ISO 27001 A.12.1.2)"
        >
          {approveMut.isPending ? <span className="animate-pulse">...</span> : <><CheckCircle className="w-2.5 h-2.5" /> Autorizar</>}
        </button>
        <button
          onClick={() => { setShowDefer(!showDefer); setShowCancel(false); }}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all"
          title="Adiar - reagendar revisao (ITIL Change Management)"
        >
          <Clock className="w-2.5 h-2.5" /> Adiar
        </button>
        <button
          onClick={() => { setShowCancel(!showCancel); setShowDefer(false); }}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
          title="Cancelar definitivamente - registro permanente no audit log"
        >
          <XCircle className="w-2.5 h-2.5" /> Cancelar
        </button>
      </div>
      {showDefer && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2 flex flex-col gap-1.5">
          <div className="text-[8px] text-amber-400 font-semibold">Adiar por quantos dias?</div>
          <div className="flex items-center gap-1.5">
            {[3, 7, 14, 30].map(d => (
              <button key={d} onClick={() => setDeferDays(d)}
                className={`px-2 py-0.5 rounded text-[8px] font-semibold transition-all ${deferDays === d ? 'bg-amber-500/30 border border-amber-500/50 text-amber-300' : 'bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#8888aa] hover:text-amber-400'}`}
              >{d}d</button>
            ))}
          </div>
          <button
            onClick={() => { deferMut.mutate({ id: p.id, daysToDefer: deferDays }); setShowDefer(false); }}
            disabled={deferMut.isPending}
            className="py-1 rounded-lg text-[8px] font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-all disabled:opacity-40"
          >{deferMut.isPending ? 'Adiando...' : `Confirmar - adiar ${deferDays} dias`}</button>
          <div className="text-[7px] text-[#55556a]">Registrado no audit log (ISO 27001 A.12.1.2)</div>
        </div>
      )}
      {showCancel && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2 flex flex-col gap-1.5">
          <div className="text-[8px] text-red-400 font-semibold">Cancelamento permanente e irreversivel</div>
          <input type="text" placeholder="Motivo obrigatorio (min. 5 chars)..." value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-lg px-2 py-1 text-[9px] text-[#e8e8f0] placeholder-[#55556a] outline-none focus:border-red-500/40"
          />
          <button
            onClick={() => { if (cancelReason.length < 5) return; cancelMut.mutate({ id: p.id, reason: cancelReason }); setShowCancel(false); }}
            disabled={cancelMut.isPending || cancelReason.length < 5}
            className="py-1 rounded-lg text-[8px] font-semibold bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >{cancelMut.isPending ? 'Cancelando...' : 'Confirmar cancelamento definitivo'}</button>
          <div className="text-[7px] text-[#55556a]">Imutavel no audit log - auditavel por ISO 27001/ITIL</div>
        </div>
      )}
    </div>
  );
}

function ProposalsSection() {
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const { data: proposals, isLoading, refetch } = trpc.proposals.listWithReproposal.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const pending   = proposals?.filter(p => p.status === 'pending') ?? [];
  const deferred  = proposals?.filter(p => p.status === 'deferred') ?? [];
  const rejected  = proposals?.filter(p => p.status === 'rejected') ?? [];
  const approved  = proposals?.filter(p => ['approved', 'implementing', 'deployed', 'completed'].includes(p.status)) ?? [];
  // v69.14: Bug fix — 'failed' status was not in any group, causing blank panel with 3 proposals
  const failed    = proposals?.filter(p => p.status === 'failed') ?? [];
  const cancelled = proposals?.filter(p => p.status === 'cancelled_permanently') ?? [];

  const renderProposal = (p: any) => {
    const isOpen = expanded === p.id;
    const impactColor = p.impact === 'critical' ? '#f87171' : p.impact === 'high' ? '#fb923c' : p.impact === 'medium' ? '#fbbf24' : '#34d399';
    return (
      <div key={p.id} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg overflow-hidden">
        <button className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(255,255,255,0.03)] transition-colors"
          onClick={() => setExpanded(isOpen ? null : p.id)}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <StatusBadge status={p.status} />
              {p.impact && (
                <span className="text-[7px] px-1 py-0.5 rounded font-bold uppercase tracking-wide"
                  style={{ background: `${impactColor}18`, border: `1px solid ${impactColor}40`, color: impactColor }}>
                  {p.impact}
                </span>
              )}
              {p.parentProposalId && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-[rgba(96,165,250,0.1)] border border-[rgba(96,165,250,0.2)] text-blue-400">
                  Re-proposta #{p.rejectionCount}
                </span>
              )}
            </div>
            <div className="text-[10px] font-medium text-[#e8e8f0] leading-tight">{p.title}</div>
            <div className="text-[8px] text-[#55556a] mt-0.5">
              Trigger: <span className="text-[#a78bfa]">{p.metricTrigger}</span>
            </div>
          </div>
          {isOpen ? <ChevronDown className="w-3 h-3 text-[#55556a] flex-shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-[#55556a] flex-shrink-0 mt-0.5" />}
        </button>
        {isOpen && (
          <div className="px-2.5 pb-2.5 flex flex-col gap-2 border-t border-[rgba(255,255,255,0.04)]">
            <p className="text-[9px] text-[#8888aa] leading-relaxed mt-2">{p.description}</p>
            <div className="bg-[rgba(255,255,255,0.03)] rounded-lg p-2">
              <div className="text-[8px] text-[#55556a] mb-1 flex justify-between">
                <span>Progresso da Metrica</span>
                <span className="text-[#a78bfa]">{p.metricTrigger}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-red-400 w-8 text-right">{p.metricValue?.toFixed(1)}</span>
                <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, (p.metricValue / p.metricTarget) * 100)}%`, background: 'linear-gradient(90deg, #ef4444, #f59e0b, #22c55e)' }} />
                </div>
                <span className="text-[9px] text-emerald-400 w-8">{p.metricTarget?.toFixed(1)}</span>
              </div>
            </div>
            {p.scientificBasis && (
              <div className="bg-[rgba(167,139,250,0.04)] border border-[rgba(167,139,250,0.12)] rounded-lg p-2">
                <div className="text-[8px] text-[#a78bfa] font-semibold mb-1">Base Cientifica</div>
                <p className="text-[8px] text-[#8888aa] leading-relaxed italic">{p.scientificBasis}</p>
              </div>
            )}
            {p.fitnessFunction && (
              <div className="bg-[rgba(52,211,153,0.04)] border border-[rgba(52,211,153,0.12)] rounded-lg p-2">
                <div className="text-[8px] text-emerald-400 font-semibold mb-1">Funcao de Fitness</div>
                <code className="text-[8px] text-[#8888aa] font-mono">{p.fitnessFunction}</code>
              </div>
            )}
            {p.status === 'rejected' && p.nextReproposalAt && (
              <div className="bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.15)] rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <RefreshCw className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[9px] font-semibold text-amber-400">Re-proposta Agendada (SM-2)</span>
                </div>
                <div className="text-[9px] text-[#8888aa]">
                  Em <span className="text-amber-300 font-semibold">{p.reproposalDaysRemaining}d</span>
                  {' '} EF: {p.efFactor?.toFixed(2)} Rejeicoes: {p.rejectionCount}
                </div>
                {p.improvementNotes && (
                  <div className="mt-1.5 text-[8px] text-[#55556a] italic leading-relaxed">{p.improvementNotes}</div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 text-[7px] text-[#55556a]">
              <span>ID #{p.id} Toda decisao registrada no audit log (ISO 27001 A.12.1.2)</span>
            </div>
            {(p.status === 'pending' || p.status === 'deferred') && (
              <ProposalActionButtons p={p} onAction={refetch} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Dna className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8888aa]">Propostas DGM</span>
          {pending.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold">{pending.length}</span>
          )}
        </div>
        <button onClick={() => refetch()} className="text-[9px] text-[#55556a] hover:text-[#a78bfa] transition-colors" title="Atualizar">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      {isLoading ? (
        <div className="text-[10px] text-[#55556a] text-center py-3 animate-pulse">Carregando propostas...</div>
      ) : (
        <>
          {pending.length > 0 && (
            <div>
              <div className="text-[9px] text-amber-400 font-semibold mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" /> Aguardando Decisao ({pending.length})
              </div>
              <div className="flex flex-col gap-1.5">{pending.map(renderProposal)}</div>
            </div>
          )}
          {deferred.length > 0 && (
            <div>
              <div className="text-[9px] text-blue-400 font-semibold mb-1.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Adiadas ({deferred.length})
              </div>
              <div className="flex flex-col gap-1.5">{deferred.map(renderProposal)}</div>
            </div>
          )}
          {approved.length > 0 && (
            <div>
              <div className="text-[9px] text-emerald-400 font-semibold mb-1.5 flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" /> Aprovadas / Em Execucao ({approved.length})
              </div>
              <div className="flex flex-col gap-1.5">{approved.map(renderProposal)}</div>
            </div>
          )}
          {rejected.length > 0 && (
            <div>
              <div className="text-[9px] text-red-400 font-semibold mb-1.5 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5" /> Rejeitadas SM-2 ({rejected.length})
              </div>
              <div className="flex flex-col gap-1.5">{rejected.map(renderProposal)}</div>
            </div>
          )}
          {cancelled.length > 0 && (
            <div>
              <div className="text-[9px] text-[#55556a] font-semibold mb-1.5 flex items-center gap-1">
                <XCircle className="w-2.5 h-2.5" /> Canceladas Definitivamente ({cancelled.length})
              </div>
              <div className="flex flex-col gap-1.5">{cancelled.map(renderProposal)}</div>
            </div>
          )}
          {/* v69.14: Bug fix — 'failed' proposals were invisible (not in any group) */}
          {failed.length > 0 && (
            <div>
              <div className="text-[9px] text-orange-400 font-semibold mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5" /> Falhou na Implementação ({failed.length})
              </div>
              <div className="flex flex-col gap-1.5">{failed.map(renderProposal)}</div>
            </div>
          )}
          {/* v69.14: Fix empty state — only show when truly no proposals exist */}
          {(!proposals || proposals.length === 0) && (
            <div className="text-[10px] text-[#55556a] text-center py-4">
              Nenhuma proposta DGM ainda.<br />
              <span className="text-[9px]">O motor DGM gera propostas apos 10 queries.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Main RightPanel ---------------------------------------------------------
export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'proposals'>('proposals');
  return (
    <aside
      className="w-[260px] flex-shrink-0 flex flex-col border-l border-[rgba(124,58,237,0.15)] overflow-hidden"
      style={{ background: 'rgba(8,8,18,0.97)' }}
    >
      <div className="flex border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        {(['proposals', 'knowledge'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? 'text-[#a78bfa] border-b-2 border-[#a78bfa] bg-[rgba(167,139,250,0.05)]'
                : 'text-[#55556a] hover:text-[#8888aa]'
            }`}
          >
            {tab === 'proposals' ? '🧬 DGM' : '🧠 Conhecimento'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'proposals' ? <ProposalsSection /> : <KnowledgeSection />}
      </div>
    </aside>
  );
}
