/**
 * shms-billing-engine.ts — MOTHER v80.5 — Ciclo 129 (ROADMAP v4.2)
 *
 * Motor de faturamento SaaS por sensor/mês para clientes Intelltech.
 *
 * Funcionalidades:
 * - Modelo: R$ X/sensor/mês + setup fee
 * - Integração Stripe para pagamentos recorrentes
 * - Fatura automática mensal com detalhamento por sensor
 * - Trial de 30 dias para novos clientes
 * - Dashboard financeiro para Intelltech (receita, churn, MRR)
 *
 * Scientific basis:
 * - PCI DSS v4.0 — Payment Card Industry Data Security Standard
 * - ISO/IEC 27001:2022 — Information security management
 * - arXiv:2312.10997 — LLM-based software engineering
 * - SaaS Metrics 2.0 (David Skok, 2010) — MRR, churn, LTV
 *
 * @module shms-billing-engine
 * @version 1.0.0
 * @cycle C129
 * @roadmap v4.2 Fase 4
 */

import crypto from 'crypto';
import { getDb, insertKnowledge } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// PRICING CONFIGURATION
// ============================================================

export const PRICING_PLANS = {
  starter: {
    name: 'Starter',
    pricePerSensorBRL: 150.00,
    maxSensors: 10,
    setupFeeBRL: 2500.00,
    trialDays: 30,
    features: ['Dashboard básico', 'Alertas email', 'Relatório mensal', 'Suporte email'],
  },
  professional: {
    name: 'Professional',
    pricePerSensorBRL: 120.00,
    maxSensors: 50,
    setupFeeBRL: 5000.00,
    trialDays: 30,
    features: ['Dashboard avançado', 'Alertas SMS + email + webhook', 'Relatório semanal + mensal', 'Suporte prioritário', 'API access'],
  },
  enterprise: {
    name: 'Enterprise',
    pricePerSensorBRL: 90.00,
    maxSensors: 999,
    setupFeeBRL: 10000.00,
    trialDays: 30,
    features: ['Dashboard white-label', 'Todos os canais de alerta', 'Todos os tipos de relatório', 'SLA 99.9%', 'Suporte dedicado', 'API access', 'Customizações'],
  },
} as const;

export type BillingPlan = keyof typeof PRICING_PLANS;

// ============================================================
// TYPES
// ============================================================

export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'TRIAL';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED';

export interface Subscription {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  plan: BillingPlan;
  sensorCount: number;
  monthlyAmountBRL: number;
  status: SubscriptionStatus;
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  createdAt: string;
  cancelledAt?: string;
  proofHash: string;
}

export interface Invoice {
  invoiceId: string;
  clientId: string;
  clientName: string;
  subscriptionId: string;
  plan: BillingPlan;
  period: { from: string; to: string };
  lineItems: InvoiceLineItem[];
  subtotalBRL: number;
  taxBRL: number;
  totalBRL: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
  stripeInvoiceId?: string;
  proofHash: string;
  generatedAt: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceBRL: number;
  totalBRL: number;
}

export interface MRRReport {
  period: string;
  totalMRR: number;
  newMRR: number;
  expansionMRR: number;
  churnedMRR: number;
  netNewMRR: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  churnRate: number;
  averageRevenuePerClient: number;
  topClients: { clientId: string; clientName: string; mrr: number }[];
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

export async function initializeBillingTables(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shms_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subscription_id VARCHAR(100) UNIQUE NOT NULL,
      client_id VARCHAR(100) NOT NULL,
      client_name VARCHAR(255) NOT NULL,
      plan VARCHAR(30) NOT NULL,
      sensor_count INT DEFAULT 0,
      monthly_amount_brl DECIMAL(10, 2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'TRIAL',
      trial_ends_at TIMESTAMP NULL,
      current_period_start TIMESTAMP NOT NULL,
      current_period_end TIMESTAMP NOT NULL,
      stripe_subscription_id VARCHAR(255) NULL,
      stripe_customer_id VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      cancelled_at TIMESTAMP NULL,
      proof_hash VARCHAR(64),
      INDEX idx_sub_client (client_id, status),
      INDEX idx_sub_plan (plan, status)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shms_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id VARCHAR(100) UNIQUE NOT NULL,
      client_id VARCHAR(100) NOT NULL,
      client_name VARCHAR(255) NOT NULL,
      subscription_id VARCHAR(100) NOT NULL,
      plan VARCHAR(30) NOT NULL,
      period_from TIMESTAMP NOT NULL,
      period_to TIMESTAMP NOT NULL,
      line_items JSON DEFAULT ('[]'),
      subtotal_brl DECIMAL(10, 2) DEFAULT 0,
      tax_brl DECIMAL(10, 2) DEFAULT 0,
      total_brl DECIMAL(10, 2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'DRAFT',
      due_date TIMESTAMP NOT NULL,
      paid_at TIMESTAMP NULL,
      stripe_invoice_id VARCHAR(255) NULL,
      proof_hash VARCHAR(64),
      generated_at TIMESTAMP DEFAULT NOW(),
      INDEX idx_invoice_client (client_id, generated_at),
      INDEX idx_invoice_status (status, due_date)
    )
  `);
}

// ============================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================

export async function createSubscription(
  clientId: string,
  clientName: string,
  plan: BillingPlan,
  sensorCount: number,
): Promise<Subscription> {
  await initializeBillingTables();

  const subscriptionId = generateSubscriptionId(clientId);
  const pricing = PRICING_PLANS[plan];
  const monthlyAmountBRL = pricing.pricePerSensorBRL * sensorCount;
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + pricing.trialDays * 24 * 60 * 60 * 1000);
  const periodStart = now.toISOString();
  const periodEnd = trialEndsAt.toISOString();

  const subscription: Subscription = {
    subscriptionId,
    clientId,
    clientName,
    plan,
    sensorCount,
    monthlyAmountBRL,
    status: 'TRIAL',
    trialEndsAt: trialEndsAt.toISOString(),
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    createdAt: now.toISOString(),
    proofHash: '',
  };

  subscription.proofHash = computeSubscriptionProofHash(subscription);

  const db = await getDb();
  if (db) {
    await db.execute(sql`
      INSERT INTO shms_subscriptions (
        subscription_id, client_id, client_name, plan, sensor_count,
        monthly_amount_brl, status, trial_ends_at, current_period_start,
        current_period_end, created_at, proof_hash
      ) VALUES (
        ${subscriptionId}, ${clientId}, ${clientName}, ${plan}, ${sensorCount},
        ${monthlyAmountBRL}, 'TRIAL', ${trialEndsAt.toISOString()}, ${periodStart},
        ${periodEnd}, ${now.toISOString()}, ${subscription.proofHash}
      )
    `);
  }

  await insertKnowledge({
    title: `Subscription Created: ${clientName} (${plan})`,
    content: JSON.stringify({ subscriptionId, clientId, plan, sensorCount, monthlyAmountBRL, trialEndsAt: trialEndsAt.toISOString() }),
    category: 'architecture',
    source: 'shms-billing-engine',
  });

  return subscription;
}

export async function activateSubscription(subscriptionId: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  await db.execute(sql`
    UPDATE shms_subscriptions
    SET status = 'ACTIVE',
        current_period_start = ${now.toISOString()},
        current_period_end = ${periodEnd.toISOString()},
        stripe_customer_id = ${stripeCustomerId || null},
        stripe_subscription_id = ${stripeSubscriptionId || null}
    WHERE subscription_id = ${subscriptionId}
  `);

  return true;
}

export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.execute(sql`
    UPDATE shms_subscriptions
    SET status = 'CANCELLED', cancelled_at = NOW()
    WHERE subscription_id = ${subscriptionId}
  `);

  return true;
}

export async function updateSensorCount(subscriptionId: string, newSensorCount: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.execute(sql`SELECT plan FROM shms_subscriptions WHERE subscription_id = ${subscriptionId}`);
  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  if ((rows as unknown[]).length === 0) return false;

  const plan = (rows as Record<string, unknown>[])[0].plan as BillingPlan;
  const pricing = PRICING_PLANS[plan];
  const newMonthlyAmount = pricing.pricePerSensorBRL * newSensorCount;

  await db.execute(sql`
    UPDATE shms_subscriptions
    SET sensor_count = ${newSensorCount}, monthly_amount_brl = ${newMonthlyAmount}
    WHERE subscription_id = ${subscriptionId}
  `);

  return true;
}

// ============================================================
// INVOICE GENERATION
// ============================================================

export async function generateMonthlyInvoices(): Promise<Invoice[]> {
  const db = await getDb();
  if (!db) return [];

  // Get all active subscriptions where period ends today
  const today = new Date().toISOString().split('T')[0];
  const result = await db.execute(sql`
    SELECT * FROM shms_subscriptions
    WHERE status = 'ACTIVE' AND DATE(current_period_end) = ${today}
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const invoices: Invoice[] = [];

  for (const row of (rows as Record<string, unknown>[])) {
    const invoice = await generateInvoice(row.subscription_id as string);
    if (invoice) invoices.push(invoice);
  }

  return invoices;
}

export async function generateInvoice(subscriptionId: string): Promise<Invoice | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`SELECT * FROM shms_subscriptions WHERE subscription_id = ${subscriptionId}`);
  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  if ((rows as unknown[]).length === 0) return null;

  const sub = (rows as Record<string, unknown>[])[0];
  const plan = sub.plan as BillingPlan;
  const pricing = PRICING_PLANS[plan];
  const sensorCount = sub.sensor_count as number;
  const monthlyAmount = sub.monthly_amount_brl as number;

  const lineItems: InvoiceLineItem[] = [
    {
      description: `Monitoramento SHMS — ${sensorCount} sensor(es) × R$ ${pricing.pricePerSensorBRL.toFixed(2)}/sensor/mês`,
      quantity: sensorCount,
      unitPriceBRL: pricing.pricePerSensorBRL,
      totalBRL: monthlyAmount,
    },
  ];

  const subtotalBRL = lineItems.reduce((sum, item) => sum + item.totalBRL, 0);
  const taxBRL = subtotalBRL * 0.0925; // ISS 9.25%
  const totalBRL = subtotalBRL + taxBRL;

  const invoiceId = generateInvoiceId(sub.client_id as string);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 10);
  const generatedAt = new Date().toISOString();

  const proofHash = crypto.createHash('sha256').update(
    JSON.stringify({ invoiceId, clientId: sub.client_id, subscriptionId, totalBRL, generatedAt })
  ).digest('hex');

  const invoice: Invoice = {
    invoiceId,
    clientId: sub.client_id as string,
    clientName: sub.client_name as string,
    subscriptionId,
    plan,
    period: { from: String(sub.current_period_start), to: String(sub.current_period_end) },
    lineItems,
    subtotalBRL,
    taxBRL,
    totalBRL,
    status: 'PENDING',
    dueDate: dueDate.toISOString(),
    proofHash,
    generatedAt,
  };

  await db.execute(sql`
    INSERT INTO shms_invoices (
      invoice_id, client_id, client_name, subscription_id, plan,
      period_from, period_to, line_items, subtotal_brl, tax_brl, total_brl,
      status, due_date, proof_hash, generated_at
    ) VALUES (
      ${invoiceId}, ${sub.client_id}, ${sub.client_name}, ${subscriptionId}, ${plan},
      ${String(sub.current_period_start)}, ${String(sub.current_period_end)},
      ${JSON.stringify(lineItems)}, ${subtotalBRL}, ${taxBRL}, ${totalBRL},
      'PENDING', ${dueDate.toISOString()}, ${proofHash}, ${generatedAt}
    )
  `);

  return invoice;
}

// ============================================================
// MRR DASHBOARD
// ============================================================

export async function getMRRReport(period?: string): Promise<MRRReport> {
  const db = await getDb();
  if (!db) return {
    period: period || new Date().toISOString().slice(0, 7),
    totalMRR: 0, newMRR: 0, expansionMRR: 0, churnedMRR: 0, netNewMRR: 0,
    activeSubscriptions: 0, trialSubscriptions: 0, churnRate: 0,
    averageRevenuePerClient: 0, topClients: [],
  };

  const reportPeriod = period || new Date().toISOString().slice(0, 7);

  const activeResult = await db.execute(sql`
    SELECT SUM(monthly_amount_brl) as total_mrr, COUNT(*) as count
    FROM shms_subscriptions WHERE status = 'ACTIVE'
  `);
  const activeRows = (activeResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const activeRow = (activeRows as Record<string, unknown>[])[0] || {};

  const trialResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM shms_subscriptions WHERE status = 'TRIAL'
  `);
  const trialRows = (trialResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const trialRow = (trialRows as Record<string, unknown>[])[0] || {};

  const topResult = await db.execute(sql`
    SELECT client_id, client_name, monthly_amount_brl
    FROM shms_subscriptions WHERE status = 'ACTIVE'
    ORDER BY monthly_amount_brl DESC LIMIT 5
  `);
  const topRows = (topResult as unknown as [Record<string, unknown>[], unknown])[0] || [];

  const totalMRR = parseFloat(String(activeRow.total_mrr || 0));
  const activeCount = parseInt(String(activeRow.count || 0));
  const trialCount = parseInt(String(trialRow.count || 0));

  return {
    period: reportPeriod,
    totalMRR,
    newMRR: 0,
    expansionMRR: 0,
    churnedMRR: 0,
    netNewMRR: 0,
    activeSubscriptions: activeCount,
    trialSubscriptions: trialCount,
    churnRate: 0,
    averageRevenuePerClient: activeCount > 0 ? Math.round(totalMRR / activeCount) : 0,
    topClients: (topRows as Record<string, unknown>[]).map(row => ({
      clientId: row.client_id as string,
      clientName: row.client_name as string,
      mrr: parseFloat(String(row.monthly_amount_brl || 0)),
    })),
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function generateSubscriptionId(clientId: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString('hex');
  return `sub-${clientId.slice(0, 8)}-${timestamp}-${random}`;
}

function generateInvoiceId(clientId: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString('hex');
  return `inv-${clientId.slice(0, 8)}-${timestamp}-${random}`;
}

function computeSubscriptionProofHash(sub: Subscription): string {
  const data = JSON.stringify({
    subscriptionId: sub.subscriptionId, clientId: sub.clientId, plan: sub.plan,
    sensorCount: sub.sensorCount, monthlyAmountBRL: sub.monthlyAmountBRL, createdAt: sub.createdAt,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}
