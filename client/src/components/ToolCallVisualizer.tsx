/**
 * ToolCallVisualizer.tsx — MOTHER v81.5 Ciclo 172
 * Conselho dos 6 — Fase 2 Interface SOTA (P1)
 *
 * Scientific basis:
 * - ReAct (Yao et al., arXiv:2210.03629, ICLR 2023): Reason-Act-Observe loop —
 *   tool calls should be visible to users to build trust and understanding.
 * - Nielsen (1994) Heuristic #1: "Visibility of System Status" — tool execution
 *   must be shown with status (pending/running/success/error).
 * - Shneiderman (1983) "Direct Manipulation": tool calls are first-class actions
 *   that users should be able to inspect and understand.
 * - arXiv:2304.10878 (2023): "Structured output hints improve UI rendering accuracy by 23%"
 *
 * Displays tool calls detected by Layer 4.5 (tool-engine.ts):
 * - web_search: DuckDuckGo/Brave search
 * - knowledge_query: BD Central lookup
 * - calculator: Mathematical computation
 * - code_executor: Code execution
 * - file_reader: File content extraction
 * - api_call: External API invocation
 *
 * Usage:
 *   <ToolCallVisualizer toolCalls={toolCalls} isExecuting={isExecuting} />
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
  web_search:      { icon: '🌐', color: '#38bdf8', label: 'Busca Web' },
  knowledge_query: { icon: '📚', color: '#a78bfa', label: 'BD Central' },
  calculator:      { icon: '🔢', color: '#34d399', label: 'Calculadora' },
  code_executor:   { icon: '⚡', color: '#fbbf24', label: 'Executor' },
  file_reader:     { icon: '📂', color: '#fb923c', label: 'Leitor' },
  api_call:        { icon: '🔌', color: '#f472b6', label: 'API' },
  default:         { icon: '🔧', color: '#94a3b8', label: 'Ferramenta' },
};

const STATUS_CONFIG = {
  pending: { icon: '⏳', color: '#64748b', label: 'Aguardando' },
  running: { icon: '⚙️', color: '#fbbf24', label: 'Executando', animate: true },
  success: { icon: '✅', color: '#4ade80', label: 'Concluído' },
  error:   { icon: '❌', color: '#f87171', label: 'Erro' },
};

function ToolCallCard({ call }: { call: ToolCall }) {
  const [showDetails, setShowDetails] = useState(false);
  const toolCfg = TOOL_CONFIG[call.name] ?? TOOL_CONFIG.default;
  const statusCfg = STATUS_CONFIG[call.status];

  const inputPreview = Object.entries(call.input)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(' · ');

  return (
    <div
      className="rounded-lg border p-2.5 mb-1.5 transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: call.status === 'running'
          ? toolCfg.color + '60'
          : 'rgba(255,255,255,0.06)',
        boxShadow: call.status === 'running' ? `0 0 8px ${toolCfg.color}20` : 'none',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Tool icon */}
          <span
            className="text-sm flex-shrink-0"
            style={{ filter: call.status === 'running' ? `drop-shadow(0 0 4px ${toolCfg.color})` : 'none' }}
          >
            {toolCfg.icon}
          </span>

          {/* Tool name + input preview */}
          <div className="min-w-0">
            <span className="text-xs font-semibold" style={{ color: toolCfg.color }}>
              {toolCfg.label}
            </span>
            {inputPreview && (
              <p className="text-xs truncate mt-0.5" style={{ color: '#475569' }}>
                {inputPreview}
              </p>
            )}
          </div>
        </div>

        {/* Status + duration */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {call.durationMs && (
            <span className="text-xs tabular-nums" style={{ color: '#475569' }}>
              {call.durationMs}ms
            </span>
          )}
          <span
            className="text-sm"
            style={{
              animation: call.status === 'running' ? 'spin 1s linear infinite' : 'none',
            }}
          >
            {statusCfg.icon}
          </span>
          {Object.keys(call.input).length > 0 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs px-1.5 py-0.5 rounded transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}
            >
              {showDetails ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="mt-2 space-y-1.5">
          {/* Input */}
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>Entrada</p>
            <pre
              className="text-xs p-2 rounded overflow-auto"
              style={{
                background: 'rgba(0,0,0,0.4)',
                color: '#94a3b8',
                fontFamily: 'ui-monospace, monospace',
                maxHeight: '80px',
              }}
            >
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {call.output && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>Saída</p>
              <pre
                className="text-xs p-2 rounded overflow-auto"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  color: '#e2e8f0',
                  fontFamily: 'ui-monospace, monospace',
                  maxHeight: '120px',
                }}
              >
                {call.output.slice(0, 500)}{call.output.length > 500 ? '…' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolCallVisualizer({ toolCalls, isExecuting, className = '' }: ToolCallVisualizerProps) {
  if (toolCalls.length === 0 && !isExecuting) return null;

  const runningCount = toolCalls.filter(t => t.status === 'running').length;
  const successCount = toolCalls.filter(t => t.status === 'success').length;
  const errorCount = toolCalls.filter(t => t.status === 'error').length;

  return (
    <div
      className={`rounded-xl border p-3 ${className}`}
      style={{
        background: 'rgba(10, 10, 20, 0.7)',
        borderColor: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔧</span>
          <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>
            Ferramentas Layer 4.5
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {runningCount > 0 && (
            <span style={{ color: '#fbbf24' }}>⚙️ {runningCount} executando</span>
          )}
          {successCount > 0 && (
            <span style={{ color: '#4ade80' }}>✅ {successCount}</span>
          )}
          {errorCount > 0 && (
            <span style={{ color: '#f87171' }}>❌ {errorCount}</span>
          )}
        </div>
      </div>

      {/* Tool calls */}
      {toolCalls.map(call => (
        <ToolCallCard key={call.id} call={call} />
      ))}

      {/* Empty state while executing */}
      {toolCalls.length === 0 && isExecuting && (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3 h-3 border rounded-full animate-spin" style={{ borderColor: 'rgba(124,58,237,0.3)', borderTopColor: '#7c3aed' }} />
          <span className="text-xs" style={{ color: '#475569' }}>Detectando ferramentas necessárias…</span>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
