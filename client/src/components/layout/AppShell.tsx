/**
 * AppShell v2 — Chat-Centric Adaptive Layout
 *
 * Redesign principles:
 *   1. Chat is the HERO — main zone gets 100% focus
 *   2. Sidebar is a collapsed icon rail (48px) — expands on hover
 *   3. No decorative blurs/glows polluting the background
 *   4. Entrance animations on every element
 *   5. Design tokens instead of inline oklch
 *
 * Scientific basis:
 *   - Shneiderman (1996): Overview first, zoom, details on demand
 *   - Nielsen (1994) #8: Aesthetic and minimalist design
 *   - Fitts' Law: Input bar is large and centered (primary target)
 */

import { useCallback, useState, useEffect } from 'react';
import {
  MessageSquare, Search, Settings, Dna, BarChart3,
  ChevronLeft, ChevronRight, Sparkles, GitBranch, PanelRightOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/store/chatStore';
import { useSSEStream } from '@/hooks/useSSEStream';
import { trpc } from '@/lib/trpc';
import SemanticDisplayRouter, { SemanticModeIndicator } from '@/components/SemanticDisplayRouter';
import Phase5Panels from '@/components/phase5/Phase5Panels';
import { SessionHistory } from '@/components/SessionHistory';
import ErrorBoundary from '@/components/ErrorBoundary';
import { detectColorCommand, applyThemeChange, resetTheme, getAvailableColors, type ThemeChange } from '@/lib/theme-engine';

// ─── Icon Rail Items ──────────────────────────────────────────
const RAIL_ITEMS = [
  { icon: MessageSquare, label: 'Chat', action: 'chat' },
  { icon: Dna, label: 'DGM', action: 'dgm' },
  { icon: BarChart3, label: 'SHMS', action: 'shms' },
  { icon: Search, label: 'Pesquisar', action: 'search' },
] as const;

export default function AppShell() {
  const store = useChatStore();
  const navigate = useNavigate();
  const { sendMessage, stopStream } = useSSEStream();
  const [themeToast, setThemeToast] = useState<ThemeChange | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);
  const [showPhase5, setShowPhase5] = useState(false);

  const systemStatsQuery = trpc.mother.stats.useQuery(undefined, {
    refetchInterval: 60_000, staleTime: 30_000,
  });
  const motherVersion = systemStatsQuery.data?.version ?? 'v122.0';

  useEffect(() => {
    if (themeToast) {
      const t = setTimeout(() => setThemeToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [themeToast]);

  const handleSend = useCallback((text?: string) => {
    const rawQuery = (text ?? store.input).trim();
    if (!rawQuery || store.isStreaming) return;

    // ── Theme commands ──
    const colorChange = detectColorCommand(rawQuery);
    if (colorChange) {
      applyThemeChange(colorChange);
      setThemeToast(colorChange);
      store.addMessage({ id: `${Date.now()}-user`, role: 'user', content: rawQuery, timestamp: new Date() });
      store.addMessage({
        id: `${Date.now()}-mother-theme`, role: 'mother',
        content: `🎨 **DGM Self-Modification aplicada!**\n\nCor alterada para **${colorChange.colorName}** (${colorChange.color}).\n\n> Cores disponíveis: ${getAvailableColors().join(', ')}`,
        timestamp: new Date(),
      });
      store.setInput('');
      return;
    }
    if (rawQuery.toLowerCase().match(/reset.*tema|resetar.*cor|reset.*theme|default.*theme/)) {
      resetTheme();
      setThemeToast(null);
      store.addMessage({ id: `${Date.now()}-user`, role: 'user', content: rawQuery, timestamp: new Date() });
      store.addMessage({ id: `${Date.now()}-mother-reset`, role: 'mother', content: `🎨 **Tema resetado.**`, timestamp: new Date() });
      store.setInput('');
      return;
    }

    // ── Normal flow ──
    store.setShowWelcome(false);
    const query = store.fileContext ? `${rawQuery}\n\n---\n**Contexto:**\n\n${store.fileContext}` : rawQuery;
    store.addMessage({ id: `${Date.now()}-user`, role: 'user', content: rawQuery, timestamp: new Date() });
    store.setInput('');
    if (store.fileContext) { store.setFileContext(''); store.setShowDropZone(false); }
    const history = store.messages.filter(m => m.content).slice(-20).map(m => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
    sendMessage(query, history);
  }, [store, sendMessage]);

  const handleRailAction = (action: string) => {
    switch (action) {
      case 'chat': store.clearMessages(); break;
      case 'dgm': navigate('/dgm'); break;
      case 'shms': navigate('/shms'); break;
      case 'search': store.setInput('/research '); break;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden relative" style={{ background: 'var(--bg-void)' }}>

      {/* ═══ Left: Icon Rail (48px collapsed, 240px expanded) ═══ */}
      <nav
        className="relative z-20 flex flex-col h-full transition-all animate-fade-in"
        style={{
          width: railExpanded ? 240 : 56,
          minWidth: railExpanded ? 240 : 56,
          background: 'var(--bg-deep)',
          borderRight: '1px solid var(--border-subtle)',
          transitionDuration: 'var(--duration-normal)',
          transitionTimingFunction: 'var(--ease-out-expo)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white flex-shrink-0"
            style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow-sm)' }}
          >
            M
          </div>
          {railExpanded && (
            <div className="min-w-0 animate-fade-in">
              <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>MOTHER</div>
              <div className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{motherVersion}</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div className="flex-1 flex flex-col gap-1 px-2">
          {RAIL_ITEMS.map(({ icon: Icon, label, action }) => (
            <button
              key={action}
              onClick={() => handleRailAction(action)}
              title={label}
              className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all group"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: 18, height: 18 }} />
              {railExpanded && <span className="text-xs font-medium truncate">{label}</span>}
            </button>
          ))}
        </div>

        {/* Session History (expanded only) */}
        {railExpanded && (
          <div className="px-3 pb-2 animate-fade-in">
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
              <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                Histórico
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <ErrorBoundary componentName="SessionHistory">
                  <SessionHistory onSelectSession={() => {}} />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}

        {/* Bottom: expand/collapse + status */}
        <div className="flex flex-col gap-2 p-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {/* Online indicator */}
          <div className="flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            {railExpanded && <span className="text-[10px] font-medium" style={{ color: 'var(--success)' }}>Online · Sydney</span>}
          </div>

          <button
            onClick={() => setRailExpanded(!railExpanded)}
            className="flex items-center justify-center w-full py-1.5 rounded-lg transition-all"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            {railExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </nav>

      {/* ═══ Main Zone: Chat Hero ═══ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {/* Top bar: mode + version + phase5 toggle */}
        <div
          className="flex items-center justify-between px-6 py-2.5 flex-shrink-0 animate-fade-in"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(10, 10, 20, 0.8)', backdropFilter: 'blur(12px)' }}
        >
          <SemanticModeIndicator />
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{motherVersion}</span>
            <button
              onClick={() => setShowPhase5(!showPhase5)}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: showPhase5 ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              title="Toggle IDE panels"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <SemanticDisplayRouter onSendMessage={handleSend} onStopStream={stopStream} />
      </main>

      {/* ═══ Right: Phase5 (collapsible) ═══ */}
      {showPhase5 && (
        <div className="relative z-10 animate-fade-in" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
          <Phase5Panels />
        </div>
      )}

      {/* ── Theme Toast ── */}
      {themeToast && (
        <div
          className="fixed bottom-6 right-6 z-50 animate-scale-in"
          style={{
            background: `linear-gradient(135deg, ${themeToast.color}22, ${themeToast.color}44)`,
            border: `1px solid ${themeToast.color}66`,
            borderRadius: 16, padding: '14px 20px',
            backdropFilter: 'blur(20px)',
            boxShadow: `0 8px 32px ${themeToast.color}33`,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: themeToast.color }}>🎨</div>
            <div>
              <p className="text-white font-semibold text-xs">Self-Modification</p>
              <p className="text-white/60 text-[10px]">Cor → <span style={{ color: themeToast.color }}>{themeToast.colorName}</span></p>
            </div>
          </div>
          <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: `${themeToast.color}33` }}>
            <div className="h-full rounded-full" style={{ background: themeToast.color, animation: 'shrink-bar 4s linear forwards' }} />
          </div>
        </div>
      )}
      <style>{`@keyframes shrink-bar { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
}
