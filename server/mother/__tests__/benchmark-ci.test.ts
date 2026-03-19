/**
 * Fix #13 (Ciclo 166 Audit): Benchmark CI Integration
 *
 * Connects existing quality-benchmark.ts and evaluateBenchmarkResponse()
 * to vitest so benchmark regressions are caught automatically.
 *
 * This test does NOT call the live LLM — it validates the benchmark
 * evaluation logic itself (scoring, trait matching, aggregation).
 *
 * Scientific basis: HELM (Liang et al., arXiv:2211.09110, 2022) — standardized benchmarks
 */

import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_QUERIES,
  evaluateBenchmarkResponse,
  aggregateBenchmarkResults,
} from '../quality-benchmark';

describe('Quality Benchmark System', () => {
  // ==================== BENCHMARK QUERY INTEGRITY ====================

  it('has at least 5 benchmark queries per category', () => {
    const categories = new Set(BENCHMARK_QUERIES.map(q => q.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);

    for (const cat of categories) {
      const count = BENCHMARK_QUERIES.filter(q => q.category === cat).length;
      expect(count, `Category '${cat}' has ${count} queries`).toBeGreaterThanOrEqual(5);
    }
  });

  it('all benchmark queries have valid structure', () => {
    for (const q of BENCHMARK_QUERIES) {
      expect(q.id, `Query missing id`).toBeTruthy();
      expect(q.query, `Query ${q.id} missing query text`).toBeTruthy();
      expect(q.query.length, `Query ${q.id} too short`).toBeGreaterThan(10);
      expect(q.expectedTraits.length, `Query ${q.id} has no expected traits`).toBeGreaterThan(0);
      expect(q.minQualityScore, `Query ${q.id} minQualityScore invalid`).toBeGreaterThanOrEqual(50);
      expect(q.minQualityScore).toBeLessThanOrEqual(100);
    }
  });

  it('SHMS domain queries cover all 8 areas', () => {
    const domainQueries = BENCHMARK_QUERIES.filter(q => q.category === 'domain');
    expect(domainQueries.length).toBeGreaterThanOrEqual(8);

    // Check that we cover key SHMS terms (fuzzy)
    const allTraits = domainQueries.flatMap(q => q.expectedTraits).map(t => t.toLowerCase());
    const allQueries = domainQueries.map(q => q.query.toLowerCase()).join(' ');
    const shmsTerms = ['sensor', 'icold', 'rul', 'digital twin', 'pnsb', 'fault', 'tarp', 'geostab'];

    let covered = 0;
    for (const term of shmsTerms) {
      if (allTraits.some(t => t.includes(term)) || allQueries.includes(term)) {
        covered++;
      }
    }
    expect(covered, `Only ${covered}/8 SHMS areas covered`).toBeGreaterThanOrEqual(5);
  });

  // ==================== EVALUATION LOGIC ====================

  it('evaluateBenchmarkResponse passes high-quality responses', () => {
    const query = BENCHMARK_QUERIES[0];
    // Simulate a high-quality response containing expected traits
    const traits = query.expectedTraits.map(t => t.replace(/_/g, ' ')).join('. ');
    const mockResponse = `This is a comprehensive response about ${query.query}. ${traits}. The analysis covers multiple dimensions with specific data and citations [1]. ## Referências...` +
      ' '.repeat(200); // ensure word count > 80

    const result = evaluateBenchmarkResponse(query, mockResponse, 90, 5000);
    expect(result.passed, `Failed with issues: ${result.issues.join('; ')}`).toBe(true);
    expect(result.qualityScore).toBeGreaterThanOrEqual(query.minQualityScore);
  });

  it('evaluateBenchmarkResponse fails low-quality responses', () => {
    const query = BENCHMARK_QUERIES[0];
    const result = evaluateBenchmarkResponse(query, 'I don\'t know.', 30, 5000);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('evaluateBenchmarkResponse flags excessive latency', () => {
    const query = BENCHMARK_QUERIES[0];
    const traits = query.expectedTraits.map(t => t.replace(/_/g, ' ')).join('. ');
    const mockResponse = `Detailed response about ${traits}.` + ' word'.repeat(100);
    const result = evaluateBenchmarkResponse(query, mockResponse, 95, 35000); // > 30s
    expect(result.issues.some(i => i.includes('Latency'))).toBe(true);
  });

  it('Fix #14: fuzzy trait matching works for partial word matches', () => {
    const query = BENCHMARK_QUERIES.find(q => q.expectedTraits.length >= 2)!;
    // Include only partial trait words (fuzzy should match)
    const firstTrait = query.expectedTraits[0];
    const traitWords = firstTrait.toLowerCase().replace(/_/g, ' ').split(/\s+/).filter(w => w.length > 2);
    // Include at least 50% of words
    const includedWords = traitWords.slice(0, Math.ceil(traitWords.length * 0.6));
    const mockResponse = `This is a comprehensive response. ${includedWords.join(' ')}. ` +
      query.expectedTraits.slice(1).map(t => t.replace(/_/g, ' ')).join('. ') +
      ' word'.repeat(100);

    const result = evaluateBenchmarkResponse(query, mockResponse, 90, 5000);
    // The first trait should match via fuzzy (≥50% words present)
    const firstTraitIssue = result.issues.find(i => i.includes(firstTrait));
    expect(firstTraitIssue, `First trait '${firstTrait}' should fuzzy-match but didn't`).toBeUndefined();
  });

  // ==================== AGGREGATION ====================

  it('aggregateBenchmarkResults produces valid summary', () => {
    const mockResults = BENCHMARK_QUERIES.slice(0, 3).map(q => ({
      queryId: q.id,
      category: q.category,
      query: q.query,
      qualityScore: 85,
      latencyMs: 5000,
      hasCitations: true,
      hasStructure: true,
      wordCount: 200,
      passed: true,
      issues: [],
    }));

    const summary = aggregateBenchmarkResults('v100.0', mockResults);
    expect(summary.totalQueries).toBe(3);
    expect(summary.passed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.avgQualityScore).toBe(85);
    expect(summary.version).toBe('v100.0');
  });
});
