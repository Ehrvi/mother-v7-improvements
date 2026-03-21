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

import { useState, Suspense, lazy, useCallback, useRef, useEffect } from 'react';
import '@/styles/shms-tokens.css';
import '@/styles/shms-themes.css';
import { SECTIONS, type ShmsView } from '@/components/shms/SHMSSidebar';
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
const NumericalPanel = safeLazy(() => import('@/components/shms/analysis/NumericalPanel'));
const InSARPanel = safeLazy(() => import('@/components/shms/analysis/InSARPanel'));
const BenchConsolidationPanel = safeLazy(() => import('@/components/shms/analysis/BenchConsolidationPanel'));
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
  'numerical': 'Métodos Numéricos (SSR / FEM / Seepage)',
  'insar': 'InSAR Mining — Estabilidade por Superfície',
  'bench-consolidation': 'Consolidação de Bancadas — DGM + DAC',
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

// ─── Chat message type ───────────────────────────────────────────────────────
interface ChatMsg { role: 'user' | 'assistant'; text: string; ts: number; }

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function SHMSPage() {
  const [activeView, setActiveView] = useState<ShmsView>('overview');
  const [selectedStructureId, setSelectedStructureId] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', text: '🧠 MOTHER SHMS pronta. Pergunte qualquer coisa sobre suas estruturas, sensores ou análises.', ts: Date.now() },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const { data: dashboard } = useShmsDashboardAll();
  const structures = dashboard?.structures ?? [];
  const alertCount = dashboard?.activeAlerts ?? 0;

  // Auto-scroll chat
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Navigate to a view
  const navigate = (view: ShmsView) => {
    setActiveView(view);
    if (view === 'structure-detail' && !selectedStructureId && structures.length > 0) {
      setSelectedStructureId(structures[0].structureId);
    }
  };

  const selectStructure = (id: string) => {
    setSelectedStructureId(id);
    setActiveView('structure-detail');
  };

  const sid = selectedStructureId || (structures.length > 0 ? structures[0].structureId : 'default');

  // ─── Chat submit (connects to MOTHER tRPC API) ─────────────────────────
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);
    setChatLoading(true);
    if (!chatOpen) setChatOpen(true);

    try {
      // Build conversation history for multi-turn
      const conversationHistory = messages.slice(-6).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      }));

      const res = await fetch('/api/trpc/mother.query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { query: text, useCache: true, conversationHistory } }),
        credentials: 'include',
      });
      const data = await res.json();
      const response = data?.result?.data?.json?.response ?? data?.result?.data?.response ?? 'Sem resposta.';
      setMessages(prev => [...prev, { role: 'assistant', text: response, ts: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Erro de conexão com MOTHER. Verifique o backend.', ts: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatOpen, messages, sid, activeView]);

  // ─── View Router ─────────────────────────────────────────────────────────
  function renderView() {
    switch (activeView) {
      case 'overview': return <OverviewDashboard onSelectStructure={selectStructure} onNavigate={navigate} />;
      case 'structure-detail': return <StructureDetail structureId={sid} onNavigate={navigate} onSelectStructure={selectStructure} />;
      case 'sensors-timeseries': return <SensorTimeSeries structureId={sid} />;
      case 'sensors-table': return <SensorTable structureId={sid} />;
      case 'signal-analysis': return <SignalAnalysisPanel structureId={sid} />;
      case 'rul': return <RULPredictionPanel structureId={sid} />;
      case 'stability': return <StabilityPanel structureId={sid} />;
      case 'fault-tree': return <FaultTreeViewer structureId={sid} />;
      case 'big-data': return <BigDataPanel structureId={sid} />;
      case 'numerical': return <NumericalPanel structureId={sid} />;
      case 'insar': return <InSARPanel structureId={sid} />;
      case 'bench-consolidation': return <BenchConsolidationPanel structureId={sid} />;
      case 'risk-map': return <RiskMapViewer structureId={sid} />;
      case 'cross-section': return <CrossSectionViewer structureId={sid} />;
      case 'boreholes': return <BoreholeViewer structureId={sid} />;
      case '3d-twin': return <DigitalTwinPanel structureId={sid} />;
      case 'alerts': return <AlertsPanel structureId={sid} />;
      case 'events': return <EventTimeline structureId={sid} />;
      case 'tarp': return <TARPMatrix structureId={sid} />;
      case 'sirens': return <SirenControl structureId={sid} />;
      case 'ingest-status': return <IngestionStatus />;
      case 'ingest-import': return <DataImport />;
      case 'files': return <FileManager structureId={sid} />;
      case 'documents': return <DocumentLibrary structureId={sid} />;
      case 'export': return <ExportPanel structureId={sid} />;
      case 'bi-integration': return <BIIntegration structureId={sid} />;
      case 'budget': return <BudgetOverview structureId={sid} />;
      case 'system-health': return <SystemHealth />;
      default: return <OverviewDashboard onSelectStructure={selectStructure} onNavigate={navigate} />;
    }
  }

  return (
    <div className="shms-root shms-shell">
      {/* ─── Topbar ─── */}
      <SHMSTopbar
        currentTitle={VIEW_TITLES[activeView] ?? 'SHMS'}
        selectedStructureId={selectedStructureId}
        structures={structures.map(s => ({ structureId: s.structureId, structureName: s.structureName || s.structureId }))}
        onSelectStructure={selectStructure}
      />

      {/* ─── Content (full width) ─── */}
      <div className="shms-content" key={activeView}>
        <Suspense fallback={<ViewLoading />}>
          {renderView()}
        </Suspense>
      </div>

      {/* ─── Floating Chat Panel (macOS style overlay) ─── */}
      <div className={`shms-chatpanel ${chatOpen ? '' : 'shms-chatpanel--hidden'}`}>
        <div className="shms-chatpanel__header">
          🧠 MOTHER AI
          <button
            className="shms-chatpanel__close"
            onClick={() => setChatOpen(false)}
            title="Fechar chat"
          >✕</button>
        </div>
        <div className="shms-chatpanel__messages">
          {messages.map((m, i) => (
            <div key={i} className={`shms-chatpanel__msg shms-chatpanel__msg--${m.role}`}>
              {m.text}
            </div>
          ))}
          {chatLoading && (
            <div className="shms-chatpanel__msg shms-chatpanel__msg--assistant">
              <span className="shms-animate-pulse">⏳ MOTHER processando...</span>
            </div>
          )}
          <div ref={msgsEndRef} />
        </div>
      </div>

      {/* ─── Floating Chat Bar (DECOUPLED from dock) ─── */}
      <div className="shms-chat-bar">
        <span
          className="shms-chat-bar__icon"
          onClick={() => setChatOpen(o => !o)}
          title="Toggle MOTHER AI"
        >🧠</span>
        <input
          type="text"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendChat()}
          placeholder="Pergunte à MOTHER sobre análises, estruturas, sensores..."
          aria-label="Chat com MOTHER AI"
          onFocus={() => { if (!chatOpen) setChatOpen(true); }}
        />
        <button
          className="shms-btn shms-btn--accent shms-chat-bar__send"
          onClick={sendChat}
          disabled={chatLoading}
        >
          {chatLoading ? '⏳' : '↗'}
        </button>
      </div>

      {/* ─── Floating Dock (macOS style — NAV ONLY) ─── */}
      <div className="shms-dock">
        <nav className="shms-dock__nav" aria-label="SHMS Navigation">
          {SECTIONS.map((section, si) => (
            <>
              {si > 0 && <div key={`sep-${si}`} className="shms-dock__separator" />}
              {section.items.map(item => (
                <button
                  key={item.id}
                  className={`shms-dock__item ${activeView === item.id ? 'shms-dock__item--active' : ''}`}
                  onClick={() => navigate(item.id)}
                  aria-current={activeView === item.id ? 'page' : undefined}
                  title={item.label}
                >
                  <span className="shms-dock__item-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </>
          ))}
        </nav>
      </div>
    </div>
  );
}

