/**
 * FTA Integration REST API — server/shms/fta-integration-routes.ts
 *
 * Exposes the FTA Integration Bus via REST endpoints for client consumption.
 *
 * Scientific basis:
 *   - Fielding (2000) — REST architectural style
 *   - Bobbio et al. (2001) — FT→BN sensor evidence
 *   - ICOLD B.158 §4.3 — Instrument alarm management
 *   - GISTM 2020 §7 — Monitoring requirements
 *
 * Endpoints:
 *   GET  /api/shms/v2/fta/live/:structureId    — live FTA state with sensor data
 *   GET  /api/shms/v2/fta/instruments           — sensor↔FTA node mapping table
 *   GET  /api/shms/v2/fta/stats                 — integration bus statistics
 *   POST /api/shms/v2/fta/hooks/register        — register external probability source
 *   POST /api/shms/v2/fta/mappings              — add sensor→node mapping
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../_core/logger.js';
import { ftaIntegrationBus, type SensorNodeMapping } from './fta-integration-bus.js';

const log = createLogger('fta-integration-routes');

export const ftaIntegrationRoutes = Router();

/**
 * GET /api/shms/v2/fta/live/:structureId
 * Returns live FTA state with MQTT-updated probabilities, sensor readings,
 * LSTM predictions, and DGM status.
 * Scientific basis: Grieves (2017) — Digital Twin real-time sync
 */
ftaIntegrationRoutes.get('/fta/live/:structureId', (req: Request, res: Response) => {
  try {
    const { structureId } = req.params;
    const liveState = ftaIntegrationBus.getLiveState(structureId);

    log.info(`[FTA-API] GET /fta/live/${structureId} — ${liveState.probabilityUpdates.length} updates, P(top)=${liveState.topEventProbability.toExponential(2)}`);

    res.json({
      success: true,
      ...liveState,
      scientificBasis: 'Bobbio (2001) sigmoid + ICOLD B.158 + GISTM 2020 + Grieves (2017)',
    });
  } catch (err) {
    log.error('[FTA-API] GET /fta/live error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * GET /api/shms/v2/fta/instruments
 * Returns the complete sensor↔FTA node mapping table.
 * Scientific basis: ICOLD B.158 §4.3 — instrument identification
 */
ftaIntegrationRoutes.get('/fta/instruments', (_req: Request, res: Response) => {
  try {
    const mappings = ftaIntegrationBus.getSensorMappings();
    const sources = ftaIntegrationBus.getRegisteredSources();

    res.json({
      success: true,
      mappings,
      externalSources: sources,
      count: mappings.length,
      timestamp: new Date().toISOString(),
      scientificBasis: 'ICOLD B.158 §4.3 + GISTM 2020 §7',
    });
  } catch (err) {
    log.error('[FTA-API] GET /fta/instruments error:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * GET /api/shms/v2/fta/stats
 * Returns integration bus statistics.
 */
ftaIntegrationRoutes.get('/fta/stats', (_req: Request, res: Response) => {
  try {
    const stats = ftaIntegrationBus.getStats();
    res.json({ success: true, ...stats, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/fta/hooks/register
 * Register an external module as a probability source.
 * Body: { sourceId, name, type, sensorMappings? }
 * Extension hook for future modules (code or user-defined).
 */
ftaIntegrationRoutes.post('/fta/hooks/register', (req: Request, res: Response) => {
  try {
    const { sourceId, name, type } = req.body;
    if (!sourceId || !name) {
      return res.status(400).json({
        success: false,
        error: 'Required: sourceId, name',
        example: { sourceId: 'custom-model', name: 'My ML Model', type: 'model' },
      });
    }

    ftaIntegrationBus.registerSource({
      id: sourceId,
      name,
      type: type || 'external',
      getUpdates: () => new Map(), // placeholder — external source pushes updates via separate endpoint
    });

    log.info(`[FTA-API] External source registered: ${sourceId} (${type})`);
    return res.json({
      success: true,
      sourceId,
      message: `Source '${sourceId}' registered. Use PUT /fta/hooks/${sourceId}/update to push probability updates.`,
    });
  } catch (err) {
    log.error('[FTA-API] POST /fta/hooks/register error:', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/**
 * POST /api/shms/v2/fta/mappings
 * Add a new sensor→FTA node mapping.
 * Body: SensorNodeMapping
 * Extension hook for user-defined instrument configuration.
 */
ftaIntegrationRoutes.post('/fta/mappings', (req: Request, res: Response) => {
  try {
    const mapping = req.body as SensorNodeMapping;
    if (!mapping.sensorId || !mapping.ftaNodeId) {
      return res.status(400).json({
        success: false,
        error: 'Required: sensorId, ftaNodeId, thresholdCritical, sigma',
        example: {
          sensorId: 'STRAIN-01',
          ftaNodeId: 'BE_STRAIN',
          sensorType: 'strain_gauge',
          thresholdNormal: 100,
          thresholdAlert: 500,
          thresholdCritical: 1000,
          unit: 'με',
          sigma: 150,
        },
      });
    }

    ftaIntegrationBus.addSensorMapping(mapping);
    log.info(`[FTA-API] Mapping added: ${mapping.sensorId} → ${mapping.ftaNodeId}`);
    return res.json({
      success: true,
      mapping,
      totalMappings: ftaIntegrationBus.getSensorMappings().length,
    });
  } catch (err) {
    log.error('[FTA-API] POST /fta/mappings error:', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});
