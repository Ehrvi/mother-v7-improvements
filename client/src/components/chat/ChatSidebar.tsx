import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, Brain, Dna, Database, Activity, Sparkles, GitBranch,
  BarChart3, Layers, BookOpen, FlaskConical, Terminal, Code2, Network,
  FolderKanban, ExternalLink,
} from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SessionHistory } from '@/components/SessionHistory';

interface ChatSidebarProps {
  onSendMessage: (text: string) => void;
  motherVersion: string;
  providerHealth?: { allHealthy: boolean; providers: Array<{ provider: string; status: string; displayName?: string }> };
}

const SIDEBAR_COMMANDS = [
  { group: 'Diagnóstico', items: [
    { icon: FlaskConical, label: '/audit', desc: 'Auditoria completa do sistema', color: '#a78bfa' },
    { icon: Activity, label: '/status', desc: 'Status em tempo real', color: '#60a5fa' },
  ]},
  { group: 'Evolução DGM', items: [
    { icon: Layers, label: '/proposals', desc: 'Listar propostas DGM', color: '#fbbf24' },
    { icon: Dna, label: '/fitness', desc: 'Score de fitness atual', color: '#34d399' },
    { icon: FlaskConical, label: '/dgm-test', desc: 'Teste DGM com proof hashes', color: '#8b5cf6' },
  ]},
  { group: 'Conhecimento', items: [
    { icon: BookOpen, label: '/knowledge', desc: 'Base de conhecimento', color: '#f472b6' },
    { icon: Brain, label: '/research', desc: 'Pesquisa científica', color: '#22d3ee' },
  ]},
  { group: 'Fase 5', items: [
    { icon: Terminal, label: '/shell', desc: 'Shell executor remoto', color: '#f97316' },
    { icon: Code2, label: '/editor', desc: 'Code editor', color: '#34d399' },
    { icon: Network, label: '/graph', desc: 'Dependency graph', color: '#fb7185' },
    { icon: FolderKanban, label: '/projects', desc: 'Project dashboard', color: '#fbbf24' },
  ]},
];

const PHASE5_PANEL_MAP: Record<string, 'shell' | 'editor' | 'graph' | 'projects'> = {
  '/shell': 'shell',
  '/editor': 'editor',
  '/graph': 'graph',
  '/projects': 'projects',
};

export default function ChatSidebar({ onSendMessage, motherVersion, providerHealth }: ChatSidebarProps) {
  const navigate = useNavigate();
  const store = useChatStore();
  const { sidebarOpen, stats, showSessionHistory } = store;

  const avgQuality = stats.qualityScores.length > 0
    ? Math.round(stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length) : null;

  const handleCommand = (label: string) => {
    if (label === '/dgm-test') {
      navigate('/dgm-test');
      return;
    }
    if (PHASE5_PANEL_MAP[label]) {
      store.setActivePanel(PHASE5_PANEL_MAP[label]);
      return;
    }
    onSendMessage(label);
  };

  if (!sidebarOpen) return null;

  return (
    <aside
      className="flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
      style={{
        width: 260,
        minWidth: 260,
        borderRight: '1px solid oklch(20% 0.02 280)',
        background: 'oklch(10% 0.02 280)',
      }}
    >
      <div className="flex flex-col h-full overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(25% 0.02 280) transparent' }}>

        {/* Logo + version */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'oklch(18% 0.02 280)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-gradient-start, oklch(55% 0.25 300)), var(--color-gradient-end, oklch(50% 0.22 260)))' }}>
            M
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: 'oklch(92% 0.01 280)' }}>MOTHER {motherVersion}</div>
            <div className="text-[10px]" style={{ color: 'oklch(52% 0.02 280)' }}>Darwin Gödel Machine</div>
          </div>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3">
          <button
            onClick={() => store.clearMessages()}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'oklch(58% 0.18 295)', color: 'white' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'oklch(65% 0.20 290)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'oklch(58% 0.18 295)')}
          >
            <span className="text-base leading-none">+</span>
            Nova Conversa
          </button>
        </div>

        {/* Online status */}
        <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: 'oklch(16% 0.04 150)', border: '1px solid oklch(25% 0.06 150)' }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'oklch(72% 0.18 145)', boxShadow: '0 0 6px oklch(72% 0.18 145)' }} />
          <span className="text-xs font-medium" style={{ color: 'oklch(72% 0.18 145)' }}>Produção · Sydney</span>
        </div>

        {/* Session stats */}
        <div className="mx-3 mb-2 rounded-xl overflow-hidden" style={{ border: '1px solid oklch(18% 0.02 280)' }}>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'oklch(52% 0.02 280)', borderBottom: '1px solid oklch(15% 0.02 280)' }}>
            Sessão Atual
          </div>
          <div className="px-3 py-2 space-y-2">
            {[
              { label: 'Mensagens', value: stats.msgCount },
              { label: 'Custo Total', value: `$${stats.totalCost.toFixed(6)}` },
              { label: 'Qualidade Média', value: avgQuality ? `${avgQuality}%` : '—', highlight: avgQuality ? (avgQuality >= 80 ? 'green' : avgQuality >= 70 ? 'amber' : 'red') : 'neutral' },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between items-center text-xs">
                <span style={{ color: 'oklch(52% 0.02 280)' }}>{label}</span>
                <span className="font-semibold" style={{
                  color: highlight === 'green' ? 'oklch(72% 0.18 145)' :
                         highlight === 'amber' ? 'oklch(75% 0.14 70)' :
                         highlight === 'red' ? 'oklch(65% 0.22 25)' :
                         'oklch(72% 0.16 285)',
                }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MOTHER Tools */}
        <div className="mx-3 mb-2 rounded-xl overflow-hidden" style={{ border: '1px solid oklch(22% 0.05 290)' }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid oklch(18% 0.03 280)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'oklch(68% 0.16 285)' }}>MOTHER Tools</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'oklch(20% 0.06 290)', border: '1px solid oklch(28% 0.08 290)', color: 'oklch(68% 0.16 285)' }}>CRIADOR</span>
          </div>
          <div className="p-2 space-y-2">
            {SIDEBAR_COMMANDS.map(({ group, items }) => (
              <div key={group}>
                <div className="px-1 mb-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(42% 0.02 280)' }}>{group}</div>
                <div className="grid grid-cols-2 gap-1">
                  {items.map(({ icon: Icon, label, desc, color }) => (
                    <button key={label}
                      onClick={() => handleCommand(label)}
                      title={desc}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                      style={{ background: `${color}12`, border: `1px solid ${color}25`, color }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}20`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}12`; }}
                    >
                      <Icon className="w-3 h-3 flex-shrink-0" />
                      <code style={{ fontSize: 10 }}>{label}</code>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System info */}
        <div className="mx-3 mb-2 rounded-xl overflow-hidden" style={{ border: '1px solid oklch(18% 0.02 280)' }}>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'oklch(52% 0.02 280)', borderBottom: '1px solid oklch(15% 0.02 280)' }}>
            Sistema
          </div>
          <div className="px-3 py-2 space-y-2">
            {[
              { icon: GitBranch, label: 'Versão', value: motherVersion, color: 'oklch(68% 0.16 285)' },
              { icon: Database, label: 'DB', value: 'Cloud SQL ✓', color: 'oklch(72% 0.18 145)' },
              { icon: Dna, label: 'GEA Loop', value: 'Ativo ✓', color: 'oklch(72% 0.18 145)' },
              { icon: Activity, label: 'Fitness Track', value: 'Ativo ✓', color: 'oklch(72% 0.18 145)' },
              { icon: Sparkles, label: 'Fase 5', value: 'C145 ✓', color: 'oklch(72% 0.18 145)' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-1.5" style={{ color: 'oklch(52% 0.02 280)' }}><Icon className="w-3 h-3" />{label}</span>
                <span className="font-semibold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
          {providerHealth?.allHealthy && (
            <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'oklch(72% 0.18 145)' }}>
              <span>✅</span><span>Todos os 5 provedores saudáveis</span>
            </div>
          )}
          {providerHealth && !providerHealth.allHealthy && (
            <div className="px-3 pb-2">
              {providerHealth.providers.filter((p) => p.status !== 'healthy' && p.status !== 'unconfigured').map((p) => (
                <div key={p.provider} className="flex items-center gap-1 text-[10px]" style={{ color: 'oklch(75% 0.14 70)' }}>
                  <span>{p.status === 'no_credits' ? '💳' : '⚠️'}</span>
                  <span>{p.displayName ?? p.provider} — {p.status === 'no_credits' ? 'Sem créditos' : 'Degradado'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SHMS link */}
        <div className="mx-3 mb-3">
          <button
            onClick={() => navigate('/shms')}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all"
            style={{ background: 'oklch(14% 0.04 200)', border: '1px solid oklch(22% 0.06 200)', color: 'oklch(72% 0.14 195)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'oklch(18% 0.05 200)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'oklch(14% 0.04 200)')}
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="font-medium">SHMS Monitor</span>
            </span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Session History */}
        <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid oklch(18% 0.02 280)' }}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left"
            onClick={() => store.setShowSessionHistory(!showSessionHistory)}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'oklch(52% 0.02 280)' }}>Histórico</span>
            <ChevronRight className="w-3 h-3 transition-transform" style={{ color: 'oklch(42% 0.02 280)', transform: showSessionHistory ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showSessionHistory && (
            <div className="border-t" style={{ borderColor: 'oklch(15% 0.02 280)' }}>
              <ErrorBoundary componentName="SessionHistory">
                <SessionHistory onSelectSession={() => {}} />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
