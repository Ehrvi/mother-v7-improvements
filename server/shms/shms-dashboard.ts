/**
 * SHMS v2 Dashboard API — server/shms/shms-dashboard.ts
 * MOTHER v79.9 | Ciclo 116 | Fase 2: SHMS v2 — Dashboard + Real-time Alerts
 * Developer: Everton Garcia (Wizards Down Under)
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 (2017): Dam safety monitoring dashboard requirements
 *   — "real-time visualization of structural health indicators"
 * - ISO 19650 (2018): Information management for built environment
 *   — "dashboard must show current state, trends, and alerts"
 * - Grieves & Vickers (2017): Digital Twin dashboard mirrors physical state
 * - HELM (arXiv:2211.09110): Dashboard metrics feed into benchmark evaluation
 * - DGM (arXiv:2505.22954): Autonomous system must expose verifiable state
 *
 * Architecture:
 *   GET /api/a2a/shms/v2/dashboard → aggregated real-time dashboard data
 *   GET /api/a2a/shms/v2/alerts → active alerts from alert-engine
 *   GET /api/a2a/shms/v2/sensors → sensor state from digital twin
 *   GET /api/a2a/shms/v2/lstm/status → LSTM model status
 *   POST /api/a2a/shms/v2/bridge/ingest → ingest reading via bridge
 *   POST /api/a2a/shms/v2/bridge/batch → batch ingest readings
 */

import { digitalTwin } from './digital-twin';
import { lstmPredictor } from './lstm-predictor';
import { mqttDigitalTwinBridge } from './mqtt-digital-twin-bridge';

// ============================================================
// Dashboard Data Types
// ============================================================

export interface DashboardData {
  system: string;
  developer: string;
  version: string;
  cycle: number;
  timestamp: string;
  structure: {
    id: string;
    name: string;
    type: string;
    health_index: number;
    risk_level: string;
    last_updated: string;
    active_sensors: number;
    anomaly_sensors: number;
    critical_predictions: number;
  };
  sensors: Array<{
    id: string;
    type: string;
    value: number;
    unit: string;
    severity: string;
    is_anomaly: boolean;
    deviation_pct: number;
    trend: string;
    last_updated: string;
  }>;
  lstm: {
    total_sensors: number;
    trained_sensors: number;
    avg_loss: number;
    critical_predictions: number;
    predictions: Array<{
      sensor_id: string;
      predicted_value: number;
      confidence: number;
      warning_level: string;
      trend: string;
    }>;
  };
  bridge: {
    readings_processed: number;
    predictions_generated: number;
    avg_latency_ms: number;
    bridge_status: string;
    uptime_ms: number;
  };
  scientific_basis: string[];
  verification_commands: string[];
}

// ============================================================
// Dashboard Functions
// ============================================================

/**
 * Get full dashboard data
 * Aggregates: digital twin state + LSTM predictions + bridge stats
 */
export function getDashboardData(): DashboardData {
  const twinStatus = digitalTwin.getStatus();
  const twinSensors = digitalTwin.getSensors();
  const lstmStats = lstmPredictor.getStats();
  const lstmPredictions = lstmPredictor.getAllPredictions();
  const bridgeStats = mqttDigitalTwinBridge.getStats();

  return {
    system: 'MOTHER — Modular Orchestrated Thinking and Hierarchical Execution Runtime',
    developer: 'Everton Garcia (Wizards Down Under)',
    version: 'v79.9',
    cycle: 116,
    timestamp: new Date().toISOString(),
    structure: {
      id: twinStatus.structureId,
      name: twinStatus.structureName,
      type: 'tailings_dam',
      health_index: twinStatus.healthIndex,
      risk_level: twinStatus.riskLevel,
      last_updated: twinStatus.lastUpdated.toISOString(),
      active_sensors: twinStatus.activeSensors,
      anomaly_sensors: twinStatus.anomalySensors,
      critical_predictions: twinStatus.criticalPredictions,
    },
    sensors: twinSensors.map(s => ({
      id: s.sensorId,
      type: s.sensorType,
      value: Math.round(s.lastValue * 1000) / 1000,
      unit: s.unit,
      severity: s.severity,
      is_anomaly: s.isAnomaly,
      deviation_pct: Math.round(s.deviationFromBaseline * 10) / 10,
      trend: s.trend,
      last_updated: s.lastUpdated.toISOString(),
    })),
    lstm: {
      total_sensors: lstmStats.totalSensors,
      trained_sensors: lstmStats.trainedSensors,
      avg_loss: Math.round(lstmStats.avgLoss * 10000) / 10000,
      critical_predictions: lstmStats.criticalPredictions,
      predictions: lstmPredictions.map(p => ({
        sensor_id: p.sensorId,
        predicted_value: Math.round((p.predictedValues[0] ?? 0) * 1000) / 1000,
        confidence: Math.round(p.confidence * 100) / 100,
        warning_level: p.warningLevel,
        trend: p.trend,
      })),
    },
    bridge: {
      readings_processed: bridgeStats.readings_processed,
      predictions_generated: bridgeStats.predictions_generated,
      avg_latency_ms: bridgeStats.avg_latency_ms,
      bridge_status: bridgeStats.bridge_status,
      uptime_ms: bridgeStats.uptime_ms,
    },
    scientific_basis: [
      'ICOLD Bulletin 158 (2017) — dam safety monitoring dashboard',
      'Grieves & Vickers (2017) — digital twin real-time state',
      'Hochreiter & Schmidhuber (1997) — LSTM prediction pipeline',
      'ISO 19650 (2018) — information management for built environment',
      'DGM arXiv:2505.22954 — autonomous system verifiable state',
    ],
    verification_commands: [
      'curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/shms/v2/dashboard | python3 -m json.tool',
      'curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/shms/v2/sensors | python3 -m json.tool',
      'curl -s https://mother-interface-qtvghovzxa-ts.a.run.app/api/a2a/shms/v2/lstm/status | python3 -m json.tool',
    ],
  };
}

/**
 * Get active alerts summary
 */
export function getAlertsSummary(): {
  total_alerts: number;
  critical: number;
  warning: number;
  watch: number;
  alerts: Array<{ sensor_id: string; severity: string; type: string; value: number }>;
} {
  const sensors = digitalTwin.getSensors();
  const alerts = sensors
    .filter(s => s.severity !== 'normal')
    .map(s => ({
      sensor_id: s.sensorId,
      severity: s.severity,
      type: s.sensorType,
      value: s.lastValue,
    }));

  return {
    total_alerts: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical' || a.severity === 'emergency').length,
    warning: alerts.filter(a => a.severity === 'warning' || a.severity === 'alert').length,
    watch: alerts.filter(a => a.severity === 'watch').length,
    alerts,
  };
}
