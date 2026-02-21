/**
 * MOTHER v7.0 - PLN Optimization Layer
 * Implements model compression and quantization techniques
 *
 * Improvement #1 from self-audit:
 * "Explorar técnicas de compressão de modelos e quantização para reduzir o consumo de recursos"
 */

export interface OptimizationConfig {
  enableCaching: boolean;
  enableCompression: boolean;
  maxCacheSize: number; // MB
  compressionLevel: "low" | "medium" | "high";
}

export interface OptimizationMetrics {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  processingTime: number;
  memorySaved: number;
}

/**
 * Default optimization configuration
 */
export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  enableCaching: true,
  enableCompression: true,
  maxCacheSize: 100, // 100 MB
  compressionLevel: "medium",
};

/**
 * Optimize prompt before sending to LLM
 * Reduces token count while preserving meaning
 */
export function optimizePrompt(
  prompt: string,
  level: "low" | "medium" | "high" = "medium"
): string {
  let optimized = prompt;

  // Level 1: Remove excessive whitespace
  optimized = optimized.replace(/\s+/g, " ").trim();

  if (level === "low") return optimized;

  // Level 2: Remove redundant phrases
  const redundantPhrases = [
    /please\s+/gi,
    /kindly\s+/gi,
    /could you\s+/gi,
    /would you\s+/gi,
  ];

  redundantPhrases.forEach(phrase => {
    optimized = optimized.replace(phrase, "");
  });

  if (level === "medium") return optimized;

  // Level 3: Aggressive compression (use with caution)
  // Remove articles and some prepositions
  optimized = optimized
    .replace(/\b(a|an|the)\b\s+/gi, "")
    .replace(/\s+(of|in|on|at)\s+/gi, " ");

  return optimized.trim();
}

/**
 * Estimate token count for a text
 * Approximation: 1 token ≈ 4 characters for English
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate compression metrics
 */
export function calculateCompressionMetrics(
  original: string,
  compressed: string,
  processingTime: number
): OptimizationMetrics {
  const originalSize = Buffer.byteLength(original, "utf8");
  const compressedSize = Buffer.byteLength(compressed, "utf8");
  const compressionRatio =
    originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;
  const memorySaved = originalSize - compressedSize;

  return {
    originalSize,
    compressedSize,
    compressionRatio,
    processingTime,
    memorySaved,
  };
}

/**
 * Smart caching system for frequent queries
 * Reduces redundant LLM calls
 */
export class QueryCache {
  private cache: Map<
    string,
    { response: string; timestamp: number; hits: number }
  >;
  private maxSize: number;

  constructor(maxSizeMB: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
  }

  /**
   * Generate cache key from query
   */
  private generateKey(query: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get cached response if available
   */
  get(query: string): string | null {
    const key = this.generateKey(query);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Update hit count and timestamp
    cached.hits++;
    cached.timestamp = Date.now();

    return cached.response;
  }

  /**
   * Store response in cache
   */
  set(query: string, response: string): void {
    const key = this.generateKey(query);

    // Check cache size and evict if necessary
    this.evictIfNeeded();

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Evict least recently used items if cache is full
   */
  private evictIfNeeded(): void {
    const currentSize = this.getCurrentSize();

    if (currentSize >= this.maxSize) {
      // Find least recently used item
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const entry of Array.from(this.cache.entries())) {
        const [key, value] = entry;
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Get current cache size in bytes
   */
  private getCurrentSize(): number {
    let size = 0;
    for (const entry of Array.from(this.cache.entries())) {
      const value = entry[1];
      size += Buffer.byteLength(value.response, "utf8");
    }
    return size;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: number; hitRate: number } {
    const entries = this.cache.size;
    const size = this.getCurrentSize();

    let totalHits = 0;
    for (const entry of Array.from(this.cache.entries())) {
      const value = entry[1];
      totalHits += value.hits;
    }

    const hitRate = entries > 0 ? totalHits / entries : 0;

    return { size, entries, hitRate };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Global query cache instance
 */
export const globalQueryCache = new QueryCache(100);

/**
 * Apply optimization to query before LLM invocation
 */
export function applyOptimization(
  query: string,
  config: OptimizationConfig = DEFAULT_OPTIMIZATION_CONFIG
): { optimized: string; metrics: OptimizationMetrics } {
  const startTime = Date.now();

  let optimized = query;

  if (config.enableCompression) {
    optimized = optimizePrompt(query, config.compressionLevel);
  }

  const processingTime = Date.now() - startTime;
  const metrics = calculateCompressionMetrics(query, optimized, processingTime);

  return { optimized, metrics };
}
