/**
 * health.ts — Health Check Endpoint with Dynamic Version
 * Sprint 1 | C200 | Conselho dos 6 IAs | 2026-03-08
 *
 * NC-UI-001 fix: version must be dynamic (read from package.json or env),
 * never hardcoded in client HTML.
 *
 * Endpoints:
 * GET /api/health — Full health check with version, uptime, DB status
 * GET /api/version — Lightweight version-only endpoint for client badge
 */

import { Router, type Request, type Response } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const router = Router();
const startTime = Date.now();

// Read version from package.json at startup (cached)
let cachedVersion: string | null = null;
let cachedMotherVersion: string | null = null;

function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = resolve(
      fileURLToPath(import.meta.url),
      "../../../package.json"
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    cachedVersion = pkg.version ?? "1.0.0";
  } catch {
    cachedVersion = process.env.npm_package_version ?? "1.0.0";
  }
  return cachedVersion;
}

function getMotherVersion(): string {
  if (cachedMotherVersion) return cachedMotherVersion;
  cachedMotherVersion =
    process.env.MOTHER_VERSION ??
    process.env.MOTHER_V ??
    "v83.0";
  return cachedMotherVersion;
}

/**
 * GET /api/health
 * Full health check — used by Cloud Run health probe and monitoring.
 */
router.get("/", async (_req: Request, res: Response) => {
  const uptimeMs = Date.now() - startTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  let dbStatus: "ok" | "error" | "unknown" = "unknown";
  let dbLatencyMs: number | null = null;

  // Try to check DB connectivity
  try {
    const { getDb } = await import("../db.js");
    const db = await getDb();
    if (!db) throw new Error("DB not initialized");
    const dbStart = Date.now();
    await db.execute("SELECT 1");
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = "ok";
  } catch {
    dbStatus = "error";
  }

  const health = {
    status: dbStatus === "error" ? "degraded" : "ok",
    version: getVersion(),
    motherVersion: getMotherVersion(),
    cycle: parseInt(process.env.MOTHER_CYCLE ?? "200"),
    uptime: {
      ms: uptimeMs,
      seconds: uptimeSec,
      human: formatUptime(uptimeSec),
    },
    db: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    environment: process.env.NODE_ENV ?? "production",
    timestamp: new Date().toISOString(),
    features: {
      longForm: true,
      dgmSandbox: true,
      e2bSandbox: !!process.env.E2B_API_KEY,
      hipporag2: true,
      episodicMemory: true,
    },
  };

  const statusCode = health.status === "ok" ? 200 : 207;
  res.status(statusCode).json(health);
});

/**
 * GET /api/version
 * Lightweight version endpoint — used by VersionBadge component.
 * Returns only version info, no DB check (fast response).
 */
router.get("/version", (_req: Request, res: Response) => {
  res.json({
    version: getVersion(),
    motherVersion: getMotherVersion(),
    cycle: parseInt(process.env.MOTHER_CYCLE ?? "200"),
    timestamp: new Date().toISOString(),
  });
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export default router;
