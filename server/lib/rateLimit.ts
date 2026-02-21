/**
 * Rate Limit Middleware
 * 
 * Implements token bucket algorithm for rate limiting with Redis backend.
 * Exposes X-RateLimit-* headers for client-side tracking.
 * 
 * Scientific Hypothesis:
 * Exposing rate limit headers reduces 429 errors by 80% by enabling
 * intelligent client-side retry logic.
 */

import { getRedisClient } from './redis';
import { logger } from '../lib/logger';

export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyPrefix: string;  // Redis key prefix
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;  // Unix timestamp when limit resets
  retryAfter?: number;  // Seconds until next request allowed
}

/**
 * Default rate limit configurations by endpoint type
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // MOTHER query endpoints - most expensive
  'mother.query': {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 10,  // 10 queries per minute
    keyPrefix: 'ratelimit:mother:query',
  },
  'mother.queryAsync': {
    windowMs: 60 * 1000,
    maxRequests: 20,  // Higher limit for async (non-blocking)
    keyPrefix: 'ratelimit:mother:queryAsync',
  },
  
  // Health/monitoring endpoints - cheap
  'health': {
    windowMs: 60 * 1000,
    maxRequests: 60,  // 1 per second
    keyPrefix: 'ratelimit:health',
  },
  
  // Queue/stats endpoints - moderate
  'queue': {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'ratelimit:queue',
  },
  
  // Webhook endpoints - moderate
  'webhooks': {
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'ratelimit:webhooks',
  },
  
  // Default for all other endpoints
  'default': {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'ratelimit:default',
  },
};

/**
 * Check rate limit for a user/IP
 * 
 * Uses token bucket algorithm with Redis:
 * 1. Get current count from Redis
 * 2. If count < limit, increment and allow
 * 3. If count >= limit, deny with retry-after
 * 4. Set TTL to window duration
 * 
 * @param identifier - User ID or IP address
 * @param config - Rate limit configuration
 * @returns Rate limit result with headers
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `${config.keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  try {
    // Try Redis first
    const client = getRedisClient();
    if (client) {
      // Get current count
      const count = await client.get(key);
      const currentCount = count ? parseInt(count, 10) : 0;
      
      if (currentCount < config.maxRequests) {
        // Allow request
        const newCount = currentCount + 1;
        await client.set(key, newCount.toString(), 'PX', config.windowMs);
        
        const reset = now + config.windowMs;
        return {
          allowed: true,
          limit: config.maxRequests,
          remaining: config.maxRequests - newCount,
          reset: Math.floor(reset / 1000),
        };
      } else {
        // Deny request
        const ttl = await client.pttl(key);
        const retryAfter = ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(config.windowMs / 1000);
        const reset = now + (ttl > 0 ? ttl : config.windowMs);
        
        return {
          allowed: false,
          limit: config.maxRequests,
          remaining: 0,
          reset: Math.floor(reset / 1000),
          retryAfter,
        };
      }
    }
  } catch (error) {
    logger.error('[RateLimit] Redis error (graceful degradation):', error);
  }
  
  // Graceful degradation: Allow request if Redis unavailable
  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - 1,
    reset: Math.floor((now + config.windowMs) / 1000),
  };
}

/**
 * Get rate limit config for an endpoint
 * 
 * @param procedure - tRPC procedure name (e.g., "mother.query")
 * @returns Rate limit configuration
 */
export function getRateLimitConfig(procedure: string): RateLimitConfig {
  // Extract base procedure (e.g., "mother" from "mother.query")
  const base = procedure.split('.')[0];
  
  // Check for exact match first
  if (RATE_LIMITS[procedure]) {
    return RATE_LIMITS[procedure];
  }
  
  // Check for base match
  if (RATE_LIMITS[base]) {
    return RATE_LIMITS[base];
  }
  
  // Default
  return RATE_LIMITS.default;
}

/**
 * Format rate limit headers for HTTP response
 * 
 * @param result - Rate limit result
 * @returns Headers object
 */
export function formatRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };
  
  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = result.retryAfter.toString();
  }
  
  return headers;
}

/**
 * Reset rate limit for a user (admin function)
 * 
 * @param identifier - User ID or IP address
 * @param config - Rate limit configuration
 */
export async function resetRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<void> {
  const key = `${config.keyPrefix}:${identifier}`;
  
  try {
    const client = getRedisClient();
    if (client) {
      await client.del(key);
    }
  } catch (error) {
    logger.error('[RateLimit] Failed to reset rate limit:', error);
  }
}

/**
 * Get rate limit stats for monitoring
 * 
 * @returns Rate limit statistics
 */
export async function getRateLimitStats(): Promise<{
  totalKeys: number;
  keysByPrefix: Record<string, number>;
}> {
  try {
    const client = getRedisClient();
    if (!client) {
      return { totalKeys: 0, keysByPrefix: {} };
    }
    
    const keys = await client.keys('ratelimit:*');
    const keysByPrefix: Record<string, number> = {};
    
    for (const key of keys) {
      const prefix = key.split(':').slice(0, 3).join(':');
      keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
    }
    
    return {
      totalKeys: keys.length,
      keysByPrefix,
    };
  } catch (error) {
    logger.error('[RateLimit] Failed to get stats:', error);
    return { totalKeys: 0, keysByPrefix: {} };
  }
}
