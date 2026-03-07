/**
 * dgm-sprint85.test.ts — Unit tests for DGM Cycle 3 (Sprint 8.5) and Sprint 8 quality
 *
 * Tests:
 * 1. DGM Cycle 3: executeDGMCycle3() — all 6 phases with REAL PR creation
 * 2. Sprint 8: runSprint8QualityBenchmark() — G-Eval quality measurement
 * 3. QueryComplexity enum: tierToComplexity() mapping
 * 4. RLVR reward signal: computeRLVRScore() computation
 *
 * Scientific basis:
 * - Darwin Gödel Machine (arXiv:2505.22954, 2025)
 * - G-Eval (arXiv:2303.16634, 2023) — quality evaluation
 * - RLVR (arXiv:2501.12948, 2025) — reward signal
 * - RouteLLM (arXiv:2406.18665, 2024) — QueryComplexity enum
 *
 * @cycle C184
 * @sprint 8.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// MOCKS
// ============================================================

vi.mock('../dgm-agent.js', () => ({
  getDGMStatus: vi.fn(() => ({
    status: 'active',
    auditLogSize: 184,
    lastCycle: 'C183',
  })),
  evaluateFitness: vi.fn(async () => ({
    fitnessScore: 0.782,
    gevalScore: 78.2,
    cacheHitRate: 0.12,
    avgLatencyMs: 8000,
  })),
  generateProposals: vi.fn(async () => []),
}));

vi.mock('../knowledge.js', () => ({
  addKnowledge: vi.fn(async () => ({ id: 999, title: 'test' })),
  queryKnowledge: vi.fn(async () => [
    {
      id: 1,
      title: 'DGM Sprint 8.4 Cycle 2',
      content: 'Second DGM autonomous cycle completed successfully in C183. Real GitHub API called.',
      source: 'dgm',
      category: 'dgm',
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      title: 'Sprint 3 DPO Tier-Gate',
      content: 'TIER_1/2 bypass active. P50 TIER_1 ~1.4s, TIER_3 ~25.6s with DPO active.',
      source: 'sprint3',
      category: 'latency',
      createdAt: new Date().toISOString(),
    },
  ]),
}));

vi.mock('../shms-geval-geotechnical.js', () => ({
  GEOTECHNICAL_CALIBRATION: {
    threshold: 91.5,
    dynamicThreshold: 91.5,
    domainMean: 88.0,
    domainStd: 7.0,
    examples: 50,
    domain: 'geotechnical',
    sampleCount: 50,
    calibratedAt: new Date().toISOString(),
    categoryBreakdown: {},
  },
  evaluateGeotechnicalResponse: vi.fn((_query: string, _response: string, _category?: string) => ({
    score: 82,
    closestExample: null,
    calibration: { threshold: 91.5, dynamicThreshold: 91.5 },
    passesThreshold: false, // 82 < 91.5 threshold
  })),
  calibrateGeotechnicalGEval: vi.fn(() => ({
    threshold: 91.5,
    dynamicThreshold: 91.5,
    domainMean: 88.0,
    domainStd: 7.0,
    sampleCount: 50,
    calibratedAt: new Date().toISOString(),
    categoryBreakdown: {},
  })),
}));

// Mock GitHubWriteService for REAL PR tests
vi.mock('../github-write-service.js', () => ({
  githubWriteService: {
    createBranch: vi.fn(async (branchName: string) => ({
      branchName,
      sha: 'abc123def456789012345678901234567890abcd',
    })),
    commitFile: vi.fn(async (_path: string, _content: string, _message: string, _branch: string) => ({
      sha: 'def456abc789012345678901234567890abcdef1',
      url: 'https://github.com/Ehrvi/mother-repo/commit/def456abc789',
      message: 'test commit',
    })),
    createPullRequest: vi.fn(async (title: string, _body: string, branch: string) => ({
      number: 42,
      url: `https://github.com/Ehrvi/mother-repo/pull/42`,
      title,
      branch,
    })),
    addPRComment: vi.fn(async () => undefined),
  },
}));

// ============================================================
// IMPORT UNDER TEST
// ============================================================

import { executeDGMCycle3 } from '../dgm-cycle3-sprint85.js';
import { runSprint8QualityBenchmark, updateQualityEMA } from '../sprint8-quality-improvement.js';
import {
  QueryComplexity,
  tierToComplexity,
  computeRLVRScore,
  type RoutingTier,
} from '../dgm-cycle3-additions.js';

// ============================================================
// TEST SUITE 1: DGM Cycle 3 — executeDGMCycle3()
// ============================================================

describe('DGM Cycle 3 — Sprint 8.5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = 'test-github-token-c184';
    process.env.MQTT_BROKER_URL = 'mqtts://5d8c986a8de24d1d9d92cbd55fcd75d7.s1.eu.hivemq.cloud:8883';
  });

  it('should return a valid DGMCycle3Result structure', async () => {
    const result = await executeDGMCycle3();

    expect(result).toBeDefined();
    expect(result.cycleNumber).toBe(3);
    expect(result.sprint).toBe('8.5');
    expect(result.autoMerge).toBe(false); // ALWAYS false
    expect(result.testMode).toBe(false);  // REAL PR mode
    expect(result.cycleId).toMatch(/^dgm-c3-\d+$/);
    expect(result.timestamp).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should complete all 6 phases successfully', async () => {
    const result = await executeDGMCycle3();

    expect(result.phase).toBe('complete');
    expect(result.success).toBe(true);
  });

  it('should create a REAL PR (not test mode)', async () => {
    const result = await executeDGMCycle3();

    expect(result.realPRCreated).toBe(true);
    expect(result.prUrl).toContain('github.com/Ehrvi/mother-repo/pull/');
    expect(result.prNumber).toBe(42);
  });

  it('should create a real branch with correct naming convention', async () => {
    const result = await executeDGMCycle3();

    expect(result.branchName).toMatch(/^autonomous\/dgm-cycle3-sprint85-\d+$/);
  });

  it('should call GitHubWriteService.createBranch and commitFile', async () => {
    const { githubWriteService } = await import('../github-write-service.js');
    await executeDGMCycle3();

    expect(githubWriteService.createBranch).toHaveBeenCalledWith(
      expect.stringMatching(/^autonomous\/dgm-cycle3-sprint85-\d+$/)
    );
    expect(githubWriteService.commitFile).toHaveBeenCalled();
    expect(githubWriteService.createPullRequest).toHaveBeenCalled();
  });

  it('should generate a valid audit hash (SHA-256)', async () => {
    const result = await executeDGMCycle3();

    expect(result.auditHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should persist to bd_central', async () => {
    const { addKnowledge } = await import('../knowledge.js');
    const result = await executeDGMCycle3();

    expect(result.bdCentralPersisted).toBe(true);
    expect(addKnowledge).toHaveBeenCalledWith(
      expect.stringContaining('DGM Cycle 3 Sprint 8.5'),
      expect.stringContaining('Ciclo 184 Sprint 8.5'),
      'dgm',
      'autonomous',
      'dgm',
    );
  });

  it('should set proposalScore above G-Eval threshold (75)', async () => {
    const result = await executeDGMCycle3();

    expect(result.proposalScore).toBeGreaterThanOrEqual(75);
  });

  it('should set readyForAutoMerge=true after successful PR creation', async () => {
    const result = await executeDGMCycle3();

    expect(result.readyForAutoMerge).toBe(true);
  });

  it('should fail gracefully when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    const result = await executeDGMCycle3();

    // Should fail at commit phase (createBranch requires token)
    expect(result.success).toBe(false);
    expect(result.realPRCreated).toBe(false);
    expect(result.readyForAutoMerge).toBe(false);
  });

  it('should include QueryComplexity enum in proposal files', async () => {
    const result = await executeDGMCycle3();

    // Proposal should include the QueryComplexity enum file
    expect(result.proposalTitle).toContain('QueryComplexity');
  });
});

// ============================================================
// TEST SUITE 2: Sprint 8 Quality Benchmark
// ============================================================

describe('Sprint 8 Quality Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run benchmark on 20 geotechnical queries', async () => {
    const report = await runSprint8QualityBenchmark();

    expect(report.totalBenchmarked).toBe(20);
    expect(report.benchmarkResults).toHaveLength(20);
  });

  it('should return a valid Sprint8QualityReport structure', async () => {
    const report = await runSprint8QualityBenchmark();

    expect(report.sprint).toBe('8');
    expect(report.cycleId).toMatch(/^sprint8-c184-\d+$/);
    expect(report.timestamp).toBeDefined();
    expect(report.averageGevalScore).toBeGreaterThan(0);
    expect(report.passRate).toBeGreaterThanOrEqual(0);
    expect(report.passRate).toBeLessThanOrEqual(1);
  });

  it('should compute quality trend with EMA', async () => {
    const report = await runSprint8QualityBenchmark();

    expect(report.qualityTrend).toBeDefined();
    expect(report.qualityTrend.targetScore).toBe(85);
    expect(report.qualityTrend.emaScore).toBeGreaterThan(0);
    expect(['improving', 'stable', 'degrading']).toContain(report.qualityTrend.trend);
  });

  it('should persist benchmark results to bd_central', async () => {
    const { addKnowledge } = await import('../knowledge.js');
    const report = await runSprint8QualityBenchmark();

    expect(report.bdCentralPersisted).toBe(true);
    expect(addKnowledge).toHaveBeenCalledWith(
      expect.stringContaining('Sprint 8 Quality Benchmark'),
      expect.stringContaining('Ciclo 184 Sprint 8'),
      'quality',
      'sprint8_c184_benchmark',
      'quality',
    );
  });

  it('should identify low-quality responses for DPO retraining', async () => {
    const report = await runSprint8QualityBenchmark();

    // DPO queue should only contain entries with score < 70
    for (const entry of report.dpoRetrainingQueue) {
      expect(entry.gevalScore).toBeLessThan(70);
    }
  });
});

// ============================================================
// TEST SUITE 3: QueryComplexity Enum (Sprint 3 pending item)
// ============================================================

describe('QueryComplexity Enum — Sprint 3 type safety', () => {
  it('should define all 4 complexity levels', () => {
    expect(QueryComplexity.SIMPLE).toBe('SIMPLE');
    expect(QueryComplexity.MEDIUM).toBe('MEDIUM');
    expect(QueryComplexity.COMPLEX).toBe('COMPLEX');
    expect(QueryComplexity.EXPERT).toBe('EXPERT');
  });

  it('should map TIER_1 to SIMPLE', () => {
    const complexity = tierToComplexity('TIER_1' as RoutingTier);
    expect(complexity).toBe(QueryComplexity.SIMPLE);
  });

  it('should map TIER_2 to MEDIUM', () => {
    const complexity = tierToComplexity('TIER_2' as RoutingTier);
    expect(complexity).toBe(QueryComplexity.MEDIUM);
  });

  it('should map TIER_3 to COMPLEX', () => {
    const complexity = tierToComplexity('TIER_3' as RoutingTier);
    expect(complexity).toBe(QueryComplexity.COMPLEX);
  });

  it('should map TIER_4 to EXPERT', () => {
    const complexity = tierToComplexity('TIER_4' as RoutingTier);
    expect(complexity).toBe(QueryComplexity.EXPERT);
  });
});

// ============================================================
// TEST SUITE 4: RLVR Reward Signal
// ============================================================

describe('RLVR Reward Signal — Sprint 8 quality', () => {
  it('should compute composite RLVR score correctly', () => {
    const signal = computeRLVRScore({
      faithfulness: 0.9,
      relevance: 0.85,
      coherence: 0.8,
      depth: 0.75,
      obedience: 0.95,
      tier: 'TIER_3' as RoutingTier,
    });

    // Expected: 0.9*0.30 + 0.85*0.25 + 0.8*0.20 + 0.75*0.15 + 0.95*0.10
    // = 0.27 + 0.2125 + 0.16 + 0.1125 + 0.095 = 0.85
    expect(signal.compositeScore).toBeCloseTo(0.85, 2);
    expect(signal.complexity).toBe(QueryComplexity.COMPLEX);
    expect(signal.flaggedForRetraining).toBe(false); // 0.85 > 0.7
    expect(signal.timestamp).toBeDefined();
  });

  it('should flag low-quality responses for retraining', () => {
    const signal = computeRLVRScore({
      faithfulness: 0.5,
      relevance: 0.4,
      coherence: 0.6,
      depth: 0.3,
      obedience: 0.7,
      tier: 'TIER_1' as RoutingTier,
    });

    // Expected: 0.5*0.30 + 0.4*0.25 + 0.6*0.20 + 0.3*0.15 + 0.7*0.10
    // = 0.15 + 0.10 + 0.12 + 0.045 + 0.07 = 0.485
    expect(signal.compositeScore).toBeLessThan(0.7);
    expect(signal.flaggedForRetraining).toBe(true);
    expect(signal.complexity).toBe(QueryComplexity.SIMPLE);
  });

  it('should include all required fields in RLVR signal', () => {
    const signal = computeRLVRScore({
      faithfulness: 0.8,
      relevance: 0.8,
      coherence: 0.8,
      depth: 0.8,
      obedience: 0.8,
      tier: 'TIER_2' as RoutingTier,
    });

    expect(signal).toHaveProperty('faithfulness');
    expect(signal).toHaveProperty('relevance');
    expect(signal).toHaveProperty('coherence');
    expect(signal).toHaveProperty('depth');
    expect(signal).toHaveProperty('obedience');
    expect(signal).toHaveProperty('compositeScore');
    expect(signal).toHaveProperty('complexity');
    expect(signal).toHaveProperty('flaggedForRetraining');
    expect(signal).toHaveProperty('timestamp');
    expect(signal.complexity).toBe(QueryComplexity.MEDIUM);
  });
});

// ============================================================
// TEST SUITE 5: EMA Quality Trend
// ============================================================

describe('EMA Quality Trend — Sprint 8 monitoring', () => {
  it('should compute EMA trend correctly', () => {
    const trend = updateQualityEMA(82.0);

    expect(trend.currentScore).toBe(82.0);
    expect(trend.targetScore).toBe(85);
    expect(trend.emaScore).toBeGreaterThan(0);
    expect(['improving', 'stable', 'degrading']).toContain(trend.trend);
    expect(trend.gapToTarget).toBeGreaterThanOrEqual(0);
  });

  it('should detect improving trend when score increases', () => {
    // First update with low score
    updateQualityEMA(70.0);
    // Second update with high score (should show improving)
    const trend = updateQualityEMA(90.0);

    expect(trend.trend).toBe('improving');
  });
});
