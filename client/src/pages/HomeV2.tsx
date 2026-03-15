/**
 * MOTHER v7 — Interface Nova (Estado da Arte 2025)
 *
 * DIAGNÓSTICO CIENTÍFICO E SOLUÇÃO:
 *
 * PROBLEMAS CORRIGIDOS:
 * 1. renderMarkdown() regex-based → substituído por <Streamdown> (react-markdown + shiki + mermaid)
 *    Causa dos "erros de escrita" e "palavras faltando": regex cru cortava tokens Unicode e puntuação
 * 2. displayBufferRef char-a-char drain → substituído por atualização direta de conteúdo
 *    Causa de truncamentos: batchSize podia cortar mid-word ou mid-multibyte
 * 3. dangerouslySetInnerHTML sem sanitização → eliminado (OWASP XSS)
 *
 * REFERÊNCIAS CIENTÍFICAS:
 * - arXiv:2501.18002 (Jiang et al., 2025): Agentic Workflows for Conversational Human-AI Interaction Design
 * - arXiv:2412.14741 (Dec 2024): Active Inference and Human-Computer Interaction
 * - Nielsen Norman Group (2024): AI Chat Interface Design — 2-column minimal layout
 * - Hick's Law (1952): Reduzir opções visíveis ↓ tempo de decisão
 * - ISO 9241-11:2018: Eficácia + Eficiência + Satisfação
 * - ReAct (Yao et al., arXiv:2210.03629, ICLR 2023): tool calls visíveis
 * - Nielsen (1994) Heuristic #1: Visibility of system status
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Streamdown } from 'streamdown';
import type { MermaidConfig } from 'mermaid';
import {
  Send, Plus, ChevronLeft, ChevronRight, Brain, Shield, Zap, TrendingDown,
  Database, Activity, Dna, Sparkles, GitBranch, Paperclip, Square, BarChart3,
  Cpu, Layers, BookOpen, FlaskConical, Terminal, Radio, Globe, Code2, Network, FolderKanban,
  ExternalLink,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SessionHistory } from '@/components/SessionHistory';
import { FileDropZone } from '@/components/FileDropZone';
import PhaseIndicator, { type Phase, type ActivePhase } from '@/components/PhaseIndicator';
import ToolCallVisualizer, { type ToolCall } from '@/components/ToolCallVisualizer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useNavigate } from 'react-router-dom';

// ─── Mermaid Config ──────────────────────────────────────────────────────────
// Dark theme aligned with MOTHER cyberpunk design system
const MERMAID_CONFIG: MermaidConfig = {
  theme: 'dark',
  themeVariables: {
    primaryColor: '#B026FF',
    primaryTextColor: '#E0B3FF',
    primaryBorderColor: '#00F5FF',
    lineColor: '#00F5FF',
    secondaryColor: '#1a1a2e',
    tertiaryColor: '#0A0E1A',
    background: '#0A0E1A',
    mainBkg: '#1a1a2e',
    nodeBorder: '#B026FF',
    titleColor: '#E0B3FF',
    fontFamily: 'JetBrains Mono, monospace',
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'mother';
  content: string;
  timestamp: Date;
  tier?: string;
  modelName?: string;
  provider?: string;
  queryCategory?: string;
  qualityScore?: number;
  costReduction?: number;
  responseTime?: number;
  cost?: number;
  cacheHit?: boolean;
}

interface SessionStats {
  msgCount: number;
  totalCost: number;
  qualityScores: number[];
  tierCounts: Record<string, number>;
}

// ─── Contextual follow-up chips ───────────────────────────────────────────────
// Scientific basis: Nielsen Norman Group — "AI Chat Interface Design" (2023/2024)
// NN/G: contextual follow-up chips reduce interaction cost vs blank text input
function getFollowUpChips(content: string): string[] {
  const c = content.toLowerCase();
  if (c.includes('arquitetura') || c.includes('camada') || c.includes('layer'))
    return ['Como cada camada interage?', 'Mostre um diagrama', 'Comparar com transformers'];
  if (c.includes('memória') || c.includes('a-mem') || c.includes('zettelkasten'))
    return ['Como a memória evolui?', 'Exemplo de link semântico', 'Qual o limite de memória?'];
  if (c.includes('evolui') || c.includes('darwin') || c.includes('gödel') || c.includes('fitness'))
    return ['Como o fitness é calculado?', 'Frequência de auto-evolução', 'Exemplo de mutação'];
  if (c.includes('shms') || c.includes('sensor') || c.includes('estrutural') || c.includes('lstm'))
    return ['Ver histórico de anomalias', 'Configurar alertas', 'Explicar previsão LSTM'];
  if (c.includes('código') || c.includes('code') || c.includes('implementa') || c.includes('função'))
    return ['Adicionar testes', 'Otimizar performance', 'Explicar o código'];
  if (c.includes('erro') || c.includes('falha') || c.includes('exception') || c.includes('bug'))
    return ['Como reproduzir?', 'Sugerir correção', 'Ver stack trace completo'];
  if (c.includes('custo') || c.includes('cost') || c.includes('token'))
    return ['Como reduzir custo?', 'Ver breakdown por modelo', 'Otimizar prompts'];
  return ['Explique mais', 'Dar um exemplo prático', 'Quais as limitações?'];
}

const QUICK_PROMPTS = [
  { icon: Brain, label: 'Arquitetura cognitiva', query: 'Explique sua arquitetura cognitiva de 7 camadas e como cada uma contribui para o processamento.' },
  { icon: Dna, label: 'Darwin Gödel Machine', query: 'O que é o Darwin Gödel Machine e como ele te permite evoluir e melhorar autonomamente?' },
  { icon: Database, label: 'Memória A-MEM', query: 'Como funciona seu sistema de memória A-MEM com links Zettelkasten e importance scoring?' },
  { icon: BarChart3, label: 'GEA & Fitness', query: 'Explique o sistema GEA (Group-Evolving Agents) e como o fitness score é calculado.' },
  { icon: Sparkles, label: 'Visão final', query: 'Qual é a visão final de MOTHER como superinteligência cognitiva autônoma?' },
];

const SIDEBAR_COMMANDS = [
  { group: 'Diagnóstico', items: [
    { icon: FlaskConical, label: '/audit', desc: 'Auditoria completa do sistema', color: '#a78bfa' },
    { icon: Activity, label: '/status', desc: 'Status em tempo real', color: '#60a5fa' },
  ]},
  { group: 'Evolução DGM', items: [
    { icon: Layers, label: '/proposals', desc: 'Listar propostas DGM', color: '#fbbf24' },
    { icon: Dna, label: '/fitness', desc: 'Score de fitness atual', color: '#34d399' },
  ]},
  { group: 'Conhecimento', items: [
    { icon: BookOpen, label: '/knowledge', desc: 'Base de conhecimento', color: '#f472b6' },
    { icon: Brain, label: '/research', desc: 'Pesquisa científica', color: '#22d3ee' },
  ]},
  { group: 'Fase 5', items: [
    { icon: Terminal, label: '/shell', desc: 'Shell executor remoto', color: '#f97316' },
    { icon: Radio, label: '/sse', desc: 'Streaming SSE hub', color: '#38bdf8' },
    { icon: Globe, label: '/ws', desc: 'WebSocket router', color: '#a78bfa' },
    { icon: Code2, label: '/editor', desc: 'Code editor', color: '#34d399' },
    { icon: Network, label: '/graph', desc: 'Dependency graph', color: '#fb7185' },
    { icon: FolderKanban, label: '/projects', desc: 'Project dashboard', color: '#fbbf24' },
  ]},
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function HomeV2() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState<SessionStats>({ msgCount: 0, totalCost: 0, qualityScores: [], tierCounts: {} });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const streamingMsgIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [fileContext, setFileContext] = useState('');
  const [showDropZone, setShowDropZone] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<ActivePhase | null>(null);
  const phaseStartTimeRef = useRef<number>(0);
  const [phaseLatencyMs, setPhaseLatencyMs] = useState<number>(0);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [streamSpeed, setStreamSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});

  // ─── Server queries ──────────────────────────────────────────────────────────
  const providerHealthQuery = trpc.mother.providerHealth.useQuery(
    { forceRefresh: false },
    { refetchInterval: 5 * 60 * 1000, staleTime: 4 * 60 * 1000 }
  );
  const systemStatsQuery = trpc.mother.stats.useQuery(undefined, {
    refetchInterval: 60 * 1000, staleTime: 30 * 1000,
  });
  const motherVersion = systemStatsQuery.data?.version ?? 'v122.0';

  // ─── SSE Streaming ─────────────────────────────────────────────────────────
  // FIX: Removed char-by-char display buffer drain (causa de palavras cortadas)
  // Agora: conteúdo atualizado diretamente por tokens completos
  // Streamdown handles isAnimating to render incomplete markdown gracefully
  const sendStreamingQuery = useCallback(async (query: string, conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    const msgId = Date.now().toString() + '-mother';
    streamingMsgIdRef.current = msgId;
    setIsStreaming(true);
    setActiveToolCalls([]);
    phaseStartTimeRef.current = Date.now();
    setCurrentPhase('searching');

    setMessages(prev => [...prev, {
      id: msgId,
      role: 'mother',
      content: '',
      timestamp: new Date(),
    }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedText = '';
    // Throttle SSE token re-renders to 50ms intervals
    // FIX (C352): flushRender now reads accumulatedText via closure at fire time, not capture time.
    // Previously captured `text` at schedule time → tokens arriving during 100ms window were lost.
    let pendingRenderFrame: ReturnType<typeof setTimeout> | null = null;
    // streamSpeed: 0.5×=80ms, 1×=50ms, 1.5×=30ms, 2×=0ms (instant)
    const getDelay = () => streamSpeed >= 2 ? 0 : streamSpeed >= 1.5 ? 30 : streamSpeed >= 1 ? 50 : 80;
    const flushRender = () => {
      if (pendingRenderFrame) return;
      const delay = getDelay();
      if (delay === 0) {
        const id = msgId;
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content: accumulatedText } : m));
        return;
      }
      pendingRenderFrame = setTimeout(() => {
        pendingRenderFrame = null;
        const id = msgId;
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content: accumulatedText } : m));
      }, delay);
    };

    try {
      const response = await fetch('/api/mother/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, useCache: true, conversationHistory }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // FIX (C352): lastEvent MUST be outside the while loop.
      // Bug: declaring it inside caused reset on every reader.read() call.
      // When a data: line is split across two TCP chunks, the event: line is in
      // chunk 1 (sets lastEvent='token'), partial data: parse fails → lastEvent=''.
      // In chunk 2, the completed data: line has lastEvent='' → token DROPPED → garbled words.
      let lastEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line === '') { lastEvent = ''; continue; } // blank line = end of SSE event
          if (line.startsWith('event: ')) { lastEvent = line.slice(7).trim(); continue; }
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (lastEvent === 'thinking' && parsed.message) {
                setCurrentPhase('searching');
              } else if (lastEvent === 'progress' && parsed.phase) {
                const phaseMap: Record<string, string> = {
                  routing: 'searching', retrieval: 'searching',
                  generation: 'reasoning', generating: 'reasoning',
                  quality: 'quality_check', grounding: 'writing',
                  cove: 'writing', constitutional: 'quality_check',
                  citation: 'writing', validating: 'quality_check',
                };
                setCurrentPhase((phaseMap[parsed.phase] || 'reasoning') as ActivePhase);
              } else if (lastEvent === 'done' && parsed.total_ms) {
                setPhaseLatencyMs(parsed.total_ms);
              } else if (lastEvent === 'phase' && parsed.phase) {
                setCurrentPhase(parsed.phase as ActivePhase | null);
              } else if (lastEvent === 'tool_call' && parsed.name) {
                const tc: ToolCall = {
                  id: parsed.id || `tc-${Date.now()}`,
                  name: parsed.name, input: parsed.input || {},
                  output: parsed.output, status: parsed.status || 'success',
                  durationMs: parsed.durationMs, timestamp: parsed.timestamp || Date.now(),
                };
                setActiveToolCalls(prev => [...prev.filter(t => t.id !== tc.id), tc]);
              } else if (lastEvent === 'error' && parsed.message) {
                // BUG FIX: Previously error events from backend were silently ignored,
                // causing "Resposta não recebida" instead of showing the actual error.
                accumulatedText = `⚠️ ${parsed.message}`;
                setMessages(prev => prev.map(m => m.id === msgId ? {
                  ...m, content: accumulatedText,
                } : m));
              } else if (lastEvent === 'token' && parsed.text) {
                accumulatedText += parsed.text;
                flushRender();
              } else if (lastEvent === 'response' && parsed.response) {
                setMessages(prev => prev.map(m => m.id === msgId ? {
                  ...m,
                  content: parsed.response || accumulatedText,
                  tier: parsed.tier, modelName: parsed.modelName,
                  provider: parsed.provider, queryCategory: parsed.queryCategory,
                  qualityScore: parsed.quality?.qualityScore,
                  costReduction: parsed.costReduction, responseTime: parsed.responseTime,
                  cost: parsed.cost, cacheHit: parsed.cacheHit,
                } : m));
                setStats(prev => {
                  const newQ = parsed.quality?.qualityScore ? [...prev.qualityScores, parsed.quality.qualityScore] : prev.qualityScores;
                  const newT = { ...prev.tierCounts };
                  if (parsed.tier) newT[parsed.tier] = (newT[parsed.tier] || 0) + 1;
                  return { msgCount: prev.msgCount + 1, totalCost: prev.totalCost + (parsed.cost || 0), qualityScores: newQ, tierCounts: newT };
                });
              }
            } catch { /* skip malformed */ }
            // NOTE: do NOT reset lastEvent here — wait for blank line (proper SSE spec)
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === msgId ? {
          ...m, content: accumulatedText || `Erro: ${(err as Error).message}`,
        } : m));
      }
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === msgId && m.content === ''
          ? { ...m, content: accumulatedText || '⚠️ Resposta não recebida. Tente novamente.' }
          : m
      ));
      setIsStreaming(false);
      setCurrentPhase('complete');
      setPhaseLatencyMs(Date.now() - phaseStartTimeRef.current);
      setTimeout(() => setCurrentPhase(null), 2000);
      setTimeout(() => setActiveToolCalls([]), 5000);
      streamingMsgIdRef.current = null;
      abortControllerRef.current = null;
    }
  }, []);

  // ─── tRPC fallback mutation ──────────────────────────────────────────────────
  const queryMutation = trpc.mother.query.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-mother-trpc',
        role: 'mother',
        content: data.response,
        timestamp: new Date(),
        tier: data.tier, modelName: (data as any).modelName,
        provider: (data as any).provider, queryCategory: (data as any).queryCategory,
        qualityScore: data.quality?.qualityScore, costReduction: data.costReduction,
        responseTime: data.responseTime, cost: data.cost, cacheHit: data.cacheHit,
      }]);
      setStats(prev => {
        const newQ = data.quality?.qualityScore ? [...prev.qualityScores, data.quality.qualityScore] : prev.qualityScores;
        const newT = { ...prev.tierCounts };
        if (data.tier) newT[data.tier] = (newT[data.tier] || 0) + 1;
        return { msgCount: prev.msgCount + 1, totalCost: prev.totalCost + (data.cost || 0), qualityScores: newQ, tierCounts: newT };
      });
    },
    onError: (error) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-err', role: 'mother',
        content: `Erro ao processar: ${error.message}`, timestamp: new Date(),
      }]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const visibleMessages = useMemo(() => messages.filter(msg => {
    if (msg.role === 'mother' && msg.content === '' && isStreaming && msg.id === streamingMsgIdRef.current) return false;
    if (msg.role === 'mother' && msg.content === '') return false;
    return true;
  }), [messages, isStreaming]);

  const buildConversationHistory = useCallback(() =>
    messages.filter(m => m.role === 'user' || m.role === 'mother').slice(-20).map(m => ({
      role: m.role === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })), [messages]);

  const sendMessage = useCallback((text?: string) => {
    const rawQuery = (text || input).trim();
    if (!rawQuery || queryMutation.isPending || isStreaming) return;
    setShowWelcome(false);
    const query = fileContext ? `${rawQuery}\n\n---\n**Contexto dos arquivos anexados:**\n\n${fileContext}` : rawQuery;
    setMessages(prev => [...prev, {
      id: Date.now().toString() + '-user', role: 'user',
      content: rawQuery, timestamp: new Date(),
    }]);
    setInput('');
    if (fileContext) { setFileContext(''); setShowDropZone(false); }
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendStreamingQuery(query, buildConversationHistory());
  }, [input, fileContext, queryMutation.isPending, isStreaming, sendStreamingQuery, buildConversationHistory]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };
  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };
  const stopStreaming = () => { abortControllerRef.current?.abort(); };

  const avgQuality = stats.qualityScores.length > 0
    ? Math.round(stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length) : null;

  const lastModel = messages.filter(m => m.role === 'mother' && m.modelName).slice(-1)[0]?.modelName || null;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'oklch(8% 0.02 280)', color: 'oklch(92% 0.01 280)', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ════════════════ LEFT SIDEBAR ════════════════ */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          width: sidebarOpen ? 260 : 0,
          minWidth: sidebarOpen ? 260 : 0,
          borderRight: '1px solid oklch(20% 0.02 280)',
          background: 'oklch(10% 0.02 280)',
        }}
      >
        {sidebarOpen && (
          <div className="flex flex-col h-full overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(25% 0.02 280) transparent' }}>

            {/* Logo + version */}
            <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'oklch(18% 0.02 280)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))' }}>
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
                onClick={() => { setMessages([]); setShowWelcome(true); setStats({ msgCount: 0, totalCost: 0, qualityScores: [], tierCounts: {} }); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'oklch(58% 0.18 295)', color: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'oklch(65% 0.20 290)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'oklch(58% 0.18 295)')}
              >
                <Plus className="w-4 h-4" />
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
                  { label: 'Modelo', value: lastModel || 'gpt-4o' },
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
                          onClick={() => sendMessage(label)}
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
              {providerHealthQuery.data?.allHealthy && (
                <div className="px-3 pb-2 flex items-center gap-1.5 text-[10px]" style={{ color: 'oklch(72% 0.18 145)' }}>
                  <span>✅</span><span>Todos os 5 provedores saudáveis</span>
                </div>
              )}
              {providerHealthQuery.data && !providerHealthQuery.data.allHealthy && (
                <div className="px-3 pb-2">
                  {providerHealthQuery.data.providers.filter((p: any) => p.status !== 'healthy' && p.status !== 'unconfigured').map((p: any) => (
                    <div key={p.provider} className="flex items-center gap-1 text-[10px]" style={{ color: 'oklch(75% 0.14 70)' }}>
                      <span>{p.status === 'no_credits' ? '💳' : '⚠️'}</span>
                      <span>{p.displayName} — {p.status === 'no_credits' ? 'Sem créditos' : 'Degradado'}</span>
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
                onClick={() => setShowSessionHistory(v => !v)}
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
        )}
      </aside>

      {/* ════════════════ SIDEBAR TOGGLE ════════════════ */}
      <button
        onClick={() => setSidebarOpen(v => !v)}
        className="absolute z-20 top-1/2 -translate-y-1/2 w-5 h-12 flex items-center justify-center rounded-r-lg transition-all"
        style={{
          left: sidebarOpen ? 260 : 0,
          background: 'oklch(18% 0.03 280)',
          border: '1px solid oklch(22% 0.02 280)',
          borderLeft: 'none',
          color: 'oklch(52% 0.02 280)',
        }}
        title={sidebarOpen ? 'Fechar sidebar' : 'Abrir sidebar'}
      >
        {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {/* ════════════════ MAIN CHAT AREA ════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid oklch(15% 0.02 280)', background: 'oklch(9% 0.02 280)' }}>
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white"
                style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))' }}>M</div>
            )}
            <div>
              <h1 className="text-sm font-semibold" style={{ color: 'oklch(92% 0.01 280)' }}>MOTHER — Sistema Cognitivo</h1>
              <p className="text-[11px]" style={{ color: 'oklch(52% 0.02 280)' }}>{motherVersion} · Darwin Gödel Machine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentPhase && (
              <ErrorBoundary componentName="PhaseIndicator">
                <PhaseIndicator phase={currentPhase} latencyMs={phaseLatencyMs} />
              </ErrorBoundary>
            )}
            {activeToolCalls.length > 0 && (
              <ErrorBoundary componentName="ToolCallVisualizer">
                <ToolCallVisualizer toolCalls={activeToolCalls} />
              </ErrorBoundary>
            )}
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'oklch(22% 0.02 280) transparent' }}>
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Welcome screen */}
            {showWelcome && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 py-8">
                <div>
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center font-black text-4xl text-white mx-auto mb-4"
                    style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))' }}>
                    M
                  </div>
                  <h2 className="text-3xl font-bold mb-2" style={{ color: 'oklch(92% 0.01 280)' }}>MOTHER</h2>
                  <p className="text-base" style={{ color: 'oklch(62% 0.02 280)' }}>Sistema Cognitivo Autônomo · Darwin Gödel Machine</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                  {QUICK_PROMPTS.map(({ icon: Icon, label, query }) => (
                    <button key={label}
                      onClick={() => sendMessage(query)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all"
                      style={{
                        background: 'oklch(12% 0.03 285)',
                        border: '1px solid oklch(20% 0.04 285)',
                        color: 'oklch(82% 0.04 280)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'oklch(16% 0.05 285)';
                        e.currentTarget.style.borderColor = 'oklch(45% 0.12 285)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'oklch(12% 0.03 285)';
                        e.currentTarget.style.borderColor = 'oklch(20% 0.04 285)';
                      }}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" style={{ color: 'oklch(68% 0.16 285)' }} />
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs" style={{ color: 'oklch(42% 0.02 280)' }}>
                  Enter para enviar · Shift+Enter para nova linha · Paperclip para arquivos
                </p>
              </div>
            )}

            {/* Message list */}
            {visibleMessages.map((msg, msgIdx) => (
              <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                style={{ animation: 'fadeUp 0.2s ease' }}>

                {/* Avatar */}
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5"
                  style={msg.role === 'mother'
                    ? { background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))', color: 'white' }
                    : { background: 'oklch(22% 0.06 260)', color: 'oklch(72% 0.12 260)' }
                  }>
                  {msg.role === 'mother' ? 'M' : 'U'}
                </div>

                {/* Content */}
                <div className={`flex flex-col gap-2 min-w-0 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                  {msg.role === 'user' ? (
                    <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
                      style={{
                        background: 'oklch(22% 0.06 260)',
                        border: '1px solid oklch(30% 0.08 260)',
                        color: 'oklch(88% 0.02 280)',
                      }}>
                      {msg.content}
                    </div>
                  ) : (
                    // FIX: Streamdown em vez de dangerouslySetInnerHTML com regex
                    // Eliminates: palavras faltando, caracteres cortados, HTML inválido
                    // isAnimating=true durante streaming → streamdown renderiza markdown incompleto graciosamente
                    <div className="prose prose-invert prose-sm max-w-none w-full"
                      style={{ color: 'oklch(88% 0.02 280)' }}>
                      <ErrorBoundary componentName="Streamdown">
                        <Streamdown
                          // Force remount after streaming ends so Mermaid re-renders with full diagram syntax
                          key={isStreaming && msg.id === streamingMsgIdRef.current ? `${msg.id}-streaming` : `${msg.id}-final`}
                          mermaidConfig={MERMAID_CONFIG}
                          isAnimating={isStreaming && msg.id === streamingMsgIdRef.current}
                          parseIncompleteMarkdown={isStreaming && msg.id === streamingMsgIdRef.current}
                          shikiTheme={['github-dark', 'github-dark']}
                          className="text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_code]:text-[13px] [&_pre]:text-[13px] [&_blockquote]:border-l-2 [&_table]:text-sm"
                        >
                          {msg.content}
                        </Streamdown>
                      </ErrorBoundary>
                    </div>
                  )}

                  {/* Streaming indicator */}
                  {msg.role === 'mother' && isStreaming && msg.id === streamingMsgIdRef.current && msg.content === '' && (
                    <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
                      style={{ background: 'oklch(12% 0.02 280)', border: '1px solid oklch(18% 0.02 280)' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                          background: 'oklch(68% 0.16 285)',
                          animation: `bounce 1.4s ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  )}

                  {/* Metrics bar */}
                  {msg.role === 'mother' && msg.tier && (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                        style={{ background: 'oklch(20% 0.06 290)', border: '1px solid oklch(28% 0.08 290)', color: 'oklch(68% 0.16 285)' }}>
                        <Cpu className="w-2.5 h-2.5" />{msg.modelName || msg.tier}
                      </span>
                      {msg.qualityScore !== undefined && (() => {
                        const q = msg.qualityScore!;
                        const c = q >= 80 ? 'oklch(72% 0.18 145)' : q >= 70 ? 'oklch(75% 0.14 70)' : 'oklch(65% 0.22 25)';
                        const bg = q >= 80 ? 'oklch(16% 0.06 145)' : q >= 70 ? 'oklch(16% 0.06 70)' : 'oklch(16% 0.06 25)';
                        const border = q >= 80 ? 'oklch(25% 0.08 145)' : q >= 70 ? 'oklch(25% 0.08 70)' : 'oklch(25% 0.08 25)';
                        return (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                            style={{ background: bg, border: `1px solid ${border}`, color: c }}>
                            <Shield className="w-2.5 h-2.5" />{q >= 80 ? '' : q >= 70 ? '' : '⚠ '}{q}%
                          </span>
                        );
                      })()}
                      {msg.cost !== undefined && (
                        <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'oklch(16% 0.06 70)', border: '1px solid oklch(25% 0.08 70)', color: 'oklch(75% 0.14 70)' }}>
                          <TrendingDown className="w-2.5 h-2.5" />${msg.cost.toFixed(6)}
                        </span>
                      )}
                      {msg.responseTime !== undefined && (
                        <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'oklch(16% 0.06 260)', border: '1px solid oklch(25% 0.08 260)', color: 'oklch(65% 0.14 260)' }}>
                          <Zap className="w-2.5 h-2.5" />{(msg.responseTime / 1000).toFixed(1)}s
                        </span>
                      )}
                      {msg.cacheHit && (
                        <span className="text-[10px] px-2 py-1 rounded-md"
                          style={{ background: 'oklch(20% 0.06 290)', border: '1px solid oklch(28% 0.08 290)', color: 'oklch(68% 0.16 285)' }}>
                          ⚡ Cache
                        </span>
                      )}
                    </div>
                  )}

                  <span className="text-[10px]" style={{ color: 'oklch(38% 0.02 280)' }}>
                    {msg.timestamp.toLocaleTimeString()}
                  </span>

                  {/* Follow-up chips + feedback — last completed MOTHER message only */}
                  {msg.role === 'mother' && msg.content && msgIdx === visibleMessages.length - 1 && !isStreaming && (
                    <div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {getFollowUpChips(msg.content).map(chip => (
                          <button key={chip}
                            onClick={() => sendMessage(chip)}
                            className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                            style={{
                              border: '1px solid oklch(28% 0.08 290)',
                              background: 'oklch(14% 0.04 290)',
                              color: 'oklch(68% 0.16 285)',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'oklch(20% 0.06 290)';
                              e.currentTarget.style.borderColor = 'oklch(45% 0.12 290)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'oklch(14% 0.04 290)';
                              e.currentTarget.style.borderColor = 'oklch(28% 0.08 290)';
                            }}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                      {/* Feedback buttons */}
                      <div className="flex items-center gap-1 mt-1.5">
                        {(['up', 'down'] as const).map(dir => (
                          <button key={dir}
                            onClick={() => setFeedback(f => ({ ...f, [msg.id]: f[msg.id] === dir ? undefined as unknown as 'up' : dir }))}
                            title={dir === 'up' ? 'Boa resposta' : 'Resposta ruim'}
                            style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                              border: `1px solid ${feedback[msg.id] === dir ? (dir === 'up' ? 'oklch(55% 0.18 145)' : 'oklch(55% 0.18 25)') : 'oklch(22% 0.02 280)'}`,
                              background: feedback[msg.id] === dir ? (dir === 'up' ? 'oklch(20% 0.08 145)' : 'oklch(20% 0.08 25)') : 'transparent',
                              color: feedback[msg.id] === dir ? (dir === 'up' ? 'oklch(65% 0.18 145)' : 'oklch(65% 0.18 25)') : 'oklch(38% 0.02 280)',
                              transition: 'all 0.15s',
                            }}>
                            {dir === 'up' ? '👍' : '👎'}
                          </button>
                        ))}
                        {feedback[msg.id] && (
                          <span className="text-[10px] ml-1" style={{ color: 'oklch(50% 0.02 280)' }}>
                            {feedback[msg.id] === 'up' ? 'Obrigado pelo feedback!' : 'Vou melhorar.'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {(queryMutation.isPending || (isStreaming && visibleMessages[visibleMessages.length - 1]?.role === 'user')) && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))' }}>M</div>
                <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
                  style={{ background: 'oklch(12% 0.02 280)', border: '1px solid oklch(18% 0.02 280)' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                      background: 'oklch(68% 0.16 285)',
                      animation: `bounce 1.4s ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── File context indicator ── */}
        {fileContext && (
          <div className="px-6 py-2 flex items-center gap-2 border-t" style={{ borderColor: 'oklch(18% 0.02 280)', background: 'oklch(10% 0.02 280)' }}>
            <Paperclip className="w-3.5 h-3.5" style={{ color: 'oklch(68% 0.16 285)' }} />
            <span className="text-xs" style={{ color: 'oklch(68% 0.02 280)' }}>
              Arquivo(s) anexado(s) · {Math.round(fileContext.length / 1000)}k chars
            </span>
            <button onClick={() => { setFileContext(''); setShowDropZone(false); }}
              className="ml-auto text-xs px-2 py-0.5 rounded"
              style={{ color: 'oklch(62% 0.02 280)', background: 'oklch(18% 0.02 280)' }}>
              Remover
            </button>
          </div>
        )}

        {/* ── Input area ── */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2" style={{ background: 'oklch(9% 0.02 280)' }}>
          <div className="max-w-3xl mx-auto">

            {/* File drop zone */}
            {showDropZone && (
              <div className="mb-2">
                <ErrorBoundary componentName="FileDropZone">
                  <FileDropZone
                    onFilesProcessed={(content: string) => { setFileContext(prev => prev ? `${prev}\n\n${content}` : content); setShowDropZone(false); }}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* Input box */}
            <div className="flex items-end gap-2 px-4 py-3 rounded-2xl"
              style={{
                background: 'oklch(12% 0.02 280)',
                border: '1px solid oklch(22% 0.03 280)',
                boxShadow: '0 0 0 0px oklch(55% 0.18 295)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocusCapture={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = 'oklch(40% 0.12 290)';
                el.style.boxShadow = '0 0 0 2px oklch(30% 0.08 290)';
              }}
              onBlurCapture={e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = 'oklch(22% 0.03 280)';
                el.style.boxShadow = 'none';
              }}
            >
              {/* File attach */}
              <button onClick={() => setShowDropZone(v => !v)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{ color: showDropZone ? 'oklch(68% 0.16 285)' : 'oklch(45% 0.02 280)' }}
                title="Anexar arquivo"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKey}
                placeholder="Pergunte algo à MOTHER..."
                rows={1}
                disabled={queryMutation.isPending}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'oklch(88% 0.02 280)', fontSize: 14, fontFamily: 'inherit',
                  resize: 'none', minHeight: 22, maxHeight: 160, lineHeight: 1.5,
                  padding: 0,
                }}
              />

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isStreaming ? (
                  <button onClick={stopStreaming}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                    style={{ background: 'oklch(40% 0.18 25)', color: 'white' }}
                    title="Parar">
                    <Square className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={() => sendMessage()}
                    disabled={!input.trim() || queryMutation.isPending}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, oklch(55% 0.25 300), oklch(50% 0.22 260))', color: 'white' }}
                    onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'scale(1.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
                    title="Enviar (Enter)"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Speed calibrator (P2: streaming display throttle) */}
            <div className="flex items-center gap-1 mt-2 mb-1">
              <span className="text-[9px] uppercase tracking-wider mr-1" style={{ color: 'oklch(38% 0.02 280)' }}>Vel.:</span>
              {([0.5, 1, 1.5, 2] as const).map(s => (
                <button key={s} onClick={() => setStreamSpeed(s)}
                  title={s === 0.5 ? 'Devagar' : s === 1 ? 'Normal' : s === 1.5 ? 'Rápido' : 'Instantâneo'}
                  style={{
                    padding: '2px 7px', borderRadius: 5, fontSize: '10px', cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.15s',
                    border: `1px solid ${streamSpeed === s ? '#a78bfa' : 'rgba(124,58,237,0.2)'}`,
                    background: streamSpeed === s ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.06)',
                    color: streamSpeed === s ? '#a78bfa' : 'oklch(42% 0.02 280)',
                    fontWeight: streamSpeed === s ? 700 : 400,
                  }}>
                  {s}×
                </button>
              ))}
            </div>

            {/* Bottom status bar */}
            <div className="flex items-center justify-between mt-1 px-1">
              <p className="text-[10px]" style={{ color: 'oklch(38% 0.02 280)' }}>
                Enter para enviar · Shift+Enter nova linha
              </p>
              <div className="flex items-center gap-3 text-[10px]" style={{ color: 'oklch(42% 0.02 280)' }}>
                {stats.msgCount > 0 && <span>{stats.msgCount} msgs · ${stats.totalCost.toFixed(5)}</span>}
                {avgQuality && <span style={{ color: avgQuality >= 80 ? 'oklch(65% 0.18 145)' : 'oklch(65% 0.14 70)' }}>Q:{avgQuality}%</span>}
                {lastModel && <span>{lastModel}</span>}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Animations ── */}
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }
        .prose-invert a { color: oklch(72% 0.14 195) !important; }
        .prose-invert code { color: oklch(80% 0.12 280) !important; background: oklch(16% 0.04 285) !important; border-radius: 4px; padding: 1px 5px; }
        .prose-invert pre { background: oklch(12% 0.02 280) !important; border: 1px solid oklch(20% 0.02 280) !important; border-radius: 12px; }
        .prose-invert strong { color: oklch(88% 0.04 280) !important; }
        .prose-invert h1,.prose-invert h2,.prose-invert h3 { color: oklch(90% 0.03 280) !important; }
        .prose-invert blockquote { border-left-color: oklch(35% 0.08 285) !important; color: oklch(65% 0.02 280) !important; }
        .prose-invert table { border-color: oklch(22% 0.02 280) !important; }
        .prose-invert th { background: oklch(14% 0.02 280) !important; }
        .prose-invert td { border-color: oklch(18% 0.02 280) !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: oklch(22% 0.02 280); border-radius: 4px; }
      `}</style>
    </div>
  );
}
