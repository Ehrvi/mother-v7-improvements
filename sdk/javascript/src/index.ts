/**
 * @mother/sdk-js - Official JavaScript/TypeScript SDK for MOTHER API
 * 
 * MOTHER (Multi-Operational Tiered Hierarchical Execution & Routing)
 * 83% cost reduction | 90+ quality | 7-layer architecture
 */

export interface MotherConfig {
  /**
   * Base URL of the MOTHER API
   * @default "https://mother-interface-233196174701.australia-southeast1.run.app"
   */
  baseUrl?: string;

  /**
   * Session cookie for authentication
   * Obtained from OAuth login flow
   */
  sessionCookie?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

export interface QueryRequest {
  /** The query text to send to MOTHER */
  query: string;

  /** 
   * Tier selection (1-3)
   * - Tier 1: Fast, cheap models (gpt-4o-mini, claude-3-haiku)
   * - Tier 2: Balanced models (gpt-4o, claude-3.5-sonnet)
   * - Tier 3: Premium models (o1, o3-mini) - uses async queue
   * @default 2
   */
  tier?: 1 | 2 | 3;

  /**
   * Optional context for the query
   */
  context?: string;
}

export interface QueryResponse {
  /** The AI-generated response */
  response: string;

  /** Model used for this query */
  model: string;

  /** Tier used (1-3) */
  tier: number;

  /** Cost in USD */
  cost: number;

  /** Quality score (0-100) */
  quality: number;

  /** Response time in milliseconds */
  responseTime: number;

  /** Whether response was served from cache */
  cached: boolean;
}

export interface AsyncQueryResponse {
  /** Job ID for tracking */
  jobId: string;

  /** Current job state */
  state: 'waiting' | 'active' | 'completed' | 'failed';

  /** Job progress (0-100) */
  progress: number;

  /** Result (only when state is 'completed') */
  result?: QueryResponse;

  /** Error message (only when state is 'failed') */
  error?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    heap: number;
    rss: number;
  };
  database: {
    connected: boolean;
    responseTime: number;
  };
  redis?: {
    connected: boolean;
    responseTime: number;
  };
  environment: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  keys: number;
  memory: number;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export class MotherAPIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MotherAPIError';
  }
}

export class MotherClient {
  private baseUrl: string;
  private sessionCookie?: string;
  private timeout: number;
  private debug: boolean;

  constructor(config: MotherConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://mother-interface-233196174701.australia-southeast1.run.app';
    this.sessionCookie = config.sessionCookie;
    this.timeout = config.timeout || 30000;
    this.debug = config.debug || false;
  }

  /**
   * Get OAuth login URL
   * Redirect user to this URL to initiate authentication
   */
  getLoginUrl(returnPath: string = '/'): string {
    const origin = typeof globalThis !== 'undefined' && 'window' in globalThis 
      ? (globalThis as any).window.location.origin 
      : this.baseUrl;
    const state = encodeURIComponent(JSON.stringify({
      origin,
      returnPath
    }));
    return `${this.baseUrl}/api/oauth/login?state=${state}`;
  }

  /**
   * Set session cookie after OAuth login
   */
  setSessionCookie(cookie: string): void {
    this.sessionCookie = cookie;
  }

  /**
   * Query MOTHER synchronously
   * Best for tier 1-2 queries (fast models)
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    return this.request<QueryResponse>('/api/trpc/mother.query', {
      method: 'POST',
      body: JSON.stringify({
        json: {
          query: request.query,
          tier: request.tier || 2,
          context: request.context
        }
      })
    });
  }

  /**
   * Query MOTHER asynchronously
   * Best for tier 3 queries (premium models) - uses BullMQ
   * Returns immediately with job ID, poll getJobStatus() to check progress
   */
  async queryAsync(request: QueryRequest): Promise<AsyncQueryResponse> {
    return this.request<AsyncQueryResponse>('/api/trpc/mother.queryAsync', {
      method: 'POST',
      body: JSON.stringify({
        json: {
          query: request.query,
          tier: request.tier || 3,
          context: request.context
        }
      })
    });
  }

  /**
   * Get job status for async query
   */
  async getJobStatus(jobId: string): Promise<AsyncQueryResponse> {
    return this.request<AsyncQueryResponse>(`/api/trpc/queue.job?input=${encodeURIComponent(JSON.stringify({ json: { jobId } }))}`, {
      method: 'GET'
    });
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<{ id: string; name: string; email: string; role: string }> {
    return this.request('/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D', {
      method: 'GET'
    });
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await this.request('/api/trpc/auth.logout', {
      method: 'POST',
      body: JSON.stringify({ json: null })
    });
    this.sessionCookie = undefined;
  }

  /**
   * Get system health status
   */
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/trpc/health.detailed', {
      method: 'GET'
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    return this.request<CacheStats>('/api/trpc/health.cache', {
      method: 'GET'
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    return this.request<QueueStats>('/api/trpc/queue.stats', {
      method: 'GET'
    });
  }

  private async request<T>(path: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    if (this.debug) {
      console.log(`[MOTHER SDK] ${options.method} ${url}`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (this.sessionCookie) {
      headers['Cookie'] = this.sessionCookie;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: any = await response.json().catch(() => ({ message: response.statusText }));
        throw new MotherAPIError(
          error.message || 'Request failed',
          error.code || 'UNKNOWN_ERROR',
          response.status,
          error.data
        );
      }

      const data = await response.json();
      
      // Handle tRPC batch response format
      if (Array.isArray(data)) {
        return (data as any)[0].result.data as T;
      }
      
      // Handle tRPC single response format
      if (typeof data === 'object' && data !== null && 'result' in data) {
        const result = (data as any).result;
        if (result && typeof result === 'object' && 'data' in result) {
          return result.data as T;
        }
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof MotherAPIError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new MotherAPIError(
            `Request timeout after ${this.timeout}ms`,
            'TIMEOUT',
            408
          );
        }

        throw new MotherAPIError(
          error.message,
          'NETWORK_ERROR',
          0
        );
      }

      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Unknown error occurred';
      
      throw new MotherAPIError(
        errorMessage,
        'UNKNOWN_ERROR',
        0
      );
    }
  }
}

// Export default instance for convenience
export default MotherClient;
