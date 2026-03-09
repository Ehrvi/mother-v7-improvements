/**
 * MOTHER v92.0: LoadingSpinner Component — NC-ARCH-005 FIX
 *
 * Componente de loading state granular com suporte a ETA e skeleton loading.
 * Implementa feedback visual para operações > 1s conforme Nielsen (1994) Heurística 1.
 *
 * Scientific basis:
 * - Nielsen (1994) Heurística 1 — Visibility of System Status:
 *   "Users should always be informed about what is going on"
 * - Miller (1968) — Response time in man-computer conversational transactions:
 *   "0.1s: immediate; 1s: flow of thought; 10s: attention limit"
 * - ISO/IEC 25010:2011 §4.2.6 — Usability: Operability
 * - Google Material Design (2024) — Progress indicators
 *
 * NC-ARCH-005 FIX: Sprint 10 C209
 */
import React from 'react';

interface LoadingSpinnerProps {
  /** Tamanho do spinner em pixels */
  size?: number;
  /** Cor do spinner (padrão: #7c3aed) */
  color?: string;
  /** Mensagem de status opcional */
  message?: string;
  /** ETA em segundos (exibe "~Xs restantes" se fornecido) */
  eta?: number;
  /** Progresso 0-100 (exibe barra de progresso se fornecido) */
  progress?: number;
  /** Modo compacto (inline, sem padding) */
  compact?: boolean;
}

/**
 * LoadingSpinner — Indicador de progresso com ETA e barra de progresso.
 *
 * Uso:
 * ```tsx
 * // Simples
 * <LoadingSpinner message="Processando..." />
 *
 * // Com ETA e progresso
 * <LoadingSpinner message="Gerando documento..." eta={30} progress={45} />
 *
 * // Compacto (inline)
 * <LoadingSpinner compact size={16} />
 * ```
 *
 * Scientific basis: Nielsen (1994) H1 + Miller (1968) + Material Design (2024)
 * NC-ARCH-005 FIX: Sprint 10 C209
 */
export function LoadingSpinner({
  size = 24,
  color = '#7c3aed',
  message,
  eta,
  progress,
  compact = false,
}: LoadingSpinnerProps) {
  const spinnerStyle: React.CSSProperties = {
    width: size,
    height: size,
    border: `${Math.max(2, size / 10)}px solid ${color}30`,
    borderTopColor: color,
    borderRadius: '50%',
    animation: 'mother-spin 0.8s linear infinite',
    flexShrink: 0,
  };

  if (compact) {
    return (
      <>
        <style>{`@keyframes mother-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={spinnerStyle} role="status" aria-label="Carregando..." />
      </>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
      }}
      role="status"
      aria-live="polite"
      aria-label={message ?? 'Carregando...'}
    >
      <style>{`@keyframes mother-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={spinnerStyle} />
      {message && (
        <p style={{ fontSize: '13px', color: '#a78bfa', margin: 0, textAlign: 'center' }}>
          {message}
          {eta !== undefined && eta > 0 && (
            <span style={{ color: '#6d6d8a', marginLeft: '6px', fontSize: '11px' }}>
              (~{eta}s restantes)
            </span>
          )}
        </p>
      )}
      {progress !== undefined && (
        <div
          style={{
            width: '100%',
            maxWidth: '200px',
            height: '4px',
            background: 'rgba(124,58,237,0.15)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso: ${progress}%`}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${color}, #4f46e5)`,
              borderRadius: '2px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * SkeletonBlock — Placeholder de skeleton loading para componentes pesados.
 *
 * Uso:
 * ```tsx
 * <SkeletonBlock height={120} width="100%" />
 * ```
 *
 * Scientific basis: Nielsen (1994) H1 — Visibility of System Status
 * NC-ARCH-005 FIX: Sprint 10 C209
 */
export function SkeletonBlock({
  height = 60,
  width = '100%',
  borderRadius = '6px',
}: {
  height?: number | string;
  width?: number | string;
  borderRadius?: string;
}) {
  return (
    <>
      <style>{`
        @keyframes mother-skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
      <div
        style={{
          height,
          width,
          background: 'rgba(124,58,237,0.12)',
          borderRadius,
          animation: 'mother-skeleton-pulse 1.5s ease-in-out infinite',
        }}
        role="presentation"
        aria-hidden="true"
      />
    </>
  );
}

export default LoadingSpinner;
