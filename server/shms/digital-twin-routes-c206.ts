/**
 * SHMS PHASE 2 — DIGITAL TWIN REST API — C206
 *
 * Expõe o Digital Twin Engine (C205) via REST API completa.
 *
 * Base científica:
 * - REST: Fielding (2000) "Architectural Styles and the Design of Network-based Software Architectures" §5
 * - Digital Twin: Grieves (2014) "Digital Twin: Manufacturing Excellence through Virtual Factory Replication"
 * - SHM: Farrar & Worden (2012) "Structural Health Monitoring: A Machine Learning Perspective"
 * - ISO 13374-1:2003 — Condition monitoring and diagnostics of machines
 * - ICOLD Bulletin 158 (2014) — Dam Safety Management
 *
 * Endpoints:
 *   GET  /api/shms/v2/structures              — lista todas as estruturas monitoradas
 *   GET  /api/shms/v2/structures/:id          — estado atual + health index
 *   GET  /api/shms/v2/structures/:id/anomalies — anomalias detectadas (Z-score + IQR)
 *   POST /api/shms/v2/structures/:id/readings  — injetar leitura sintética
 *   GET  /api/shms/v2/health                  — health check do Digital Twin
 *
 * MOTHER v88.0 | C206 | Sprint 7 | 2026-03-09
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../_core/logger';
import {
  getTwinState,
  getAllTwins,
  getActiveAlerts,
  ingestSensorReading,
  type SensorReading,
  type DigitalTwinState,
} from './digital-twin-engine-c205';

const log = createLogger('shms-dt-routes-c206');

export const digitalTwinRoutesC206 = Router();

/**
 * GET /api/shms/v2/structures
 * Lista todas as estruturas monitoradas com health index atual.
 * ISO 13374-1:2003 §4.2 — Condition monitoring overview
 */
digitalTwinRoutesC206.get('/structures', async (_req: Request, res: Response) => {
  try {
    const structures = getAllTwins();
    const summary = structures.map((s: DigitalTwinState) => ({
      id: s.structureId,
      name: s.structureName,
      type: s.structureType,
      healthIndex: s.healthIndex,
      riskLevel: s.riskLevel,
      activeSensors: s.activeSensors,
      totalSensors: s.sensorCount,
      activeAlerts: s.alerts.filter((a) => !a.acknowledged).length,
      lastUpdate: s.lastUpdated,
    }));

    log.info(`[C206] GET /structures — ${structures.length} estruturas retornadas`);
    res.json({
      success: true,
      count: structures.length,
      structures: summary,
      timestamp: new Date().toISOString(),
      cycle: 'C206',
      scientificBasis: 'ISO 13374-1:2003 §4.2 + Grieves (2014) Digital Twin',
    });
  } catch (err) {
    log.error('[C206] GET /structures error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * GET /api/shms/v2/structures/:id
 * Estado completo de uma estrutura específica.
 * Farrar & Worden (2012) — SHM Level 1-4 (detection, localization, classification, prognosis)
 */
digitalTwinRoutesC206.get('/structures/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const state = getTwinState(id);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: `Estrutura '${id}' não encontrada`,
        availableIds: getAllTwins().map((s: DigitalTwinState) => s.structureId),
      });
    }

    log.info(`[C206] GET /structures/${id} — healthIndex=${state.healthIndex.toFixed(3)}`);
    return res.json({
      success: true,
      structure: {
        ...state,
        sensorReadings: Object.fromEntries(state.sensorReadings),
      },
      shmLevel: computeSHMLevel(state.healthIndex),
      timestamp: new Date().toISOString(),
      cycle: 'C206',
      scientificBasis: 'Farrar & Worden (2012) SHM Levels 1-4 + ISO 13374-1:2003',
    });
  } catch (err) {
    log.error(`[C206] GET /structures/${req.params.id} error:`, err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * GET /api/shms/v2/structures/:id/anomalies
 * Anomalias detectadas via Z-score (3σ) + IQR (Tukey 1977).
 * Retorna apenas alertas não resolvidos por padrão.
 * Base científica: Tukey (1977) "Exploratory Data Analysis" — IQR fence
 */
digitalTwinRoutesC206.get('/structures/:id/anomalies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const includeAcknowledged = req.query.includeAcknowledged === 'true';

    const state = getTwinState(id);
    if (!state) {
      return res.status(404).json({
        success: false,
        error: `Estrutura '${id}' não encontrada`,
      });
    }

    const allAlerts = getActiveAlerts(id);
    const alerts = includeAcknowledged
      ? allAlerts
      : allAlerts.filter((a) => !a.acknowledged);

    const anomalySummary = {
      total: alerts.length,
      bySeverity: {
        info: alerts.filter((a) => a.severity === 'info').length,
        warning: alerts.filter((a) => a.severity === 'warning').length,
        critical: alerts.filter((a) => a.severity === 'critical').length,
      },
      alerts,
    };

    log.info(`[C206] GET /structures/${id}/anomalies — ${alerts.length} anomalias (acknowledged=${includeAcknowledged})`);
    return res.json({
      success: true,
      structureId: id,
      structureName: state.structureName,
      anomalies: anomalySummary,
      timestamp: new Date().toISOString(),
      cycle: 'C206',
      scientificBasis: 'Tukey (1977) IQR + Grubbs (1969) Z-score 3σ + ICOLD Bulletin 158 L1/L2/L3',
    });
  } catch (err) {
    log.error(`[C206] GET /structures/${req.params.id}/anomalies error:`, err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/structures/:id/readings
 * Injetar leitura sintética de sensor no Digital Twin.
 * Permite testes de anomalia detection sem hardware real (R38 — pré-produção).
 * Base científica: GISTM (2020) §4.3 — sensor data thresholds
 */
digitalTwinRoutesC206.post('/structures/:id/readings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sensorId, sensorType, value, unit, quality } = req.body;

    if (!sensorId || !sensorType || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: sensorId, sensorType, value',
        example: {
          sensorId: 'PIEZOMETER-001',
          sensorType: 'piezometer',
          value: 145.2,
          unit: 'kPa',
          quality: 0.95,
        },
      });
    }

    // Map sensorType to valid SensorReading type
    const validTypes = ['displacement', 'vibration', 'temperature', 'pore_pressure', 'strain', 'acceleration'] as const;
    const mappedType = validTypes.includes(sensorType) ? sensorType : 'displacement';

    const reading: SensorReading = {
      sensorId,
      structureId: id,
      type: mappedType,
      value: Number(value),
      unit: unit || 'unknown',
      quality: 'good',
      timestamp: new Date().toISOString(),
    };

    const result = ingestSensorReading(reading);

    log.info(`[C206] POST /structures/${id}/readings — sensor=${sensorId} value=${value} anomaly=${result.anomaly.isAnomaly}`);
    return res.json({
      success: true,
      structureId: id,
      sensorId,
      value,
      anomalyDetected: result.anomaly.isAnomaly,
      alert: result.alert || null,
      healthIndexAfter: result.twin.healthIndex,
      timestamp: new Date().toISOString(),
      cycle: 'C206',
      scientificBasis: 'GISTM (2020) §4.3 + Z-score (3σ) + IQR (Tukey 1977)',
    });
  } catch (err) {
    log.error(`[C206] POST /structures/${req.params.id}/readings error:`, err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/structures/:id/fos
 * Receive FOS result from client-side LEM Worker and update DT stability dimension.
 * Maps FOS → TARP level and injects as sensor reading into existing DT engine.
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 (2017) — FOS thresholds: ≥1.5 Green, 1.3-1.5 Yellow, 1.1-1.3 Orange, <1.1 Red
 * - Xu et al. (2025) — AI-Powered DT for Highway Slope Stability Risk Monitoring
 * - Müller et al. (2022) — Self-Improving DT Models (Reality-to-Simulation Gap)
 * - USACE EM 1110-2-1902 — Slope Stability (Bishop/Spencer/M-P methods)
 *
 * Body: { fos: number, method: string, circle?: object, timing?: number }
 */
digitalTwinRoutesC206.post('/structures/:id/fos', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fos, method, circle, timing } = req.body;

    if (fos === undefined || !method) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: fos (number), method (string)',
        example: { fos: 1.45, method: 'bishop', circle: { cx: 15, cy: -5, r: 20 }, timing: 95 },
      });
    }

    // Map FOS → TARP level (ICOLD B.158 thresholds)
    const tarpLevel = fos >= 1.5 ? 'green' : fos >= 1.3 ? 'yellow' : fos >= 1.1 ? 'orange' : 'red';

    // Inject as stability sensor reading into existing DT engine (no new infrastructure)
    const reading: SensorReading = {
      sensorId: `LEM-${method}-${id}`,
      structureId: id,
      type: 'displacement', // maps to stability dimension in DT
      value: Number(fos),
      unit: 'FOS',
      quality: 'good',
      timestamp: new Date().toISOString(),
    };

    const result = ingestSensorReading(reading);

    log.info(`[LEM] POST /structures/${id}/fos — FOS=${fos} method=${method} TARP=${tarpLevel} HI=${result.twin.healthIndex.toFixed(3)} timing=${timing || '?'}ms`);
    return res.json({
      success: true,
      structureId: id,
      fos: Number(fos),
      method,
      tarpLevel,
      circle: circle || null,
      timingMs: timing || null,
      healthIndexAfter: result.twin.healthIndex,
      anomalyDetected: result.anomaly.isAnomaly,
      timestamp: new Date().toISOString(),
      cycle: 'C206',
      scientificBasis: 'ICOLD B.158 FOS thresholds + USACE EM 1110-2-1902 + Xu et al. (2025) DT+LEM',
    });
  } catch (err) {
    log.error(`[LEM] POST /structures/${req.params.id}/fos error:`, err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * GET /api/shms/v2/health
 * Health check do Digital Twin Engine.
 * ISO 13374-1:2003 §5.1 — System availability monitoring
 */
digitalTwinRoutesC206.get('/health', async (_req: Request, res: Response) => {
  try {
    const structures = getAllTwins();
    const totalAlerts = structures.reduce(
      (sum: number, s: DigitalTwinState) => sum + s.alerts.filter((a) => !a.acknowledged).length,
      0
    );
    const avgHealthIndex =
      structures.length > 0
        ? structures.reduce((sum: number, s: DigitalTwinState) => sum + s.healthIndex, 0) / structures.length
        : 0;

    const engineStatus = {
      status: 'operational',
      version: 'C205',
      structures: structures.length,
      avgHealthIndex: Number(avgHealthIndex.toFixed(3)),
      totalActiveAlerts: totalAlerts,
      mqttStatus: 'via mqtt-digital-twin-bridge-c206.ts',
      cycle: 'C206',
    };

    res.json({
      success: true,
      engine: engineStatus,
      timestamp: new Date().toISOString(),
      scientificBasis: 'ISO 13374-1:2003 §5.1 + Grieves (2014) Digital Twin',
    });
  } catch (err) {
    log.error('[C206] GET /health error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * Compute SHM Level (Farrar & Worden 2012):
 * Level 1: Detection (healthIndex < 0.9)
 * Level 2: Localization (healthIndex < 0.7)
 * Level 3: Classification (healthIndex < 0.5)
 * Level 4: Prognosis (healthIndex < 0.3)
 */
/**
 * GET /api/shms/v2/predict/:id
 * LSTM BiLSTM+Attention predictions for a structure's sensors.
 * Returns multi-step forecasts (1h-48h) with HST decomposition.
 * Scientific basis: Schuster & Paliwal (1997) BiLSTM + Bahdanau (2014) Attention + ICOLD B.158 HST
 */
digitalTwinRoutesC206.get('/predict/:id', async (req: Request, res: Response) => {
  try {
    const { lstmPredictor } = await import('./lstm-predictor.js');
    const predictions = lstmPredictor.getAllPredictions()
      .filter(p => p.sensorId.includes(req.params.id));

    const stats = lstmPredictor.getStats();

    log.info(`[LSTM] GET /predict/${req.params.id} — ${predictions.length} predictions | sensors=${stats.totalSensors}`);
    return res.json({
      success: true,
      structureId: req.params.id,
      predictions,
      modelStats: stats,
      timestamp: new Date().toISOString(),
      scientificBasis: 'BiLSTM (Schuster & Paliwal 1997) + Attention (Bahdanau 2014) + HST (ICOLD B.158)',
    });
  } catch (err) {
    log.error(`[LSTM] GET /predict/${req.params.id} error:`, err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/fem/stress
 * Run 2D plane-strain FEM stress analysis on a dam cross-section.
 * Body: { height?, baseWidth?, crestWidth?, divisionsX?, divisionsY? }
 * Uses CST elements (Zienkiewicz & Taylor 2000).
 */
digitalTwinRoutesC206.post('/fem/stress', async (req: Request, res: Response) => {
  try {
    const { solveStress, generateDamMesh } = await import('./fem-engine.js');
    const { height = 30, baseWidth = 25, crestWidth = 5, divisionsX = 8, divisionsY = 10 } = req.body || {};

    const { mesh, boundaries } = generateDamMesh(height, baseWidth, crestWidth, divisionsX, divisionsY);
    const result = solveStress(mesh, boundaries);

    log.info(`[FEM] POST /fem/stress — ${result.mesh.nodeCount} nodes, ${result.mesh.elementCount} elements, maxVM=${(result.summary.maxVonMises! / 1e6).toFixed(2)} MPa`);
    return res.json({
      success: true,
      result: {
        type: result.type,
        mesh: result.mesh,
        summary: result.summary,
        stresses: result.stresses?.slice(0, 50), // limit response size
        displacements: result.displacements?.slice(0, 50),
        warnings: result.warnings,
      },
      timestamp: new Date().toISOString(),
      scientificBasis: 'Zienkiewicz & Taylor (2000) FEM + Bathe (2014) CST + ICOLD B.155',
    });
  } catch (err) {
    log.error('[FEM] POST /fem/stress error:', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/fem/seepage
 * Run FDM seepage analysis (Darcy flow through dam body).
 * Body: { nx?, ny?, dx?, dy?, permeability?, headLeft?, headRight? }
 * Ref: Darcy (1856) + USACE EM 1110-2-1901
 */
digitalTwinRoutesC206.post('/fem/seepage', async (req: Request, res: Response) => {
  try {
    const { solveSeepage } = await import('./fem-engine.js');
    const { nx = 20, ny = 15, dx = 1.25, dy = 2.0, permeability = 1e-7, headLeft = 25, headRight = 0 } = req.body || {};

    const result = solveSeepage(nx, ny, dx, dy, permeability, { left: headLeft, right: headRight });

    log.info(`[FEM] POST /fem/seepage — ${result.mesh.nodeCount} nodes, maxV=${result.summary.maxSeepageVelocity!.toExponential(2)} m/s`);
    return res.json({
      success: true,
      result: {
        type: result.type,
        mesh: result.mesh,
        summary: result.summary,
        seepage: result.seepage?.slice(0, 100),
        warnings: result.warnings,
      },
      timestamp: new Date().toISOString(),
      scientificBasis: 'Darcy (1856) + USACE EM 1110-2-1901 + Gauss-Seidel SOR (Young 1971)',
    });
  } catch (err) {
    log.error('[FEM] POST /fem/seepage error:', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/fem/thermal
 * Run FDM thermal analysis (steady-state heat conduction).
 * Body: { nx?, ny?, dx?, dy?, thermalK?, tempLeft?, tempRight? }
 * Ref: Fourier (1822) + Incropera & DeWitt (2007)
 */
digitalTwinRoutesC206.post('/fem/thermal', async (req: Request, res: Response) => {
  try {
    const { solveThermal } = await import('./fem-engine.js');
    const { nx = 20, ny = 15, dx = 1.25, dy = 2.0, thermalK = 1.5, tempLeft = 15, tempRight = 25 } = req.body || {};

    const result = solveThermal(nx, ny, dx, dy, thermalK, { left: tempLeft, right: tempRight });

    log.info(`[FEM] POST /fem/thermal — ${result.mesh.nodeCount} nodes, maxT=${result.summary.maxTemperature!.toFixed(1)}°C`);
    return res.json({
      success: true,
      result: {
        type: result.type,
        mesh: result.mesh,
        summary: result.summary,
        thermal: result.thermal?.slice(0, 100),
        warnings: result.warnings,
      },
      timestamp: new Date().toISOString(),
      scientificBasis: 'Fourier (1822) + Incropera & DeWitt (2007) + Gauss-Seidel',
    });
  } catch (err) {
    log.error('[FEM] POST /fem/thermal error:', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

function computeSHMLevel(healthIndex: number): { level: number; description: string } {
  if (healthIndex >= 0.9) return { level: 0, description: 'Nominal — no anomaly detected' };
  if (healthIndex >= 0.7) return { level: 1, description: 'Detection — anomaly present' };
  if (healthIndex >= 0.5) return { level: 2, description: 'Localization — anomaly localized' };
  if (healthIndex >= 0.3) return { level: 3, description: 'Classification — anomaly classified' };
  return { level: 4, description: 'Prognosis — critical, predict remaining life' };
}
