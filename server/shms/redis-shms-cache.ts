/**
 * Redis Cache for SHMS Real-Time Data
 * 
 * C196-2: Implementar Redis como camada de cache para queries SHMS
 * 
 * Votação 1 do Conselho dos 6 IAs: CONSENSO UNÂNIME 5/5
 * "Redis para queries em tempo real (<100ms), TimescaleDB para séries temporais"
 * 
 * Referências científicas:
 * - Dean & Barroso (2013) "The Tail at Scale" CACM 56(2) — tail latency SLA
 * - Redis Labs (2023) — in-memory data structures for real-time IoT
 * - Freedman et al. (2018) TimescaleDB VLDB — cache-aside pattern
 * - ICOLD Bulletin 158 §4.3 — real-time monitoring latency requirements
 * - ISO/IEC 25010:2011 — performance efficiency (response time behaviour)
 * 
 * Architecture: Cache-Aside Pattern
 *   1. Query Redis first (P50 < 5ms)
 *   2. On miss: query TimescaleDB (P50 < 100ms)
 *   3. Write result to Redis with TTL
 * 
 * Target SLA (pré-produção R38):
 *   - P50 < 10,000ms (synthetic data — Phase 4 SLA)
 *   - P50 < 100ms (Redis cache hit — production target)
 */

import { createLogger } from '../_core/logger';
const log = createLogger('REDIS-SHMS-CACHE');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
  ttlSeconds: number;
  source: 'redis' | 'timescaledb' | 'synthetic';
}

export interface SHMSCacheConfig {
  /** Redis connection URL — defaults to REDIS_URL env var */
  redisUrl?: string;
  /** Default TTL in seconds for sensor readings (default: 30s) */
  sensorReadingTTL?: number;
  /** Default TTL in seconds for alert history (default: 300s = 5min) */
  alertHistoryTTL?: number;
  /** Default TTL in seconds for dashboard data (default: 60s) */
  dashboardTTL?: number;
  /** Whether to use in-memory fallback when Redis is unavailable */
  useFallback?: boolean;
}

export interface SensorReadingCached {
  sensorId: string;
  structureId: string;
  type: string;
  value: number;
  unit: string;
  timestamp: string;
  quality: 'good' | 'uncertain' | 'bad';
  alertLevel?: 'L1' | 'L2' | 'L3' | null;
}

export interface AlertHistoryCached {
  structureId: string;
  alerts: Array<{
    id: string;
    level: 'L1' | 'L2' | 'L3';
    sensorId: string;
    value: number;
    threshold: number;
    message: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
  totalCount: number;
  generatedAt: string;
}

// ─── In-Memory Fallback Cache ─────────────────────────────────────────────────
// Used when Redis is unavailable (pré-produção R38 — no real Redis required)

interface FallbackEntry {
  value: string;
  expiresAt: number;
}

class InMemoryFallbackCache {
  private store: Map<string, FallbackEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 60s
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// ─── Redis SHMS Cache ─────────────────────────────────────────────────────────

export class RedisSHMSCache {
  private client: any = null; // ioredis client (optional dependency)
  private fallback: InMemoryFallbackCache;
  private isRedisAvailable = false;
  private config: Required<SHMSCacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    errors: 0,
    fallbackHits: 0,
  };

  constructor(config: SHMSCacheConfig = {}) {
    this.config = {
      redisUrl: config.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379',
      sensorReadingTTL: config.sensorReadingTTL ?? 30,
      alertHistoryTTL: config.alertHistoryTTL ?? 300,
      dashboardTTL: config.dashboardTTL ?? 60,
      useFallback: config.useFallback ?? true,
    };
    this.fallback = new InMemoryFallbackCache();
  }

  /**
   * Initialize Redis connection
   * Falls back to in-memory cache if Redis is unavailable (R38 — pré-produção)
   */
  async connect(): Promise<void> {
    try {
      // Dynamic import — ioredis is optional dependency (not required in pré-produção R38)
      // Falls back to in-memory cache automatically if ioredis is not installed
      let RedisClass: (new (url: string, opts: Record<string, unknown>) => { connect(): Promise<void>; ping(): Promise<string>; get(k: string): Promise<string|null>; setex(k: string, ttl: number, v: string): Promise<void>; keys(p: string): Promise<string[]>; del(...k: string[]): Promise<number>; quit(): Promise<void> }) | null = null;
      try {
        const mod = await import('ioredis');
        RedisClass = (mod.default ?? mod) as typeof RedisClass;
      } catch {
        throw new Error('ioredis not installed — using in-memory fallback (R38)');
      }
      this.client = new RedisClass(this.config.redisUrl, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      await this.client.connect();
      await this.client.ping();
      this.isRedisAvailable = true;
      log.info('[REDIS-SHMS] Connected to Redis — real-time cache active');
    } catch (err) {
      this.isRedisAvailable = false;
      if (this.config.useFallback) {
        log.warn('[REDIS-SHMS] Redis unavailable — using in-memory fallback (R38: pré-produção)');
      } else {
        log.error('[REDIS-SHMS] Redis connection failed:', (err as Error).message);
        throw err;
      }
    }
  }

  /**
   * Cache-Aside: Get sensor readings for a structure
   * P50 target: <5ms (Redis hit) | <100ms (TimescaleDB miss)
   * 
   * @param structureId - Structure identifier (e.g., 'STRUCTURE_001')
   * @param sensorType - Optional filter by sensor type
   */
  async getSensorReadings(
    structureId: string,
    sensorType?: string
  ): Promise<SensorReadingCached[] | null> {
    const key = `shms:sensors:${structureId}${sensorType ? `:${sensorType}` : ''}`;
    const cached = await this.get(key);
    
    if (cached) {
      this.stats.hits++;
      return JSON.parse(cached) as SensorReadingCached[];
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Cache sensor readings with TTL
   */
  async setSensorReadings(
    structureId: string,
    readings: SensorReadingCached[],
    sensorType?: string
  ): Promise<void> {
    const key = `shms:sensors:${structureId}${sensorType ? `:${sensorType}` : ''}`;
    await this.set(key, JSON.stringify(readings), this.config.sensorReadingTTL);
  }

  /**
   * Cache-Aside: Get alert history for a structure
   */
  async getAlertHistory(
    structureId: string,
    level?: string,
    hours?: number
  ): Promise<AlertHistoryCached | null> {
    const key = `shms:alerts:${structureId}:${level ?? 'all'}:${hours ?? 24}h`;
    const cached = await this.get(key);
    
    if (cached) {
      this.stats.hits++;
      return JSON.parse(cached) as AlertHistoryCached;
    }
    
    this.stats.misses++;
    return null;
  }

  /**
   * Cache alert history with TTL
   */
  async setAlertHistory(
    structureId: string,
    data: AlertHistoryCached,
    level?: string,
    hours?: number
  ): Promise<void> {
    const key = `shms:alerts:${structureId}:${level ?? 'all'}:${hours ?? 24}h`;
    await this.set(key, JSON.stringify(data), this.config.alertHistoryTTL);
  }

  /**
   * Invalidate all cache entries for a structure
   * Called when new sensor data arrives via MQTT
   */
  async invalidateStructure(structureId: string): Promise<void> {
    const patterns = [
      `shms:sensors:${structureId}*`,
      `shms:alerts:${structureId}*`,
      `shms:dashboard:${structureId}*`,
    ];

    for (const pattern of patterns) {
      try {
        if (this.isRedisAvailable && this.client) {
          const keys = await this.client.keys(pattern);
          if (keys.length > 0) {
            await this.client.del(...keys);
          }
        } else {
          const keys = await this.fallback.keys(pattern);
          for (const key of keys) {
            await this.fallback.del(key);
          }
        }
      } catch (err) {
        this.stats.errors++;
        log.warn(`[REDIS-SHMS] Invalidation error for pattern ${pattern}:`, (err as Error).message);
      }
    }
    
    log.info(`[REDIS-SHMS] Cache invalidated for structure: ${structureId}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    errors: number;
    fallbackHits: number;
    hitRate: number;
    backend: 'redis' | 'in-memory-fallback';
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      backend: this.isRedisAvailable ? 'redis' : 'in-memory-fallback',
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; backend: string; latencyMs?: number }> {
    const start = Date.now();
    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.ping();
        return {
          healthy: true,
          backend: 'redis',
          latencyMs: Date.now() - start,
        };
      }
      return {
        healthy: true,
        backend: 'in-memory-fallback',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        healthy: false,
        backend: 'redis-error',
        latencyMs: Date.now() - start,
      };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async get(key: string): Promise<string | null> {
    try {
      if (this.isRedisAvailable && this.client) {
        return await this.client.get(key);
      }
      const result = await this.fallback.get(key);
      if (result) this.stats.fallbackHits++;
      return result;
    } catch (err) {
      this.stats.errors++;
      log.warn(`[REDIS-SHMS] GET error for key ${key}:`, (err as Error).message);
      return null;
    }
  }

  private async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.fallback.set(key, value, ttlSeconds);
      }
    } catch (err) {
      this.stats.errors++;
      log.warn(`[REDIS-SHMS] SET error for key ${key}:`, (err as Error).message);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
    this.fallback.destroy();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let cacheInstance: RedisSHMSCache | null = null;

/**
 * Get singleton Redis SHMS cache instance
 * Auto-initializes with in-memory fallback if Redis unavailable (R38)
 */
export function getRedisSHMSCache(): RedisSHMSCache {
  if (!cacheInstance) {
    cacheInstance = new RedisSHMSCache();
  }
  return cacheInstance;
}

/**
 * Initialize Redis cache on server startup
 * Add to server/_core/production-entry.ts startup sequence
 */
export async function initRedisSHMSCache(): Promise<void> {
  const cache = getRedisSHMSCache();
  await cache.connect();
  const stats = cache.getStats();
  log.info(`[REDIS-SHMS] Cache initialized — backend: ${stats.backend}`);
}

// SHMSCacheConfig and CacheEntry already exported via 'export interface' declarations above
