/**
 * SHMS Digital Twin V2 — server/mother/shms-digital-twin-v2.ts
 * MOTHER v98.0 | Ciclo C215 | NC-SHMS-003
 *
 * Enhanced Digital Twin with Neural-EKF state estimation integration.
 * Provides real-time 3D structural health visualization data.
 *
 * Scientific basis:
 * - Grieves & Vickers (2017) "Digital Twin: Mitigating Unpredictable, Undesirable Emergent Behavior"
 *   Trans. Disciplinary Excellence in Engineering — digital twin concept
 * - Tao et al. (2019) "Digital Twin-Driven Product Design, Manufacturing and Service"
 *   Int. J. Adv. Manuf. Technol. 94:3563-3576 — DT for engineering
 * - Farrar & Worden (2012) "Structural Health Monitoring: A Machine Learning Perspective"
 *   Wiley — SHM fundamentals
 * - Fortescue SHMS Project (2024) — geotechnical digital twin requirements
 */

import { runEKFCycle, getSensorStateEstimate, type EKFMeasurement, type EKFPrediction } from './shms-neural-ekf';
import { classifyEKFAlert, type EKFAlertEvent } from './shms-alert-engine-v2';

export interface StructureGeometry {
  structureId: string;
  name: string;
  type: 'dam' | 'tailings_dam' | 'slope' | 'retaining_wall' | 'foundation' | 'bridge';
  coordinates: { lat: number; lon: number; elevation: number };
  dimensions: { height: number; width: number; length: number };  // meters
  sensorPositions: SensorPosition[];
}

export interface SensorPosition {
  sensorId: string;
  sensorType: string;
  x: number;  // meters from reference point
  y: number;
  z: number;  // elevation
  label: string;
}

export interface DigitalTwinState {
  structureId: string;
  timestamp: Date;
  overallHealthScore: number;  // 0-100
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  sensorStates: SensorTwinState[];
  ekfPredictions: EKFPrediction[];
  activeAlerts: EKFAlertEvent[];
  deformationMap: DeformationPoint[];
}

export interface SensorTwinState {
  sensorId: string;
  sensorType: string;
  currentValue: number;
  unit: string;
  estimatedState: {
    displacement: number;
    velocity: number;
    acceleration: number;
  };
  uncertainty: number;
  trend: 'STABLE' | 'INCREASING' | 'DECREASING' | 'ANOMALOUS';
  lastUpdate: Date;
}

export interface DeformationPoint {
  x: number;
  y: number;
  z: number;
  displacement: number;  // mm
  color: string;         // hex color for visualization
}

// In-memory twin state store
const twinStates = new Map<string, DigitalTwinState>();
const sensorHistory = new Map<string, number[]>();  // sensorId -> last 10 values

/**
 * Update digital twin state with new sensor readings.
 */
export function updateDigitalTwin(
  structureId: string,
  measurements: EKFMeasurement[],
  sensorTypes: Record<string, string>
): DigitalTwinState {
  // Run EKF for all sensors
  const ekfPredictions: EKFPrediction[] = measurements.map(m => runEKFCycle(m));

  // Classify alerts
  const activeAlerts: EKFAlertEvent[] = [];
  for (const pred of ekfPredictions) {
    const sensorType = sensorTypes[pred.sensorId] ?? 'inclinometer';
    const alert = classifyEKFAlert(pred, sensorType);
    if (alert) activeAlerts.push(alert);
  }

  // Build sensor twin states
  const sensorStates: SensorTwinState[] = measurements.map((m, i) => {
    const pred = ekfPredictions[i];
    const history = sensorHistory.get(m.sensorId) ?? [];
    history.push(m.value);
    if (history.length > 10) history.shift();
    sensorHistory.set(m.sensorId, history);

    // Determine trend
    let trend: SensorTwinState['trend'] = 'STABLE';
    if (pred.isAnomaly) {
      trend = 'ANOMALOUS';
    } else if (history.length >= 3) {
      const recent = history.slice(-3);
      const slope = (recent[2] - recent[0]) / 2;
      if (Math.abs(slope) > 0.1) {
        trend = slope > 0 ? 'INCREASING' : 'DECREASING';
      }
    }

    return {
      sensorId: m.sensorId,
      sensorType: sensorTypes[m.sensorId] ?? 'inclinometer',
      currentValue: m.value,
      unit: m.unit,
      estimatedState: {
        displacement: pred.estimatedState.displacement,
        velocity: pred.estimatedState.velocity,
        acceleration: pred.estimatedState.acceleration,
      },
      uncertainty: pred.uncertainty,
      trend,
      lastUpdate: m.timestamp,
    };
  });

  // Compute overall health score
  const criticalAlerts = activeAlerts.filter(a => a.alertLevel === 'CRITICAL').length;
  const warningAlerts = activeAlerts.filter(a => a.alertLevel === 'WARNING').length;
  const anomalousCount = sensorStates.filter(s => s.trend === 'ANOMALOUS').length;

  let healthScore = 100;
  healthScore -= criticalAlerts * 20;
  healthScore -= warningAlerts * 10;
  healthScore -= anomalousCount * 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  let riskLevel: DigitalTwinState['riskLevel'] = 'LOW';
  if (criticalAlerts > 0) riskLevel = 'CRITICAL';
  else if (warningAlerts > 2 || healthScore < 60) riskLevel = 'HIGH';
  else if (warningAlerts > 0 || healthScore < 80) riskLevel = 'MODERATE';

  // Generate deformation map
  const deformationMap: DeformationPoint[] = sensorStates.map((s, i) => ({
    x: i * 10,  // Simplified grid layout
    y: 0,
    z: 0,
    displacement: s.estimatedState.displacement,
    color: s.trend === 'ANOMALOUS' ? '#FF0000'
      : Math.abs(s.estimatedState.displacement) > 10 ? '#FF8800'
      : Math.abs(s.estimatedState.displacement) > 5 ? '#FFCC00'
      : '#00CC44',
  }));

  const twinState: DigitalTwinState = {
    structureId,
    timestamp: new Date(),
    overallHealthScore: healthScore,
    riskLevel,
    sensorStates,
    ekfPredictions,
    activeAlerts,
    deformationMap,
  };

  twinStates.set(structureId, twinState);
  return twinState;
}

/**
 * Get current digital twin state for a structure.
 */
export function getDigitalTwinState(structureId: string): DigitalTwinState | null {
  return twinStates.get(structureId) ?? null;
}

/**
 * Generate digital twin status report for MOTHER responses.
 */
export function generateDigitalTwinReport(state: DigitalTwinState): string {
  const riskEmoji = {
    LOW: '🟢',
    MODERATE: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴',
  }[state.riskLevel];

  const lines = [
    `## NC-SHMS-003: Digital Twin — ${state.structureId}`,
    `**Score de Saúde:** ${state.overallHealthScore}/100 ${riskEmoji} **${state.riskLevel}**`,
    `**Atualizado em:** ${state.timestamp.toLocaleString('pt-BR')}`,
    `**Sensores monitorados:** ${state.sensorStates.length}`,
    `**Alertas ativos:** ${state.activeAlerts.length}`,
    '',
    '### Estado dos Sensores:',
  ];

  for (const sensor of state.sensorStates) {
    const trendEmoji = {
      STABLE: '→',
      INCREASING: '↑',
      DECREASING: '↓',
      ANOMALOUS: '⚠️',
    }[sensor.trend];

    lines.push(`**${sensor.sensorId}** ${trendEmoji} ${sensor.trend}`);
    lines.push(`  Valor atual: ${sensor.currentValue.toFixed(3)} ${sensor.unit}`);
    lines.push(`  Deslocamento EKF: ${sensor.estimatedState.displacement.toFixed(3)} mm ± ${sensor.uncertainty.toFixed(3)}`);
  }

  if (state.activeAlerts.length > 0) {
    lines.push('', '### Alertas Ativos:');
    for (const alert of state.activeAlerts) {
      const icon = alert.alertLevel === 'CRITICAL' ? '🔴' : '🟡';
      lines.push(`${icon} **${alert.sensorId}**: ${alert.message}`);
    }
  }

  return lines.join('\n');
}
