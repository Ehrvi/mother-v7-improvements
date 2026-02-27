/**
 * MOTHER v74.0 — Structured Logger
 * NC-003 Fix: Replace 599 unstructured console.log calls with leveled, structured output
 *
 * Scientific basis:
 * - Google SRE Book (Beyer et al., 2016): structured logs are machine-parseable and queryable
 * - OpenTelemetry Logging Spec (CNCF, 2023): severity levels (TRACE/DEBUG/INFO/WARN/ERROR/FATAL)
 * - Twelve-Factor App (Hermes, 2011): logs as event streams — stdout only, no log files
 * - Kleppmann (2017) "Designing Data-Intensive Applications": observability requires structured events
 *
 * Log levels (ascending severity):
 *   DEBUG  — internal state, verbose (disabled in production)
 *   INFO   — normal operation milestones
 *   WARN   — recoverable anomalies
 *   ERROR  — failures requiring attention
 *   FATAL  — unrecoverable failures
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO:  1,
  WARN:  2,
  ERROR: 3,
  FATAL: 4,
};

// In production (NODE_ENV=production), suppress DEBUG. In development, show all.
const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatLog(level: LogLevel, module: string, message: string, meta?: any): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}] [${module}] ${message}`;
  if (meta !== undefined && meta !== null) {
    try {
      const metaStr = typeof meta === 'object' ? JSON.stringify(meta) : String(meta);
      return `${base} ${metaStr}`;
    } catch {
      return `${base} [meta serialization failed]`;
    }
  }
  return base;
}

export function createLogger(module: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debug: (message: string, meta?: any) => {
      if (shouldLog('DEBUG')) console.log(formatLog('DEBUG', module, message, meta));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: (message: string, meta?: any) => {
      if (shouldLog('INFO')) console.log(formatLog('INFO', module, message, meta));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warn: (message: string, meta?: any) => {
      if (shouldLog('WARN')) console.warn(formatLog('WARN', module, message, meta));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: (message: string, meta?: any) => {
      if (shouldLog('ERROR')) console.error(formatLog('ERROR', module, message, meta));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fatal: (message: string, meta?: any) => {
      if (shouldLog('FATAL')) console.error(formatLog('FATAL', module, message, meta));
    },
  };
}

// Default root logger
export const logger = createLogger('MOTHER');
