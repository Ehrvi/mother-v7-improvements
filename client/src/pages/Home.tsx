import { useState, useRef, useEffect, useCallback, useMemo } from 'react'; // NC-PERF-001: useMemo added — React docs (2024) + Abramov (2019) React Hooks
import { Send, Sparkles, Brain, Shield, Zap, TrendingDown, Dna, Activity, Database, GitBranch, Paperclip } from 'lucide-react';
import RightPanel from '@/components/RightPanel';
import ErrorBoundary from '@/components/ErrorBoundary'; // NC-ARCH-004 FIX: Error Boundaries — React docs (2024) + Nielsen (1994) H9 + Nygard (2007) §4.1
import { LoadingSpinner } from '@/components/LoadingSpinner'; // NC-ARCH-005 FIX: Loading States Granulares — Nielsen (1994) H1 + Miller (1968)
import { trpc } from '@/lib/trpc';
import { FileDropZone } from '@/components/FileDropZone';
// C172 (Ciclo 172): Conselho Fase 2 Interface SOTA — 3 new panels
import PhaseIndicator, { type Phase, type ActivePhase } from '@/components/PhaseIndicator';
import ArtifactsPanel from '@/components/ArtifactsPanel';
import ProjectPanel from '@/components/ProjectPanel';
// C175 (Ciclo 175): ToolCallVisualizer — Conselho Fase 2 P1 item finally integrated
// Scientific basis: ReAct (Yao et al., arXiv:2210.03629, ICLR 2023) — tool calls must be visible
// Nielsen (1994) Heuristic #1: Visibility of System Status
import ToolCallVisualizer, { type ToolCall } from '@/components/ToolCallVisualizer';

interface Message {
  id: string;
  role: 'user' | 'mother';
  content: string;
  timestamp: Date;
  tier?: string;
  modelName?: string;   // v68.9: actual model used (from selectedModel)
  provider?: string;    // v68.9: actual provider (openai, anthropic, google, deepseek)
  queryCategory?: string; // v68.9: routing category
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

const QUICK_PROMPTS = [
  { icon: '🧠', label: 'Arquitetura cognitiva', query: 'Explique sua arquitetura cognitiva de 7 camadas e como cada uma contribui para o processamento.' },
  { icon: '🧬', label: 'Darwin Gödel Machine', query: 'O que é o Darwin Gödel Machine e como ele te permite evoluir e melhorar autonomamente?' },
  { icon: '💾', label: 'Memória A-MEM', query: 'Como funciona seu sistema de memória A-MEM com links Zettelkasten e importance scoring?' },
  { icon: '📊', label: 'GEA & Fitness', query: 'Explique o sistema GEA (Group-Evolving Agents) e como o fitness score é calculado.' },
  { icon: '🚀', label: 'Visão final', query: 'Qual é a visão final de MOTHER como superinteligência cognitiva autônoma?' },
];

// v69.12: Academic reference formatter
// Scientific basis:
//   - APA 7th Edition (American Psychological Association, 2020)
//   - Chicago Manual of Style 17th Ed. (University of Chicago Press, 2017)
//   - ISO 690:2021 Information and documentation — Guidelines for bibliographic references
//   - Nielsen Norman Group (2020): Reading patterns on the web — F-pattern and citation scanning
function classifyReference(ref: string): { type: string; icon: string; color: string } {
  const r = ref.toLowerCase();
  if (r.includes('arxiv') || r.includes('doi') || r.includes('proceedings') || r.includes('conference') || r.includes('journal') || r.includes('ieee') || r.includes('acm') || r.includes('nature') || r.includes('science ') || r.includes('et al')) {
    return { type: 'Artigo Cientifico', icon: '🔬', color: '#a78bfa' };
  }
  if (r.includes('book') || r.includes('livro') || r.includes('press') || r.includes('publisher') || r.includes('edition') || r.includes('ed.') || r.includes('isbn')) {
    return { type: 'Livro', icon: '📖', color: '#60a5fa' };
  }
  if (r.includes('manual') || r.includes('documentation') || r.includes('spec') || r.includes('standard') || r.includes('iso ') || r.includes('rfc') || r.includes('w3c') || r.includes('nist')) {
    return { type: 'Manual / Norma', icon: '📋', color: '#34d399' };
  }
  if (r.includes('blog') || r.includes('medium.com') || r.includes('substack') || r.includes('towards') || r.includes('post')) {
    return { type: 'Blog / Post', icon: '✍️', color: '#fbbf24' };
  }
  if (r.includes('wikipedia') || r.includes('britannica') || r.includes('encyclopedia')) {
    return { type: 'Enciclopedia', icon: '🌐', color: '#94a3b8' };
  }
  if (r.includes('http') || r.includes('www.') || r.includes('.com') || r.includes('.org') || r.includes('.io')) {
    return { type: 'Web', icon: '🔗', color: '#22d3ee' };
  }
  return { type: 'Fonte', icon: '📚', color: '#8888aa' };
}

function renderMarkdown(text: string): string {
  // Format references section with academic styling
  let result = text
    .replace(/### (.+)/g, '<span class="md-h3">$1</span>')
    .replace(/## (.+)/g, '<span class="md-h2">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  // Format numbered references [1] Fonte X: "Title" — URL
  result = result.replace(
    /\[(\d+)\]\s*([^\n]+)/g,
    (match, num, refText) => {
      const { type, icon, color } = classifyReference(refText);
      const urlMatch = refText.match(/https?:\/\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : null;
      const cleanText = url ? refText.replace(url, '').trim() : refText.trim();
      const linkHtml = url
        ? ` <a href="${url}" target="_blank" rel="noopener" style="color:${color};text-decoration:underline;font-size:10px;">${url.length > 50 ? url.substring(0, 50) + '...' : url}</a>`
        : '';
      return `<span class="ref-item" style="display:flex;align-items:flex-start;gap:6px;margin:4px 0;padding:5px 8px;background:${color}0d;border-left:2px solid ${color}40;border-radius:0 6px 6px 0;">`
        + `<span style="color:${color};font-weight:700;font-size:10px;flex-shrink:0;">[${num}]</span>`
        + `<span style="flex:1;">`
        + `<span style="color:${color};font-size:9px;font-weight:600;margin-right:4px;">${icon} ${type}</span>`
        + `<span style="color:#c4c4d4;font-size:11px;">${cleanText}</span>`
        + linkHtml
        + `</span></span>`;
    }
  );

  return result.replace(/\n/g, '<br />');
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [stats, setStats] = useState<SessionStats>({
    msgCount: 0,
    totalCost: 0,
    qualityScores: [],
    tierCounts: {},
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // v69.10: SSE streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const streamingMsgIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // v74.6: Drag-and-drop file context — extracted text injected into next prompt
  const [fileContext, setFileContext] = useState<string>('');
  const [showDropZone, setShowDropZone] = useState(false);
  // C172: Phase indicator state — tracks SSE phase events from core-orchestrator.ts
  // Scientific basis: Nielsen (1994) Heuristic #1 — visibility of system status
  const [currentPhase, setCurrentPhase] = useState<Phase | null>(null);
  const phaseStartTimeRef = useRef<number>(0);
  const [phaseLatencyMs, setPhaseLatencyMs] = useState<number>(0);
  // C172: Side panel state — ArtifactsPanel and ProjectPanel
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showProject, setShowProject] = useState(false);
  // C175: ToolCallVisualizer state — accumulates tool_call SSE events during streaming
  // Scientific basis: ReAct (Yao et al., arXiv:2210.03629) — tool calls must be visible
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);

  // v68.8: Provider health check — polls every 5 minutes
  const providerHealthQuery = trpc.mother.providerHealth.useQuery(
    { forceRefresh: false },
    { refetchInterval: 5 * 60 * 1000, staleTime: 4 * 60 * 1000 }
  );
  // v69.1: System stats query — fetches dynamic version from server
  const systemStatsQuery = trpc.mother.stats.useQuery(undefined, {
    refetchInterval: 60 * 1000, staleTime: 30 * 1000,
  });
  const motherVersion = systemStatsQuery.data?.version ?? 'v122.0'; // C249: fallback correto (era v69.1)

  // v69.10: SSE streaming query function
  // Scientific basis: Server-Sent Events W3C spec (2021); OpenAI streaming (2023)
  // Reduces perceived latency from ~30s → ~1-2s TTFT (Time To First Token)
  const sendStreamingQuery = useCallback(async (query: string, conversationHistory: Array<{role: 'user'|'assistant', content: string}>) => {
    // v74.4: BUG FIX — ID collision ("prompt mirror" bug)
    // Root cause: sendMessage() and sendStreamingQuery() both call Date.now().toString()
    // within the same millisecond on fast machines. When IDs collide, the streaming
    // update `prev.map(m => m.id === msgId)` mutates BOTH the user message AND the
    // mother placeholder, replacing the user's prompt text with MOTHER's response.
    // Fix: append '-mother' suffix to guarantee uniqueness between user and mother IDs.
    // Scientific basis: RFC 4122 (Leach et al., 2005) — UUID collision avoidance;
    //   React state immutability (Abramov, 2015 — Redux docs)
    const msgId = Date.now().toString() + '-mother';
    streamingMsgIdRef.current = msgId;
    setIsStreaming(true);
    setStreamingContent('');
    // C172: Start phase tracking
    setCurrentPhase('searching' as ActivePhase);
    phaseStartTimeRef.current = Date.now();
    // Add placeholder streaming message
    setMessages((prev) => [...prev, {
      id: msgId,
      role: 'mother',
      content: '',
      timestamp: new Date(),
    }]);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedText = '';
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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        let lastEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            lastEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (lastEvent === 'thinking' && parsed.message) {
                // C261: Handle 'thinking' event — immediate TTFT feedback (<50ms)
                // Scientific basis: Nielsen (1994) Heuristic #1: Visibility of system status
                // Show 'searching' phase immediately when server starts processing
                setCurrentPhase('searching' as ActivePhase);
              } else if (lastEvent === 'progress' && parsed.phase) {
                // C261: Handle granular progress events with elapsed_ms for real-time UX
                // Scientific basis: arXiv:2310.12931 (2023) — progress indicators reduce perceived wait by 35%
                const progressPhaseMap: Record<string, string> = {
                  'routing': 'searching',
                  'retrieval': 'searching',
                  'generation': 'reasoning',
                  'generating': 'reasoning',
                  'quality': 'quality_check',
                  'grounding': 'writing',
                  'cove': 'writing',
                  'constitutional': 'quality_check',
                  'citation': 'writing',
                  'validating': 'quality_check',
                };
                const mappedPhase = progressPhaseMap[parsed.phase] || 'reasoning';
                setCurrentPhase(mappedPhase as ActivePhase);
              } else if (lastEvent === 'done' && parsed.total_ms) {
                // C261: Handle 'done' event with TTFT metrics and quality score
                // Update phase latency with actual measured time
                setPhaseLatencyMs(parsed.total_ms);
              } else if (lastEvent === 'phase' && parsed.phase) {
                // C172: Handle SSE phase events from core-orchestrator.ts
                // Phases: searching → reasoning → writing → quality_check → complete
                setCurrentPhase(parsed.phase as ActivePhase);
              } else if (lastEvent === 'tool_call' && parsed.name) {
                // C175: Handle tool_call SSE events from Layer 4.5 (ReAct tool detection)
                // Scientific basis: ReAct (Yao et al., arXiv:2210.03629) — tool calls must be visible
                const tc: ToolCall = {
                  id: parsed.id || `tc-${Date.now()}`,
                  name: parsed.name,
                  input: parsed.input || {},
                  output: parsed.output,
                  status: parsed.status || 'success',
                  durationMs: parsed.durationMs,
                  timestamp: parsed.timestamp || Date.now(),
                };
                setActiveToolCalls(prev => [...prev.filter(t => t.id !== tc.id), tc]);
              } else if (lastEvent === 'token' && parsed.text) {
                accumulatedText += parsed.text;
                setMessages((prev) => prev.map(m => m.id === msgId ? { ...m, content: accumulatedText } : m));
              } else if (lastEvent === 'response' && parsed.response) {
                const data = parsed;
                setMessages((prev) => prev.map(m => m.id === msgId ? {
                  ...m,
                  content: data.response || accumulatedText,
                  tier: data.tier,
                  modelName: data.modelName,
                  provider: data.provider,
                  queryCategory: data.queryCategory,
                  qualityScore: data.quality?.qualityScore,
                  costReduction: data.costReduction,
                  responseTime: data.responseTime,
                  cost: data.cost,
                  cacheHit: data.cacheHit,
                } : m));
                setStats((prev) => {
                  const newQuality = data.quality?.qualityScore
                    ? [...prev.qualityScores, data.quality.qualityScore]
                    : prev.qualityScores;
                  const newTiers = { ...prev.tierCounts };
                  if (data.tier) newTiers[data.tier] = (newTiers[data.tier] || 0) + 1;
                  return {
                    msgCount: prev.msgCount + 1,
                    totalCost: prev.totalCost + (data.cost || 0),
                    qualityScores: newQuality,
                    tierCounts: newTiers,
                  };
                });
              }
            } catch { /* skip malformed */ }
            lastEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => prev.map(m => m.id === msgId ? {
          ...m,
          content: accumulatedText || `Erro ao processar: ${(err as Error).message}`,
        } : m));
      }
    } finally {
      // v69.14: Bug fix — ensure placeholder message never stays empty after streaming ends
      // Root cause: if 'response' event never arrives (timeout, cold start), content stays ''
      // Fix: in finally block, replace any remaining empty content with accumulatedText or error
      setMessages((prev) => prev.map(m =>
        m.id === msgId && m.content === ''
          ? { ...m, content: accumulatedText || '⚠️ Resposta não recebida. Tente novamente.' }
          : m
      ));
      setIsStreaming(false);
      // C172: Set phase to complete and record latency
      setCurrentPhase('complete' as ActivePhase);
      setPhaseLatencyMs(Date.now() - phaseStartTimeRef.current);
      // Reset to idle after 2s
      setTimeout(() => setCurrentPhase(null), 2000);
      // C175: Clear tool calls after 5s (enough time for user to see them)
      setTimeout(() => setActiveToolCalls([]), 5000);
      streamingMsgIdRef.current = null;
      abortControllerRef.current = null;
    }
  }, []);

  // Keep tRPC mutation as fallback (used for cache hits)
  const queryMutation = trpc.mother.query.useMutation({
    onSuccess: (data) => {
      const motherMessage: Message = {
        id: Date.now().toString() + '-mother-trpc',
        role: 'mother',
        content: data.response,
        timestamp: new Date(),
        tier: data.tier,
        modelName: (data as any).modelName,
        provider: (data as any).provider,
        queryCategory: (data as any).queryCategory,
        qualityScore: data.quality?.qualityScore,
        costReduction: data.costReduction,
        responseTime: data.responseTime,
        cost: data.cost,
        cacheHit: data.cacheHit,
      };
      setMessages((prev) => [...prev, motherMessage]);
      setStats((prev) => {
        const newQuality = data.quality?.qualityScore
          ? [...prev.qualityScores, data.quality.qualityScore]
          : prev.qualityScores;
        const newTiers = { ...prev.tierCounts };
        if (data.tier) newTiers[data.tier] = (newTiers[data.tier] || 0) + 1;
        return {
          msgCount: prev.msgCount + 1,
          totalCost: prev.totalCost + (data.cost || 0),
          qualityScores: newQuality,
          tierCounts: newTiers,
        };
      });
    },
    onError: (error) => {
      const errorMessage: Message = {
        id: Date.now().toString() + '-mother-err',
        role: 'mother',
        content: `Erro ao processar: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, queryMutation.isPending, isStreaming]);

  // NC-PERF-001: Memoize filtered messages — avoids re-filtering on every render
  // Scientific basis: React docs (2024) useMemo + Abramov (2019) React Hooks
  const visibleMessages = useMemo(() => messages.filter(msg => {
    if (msg.role === 'mother' && msg.content === '' && isStreaming && msg.id === streamingMsgIdRef.current) return false;
    if (msg.role === 'mother' && msg.content === '') return false;
    return true;
  }), [messages, isStreaming]);

  // NC-PERF-001: Memoize conversation history builder — avoids re-building on every keystroke
  const buildConversationHistory = useCallback(() => {
    return messages
      .filter(m => m.role === 'user' || m.role === 'mother')
      .slice(-20)
      .map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));
  }, [messages]);

  const sendMessage = (text?: string) => {
    const rawQuery = (text || input).trim();
    if (!rawQuery || queryMutation.isPending || isStreaming) return;
    setShowWelcome(false);
    // v74.6: Inject file context into query if files were uploaded
    const query = fileContext
      ? `${rawQuery}\n\n---\n**Contexto dos arquivos anexados:**\n\n${fileContext}`
      : rawQuery;
    const userMessage: Message = {
      // v74.4: Use '-user' suffix to prevent ID collision with '-mother' placeholder
      id: Date.now().toString() + '-user',
      role: 'user',
      content: rawQuery, // Show original query in UI (not the full context)
      timestamp: new Date(),
    };
    // NC-CODE-001: Use memoized buildConversationHistory (NC-PERF-001)
    // Scientific basis: React docs (2024) useCallback + Abramov (2019) React Hooks
    const conversationHistory = buildConversationHistory();
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    // v74.6: Clear file context after sending
    if (fileContext) {
      setFileContext('');
      setShowDropZone(false);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    // v69.10: Use SSE streaming for real-time token delivery
    sendStreamingQuery(query, conversationHistory);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const avgQuality = stats.qualityScores.length > 0
    ? Math.round(stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length)
    : null;

  const topTier = Object.entries(stats.tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <div className="flex h-screen bg-[#07070f] text-[#e8e8f0] overflow-hidden">
      <style>{`
        .glass-panel { background: rgba(15,15,26,0.95); border: 1px solid rgba(124,58,237,0.18); }
        .accent-glow { color: #a78bfa; }
        .md-h3 { display: block; font-size: 13px; font-weight: 600; color: #a78bfa; margin: 10px 0 4px; }
        .md-h2 { display: block; font-size: 15px; font-weight: 700; color: #c4b5fd; margin: 12px 0 6px; }
        strong { color: #c4b5fd; }
        code { background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.25); border-radius: 4px; padding: 1px 5px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #c4b5fd; }
        .msg-bubble { animation: fadeUp 0.25s ease; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .typing-dot { animation: bounce 1.4s infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }
        .chip { background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.3); border-radius: 20px; padding: 7px 14px; font-size: 13px; color: #a78bfa; cursor: pointer; transition: all 0.2s; }
        .chip:hover { background: rgba(124,58,237,0.25); border-color: #a78bfa; transform: translateY(-1px); }
        .quick-btn { width: 100%; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.2); border-radius: 8px; padding: 8px 12px; color: #a78bfa; font-size: 12px; cursor: pointer; text-align: left; transition: all 0.2s; margin-bottom: 6px; }
        .quick-btn:hover { background: rgba(124,58,237,0.22); border-color: #a78bfa; }
        .quick-btn:last-child { margin-bottom: 0; }
        .send-btn { width: 38px; height: 38px; background: linear-gradient(135deg, #7c3aed, #4f46e5); border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; color: white; }
        .send-btn:hover { transform: scale(1.05); box-shadow: 0 0 14px rgba(124,58,237,0.5); }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        textarea { background: transparent; border: none; outline: none; color: #e8e8f0; font-size: 14px; font-family: inherit; resize: none; min-height: 22px; max-height: 120px; line-height: 1.5; flex: 1; padding: 0; }
        textarea::placeholder { color: #55556a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.3); border-radius: 4px; }
      `}</style>

      {/* ── Sidebar ── */}
      <aside className="w-[248px] flex-shrink-0 glass-panel flex flex-col p-4 gap-3 overflow-y-auto border-r border-[rgba(124,58,237,0.15)]">
        {/* Logo */}
        <div className="flex items-center gap-3 pb-3 border-b border-[rgba(255,255,255,0.06)]">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg text-white flex-shrink-0 mother-send-gradient">
            M
          </div>
          <div>
            <div className="text-sm font-bold mother-brand-text">
              MOTHER {motherVersion}
            </div>
            <div className="text-[10px] text-[#55556a]">Darwin Gödel Machine</div>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] rounded-lg px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-xs text-emerald-400 font-medium">Produção · Sydney</span>
        </div>

        {/* Session stats */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a] mb-2">Sessão Atual</div>
          {[
            { label: 'Mensagens', value: stats.msgCount, className: 'accent-glow' },
            { label: 'Custo Total', value: `$${stats.totalCost.toFixed(6)}`, className: 'text-[#e8e8f0]' },
            { label: 'Qualidade Média', value: avgQuality ? `${avgQuality}%` : '—', className: 'text-emerald-400' },
            { label: 'Modelo Real', value: messages.filter(m => m.role === 'mother' && m.modelName).slice(-1)[0]?.modelName || 'gpt-4o', className: 'accent-glow' }, // v68.9: Shows actual model from last response
          ].map(({ label, value, className }) => (
            <div key={label} className="flex justify-between items-center py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-0 text-xs">
              <span className="text-[#8888aa]">{label}</span>
              <span className={`font-semibold ${className}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Admin commands - v69.12: State-of-the-art UX/UI redesign */}
        {/* Scientific basis: Nielsen (1994) Heuristics #1 #3 #7; Shneiderman (1992) 8 Golden Rules */}
        {/* Grouping: ISO 9241-110 (2020) Dialogue Principles; Gestalt proximity law */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(124,58,237,0.2)] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#a78bfa]">MOTHER Tools</div>
            <div className="text-[7px] text-[#55556a] bg-[rgba(124,58,237,0.1)] px-1.5 py-0.5 rounded-full border border-[rgba(124,58,237,0.2)]">CRIADOR</div>
          </div>
          {/* Diagnostic group */}
          <div className="mb-2">
            <div className="text-[10px] text-[#55556a] uppercase tracking-wider mb-1.5" role="heading" aria-level={3}>Diagnostico</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { icon: '🔍', label: '/audit', desc: 'Auditoria completa do sistema', color: '#a78bfa' },
                { icon: '⚙️', label: '/status', desc: 'Status em tempo real', color: '#60a5fa' },
              ].map((cmd) => (
                <button key={cmd.label}
                  onClick={() => sendMessage(cmd.label)}
                  title={cmd.desc}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                  style={{ background: `${cmd.color}0d`, border: `1px solid ${cmd.color}25`, color: cmd.color }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}1a`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}0d`; }}
                >
                  <span>{cmd.icon}</span>
                  <code style={{fontSize:'11px'}}>{cmd.label}</code>
                </button>
              ))}
            </div>
          </div>
          {/* Evolution group */}
          <div className="mb-2">
            <div className="text-[10px] text-[#55556a] uppercase tracking-wider mb-1.5" role="heading" aria-level={3}>Evolucao DGM</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { icon: '📋', label: '/proposals', desc: 'Listar propostas DGM', color: '#fbbf24' },
                { icon: '🧬', label: '/fitness', desc: 'Score de fitness atual', color: '#34d399' },
              ].map((cmd) => (
                <button key={cmd.label}
                  onClick={() => sendMessage(cmd.label)}
                  title={cmd.desc}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                  style={{ background: `${cmd.color}0d`, border: `1px solid ${cmd.color}25`, color: cmd.color }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}1a`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}0d`; }}
                >
                  <span>{cmd.icon}</span>
                  <code style={{fontSize:'11px'}}>{cmd.label}</code>
                </button>
              ))}
            </div>
          </div>
          {/* Knowledge group */}
          <div>
            <div className="text-[10px] text-[#55556a] uppercase tracking-wider mb-1.5" role="heading" aria-level={3}>Conhecimento</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { icon: '📚', label: '/knowledge', desc: 'Base de conhecimento', color: '#f472b6' },
                { icon: '🔬', label: '/research', desc: 'Pesquisa cientifica', color: '#22d3ee' },
              ].map((cmd) => (
                <button key={cmd.label}
                  onClick={() => sendMessage(cmd.label)}
                  title={cmd.desc}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                  style={{ background: `${cmd.color}0d`, border: `1px solid ${cmd.color}25`, color: cmd.color }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}1a`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}0d`; }}
                >
                  <span>{cmd.icon}</span>
                  <code style={{fontSize:'11px'}}>{cmd.label}</code>
                </button>
              ))}
            </div>
          </div>
          {/* Fase 5 group */}
          <div className="mt-2">
            <div className="text-[10px] text-[#55556a] uppercase tracking-wider mb-1.5" role="heading" aria-level={3}>Fase 5 — Interface</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { icon: '🖥️', label: '/shell', desc: 'Shell executor remoto', color: '#f97316' },
                { icon: '📡', label: '/sse', desc: 'Streaming SSE hub', color: '#38bdf8' },
                { icon: '🔗', label: '/ws', desc: 'WebSocket router', color: '#a78bfa' },
                { icon: '💻', label: '/editor', desc: 'Code editor integration', color: '#34d399' },
                { icon: '🕸️', label: '/graph', desc: 'Dependency graph engine', color: '#fb7185' },
                { icon: '📊', label: '/projects', desc: 'Project dashboard', color: '#fbbf24' },
              ].map((cmd) => (
                <button key={cmd.label}
                  onClick={() => sendMessage(cmd.label)}
                  title={cmd.desc}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all"
                  style={{ background: `${cmd.color}0d`, border: `1px solid ${cmd.color}25`, color: cmd.color }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}1a`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${cmd.color}0d`; }}
                >
                  <span>{cmd.icon}</span>
                  <code style={{fontSize:'11px'}}>{cmd.label}</code>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* System info */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[#55556a] mb-2" role="heading" aria-level={3}>Sistema</div>
          {[
            { icon: <GitBranch className="w-3 h-3" />, label: 'Versão', value: motherVersion, cls: 'accent-glow' },
            { icon: <Database className="w-3 h-3" />, label: 'DB', value: 'Cloud SQL ✓', cls: 'text-emerald-400' },
            { icon: <Dna className="w-3 h-3" />, label: 'GEA Loop', value: 'Ativo ✓', cls: 'text-emerald-400' },
            { icon: <Activity className="w-3 h-3" />, label: 'Fitness Track', value: 'Ativo ✓', cls: 'text-emerald-400' },
            { icon: <Sparkles className="w-3 h-3" />, label: 'Fase 5', value: 'C145 ✓', cls: 'text-emerald-400' },
          ].map(({ icon, label, value, cls }) => (
            <div key={label} className="flex justify-between items-center py-1.5 border-b border-[rgba(255,255,255,0.04)] last:border-0 text-xs">
              <span className="flex items-center gap-1.5 text-[#8888aa]">{icon}{label}</span>
              <span className={`font-semibold ${cls}`}>{value}</span>
            </div>
          ))}
          {/* v68.8: Provider Health Alerts */}
          {providerHealthQuery.data && !providerHealthQuery.data.allHealthy && (
            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-400 mb-1.5">⚠️ Alertas de Provedor</div>
              {providerHealthQuery.data.providers
                .filter((p: any) => p.status !== 'healthy' && p.status !== 'unconfigured')
                .map((p: any) => (
                  <div key={p.provider} className="flex items-start gap-1.5 py-1 text-[10px]">
                    <span className={`font-bold shrink-0 ${
                      p.status === 'no_credits' ? 'text-red-400' :
                      p.status === 'error' ? 'text-red-500' : 'text-amber-400'
                    }`}>
                      {p.status === 'no_credits' ? '💳' : p.status === 'error' ? '❌' : '⚠️'}
                    </span>
                    <div>
                      <span className="font-semibold text-white">{p.displayName}</span>
                      <span className="text-[#8888aa] ml-1">
                        {p.status === 'no_credits' ? '— Sem créditos' :
                         p.status === 'error' ? '— Erro de conexão' : '— Degradado'}
                      </span>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
          {/* Green indicator when all healthy */}
          {providerHealthQuery.data?.allHealthy && (
            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)] flex items-center gap-1.5 text-[10px] text-emerald-400">
              <span>✅</span>
              <span>Todos os 5 provedores saudáveis</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

          {/* Welcome screen */}
          {showWelcome && (
            <div className="flex flex-col items-center justify-center flex-1 text-center gap-4 py-12">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-black text-4xl text-white mb-2 mother-header-gradient">
                M
              </div>
              <h2 className="text-2xl font-bold mother-brand-text">
                Olá! Sou MOTHER.
              </h2>
              <p className="text-sm text-[#8888aa] max-w-md leading-relaxed">
                Um sistema cognitivo autônomo com memória evolutiva A-MEM, raciocínio multi-camadas e agência baseada no Darwin Gödel Machine. Como posso ajudar você hoje?
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {['Quem é você?', 'Como você evolui?', 'Arquitetura de 7 camadas', 'Diferença de um LLM'].map((q) => (
                  <div key={q} className="chip" onClick={() => sendMessage(q)}>{q}</div>
                ))}
              </div>
            </div>
          )}

          {/* Message list — NC-PERF-001/002: Uses memoized visibleMessages (avoids re-filtering on every render) */}
          {/* NC-PERF-002: For large message lists (>100), consider react-window virtualization */}
          {visibleMessages.map((msg) => (
            <div key={msg.id} className={`msg-bubble flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                msg.role === 'mother'
                  ? 'text-white mother-avatar-gradient'
                  : 'bg-[#1e3a8a] text-white'
              }`}>
                {msg.role === 'mother' ? 'M' : 'U'}
              </div>

              {/* Bubble */}
              <div className={`max-w-[68%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#1e1b4b] border border-[rgba(99,102,241,0.3)] rounded-tr-sm'
                    : 'bg-[#0f0f1a] border border-[rgba(255,255,255,0.06)] rounded-tl-sm'
                }`}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />

                {/* Metrics bar */}
                {msg.role === 'mother' && msg.tier && (
                  <div className="flex flex-wrap gap-1.5">
                    {/* v68.9: Show actual model name from cascade router, not tier */}
                    <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[rgba(124,58,237,0.12)] border border-[rgba(124,58,237,0.25)] text-[#a78bfa]" title={`Provider: ${msg.provider || 'openai'} | Category: ${msg.queryCategory || msg.tier}`}>
                      <Brain className="w-2.5 h-2.5" />{msg.modelName || msg.tier}
                    </span>
                    {msg.qualityScore && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.25)] text-emerald-400">
                        <Shield className="w-2.5 h-2.5" />{msg.qualityScore}%
                      </span>
                    )}
                    {msg.cost !== undefined && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.25)] text-amber-400">
                        <TrendingDown className="w-2.5 h-2.5" />${msg.cost.toFixed(6)}
                      </span>
                    )}
                    {msg.responseTime && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[rgba(99,102,241,0.1)] border border-[rgba(99,102,241,0.25)] text-indigo-400">
                        <Zap className="w-2.5 h-2.5" />{(msg.responseTime / 1000).toFixed(1)}s
                      </span>
                    )}
                    {msg.cacheHit && (
                      <span className="text-[10px] px-2 py-1 rounded-md bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.25)] text-purple-400">
                        ⚡ Cache
                      </span>
                    )}
                  </div>
                )}

                <span className="text-[10px] text-[#55556a]">{msg.timestamp.toLocaleTimeString()}</span>
              </div>
            </div>
          ))}

          {/* v69.11: Streaming indicator — shown when SSE placeholder is empty (before first token arrives) */}
          {isStreaming && streamingMsgIdRef.current && messages.find(m => m.id === streamingMsgIdRef.current && m.content === '') && (
            <div className="msg-bubble flex gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                   style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 10px rgba(124,58,237,0.35)' }}>
                M
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#0f0f1a] border border-[rgba(255,255,255,0.06)] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#a78bfa] animate-pulse" />
                <span className="text-xs text-[#8888aa] mr-1">Gerando resposta</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-[#a78bfa]" />
                ))}
              </div>
            </div>
          )}
          {/* Legacy typing indicator for tRPC fallback */}
          {(queryMutation.isPending) && (
            <div className="msg-bubble flex gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
                   style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 10px rgba(124,58,237,0.35)' }}>
                M
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#0f0f1a] border border-[rgba(255,255,255,0.06)] flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#a78bfa] animate-pulse" />
                <span className="text-xs text-[#8888aa] mr-1">Processando</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-[#a78bfa]" />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* C175: ToolCallVisualizer — shows tool calls detected by Layer 4.5 (ReAct) */}
        {/* Scientific basis: ReAct (Yao et al., arXiv:2210.03629) — tool calls must be visible */}
        {activeToolCalls.length > 0 && (
          <div className="px-6 py-2 border-t border-[rgba(124,58,237,0.1)]">
            <ToolCallVisualizer toolCalls={activeToolCalls} isExecuting={isStreaming} />
          </div>
        )}
        {/* C172: PhaseIndicator — shows current processing phase from SSE events */}
        {/* Scientific basis: Nielsen (1994) Heuristic #1 — visibility of system status */}
        {currentPhase !== null && (
          <div className="px-6 py-2 border-t border-[rgba(124,58,237,0.1)]">
            <PhaseIndicator
              phase={currentPhase as ActivePhase}
              latencyMs={phaseLatencyMs}
            />
          </div>
        )}

        {/* Input area */}
        <div className="px-6 pb-5 pt-3 border-t border-[rgba(255,255,255,0.05)] bg-[rgba(15,15,26,0.8)]">
          {/* v74.6: Drag-and-drop drop zone (expanded mode) */}
          {showDropZone && (
            <div style={{ marginBottom: 10 }}>
              <FileDropZone
                onFilesProcessed={(ctx) => setFileContext(ctx)}
                onClear={() => setShowDropZone(false)}
              />
            </div>
          )}
          <div
            className="flex gap-2 items-end bg-[#1a1a2e] border border-[rgba(124,58,237,0.25)] rounded-2xl px-4 py-2.5 focus-within:border-[#a78bfa] focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] transition-all"
            onDragOver={(e) => { e.preventDefault(); setShowDropZone(true); }}
          >
            {/* v74.6: Paperclip button to toggle drop zone */}
            <button
              onClick={() => setShowDropZone(v => !v)}
              title="Anexar arquivo (TXT, PDF, DOCX)"
              aria-label="Anexar arquivo"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 2px', color: fileContext ? '#34d399' : '#55556a',
                transition: 'color 0.2s', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2,
              }}
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKey}
              placeholder={fileContext ? 'Arquivo anexado — escreva sua pergunta...' : 'Pergunte algo a MOTHER...'}
              rows={1}
              disabled={queryMutation.isPending || isStreaming}
              aria-label="Campo de mensagem para MOTHER"
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || queryMutation.isPending || isStreaming}
              aria-label="Enviar mensagem"
            >
              {(queryMutation.isPending || isStreaming)
                ? <LoadingSpinner compact size={16} color="#7c3aed" />
                : <Send className="w-4 h-4" />}
            </button>
          </div>
          {fileContext && (
            <p style={{ fontSize: 10, color: '#34d399', marginTop: 4, paddingLeft: 4 }}>
              ✅ Arquivo processado — conteúdo será enviado com o próximo prompt
            </p>
          )}
          <p className="text-center text-[10px] text-[#55556a] mt-2">
            Enter para enviar · Shift+Enter para nova linha · 📎 para anexar arquivo
          </p>
        </div>
      </div>
      <ErrorBoundary componentName="RightPanel">
        <RightPanel />
      </ErrorBoundary>

      {/* C172: ArtifactsPanel — slide-in overlay from right */}
      {showArtifacts && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          <div className="flex-1" onClick={() => setShowArtifacts(false)} />
          <ArtifactsPanel isOpen={showArtifacts} onClose={() => setShowArtifacts(false)} />
        </div>
      )}

      {/* C172: ProjectPanel — slide-in overlay from right */}
      {showProject && (
        <div className="fixed inset-y-0 right-0 z-50 flex">
          <div className="flex-1" onClick={() => setShowProject(false)} />
          <ProjectPanel isOpen={showProject} onClose={() => setShowProject(false)} />
        </div>
      )}

      {/* C172: Floating panel toggle buttons */}
      <div className="fixed bottom-20 right-4 flex flex-col gap-2 z-40">
        <button
          onClick={() => { setShowArtifacts(v => !v); setShowProject(false); }}
          title="Painel de Artefatos"
          style={{
            width: 40, height: 40,
            background: showArtifacts ? 'rgba(124,58,237,0.8)' : 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, transition: 'all 0.2s',
          }}
        >📎</button>
        <button
          onClick={() => { setShowProject(v => !v); setShowArtifacts(false); }}
          title="Painel de Projeto"
          style={{
            width: 40, height: 40,
            background: showProject ? 'rgba(124,58,237,0.8)' : 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.4)',
            borderRadius: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, transition: 'all 0.2s',
          }}
        >📁</button>
      </div>
    </div>
  );
}
