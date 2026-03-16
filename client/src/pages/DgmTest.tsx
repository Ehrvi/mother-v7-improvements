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
    resolveMutation.mutate({ proposalId, approved: true });
  };
  const handleReject = (proposalId: string) => {
    resolveMutation.mutate({ proposalId, approved: false });
  };

  const isRunning = testMutation.isPending;
  const pendingProposals = (proposalsQuery.data ?? []) as DGMProposal[];
  const currentProposal = pendingProposals[0] ?? null;
  const lastStep = events.length > 0 ? events[events.length - 1] : null;

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

          {/* PROPOSAL REVIEW (when a proposal is pending) */}
          {currentProposal && (
            <div style={{ margin: '12px', borderRadius: '10px', border: '2px solid #ffa04a60', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '12px 16px', background: 'rgba(255, 160, 74, 0.08)', borderBottom: '1px solid #ffa04a40', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffa04a' }}>PROPOSTA AGUARDANDO APROVACAO</div>
                  <div style={{ fontSize: '10px', color: '#6060a0', marginTop: '2px' }}>{currentProposal.targetFile} | Fitness: {currentProposal.fitnessScore}/100 | Sandbox: {currentProposal.sandboxPassed ? 'OK' : 'FAIL'} ({currentProposal.sandboxType})</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleApprove(currentProposal.id)} style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none',
                    borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                  }}>
                    APROVAR
                  </button>
                  <button onClick={() => handleReject(currentProposal.id)} style={{
                    background: 'rgba(255, 96, 96, 0.15)', color: '#ff6060', border: '1px solid #ff606040',
                    borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                  }}>
                    REJEITAR
                  </button>
                </div>
              </div>

              {/* Scientific Justification */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #2d2d4e' }}>
                <SectionLabel>Justificativa Cientifica</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  <div style={{ padding: '10px', background: 'rgba(139, 92, 246, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#8b5cf6', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Base Cientifica</div>
                    <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.5 }}>{currentProposal.scientificBasis}</div>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(74, 158, 255, 0.04)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                    <div style={{ color: '#4a9eff', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Rationale</div>
                    <div style={{ color: '#e0e0ff', fontSize: '11px', lineHeight: 1.5 }}>{currentProposal.rationale}</div>
                  </div>
                </div>
                {/* Parecer */}
                <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(74, 255, 158, 0.03)', borderRadius: '6px', border: '1px solid #2d2d4e' }}>
                  <div style={{ color: '#4aff9e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Parecer do Sistema</div>
                  <div style={{ color: '#a0a0c0', fontSize: '11px', lineHeight: 1.5 }}>
                    Fitness Score: <strong style={{ color: currentProposal.fitnessScore >= 70 ? '#4aff9e' : '#ffa04a' }}>{currentProposal.fitnessScore}/100</strong> |{' '}
                    Safety Gate: <strong style={{ color: '#4aff9e' }}>PASSED</strong> |{' '}
                    Sandbox ({currentProposal.sandboxType}): <strong style={{ color: currentProposal.sandboxPassed ? '#4aff9e' : '#ff6060' }}>{currentProposal.sandboxPassed ? 'PASSED' : 'FAILED'}</strong> ({currentProposal.sandboxDurationMs}ms)
                  </div>
                </div>
                {/* Hashes */}
                <div style={{ marginTop: '6px', fontSize: '9px', color: '#4040a0' }}>
                  diagnosis: <code style={{ color: '#4aff9e' }}>{currentProposal.diagnosisHash.slice(0, 16)}...</code> |{' '}
                  modify: <code style={{ color: '#4aff9e' }}>{currentProposal.modificationHash.slice(0, 16)}...</code> |{' '}
                  safety: <code style={{ color: '#4aff9e' }}>{currentProposal.safetyHash.slice(0, 16)}...</code> |{' '}
                  sandbox: <code style={{ color: '#4aff9e' }}>{currentProposal.sandboxHash.slice(0, 16)}...</code>
                </div>
              </div>

              {/* Code Diff */}
              <div style={{ padding: '12px 16px' }}>
                <SectionLabel>Preview do Codigo</SectionLabel>
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
                    <div style={{ fontSize: '10px', color: '#4aff9e', fontWeight: 700, marginBottom: '4px' }}>PROPOSTA (modificacao)</div>
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
