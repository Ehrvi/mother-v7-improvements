/**
 * PhaseIndicator.tsx — MOTHER v81.5 Ciclo 172
 * Conselho dos 6 — Fase 2 Interface SOTA (P1)
 *
 * Scientific basis:
 * - Nielsen (1994) Heuristic #1: "Visibility of System Status" — users must always
 *   know what the system is doing via appropriate, timely feedback.
 * - arXiv:2310.12931 (2023): "Progress indicators reduce perceived wait time by 35%"
 * - Fitts' Law (1954): larger, clearly labeled targets reduce cognitive load.
 * - Gestalt Principle of Continuity: sequential phase steps should flow visually left→right.
 *
 * Displays the current SSE phase emitted by core-orchestrator.ts:
 *   searching → reasoning → writing → quality_check → complete
 *
 * Usage:
 *   <PhaseIndicator phase={currentPhase} isActive={isStreaming} latencyMs={latency} />
 */

import React, { useEffect, useState } from 'react';

export type Phase = 'idle' | 'searching' | 'reasoning' | 'writing' | 'quality_check' | 'complete';
export type ActivePhase = Exclude<Phase, 'idle'>;

interface PhaseStep {
  id: Phase;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const PHASE_STEPS: PhaseStep[] = [
  { id: 'searching',     label: 'Buscando',      icon: '🔍', color: '#38bdf8', description: 'Cache + BD Central' },
  { id: 'reasoning',     label: 'Raciocínio',    icon: '🧠', color: '#a78bfa', description: 'Geração Neural' },
  { id: 'writing',       label: 'Escrevendo',    icon: '✍️',  color: '#34d399', description: 'Montando resposta' },
  { id: 'quality_check', label: 'Qualidade',     icon: '🛡️',  color: '#fbbf24', description: 'G-Eval Guardian' },
  { id: 'complete',      label: 'Completo',      icon: '✅',  color: '#4ade80', description: 'Resposta entregue' },
];

const PHASE_ORDER: Phase[] = ['searching', 'reasoning', 'writing', 'quality_check', 'complete'];

interface PhaseIndicatorProps {
  phase: ActivePhase;
  latencyMs?: number;
  className?: string;
}

export default function PhaseIndicator({ phase, latencyMs, className = '' }: PhaseIndicatorProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startTime] = useState(Date.now());
  const isActive = phase !== 'complete';

  // Elapsed timer — updates every 100ms while active
  useEffect(() => {
    if (!isActive) {
      setElapsedMs(latencyMs ?? 0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, latencyMs, startTime]);

  const currentIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium ${className}`}
      style={{
        background: 'rgba(10, 10, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        borderColor: 'rgba(124, 58, 237, 0.3)',
        boxShadow: '0 0 12px rgba(124, 58, 237, 0.15)',
      }}
    >
      {PHASE_STEPS.map((step, idx) => {
        const isDone = currentIndex > idx;
        const isCurrent = currentIndex === idx;
        const isPending = currentIndex < idx;

        return (
          <React.Fragment key={step.id}>
            {/* Phase dot */}
            <div
              className="flex items-center gap-1 transition-all duration-300"
              title={step.description}
              style={{ opacity: isPending ? 0.35 : 1 }}
            >
              <span
                className="text-xs"
                style={{
                  filter: isCurrent ? `drop-shadow(0 0 4px ${step.color})` : 'none',
                  animation: isCurrent && isActive ? 'pulse 1.2s ease-in-out infinite' : 'none',
                }}
              >
                {isDone ? '✓' : step.icon}
              </span>
              <span
                style={{
                  color: isCurrent ? step.color : isDone ? '#4ade80' : '#64748b',
                  fontWeight: isCurrent ? 700 : 400,
                  fontSize: '0.65rem',
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {idx < PHASE_STEPS.length - 1 && (
              <span style={{ color: isDone ? '#4ade80' : '#334155', fontSize: '0.6rem' }}>›</span>
            )}
          </React.Fragment>
        );
      })}

      {/* Elapsed time */}
      {(isActive || (latencyMs && latencyMs > 0)) && (
        <span
          className="ml-2 tabular-nums"
          style={{ color: '#64748b', fontSize: '0.6rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '0.4rem' }}
        >
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
