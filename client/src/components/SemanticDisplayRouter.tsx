/**
 * SemanticDisplayRouter — AI-driven dynamic UI component selection
 *
 * Heart of the SOTA AI-semantic UX. Receives the current semantic mode
 * and renders the appropriate display component with smooth transitions.
 *
 * Scientific basis:
 *   - Vercel AI SDK 6 (Dec 2025): Generative UI — model selects component
 *   - Claude Artifacts (Anthropic 2024): Side-panel interactive outputs
 *   - PrototypeFlow (arXiv Oct 2025): Human-AI UI generation
 *   - Material Design 3: Shared element transitions
 */

import React, { Suspense, useCallback } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useSemanticMode, type SemanticDisplayMode } from '@/hooks/useSemanticMode';

// ─── Lazy-loaded display components ──────────────────────────────────────────
// Each display is a full-page or panel component optimized for its data type.
// Lazy loading ensures only the active display is in the JS bundle at runtime.

const ChatDisplay = React.lazy(() => import('@/components/displays/ChatDisplay'));
const SHMSDashboardDisplay = React.lazy(() => import('@/components/displays/SHMSDashboardDisplay'));
const DGMPipelineDisplay = React.lazy(() => import('@/components/displays/DGMPipelineDisplay'));
const KnowledgeDisplay = React.lazy(() => import('@/components/displays/KnowledgeDisplay'));
const ProductOverviewDisplay = React.lazy(() => import('@/components/displays/ProductOverviewDisplay'));

// ─── Display mode metadata ───────────────────────────────────────────────────
export interface DisplayModeInfo {
  label: string;
  emoji: string;
  description: string;
  color: string;
}

export const DISPLAY_MODE_META: Record<SemanticDisplayMode, DisplayModeInfo> = {
  'chat':            { label: 'Chat',              emoji: '💬', description: 'Conversa com MOTHER',                color: 'var(--violet-base)' },
  'analysis':        { label: 'Análise',           emoji: '📊', description: 'Visualização de dados e análises',   color: 'var(--cyan-base)' },
  'shms-dashboard':  { label: 'SHMS Monitor',      emoji: '🏗️', description: 'Dashboard de monitoramento SHMS',    color: 'var(--alarm-ok-fg)' },
  'shms-sensor':     { label: 'Sensores',          emoji: '📡', description: 'Detalhes de sensores em tempo real', color: 'var(--cyan-base)' },
  'shms-alert':      { label: 'Alertas',           emoji: '🚨', description: 'Gerenciamento de alertas',           color: 'var(--alarm-p1-fg)' },
  'shms-3d':         { label: '3D Digital Twin',   emoji: '🌐', description: 'Ambiente 3D com nuvem de pontos',    color: 'var(--cyan-bright)' },
  'shms-datalab':    { label: 'Data Lab',          emoji: '🧪', description: 'Big Data e BI avançado',             color: 'var(--amber-base)' },
  'dgm-pipeline':    { label: 'DGM Pipeline',      emoji: '🧬', description: 'Pipeline de evolução DGM',          color: '#8b5cf6' },
  'dgm-review':      { label: 'Revisão',           emoji: '📝', description: 'Workspace de revisão de propostas', color: '#ffa04a' },
  'knowledge':       { label: 'Conhecimento',      emoji: '🧠', description: 'Mapa de conhecimento UDC',          color: '#a78bfa' },
  'code':            { label: 'Código',             emoji: '💻', description: 'Editor e revisão de código',        color: 'var(--alarm-ok-fg)' },
  'document':        { label: 'Documento',          emoji: '📄', description: 'Geração de documentos',             color: 'var(--amber-base)' },
  'product-overview':{ label: 'Visão Geral',       emoji: '✨', description: 'Dashboard Executivo Integrado',     color: '#f0f0ff' },
};

// ─── Loading fallback ────────────────────────────────────────────────────────
function DisplaySkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--void-deepest)' }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--violet-base)', borderTopColor: 'transparent' }}
        />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Carregando display semântico...
        </span>
      </div>
    </div>
  );
}

// ─── Mode indicator pill ─────────────────────────────────────────────────────
export function SemanticModeIndicator() {
  const { mode, fromServer, fromContent } = useSemanticMode();
  const meta = DISPLAY_MODE_META[mode];
  const store = useChatStore();

  const handleClick = useCallback(() => {
    // Toggle display mode selector
    store.setDisplayMode(store.displayMode === 'auto' ? 'chat' : 'auto');
  }, [store]);

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all hover:scale-105"
      style={{
        background: `color-mix(in oklch, ${meta.color} 15%, transparent)`,
        border: `1px solid color-mix(in oklch, ${meta.color} 30%, transparent)`,
        color: meta.color,
      }}
      title={`Modo: ${meta.label} — ${fromServer ? 'Server' : fromContent ? 'Conteúdo' : 'Padrão'}. Clique para alternar.`}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
      {(fromServer || fromContent) && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 4px ${meta.color}` }} />
      )}
    </button>
  );
}

// ─── Main Router Component ───────────────────────────────────────────────────
interface SemanticDisplayRouterProps {
  /** Callback when user sends a message (passed down to chat displays) */
  onSendMessage: (text?: string) => void;
  /** Callback to stop streaming */
  onStopStream: () => void;
}

export default function SemanticDisplayRouter({ onSendMessage, onStopStream }: SemanticDisplayRouterProps) {
  const { mode } = useSemanticMode();

  return (
    <div
      className="flex-1 flex flex-col min-w-0 overflow-hidden transition-opacity duration-300"
      data-display-mode={mode}
    >
      <Suspense fallback={<DisplaySkeleton />}>
        {renderDisplay(mode, onSendMessage, onStopStream)}
      </Suspense>
    </div>
  );
}

function renderDisplay(
  mode: SemanticDisplayMode,
  onSendMessage: (text?: string) => void,
  onStopStream: () => void,
) {
  switch (mode) {
    // SHMS displays — all SHMS modes fall through to dashboard for now
    // Phase 2 will split these into dedicated components
    case 'shms-dashboard':
    case 'shms-sensor':
    case 'shms-alert':
    case 'shms-3d':
    case 'shms-datalab':
      return <SHMSDashboardDisplay />;

    // DGM displays — Pipeline for now, Phase 3 adds review
    case 'dgm-pipeline':
    case 'dgm-review':
      return <DGMPipelineDisplay />;

    // Knowledge display
    case 'knowledge':
      return <KnowledgeDisplay />;

    // Product Integration display
    case 'product-overview':
      return <ProductOverviewDisplay />;

    // All other modes use chat (with potential side panels)
    case 'chat':
    case 'analysis':
    case 'code':
    case 'document':
    default:
      return <ChatDisplay onSendMessage={onSendMessage} onStopStream={onStopStream} />;
  }
}
