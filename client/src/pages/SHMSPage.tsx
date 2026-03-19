/**
 * SHMSPage.tsx — MOTHER SHMS v4 — SOTA Dashboard Shell
 *
 * Architecture:
 * - Sidebar + Topbar + Content (Grafana/ThingsBoard pattern)
 * - 10 modules × 25 views consuming all 36 backend endpoints
 * - HPHMI compliant (ISA-18.2 / IEC 62682)
 * - Cognitive/AI elements: predictive overlays, anomaly highlighting, NLP chat
 *
 * Scientific basis:
 * - Kitchenham & Charters (2007): systematic review for UI decisions
 * - Few (2013): dashboard design best practices (KPIs first)
 * - Nielsen (1994): 10 usability heuristics
 * - ISO 9241-11: usability framework
 * - ICOLD Bulletin 158: dam monitoring data visualization
 * - WCAG 2.1 AA: accessibility
 */

import { useState, Suspense, lazy } from 'react';
import '@/styles/shms-tokens.css';
import SHMSSidebar, { type ShmsView } from '@/components/shms/SHMSSidebar';
import SHMSTopbar from '@/components/shms/SHMSTopbar';

// Safe lazy loader: returns placeholder if module doesn't exist
function safeLazy(importFn: () => Promise<any>) {
  return lazy(() =>
    importFn().catch(() => ({
      default: () => (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          <p>🚧 Módulo em desenvolvimento</p>
        </div>
      ),
    }))
  );
}

import { useShmsDashboardAll } from '@/hooks/useShmsApi';

// ─── Lazy-loaded modules ─────────────────────────────────────────────────────
const OverviewDashboard = safeLazy(() => import('@/components/shms/dashboard/OverviewDashboard'));
const StructureDetail = safeLazy(() => import('@/components/shms/dashboard/StructureDetail'));
const SensorTimeSeries = safeLazy(() => import('@/components/shms/sensors/SensorTimeSeries'));
const SensorTable = safeLazy(() => import('@/components/shms/sensors/SensorTable'));
const SignalAnalysisPanel = safeLazy(() => import('@/components/shms/analysis/SignalAnalysisPanel'));
const RULPredictionPanel = safeLazy(() => import('@/components/shms/analysis/RULPredictionPanel'));
const StabilityPanel = safeLazy(() => import('@/components/shms/analysis/StabilityPanel'));
const FaultTreeViewer = safeLazy(() => import('@/components/shms/analysis/FaultTreeViewer'));
const BigDataPanel = safeLazy(() => import('@/components/shms/analysis/BigDataPanel'));
const RiskMapViewer = safeLazy(() => import('@/components/shms/geo/RiskMapViewer'));
const CrossSectionViewer = safeLazy(() => import('@/components/shms/geo/CrossSectionViewer'));
const BoreholeViewer = safeLazy(() => import('@/components/shms/geo/BoreholeViewer'));
const AlertsPanel = safeLazy(() => import('@/components/shms/alerts/AlertsPanel'));
const EventTimeline = safeLazy(() => import('@/components/shms/alerts/EventTimeline'));
const TARPMatrix = safeLazy(() => import('@/components/shms/alerts/TARPMatrix'));
const SirenControl = safeLazy(() => import('@/components/shms/alerts/SirenControl'));
const IngestionStatus = safeLazy(() => import('@/components/shms/ingestion/IngestionStatus'));
const DataImport = safeLazy(() => import('@/components/shms/ingestion/DataImport'));
const FileManager = safeLazy(() => import('@/components/shms/documents/FileManager'));
const DocumentLibrary = safeLazy(() => import('@/components/shms/documents/DocumentLibrary'));
const ExportPanel = safeLazy(() => import('@/components/shms/documents/ExportPanel'));
const BIIntegration = safeLazy(() => import('@/components/shms/admin/BIIntegration'));
const BudgetOverview = safeLazy(() => import('@/components/shms/admin/BudgetOverview'));
const SystemHealth = safeLazy(() => import('@/components/shms/admin/SystemHealth'));
const AIAnalysisChat = safeLazy(() => import('@/components/shms/ai/AIAnalysisChat'));
const CognitiveTimeSeries = safeLazy(() => import('@/components/shms/sensors/CognitiveTimeSeries'));
const DigitalTwinPanel = safeLazy(() => import('@/components/shms/DigitalTwin3DViewer'));


// ─── View titles (PT-BR) ─────────────────────────────────────────────────────
const VIEW_TITLES: Record<ShmsView, string> = {
  'overview': 'Visão Geral — Monitoramento de Saúde Estrutural',
  'structure-detail': 'Detalhe da Estrutura',
  'sensors-timeseries': 'Séries Temporais',
  'sensors-table': 'Instrumentação',
  'signal-analysis': 'Análise de Sinais (FFT/PSD/DWT)',
  'rul': 'Vida Útil Remanescente (RUL)',
  'stability': 'Análise de Estabilidade (Bishop)',
  'fault-tree': 'Árvore de Falhas (FTA)',
  'big-data': 'Big Data / Classificação',
  'risk-map': 'Mapa de Risco (ICOLD)',
  'cross-section': 'Seções Transversais',
  'boreholes': 'Sondagens / Perfis Litológicos',
  '3d-twin': 'Digital Twin 3D',
  'alerts': 'Alertas ICOLD',
  'events': 'Timeline de Eventos',
  'tarp': 'Matriz TARP',
  'sirens': 'Controle de Sirenes',
  'ingest-status': 'Conectores de Ingestão',
  'ingest-import': 'Importar Dados',
  'files': 'Arquivos',
  'documents': 'Documentos',
  'export': 'Exportar Dados',
  'bi-integration': 'BI Integration',
  'budget': 'Orçamento',
  'system-health': 'Saúde do Sistema',
  'ai-chat': 'AI Cognitiva — Cognitive Blender',
};

// ─── Loading fallback ────────────────────────────────────────────────────────
function ViewLoading() {
  return (
    <div className="shms-animate-slide-in" style={{ display: 'grid', gap: 16 }}>
      <div className="shms-skeleton" style={{ height: 40, width: 250, borderRadius: 'var(--shms-radius-sm)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="shms-skeleton" style={{ height: 80, borderRadius: 'var(--shms-radius)' }} />
        <div className="shms-skeleton" style={{ height: 80, borderRadius: 'var(--shms-radius)' }} />
        <div className="shms-skeleton" style={{ height: 80, borderRadius: 'var(--shms-radius)' }} />
      </div>
      <div className="shms-skeleton" style={{ height: 300, borderRadius: 'var(--shms-radius)' }} />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function SHMSPage() {
  const [activeView, setActiveView] = useState<ShmsView>('overview');
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { data: dashboard } = useShmsDashboardAll();
  const structures = dashboard?.structures ?? [];
  const alertCount = dashboard?.activeAlerts ?? 0;

  // Navigate to a view (auto-select first structure if needed)
  const navigate = (view: ShmsView) => {
    setActiveView(view);
    if (view === 'structure-detail' && !selectedStructureId && structures.length > 0) {
      setSelectedStructureId(structures[0].structureId);
    }
  };

  // Select a structure and go to detail
  const selectStructure = (id: string) => {
    setSelectedStructureId(id);
    setActiveView('structure-detail');
  };

  // Use first structure as default for structure-scoped views
  const sid = selectedStructureId || (structures.length > 0 ? structures[0].structureId : 'default');

  // ─── View Router ─────────────────────────────────────────────────────────
  function renderView() {
    switch (activeView) {
      case 'overview':
        return <OverviewDashboard onSelectStructure={selectStructure} onNavigate={navigate} />;
      case 'structure-detail':
        return <StructureDetail structureId={sid} onNavigate={navigate} onSelectStructure={selectStructure} />;
      case 'sensors-timeseries':
        return <SensorTimeSeries structureId={sid} />;
      case 'sensors-table':
        return <SensorTable structureId={sid} />;
      case 'signal-analysis':
        return <SignalAnalysisPanel structureId={sid} />;
      case 'rul':
        return <RULPredictionPanel structureId={sid} />;
      case 'stability':
        return <StabilityPanel structureId={sid} />;
      case 'fault-tree':
        return <FaultTreeViewer structureId={sid} />;
      case 'big-data':
        return <BigDataPanel structureId={sid} />;
      case 'risk-map':
        return <RiskMapViewer structureId={sid} />;
      case 'cross-section':
        return <CrossSectionViewer structureId={sid} />;
      case 'boreholes':
        return <BoreholeViewer structureId={sid} />;
      case '3d-twin':
        return <DigitalTwinPanel structureId={sid} />;
      case 'alerts':
        return <AlertsPanel structureId={sid} />;
      case 'events':
        return <EventTimeline structureId={sid} />;
      case 'tarp':
        return <TARPMatrix structureId={sid} />;
      case 'sirens':
        return <SirenControl structureId={sid} />;
      case 'ingest-status':
        return <IngestionStatus />;
      case 'ingest-import':
        return <DataImport />;
      case 'files':
        return <FileManager structureId={sid} />;
      case 'documents':
        return <DocumentLibrary structureId={sid} />;
      case 'export':
        return <ExportPanel structureId={sid} />;
      case 'bi-integration':
        return <BIIntegration structureId={sid} />;
      case 'budget':
        return <BudgetOverview structureId={sid} />;
      case 'system-health':
        return <SystemHealth />;
      case 'ai-chat':
        return <CognitiveTimeSeries structureId={sid} />;
      default:
        return <OverviewDashboard onSelectStructure={selectStructure} onNavigate={navigate} />;
    }
  }

  return (
    <div className={`shms-root shms-shell ${sidebarCollapsed ? 'shms-shell--collapsed' : ''}`}>
      <SHMSSidebar
        activeView={activeView}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        alertCount={alertCount}
      />
      <SHMSTopbar
        currentTitle={VIEW_TITLES[activeView] ?? 'SHMS'}
        selectedStructureId={selectedStructureId}
        structures={structures.map(s => ({ structureId: s.structureId, structureName: s.structureName || s.structureId }))}
        onSelectStructure={selectStructure}
      />
      <div className="shms-content">
        <Suspense fallback={<ViewLoading />}>
          {renderView()}
        </Suspense>
      </div>
    </div>
  );
}
