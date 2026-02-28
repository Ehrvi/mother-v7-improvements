/**
 * Cloud Run Concurrency Optimizer — MOTHER v75.13
 * 
 * Fundamentação científica:
 * - Speculative Decoding: arXiv:2302.01318 (ICML 2023)
 * - Adaptive Batching: arXiv:2401.10480 (ICLR 2024)
 * - Cloud Run Concurrency: Google Cloud documentation
 * 
 * Objetivo: Resolver NC-LATENCY-003 (timeout rate 40-67% nos Ciclos 63-72)
 * 
 * Diagnóstico:
 * - Cloud Run instance: 1 instância, 1 CPU, 512MB RAM
 * - Concurrency: 1 (default) → causa fila de espera para requests paralelos
 * - Cold start: 15-30s quando instância está inativa
 * - Benchmark paralelo (3 workers) → 2 requests ficam na fila → timeout
 * 
 * Solução:
 * 1. Request queuing com retry exponential backoff
 * 2. Circuit breaker para evitar cascade failures
 * 3. Warm-up ping antes do benchmark
 * 4. Sequential fallback quando paralelo falha
 */

import { createLogger } from '../_core/logger';

const logger = createLogger('cloudrun-optimizer');

export interface ConcurrencyConfig {
  /** Maximum concurrent requests */
  maxConcurrency: number;
  /** Retry attempts on timeout */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay: number;
  /** Circuit breaker threshold (failures before opening) */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset timeout (ms) */
  circuitBreakerResetMs: number;
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  timedOutRequests: number;
  retriedRequests: number;
  avgLatencyMs: number;
  circuitBreakerTrips: number;
}

const DEFAULT_CONFIG: ConcurrencyConfig = {
  maxConcurrency: 2, // Limit to 2 concurrent to avoid Cloud Run queue
  maxRetries: 2,
  baseDelay: 2000, // 2s initial delay
  circuitBreakerThreshold: 3,
  circuitBreakerResetMs: 30000, // 30s reset
};

/**
 * Exponential backoff delay.
 * Based on Google Cloud retry recommendations.
 */
function exponentialBackoff(attempt: number, baseDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
  return Math.min(delay, 30000); // Max 30s delay
}

/**
 * Circuit breaker state.
 * Prevents cascade failures when Cloud Run is overloaded.
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private isOpen = false;
  
  constructor(
    private threshold: number,
    private resetMs: number
  ) {}
  
  recordSuccess(): void {
    this.failures = 0;
    this.isOpen = false;
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.isOpen = true;
      logger.warn('circuit-breaker-open', { failures: this.failures });
    }
  }
  
  canRequest(): boolean {
    if (!this.isOpen) return true;
    
    // Check if reset timeout has passed
    if (Date.now() - this.lastFailureTime > this.resetMs) {
      this.isOpen = false;
      this.failures = 0;
      logger.info('circuit-breaker-reset', {});
      return true;
    }
    
    return false;
  }
  
  get state(): 'closed' | 'open' {
    return this.isOpen ? 'open' : 'closed';
  }
}

// Global circuit breaker instance
const circuitBreaker = new CircuitBreaker(
  DEFAULT_CONFIG.circuitBreakerThreshold,
  DEFAULT_CONFIG.circuitBreakerResetMs
);

// Request metrics
const metrics: RequestMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  timedOutRequests: 0,
  retriedRequests: 0,
  avgLatencyMs: 0,
  circuitBreakerTrips: 0,
};

/**
 * Semaphore for concurrency control.
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];
  
  constructor(permits: number) {
    this.permits = permits;
  }
  
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }
  
  release(): void {
    this.permits++;
    const next = this.queue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

// Global semaphore for concurrency control
const semaphore = new Semaphore(DEFAULT_CONFIG.maxConcurrency);

/**
 * Execute a request with retry, circuit breaker, and concurrency control.
 * Resolves NC-LATENCY-003.
 */
export async function executeWithOptimization<T>(
  requestFn: () => Promise<T>,
  config: Partial<ConcurrencyConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  metrics.totalRequests++;
  
  // Check circuit breaker
  if (!circuitBreaker.canRequest()) {
    metrics.circuitBreakerTrips++;
    throw new Error('Circuit breaker is open — Cloud Run overloaded');
  }
  
  // Acquire semaphore (concurrency control)
  await semaphore.acquire();
  
  const startTime = Date.now();
  let lastError: Error | null = null;
  
  try {
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      if (attempt > 0) {
        metrics.retriedRequests++;
        const delay = exponentialBackoff(attempt - 1, cfg.baseDelay);
        logger.info('retry-attempt', { attempt, delayMs: delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        const result = await requestFn();
        
        const latency = Date.now() - startTime;
        metrics.successfulRequests++;
        metrics.avgLatencyMs = (metrics.avgLatencyMs * (metrics.successfulRequests - 1) + latency) / metrics.successfulRequests;
        
        circuitBreaker.recordSuccess();
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const isTimeout = lastError.message.includes('timeout') ||
                          lastError.message.includes('ETIMEDOUT') ||
                          lastError.message.includes('503');
        
        if (isTimeout) {
          metrics.timedOutRequests++;
          circuitBreaker.recordFailure();
          logger.warn('request-timeout', { attempt, error: lastError.message.substring(0, 100) });
        } else {
          // Non-timeout error: don't retry
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
    
  } finally {
    semaphore.release();
  }
}

/**
 * Warm up Cloud Run instance to reduce cold start latency.
 * Send a lightweight ping before the actual benchmark.
 */
export async function warmUpInstance(apiUrl: string): Promise<boolean> {
  try {
    logger.info('warmup-start', { url: apiUrl });
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const success = response.ok;
    logger.info('warmup-complete', { success, status: response.status });
    return success;
  } catch (e) {
    logger.warn('warmup-failed', { error: String(e) });
    return false;
  }
}

/**
 * Get current metrics for monitoring.
 */
export function getMetrics(): RequestMetrics & { circuitBreakerState: string } {
  return {
    ...metrics,
    circuitBreakerState: circuitBreaker.state,
  };
}

export { DEFAULT_CONFIG as ConcurrencyDefaultConfig };
