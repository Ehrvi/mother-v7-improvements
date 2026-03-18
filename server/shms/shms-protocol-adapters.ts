/**
 * shms-protocol-adapters.ts — MOTHER v82.5 — Ciclo 195
 *
 * Multi-protocol data ingestion layer for SHMS.
 * Normalizes sensor data from heterogeneous sources into a unified SensorReading format.
 *
 * Supported protocols:
 *   1. MQTT v5.0 (already implemented in shms-mqtt-service.ts — referenced here)
 *   2. Modbus RTU/TCP (IEC 61158 / IEEE 802.3)
 *   3. OPC-UA (IEC 62541)
 *   4. LoRaWAN (IEEE 802.15.4g / LoRa Alliance TS001-1.0.4)
 *   5. CSV/Excel file upload (batch import of historical campaigns)
 *   6. SCADA (via OPC-DA bridge or REST adapter)
 *   7. Serial (RS-232/RS-485 data loggers)
 *   8. HTTP REST (generic JSON push from third-party systems)
 *
 * Scientific basis:
 *   - IEC 61158:2023 — Industrial communication networks (Modbus)
 *   - IEC 62541:2020 — OPC Unified Architecture
 *   - LoRa Alliance TS001-1.0.4 (2020) — LoRaWAN specification
 *   - ISO 8601:2019 — Date and time format
 *   - ICOLD Bulletin 158 (2014) §4.3 — Sensor data requirements
 *   - GISTM 2020 §8.2 — Instrumentation data quality
 *   - Fielding (2000) — REST architectural style
 *
 * Architecture:
 *   All adapters normalize into NormalizedReading → stored via TimescaleDB service.
 *   Each adapter validates, transforms, and enriches incoming data with metadata
 *   before passing to the unified ingestion pipeline.
 *
 * @module shms-protocol-adapters
 * @version 1.0.0
 * @cycle C195
 */

import { randomUUID, randomBytes, createHash } from 'crypto';

// ════════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Supported ingestion protocols.
 * Each protocol has its own adapter with specific payload validation.
 */
export type IngestionProtocol =
  | 'mqtt'
  | 'modbus'
  | 'opcua'
  | 'lorawan'
  | 'csv'
  | 'scada'
  | 'serial'
  | 'http-rest';

/**
 * Unified normalized reading — the canonical format for all SHMS sensor data.
 * All protocol adapters MUST produce this format.
 *
 * Scientific basis: ICOLD Bulletin 158 §4.3 — minimum data fields for dam monitoring
 */
export interface NormalizedReading {
  /** Unique reading ID (UUID v4) */
  readingId: string;
  /** Sensor identifier (e.g., PIZ-001, INC-003) */
  sensorId: string;
  /** Sensor type per ICOLD classification */
  sensorType: SensorType;
  /** Measured value in SI units */
  value: number;
  /** SI unit string (bar, mm, °, g, mm/h, %, m) */
  unit: string;
  /** ISO 8601 timestamp of the measurement */
  timestamp: string;
  /** Structure identifier */
  structureId: string;
  /** Data quality assessment per GISTM 2020 §8.2 */
  quality: DataQuality;
  /** Ingestion protocol that captured this reading */
  protocol: IngestionProtocol;
  /** Raw payload hash for traceability (SHA-256 first 16 chars) */
  rawHash: string;
  /** Optional metadata from the source */
  metadata?: Record<string, unknown>;
}

export type SensorType =
  | 'piezometer'
  | 'inclinometer'
  | 'extensometer'
  | 'accelerometer'
  | 'gnss'
  | 'rain_gauge'
  | 'water_level'
  | 'settlement_plate'
  | 'thermometer'
  | 'strain_gauge'
  | 'crack_meter'
  | 'seismograph'
  | 'pressure_cell'
  | 'flow_meter'
  | 'tiltmeter'
  | 'weather_station';

export type DataQuality = 'good' | 'uncertain' | 'bad' | 'raw';

/**
 * Ingestion result returned by each adapter.
 */
export interface IngestionResult {
  success: boolean;
  protocol: IngestionProtocol;
  readingsIngested: number;
  readingsRejected: number;
  readings: NormalizedReading[];
  errors: string[];
  processingTimeMs: number;
  traceId: string;
}

/**
 * Protocol adapter connector status.
 */
export interface ConnectorStatus {
  protocol: IngestionProtocol;
  status: 'active' | 'standby' | 'error' | 'not-configured';
  lastActivity: string | null;
  totalIngested: number;
  totalRejected: number;
  configuration: Record<string, unknown>;
  scientificBasis: string;
}

// ════════════════════════════════════════════════════════════════════════════════
// PROTOCOL-SPECIFIC PAYLOAD TYPES
// ════════════════════════════════════════════════════════════════════════════════

/** Modbus RTU/TCP payload — IEC 61158 */
export interface ModbusPayload {
  slaveId: number;
  functionCode: number;  // 3 = Read Holding Registers, 4 = Read Input Registers
  startRegister: number;
  registerCount: number;
  values: number[];
  connectionType: 'RTU' | 'TCP';
  host?: string;
  port?: number;
  serialPort?: string;
  baudRate?: number;
  structureId: string;
  sensorMapping: ModbusSensorMapping[];
}

export interface ModbusSensorMapping {
  register: number;
  sensorId: string;
  sensorType: SensorType;
  unit: string;
  scaleFactor: number;
  offset: number;
}

/** OPC-UA payload — IEC 62541 */
export interface OpcuaPayload {
  endpointUrl: string;
  nodeIds: OpcuaNodeMapping[];
  securityMode: 'None' | 'Sign' | 'SignAndEncrypt';
  securityPolicy?: string;
  structureId: string;
  values: OpcuaNodeValue[];
}

export interface OpcuaNodeMapping {
  nodeId: string;
  sensorId: string;
  sensorType: SensorType;
  unit: string;
  browseName?: string;
}

export interface OpcuaNodeValue {
  nodeId: string;
  value: number;
  statusCode: number;
  sourceTimestamp: string;
  serverTimestamp: string;
}

/** LoRaWAN uplink payload — LoRa Alliance TS001-1.0.4 */
export interface LorawanPayload {
  devEUI: string;
  appEUI?: string;
  fPort: number;
  fCnt: number;
  payload: string;  // base64-encoded
  rssi: number;
  snr: number;
  spreadingFactor: number;
  bandwidth: number;
  frequency: number;
  gatewayId: string;
  timestamp: string;
  structureId: string;
  decoderProfile: string;
  sensorMapping: LorawanSensorMapping[];
}

export interface LorawanSensorMapping {
  byteOffset: number;
  byteLength: number;
  sensorId: string;
  sensorType: SensorType;
  unit: string;
  scaleFactor: number;
  signed: boolean;
}

/** CSV/Excel batch import payload */
export interface CsvPayload {
  structureId: string;
  filename: string;
  format: 'csv' | 'tsv' | 'excel';
  encoding: string;
  delimiter?: string;
  headerRow: boolean;
  columnMapping: CsvColumnMapping;
  rows: Record<string, string | number>[];
  campaignId?: string;
  campaignDate?: string;
}

export interface CsvColumnMapping {
  sensorId: string;
  sensorType: string;
  value: string;
  unit: string;
  timestamp: string;
  quality?: string;
}

/** SCADA system payload */
export interface ScadaPayload {
  scadaSystem: string;
  protocolVersion: string;
  structureId: string;
  tags: ScadaTag[];
  pollInterval: number;
  sourceTimestamp: string;
}

export interface ScadaTag {
  tagName: string;
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  quality: number;  // 0-192 per OPC quality codes
  timestamp: string;
}

/** Serial port data logger payload — RS-232/RS-485 */
export interface SerialPayload {
  port: string;
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  protocol: 'ascii' | 'binary' | 'nmea';
  structureId: string;
  rawData: string;
  sensorMapping: SerialSensorMapping[];
}

export interface SerialSensorMapping {
  pattern: string;  // regex or field index
  sensorId: string;
  sensorType: SensorType;
  unit: string;
  scaleFactor: number;
}

/** Generic HTTP REST push payload */
export interface HttpRestPayload {
  structureId: string;
  source: string;
  apiVersion?: string;
  readings: HttpRestReading[];
}

export interface HttpRestReading {
  sensorId: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: string;
  quality?: DataQuality;
  metadata?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════════

function generateReadingId(): string {
  return randomUUID();
}

function generateTraceId(): string {
  return `trace-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function validateTimestamp(ts: string): boolean {
  const d = new Date(ts);
  return !isNaN(d.getTime()) && d.getTime() > 0;
}

function normalizeTimestamp(ts: string | number | Date): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

const VALID_SENSOR_TYPES: Set<string> = new Set([
  'piezometer', 'inclinometer', 'extensometer', 'accelerometer', 'gnss',
  'rain_gauge', 'water_level', 'settlement_plate', 'thermometer', 'strain_gauge',
  'crack_meter', 'seismograph', 'pressure_cell', 'flow_meter', 'tiltmeter',
  'weather_station',
]);

function validateSensorType(t: string): t is SensorType {
  return VALID_SENSOR_TYPES.has(t);
}

/**
 * Assess data quality based on value range and timestamp freshness.
 * Scientific basis: GISTM 2020 §8.2 — instrumentation data quality criteria.
 */
function assessQuality(value: number, timestamp: string, sensorType: SensorType): DataQuality {
  if (!isFinite(value) || isNaN(value)) return 'bad';
  const age = Date.now() - new Date(timestamp).getTime();
  if (age > 86_400_000) return 'uncertain'; // >24h old
  // Basic range checks per sensor type (ICOLD Bulletin 158 plausible ranges)
  const ranges: Partial<Record<SensorType, [number, number]>> = {
    piezometer: [-5, 500],
    inclinometer: [-180, 180],
    accelerometer: [-5, 5],
    gnss: [-1000, 10000],
    rain_gauge: [0, 500],
    water_level: [0, 200],
    thermometer: [-50, 80],
    settlement_plate: [-500, 500],
  };
  const r = ranges[sensorType];
  if (r && (value < r[0] || value > r[1])) return 'uncertain';
  return 'good';
}

// ════════════════════════════════════════════════════════════════════════════════
// ADAPTER REGISTRY & STATISTICS
// ════════════════════════════════════════════════════════════════════════════════

interface AdapterStats {
  totalIngested: number;
  totalRejected: number;
  lastActivity: string | null;
}

const adapterStats = new Map<IngestionProtocol, AdapterStats>();

function initStats(protocol: IngestionProtocol): AdapterStats {
  if (!adapterStats.has(protocol)) {
    adapterStats.set(protocol, { totalIngested: 0, totalRejected: 0, lastActivity: null });
  }
  return adapterStats.get(protocol)!;
}

function recordStats(protocol: IngestionProtocol, ingested: number, rejected: number): void {
  const stats = initStats(protocol);
  stats.totalIngested += ingested;
  stats.totalRejected += rejected;
  stats.lastActivity = new Date().toISOString();
}

// ════════════════════════════════════════════════════════════════════════════════
// PROTOCOL ADAPTERS — FULL IMPLEMENTATIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Adapter 1: Modbus RTU/TCP
 * Scientific basis: IEC 61158:2023 — Modbus application protocol
 *
 * Interprets Modbus register values using the sensor mapping configuration.
 * Each register is mapped to a specific sensor with scale factor and offset:
 *   physicalValue = (rawRegisterValue × scaleFactor) + offset
 */
export function ingestModbus(payload: ModbusPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  // Validate function code (3 or 4 per Modbus spec)
  if (![3, 4].includes(payload.functionCode)) {
    errors.push(`Invalid Modbus function code: ${payload.functionCode}. Expected 3 (Holding) or 4 (Input).`);
  }

  // Validate slave ID range (1-247 per IEC 61158)
  if (payload.slaveId < 1 || payload.slaveId > 247) {
    errors.push(`Modbus slaveId ${payload.slaveId} out of range [1-247] per IEC 61158.`);
  }

  if (!payload.sensorMapping || payload.sensorMapping.length === 0) {
    errors.push('No sensor mapping provided for Modbus registers.');
    recordStats('modbus', 0, 0);
    return { success: false, protocol: 'modbus', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload(payload);

  for (const mapping of payload.sensorMapping) {
    const regIndex = mapping.register - payload.startRegister;

    if (regIndex < 0 || regIndex >= payload.values.length) {
      errors.push(`Register ${mapping.register} out of range for sensor ${mapping.sensorId}. Available: ${payload.startRegister}-${payload.startRegister + payload.values.length - 1}`);
      continue;
    }

    const rawValue = payload.values[regIndex];
    const physicalValue = (rawValue * mapping.scaleFactor) + mapping.offset;

    if (!validateSensorType(mapping.sensorType)) {
      errors.push(`Invalid sensor type "${mapping.sensorType}" for ${mapping.sensorId}`);
      continue;
    }

    const timestamp = new Date().toISOString();
    readings.push({
      readingId: generateReadingId(),
      sensorId: mapping.sensorId,
      sensorType: mapping.sensorType,
      value: physicalValue,
      unit: mapping.unit,
      timestamp,
      structureId: payload.structureId,
      quality: assessQuality(physicalValue, timestamp, mapping.sensorType),
      protocol: 'modbus',
      rawHash,
      metadata: {
        slaveId: payload.slaveId,
        register: mapping.register,
        functionCode: payload.functionCode,
        rawValue,
        scaleFactor: mapping.scaleFactor,
        offset: mapping.offset,
        connectionType: payload.connectionType,
      },
    });
  }

  const rejected = payload.sensorMapping.length - readings.length;
  recordStats('modbus', readings.length, rejected);

  return {
    success: errors.length === 0 || readings.length > 0,
    protocol: 'modbus',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

/**
 * Adapter 2: OPC-UA
 * Scientific basis: IEC 62541:2020 — OPC Unified Architecture
 *
 * Maps OPC-UA node values to normalized readings using node-to-sensor mapping.
 * OPC-UA StatusCode 0 = Good, non-zero = degraded quality.
 */
export function ingestOpcua(payload: OpcuaPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  if (!payload.endpointUrl) {
    errors.push('OPC-UA endpoint URL is required.');
  }

  if (!payload.values || payload.values.length === 0) {
    errors.push('No OPC-UA node values provided.');
    recordStats('opcua', 0, 0);
    return { success: false, protocol: 'opcua', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload(payload);

  // Build nodeId → mapping lookup
  const mappingLookup = new Map<string, OpcuaNodeMapping>();
  for (const m of payload.nodeIds) {
    mappingLookup.set(m.nodeId, m);
  }

  for (const nodeValue of payload.values) {
    const mapping = mappingLookup.get(nodeValue.nodeId);
    if (!mapping) {
      errors.push(`No mapping found for OPC-UA nodeId: ${nodeValue.nodeId}`);
      continue;
    }

    if (!validateSensorType(mapping.sensorType)) {
      errors.push(`Invalid sensor type "${mapping.sensorType}" for node ${nodeValue.nodeId}`);
      continue;
    }

    // OPC-UA StatusCode: 0 = Good, bit 30-31 = severity (0=Good, 1=Uncertain, 2-3=Bad)
    const severityBits = (nodeValue.statusCode >> 30) & 0x03;
    let quality: DataQuality = 'good';
    if (severityBits === 1) quality = 'uncertain';
    else if (severityBits >= 2) quality = 'bad';

    const timestamp = normalizeTimestamp(nodeValue.sourceTimestamp || nodeValue.serverTimestamp);

    readings.push({
      readingId: generateReadingId(),
      sensorId: mapping.sensorId,
      sensorType: mapping.sensorType,
      value: nodeValue.value,
      unit: mapping.unit,
      timestamp,
      structureId: payload.structureId,
      quality,
      protocol: 'opcua',
      rawHash,
      metadata: {
        nodeId: nodeValue.nodeId,
        browseName: mapping.browseName,
        statusCode: nodeValue.statusCode,
        securityMode: payload.securityMode,
        endpointUrl: payload.endpointUrl,
        sourceTimestamp: nodeValue.sourceTimestamp,
        serverTimestamp: nodeValue.serverTimestamp,
      },
    });
  }

  const rejected = payload.values.length - readings.length;
  recordStats('opcua', readings.length, rejected);

  return {
    success: errors.length === 0 || readings.length > 0,
    protocol: 'opcua',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

/**
 * Adapter 3: LoRaWAN
 * Scientific basis: LoRa Alliance TS001-1.0.4 (2020)
 *
 * Decodes base64 LoRaWAN payload using sensor-specific byte mapping.
 * Supports signed/unsigned integers with configurable byte offset and length.
 */
export function ingestLorawan(payload: LorawanPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  // Validate devEUI (16 hex chars — 8 bytes)
  if (!/^[0-9a-fA-F]{16}$/.test(payload.devEUI)) {
    errors.push(`Invalid LoRaWAN devEUI: ${payload.devEUI}. Must be 16 hex characters.`);
  }

  // Decode base64 payload
  let payloadBuffer: Buffer;
  try {
    payloadBuffer = Buffer.from(payload.payload, 'base64');
  } catch {
    errors.push('Failed to decode base64 LoRaWAN payload.');
    recordStats('lorawan', 0, 0);
    return { success: false, protocol: 'lorawan', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload(payload);
  const timestamp = normalizeTimestamp(payload.timestamp);

  for (const mapping of payload.sensorMapping) {
    if (mapping.byteOffset + mapping.byteLength > payloadBuffer.length) {
      errors.push(`Byte range [${mapping.byteOffset}:${mapping.byteOffset + mapping.byteLength}] exceeds payload length ${payloadBuffer.length} for sensor ${mapping.sensorId}`);
      continue;
    }

    if (!validateSensorType(mapping.sensorType)) {
      errors.push(`Invalid sensor type "${mapping.sensorType}" for LoRaWAN sensor ${mapping.sensorId}`);
      continue;
    }

    // Extract value from payload bytes (big-endian)
    let rawValue = 0;
    for (let i = 0; i < mapping.byteLength; i++) {
      rawValue = (rawValue << 8) | payloadBuffer[mapping.byteOffset + i];
    }

    // Handle signed values (two's complement)
    if (mapping.signed && mapping.byteLength > 0) {
      const maxVal = 1 << (mapping.byteLength * 8);
      if (rawValue >= maxVal / 2) {
        rawValue -= maxVal;
      }
    }

    const physicalValue = rawValue * mapping.scaleFactor;

    readings.push({
      readingId: generateReadingId(),
      sensorId: mapping.sensorId,
      sensorType: mapping.sensorType,
      value: physicalValue,
      unit: mapping.unit,
      timestamp,
      structureId: payload.structureId,
      quality: assessQuality(physicalValue, timestamp, mapping.sensorType),
      protocol: 'lorawan',
      rawHash,
      metadata: {
        devEUI: payload.devEUI,
        fPort: payload.fPort,
        fCnt: payload.fCnt,
        rssi: payload.rssi,
        snr: payload.snr,
        spreadingFactor: payload.spreadingFactor,
        bandwidth: payload.bandwidth,
        frequency: payload.frequency,
        gatewayId: payload.gatewayId,
        decoderProfile: payload.decoderProfile,
        rawValue,
      },
    });
  }

  const rejected = payload.sensorMapping.length - readings.length;
  recordStats('lorawan', readings.length, rejected);

  return {
    success: errors.length === 0 || readings.length > 0,
    protocol: 'lorawan',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

/**
 * Adapter 4: CSV/Excel batch import
 * For importing historical instrumentation campaigns and manual readings.
 *
 * Scientific basis: GISTM 2020 §8.2 — historical data integration requirements
 */
export function ingestCsv(payload: CsvPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  if (!payload.rows || payload.rows.length === 0) {
    errors.push('No data rows provided in CSV payload.');
    recordStats('csv', 0, 0);
    return { success: false, protocol: 'csv', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload({ filename: payload.filename, rowCount: payload.rows.length });
  const cm = payload.columnMapping;

  for (let i = 0; i < payload.rows.length; i++) {
    const row = payload.rows[i];
    const rowNum = payload.headerRow ? i + 2 : i + 1;

    const sensorId = String(row[cm.sensorId] ?? '').trim();
    const sensorTypeRaw = String(row[cm.sensorType] ?? '').trim().toLowerCase();
    const valueRaw = row[cm.value];
    const unit = String(row[cm.unit] ?? '').trim();
    const timestampRaw = String(row[cm.timestamp] ?? '').trim();

    if (!sensorId) {
      errors.push(`Row ${rowNum}: missing sensorId`);
      continue;
    }

    const value = typeof valueRaw === 'number' ? valueRaw : parseFloat(String(valueRaw));
    if (!isFinite(value)) {
      errors.push(`Row ${rowNum}: invalid value "${valueRaw}" for sensor ${sensorId}`);
      continue;
    }

    if (!validateSensorType(sensorTypeRaw)) {
      errors.push(`Row ${rowNum}: invalid sensor type "${sensorTypeRaw}" for sensor ${sensorId}`);
      continue;
    }

    if (!validateTimestamp(timestampRaw)) {
      errors.push(`Row ${rowNum}: invalid timestamp "${timestampRaw}" for sensor ${sensorId}`);
      continue;
    }

    const timestamp = normalizeTimestamp(timestampRaw);
    const qualityRaw = cm.quality ? String(row[cm.quality] ?? '').trim().toLowerCase() : undefined;
    const quality = qualityRaw === 'good' || qualityRaw === 'uncertain' || qualityRaw === 'bad'
      ? qualityRaw as DataQuality
      : assessQuality(value, timestamp, sensorTypeRaw as SensorType);

    readings.push({
      readingId: generateReadingId(),
      sensorId,
      sensorType: sensorTypeRaw as SensorType,
      value,
      unit,
      timestamp,
      structureId: payload.structureId,
      quality,
      protocol: 'csv',
      rawHash,
      metadata: {
        filename: payload.filename,
        format: payload.format,
        rowNumber: rowNum,
        campaignId: payload.campaignId,
        campaignDate: payload.campaignDate,
      },
    });
  }

  const rejected = payload.rows.length - readings.length;
  recordStats('csv', readings.length, rejected);

  return {
    success: readings.length > 0,
    protocol: 'csv',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

/**
 * Adapter 5: SCADA
 * Receives data from SCADA systems via OPC-DA bridge or direct REST push.
 *
 * Scientific basis: IEC 62351:2020 — SCADA security;
 * OPC Foundation — Data Access quality codes (0-192)
 */
export function ingestScada(payload: ScadaPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  if (!payload.tags || payload.tags.length === 0) {
    errors.push('No SCADA tags provided.');
    recordStats('scada', 0, 0);
    return { success: false, protocol: 'scada', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload(payload);

  for (const tag of payload.tags) {
    if (!validateSensorType(tag.sensorType)) {
      errors.push(`Invalid sensor type "${tag.sensorType}" for SCADA tag ${tag.tagName}`);
      continue;
    }

    // Map OPC quality code to DataQuality
    // 0-63 = Bad, 64-191 = Uncertain, 192+ = Good
    let quality: DataQuality;
    if (tag.quality >= 192) quality = 'good';
    else if (tag.quality >= 64) quality = 'uncertain';
    else quality = 'bad';

    const timestamp = normalizeTimestamp(tag.timestamp);

    readings.push({
      readingId: generateReadingId(),
      sensorId: tag.sensorId,
      sensorType: tag.sensorType,
      value: tag.value,
      unit: tag.unit,
      timestamp,
      structureId: payload.structureId,
      quality,
      protocol: 'scada',
      rawHash,
      metadata: {
        tagName: tag.tagName,
        scadaSystem: payload.scadaSystem,
        protocolVersion: payload.protocolVersion,
        opcQualityCode: tag.quality,
        pollInterval: payload.pollInterval,
        sourceTimestamp: payload.sourceTimestamp,
      },
    });
  }

  const rejected = payload.tags.length - readings.length;
  recordStats('scada', readings.length, rejected);

  return {
    success: readings.length > 0,
    protocol: 'scada',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

/**
 * Adapter 6: Serial (RS-232/RS-485)
 * Parses data logger output from serial connections.
 *
 * Scientific basis: TIA/EIA-232-F (RS-232), TIA/EIA-485-A (RS-485)
 * Supports ASCII delimited, binary, and NMEA sentence formats.
 */
export function ingestSerial(payload: SerialPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  if (!payload.rawData || payload.rawData.trim().length === 0) {
    errors.push('No raw serial data provided.');
    recordStats('serial', 0, 0);
    return { success: false, protocol: 'serial', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload(payload);
  const timestamp = new Date().toISOString();

  if (payload.protocol === 'ascii') {
    // ASCII mode: split by lines, extract values using regex patterns from mapping
    const lines = payload.rawData.split(/[\r\n]+/).filter(l => l.trim());

    for (const mapping of payload.sensorMapping) {
      let matched = false;
      for (const line of lines) {
        try {
          const regex = new RegExp(mapping.pattern);
          const match = regex.exec(line);
          if (match && match[1]) {
            const rawValue = parseFloat(match[1]);
            if (!isFinite(rawValue)) continue;

            if (!validateSensorType(mapping.sensorType)) {
              errors.push(`Invalid sensor type "${mapping.sensorType}" for serial sensor ${mapping.sensorId}`);
              break;
            }

            const physicalValue = rawValue * mapping.scaleFactor;
            readings.push({
              readingId: generateReadingId(),
              sensorId: mapping.sensorId,
              sensorType: mapping.sensorType,
              value: physicalValue,
              unit: mapping.unit,
              timestamp,
              structureId: payload.structureId,
              quality: assessQuality(physicalValue, timestamp, mapping.sensorType),
              protocol: 'serial',
              rawHash,
              metadata: {
                port: payload.port,
                baudRate: payload.baudRate,
                matchedLine: line,
                rawValue,
                scaleFactor: mapping.scaleFactor,
              },
            });
            matched = true;
            break;
          }
        } catch {
          errors.push(`Invalid regex pattern "${mapping.pattern}" for sensor ${mapping.sensorId}`);
          break;
        }
      }
      if (!matched && !errors.some(e => e.includes(mapping.sensorId))) {
        errors.push(`No match found for sensor ${mapping.sensorId} with pattern "${mapping.pattern}"`);
      }
    }
  } else if (payload.protocol === 'binary') {
    // Binary mode: decode hex string and extract by byte positions
    let buffer: Buffer;
    try {
      buffer = Buffer.from(payload.rawData, 'hex');
    } catch {
      errors.push('Failed to decode hex binary data.');
      recordStats('serial', 0, 0);
      return { success: false, protocol: 'serial', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
    }

    for (const mapping of payload.sensorMapping) {
      const offset = parseInt(mapping.pattern, 10);
      if (isNaN(offset) || offset < 0 || offset + 4 > buffer.length) {
        errors.push(`Invalid byte offset "${mapping.pattern}" for sensor ${mapping.sensorId}`);
        continue;
      }

      if (!validateSensorType(mapping.sensorType)) {
        errors.push(`Invalid sensor type "${mapping.sensorType}" for sensor ${mapping.sensorId}`);
        continue;
      }

      const rawValue = buffer.readFloatBE(offset);
      const physicalValue = rawValue * mapping.scaleFactor;

      readings.push({
        readingId: generateReadingId(),
        sensorId: mapping.sensorId,
        sensorType: mapping.sensorType,
        value: physicalValue,
        unit: mapping.unit,
        timestamp,
        structureId: payload.structureId,
        quality: assessQuality(physicalValue, timestamp, mapping.sensorType),
        protocol: 'serial',
        rawHash,
        metadata: {
          port: payload.port,
          baudRate: payload.baudRate,
          byteOffset: offset,
          rawValue,
        },
      });
    }
  } else if (payload.protocol === 'nmea') {
    // NMEA sentence parsing (e.g., $GPGGA for GNSS, custom $SHMS sentences)
    const sentences = payload.rawData.split(/[\r\n]+/).filter(l => l.startsWith('$'));

    for (const sentence of sentences) {
      const fields = sentence.split(',');
      const sentenceType = fields[0];

      for (const mapping of payload.sensorMapping) {
        if (sentenceType !== mapping.pattern) continue;

        if (!validateSensorType(mapping.sensorType)) {
          errors.push(`Invalid sensor type "${mapping.sensorType}" for NMEA sensor ${mapping.sensorId}`);
          continue;
        }

        // Extract numeric value from field index encoded in scaleFactor decimal
        // scaleFactor integer part = field index, decimal = actual scale
        const fieldIndex = Math.floor(Math.abs(mapping.scaleFactor));
        const scale = mapping.scaleFactor === 0 ? 1 : mapping.scaleFactor / fieldIndex || 1;

        if (fieldIndex >= fields.length) continue;
        const rawValue = parseFloat(fields[fieldIndex]);
        if (!isFinite(rawValue)) continue;

        readings.push({
          readingId: generateReadingId(),
          sensorId: mapping.sensorId,
          sensorType: mapping.sensorType,
          value: rawValue * (Math.abs(scale) > 0.001 ? scale : 1),
          unit: mapping.unit,
          timestamp,
          structureId: payload.structureId,
          quality: assessQuality(rawValue, timestamp, mapping.sensorType),
          protocol: 'serial',
          rawHash,
          metadata: {
            port: payload.port,
            nmeaSentence: sentenceType,
            rawSentence: sentence,
          },
        });
      }
    }
  }

  const totalExpected = payload.sensorMapping.length;
  const rejected = totalExpected - readings.length;
  recordStats('serial', readings.length, rejected);

  return {
    success: readings.length > 0,
    protocol: 'serial',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

/**
 * Adapter 7: HTTP REST (generic JSON push)
 * Accepts standardized JSON payloads from any third-party system.
 *
 * Scientific basis: Fielding (2000) — REST architectural style
 */
export function ingestHttpRest(payload: HttpRestPayload): IngestionResult {
  const start = Date.now();
  const traceId = generateTraceId();
  const readings: NormalizedReading[] = [];
  const errors: string[] = [];

  if (!payload.readings || payload.readings.length === 0) {
    errors.push('No readings provided in HTTP REST payload.');
    recordStats('http-rest', 0, 0);
    return { success: false, protocol: 'http-rest', readingsIngested: 0, readingsRejected: 0, readings, errors, processingTimeMs: Date.now() - start, traceId };
  }

  const rawHash = hashPayload(payload);

  for (let i = 0; i < payload.readings.length; i++) {
    const r = payload.readings[i];

    if (!r.sensorId || !r.sensorType || r.value === undefined || !r.unit || !r.timestamp) {
      errors.push(`Reading ${i}: missing required fields (sensorId, sensorType, value, unit, timestamp)`);
      continue;
    }

    if (!validateSensorType(r.sensorType)) {
      errors.push(`Reading ${i}: invalid sensor type "${r.sensorType}"`);
      continue;
    }

    if (!validateTimestamp(r.timestamp)) {
      errors.push(`Reading ${i}: invalid timestamp "${r.timestamp}"`);
      continue;
    }

    if (!isFinite(r.value)) {
      errors.push(`Reading ${i}: invalid value ${r.value}`);
      continue;
    }

    const timestamp = normalizeTimestamp(r.timestamp);

    readings.push({
      readingId: generateReadingId(),
      sensorId: r.sensorId,
      sensorType: r.sensorType,
      value: r.value,
      unit: r.unit,
      timestamp,
      structureId: payload.structureId,
      quality: r.quality ?? assessQuality(r.value, timestamp, r.sensorType),
      protocol: 'http-rest',
      rawHash,
      metadata: {
        source: payload.source,
        apiVersion: payload.apiVersion,
        ...(r.metadata ?? {}),
      },
    });
  }

  const rejected = payload.readings.length - readings.length;
  recordStats('http-rest', readings.length, rejected);

  return {
    success: readings.length > 0,
    protocol: 'http-rest',
    readingsIngested: readings.length,
    readingsRejected: rejected,
    readings,
    errors,
    processingTimeMs: Date.now() - start,
    traceId,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// CONNECTOR STATUS REGISTRY
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Returns the status of all protocol adapters.
 * Used by GET /shms/ingest/status endpoint.
 */
export function getAllConnectorStatuses(): ConnectorStatus[] {
  const protocols: Array<{ protocol: IngestionProtocol; basis: string; config: Record<string, unknown> }> = [
    {
      protocol: 'mqtt',
      basis: 'MQTT v5.0 (OASIS Standard, 2019)',
      config: { broker: process.env.MQTT_BROKER_URL ?? 'not-configured', qos: 1, tls: true },
    },
    {
      protocol: 'modbus',
      basis: 'IEC 61158:2023 — Modbus RTU/TCP',
      config: { functionCodes: [3, 4], slaveIdRange: '1-247' },
    },
    {
      protocol: 'opcua',
      basis: 'IEC 62541:2020 — OPC Unified Architecture',
      config: { securityModes: ['None', 'Sign', 'SignAndEncrypt'] },
    },
    {
      protocol: 'lorawan',
      basis: 'LoRa Alliance TS001-1.0.4 (2020)',
      config: { supportedBandwidths: [125, 250, 500], spreadingFactors: '7-12' },
    },
    {
      protocol: 'csv',
      basis: 'GISTM 2020 §8.2 — Historical data integration',
      config: { formats: ['csv', 'tsv', 'excel'], encodings: ['utf-8', 'latin1'] },
    },
    {
      protocol: 'scada',
      basis: 'IEC 62351:2020 — SCADA security; OPC-DA quality codes',
      config: { qualityCodes: '0-192 per OPC specification' },
    },
    {
      protocol: 'serial',
      basis: 'TIA/EIA-232-F (RS-232), TIA/EIA-485-A (RS-485)',
      config: { protocols: ['ascii', 'binary', 'nmea'], baudRates: [9600, 19200, 38400, 57600, 115200] },
    },
    {
      protocol: 'http-rest',
      basis: 'Fielding (2000) — REST architectural style',
      config: { contentType: 'application/json', authentication: 'X-API-Key / Bearer JWT' },
    },
  ];

  return protocols.map(({ protocol, basis, config }) => {
    const stats = adapterStats.get(protocol);
    const isConfigured = protocol === 'mqtt'
      ? !!process.env.MQTT_BROKER_URL
      : true; // All other adapters are always available (push-based)

    return {
      protocol,
      status: stats?.lastActivity
        ? 'active' as const
        : isConfigured ? 'standby' as const : 'not-configured' as const,
      lastActivity: stats?.lastActivity ?? null,
      totalIngested: stats?.totalIngested ?? 0,
      totalRejected: stats?.totalRejected ?? 0,
      configuration: config,
      scientificBasis: basis,
    };
  });
}

/**
 * Universal ingestion dispatcher — routes payload to the appropriate adapter.
 */
export function ingestByProtocol(protocol: IngestionProtocol, payload: unknown): IngestionResult {
  switch (protocol) {
    case 'modbus': return ingestModbus(payload as ModbusPayload);
    case 'opcua': return ingestOpcua(payload as OpcuaPayload);
    case 'lorawan': return ingestLorawan(payload as LorawanPayload);
    case 'csv': return ingestCsv(payload as CsvPayload);
    case 'scada': return ingestScada(payload as ScadaPayload);
    case 'serial': return ingestSerial(payload as SerialPayload);
    case 'http-rest': return ingestHttpRest(payload as HttpRestPayload);
    case 'mqtt':
      return {
        success: false,
        protocol: 'mqtt',
        readingsIngested: 0,
        readingsRejected: 0,
        readings: [],
        errors: ['MQTT ingestion is handled by shms-mqtt-service.ts (persistent connection). Use that service instead of the REST adapter.'],
        processingTimeMs: 0,
        traceId: generateTraceId(),
      };
    default:
      return {
        success: false,
        protocol: protocol,
        readingsIngested: 0,
        readingsRejected: 0,
        readings: [],
        errors: [`Unsupported protocol: ${protocol}. Supported: mqtt, modbus, opcua, lorawan, csv, scada, serial, http-rest`],
        processingTimeMs: 0,
        traceId: generateTraceId(),
      };
  }
}
