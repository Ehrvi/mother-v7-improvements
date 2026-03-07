/**
 * MQTT → TimescaleDB Ingestion Bridge — server/shms/mqtt-timescale-bridge.ts
 *
 * C194-1: Subscreve tópicos MQTT e persiste leituras no TimescaleDB (Tiger Cloud).
 * C194-4: Integra sensor-validator.ts (GISTM 2020) antes de inserir no TimescaleDB.
 *
 * Pipeline:
 *   MQTT Broker (HiveMQ Cloud) → mqtt-connector.ts (event 'reading')
 *     → validateSensorReading() [sensor-validator.ts — GISTM 2020]
 *     → storeSensorReadingsTS() [timescale-pg-client.ts — TimescaleDB]
 *     → storeAlertTS() [se YELLOW/RED — ICOLD Bulletin 158]
 *     → sendAlertNotification() [notification-service.ts — C194-5]
 *
 * Base científica:
 *   - Sun et al. (2025) DOI:10.1145/3777730.3777858 — IoT→TimescaleDB pipeline
 *   - GISTM 2020 Seção 7 — sensor data validation before storage
 *   - ICOLD Bulletin 158 (2014) — 3-level alarm system
 *   - ISO/IEC 20922:2016 — MQTT protocol
 */

import { SHMSMqttConnector } from './mqtt-connector.js';
import { validateSensorReading, type SensorReading, type ValidationResult } from './sensor-validator.js';
import { storeSensorReadingsTS, storeAlertTS, getTimescalePool } from './timescale-pg-client.js';
import { sendAlertNotification } from '../mother/notification-service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeStats {
  messagesReceived: number;
  validationPassed: number;
  validationFailed: number;
  insertedToTimescale: number;
  alertsGenerated: number;
  lastMessageAt?: Date;
  lastInsertAt?: Date;
  errors: string[];
}

export interface BridgeConfig {
  /** Flush buffer to TimescaleDB every N ms. Default: 5000ms */
  flushIntervalMs?: number;
  /** Max readings to buffer before forced flush. Default: 50 */
  maxBufferSize?: number;
  /** Whether to store YELLOW/RED alerts in shms_ts_alerts. Default: true */
  storeAlerts?: boolean;
}

// ─── Bridge Class ─────────────────────────────────────────────────────────────

export class MQTTTimescaleBridge {
  private connector: SHMSMqttConnector;
  private buffer: Array<{
    sensorId: string;
    sensorType: string;
    value: number;
    unit: string;
    zone: string;
    isAnomaly: boolean;
    severity: string;
    quality: string;
    metadata: Record<string, unknown>;
  }> = [];
  private stats: BridgeStats = {
    messagesReceived: 0,
    validationPassed: 0,
    validationFailed: 0,
    insertedToTimescale: 0,
    alertsGenerated: 0,
    errors: [],
  };
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private config: Required<BridgeConfig>;
  private started = false;

  constructor(connector: SHMSMqttConnector, config: BridgeConfig = {}) {
    this.connector = connector;
    this.config = {
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      maxBufferSize: config.maxBufferSize ?? 50,
      storeAlerts: config.storeAlerts ?? true,
    };
  }

  /** Start the bridge — attach to connector's 'reading' event. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.connector.on('reading', (raw: unknown) => {
      this._handleReading(raw as SensorReading);
    });

    // Periodic flush to TimescaleDB
    this.flushTimer = setInterval(() => {
      this._flush().catch((err: Error) => {
        this.stats.errors.push(`flush error: ${err.message}`);
      });
    }, this.config.flushIntervalMs);

    console.log(`[MQTT-TS-BRIDGE] Started — flush every ${this.config.flushIntervalMs}ms, buffer max ${this.config.maxBufferSize}`);
  }

  /** Stop the bridge and flush remaining buffer. */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this._flush();
    this.started = false;
    console.log('[MQTT-TS-BRIDGE] Stopped');
  }

  /** Get current bridge statistics. */
  getStats(): BridgeStats {
    return { ...this.stats };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  /**
   * C194-4: Validate reading with sensor-validator.ts (GISTM 2020) before buffering.
   * Base científica: GISTM 2020 Seção 7 — data validation before storage.
   */
  private _handleReading(reading: SensorReading): void {
    this.stats.messagesReceived++;
    this.stats.lastMessageAt = new Date();

    // Validate with GISTM 2020 thresholds
    const validation = validateSensorReading(reading);

    // Check for critical violations (severity 'critical' on first violation)
    const hasCriticalViolation = validation.violations.some(v => v.severity === 'critical');
    if (!validation.valid && hasCriticalViolation) {
      // Critical violations: log but do NOT store (data quality issue)
      this.stats.validationFailed++;
      const codes = validation.violations.map(v => v.code).join(',');
      const msg = `[MQTT-TS-BRIDGE] CRITICAL validation fail — sensor=${reading.sensorId} violations=${codes}`;
      console.warn(msg);
      this.stats.errors.push(msg.slice(0, 200));
      return;
    }

    this.stats.validationPassed++;

    // Determine anomaly status from validation
    const isAnomaly = !validation.valid;
    const severity = validation.violations.length > 0 ? validation.violations[0].severity : 'none';

    // Buffer the validated reading (use metadata for optional fields)
    this.buffer.push({
      sensorId: reading.sensorId,
      sensorType: reading.sensorType as string,
      value: reading.value,
      unit: reading.unit,
      zone: (reading.metadata?.zone as string) ?? 'unknown',
      isAnomaly,
      severity,
      quality: (reading.metadata?.quality as string) ?? 'good',
      metadata: {
        icoldLevel: validation.icoldLevel,
        violations: validation.violations?.length ?? 0,
        clientId: reading.clientId,
        ...reading.metadata,
      },
    });

    // Force flush if buffer is full
    if (this.buffer.length >= this.config.maxBufferSize) {
      this._flush().catch((err: Error) => {
        this.stats.errors.push(`forced flush error: ${err.message}`);
      });
    }

    // C194-4 + ICOLD Bulletin 158: store alert if YELLOW (level 2) or RED (level 3)
    if (this.config.storeAlerts && validation.icoldLevel && validation.icoldLevel >= 2) {
      this._storeAlert(reading, validation).catch((err: Error) => {
        this.stats.errors.push(`alert store error: ${err.message}`);
      });
    }
  }

  /**
   * C194-1: Flush buffer to TimescaleDB.
   * Base científica: Sun et al. (2025) DOI:10.1145/3777730.3777858
   */
  private async _flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const pool = getTimescalePool();
    if (!pool) return; // TimescaleDB not initialized — silent skip

    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      const result = await storeSensorReadingsTS(batch);
      if (result.error) {
        this.stats.errors.push(`TimescaleDB insert error: ${result.error}`);
        console.error('[MQTT-TS-BRIDGE] Insert error:', result.error);
      } else {
        this.stats.insertedToTimescale += result.inserted;
        this.stats.lastInsertAt = new Date();
        if (result.inserted > 0) {
          console.log(`[MQTT-TS-BRIDGE] Flushed ${result.inserted} readings to TimescaleDB`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stats.errors.push(`flush exception: ${msg}`);
      console.error('[MQTT-TS-BRIDGE] Flush exception:', msg);
    }
  }

  /**
   * Store ICOLD YELLOW/RED alert in shms_ts_alerts.
   * Base científica: ICOLD Bulletin 158 (2014) — 3-level alarm system.
   */
  private async _storeAlert(
    reading: SensorReading,
    validation: ValidationResult
  ): Promise<void> {
    const levelMap: Record<number, 'GREEN' | 'YELLOW' | 'RED'> = { 1: 'GREEN', 2: 'YELLOW', 3: 'RED' };
    const alertLevel = levelMap[validation.icoldLevel ?? 1] ?? 'GREEN';
    if (alertLevel === 'GREEN') return;

    const structureId = (reading.metadata?.zone as string) ?? 'UNKNOWN';

    try {
      await storeAlertTS({
        sensorId: reading.sensorId,
        structureId,
        alertLevel,
        message: validation.violations.map(v => v.message).join('; ') || 'Threshold exceeded',
        value: reading.value,
        threshold: validation.violations[0]?.threshold ?? 0,
        acknowledged: false,
      });
      this.stats.alertsGenerated++;
      console.warn(`[MQTT-TS-BRIDGE] ICOLD ${alertLevel} alert stored — sensor=${reading.sensorId} value=${reading.value}`);

      // C194-5: Send notification via configured channels (webhook/email)
      // Base científica: ICOLD Bulletin 158 (2014) — Emergency Action Plans
      sendAlertNotification({
        sensorId: reading.sensorId,
        structureId,
        alertLevel: alertLevel as 'YELLOW' | 'RED',
        icoldLevel: validation.icoldLevel as 2 | 3,
        message: validation.violations.map(v => v.message).join('; ') || 'Threshold exceeded',
        value: reading.value,
        threshold: validation.violations[0]?.threshold ?? 0,
        unit: reading.unit,
        sensorType: reading.sensorType as string,
        timestamp: new Date(),
        violations: validation.violations.map(v => ({
          code: v.code,
          message: v.message,
          severity: v.severity,
        })),
      }).catch(err => console.warn('[MQTT-TS-BRIDGE] Notification error:', (err as Error).message));

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stats.errors.push(`alert store exception: ${msg}`);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _bridge: MQTTTimescaleBridge | null = null;

export function getMQTTTimescaleBridge(): MQTTTimescaleBridge | null {
  return _bridge;
}

/**
 * Initialize the MQTT→TimescaleDB bridge.
 * Creates a new SHMSMqttConnector if not provided, connects, and starts the bridge.
 * Called from production-entry.ts at startup (t=6s after server ready).
 */
export async function initMQTTTimescaleBridge(
  connector?: SHMSMqttConnector,
  config?: BridgeConfig
): Promise<MQTTTimescaleBridge> {
  if (_bridge) {
    console.warn('[MQTT-TS-BRIDGE] Already initialized — returning existing instance');
    return _bridge;
  }

  // Use provided connector or create a new one from env
  const mqttConnector = connector ?? new SHMSMqttConnector();
  if (!connector) {
    // Connect if we created a new connector
    await mqttConnector.connect();
  }

  _bridge = new MQTTTimescaleBridge(mqttConnector, config);
  _bridge.start();
  return _bridge;
}
