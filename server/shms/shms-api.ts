/**
 * SHMS API Routes — server/shms/shms-api.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * [C189 — NC-ARCH-001] DEPRECATED: This is SHMS v1.
 * Use server/mother/shms-analyze-endpoint.ts for new features.
 * This module will be removed in C195.
 * Scientific basis: Conselho C188 Seção 5.3 — NC-ARCH-001 SHMS Dual Implementation.
 *
 * Exposes SHMS functionality via REST API endpoints.
 * Integrates with MOTHER's a2a-server.ts as a sub-system.
 *
 * Endpoints:
 *   GET  /api/shms/status          — System status and active alerts
 *   GET  /api/shms/sensors         — List all sensors and their baselines
 *   GET  /api/shms/alerts          — Active alerts
 *   GET  /api/shms/alerts/history  — Alert history
 *   POST /api/shms/alerts/:id/ack  — Acknowledge an alert
 *   POST /api/shms/simulate        — Start/stop simulation
 *   GET  /api/shms/stream          — SSE stream of real-time readings
 *   POST /api/shms/analyze         — Analyze a single reading via MOTHER AI
 *
 * Scientific basis:
 * - REST API design: Roy Fielding (2000) — Architectural Styles and the Design of Network-based Software Architectures
 * - SSE: W3C EventSource API (2015)
 * - GISTM 2020: Alert level framework
 */

// [C189 — NC-ARCH-001] SHMS v1 DEPRECATED. Will be removed in C195. Use server/mother/shms-analyze-endpoint.ts.
console.warn('[SHMS v1] DEPRECATED: Use server/mother/shms-analyze-endpoint for new SHMS features. This module will be removed in C195.');

import type { Router, Request, Response } from 'express';
import { createSHMSConnector, type SensorReading } from './mqtt-connector';
import { SHMSAnomalyDetector } from './anomaly-detector';
import { SHMSAlertEngine } from './alert-engine';
import { validateSensorReading } from './sensor-validator'; // C189 — NC-SHMS-001: GISTM+ICOLD validation

// ============================================================
// SHMS System State (singleton)
// ============================================================

let shmsConnector = createSHMSConnector();
let shmsDetector = new SHMSAnomalyDetector(30);
let shmsAlertEngine = new SHMSAlertEngine();
let shmsRunning = false;
const sseClients: Response[] = [];

// Recent readings buffer (last 100 per sensor)
const recentReadings: Map<string, SensorReading[]> = new Map();

function initSHMS(): void {
  if (shmsRunning) return;

  // Wire up: connector → detector → alert engine → SSE broadcast
  shmsConnector.on('reading', (reading: SensorReading) => {
    // Store recent readings
    if (!recentReadings.has(reading.sensorId)) {
      recentReadings.set(reading.sensorId, []);
    }
    const buf = recentReadings.get(reading.sensorId)!;
    buf.push(reading);
    if (buf.length > 100) buf.shift();

    // Analyze for anomalies
    const anomaly = shmsDetector.analyze(reading);

    // Process alert if anomalous
    const alert = anomaly.isAnomaly ? shmsAlertEngine.processAnomaly(anomaly) : null;

    // Broadcast to SSE clients
    const event = {
      type: 'reading',
      reading: {
        sensorId: reading.sensorId,
        sensorType: reading.sensorType,
        value: reading.value,
        unit: reading.unit,
        timestamp: reading.timestamp.toISOString(),
        quality: reading.quality,
        location: reading.location,
      },
      anomaly: anomaly.isAnomaly ? {
        severity: anomaly.severity,
        score: anomaly.score,
        message: anomaly.message,
        methods: anomaly.method,
      } : null,
      alert: alert ? {
        id: alert.id,
        severity: alert.severity,
        escalationLevel: alert.escalationLevel,
        actions: alert.actions.slice(0, 3),
      } : null,
    };

    broadcastSSE(event);
  });

  shmsConnector.connect().then(() => {
    shmsConnector.startSimulation();
    shmsRunning = true;
    console.log('[SHMS-API] System initialized and running');
  });
}

function broadcastSSE(data: unknown): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// ============================================================
// Route handlers
// ============================================================

export function registerSHMSRoutes(router: Router): void {
  // Auto-initialize SHMS on first route access
  router.use('/api/shms', (_req, _res, next) => {
    if (!shmsRunning) initSHMS();
    next();
  });

  /**
   * GET /api/shms/status
   * Returns system status, alert summary, and connector status.
   */
  router.get('/api/shms/status', (_req: Request, res: Response) => {
    const alertSummary = shmsAlertEngine.getSummary();
    const connectorStatus = shmsConnector.getStatus();
    const detectorSummary = shmsDetector.getSummary();

    res.json({
      system: 'SHMS',
      version: 'v79.2',
      running: shmsRunning,
      connector: connectorStatus,
      alerts: alertSummary,
      sensors: {
        total: Object.keys(detectorSummary).length,
        anomalyReady: Object.values(detectorSummary).filter(s => s.anomalyReady).length,
        summary: detectorSummary,
      },
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/shms/sensors
   * Returns all sensor configurations and their baseline statistics.
   */
  router.get('/api/shms/sensors', (_req: Request, res: Response) => {
    const sensors = shmsConnector.getSensors();
    const baselines = shmsDetector.getSummary();

    res.json({
      sensors: sensors.map(s => ({
        ...s,
        baseline: baselines[s.sensorId] || null,
        recentReadings: (recentReadings.get(s.sensorId) || []).slice(-5).map(r => ({
          value: r.value,
          timestamp: r.timestamp.toISOString(),
        })),
      })),
      total: sensors.length,
    });
  });

  /**
   * GET /api/shms/alerts
   * Returns active alerts sorted by severity.
   */
  router.get('/api/shms/alerts', (_req: Request, res: Response) => {
    const alerts = shmsAlertEngine.getActiveAlerts();
    res.json({
      alerts,
      total: alerts.length,
      summary: shmsAlertEngine.getSummary(),
    });
  });

  /**
   * GET /api/shms/alerts/history
   * Returns alert history.
   */
  router.get('/api/shms/alerts/history', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string || '50');
    res.json({
      history: shmsAlertEngine.getHistory(limit),
      limit,
    });
  });

  /**
   * POST /api/shms/alerts/:sensorId/ack
   * Acknowledge an alert.
   */
  router.post('/api/shms/alerts/:sensorId/ack', (req: Request, res: Response) => {
    const { sensorId } = req.params;
    const { acknowledgedBy } = req.body;

    if (!acknowledgedBy) {
      res.status(400).json({ error: 'acknowledgedBy is required' });
      return;
    }

    const success = shmsAlertEngine.acknowledge(sensorId, acknowledgedBy);
    if (!success) {
      res.status(404).json({ error: `No active alert for sensor ${sensorId}` });
      return;
    }

    res.json({ success: true, message: `Alert for ${sensorId} acknowledged by ${acknowledgedBy}` });
  });

  /**
   * POST /api/shms/simulate
   * Control simulation (start/stop/reset).
   */
  router.post('/api/shms/simulate', (req: Request, res: Response) => {
    const { action } = req.body;

    if (action === 'start') {
      if (!shmsRunning) {
        initSHMS();
        res.json({ success: true, message: 'SHMS simulation started' });
      } else {
        res.json({ success: false, message: 'SHMS already running' });
      }
    } else if (action === 'stop') {
      shmsConnector.disconnect();
      shmsRunning = false;
      res.json({ success: true, message: 'SHMS simulation stopped' });
    } else if (action === 'reset') {
      shmsConnector.disconnect();
      shmsConnector = createSHMSConnector();
      shmsDetector = new SHMSAnomalyDetector(30);
      shmsAlertEngine = new SHMSAlertEngine();
      shmsRunning = false;
      recentReadings.clear();
      res.json({ success: true, message: 'SHMS system reset' });
    } else {
      res.status(400).json({ error: 'action must be start|stop|reset' });
    }
  });

  /**
   * GET /api/shms/stream
   * SSE stream of real-time sensor readings and alerts.
   * Scientific basis: W3C EventSource API (2015)
   */
  router.get('/api/shms/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({
      status: 'streaming',
      system: 'SHMS',
      version: 'v79.2',
      sensors: shmsConnector.getSensors().length,
    })}\n\n`);

    sseClients.push(res);

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  /**
   * POST /api/shms/analyze
   * Analyze a single reading using MOTHER AI for context-aware interpretation.
   */
  router.post('/api/shms/analyze', async (req: Request, res: Response) => {
    const { sensorId, sensorType, value, unit, location } = req.body;

    if (!sensorId || value === undefined) {
      res.status(400).json({ error: 'sensorId and value are required' });
      return;
    }

    const reading: SensorReading = {
      sensorId,
      sensorType: sensorType || 'custom',
      timestamp: new Date(),
      value: parseFloat(value),
      unit: unit || '',
      location: location || { zone: 'unknown' },
      quality: 'good',
    };

    const anomaly = shmsDetector.analyze(reading);
    const alert = anomaly.isAnomaly ? shmsAlertEngine.processAnomaly(anomaly) : null;

    res.json({
      reading: {
        sensorId: reading.sensorId,
        value: reading.value,
        unit: reading.unit,
        timestamp: reading.timestamp.toISOString(),
      },
      anomaly,
      alert,
      recommendations: alert ? alert.actions : ['Continue normal monitoring'],
    });
  });

  console.log('[SHMS-API] Routes registered: /api/shms/*');
}
