/**
 * ProjectPanel.tsx — MOTHER v81.5 Ciclo 172
 * Conselho dos 6 — Fase 2 Interface SOTA (P1)
 *
 * Scientific basis:
 * - Zettelkasten (Luhmann, 1981): knowledge should be organized as linked atomic notes,
 *   enabling non-linear exploration and emergent connections.
 * - Information Scent (Pirolli & Card, 1999): users follow "information scent" —
 *   visible knowledge context improves navigation and reduces search time.
 * - Nielsen (1994) Heuristic #6: "Recognition over Recall" — project context should
 *   be visible, not require users to remember previous interactions.
 * - arXiv:2502.14802 (HippoRAG 2, ICML 2025): knowledge graph visualization
 *   improves user understanding of AI knowledge retrieval.
 *
 * Displays:
 * - BD Central stats (total entries, categories, last updated)
 * - Active project context (SHMS, IntellTech, Fortescue, etc.)
 * - Recent knowledge injections
 * - System health metrics
 */

import React, { useState, useEffect, useCallback } from 'react';

interface KnowledgeStats {
  totalEntries: number;
  categories: Record<string, number>;
  lastUpdated?: string;
  version?: string;
}

interface SystemHealth {
  status: string;
  version: string;
  cacheHitRate: number;
  avgQualityScore: number;
  queryCount: number;
}

interface RecentEntry {
  id: number;
  title: string;
  category: string;
  createdAt: string;
}

interface ProjectPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  'geotecnia': '⛰️',
  'shms': '📡',
  'intelltech': '🏢',
  'ai_ml': '🤖',
  'engineering': '⚙️',
  'science': '🔬',
  'business': '📈',
  'technology': '💻',
  'grpo_online_reward': '🎯',
  'rlvr_signal': '📊',
  'dpo_training': '🧬',
  'ciclo': '🔄',
  'default': '📚',
};

function getCategoryIcon(category: string): string {
  const lower = category.toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return CATEGORY_ICONS.default;
}

export default function ProjectPanel({ isOpen, onClose }: ProjectPanelProps) {
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'recent' | 'health'>('stats');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, knowledgeRes] = await Promise.allSettled([
        fetch('/api/a2a/status', { credentials: 'include' }),
        fetch('/api/a2a/knowledge?limit=10&offset=0', { credentials: 'include' }),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const data = await statusRes.value.json();
        setHealth({
          status: data.status ?? 'unknown',
          version: data.version ?? 'unknown',
          cacheHitRate: data.cacheHitRate ?? 0,
          avgQualityScore: data.avgQualityScore ?? 0,
          queryCount: data.queryCount ?? 0,
        });
      }

      if (knowledgeRes.status === 'fulfilled' && knowledgeRes.value.ok) {
        const data = await knowledgeRes.value.json();
        const entries: RecentEntry[] = (data.entries ?? data.knowledge ?? []).slice(0, 10);
        setRecentEntries(entries);

        // Build category stats from entries
        const cats: Record<string, number> = {};
        entries.forEach((e: RecentEntry) => {
          cats[e.category] = (cats[e.category] || 0) + 1;
        });
        setStats({
          totalEntries: data.total ?? entries.length,
          categories: cats,
          lastUpdated: entries[0]?.createdAt,
          version: health?.version,
        });
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [health?.version]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'rgba(7, 7, 15, 0.95)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Projeto MOTHER</span>
          {health && (
            <span
              className="px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{
                background: health.status === 'healthy' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                color: health.status === 'healthy' ? '#4ade80' : '#f87171',
              }}
            >
              {health.status === 'healthy' ? '● Online' : '● Offline'}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {(['stats', 'recent', 'health'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              color: activeTab === tab ? '#a78bfa' : '#64748b',
              borderBottom: activeTab === tab ? '2px solid #7c3aed' : '2px solid transparent',
              background: 'transparent',
            }}
          >
            {tab === 'stats' ? '📊 BD' : tab === 'recent' ? '🕐 Recente' : '⚡ Sistema'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(124,58,237,0.3)', borderTopColor: '#7c3aed' }} />
          </div>
        ) : activeTab === 'stats' ? (
          <div className="space-y-3">
            {/* Total entries */}
            <div
              className="rounded-lg p-3 border"
              style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.2)' }}
            >
              <p className="text-xs" style={{ color: '#94a3b8' }}>BD Central — Total</p>
              <p className="text-2xl font-bold mt-1" style={{ color: '#a78bfa' }}>
                {stats?.totalEntries?.toLocaleString('pt-BR') ?? '—'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#475569' }}>entradas de conhecimento</p>
            </div>

            {/* Version */}
            {health?.version && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-xs" style={{ color: '#64748b' }}>Versão</span>
                <span className="text-xs font-mono font-bold" style={{ color: '#38bdf8' }}>{health.version}</span>
              </div>
            )}

            {/* Categories */}
            {stats && Object.keys(stats.categories).length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Categorias recentes</p>
                <div className="space-y-1">
                  {Object.entries(stats.categories)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{getCategoryIcon(cat)}</span>
                          <span className="text-xs truncate max-w-[120px]" style={{ color: '#94a3b8' }}>{cat}</span>
                        </div>
                        <span className="text-xs font-mono" style={{ color: '#475569' }}>{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Projects context */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Projetos ativos</p>
              {[
                { icon: '📡', name: 'SHMS', desc: 'Slope Health Monitoring System', color: '#38bdf8' },
                { icon: '🏢', name: 'IntellTech', desc: 'Geotechnical AI Platform', color: '#a78bfa' },
                { icon: '⛏️', name: 'Fortescue', desc: 'Mining Operations AI', color: '#fbbf24' },
                { icon: '🧬', name: 'DGM', desc: 'Darwin Gödel Machine', color: '#4ade80' },
              ].map(p => (
                <div key={p.name} className="flex items-center gap-2 py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-sm">{p.icon}</span>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: p.color }}>{p.name}</p>
                    <p className="text-xs" style={{ color: '#475569' }}>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === 'recent' ? (
          <div className="space-y-1.5">
            {recentEntries.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: '#475569' }}>Nenhuma entrada recente</p>
            ) : (
              recentEntries.map(entry => (
                <div
                  key={entry.id}
                  className="rounded-lg p-2.5 border"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs flex-shrink-0 mt-0.5">{getCategoryIcon(entry.category)}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#e2e8f0' }}>{entry.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                        {entry.category} · #{entry.id}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Health tab */
          <div className="space-y-2">
            {health ? (
              <>
                {[
                  { label: 'Status', value: health.status, color: health.status === 'healthy' ? '#4ade80' : '#f87171' },
                  { label: 'Versão', value: health.version, color: '#38bdf8' },
                  { label: 'Cache Hit Rate', value: `${(health.cacheHitRate * 100).toFixed(1)}%`, color: '#a78bfa' },
                  { label: 'Quality Score', value: `${health.avgQualityScore.toFixed(1)}/100`, color: '#fbbf24' },
                  { label: 'Queries Processadas', value: health.queryCount.toLocaleString('pt-BR'), color: '#94a3b8' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="text-xs" style={{ color: '#64748b' }}>{item.label}</span>
                    <span className="text-xs font-semibold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}

                {/* SOTA Roadmap progress */}
                <div className="mt-3">
                  <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>SOTA Roadmap — Ciclos 168-172</p>
                  {[
                    { phase: 'Quick Wins (C168)', items: 'QW-1,2,3', done: true },
                    { phase: 'Fase 1 (C169)', items: 'F1-1,2,3', done: true },
                    { phase: 'Fase 2 ML (C170)', items: 'F2-1,2,3', done: true },
                    { phase: 'Fase 3 ML (C171)', items: 'F3-1,2,3', done: true },
                    { phase: 'Fase 2 UI (C172)', items: 'PhaseIndicator, Artifacts, Tools', done: true },
                  ].map(item => (
                    <div key={item.phase} className="flex items-center gap-2 py-1">
                      <span className="text-xs">{item.done ? '✅' : '⏳'}</span>
                      <div>
                        <span className="text-xs font-medium" style={{ color: item.done ? '#4ade80' : '#fbbf24' }}>{item.phase}</span>
                        <span className="text-xs ml-1" style={{ color: '#475569' }}>{item.items}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-center py-8" style={{ color: '#475569' }}>Carregando métricas…</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <button
          onClick={fetchData}
          className="w-full py-1.5 rounded text-xs transition-colors"
          style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa', border: '1px solid rgba(124,58,237,0.3)' }}
        >
          🔄 Atualizar
        </button>
      </div>
    </div>
  );
}
