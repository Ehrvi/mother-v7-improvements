/**
 * DgmTest — Página DGM Test Lab com feedback em tempo real
 *
 * Features:
 * 1. Feed textual passo a passo em tempo real
 * 2. Preview da proposta de código (diff original vs modificado)
 * 3. Aprovação humana com botão Aprovar/Rejeitar + parecer
 * 4. Justificativa científica com paper, rationale, e parecer
 *
 * Scientific basis: Darwin Gödel Machine (arXiv:2505.22954, Zhang et al. 2025)
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

/* ── Types ── */

interface DGMEvent {
  step: string;
  status: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface DGMProposal {
  id: string;
  runId: string;
  targetFile: string;
  proposedCode: string;
  originalCode: string;
  rationale: string;
  scientificBasis: string;
  expectedImprovement: string;
  fitnessScore: number;
  sandboxPassed: boolean;
  sandboxType: string;
  sandboxDurationMs: number;
  diagnosisHash: string;
  modificationHash: string;
  safetyHash: string;
  fitnessHash: string;
  sandboxHash: string;
  // C358: Rich context
  title?: string;
  summary?: string;
  problemStatement?: string;
  rootCause?: string;
  proposedFix?: string;
  mutationType?: string;
  fitnessDimensions?: Record<string, number>;
  safetyWarnings?: string[];
  parentMetrics?: {
    id: string;
    accuracy: number;
    resolved: number;
    total: number;
    unresolvedIds: string[];
  };
  diagnosisLength?: number;
  codeLength?: number;
}

const STEP_ICONS: Record<string, string> = {
  init: '1',
  benchmark: '2',
  diagnose: '3',
  modify: '4',
  safety: '5',
  fitness: '6',
  sandbox: '7',
  proposal: '8',
  evaluate: '9',
  complete: '!',
  error: 'X',
};

const STEP_COLORS: Record<string, string> = {
  start: '#4a9eff',
  success: '#4aff9e',
  fail: '#ff6060',
  waiting: '#ffa04a',
};

/* ── Live Activity Rotating Messages ── */
const ACTIVITY_MESSAGES: Record<string, string[]> = {
  init: [
    'Selecionando agente-pai do arquivo MAP-Elites...',
    'Preparando operador de mutacao...',
    'Calculando hash de inicializacao SHA-256...',
    'Configurando parametros de evolucao...',
  ],
  diagnose: [
    'Analisando pipeline para identificar fraquezas...',
    'Executando queries do benchmark no agente-pai...',
    'Comparando metricas de qualidade...',
    'Formulando problem statement cientifico...',
    'Consultando papers relevantes (arXiv)...',
    'Classificando tipo de deficiencia encontrada...',
  ],
  modify: [
    'LLM gerando modificacao de codigo...',
    'Aplicando principios de Self-Referential Improvement...',
    'Avaliando trade-offs de complexidade vs ganho...',
    'Escrevendo patch para arquivo alvo...',
    'Verificando coerencia com arquitetura existente...',
    'Adicionando base cientifica ao rationale...',
  ],
  safety: [
    'Verificando acesso a credenciais...',
    'Analisando loops infinitos potenciais...',
    'Checando delecao de arquivos criticos...',
    'Validando escopo de modificacao permitido...',
    'Aplicando Constitutional AI (arXiv:2212.08073)...',
  ],
  fitness: [
    'Avaliando corretude do codigo...',
    'Medindo robustez e tratamento de erros...',
    'Calculando complexidade ciclomatica...',
    'Analisando seguranca (OWASP top 10)...',
    'Verificando testabilidade...',
    'Computando score multi-dimensional (7 eixos)...',
  ],
  sandbox: [
    'Criando sandbox isolado E2B...',
    'Compilando TypeScript no ambiente seguro...',
    'Executando validacao de sintaxe...',
    'Verificando efeitos colaterais...',
    'Testando imports e exports...',
    'Rodando verificacao de integridade...',
  ],
  proposal: [
    'Aguardando aprovacao humana...',
    'Proposta pronta para revisao...',
    'Human-in-the-loop ativo...',
  ],
  evaluate: [
    'Executando benchmark completo...',
    'Testando queries uma a uma...',
    'Medindo qualidade G-Eval por resposta...',
    'Comparando accuracy vs agente-pai...',
    'Calculando ganho empirico...',
  ],
  complete: [
    'Finalizando prova criptografica...',
    'Salvando variante no arquivo MAP-Elites...',
    'Gerando hash final de verificacao...',
  ],
};

function LiveActivityBanner({ currentStep, isRunning }: { currentStep: string | null; isRunning: boolean }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!isRunning || !currentStep) return;
    const messages = ACTIVITY_MESSAGES[currentStep];
    if (!messages || messages.length === 0) return;

    setMsgIndex(0);
    setOpacity(1);

    const interval = setInterval(() => {
      // Fade out
      setOpacity(0);
      setTimeout(() => {
        setMsgIndex(prev => (prev + 1) % messages.length);
        // Fade in
        setOpacity(1);
      }, 300);
    }, 2800);

    return () => clearInterval(interval);
  }, [currentStep, isRunning]);

  if (!isRunning || !currentStep) return null;

  const messages = ACTIVITY_MESSAGES[currentStep];
  if (!messages || messages.length === 0) return null;

  const stepLabel = currentStep === 'init' ? 'INICIALIZANDO' : currentStep === 'diagnose' ? 'DIAGNOSTICANDO' : currentStep === 'modify' ? 'GERANDO CODIGO' : currentStep === 'safety' ? 'SAFETY GATE' : currentStep === 'fitness' ? 'FITNESS CHECK' : currentStep === 'sandbox' ? 'SANDBOX' : currentStep === 'proposal' ? 'APROVACAO' : currentStep === 'evaluate' ? 'BENCHMARK' : 'FINALIZANDO';

  return (
    <div style={{
      margin: '12px 12px 0', padding: '10px 16px', borderRadius: '8px',
      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(74, 158, 255, 0.08))',
      border: '1px solid rgba(139, 92, 246, 0.2)',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      {/* Animated spinner */}
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        border: '2px solid transparent',
        borderTopColor: '#8b5cf6', borderRightColor: '#4a9eff',
        animation: 'spin 1s linear infinite', flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '10px', fontWeight: 700, color: '#8b5cf6',
          textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px',
        }}>
          {stepLabel}
        </div>
        <div style={{
          fontSize: '12px', color: '#c0c0e0',
          transition: 'opacity 0.3s ease',
          opacity,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {messages[msgIndex % messages.length]}
        </div>
      </div>
      {/* Pulsing dot */}
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#4aff9e', animation: 'pulse 1.5s infinite', flexShrink: 0,
      }} />
    </div>
  );
}

export default function DgmTest() {
  const navigate = useNavigate();
  const [customQueries, setCustomQueries] = useState('');
  const [events, setEvents] = useState<DGMEvent[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Polling for events
  const eventsQuery = trpc.mother.dgmEvents.useQuery(
    { since: events.length },
    { enabled: pollEnabled, refetchInterval: 1000 },
  );

  // Polling for pending proposals
  const proposalsQuery = trpc.mother.dgmPendingProposals.useQuery(
    undefined,
    { enabled: pollEnabled, refetchInterval: 1500 },
  );

  const resolveMutation = trpc.mother.dgmResolveProposal.useMutation();

  const testMutation = trpc.mother.dgmTestRun.useMutation({
    onSuccess: (data) => {
      setResult(data as Record<string, unknown>);
      setError(null);
      setPollEnabled(false);
    },
    onError: (err) => {
      setError(err.message);
      setResult(null);
      setPollEnabled(false);
    },
  });

  // Append new events
  useEffect(() => {
    if (eventsQuery.data && eventsQuery.data.length > 0) {
      setEvents(prev => [...prev, ...(eventsQuery.data as DGMEvent[])]);
    }
  }, [eventsQuery.data]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const handleRun = () => {
    setEvents([]);
    setResult(null);
    setError(null);
    setPollEnabled(true);

    const queries = customQueries.trim()
      ? customQueries.split('\n').filter(q => q.trim()).map((q, i) => ({
          id: `custom-${String(i + 1).padStart(3, '0')}`,
          query: q.trim(),
          expectedMinQuality: 50,
          category: 'custom',
        }))
      : [];

    testMutation.mutate({
      benchmarkQueries: queries.length > 0 ? queries : undefined,
      selfImproveSize: 1,
    });
  };

  const handleApprove = (proposalId: string) => {
    resolveMutation.mutate({ proposalId, approved: true }, {
      onSuccess: (data) => {
        if (!data.resolved) console.warn('[DGM] Proposal not found (may have been auto-approved)');
      },
      onError: (err) => console.error('[DGM] Failed to approve:', err.message),
    });
  };
  const handleReject = (proposalId: string) => {
    resolveMutation.mutate({ proposalId, approved: false }, {
      onSuccess: (data) => {
        if (!data.resolved) console.warn('[DGM] Proposal not found (may have been auto-approved)');
      },
      onError: (err) => console.error('[DGM] Failed to reject:', err.message),
    });
  };

  const isRunning = testMutation.isPending;
  const pendingProposals = (proposalsQuery.data ?? []) as DGMProposal[];
  const currentProposal = pendingProposals[0] ?? null;
  const lastStep = events.length > 0 ? events[events.length - 1] : null;
  const activeStep = isRunning && lastStep?.status === 'start' ? lastStep.step : (isRunning && lastStep ? lastStep.step : null);

  return (
    <div style={{ minHeight: '100vh', background: '#08081a', color: '#e0e0ff', fontFamily: 'monospace' }}>

      {/* Top bar */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid #2d2d4e',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(139, 92, 246, 0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: '1px solid #2d2d4e', borderRadius: '6px', color: '#6060a0', cursor: 'pointer', padding: '4px 10px', fontSize: '12px' }}>
            &#x2190; Home
          </button>
          <div>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#8b5cf6' }}>DGM Test Lab</span>
            <span style={{ color: '#4040a0', fontSize: '10px', marginLeft: '10px' }}>Darwin Godel Machine (arXiv:2505.22954)</span>
          </div>
        </div>
        <button onClick={handleRun} disabled={isRunning} style={{
          background: isRunning ? '#2d2d4e' : 'linear-gradient(135deg, #8b5cf6, #4a9eff)',
          color: isRunning ? '#6060a0' : '#fff', border: 'none', borderRadius: '8px',
          padding: '8px 20px', cursor: isRunning ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: '13px',
        }}>
          {isRunning ? 'Executando...' : 'Rodar Teste DGM'}
        </button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 49px)' }}>

        {/* Left: Config + Pipeline Progress */}
        <div style={{ width: '320px', borderRight: '1px solid #2d2d4e', overflowY: 'auto', flexShrink: 0 }}>
          {/* Config */}
          <div style={{ padding: '12px' }}>
            <SectionLabel>Benchmark Queries</SectionLabel>
            <textarea
              value={customQueries}
              onChange={e => setCustomQueries(e.target.value)}
              placeholder={"1 query por linha\n(vazio = benchmark padrao)"}
              disabled={isRunning}
              rows={3}
              style={{
                width: '100%', background: '#0f0f1a', border: '1px solid #2d2d4e',
                borderRadius: '6px', color: '#e0e0ff', padding: '8px',
                fontFamily: 'monospace', fontSize: '11px', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Pipeline Steps */}
          <div style={{ padding: '12px', borderTop: '1px solid #2d2d4e' }}>
            <SectionLabel>Pipeline DGM</SectionLabel>
            <div style={{ fontSize: '10px', color: '#4040a0', marginBottom: '8px' }}>
              Cada etapa gera hash SHA-256 para auditoria
            </div>
            {['init', 'diagnose', 'modify', 'safety', 'fitness', 'sandbox', 'proposal', 'evaluate', 'complete'].map(step => {
              const stepEvents = events.filter(e => e.step === step);
              const lastEvent = stepEvents[stepEvents.length - 1];
              const status = lastEvent?.status ?? 'pending';
              const isActive = lastStep?.step === step && status === 'start';
              return (
                <div key={step} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', marginBottom: '3px', borderRadius: '6px',
                  background: isActive ? 'rgba(74, 158, 255, 0.08)' : 'rgba(255,255,255,0.01)',
                  borderLeft: `3px solid ${status === 'pending' ? '#2d2d4e' : STEP_COLORS[status] ?? '#6060a0'}`,
                }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', fontSize: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                    background: status === 'pending' ? '#1a1a2e' : status === 'start' ? '#1a2a4e' : status === 'success' ? 'rgba(74,255,158,0.15)' : status === 'fail' ? 'rgba(255,96,96,0.15)' : 'rgba(255,160,74,0.15)',
                    color: STEP_COLORS[status] ?? '#4040a0',
                    animation: isActive ? 'pulse 1.5s infinite' : undefined,
                  }}>
                    {isActive ? '...' : STEP_ICONS[step]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: status === 'pending' ? '#4040a0' : '#e0e0ff', textTransform: 'uppercase' }}>
                      {step === 'init' ? 'Inicializar' : step === 'diagnose' ? 'Diagnosticar' : step === 'modify' ? 'Gerar Codigo' : step === 'safety' ? 'Safety Gate' : step === 'fitness' ? 'Fitness Check' : step === 'sandbox' ? 'Sandbox' : step === 'proposal' ? 'Aprovacao Humana' : step === 'evaluate' ? 'Benchmark' : 'Concluido'}
                    </div>
                    {lastEvent && <div style={{ fontSize: '9px', color: STEP_COLORS[status] ?? '#4040a0', marginTop: '1px' }}>{(lastEvent.message.split('\n\n')[0] || lastEvent.message).slice(0, 100)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Main Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Error */}
          {error && (
            <div style={{ margin: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255, 96, 96, 0.1)', border: '1px solid #ff606040', color: '#ff6060', fontSize: '12px' }}>
              Erro: {error}
            </div>
          )}

          {/* Live Activity Banner */}
          <LiveActivityBanner currentStep={activeStep} isRunning={isRunning || pollEnabled} />

          {/* Empty state */}
          {events.length === 0 && !isRunning && !error && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4040a0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>DGM Test Lab</div>
                <div style={{ fontSize: '11px', maxWidth: '400px', lineHeight: 1.6 }}>
                  Clique em <strong style={{ color: '#8b5cf6' }}>Rodar Teste DGM</strong> para executar o pipeline completo.
                  Cada passo sera mostrado em tempo real com justificativa cientifica.
                </div>
              </div>
            </div>
          )}

          {/* PROPOSAL REVIEW (when a proposal is pending) — C358: Rich context */}
          {currentProposal && (
            <div style={{ margin: '12px', borderRadius: '10px', border: '2px solid #ffa04a60', overflow: 'hidden', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
              {/* Header with title + action buttons */}
              <div style={{ padding: '14px 16px', background: 'rgba(255, 160, 74, 0.08)', borderBottom: '1px solid #ffa04a40' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#ffa04a' }}>
                      {currentProposal.title || 'PROPOSTA AGUARDANDO APROVACAO'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#c0c0e0', marginTop: '4px', lineHeight: 1.5 }}>
                      {currentProposal.summary || currentProposal.rationale}
                    </div>
                    <div style={{ fontSize: '10px', color: '#6060a0', marginTop: '4px' }}>
                      {currentProposal.targetFile} | Tipo: {currentProposal.mutationType || 'general'} | Run: {currentProposal.runId}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                    <button onClick={() => handleApprove(currentProposal.id)} disabled={resolveMutation.isPending} style={{
                      background: resolveMutation.isPending ? '#555' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none',
                      borderRadius: '8px', padding: '10px 24px', cursor: resolveMutation.isPending ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px',
                    }}>
                      {resolveMutation.isPending ? 'ENVIANDO...' : 'APROVAR'}
                    </button>
                    <button onClick={() => handleReject(currentProposal.id)} disabled={resolveMutation.isPending} style={{
                      background: resolveMutation.isPending ? 'rgba(100,100,100,0.15)' : 'rgba(255, 96, 96, 0.15)', color: resolveMutation.isPending ? '#888' : '#ff6060', border: '1px solid #ff606040',
                      borderRadius: '8px', padding: '10px 24px', cursor: resolveMutation.isPending ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px',
                    }}>
                      {resolveMutation.isPending ? 'ENVIANDO...' : 'REJEITAR'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 1. DIAGNOSTICO — Why this change is needed */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2d4e' }}>
                <SectionLabel>1. Diagnostico — Por que esta mudanca e necessaria</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div style={{ padding: '10px', background: 'rgba(255, 96, 96, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#ff8080', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Problema Identificado</div>
                    <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.6 }}>
                      {currentProposal.problemStatement || currentProposal.rationale}
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(255, 160, 74, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#ffa04a', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Causa Raiz</div>
                    <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.6 }}>
                      {currentProposal.rootCause || 'Identificado via auto-diagnostico DGM'}
                    </div>
                  </div>
                </div>
                {/* Parent metrics — real data proving the need */}
                {currentProposal.parentMetrics && (
                  <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(74, 158, 255, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#4a9eff', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Dados do Agente-Pai (Baseline)</div>
                    <div style={{ color: '#a0a0c0', fontSize: '11px', lineHeight: 1.6 }}>
                      Variante: <strong style={{ color: '#e0e0ff' }}>{currentProposal.parentMetrics.id}</strong> |{' '}
                      Accuracy: <strong style={{ color: currentProposal.parentMetrics.accuracy >= 0.8 ? '#4aff9e' : '#ffa04a' }}>
                        {(currentProposal.parentMetrics.accuracy * 100).toFixed(1)}%
                      </strong> |{' '}
                      Resolvidas: <strong style={{ color: '#e0e0ff' }}>{currentProposal.parentMetrics.resolved}/{currentProposal.parentMetrics.total}</strong>
                      {currentProposal.parentMetrics.unresolvedIds.length > 0 && (
                        <span> | Nao resolvidas: <strong style={{ color: '#ff8080' }}>{currentProposal.parentMetrics.unresolvedIds.join(', ')}</strong></span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. PROPOSTA — What the fix is */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2d4e' }}>
                <SectionLabel>2. Proposta de Solucao</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div style={{ padding: '10px', background: 'rgba(74, 255, 158, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#4aff9e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Correcao Proposta</div>
                    <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.6 }}>
                      {currentProposal.proposedFix || currentProposal.rationale}
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(139, 92, 246, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#8b5cf6', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Melhoria Esperada</div>
                    <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.6 }}>
                      {currentProposal.expectedImprovement}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. EMBASAMENTO CIENTIFICO */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2d4e' }}>
                <SectionLabel>3. Embasamento Cientifico</SectionLabel>
                <div style={{ padding: '10px', background: 'rgba(139, 92, 246, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e', marginTop: '6px' }}>
                  <div style={{ color: '#8b5cf6', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Base Cientifica</div>
                  <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.6 }}>{currentProposal.scientificBasis}</div>
                </div>
                <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(74, 158, 255, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                  <div style={{ color: '#4a9eff', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Raciocinio Completo (Rationale)</div>
                  <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.6 }}>{currentProposal.rationale}</div>
                </div>
              </div>

              {/* 4. RELATORIO DE VALIDACAO */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2d4e' }}>
                <SectionLabel>4. Relatorio de Validacao</SectionLabel>
                {/* Fitness dimensions */}
                <div style={{ marginTop: '6px', padding: '10px', background: 'rgba(74, 255, 158, 0.03)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                  <div style={{ color: '#4aff9e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Fitness Score: {currentProposal.fitnessScore}/100
                  </div>
                  {currentProposal.fitnessDimensions && Object.keys(currentProposal.fitnessDimensions).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(currentProposal.fitnessDimensions).map(([dim, score]) => (
                        <div key={dim} style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '10px',
                          background: (score as number) >= 70 ? 'rgba(74,255,158,0.1)' : (score as number) >= 50 ? 'rgba(255,160,74,0.1)' : 'rgba(255,96,96,0.1)',
                          color: (score as number) >= 70 ? '#4aff9e' : (score as number) >= 50 ? '#ffa04a' : '#ff6060',
                          border: `1px solid ${(score as number) >= 70 ? '#4aff9e20' : (score as number) >= 50 ? '#ffa04a20' : '#ff606020'}`,
                        }}>
                          {dim}: <strong>{String(score)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Safety + Sandbox */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  <div style={{ padding: '10px', background: 'rgba(74, 255, 158, 0.03)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#4aff9e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Safety Gate</div>
                    <div style={{ color: '#a0a0c0', fontSize: '11px' }}>
                      Status: <strong style={{ color: '#4aff9e' }}>PASSED</strong>
                      {currentProposal.safetyWarnings && currentProposal.safetyWarnings.length > 0 && (
                        <div style={{ marginTop: '4px', color: '#ffa04a', fontSize: '10px' }}>
                          Warnings: {currentProposal.safetyWarnings.join('; ')}
                        </div>
                      )}
                      {(!currentProposal.safetyWarnings || currentProposal.safetyWarnings.length === 0) && (
                        <span style={{ color: '#6060a0' }}> (0 warnings)</span>
                      )}
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(74, 255, 158, 0.03)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#4aff9e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Sandbox</div>
                    <div style={{ color: '#a0a0c0', fontSize: '11px' }}>
                      Status: <strong style={{ color: currentProposal.sandboxPassed ? '#4aff9e' : '#ff6060' }}>{currentProposal.sandboxPassed ? 'PASSED' : 'FAILED'}</strong> |{' '}
                      Tipo: {currentProposal.sandboxType} |{' '}
                      Duracao: {currentProposal.sandboxDurationMs}ms
                    </div>
                  </div>
                </div>
                {/* Proof hashes */}
                <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(64,64,160,0.06)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                  <div style={{ color: '#4040a0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Cadeia de Provas (SHA-256)</div>
                  <div style={{ fontSize: '9px', color: '#4040a0', lineHeight: 1.8 }}>
                    diagnostico: <code style={{ color: '#4aff9e' }}>{currentProposal.diagnosisHash?.slice(0, 16)}...</code>{' '}
                    modificacao: <code style={{ color: '#4aff9e' }}>{currentProposal.modificationHash?.slice(0, 16)}...</code>{' '}
                    safety: <code style={{ color: '#4aff9e' }}>{currentProposal.safetyHash?.slice(0, 16)}...</code>{' '}
                    fitness: <code style={{ color: '#4aff9e' }}>{currentProposal.fitnessHash?.slice(0, 16)}...</code>{' '}
                    sandbox: <code style={{ color: '#4aff9e' }}>{currentProposal.sandboxHash?.slice(0, 16)}...</code>
                  </div>
                </div>
              </div>

              {/* 5. CODE DIFF */}
              <div style={{ padding: '12px 16px' }}>
                <SectionLabel>5. Preview do Codigo</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: '#ff6060', fontWeight: 700, marginBottom: '4px' }}>ORIGINAL ({currentProposal.targetFile})</div>
                    <pre style={{
                      background: '#0a0a16', border: '1px solid #2d2d4e', borderRadius: '6px',
                      padding: '10px', fontSize: '10px', color: '#a0a0c0',
                      maxHeight: '300px', overflowY: 'auto', overflowX: 'auto', whiteSpace: 'pre-wrap',
                    }}>
                      {currentProposal.originalCode ? currentProposal.originalCode.slice(0, 3000) : '(arquivo novo)'}
                      {currentProposal.originalCode && currentProposal.originalCode.length > 3000 && '\n... (truncado)'}
                    </pre>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: '#4aff9e', fontWeight: 700, marginBottom: '4px' }}>PROPOSTA ({currentProposal.codeLength || currentProposal.proposedCode.length} chars)</div>
                    <pre style={{
                      background: '#0a0a16', border: '1px solid #4aff9e30', borderRadius: '6px',
                      padding: '10px', fontSize: '10px', color: '#c0ffc0',
                      maxHeight: '300px', overflowY: 'auto', overflowX: 'auto', whiteSpace: 'pre-wrap',
                    }}>
                      {currentProposal.proposedCode.slice(0, 3000)}
                      {currentProposal.proposedCode.length > 3000 && '\n... (truncado)'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Event Feed */}
          {events.length > 0 && (
            <div style={{ margin: '12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <SectionLabel>Feed em Tempo Real</SectionLabel>
              <div ref={feedRef} style={{
                flex: 1, background: '#0a0a16', borderRadius: '8px', border: '1px solid #2d2d4e',
                padding: '10px', overflowY: 'auto', maxHeight: currentProposal ? '200px' : '500px',
              }}>
                {events.map((ev, i) => {
                  const messageParts = ev.message.split('\n\n');
                  const title = messageParts[0] || '';
                  const detail = messageParts.slice(1).join('\n\n');
                  return (
                    <div key={i} style={{
                      padding: '8px 10px', marginBottom: '6px', borderRadius: '6px',
                      borderLeft: `3px solid ${STEP_COLORS[ev.status] ?? '#4040a0'}`,
                      background: ev.status === 'fail' ? 'rgba(255,96,96,0.06)' : ev.status === 'waiting' ? 'rgba(255,160,74,0.06)' : ev.status === 'success' ? 'rgba(74,255,158,0.03)' : 'rgba(255,255,255,0.01)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: detail ? '4px' : 0 }}>
                        <span style={{ color: '#4040a0', fontSize: '9px', flexShrink: 0 }}>
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
                          color: STEP_COLORS[ev.status] ?? '#6060a0',
                          padding: '1px 5px', borderRadius: '3px',
                          background: ev.status === 'success' ? 'rgba(74,255,158,0.1)' : ev.status === 'fail' ? 'rgba(255,96,96,0.1)' : ev.status === 'waiting' ? 'rgba(255,160,74,0.1)' : 'transparent',
                        }}>
                          {ev.step}:{ev.status}
                        </span>
                        <span style={{ fontSize: '11px', color: '#e0e0ff', fontWeight: 600 }}>
                          {title}
                        </span>
                      </div>
                      {detail && (
                        <div style={{ fontSize: '10px', color: '#9090b8', lineHeight: 1.6, marginLeft: '2px', marginTop: '2px', whiteSpace: 'pre-wrap' }}>
                          {detail}
                        </div>
                      )}
                      {ev.data && (ev.data.hash || ev.data.score || ev.data.dimensions) && (
                        <div style={{ marginTop: '3px', fontSize: '9px', color: '#4a4a6a' }}>
                          {ev.data.hash && <>Hash: <code style={{ color: '#6a6aff' }}>{String(ev.data.hash).slice(0, 16)}...</code> </>}
                          {ev.data.score != null && <>Score: <strong style={{ color: ev.data.score as number >= 50 ? '#4aff9e' : '#ff6060' }}>{String(ev.data.score)}/100</strong> </>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {isRunning && !currentProposal && (
                  <div style={{ padding: '4px 8px', color: '#4a9eff', fontSize: '11px' }}>
                    &#x21BB; Processando...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result summary */}
          {result && (
            <div style={{ margin: '12px', padding: '12px 16px', background: 'rgba(74, 255, 158, 0.04)', borderRadius: '8px', border: '1px solid #4aff9e30' }}>
              <SectionLabel>Resultado Final</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '6px' }}>
                {[
                  { label: 'Archive', value: String((result.archive as Record<string, unknown>)?.size ?? '?'), color: '#a0a0c0' },
                  { label: 'Best Acc', value: `${(((result.archive as Record<string, unknown>)?.bestAccuracy as number ?? 0) * 100).toFixed(1)}%`, color: '#ffa04a' },
                  { label: 'Proofs', value: String(((result.generation as Record<string, unknown>)?.scientificProofs as unknown[] ?? []).length), color: '#4aff9e' },
                  { label: 'Tempo', value: `${((result.elapsedMs as number ?? 0) / 1000).toFixed(0)}s`, color: '#8b5cf6' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <div style={{ color: s.color, fontWeight: 700, fontSize: '16px' }}>{s.value}</div>
                    <div style={{ color: '#4040a0', fontSize: '10px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    color: '#6060a0', fontSize: '10px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
  }}>
    {children}
  </div>
);
