/**
 * MOTHER Omniscient - Structured JSON Logger
 * 
 * Provides structured logging for production observability
 * Compatible with Google Cloud Logging for dashboards and alerts
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogMetadata {
  [key: string]: any;
}

/**
 * Structured logger that outputs JSON to stdout
 * 
 * @param level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param message - Human-readable message
 * @param metadata - Additional structured data
 * 
 * @example
 * log('INFO', 'Processing paper', { arxivId: '2301.12345', knowledgeAreaId: 180007 });
 * // Output: {"timestamp":"2026-02-23T05:30:00.000Z","level":"INFO","message":"Processing paper","arxivId":"2301.12345","knowledgeAreaId":180007}
 */
export function log(level: LogLevel, message: string, metadata: LogMetadata = {}): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };
  
  // Output as single-line JSON for Cloud Logging
  console.log(JSON.stringify(logEntry));
}

/**
 * Convenience functions for common log levels
 */
export const logger = {
  info: (message: string, metadata: LogMetadata = {}) => log('INFO', message, metadata),
  warn: (message: string, metadata: LogMetadata = {}) => log('WARN', message, metadata),
  error: (message: string, metadata: LogMetadata = {}) => log('ERROR', message, metadata),
  debug: (message: string, metadata: LogMetadata = {}) => log('DEBUG', message, metadata),
};

/**
 * Performance timer utility for measuring operation duration
 * 
 * @example
 * const timer = startTimer();
 * await someOperation();
 * logger.info('Operation complete', { durationMs: timer.end() });
 */
export function startTimer(): { end: () => number } {
  const startTime = Date.now();
  return {
    end: () => Date.now() - startTime,
  };
}

/**
 * Format error for structured logging
 * 
 * @param error - Error object
 * @returns Structured error metadata
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logger.error('Operation failed', formatError(error));
 * }
 */
export function formatError(error: unknown): LogMetadata {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  
  return {
    error: String(error),
  };
}
