/**
 * MOTHER v92.0: Redis Rate Limiter — NC-INFRA-005 FIX
 *
 * Substitui o MemoryStore do express-rate-limit por Redis-backed store
 * para garantir rate limiting distribuído em Cloud Run multi-instância.
 *
 * Problema (NC-INFRA-005): O MemoryStore padrão mantém contadores por instância.
 * Em Cloud Run com N instâncias, o limite efetivo é max * N, não max.
 * Isso viola OWASP API4:2023 — Unrestricted Resource Consumption.
 *
 * Solução: rate-limit-redis com Redis Cloud (Upstash ou Google Memorystore).
 * Fallback automático para MemoryStore se REDIS_URL não estiver configurado.
 *
 * Scientific basis:
 * - OWASP API Security Top 10 2023 — API4: Unrestricted Resource Consumption
 * - Google Cloud Run docs (2024) — Stateless containers, multiple instances
 * - Nygard (2007) Release It! §5.3 — Bulkheads + Rate Limiting
 * - Redis Labs (2024) — Distributed rate limiting with Redis
 * - Kleppmann (2017) Designing Data-Intensive Applications §9.4 — Distributed counters
 *
 * NC-INFRA-005 FIX: Sprint 10 C209
 */
import { Request, Response, NextFunction } from 'express';
import rateLimit, { Store, Options } from 'express-rate-limit';

// Attempt to load Redis store — optional dependency
let RedisStore: any = null;
let redisClient: any = null;

/**
 * Initialize Redis client if REDIS_URL is available.
 * Falls back gracefully to MemoryStore if Redis is unavailable.
 *
 * Scientific basis: Kleppmann (2017) §9.4 — Graceful degradation
 */
async function initRedisStore(): Promise<Store | undefined> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn(
      '[RateLimiter][NC-INFRA-005] REDIS_URL not set — using MemoryStore (single-instance only). ' +
      'For distributed rate limiting in Cloud Run, set REDIS_URL. ' +
      'Scientific basis: Google Cloud Run docs (2024) + OWASP API4:2023.'
    );
    return undefined;
  }

  try {
    // Dynamic import to avoid crash if package not installed
    // Using 'any' type to avoid TypeScript module resolution errors for optional deps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redisModule = await import('redis' as any).catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rateLimitRedisModule = await import('rate-limit-redis' as any).catch(() => null);
    
    if (!redisModule || !rateLimitRedisModule) {
      console.warn('[RateLimiter][NC-INFRA-005] redis or rate-limit-redis not installed — using MemoryStore.');
      return undefined;
    }
    
    const { createClient } = redisModule;
    const { RedisStore: RStore } = rateLimitRedisModule;

    redisClient = createClient({ url: redisUrl });
    await redisClient.connect();

    console.info(
      '[RateLimiter][NC-INFRA-005] Redis connected — distributed rate limiting ACTIVE. ' +
      'Scientific basis: OWASP API4:2023 + Kleppmann (2017) §9.4.'
    );

    return new RStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      prefix: 'rl:mother:',
    });
  } catch (err) {
    console.warn(
      '[RateLimiter][NC-INFRA-005] Redis unavailable — falling back to MemoryStore. ' +
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

/**
 * createDistributedRateLimiter — Factory para criar rate limiters com Redis store.
 *
 * Uso:
 * ```typescript
 * const limiter = await createDistributedRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', limiter);
 * ```
 *
 * Scientific basis: OWASP API4:2023 + Nygard (2007) §5.3 + Kleppmann (2017) §9.4
 * NC-INFRA-005 FIX: Sprint 10 C209
 */
export async function createDistributedRateLimiter(
  options: Partial<Options> & { windowMs: number; max: number }
) {
  const store = await initRedisStore();

  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: store, // undefined → MemoryStore fallback
    message: options.message ?? {
      error: 'Too many requests — rate limit exceeded',
      retryAfter: Math.ceil(options.windowMs / 1000),
    },
    handler: (req: Request, res: Response) => {
      console.warn(
        `[RateLimiter][NC-INFRA-005] Rate limit exceeded — IP: ${req.ip} | Path: ${req.path}`
      );
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please wait before retrying.',
        retryAfter: Math.ceil(options.windowMs / 1000),
        // OWASP API4:2023 — include Retry-After header
      });
    },
    skip: (req: Request) => {
      // Skip rate limiting for health checks (avoid false positives in Cloud Run probes)
      return req.path === '/api/health' || req.path === '/health';
    },
  });
}

/**
 * createSyncRateLimiter — Versão síncrona para compatibilidade retroativa.
 * Usa MemoryStore (sem Redis). Para uso em contextos onde await não é possível.
 *
 * NC-INFRA-005 NOTE: Use createDistributedRateLimiter() for production Cloud Run.
 */
export function createSyncRateLimiter(options: Partial<Options> & { windowMs: number; max: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: options.message ?? {
      error: 'Too many requests',
      retryAfter: Math.ceil(options.windowMs / 1000),
    },
    skip: (req: Request) => req.path === '/api/health' || req.path === '/health',
  });
}

/**
 * Graceful shutdown — close Redis connection on process exit.
 * Scientific basis: Google SRE (2016) §8 — Release It! §4.3 Graceful Shutdown
 */
export async function closeRateLimiterRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.disconnect();
      console.info('[RateLimiter][NC-INFRA-005] Redis disconnected gracefully.');
    } catch (err) {
      console.warn('[RateLimiter][NC-INFRA-005] Redis disconnect error:', err);
    }
  }
}
