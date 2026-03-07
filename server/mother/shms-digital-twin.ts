/**
 * SHMS Digital Twin — Sprint 6 (Ciclo 178)
 * Sistema de Monitoramento de Saúde de Estruturas — Digital Twin Core
 *
 * Scientific basis:
 * - Hundman et al. (arXiv:1802.04431, 2018): LSTM-based anomaly detection
 * - Grieves & Vickers (2017): Digital Twin concept
 * - ISO 19115-1:2014: Geographic information — Metadata for geospatial sensor data
 *
 * @module shms-digital-twin
 * @version 1.0.0
 * @cycle C178
 */

export type SensorType = 'piezometro' | 'inclinometro' | 'placa_recalque' | 'medidor_trinca' | 'pluviometro' | 'acelerometro';
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
}

const THRESHOLDS: Record<SensorType, { warning: number; critical: number; emergency: number; unit: string }> = {
  piezometro:      { warning: 80,   critical: 100,  emergency: 120,  unit: 'kPa' },
  inclinometro:    { warning: 2.0,  critical: 3.5,  emergency: 5.0,  unit: 'graus' },
  placa_recalque:  { warning: 15,   critical: 25,   emergency: 40,   unit: 'mm' },
  medidor_trinca:  { warning: 0.5,  critical: 1.0,  emergency: 2.0,  unit: 'mm' },
  pluviometro:     { warning: 50,   critical: 80,   emergency: 120,  unit: 'mm/h' },
  acelerometro:    { warning: 0.05, critical: 0.1,  emergency: 0.2,  unit: 'g' },
};

const twinStore: TwinState = {
  lastUpdated: new Date(),
  totalSensors: 0,
  activeSensors: 0,
  anomaliesDetected: 0,
  alertsActive: 0,
  sensors: {},
  systemHealth: 'normal',
};

const alertHistory: SensorAlert[] = [];
const sensorHistory: Record<string, SensorReading[]> = {};
const MAX_HISTORY = 1000;
const sensorWindows: Record<string, number[]> = {};
const WINDOW_SIZE = 30;

function detectAnomaly(sensorId: string, value: number): { isAnomaly: boolean; score: number } {
  if (!sensorWindows[sensorId]) sensorWindows[sensorId] = [];
  const window = sensorWindows[sensorId];
  window.push(value);
  if (window.length > WINDOW_SIZE) window.shift();
  if (window.length < 5) return { isAnomaly: false, score: 0 };
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
  const std = Math.sqrt(variance) || 0.001;
  const zScore = Math.abs((value - mean) / std);
  return { isAnomaly: zScore > 3.0, score: Math.min(zScore / 5.0, 1.0) };
}

function dispatchAlert(reading: SensorReading): void {
  const thresh = THRESHOLDS[reading.sensorType];
  if (!thresh) return;
  let severity: AlertSeverity | null = null;
  let threshold = 0;
  if (reading.value >= thresh.emergency) { severity = 'emergency'; threshold = thresh.emergency; }
  else if (reading.value >= thresh.critical) { severity = 'critical'; threshold = thresh.critical; }
  else if (reading.value >= thresh.warning) { severity = 'warning'; threshold = thresh.warning; }
  else if (reading.isAnomaly) { severity = 'info'; threshold = thresh.warning * 0.8; }
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
}

export function ingestReading(reading: Omit<SensorReading, 'isAnomaly' | 'anomalyScore'>): SensorReading {
  const { isAnomaly, score } = detectAnomaly(reading.sensorId, reading.value);
  const fullReading: SensorReading = { ...reading, isAnomaly, anomalyScore: score };
  twinStore.sensors[reading.sensorId] = fullReading;
  twinStore.lastUpdated = new Date();
  twinStore.totalSensors = Object.keys(twinStore.sensors).length;
  twinStore.activeSensors = twinStore.totalSensors;
  twinStore.anomaliesDetected = Object.values(twinStore.sensors).filter(s => s.isAnomaly).length;
  if (!sensorHistory[reading.sensorId]) sensorHistory[reading.sensorId] = [];
  sensorHistory[reading.sensorId].unshift(fullReading);
  if (sensorHistory[reading.sensorId].length > MAX_HISTORY) sensorHistory[reading.sensorId].pop();
  dispatchAlert(fullReading);
  twinStore.alertsActive = alertHistory.filter(a => !a.acknowledged).length;
  const emergencyAlerts = alertHistory.filter(a => !a.acknowledged && a.severity === 'emergency').length;
  const criticalAlerts = alertHistory.filter(a => !a.acknowledged && a.severity === 'critical').length;
  twinStore.systemHealth = emergencyAlerts > 0 ? 'critical' : criticalAlerts > 0 ? 'degraded' : 'normal';
  return fullReading;
}

export function getTwinState(): TwinState { return { ...twinStore }; }
export function getAlerts(limit = 50): SensorAlert[] { return alertHistory.slice(0, limit); }
export function getSensorHistory(sensorId: string, limit = 100): SensorReading[] {
  return (sensorHistory[sensorId] || []).slice(0, limit);
}

const SIMULATED_SENSORS: Array<{ id: string; type: SensorType; baseValue: number; noise: number; unit: string }> = [
  { id: 'PZ-001', type: 'piezometro',     baseValue: 45,   noise: 5,    unit: 'kPa' },
  { id: 'IN-001', type: 'inclinometro',   baseValue: 0.8,  noise: 0.2,  unit: 'graus' },
  { id: 'PR-001', type: 'placa_recalque', baseValue: 8,    noise: 1,    unit: 'mm' },
  { id: 'MC-001', type: 'medidor_trinca', baseValue: 0.15, noise: 0.05, unit: 'mm' },
  { id: 'PL-001', type: 'pluviometro',    baseValue: 5,    noise: 3,    unit: 'mm/h' },
  { id: 'AC-001', type: 'acelerometro',   baseValue: 0.01, noise: 0.005, unit: 'g' },
];

let simulatorInterval: ReturnType<typeof setInterval> | null = null;

export function startSimulator(): void {
  if (simulatorInterval) return;
  simulatorInterval = setInterval(() => {
    for (const sensor of SIMULATED_SENSORS) {
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
  if (simulatorInterval) { clearInterval(simulatorInterval); simulatorInterval = null; }
}
