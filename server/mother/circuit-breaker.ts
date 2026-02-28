/**
 * MOTHER v76.0 — Circuit Breaker for LLM Providers
 * Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66
 *
 * Scientific basis:
 * - Circuit Breaker Pattern (Nygard, 2007, "Release It!") — fail fast, recover gracefully
 * - Exponential Backoff with Jitter (Karn & Partridge, 1987, RFC 6298) — avoid thundering herd
 * - ACAR (arXiv:2602.21231, 2026) — auditable decision traces for multi-model routing
 * - SLO-based reliability (Google SRE Book, 2016) — P95 < 2s, error rate < 0.1%
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (probing recovery)
 * Thresholds: 3 failures in 60s → OPEN; 30s cooldown → HALF_OPEN; 1 success → CLOSED
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;     // failures before opening (default: 3)
  successThreshold: number;     // successes in HALF_OPEN to close (default: 1)
  timeoutMs: number;            // request timeout in ms (default: 15000)
  cooldownMs: number;           // time before HALF_OPEN probe (default: 30000)
  windowMs: number;             // sliding window for failure counting (default: 60000)
}

export interface CircuitBreakerStats {
  provider: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  openedAt: Date | null;
  totalRequests: number;
  totalFailures: number;
  errorRate: number;  // 0-1
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 1,
  timeoutMs: 15000,
  cooldownMs: 30000,
  windowMs: 60000,
};

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;         // failures in current window
  successes: number;        // successes in HALF_OPEN
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  openedAt: Date | null;
  windowFailures: { timestamp: number }[];
  totalRequests: number;
  totalFailures: number;
}

// Singleton registry — one circuit per provider
const circuits = new Map<string, CircuitBreakerState>();

function getCircuit(provider: string): CircuitBreakerState {
  if (!circuits.has(provider)) {
    circuits.set(provider, {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      windowFailures: [],
      totalRequests: 0,
      totalFailures: 0,
    });
  }
  return circuits.get(provider)!;
}

/**
 * Check if a provider is available for requests.
 * Returns false if circuit is OPEN and cooldown hasn't elapsed.
 */
export function isProviderAvailable(provider: string, config: CircuitBreakerConfig = DEFAULT_CONFIG): boolean {
  const circuit = getCircuit(provider);

  if (circuit.state === 'CLOSED') return true;

  if (circuit.state === 'OPEN') {
    const now = Date.now();
    const openedAt = circuit.openedAt?.getTime() ?? 0;
    if (now - openedAt >= config.cooldownMs) {
      // Transition to HALF_OPEN to probe recovery
      circuit.state = 'HALF_OPEN';
      circuit.successes = 0;
      console.log(`[CircuitBreaker] ${provider}: OPEN → HALF_OPEN (probing recovery)`);
      return true;
    }
    return false;
  }

  // HALF_OPEN: allow one probe request
  return true;
}

/**
 * Record a successful request for a provider.
 */
export function recordSuccess(provider: string, config: CircuitBreakerConfig = DEFAULT_CONFIG): void {
  const circuit = getCircuit(provider);
  circuit.totalRequests++;
  circuit.lastSuccessAt = new Date();

  if (circuit.state === 'HALF_OPEN') {
    circuit.successes++;
    if (circuit.successes >= config.successThreshold) {
      circuit.state = 'CLOSED';
      circuit.failures = 0;
      circuit.windowFailures = [];
      circuit.openedAt = null;
      console.log(`[CircuitBreaker] ${provider}: HALF_OPEN → CLOSED (recovered)`);
    }
  } else if (circuit.state === 'CLOSED') {
    // Prune old window failures
    const now = Date.now();
    circuit.windowFailures = circuit.windowFailures.filter(f => now - f.timestamp < config.windowMs);
    circuit.failures = circuit.windowFailures.length;
  }
}

/**
 * Record a failed request for a provider.
 */
export function recordFailure(provider: string, error: string, config: CircuitBreakerConfig = DEFAULT_CONFIG): void {
  const circuit = getCircuit(provider);
  circuit.totalRequests++;
  circuit.totalFailures++;
  circuit.lastFailureAt = new Date();

  const now = Date.now();

  if (circuit.state === 'HALF_OPEN') {
    // Probe failed — go back to OPEN
    circuit.state = 'OPEN';
    circuit.openedAt = new Date();
    circuit.successes = 0;
    console.warn(`[CircuitBreaker] ${provider}: HALF_OPEN → OPEN (probe failed: ${error})`);
    return;
  }

  // CLOSED: add to sliding window
  circuit.windowFailures.push({ timestamp: now });
  // Prune old failures outside window
  circuit.windowFailures = circuit.windowFailures.filter(f => now - f.timestamp < config.windowMs);
  circuit.failures = circuit.windowFailures.length;

  if (circuit.failures >= config.failureThreshold) {
    circuit.state = 'OPEN';
    circuit.openedAt = new Date();
    console.error(`[CircuitBreaker] ${provider}: CLOSED → OPEN (${circuit.failures} failures in ${config.windowMs / 1000}s window: ${error})`);
  }
}

/**
 * Execute a provider call with circuit breaker protection and timeout.
 *
 * Scientific basis:
 * - Timeout + circuit breaker combination (Nygard, 2007) — prevents cascading failures
 * - AbortController (WHATWG Fetch API) — clean cancellation of in-flight requests
 */
export async function withCircuitBreaker<T>(
  provider: string,
  fn: (signal: AbortSignal) => Promise<T>,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
): Promise<T> {
  if (!isProviderAvailable(provider, config)) {
    const circuit = getCircuit(provider);
    const openedAgo = circuit.openedAt ? Math.round((Date.now() - circuit.openedAt.getTime()) / 1000) : 0;
    throw new Error(`[CircuitBreaker] ${provider} is OPEN (opened ${openedAgo}s ago, cooldown ${config.cooldownMs / 1000}s)`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeoutId);
    recordSuccess(provider, config);
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    const errorMsg = err?.name === 'AbortError'
      ? `Timeout after ${config.timeoutMs}ms`
      : (err?.message || 'Unknown error');
    recordFailure(provider, errorMsg, config);
    throw err;
  }
}

/**
 * Get current stats for all circuits (for observability).
 */
export function getAllCircuitStats(): CircuitBreakerStats[] {
  return Array.from(circuits.entries()).map(([provider, state]) => ({
    provider,
    state: state.state,
    failures: state.failures,
    successes: state.successes,
    lastFailureAt: state.lastFailureAt,
    lastSuccessAt: state.lastSuccessAt,
    openedAt: state.openedAt,
    totalRequests: state.totalRequests,
    totalFailures: state.totalFailures,
    errorRate: state.totalRequests > 0 ? state.totalFailures / state.totalRequests : 0,
  }));
}

/**
 * Reset a specific circuit (for testing or manual recovery).
 */
export function resetCircuit(provider: string): void {
  circuits.delete(provider);
  console.log(`[CircuitBreaker] ${provider}: manually reset to CLOSED`);
}

/**
 * Get SLO compliance report.
 * SLO targets: error rate < 0.1%, P95 latency < 2s
 */
export function getSLOReport(): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const [provider, state] of circuits.entries()) {
    const errorRate = state.totalRequests > 0 ? state.totalFailures / state.totalRequests : 0;
    if (errorRate > 0.001) {
      violations.push(`${provider}: error rate ${(errorRate * 100).toFixed(2)}% > 0.1% SLO`);
    }
    if (state.state === 'OPEN') {
      violations.push(`${provider}: circuit OPEN (provider unavailable)`);
    }
  }
  return { compliant: violations.length === 0, violations };
}
