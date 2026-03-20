/**
 * SHMSSidebar.tsx — Navigation sidebar for SHMS modules
 *
 * Design basis:
 * - Grafana/ThingsBoard sidebar pattern — grouped navigation
 * - Nielsen H2: Match between system and real world (geotechnical terminology)
 * - ISA-18.2 §6.3: Navigation should support rapid context switching
 */

import { type ReactNode } from 'react';

export type ShmsView =
  | 'overview' | 'structure-detail'
  | 'sensors-timeseries' | 'sensors-table'
  | 'signal-analysis' | 'rul' | 'stability' | 'fault-tree' | 'big-data' | 'numerical' | 'insar' | 'bench-consolidation'
  | 'risk-map' | 'cross-section' | 'boreholes' | '3d-twin'
  | 'alerts' | 'events' | 'tarp' | 'sirens'
  | 'ingest-status' | 'ingest-import'
  | 'files' | 'documents' | 'export'
  | 'bi-integration' | 'budget' | 'system-health'
  | 'ai-chat';

interface NavItem {
  id: ShmsView;
  label: string;
  icon: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: 'Dashboard',
    items: [
      { id: 'overview', label: 'Visão Geral', icon: '📊' },
      { id: 'structure-detail', label: 'Detalhe Estrutura', icon: '🏗️' },
    ],
  },
  {
    label: 'Sensores',
    items: [
      { id: 'sensors-timeseries', label: 'Séries Temporais', icon: '📈' },
      { id: 'sensors-table', label: 'Instrumentação', icon: '📋' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { id: 'signal-analysis', label: 'Sinais FFT/PSD', icon: '🔬' },
      { id: 'rul', label: 'Vida Útil (RUL)', icon: '⏳' },
      { id: 'stability', label: 'Estabilidade', icon: '⛰️' },
      { id: 'bench-consolidation', label: 'Consolidação Bancadas', icon: '🏗️' },
      { id: 'numerical', label: 'Métodos Numéricos', icon: '🔢' },
      { id: 'insar', label: 'InSAR Mining', icon: '🛰️' },
      { id: 'fault-tree', label: 'Árvore de Falhas', icon: '🌳' },
      { id: 'big-data', label: 'Big Data', icon: '🧮' },
    ],
  },
  {
    label: 'Geotécnico',
    items: [
      { id: 'risk-map', label: 'Mapa de Risco', icon: '🗺️' },
      { id: 'cross-section', label: 'Seção Transversal', icon: '📐' },
      { id: 'boreholes', label: 'Sondagens', icon: '🕳️' },
      { id: '3d-twin', label: 'Digital Twin 3D', icon: '🎮' },
    ],
  },
  {
    label: 'Alertas & Eventos',
    items: [
      { id: 'alerts', label: 'Alertas ICOLD', icon: '🚨' },
      { id: 'events', label: 'Timeline', icon: '📅' },
      { id: 'tarp', label: 'Matriz TARP', icon: '📊' },
      { id: 'sirens', label: 'Sirenes', icon: '📢' },
    ],
  },
  {
    label: 'Ingestão',
    items: [
      { id: 'ingest-status', label: 'Conectores', icon: '🔌' },
      { id: 'ingest-import', label: 'Importar Dados', icon: '📥' },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { id: 'files', label: 'Arquivos', icon: '📁' },
      { id: 'documents', label: 'Documentos', icon: '📄' },
      { id: 'export', label: 'Exportar', icon: '💾' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { id: 'bi-integration', label: 'BI Integration', icon: '📊' },
      { id: 'budget', label: 'Orçamento', icon: '💰' },
      { id: 'system-health', label: 'Sistema', icon: '🖥️' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { id: 'ai-chat', label: 'AI Cognitiva', icon: '🧠' },
    ],
  },
];

interface SHMSSidebarProps {
  activeView: ShmsView;
  onNavigate: (view: ShmsView) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  alertCount?: number;
  aiInsightCount?: number;
}

export default function SHMSSidebar({ activeView, onNavigate, collapsed = false, onToggleCollapse, alertCount = 0, aiInsightCount = 0 }: SHMSSidebarProps) {
  return (
    <aside className="shms-sidebar" role="navigation" aria-label="SHMS Navigation">
      <div className="shms-sidebar__logo">
        <div className="shms-sidebar__logo-icon" />
        {!collapsed && <span className="shms-sidebar__logo-text">SHMS</span>}
        {onToggleCollapse && (
          <button className="shms-btn" style={{ marginLeft: 'auto', padding: '4px 6px' }} onClick={onToggleCollapse} aria-label="Toggle sidebar">
            {collapsed ? '→' : '←'}
          </button>
        )}
      </div>

      <nav className="shms-sidebar__nav">
        {SECTIONS.map((section) => (
          <div key={section.label} className="shms-sidebar__section">
            {!collapsed && <div className="shms-sidebar__section-label">{section.label}</div>}
            {section.items.map((item) => {
              const badge = item.id === 'alerts' && alertCount > 0
                ? alertCount
                : item.id === 'ai-chat' && aiInsightCount > 0
                ? aiInsightCount
                : null;

              return (
                <button
                  key={item.id}
                  className={`shms-sidebar__item ${activeView === item.id ? 'shms-sidebar__item--active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={activeView === item.id ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="shms-sidebar__item-icon" role="img" aria-hidden>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                  {badge !== null && !collapsed && (
                    <span className={`shms-badge ${item.id === 'alerts' ? 'shms-badge--red' : 'shms-badge--blue'}`} style={{ marginLeft: 'auto', fontSize: '9px' }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export { SECTIONS, type NavSection, type NavItem };
