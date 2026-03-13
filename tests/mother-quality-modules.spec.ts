/**
 * Unit tests for MOTHER quality modules
 * Tests: context-scorer, response-normalizer, depth-controller,
 *        inline-verifier, memory-recall, quality-benchmark
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// memory-recall depends on ./embeddings which hits DB + OpenAI — mock it
vi.mock('../server/mother/embeddings', () => ({
  searchEpisodicMemory: vi.fn().mockResolvedValue([]),
}));

import {
  scoreAndFilterContexts,
  formatScoredContexts,
} from '../server/mother/context-scorer';

import { normalizeResponse } from '../server/mother/response-normalizer';

import {
  determineDepth,
  formatDepthInstructions,
  validateDepth,
} from '../server/mother/depth-controller';

import {
  verifyChunk,
  fixVerificationIssues,
  type VerificationIssue,
} from '../server/mother/inline-verifier';

import { proactiveRecall } from '../server/mother/memory-recall';
import { searchEpisodicMemory } from '../server/mother/embeddings';

import {
  BENCHMARK_QUERIES,
  evaluateBenchmarkResponse,
  aggregateBenchmarkResults,
} from '../server/mother/quality-benchmark';

// ─────────────────────────────────────────────────────────
// 1. context-scorer
// ─────────────────────────────────────────────────────────
describe('context-scorer', () => {
  it('includes context whose terms match the query', () => {
    const result = scoreAndFilterContexts('transformer architecture attention', [
      { source: 'crag', content: 'The transformer uses attention mechanisms to process sequences.' },
    ]);
    expect(result.includedContexts).toHaveLength(1);
    expect(result.includedContexts[0].relevanceScore).toBeGreaterThanOrEqual(0.4);
  });

  it('excludes context with no matching terms (below 0.4 threshold)', () => {
    const result = scoreAndFilterContexts('neural network training', [
      { source: 'episodic', content: 'Yesterday I went to the beach and had ice cream.' },
    ]);
    expect(result.includedContexts).toHaveLength(0);
    expect(result.scoredContexts[0].relevanceScore).toBeLessThan(0.4);
  });

  it('respects the 8000-token budget', () => {
    // Each content ~16000 chars / 4 = ~4000 tokens; two fit, third is cut off
    const bigContent = 'relevant '.repeat(1800); // ~16200 chars ≈ 4050 tokens
    const contexts = [
      { source: 'user_memory', content: bigContent },
      { source: 'episodic',    content: bigContent },
      { source: 'crag',        content: bigContent },
    ];
    const result = scoreAndFilterContexts('relevant', contexts);
    expect(result.totalTokensIncluded).toBeLessThanOrEqual(8000);
    expect(result.includedContexts.length).toBeLessThan(3);
  });

  it('respects source priority order: user_memory before episodic before crag', () => {
    const result = scoreAndFilterContexts('machine learning model', [
      { source: 'crag',        content: 'machine learning model overview' },
      { source: 'user_memory', content: 'machine learning model notes from user' },
      { source: 'episodic',    content: 'machine learning model past discussion' },
    ]);
    const sources = result.scoredContexts.map(c => c.source);
    expect(sources[0]).toBe('user_memory');
    expect(sources[1]).toBe('episodic');
    expect(sources[2]).toBe('crag');
  });

  it('formatScoredContexts returns empty string when nothing is included', () => {
    const result = scoreAndFilterContexts('xyz123notarealword', [
      { source: 'crag', content: 'completely unrelated banana pancake' },
    ]);
    expect(formatScoredContexts(result)).toBe('');
  });

  it('formatScoredContexts joins included contexts with double newline', () => {
    // Both contexts contain both query terms so both score above the 0.4 threshold
    const result = scoreAndFilterContexts('transformer attention', [
      { source: 'user_memory', content: 'Transformer uses attention mechanisms.' },
      { source: 'episodic',    content: 'Transformer attention mechanism explained in detail.' },
    ]);
    const formatted = formatScoredContexts(result);
    expect(formatted).toContain('Transformer uses attention mechanisms.');
    expect(formatted).toContain('Transformer attention mechanism explained');
    expect(formatted).toContain('\n\n');
  });
});

// ─────────────────────────────────────────────────────────
// 2. response-normalizer
// ─────────────────────────────────────────────────────────
describe('response-normalizer', () => {
  it('removes "Of course!" filler phrase', () => {
    const { normalized, changes } = normalizeResponse('Of course! Here is the answer.');
    expect(normalized).not.toMatch(/^Of course!/i);
    expect(changes).toContain('removed_filler');
  });

  it('removes "Certainly!" filler phrase', () => {
    const { normalized, changes } = normalizeResponse('Certainly! Let me explain.');
    expect(normalized).not.toMatch(/^Certainly!/i);
    expect(changes).toContain('removed_filler');
  });

  it('removes "Sure!" filler phrase', () => {
    const { normalized, changes } = normalizeResponse('Sure! Here you go.');
    expect(normalized).not.toMatch(/^Sure!/i);
    expect(changes).toContain('removed_filler');
  });

  it('removes "Revised Response:" prefix (Self-Refine artifact)', () => {
    const { normalized, changes } = normalizeResponse('Revised Response: The answer is 42.');
    expect(normalized).not.toMatch(/^Revised Response:/i);
    expect(changes).toContain('removed_filler');
  });

  it('does not add changes for a clean response', () => {
    const { changes } = normalizeResponse('The transformer architecture uses self-attention.');
    expect(changes).not.toContain('removed_filler');
  });

  it('stores the provider in the result', () => {
    const { provider } = normalizeResponse('Hello', 'gemini');
    expect(provider).toBe('gemini');
  });

  it('defaults provider to "unknown" when not passed', () => {
    const { provider } = normalizeResponse('Hello');
    expect(provider).toBe('unknown');
  });

  it('downgrades lone h1 headings to h2 (no mixed hierarchy)', () => {
    const input = '# Main Title\n\nSome content here without any h2.';
    const { normalized, changes } = normalizeResponse(input);
    expect(normalized).toMatch(/^## Main Title/m);
    expect(changes).toContain('downgraded_h1_to_h2');
  });

  it('unifies mixed bullet styles (converts * to -)', () => {
    const input = '* item one\n- item two\n* item three';
    const { normalized, changes } = normalizeResponse(input);
    expect(normalized).not.toMatch(/^\* /m);
    expect(changes).toContain('unified_bullet_style');
  });
});

// ─────────────────────────────────────────────────────────
// 3. depth-controller
// ─────────────────────────────────────────────────────────
describe('depth-controller', () => {
  it('TIER_1-style short factual query returns concise depth', () => {
    const target = determineDepth('What is AI?', 'factual', 0.2, 0);
    expect(target.level).toBe('concise');
    expect(target.maxWords).toBeLessThanOrEqual(150);
  });

  it('coding query returns deep depth with examples required', () => {
    const target = determineDepth('Implement a rate limiter in TypeScript', 'general', 0.5, 0);
    expect(target.level).toBe('deep');
    expect(target.requiresExamples).toBe(true);
  });

  it('TIER_3/4 research query with high complexity returns comprehensive depth', () => {
    const target = determineDepth(
      'Analyze the tradeoffs of multi-agent architectures vs single-agent LLMs',
      'research',
      0.8,
      0,
    );
    expect(target.level).toBe('comprehensive');
    expect(target.requiresCitations).toBe(true);
    expect(target.requiresSections).toBe(true);
  });

  it('short factual query produces shallower maxWords than long technical query', () => {
    const short = determineDepth('What is AI?', 'factual', 0.1, 0);
    const deep  = determineDepth('Implement a full semantic cache with vector similarity', 'coding', 0.9, 0);
    expect(short.maxWords).toBeLessThan(deep.maxWords);
  });

  it('formatDepthInstructions returns non-empty string containing depth level', () => {
    const target = determineDepth('Explain RAG', 'factual', 0.3, 0);
    const instructions = formatDepthInstructions(target);
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions).toContain(target.level.toUpperCase());
  });

  it('validateDepth returns passed=false when response is too short', () => {
    const target = determineDepth('Implement a semantic cache', 'coding', 0.5, 0);
    // target.level = 'deep', minWords = 150; "Short." is well below that
    const { passed, issues } = validateDepth('Short.', target);
    expect(passed).toBe(false);
    expect(issues.some(i => i.includes('too short'))).toBe(true);
  });

  it('validateDepth returns passed=true when response meets minWords', () => {
    const target = determineDepth('What is AI?', 'factual', 0.1, 0);
    // target.level = 'concise', minWords = 20
    const longEnough = 'word '.repeat(target.minWords + 5);
    const { passed } = validateDepth(longEnough, target);
    expect(passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// 4. inline-verifier
// ─────────────────────────────────────────────────────────
describe('inline-verifier', () => {
  it('detects "As MOTHER" self-reference in chunk', () => {
    const result = verifyChunk('As MOTHER, I can help you with that.', '', []);
    const selfRef = result.issues.find(i => i.type === 'self_reference');
    expect(selfRef).toBeDefined();
  });

  it('detects "Of course" filler at the start of a response', () => {
    const result = verifyChunk('Of course! Here is the answer.', '', []);
    const filler = result.issues.find(i => i.type === 'filler');
    expect(filler).toBeDefined();
  });

  it('detects "Certainly" filler at the start of a response', () => {
    const result = verifyChunk('Certainly! Let me explain.', '', []);
    const filler = result.issues.find(i => i.type === 'filler');
    expect(filler).toBeDefined();
  });

  it('returns no issues for a clean factual response', () => {
    const result = verifyChunk(
      'The transformer uses self-attention to relate tokens across the sequence.',
      '',
      [],
    );
    expect(result.issues).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it('fixVerificationIssues removes "As MOTHER" self-reference', () => {
    const issues: VerificationIssue[] = [
      { type: 'self_reference', position: 0, text: 'As MOTHER', severity: 'medium' },
    ];
    const fixed = fixVerificationIssues('As MOTHER, here is the answer.', issues);
    expect(fixed).not.toContain('As MOTHER');
  });

  it('fixVerificationIssues removes filler phrases at start', () => {
    const issues: VerificationIssue[] = [
      { type: 'filler', position: 0, text: 'Certainly', severity: 'low' },
    ];
    const fixed = fixVerificationIssues('Certainly! Here is the answer.', issues);
    expect(fixed).not.toMatch(/^Certainly/i);
  });
});

// ─────────────────────────────────────────────────────────
// 5. memory-recall
// ─────────────────────────────────────────────────────────
describe('memory-recall', () => {
  const mockSearch = searchEpisodicMemory as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSearch.mockResolvedValue([]);
  });

  it('"como falamos anteriormente" triggers reference pattern', async () => {
    const result = await proactiveRecall('como falamos anteriormente sobre RAG');
    expect(result.triggered).toBe(true);
  });

  it('"você disse" triggers reference pattern', async () => {
    const result = await proactiveRecall('você disse que transformers usam atenção');
    expect(result.triggered).toBe(true);
  });

  it('"last time" triggers reference pattern', async () => {
    const result = await proactiveRecall('last time we talked about this topic');
    expect(result.triggered).toBe(true);
  });

  it('"what is AI" does NOT trigger reference pattern', async () => {
    const result = await proactiveRecall('what is AI?');
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('no_reference_detected');
  });

  it('returns triggered=false with empty memories when no reference pattern matches', async () => {
    const result = await proactiveRecall('explain the difference between RAG and fine-tuning');
    expect(result.triggered).toBe(false);
    expect(result.memories).toHaveLength(0);
  });

  it('returns triggered=true with empty memories when reference matched but DB is empty', async () => {
    mockSearch.mockResolvedValue([]);
    const result = await proactiveRecall('como falamos anteriormente sobre barragens');
    expect(result.triggered).toBe(true);
    expect(result.memories).toHaveLength(0);
    expect(result.reason).toBe('reference_detected_but_no_memories_found');
  });

  it('populates contextSnippet and memories when DB returns results', async () => {
    mockSearch.mockResolvedValue([
      { query: 'Tell me about RAG', response: 'RAG retrieves documents.', similarity: 0.85, qualityScore: 90 },
    ]);
    const result = await proactiveRecall('como falamos sobre RAG');
    expect(result.triggered).toBe(true);
    expect(result.memories).toHaveLength(1);
    expect(result.contextSnippet).toContain('Previous Conversations');
  });
});

// ─────────────────────────────────────────────────────────
// 6. quality-benchmark
// ─────────────────────────────────────────────────────────
describe('quality-benchmark', () => {
  it('BENCHMARK_QUERIES has exactly 50 queries', () => {
    expect(BENCHMARK_QUERIES).toHaveLength(50);
  });

  it('has exactly 10 queries per category', () => {
    const categories = ['factual', 'analysis', 'creative', 'code', 'domain'] as const;
    for (const cat of categories) {
      const count = BENCHMARK_QUERIES.filter(q => q.category === cat).length;
      expect(count, `Expected 10 ${cat} queries, got ${count}`).toBe(10);
    }
  });

  it('evaluateBenchmarkResponse passes for a high-quality response containing all expected traits', () => {
    const query = BENCHMARK_QUERIES.find(q => q.id === 'F01')!;
    // expectedTraits: ['attention', 'encoder', 'decoder']
    const response = [
      '## Transformer Architecture',
      '',
      'The transformer architecture uses self-attention mechanisms to process sequences in parallel.',
      'It consists of an encoder and a decoder stack. The encoder processes the input, and the decoder',
      'generates the output. The attention mechanism computes weighted relationships between all tokens,',
      'allowing the model to capture long-range dependencies efficiently.',
    ].join('\n');
    const result = evaluateBenchmarkResponse(query, response, 85, 1200);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('evaluateBenchmarkResponse fails for an empty response', () => {
    const query = BENCHMARK_QUERIES[0];
    const result = evaluateBenchmarkResponse(query, '', 0, 500);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('evaluateBenchmarkResponse fails when quality score is below minimum threshold', () => {
    const query = BENCHMARK_QUERIES.find(q => q.id === 'F01')!; // minQualityScore: 80
    const response = 'attention encoder decoder '.repeat(30);
    const result = evaluateBenchmarkResponse(query, response, 50, 1000);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => i.includes('Quality'))).toBe(true);
  });

  it('aggregateBenchmarkResults sums passed and failed correctly', () => {
    const query = BENCHMARK_QUERIES[0];
    const mockResults = [
      evaluateBenchmarkResponse(query, 'attention encoder decoder '.repeat(30), 85, 500),
      evaluateBenchmarkResponse(query, '', 0, 200),
      evaluateBenchmarkResponse(query, 'attention encoder decoder '.repeat(30), 85, 500),
    ];
    const suite = aggregateBenchmarkResults('v7-test', mockResults);
    expect(suite.totalQueries).toBe(3);
    expect(suite.passed + suite.failed).toBe(3);
    expect(suite.passed).toBeGreaterThanOrEqual(0);
    expect(suite.failed).toBeGreaterThanOrEqual(0);
  });

  it('aggregateBenchmarkResults computes correct avgQualityScore', () => {
    const query = BENCHMARK_QUERIES[0];
    const r1 = evaluateBenchmarkResponse(query, 'attention encoder decoder '.repeat(30), 80, 500);
    const r2 = evaluateBenchmarkResponse(query, 'attention encoder decoder '.repeat(30), 90, 600);
    const suite = aggregateBenchmarkResults('v7-test', [r1, r2]);
    expect(suite.avgQualityScore).toBe(85);
  });
});
