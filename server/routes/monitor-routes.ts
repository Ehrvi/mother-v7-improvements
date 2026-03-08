/**
 * monitor-routes.ts — SSE Real-time Monitoring Endpoint
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * NC-UI-002 fix: MOTHER needs a real-time monitoring dashboard
 * Scientific basis: SSE (W3C EventSource) — simpler than WebSocket for unidirectional streams
 *
 * Endpoints:
 * GET /api/monitor/stream — SSE stream of system metrics (1s interval)
 * GET /api/monitor/snapshot — One-time metrics snapshot
 * GET /api/monitor/dgm — DGM-specific metrics
 */

import { Router, type Request, type Response } from "express";
import os from "os";

const router = Router();

export interface SystemMetrics {
  timestamp: string;
  cpu: {
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
    cores: number;
  };
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usagePercent: number;
  };
  process: {
    uptimeMs: number;
    memoryHeapUsedMb: number;
    memoryHeapTotalMb: number;
    memoryRssMb: number;
    pid: number;
  };
  mother: {
    version: string;
    cycle: number;
    environment: string;
    activeConnections: number;
  };
}

// Track active SSE connections
let activeConnections = 0;

function getMetrics(): SystemMetrics {
  const memInfo = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const loadAvg = os.loadavg();

  return {
    timestamp: new Date().toISOString(),
    cpu: {
      loadAvg1m: Math.round(loadAvg[0] * 100) / 100,
      loadAvg5m: Math.round(loadAvg[1] * 100) / 100,
      loadAvg15m: Math.round(loadAvg[2] * 100) / 100,
      cores: os.cpus().length,
    },
    memory: {
      totalMb: Math.round(totalMem / 1024 / 1024),
      freeMb: Math.round(freeMem / 1024 / 1024),
      usedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
      usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    process: {
      uptimeMs: Math.round(process.uptime() * 1000),
      memoryHeapUsedMb: Math.round(memInfo.heapUsed / 1024 / 1024),
      memoryHeapTotalMb: Math.round(memInfo.heapTotal / 1024 / 1024),
      memoryRssMb: Math.round(memInfo.rss / 1024 / 1024),
      pid: process.pid,
    },
    mother: {
      version: process.env.MOTHER_VERSION ?? "v83.0",
      cycle: parseInt(process.env.MOTHER_CYCLE ?? "200"),
      environment: process.env.NODE_ENV ?? "production",
      activeConnections,
    },
  };
}

/**
 * GET /api/monitor/snapshot
 * One-time metrics snapshot (no streaming).
 */
router.get("/snapshot", (_req: Request, res: Response) => {
  res.json(getMetrics());
});

/**
 * GET /api/monitor/stream
 * SSE stream of system metrics, sent every 2 seconds.
 */
router.get("/stream", (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  activeConnections++;

  // Send initial metrics immediately
  const sendMetrics = () => {
    const metrics = getMetrics();
    res.write(`event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
  };

  sendMetrics();

  // Send metrics every 2 seconds
  const interval = setInterval(sendMetrics, 2_000);

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30_000);

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
    activeConnections = Math.max(0, activeConnections - 1);
  });
});

/**
 * GET /api/monitor/dgm
 * DGM-specific metrics snapshot.
 */
router.get("/dgm", async (_req: Request, res: Response) => {
  try {
    // Try to get DGM stats from DB
    const { getDb } = await import("../db.js");
    const db = await getDb();

    const [proposalStats] = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        AVG(fitness_score) as avg_fitness,
        MAX(fitness_score) as max_fitness,
        MAX(created_at) as last_proposal_at
      FROM dgm_proposals
    `).catch(() => [null]);

    const stats = proposalStats as Record<string, unknown> | null;

    res.json({
      timestamp: new Date().toISOString(),
      proposals: stats
        ? {
            total: Number(stats.total ?? 0),
            accepted: Number(stats.accepted ?? 0),
            rejected: Number(stats.rejected ?? 0),
            pending: Number(stats.pending ?? 0),
            avgFitness: stats.avg_fitness
              ? Math.round(Number(stats.avg_fitness) * 1000) / 1000
              : null,
            maxFitness: stats.max_fitness
              ? Math.round(Number(stats.max_fitness) * 1000) / 1000
              : null,
            lastProposalAt: stats.last_proposal_at ?? null,
          }
        : null,
      sandbox: {
        e2bEnabled: !!process.env.E2B_API_KEY,
        localFallback: true,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ error: error.message });
  }
});

export default router;
