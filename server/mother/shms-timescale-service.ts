/**
 * SHMS TimescaleDB Service — Sprint 6 (Ciclo 181)
 * Time-series storage for SHMS sensor data using TimescaleDB
 *
 * Scientific basis:
 * - TimescaleDB (Freedman et al., 2018): PostgreSQL extension for time-series data
 * - Sun et al. (2025): IoT-based SHM with time-series databases
 * - Carrara et al. (2022): Real-time geotechnical monitoring
 *
 * Note: Uses MySQL (existing MOTHER DB) as fallback when TimescaleDB is unavailable.
 * TimescaleDB is the production target; MySQL provides dev/staging compatibility.
 *
 * @module shms-timescale-service
 * @version 1.0.1
 * @cycle C181
 */

import { getDb } from '../db.js';
import { createLogger } from '../_core/logger.js';
const log = createLogger('SHMS-TS');
import type { SensorReading, SensorAlert } from './shms-digital-twin.js';
import { sql } from 'drizzle-orm';

export interface SensorReadingRecord {
  id?: number;
  sensorId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: Date;
  latitude?: number;
  longitude?: number;
  depth?: number;
  isAnomaly: boolean;
  anomalyScore: number;
  siteId: string;
}

export interface SensorStats {
  sensorId: string;
  sensorType: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  stddev: number;
  lastReading: Date;
  anomalyCount: number;
}

type DbInstance = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * SHMS TimescaleDB Service
 * Manages time-series storage and retrieval of sensor data.
 * Uses MySQL as fallback for environments without TimescaleDB.
 */
export class SHMSTimescaleService {
  private isInitialized = false;
  private useTimescale = false;

  /**
   * Get DB instance or throw if unavailable.
   */
  private async requireDb(): Promise<DbInstance> {
    const db = await getDb();
    if (!db) throw new Error('[SHMS-TS] Database not available (DATABASE_URL not set)');
    return db;
  }

  /**
   * Initialize the service — create tables if they don't exist.
   * Detects TimescaleDB availability and falls back to MySQL.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    let db: DbInstance;
    try {
      db = await this.requireDb();
    } catch (err) {
      log.warn(`[SHMS-TS] DB unavailable during init: ${err}`);
      this.isInitialized = true; // Mark as initialized to avoid retry loops
      return;
    }

    try {
      // Try to detect TimescaleDB (PostgreSQL only)
      const result = await db.execute(sql`SELECT extname FROM pg_extension WHERE extname = 'timescaledb'`);
      this.useTimescale = Array.isArray(result) && result.length > 0;
    } catch {
      // Not PostgreSQL — using MySQL
      this.useTimescale = false;
    }

    await this.createTables(db);
    this.isInitialized = true;
    log.info(`[SHMS-TS] Initialized — backend: ${this.useTimescale ? 'TimescaleDB' : 'MySQL'}`);
  }

  /**
   * Create sensor_readings and sensor_alerts tables.
   * MySQL: uses standard InnoDB table with index on (sensor_id, timestamp).
   */
  private async createTables(db: DbInstance): Promise<void> {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS shms_sensor_readings (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          sensor_id VARCHAR(64) NOT NULL,
          sensor_type VARCHAR(32) NOT NULL,
          value DOUBLE NOT NULL,
          unit VARCHAR(16) NOT NULL,
          timestamp DATETIME(3) NOT NULL,
          latitude DOUBLE,
          longitude DOUBLE,
          depth DOUBLE,
          is_anomaly TINYINT(1) NOT NULL DEFAULT 0,
          anomaly_score DOUBLE NOT NULL DEFAULT 0,
          site_id VARCHAR(64) NOT NULL DEFAULT 'intelltech-site1',
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_sensor_time (sensor_id, timestamp),
          INDEX idx_site_time (site_id, timestamp),
          INDEX idx_anomaly (is_anomaly, timestamp)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS shms_sensor_alerts (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          alert_id VARCHAR(64) NOT NULL UNIQUE,
          sensor_id VARCHAR(64) NOT NULL,
          sensor_type VARCHAR(32) NOT NULL,
          severity ENUM('info','warning','critical','emergency') NOT NULL,
          message TEXT NOT NULL,
          value DOUBLE NOT NULL,
          threshold DOUBLE NOT NULL,
          timestamp DATETIME(3) NOT NULL,
          acknowledged TINYINT(1) NOT NULL DEFAULT 0,
          acknowledged_at DATETIME(3),
          acknowledged_by VARCHAR(128),
          site_id VARCHAR(64) NOT NULL DEFAULT 'intelltech-site1',
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_sensor_alert (sensor_id, timestamp),
          INDEX idx_severity (severity, acknowledged)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      log.info('[SHMS-TS] Tables created/verified: shms_sensor_readings, shms_sensor_alerts');
    } catch (err) {
      log.error(`[SHMS-TS] Failed to create tables: ${err}`);
      throw err;
    }
  }

  /**
   * Insert a sensor reading into the time-series table.
   */
  async insertReading(reading: SensorReading, siteId = 'intelltech-site1'): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return; }

    try {
      await db.execute(sql`
        INSERT INTO shms_sensor_readings
          (sensor_id, sensor_type, value, unit, timestamp, latitude, longitude, depth,
           is_anomaly, anomaly_score, site_id)
        VALUES
          (${reading.sensorId}, ${reading.sensorType}, ${reading.value}, ${reading.unit},
           ${reading.timestamp}, ${reading.latitude ?? null}, ${reading.longitude ?? null},
           ${reading.depth ?? null}, ${reading.isAnomaly ? 1 : 0}, ${reading.anomalyScore}, ${siteId})
      `);
    } catch (err) {
      log.error(`[SHMS-TS] Failed to insert reading for ${reading.sensorId}: ${err}`);
    }
  }

  /**
   * Insert a sensor alert.
   */
  async insertAlert(alert: SensorAlert, siteId = 'intelltech-site1'): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return; }

    try {
      await db.execute(sql`
        INSERT IGNORE INTO shms_sensor_alerts
          (alert_id, sensor_id, sensor_type, severity, message, value, threshold, timestamp,
           acknowledged, site_id)
        VALUES
          (${alert.alertId}, ${alert.sensorId}, ${alert.sensorType}, ${alert.severity},
           ${alert.message}, ${alert.value}, ${alert.threshold}, ${alert.timestamp},
           ${alert.acknowledged ? 1 : 0}, ${siteId})
      `);
    } catch (err) {
      log.error(`[SHMS-TS] Failed to insert alert for ${alert.sensorId}: ${err}`);
    }
  }

  /**
   * Get recent readings for a sensor (last N records).
   */
  async getRecentReadings(sensorId: string, limit = 100): Promise<SensorReadingRecord[]> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return []; }

    const rows = await db.execute(sql`
      SELECT * FROM shms_sensor_readings
      WHERE sensor_id = ${sensorId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);

    if (!Array.isArray(rows)) return [];

    return rows.map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as number,
        sensorId: row.sensor_id as string,
        sensorType: row.sensor_type as string,
        value: row.value as number,
        unit: row.unit as string,
        timestamp: new Date(row.timestamp as string),
        latitude: row.latitude as number | undefined,
        longitude: row.longitude as number | undefined,
        depth: row.depth as number | undefined,
        isAnomaly: Boolean(row.is_anomaly),
        anomalyScore: row.anomaly_score as number,
        siteId: row.site_id as string,
      };
    });
  }

  /**
   * Get sensor statistics over a time window.
   * Scientific basis: Descriptive statistics for SHM (Farrar & Worden, 2012)
   */
  async getSensorStats(sensorId: string, windowHours = 24): Promise<SensorStats | null> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return null; }

    const rows = await db.execute(sql`
      SELECT
        sensor_id,
        sensor_type,
        COUNT(*) as count,
        MIN(value) as min_val,
        MAX(value) as max_val,
        AVG(value) as avg_val,
        STDDEV(value) as stddev_val,
        MAX(timestamp) as last_reading,
        SUM(is_anomaly) as anomaly_count
      FROM shms_sensor_readings
      WHERE sensor_id = ${sensorId}
        AND timestamp >= DATE_SUB(NOW(), INTERVAL ${windowHours} HOUR)
      GROUP BY sensor_id, sensor_type
    `);

    if (!Array.isArray(rows) || (rows as unknown[]).length === 0) return null;
    const r = (rows as unknown[])[0] as Record<string, unknown>;

    return {
      sensorId: r.sensor_id as string,
      sensorType: r.sensor_type as string,
      count: Number(r.count),
      min: Number(r.min_val),
      max: Number(r.max_val),
      avg: Number(r.avg_val),
      stddev: Number(r.stddev_val),
      lastReading: new Date(r.last_reading as string),
      anomalyCount: Number(r.anomaly_count),
    };
  }

  /**
   * Get all active (unacknowledged) alerts for a site.
   */
  async getActiveAlerts(siteId = 'intelltech-site1'): Promise<SensorAlert[]> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return []; }

    const rows = await db.execute(sql`
      SELECT * FROM shms_sensor_alerts
      WHERE site_id = ${siteId} AND acknowledged = 0
      ORDER BY timestamp DESC
      LIMIT 100
    `);

    if (!Array.isArray(rows)) return [];

    return (rows as unknown[]).map((r: unknown): SensorAlert => {
      const row = r as Record<string, unknown>;
      return {
        alertId: row.alert_id as string,
        sensorId: row.sensor_id as string,
        sensorType: row.sensor_type as SensorAlert['sensorType'],
        severity: row.severity as SensorAlert['severity'],
        message: row.message as string,
        value: Number(row.value),
        threshold: Number(row.threshold),
        timestamp: new Date(row.timestamp as string),
        acknowledged: Boolean(row.acknowledged),
      };
    });
  }

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return; }

    await db.execute(sql`
      UPDATE shms_sensor_alerts
      SET acknowledged = 1, acknowledged_at = NOW(), acknowledged_by = ${acknowledgedBy}
      WHERE alert_id = ${alertId}
    `);
  }

  /**
   * Get table row counts for health check.
   */
  async getHealthStats(): Promise<{ readings: number; alerts: number; activeAlerts: number }> {
    if (!this.isInitialized) await this.initialize();
    let db: DbInstance;
    try { db = await this.requireDb(); } catch { return { readings: 0, alerts: 0, activeAlerts: 0 }; }

    try {
      const [readingsResult, alertsResult, activeResult] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) as cnt FROM shms_sensor_readings`),
        db.execute(sql`SELECT COUNT(*) as cnt FROM shms_sensor_alerts`),
        db.execute(sql`SELECT COUNT(*) as cnt FROM shms_sensor_alerts WHERE acknowledged = 0`),
      ]);

      const getCount = (r: unknown): number => {
        if (Array.isArray(r) && r.length > 0) {
          return Number((r[0] as Record<string, unknown>).cnt ?? 0);
        }
        return 0;
      };

      return {
        readings: getCount(readingsResult),
        alerts: getCount(alertsResult),
        activeAlerts: getCount(activeResult),
      };
    } catch {
      return { readings: 0, alerts: 0, activeAlerts: 0 };
    }
  }
}

// Singleton instance
let timescaleServiceInstance: SHMSTimescaleService | null = null;

export function getSHMSTimescaleService(): SHMSTimescaleService {
  if (!timescaleServiceInstance) {
    timescaleServiceInstance = new SHMSTimescaleService();
  }
  return timescaleServiceInstance;
}
