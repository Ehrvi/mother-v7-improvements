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
