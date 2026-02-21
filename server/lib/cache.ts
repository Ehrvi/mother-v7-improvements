/**
 * Two-Tier Caching System
 *
 * L1 Cache: Redis (ultra-fast, in-memory)
 * L2 Cache: Database (persistent, slower)
 *
 * Strategy:
 * - Check Redis first (L1)
 * - If miss, check Database (L2)
 * - If L2 hit, populate L1
 * - On new entry, write to both L1 and L2
 */

import { cacheGet, cacheSet, cacheExists } from "./redis";
import { getCacheEntry, insertCacheEntry, getDb } from "../db";
import { cacheEntries } from "../../drizzle/schema";
import { sql, gt } from "drizzle-orm";
import { logger } from "./logger";

export interface CacheEntry {
  response: string;
  tier: string;
  complexityScore: number;
  quality: any;
  tokensUsed: number;
  cost: number;
}

/**
 * Get cached query response (checks L1 then L2)
 */
export async function getCachedQuery(
  queryHash: string
): Promise<CacheEntry | null> {
  try {
    // L1: Check Redis first
    const redisEntry = await cacheGet<CacheEntry>(`query:${queryHash}`);
    if (redisEntry) {
      logger.info(`Cache L1 hit (Redis): ${queryHash.substring(0, 8)}`);
      return redisEntry;
    }

    // L2: Check Database
    const dbEntry = await getCacheEntry(queryHash);
    if (dbEntry) {
      logger.info(`Cache L2 hit (Database): ${queryHash.substring(0, 8)}`);

      // Parse database response
      const entry: CacheEntry = JSON.parse(dbEntry.response);

      // Populate L1 cache for next time (write-back)
      await cacheSet(`query:${queryHash}`, entry, 3600); // 1 hour TTL

      return entry;
    }

    // Cache miss
    logger.info(`Cache miss: ${queryHash.substring(0, 8)}`);
    return null;
  } catch (error) {
    logger.error("Cache get error:", error);
    return null;
  }
}

/**
 * Store query response in cache (writes to both L1 and L2)
 */
export async function setCachedQuery(
  queryHash: string,
  query: string,
  entry: CacheEntry
): Promise<boolean> {
  try {
    // Write to L1 (Redis) - 1 hour TTL
    const redisSuccess = await cacheSet(`query:${queryHash}`, entry, 3600);

    // Write to L2 (Database) - 24 hour TTL
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await insertCacheEntry({
      queryHash,
      query,
      response: JSON.stringify(entry),
      expiresAt,
      ttl: 86400, // 24 hours in seconds
    });

    logger.info(
      `Cache write: ${queryHash.substring(0, 8)} (L1: ${redisSuccess ? "OK" : "FAIL"}, L2: OK)`
    );

    return true;
  } catch (error) {
    logger.error("Cache set error:", error);
    return false;
  }
}

/**
 * Check if query exists in cache (checks L1 only for speed)
 */
export async function hasCachedQuery(queryHash: string): Promise<boolean> {
  try {
    // Quick check in Redis only
    return await cacheExists(`query:${queryHash}`);
  } catch (error) {
    logger.error("Cache exists error:", error);
    return false;
  }
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  l1: {
    enabled: boolean;
    connected: boolean;
    keys: number;
    memory: string;
    hits: number;
    misses: number;
    hitRate: string;
  } | null;
  l2: {
    enabled: true;
    entries: number;
  };
}

/**
 * Get cache statistics from both tiers
 */
export async function getCacheStatistics(): Promise<CacheStats> {
  try {
    // L1 stats (Redis)
    const { getCacheStats } = await import("./redis");
    const redisStats = await getCacheStats();

    let l1Stats = null;
    if (redisStats) {
      const hitRate =
        redisStats.hits + redisStats.misses > 0
          ? (
              (redisStats.hits / (redisStats.hits + redisStats.misses)) *
              100
            ).toFixed(2)
          : "0.00";

      l1Stats = {
        enabled: true,
        connected: redisStats.connected,
        keys: redisStats.keys,
        memory: redisStats.memory,
        hits: redisStats.hits,
        misses: redisStats.misses,
        hitRate: `${hitRate}%`,
      };
    }

    // Issue #32: L2 cache statistics
    // See: https://github.com/owner/mother-interface/issues/32
    // Status: Implemented - database cache stats working
    const db = await getDb();
    let l2Entries = 0;
    if (db) {
      try {
        const result = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(cacheEntries)
          .where(gt(cacheEntries.expiresAt, new Date()));
        l2Entries = result[0]?.count || 0;
      } catch (error) {
        logger.error("[Cache] Failed to count L2 entries:", error);
      }
    }
    const l2Stats = {
      enabled: true as const,
      entries: l2Entries,
    };

    return {
      l1: l1Stats,
      l2: l2Stats,
    };
  } catch (error) {
    logger.error("Failed to get cache statistics:", error);
    return {
      l1: null,
      l2: { enabled: true, entries: 0 },
    };
  }
}
