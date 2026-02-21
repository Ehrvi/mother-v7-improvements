import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import { logger } from "./lib/logger";

// Create connection pool (singleton pattern)
let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL!,
      waitForConnections: true,
      connectionLimit: 10, // Max 10 concurrent connections
      maxIdle: 5, // Max 5 idle connections
      idleTimeout: 60000, // Close idle connections after 60 seconds
      queueLimit: 0, // Unlimited queue
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    logger.info("✅ Database connection pool created (max: 10 connections)");
  }

  return pool;
}

// Get Drizzle instance with pooled connection
export function getDb() {
  const pool = getPool();
  return drizzle(pool, { schema, mode: "default" });
}

// Graceful shutdown: close pool
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("✅ Database connection pool closed");
  }
}

// Health check: test pool connection with timeout
export async function testPoolConnection(
  timeoutMs: number = 2000
): Promise<boolean> {
  try {
    const pool = getPool();

    // Race between connection test and timeout
    const connectionPromise = (async () => {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      return true;
    })();

    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`Database health check timeout after ${timeoutMs}ms`)
          ),
        timeoutMs
      );
    });

    return await Promise.race([connectionPromise, timeoutPromise]);
  } catch (error) {
    logger.error("❌ Database pool health check failed:", error);
    return false;
  }
}
