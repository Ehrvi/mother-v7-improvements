/**
 * useSemanticMode — AI-driven display mode resolution
 *
 * Scientific basis:
 *   - Vercel AI SDK 6 (Dec 2025): Generative UI — LLM selects component
 *   - Shneiderman (1996): Overview → Zoom → Filter → Details-on-demand
 *   - Nielsen (1994) H1: Visibility of system status
 *
 * The hook analyzes the latest assistant message's metadata (queryCategory,
 * layout_hint) and user query patterns to determine which display mode
 * should be active. The SemanticDisplayRouter uses this to render the
 * appropriate visualization.
 */

import { useMemo } from 'react';
import { useChatStore, type Message } from '@/store/chatStore';

/**
 * All available semantic display modes.
 * Each mode maps to a dedicated display component in SemanticDisplayRouter.
 */
export type SemanticDisplayMode =
  | 'chat'              // Standard chat conversation
  | 'analysis'          // Data/analysis with side visualization
  | 'shms-dashboard'    // Full SHMS monitoring dashboard
  | 'shms-sensor'       // Sensor detail view with charts
  | 'shms-alert'        // Alert management view
  | 'shms-3d'           // Digital twin 3D environment
  | 'shms-datalab'      // Big data / BI analytics
  | 'dgm-pipeline'      // DGM evolution pipeline
  | 'dgm-review'        // Proposal review workspace
  | 'knowledge'         // Knowledge taxonomy map
  | 'code'              // Code editing workspace
  | 'document'          // Document generation view
  | 'product-overview'; // Executive dashboard for all 3 products

/** Keyword → display mode mapping for semantic classification */
const SEMANTIC_PATTERNS: Array<{ mode: SemanticDisplayMode; keywords: RegExp }> = [
  // SHMS patterns (Portuguese + English)
  { mode: 'shms-dashboard', keywords: /\b(shms|dashboard|monitoramento|estrutur|barragem|dam)\b/i },
  { mode: 'shms-sensor',    keywords: /\b(sensor|piezômetro|piezometro|piezo|inclin|gnss|aceler|leitura|reading)\b/i },
  { mode: 'shms-alert',     keywords: /\b(alerta|alarm|alert|crítico|critico|emergência|emergencia|sirene|siren)\b/i },
  { mode: 'shms-3d',        keywords: /\b(3d|digital.?twin|nuvem.?de.?pont|point.?cloud|ambiente|environment)\b/i },
  { mode: 'shms-datalab',   keywords: /\b(big.?data|bi\b|business.?intel|análise.?avan|tarp|correlação|correlation)\b/i },
  // DGM patterns
  { mode: 'dgm-pipeline',   keywords: /\b(dgm|evolução|evolucao|pipeline|gödel|godel|darwin|fitness|benchmark)\b/i },
  { mode: 'dgm-review',     keywords: /\b(proposta|proposal|aprovar|approve|rejeitar|reject|code.?diff|review)\b/i },
  // Knowledge patterns
  { mode: 'knowledge',      keywords: /\b(conhecimento|knowledge|taxonomia|taxonomy|domínio|domain|udc|kai\b|kri\b|kci\b)\b/i },
  // Code patterns
  { mode: 'code',           keywords: /\b(código|codigo|code|implement|refactor|debug|typescript|function|class)\b/i },
  // Analysis patterns
  { mode: 'analysis',       keywords: /\b(análise|analise|analysis|gráfico|grafico|chart|statistics|dados|data)\b/i },
  // Product Overview
  { mode: 'product-overview', keywords: /\b(visão.?geral|overview|resumo|produtos|integração|integration|executivo|executive)\b/i },
];

/**
 * Maps server-provided queryCategory to a display mode.
 * The server already classifies queries — we leverage that.
 */
function fromServerCategory(category?: string): SemanticDisplayMode | null {
  if (!category) return null;
  const cat = category.toLowerCase();
  if (cat.includes('shms') || cat.includes('monitor')) return 'shms-dashboard';
  if (cat.includes('dgm') || cat.includes('evolution')) return 'dgm-pipeline';
  if (cat.includes('knowledge') || cat.includes('memory')) return 'knowledge';
  if (cat.includes('code') || cat.includes('programming')) return 'code';
  if (cat.includes('analysis') || cat.includes('data')) return 'analysis';
  return null;
}

/**
 * Analyzes a user message to determine semantic display mode from keywords.
 */
function fromMessageContent(content: string): SemanticDisplayMode | null {
  for (const { mode, keywords } of SEMANTIC_PATTERNS) {
    if (keywords.test(content)) return mode;
  }
  return null;
}

export interface SemanticModeState {
  /** Current active display mode */
  mode: SemanticDisplayMode;
  /** The mode was inferred from server metadata (high confidence) */
  fromServer: boolean;
  /** The mode was inferred from content analysis (medium confidence) */
  fromContent: boolean;
  /** Whether a display mode override is active */
  isOverridden: boolean;
}

/**
 * Hook that resolves the current semantic display mode based on:
 * 1. Manual override (user explicitly selected a mode)
 * 2. Server-provided queryCategory (highest confidence)
 * 3. Content-based keyword analysis (fallback)
 * 4. Default: 'chat'
 */
export function useSemanticMode(): SemanticModeState {
  const messages = useChatStore((s) => s.messages);
  const displayMode = useChatStore((s) => s.displayMode);

  return useMemo(() => {
    // Priority 1: Manual override
    if (displayMode !== 'auto') {
      return { mode: displayMode, fromServer: false, fromContent: false, isOverridden: true };
    }

    // Find the last assistant message with metadata
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'mother');
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');

    // Priority 2: Server-provided category
    if (lastAssistant?.queryCategory) {
      const serverMode = fromServerCategory(lastAssistant.queryCategory);
      if (serverMode) {
        return { mode: serverMode, fromServer: true, fromContent: false, isOverridden: false };
      }
    }

    // Priority 3: Content analysis of last user message
    if (lastUser?.content) {
      const contentMode = fromMessageContent(lastUser.content);
      if (contentMode) {
        return { mode: contentMode, fromServer: false, fromContent: true, isOverridden: false };
      }
    }

    // Default: chat mode
    return { mode: 'chat', fromServer: false, fromContent: false, isOverridden: false };
  }, [messages, displayMode]);
}
