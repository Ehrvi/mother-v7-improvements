import {
  Activity, Shield, Dna, BookOpen, GitBranch, Share2, 
  Cpu, Zap, TrendingUp, AlertTriangle, Lock, Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/store/chatStore';

export default function ProductOverviewDisplay() {
  const navigate = useNavigate();
  const setDisplayMode = useChatStore((s) => s.setDisplayMode);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto w-full max-w-7xl mx-auto" style={{ background: 'var(--void-deepest, oklch(6% 0.02 280))' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-6 flex-shrink-0"
        style={{ borderBottom: '1px solid oklch(18% 0.02 280)' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, oklch(25% 0.08 280), oklch(15% 0.04 280))', border: '1px solid oklch(35% 0.08 280)' }}
          >
            <Share2 className="w-6 h-6 text-white" style={{ filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'oklch(95% 0.01 280)' }}>
              Centro de Comando MOTHER v7
            </h1>
            <p className="text-xs font-medium uppercase tracking-widest mt-1" style={{ color: 'oklch(60% 0.05 280)' }}>
              Integração Executiva: G-Trust · Darwin-Twin · Lex-Mining
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col items-end mr-4">
            <span className="text-[10px] font-bold uppercase" style={{ color: 'oklch(50% 0.02 280)' }}>System Status</span>
            <span className="text-xs font-mono font-bold flex items-center gap-1.5" style={{ color: 'oklch(75% 0.18 150)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'oklch(75% 0.18 150)' }} />
              NOMINAL: ALL SYSTEMS ONLINE
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 grid gap-6 grid-cols-1 md:grid-cols-3">
        {/* Product 1: G-Trust Sentinel */}
        <div
          onClick={() => setDisplayMode('shms-dashboard')}
          className="group rounded-2xl p-5 cursor-pointer relative overflow-hidden transition-all duration-300"
          style={{ 
            background: 'oklch(12% 0.02 260)', 
            border: '1px solid oklch(20% 0.04 260)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = 'oklch(40% 0.12 260)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.4), 0 0 20px rgba(56, 189, 248, 0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'oklch(20% 0.04 260)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
          }}
        >
          {/* Subtle gradient background */}
          <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at top right, oklch(65% 0.20 250), transparent 60%)' }} />
          
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-950/40 border border-blue-500/30">
                  <Activity className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-none mb-1">G-Trust Sentinel</h2>
                  <div className="text-[10px] text-blue-300/70 font-mono uppercase">SHMS Monitoring & IoT</div>
                </div>
              </div>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-[10px] font-bold border border-emerald-500/20">ACTIVE</span>
            </div>
            
            <p className="text-xs text-slate-400 mb-6 leading-relaxed flex-grow">
              Coleta de dados IoT contínua com detecção de falhas via LSTM e trilhas de auditoria imutáveis SHA-256 (IEC 62682).
            </p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-void-deepest/50 p-2.5 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Sensores Ativos</div>
                <div className="text-lg font-mono font-bold text-slate-100 flex items-center justify-between">
                  1,482 <TrendingUp className="w-3 h-3 text-emerald-400" />
                </div>
              </div>
              <div className="bg-void-deepest/50 p-2.5 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Anomalias LSTM</div>
                <div className="text-lg font-mono font-bold text-amber-400 flex items-center justify-between">
                  3 <AlertTriangle className="w-3 h-3 text-amber-500" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex -space-x-1">
                {[1,2,3].map(i => (
                  <div key={i} className="w-5 h-5 rounded-full border border-void-deepest bg-blue-500/20 flex items-center justify-center">
                    <Shield className="w-2.5 h-2.5 text-blue-400" />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1 transition-colors">
                Abrir Painel <span className="text-[14px]">→</span>
              </span>
            </div>
          </div>
        </div>

        {/* Product 2: Darwin-Twin Optimizer */}
        <div
          onClick={() => setDisplayMode('dgm-pipeline')}
          className="group rounded-2xl p-5 cursor-pointer relative overflow-hidden transition-all duration-300"
          style={{ 
            background: 'oklch(12% 0.02 280)', 
            border: '1px solid oklch(20% 0.04 280)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = 'oklch(40% 0.16 295)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.4), 0 0 20px rgba(168, 85, 247, 0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'oklch(20% 0.04 280)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
          }}
        >
          {/* Subtle gradient background */}
          <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at top right, oklch(65% 0.25 295), transparent 60%)' }} />
          
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-950/40 border border-purple-500/30">
                  <Dna className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-none mb-1">Darwin-Twin Optimizer</h2>
                  <div className="text-[10px] text-purple-300/70 font-mono uppercase">Evolução de Modelos & DGM</div>
                </div>
              </div>
              <span className="text-purple-400 bg-purple-500/10 px-2 py-1 rounded text-[10px] font-bold border border-purple-500/20">EVOLUINDO</span>
            </div>
            
            <p className="text-xs text-slate-400 mb-6 leading-relaxed flex-grow">
              Melhoria auto-referencial (Gödel Machine) e otimização de algoritmos de correlação do digital twin com validação E2B.
            </p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-void-deepest/50 p-2.5 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Gerações (Epochs)</div>
                <div className="text-lg font-mono font-bold text-slate-100 flex items-center justify-between">
                  14 <GitBranch className="w-3 h-3 text-slate-400" />
                </div>
              </div>
              <div className="bg-void-deepest/50 p-2.5 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Otimização Atual</div>
                <div className="text-lg font-mono font-bold text-purple-400 flex items-center justify-between">
                  +12.4% <Zap className="w-3 h-3 text-purple-500" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-2 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                <Lock className="w-3 h-3 text-purple-400" />
                <span className="text-[9px] font-mono text-purple-300">Prova Criptográfica Segura</span>
              </div>
              <span className="text-[10px] font-semibold text-purple-400 group-hover:text-purple-300 flex items-center gap-1 transition-colors">
                Ver Pipeline <span className="text-[14px]">→</span>
              </span>
            </div>
          </div>
        </div>

        {/* Product 3: Lex-Mining Advisor */}
        <div
          onClick={() => setDisplayMode('knowledge')}
          className="group rounded-2xl p-5 cursor-pointer relative overflow-hidden transition-all duration-300"
          style={{ 
            background: 'oklch(12% 0.02 160)', 
            border: '1px solid oklch(20% 0.04 160)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = 'oklch(40% 0.12 160)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.4), 0 0 20px rgba(16, 185, 129, 0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'oklch(20% 0.04 160)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
          }}
        >
          {/* Subtle gradient background */}
          <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at top right, oklch(65% 0.20 160), transparent 60%)' }} />
          
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-950/40 border border-emerald-500/30">
                  <BookOpen className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-none mb-1">Lex-Mining Advisor</h2>
                  <div className="text-[10px] text-emerald-300/70 font-mono uppercase">Compliance & Governança</div>
                </div>
              </div>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded text-[10px] font-bold border border-emerald-500/20">INDEXADO</span>
            </div>
            
            <p className="text-xs text-slate-400 mb-6 leading-relaxed flex-grow">
              Motor baseado em RAG para auditoria instantânea perante normativas (ANM, ICOLD) e taxonomia do conhecimento UDC.
            </p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-void-deepest/50 p-2.5 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">KAI (Absorção)</div>
                <div className="text-lg font-mono font-bold text-emerald-400 flex items-center justify-between">
                  87% <TrendingUp className="w-3 h-3 text-emerald-400" />
                </div>
              </div>
              <div className="bg-void-deepest/50 p-2.5 rounded-lg border border-white/5">
                <div className="text-[10px] text-slate-500 mb-0.5 uppercase">Tokens na Memória</div>
                <div className="text-lg font-mono font-bold text-slate-100 flex items-center justify-between">
                  12.4M <Database className="w-3 h-3 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-slate-400">Compliance: <span className="text-emerald-400 font-bold">Res. 95/2022</span></div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 transition-colors">
                Extrair Dados <span className="text-[14px]">→</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log Data Feed */}
      <div className="px-6 pb-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'oklch(85% 0.02 280)' }}>
          <Eye className="w-4 h-4" style={{ color: 'oklch(60% 0.15 280)' }} />
          Log de Integração & Eventos (Audit Trail)
        </h3>
        <div className="rounded-xl border shadow-inner p-1 overflow-hidden" style={{ background: 'oklch(10% 0.02 280)', borderColor: 'oklch(18% 0.04 280)' }}>
          <div className="space-y-0.5">
            {[
              { time: '14:23:45', src: 'G-TRUST', msg: 'Anomalia detectada no PZ-42. Inferência LSTM disparada.', color: 'oklch(65% 0.18 250)' },
              { time: '14:24:12', src: 'LEX-MINING', msg: 'Relatório normativo gerado automaticamente baseado no GISTM.', color: 'oklch(75% 0.15 150)' },
              { time: '14:25:31', src: 'DGM-TWIN', msg: 'Revisão humana solicitada para novo algorítmo iterativo.', color: 'oklch(65% 0.20 295)' },
              { time: '14:30:00', src: 'MOTHER', msg: 'System checkpoint completo. Todos os provedores operacionais.', color: 'oklch(80% 0.02 280)' },
            ].map((e, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2 text-[11px] font-mono hover:bg-white/5 transition-colors rounded-lg">
                <span style={{ color: 'oklch(50% 0.02 280)' }}>[{e.time}]</span>
                <span className="font-bold w-[90px]" style={{ color: e.color }}>{e.src}</span>
                <span style={{ color: 'oklch(75% 0.02 280)' }}>{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Ensure icons used in render are imported or define a proxy icon
const Database = ({className}: {className:string}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>;
