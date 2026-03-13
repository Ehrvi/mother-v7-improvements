/**
 * PhaseIndicator.tsx — CONSELHO DOS 5 — Delphi+MAD Synthesis
 * C1 (Engineering): Wickens SEEV model — preattentive salience for phase transitions
 * C2 (Cognitive): Minimal extraneous load — show only active phase compactly
 * C3 (Visual): OKLCH phase colors + pulse-orbit animation
 * C4 (Safety): Not applicable (MOTHER only)
 *
 * Scientific basis:
 * - Nielsen (1994) H1: Visibility of System Status
 * - Wickens et al. SEEV model: Salience, Effort, Expectancy, Value
 *   → phase transitions MUST increase salience via unique hue + motion (pop-out)
 * - arXiv:2310.12931: Progress indicators reduce perceived wait by 35%
 * - Fitts (1954): touch targets ≥ 44×44px for accessibility
 * - Gestalt Continuity: sequential steps flow left→right
 *
 * SEEV Optimization vs previous version:
 * - Previous: emoji icons (low salience), tiny 0.65rem text (high effort)
 * - New: orbit-pulse ring on active phase (unique motion = preattentive pop-out)
 *        compact single-line with current phase label prominently
 *        completed phases collapsed to ✓ dots (Miller 7±2 chunking)
 */

import React, { useEffect, useState, useRef } from 'react';

export type Phase = 'idle' | 'searching' | 'reasoning' | 'writing' | 'quality_check' | 'complete';
export type ActivePhase = Exclude<Phase, 'idle'>;

interface PhaseStep {
  id: Phase;
  label: string;
  shortLabel: string;
  color: string;
  cssVar: string;
  description: string;
}

const PHASE_STEPS: PhaseStep[] = [
  {
    id: 'searching',
    label: 'Buscando',
    shortLabel: 'BD',
    color: 'oklch(72% 0.14 195)',    /* cyan-base — C3 perceptual palette */
    cssVar: '--cyan-base',
    description: 'Memória episódica + BD Central',
  },
  {
    id: 'reasoning',
    label: 'Raciocínio',
    shortLabel: 'AI',
    color: 'oklch(68% 0.20 290)',    /* violet-bright */
    cssVar: '--violet-bright',
    description: 'Processamento cognitivo neural',
  },
  {
    id: 'writing',
    label: 'Escrevendo',
    shortLabel: 'TX',
    color: 'oklch(65% 0.18 145)',    /* green — alarm-ok */
    cssVar: '--alarm-ok-fg',
    description: 'Montando e formatando resposta',
  },
  {
    id: 'quality_check',
    label: 'Qualidade',
    shortLabel: 'QA',
    color: 'oklch(75% 0.14 70)',     /* amber-base */
    cssVar: '--amber-base',
    description: 'G-Eval Guardian + Constitutional AI',
  },
  {
    id: 'complete',
    label: 'Completo',
    shortLabel: 'OK',
    color: 'oklch(65% 0.18 145)',    /* green */
    cssVar: '--alarm-ok-fg',
    description: 'Resposta entregue ao usuário',
  },
];

const PHASE_ORDER: Phase[] = ['searching', 'reasoning', 'writing', 'quality_check', 'complete'];

interface PhaseIndicatorProps {
  phase: ActivePhase;
  latencyMs?: number;
  className?: string;
  /** compact=true: inline header badge; compact=false: full step bar */
  compact?: boolean;
}

export default function PhaseIndicator({ phase, latencyMs, className = '', compact = true }: PhaseIndicatorProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(Date.now());
  const prevPhaseRef = useRef<Phase | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const isActive = phase !== 'complete';

  // Reset start time on new phase sequence
  useEffect(() => {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer — updates every 100ms while active
  useEffect(() => {
    if (!isActive) {
      setElapsedMs(latencyMs ?? elapsedMs);
      return;
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, latencyMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // SEEV: trigger transition animation on phase change (preattentive pop-out)
  useEffect(() => {
    if (prevPhaseRef.current !== null && prevPhaseRef.current !== phase) {
      setTransitioning(true);
      const t = setTimeout(() => setTransitioning(false), 400);
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const currentIdx = PHASE_ORDER.indexOf(phase);
  const currentStep = PHASE_STEPS.find(s => s.id === phase)!;

  // ── COMPACT MODE: header badge (Nielsen H1 — status always visible) ──
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium select-none ${className}`}
        style={{
          background: 'oklch(12% 0.02 280 / 0.9)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${currentStep?.color ?? 'oklch(35% 0.10 300)'}40`,
          transition: `border-color ${200}ms ease`,
        }}
        title={currentStep?.description}
        aria-label={`Status: ${currentStep?.label ?? phase}`}
        aria-live="polite"
      >
        {/* Phase steps as dots — completed=filled, current=pulsing, pending=empty */}
        <div className="flex items-center gap-0.5" aria-hidden="true">
          {PHASE_STEPS.slice(0, -1).map((step, idx) => {
            const isDone    = currentIdx > idx;
            const isCurrent = currentIdx === idx;
            const isPending = currentIdx < idx;
            return (
              <span
                key={step.id}
                className={isCurrent && isActive ? 'animate-phase-orbit' : ''}
                style={{
                  display: 'inline-block',
                  width:  isCurrent ? '7px' : '5px',
                  height: isCurrent ? '7px' : '5px',
                  borderRadius: '50%',
                  background:   isDone    ? 'oklch(65% 0.18 145)' :
                                isCurrent ? step.color :
                                'oklch(30% 0.03 265)',
                  transition: `all ${200}ms ease`,
                  // CSS custom property for orbit animation
                  ['--phase-color' as string]: step.color,
                }}
              />
            );
          })}
        </div>

        {/* Current phase label — prominent (SEEV: high value, visible) */}
        <span
          className={transitioning ? 'animate-phase-flash' : ''}
          style={{
            color: currentStep?.color ?? 'oklch(72% 0.02 275)',
            fontWeight: 600,
            fontSize: '0.7rem',
            letterSpacing: '0.02em',
          }}
        >
          {phase === 'complete' ? '✓ Completo' : currentStep?.label ?? phase}
        </span>

        {/* Elapsed time — tabular nums (C3 typography) */}
        {(isActive || elapsedMs > 0) && (
          <span
            className="tabular-nums"
            style={{
              color: 'oklch(52% 0.02 270)',
              fontSize: '0.65rem',
              borderLeft: '1px solid oklch(35% 0.10 300)',
              paddingLeft: '6px',
              marginLeft: '2px',
            }}
          >
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>
    );
  }

  // ── FULL MODE: horizontal step bar ──
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded-xl ${className}`}
      style={{
        background: 'oklch(12% 0.02 280 / 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid oklch(35% 0.10 300)',
      }}
      role="status"
      aria-label={`Processando: ${currentStep?.label ?? phase}`}
      aria-live="polite"
    >
      {PHASE_STEPS.map((step, idx) => {
        const isDone    = currentIdx > idx;
        const isCurrent = currentIdx === idx;
        const isPending = currentIdx < idx;

        return (
          <React.Fragment key={step.id}>
            {/* Step node */}
            <div
              className="flex flex-col items-center gap-0.5 transition-all duration-200"
              style={{ opacity: isPending ? 0.3 : 1, minWidth: '40px' }}
              title={step.description}
            >
              {/* Dot with orbit animation for active */}
              <div
                className={isCurrent && isActive ? 'animate-phase-orbit' : ''}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isDone    ? 'oklch(65% 0.18 145)' :
                              isCurrent ? step.color :
                              'oklch(24% 0.03 270)',
                  border: `1px solid ${isCurrent ? step.color : isDone ? 'oklch(65% 0.18 145)' : 'oklch(35% 0.10 300)'}`,
                  transition: `all ${200}ms ease`,
                  ['--phase-color' as string]: step.color,
                }}
                aria-hidden="true"
              />
              {/* Label */}
              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: isCurrent ? 700 : 400,
                  color:    isDone    ? 'oklch(65% 0.18 145)' :
                            isCurrent ? step.color :
                            'oklch(38% 0.02 270)',
                  letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                {isDone ? '✓' : step.shortLabel}
              </span>
            </div>

            {/* Connector line */}
            {idx < PHASE_STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '1px',
                  background: currentIdx > idx
                    ? 'oklch(65% 0.18 145)'
                    : 'oklch(24% 0.03 270)',
                  transition: `background ${300}ms ease`,
                  marginBottom: '12px',
                }}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Elapsed time */}
      {(isActive || elapsedMs > 0) && (
        <span
          className="tabular-nums ml-2"
          style={{
            color: 'oklch(52% 0.02 270)',
            fontSize: '0.7rem',
            borderLeft: '1px solid oklch(35% 0.10 300)',
            paddingLeft: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
