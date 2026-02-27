/**
 * MOTHER v74.8 — Fetch with Retry (Exponential Backoff + Jitter)
 * 
 * NC-OMNI-001: arXiv API fetch timeout — add retry with exponential backoff
 * 
 * Scientific basis:
 * - AWS Builders' Library: "Timeouts, retries, and backoff with jitter" (Brooker, 2019)
 *   https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
 * - Rethinking HTTP API Rate Limiting (arXiv:2510.04516, 2025)
 * - Structured Handling of Exceptions in LLM-Driven Agentic Workflows (arXiv:2508.07935, 2025)
 * 
 * Formula (AWS recommended):
 *   delay = min(baseDelay × 2^attempt + jitter, maxDelay)
 *   jitter = random(0, 500) ms  ← prevents thundering herd
 * 
 * Parameters for research APIs (arXiv, Semantic Scholar):
 *   baseDelay: 1000ms | maxDelay: 8000ms | maxAttempts: 3 | timeout: 10000ms
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  timeout?: number;
  retryOn?: (status: number) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  timeout: 10000,
  retryOn: (status: number) => status === 429 || status >= 500,
};

/**
 * Fetch with exponential backoff + full jitter (AWS recommended pattern)
 * 
 * @param url - URL to fetch
 * @param fetchOptions - Standard RequestInit options
 * @param retryOptions - Retry configuration
 * @returns Response if successful
 * @throws Error after maxAttempts exhausted
 */
export async function fetchWithRetry(
  url: string,
  fetchOptions: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Check if we should retry on this status code
      if (opts.retryOn(response.status) && attempt < opts.maxAttempts) {
        const delay = computeBackoffDelay(attempt, opts.baseDelay, opts.maxDelay);
        await sleep(delay);
        continue;
      }

      // Non-retryable error or last attempt
      throw new Error(
        `HTTP ${response.status} ${response.statusText} from ${url}`
      );
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        // AbortError = timeout
        if (error.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${opts.timeout}ms: ${url}`);
        } else {
          lastError = error;
        }
      } else {
        lastError = new Error(String(error));
      }

      if (attempt < opts.maxAttempts) {
        const delay = computeBackoffDelay(attempt, opts.baseDelay, opts.maxDelay);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error(`Max retries (${opts.maxAttempts}) exceeded for ${url}`);
}

/**
 * Compute exponential backoff delay with full jitter
 * Formula: min(baseDelay × 2^attempt + random(0, 500), maxDelay)
 * 
 * "Full jitter" is AWS's recommended variant — it spreads retries more evenly
 * than "equal jitter" and prevents thundering herd under load.
 */
export function computeBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500; // 0-500ms full jitter
  return Math.min(exponential + jitter, maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Null-safe wrapper for cache item loading
 * NC-CACHE-001: Prevents "Cannot read property 'id' of undefined"
 * 
 * Basis: TypeScript Optional Chaining (TC39 Proposal, 2020)
 * McConnell, "Code Complete 2" — Defensive Programming Chapter 8
 */
export function safeGetId(item: unknown): string | null {
  if (item === null || item === undefined) return null;
  if (typeof item === 'object' && 'id' in item) {
    const id = (item as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) return id;
    if (typeof id === 'number' && !isNaN(id)) return String(id);
  }
  return null;
}

/**
 * Null-safe wrapper for episodic memory result
 * NC-EPISODIC-001: Prevents "Cannot convert null to object" in Object.keys/entries
 * 
 * Basis: TypeScript strict null checks + Defensive Programming
 */
export function safeObjectEntries<T>(
  obj: T | null | undefined
): [string, unknown][] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>);
}

export function safeObjectKeys(obj: unknown): string[] {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== 'object') return [];
  return Object.keys(obj as Record<string, unknown>);
}
