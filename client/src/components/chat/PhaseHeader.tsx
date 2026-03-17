import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import PhaseIndicator, { type ActivePhase } from '@/components/PhaseIndicator';
import ToolCallVisualizer, { type ToolCall } from '@/components/ToolCallVisualizer';

interface PhaseHeaderProps {
  sidebarOpen: boolean;
  motherVersion: string;
}

export default function PhaseHeader({ sidebarOpen, motherVersion }: PhaseHeaderProps) {
  const store = useChatStore();
  const { currentPhase, phaseLatencyMs, activeToolCalls } = store;

  // Convert store tool calls to the shape ToolCallVisualizer expects
  const toolCallsForVisualizer: ToolCall[] = activeToolCalls.map(tc => ({
    id: tc.id,
    name: tc.name,
    input: (tc.input as Record<string, unknown>) ?? {},
    output: typeof tc.output === 'string' ? tc.output : tc.output ? JSON.stringify(tc.output) : undefined,
    status: tc.status as ToolCall['status'],
    timestamp: Date.now(),
  }));

  return (
    <header
      className="flex items-center justify-between px-6 py-3 flex-shrink-0"
      style={{ borderBottom: '1px solid oklch(15% 0.02 280)', background: 'oklch(9% 0.02 280)' }}
    >
      <div className="flex items-center gap-3">
        {/* Sidebar toggle button */}
        <button
          onClick={() => store.setSidebarOpen(!sidebarOpen)}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
          style={{
            background: 'oklch(18% 0.03 280)',
            border: '1px solid oklch(22% 0.02 280)',
            color: 'oklch(52% 0.02 280)',
          }}
          title={sidebarOpen ? 'Fechar sidebar' : 'Abrir sidebar'}
        >
          {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

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
            <PhaseIndicator
              phase={currentPhase as ActivePhase}
              latencyMs={phaseLatencyMs}
            />
          </ErrorBoundary>
        )}
        {toolCallsForVisualizer.length > 0 && (
          <ErrorBoundary componentName="ToolCallVisualizer">
            <ToolCallVisualizer toolCalls={toolCallsForVisualizer} />
          </ErrorBoundary>
        )}
      </div>
    </header>
  );
}
