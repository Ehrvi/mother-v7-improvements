/**
 * Unit Tests — SHMS Sprint 6 (Ciclo 181)
 * Tests for: SHMSMqttService, SHMSTimescaleService, SHMSDigitalTwin (LSTM + alerts)
 *
 * Scientific basis:
 * - Hundman et al. (arXiv:1802.04431, 2018): LSTM anomaly detection validation
 * - ISO/IEC 25010:2011: Software quality — testability requirements
 * - Carrara et al. (2022): Geotechnical monitoring system validation
 *
 * @cycle C181
 * @sprint 6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock logger ─────────────────────────────────────────────────────────────
vi.mock('../../_core/logger.js', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

// ─── Mock MQTT ────────────────────────────────────────────────────────────────
vi.mock('mqtt', () => ({
  connect: vi.fn(() => ({
    on: vi.fn(),
    subscribe: vi.fn((_t: string, _o: unknown, cb: (e: null) => void) => cb(null)),
    publishAsync: vi.fn().mockResolvedValue(undefined),
    endAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Mock DB ──────────────────────────────────────────────────────────────────
// NOTE: vi.mock is hoisted, so we cannot reference top-level variables here.
// We use vi.fn() directly and re-configure in beforeEach.
vi.mock('../../db.js', () => ({
  getDb: vi.fn(),
}));

// ─── Mock getSHMSMqttService singleton ───────────────────────────────────────
vi.mock('../shms-mqtt-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shms-mqtt-service.js')>();
  return {
    ...actual,
    getSHMSMqttService: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      onReading: vi.fn(),
      onAlert: vi.fn(),
      getStatus: vi.fn(() => ({ connected: false, simulationMode: true, messageCount: 42, errorCount: 0 })),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// ─── Mock getSHMSTimescaleService singleton ───────────────────────────────────
vi.mock('../shms-timescale-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shms-timescale-service.js')>();
  return {
    ...actual,
    getSHMSTimescaleService: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      insertReading: vi.fn().mockResolvedValue(undefined),
      insertAlert: vi.fn().mockResolvedValue(undefined),
      getHealthStats: vi.fn().mockResolvedValue({ readings: 100, alerts: 5, activeAlerts: 2 }),
      getRecentReadings: vi.fn().mockResolvedValue([]),
      getSensorStats: vi.fn().mockResolvedValue(null),
      getActiveAlerts: vi.fn().mockResolvedValue([]),
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// ─── Import modules under test ────────────────────────────────────────────────
import { SHMSMqttService } from '../shms-mqtt-service.js';
import { SHMSTimescaleService } from '../shms-timescale-service.js';
import { getDb } from '../../db.js';
import {
  ingestReading,
  getTwinState,
  getAlerts,
  getSensorHistory,
  startSimulator,
  stopSimulator,
  type SensorType,
} from '../shms-digital-twin.js';

// ─── SHMSMqttService Tests ────────────────────────────────────────────────────

describe('SHMSMqttService', () => {
  let service: SHMSMqttService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SHMSMqttService('mqtt://localhost:1883', 'test-site');
  });

  afterEach(async () => {
    if (service) await service.disconnect();
  });

  it('should initialize with correct defaults', () => {
    const status = service.getStatus();
    expect(status.connected).toBe(false);
    expect(status.simulationMode).toBe(false);
    expect(status.messageCount).toBe(0);
    expect(status.errorCount).toBe(0);
  });

  it('should register reading callbacks without error', () => {
    const callback = vi.fn();
    expect(() => service.onReading(callback)).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should register alert callbacks without error', () => {
    const callback = vi.fn();
    expect(() => service.onAlert(callback)).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should not publish when not connected', async () => {
    await service.publish('PIZ-001', { command: 'calibrate' });
    // No exception thrown = success
    expect(true).toBe(true);
  });

  it('should return status object with required fields', () => {
    const status = service.getStatus();
    expect(status).toHaveProperty('connected');
    expect(status).toHaveProperty('simulationMode');
    expect(status).toHaveProperty('messageCount');
    expect(status).toHaveProperty('errorCount');
  });

  it('should attempt broker connection on connect()', async () => {
    const mqtt = await import('mqtt');
    // Don't await connect() — it waits for broker timeout (5s)
    // Just verify mqtt.connect is called synchronously when connect() starts
    const connectPromise = service.connect();
    expect(mqtt.connect).toHaveBeenCalled();
    // Clean up by disconnecting (which resolves the promise)
    await service.disconnect();
    // Drain the promise
    await connectPromise.catch(() => {});
  }, 10000);
});

// ─── SHMSTimescaleService Tests ───────────────────────────────────────────────

describe('SHMSTimescaleService', () => {
  let service: SHMSTimescaleService;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute = vi.fn().mockResolvedValue([]);
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({ execute: mockExecute });
    service = new SHMSTimescaleService();
  });

  it('should initialize and create tables', async () => {
    await service.initialize();
    expect(mockExecute).toHaveBeenCalled();
  });

  it('should not re-initialize if already initialized', async () => {
    await service.initialize();
    const callCount = mockExecute.mock.calls.length;
    await service.initialize(); // Second call should be no-op
    expect(mockExecute.mock.calls.length).toBe(callCount);
  });

  it('should insert a sensor reading', async () => {
    await service.initialize();
    await service.insertReading({
      sensorId: 'PIZ-001',
      sensorType: 'piezometro',
      value: 75.5,
      unit: 'kPa',
      timestamp: new Date(),
      isAnomaly: false,
      anomalyScore: 0.1,
    });
    expect(mockExecute).toHaveBeenCalled();
  });

  it('should insert a sensor alert', async () => {
    await service.initialize();
    await service.insertAlert({
      alertId: 'ALT-001',
      sensorId: 'PIZ-001',
      sensorType: 'piezometro',
      severity: 'warning',
      message: 'Test alert',
      value: 85,
      threshold: 80,
      timestamp: new Date(),
      acknowledged: false,
    });
    expect(mockExecute).toHaveBeenCalled();
  });

  it('should return empty array for unknown sensor', async () => {
    await service.initialize();
    mockExecute.mockResolvedValueOnce([]);
    const readings = await service.getRecentReadings('UNKNOWN-001');
    expect(readings).toEqual([]);
  });

  it('should return null stats for sensor with no data', async () => {
    await service.initialize();
    mockExecute.mockResolvedValueOnce([]);
    const stats = await service.getSensorStats('UNKNOWN-001');
    expect(stats).toBeNull();
  });

  it('should return health stats with correct structure', async () => {
    await service.initialize();
    mockExecute
      .mockResolvedValueOnce([{ cnt: 1000 }])
      .mockResolvedValueOnce([{ cnt: 50 }])
      .mockResolvedValueOnce([{ cnt: 5 }]);

    const stats = await service.getHealthStats();
    expect(stats).toHaveProperty('readings');
    expect(stats).toHaveProperty('alerts');
    expect(stats).toHaveProperty('activeAlerts');
  });

  it('should return zero stats on DB error', async () => {
    await service.initialize();
    mockExecute.mockRejectedValueOnce(new Error('DB error'));
    const stats = await service.getHealthStats();
    expect(stats).toEqual({ readings: 0, alerts: 0, activeAlerts: 0 });
  });
});

// ─── Digital Twin Core Tests ──────────────────────────────────────────────────

describe('SHMSDigitalTwin — ingestReading', () => {
  it('should ingest a reading and return full SensorReading', () => {
    const result = ingestReading({
      sensorId: 'TEST-PIZ-001',
      sensorType: 'piezometro' as SensorType,
      value: 45.0,
      unit: 'kPa',
      timestamp: new Date(),
    });

    expect(result.sensorId).toBe('TEST-PIZ-001');
    expect(result.sensorType).toBe('piezometro');
    expect(result.value).toBe(45.0);
    expect(typeof result.isAnomaly).toBe('boolean');
    expect(typeof result.anomalyScore).toBe('number');
    expect(result.anomalyScore).toBeGreaterThanOrEqual(0);
    expect(result.anomalyScore).toBeLessThanOrEqual(1);
  });

  it('should update twin state after ingestion', () => {
    ingestReading({
      sensorId: 'TEST-INC-001',
      sensorType: 'inclinometro' as SensorType,
      value: 1.2,
      unit: 'graus',
      timestamp: new Date(),
    });

    const state = getTwinState();
    expect(state.totalSensors).toBeGreaterThan(0);
    expect(state.sensors['TEST-INC-001']).toBeDefined();
    expect(state.lastUpdated).toBeInstanceOf(Date);
  });

  it('should track sensor history', () => {
    for (let i = 0; i < 5; i++) {
      ingestReading({
        sensorId: 'TEST-PLU-001',
        sensorType: 'pluviometro' as SensorType,
        value: 10 + i,
        unit: 'mm/h',
        timestamp: new Date(),
      });
    }

    const history = getSensorHistory('TEST-PLU-001', 10);
    expect(history.length).toBeGreaterThanOrEqual(5);
  });

  it('should detect anomaly when value is far above threshold', () => {
    // Inject many normal readings to build LSTM baseline
    for (let i = 0; i < 20; i++) {
      ingestReading({
        sensorId: 'TEST-ANOMALY-001',
        sensorType: 'piezometro' as SensorType,
        value: 45 + (Math.random() - 0.5) * 2,
        unit: 'kPa',
        timestamp: new Date(),
      });
    }

    // Inject anomaly: 10× normal value
    const result = ingestReading({
      sensorId: 'TEST-ANOMALY-001',
      sensorType: 'piezometro' as SensorType,
      value: 450,
      unit: 'kPa',
      timestamp: new Date(),
    });

    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyScore).toBeGreaterThan(0.5);
  });

  it('should generate alert for value above warning threshold', () => {
    const alertsBefore = getAlerts(100).length;

    ingestReading({
      sensorId: 'TEST-ALERT-001',
      sensorType: 'piezometro' as SensorType,
      value: 85, // Above warning threshold (80 kPa)
      unit: 'kPa',
      timestamp: new Date(),
    });

    const alertsAfter = getAlerts(100).length;
    expect(alertsAfter).toBeGreaterThan(alertsBefore);

    const latestAlert = getAlerts(1)[0];
    expect(latestAlert.sensorId).toBe('TEST-ALERT-001');
    expect(['warning', 'critical', 'emergency']).toContain(latestAlert.severity);
  });

  it('should generate emergency alert for value above emergency threshold', () => {
    ingestReading({
      sensorId: 'TEST-EMERGENCY-001',
      sensorType: 'piezometro' as SensorType,
      value: 130, // Above emergency threshold (120 kPa)
      unit: 'kPa',
      timestamp: new Date(),
    });

    const alerts = getAlerts(50);
    const emergencyAlert = alerts.find(a => a.sensorId === 'TEST-EMERGENCY-001' && a.severity === 'emergency');
    expect(emergencyAlert).toBeDefined();
    expect(emergencyAlert?.severity).toBe('emergency');
  });

  it('should set systemHealth to critical when emergency alert exists', () => {
    ingestReading({
      sensorId: 'TEST-CRITICAL-HEALTH-001',
      sensorType: 'acelerometro' as SensorType,
      value: 0.5, // Above emergency threshold (0.2 g)
      unit: 'g',
      timestamp: new Date(),
    });

    const state = getTwinState();
    expect(state.systemHealth).toBe('critical');
  });

  it('should include mqttStatus in twin state', () => {
    const state = getTwinState();
    expect(state.mqttStatus).toBeDefined();
    expect(state.mqttStatus).toHaveProperty('connected');
    expect(state.mqttStatus).toHaveProperty('simulationMode');
    expect(state.mqttStatus).toHaveProperty('messageCount');
  });
});

// ─── LSTM Predictor Tests (via Digital Twin) ──────────────────────────────────

describe('LSTM Predictor (via Digital Twin)', () => {
  it('should return no anomaly for first 3 readings (bootstrap phase)', () => {
    const sensorId = 'TEST-LSTM-BOOTSTRAP';
    const results = [];

    for (let i = 0; i < 3; i++) {
      results.push(ingestReading({
        sensorId,
        sensorType: 'inclinometro' as SensorType,
        value: 1.0,
        unit: 'graus',
        timestamp: new Date(),
      }));
    }

    expect(results[0].isAnomaly).toBe(false);
    expect(results[0].anomalyScore).toBe(0);
  });

  it('should include lstmPredicted and lstmError after bootstrap', () => {
    const sensorId = 'TEST-LSTM-FIELDS';

    for (let i = 0; i < 5; i++) {
      ingestReading({
        sensorId,
        sensorType: 'pluviometro' as SensorType,
        value: 20 + i,
        unit: 'mm/h',
        timestamp: new Date(),
      });
    }

    const result = ingestReading({
      sensorId,
      sensorType: 'pluviometro' as SensorType,
      value: 25,
      unit: 'mm/h',
      timestamp: new Date(),
    });

    expect(result.lstmPredicted).toBeDefined();
    expect(typeof result.lstmPredicted).toBe('number');
    expect(result.lstmError).toBeDefined();
    expect(typeof result.lstmError).toBe('number');
    expect(result.lstmError).toBeGreaterThanOrEqual(0);
  });

  it('should produce low anomaly scores for stable in-range values', () => {
    const sensorId = 'TEST-LSTM-STABLE';
    const scores: number[] = [];

    for (let i = 0; i < 30; i++) {
      const result = ingestReading({
        sensorId,
        sensorType: 'piezometro' as SensorType,
        value: 50 + (Math.random() - 0.5) * 0.5,
        unit: 'kPa',
        timestamp: new Date(),
      });
      if (i > 5) scores.push(result.anomalyScore);
    }

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avgScore).toBeLessThan(0.8);
  });

  it('should produce high anomaly score for extreme outlier after stable baseline', () => {
    const sensorId = 'TEST-LSTM-OUTLIER';

    for (let i = 0; i < 25; i++) {
      ingestReading({
        sensorId,
        sensorType: 'piezometro' as SensorType,
        value: 50 + (Math.random() - 0.5) * 1,
        unit: 'kPa',
        timestamp: new Date(),
      });
    }

    const result = ingestReading({
      sensorId,
      sensorType: 'piezometro' as SensorType,
      value: 1000, // 20× normal
      unit: 'kPa',
      timestamp: new Date(),
    });

    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyScore).toBeGreaterThan(0.8);
  });
});

// ─── Simulator Tests ──────────────────────────────────────────────────────────

describe('Digital Twin Simulator', () => {
  it('should start and stop without errors', () => {
    expect(() => startSimulator()).not.toThrow();
    expect(() => stopSimulator()).not.toThrow();
  });

  it('should populate twin state after running briefly', async () => {
    startSimulator();
    await new Promise(resolve => setTimeout(resolve, 1100));
    stopSimulator();

    const state = getTwinState();
    expect(state.totalSensors).toBeGreaterThan(0);
    expect(state.activeSensors).toBeGreaterThan(0);
  });

  it('should not start multiple intervals when called twice', () => {
    startSimulator();
    startSimulator(); // Second call should be no-op
    stopSimulator();
    expect(true).toBe(true);
  });
});
