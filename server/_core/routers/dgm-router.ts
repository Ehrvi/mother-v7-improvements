/**
 * dgm-router.ts — MOTHER v81.8 — Ciclo 189
 *
 * DGM routes extracted from a2a-server.ts.
 * Part of NC-ARCH-002 resolution: decomposing God Object a2a-server.ts (2.268L).
 *
 * Scientific basis:
 * - Conselho C188 Seção 5.4 — NC-ARCH-002 God Object decomposition
 * - Darwin Gödel Machine (Clune, 2025) arXiv:2505.22954 — closed-loop self-modification
 * - Roy Fielding (2000) — REST architectural constraints
 *
 * @module dgm-router
 * @version 1.0.0
 * @cycle C189
 * @council C188 — NC-ARCH-002 resolution
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import { authenticateA2A } from './auth-router.js';
import { getRegistrySummary, getOrphanModules, getCriticalOrphans } from '../../mother/connection-registry.js';

const log = createLogger('dgm-router');

export const dgmRouter = Router();

/**
 * GET /dgm/status — DGM system status
 */
dgmRouter.get('/status', authenticateA2A, (_req: Request, res: Response) => {
  const summary = getRegistrySummary();
  res.json({
    status: 'ok',
    registry: summary,
    orphanModules: getOrphanModules().map(m => ({ name: m.name, cycleCreated: m.cycleCreated, priority: m.priority })),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /dgm/registry — Full connection registry
 * Scientific basis: R27 — connection registry for orphan tracking
 */
dgmRouter.get('/registry', authenticateA2A, (_req: Request, res: Response) => {
  const { CONNECTION_REGISTRY } = require('../../mother/connection-registry.js');
  res.json({
    registry: CONNECTION_REGISTRY,
    summary: getRegistrySummary(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /dgm/orphans — List orphan modules requiring attention
 */
dgmRouter.get('/orphans', authenticateA2A, (req: Request, res: Response) => {
  const currentCycle = parseInt(req.query.cycle as string || '189');
  const critical = getCriticalOrphans(currentCycle);
  const all = getOrphanModules();

  res.json({
    critical: critical.map(m => ({ name: m.name, cycleCreated: m.cycleCreated, priority: m.priority, councilDecision: m.councilDecision })),
    all: all.map(m => ({ name: m.name, cycleCreated: m.cycleCreated, priority: m.priority })),
    currentCycle,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /dgm/execute — Execute a DGM cycle (delegates to dgm-agent)
 * Scientific basis: Darwin Gödel Machine (arXiv:2505.22954)
 */
dgmRouter.post('/execute', authenticateA2A, async (req: Request, res: Response) => {
  try {
    const { getDGMStatus } = await import('../../mother/dgm-agent.js');
    const status = getDGMStatus();
    res.json({ status, message: 'DGM status retrieved. Use /api/a2a/dgm/* for full cycle execution.', timestamp: new Date().toISOString() });
  } catch (err) {
    log.error('[DGMRouter] DGM status failed:', err);
    res.status(500).json({ error: 'DGM status unavailable', details: (err as Error).message });
  }
});
