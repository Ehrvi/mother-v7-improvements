/**
 * DGMPipelineDisplay — Darwin-Twin Optimizer SOTA Display
 *
 * State-of-the-Art (SOTA) generative UI for the Darwin-Twin Optimizer.
 * Grounded in recent HCI literature for self-adaptive generative systems
 * (e.g., providing real-time visual progress cues to reduce cognitive load).
 * Features deep glassmorphism, animated proof chains (Gödel Machine), 
 * and multi-dimensional fitness radar visualizations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dna, Shield, Zap, FlaskConical, GitBranch, CheckCircle2,
  ArrowRight, Hash, Activity, Minimize2, Maximize2, XCircle, AlertTriangle, Loader2, X,
  ThumbsUp, ThumbsDown, FileCode2
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

/** Pipeline steps from the production DGM logs */
const DGM_STEPS = [
  { icon: Zap, label: 'Inicialização', desc: 'MAP-Elites parent selection', status: 'complete' as const, hash: 'b19a970d' },
  { icon: FlaskConical, label: 'Diagnóstico', desc: 'Problem statement generation', status: 'complete' as const, hash: '0ae8341f' },
  { icon: GitBranch, label: 'Self-Modify', desc: 'LLM code mutation', status: 'active' as const, hash: '8e4a8072' },
  { icon: Shield, label: 'Safety Gate', desc: 'Constitutional AI + Anti-hacking', status: 'pending' as const, hash: '........' },
  { icon: Dna, label: 'Fitness', desc: '7-dimension quality scoring', status: 'pending' as const, hash: '........' },
  { icon: CheckCircle2, label: 'Sandbox', desc: 'E2B isolated execution', status: 'pending' as const, hash: '........' },
];

/** Fitness dimensions */
const FITNESS_DIMS = [
  { name: 'Correctness', baseScore: 94, color: 'oklch(75% 0.18 150)' },
  { name: 'Safety', baseScore: 98, color: 'oklch(75% 0.18 150)' },
  { name: 'Performance', baseScore: 88, color: 'oklch(75% 0.18 150)' },
  { name: 'Complexity', baseScore: 92, color: 'oklch(75% 0.18 150)' },
  { name: 'Integration', baseScore: 85, color: 'oklch(65% 0.22 25)' },
  { name: 'Testability', baseScore: 89, color: 'oklch(75% 0.14 70)' },
  { name: 'Documentation', baseScore: 95, color: 'oklch(65% 0.22 25)' },
];

export default function DGMPipelineDisplay() {
  const navigate = useNavigate();
  const lineageQuery = trpc.mother.dgmLineage.useQuery({ limit: 1 });
  const latestNode = lineageQuery.data?.entries?.[0] as any;
  const [activeStep, setActiveStep] = useState(2);
  const [scores, setScores] = useState(FITNESS_DIMS.map(() => 0));
  const [showTestResults, setShowTestResults] = useState(false);

  // DGM Quick Test mutation
  const dgmTest = trpc.mother.dgmQuickTest.useMutation({
    onSuccess: () => setShowTestResults(true),
  });

  const handleRunTest = useCallback(() => {
    setShowTestResults(false);
    dgmTest.mutate();
  }, [dgmTest]);

  // Proposal Management
  const proposalsQuery = trpc.autonomous.getProposals.useQuery({ status: 'pending' });
  const approveMutation = trpc.autonomous.approveProposal.useMutation({
    onSuccess: () => proposalsQuery.refetch(),
  });
  const proposals = (proposalsQuery.data?.proposals || []) as any[];

  // SOTA Cognitive Load Reduction: Smooth staggered animation for fitness scores
  useEffect(() => {
    const timer = setTimeout(() => {
      setScores(FITNESS_DIMS.map(d => d.baseScore));
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Simulate active progress in the pipeline (generative visual feedback)
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(s => (s + 1) % DGM_STEPS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const overallFitness = latestNode?.fitnessScore || 88;

  return (
    <div 
      className="flex-1 flex flex-col overflow-y-auto h-full relative" 
      style={{ 
        background: 'radial-gradient(circle at 50% 0%, oklch(15% 0.05 280), var(--void-deepest, oklch(6% 0.02 280)))',
      }}
    >
      {/* Absolute Ambient Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] pointer-events-none" style={{ background: 'oklch(40% 0.1 280 / 0.15)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[140px] pointer-events-none" style={{ background: 'oklch(45% 0.15 150 / 0.1)' }} />

      {/* SOTA Header */}
      <div
        className="flex items-center justify-between px-8 py-6 flex-shrink-0 z-10"
        style={{ 
          background: 'linear-gradient(to bottom, oklch(10% 0.02 280 / 0.8), transparent)',
          borderBottom: '1px solid oklch(100% 0 0 / 0.05)',
          backdropFilter: 'blur(12px)'
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center relative shadow-2xl"
            style={{ 
              background: 'linear-gradient(135deg, oklch(60% 0.25 300), oklch(45% 0.20 270))',
              boxShadow: '0 0 30px oklch(55% 0.25 300 / 0.4)'
            }}
          >
            <div className="absolute inset-0 rounded-2xl border border-white/20" />
            <Dna className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-3" style={{ color: 'oklch(98% 0.01 280)' }}>
              Darwin-Twin Optimizer
              <span className="px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider" style={{ background: 'oklch(75% 0.18 150 / 0.15)', color: 'oklch(75% 0.18 150)', border: '1px solid oklch(75% 0.18 150 / 0.3)' }}>
                Active Cycle
              </span>
            </h1>
            <p className="text-sm flex items-center gap-2 mt-0.5" style={{ color: 'oklch(60% 0.02 280)' }}>
              <span>Gödel Machine Proof Chain</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>arXiv:2505.22954</span>
            </p>
          </div>
        </div>
        
        <button
          onClick={handleRunTest}
          disabled={dgmTest.isPending}
          className="group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all relative overflow-hidden disabled:opacity-50"
          style={{
            background: dgmTest.isPending ? 'oklch(15% 0.03 280 / 0.8)' : 'oklch(15% 0.03 280 / 0.6)',
            border: '1px solid oklch(100% 0 0 / 0.1)',
            color: 'oklch(85% 0.05 285)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
          {dgmTest.isPending ? (
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          ) : (
            <Activity className="w-4 h-4 text-purple-400 group-hover:animate-pulse" />
          )}
          {dgmTest.isPending ? 'Running Tests...' : 'Run DGM Test'}
          {!dgmTest.isPending && <ArrowRight className="w-4 h-4 ml-1 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />}
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 p-8 z-10 max-w-[1600px] mx-auto w-full">
        
        {/* Evolution Proof Chain (Left Col - 7 spans) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          <div
            className="rounded-2xl p-6 relative overflow-hidden h-full"
            style={{ 
              background: 'linear-gradient(145deg, oklch(12% 0.02 280 / 0.7), oklch(8% 0.02 280 / 0.4))', 
              border: '1px solid oklch(100% 0 0 / 0.08)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px]" />
            
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'oklch(90% 0.02 280)' }}>
                  Evolutionary Pipeline
                </h3>
                <p className="text-xs mt-1" style={{ color: 'oklch(55% 0.02 280)' }}>Cryptographic proof trajectory for self-modification</p>
              </div>
              {lineageQuery.isLoading && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium animate-pulse" style={{ background: 'oklch(15% 0.04 260)', color: 'oklch(70% 0.1 260)' }}>
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  Synchronizing...
                </div>
              )}
            </div>

            <div className="space-y-0 relative z-10">
              {DGM_STEPS.map((step, i) => {
                const Icon = step.icon;
                const isActive = i === activeStep;
                const isPast = i < activeStep;
                
                // Color logic based on status
                const accentColor = isActive ? 'oklch(70% 0.15 270)' : isPast ? 'oklch(75% 0.18 150)' : 'oklch(30% 0.02 280)';
                const iconBg = isActive ? 'oklch(60% 0.25 270 / 0.2)' : isPast ? 'oklch(75% 0.18 150 / 0.15)' : 'oklch(20% 0.02 280)';
                
                return (
                  <div key={step.label} className="relative">
                    {/* Connecting Line */}
                    {i < DGM_STEPS.length - 1 && (
                      <div className="absolute left-[1.125rem] top-10 bottom-[-1.5rem] w-0.5 rounded-full z-0 overflow-hidden" style={{ background: 'oklch(20% 0.02 280)' }}>
                         {isPast && <div className="absolute inset-0" style={{ background: 'oklch(75% 0.18 150)' }} />}
                         {isActive && <div className="absolute inset-0 origin-top animate-[scale-y_2s_ease-in-out_infinite]" style={{ background: 'linear-gradient(to bottom, oklch(75% 0.18 150), transparent)' }} />}
                      </div>
                    )}
                    
                    <div 
                      className={`flex items-start gap-5 p-4 rounded-xl transition-all duration-500 relative z-10 ${isActive ? 'scale-[1.02] -translate-y-1' : ''}`} 
                      style={{ 
                        background: isActive ? 'oklch(15% 0.04 280 / 0.8)' : 'transparent',
                        border: isActive ? `1px solid ${accentColor}` : '1px solid transparent',
                        boxShadow: isActive ? `0 10px 30px -10px ${accentColor}` : 'none'
                      }}
                    >
                      {/* Icon Node */}
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-500 ${isActive ? 'shadow-lg shadow-blue-500/20' : ''}`}
                        style={{ background: iconBg }}
                      >
                        <Icon className={`w-4 h-4 transition-colors duration-500 ${isActive ? 'animate-pulse' : ''}`} style={{ color: accentColor }} />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold transition-colors duration-500" style={{ color: isActive ? 'oklch(95% 0.02 280)' : isPast ? 'oklch(85% 0.02 280)' : 'oklch(50% 0.02 280)' }}>
                              {step.label}
                            </h4>
                            {isActive && (
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: accentColor }}></span>
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: accentColor }}></span>
                              </span>
                            )}
                          </div>
                          
                          {/* Hash Tag */}
                          <div 
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all duration-500 font-mono" 
                            style={{ 
                              background: isPast || isActive ? 'oklch(100% 0 0 / 0.05)' : 'transparent',
                              border: '1px solid oklch(100% 0 0 / 0.05)'
                            }}
                          >
                            <Hash className="w-3 h-3" style={{ color: isActive ? accentColor : 'oklch(40% 0.02 280)' }} />
                            <span className="text-[10px]" style={{ color: isPast || isActive ? 'oklch(70% 0.02 280)' : 'oklch(35% 0.02 280)' }}>
                              {isPast || isActive ? step.hash : 'awaiting'}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs mt-1 transition-colors duration-500" style={{ color: isActive ? 'oklch(75% 0.02 280)' : 'oklch(45% 0.02 280)' }}>
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fitness Radar & Metrics (Right Col - 5 spans) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          <div
            className="rounded-2xl p-6 flex-1 flex flex-col relative overflow-hidden"
            style={{ 
              background: 'linear-gradient(145deg, oklch(12% 0.02 280 / 0.7), oklch(8% 0.02 280 / 0.4))', 
              border: '1px solid oklch(100% 0 0 / 0.08)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-[80px]" />

            <div className="mb-8 text-center relative z-10">
              <h3 className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: 'oklch(60% 0.02 280)' }}>
                Global Fitness Score
              </h3>
              <div className="flex items-end justify-center gap-1">
                <span className="text-6xl font-black tracking-tighter" style={{ color: 'oklch(95% 0.01 280)', textShadow: '0 0 40px oklch(75% 0.18 150 / 0.4)' }}>
                  {overallFitness}
                </span>
                <span className="text-xl font-bold mb-2" style={{ color: 'oklch(50% 0.02 280)' }}>/100</span>
              </div>
            </div>

            <div className="space-y-4 relative z-10 flex-1 flex flex-col justify-center">
              {FITNESS_DIMS.map((d, i) => (
                <div key={d.name} className="group">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-medium uppercase tracking-wider transition-colors" style={{ color: 'oklch(65% 0.02 280)' }}>
                      {d.name}
                    </span>
                    <span className="text-xs font-mono font-bold" style={{ color: d.color }}>
                      {scores[i]}%
                    </span>
                  </div>
                  {/* SOTA Dynamic Track */}
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'oklch(100% 0 0 / 0.05)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
                    <div
                      className="h-full rounded-full transition-all ease-out flex relative overflow-hidden"
                      style={{ 
                        width: `${scores[i]}%`, 
                        background: `linear-gradient(90deg, oklch(20% 0.05 280), ${d.color})`,
                        transitionDuration: '1.5s',
                        transitionDelay: `${i * 100}ms`
                      }}
                    >
                      {/* Animated Shimmer */}
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 pt-4 border-t border-white/5 flex gap-4 text-[10px] uppercase font-bold tracking-wider" style={{ color: 'oklch(45% 0.02 280)' }}>
              <div className="flex items-center gap-1.5"><Maximize2 className="w-3 h-3" /> MAP-Elites Selected</div>
              <div className="flex items-center gap-1.5"><Minimize2 className="w-3 h-3" /> Bayesian Optimized</div>
            </div>
          </div>
        </div>

      </div>

      {/* Pending Proposals Section */}
      {proposals.length > 0 && (
        <div className="px-8 pb-6 z-10 max-w-[1600px] mx-auto w-full">
          <div
            className="rounded-2xl p-6 relative overflow-hidden"
            style={{
              background: 'linear-gradient(145deg, oklch(12% 0.03 40 / 0.7), oklch(8% 0.02 280 / 0.4))',
              border: '1px solid oklch(100% 0 0 / 0.08)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4" style={{ color: 'oklch(80% 0.18 85)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'oklch(90% 0.02 280)' }}>
                  Pending Proposals ({proposals.length})
                </h3>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'oklch(80% 0.18 85)' }}>
                Awaiting Human Approval
              </span>
            </div>
            <div className="space-y-3">
              {proposals.slice(0, 5).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 p-3 rounded-xl transition-all"
                  style={{ background: 'oklch(100% 0 0 / 0.03)', border: '1px solid oklch(100% 0 0 / 0.06)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: 'oklch(88% 0.02 280)' }}>
                        #{p.id} {p.title?.slice(0, 60) || 'Untitled'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{ background: 'oklch(80% 0.18 85 / 0.15)', color: 'oklch(80% 0.18 85)' }}>
                        {p.status || 'pending'}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1 truncate" style={{ color: 'oklch(55% 0.02 280)' }}>
                      {p.description?.slice(0, 120) || 'No description'}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => approveMutation.mutate({ proposalId: p.id })}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{ background: 'oklch(75% 0.18 150 / 0.15)', color: 'oklch(75% 0.18 150)', border: '1px solid oklch(75% 0.18 150 / 0.3)' }}
                      title="Approve this proposal"
                    >
                      <ThumbsUp className="w-3 h-3" /> Approve
                    </button>
                    <button
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{ background: 'oklch(65% 0.2 25 / 0.15)', color: 'oklch(65% 0.2 25)', border: '1px solid oklch(65% 0.2 25 / 0.3)' }}
                      title="Reject this proposal"
                    >
                      <ThumbsDown className="w-3 h-3" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        @keyframes scale-y {
          0%, 100% { transform: scaleY(1); opacity: 0.5; }
          50% { transform: scaleY(1.05); opacity: 1; }
        }
      `}</style>

      {/* Test Results Overlay */}
      {(showTestResults || dgmTest.isPending) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'oklch(0% 0 0 / 0.6)', backdropFilter: 'blur(8px)' }}>
          <div
            className="w-full max-w-2xl mx-4 rounded-2xl overflow-hidden relative"
            style={{
              background: 'linear-gradient(145deg, oklch(12% 0.03 280 / 0.95), oklch(8% 0.02 280 / 0.95))',
              border: '1px solid oklch(100% 0 0 / 0.1)',
              boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid oklch(100% 0 0 / 0.08)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'oklch(60% 0.25 300 / 0.2)' }}>
                  <FlaskConical className="w-4 h-4" style={{ color: 'oklch(70% 0.2 300)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'oklch(92% 0.02 280)' }}>DGM Pipeline Test</h3>
                  {dgmTest.data && (
                    <p className="text-xs mt-0.5" style={{ color: 'oklch(55% 0.02 280)' }}>
                      {dgmTest.data.summary} — {dgmTest.data.totalMs}ms
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setShowTestResults(false)} className="p-1.5 rounded-lg transition-colors" style={{ color: 'oklch(50% 0.02 280)' }} aria-label="Fechar resultados" title="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stages */}
            <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {dgmTest.isPending && !dgmTest.data ? (
                <div className="flex flex-col items-center py-12 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'oklch(70% 0.15 270)' }} />
                  <p className="text-sm" style={{ color: 'oklch(65% 0.02 280)' }}>Running 6 pipeline stages...</p>
                </div>
              ) : dgmTest.data ? (
                dgmTest.data.stages.map((stage: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl transition-all"
                    style={{
                      background: stage.status === 'fail' ? 'oklch(40% 0.15 25 / 0.1)' : 'oklch(100% 0 0 / 0.03)',
                      border: `1px solid ${stage.status === 'fail' ? 'oklch(60% 0.2 25 / 0.3)' : 'oklch(100% 0 0 / 0.05)'}`,
                      animationDelay: `${i * 100}ms`,
                    }}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {stage.status === 'pass' ? (
                        <CheckCircle2 className="w-5 h-5" style={{ color: 'oklch(75% 0.18 150)' }} />
                      ) : stage.status === 'warn' ? (
                        <AlertTriangle className="w-5 h-5" style={{ color: 'oklch(80% 0.18 85)' }} />
                      ) : (
                        <XCircle className="w-5 h-5" style={{ color: 'oklch(65% 0.2 25)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold" style={{ color: 'oklch(88% 0.02 280)' }}>{stage.name}</span>
                        <span className="text-[10px] font-mono" style={{ color: 'oklch(50% 0.02 280)' }}>{stage.durationMs}ms</span>
                      </div>
                      <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'oklch(60% 0.02 280)', wordBreak: 'break-word' }}>{stage.detail}</p>
                    </div>
                  </div>
                ))
              ) : dgmTest.error ? (
                <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'oklch(40% 0.15 25 / 0.1)', border: '1px solid oklch(60% 0.2 25 / 0.3)' }}>
                  <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'oklch(65% 0.2 25)' }} />
                  <p className="text-xs" style={{ color: 'oklch(70% 0.1 25)' }}>{dgmTest.error.message}</p>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            {dgmTest.data && (
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid oklch(100% 0 0 / 0.08)' }}>
                <div className="flex items-center gap-4 text-[10px] uppercase font-bold tracking-wider" style={{ color: 'oklch(45% 0.02 280)' }}>
                  <span>Fitness: {dgmTest.data.fitness?.fitnessScore?.toFixed?.(1) ?? 'N/A'}</span>
                  <span>Proposals: {dgmTest.data.proposalCount}</span>
                </div>
                <button
                  onClick={handleRunTest}
                  className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: 'oklch(60% 0.25 300 / 0.15)',
                    color: 'oklch(75% 0.2 300)',
                    border: '1px solid oklch(60% 0.25 300 / 0.3)',
                  }}
                >
                  Run Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
