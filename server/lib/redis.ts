import Redis from 'ioredis';
import { logger } from './logger';

/**
 * Redis Client for Caching
 * 
 * Features:
 * - Connection pooling
 * - Automatic reconnection
 * - Error handling
 * - TTL management
 */

let redisClient: Redis | null = null;
let redisDisabled = false; // Flag to prevent repeated connection attempts

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis | null {
  // If Redis was previously disabled, return null immediately
  if (redisDisabled) {
    return null;
  }

  // Check if Redis is explicitly disabled via environment variable
  const redisEnabled = process.env.REDIS_ENABLED !== 'false';
  if (!redisEnabled) {
    redisDisabled = true;
    logger.info('Redis explicitly disabled via REDIS_ENABLED=false');
    return null;
  }

  // If Redis is not configured, return null (graceful degradation)
  const redisHost = process.env.REDIS_HOST;
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  
  if (!redisHost) {
    redisDisabled = true;
    logger.info('Redis not configured (REDIS_HOST missing) - caching disabled');
    return null;
  }

  // Return existing client
  if (redisClient) {
    return redisClient;
  }

  // Create new client
  try {
    redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: process.env.REDIS_PASSWORD,
      connectTimeout: 5000, // 5 second timeout (was infinite)
      retryStrategy(times) {
        // Limit retries to 3 attempts
        if (times > 3) {
          logger.error('Redis connection failed after 3 attempts - disabling Redis');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 1, // Reduce from 3 to 1 for faster failure
      enableReadyCheck: true,
      lazyConnect: true, // Don't connect immediately - connect on first use
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to create Redis client:', error);
    return null;
  }
}

/**
 * Cache key prefix for namespacing
 */
const CACHE_PREFIX = 'mother:';

/**
 * Generate cache key with prefix
 */
function getCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Get value from cache
 */
export async function cacheGet<T = any>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const value = await client.get(getCacheKey(key));
    if (!value) return null;

    return JSON.parse(value) as T;
  } catch (error) {
    logger.error(`Cache get error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set value in cache with TTL (seconds)
 */
export async function cacheSet(
  key: string,
  value: any,
  ttl: number = 3600 // Default: 1 hour
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const serialized = JSON.stringify(value);
    await client.setex(getCacheKey(key), ttl, serialized);
    return true;
  } catch (error) {
    logger.error(`Cache set error for key ${key}:`, error);
    return false;
  }
}

/**
 * Delete value from cache
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.del(getCacheKey(key));
    return true;
  } catch (error) {
    logger.error(`Cache delete error for key ${key}:`, error);
    return false;
  }
}

/**
 * Delete multiple keys matching pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;

  try {
    const keys = await client.keys(getCacheKey(pattern));
    if (keys.length === 0) return 0;

    const deleted = await client.del(...keys);
    return deleted;
  } catch (error) {
    logger.error(`Cache delete pattern error for ${pattern}:`, error);
    return 0;
  }
}

/**
 * Check if key exists in cache
 */
export async function cacheExists(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const exists = await client.exists(getCacheKey(key));
    return exists === 1;
  } catch (error) {
    logger.error(`Cache exists error for key ${key}:`, error);
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  keys: number;
  memory: string;
  hits: number;
  misses: number;
} | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const info = await client.info('stats');
    const keyspace = await client.info('keyspace');
    const memory = await client.info('memory');

    // Parse info strings
    const stats = {
      connected: client.status === 'ready',
      keys: 0,
      memory: '0',
      hits: 0,
      misses: 0,
    };

    // Extract keyspace info
    const keyspaceMatch = keyspace.match(/keys=(\d+)/);
    if (keyspaceMatch) {
      stats.keys = parseInt(keyspaceMatch[1]);
    }

    // Extract memory info
    const memoryMatch = memory.match(/used_memory_human:(.+)/);
    if (memoryMatch) {
      stats.memory = memoryMatch[1].trim();
    }

    // Extract stats
    const hitsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);
    
    if (hitsMatch) stats.hits = parseInt(hitsMatch[1]);
    if (missesMatch) stats.misses = parseInt(missesMatch[1]);

    return stats;
  } catch (error) {
    logger.error('Failed to get cache stats:', error);
    return null;
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Flush all cache (use with caution!)
 */
export async function cacheFlushAll(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.flushdb();
    logger.warn('Cache flushed - all keys deleted');
    return true;
  } catch (error) {
    logger.error('Cache flush error:', error);
    return false;
  }
}
