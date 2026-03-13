/**
 * Benchmark runner tests — validates the quality evaluation framework.
 * No network, DB, or LLM calls. Pure logic tests.
 */

import { describe, it, expect } from 'vitest';

import {
  BENCHMARK_QUERIES,
  evaluateBenchmarkResponse,
  aggregateBenchmarkResults,
  type BenchmarkQuery,
  type BenchmarkResult,
} from '../server/mother/quality-benchmark';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build a response text that contains every expected trait for a query. */
function responseWithAllTraits(query: BenchmarkQuery, extraWords = 0): string {
  const traitSentence = query.expectedTraits.join(' and ') + '.';
  // Pad to well over 80 words so length checks pass for all categories
  const padding = 'This is a detailed and well-structured response. '.repeat(5 + extraWords);
  return `## Overview\n\n${padding}${traitSentence}`;
}

/** 50-word response — enough for factual but under the 80-word floor for others. */
function shortResponse(): string {
  return 'word '.repeat(50).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. evaluateBenchmarkResponse() scoring logic
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateBenchmarkResponse – scoring logic', () => {
  it('passes with no issues when response has all traits and meets score', () => {
    const query = BENCHMARK_QUERIES.find(q => q.id === 'F01')!;
    // Traits: ['attention', 'encoder', 'decoder']
    const response = responseWithAllTraits(query);
    const result = evaluateBenchmarkResponse(query, response, 85, 1000);

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('logs a missing-trait issue for every absent expected trait', () => {
    const query = BENCHMARK_QUERIES.find(q => q.id === 'F01')!;
    // Response deliberately omits all traits
    const response = 'This response says nothing relevant. '.repeat(10);
    const result = evaluateBenchmarkResponse(query, response, 85, 1000);

    const missingTraitIssues = result.issues.filter(i => i.startsWith('Missing trait:'));
    expect(missingTraitIssues.length).toBe(query.expectedTraits.length);
    expect(result.passed).toBe(false);
  });

  it('flags response below minQualityScore', () => {
    const query = BENCHMARK_QUERIES.find(q => q.id === 'F01')!; // minQualityScore: 80
    const response = responseWithAllTraits(query);
    const result = evaluateBenchmarkResponse(query, response, 60, 500);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes('Quality'))).toBe(true);
    expect(result.issues.some(i => i.includes('60'))).toBe(true);
  });

  it('fails a short (<80 word) response for a non-factual category', () => {
    // Use an analysis query — category !== 'factual' triggers the length check
    const query = BENCHMARK_QUERIES.find(q => q.category === 'analysis')!;
    const response = shortResponse(); // ~50 words
    const result = evaluateBenchmarkResponse(query, response, query.minQualityScore + 5, 1000);

    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.toLowerCase().includes('too short'))).toBe(true);
  });

  it('does NOT fail a short response for a factual query', () => {
    const query = BENCHMARK_QUERIES.find(q => q.category === 'factual')!;
    // Ensure traits are present even in a short text
    const response = query.expectedTraits.join(' ') + ' ' + 'word '.repeat(40);
    const result = evaluateBenchmarkResponse(query, response, query.minQualityScore + 5, 1000);

    const lengthIssue = result.issues.find(i => i.toLowerCase().includes('too short'));
    expect(lengthIssue).toBeUndefined();
  });

  it('sets hasCitations=true when response contains [1]-style references', () => {
    const query = BENCHMARK_QUERIES[0];
    const response = responseWithAllTraits(query) + ' See reference [1] and [2] for details.';
    const result = evaluateBenchmarkResponse(query, response, 85, 500);

    expect(result.hasCitations).toBe(true);
  });

  it('sets hasCitations=false when no bracket citations are present', () => {
    const query = BENCHMARK_QUERIES[0];
    const result = evaluateBenchmarkResponse(query, responseWithAllTraits(query), 85, 500);
    expect(result.hasCitations).toBe(false);
  });

  it('sets hasStructure=true when response contains ## headings', () => {
    const query = BENCHMARK_QUERIES[0];
    const response = '## Section\n\n' + responseWithAllTraits(query);
    const result = evaluateBenchmarkResponse(query, response, 85, 500);

    expect(result.hasStructure).toBe(true);
  });

  it('sets hasStructure=false when no ## headings are present', () => {
    const query = BENCHMARK_QUERIES[0];
    const traitText = query.expectedTraits.join(' ') + ' ' + 'word '.repeat(50);
    const result = evaluateBenchmarkResponse(query, traitText, 85, 500);

    expect(result.hasStructure).toBe(false);
  });

  it('result carries correct metadata fields', () => {
    const query = BENCHMARK_QUERIES.find(q => q.id === 'A01')!;
    const result = evaluateBenchmarkResponse(query, responseWithAllTraits(query), 78, 2500);

    expect(result.queryId).toBe('A01');
    expect(result.category).toBe('analysis');
    expect(result.latencyMs).toBe(2500);
    expect(result.qualityScore).toBe(78);
    expect(result.wordCount).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. aggregateBenchmarkResults()
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregateBenchmarkResults – aggregation logic', () => {
  function makeResult(category: string, score: number, passed: boolean): BenchmarkResult {
    return {
      queryId: `Q-${Math.random()}`,
      category,
      query: 'test query',
      qualityScore: score,
      latencyMs: 1000,
      hasCitations: false,
      hasStructure: false,
      wordCount: 100,
      passed,
      issues: passed ? [] : ['forced failure'],
    };
  }

  it('groups results correctly by category', () => {
    const results = [
      makeResult('factual', 85, true),
      makeResult('factual', 90, true),
      makeResult('analysis', 70, false),
    ];
    const suite = aggregateBenchmarkResults('v-test', results);

    expect(suite.categoryResults['factual'].total).toBe(2);
    expect(suite.categoryResults['analysis'].total).toBe(1);
  });

  it('calculates avgScore correctly per category', () => {
    const results = [
      makeResult('code', 80, true),
      makeResult('code', 100, true),
    ];
    const suite = aggregateBenchmarkResults('v-test', results);

    expect(suite.categoryResults['code'].avgScore).toBe(90);
  });

  it('counts passed and failed correctly', () => {
    const results = [
      makeResult('factual', 85, true),
      makeResult('factual', 85, true),
      makeResult('factual', 30, false),
    ];
    const suite = aggregateBenchmarkResults('v-test', results);

    expect(suite.passed).toBe(2);
    expect(suite.failed).toBe(1);
    expect(suite.totalQueries).toBe(3);
    expect(suite.passed + suite.failed).toBe(suite.totalQueries);
  });

  it('timestamp is a Date instance', () => {
    const suite = aggregateBenchmarkResults('v-test', [makeResult('factual', 80, true)]);
    expect(suite.timestamp).toBeInstanceOf(Date);
  });

  it('avgQualityScore rounds correctly', () => {
    const q = BENCHMARK_QUERIES[0];
    const r1 = evaluateBenchmarkResponse(q, responseWithAllTraits(q), 81, 500);
    const r2 = evaluateBenchmarkResponse(q, responseWithAllTraits(q), 82, 500);
    const suite = aggregateBenchmarkResults('v-test', [r1, r2]);
    // (81 + 82) / 2 = 81.5 → rounds to 82
    expect(suite.avgQualityScore).toBe(82);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Simulate a passing benchmark run
// ─────────────────────────────────────────────────────────────────────────────

describe('benchmark run – passing scenario', () => {
  it('achieves >= 80% pass rate across one query per category', () => {
    const categories = ['factual', 'analysis', 'creative', 'code', 'domain'] as const;

    const results: BenchmarkResult[] = categories.map(cat => {
      const query = BENCHMARK_QUERIES.find(q => q.category === cat)!;
      return evaluateBenchmarkResponse(
        query,
        responseWithAllTraits(query, 8), // extra words — ensures >80 words to pass length check
        92,
        1500,
      );
    });

    const suite = aggregateBenchmarkResults('v7-passing', results);
    const passRate = suite.passed / suite.totalQueries;

    expect(suite.totalQueries).toBe(5);
    expect(passRate).toBeGreaterThanOrEqual(0.8);
    expect(suite.avgQualityScore).toBeGreaterThanOrEqual(85);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Simulate a failing benchmark run
// ─────────────────────────────────────────────────────────────────────────────

describe('benchmark run – failing scenario', () => {
  it('all empty responses fail with appropriate issues', () => {
    const categories = ['factual', 'analysis', 'creative', 'code', 'domain'] as const;

    const results: BenchmarkResult[] = categories.map(cat => {
      const query = BENCHMARK_QUERIES.find(q => q.category === cat)!;
      return evaluateBenchmarkResponse(query, '', 0, 500);
    });

    for (const result of results) {
      expect(result.passed).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    }

    const suite = aggregateBenchmarkResults('v7-failing', results);
    expect(suite.failed).toBe(5);
    expect(suite.passed).toBe(0);
  });

  it('short responses for non-factual categories include a too-short issue', () => {
    const nonFactualCats = ['analysis', 'creative', 'code', 'domain'] as const;

    for (const cat of nonFactualCats) {
      const query = BENCHMARK_QUERIES.find(q => q.category === cat)!;
      const result = evaluateBenchmarkResponse(query, shortResponse(), 85, 500);

      const hasTooShort = result.issues.some(i => i.toLowerCase().includes('too short'));
      expect(hasTooShort, `Expected too-short issue for category '${cat}'`).toBe(true);
    }
  });
});
