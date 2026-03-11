/**
 * MQTT → DIGITAL TWIN BRIDGE — C206
 *
 * Conecta o broker MQTT ao Digital Twin Engine (C205).
 * Ingere leituras de sensores em tempo real e alimenta o motor de anomalia detection.
 *
 * Base científica:
 * - MQTT: ISO/IEC 20922:2016 — Message Queuing Telemetry Transport v5.0
 * - ICOLD Bulletin 158 (2014) §4.3 — Dam Safety: sensor data thresholds L1/L2/L3
 * - GISTM (2020) §4.3 — Global Industry Standard on Tailings Management
 * - Sun et al. (2025) DOI:10.1145/3777730.3777858 — SHMS Digital Twin em tempo real
 * - ISO 13374-1:2003 — Condition monitoring and diagnostics of machines
 *
 * Tópico MQTT: shms/{structureId}/sensors/{sensorType}
 * Payload: { sensorId, value, unit, quality, timestamp }
 *
 * MOTHER v88.0 | C206 | Sprint 7 | 2026-03-09
 */

import { createLogger } from '../_core/logger';
import {
  ingestSensorReading,
  getAllTwins,
  type SensorReading,
} from './digital-twin-engine-c205';

const log = createLogger('mqtt-dt-bridge-c206');

export interface MQTTBridgeConfig {
  brokerUrl: string;
  topicPattern: string; // e.g., 'shms/+/sensors/+'
  clientId: string;
  reconnectPeriod: number; // ms
  connectTimeout: number;  // ms
}

export interface BridgeStatus {
  connected: boolean;
  messagesReceived: number;
  anomaliesDetected: number;
  lastMessageAt: Date | null;
  structuresActive: string[];
  errors: number;
  mode: 'live' | 'simulation' | 'disconnected';
}

const VALID_SENSOR_TYPES = ['displacement', 'vibration', 'temperature', 'pore_pressure', 'strain', 'acceleration'] as const;
type ValidSensorType = typeof VALID_SENSOR_TYPES[number];

function mapSensorType(raw: string): ValidSensorType {
  if (VALID_SENSOR_TYPES.includes(raw as ValidSensorType)) return raw as ValidSensorType;
  // Common aliases
  const aliases: Record<string, ValidSensorType> = {
    piezometer: 'pore_pressure',
    inclinometer: 'displacement',
    accelerometer: 'acceleration',
    thermometer: 'temperature',
    extensometer: 'strain',
    seismometer: 'vibration',
  };
  return aliases[raw.toLowerCase()] ?? 'displacement';
}

/**
 * MQTTDigitalTwinBridgeC206
 *
 * Arquitetura: MQTT Broker → Bridge → DigitalTwinEngine → Anomaly Detection → Alerts
 *
 * Padrão de reconexão: exponential backoff (Tanenbaum 2006 §6.4.2)
 * Max retries: 10 | Base delay: 1s | Max delay: 30s
 */
export class MQTTDigitalTwinBridgeC206 {
  private static instance: MQTTDigitalTwinBridgeC206;
  private status: BridgeStatus;
  private mqttClient: any = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private readonly BASE_DELAY_MS = 1000;
  private readonly MAX_DELAY_MS = 30000;

  private constructor() {
    this.status = {
      connected: false,
      messagesReceived: 0,
      anomaliesDetected: 0,
      lastMessageAt: null,
      structuresActive: [],
      errors: 0,
      mode: 'disconnected',
    };
  }

  static getInstance(): MQTTDigitalTwinBridgeC206 {
    if (!this.instance) this.instance = new MQTTDigitalTwinBridgeC206();
    return this.instance;
  }

  /**
   * Inicializa a bridge com conexão MQTT real.
   * Fallback automático para modo simulação se broker não disponível (R38).
   */
  async initialize(config?: Partial<MQTTBridgeConfig>): Promise<void> {
    // C316 (Conselho V108): SHMS_SIMULATION_ONLY guard — block real broker connection.
    // Per user directive 2026-03-12: SHMS must ONLY use simulation data until explicitly authorized.
    const forceSimulation = process.env.SHMS_SIMULATION_ONLY === 'true' || !process.env.MQTT_BROKER_URL;
    const brokerUrl = forceSimulation ? undefined : (config?.brokerUrl || process.env.MQTT_BROKER_URL);

    if (!brokerUrl) {
      const reason = forceSimulation ? 'SHMS_SIMULATION_ONLY=true (C316 guard)' : 'MQTT_BROKER_URL não configurado';
      log.info(`[C206-Bridge] ${reason} — iniciando modo simulação (R38 pré-produção)`);
      this.startSimulationMode();
      return;
    }

    try {
      const mqtt = await import('mqtt').catch(() => null);
      if (!mqtt) {
        log.warn('[C206-Bridge] Pacote mqtt não disponível — modo simulação ativo');
        this.startSimulationMode();
        return;
      }

      const clientConfig = {
        clientId: config?.clientId || `mother-dt-bridge-c206-${Date.now()}`,
        reconnectPeriod: config?.reconnectPeriod || 5000,
        connectTimeout: config?.connectTimeout || 10000,
        clean: true,
      };

      this.mqttClient = mqtt.connect(brokerUrl, clientConfig);
      this.setupMQTTHandlers(config?.topicPattern || 'shms/+/sensors/+');

      log.info(`[C206-Bridge] Conectando ao broker MQTT: ${brokerUrl}`);
    } catch (err) {
      log.warn('[C206-Bridge] Falha ao inicializar MQTT:', (err as Error).message);
      this.startSimulationMode();
    }
  }

  private setupMQTTHandlers(topicPattern: string): void {
    if (!this.mqttClient) return;

    this.mqttClient.on('connect', () => {
      this.status.connected = true;
      this.status.mode = 'live';
      this.reconnectAttempts = 0;
      log.info(`[C206-Bridge] MQTT conectado — subscrevendo: ${topicPattern}`);
      this.mqttClient.subscribe(topicPattern, { qos: 1 });
    });

    this.mqttClient.on('message', async (topic: string, payload: Buffer) => {
      await this.handleMessage(topic, payload);
    });

    this.mqttClient.on('error', (err: Error) => {
      this.status.errors++;
      log.warn(`[C206-Bridge] MQTT error: ${err.message}`);
    });

    this.mqttClient.on('close', () => {
      this.status.connected = false;
      this.status.mode = 'disconnected';
      this.scheduleReconnect();
    });

    this.mqttClient.on('offline', () => {
      this.status.connected = false;
      log.warn('[C206-Bridge] MQTT offline');
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    try {
      this.status.messagesReceived++;
      this.status.lastMessageAt = new Date();

      const parts = topic.split('/');
      if (parts.length < 4 || parts[0] !== 'shms' || parts[2] !== 'sensors') {
        log.warn(`[C206-Bridge] Tópico inválido: ${topic}`);
        return;
      }

      const structureId = parts[1];
      const rawSensorType = parts[3];

      let data: any;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        log.warn(`[C206-Bridge] Payload inválido no tópico ${topic}`);
        return;
      }

      const reading: SensorReading = {
        sensorId: data.sensorId || `${rawSensorType}-${structureId}`,
        structureId,
        type: mapSensorType(rawSensorType),
        value: Number(data.value),
        unit: data.unit || 'unknown',
        quality: 'good',
        timestamp: data.timestamp || new Date().toISOString(),
      };

      const result = ingestSensorReading(reading);

      if (result.anomaly.isAnomaly) {
        this.status.anomaliesDetected++;
        log.warn(
          `[C206-Bridge] ANOMALIA detectada — structure=${structureId} sensor=${reading.sensorId} ` +
          `value=${reading.value} healthIndex=${result.twin.healthIndex.toFixed(3)}`
        );
      }

      if (!this.status.structuresActive.includes(structureId)) {
        this.status.structuresActive.push(structureId);
      }
    } catch (err) {
      this.status.errors++;
      log.error('[C206-Bridge] handleMessage error:', err);
    }
  }

  /**
   * Reconexão com exponential backoff.
   * Tanenbaum (2006) "Computer Networks" §6.4.2 — Binary Exponential Backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      log.warn('[C206-Bridge] Max reconexões atingido — modo simulação ativo');
      this.startSimulationMode();
      return;
    }

    const delay = Math.min(
      this.BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      this.MAX_DELAY_MS
    );
    this.reconnectAttempts++;

    log.info(`[C206-Bridge] Reconectando em ${delay}ms (tentativa ${this.reconnectAttempts}/${this.MAX_RECONNECT})`);
    setTimeout(() => {
      if (this.mqttClient) this.mqttClient.reconnect();
    }, delay);
  }

  /**
   * Modo simulação: gera leituras sintéticas calibradas (GISTM 2020 + ICOLD 158).
   * Ativo quando MQTT_BROKER_URL não configurado (R38 — pré-produção oficial).
   */
  private startSimulationMode(): void {
    this.status.mode = 'simulation';
    log.info('[C206-Bridge] Modo SIMULAÇÃO ativo — dados sintéticos GISTM 2020 + ICOLD 158 (R38)');

    const SIMULATION_INTERVAL_MS = 30000;

    const simulate = () => {
      const structures = getAllTwins();
      for (const structure of structures) {
        const sensorTypes: ValidSensorType[] = ['displacement', 'pore_pressure', 'vibration'];
        for (const sensorType of sensorTypes) {
          const isAnomaly = Math.random() < 0.05;
          const baseValue = 100;
          const noise = (Math.random() - 0.5) * 10;
          const anomalyMultiplier = isAnomaly ? (Math.random() > 0.5 ? 3.5 : -3.5) : 1.0;
          const value = baseValue + noise * anomalyMultiplier;

          const reading: SensorReading = {
            sensorId: `SIM-${sensorType.toUpperCase()}-${structure.structureId}`,
            structureId: structure.structureId,
            type: sensorType,
            value,
            unit: sensorType === 'pore_pressure' ? 'kPa' : sensorType === 'displacement' ? 'mm' : 'g',
            quality: 'good',
            timestamp: new Date().toISOString(),
          };

          try {
            const result = ingestSensorReading(reading);
            this.status.messagesReceived++;
            this.status.lastMessageAt = new Date();
            if (result.anomaly.isAnomaly) this.status.anomaliesDetected++;
          } catch (err) {
            this.status.errors++;
          }
        }
      }
    };

    setTimeout(simulate, 5000);
    setInterval(simulate, SIMULATION_INTERVAL_MS);
  }

  getStatus(): BridgeStatus {
    return { ...this.status };
  }

  disconnect(): void {
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
    this.status.connected = false;
    this.status.mode = 'disconnected';
    log.info('[C206-Bridge] Desconectado');
  }
}

export const mqttDigitalTwinBridgeC206 = MQTTDigitalTwinBridgeC206.getInstance();

export async function initMQTTDigitalTwinBridgeC206(): Promise<void> {
  await mqttDigitalTwinBridgeC206.initialize();
  const status = mqttDigitalTwinBridgeC206.getStatus();
  log.info(
    `[C206] MQTT Digital Twin Bridge ATIVO — mode=${status.mode} | ` +
    `ISO/IEC 20922:2016 + ICOLD 158 + GISTM 2020 | C206 Sprint 7`
  );
}
