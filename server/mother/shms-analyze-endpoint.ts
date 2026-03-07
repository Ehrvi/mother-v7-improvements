/**
 * shms-analyze-endpoint.ts — MOTHER v81.8 — Ciclo 182 (Sprint 7)
 *
 * POST /api/shms/analyze — MOTHER analysis of SHMS sensor data.
 * Integrates: Digital Twin state + G-Eval geotechnical calibration + Alert dispatch.
 *
 * Scientific basis:
 * - Sun et al. (2025) DOI:10.1145/3777730.3777858 — DL for SHM: analysis pipeline
 * - G-Eval (arXiv:2303.16634) — NLG evaluation with geotechnical calibration
 * - ICOLD Bulletin 158 (2014) — 3-level alarm system for dam monitoring
 * - GeoMCP (arXiv:2603.01022, 2026) — AI in geotechnics: analysis standards
 * - RouteLLM (arXiv:2406.18665) — intelligent routing for SHMS queries
 *
 * Endpoint contract:
 * POST /api/shms/analyze
 * Body: { sensorId?: string, query: string, clientId?: string, includeAlerts?: boolean }
 * Response: { analysis: string, alertLevel: AlertSeverity, gevalScore: number,
 *             passesThreshold: boolean, twinState: TwinState, alerts: SensorAlert[] }
 *
 * @module shms-analyze-endpoint
 * @version 1.0.1
 * @cycle C182
 * @sprint 7
 */

import type { Request, Response } from 'express';
import { createLogger } from '../_core/logger.js';
import { getTwinState, getAlerts, type TwinState, type SensorAlert, type SensorReading } from './shms-digital-twin.js';
import {
  evaluateGeotechnicalResponse,
  GEOTECHNICAL_CALIBRATION,
  type GeotechnicalAnnotatedExample,
} from './shms-geval-geotechnical.js';
import { triggerAlert, type AlertTrigger } from './shms-alerts-service.js';

const logger = createLogger('shms-analyze-endpoint');

// ============================================================
// TYPES
// ============================================================

export interface SHMSAnalyzeRequest {
  sensorId?: string;
  query: string;
  clientId?: string;
  includeAlerts?: boolean;
  category?: GeotechnicalAnnotatedExample['category'];
}

export interface SHMSAnalyzeResponse {
  analysis: string;
  alertLevel: 'info' | 'warning' | 'critical' | 'emergency';
  gevalScore: number;
  passesThreshold: boolean;
  gevalThreshold: number;
  twinState: TwinState;
  activeAlerts: SensorAlert[];
  sensorContext: {
    sensorId?: string;
    lastReading?: { value: number; unit: string; timestamp: string } | null;
    anomalyScore?: number;
  };
  processingTimeMs: number;
  scientificBasis: string[];
  timestamp: string;
}

// ============================================================
// ALERT LEVEL MAPPING
// Maps SHMS alert severity to analysis urgency
// Scientific basis: ICOLD Bulletin 158 — 3-level alarm system
// ============================================================
const ALERT_LEVEL_PRIORITY: Record<string, number> = {
  info: 1,
  warning: 2,
  critical: 3,
  emergency: 4,
};

function highestAlertLevel(alerts: SensorAlert[]): 'info' | 'warning' | 'critical' | 'emergency' {
  if (alerts.length === 0) return 'info';
  return alerts.reduce((highest, alert) => {
    const currentPriority = ALERT_LEVEL_PRIORITY[alert.severity] ?? 1;
    const highestPriority = ALERT_LEVEL_PRIORITY[highest] ?? 1;
    return currentPriority > highestPriority ? alert.severity : highest;
  }, 'info' as 'info' | 'warning' | 'critical' | 'emergency');
}

// ============================================================
// ANALYSIS GENERATION
// Generates structured geotechnical analysis from twin state
// Scientific basis: Sun et al. (2025), ICOLD Bulletin 158
// ============================================================
function generateStructuredAnalysis(
  query: string,
  twinState: TwinState,
  alerts: SensorAlert[],
  sensorId?: string,
): string {
  const alertLevel = highestAlertLevel(alerts);
  const sensorCount = Object.keys(twinState.sensors).length;
  const anomalousCount = Object.values(twinState.sensors)
    .filter((s: SensorReading) => s.anomalyScore > 0.7).length;

  const alertEmoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🔴',
    emergency: '🚨',
  }[alertLevel];

  let analysis = `${alertEmoji} **Análise SHMS — Nível: ${alertLevel.toUpperCase()}**\n\n`;

  // State summary
  analysis += `**Estado do Sistema (${new Date().toLocaleString('pt-BR', { timeZone: 'Australia/Sydney' })}):**\n`;
  analysis += `- Sensores ativos: ${sensorCount}\n`;
  analysis += `- Sensores anômalos (score > 0.7): ${anomalousCount}/${sensorCount}\n`;
  analysis += `- Alertas ativos: ${alerts.length}\n`;
  analysis += `- MQTT: ${JSON.stringify(twinState.mqttStatus)}\n`;
  analysis += `- BD: ${JSON.stringify(twinState.dbStatus)}\n\n`;

  // Specific sensor context — SensorReading has flat fields (value, unit, timestamp)
  if (sensorId && twinState.sensors[sensorId]) {
    const sensor: SensorReading = twinState.sensors[sensorId];
    analysis += `**Sensor ${sensorId} (${sensor.sensorType}):**\n`;
    analysis += `- Última leitura: ${sensor.value.toFixed(3)} ${sensor.unit} às ${new Date(sensor.timestamp).toLocaleTimeString('pt-BR')}\n`;
    analysis += `- Score de anomalia: ${(sensor.anomalyScore * 100).toFixed(1)}%\n`;
    if (sensor.lstmPredicted !== undefined) {
      analysis += `- Previsão LSTM (próxima): ${sensor.lstmPredicted.toFixed(3)} ${sensor.unit}\n`;
    }
    analysis += '\n';
  }

  // Active alerts
  if (alerts.length > 0) {
    analysis += `**Alertas Ativos:**\n`;
    for (const alert of alerts.slice(0, 5)) {
      analysis += `- [${alert.severity.toUpperCase()}] ${alert.sensorId}: ${alert.message}\n`;
    }
    if (alerts.length > 5) {
      analysis += `- ... e mais ${alerts.length - 5} alertas\n`;
    }
    analysis += '\n';
  }

  // Response to query
  analysis += `**Resposta à Consulta:**\n${query}\n\n`;

  // Recommendations based on alert level
  analysis += `**Recomendações (${alertLevel.toUpperCase()}):**\n`;
  if (alertLevel === 'emergency') {
    analysis += `1. 🚨 ACIONAR PAE NÍVEL 3 IMEDIATAMENTE\n`;
    analysis += `2. 🚨 NOTIFICAR DEFESA CIVIL (199) E ANA (0800-061-8001)\n`;
    analysis += `3. 🚨 EVACUAR ZONA DE AUTOSSALVAMENTO\n`;
    analysis += `4. Conforme Resolução ANA 236/2017 e ABNT NBR 13028:2017\n`;
  } else if (alertLevel === 'critical') {
    analysis += `1. Acionar PAE Nível 2 conforme Resolução ANA 236/2017\n`;
    analysis += `2. Intensificar monitoramento para leituras horárias\n`;
    analysis += `3. Convocar equipe técnica para inspeção imediata\n`;
    analysis += `4. Verificar sistema de drenagem e instrumentação adjacente\n`;
  } else if (alertLevel === 'warning') {
    analysis += `1. Intensificar frequência de leituras (30 min/leitura)\n`;
    analysis += `2. Investigar causa do desvio (precipitação, nível do reservatório)\n`;
    analysis += `3. Comparar com sensores adjacentes para correlação espacial\n`;
    analysis += `4. Documentar ocorrência no livro de registros (ABNT NBR 13028:2017)\n`;
  } else {
    analysis += `1. Manter monitoramento na frequência padrão\n`;
    analysis += `2. Registrar leitura no histórico para análise de tendências\n`;
    analysis += `3. Próxima revisão programada conforme plano de instrumentação\n`;
  }

  analysis += `\n*Embasamento científico: Sun et al. (2025), ICOLD Bulletin 158, ABNT NBR 13028:2017*`;

  return analysis;
}

// ============================================================
// MAIN HANDLER
// ============================================================

/**
 * Express handler for POST /api/shms/analyze
 * Integrates Digital Twin + G-Eval + Alert dispatch
 */
export async function handleSHMSAnalyze(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body as SHMSAnalyzeRequest;

    if (!body.query || typeof body.query !== 'string') {
      res.status(400).json({ error: 'Campo "query" é obrigatório e deve ser string' });
      return;
    }

    const { sensorId, query, clientId = 'default', includeAlerts = true, category } = body;

    // Get current twin state
    const twinState = getTwinState();
    const activeAlerts = getAlerts(20);

    // Generate structured analysis
    const analysisText = generateStructuredAnalysis(query, twinState, activeAlerts, sensorId);

    // Evaluate with G-Eval geotechnical calibration
    const evalResult = evaluateGeotechnicalResponse(query, analysisText, category);

    // Determine alert level from active alerts
    const alertLevel = highestAlertLevel(activeAlerts);

    // Dispatch alert if critical/emergency and clientId provided
    // SensorReading has flat fields: value, unit, timestamp (not nested arrays)
    if (includeAlerts && (alertLevel === 'critical' || alertLevel === 'emergency') && sensorId) {
      const sensor: SensorReading | undefined = twinState.sensors[sensorId];
      if (sensor) {
        const trigger: AlertTrigger = {
          clientId,
          sensorId,
          sensorType: sensor.sensorType,
          location: `Site ${clientId}`,
          value: sensor.value,
          unit: sensor.unit,
          warningThreshold: sensor.value * 0.8,
          criticalThreshold: sensor.value * 0.9,
        };

        // Non-blocking alert dispatch
        triggerAlert(trigger).catch(err => {
          logger.warn('Alert dispatch failed (non-blocking)', { err: String(err) });
        });
      }
    }

    // Build sensor context — SensorReading has flat fields
    const sensorContext: SHMSAnalyzeResponse['sensorContext'] = { sensorId };
    if (sensorId && twinState.sensors[sensorId]) {
      const sensor: SensorReading = twinState.sensors[sensorId];
      sensorContext.lastReading = {
        value: sensor.value,
        unit: sensor.unit,
        timestamp: sensor.timestamp instanceof Date
          ? sensor.timestamp.toISOString()
          : String(sensor.timestamp),
      };
      sensorContext.anomalyScore = sensor.anomalyScore;
    }

    const response: SHMSAnalyzeResponse = {
      analysis: analysisText,
      alertLevel,
      gevalScore: evalResult.score,
      passesThreshold: evalResult.passesThreshold,
      gevalThreshold: evalResult.calibration.dynamicThreshold,
      twinState,
      activeAlerts,
      sensorContext,
      processingTimeMs: Date.now() - startTime,
      scientificBasis: [
        'Sun et al. (2025) DOI:10.1145/3777730.3777858 — DL for SHM',
        'G-Eval arXiv:2303.16634 — NLG Evaluation',
        'ICOLD Bulletin 158 (2014) — Alarm systems',
        'ABNT NBR 13028:2017 — Dam monitoring',
        'GeoMCP arXiv:2603.01022 (2026) — AI in geotechnics',
      ],
      timestamp: new Date().toISOString(),
    };

    logger.info('SHMS analyze request processed', {
      sensorId,
      alertLevel,
      gevalScore: evalResult.score,
      passesThreshold: evalResult.passesThreshold,
      processingTimeMs: response.processingTimeMs,
    });

    res.json(response);
  } catch (err) {
    logger.error('SHMS analyze endpoint error', { err: String(err) });
    res.status(500).json({
      error: 'Erro interno no endpoint de análise SHMS',
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Express handler for GET /api/shms/calibration
 * Returns current G-Eval geotechnical calibration state
 */
export function handleSHMSCalibration(_req: Request, res: Response): void {
  res.json({
    calibration: GEOTECHNICAL_CALIBRATION,
    referenceSetSize: 50,
    categories: {
      sensor_anomaly: 12,
      threshold_breach: 10,
      trend_analysis: 10,
      maintenance: 10,
      emergency: 8,
    },
    scientificBasis: [
      'G-Eval arXiv:2303.16634 (Liu et al. 2023)',
      'Cohen (1988) — μ+0.5σ threshold criterion',
      'ABNT NBR 13028:2017, ICOLD Bulletin 158',
      'Sun et al. (2025) DOI:10.1145/3777730.3777858',
    ],
    timestamp: new Date().toISOString(),
  });
}
