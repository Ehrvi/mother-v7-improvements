// Generated autonomously by MOTHER v80.0 — Ciclo C119

/**
 * Represents a single reading from a geotechnical sensor.
 */
export interface SensorReading {
  /**
   * Unique identifier for the sensor.
   */
  sensorId: string;
  /**
   * Type of the geotechnical sensor.
   */
  type: 'piezometer' | 'inclinometer' | 'settlement';
  /**
   * The measured value from the sensor.
   */
  value: number;
  /**
   * Unit of measurement for the sensor value (e.g., 'kPa', 'mm', 'degrees').
   */
  unit: string;
  /**
   * Timestamp of when the reading was taken, in ISO 8601 format.
   */
  timestamp: string;
  /**
   * Geographic location of the sensor (e.g., 'dam_crest_section_A', 'borehole_BH01').
   */
  location?: string;
}

/**
 * Defines the possible alert levels for a sensor or system status.
 */
export enum AlertLevel {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY',
}

/**
 * Represents the structure of a request body sent to the MOTHER SHMS v2 ingestion endpoint.
 */
export interface MotherIngestionRequest {
  /**
   * An array of sensor readings to be ingested.
   */
  readings: SensorReading[];
  /**
   * Unique identifier for the SHMS agent sending the data.
   */
  agentId: string;
  /**
   * Timestamp of when the agent processed and sent the data, in ISO 8601 format.
   */
  agentTimestamp: string;
}

/**
 * Represents the expected structure of a response from the MOTHER SHMS v2 ingestion endpoint.
 */
export interface MotherIngestionResponse {
  /**
   * Indicates if the ingestion was successful.
   */
  success: boolean;
  /**
   * A message providing details about the ingestion result.
   */
  message: string;
  /**
   * Optional: An array of IDs of readings that were successfully processed.
   */
  processedReadingIds?: string[];
  /**
   * Optional: An array of errors encountered during ingestion.
   */
  errors?: { sensorId: string; message: string }[];
}

/**
 * Configuration interface for the SHMS Agent.
 */
export interface AgentConfig {
  /**
   * The port on which the Express server will listen.
   */
  port: number;
  /**
   * The base URL for the MOTHER SHMS v2 API.
   */
  motherApiBaseUrl: string;
  /**
   * The specific endpoint for data ingestion.
   */
  ingestionEndpoint: string;
  /**
   * Unique identifier for this SHMS agent instance.
   */
  agentId: string;
  /**
   * API key or token for authentication with MOTHER.
   */
  motherApiKey: string;
  /**
   * Interval in milliseconds for sending batched data to MOTHER.
   */
  ingestionIntervalMs: number;
  /**
   * Maximum number of readings to buffer before forcing an ingestion.
   */
  maxReadingsBuffer: number;
}

/**
 * Represents the current operational status of a sensor.
 */
export interface SensorStatus {
  /**
   * Unique identifier for the sensor.
   */
  sensorId: string;
  /**
   * The current operational status (e.g., 'online', 'offline', 'error').
   */
  status: 'online' | 'offline' | 'error' | 'maintenance';
  /**
   * Last known reading value.
   */
  lastValue?: number;
  /**
   * Timestamp of the last status update or reading.
   */
  lastUpdate: string;
  /**
   * Current alert level associated with the sensor.
   */
  alertLevel: AlertLevel;
  /**
   * Optional: A descriptive message about the sensor's status.
   */
  message?: string;
}