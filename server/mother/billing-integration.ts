/**
 * billing-integration.ts — MOTHER v80.5 — Ciclo 129
 *
 * Módulo de faturamento por uso para o template SaaS multi-tenant da Intelltech.
 * Implementa usage-based billing com métricas: sensor_readings, alerts_sent, api_calls.
 *
 * Scientific basis:
 * - PCI DSS v4.0 — Payment Card Industry Data Security Standard
 * - ISO/IEC 27001:2022 A.5.14 — Information transfer
 *
 * @module billing-integration
 * @version 1.0.0
 * @cycle C129
 */

import crypto from 'crypto';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export type BillingPlan = 'starter' | 'professional' | 'enterprise';

export type UsageMetric = 'sensor_readings' | 'alerts_sent' | 'api_calls' | 'storage_gb' | 'predictions';

export interface PlanConfig {
  name: BillingPlan;
  displayName: string;
  monthlyBaseFee: number;
  includedUnits: Record<UsageMetric, number>;
  overageRates: Record<UsageMetric, number>;
  features: string[];
  maxTenants: number;
}

export interface UsageSummary {
  tenantId: string;
  period: string;
  plan: BillingPlan;
  usage: Record<UsageMetric, number>;
  includedUnits: Record<UsageMetric, number>;
  overageUnits: Record<UsageMetric, number>;
  baseFee: number;
  overageFees: Record<UsageMetric, number>;
  totalFee: number;
  currency: 'USD';
}

export interface Invoice {
  invoiceId: string;
  tenantId: string;
  period: string;
  issuedAt: string;
  dueAt: string;
  summary: UsageSummary;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  proofHash: string;
}

export interface BillingWebhookEvent {
  eventId: string;
  eventType: 'payment.succeeded' | 'payment.failed' | 'subscription.created' | 'subscription.cancelled';
  tenantId: string;
  amount?: number;
  currency?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ============================================================
// PLAN CONFIGURATIONS
// ============================================================

const PLAN_CONFIGS: Record<BillingPlan, PlanConfig> = {
  starter: {
    name: 'starter',
    displayName: 'Starter Plan',
    monthlyBaseFee: 99,
    includedUnits: { sensor_readings: 100000, alerts_sent: 1000, api_calls: 10000, storage_gb: 10, predictions: 1000 },
    overageRates: { sensor_readings: 0.0001, alerts_sent: 0.01, api_calls: 0.001, storage_gb: 0.10, predictions: 0.01 },
    features: ['Up to 5 sensors', 'Daily reports', 'Email alerts', 'Basic dashboard', '10GB storage'],
    maxTenants: 1,
  },
  professional: {
    name: 'professional',
    displayName: 'Professional Plan',
    monthlyBaseFee: 499,
    includedUnits: { sensor_readings: 1000000, alerts_sent: 10000, api_calls: 100000, storage_gb: 100, predictions: 10000 },
    overageRates: { sensor_readings: 0.00005, alerts_sent: 0.005, api_calls: 0.0005, storage_gb: 0.08, predictions: 0.005 },
    features: ['Up to 50 sensors', 'Hourly reports', 'Email + SMS + Webhook alerts', 'Advanced dashboard', '100GB storage', 'Digital twin', 'API access'],
    maxTenants: 5,
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise Plan',
    monthlyBaseFee: 1999,
    includedUnits: { sensor_readings: 10000000, alerts_sent: 100000, api_calls: 1000000, storage_gb: 1000, predictions: 100000 },
    overageRates: { sensor_readings: 0.00001, alerts_sent: 0.001, api_calls: 0.0001, storage_gb: 0.05, predictions: 0.001 },
    features: ['Unlimited sensors', 'Real-time reports', 'All alert channels', 'Custom dashboard', '1TB storage', 'Advanced digital twin', 'Full API access', 'SLA 99.9%', 'Dedicated support'],
    maxTenants: -1,
  },
};

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

export async function initializeBillingTables(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_usage (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(100) NOT NULL,
      metric VARCHAR(50) NOT NULL,
      value DECIMAL(20, 4) DEFAULT 0,
      period VARCHAR(7) NOT NULL,
      recorded_at TIMESTAMP DEFAULT NOW(),
      UNIQUE KEY unique_tenant_metric_period (tenant_id, metric, period)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id VARCHAR(100) UNIQUE NOT NULL,
      tenant_id VARCHAR(100) NOT NULL,
      period VARCHAR(7) NOT NULL,
      issued_at TIMESTAMP NOT NULL,
      due_at TIMESTAMP NOT NULL,
      summary JSON NOT NULL,
      status VARCHAR(20) DEFAULT 'DRAFT',
      proof_hash VARCHAR(64),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// ============================================================
// USAGE TRACKING
// ============================================================

export async function trackUsage(
  tenantId: string,
  metric: UsageMetric,
  value: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const period = getCurrentPeriod();
  await db.execute(sql`
    INSERT INTO billing_usage (tenant_id, metric, value, period, recorded_at)
    VALUES (${tenantId}, ${metric}, ${value}, ${period}, NOW())
    ON DUPLICATE KEY UPDATE value = value + ${value}, recorded_at = NOW()
  `);
}

export async function getUsageSummary(
  tenantId: string,
  period?: string
): Promise<UsageSummary> {
  const db = await getDb();
  const billingPeriod = period || getCurrentPeriod();

  let plan: BillingPlan = 'starter';
  if (db) {
    const tenantResult = await db.execute(sql`
      SELECT billing_plan FROM tenants WHERE tenant_id = ${tenantId}
    `);
    const rows = (tenantResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
    if ((rows as unknown[]).length > 0) {
      plan = ((rows as Record<string, unknown>[])[0]).billing_plan as BillingPlan || 'starter';
    }
  }

  const planConfig = PLAN_CONFIGS[plan];
  const usage: Record<UsageMetric, number> = {
    sensor_readings: 0, alerts_sent: 0, api_calls: 0, storage_gb: 0, predictions: 0,
  };

  if (db) {
    const usageResult = await db.execute(sql`
      SELECT metric, COALESCE(SUM(value), 0) as total
      FROM billing_usage
      WHERE tenant_id = ${tenantId} AND period = ${billingPeriod}
      GROUP BY metric
    `);
    const rows = (usageResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
    for (const row of (rows as Record<string, unknown>[])) {
      const metric = row.metric as UsageMetric;
      if (metric in usage) usage[metric] = parseFloat(String(row.total));
    }
  }

  const overageUnits: Record<UsageMetric, number> = { sensor_readings: 0, alerts_sent: 0, api_calls: 0, storage_gb: 0, predictions: 0 };
  const overageFees: Record<UsageMetric, number> = { sensor_readings: 0, alerts_sent: 0, api_calls: 0, storage_gb: 0, predictions: 0 };
  let totalOverageFee = 0;

  for (const metric of Object.keys(usage) as UsageMetric[]) {
    const included = planConfig.includedUnits[metric];
    const actual = usage[metric];
    const overage = Math.max(0, actual - included);
    overageUnits[metric] = overage;
    const fee = overage * planConfig.overageRates[metric];
    overageFees[metric] = Math.round(fee * 100) / 100;
    totalOverageFee += fee;
  }

  const totalFee = Math.round((planConfig.monthlyBaseFee + totalOverageFee) * 100) / 100;

  return {
    tenantId,
    period: billingPeriod,
    plan,
    usage,
    includedUnits: planConfig.includedUnits,
    overageUnits,
    baseFee: planConfig.monthlyBaseFee,
    overageFees,
    totalFee,
    currency: 'USD',
  };
}

// ============================================================
// INVOICE MANAGEMENT
// ============================================================

export async function generateInvoice(tenantId: string, period?: string): Promise<Invoice> {
  const db = await getDb();
  const billingPeriod = period || getPreviousPeriod();
  const summary = await getUsageSummary(tenantId, billingPeriod);

  const invoiceId = `INV-${tenantId.slice(0, 8)}-${billingPeriod.replace('-', '')}`;
  const issuedAt = new Date().toISOString();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueAt = dueDate.toISOString();
  const proofHash = computeInvoiceHash(invoiceId, summary);

  const invoice: Invoice = {
    invoiceId,
    tenantId,
    period: billingPeriod,
    issuedAt,
    dueAt,
    summary,
    status: 'ISSUED',
    proofHash,
  };

  if (db) {
    await db.execute(sql`
      INSERT INTO billing_invoices (invoice_id, tenant_id, period, issued_at, due_at, summary, status, proof_hash)
      VALUES (${invoiceId}, ${tenantId}, ${billingPeriod}, ${issuedAt}, ${dueAt}, ${JSON.stringify(summary)}, 'ISSUED', ${proofHash})
      ON DUPLICATE KEY UPDATE status = status
    `);
  }

  return invoice;
}

export async function getInvoices(tenantId: string, limit = 12): Promise<Invoice[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT * FROM billing_invoices
    WHERE tenant_id = ${tenantId}
    ORDER BY issued_at DESC
    LIMIT ${limit}
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  return (rows as Record<string, unknown>[]).map(row => ({
    invoiceId: row.invoice_id as string,
    tenantId: row.tenant_id as string,
    period: row.period as string,
    issuedAt: String(row.issued_at),
    dueAt: String(row.due_at),
    summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary as UsageSummary,
    status: row.status as Invoice['status'],
    proofHash: row.proof_hash as string,
  }));
}

// ============================================================
// WEBHOOK PROCESSING
// ============================================================

export async function processWebhook(event: BillingWebhookEvent): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: 'Database unavailable' };

  switch (event.eventType) {
    case 'payment.succeeded':
      await db.execute(sql`UPDATE billing_invoices SET status = 'PAID' WHERE tenant_id = ${event.tenantId} AND status = 'ISSUED'`);
      return { success: true, message: `Payment recorded for tenant ${event.tenantId}` };

    case 'payment.failed':
      await db.execute(sql`UPDATE billing_invoices SET status = 'OVERDUE' WHERE tenant_id = ${event.tenantId} AND status = 'ISSUED'`);
      return { success: true, message: `Payment failure recorded for tenant ${event.tenantId}` };

    case 'subscription.created':
      await db.execute(sql`UPDATE tenants SET billing_plan = ${String(event.metadata.plan || 'starter')} WHERE tenant_id = ${event.tenantId}`);
      return { success: true, message: `Subscription created for tenant ${event.tenantId}` };

    case 'subscription.cancelled':
      await db.execute(sql`UPDATE tenants SET status = 'SUSPENDED' WHERE tenant_id = ${event.tenantId}`);
      return { success: true, message: `Subscription cancelled for tenant ${event.tenantId}` };

    default:
      return { success: false, message: `Unknown event type: ${event.eventType}` };
  }
}

// ============================================================
// PLAN MANAGEMENT
// ============================================================

export function getPlanConfig(plan: BillingPlan): PlanConfig {
  return PLAN_CONFIGS[plan];
}

export function listPlans(): PlanConfig[] {
  return Object.values(PLAN_CONFIGS);
}

export async function changePlan(tenantId: string, newPlan: BillingPlan): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`UPDATE tenants SET billing_plan = ${newPlan} WHERE tenant_id = ${tenantId}`);
  return true;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousPeriod(): string {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function computeInvoiceHash(invoiceId: string, summary: UsageSummary): string {
  const data = JSON.stringify({
    invoiceId,
    tenantId: summary.tenantId,
    period: summary.period,
    totalFee: summary.totalFee,
    currency: summary.currency,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}
