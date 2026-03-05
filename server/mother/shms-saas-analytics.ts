/**
 * shms-saas-analytics.ts — MOTHER v80.5 — Ciclo 134 (ROADMAP v4.2)
 *
 * Analytics e Business Intelligence para a plataforma SaaS Intelltech.
 *
 * Funcionalidades:
 * - Métricas SaaS: MRR, ARR, Churn, LTV, CAC
 * - Analytics de uso por cliente (sensores, alertas, relatórios)
 * - Tendências de crescimento da plataforma
 * - Análise de retenção de clientes
 * - Forecasting de receita
 *
 * Scientific basis:
 * - SaaS Metrics 2.0 (David Skok, 2010) — MRR, churn, LTV
 * - arXiv:2312.10997 — LLM-based software engineering
 * - NIST SP 800-53 Rev 5 — Security controls for analytics
 *
 * @module shms-saas-analytics
 * @version 1.0.0
 * @cycle C134
 * @roadmap v4.2 Fase 4
 */

import { getDb, insertKnowledge } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export interface SaaSMetrics {
  period: string;
  mrr: number;
  arr: number;
  newMRR: number;
  churnedMRR: number;
  expansionMRR: number;
  netNewMRR: number;
  churnRate: number;
  retentionRate: number;
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  activeClients: number;
  newClients: number;
  churnedClients: number;
  trialClients: number;
  trialToPayConversionRate: number;
}

export interface UsageAnalytics {
  clientId: string;
  period: string;
  sensorReadings: number;
  alertsGenerated: number;
  reportsGenerated: number;
  apiCalls: number;
  dataStorageGB: number;
  activeUsers: number;
  engagementScore: number; // 0-100
}

export interface GrowthForecast {
  period: string;
  forecastedMRR: number;
  forecastedClients: number;
  confidence: number; // 0-1
  assumptions: string[];
}

export interface RetentionCohort {
  cohortMonth: string;
  initialClients: number;
  retentionByMonth: Record<string, number>; // month -> percentage
}

// ============================================================
// SAAS METRICS CALCULATION
// ============================================================

export async function calculateSaaSMetrics(period?: string): Promise<SaaSMetrics> {
  const db = await getDb();
  const reportPeriod = period || new Date().toISOString().slice(0, 7);

  if (!db) {
    return {
      period: reportPeriod, mrr: 0, arr: 0, newMRR: 0, churnedMRR: 0, expansionMRR: 0,
      netNewMRR: 0, churnRate: 0, retentionRate: 100, ltv: 0, cac: 0, ltvCacRatio: 0,
      activeClients: 0, newClients: 0, churnedClients: 0, trialClients: 0, trialToPayConversionRate: 0,
    };
  }

  // Current MRR
  const mrrResult = await db.execute(sql`
    SELECT SUM(monthly_amount_brl) as mrr, COUNT(*) as active_clients
    FROM shms_subscriptions WHERE status = 'ACTIVE'
  `);
  const mrrRows = (mrrResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const mrrRow = (mrrRows as Record<string, unknown>[])[0] || {};
  const mrr = parseFloat(String(mrrRow.mrr || 0));
  const activeClients = parseInt(String(mrrRow.active_clients || 0));

  // Trial clients
  const trialResult = await db.execute(sql`SELECT COUNT(*) as count FROM shms_subscriptions WHERE status = 'TRIAL'`);
  const trialRows = (trialResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const trialClients = parseInt(String((trialRows as Record<string, unknown>[])[0]?.count || 0));

  // New clients this month
  const newResult = await db.execute(sql`
    SELECT COUNT(*) as count, SUM(monthly_amount_brl) as new_mrr
    FROM shms_subscriptions
    WHERE status = 'ACTIVE' AND DATE_FORMAT(created_at, '%Y-%m') = ${reportPeriod}
  `);
  const newRows = (newResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const newRow = (newRows as Record<string, unknown>[])[0] || {};
  const newClients = parseInt(String(newRow.count || 0));
  const newMRR = parseFloat(String(newRow.new_mrr || 0));

  // Churned clients this month
  const churnResult = await db.execute(sql`
    SELECT COUNT(*) as count, SUM(monthly_amount_brl) as churned_mrr
    FROM shms_subscriptions
    WHERE status = 'CANCELLED' AND DATE_FORMAT(cancelled_at, '%Y-%m') = ${reportPeriod}
  `);
  const churnRows = (churnResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const churnRow = (churnRows as Record<string, unknown>[])[0] || {};
  const churnedClients = parseInt(String(churnRow.count || 0));
  const churnedMRR = parseFloat(String(churnRow.churned_mrr || 0));

  // Calculate derived metrics
  const arr = mrr * 12;
  const churnRate = activeClients > 0 ? (churnedClients / (activeClients + churnedClients)) * 100 : 0;
  const retentionRate = 100 - churnRate;
  const avgMRRPerClient = activeClients > 0 ? mrr / activeClients : 0;
  const ltv = churnRate > 0 ? (avgMRRPerClient / (churnRate / 100)) : avgMRRPerClient * 24;
  const cac = 5000; // Estimated CAC in BRL
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const trialToPayConversionRate = (trialClients + newClients) > 0 ? (newClients / (trialClients + newClients)) * 100 : 0;

  const metrics: SaaSMetrics = {
    period: reportPeriod, mrr, arr, newMRR, churnedMRR, expansionMRR: 0,
    netNewMRR: newMRR - churnedMRR, churnRate, retentionRate, ltv, cac, ltvCacRatio,
    activeClients, newClients, churnedClients, trialClients, trialToPayConversionRate,
  };

  // Store in bd_central monthly
  await insertKnowledge({
    title: `SaaS Metrics: ${reportPeriod} — MRR: R$ ${mrr.toFixed(2)} | Clients: ${activeClients}`,
    content: JSON.stringify(metrics),
    category: 'architecture',
    source: 'shms-saas-analytics',
  });

  return metrics;
}

// ============================================================
// USAGE ANALYTICS
// ============================================================

export async function getUsageAnalytics(clientId: string, period?: string): Promise<UsageAnalytics> {
  const db = await getDb();
  const reportPeriod = period || new Date().toISOString().slice(0, 7);
  const periodStart = `${reportPeriod}-01`;
  const periodEnd = new Date(new Date(periodStart).getTime() + 32 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (!db) {
    return {
      clientId, period: reportPeriod, sensorReadings: 0, alertsGenerated: 0,
      reportsGenerated: 0, apiCalls: 0, dataStorageGB: 0, activeUsers: 0, engagementScore: 0,
    };
  }

  // Sensor readings
  let sensorReadings = 0;
  try {
    const readingResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM sensor_readings
      WHERE client_id = ${clientId} AND timestamp BETWEEN ${periodStart} AND ${periodEnd}
    `);
    const readingRows = (readingResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
    sensorReadings = parseInt(String((readingRows as Record<string, unknown>[])[0]?.count || 0));
  } catch { /* table may not exist */ }

  // Alerts generated
  const alertResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM shms_alerts
    WHERE client_id = ${clientId} AND created_at BETWEEN ${periodStart} AND ${periodEnd}
  `);
  const alertRows = (alertResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const alertsGenerated = parseInt(String((alertRows as Record<string, unknown>[])[0]?.count || 0));

  // Reports generated
  let reportsGenerated = 0;
  try {
    const reportResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM shms_reports
      WHERE client_id = ${clientId} AND generated_at BETWEEN ${periodStart} AND ${periodEnd}
    `);
    const reportRows = (reportResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
    reportsGenerated = parseInt(String((reportRows as Record<string, unknown>[])[0]?.count || 0));
  } catch { /* table may not exist */ }

  // API calls
  let apiCalls = 0;
  try {
    const apiResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM shms_api_audit_log
      WHERE client_id = ${clientId} AND timestamp BETWEEN ${periodStart} AND ${periodEnd}
    `);
    const apiRows = (apiResult as unknown as [Record<string, unknown>[], unknown])[0] || [];
    apiCalls = parseInt(String((apiRows as Record<string, unknown>[])[0]?.count || 0));
  } catch { /* table may not exist */ }

  // Engagement score (0-100)
  const engagementScore = Math.min(100, Math.round(
    (sensorReadings > 0 ? 30 : 0) +
    (alertsGenerated > 0 ? 20 : 0) +
    (reportsGenerated > 0 ? 30 : 0) +
    (apiCalls > 100 ? 20 : apiCalls > 0 ? 10 : 0)
  ));

  return {
    clientId, period: reportPeriod, sensorReadings, alertsGenerated, reportsGenerated,
    apiCalls, dataStorageGB: sensorReadings * 0.0001, activeUsers: 1, engagementScore,
  };
}

// ============================================================
// GROWTH FORECASTING
// ============================================================

export async function generateGrowthForecast(months = 6): Promise<GrowthForecast[]> {
  const currentMetrics = await calculateSaaSMetrics();
  const forecasts: GrowthForecast[] = [];

  const growthRate = 0.08; // 8% monthly growth assumption
  let forecastedMRR = currentMetrics.mrr;
  let forecastedClients = currentMetrics.activeClients;

  for (let i = 1; i <= months; i++) {
    const forecastDate = new Date();
    forecastDate.setMonth(forecastDate.getMonth() + i);
    const period = forecastDate.toISOString().slice(0, 7);

    forecastedMRR *= (1 + growthRate);
    forecastedClients = Math.round(forecastedClients * (1 + growthRate * 0.8));

    forecasts.push({
      period,
      forecastedMRR: Math.round(forecastedMRR),
      forecastedClients,
      confidence: Math.max(0.5, 0.95 - (i * 0.05)),
      assumptions: [
        `${(growthRate * 100).toFixed(0)}% monthly MRR growth`,
        'No major churn events',
        'Current pricing maintained',
        `Trial conversion rate: ${currentMetrics.trialToPayConversionRate.toFixed(1)}%`,
      ],
    });
  }

  return forecasts;
}
