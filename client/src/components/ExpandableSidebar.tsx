/**
 * ExpandableSidebar — C202 Sprint 3 UX/UI
 * Sidebar expansivel com historico de runs DGM e navegacao
 *
 * Design: Apple HIG + Material Design 3 — sidebar responsiva
 * Base: arXiv:2205.01068 — Adaptive UI for AI Systems
 */

import React, { useState, useCallback } from 'react';

interface DGMRunSummary {
  runId: string;
  version: string;
  fitnessScore: number;
  success: boolean;
  timestamp: string;
  phase: string;
}

interface SidebarSection {
  id: string;
  label: string;
  icon: string;
  items?: { id: string; label: string; badge?: string }[];
}

interface ExpandableSidebarProps {
  runs?: DGMRunSummary[];
  onRunSelect?: (runId: string) => void;
  onSectionSelect?: (sectionId: string) => void;
  currentSection?: string;
  motherVersion?: string;
  cycle?: string;
}

const SECTIONS: SidebarSection[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'dgm', label: 'DGM Runs', icon: '🔄' },
  { id: 'memory', label: 'Memoria', icon: '🧠' },
  { id: 'monitor', label: 'Monitor', icon: '📊' },
  { id: 'artifacts', label: 'Artefatos', icon: '📁' },
  { id: 'settings', label: 'Configuracoes', icon: '⚙️' },
];

export const ExpandableSidebar: React.FC<ExpandableSidebarProps> = ({
  runs = [],
  onRunSelect,
  onSectionSelect,
  currentSection = 'chat',
  motherVersion = 'v87.0',
  cycle = 'C202',
}) => {
  const [expanded, setExpanded] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>('dgm');

  const toggleSidebar = useCallback(() => setExpanded(prev => !prev), []);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSection(prev => prev === sectionId ? null : sectionId);
    onSectionSelect?.(sectionId);
  }, [onSectionSelect]);

  const successRate = runs.length > 0
    ? (runs.filter(r => r.success).length / runs.length * 100).toFixed(0)
    : '0';

  const bestFitness = runs.length > 0
    ? Math.max(...runs.map(r => r.fitnessScore)).toFixed(3)
    : 'N/A';

  return (
    <aside
      className={`expandable-sidebar ${expanded ? 'expanded' : 'collapsed'}`}
      style={{
        width: expanded ? '260px' : '56px',
        minHeight: '100vh',
        backgroundColor: '#1a1a2e',
        borderRight: '1px solid #2d2d4e',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 12px',
        borderBottom: '1px solid #2d2d4e',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '64px',
      }}>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: '#a0a0c0',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
            borderRadius: '6px',
            flexShrink: 0,
          }}
          title={expanded ? 'Recolher sidebar' : 'Expandir sidebar'}
        >
          {expanded ? '◀' : '▶'}
        </button>

        {expanded && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#e0e0ff', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>
              MOTHER {motherVersion}
            </div>
            <div style={{ color: '#6060a0', fontSize: '11px', whiteSpace: 'nowrap' }}>
              Ciclo {cycle} · DGM Loop
            </div>
          </div>
        )}
      </div>

      {/* DGM Stats (only when expanded) */}
      {expanded && (
        <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid #2d2d4e',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        }}>
          <StatCard label="Runs" value={String(runs.length)} color="#4a9eff" />
          <StatCard label="Taxa" value={`${successRate}%`} color="#4aff9e" />
          <StatCard label="Best" value={bestFitness} color="#ffa04a" />
          <StatCard label="Ciclo" value={cycle} color="#c04aff" />
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {SECTIONS.map(section => (
          <div key={section.id}>
            <button
              onClick={() => toggleSection(section.id)}
              style={{
                width: '100%',
                background: currentSection === section.id ? 'rgba(74, 158, 255, 0.15)' : 'none',
                border: 'none',
                color: currentSection === section.id ? '#4a9eff' : '#a0a0c0',
                cursor: 'pointer',
                padding: expanded ? '10px 16px' : '10px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                textAlign: 'left',
                borderLeft: currentSection === section.id ? '3px solid #4a9eff' : '3px solid transparent',
                justifyContent: expanded ? 'flex-start' : 'center',
              }}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{section.icon}</span>
              {expanded && (
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {section.label}
                </span>
              )}
              {expanded && section.id === 'dgm' && runs.length > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: '#4a9eff',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: 700,
                }}>
                  {runs.length}
                </span>
              )}
            </button>

            {/* DGM Runs sub-list */}
            {expanded && section.id === 'dgm' && expandedSection === 'dgm' && runs.length > 0 && (
              <div style={{ paddingLeft: '16px', borderLeft: '2px solid #2d2d4e', marginLeft: '20px' }}>
                {runs.slice(-8).reverse().map(run => (
                  <button
                    key={run.runId}
                    onClick={() => onRunSelect?.(run.runId)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      color: run.success ? '#4aff9e' : '#ff6060',
                      cursor: 'pointer',
                      padding: '6px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      textAlign: 'left',
                    }}
                  >
                    <span>{run.success ? '✓' : '✗'}</span>
                    <span style={{ fontFamily: 'monospace' }}>{run.runId}</span>
                    <span style={{ marginLeft: 'auto', color: '#6060a0' }}>
                      {run.fitnessScore.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      {expanded && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid #2d2d4e',
          color: '#4040a0',
          fontSize: '10px',
          textAlign: 'center',
        }}>
          DGM Loop Activator C202-R001
        </div>
      )}
    </aside>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// StatCard helper
// ─────────────────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '6px',
    padding: '6px 8px',
    textAlign: 'center',
  }}>
    <div style={{ color, fontWeight: 700, fontSize: '13px' }}>{value}</div>
    <div style={{ color: '#6060a0', fontSize: '9px', marginTop: '1px' }}>{label}</div>
  </div>
);

export default ExpandableSidebar;
