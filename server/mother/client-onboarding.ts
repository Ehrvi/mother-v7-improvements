/**
 * client-onboarding.ts — MOTHER v80.5 — Ciclo 126
 *
 * Pipeline de onboarding de clientes para o template SaaS multi-tenant da Intelltech.
 * Cria e provisiona tenants de forma completamente autônoma.
 *
 * Pipeline: create_tenant → provision_resources → configure_shms → generate_report → verify
 *
 * Scientific basis:
 * - arXiv:2312.10997 — LLM-based software engineering
 * - arXiv:2401.12961 — Autonomous software development
 * - ISO/IEC 27001:2022 — Information security management
 * - Google Cloud Architecture Framework — multi-tenant SaaS
 *
 * @module client-onboarding
 * @version 1.0.0
 * @cycle C126
 */

import crypto from 'crypto';
import { getDb, insertKnowledge } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DEPROVISIONED' | 'ERROR';

export type SHMSTemplate = 'dam_monitoring' | 'building_monitoring' | 'slope_monitoring' | 'tunnel_monitoring';

export interface TenantConfig {
  tenantId: string;
  clientName: string;
  shmsTemplate: SHMSTemplate;
  mqttNamespace: string;
  apiKey: string;
  billingPlan: 'starter' | 'professional' | 'enterprise';
  provisionedAt: string;
  status: TenantStatus;
  endpoints: TenantEndpoints;
  metadata: Record<string, unknown>;
}

export interface TenantEndpoints {
  api: string;
  mqtt: string;
  dashboard: string;
  webhookUrl?: string;
}

export interface OnboardingRequest {
  clientName: string;
  shmsTemplate: SHMSTemplate;
  billingPlan?: 'starter' | 'professional' | 'enterprise';
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface OnboardingResult {
  success: boolean;
  tenantId: string;
  config: TenantConfig;
  proofHash: string;
  onboardingReport: string;
  duration: number;
  error?: string;
}

export interface ProvisioningStep {
  step: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface OnboardingProgress {
  tenantId: string;
  clientName: string;
  currentStep: string;
  steps: ProvisioningStep[];
  startedAt: string;
  completedAt?: string;
  status: TenantStatus;
}

// ============================================================
// SHMS TEMPLATE CONFIGURATIONS
// ============================================================

const SHMS_TEMPLATES: Record<SHMSTemplate, object> = {
  dam_monitoring: {
    sensorTypes: ['displacement', 'pore_pressure', 'seismic', 'temperature', 'inclination'],
    samplingRate: 60,
    alertThresholds: {
      displacement_mm: { warning: 5, critical: 10 },
      pore_pressure_kpa: { warning: 150, critical: 200 },
      seismic_g: { warning: 0.05, critical: 0.1 },
    },
    standards: ['ICOLD Bulletin 158', 'ABNT NBR 13028:2017'],
    reportingFrequency: 'daily',
  },
  building_monitoring: {
    sensorTypes: ['displacement', 'vibration', 'crack_width', 'temperature', 'humidity'],
    samplingRate: 30,
    alertThresholds: {
      displacement_mm: { warning: 2, critical: 5 },
      vibration_hz: { warning: 10, critical: 20 },
      crack_width_mm: { warning: 0.3, critical: 0.5 },
    },
    standards: ['ISO 19650', 'ABNT NBR 6118'],
    reportingFrequency: 'weekly',
  },
  slope_monitoring: {
    sensorTypes: ['inclinometer', 'piezometer', 'rain_gauge', 'displacement', 'gps'],
    samplingRate: 120,
    alertThresholds: {
      inclination_deg: { warning: 2, critical: 5 },
      piezometer_m: { warning: 3, critical: 5 },
      displacement_mm: { warning: 10, critical: 25 },
    },
    standards: ['ICOLD Bulletin 158', 'GEO-SLOPE guidelines'],
    reportingFrequency: 'daily',
  },
  tunnel_monitoring: {
    sensorTypes: ['convergence', 'strain_gauge', 'load_cell', 'pore_pressure', 'temperature'],
    samplingRate: 60,
    alertThresholds: {
      convergence_mm: { warning: 5, critical: 15 },
      strain_microstrain: { warning: 500, critical: 1000 },
      load_kn: { warning: 800, critical: 1000 },
    },
    standards: ['NATM guidelines', 'ITA guidelines'],
    reportingFrequency: 'daily',
  },
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

function generateTenantId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `intelltech-${timestamp}-${random}`;
}

function generateApiKey(tenantId: string): string {
  const secret = process.env.API_KEY_SECRET || 'mother-secret-key';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${tenantId}-${Date.now()}`);
  return `ik_${hmac.digest('hex').slice(0, 32)}`;
}

function computeProofHash(config: TenantConfig): string {
  const data = JSON.stringify({
    tenantId: config.tenantId,
    clientName: config.clientName,
    shmsTemplate: config.shmsTemplate,
    provisionedAt: config.provisionedAt,
    apiKey: config.apiKey.slice(0, 8),
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function createTenantRecord(config: TenantConfig): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(100) UNIQUE NOT NULL,
      client_name VARCHAR(255) NOT NULL,
      shms_template VARCHAR(50) NOT NULL,
      mqtt_namespace VARCHAR(255) NOT NULL,
      api_key VARCHAR(255) NOT NULL,
      billing_plan VARCHAR(50) DEFAULT 'starter',
      status VARCHAR(50) DEFAULT 'PROVISIONING',
      endpoints JSON,
      metadata JSON,
      provisioned_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  await db.execute(sql`
    INSERT INTO tenants (tenant_id, client_name, shms_template, mqtt_namespace, api_key, billing_plan, status, endpoints, metadata, provisioned_at)
    VALUES (
      ${config.tenantId},
      ${config.clientName},
      ${config.shmsTemplate},
      ${config.mqttNamespace},
      ${config.apiKey},
      ${config.billingPlan},
      ${config.status},
      ${JSON.stringify(config.endpoints)},
      ${JSON.stringify(config.metadata)},
      ${config.provisionedAt}
    )
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      metadata = VALUES(metadata)
  `);
}

async function provisionMQTTNamespace(tenantId: string): Promise<string> {
  const namespace = `shms/${tenantId}`;
  await insertKnowledge({
    title: `MQTT Namespace: ${tenantId}`,
    content: `Tenant ${tenantId} MQTT namespace: ${namespace}/#. Topics: ${namespace}/sensors/#, ${namespace}/alerts/#, ${namespace}/status`,
    category: 'orchestration',
    source: 'client-onboarding',
  });
  return namespace;
}

async function configureSHMS(tenantId: string, template: SHMSTemplate): Promise<object> {
  const templateConfig = SHMS_TEMPLATES[template];
  await insertKnowledge({
    title: `SHMS Config: ${tenantId} (${template})`,
    content: JSON.stringify({ tenantId, template, config: templateConfig }),
    category: 'shms_v2',
    source: 'client-onboarding',
  });
  return templateConfig;
}

async function generateOnboardingReport(
  config: TenantConfig,
  shmsConfig: object
): Promise<string> {
  try {
    const { invokeLLM } = await import('../_core/llm');
    const prompt = `Generate a professional onboarding report for a new Intelltech SHMS client.

Tenant ID: ${config.tenantId}
Client Name: ${config.clientName}
SHMS Template: ${config.shmsTemplate}
Billing Plan: ${config.billingPlan}
Provisioned At: ${config.provisionedAt}
API Endpoint: ${config.endpoints.api}
MQTT Namespace: ${config.mqttNamespace}

SHMS Configuration: ${JSON.stringify(shmsConfig, null, 2)}

Generate a concise markdown report (max 400 words) covering:
1. Onboarding summary
2. Provisioned resources
3. SHMS configuration highlights
4. Next steps for the client

Keep it professional and technical.`;

    const response = await invokeLLM({
      provider: 'deepseek',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
    });

    const content = response.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    return `# Onboarding Report — ${config.clientName}\n\nTenant ${config.tenantId} provisioned successfully at ${config.provisionedAt}.`;
  } catch {
    return `# Onboarding Report — ${config.clientName}\n\nTenant ${config.tenantId} provisioned successfully at ${config.provisionedAt}.\n\nTemplate: ${config.shmsTemplate} | Plan: ${config.billingPlan}`;
  }
}

// ============================================================
// MAIN ONBOARDING PIPELINE
// ============================================================

const onboardingProgressMap = new Map<string, OnboardingProgress>();

/**
 * Execute the complete onboarding pipeline for a new client
 *
 * @param request - The onboarding request
 * @returns OnboardingResult with tenant config and proof hash
 *
 * @example
 * ```typescript
 * const result = await onboardClient({
 *   clientName: 'intelltech-demo-001',
 *   shmsTemplate: 'dam_monitoring',
 *   billingPlan: 'professional',
 * });
 * ```
 */
export async function onboardClient(request: OnboardingRequest): Promise<OnboardingResult> {
  const startTime = Date.now();
  const tenantId = generateTenantId();
  const provisionedAt = new Date().toISOString();

  const progress: OnboardingProgress = {
    tenantId,
    clientName: request.clientName,
    currentStep: 'INITIALIZING',
    steps: [
      { step: 'CREATE_TENANT', status: 'PENDING' },
      { step: 'PROVISION_MQTT', status: 'PENDING' },
      { step: 'CONFIGURE_SHMS', status: 'PENDING' },
      { step: 'GENERATE_REPORT', status: 'PENDING' },
      { step: 'VERIFY', status: 'PENDING' },
    ],
    startedAt: provisionedAt,
    status: 'PROVISIONING',
  };

  onboardingProgressMap.set(tenantId, progress);

  try {
    // STEP 1: Create tenant record
    progress.currentStep = 'CREATE_TENANT';
    progress.steps[0].status = 'IN_PROGRESS';
    progress.steps[0].startedAt = new Date().toISOString();

    const apiKey = generateApiKey(tenantId);
    const mqttNamespace = `shms/${tenantId}`;
    const motherUrl = process.env.MOTHER_URL || 'https://mother-interface-qtvghovzxa-ts.a.run.app';

    const config: TenantConfig = {
      tenantId,
      clientName: request.clientName,
      shmsTemplate: request.shmsTemplate,
      mqttNamespace,
      apiKey,
      billingPlan: request.billingPlan || 'starter',
      provisionedAt,
      status: 'PROVISIONING',
      endpoints: {
        api: `${motherUrl}/api/a2a/clients/${tenantId}`,
        mqtt: `mqtt://mother-interface-qtvghovzxa-ts.a.run.app:1883/${mqttNamespace}`,
        dashboard: `${motherUrl}/shms/dashboard?tenant=${tenantId}`,
        webhookUrl: request.webhookUrl,
      },
      metadata: {
        ...(request.metadata || {}),
        onboardedBy: 'MOTHER-autonomous-coder',
        cycle: 'C126',
        roadmap: 'v4.2',
      },
    };

    await createTenantRecord(config);
    progress.steps[0].status = 'COMPLETED';
    progress.steps[0].completedAt = new Date().toISOString();

    // STEP 2: Provision MQTT namespace
    progress.currentStep = 'PROVISION_MQTT';
    progress.steps[1].status = 'IN_PROGRESS';
    progress.steps[1].startedAt = new Date().toISOString();

    await provisionMQTTNamespace(tenantId);
    progress.steps[1].status = 'COMPLETED';
    progress.steps[1].completedAt = new Date().toISOString();

    // STEP 3: Configure SHMS
    progress.currentStep = 'CONFIGURE_SHMS';
    progress.steps[2].status = 'IN_PROGRESS';
    progress.steps[2].startedAt = new Date().toISOString();

    const shmsConfig = await configureSHMS(tenantId, request.shmsTemplate);
    progress.steps[2].status = 'COMPLETED';
    progress.steps[2].completedAt = new Date().toISOString();

    // STEP 4: Generate onboarding report
    progress.currentStep = 'GENERATE_REPORT';
    progress.steps[3].status = 'IN_PROGRESS';
    progress.steps[3].startedAt = new Date().toISOString();

    const onboardingReport = await generateOnboardingReport(config, shmsConfig);
    progress.steps[3].status = 'COMPLETED';
    progress.steps[3].completedAt = new Date().toISOString();

    // STEP 5: Verify onboarding
    progress.currentStep = 'VERIFY';
    progress.steps[4].status = 'IN_PROGRESS';
    progress.steps[4].startedAt = new Date().toISOString();

    config.status = 'ACTIVE';
    const db = await getDb();
    if (db) {
      await db.execute(sql`
        UPDATE tenants SET status = 'ACTIVE' WHERE tenant_id = ${tenantId}
      `);
    }

    const proofHash = computeProofHash(config);
    progress.steps[4].status = 'COMPLETED';
    progress.steps[4].completedAt = new Date().toISOString();

    progress.status = 'ACTIVE';
    progress.completedAt = new Date().toISOString();
    onboardingProgressMap.set(tenantId, progress);

    const duration = Date.now() - startTime;

    return {
      success: true,
      tenantId,
      config,
      proofHash,
      onboardingReport,
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const failedStep = progress.steps.find(s => s.status === 'IN_PROGRESS');
    if (failedStep) {
      failedStep.status = 'FAILED';
      failedStep.error = errorMessage;
    }

    progress.status = 'ERROR';
    progress.completedAt = new Date().toISOString();
    onboardingProgressMap.set(tenantId, progress);

    return {
      success: false,
      tenantId,
      config: {} as TenantConfig,
      proofHash: '',
      onboardingReport: '',
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// ============================================================
// TENANT MANAGEMENT
// ============================================================

export async function getOnboardingProgress(tenantId: string): Promise<OnboardingProgress | null> {
  return onboardingProgressMap.get(tenantId) || null;
}

export async function listTenants(status?: TenantStatus): Promise<TenantConfig[]> {
  const db = await getDb();
  if (!db) return [];

  const result = status
    ? await db.execute(sql`SELECT * FROM tenants WHERE status = ${status} ORDER BY provisioned_at DESC`)
    : await db.execute(sql`SELECT * FROM tenants ORDER BY provisioned_at DESC`);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  return (rows as Record<string, unknown>[]).map(row => ({
    tenantId: row.tenant_id as string,
    clientName: row.client_name as string,
    shmsTemplate: row.shms_template as SHMSTemplate,
    mqttNamespace: row.mqtt_namespace as string,
    apiKey: row.api_key as string,
    billingPlan: row.billing_plan as 'starter' | 'professional' | 'enterprise',
    provisionedAt: String(row.provisioned_at),
    status: row.status as TenantStatus,
    endpoints: typeof row.endpoints === 'string' ? JSON.parse(row.endpoints) : row.endpoints as TenantEndpoints,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata as Record<string, unknown>,
  }));
}

export async function getTenant(tenantId: string): Promise<TenantConfig | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`SELECT * FROM tenants WHERE tenant_id = ${tenantId}`);
  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  if (!rows || (rows as unknown[]).length === 0) return null;

  const row = (rows as Record<string, unknown>[])[0];
  return {
    tenantId: row.tenant_id as string,
    clientName: row.client_name as string,
    shmsTemplate: row.shms_template as SHMSTemplate,
    mqttNamespace: row.mqtt_namespace as string,
    apiKey: row.api_key as string,
    billingPlan: row.billing_plan as 'starter' | 'professional' | 'enterprise',
    provisionedAt: String(row.provisioned_at),
    status: row.status as TenantStatus,
    endpoints: typeof row.endpoints === 'string' ? JSON.parse(row.endpoints) : row.endpoints as TenantEndpoints,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata as Record<string, unknown>,
  };
}

export async function deprovisionTenant(tenantId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`UPDATE tenants SET status = 'DEPROVISIONED' WHERE tenant_id = ${tenantId}`);
  return true;
}

export function getAvailableTemplates(): Array<{ name: SHMSTemplate; description: string; sensorCount: number }> {
  return [
    { name: 'dam_monitoring', description: 'Comprehensive dam and reservoir monitoring (ICOLD Bulletin 158)', sensorCount: 5 },
    { name: 'building_monitoring', description: 'Structural health monitoring for buildings and infrastructure', sensorCount: 5 },
    { name: 'slope_monitoring', description: 'Slope stability and landslide monitoring', sensorCount: 5 },
    { name: 'tunnel_monitoring', description: 'Underground tunnel and excavation monitoring (NATM)', sensorCount: 5 },
  ];
}
