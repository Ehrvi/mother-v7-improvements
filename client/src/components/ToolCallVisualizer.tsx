/**
 * ToolCallVisualizer.tsx — CONSELHO DOS 5 — Delphi+MAD Synthesis
 *
 * C1 (Engineering): Collapsed accordion by default — tool calls are L2 (on-demand)
 * C2 (Cognitive): Collapsed reduces extraneous cognitive load during streaming
 *                 Show summary (N tools, N success, N error) without detail
 * C3 (Visual): Timeline strip for completed tools; orbit pulse for running
 * C4 (Safety): N/A (MOTHER only)
 *
 * Scientific basis:
 * - ReAct (Yao et al., arXiv:2210.03629, ICLR 2023): tool calls must be visible
 *   for trust building — but detail is secondary to primary response
 * - Nielsen (1994) H1: Visibility of System Status — show tool execution
 * - Shneiderman (1983) Direct Manipulation: inspectable on demand
 * - Sweller (1988) Cognitive Load Theory: accordion reduces extraneous load
 * - Miller (1956) 7±2: summary bar chunks N tools into single chunk
 *
 * SEEV analysis (C1):
 * - Running tool: HIGH salience (orbit animation) — draws attention appropriately
 * - Completed tools: LOW salience (collapsed summary) — don't compete with response
 * - Error: MEDIUM salience (red badge in summary) — needs attention but not urgent
 */

import React, { useState } from 'react';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  durationMs?: number;
  timestamp: number;
}

interface ToolCallVisualizerProps {
  toolCalls: ToolCall[];
  isExecuting?: boolean;
  className?: string;
}

const TOOL_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  web_search:      { icon: '🌐', color: 'oklch(72% 0.14 195)',  label: 'Busca Web' },
  knowledge_query: { icon: '📚', color: 'oklch(68% 0.20 290)',  label: 'BD Central' },
  calculator:      { icon: '🔢', color: 'oklch(65% 0.18 145)',  label: 'Calculadora' },
  code_executor:   { icon: '⚡', color: 'oklch(75% 0.14 70)',   label: 'Executor' },
  file_reader:     { icon: '📂', color: 'oklch(72% 0.15 50)',   label: 'Leitor' },
  api_call:        { icon: '🔌', color: 'oklch(70% 0.18 330)',  label: 'API' },
  default:         { icon: '🔧', color: 'oklch(52% 0.02 270)',  label: 'Ferramenta' },
};

// Timeline strip item — one dot per tool call
function TimelineDot({ call }: { call: ToolCall }) {
  const cfg = TOOL_CONFIG[call.name] ?? TOOL_CONFIG.default;
  const label =
    call.status === 'running'  ? `${cfg.label}: executando…` :
    call.status === 'success'  ? `${cfg.label}: ${call.durationMs ? call.durationMs + 'ms' : 'ok'}` :
    call.status === 'error'    ? `${cfg.label}: erro` :
    `${cfg.label}: aguardando`;

  return (
    <div
      title={label}
      aria-label={label}
      className={call.status === 'running' ? 'animate-phase-orbit' : ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        fontSize: '11px',
        background:
          call.status === 'running' ? 'oklch(18% 0.025 275)' :
          call.status === 'success' ? 'oklch(20% 0.05 145)' :
          call.status === 'error'   ? 'oklch(20% 0.06 25)' :
          'oklch(18% 0.025 275)',
        border: `1.5px solid ${
          call.status === 'running' ? cfg.color :
          call.status === 'success' ? 'oklch(65% 0.18 145)' :
          call.status === 'error'   ? 'oklch(55% 0.22 25)' :
          'oklch(35% 0.05 270)'
        }`,
        flexShrink: 0,
        ['--phase-color' as string]: cfg.color,
        transition: 'border-color 200ms ease',
      }}
    >
      {call.status === 'success' ? '✓' :
       call.status === 'error'   ? '✗' :
       cfg.icon}
    </div>
  );
}

// Expanded detail card for a single tool call
function ToolCallCard({ call }: { call: ToolCall }) {
  const [showDetails, setShowDetails] = useState(false);
  const cfg = TOOL_CONFIG[call.name] ?? TOOL_CONFIG.default;

  const inputPreview = Object.entries(call.input)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`)
    .join(' · ')
    .slice(0, 120);

  const borderColor =
    call.status === 'running' ? cfg.color + '99' :
    call.status === 'success' ? 'oklch(65% 0.18 145 / 0.3)' :
    call.status === 'error'   ? 'oklch(55% 0.22 25 / 0.4)' :
    'oklch(30% 0.03 265)';

  return (
    <div
      className="rounded-lg border transition-all duration-200"
      style={{
        background: 'oklch(12% 0.02 280 / 0.6)',
        borderColor,
        borderLeftWidth: '3px',
        borderLeftColor:
          call.status === 'running' ? cfg.color :
          call.status === 'success' ? 'oklch(65% 0.18 145)' :
          call.status === 'error'   ? 'oklch(55% 0.22 25)' :
          'oklch(35% 0.05 270)',
        padding: '8px 10px',
        marginBottom: '4px',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TimelineDot call={call} />
          <div className="min-w-0">
            <span className="text-xs font-semibold" style={{ color: cfg.color }}>
              {cfg.label}
            </span>
            {inputPreview && (
              <p
                className="text-xs truncate mt-0.5"
                style={{ color: 'oklch(52% 0.02 270)', maxWidth: '260px' }}
              >
                {inputPreview}
              </p>
            )}
          </div>
        </div>

        {/* Duration + expand toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {call.durationMs != null && (
            <span
              className="tabular-nums text-xs"
              style={{ color: 'oklch(52% 0.02 270)' }}
            >
              {call.durationMs}ms
            </span>
          )}
          {(Object.keys(call.input).length > 0 || call.output) && (
            <button
              onClick={() => setShowDetails(v => !v)}
              aria-expanded={showDetails}
              aria-label={showDetails ? 'Recolher detalhes' : 'Expandir detalhes'}
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{
                background: 'oklch(24% 0.03 270)',
                color: 'oklch(72% 0.02 275)',
                border: '1px solid oklch(35% 0.10 300)',
                cursor: 'pointer',
              }}
            >
              {showDetails ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details — JSON input + output */}
      {showDetails && (
        <div className="mt-2 space-y-2">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'oklch(52% 0.02 270)' }}>
              Entrada
            </p>
            <pre
              className="text-xs p-2 rounded overflow-auto"
              style={{
                background: 'oklch(8% 0.02 280)',
                color: 'oklch(72% 0.02 275)',
                fontFamily: "'JetBrains Mono', monospace",
                maxHeight: '100px',
                fontSize: '10px',
              }}
            >
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {call.output && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'oklch(52% 0.02 270)' }}>
                Saída
              </p>
              <pre
                className="text-xs p-2 rounded overflow-auto"
                style={{
                  background: 'oklch(8% 0.02 280)',
                  color: 'oklch(92% 0.01 280)',
                  fontFamily: "'JetBrains Mono', monospace",
                  maxHeight: '140px',
                  fontSize: '10px',
                }}
              >
                {call.output.slice(0, 600)}{call.output.length > 600 ? '…' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolCallVisualizer({ toolCalls, isExecuting, className = '' }: ToolCallVisualizerProps) {
  // C2 (Cognitive): start collapsed — tools are L2 (on-demand), not L0 (always visible)
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0 && !isExecuting) return null;

  const runningCount = toolCalls.filter(t => t.status === 'running').length;
  const successCount = toolCalls.filter(t => t.status === 'success').length;
  const errorCount   = toolCalls.filter(t => t.status === 'error').length;
  const totalCount   = toolCalls.length;
  const allDone      = totalCount > 0 && runningCount === 0;

  // Auto-collapse when all done (C2: remove extraneous load after completion)
  const effectiveExpanded = expanded;

  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{
        background: 'oklch(10% 0.02 280 / 0.8)',
        borderColor: runningCount > 0
          ? 'oklch(68% 0.20 290 / 0.35)'
          : 'oklch(30% 0.03 265)',
        backdropFilter: 'blur(8px)',
        transition: 'border-color 300ms ease',
      }}
    >
      {/* ── Summary bar (always visible — Miller 7±2 chunking) ── */}
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left rounded-xl"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={effectiveExpanded}
        aria-label={`Ferramentas ReAct: ${totalCount} chamadas. ${effectiveExpanded ? 'Recolher' : 'Expandir'}`}
        style={{ cursor: 'pointer' }}
      >
        {/* Left: icon + label + timeline dots */}
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: '13px' }} aria-hidden="true">
            {runningCount > 0 ? '⚙️' : allDone && errorCount === 0 ? '✅' : errorCount > 0 ? '⚠️' : '🔧'}
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: 'oklch(72% 0.02 275)', whiteSpace: 'nowrap' }}
          >
            Layer 4.5
          </span>

          {/* Timeline strip — all tools as dots (compact overview) */}
          <div className="flex items-center gap-1" aria-hidden="true">
            {toolCalls.map(tc => (
              <TimelineDot key={tc.id} call={tc} />
            ))}
            {isExecuting && toolCalls.length === 0 && (
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'oklch(68% 0.20 290)',
                  animation: 'phase-orbit 1.5s ease-out infinite',
                  ['--phase-color' as string]: 'oklch(68% 0.20 290)',
                }}
              />
            )}
          </div>
        </div>

        {/* Right: counts + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0 text-xs">
          {runningCount > 0 && (
            <span style={{ color: 'oklch(75% 0.14 70)' }}>
              {runningCount} exec
            </span>
          )}
          {successCount > 0 && (
            <span style={{ color: 'oklch(65% 0.18 145)' }}>
              {successCount} ✓
            </span>
          )}
          {errorCount > 0 && (
            <span style={{ color: 'oklch(55% 0.22 25)' }}>
              {errorCount} ✗
            </span>
          )}
          <span
            style={{
              color: 'oklch(52% 0.02 270)',
              transform: effectiveExpanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms ease',
              display: 'inline-block',
            }}
            aria-hidden="true"
          >
            ›
          </span>
        </div>
      </button>

      {/* ── Expanded detail list (accordion) ── */}
      {effectiveExpanded && (
        <div
          style={{
            padding: '0 8px 8px',
            borderTop: '1px solid oklch(24% 0.03 270)',
          }}
        >
          {toolCalls.length > 0 ? (
            <div className="mt-2">
              {toolCalls.map(call => (
                <ToolCallCard key={call.id} call={call} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-xs" style={{ color: 'oklch(52% 0.02 270)' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: '1.5px solid oklch(68% 0.20 290)',
                  borderTopColor: 'transparent',
                  animation: 'mother-auth-spin 0.8s linear infinite',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
              Detectando ferramentas necessárias…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
