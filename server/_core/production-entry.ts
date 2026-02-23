/**
 * Production-only entry point for Cloud Run deployment
 * This file NEVER imports vite.ts or any Vite dependencies
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "./context.js";
import { appRouter } from "../routers.js";
import { registerOAuthRoutes } from "./oauth.js";
import { logger } from "../lib/logger";
import { processPaper } from "../omniscient/worker.js";
import { handleDiscoveryRequest } from "../workers/discoveryWorker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth routes
registerOAuthRoutes(app);

// Cloud Tasks worker endpoints
app.post('/api/tasks/omniscient-worker', express.json(), processPaper);
app.post('/api/tasks/discovery-worker', express.json(), handleDiscoveryRequest);

// tRPC routes
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Serve static files from Vite build
// Use absolute path in production to avoid esbuild path optimization issues
const distPath =
  process.env.NODE_ENV === "production"
    ? "/app/dist/public" // Absolute path in Docker container
    : path.join(__dirname, "../../public"); // Relative path for local dev

logger.info(`📦 Serving static files from: ${distPath}`);
app.use(express.static(distPath));

// SPA fallback - serve index.html for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Log version information on startup
const GIT_COMMIT_SHA = process.env.GIT_COMMIT_SHA || 'unknown';
const VERSION = process.env.npm_package_version || 'unknown';
const NODE_VERSION = process.version;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

app.listen(PORT, "0.0.0.0", () => {
  logger.info('🚀 MOTHER server starting', {
    version: VERSION,
    commit: GIT_COMMIT_SHA,
    nodeVersion: NODE_VERSION,
    environment: ENVIRONMENT,
    port: PORT,
    distPath: distPath,
  });
  logger.info(`🚀 Production server running on http://0.0.0.0:${PORT}`);
  logger.info(`📦 Serving static files from: ${distPath}`);
});
