/**
 * MOTHER — DGM Control Center (SOTA)
 *
 * Definitive dashboard merging the best of DgmTest.tsx, DGMTestPanel.tsx,
 * and DGMPipelineDisplay.tsx into one scientifically grounded interface.
 *
 * Scientific basis:
 *   - Darwin Gödel Machine (Sakana AI, arXiv:2505.22954, Zhang et al. 2025)
 *   - Gödel Machine (Schmidhuber, 2003) — provably optimal self-referential self-improvement
 *   - Constitutional AI (Bai et al., arXiv:2212.08073) — safety constraints
 *   - Reflexion (Shinn et al., arXiv:2303.11366, NeurIPS 2023) — verbal RL
 *   - Cognitive Load Theory (Sweller, 1988) — progressive disclosure
 *   - Nielsen Usability Heuristics (H1: Visibility, H6: Recognition)
 *
 * Design:
 *   - Glassmorphism + oklch color (2025 SOTA dark dashboard patterns)
 *   - Progressive disclosure — expand steps for detail
 *   - Real-time event feed via polls
 *   - Multi-dimensional fitness bars with explanatory tooltips
 *   - SHA-256 proof chain per step
 *   - Human-in-the-loop proposal review with code diff
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Dna, Shield, Zap, Activity, FlaskConical, GitBranch,
  CheckCircle2, XCircle, Clock, AlertTriangle, Play, Hash,
  ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, FileCode2,
  Loader2, ArrowRight, Eye, Cpu
} from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================

const PIPELINE_STEPS = [
  { id: 'init', label: 'Inicializar', icon: Zap, desc: 'MAP-Elites parent selection + mutation operator' },
  { id: 'benchmark', label: 'Benchmark', icon: Activity, desc: 'Executar queries no agente-pai' },
  { id: 'diagnose', label: 'Diagnosticar', icon: FlaskConical, desc: 'Identificar fraquezas via auto-diagnóstico' },
  { id: 'modify', label: 'Gerar Código', icon: GitBranch, desc: 'LLM code mutation (self-referential improvement)' },
  { id: 'safety', label: 'Safety Gate', icon: Shield, desc: 'Constitutional AI + anti-objective-hacking' },
  { id: 'fitness', label: 'Fitness Check', icon: Dna, desc: '7-dimension quality scoring (McCabe, OWASP)' },
  { id: 'sandbox', label: 'Sandbox', icon: Cpu, desc: 'E2B isolated execution — TypeScript compile + tests' },
  { id: 'proposal', label: 'Aprovação', icon: Eye, desc: 'Human-in-the-loop review mandatory' },
  { id: 'evaluate', label: 'Benchmark Final', icon: CheckCircle2, desc: 'G-Eval per-query accuracy comparison' },
];

const STEP_COLORS: Record<string, string> = {
  start: 'oklch(70% 0.15 250)',
  success: 'oklch(75% 0.18 150)',
  fail: 'oklch(65% 0.22 25)',
  waiting: 'oklch(80% 0.18 85)',
};

/** Fitness dimension metadata — from DgmTest.tsx */
const FITNESS_DIMS: Record<string, { label: string; weight: string; description: string; low: string; high: string }> = {
  correctness: { label: 'Correctness', weight: '35%', description: 'Compilação TypeScript + taxa de aprovação nos testes.', low: 'Erros de compilação ou testes falhando.', high: 'Compila sem erros e todos os testes passam.' },
  safety: { label: 'Safety', weight: '25%', description: 'Ausência de padrões perigosos: eval(), exec(), rm -rf, process.exit.', low: 'Padrões potencialmente perigosos encontrados.', high: 'Nenhum padrão perigoso detectado.' },
  complexity: { label: 'Complexity', weight: '15%', description: 'Complexidade ciclomática de McCabe (invertida — menor = melhor).', low: 'Código muito complexo (>20 decisões).', high: 'Código simples e linear (≤5 decisões).' },
  documentation: { label: 'Documentation', weight: '10%', description: 'Cobertura JSDoc e proporção de comentários.', low: 'Funções sem JSDoc.', high: 'Todas exportadas têm JSDoc.' },
  testability: { label: 'Testability', weight: '8%', description: 'Suite de testes + funções exportadas testáveis.', low: 'Sem testes associados.', high: 'Suite de testes completa.' },
  integration: { label: 'Integration', weight: '5%', description: 'Compatibilidade A2A: Router + types + exports.', low: 'Sem Router ou exports A2A.', high: 'Totalmente compatível A2A.' },
  performance: { label: 'Performance', weight: '2%', description: 'Penaliza operações sync, recompensa padrões async.', low: 'readFileSync, operações bloqueantes.', high: 'Padrões async/await adequados.' },
};

/** Rotating activity messages per step — from DgmTest.tsx */
const ACTIVITY_MESSAGES: Record<string, string[]> = {
  init: ['Selecionando agente-pai do arquivo MAP-Elites...', 'Preparando operador de mutação...', 'Calculando hash de inicialização SHA-256...'],
  benchmark: ['Executando queries do benchmark no agente-pai...', 'Medindo qualidade G-Eval por resposta...'],
  diagnose: ['Analisando pipeline para identificar fraquezas...', 'Formulando problem statement científico...', 'Consultando papers relevantes (arXiv)...'],
  modify: ['LLM gerando modificação de código...', 'Aplicando princípios de Self-Referential Improvement...', 'Verificando coerência com arquitetura existente...'],
  safety: ['Verificando acesso a credenciais...', 'Analisando loops infinitos potenciais...', 'Aplicando Constitutional AI (arXiv:2212.08073)...'],
  fitness: ['Avaliando corretude do código...', 'Calculando complexidade ciclomática...', 'Computando score multi-dimensional (7 eixos)...'],
  sandbox: ['Criando sandbox isolado E2B...', 'Compilando TypeScript no ambiente seguro...', 'Rodando verificação de integridade...'],
  proposal: ['Aguardando aprovação humana...', 'Human-in-the-loop ativo...'],
  evaluate: ['Executando benchmark completo...', 'Comparando accuracy vs agente-pai...', 'Calculando ganho empírico...'],
};

// ============================================================
// TYPES
// ============================================================

interface DGMEvent {
  step: string; status: string; message: string; timestamp: string;
  data?: Record<string, unknown>;
}

interface DGMProposal {
  id: string; runId: string; targetFile: string; proposedCode: string; originalCode: string;
  rationale: string; scientificBasis: string; expectedImprovement: string;
  fitnessScore: number; sandboxPassed: boolean; sandboxType: string; sandboxDurationMs: number;
  diagnosisHash: string; modificationHash: string; safetyHash: string; fitnessHash: string; sandboxHash: string;
  title?: string; summary?: string; problemStatement?: string; rootCause?: string; proposedFix?: string;
  mutationType?: string; fitnessDimensions?: Record<string, number>; safetyWarnings?: string[];
  parentMetrics?: { id: string; accuracy: number; resolved: number; total: number; unresolvedIds: string[] };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function DgmLineage() {
  const [customQueries, setCustomQueries] = useState('');
  const [events, setEvents] = useState<DGMEvent[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [expiredMsg, setExpiredMsg] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // ── tRPC hooks ──
  const { data: lineageData, refetch: refetchLineage } =
    trpc.mother.dgmLineage.useQuery({ limit: 50 }, { retry: 1, refetchOnWindowFocus: false });

  const eventsQuery = trpc.mother.dgmEvents.useQuery(
    { since: events.length },
    { enabled: pollEnabled, refetchInterval: 1000 },
  );

  const proposalsQuery = trpc.mother.dgmPendingProposals.useQuery(
    undefined,
    { enabled: pollEnabled, refetchInterval: 1500 },
  );

  const resolveMutation = trpc.mother.dgmResolveProposal.useMutation();

  const testMutation = trpc.mother.dgmTestRun.useMutation({
    onSuccess: (data) => { setResult(data as Record<string, unknown>); setError(null); setPollEnabled(false); refetchLineage(); },
    onError: (err) => { setError(err.message); setResult(null); setPollEnabled(false); },
  });

  // Append new events
  useEffect(() => {
    if (eventsQuery.data && (eventsQuery.data as DGMEvent[]).length > 0) {
      setEvents(prev => [...prev, ...(eventsQuery.data as DGMEvent[])]);
    }
  }, [eventsQuery.data]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  const handleRun = useCallback(() => {
    setEvents([]); setResult(null); setError(null); setPollEnabled(true); setExpiredMsg(null);
    const queries = customQueries.trim()
      ? customQueries.split('\n').filter(q => q.trim()).map((q, i) => ({
          id: `custom-${String(i + 1).padStart(3, '0')}`, query: q.trim(),
          expectedMinQuality: 50, category: 'custom',
        }))
      : [];
    testMutation.mutate({ benchmarkQueries: queries.length > 0 ? queries : undefined, selfImproveSize: 1 });
  }, [customQueries, testMutation]);

  const handleApprove = (id: string) => {
    setExpiredMsg(null);
    resolveMutation.mutate({ proposalId: id, approved: true }, {
      onSuccess: (data: any) => { if (!data.resolved) setExpiredMsg('Proposta expirada. Rode o pipeline novamente.'); },
    });
  };

  const handleReject = (id: string) => {
    setExpiredMsg(null);
    resolveMutation.mutate({ proposalId: id, approved: false }, {
      onSuccess: (data: any) => { if (!data.resolved) setExpiredMsg('Proposta expirada. Rode o pipeline novamente.'); },
    });
  };

  const isRunning = testMutation.isPending;
  const pendingProposals = (proposalsQuery.data ?? []) as DGMProposal[];
  const currentProposal = pendingProposals[0] ?? null;
  const lastStep = events.length > 0 ? events[events.length - 1] : null;
  const activeStep = isRunning && lastStep ? lastStep.step : null;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 0%, oklch(15% 0.05 280), oklch(6% 0.02 280))' }}>
      {/* Ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] pointer-events-none" style={{ background: 'oklch(40% 0.1 280 / 0.12)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[140px] pointer-events-none" style={{ background: 'oklch(45% 0.15 150 / 0.08)' }} />

      <div className="relative z-10 flex flex-col h-screen">
        {/* ── HEADER ── */}
        <header className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, oklch(10% 0.02 280 / 0.8), transparent)', borderBottom: '1px solid oklch(100% 0 0 / 0.05)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, oklch(60% 0.25 300), oklch(45% 0.20 270))', boxShadow: '0 0 30px oklch(55% 0.25 300 / 0.4)' }}>
              <Dna className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: 'oklch(98% 0.01 280)' }}>DGM Test Lab</h1>
              <p className="text-[10px] flex items-center gap-2" style={{ color: 'oklch(50% 0.02 280)' }}>
                <span>Darwin Gödel Machine</span><span className="w-1 h-1 rounded-full bg-white/20" /><span>arXiv:2505.22954</span><span className="w-1 h-1 rounded-full bg-white/20" /><span>Schmidhuber 2003</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats pills */}
            <StatPill label="Archive" value={`${lineageData?.total ?? 0}`} color="oklch(70% 0.15 250)" />
            <StatPill label="Max Fit" value={lineageData?.maxFitness ? lineageData.maxFitness.toFixed(1) : '—'} color="oklch(75% 0.18 150)" />
            <StatPill label="Avg Fit" value={lineageData?.avgFitness ? lineageData.avgFitness.toFixed(1) : '—'} color="oklch(80% 0.18 85)" />
            {/* Run button */}
            <button onClick={handleRun} disabled={isRunning} className="group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all relative overflow-hidden disabled:opacity-50" style={{ background: isRunning ? 'oklch(15% 0.03 280 / 0.8)' : 'linear-gradient(135deg, oklch(60% 0.25 300), oklch(50% 0.20 250))', color: isRunning ? 'oklch(60% 0.05 280)' : '#fff', boxShadow: isRunning ? 'none' : '0 4px 20px oklch(55% 0.25 300 / 0.3)' }}>
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isRunning ? 'Executando...' : 'Rodar Teste DGM'}
              {!isRunning && <ArrowRight className="w-4 h-4 ml-1 opacity-60 group-hover:translate-x-1 transition-transform" />}
            </button>
          </div>
        </header>

        {/* ── LIVE ACTIVITY BANNER ── */}
        <LiveActivityBanner currentStep={activeStep} isRunning={isRunning || pollEnabled} />

        {/* ── MAIN 3-COL LAYOUT ── */}
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* LEFT: Pipeline Steps + Query Config */}
          <div className="w-[300px] flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid oklch(100% 0 0 / 0.05)' }}>
            {/* Query config */}
            <div className="p-3" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
              <SectionLabel>Benchmark Queries</SectionLabel>
              <textarea value={customQueries} onChange={e => setCustomQueries(e.target.value)} placeholder={'1 query por linha\n(vazio = benchmark padrão)'} disabled={isRunning} rows={2} className="w-full rounded-lg px-3 py-2 text-[11px] font-mono resize-vertical outline-none" style={{ background: 'oklch(8% 0.02 280)', border: '1px solid oklch(100% 0 0 / 0.06)', color: 'oklch(85% 0.02 280)' }} />
            </div>

            {/* Pipeline steps */}
            <div className="p-3">
              <SectionLabel>Pipeline DGM (SHA-256 por etapa)</SectionLabel>
              <div className="space-y-1">
                {PIPELINE_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const stepEvents = events.filter(e => e.step === step.id);
                  const lastEvent = stepEvents[stepEvents.length - 1];
                  const status = lastEvent?.status ?? 'pending';
                  const isActive = activeStep === step.id;
                  const color = isActive ? STEP_COLORS.start : status === 'success' ? STEP_COLORS.success : status === 'fail' ? STEP_COLORS.fail : status === 'waiting' ? STEP_COLORS.waiting : 'oklch(30% 0.02 280)';

                  return (
                    <div key={step.id} className="relative">
                      {/* Connecting line */}
                      {i < PIPELINE_STEPS.length - 1 && (
                        <div className="absolute left-[14px] top-[32px] bottom-[-4px] w-0.5 rounded-full" style={{ background: status === 'success' ? STEP_COLORS.success : 'oklch(15% 0.02 280)' }} />
                      )}
                      <div className="flex items-center gap-2.5 p-2 rounded-lg relative z-10 transition-all" style={{ background: isActive ? 'oklch(15% 0.04 280 / 0.8)' : 'transparent', borderLeft: `3px solid ${color}` }}>
                        <div className="w-[22px] h-[22px] rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isActive ? 'oklch(60% 0.25 270 / 0.2)' : status !== 'pending' ? `${color}22` : 'oklch(12% 0.02 280)' }}>
                          {isActive ? <Loader2 className="w-3 h-3 animate-spin" style={{ color }} /> : <Icon className="w-3 h-3" style={{ color }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold truncate" style={{ color: status !== 'pending' || isActive ? 'oklch(88% 0.02 280)' : 'oklch(40% 0.02 280)', textTransform: 'uppercase' }}>{step.label}</div>
                          {lastEvent && <div className="text-[9px] truncate mt-0.5" style={{ color }}>{(lastEvent.message.split('\n\n')[0] || lastEvent.message).slice(0, 80)}</div>}
                        </div>
                        {/* Hash */}
                        {lastEvent?.data?.hash && (
                          <code className="text-[8px] flex-shrink-0 font-mono" style={{ color: 'oklch(60% 0.02 280)' }}>{String(lastEvent.data.hash).slice(0, 8)}</code>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CENTER: Event Feed + Proposal Review */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* Error */}
            {error && (
              <div className="m-3 px-4 py-3 rounded-xl text-xs flex items-center gap-2" style={{ background: 'oklch(40% 0.15 25 / 0.1)', border: '1px solid oklch(60% 0.2 25 / 0.3)', color: 'oklch(70% 0.15 25)' }}>
                <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            {/* Empty state */}
            {events.length === 0 && !isRunning && !error && !result && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <Dna className="w-10 h-10 mx-auto mb-4" style={{ color: 'oklch(40% 0.08 280)' }} />
                  <p className="text-sm mb-2" style={{ color: 'oklch(55% 0.02 280)' }}>DGM Test Lab</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'oklch(40% 0.02 280)' }}>
                    Clique em <strong style={{ color: 'oklch(75% 0.18 300)' }}>Rodar Teste DGM</strong> para executar o pipeline completo.
                    Cada passo será mostrado em tempo real com justificativa científica e hashes SHA-256.
                  </p>
                </div>
              </div>
            )}

            {/* PROPOSAL REVIEW — from DgmTest.tsx */}
            {currentProposal && <ProposalReview proposal={currentProposal} onApprove={handleApprove} onReject={handleReject} isResolving={resolveMutation.isPending} expiredMsg={expiredMsg} />}

            {/* EVENT FEED */}
            {events.length > 0 && (
              <div className="flex-1 flex flex-col min-h-0 m-3">
                <SectionLabel>Feed em Tempo Real</SectionLabel>
                <div ref={feedRef} className="flex-1 overflow-y-auto rounded-xl p-3 space-y-1.5" style={{ background: 'oklch(6% 0.02 280)', border: '1px solid oklch(100% 0 0 / 0.05)' }}>
                  {events.map((ev, i) => {
                    const parts = ev.message.split('\n\n');
                    const title = parts[0] || '';
                    const detail = parts.slice(1).join('\n\n');
                    const sc = STEP_COLORS[ev.status] ?? 'oklch(40% 0.02 280)';
                    return (
                      <div key={i} className="px-3 py-2 rounded-lg" style={{ borderLeft: `3px solid ${sc}`, background: ev.status === 'fail' ? 'oklch(40% 0.12 25 / 0.06)' : ev.status === 'success' ? 'oklch(75% 0.15 150 / 0.03)' : 'oklch(100% 0 0 / 0.01)' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono flex-shrink-0" style={{ color: 'oklch(40% 0.02 280)' }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                          <span className="text-[9px] font-bold uppercase flex-shrink-0 px-1.5 py-0.5 rounded" style={{ color: sc, background: `${sc}15` }}>{ev.step}:{ev.status}</span>
                          <span className="text-[11px] font-semibold truncate" style={{ color: 'oklch(88% 0.02 280)' }}>{title}</span>
                        </div>
                        {detail && <div className="text-[10px] mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: 'oklch(55% 0.02 280)' }}>{detail}</div>}
                        {/* Rich event data display */}
                        {ev.data && (
                          <div className="text-[9px] mt-1.5 space-y-1" style={{ color: 'oklch(45% 0.02 280)' }}>
                            {/* Hash + Score */}
                            {(ev.data.hash || ev.data.score != null) && (
                              <div>
                                {ev.data.hash && <>Hash: <code style={{ color: 'oklch(70% 0.15 150)' }}>{String(ev.data.hash).slice(0, 16)}...</code> </>}
                                {ev.data.score != null && <>Score: <strong style={{ color: Number(ev.data.score) >= 50 ? 'oklch(75% 0.18 150)' : 'oklch(65% 0.22 25)' }}>{String(ev.data.score)}/100</strong></>}
                              </div>
                            )}
                            {/* LLM evaluation info */}
                            {ev.data.llmProvider && (
                              <div className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: 'oklch(100% 0 0 / 0.02)' }}>
                                <span>🤖 LLM:</span>
                                <span style={{ color: 'oklch(70% 0.12 250)' }}>{String(ev.data.llmProvider)}/{String(ev.data.llmModel)}</span>
                                <span>| Quality: <strong style={{ color: 'oklch(75% 0.18 150)' }}>{String(ev.data.llmQuality)}</strong></span>
                                <span>| Latência: <strong style={{ color: 'oklch(80% 0.18 85)' }}>{String(ev.data.llmLatencyMs)}ms</strong></span>
                              </div>
                            )}
                            {/* Provider/model from waiting events */}
                            {ev.data.provider && !ev.data.llmProvider && (
                              <div className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: 'oklch(100% 0 0 / 0.02)' }}>
                                <span>🤖</span>
                                <span style={{ color: 'oklch(70% 0.12 250)' }}>{String(ev.data.provider)}/{String(ev.data.model)}</span>
                                {ev.data.quality && <span>| Quality: <strong style={{ color: 'oklch(75% 0.18 150)' }}>{String(ev.data.quality)}</strong></span>}
                                {ev.data.latencyMs && <span>| {String(ev.data.latencyMs)}ms</span>}
                              </div>
                            )}
                            {/* Code candidates info */}
                            {ev.data.candidate1 && (
                              <div className="px-2 py-1 rounded" style={{ background: 'oklch(100% 0 0 / 0.02)' }}>
                                <span>📄 Candidato 1: <code style={{ color: 'oklch(70% 0.12 250)' }}>{String(ev.data.candidate1)}</code></span>
                                {ev.data.candidate2 && <> | Candidato 2: <code style={{ color: 'oklch(70% 0.12 250)' }}>{String(ev.data.candidate2)}</code></>}
                              </div>
                            )}
                            {/* QC Issues + Line count */}
                            {ev.data.qcIssues && Array.isArray(ev.data.qcIssues) && (ev.data.qcIssues as string[]).length > 0 && (
                              <div className="px-2 py-1.5 rounded space-y-0.5" style={{ background: 'oklch(50% 0.15 40 / 0.06)', border: '1px solid oklch(60% 0.15 40 / 0.15)' }}>
                                <div className="text-[9px] font-bold" style={{ color: 'oklch(70% 0.15 40)' }}>🔍 CONTROLE DE QUALIDADE</div>
                                {(ev.data.qcIssues as string[]).map((issue: string, j: number) => (
                                  <div key={j} className="text-[9px]" style={{ color: 'oklch(60% 0.08 40)' }}>{issue}</div>
                                ))}
                              </div>
                            )}
                            {/* Line count delta */}
                            {ev.data.lineCount && ev.data.originalLineCount && (
                              <div className="px-2 py-0.5 text-[9px]" style={{ color: 'oklch(50% 0.02 280)' }}>
                                📏 {String(ev.data.originalLineCount)} → {String(ev.data.lineCount)} linhas ({Number(ev.data.lineCount) > Number(ev.data.originalLineCount) ? '+' : ''}{Number(ev.data.lineCount) - Number(ev.data.originalLineCount)})
                              </div>
                            )}
                            {/* Code preview — original vs proposed */}
                            {ev.data.codePreview && (
                              <details className="rounded overflow-hidden" style={{ background: 'oklch(5% 0.02 280)', border: '1px solid oklch(100% 0 0 / 0.06)' }}>
                                <summary className="text-[9px] font-semibold px-2 py-1 cursor-pointer select-none" style={{ color: 'oklch(70% 0.12 250)', background: 'oklch(8% 0.02 280)' }}>
                                  📄 Ver Código (original vs proposto)
                                </summary>
                                <div className="grid grid-cols-2 gap-0 text-[8px] font-mono leading-relaxed">
                                  <div className="p-2 overflow-x-auto" style={{ borderRight: '1px solid oklch(100% 0 0 / 0.05)' }}>
                                    <div className="text-[8px] font-bold mb-1" style={{ color: 'oklch(65% 0.15 25)' }}>ORIGINAL</div>
                                    <pre className="whitespace-pre-wrap" style={{ color: 'oklch(50% 0.02 280)' }}>{String(ev.data.originalPreview || '').slice(0, 3000)}</pre>
                                  </div>
                                  <div className="p-2 overflow-x-auto">
                                    <div className="text-[8px] font-bold mb-1" style={{ color: 'oklch(75% 0.18 150)' }}>PROPOSTO</div>
                                    <pre className="whitespace-pre-wrap" style={{ color: 'oklch(55% 0.02 280)' }}>{String(ev.data.codePreview).slice(0, 3000)}</pre>
                                  </div>
                                </div>
                              </details>
                            )}
                            {/* Fitness dimensions */}
                            {ev.data.dimensions && typeof ev.data.dimensions === 'object' && (
                              <div className="flex flex-wrap gap-1.5 px-2 py-1 rounded" style={{ background: 'oklch(100% 0 0 / 0.02)' }}>
                                {Object.entries(ev.data.dimensions as Record<string, number>).map(([k, v]) => (
                                  <span key={k} className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ background: `${Number(v) >= 70 ? 'oklch(75% 0.18 150)' : Number(v) >= 50 ? 'oklch(80% 0.18 85)' : 'oklch(65% 0.22 25)'}15`, color: Number(v) >= 70 ? 'oklch(75% 0.18 150)' : Number(v) >= 50 ? 'oklch(80% 0.18 85)' : 'oklch(65% 0.22 25)' }}>
                                    {k}: {v}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {isRunning && !currentProposal && (
                    <div className="text-[11px] flex items-center gap-2 px-3 py-2" style={{ color: 'oklch(70% 0.15 250)' }}>
                      <Loader2 className="w-3 h-3 animate-spin" /> Processando...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RESULT SUMMARY */}
            {result && <ResultSummary result={result} />}
          </div>

          {/* RIGHT: Fitness + Archive + Tree */}
          <div className="w-[320px] flex-shrink-0 overflow-y-auto" style={{ borderLeft: '1px solid oklch(100% 0 0 / 0.05)' }}>
            {/* Global Fitness */}
            {currentProposal?.fitnessDimensions && (
              <div className="p-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
                <SectionLabel>Fitness Dimensions ({currentProposal.fitnessScore}/100)</SectionLabel>
                <div className="space-y-3 mt-2">
                  {Object.entries(currentProposal.fitnessDimensions).map(([dim, score]) => (
                    <FitnessBar key={dim} dim={dim} score={score as number} />
                  ))}
                </div>
              </div>
            )}

            {/* Archive Lineage */}
            {lineageData && lineageData.entries.length > 0 && (
              <div className="p-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
                <SectionLabel>Lineage (últimas {lineageData.entries.length} variantes)</SectionLabel>
                <div className="space-y-1 mt-2">
                  {(lineageData.entries as any[]).slice(0, 15).map((entry: any) => {
                    const acc = entry.fitnessScore ?? 0;
                    return (
                      <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'oklch(100% 0 0 / 0.02)', borderLeft: `2px solid ${acc >= 80 ? 'oklch(75% 0.18 150)' : acc >= 50 ? 'oklch(80% 0.18 85)' : 'oklch(65% 0.22 25)'}` }}>
                        <span className="text-[10px] font-mono font-bold" style={{ color: 'oklch(70% 0.12 250)' }}>{String(entry.id).slice(0, 12)}</span>
                        <span className="flex-1" />
                        <span className="text-[10px] font-mono" style={{ color: acc >= 80 ? 'oklch(75% 0.18 150)' : 'oklch(80% 0.18 85)' }}>{acc.toFixed(1)}</span>
                        <span className="text-[9px]" style={{ color: 'oklch(35% 0.02 280)' }}>gen {entry.generation ?? '?'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proof Hashes (from result) */}
            {result && (result as any).archive?.variants && (
              <div className="p-4">
                <SectionLabel>Proof Chain (SHA-256)</SectionLabel>
                <div className="mt-2 rounded-lg p-3" style={{ background: 'oklch(100% 0 0 / 0.02)', border: '1px solid oklch(100% 0 0 / 0.05)' }}>
                  {((result as any).archive.variants as any[]).map((v: any, i: number) => (
                    <span key={v.id} className="text-[9px] font-mono">
                      {i > 0 && <span style={{ color: 'oklch(60% 0.2 300)' }}> → </span>}
                      <span style={{ color: 'oklch(70% 0.12 250)' }}>{v.id?.slice(0, 10)}</span>
                      <span style={{ color: 'oklch(35% 0.02 280)' }}>:{v.proofHash?.slice(0, 10)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Scientific refs */}
            <div className="p-4" style={{ borderTop: '1px solid oklch(100% 0 0 / 0.05)' }}>
              <SectionLabel>Base Científica</SectionLabel>
              <div className="space-y-1 mt-1 text-[9px] font-mono" style={{ color: 'oklch(35% 0.02 280)' }}>
                <div>arXiv:2505.22954 — DGM (Sakana AI, 2025)</div>
                <div>arXiv:2212.08073 — Constitutional AI (Anthropic)</div>
                <div>arXiv:2303.11366 — Reflexion (NeurIPS 2023)</div>
                <div>Schmidhuber 2003 — Gödel Machine</div>
                <div>Sweller 1988 — Cognitive Load Theory</div>
                <div>McCabe 1976 — Cyclomatic Complexity</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

/** Live activity banner with rotating messages — from DgmTest.tsx:205-274 */
function LiveActivityBanner({ currentStep, isRunning }: { currentStep: string | null; isRunning: boolean }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!isRunning || !currentStep) return;
    const messages = ACTIVITY_MESSAGES[currentStep];
    if (!messages || messages.length === 0) return;
    setMsgIndex(0); setOpacity(1);
    const interval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => { setMsgIndex(prev => (prev + 1) % messages.length); setOpacity(1); }, 300);
    }, 2800);
    return () => clearInterval(interval);
  }, [currentStep, isRunning]);

  if (!isRunning || !currentStep) return null;
  const messages = ACTIVITY_MESSAGES[currentStep];
  if (!messages || messages.length === 0) return null;

  const stepLabel = currentStep === 'benchmark' ? 'BENCHMARK INICIAL' : currentStep === 'init' ? 'INICIALIZANDO' : currentStep === 'diagnose' ? 'DIAGNOSTICANDO' : currentStep === 'modify' ? 'GERANDO CÓDIGO' : currentStep === 'safety' ? 'SAFETY GATE' : currentStep === 'fitness' ? 'FITNESS CHECK' : currentStep === 'sandbox' ? 'SANDBOX' : currentStep === 'proposal' ? 'APROVAÇÃO HUMANA' : currentStep === 'evaluate' ? 'BENCHMARK FINAL' : 'PROCESSANDO';

  return (
    <div className="mx-4 mt-2 px-4 py-2.5 rounded-xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg, oklch(60% 0.2 300 / 0.06), oklch(70% 0.15 250 / 0.06))', border: '1px solid oklch(60% 0.2 300 / 0.15)' }}>
      <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: 'oklch(70% 0.15 300)' }} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[1px]" style={{ color: 'oklch(70% 0.15 300)' }}>{stepLabel}</div>
        <div className="text-[11px] truncate transition-opacity duration-300" style={{ color: 'oklch(75% 0.02 280)', opacity }}>{messages[msgIndex % messages.length]}</div>
      </div>
      <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'oklch(75% 0.18 150)' }} />
    </div>
  );
}

/** Proposal review panel — from DgmTest.tsx:488-683 */
function ProposalReview({ proposal, onApprove, onReject, isResolving, expiredMsg }: { proposal: DGMProposal; onApprove: (id: string) => void; onReject: (id: string) => void; isResolving: boolean; expiredMsg: string | null }) {
  return (
    <div className="m-3 rounded-xl overflow-y-auto" style={{ border: '2px solid oklch(80% 0.18 85 / 0.3)', maxHeight: 'calc(100vh - 250px)' }}>
      {/* Header with title + actions */}
      <div className="p-4 flex justify-between items-start" style={{ background: 'oklch(80% 0.18 85 / 0.05)', borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
        <div className="flex-1 min-w-0 mr-3">
          <div className="text-sm font-bold" style={{ color: 'oklch(80% 0.18 85)' }}>{proposal.title || 'PROPOSTA AGUARDANDO APROVAÇÃO'}</div>
          <div className="text-[11px] mt-1 leading-relaxed" style={{ color: 'oklch(75% 0.02 280)' }}>{proposal.summary || proposal.rationale}</div>
          <div className="text-[10px] mt-1" style={{ color: 'oklch(45% 0.02 280)' }}>{proposal.targetFile} | {proposal.mutationType || 'general'} | Run: {proposal.runId}</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => onApprove(proposal.id)} disabled={isResolving} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg, oklch(65% 0.2 150), oklch(55% 0.18 150))', color: '#fff' }}>
            <ThumbsUp className="w-3.5 h-3.5" /> {isResolving ? 'ENVIANDO...' : 'APROVAR'}
          </button>
          <button onClick={() => onReject(proposal.id)} disabled={isResolving} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50" style={{ background: 'oklch(65% 0.2 25 / 0.12)', color: 'oklch(65% 0.2 25)', border: '1px solid oklch(65% 0.2 25 / 0.3)' }}>
            <ThumbsDown className="w-3.5 h-3.5" /> {isResolving ? 'ENVIANDO...' : 'REJEITAR'}
          </button>
        </div>
      </div>
      {expiredMsg && <div className="mx-4 mt-2 px-3 py-2 rounded-lg text-[11px] font-semibold" style={{ background: 'oklch(65% 0.2 25 / 0.08)', color: 'oklch(70% 0.15 25)' }}>{expiredMsg}</div>}

      {/* 1. Diagnóstico */}
      <div className="p-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
        <SectionLabel>1. Diagnóstico — Por que esta mudança é necessária</SectionLabel>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <InfoCard title="Problema Identificado" color="oklch(65% 0.22 25)" content={proposal.problemStatement || proposal.rationale} />
          <InfoCard title="Causa Raiz" color="oklch(80% 0.18 85)" content={proposal.rootCause || 'Identificado via auto-diagnóstico DGM'} />
        </div>
        {proposal.parentMetrics && (
          <div className="mt-2 p-3 rounded-lg" style={{ background: 'oklch(70% 0.15 250 / 0.03)', border: '1px solid oklch(100% 0 0 / 0.05)' }}>
            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'oklch(70% 0.15 250)' }}>Dados do Agente-Pai (Baseline)</div>
            <div className="text-[11px]" style={{ color: 'oklch(65% 0.02 280)' }}>
              Variante: <strong style={{ color: 'oklch(88% 0.02 280)' }}>{proposal.parentMetrics.id}</strong> | Accuracy: <strong style={{ color: proposal.parentMetrics.accuracy >= 0.8 ? 'oklch(75% 0.18 150)' : 'oklch(80% 0.18 85)' }}>{(proposal.parentMetrics.accuracy * 100).toFixed(1)}%</strong> | Resolvidas: <strong style={{ color: 'oklch(88% 0.02 280)' }}>{proposal.parentMetrics.resolved}/{proposal.parentMetrics.total}</strong>
              {proposal.parentMetrics.unresolvedIds.length > 0 && <> | Não resolvidas: <strong style={{ color: 'oklch(65% 0.22 25)' }}>{proposal.parentMetrics.unresolvedIds.join(', ')}</strong></>}
            </div>
          </div>
        )}
      </div>

      {/* 2. Proposta */}
      <div className="p-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
        <SectionLabel>2. Proposta de Solução</SectionLabel>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <InfoCard title="Correção Proposta" color="oklch(75% 0.18 150)" content={proposal.proposedFix || proposal.rationale} />
          <InfoCard title="Melhoria Esperada" color="oklch(70% 0.15 300)" content={proposal.expectedImprovement} />
        </div>
      </div>

      {/* 3. Embasamento Científico */}
      <div className="p-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
        <SectionLabel>3. Embasamento Científico</SectionLabel>
        <InfoCard title="Base Científica" color="oklch(70% 0.15 300)" content={proposal.scientificBasis} />
        <div className="mt-2"><InfoCard title="Raciocínio Completo" color="oklch(70% 0.15 250)" content={proposal.rationale} /></div>
      </div>

      {/* 4. Validação */}
      <div className="p-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.05)' }}>
        <SectionLabel>4. Relatório de Validação</SectionLabel>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <InfoCard title="Safety Gate" color="oklch(75% 0.18 150)" content={`Status: PASSED${proposal.safetyWarnings?.length ? ` | Warnings: ${proposal.safetyWarnings.join('; ')}` : ' (0 warnings)'}`} />
          <InfoCard title="Sandbox" color={proposal.sandboxPassed ? 'oklch(75% 0.18 150)' : 'oklch(65% 0.22 25)'} content={`${proposal.sandboxPassed ? 'PASSED' : 'FAILED'} | ${proposal.sandboxType} | ${proposal.sandboxDurationMs}ms`} />
        </div>
        {/* Proof hashes */}
        <div className="mt-2 p-3 rounded-lg" style={{ background: 'oklch(100% 0 0 / 0.02)', border: '1px solid oklch(100% 0 0 / 0.05)' }}>
          <div className="text-[9px] font-bold uppercase mb-1" style={{ color: 'oklch(40% 0.02 280)' }}>Cadeia de Provas (SHA-256)</div>
          <div className="text-[9px] font-mono leading-loose" style={{ color: 'oklch(40% 0.02 280)' }}>
            diagnóstico: <code style={{ color: 'oklch(70% 0.15 150)' }}>{proposal.diagnosisHash?.slice(0, 16)}...</code>{' '}
            modificação: <code style={{ color: 'oklch(70% 0.15 150)' }}>{proposal.modificationHash?.slice(0, 16)}...</code>{' '}
            safety: <code style={{ color: 'oklch(70% 0.15 150)' }}>{proposal.safetyHash?.slice(0, 16)}...</code>{' '}
            fitness: <code style={{ color: 'oklch(70% 0.15 150)' }}>{proposal.fitnessHash?.slice(0, 16)}...</code>{' '}
            sandbox: <code style={{ color: 'oklch(70% 0.15 150)' }}>{proposal.sandboxHash?.slice(0, 16)}...</code>
          </div>
        </div>
      </div>

      {/* 5. Code Diff */}
      <div className="p-4">
        <SectionLabel>5. Preview do Código</SectionLabel>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <div className="text-[10px] font-bold mb-1" style={{ color: 'oklch(65% 0.22 25)' }}>ORIGINAL ({proposal.targetFile})</div>
            <pre className="rounded-lg px-3 py-2 text-[10px] overflow-auto max-h-[300px]" style={{ background: 'oklch(5% 0.02 280)', border: '1px solid oklch(100% 0 0 / 0.05)', color: 'oklch(60% 0.02 280)', whiteSpace: 'pre-wrap' }}>
              {proposal.originalCode ? proposal.originalCode.slice(0, 3000) : '(arquivo novo)'}
              {proposal.originalCode?.length > 3000 && '\n... (truncado)'}
            </pre>
          </div>
          <div>
            <div className="text-[10px] font-bold mb-1" style={{ color: 'oklch(75% 0.18 150)' }}>PROPOSTA ({proposal.proposedCode.length} chars)</div>
            <pre className="rounded-lg px-3 py-2 text-[10px] overflow-auto max-h-[300px]" style={{ background: 'oklch(5% 0.02 280)', border: '1px solid oklch(75% 0.18 150 / 0.15)', color: 'oklch(75% 0.12 150)', whiteSpace: 'pre-wrap' }}>
              {proposal.proposedCode.slice(0, 3000)}
              {proposal.proposedCode.length > 3000 && '\n... (truncado)'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Result summary — from DgmTest.tsx + DGMTestPanel.tsx */
function ResultSummary({ result }: { result: Record<string, unknown> }) {
  const archive = result.archive as Record<string, unknown> | undefined;
  const generation = result.generation as Record<string, unknown> | undefined;
  return (
    <div className="m-3 p-4 rounded-xl" style={{ background: 'oklch(75% 0.18 150 / 0.03)', border: '1px solid oklch(75% 0.18 150 / 0.15)' }}>
      <SectionLabel>Resultado Final</SectionLabel>
      <div className="grid grid-cols-4 gap-2 mt-2">
        {[
          { label: 'Archive', value: String(archive?.size ?? '?'), color: 'oklch(70% 0.12 250)' },
          { label: 'Best Acc', value: `${(((archive?.bestAccuracy as number) ?? 0) * 100).toFixed(1)}%`, color: 'oklch(80% 0.18 85)' },
          { label: 'Proofs', value: String(((generation?.scientificProofs as unknown[]) ?? []).length), color: 'oklch(75% 0.18 150)' },
          { label: 'Tempo', value: `${(((result.elapsedMs as number) ?? 0) / 1000).toFixed(0)}s`, color: 'oklch(70% 0.15 300)' },
        ].map(s => (
          <div key={s.label} className="text-center p-3 rounded-lg" style={{ background: 'oklch(100% 0 0 / 0.02)' }}>
            <div className="text-base font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'oklch(40% 0.02 280)' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fitness dimension bar with hover tooltip — from DgmTest.tsx:773-845 */
function FitnessBar({ dim, score }: { dim: string; score: number }) {
  const [hovered, setHovered] = useState(false);
  const info = FITNESS_DIMS[dim];
  const color = score >= 70 ? 'oklch(75% 0.18 150)' : score >= 50 ? 'oklch(80% 0.18 85)' : 'oklch(65% 0.22 25)';

  return (
    <div className="group relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'oklch(60% 0.02 280)' }}>{info?.label || dim}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{score}<span style={{ color: 'oklch(35% 0.02 280)' }}>/{info?.weight || '?'}</span></span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'oklch(100% 0 0 / 0.05)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: `linear-gradient(90deg, oklch(20% 0.05 280), ${color})` }} />
      </div>
      {/* Tooltip */}
      {hovered && info && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[260px] z-50 p-3 rounded-lg pointer-events-none" style={{ background: 'oklch(12% 0.02 280)', border: '1px solid oklch(100% 0 0 / 0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <div className="text-[11px] font-bold mb-1" style={{ color }}>{info.label} ({info.weight})</div>
          <div className="text-[10px] leading-relaxed mb-1.5" style={{ color: 'oklch(75% 0.02 280)' }}>{info.description}</div>
          <div className="text-[10px] p-2 rounded" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
            {score < 50 ? <><strong style={{ color: 'oklch(65% 0.22 25)' }}>Score {score}/100 — Atenção:</strong> <span style={{ color: 'oklch(60% 0.08 25)' }}>{info.low}</span></> : score < 70 ? <><strong style={{ color: 'oklch(80% 0.18 85)' }}>Score {score}/100 — Aceitável.</strong></> : <><strong style={{ color: 'oklch(75% 0.18 150)' }}>Score {score}/100 — Excelente.</strong> <span style={{ color: 'oklch(65% 0.1 150)' }}>{info.high}</span></>}
          </div>
          <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45" style={{ background: 'oklch(12% 0.02 280)', borderRight: '1px solid oklch(100% 0 0 / 0.1)', borderBottom: '1px solid oklch(100% 0 0 / 0.1)' }} />
        </div>
      )}
    </div>
  );
}

/** Small info card for proposal sections */
function InfoCard({ title, color, content }: { title: string; color: string; content: string }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: `${color}06`, border: '1px solid oklch(100% 0 0 / 0.05)' }}>
      <div className="text-[10px] font-bold uppercase mb-1" style={{ color }}>{title}</div>
      <div className="text-[11px] leading-relaxed" style={{ color: 'oklch(80% 0.02 280)' }}>{content}</div>
    </div>
  );
}

/** Stat pill in header */
function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'oklch(100% 0 0 / 0.03)', border: '1px solid oklch(100% 0 0 / 0.06)' }}>
      <span className="text-[9px]" style={{ color: 'oklch(45% 0.02 280)' }}>{label}</span>
      <span className="text-[11px] font-mono font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

/** Section label */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'oklch(45% 0.02 280)', letterSpacing: '0.5px' }}>{children}</div>;
}
