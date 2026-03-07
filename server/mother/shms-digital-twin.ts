/**
 * SHMS Digital Twin — Sprint 6 v2.0 (Ciclo 181)
 * Sistema de Monitoramento de Saúde de Estruturas — Digital Twin Core
 *
 * Scientific basis:
 * - Hundman et al. (arXiv:1802.04431, 2018): LSTM-based anomaly detection for telemetry
 * - Grieves & Vickers (2017): Digital Twin concept for structural health monitoring
 * - ISO 19115-1:2014: Geographic information — Metadata for geospatial sensor data
 * - Sun et al. (2025): IoT-based SHM with real-time MQTT ingestion
 * - Carrara et al. (2022): Real-time geotechnical monitoring systems
 * - GeoMCP (arXiv:2603.01022, 2026): Geotechnical monitoring with AI
 * - TimescaleDB (Freedman et al., 2018): Time-series storage for IoT
 *
 * Architecture (Sprint 6):
 *   IoT Sensors → MQTT Broker → SHMSMqttService → ingestReading()
 *                                                 → LSTMPredictor (anomaly)
 *                                                 → SHMSTimescaleService (persist)
 *                                                 → AlertDispatcher (4 severity levels)
 *                                                 → TwinState (in-memory)
 *
 * @module shms-digital-twin
 * @version 2.0.0
 * @cycle C181
 */

import { createLogger } from '../_core/logger.js';
const log = createLogger('SHMS-Twin');
import { getSHMSMqttService } from './shms-mqtt-service.js';
import { getSHMSTimescaleService } from './shms-timescale-service.js';

// ─── Core Types ──────────────────────────────────────────────────────────────

export type SensorType =
  | 'piezometro'
  | 'inclinometro'
  | 'placa_recalque'
  | 'medidor_trinca'
  | 'pluviometro'
  | 'acelerometro';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

export interface SensorReading {
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: Date;
  latitude?: number;
  longitude?: number;
  depth?: number;
  isAnomaly: boolean;
  anomalyScore: number;
  lstmPredicted?: number;   // LSTM one-step-ahead prediction
  lstmError?: number;       // |actual - predicted|
}

export interface SensorAlert {
  alertId: string;
  sensorId: string;
  sensorType: SensorType;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
}

export interface TwinState {
  lastUpdated: Date;
  totalSensors: number;
  activeSensors: number;
  anomaliesDetected: number;
  alertsActive: number;
  sensors: Record<string, SensorReading>;
  systemHealth: 'normal' | 'degraded' | 'critical';
  mqttStatus: { connected: boolean; simulationMode: boolean; messageCount: number };
  dbStatus: { readings: number; alerts: number; activeAlerts: number };
}

// ─── Thresholds (Carrara et al. 2022, adapted) ───────────────────────────────

const THRESHOLDS: Record<SensorType, { warning: number; critical: number; emergency: number; unit: string }> = {
  piezometro:      { warning: 80,   critical: 100,  emergency: 120,  unit: 'kPa' },
  inclinometro:    { warning: 2.0,  critical: 3.5,  emergency: 5.0,  unit: 'graus' },
  placa_recalque:  { warning: 15,   critical: 25,   emergency: 40,   unit: 'mm' },
  medidor_trinca:  { warning: 0.5,  critical: 1.0,  emergency: 2.0,  unit: 'mm' },
  pluviometro:     { warning: 50,   critical: 80,   emergency: 120,  unit: 'mm/h' },
  acelerometro:    { warning: 0.05, critical: 0.1,  emergency: 0.2,  unit: 'g' },
};

// ─── LSTM Predictor (Hundman et al. 2018) ────────────────────────────────────

/**
 * Lightweight LSTM-inspired predictor using exponential smoothing.
 * Full TensorFlow.js LSTM is the production target (Sprint 9).
 * This implementation uses Holt's double exponential smoothing as a
 * statistically sound approximation for one-step-ahead prediction.
 *
 * Reference: Holt (1957), Brown (1959) — exponential smoothing for time series.
 * RMSE threshold for anomaly: 2× historical RMSE (Hundman et al. 2018, §4.2).
 */
class LSTMPredictor {
  private level: number | null = null;
  private trend: number | null = null;
  private readonly alpha = 0.3;  // level smoothing
  private readonly beta = 0.1;   // trend smoothing
  private readonly history: number[] = [];
  private readonly maxHistory = 100;
  private rmseHistory: number[] = [];

  /**
   * Predict next value and compute anomaly score.
   * Returns { predicted, error, isAnomaly, anomalyScore }
   */
  predict(value: number): { predicted: number; error: number; isAnomaly: boolean; anomalyScore: number } {
    this.history.push(value);
    if (this.history.length > this.maxHistory) this.history.shift();

    // Bootstrap: need at least 3 points
    if (this.history.length < 3) {
      return { predicted: value, error: 0, isAnomaly: false, anomalyScore: 0 };
    }

    // Initialize level and trend from first two points
    if (this.level === null) {
      this.level = this.history[0];
      this.trend = this.history[1] - this.history[0];
    }

    // Holt's double exponential smoothing update
    const prevLevel = this.level;
    const prevTrend = this.trend!;
    this.level = this.alpha * value + (1 - this.alpha) * (prevLevel + prevTrend);
    this.trend = this.beta * (this.level - prevLevel) + (1 - this.beta) * prevTrend;

    // One-step-ahead prediction (made before seeing current value)
    const predicted = prevLevel + prevTrend;
    const error = Math.abs(value - predicted);

    // Track RMSE history
    this.rmseHistory.push(error);
    if (this.rmseHistory.length > 50) this.rmseHistory.shift();

    // Anomaly: error > 2× mean historical error (Hundman et al. 2018)
    const meanError = this.rmseHistory.reduce((a, b) => a + b, 0) / this.rmseHistory.length;
    const threshold = Math.max(meanError * 2, 0.001);
    const anomalyScore = Math.min(error / threshold, 1.0);
    const isAnomaly = anomalyScore > 0.8;

    return { predicted, error, isAnomaly, anomalyScore };
  }

  reset(): void {
    this.level = null;
    this.trend = null;
    this.history.length = 0;
    this.rmseHistory.length = 0;
  }
}

// ─── In-memory state ─────────────────────────────────────────────────────────

const twinStore: TwinState = {
  lastUpdated: new Date(),
  totalSensors: 0,
  activeSensors: 0,
  anomaliesDetected: 0,
  alertsActive: 0,
  sensors: {},
  systemHealth: 'normal',
  mqttStatus: { connected: false, simulationMode: false, messageCount: 0 },
  dbStatus: { readings: 0, alerts: 0, activeAlerts: 0 },
};

const alertHistory: SensorAlert[] = [];
const sensorHistory: Record<string, SensorReading[]> = {};
const MAX_HISTORY = 1000;
const lstmPredictors: Record<string, LSTMPredictor> = {};

// ─── Alert Dispatcher (4 severity levels) ────────────────────────────────────

/**
 * Dispatch alert based on sensor reading.
 * 4 severity levels: info → warning → critical → emergency
 * Persists to TimescaleDB asynchronously.
 */
function dispatchAlert(reading: SensorReading): void {
  const thresh = THRESHOLDS[reading.sensorType];
  if (!thresh) return;

  let severity: AlertSeverity | null = null;
  let threshold = 0;

  if (reading.value >= thresh.emergency) {
    severity = 'emergency';
    threshold = thresh.emergency;
  } else if (reading.value >= thresh.critical) {
    severity = 'critical';
    threshold = thresh.critical;
  } else if (reading.value >= thresh.warning) {
    severity = 'warning';
    threshold = thresh.warning;
  } else if (reading.isAnomaly) {
    severity = 'info';
    threshold = thresh.warning * 0.8;
  }

  if (!severity) return;

  const alert: SensorAlert = {
    alertId: `ALT-${Date.now()}-${reading.sensorId}`,
    sensorId: reading.sensorId,
    sensorType: reading.sensorType,
    severity,
    message: `[${severity.toUpperCase()}] ${reading.sensorId} (${reading.sensorType}): ${reading.value.toFixed(3)} ${thresh.unit} — limiar ${threshold} ${thresh.unit}`,
    value: reading.value,
    threshold,
    timestamp: reading.timestamp,
    acknowledged: false,
  };

  alertHistory.unshift(alert);
  if (alertHistory.length > 500) alertHistory.pop();

  // Persist to DB asynchronously (non-blocking)
  getSHMSTimescaleService().insertAlert(alert).catch((err) => {
    log.warn(`[SHMS-Twin] Failed to persist alert: ${err}`);
  });

  if (severity === 'emergency' || severity === 'critical') {
    log.warn(`[SHMS-Twin] ${alert.message}`);
  }
}

// ─── Core ingestion function ──────────────────────────────────────────────────

/**
 * Ingest a sensor reading into the Digital Twin.
 * Pipeline: Z-score anomaly → LSTM predictor → threshold check → alert dispatch → persist
 */
export function ingestReading(reading: Omit<SensorReading, 'isAnomaly' | 'anomalyScore'>): SensorReading {
  // Initialize LSTM predictor per sensor
  if (!lstmPredictors[reading.sensorId]) {
    lstmPredictors[reading.sensorId] = new LSTMPredictor();
  }

  // LSTM prediction
  const lstm = lstmPredictors[reading.sensorId].predict(reading.value);

  const fullReading: SensorReading = {
    ...reading,
    isAnomaly: lstm.isAnomaly,
    anomalyScore: lstm.anomalyScore,
    lstmPredicted: parseFloat(lstm.predicted.toFixed(4)),
    lstmError: parseFloat(lstm.error.toFixed(4)),
  };

  // Update twin state
  twinStore.sensors[reading.sensorId] = fullReading;
  twinStore.lastUpdated = new Date();
  twinStore.totalSensors = Object.keys(twinStore.sensors).length;
  twinStore.activeSensors = twinStore.totalSensors;
  twinStore.anomaliesDetected = Object.values(twinStore.sensors).filter(s => s.isAnomaly).length;

  // Update sensor history
  if (!sensorHistory[reading.sensorId]) sensorHistory[reading.sensorId] = [];
  sensorHistory[reading.sensorId].unshift(fullReading);
  if (sensorHistory[reading.sensorId].length > MAX_HISTORY) sensorHistory[reading.sensorId].pop();

  // Dispatch alerts
  dispatchAlert(fullReading);

  // Update alert counts
  twinStore.alertsActive = alertHistory.filter(a => !a.acknowledged).length;
  const emergencyAlerts = alertHistory.filter(a => !a.acknowledged && a.severity === 'emergency').length;
  const criticalAlerts = alertHistory.filter(a => !a.acknowledged && a.severity === 'critical').length;
  twinStore.systemHealth = emergencyAlerts > 0 ? 'critical' : criticalAlerts > 0 ? 'degraded' : 'normal';

  // Persist to TimescaleDB asynchronously (non-blocking)
  getSHMSTimescaleService().insertReading(fullReading).catch((err) => {
    log.warn(`[SHMS-Twin] Failed to persist reading: ${err}`);
  });

  return fullReading;
}

// ─── State accessors ─────────────────────────────────────────────────────────

export function getTwinState(): TwinState {
  // Update MQTT status
  const mqttStatus = getSHMSMqttService().getStatus();
  twinStore.mqttStatus = {
    connected: mqttStatus.connected,
    simulationMode: mqttStatus.simulationMode,
    messageCount: mqttStatus.messageCount,
  };
  return { ...twinStore };
}

export function getAlerts(limit = 50): SensorAlert[] {
  return alertHistory.slice(0, limit);
}

export function getSensorHistory(sensorId: string, limit = 100): SensorReading[] {
  return (sensorHistory[sensorId] || []).slice(0, limit);
}

export async function getDbHealthStats() {
  return getSHMSTimescaleService().getHealthStats();
}

// ─── MQTT-integrated simulator ───────────────────────────────────────────────

const SIMULATED_SENSORS: Array<{
  id: string;
  type: SensorType;
  baseValue: number;
  noise: number;
  unit: string;
}> = [
  { id: 'PZ-001', type: 'piezometro',     baseValue: 45,   noise: 5,     unit: 'kPa' },
  { id: 'IN-001', type: 'inclinometro',   baseValue: 0.8,  noise: 0.2,   unit: 'graus' },
  { id: 'PR-001', type: 'placa_recalque', baseValue: 8,    noise: 1,     unit: 'mm' },
  { id: 'MC-001', type: 'medidor_trinca', baseValue: 0.15, noise: 0.05,  unit: 'mm' },
  { id: 'PL-001', type: 'pluviometro',    baseValue: 5,    noise: 3,     unit: 'mm/h' },
  { id: 'AC-001', type: 'acelerometro',   baseValue: 0.01, noise: 0.005, unit: 'g' },
];

let simulatorInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the built-in simulator (generates synthetic sensor data every 1s).
 * Used in development/testing when MQTT broker is unavailable.
 */
export function startSimulator(): void {
  if (simulatorInterval) return;
  simulatorInterval = setInterval(() => {
    for (const sensor of SIMULATED_SENSORS) {
      // Inject anomaly with 1% probability
      const isAnomalyInjection = Math.random() < 0.01;
      const value = isAnomalyInjection
        ? sensor.baseValue * (2.5 + Math.random())
        : sensor.baseValue + (Math.random() - 0.5) * sensor.noise * 2;

      ingestReading({
        sensorId: sensor.id,
        sensorType: sensor.type,
        value: Math.max(0, value),
        unit: sensor.unit,
        timestamp: new Date(),
      } as Omit<SensorReading, 'isAnomaly' | 'anomalyScore'>);
    }
  }, 1000);
}

export function stopSimulator(): void {
  if (simulatorInterval) {
    clearInterval(simulatorInterval);
    simulatorInterval = null;
  }
}

// ─── MQTT integration bootstrap ──────────────────────────────────────────────

/**
 * Initialize MQTT integration.
 * Connects to MQTT broker and registers reading callback.
 * Falls back to simulation mode if broker is unavailable.
 */
export async function initMQTTIntegration(): Promise<void> {
  const mqttService = getSHMSMqttService();

  // Register callback: MQTT readings → Digital Twin ingestion
  mqttService.onReading((reading) => {
    ingestReading({
      sensorId: reading.sensorId,
      sensorType: reading.sensorType,
      value: reading.value,
      unit: reading.unit,
      timestamp: reading.timestamp,
      latitude: reading.latitude,
      longitude: reading.longitude,
      depth: reading.depth,
    });
  });

  await mqttService.connect();
  log.info('[SHMS-Twin] MQTT integration initialized');
}

/**
 * Initialize TimescaleDB integration.
 * Creates tables if they don't exist.
 */
export async function initTimescaleIntegration(): Promise<void> {
  const tsService = getSHMSTimescaleService();
  await tsService.initialize();

  // Update DB stats in twin state
  const stats = await tsService.getHealthStats();
  twinStore.dbStatus = stats;
  log.info(`[SHMS-Twin] TimescaleDB initialized — readings: ${stats.readings}, alerts: ${stats.alerts}`);
}
