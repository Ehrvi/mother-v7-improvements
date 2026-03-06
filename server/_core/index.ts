import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { a2aRouter } from "../mother/a2a-server";
import { warmCache } from "../mother/semantic-cache"; // R547 (AWAKE V236 Ciclo 164): Cache warming
// Vite imports moved to dynamic imports to avoid bundling in production

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // A2A Protocol routes (NC-COLLAB-001)
  // Agent Card: GET /.well-known/agent.json
  // Diagnostics: GET /api/a2a/diagnostics
  // Knowledge: GET/POST /api/a2a/knowledge
  // Query: POST /api/a2a/query
  // Status: GET /api/a2a/status
  app.use(a2aRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite.js");
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // R547 (AWAKE V236 Ciclo 164): Cache warming — fire-and-forget, non-blocking
    // Scientific basis: Proactive caching (Sadeghi et al., 2020): pre-warming reduces cold-start
    // Delay 2s to allow DB connection to stabilize before querying
    setTimeout(() => warmCache().catch(e => console.warn('[CacheWarming] Startup warm failed:', e)), 2000);
  });
}

startServer().catch(console.error);
