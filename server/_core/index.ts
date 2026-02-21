import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { globalLimiter, motherLimiter } from "../middleware/rate-limit";
import helmet from "helmet";
import { closePool } from "../db-pool";
import { logger, logInfo, logError, httpLogger } from "../lib/logger";
import { errorHandler, notFoundHandler } from "../middleware/error-handler";
import { startWorker, closeQueue } from "../lib/queue";
import { closeRedis } from "../lib/redis";
import cors from "cors";
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
  
  // Trust proxy (required for rate limiting behind load balancer/CDN)
  app.set('trust proxy', 1);
  
  // HTTPS enforcement in production
  if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }
  
  // Security headers (helmet)
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now (conflicts with Vite/React)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny' // X-Frame-Options: DENY
    },
    noSniff: true, // X-Content-Type-Options: nosniff
    xssFilter: true, // X-XSS-Protection: 1; mode=block
  }));
  
  // CORS configuration (#29: CORS Configuration)
  // Allow browser-based integrations from any origin
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? (origin, callback) => {
          // In production, allow specific origins or all origins
          // For now, allow all origins (can be restricted later)
          callback(null, true);
        }
      : true, // Allow all origins in development
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
    maxAge: 86400, // 24 hours preflight cache
  }));
  
  // HTTP request logging (#8: Logging framework)
  app.use(httpLogger);
  
  // Apply global rate limiting
  app.use(globalLimiter);
  
  // Configure body parser with size limits (#6: Request size limits)
  app.use(express.json({ limit: "10mb" })); // Reduced from 50mb for security
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Cache-Control headers for CDN optimization (#18)
  app.use((req, res, next) => {
    // Cache static assets aggressively (1 year)
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|webp)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Don't cache API responses
    else if (req.url.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Cache HTML for 30 minutes
    else {
      res.setHeader('Cache-Control', 'public, max-age=1800');
    }
    next();
  });
  // tRPC API with MOTHER-specific rate limiting
  app.use(
    "/api/trpc",
    motherLimiter, // Apply MOTHER rate limiter
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
    logInfo(`Server running on port ${port}`);
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`Logging to: ${process.cwd()}/logs/`);
    
    // Start BullMQ worker for async job processing (#16: Message Queue)
    const worker = startWorker();
    if (worker) {
      logInfo('BullMQ worker started successfully');
    } else {
      logger.warn('BullMQ worker not started (Redis not configured)');
    }
  });
  
  // Graceful shutdown (#7)
  const shutdown = async (signal: string) => {
    logInfo(`${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(() => {
      logInfo('HTTP server closed');
    });
    
    // Give ongoing requests 10 seconds to complete
    setTimeout(() => {
      logError('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    
    try {
      // Close BullMQ worker and queue (#16: Message Queue)
      logInfo('Closing BullMQ worker and queue...');
      await closeQueue();
      
      // Close Redis connection (#15: Redis caching)
      logInfo('Closing Redis connection...');
      await closeRedis();
      
      // Close database connection pool (#3: Database pooling)
      logInfo('Closing database connections...');
      await closePool();
      
      logInfo('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logError('Error during shutdown', error);
      process.exit(1);
    }};
  
  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Global error handlers (#14: Error handling global) - MUST be last
  app.use(notFoundHandler);
  app.use(errorHandler);
}

startServer().catch(console.error);
