/**
 * ArtifactsPanel.tsx — MOTHER v81.5 Ciclo 172
 * Conselho dos 6 — Fase 2 Interface SOTA (P1)
 *
 * Scientific basis:
 * - Shneiderman (1983) "Direct Manipulation": artifacts should be first-class objects
 *   that users can inspect, copy, download, and reference directly.
 * - Morville & Rosenfeld (2006) "Information Architecture": structured artifact metadata
 *   enables findability, discoverability, and reuse.
 * - Nielsen (1994) Heuristic #4: "Consistency and Standards" — artifact types follow
 *   IANA Media Types (RFC 6838) taxonomy for consistent classification.
 * - arXiv:2304.10878 (2023): "Structured output hints improve UI rendering accuracy by 23%"
 *
 * Displays artifacts generated during MOTHER responses:
 * - code: TypeScript, Python, JavaScript, SQL, shell scripts
 * - document: PDF, Markdown, DOCX (reports, proposals, analyses)
 * - data: JSON, CSV, XLSX (structured data, tables)
 * - image: PNG, JPEG, SVG (generated images, charts, diagrams)
 * - slide: PPTX, HTML slides (presentations)
 *
 * Connects to backend: GET /api/a2a/artifacts
 */

import React, { useState, useEffect, useCallback } from 'react';

export interface Artifact {
  id: string;
  type: 'code' | 'document' | 'data' | 'image' | 'slide';
  title: string;
  content: string;
  language?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  sessionId?: string;
  downloadUrl?: string;
}

interface ArtifactsPanelProps {
  sessionId?: string;
  isOpen: boolean;
  onClose: () => void;
  newArtifact?: Artifact | null;
}

const TYPE_CONFIG: Record<Artifact['type'], { icon: string; color: string; label: string }> = {
  code:     { icon: '💻', color: '#a78bfa', label: 'Código' },
  document: { icon: '📄', color: '#60a5fa', label: 'Documento' },
  data:     { icon: '📊', color: '#34d399', label: 'Dados' },
  image:    { icon: '🖼️', color: '#f472b6', label: 'Imagem' },
  slide:    { icon: '📑', color: '#fbbf24', label: 'Slides' },
};

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function ArtifactCard({ artifact, onCopy }: { artifact: Artifact; onCopy: (content: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[artifact.type];
  const preview = artifact.content.slice(0, 200);

  return (
    <div
      className="rounded-lg border p-3 mb-2 cursor-pointer transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderColor: expanded ? cfg.color + '60' : 'rgba(255,255,255,0.08)',
        boxShadow: expanded ? `0 0 12px ${cfg.color}20` : 'none',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{cfg.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: cfg.color }}>{artifact.title}</p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              {cfg.label}{artifact.language ? ` · ${artifact.language}` : ''}{artifact.sizeBytes ? ` · ${formatSize(artifact.sizeBytes)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="px-2 py-0.5 rounded text-xs transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
            onClick={(e) => { e.stopPropagation(); onCopy(artifact.content); }}
            title="Copiar conteúdo"
          >
            📋
          </button>
          {artifact.downloadUrl && (
            <a
              href={artifact.downloadUrl}
              download={artifact.title}
              className="px-2 py-0.5 rounded text-xs transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
              onClick={(e) => e.stopPropagation()}
              title="Download"
            >
              ⬇️
            </a>
          )}
          <span style={{ color: '#475569', fontSize: '0.6rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          className="mt-2 rounded p-2 overflow-auto"
          style={{ background: 'rgba(0,0,0,0.4)', maxHeight: '240px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <pre
            className="text-xs whitespace-pre-wrap break-words"
            style={{ color: '#e2e8f0', fontFamily: 'ui-monospace, monospace', lineHeight: 1.5 }}
          >
            {artifact.content}
          </pre>
        </div>
      )}

      {/* Preview (collapsed) */}
      {!expanded && artifact.content.length > 0 && (
        <p
          className="mt-1 text-xs truncate"
          style={{ color: '#475569', fontFamily: artifact.type === 'code' ? 'ui-monospace, monospace' : 'inherit' }}
        >
          {preview}{artifact.content.length > 200 ? '…' : ''}
        </p>
      )}
    </div>
  );
}

export default function ArtifactsPanel({ sessionId, isOpen, onClose, newArtifact }: ArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Artifact['type'] | 'all'>('all');

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      const url = sessionId
        ? `/api/a2a/artifacts?sessionId=${encodeURIComponent(sessionId)}`
        : '/api/a2a/artifacts';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data.artifacts ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen) fetchArtifacts();
  }, [isOpen, fetchArtifacts]);

  // Append new artifact when received via SSE
  useEffect(() => {
    if (newArtifact) {
      setArtifacts(prev => {
        const exists = prev.some(a => a.id === newArtifact.id);
        return exists ? prev : [newArtifact, ...prev];
      });
    }
  }, [newArtifact]);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, []);

  const filtered = activeFilter === 'all'
    ? artifacts
    : artifacts.filter(a => a.type === activeFilter);

  const typeCounts = artifacts.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
          <span className="text-base">📦</span>
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Artefatos</span>
          {artifacts.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(124,58,237,0.3)', color: '#a78bfa' }}
            >
              {artifacts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {copied && <span className="text-xs" style={{ color: '#4ade80' }}>Copiado!</span>}
          <button
            onClick={fetchArtifacts}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}
            title="Atualizar"
          >
            🔄
          </button>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      {artifacts.length > 0 && (
        <div className="flex gap-1 px-3 py-2 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {(['all', 'code', 'document', 'data', 'image', 'slide'] as const).map(type => {
            const count = type === 'all' ? artifacts.length : (typeCounts[type] || 0);
            if (type !== 'all' && count === 0) return null;
            const cfg = type === 'all' ? null : TYPE_CONFIG[type];
            return (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap transition-all"
                style={{
                  background: activeFilter === type ? (cfg ? cfg.color + '25' : 'rgba(124,58,237,0.25)') : 'rgba(255,255,255,0.04)',
                  color: activeFilter === type ? (cfg ? cfg.color : '#a78bfa') : '#64748b',
                  border: `1px solid ${activeFilter === type ? (cfg ? cfg.color + '50' : 'rgba(124,58,237,0.5)') : 'transparent'}`,
                }}
              >
                {cfg ? cfg.icon : '📦'} {type === 'all' ? 'Todos' : cfg!.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(124,58,237,0.3)', borderTopColor: '#7c3aed' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <span className="text-2xl mb-2">📭</span>
            <p className="text-xs" style={{ color: '#475569' }}>
              {artifacts.length === 0
                ? 'Nenhum artefato gerado ainda.\nCódigo, documentos e dados\naparecerão aqui automaticamente.'
                : 'Nenhum artefato deste tipo.'}
            </p>
          </div>
        ) : (
          filtered.map(artifact => (
            <ArtifactCard key={artifact.id} artifact={artifact} onCopy={handleCopy} />
          ))
        )}
      </div>
    </div>
  );
}
