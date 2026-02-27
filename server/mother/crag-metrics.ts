/**
 * MOTHER v74.8 — CRAG Metrics
 * 
 * NC-RAGAS-001: Context Precision/Recall missing from CRAG evaluation
 * NC-PERF-001: Reliability metrics (error rate, p95 latency, availability) missing from fitness_scorer
 * 
 * Scientific basis:
 * - RAGAS (Es et al., 2023, arXiv:2309.15217): Retrieval-Augmented Generation Assessment
 *   Context Precision@K = Σ(Precision@k × v_k) / K_relevant
 *   Context Recall = |relevant ∩ retrieved| / |relevant|
 * - ISO/IEC 25010:2023: Software Quality Model — Reliability sub-characteristics:
 *   Maturity, Availability, Fault Tolerance, Recoverability
 * - Google SRE Book (Beyer et al., 2016): Error Budget, p95/p99 latency targets
 */

// ─── Context Precision/Recall (NC-RAGAS-001) ─────────────────────────────────

/**
 * Calculate Context Precision@K
 * 
 * Formula (RAGAS, Es et al. 2023):
 *   CP@K = Σ_{k=1}^{K} (Precision@k × v_k) / total_relevant
 * 
 * Where:
 *   - Precision@k = relevant_chunks_at_k / k
 *   - v_k ∈ {0,1} = relevance indicator at rank k
 *   - total_relevant = number of relevant chunks in top K
 * 
 * Non-LLM implementation: uses TF-IDF-inspired term overlap
 * (suitable for real-time evaluation without additional LLM calls)
 */
export function calculateContextPrecision(
  query: string,
  retrievedChunks: string[]
): number {
  if (retrievedChunks.length === 0) return 0;

  const queryTerms = extractSignificantTerms(query);
  if (queryTerms.length === 0) return 0;

  let relevantCount = 0;
  let weightedPrecisionSum = 0;

  for (let k = 0; k < retrievedChunks.length; k++) {
    const chunk = retrievedChunks[k].toLowerCase();
    const isRelevant = queryTerms.some((term) => chunk.includes(term));

    if (isRelevant) {
      relevantCount++;
      const precisionAtK = relevantCount / (k + 1);
      weightedPrecisionSum += precisionAtK * 1; // v_k = 1 (relevant)
    }
  }

  if (relevantCount === 0) return 0;
  return weightedPrecisionSum / relevantCount;
}

/**
 * Calculate Context Recall
 * 
 * Formula (RAGAS, Es et al. 2023):
 *   CR = |relevant_terms_covered| / |total_query_terms|
 * 
 * Non-LLM implementation: checks if query terms appear in retrieved context
 */
export function calculateContextRecall(
  query: string,
  retrievedChunks: string[]
): number {
  const queryTerms = extractSignificantTerms(query);
  if (queryTerms.length === 0) return 0;
  if (retrievedChunks.length === 0) return 0;

  const combinedContext = retrievedChunks.join(' ').toLowerCase();

  const coveredTerms = queryTerms.filter((term) =>
    combinedContext.includes(term)
  );

  return coveredTerms.length / queryTerms.length;
}

/**
 * Extract significant terms from query (stop-word filtered, length > 3)
 * Approximates TF-IDF term importance without corpus statistics
 */
function extractSignificantTerms(text: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'what', 'how', 'when', 'where', 'who',
    'which', 'that', 'this', 'these', 'those', 'it', 'its', 'not', 'no',
    // Portuguese stop words
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das',
    'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'que', 'se',
    'é', 'são', 'foi', 'eram', 'ter', 'ser', 'estar', 'como', 'mais',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 3 && !STOP_WORDS.has(term));
}

/**
 * Combined RAGAS-style evaluation result
 */
export interface CRAGMetrics {
  contextPrecision: number;  // 0-1
  contextRecall: number;     // 0-1
  f1Score: number;           // harmonic mean of precision and recall
}

export function evaluateCRAGMetrics(
  query: string,
  retrievedChunks: string[]
): CRAGMetrics {
  const precision = calculateContextPrecision(query, retrievedChunks);
  const recall = calculateContextRecall(query, retrievedChunks);
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  return { contextPrecision: precision, contextRecall: recall, f1Score: f1 };
}

// ─── Reliability Metrics (NC-PERF-001) ───────────────────────────────────────

/**
 * Sliding window reliability tracker
 * 
 * ISO/IEC 25010:2023 Reliability sub-characteristics:
 * - Maturity: error rate < 1%
 * - Availability: uptime > 99.5%
 * - Fault Tolerance: p95 latency < 5000ms
 * 
 * Google SRE Book targets for internal AI services:
 * - p50 latency < 2000ms
 * - p95 latency < 5000ms
 * - p99 latency < 10000ms
 * - Error rate < 1%
 */
export interface ReliabilitySnapshot {
  errorRate: number;           // 0-1 (target: < 0.01)
  p50LatencyMs: number;        // target: < 2000ms
  p95LatencyMs: number;        // target: < 5000ms
  p99LatencyMs: number;        // target: < 10000ms
  availabilityPercent: number; // 0-100 (target: > 99.5)
  totalSamples: number;
  windowSizeMs: number;
}

interface LatencySample {
  latencyMs: number;
  isError: boolean;
  timestamp: number;
}

export class ReliabilityMetrics {
  private samples: LatencySample[] = [];
  private readonly windowSizeMs: number;
  private readonly maxSamples: number;

  constructor(windowSizeMs = 300_000, maxSamples = 1000) {
    this.windowSizeMs = windowSizeMs; // 5 minutes default
    this.maxSamples = maxSamples;
  }

  record(latencyMs: number, isError: boolean): void {
    const now = Date.now();
    this.samples.push({ latencyMs, isError, timestamp: now });

    // Evict old samples outside the window
    const cutoff = now - this.windowSizeMs;
    this.samples = this.samples
      .filter((s) => s.timestamp >= cutoff)
      .slice(-this.maxSamples);
  }

  snapshot(): ReliabilitySnapshot {
    if (this.samples.length === 0) {
      return {
        errorRate: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        availabilityPercent: 100,
        totalSamples: 0,
        windowSizeMs: this.windowSizeMs,
      };
    }

    const errors = this.samples.filter((s) => s.isError).length;
    const errorRate = errors / this.samples.length;

    const latencies = this.samples
      .map((s) => s.latencyMs)
      .sort((a, b) => a - b);

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    const availabilityPercent = (1 - errorRate) * 100;

    return {
      errorRate,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      availabilityPercent,
      totalSamples: this.samples.length,
      windowSizeMs: this.windowSizeMs,
    };
  }

  /**
   * Check if current metrics meet SLO targets (ISO/IEC 25010:2023)
   */
  meetsTargets(): { ok: boolean; violations: string[] } {
    const snap = this.snapshot();
    const violations: string[] = [];

    if (snap.errorRate > 0.01) {
      violations.push(
        `Error rate ${(snap.errorRate * 100).toFixed(2)}% exceeds 1% target`
      );
    }
    if (snap.p95LatencyMs > 5000) {
      violations.push(
        `p95 latency ${snap.p95LatencyMs}ms exceeds 5000ms target`
      );
    }
    if (snap.availabilityPercent < 99.5) {
      violations.push(
        `Availability ${snap.availabilityPercent.toFixed(2)}% below 99.5% target`
      );
    }

    return { ok: violations.length === 0, violations };
  }
}

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

// Singleton instance for MOTHER's fitness scorer
export const motherReliabilityMetrics = new ReliabilityMetrics();
