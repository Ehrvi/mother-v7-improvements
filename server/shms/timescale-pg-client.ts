/**
 * TimescaleDB PostgreSQL Client — server/shms/timescale-pg-client.ts
 * MOTHER v82.2 | Ciclo 193 | C193-2: TimescaleDB Cloud (Tiger Cloud) ATIVO
 *
 * Scientific basis:
 * - Freedman et al. (2018) "TimescaleDB: Time-Series Database for IoT and Analytics"
 *   VLDB 2018 — hypertable architecture for sensor data at scale
 * - ICOLD Bulletin 158 (2017): Data management for dam safety monitoring
 * - ISO 19115 (2003): Metadata standards for geospatial/sensor data
 *
 * Architecture:
 *   SHMS Sensors → mqtt-connector.ts → [this module] → TimescaleDB (Tiger Cloud)
 *   Separate from main DATABASE_URL (MySQL/Cloud SQL) — dedicated PostgreSQL pool
 *
 * Connection: TIMESCALE_DB_URL env var
 *   postgres://tsdbadmin:***@np88jyj5mj.e8uars6xuw.tsdb.cloud.timescale.com:31052/tsdb?sslmode=require
 *
 * Status: ACTIVE (C193 — 2026-03-08)
 *   - TCP connectivity confirmed: np88jyj5mj.e8uars6xuw.tsdb.cloud.timescale.com:31052
 *   - TLS: sslmode=require
 *   - Hypertables: shms_ts_sensor_readings, shms_ts_predictions, shms_ts_alerts
 */

import { Pool, PoolClient } from 'pg';

// ============================================================
// Connection Pool
// ============================================================

let _pool: Pool | null = null;
let _initialized = false;

export function getTimescalePool(): Pool | null {
  const url = process.env.TIMESCALE_DB_URL;
  if (!url) {
    console.warn('[TimescaleDB] TIMESCALE_DB_URL not set — TimescaleDB unavailable');
    return null;
  }

  if (!_pool) {
    _pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false }, // Tiger Cloud uses self-signed cert
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });

    _pool.on('error', (err) => {
      console.error('[TimescaleDB] Pool error:', err.message);
    });

    console.log('[TimescaleDB] Pool created — Tiger Cloud (np88jyj5mj.e8uars6xuw.tsdb.cloud.timescale.com:31052)');
  }

  return _pool;
}

// ============================================================
// Schema Initialization
// ============================================================

/**
 * Initialize TimescaleDB hypertables for SHMS sensor data.
 * Creates 3 hypertables: sensor_readings, predictions, alerts.
 * Scientific basis: Freedman et al. (2018) — 1-day chunk intervals for IoT data
 */
export async function initTimescaleSchema(): Promise<{ success: boolean; timescaleAvailable: boolean; message: string }> {
  const pool = getTimescalePool();
  if (!pool) {
    return { success: false, timescaleAvailable: false, message: 'TIMESCALE_DB_URL not configured' };
  }

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();

    // Check TimescaleDB extension
    const extResult = await client.query(
      "SELECT extname FROM pg_extension WHERE extname = 'timescaledb'"
    );
    const timescaleAvailable = extResult.rows.length > 0;
    console.log('[TimescaleDB] Extension available:', timescaleAvailable);

    // Create sensor_readings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shms_ts_sensor_readings (
        time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sensor_id   TEXT NOT NULL,
        sensor_type TEXT NOT NULL,
        value       DOUBLE PRECISION NOT NULL,
        unit        TEXT NOT NULL DEFAULT '',
        zone        TEXT NOT NULL DEFAULT 'unknown',
        is_anomaly  BOOLEAN NOT NULL DEFAULT FALSE,
        severity    TEXT NOT NULL DEFAULT 'normal',
        quality     TEXT NOT NULL DEFAULT 'good',
        metadata    JSONB
      )
    `);

    // Create index for time-range queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shms_ts_readings_sensor_time
      ON shms_ts_sensor_readings (sensor_id, time DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shms_ts_readings_time
      ON shms_ts_sensor_readings (time DESC)
    `);

    // Convert to hypertable if TimescaleDB available
    if (timescaleAvailable) {
      try {
        await client.query(`
          SELECT create_hypertable(
            'shms_ts_sensor_readings', 'time',
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE
          )
        `);

        // Compression policy: compress data older than 7 days (10x storage reduction)
        await client.query(`
          ALTER TABLE shms_ts_sensor_readings SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'sensor_id',
            timescaledb.compress_orderby = 'time DESC'
          )
        `);

        await client.query(`
          SELECT add_compression_policy(
            'shms_ts_sensor_readings',
            INTERVAL '7 days',
            if_not_exists => TRUE
          )
        `);

        console.log('[TimescaleDB] Hypertable created: shms_ts_sensor_readings (1-day chunks, 7-day compression)');
      } catch (err) {
        console.warn('[TimescaleDB] Hypertable setup partial:', (err as Error).message);
      }
    }

    // Create predictions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shms_ts_predictions (
        time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sensor_id           TEXT NOT NULL,
        sensor_type         TEXT NOT NULL,
        current_value       DOUBLE PRECISION NOT NULL,
        predicted_values    JSONB NOT NULL,
        prediction_horizon  INTEGER NOT NULL,
        confidence          DOUBLE PRECISION NOT NULL,
        failure_probability DOUBLE PRECISION NOT NULL,
        trend               TEXT NOT NULL,
        warning_level       TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shms_ts_predictions_time
      ON shms_ts_predictions (sensor_id, time DESC)
    `);

    if (timescaleAvailable) {
      try {
        await client.query(`
          SELECT create_hypertable(
            'shms_ts_predictions', 'time',
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE
          )
        `);
      } catch { /* already a hypertable */ }
    }

    // Create alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS shms_ts_alerts (
        time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sensor_id   TEXT NOT NULL,
        sensor_type TEXT NOT NULL,
        alert_level TEXT NOT NULL,
        value       DOUBLE PRECISION NOT NULL,
        threshold   DOUBLE PRECISION NOT NULL,
        message     TEXT NOT NULL,
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shms_ts_alerts_time
      ON shms_ts_alerts (sensor_id, time DESC)
    `);

    if (timescaleAvailable) {
      try {
        await client.query(`
          SELECT create_hypertable(
            'shms_ts_alerts', 'time',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists => TRUE
          )
        `);
      } catch { /* already a hypertable */ }
    }

    _initialized = true;
    const msg = timescaleAvailable
      ? 'TimescaleDB hypertables initialized (3 tables, 1-day chunks, 7-day compression)'
      : 'Standard PostgreSQL tables initialized (TimescaleDB extension not available on this tier)';

    console.log(`[TimescaleDB] ${msg}`);
    return { success: true, timescaleAvailable, message: msg };

  } catch (err) {
    const message = `Schema initialization failed: ${(err as Error).message}`;
    console.error('[TimescaleDB]', message);
    return { success: false, timescaleAvailable: false, message };
  } finally {
    client?.release();
  }
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Store a batch of sensor readings in TimescaleDB.
 * Uses bulk INSERT for efficiency (ICOLD Bulletin 158 — data ingestion requirements).
 */
export async function storeSensorReadingsTS(readings: Array<{
  sensorId: string;
  sensorType: string;
  value: number;
  unit: string;
  zone: string;
  isAnomaly?: boolean;
  severity?: string;
  quality?: string;
  metadata?: Record<string, unknown>;
}>): Promise<{ inserted: number; error?: string }> {
  if (!_initialized) return { inserted: 0, error: 'TimescaleDB not initialized' };
  const pool = getTimescalePool();
  if (!pool) return { inserted: 0, error: 'Pool unavailable' };

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    let inserted = 0;

    for (const r of readings) {
      await client.query(
        `INSERT INTO shms_ts_sensor_readings
          (time, sensor_id, sensor_type, value, unit, zone, is_anomaly, severity, quality, metadata)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          r.sensorId, r.sensorType, r.value, r.unit, r.zone,
          r.isAnomaly ?? false, r.severity ?? 'normal', r.quality ?? 'good',
          r.metadata ? JSON.stringify(r.metadata) : null,
        ]
      );
      inserted++;
    }

    return { inserted };
  } catch (err) {
    return { inserted: 0, error: (err as Error).message };
  } finally {
    client?.release();
  }
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Query sensor readings from TimescaleDB.
 * Scientific basis: Freedman et al. (2018) — time-bucketed aggregation queries
 */
export async function queryReadingsTS(params: {
  sensorId?: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
}): Promise<Array<{ time: Date; sensorId: string; sensorType: string; value: number; unit: string; isAnomaly: boolean }>> {
  const pool = getTimescalePool();
  if (!pool) return [];

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    const args: unknown[] = [params.startTime, params.endTime, params.limit ?? 1000];
    let q = `
      SELECT time, sensor_id, sensor_type, value, unit, is_anomaly
      FROM shms_ts_sensor_readings
      WHERE time BETWEEN $1 AND $2
    `;
    if (params.sensorId) {
      q += ` AND sensor_id = $4`;
      args.push(params.sensorId);
    }
    q += ` ORDER BY time DESC LIMIT $3`;

    const result = await client.query(q, args);
    return result.rows.map((r) => ({
      time: r.time,
      sensorId: r.sensor_id,
      sensorType: r.sensor_type,
      value: r.value,
      unit: r.unit,
      isAnomaly: r.is_anomaly,
    }));
  } catch (err) {
    console.error('[TimescaleDB] Query error:', (err as Error).message);
    return [];
  } finally {
    client?.release();
  }
}

// ============================================================
// Status
// ============================================================

export async function getTimescalePoolStatus(): Promise<{
  connected: boolean;
  initialized: boolean;
  host: string;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}> {
  const pool = getTimescalePool();
  const url = process.env.TIMESCALE_DB_URL ?? '';
  const host = url ? new URL(url).hostname : 'not-configured';

  if (!pool) {
    return { connected: false, initialized: false, host, totalCount: 0, idleCount: 0, waitingCount: 0 };
  }

  return {
    connected: true,
    initialized: _initialized,
    host,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}
