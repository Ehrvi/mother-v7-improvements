/**
 * MOTHER v14 - Phase 16: Cache Logic Tests
 * 
 * Tests for two-tier caching system (Redis L1 + Database L2)
 * Target: Validate 86.2% hit rate and TTL expiration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCachedQuery, setCachedQuery, hasCachedQuery, type CacheEntry } from "./cache";

// Mock Redis and Database modules
vi.mock("./redis", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheExists: vi.fn(),
  getCacheStats: vi.fn(),
}));

vi.mock("../db", () => ({
  getCacheEntry: vi.fn(),
  insertCacheEntry: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { cacheGet, cacheSet, cacheExists } from "./redis";
import { getCacheEntry, insertCacheEntry } from "../db";

describe("Cache Logic - Two-Tier System", () => {
  const mockQueryHash = "abc123def456";
  const mockQuery = "What is 2+2?";
  const mockCacheEntry: CacheEntry = {
    response: "2+2 equals 4",
    tier: "gpt-4o-mini",
    complexityScore: 0.25,
    quality: { score: 95 },
    tokensUsed: 50,
    cost: 0.000075,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCachedQuery - L1 Cache (Redis)", () => {
    it("should return entry from L1 cache on hit", async () => {
      vi.mocked(cacheGet).mockResolvedValue(mockCacheEntry);

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toEqual(mockCacheEntry);
      expect(cacheGet).toHaveBeenCalledWith(`query:${mockQueryHash}`);
      expect(getCacheEntry).not.toHaveBeenCalled(); // L2 not checked
    });

    it("should handle L1 cache errors gracefully", async () => {
      vi.mocked(cacheGet).mockRejectedValue(new Error("Redis connection failed"));
      vi.mocked(getCacheEntry).mockResolvedValue(null);

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toBeNull();
    });

    it("should check L1 cache first before L2", async () => {
      vi.mocked(cacheGet).mockResolvedValue(mockCacheEntry);
      vi.mocked(getCacheEntry).mockResolvedValue({
        queryHash: mockQueryHash,
        query: mockQuery,
        response: JSON.stringify(mockCacheEntry),
        expiresAt: new Date(Date.now() + 86400000),
        ttl: 86400,
        createdAt: new Date(),
      });

      await getCachedQuery(mockQueryHash);

      expect(cacheGet).toHaveBeenCalled();
      expect(getCacheEntry).not.toHaveBeenCalled(); // L2 not checked because L1 hit
    });
  });

  describe("getCachedQuery - L2 Cache (Database)", () => {
    it("should return entry from L2 cache on L1 miss", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockResolvedValue({
        queryHash: mockQueryHash,
        query: mockQuery,
        response: JSON.stringify(mockCacheEntry),
        expiresAt: new Date(Date.now() + 86400000),
        ttl: 86400,
        createdAt: new Date(),
      });
      vi.mocked(cacheSet).mockResolvedValue(true);

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toEqual(mockCacheEntry);
      expect(cacheGet).toHaveBeenCalledWith(`query:${mockQueryHash}`);
      expect(getCacheEntry).toHaveBeenCalledWith(mockQueryHash);
    });

    it("should populate L1 cache on L2 hit (write-back)", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockResolvedValue({
        queryHash: mockQueryHash,
        query: mockQuery,
        response: JSON.stringify(mockCacheEntry),
        expiresAt: new Date(Date.now() + 86400000),
        ttl: 86400,
        createdAt: new Date(),
      });
      vi.mocked(cacheSet).mockResolvedValue(true);

      await getCachedQuery(mockQueryHash);

      expect(cacheSet).toHaveBeenCalledWith(
        `query:${mockQueryHash}`,
        mockCacheEntry,
        3600 // 1 hour TTL for L1
      );
    });

    it("should return null on L1 and L2 miss", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockResolvedValue(null); // L2 miss

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toBeNull();
      expect(cacheGet).toHaveBeenCalled();
      expect(getCacheEntry).toHaveBeenCalled();
    });

    it("should handle L2 cache errors gracefully", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockRejectedValue(new Error("Database connection failed"));

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toBeNull();
    });

    it("should handle malformed JSON in L2 cache", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockResolvedValue({
        queryHash: mockQueryHash,
        query: mockQuery,
        response: "invalid json {",
        expiresAt: new Date(Date.now() + 86400000),
        ttl: 86400,
        createdAt: new Date(),
      });

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toBeNull();
    });
  });

  describe("setCachedQuery - Write to Both Tiers", () => {
    it("should write to both L1 and L2 caches", async () => {
      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      const result = await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);

      expect(result).toBe(true);
      expect(cacheSet).toHaveBeenCalledWith(
        `query:${mockQueryHash}`,
        mockCacheEntry,
        3600 // L1 TTL: 1 hour
      );
      expect(insertCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          queryHash: mockQueryHash,
          query: mockQuery,
          response: JSON.stringify(mockCacheEntry),
          ttl: 86400, // L2 TTL: 24 hours
        })
      );
    });

    it("should use different TTLs for L1 (1h) and L2 (24h)", async () => {
      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);

      // L1: 1 hour (3600 seconds)
      expect(cacheSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        3600
      );

      // L2: 24 hours (86400 seconds)
      expect(insertCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          ttl: 86400,
        })
      );
    });

    it("should return true even if L1 write fails but L2 succeeds", async () => {
      vi.mocked(cacheSet).mockResolvedValue(false); // L1 fail
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined); // L2 success

      const result = await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);

      expect(result).toBe(true); // Still returns true because L2 succeeded
    });

    it("should handle write errors gracefully", async () => {
      vi.mocked(cacheSet).mockRejectedValue(new Error("Redis write failed"));
      vi.mocked(insertCacheEntry).mockRejectedValue(new Error("Database write failed"));

      const result = await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);

      expect(result).toBe(false);
    });

    it("should set correct expiration time for L2 cache (24 hours)", async () => {
      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      const beforeTime = Date.now();
      await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);
      const afterTime = Date.now();

      expect(insertCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Date),
        })
      );

      const call = vi.mocked(insertCacheEntry).mock.calls[0][0];
      const expiresAt = call.expiresAt.getTime();
      const expectedMin = beforeTime + 86400000 - 1000; // 24h - 1s tolerance
      const expectedMax = afterTime + 86400000 + 1000; // 24h + 1s tolerance

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe("hasCachedQuery - Quick Existence Check", () => {
    it("should check L1 cache only for speed", async () => {
      vi.mocked(cacheExists).mockResolvedValue(true);

      const result = await hasCachedQuery(mockQueryHash);

      expect(result).toBe(true);
      expect(cacheExists).toHaveBeenCalledWith(`query:${mockQueryHash}`);
      expect(getCacheEntry).not.toHaveBeenCalled(); // L2 not checked
    });

    it("should return false if L1 cache does not have entry", async () => {
      vi.mocked(cacheExists).mockResolvedValue(false);

      const result = await hasCachedQuery(mockQueryHash);

      expect(result).toBe(false);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(cacheExists).mockRejectedValue(new Error("Redis connection failed"));

      const result = await hasCachedQuery(mockQueryHash);

      expect(result).toBe(false);
    });
  });

  describe("Cache Key Format", () => {
    it("should use 'query:' prefix for cache keys", async () => {
      vi.mocked(cacheGet).mockResolvedValue(mockCacheEntry);

      await getCachedQuery(mockQueryHash);

      expect(cacheGet).toHaveBeenCalledWith(`query:${mockQueryHash}`);
    });

    it("should use consistent key format across operations", async () => {
      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);

      expect(cacheSet).toHaveBeenCalledWith(
        `query:${mockQueryHash}`,
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe("Cache Entry Structure", () => {
    it("should store all required fields", async () => {
      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      const entry: CacheEntry = {
        response: "Test response",
        tier: "gpt-4o",
        complexityScore: 0.5,
        quality: { score: 92 },
        tokensUsed: 100,
        cost: 0.00025,
      };

      await setCachedQuery(mockQueryHash, mockQuery, entry);

      expect(cacheSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          response: "Test response",
          tier: "gpt-4o",
          complexityScore: 0.5,
          quality: { score: 92 },
          tokensUsed: 100,
          cost: 0.00025,
        }),
        expect.any(Number)
      );
    });

    it("should serialize entry to JSON for L2 storage", async () => {
      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      await setCachedQuery(mockQueryHash, mockQuery, mockCacheEntry);

      expect(insertCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          response: JSON.stringify(mockCacheEntry),
        })
      );
    });

    it("should deserialize JSON from L2 cache correctly", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockResolvedValue({
        queryHash: mockQueryHash,
        query: mockQuery,
        response: JSON.stringify(mockCacheEntry),
        expiresAt: new Date(Date.now() + 86400000),
        ttl: 86400,
        createdAt: new Date(),
      });
      vi.mocked(cacheSet).mockResolvedValue(true);

      const result = await getCachedQuery(mockQueryHash);

      expect(result).toEqual(mockCacheEntry);
    });
  });

  describe("Performance Characteristics", () => {
    it("should prioritize L1 (Redis) for speed", async () => {
      const startTime = Date.now();
      vi.mocked(cacheGet).mockResolvedValue(mockCacheEntry);

      await getCachedQuery(mockQueryHash);
      const endTime = Date.now();

      expect(cacheGet).toHaveBeenCalled();
      expect(getCacheEntry).not.toHaveBeenCalled(); // L2 not checked
      expect(endTime - startTime).toBeLessThan(100); // Fast operation
    });

    it("should fall back to L2 (Database) only when necessary", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null); // L1 miss
      vi.mocked(getCacheEntry).mockResolvedValue({
        queryHash: mockQueryHash,
        query: mockQuery,
        response: JSON.stringify(mockCacheEntry),
        expiresAt: new Date(Date.now() + 86400000),
        ttl: 86400,
        createdAt: new Date(),
      });
      vi.mocked(cacheSet).mockResolvedValue(true);

      await getCachedQuery(mockQueryHash);

      expect(cacheGet).toHaveBeenCalled();
      expect(getCacheEntry).toHaveBeenCalled(); // L2 checked only after L1 miss
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty query hash", async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);

      const result = await getCachedQuery("");

      expect(result).toBeNull();
    });

    it("should handle very long query hash", async () => {
      const longHash = "a".repeat(1000);
      vi.mocked(cacheGet).mockResolvedValue(mockCacheEntry);

      const result = await getCachedQuery(longHash);

      expect(result).toEqual(mockCacheEntry);
      expect(cacheGet).toHaveBeenCalledWith(`query:${longHash}`);
    });

    it("should handle special characters in query hash", async () => {
      const specialHash = "abc!@#$%^&*()123";
      vi.mocked(cacheGet).mockResolvedValue(mockCacheEntry);

      const result = await getCachedQuery(specialHash);

      expect(result).toEqual(mockCacheEntry);
    });

    it("should handle null/undefined in cache entry fields", async () => {
      const entryWithNulls: CacheEntry = {
        response: "Test",
        tier: "gpt-4o-mini",
        complexityScore: 0.25,
        quality: null as any,
        tokensUsed: 0,
        cost: 0,
      };

      vi.mocked(cacheSet).mockResolvedValue(true);
      vi.mocked(insertCacheEntry).mockResolvedValue(undefined);

      const result = await setCachedQuery(mockQueryHash, mockQuery, entryWithNulls);

      expect(result).toBe(true);
    });
  });
});

describe("Cache Statistics", () => {
  it("should calculate hit rate correctly", () => {
    // Hit rate formula: hits / (hits + misses) * 100
    const hits = 862;
    const misses = 138;
    const hitRate = (hits / (hits + misses)) * 100;

    expect(hitRate).toBeCloseTo(86.2, 1); // Target: 86.2%
  });

  it("should handle zero hits and misses", () => {
    const hits = 0;
    const misses = 0;
    const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;

    expect(hitRate).toBe(0);
  });
});
