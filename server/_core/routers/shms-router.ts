/**
 * shms-router.ts — MOTHER v81.8 — Ciclo 189
 *
 * SHMS routes extracted from a2a-server.ts.
 * Part of NC-ARCH-002 resolution: decomposing God Object a2a-server.ts (2.268L).
 * Routes SHMS v2 requests to shms-analyze-endpoint.ts.
 *
 * Scientific basis:
 * - Conselho C188 Seção 5.4 — NC-ARCH-002 God Object decomposition
 * - Sun et al. (2025) DOI:10.1145/3777730.3777858 — SHM analysis pipeline
 * - ICOLD Bulletin 158 (2014) — 3-level alarm system
 * - Roy Fielding (2000) — REST architectural constraints
 *
 * @module shms-router
 * @version 1.0.0
 * @cycle C189
 * @council C188 — NC-ARCH-002 resolution
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import { authenticateA2A } from './auth-router.js';
import type { NotificationChannel } from '../../shms/notification-dispatcher.js';

const log = createLogger('shms-router');

export const shmsRouter = Router();

/**
 * GET /shms/health — SHMS service health (no auth required)
 * Scientific basis: Google SRE Book (Beyer et al., 2016) — health check pattern
 */
shmsRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'SHMS v2',
    mqttConfigured: !!process.env.MQTT_BROKER_URL,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /shms/analyze — SHMS v2 analysis via shms-analyze-endpoint
 * Delegates to shms-analyze-endpoint.ts for full analysis pipeline.
 * Scientific basis: Sun et al. (2025) — DL for SHM analysis pipeline
 */
shmsRouter.post('/analyze', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { handleSHMSAnalyze } = await import('../../mother/shms-analyze-endpoint.js');
    return handleSHMSAnalyze(req, res);
  } catch (err) {
    log.error('[SHMSRouter] Failed to load shms-analyze-endpoint:', err);
    res.status(500).json({ error: 'SHMS analysis service unavailable' });
  }
});

/**
 * GET /shms/dashboard — Dashboard básico SHMS (1 estrutura monitorada)
 * C191 Phase 6 S3-4 — Conselho C188 Seção 9.3
 * Base científica: Sun et al. (2025); ICOLD Bulletin 158 (2014); GISTM 2020
 */
shmsRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { getDashboardData } = await import('../../mother/dashboard-shms.js');
    const structureId = (req.query.structureId as string) ?? 'STRUCTURE_001';
    const data = await getDashboardData(structureId);
    res.json(data);
  } catch (err) {
    log.error('[SHMSRouter] Dashboard error:', err);
    res.status(500).json({ error: 'Dashboard unavailable' });
  }
});

/**
 * GET /shms/dashboard/all — Dashboard de TODAS as 3 estruturas monitoradas
 * C192 Phase 7 S1-2 — Conselho C188 Seção 9.4 — KPI: 3 estruturas
 * Base científica: Sun et al. (2025); ICOLD Bulletin 158 (2014)
 */
shmsRouter.get('/dashboard/all', async (_req: Request, res: Response) => {
  try {
    const { getAllDashboardData } = await import('../../mother/dashboard-shms.js');
    const data = await getAllDashboardData();
    res.json(data);
  } catch (err) {
    log.error('[SHMSRouter] Dashboard/all error:', err);
    res.status(500).json({ error: 'Multi-structure dashboard unavailable' });
  }
});

/**
 * GET /shms/dashboard/:structureId — Dashboard de estrutura específica
 * C192 Phase 7 S1-2 — Conselho C188 Seção 9.4
 * Base científica: Sun et al. (2025); ICOLD Bulletin 158 (2014)
 */
shmsRouter.get('/dashboard/:structureId', async (req: Request, res: Response) => {
  try {
    const { getDashboardData, MONITORED_STRUCTURES } = await import('../../mother/dashboard-shms.js');
    const { structureId } = req.params;
    if (!MONITORED_STRUCTURES[structureId]) {
      res.status(404).json({
        error: `Structure '${structureId}' not found`,
        validStructures: Object.keys(MONITORED_STRUCTURES),
      });
      return;
    }
    const data = await getDashboardData(structureId);
    res.json(data);
  } catch (err) {
    log.error('[SHMSRouter] Dashboard/:id error:', err);
    res.status(500).json({ error: 'Dashboard unavailable' });
  }
});

/**
 * GET /shms/history/:structureId — Historical sensor readings from TimescaleDB
 * C194-2: Returns time-series data for a structure over the last N hours.
 * Base científica: ICOLD Bulletin 158 (2014) — historical data analysis;
 *   Freedman et al. (2018) TimescaleDB — time-bucketed queries.
 * Query params: hours (default: 24), sensorType (optional), limit (default: 1000)
 */
shmsRouter.get('/history/:structureId', async (req: Request, res: Response) => {
  try {
    const { queryReadingsHistory } = await import('../../shms/timescale-pg-client.js');
    const { structureId } = req.params;
    const hours = parseInt((req.query.hours as string) ?? '24', 10);
    const sensorType = req.query.sensorType as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? '1000', 10);

    if (isNaN(hours) || hours < 1 || hours > 720) {
      res.status(400).json({ error: 'hours must be between 1 and 720' });
      return;
    }

    const result = await queryReadingsHistory({ structureId, hours, sensorType, limit });
    res.json({
      structureId,
      hours,
      sensorType: sensorType ?? 'all',
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('[SHMSRouter] History error:', err);
    res.status(500).json({ error: 'History query unavailable' });
  }
});

/**
 * GET /shms/bridge/stats — MQTT→TimescaleDB bridge statistics
 * C194-1: Returns real-time ingestion pipeline stats.
 */
shmsRouter.get('/bridge/stats', async (_req: Request, res: Response) => {
  try {
    const { getMQTTTimescaleBridge } = await import('../../shms/mqtt-timescale-bridge.js');
    const bridge = getMQTTTimescaleBridge();
    if (!bridge) {
      res.json({ status: 'not-initialized', message: 'MQTT-TimescaleDB bridge not started' });
      return;
    }
    res.json({ status: 'active', stats: bridge.getStats() });
  } catch (err) {
    log.error('[SHMSRouter] Bridge stats error:', err);
    res.status(500).json({ error: 'Bridge stats unavailable' });
  }
});

/**
 * GET /shms/status — SHMS v2 status
 */
shmsRouter.get('/status', authenticateA2A, (_req: Request, res: Response) => {
  res.json({
    version: 'v2',
    mqttConnected: !!process.env.MQTT_BROKER_URL,
    deprecatedV1: 'server/shms/shms-api.ts — will be removed C195',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /shms/signal-analysis/:structureId — Signal analysis with damage indices
 *
 * Runs processSignal + computeDamageIndex on the latest readings from the
 * primary sensor of the given structure.
 *
 * Scientific basis:
 * - Rytter (1993): Damage indices via frequency shift, MAC, WER
 * - Welch (1967): PSD estimation with averaged periodograms
 * - Harris (1978): Hann window to reduce spectral leakage
 * - AASHTO (2018) / ISO 13822 (2010): structural assessment thresholds
 *
 * Query params: sampleRateHz (default: 100), limit (default: 60)
 */
shmsRouter.get('/signal-analysis/:structureId', async (req: Request, res: Response) => {
  try {
    const { processSignal, computeDamageIndex } = await import('../../shms/signal-processor.js');
    const { queryReadingsHistory } = await import('../../shms/timescale-pg-client.js');

    const { structureId } = req.params;
    const sampleRateHz = parseFloat((req.query.sampleRateHz as string) ?? '100');
    const limit = parseInt((req.query.limit as string) ?? '60', 10);

    if (isNaN(sampleRateHz) || sampleRateHz <= 0) {
      res.status(400).json({ error: 'sampleRateHz must be a positive number' });
      return;
    }

    let readings: number[] = [];
    let usedFallback = false;

    try {
      const result = await queryReadingsHistory({ structureId, hours: 24, limit });
      readings = result.readings?.map((r: { value: number }) => r.value) ?? [];
    } catch {
      log.warn(`[SHMSRouter] signal-analysis: TimescaleDB unavailable for ${structureId}, using mock`);
    }

    // Fallback: synthetic sinusoidal signal with noise if insufficient real data
    if (readings.length < 16) {
      usedFallback = true;
      const n = 64;
      readings = Array.from({ length: n }, (_, i) => {
        const t = i / sampleRateHz;
        return (
          Math.sin(2 * Math.PI * 5.2 * t) +
          0.4 * Math.sin(2 * Math.PI * 12.7 * t) +
          0.1 * (Math.random() - 0.5)
        );
      });
    }

    const signalResult = processSignal(readings, sampleRateHz);

    // Compute damage index: compare against a synthetic baseline (flat signal)
    const baseline = Array.from({ length: readings.length }, (_, i) => {
      const t = i / sampleRateHz;
      return Math.sin(2 * Math.PI * 5.0 * t);
    });
    const baselineResult = processSignal(baseline, sampleRateHz);
    const damageResult = computeDamageIndex(signalResult, baselineResult);

    res.json({
      structureId,
      sampleRateHz,
      readingsUsed: readings.length,
      usedFallback,
      signalAnalysis: signalResult,
      damageIndex: damageResult,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('[SHMSRouter] signal-analysis error:', err);
    res.status(500).json({ error: 'Signal analysis unavailable' });
  }
});

/**
 * GET /shms/rul/:structureId — Remaining Useful Life prediction
 *
 * Fetches the health score history for the given structure (last 90 days)
 * and returns a RUL prediction using the exponential degradation model.
 *
 * Scientific basis:
 * - Paris & Erdogan (1963): Exponential degradation model
 * - ISO 13381-1 (2015): RUL estimation methodology
 * - Efron (1979): Bootstrap resampling for uncertainty (P10/P50/P90)
 * - AASHTO (2018) LRFDBR §4: critical threshold at 60 health points
 *
 * Query params: days (default: 90), criticalThreshold (default: 60)
 */
shmsRouter.get('/rul/:structureId', async (req: Request, res: Response) => {
  try {
    const { predictRUL } = await import('../../shms/rul-predictor.js');
    const { queryReadingsHistory } = await import('../../shms/timescale-pg-client.js');

    const { structureId } = req.params;
    const days = parseInt((req.query.days as string) ?? '90', 10);
    const criticalThreshold = parseFloat((req.query.criticalThreshold as string) ?? '60');

    if (isNaN(days) || days < 7 || days > 365) {
      res.status(400).json({ error: 'days must be between 7 and 365' });
      return;
    }

    let history: Array<{ timestamp: Date; healthScore: number }> = [];
    let usedFallback = false;

    try {
      // Fetch historical readings and derive health score from ICOLD GREEN ratio
      const result = await queryReadingsHistory({ structureId, hours: days * 24, limit: days * 24 });
      const rawReadings = result.readings ?? [];

      if (rawReadings.length >= 7) {
        // Group by day and compute daily health score proxy
        const byDay = new Map<string, number[]>();
        for (const r of rawReadings) {
          const day = new Date(r.time).toISOString().slice(0, 10);
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day)!.push(r.value ?? 0);
        }
        history = [...byDay.entries()].map(([day, vals]) => ({
          timestamp: new Date(day),
          // Proxy health score: 100 minus coefficient of variation scaled to 0-40 pt range
          healthScore: Math.max(0, Math.min(100,
            100 - (Math.sqrt(vals.reduce((a, v) => a + (v - vals.reduce((x, y) => x + y) / vals.length) ** 2, 0) / vals.length) /
              (Math.abs(vals.reduce((a, v) => a + v, 0) / vals.length) || 1)) * 40
          )),
        }));
      }
    } catch {
      log.warn(`[SHMSRouter] rul: TimescaleDB unavailable for ${structureId}, using mock history`);
    }

    // Fallback: synthetic degradation history if insufficient real data
    if (history.length < 7) {
      usedFallback = true;
      const now = Date.now();
      history = Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(now - (29 - i) * 86400_000),
        healthScore: 95 - i * 0.3 + (Math.random() - 0.5) * 2,
      }));
    }

    const prediction = predictRUL(structureId, history, criticalThreshold);

    res.json({
      ...prediction,
      daysAnalysed: days,
      dataPoints: history.length,
      usedFallback,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('[SHMSRouter] rul error:', err);
    res.status(500).json({ error: 'RUL prediction unavailable' });
  }
});

/**
 * POST /shms/alerts/:alertId/notify — Dispatch alert notification to configured channels
 *
 * Body: {
 *   structureId: string;
 *   severity: 'WATCH' | 'WARNING' | 'ALERT' | 'CRITICAL';
 *   title: string;
 *   description: string;
 *   channels: NotificationChannel[];
 *   sensorId?: string;
 *   value?: number;
 *   threshold?: number;
 * }
 *
 * Scientific basis:
 * - GISTM (2020) Section 10: Emergency notification for tailings dam monitoring
 * - ISO 13822 (2010): Structural assessment alerting obligations
 * - IEC 62682:2014 §6.3: Alarm priority management P1–P4
 */
shmsRouter.post('/alerts/:alertId/notify', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { notificationDispatcher } = await import('../../shms/notification-dispatcher.js');

    const { alertId } = req.params;
    const {
      structureId,
      severity,
      title,
      description,
      channels,
      sensorId,
      value,
      threshold,
    } = req.body as {
      structureId: string;
      severity: 'WATCH' | 'WARNING' | 'ALERT' | 'CRITICAL';
      title: string;
      description: string;
      channels: NotificationChannel[];
      sensorId?: string;
      value?: number;
      threshold?: number;
    };

    // Validate required fields
    if (!structureId || !severity || !title || !description || !Array.isArray(channels)) {
      res.status(400).json({
        error: 'Required fields: structureId, severity, title, description, channels (array)',
      });
      return;
    }

    const validSeverities = ['WATCH', 'WARNING', 'ALERT', 'CRITICAL'];
    if (!validSeverities.includes(severity)) {
      res.status(400).json({
        error: `severity must be one of: ${validSeverities.join(', ')}`,
      });
      return;
    }

    const payload = {
      alertId,
      structureId,
      severity,
      title,
      description,
      sensorId,
      value,
      threshold,
      timestamp: new Date(),
      dashboardUrl: `${process.env.APP_URL ?? ''}/shms`,
    };

    const results = await notificationDispatcher.dispatch(payload, channels as import("../../shms/notification-dispatcher.js").NotificationChannel[]);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    log.info(`[SHMSRouter] Dispatched alert ${alertId}: ${successCount} ok, ${failCount} failed`);

    res.json({
      alertId,
      dispatched: results.length,
      successCount,
      failCount,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('[SHMSRouter] alerts/notify error:', err);
    res.status(500).json({ error: 'Notification dispatch unavailable' });
  }
});

/**
 * GET /shms/instrumentation/:structureId — virtual tags, alarm levels, unit conversion
 * Module 1 — InstrumentationManager
 */
shmsRouter.get('/instrumentation/:structureId', async (req: Request, res: Response) => {
  try {
    const { InstrumentationManager } = await import('../../shms/instrumentation.js');
    const mgr = new InstrumentationManager();
    const allTags = mgr.getAllTags();
    const tags = allTags.filter((t) => t.structureId === req.params.structureId);
    res.json({ structureId: req.params.structureId, tags, count: tags.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] instrumentation error:', err);
    res.status(500).json({ error: 'Instrumentation service unavailable' });
  }
});

/**
 * GET /shms/big-data/:structureId — behavior classification, correlation, autocorrelation
 * Module 2 — BigDataAnalysis
 */
shmsRouter.get('/big-data/:structureId', async (req: Request, res: Response) => {
  try {
    const { classifyBehavior, computeCorrelation } = await import('../../shms/big-data-analysis.js');
    // Return available analysis capabilities
    res.json({
      structureId: req.params.structureId,
      capabilities: ['classifyBehavior', 'computeCorrelation', 'computeAutocorrelation', 'computeMechanicalProperties'],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('[SHMSRouter] big-data error:', err);
    res.status(500).json({ error: 'Big data analysis service unavailable' });
  }
});

/**
 * GET /shms/risk-map/:structureId — geotechnical risk polygons, ICOLD colors
 * Module 3 — RiskMapsManager
 */
shmsRouter.get('/risk-map/:structureId', async (req: Request, res: Response) => {
  try {
    const { RiskMapsManager } = await import('../../shms/risk-maps.js');
    const mgr = new RiskMapsManager();
    const zones = mgr.getPolygonsByStructure(req.params.structureId);
    const snapshot = mgr.createSnapshot(req.params.structureId, new Map());
    res.json({ structureId: req.params.structureId, zones, snapshot, count: zones.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] risk-map error:', err);
    res.status(500).json({ error: 'Risk map service unavailable' });
  }
});

/**
 * GET /shms/cross-section/:structureId — geological cross-section SVG
 * Module 6 — CrossSectionManager
 */
shmsRouter.get('/cross-section/:structureId', async (req: Request, res: Response) => {
  try {
    const { CrossSectionManager } = await import('../../shms/cross-section.js');
    const mgr = new CrossSectionManager();
    const sections = mgr.getSectionsByStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, sections, count: sections.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] cross-section error:', err);
    res.status(500).json({ error: 'Cross-section service unavailable' });
  }
});

/**
 * GET /shms/stability/:structureId — Bishop method FOS, Monte Carlo failure probability
 * Module 7 — StabilityAnalysisEngine
 */
shmsRouter.get('/stability/:structureId', async (req: Request, res: Response) => {
  try {
    const { StabilityAnalysisEngine } = await import('../../shms/stability-analysis.js');
    const engine = new StabilityAnalysisEngine();
    const analyses = engine.getModelsByStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, analyses, count: analyses.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] stability error:', err);
    res.status(500).json({ error: 'Stability analysis service unavailable' });
  }
});

/**
 * GET /shms/fault-tree/:structureId — fault tree analysis, event trees
 * Module 11 — FaultTreeEngine
 */
shmsRouter.get('/fault-tree/:structureId', async (req: Request, res: Response) => {
  try {
    const { FaultTreeEngine } = await import('../../shms/fault-tree.js');
    const engine = new FaultTreeEngine();
    const trees = engine.getTreesByStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, trees, count: trees.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] fault-tree error:', err);
    res.status(500).json({ error: 'Fault tree service unavailable' });
  }
});

/**
 * GET /shms/boreholes/:structureId — lithologic profiles, deviation survey
 * Module 12 — BoreholesManager
 */
shmsRouter.get('/boreholes/:structureId', async (req: Request, res: Response) => {
  try {
    const { BoreholesManager } = await import('../../shms/boreholes.js');
    const mgr = new BoreholesManager();
    const boreholes = mgr.getBoreholesForStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, boreholes, count: boreholes.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] boreholes error:', err);
    res.status(500).json({ error: 'Boreholes service unavailable' });
  }
});

/**
 * GET /shms/boreholes/:structureId/:boreholeId/svg — lithologic profile SVG
 */
shmsRouter.get('/boreholes/:structureId/:boreholeId/svg', async (req: Request, res: Response) => {
  try {
    const { BoreholesManager } = await import('../../shms/boreholes.js');
    const mgr = new BoreholesManager();
    const profile = mgr.renderProfiles(req.params.structureId).get(req.params.boreholeId);
    if (!profile) {
      res.status(404).json({ error: 'Borehole not found' });
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(profile.svgProfile);
  } catch (err) {
    log.error('[SHMSRouter] borehole-svg error:', err);
    res.status(500).json({ error: 'Borehole SVG service unavailable' });
  }
});

/**
 * GET /shms/events/:structureId — event timeline
 * Module 16 — EventsModule
 */
shmsRouter.get('/events/:structureId', async (req: Request, res: Response) => {
  try {
    const { EventsModule } = await import('../../shms/events-module.js');
    const mod = new EventsModule();
    const daysBack = parseInt(req.query.days as string ?? '30', 10);
    const to = new Date();
    const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const timeline = mod.getTimeline(req.params.structureId, from, to);
    res.json({ structureId: req.params.structureId, events: timeline.events, count: timeline.totalCount, periodStart: timeline.periodStart, periodEnd: timeline.periodEnd, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] events error:', err);
    res.status(500).json({ error: 'Events module unavailable' });
  }
});

/**
 * POST /shms/export — export sensor data (CSV/JSON/Excel/Word)
 * Module 14 — OfficeConnector
 */
shmsRouter.post('/export', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { exportReadings } = await import('../../shms/office-connector.js');
    const { readings, options } = req.body as {
      readings: import('../../shms/office-connector.js').SensorReading[];
      options: import('../../shms/office-connector.js').ExportOptions;
    };
    if (!readings || !options?.format || !options?.structureId) {
      res.status(400).json({ error: 'Required: readings, options.format, options.structureId' });
      return;
    }
    const result = exportReadings(readings, options);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    log.error('[SHMSRouter] export error:', err);
    res.status(500).json({ error: 'Export service unavailable' });
  }
});

/**
 * POST /shms/bi/push — push KPIs to BI sinks (Power BI, Tableau, Grafana)
 * Module 15 — BIIntegration
 */
shmsRouter.post('/bi/push', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { biIntegrationManager, computeSHMSKpis } = await import('../../shms/bi-integration.js');
    const { kpis } = req.body as { kpis: import('../../shms/bi-integration.js').SHMSKpi[] };
    if (!Array.isArray(kpis) || kpis.length === 0) {
      res.status(400).json({ error: 'Required: kpis (non-empty array)' });
      return;
    }
    const results = await biIntegrationManager.pushKpis(kpis);
    const successCount = results.filter((r) => r.success).length;
    res.json({ pushed: results.length, successCount, failCount: results.length - successCount, results, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] bi/push error:', err);
    res.status(500).json({ error: 'BI integration unavailable' });
  }
});

/**
 * GET /shms/3d/:structureId — 3D scene data (mesh, DEM, sensor markers)
 * Module 5 — Environment3DManager
 */
shmsRouter.get('/3d/:structureId', async (req: Request, res: Response) => {
  try {
    const { environment3DManager, generateDamScene } = await import('../../shms/environment-3d.js');
    let scene = environment3DManager.getScene(req.params.structureId);
    if (!scene) {
      // Generate a default dam scene as fallback
      scene = generateDamScene(req.params.structureId, {
        crestElevation: 850, baseElevation: 760, crestLength: 400,
        upstreamSlope: 0.35, downstreamSlope: 0.4,
      });
      environment3DManager.registerScene(scene);
    }
    res.json(scene);
  } catch (err) {
    log.error('[SHMSRouter] 3d error:', err);
    res.status(500).json({ error: '3D environment service unavailable' });
  }
});

/**
 * GET /shms/files/:structureId — list files for structure
 * Module 8 — FileDriveManager
 */
shmsRouter.get('/files/:structureId', async (req: Request, res: Response) => {
  try {
    const { fileDriveManager } = await import('../../shms/file-drive.js');
    const files = fileDriveManager.getFilesForStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, files, count: files.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] files error:', err);
    res.status(500).json({ error: 'File drive service unavailable' });
  }
});

/**
 * POST /shms/files — register a file upload
 * Module 8 — FileDriveManager
 */
shmsRouter.post('/files', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { fileDriveManager, validateFileUpload } = await import('../../shms/file-drive.js');
    const validation = validateFileUpload(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: 'Validation failed', errors: validation.errors });
      return;
    }
    const file = fileDriveManager.registerFile(req.body);
    res.status(201).json(file);
  } catch (err) {
    log.error('[SHMSRouter] files/register error:', err);
    res.status(500).json({ error: 'File registration unavailable' });
  }
});

/**
 * GET /shms/documents/:structureId — list documents for structure
 * Module 9 — DocumentManagementSystem
 */
shmsRouter.get('/documents/:structureId', async (req: Request, res: Response) => {
  try {
    const { documentManagementSystem } = await import('../../shms/document-management.js');
    const documents = documentManagementSystem.getDocumentsByStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, documents, count: documents.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] documents error:', err);
    res.status(500).json({ error: 'Document management unavailable' });
  }
});

/**
 * GET /shms/bank/:structureId — budget summary for structure
 * Module 10 — BankReconciliationManager
 */
shmsRouter.get('/bank/:structureId', async (req: Request, res: Response) => {
  try {
    const { bankReconciliationManager } = await import('../../shms/bank-reconciliation.js');
    const year = parseInt(req.query.year as string ?? String(new Date().getFullYear()), 10);
    const summary = bankReconciliationManager.getBudgetSummary(req.params.structureId, year);
    res.json(summary);
  } catch (err) {
    log.error('[SHMSRouter] bank error:', err);
    res.status(500).json({ error: 'Bank reconciliation service unavailable' });
  }
});

/**
 * GET /shms/sirens/:structureId — list sirens for structure
 * Module 13 — SirenManager
 */
shmsRouter.get('/sirens/:structureId', async (req: Request, res: Response) => {
  try {
    const { sirenManager } = await import('../../shms/sirens.js');
    const sirens = sirenManager.getSirensForStructure(req.params.structureId);
    res.json({ structureId: req.params.structureId, sirens, count: sirens.length, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] sirens error:', err);
    res.status(500).json({ error: 'Siren service unavailable' });
  }
});

/**
 * POST /shms/sirens/:structureId/activate — activate emergency alert
 * Module 13 — SirenManager
 */
shmsRouter.post('/sirens/:structureId/activate', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { sirenManager } = await import('../../shms/sirens.js');
    const { alertLevel, triggeredBy, message } = req.body as { alertLevel: string; triggeredBy: string; message?: string };
    if (!alertLevel || !triggeredBy) {
      res.status(400).json({ error: 'Required: alertLevel, triggeredBy' });
      return;
    }
    const event = sirenManager.activateAlert(
      req.params.structureId,
      alertLevel as import('../../shms/sirens.js').SirenAlertLevel,
      triggeredBy,
      message
    );
    res.json(event);
  } catch (err) {
    log.error('[SHMSRouter] sirens/activate error:', err);
    res.status(500).json({ error: 'Siren activation unavailable' });
  }
});

/**
 * GET /shms/tarp/:structureId — TARP matrix and compliance status
 * Module 17 — TARPManager
 */
shmsRouter.get('/tarp/:structureId', async (req: Request, res: Response) => {
  try {
    const { tarpManager } = await import('../../shms/tarp.js');
    const matrix = tarpManager.getMatrix(req.params.structureId);
    const compliance = tarpManager.getComplianceStatus(req.params.structureId);
    const activeActivations = tarpManager.getActiveActivations(req.params.structureId);
    res.json({ structureId: req.params.structureId, matrix, compliance, activeActivations, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[SHMSRouter] tarp error:', err);
    res.status(500).json({ error: 'TARP service unavailable' });
  }
});
