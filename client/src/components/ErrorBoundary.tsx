/**
 * MOTHER v92.0: ErrorBoundary Component — NC-ARCH-004 FIX (Enhanced)
 *
 * React Error Boundaries para capturar erros em componentes filhos
 * e exibir UI de fallback em vez de crash completo da aplicação.
 *
 * Scientific basis:
 * - React docs (2024) — Error Boundaries: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 * - Nielsen (1994) Heurística 9 — Help users recognize, diagnose, and recover from errors
 * - ISO/IEC 25010:2011 §4.2.7 — Fault Tolerance (Reliability sub-characteristic)
 * - Nygard (2007) Release It! §4.1 — Stability Patterns: Bulkheads
 *   "Bulkheads partition the system to prevent failures from cascading"
 *
 * NC-ARCH-004 FIX: Sprint 10 C209
 */
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Nome do componente para logging (ex: 'AIChatBox', 'RightPanel') */
  componentName?: string;
  /** UI customizada de fallback */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — React class component para captura de erros em runtime.
 *
 * Uso:
 * ```tsx
 * <ErrorBoundary componentName="RightPanel">
 *   <RightPanel />
 * </ErrorBoundary>
 * ```
 *
 * Scientific basis: React docs (2024) — Error Boundaries + Nygard (2007) Bulkheads
 * NC-ARCH-004 FIX: Sprint 10 C209
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // Log error with component context (OWASP A09:2021 — Security Logging)
    const name = this.props.componentName ?? 'Unknown';
    console.error(`[ErrorBoundary][${name}] Caught error:`, {
      message: error.message,
      stack: error.stack?.substring(0, 500),
      componentStack: info.componentStack?.substring(0, 300),
    });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI takes priority
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const name = this.props.componentName ?? 'Componente';

      // Default fallback — Nielsen (1994) H9: clear error + recovery action
      return (
        <div
          className="flex items-center justify-center min-h-[200px] p-6"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex flex-col items-center w-full max-w-md p-6 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertTriangle
              size={32}
              className="mb-4 flex-shrink-0"
              style={{ color: '#f87171' }}
            />
            <h3 className="text-base font-semibold mb-2" style={{ color: '#f87171' }}>
              Erro em {name}
            </h3>
            <p className="text-sm text-center mb-4" style={{ color: '#fca5a5' }}>
              {this.state.error?.message ?? 'Erro desconhecido'}
            </p>
            <button
              onClick={this.handleReset}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
              )}
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', cursor: 'pointer' }}
              aria-label={`Tentar novamente ${name}`}
            >
              <RotateCcw size={14} />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
