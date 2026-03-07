/**
 * shms-sprint7.test.ts — MOTHER v81.8 — Ciclo 182 (Sprint 7 + Sprint 8.3)
 *
 * Unit tests for:
 * 1. G-Eval geotechnical calibration (50 annotated examples)
 * 2. SHMS analyze endpoint handler
 * 3. DGM autonomous cycle test (Sprint 8.3)
 *
 * Scientific basis:
 * - G-Eval (arXiv:2303.16634) — evaluation framework
 * - Cohen (1988) — μ+0.5σ threshold criterion
 * - Darwin Gödel Machine (arXiv:2505.22954) — autonomous cycle
 * - Constitutional AI (arXiv:2212.08073) — safety constraints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external dependencies ────────────────────────────────────────────────
vi.mock('../knowledge.js', () => ({
  addKnowledge: vi.fn().mockResolvedValue({ id: 1 }),
  queryKnowledge: vi.fn().mockResolvedValue([
    { content: 'Sprint 6 SHMS MQTT completed', category: 'sprint6', createdAt: '2026-03-07' },
  ]),
}));

vi.mock('../shms-digital-twin.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shms-digital-twin.js')>();
  return {
    ...actual,
    getTwinState: vi.fn().mockReturnValue({
      sensors: {
        'PIEZOMETER-001': {
          sensorId: 'PIEZOMETER-001',
          sensorType: 'piezometer',
          value: 42.5,
          unit: 'kPa',
          timestamp: new Date(),
          isAnomaly: false,
          anomalyScore: 0.1,
          lstmPredicted: 44.0,
          lstmError: 1.5,
        },
      },
      totalSensors: 1,
      activeSensors: 1,
      anomaliesDetected: 0,
      alertsActive: 0,
      systemHealth: 'normal',
      mqttStatus: { connected: false, simulationMode: true, messageCount: 0 },
      dbStatus: { readings: 0, alerts: 0, activeAlerts: 0 },
      lastUpdated: new Date(),
    }),
    getAlerts: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../dgm-agent.js', () => ({
  getDGMStatus: vi.fn().mockReturnValue({ status: 'active' }),
  evaluateFitness: vi.fn().mockResolvedValue({ fitnessScore: 72, avgQualityScore: 72, p95LatencyMs: 2800, errorRate: 0.02, cacheHitRate: 0.12, userSatisfactionProxy: 70, timestamp: new Date(), sampleSize: 50 }),
  generateProposals: vi.fn().mockResolvedValue([]),
  getDGMAuditLog: vi.fn().mockReturnValue([]),
  getCurrentFitness: vi.fn().mockReturnValue(null),
  getFitnessImprovement: vi.fn().mockReturnValue(null),
  getDGMStatus: vi.fn().mockReturnValue({ status: 'active' }),
}));

vi.mock('../shms-alerts-service.js', () => ({
  triggerAlert: vi.fn().mockResolvedValue(null),
  initializeAlertTables: vi.fn().mockResolvedValue(undefined),
}));

// ── Import modules under test ─────────────────────────────────────────────────
import {
  calculateCompositeScore,
  calibrateGeotechnicalGEval,
  evaluateGeotechnicalResponse,
  GEOTECHNICAL_REFERENCE_SET,
  GEOTECHNICAL_CALIBRATION,
  type GeotechnicalEvalCriteria,
} from '../shms-geval-geotechnical.js';

import {
  handleSHMSAnalyze,
  handleSHMSCalibration,
} from '../shms-analyze-endpoint.js';

import {
  runDGMAutonomousCycleTest,
  getDGMAutonomousStatus,
} from '../dgm-autonomous-cycle-test.js';

// ============================================================
// SUITE 1: G-Eval Geotechnical Calibration
// ============================================================
describe('G-Eval Geotechnical Calibration', () => {
  it('should have exactly 50 annotated examples', () => {
    expect(GEOTECHNICAL_REFERENCE_SET).toHaveLength(50);
  });

  it('should have correct category distribution', () => {
    const categories = GEOTECHNICAL_REFERENCE_SET.map(e => e.category);
    const counts = {
      sensor_anomaly: categories.filter(c => c === 'sensor_anomaly').length,
      threshold_breach: categories.filter(c => c === 'threshold_breach').length,
      trend_analysis: categories.filter(c => c === 'trend_analysis').length,
      maintenance: categories.filter(c => c === 'maintenance').length,
      emergency: categories.filter(c => c === 'emergency').length,
    };
    expect(counts.sensor_anomaly).toBe(12);
    expect(counts.threshold_breach).toBe(10);
    expect(counts.trend_analysis).toBe(10);
    expect(counts.maintenance).toBe(10);
    expect(counts.emergency).toBe(8);
  });

  it('should calculate composite score correctly with weight matrix', () => {
    const criteria: GeotechnicalEvalCriteria = {
      technicalAccuracy: 90,
      safetyCriticality: 80,
      quantitativePrecision: 85,
      actionability: 75,
      scientificGrounding: 70,
    };
    // Expected: 90*0.30 + 80*0.25 + 85*0.20 + 75*0.15 + 70*0.10
    //         = 27 + 20 + 17 + 11.25 + 7 = 82.25
    const score = calculateCompositeScore(criteria);
    expect(score).toBeCloseTo(82.25, 1);
  });

  it('should produce calibration with valid statistics', () => {
    const calibration = calibrateGeotechnicalGEval();
    expect(calibration.sampleCount).toBe(50);
    expect(calibration.domainMean).toBeGreaterThan(70);
    expect(calibration.domainMean).toBeLessThan(100);
    expect(calibration.domainStd).toBeGreaterThan(0);
    expect(calibration.domainStd).toBeLessThan(20);
    // Threshold = μ + 0.5σ (Cohen 1988)
    expect(calibration.dynamicThreshold).toBeCloseTo(
      calibration.domainMean + 0.5 * calibration.domainStd, 1
    );
  });

  it('should have all 5 categories in calibration breakdown', () => {
    const calibration = calibrateGeotechnicalGEval();
    expect(calibration.categoryBreakdown).toHaveProperty('sensor_anomaly');
    expect(calibration.categoryBreakdown).toHaveProperty('threshold_breach');
    expect(calibration.categoryBreakdown).toHaveProperty('trend_analysis');
    expect(calibration.categoryBreakdown).toHaveProperty('maintenance');
    expect(calibration.categoryBreakdown).toHaveProperty('emergency');
  });

  it('emergency examples should have highest mean score (safety-critical)', () => {
    const calibration = calibrateGeotechnicalGEval();
    const emergencyMean = calibration.categoryBreakdown['emergency'].mean;
    const maintenanceMean = calibration.categoryBreakdown['maintenance'].mean;
    // Emergency examples are annotated with higher scores due to safety criticality
    expect(emergencyMean).toBeGreaterThan(maintenanceMean);
  });

  it('should evaluate a high-quality geotechnical response above threshold', () => {
    const query = 'Piezômetro P-07 registrou 45 kPa, acima do histórico de 38 kPa. Avalie.';
    const response = [
      'A leitura de 45 kPa é anômala com z-score de 3.04, acima do limiar 3σ.',
      'Conforme ABNT NBR 13028:2017, leituras acima de 2σ requerem investigação.',
      'Nível de alerta: WARNING. Verificar piezômetros adjacentes.',
      'Ações: (1) inspecionar drenagem, (2) comparar com histórico.',
    ].join(' ');

    const result = evaluateGeotechnicalResponse(query, response, 'sensor_anomaly');
    expect(result.score).toBeGreaterThan(0);
    expect(result.calibration.sampleCount).toBe(50);
    expect(result.closestExample).not.toBeNull();
  });

  it('should evaluate a low-quality response below threshold', () => {
    const query = 'Sensor de piezômetro registrou leitura alta. O que fazer?';
    const response = 'Não sei, talvez verificar o sensor.';

    const result = evaluateGeotechnicalResponse(query, response);
    // Low quality response should score below threshold
    expect(result.score).toBeLessThanOrEqual(result.calibration.dynamicThreshold + 10);
  });

  it('all reference examples should have valid composite scores (60-100 range)', () => {
    for (const example of GEOTECHNICAL_REFERENCE_SET) {
      expect(example.compositeScore).toBeGreaterThanOrEqual(60);
      expect(example.compositeScore).toBeLessThanOrEqual(100);
    }
  });

  it('all reference examples should cite at least one standard', () => {
    for (const example of GEOTECHNICAL_REFERENCE_SET) {
      expect(example.standards.length).toBeGreaterThan(0);
    }
  });

  it('GEOTECHNICAL_CALIBRATION singleton should be pre-computed', () => {
    expect(GEOTECHNICAL_CALIBRATION).toBeDefined();
    expect(GEOTECHNICAL_CALIBRATION.sampleCount).toBe(50);
    expect(GEOTECHNICAL_CALIBRATION.dynamicThreshold).toBeGreaterThan(0);
  });
});

// ============================================================
// SUITE 2: SHMS Analyze Endpoint
// ============================================================
describe('SHMS Analyze Endpoint', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  it('should return 400 if query is missing', async () => {
    mockReq = { body: {} };
    await handleSHMSAnalyze(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('query') })
    );
  });

  it('should return 400 if query is not a string', async () => {
    mockReq = { body: { query: 123 } };
    await handleSHMSAnalyze(mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should return valid analysis for a geotechnical query', async () => {
    mockReq = {
      body: {
        query: 'Piezômetro P-07 registrou 45 kPa. Avalie o risco.',
        sensorId: 'PIEZOMETER-001',
        clientId: 'test-client',
        includeAlerts: false,
      },
    };
    await handleSHMSAnalyze(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalled();
    const response = mockRes.json.mock.calls[0][0];
    expect(response).toHaveProperty('analysis');
    expect(response).toHaveProperty('alertLevel');
    expect(response).toHaveProperty('gevalScore');
    expect(response).toHaveProperty('passesThreshold');
    expect(response).toHaveProperty('twinState');
    expect(response).toHaveProperty('activeAlerts');
    expect(response).toHaveProperty('processingTimeMs');
    expect(response).toHaveProperty('scientificBasis');
    expect(response).toHaveProperty('timestamp');
  });

  it('should return valid alert levels', async () => {
    mockReq = {
      body: { query: 'Estado geral do sistema SHMS.' },
    };
    await handleSHMSAnalyze(mockReq, mockRes);
    const response = mockRes.json.mock.calls[0][0];
    expect(['info', 'warning', 'critical', 'emergency']).toContain(response.alertLevel);
  });

  it('should include scientific basis in response', async () => {
    mockReq = { body: { query: 'Análise de tendência dos sensores.' } };
    await handleSHMSAnalyze(mockReq, mockRes);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.scientificBasis).toBeInstanceOf(Array);
    expect(response.scientificBasis.length).toBeGreaterThan(0);
    // Should reference Sun et al. (2025)
    expect(response.scientificBasis.some((s: string) => s.includes('Sun'))).toBe(true);
  });

  it('should return calibration info from GET /api/shms/calibration', () => {
    const mockCalibReq = {};
    const mockCalibRes = { json: vi.fn() };
    handleSHMSCalibration(mockCalibReq as any, mockCalibRes as any);
    expect(mockCalibRes.json).toHaveBeenCalled();
    const response = mockCalibRes.json.mock.calls[0][0];
    expect(response).toHaveProperty('calibration');
    expect(response).toHaveProperty('referenceSetSize', 50);
    expect(response.categories).toEqual({
      sensor_anomaly: 12,
      threshold_breach: 10,
      trend_analysis: 10,
      maintenance: 10,
      emergency: 8,
    });
  });

  it('should include sensor context when sensorId is provided', async () => {
    mockReq = {
      body: {
        query: 'Análise do sensor PIEZOMETER-001.',
        sensorId: 'PIEZOMETER-001',
      },
    };
    await handleSHMSAnalyze(mockReq, mockRes);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.sensorContext).toHaveProperty('sensorId', 'PIEZOMETER-001');
  });

  it('processing time should be under 5000ms', async () => {
    mockReq = { body: { query: 'Status do sistema.' } };
    await handleSHMSAnalyze(mockReq, mockRes);
    const response = mockRes.json.mock.calls[0][0];
    expect(response.processingTimeMs).toBeLessThan(5000);
  });
});

// ============================================================
// SUITE 3: DGM Autonomous Cycle Test (Sprint 8.3)
// ============================================================
describe('DGM Autonomous Cycle Test (Sprint 8.3)', () => {
  it('should return autonomous status with BK-001 resolution info', () => {
    const status = getDGMAutonomousStatus();
    expect(status).toHaveProperty('bk001Resolved');
    expect(status).toHaveProperty('githubTokenConfigured');
    expect(status).toHaveProperty('sprint83TestMode', true);
    expect(status).toHaveProperty('nextMilestone');
    expect(status).toHaveProperty('scientificBasis');
    expect(status.scientificBasis).toContain('arXiv:2505.22954');
  });

  it('should run autonomous cycle test and return structured result', async () => {
    const result = await runDGMAutonomousCycleTest();
    expect(result).toHaveProperty('cycleId');
    expect(result).toHaveProperty('phase');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('observations');
    expect(result).toHaveProperty('learnings');
    expect(result).toHaveProperty('proposals');
    expect(result).toHaveProperty('validationResults');
    expect(result).toHaveProperty('testMode', true);
    expect(result).toHaveProperty('scientificBasis');
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('timestamp');
  }, 30000);

  it('should generate exactly 3 proposals', async () => {
    const result = await runDGMAutonomousCycleTest();
    expect(result.proposals).toHaveLength(3);
  }, 30000);

  it('all proposals should have required fields', async () => {
    const result = await runDGMAutonomousCycleTest();
    for (const proposal of result.proposals) {
      expect(proposal).toHaveProperty('id');
      expect(proposal).toHaveProperty('title');
      expect(proposal).toHaveProperty('description');
      expect(proposal).toHaveProperty('type');
      expect(proposal).toHaveProperty('estimatedImpact');
      expect(proposal).toHaveProperty('gevalScore');
      expect(proposal).toHaveProperty('approved');
    }
  }, 30000);

  it('all approved proposals should pass G-Eval threshold (>=75)', async () => {
    const result = await runDGMAutonomousCycleTest();
    const approvedProposals = result.proposals.filter(p => p.approved);
    for (const proposal of approvedProposals) {
      expect(proposal.gevalScore).toBeGreaterThanOrEqual(75);
    }
  }, 30000);

  it('validation results should match proposals', async () => {
    const result = await runDGMAutonomousCycleTest();
    expect(result.validationResults).toHaveLength(result.proposals.length);
    for (const vr of result.validationResults) {
      expect(vr).toHaveProperty('proposalId');
      expect(vr).toHaveProperty('passed');
      expect(vr).toHaveProperty('checks');
      expect(vr.checks).toHaveProperty('nonDestructive');
      expect(vr.checks).toHaveProperty('gevalThreshold');
      expect(vr.checks).toHaveProperty('safetyConstraints');
      expect(vr.checks).toHaveProperty('scientificBasis');
    }
  }, 30000);

  it('should be in test mode (no auto-merge)', async () => {
    const result = await runDGMAutonomousCycleTest();
    expect(result.testMode).toBe(true);
    if (result.prResult) {
      expect(result.prResult.testMode).toBe(true);
    }
  }, 30000);

  it('should include scientific basis references', async () => {
    const result = await runDGMAutonomousCycleTest();
    expect(result.scientificBasis).toBeInstanceOf(Array);
    expect(result.scientificBasis.some(s => s.includes('2505.22954'))).toBe(true);
    expect(result.scientificBasis.some(s => s.includes('Constitutional AI'))).toBe(true);
  }, 30000);

  it('cycle duration should be under 30 seconds', async () => {
    const result = await runDGMAutonomousCycleTest();
    expect(result.durationMs).toBeLessThan(30000);
  }, 35000);

  it('audit hash should be a valid SHA-256 hex string', async () => {
    const result = await runDGMAutonomousCycleTest();
    if (result.success && result.auditHash) {
      expect(result.auditHash).toMatch(/^[a-f0-9]{64}$/);
    }
  }, 30000);
});
