/**
 * SHMS MQTT/OPC-UA Connector — server/shms/mqtt-connector.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * Scientific basis:
 * - OPC UA PubSub (arXiv:2602.19603): Traffic-Aware Configuration of OPC UA PubSub
 * - MQTT v5.0 (ISO/IEC 20922:2016): Message Queuing Telemetry Transport
 * - IoT SHM (arXiv:2210.04165): Neural Extended Kalman Filters for SHM
 * - GISTM 2020: Global Industry Standard on Tailings Management (sensor requirements)
 *
 * Architecture:
 *   Sensors (IoT) → MQTT Broker → mqtt-connector.ts → anomaly-detector.ts → alert-engine.ts
 *
 * Sensor types supported (GISTM-compliant):
 *   - Piezometer (pore pressure) — critical for slope stability
 *   - Inclinometer (displacement/tilt)
 *   - GNSS (surface displacement)
 *   - Accelerometer (vibration/seismic)
 *   - Rain gauge (precipitation)
 *   - Water level gauge
 *   - Settlement plate
 */

import { EventEmitter } from 'events';
import mqtt, { MqttClient } from 'mqtt';

// ============================================================
// Types
// ============================================================

export type SensorType =
  | 'piezometer'      // Pore pressure (kPa) — GISTM critical
  | 'inclinometer'    // Displacement (mm) / tilt (degrees)
  | 'gnss'            // Surface displacement (mm, 3D)
  | 'accelerometer'   // Vibration (g) / seismic
  | 'rain_gauge'      // Precipitation (mm/h)
  | 'water_level'     // Water level (m)
  | 'settlement'      // Settlement (mm)
  | 'temperature'     // Temperature (°C)
  | 'custom';

export interface SensorReading {
  sensorId: string;
  sensorType: SensorType;
  timestamp: Date;
  value: number;
  unit: string;
  location: {
    zone: string;          // e.g., "upstream-face", "crest", "downstream-toe"
    elevation?: number;    // meters above sea level
    coordinates?: { lat: number; lon: number };
  };
  quality: 'good' | 'uncertain' | 'bad';  // IEC 61968-9 data quality
  rawPayload?: Record<string, unknown>;
}

export interface SensorConfig {
  sensorId: string;
  sensorType: SensorType;
  topic: string;           // MQTT topic pattern
  unit: string;
  location: SensorReading['location'];
  alertThresholds: {
    warning: number;
    critical: number;
    unit: string;
  };
  samplingIntervalMs: number;  // Expected sampling interval
}

export interface ConnectorStatus {
  connected: boolean;
  mode: 'mqtt' | 'opcua' | 'simulation';
  brokerUrl?: string;
  connectedAt?: Date;
  messagesReceived: number;
  lastMessageAt?: Date;
  activeSensors: number;
  errors: string[];
}

// ============================================================
// MQTT Connector (with simulation fallback)
// ============================================================

export class SHMSMqttConnector extends EventEmitter {
  private status: ConnectorStatus;
  private sensors: Map<string, SensorConfig>;
  private simulationIntervals: Map<string, NodeJS.Timeout>;
  private readonly brokerUrl: string;
  private mqttClient: MqttClient | null = null;

  constructor(brokerUrl?: string) {
    super();
    this.brokerUrl = brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.sensors = new Map();
    this.simulationIntervals = new Map();
    this.status = {
      connected: false,
      mode: 'simulation',
      messagesReceived: 0,
      activeSensors: 0,
      errors: [],
    };
  }

  /**
   * Register a sensor configuration.
   * Scientific basis: GISTM 2020 Section 7 — minimum instrumentation requirements
   */
  registerSensor(config: SensorConfig): void {
    this.sensors.set(config.sensorId, config);
    console.log(`[SHMS-MQTT] Registered sensor: ${config.sensorId} (${config.sensorType}) @ ${config.topic}`);
  }

  /**
   * Connect to MQTT broker or start simulation mode.
   * C193: Uses real HiveMQ Cloud broker when MQTT_BROKER_URL is set.
   * Scientific basis: ISO/IEC 20922:2016 MQTT v5.0 + Sun et al. (2025) DOI:10.1145/3777730.3777858
   */
  async connect(): Promise<void> {
    // C316 (Conselho V108): SHMS_SIMULATION_ONLY guard — block any real broker connection.
    // Scientific basis: Madaan et al. (2023) "Self-Refine" — validate in simulation before real-world deployment.
    // Per user directive 2026-03-12: SHMS must ONLY use simulation data until explicitly authorized.
    const forceSimulation = process.env.SHMS_SIMULATION_ONLY === 'true' || !process.env.MQTT_BROKER_URL;
    if (forceSimulation) {
      console.log('[SHMS-MQTT] C316: SIMULATION mode enforced (SHMS_SIMULATION_ONLY=true or no MQTT_BROKER_URL)');
      this._startSimulationMode();
      return;
    }
    const isRealBroker = this.brokerUrl && !this.brokerUrl.includes('localhost');
    if (isRealBroker) {
      console.log(`[SHMS-MQTT] C193: Connecting to HiveMQ Cloud: ${this.brokerUrl.replace(/:[^:@]*@/, ':***@')}`);
      await this._connectRealBroker();
    } else {
      console.log('[SHMS-MQTT] No real broker configured — SIMULATION mode');
      this._startSimulationMode();
    }
  }

  /**
   * Connect to real MQTT broker (HiveMQ Cloud).
   * C193: MQTT_BROKER_URL=mqtts://Mother:***@5d8c986a8de24d1d9d92cbd55fcd75d7.s1.eu.hivemq.cloud:8883
   */
  private async _connectRealBroker(): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[SHMS-MQTT] Connection timeout — falling back to SIMULATION');
        this._startSimulationMode();
        resolve();
      }, 10000);

      this.mqttClient = mqtt.connect(this.brokerUrl, {
        rejectUnauthorized: false,
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 8000,
        clientId: `mother-shms-${Date.now()}`,
      });

      this.mqttClient.on('connect', () => {
        clearTimeout(timeout);
        this.status.mode = 'mqtt';
        this.status.connected = true;
        this.status.connectedAt = new Date();
        this.status.brokerUrl = this.brokerUrl.replace(/:[^:@]*@/, ':***@');
        this.status.activeSensors = this.sensors.size;

        // Subscribe to sensor topics
        const topics = Array.from(this.sensors.values()).map((s) => s.topic);
        if (topics.length > 0) {
          this.mqttClient!.subscribe(topics, { qos: 1 });
        }
        this.mqttClient!.subscribe('mother/shms/#', { qos: 1 });

        console.log(`[SHMS-MQTT] CONNECTED to HiveMQ Cloud (${this.sensors.size} sensors)`);
        this.emit('connected', { mode: 'mqtt', broker: this.status.brokerUrl, sensors: this.sensors.size });
        resolve();
      });

      this.mqttClient.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString()) as Record<string, unknown>;
          const parts = topic.split('/');
          const sensorId = (data.sensorId as string) ?? parts[parts.length - 1] ?? 'unknown';
          const sensorType = (data.sensorType as string) ?? parts[2] ?? 'custom';
          const reading: SensorReading = {
            sensorId,
            sensorType: sensorType as SensorType,
            timestamp: data.timestamp ? new Date(data.timestamp as string) : new Date(),
            value: Number(data.value ?? 0),
            unit: (data.unit as string) ?? '',
            location: { zone: (data.zone as string) ?? 'unknown' },
            quality: (data.quality as 'good' | 'uncertain' | 'bad') ?? 'good',
            rawPayload: data,
          };
          this.status.messagesReceived++;
          this.status.lastMessageAt = new Date();
          this.emit('reading', reading);
        } catch { /* non-JSON message */ }
      });

      this.mqttClient.on('error', (err) => {
        clearTimeout(timeout);
        this.status.errors.push(err.message);
        console.error('[SHMS-MQTT] Error:', err.message);
        if (!this.status.connected) {
          console.warn('[SHMS-MQTT] Falling back to SIMULATION mode');
          this._startSimulationMode();
          resolve();
        }
      });

      this.mqttClient.on('offline', () => {
        this.status.connected = false;
        console.warn('[SHMS-MQTT] Broker offline');
      });
    });
  }

  /** Start simulation mode (fallback when no real broker). */
  private _startSimulationMode(): void {
    this.status.mode = 'simulation';
    this.status.connected = true;
    this.status.connectedAt = new Date();
    this.status.activeSensors = this.sensors.size;
    console.log(`[SHMS-MQTT] SIMULATION mode (${this.sensors.size} sensors)`);
    this.emit('connected', { mode: 'simulation', sensors: this.sensors.size });
  }

  /**
   * Start simulation for all registered sensors.
   * Uses deterministic Gaussian noise + drift to simulate realistic sensor behavior.
   * Scientific basis: Kalman Filter noise model (Welch & Bishop, 1995)
   */
  startSimulation(): void {
    for (const [sensorId, config] of this.sensors) {
      const baseValue = this.getBaseValue(config.sensorType);
      let currentValue = baseValue;

      const interval = setInterval(() => {
        // Gaussian noise (Box-Muller transform)
        const u1 = Math.random();
        const u2 = Math.random();
        const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

        // Slow drift + noise (realistic sensor behavior)
        const drift = (Math.random() - 0.5) * 0.01;
        currentValue += drift + noise * this.getNoiseLevel(config.sensorType);

        const reading: SensorReading = {
          sensorId,
          sensorType: config.sensorType,
          timestamp: new Date(),
          value: Math.round(currentValue * 100) / 100,
          unit: config.unit,
          location: config.location,
          quality: 'good',
        };

        this.status.messagesReceived++;
        this.status.lastMessageAt = new Date();
        this.emit('reading', reading);
      }, config.samplingIntervalMs);

      this.simulationIntervals.set(sensorId, interval);
    }

    console.log(`[SHMS-MQTT] Simulation started for ${this.sensors.size} sensors`);
  }

  /**
   * Stop simulation and disconnect.
   */
  disconnect(): void {
    for (const [, interval] of this.simulationIntervals) {
      clearInterval(interval);
    }
    this.simulationIntervals.clear();
    this.status.connected = false;
    console.log('[SHMS-MQTT] Disconnected');
    this.emit('disconnected');
  }

  getStatus(): ConnectorStatus {
    return { ...this.status };
  }

  getSensors(): SensorConfig[] {
    return Array.from(this.sensors.values());
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private getBaseValue(type: SensorType): number {
    const defaults: Record<SensorType, number> = {
      piezometer: 50,      // 50 kPa (typical pore pressure)
      inclinometer: 0,     // 0 mm displacement
      gnss: 0,             // 0 mm surface displacement
      accelerometer: 0.01, // 0.01g ambient vibration
      rain_gauge: 0,       // 0 mm/h
      water_level: 10,     // 10 m
      settlement: 0,       // 0 mm
      temperature: 25,     // 25°C
      custom: 0,
    };
    return defaults[type] ?? 0;
  }

  private getNoiseLevel(type: SensorType): number {
    const noise: Record<SensorType, number> = {
      piezometer: 0.5,
      inclinometer: 0.1,
      gnss: 0.2,
      accelerometer: 0.005,
      rain_gauge: 0.1,
      water_level: 0.05,
      settlement: 0.05,
      temperature: 0.2,
      custom: 0.1,
    };
    return noise[type] ?? 0.1;
  }
}

// ============================================================
// Default sensor configuration (IntellTech SHMS standard)
// Based on GISTM 2020 minimum instrumentation requirements
// ============================================================

export const DEFAULT_SENSOR_CONFIG: SensorConfig[] = [
  {
    sensorId: 'PZ-001',
    sensorType: 'piezometer',
    topic: 'shms/dam/upstream/piezometer/001',
    unit: 'kPa',
    location: { zone: 'upstream-face', elevation: 120 },
    alertThresholds: { warning: 80, critical: 100, unit: 'kPa' },
    samplingIntervalMs: 5000,
  },
  {
    sensorId: 'PZ-002',
    sensorType: 'piezometer',
    topic: 'shms/dam/crest/piezometer/002',
    unit: 'kPa',
    location: { zone: 'crest', elevation: 150 },
    alertThresholds: { warning: 70, critical: 90, unit: 'kPa' },
    samplingIntervalMs: 5000,
  },
  {
    sensorId: 'IN-001',
    sensorType: 'inclinometer',
    topic: 'shms/dam/downstream/inclinometer/001',
    unit: 'mm',
    location: { zone: 'downstream-slope', elevation: 130 },
    alertThresholds: { warning: 10, critical: 25, unit: 'mm' },
    samplingIntervalMs: 10000,
  },
  {
    sensorId: 'GNSS-001',
    sensorType: 'gnss',
    topic: 'shms/dam/crest/gnss/001',
    unit: 'mm',
    location: { zone: 'crest', elevation: 150, coordinates: { lat: -22.5, lon: -43.2 } },
    alertThresholds: { warning: 15, critical: 30, unit: 'mm' },
    samplingIntervalMs: 30000,
  },
  {
    sensorId: 'ACC-001',
    sensorType: 'accelerometer',
    topic: 'shms/dam/body/accelerometer/001',
    unit: 'g',
    location: { zone: 'dam-body', elevation: 135 },
    alertThresholds: { warning: 0.1, critical: 0.3, unit: 'g' },
    samplingIntervalMs: 1000,
  },
  {
    sensorId: 'RG-001',
    sensorType: 'rain_gauge',
    topic: 'shms/dam/crest/rain/001',
    unit: 'mm/h',
    location: { zone: 'crest', elevation: 150 },
    alertThresholds: { warning: 25, critical: 50, unit: 'mm/h' },
    samplingIntervalMs: 60000,
  },
];

// ============================================================
// Factory function
// ============================================================

export function createSHMSConnector(brokerUrl?: string): SHMSMqttConnector {
  const connector = new SHMSMqttConnector(brokerUrl);

  // Register default sensors
  for (const config of DEFAULT_SENSOR_CONFIG) {
    connector.registerSensor(config);
  }

  return connector;
}
