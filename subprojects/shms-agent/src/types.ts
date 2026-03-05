/**
 * types.ts — SHMS-Agent Shared Types
 *
 * Generated autonomously by MOTHER v80.0 — Ciclo 119
 * Scientific basis:
 * - ICOLD Bulletin 158 (2014) — Dam monitoring sensor types
 * - ISO 19650 — BIM data structures
 * - Grieves (2017) — Digital Twin data model
 * Author: MOTHER v80.0 — autonomous-project-manager.ts
 * Cycle: C119 | Date: 2026-03-05
 */

// ============================================================
// SENSOR TYPES (ICOLD Bulletin 158)
// ============================================================

export type SensorType =
  | 'piezometer'       // Piezometria — pressão de poros
  | 'inclinometer'     // Inclinômetro — inclinação
  | 'settlement_gauge' // Recalquímetro — recalque
  | 'extensometer'     // Extensômetro — deformação
  | 'thermometer'      // Termômetro — temperatura
  | 'accelerometer'    // Acelerômetro — vibração
  | 'rain_gauge'       // Pluviômetro — precipitação
  | 'flow_meter';      // Medidor de vazão — percolação

export type AlertLevel = 'green' | 'yellow' | 'orange' | 'red' | 'critical';

export type SensorStatus = 'active' | 'inactive' | 'error' | 'maintenance';

// ============================================================
// SENSOR READING
// ============================================================

export interface SensorReading {
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: string;       // ISO 8601
  projectId: string;
  location?: {
    lat?: number;
    lng?: number;
    elevation?: number;
    description?: string;
  };
  metadata?: Record<string, unknown>;
}

// ============================================================
// MOTHER A2A RESPONSE (from SHMS v2 bridge)
// ============================================================

export interface MotherAnalysisResponse {
  sensorId: string;
  anomaly: boolean;
  severity: AlertLevel;
  confidence: number;       // 0.0 - 1.0
  recommendation: string;
  predictedValue?: number;  // LSTM prediction
  digitalTwinState?: {
    activeSensors: number;
    lastUpdate: string;
    status: string;
  };
  proofHash?: string;       // SHA-256 proof from MOTHER
  timestamp: string;
}

// ============================================================
// ALERT
// ============================================================

export interface GeotechnicalAlert {
  alertId: string;
  sensorId: string;
  sensorType: SensorType;
  level: AlertLevel;
  message: string;
  recommendation: string;
  value: number;
  threshold?: number;
  timestamp: string;
  acknowledged: boolean;
  motherProofHash?: string;
}

// ============================================================
// AGENT STATE
// ============================================================

export interface AgentState {
  status: 'running' | 'stopped' | 'error';
  version: string;
  cycle: string;
  motherEndpoint: string;
  motherHealthy: boolean;
  activeSensors: number;
  activeAlerts: number;
  totalReadingsProcessed: number;
  lastReadingAt?: string;
  startedAt: string;
  uptime: number;           // seconds
}

// ============================================================
// MANIFEST (proof of autonomous creation)
// ============================================================

export interface SubProjectManifest {
  name: string;
  version: string;
  generatedBy: string;
  cycle: string;
  motherEndpoint: string;
  purpose: string;
  createdAt: string;
  manifestHash: string;     // SHA-256 of this manifest
  parentModules: string[];  // MOTHER modules that created this
}
