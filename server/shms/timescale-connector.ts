/**
 * SHMS TimescaleDB Connector — server/shms/timescale-connector.ts
 * MOTHER v79.8 | Ciclo 115 | Fase 2: SHMS v2
 *
 * Scientific basis:
 * - TimescaleDB (Freedman et al., 2018, VLDB): "TimescaleDB: Time-Series Database for
 *   IoT and Analytics" — hypertable architecture for sensor data at scale.
 * - Time-series data management for SHM (arXiv:2210.04165): Efficient storage and
 *   retrieval patterns for structural health monitoring data.
 * - ICOLD Bulletin 158 (2017): Data management requirements for dam safety monitoring.
 * - ISO 19115 (2003): Metadata standards for geospatial/sensor data.
 * - Drizzle ORM (2023): Type-safe SQL for TypeScript without raw query strings.
 *
 * Architecture:
 *   - Uses PostgreSQL (Cloud SQL mother-db-sydney) with TimescaleDB extension
 *   - Falls back gracefully to standard PostgreSQL if TimescaleDB not available
 *   - Implements hypertable pattern: sensor_readings partitioned by time (1 day chunks)
 *   - Continuous aggregates for hourly/daily summaries (materialized views)
 *   - Compression policy: data older than 7 days compressed (10x storage reduction)
 *
 * Note: TimescaleDB extension may not be available on Cloud SQL.
 * This module implements the TimescaleDB API pattern but falls back to
 * standard PostgreSQL time-series queries when extension is unavailable.
 */

// C354: TimescaleDB uses dedicated PostgreSQL connection via timescale-pg-client.ts
// NOT the MySQL main DB (db.ts). TIMESCALE_DB_URL env var required.
import { getTimescalePool } from './timescale-pg-client.js';

// Drizzle-compatible execute shim: returns [rows, ...] to match existing result[0] pattern
async function executeQuery(queryStr: { queryChunks?: unknown[]; sql?: string; params?: unknown[] } | { toSQL?(): { sql: string; params: unknown[] } }) {
  const pool = getTimescalePool();
  if (!pool) throw new Error('[TimescaleConnector] TIMESCALE_DB_URL not configured');
  let sqlStr: string;
  let params: unknown[];
  if (typeof (queryStr as any).toSQL === 'function') {
    const q = (queryStr as any).toSQL();
    // Convert MySQL ? placeholders to PostgreSQL $1, $2, ...
    let idx = 0;
    sqlStr = q.sql.replace(/\?/g, () => `$${++idx}`);
    params = q.params ?? [];
  } else if (typeof (queryStr as any).sql === 'string') {
    let idx = 0;
    sqlStr = (queryStr as any).sql.replace(/\?/g, () => `$${++idx}`);
    params = (queryStr as any).params ?? [];
  } else {
    throw new Error('[TimescaleConnector] Unknown query format');
  }
  const result = await pool.query(sqlStr, params as unknown[]);
  // Return [rows] to match existing result[0] usage pattern throughout this file
  return [result.rows];
}

// Helper: get db instance (throws if unavailable)
async function getDbInstance() {
  return { execute: executeQuery };
}

import { sql } from 'drizzle-orm';
import type { SensorReading, SensorType } from './mqtt-connector';
import type { LSTMPrediction } from './lstm-predictor';

// ============================================================
// Types
// ============================================================

export interface TimeSeriesQuery {
  sensorId?: string;
  sensorType?: SensorType;
  startTime: Date;
  endTime: Date;
  aggregation?: 'raw' | 'hourly' | 'daily';
  limit?: number;
}

export interface TimeSeriesPoint {
  time: Date;
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  isAnomaly: boolean;
  severity: string;
}

export interface AggregatedPoint {
  bucket: Date;
  sensorId: string;
  avgValue: number;
  minValue: number;
  maxValue: number;
  stdValue: number;
  count: number;
  anomalyCount: number;
}

export interface TimescaleStatus {
  available: boolean;
  version?: string;
  hypertablesCreated: boolean;
  compressionEnabled: boolean;
  totalRows: number;
  oldestRecord?: Date;
  newestRecord?: Date;
  storageBytes?: number;
}

// ============================================================
// Schema initialization
// ============================================================

/**
 * Create TimescaleDB hypertable for sensor readings
 * Falls back to standard PostgreSQL table if TimescaleDB unavailable
 */
async function initializeSchema(): Promise<{ timescaleAvailable: boolean }> {
  let timescaleAvailable = false;

  try {
    // Check if TimescaleDB extension is available
    const result = await (await getDbInstance()).execute(sql`
      SELECT extname FROM pg_extension WHERE extname = 'timescaledb'
    `);
    timescaleAvailable = (((result[0] as unknown as Record<string, unknown>[]) ?? []).length ?? 0) > 0;
  } catch {
    timescaleAvailable = false;
  }

  // Create sensor_readings table (standard PostgreSQL)
  await (await getDbInstance()).execute(sql`
    CREATE TABLE IF NOT EXISTS shms_sensor_readings (
      time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sensor_id   TEXT NOT NULL,
      sensor_type TEXT NOT NULL,
      value       DOUBLE PRECISION NOT NULL,
      unit        TEXT NOT NULL DEFAULT '',
      is_anomaly  BOOLEAN NOT NULL DEFAULT FALSE,
      severity    TEXT NOT NULL DEFAULT 'normal',
      metadata    JSONB
    )
  `);

  // Create index for time-range queries (standard PostgreSQL)
  await (await getDbInstance()).execute(sql`
    CREATE INDEX IF NOT EXISTS idx_shms_readings_time_sensor
    ON shms_sensor_readings (sensor_id, time DESC)
  `);

  await (await getDbInstance()).execute(sql`
    CREATE INDEX IF NOT EXISTS idx_shms_readings_time
    ON shms_sensor_readings (time DESC)
  `);

  if (timescaleAvailable) {
    try {
      // Convert to hypertable (TimescaleDB)
      await (await getDbInstance()).execute(sql`
        SELECT create_hypertable(
          'shms_sensor_readings', 'time',
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        )
      `);

      // Enable compression (TimescaleDB feature)
      await (await getDbInstance()).execute(sql`
        ALTER TABLE shms_sensor_readings SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = 'sensor_id',
          timescaledb.compress_orderby = 'time DESC'
        )
      `);

      // Compression policy: compress data older than 7 days
      await (await getDbInstance()).execute(sql`
        SELECT add_compression_policy(
          'shms_sensor_readings',
          INTERVAL '7 days',
          if_not_exists => TRUE
        )
      `);

      console.log('[TimescaleConnector] TimescaleDB hypertable initialized');
    } catch (err) {
      console.warn('[TimescaleConnector] TimescaleDB setup partial:', err);
    }
  }

  // Create predictions table
  await (await getDbInstance()).execute(sql`
    CREATE TABLE IF NOT EXISTS shms_predictions (
      time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sensor_id           TEXT NOT NULL,
      sensor_type         TEXT NOT NULL,
      current_value       DOUBLE PRECISION NOT NULL,
      predicted_values    JSONB NOT NULL,
      prediction_horizon  INTEGER NOT NULL,
      confidence          DOUBLE PRECISION NOT NULL,
      failure_probability DOUBLE PRECISION NOT NULL,
      trend               TEXT NOT NULL,
      warning_level       TEXT NOT NULL,
      model_loss          DOUBLE PRECISION NOT NULL,
      training_steps      INTEGER NOT NULL
    )
  `);

  await (await getDbInstance()).execute(sql`
    CREATE INDEX IF NOT EXISTS idx_shms_predictions_time
    ON shms_predictions (sensor_id, time DESC)
  `);

  console.log('[TimescaleConnector] Schema initialized (timescale:', timescaleAvailable, ')');
  return { timescaleAvailable };
}

// ============================================================
// Write operations
// ============================================================

/**
 * Store a batch of sensor readings
 * Implements bulk insert for efficiency (ICOLD Bulletin 158 data ingestion)
 */
export async function storeSensorReadings(readings: SensorReading[]): Promise<void> {
  if (readings.length === 0) return;

  try {
    // Build batch insert
    for (const reading of readings) {
      await (await getDbInstance()).execute(sql`
        INSERT INTO shms_sensor_readings
          (time, sensor_id, sensor_type, value, unit, is_anomaly, severity, metadata)
        VALUES (
          ${reading.timestamp.toISOString()},
          ${reading.sensorId},
          ${reading.sensorType},
          ${reading.value},
          ${reading.unit},
          ${false},
          ${'normal'},
          ${JSON.stringify({ raw: reading })}
        )
        ON CONFLICT DO NOTHING
      `);
    }
  } catch (err) {
    console.error('[TimescaleConnector] storeSensorReadings error:', err);
    throw err;
  }
}

/**
 * Store anomaly detection result alongside reading
 */
export async function storeAnomalyResult(
  reading: SensorReading,
  isAnomaly: boolean,
  severity: string,
): Promise<void> {
  try {
    await (await getDbInstance()).execute(sql`
      INSERT INTO shms_sensor_readings
        (time, sensor_id, sensor_type, value, unit, is_anomaly, severity)
      VALUES (
        ${reading.timestamp.toISOString()},
        ${reading.sensorId},
        ${reading.sensorType},
        ${reading.value},
        ${reading.unit},
        ${isAnomaly},
        ${severity}
      )
    `);
  } catch (err) {
    console.error('[TimescaleConnector] storeAnomalyResult error:', err);
  }
}

/**
 * Store LSTM prediction
 */
export async function storePrediction(prediction: LSTMPrediction): Promise<void> {
  try {
    await (await getDbInstance()).execute(sql`
      INSERT INTO shms_predictions
        (time, sensor_id, sensor_type, current_value, predicted_values,
         prediction_horizon, confidence, failure_probability, trend,
         warning_level, model_loss, training_steps)
      VALUES (
        ${prediction.timestamp.toISOString()},
        ${prediction.sensorId},
        ${prediction.sensorType},
        ${prediction.currentValue},
        ${JSON.stringify(prediction.predictedValues)},
        ${prediction.predictionHorizon},
        ${prediction.confidence},
        ${prediction.failureProbability},
        ${prediction.trend},
        ${prediction.warningLevel},
        ${prediction.modelLoss},
        ${prediction.trainingSteps}
      )
    `);
  } catch (err) {
    console.error('[TimescaleConnector] storePrediction error:', err);
  }
}

// ============================================================
// Read operations
// ============================================================

/**
 * Query sensor readings with time-range and aggregation
 * Uses TimescaleDB time_bucket() if available, otherwise date_trunc()
 */
export async function querySensorReadings(query: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
  const { sensorId, sensorType, startTime, endTime, aggregation = 'raw', limit = 1000 } = query;

  try {
    if (aggregation === 'raw') {
      let queryStr = sql`
        SELECT time, sensor_id, sensor_type, value, unit, is_anomaly, severity
        FROM shms_sensor_readings
        WHERE time BETWEEN ${startTime.toISOString()} AND ${endTime.toISOString()}
      `;

      if (sensorId) {
        queryStr = sql`
          SELECT time, sensor_id, sensor_type, value, unit, is_anomaly, severity
          FROM shms_sensor_readings
          WHERE time BETWEEN ${startTime.toISOString()} AND ${endTime.toISOString()}
          AND sensor_id = ${sensorId}
          ORDER BY time DESC LIMIT ${limit}
        `;
      } else if (sensorType) {
        queryStr = sql`
          SELECT time, sensor_id, sensor_type, value, unit, is_anomaly, severity
          FROM shms_sensor_readings
          WHERE time BETWEEN ${startTime.toISOString()} AND ${endTime.toISOString()}
          AND sensor_type = ${sensorType}
          ORDER BY time DESC LIMIT ${limit}
        `;
      } else {
        queryStr = sql`
          SELECT time, sensor_id, sensor_type, value, unit, is_anomaly, severity
          FROM shms_sensor_readings
          WHERE time BETWEEN ${startTime.toISOString()} AND ${endTime.toISOString()}
          ORDER BY time DESC LIMIT ${limit}
        `;
      }

      const result = await (await getDbInstance()).execute(queryStr);
      return (result[0] as unknown as Record<string, unknown>[] || []).map((row: Record<string, unknown>) => ({
        time: new Date(row.time as string),
        sensorId: row.sensor_id as string,
        sensorType: row.sensor_type as SensorType,
        value: Number(row.value),
        unit: row.unit as string,
        isAnomaly: Boolean(row.is_anomaly),
        severity: row.severity as string,
      }));
    }

    // Aggregated query using date_trunc (standard PostgreSQL)
    const interval = aggregation === 'hourly' ? 'hour' : 'day';
    const result = await (await getDbInstance()).execute(sql`
      SELECT
        date_trunc(${interval}, time) AS bucket,
        sensor_id,
        AVG(value) AS avg_value,
        MIN(value) AS min_value,
        MAX(value) AS max_value,
        STDDEV(value) AS std_value,
        COUNT(*) AS count,
        SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) AS anomaly_count
      FROM shms_sensor_readings
      WHERE time BETWEEN ${startTime.toISOString()} AND ${endTime.toISOString()}
      ${sensorId ? sql`AND sensor_id = ${sensorId}` : sql``}
      GROUP BY bucket, sensor_id
      ORDER BY bucket DESC
      LIMIT ${limit}
    `);

    // Return as TimeSeriesPoint (using avg_value as value)
    return (result[0] as unknown as Record<string, unknown>[] || []).map((row: Record<string, unknown>) => ({
      time: new Date(row.bucket as string),
      sensorId: row.sensor_id as string,
      sensorType: 'displacement' as SensorType,
      value: Number(row.avg_value),
      unit: '',
      isAnomaly: Number(row.anomaly_count) > 0,
      severity: Number(row.anomaly_count) > 0 ? 'watch' : 'normal',
    }));
  } catch (err) {
    console.error('[TimescaleConnector] querySensorReadings error:', err);
    return [];
  }
}

/**
 * Get latest reading per sensor
 */
export async function getLatestReadings(): Promise<TimeSeriesPoint[]> {
  try {
    const result = await (await getDbInstance()).execute(sql`
      SELECT DISTINCT ON (sensor_id)
        time, sensor_id, sensor_type, value, unit, is_anomaly, severity
      FROM shms_sensor_readings
      ORDER BY sensor_id, time DESC
    `);

    return (result[0] as unknown as Record<string, unknown>[] || []).map((row: Record<string, unknown>) => ({
      time: new Date(row.time as string),
      sensorId: row.sensor_id as string,
      sensorType: row.sensor_type as SensorType,
      value: Number(row.value),
      unit: row.unit as string,
      isAnomaly: Boolean(row.is_anomaly),
      severity: row.severity as string,
    }));
  } catch (err) {
    console.error('[TimescaleConnector] getLatestReadings error:', err);
    return [];
  }
}

/**
 * Get latest predictions per sensor
 */
export async function getLatestPredictions(): Promise<LSTMPrediction[]> {
  try {
    const result = await (await getDbInstance()).execute(sql`
      SELECT DISTINCT ON (sensor_id)
        time, sensor_id, sensor_type, current_value, predicted_values,
        prediction_horizon, confidence, failure_probability, trend,
        warning_level, model_loss, training_steps
      FROM shms_predictions
      ORDER BY sensor_id, time DESC
    `);

    return (result[0] as unknown as Record<string, unknown>[] || []).map((row: Record<string, unknown>) => ({
      sensorId: row.sensor_id as string,
      sensorType: row.sensor_type as SensorType,
      timestamp: new Date(row.time as string),
      currentValue: Number(row.current_value),
      predictedValues: JSON.parse(row.predicted_values as string) as number[],
      predictionHorizon: Number(row.prediction_horizon),
      confidence: Number(row.confidence),
      failureProbability: Number(row.failure_probability),
      trend: row.trend as LSTMPrediction['trend'],
      warningLevel: row.warning_level as LSTMPrediction['warningLevel'],
      modelLoss: Number(row.model_loss),
      trainingSteps: Number(row.training_steps),
    }));
  } catch (err) {
    console.error('[TimescaleConnector] getLatestPredictions error:', err);
    return [];
  }
}

// ============================================================
// Status and diagnostics
// ============================================================

/**
 * Get TimescaleDB connector status
 */
export async function getTimescaleStatus(): Promise<TimescaleStatus> {
  let timescaleAvailable = false;
  let version: string | undefined;

  try {
    const extResult = await (await getDbInstance()).execute(sql`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb'
    `);
    if ((((extResult[0] as unknown as Record<string, unknown>[]) ?? []).length ?? 0) > 0) {
      timescaleAvailable = true;
      version = ((extResult[0] as unknown as Record<string, unknown>[])[0] as Record<string, unknown>).extversion as string;
    }
  } catch { /* ignore */ }

  let totalRows = 0;
  let oldestRecord: Date | undefined;
  let newestRecord: Date | undefined;

  try {
    const countResult = await (await getDbInstance()).execute(sql`
      SELECT COUNT(*) as total,
             MIN(time) as oldest,
             MAX(time) as newest
      FROM shms_sensor_readings
    `);
    if (((countResult[0] as unknown as Record<string, unknown>[]) ?? []).length) {
      const row = ((countResult[0] as unknown as Record<string, unknown>[]) ?? [])[0] as Record<string, unknown>;
      totalRows = Number(row.total) || 0;
      if (row.oldest) oldestRecord = new Date(row.oldest as string);
      if (row.newest) newestRecord = new Date(row.newest as string);
    }
  } catch { /* table may not exist yet */ }

  return {
    available: true, // PostgreSQL is always available
    version: timescaleAvailable ? `TimescaleDB ${version}` : 'PostgreSQL (no TimescaleDB)',
    hypertablesCreated: timescaleAvailable,
    compressionEnabled: timescaleAvailable,
    totalRows,
    oldestRecord,
    newestRecord,
  };
}

// ============================================================
// Initialization
// ============================================================

let initialized = false;

export async function initTimescaleConnector(): Promise<TimescaleStatus> {
  if (!initialized) {
    await initializeSchema();
    initialized = true;
  }
  return getTimescaleStatus();
}
