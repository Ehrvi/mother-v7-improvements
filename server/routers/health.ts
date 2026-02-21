import { publicProcedure, router } from "../_core/trpc";
import { testPoolConnection } from "../db-pool";
import { getCacheStats } from "../lib/redis";
import { z } from "zod";

export const healthRouter = router({
  // Simple health check
  check: publicProcedure.query(async () => {
    const dbHealthy = await testPoolConnection();
    
    return {
      status: dbHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        limit: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      database: dbHealthy ? "connected" : "disconnected",
    };
  }),
  
  // Cache statistics
  cache: publicProcedure.query(async () => {
    const stats = await getCacheStats();
    
    if (!stats) {
      return {
        enabled: false,
        message: "Redis not configured",
      };
    }
    
    const hitRate = stats.hits + stats.misses > 0
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
      : "0.00";
    
    return {
      enabled: true,
      connected: stats.connected,
      keys: stats.keys,
      memory: stats.memory,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${hitRate}%`,
    };
  }),
  
  // Detailed health check (for monitoring)
  detailed: publicProcedure.query(async () => {
    const startTime = Date.now();
    const dbHealthy = await testPoolConnection();
    const dbResponseTime = Date.now() - startTime;
    
    return {
      status: dbHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      environment: process.env.NODE_ENV || "development",
      uptime: {
        seconds: Math.floor(process.uptime()),
        formatted: formatUptime(process.uptime()),
      },
      memory: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        external: `${Math.round(process.memoryUsage().external / 1024 / 1024)} MB`,
      },
      database: {
        status: dbHealthy ? "connected" : "disconnected",
        responseTime: `${dbResponseTime}ms`,
      },
      cpu: {
        usage: process.cpuUsage(),
      },
      cache: await getCacheStats(),
    };
  }),
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}
