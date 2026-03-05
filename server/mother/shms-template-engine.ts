/**
 * shms-template-engine.ts — MOTHER v80.5 — Ciclo 128
 *
 * Motor de templates SHMS para configuração por cliente.
 * Cada cliente Intelltech tem seu próprio perfil de sensores, thresholds e alertas.
 *
 * Templates disponíveis:
 * - dam_monitoring: Barragens e reservatórios (ICOLD Bulletin 158)
 * - building_monitoring: Edifícios e infraestrutura
 * - slope_monitoring: Taludes e encostas
 * - tunnel_monitoring: Túneis e escavações (NATM)
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 (2014) — Dam monitoring guidelines
 * - ISO 19650:2018 — Information management for built assets
 * - ABNT NBR 13028:2017 — Dam safety reports
 * - NATM guidelines — New Austrian Tunnelling Method
 *
 * @module shms-template-engine
 * @version 1.0.0
 * @cycle C128
 */

import crypto from 'crypto';
import { getDb, insertKnowledge } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export type SHMSTemplateType = 'dam_monitoring' | 'building_monitoring' | 'slope_monitoring' | 'tunnel_monitoring';

export interface SensorDefinition {
  id: string;
  name: string;
  type: string;
  unit: string;
  samplingRateSeconds: number;
  minValue: number;
  maxValue: number;
  precision: number;
}

export interface AlertThreshold {
  sensorType: string;
  warningValue: number;
  criticalValue: number;
  unit: string;
  direction: 'above' | 'below' | 'absolute';
}

export interface SHMSTemplateConfig {
  templateType: SHMSTemplateType;
  version: string;
  description: string;
  standards: string[];
  sensors: SensorDefinition[];
  alertThresholds: AlertThreshold[];
  reportingFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
  anomalyDetection: AnomalyDetectionConfig;
  digitalTwin: DigitalTwinConfig;
}

export interface AnomalyDetectionConfig {
  method: 'zscore' | 'iqr' | 'isolation_forest' | 'lstm';
  windowSize: number;
  sensitivityLevel: 'low' | 'medium' | 'high';
  minDataPoints: number;
}

export interface DigitalTwinConfig {
  enabled: boolean;
  updateFrequencySeconds: number;
  predictionHorizonHours: number;
  modelType: 'physics' | 'ml' | 'hybrid';
}

export interface TenantSHMSConfig {
  tenantId: string;
  templateType: SHMSTemplateType;
  baseConfig: SHMSTemplateConfig;
  overrides: Partial<SHMSTemplateConfig>;
  effectiveConfig: SHMSTemplateConfig;
  appliedAt: string;
  configHash: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  templateType: SHMSTemplateType;
  errors: string[];
  warnings: string[];
}

// ============================================================
// TEMPLATE DEFINITIONS
// ============================================================

const TEMPLATE_CONFIGS: Record<SHMSTemplateType, SHMSTemplateConfig> = {
  dam_monitoring: {
    templateType: 'dam_monitoring',
    version: '2.0.0',
    description: 'Comprehensive dam and reservoir monitoring following ICOLD Bulletin 158',
    standards: ['ICOLD Bulletin 158', 'ABNT NBR 13028:2017', 'ANCOLD Guidelines'],
    sensors: [
      { id: 'displacement', name: 'Displacement Sensor', type: 'displacement', unit: 'mm', samplingRateSeconds: 60, minValue: -100, maxValue: 100, precision: 0.1 },
      { id: 'pore_pressure', name: 'Piezometer', type: 'pore_pressure', unit: 'kPa', samplingRateSeconds: 60, minValue: 0, maxValue: 500, precision: 0.5 },
      { id: 'seismic', name: 'Seismograph', type: 'seismic', unit: 'g', samplingRateSeconds: 1, minValue: -2, maxValue: 2, precision: 0.001 },
      { id: 'temperature', name: 'Temperature Sensor', type: 'temperature', unit: '°C', samplingRateSeconds: 300, minValue: -20, maxValue: 60, precision: 0.1 },
      { id: 'inclination', name: 'Inclinometer', type: 'inclination', unit: '°', samplingRateSeconds: 60, minValue: -45, maxValue: 45, precision: 0.01 },
    ],
    alertThresholds: [
      { sensorType: 'displacement', warningValue: 5, criticalValue: 10, unit: 'mm', direction: 'absolute' },
      { sensorType: 'pore_pressure', warningValue: 150, criticalValue: 200, unit: 'kPa', direction: 'above' },
      { sensorType: 'seismic', warningValue: 0.05, criticalValue: 0.1, unit: 'g', direction: 'absolute' },
      { sensorType: 'inclination', warningValue: 1, criticalValue: 2, unit: '°', direction: 'absolute' },
    ],
    reportingFrequency: 'daily',
    retentionDays: 3650,
    anomalyDetection: { method: 'zscore', windowSize: 100, sensitivityLevel: 'high', minDataPoints: 30 },
    digitalTwin: { enabled: true, updateFrequencySeconds: 300, predictionHorizonHours: 24, modelType: 'hybrid' },
  },

  building_monitoring: {
    templateType: 'building_monitoring',
    version: '2.0.0',
    description: 'Structural health monitoring for buildings and civil infrastructure',
    standards: ['ISO 19650', 'ABNT NBR 6118', 'ASCE 7-22'],
    sensors: [
      { id: 'displacement', name: 'Displacement Sensor', type: 'displacement', unit: 'mm', samplingRateSeconds: 30, minValue: -50, maxValue: 50, precision: 0.05 },
      { id: 'vibration', name: 'Accelerometer', type: 'vibration', unit: 'Hz', samplingRateSeconds: 1, minValue: 0, maxValue: 100, precision: 0.1 },
      { id: 'crack_width', name: 'Crack Meter', type: 'crack_width', unit: 'mm', samplingRateSeconds: 60, minValue: 0, maxValue: 10, precision: 0.01 },
      { id: 'temperature', name: 'Temperature Sensor', type: 'temperature', unit: '°C', samplingRateSeconds: 300, minValue: -10, maxValue: 50, precision: 0.1 },
      { id: 'humidity', name: 'Humidity Sensor', type: 'humidity', unit: '%RH', samplingRateSeconds: 300, minValue: 0, maxValue: 100, precision: 0.5 },
    ],
    alertThresholds: [
      { sensorType: 'displacement', warningValue: 2, criticalValue: 5, unit: 'mm', direction: 'absolute' },
      { sensorType: 'vibration', warningValue: 10, criticalValue: 20, unit: 'Hz', direction: 'above' },
      { sensorType: 'crack_width', warningValue: 0.3, criticalValue: 0.5, unit: 'mm', direction: 'above' },
    ],
    reportingFrequency: 'weekly',
    retentionDays: 1825,
    anomalyDetection: { method: 'iqr', windowSize: 50, sensitivityLevel: 'medium', minDataPoints: 20 },
    digitalTwin: { enabled: true, updateFrequencySeconds: 600, predictionHorizonHours: 168, modelType: 'ml' },
  },

  slope_monitoring: {
    templateType: 'slope_monitoring',
    version: '2.0.0',
    description: 'Slope stability and landslide early warning monitoring',
    standards: ['ICOLD Bulletin 158', 'GEO-SLOPE guidelines', 'ISRM guidelines'],
    sensors: [
      { id: 'inclinometer', name: 'Inclinometer', type: 'inclination', unit: '°', samplingRateSeconds: 120, minValue: -90, maxValue: 90, precision: 0.01 },
      { id: 'piezometer', name: 'Piezometer', type: 'pore_pressure', unit: 'm', samplingRateSeconds: 120, minValue: 0, maxValue: 50, precision: 0.01 },
      { id: 'rain_gauge', name: 'Rain Gauge', type: 'precipitation', unit: 'mm/h', samplingRateSeconds: 60, minValue: 0, maxValue: 200, precision: 0.1 },
      { id: 'displacement', name: 'GPS/GNSS Sensor', type: 'displacement', unit: 'mm', samplingRateSeconds: 300, minValue: -1000, maxValue: 1000, precision: 1 },
      { id: 'crack_meter', name: 'Crack Meter', type: 'crack_width', unit: 'mm', samplingRateSeconds: 120, minValue: 0, maxValue: 100, precision: 0.1 },
    ],
    alertThresholds: [
      { sensorType: 'inclination', warningValue: 2, criticalValue: 5, unit: '°', direction: 'absolute' },
      { sensorType: 'pore_pressure', warningValue: 3, criticalValue: 5, unit: 'm', direction: 'above' },
      { sensorType: 'displacement', warningValue: 10, criticalValue: 25, unit: 'mm', direction: 'absolute' },
      { sensorType: 'precipitation', warningValue: 50, criticalValue: 100, unit: 'mm/h', direction: 'above' },
    ],
    reportingFrequency: 'daily',
    retentionDays: 3650,
    anomalyDetection: { method: 'lstm', windowSize: 200, sensitivityLevel: 'high', minDataPoints: 100 },
    digitalTwin: { enabled: true, updateFrequencySeconds: 300, predictionHorizonHours: 72, modelType: 'physics' },
  },

  tunnel_monitoring: {
    templateType: 'tunnel_monitoring',
    version: '2.0.0',
    description: 'Underground tunnel and excavation monitoring (NATM method)',
    standards: ['NATM guidelines', 'ITA guidelines', 'Eurocode 7'],
    sensors: [
      { id: 'convergence', name: 'Convergence Meter', type: 'convergence', unit: 'mm', samplingRateSeconds: 60, minValue: -200, maxValue: 200, precision: 0.1 },
      { id: 'strain_gauge', name: 'Strain Gauge', type: 'strain', unit: 'μstrain', samplingRateSeconds: 60, minValue: -2000, maxValue: 2000, precision: 1 },
      { id: 'load_cell', name: 'Load Cell', type: 'load', unit: 'kN', samplingRateSeconds: 60, minValue: 0, maxValue: 2000, precision: 0.5 },
      { id: 'pore_pressure', name: 'Piezometer', type: 'pore_pressure', unit: 'kPa', samplingRateSeconds: 60, minValue: 0, maxValue: 500, precision: 0.5 },
      { id: 'temperature', name: 'Temperature Sensor', type: 'temperature', unit: '°C', samplingRateSeconds: 300, minValue: 5, maxValue: 40, precision: 0.1 },
    ],
    alertThresholds: [
      { sensorType: 'convergence', warningValue: 5, criticalValue: 15, unit: 'mm', direction: 'absolute' },
      { sensorType: 'strain', warningValue: 500, criticalValue: 1000, unit: 'μstrain', direction: 'absolute' },
      { sensorType: 'load', warningValue: 800, criticalValue: 1000, unit: 'kN', direction: 'above' },
    ],
    reportingFrequency: 'daily',
    retentionDays: 3650,
    anomalyDetection: { method: 'zscore', windowSize: 100, sensitivityLevel: 'high', minDataPoints: 50 },
    digitalTwin: { enabled: true, updateFrequencySeconds: 300, predictionHorizonHours: 24, modelType: 'physics' },
  },
};

// ============================================================
// TEMPLATE ENGINE FUNCTIONS
// ============================================================

export function loadTemplate(templateType: SHMSTemplateType): SHMSTemplateConfig {
  const template = TEMPLATE_CONFIGS[templateType];
  if (!template) throw new Error(`Template not found: ${templateType}`);
  return { ...template };
}

export async function applyTemplate(
  tenantId: string,
  templateType: SHMSTemplateType,
  overrides: Partial<SHMSTemplateConfig> = {}
): Promise<TenantSHMSConfig> {
  const baseConfig = loadTemplate(templateType);

  const effectiveConfig: SHMSTemplateConfig = {
    ...baseConfig,
    ...overrides,
    sensors: overrides.sensors || baseConfig.sensors,
    alertThresholds: overrides.alertThresholds || baseConfig.alertThresholds,
    anomalyDetection: { ...baseConfig.anomalyDetection, ...(overrides.anomalyDetection || {}) },
    digitalTwin: { ...baseConfig.digitalTwin, ...(overrides.digitalTwin || {}) },
  };

  const appliedAt = new Date().toISOString();
  const configHash = computeConfigHash(tenantId, effectiveConfig);

  const tenantConfig: TenantSHMSConfig = {
    tenantId,
    templateType,
    baseConfig,
    overrides,
    effectiveConfig,
    appliedAt,
    configHash,
  };

  await insertKnowledge({
    title: `SHMS Template Config: ${tenantId} (${templateType})`,
    content: JSON.stringify(tenantConfig),
    category: 'shms_v2',
    source: 'shms-template-engine',
  });

  return tenantConfig;
}

export function validateTemplate(
  templateType: SHMSTemplateType,
  overrides: Partial<SHMSTemplateConfig> = {}
): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!TEMPLATE_CONFIGS[templateType]) {
    errors.push(`Unknown template type: ${templateType}`);
    return { valid: false, templateType, errors, warnings };
  }

  if (overrides.sensors) {
    for (const sensor of overrides.sensors) {
      if (sensor.minValue >= sensor.maxValue) {
        errors.push(`Sensor ${sensor.id}: minValue must be less than maxValue`);
      }
      if (sensor.samplingRateSeconds < 1) {
        errors.push(`Sensor ${sensor.id}: samplingRateSeconds must be >= 1`);
      }
    }
  }

  if (overrides.alertThresholds) {
    for (const threshold of overrides.alertThresholds) {
      if (threshold.warningValue >= threshold.criticalValue) {
        warnings.push(`Alert threshold for ${threshold.sensorType}: warningValue should be less than criticalValue`);
      }
    }
  }

  if (overrides.retentionDays !== undefined && overrides.retentionDays < 365) {
    warnings.push(`Retention period of ${overrides.retentionDays} days may not meet regulatory requirements`);
  }

  return { valid: errors.length === 0, templateType, errors, warnings };
}

export async function getTenantConfig(tenantId: string): Promise<TenantSHMSConfig | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`
    SELECT content FROM knowledge
    WHERE title LIKE ${`SHMS Template Config: ${tenantId}%`} AND category = 'shms_v2'
    ORDER BY id DESC LIMIT 1
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  if (!rows || (rows as unknown[]).length === 0) return null;

  const content = ((rows as Record<string, unknown>[])[0]).content as string;
  try {
    return JSON.parse(content) as TenantSHMSConfig;
  } catch {
    return null;
  }
}

export function listTemplates(): Array<{
  type: SHMSTemplateType;
  description: string;
  standards: string[];
  sensorCount: number;
  reportingFrequency: string;
}> {
  return Object.values(TEMPLATE_CONFIGS).map(config => ({
    type: config.templateType,
    description: config.description,
    standards: config.standards,
    sensorCount: config.sensors.length,
    reportingFrequency: config.reportingFrequency,
  }));
}

export async function customizeThresholds(
  tenantId: string,
  thresholdOverrides: AlertThreshold[]
): Promise<TenantSHMSConfig | null> {
  const currentConfig = await getTenantConfig(tenantId);
  if (!currentConfig) return null;

  return applyTemplate(tenantId, currentConfig.templateType, {
    ...currentConfig.overrides,
    alertThresholds: thresholdOverrides,
  });
}

export async function generateConfigReport(tenantId: string): Promise<string> {
  const config = await getTenantConfig(tenantId);
  if (!config) {
    return `# SHMS Configuration Report — ${tenantId}\n\nNo configuration found for this tenant.`;
  }

  const { effectiveConfig } = config;

  return `# SHMS Configuration Report — ${tenantId}

**Template:** ${effectiveConfig.templateType}
**Version:** ${effectiveConfig.version}
**Applied:** ${config.appliedAt}
**Config Hash:** \`${config.configHash}\`

## Description

${effectiveConfig.description}

## Standards

${effectiveConfig.standards.map(s => `- ${s}`).join('\n')}

## Sensors (${effectiveConfig.sensors.length})

| ID | Name | Type | Unit | Sampling Rate |
|----|------|------|------|---------------|
${effectiveConfig.sensors.map(s => `| ${s.id} | ${s.name} | ${s.type} | ${s.unit} | ${s.samplingRateSeconds}s |`).join('\n')}

## Alert Thresholds

| Sensor Type | Warning | Critical | Unit | Direction |
|-------------|---------|----------|------|-----------|
${effectiveConfig.alertThresholds.map(t => `| ${t.sensorType} | ${t.warningValue} | ${t.criticalValue} | ${t.unit} | ${t.direction} |`).join('\n')}

## System Configuration

| Parameter | Value |
|-----------|-------|
| Reporting Frequency | ${effectiveConfig.reportingFrequency} |
| Data Retention | ${effectiveConfig.retentionDays} days |
| Anomaly Detection | ${effectiveConfig.anomalyDetection.method} (${effectiveConfig.anomalyDetection.sensitivityLevel} sensitivity) |
| Digital Twin | ${effectiveConfig.digitalTwin.enabled ? 'Enabled' : 'Disabled'} |
| Prediction Horizon | ${effectiveConfig.digitalTwin.predictionHorizonHours}h |
`;
}

function computeConfigHash(tenantId: string, config: SHMSTemplateConfig): string {
  const data = JSON.stringify({
    tenantId,
    templateType: config.templateType,
    version: config.version,
    sensorCount: config.sensors.length,
    thresholdCount: config.alertThresholds.length,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}
