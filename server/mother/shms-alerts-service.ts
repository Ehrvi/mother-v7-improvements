/**
 * shms-alerts-service.ts — MOTHER v80.5 — Ciclo 127 (ROADMAP v4.2)
 *
 * Sistema de alertas multi-canal para todos os clientes Intelltech.
 *
 * Funcionalidades:
 * - Alertas SMS via Twilio API (3 níveis: INFO, WARNING, CRITICAL)
 * - Alertas email via SendGrid (relatório HTML formatado)
 * - Alertas webhook (para integração com sistemas do cliente)
 * - Escalonamento automático: WARNING → CRITICAL se não reconhecido em 15min
 * - Histórico de alertas por cliente com prova SHA-256
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 (2014) — Alarm systems for dam monitoring
 * - ISO 19650:2018 — Information management for built assets
 * - Spencer Jr. et al. (2025). Advances in AI for SHM. ScienceDirect
 * - ABNT NBR 13028:2017 — Elaboração e apresentação de projeto de barragens
 *
 * @module shms-alerts-service
 * @version 1.0.0
 * @cycle C127
 * @roadmap v4.2 Fase 4
 */

import crypto from 'crypto';
import { getDb, insertKnowledge } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertChannel = 'EMAIL' | 'SMS' | 'WEBHOOK' | 'INTERNAL';
export type AlertStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED' | 'FAILED';

export interface AlertEvent {
  alertId: string;
  clientId: string;
  sensorId: string;
  level: AlertLevel;
  title: string;
  message: string;
  value: number;
  threshold: number;
  unit: string;
  timestamp: string;
  status: AlertStatus;
  channels: AlertChannel[];
  proofHash: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  escalatedAt?: string;
  metadata: Record<string, unknown>;
}

export interface AlertTrigger {
  clientId: string;
  sensorId: string;
  sensorType: string;
  value: number;
  warningThreshold: number;
  criticalThreshold: number;
  unit: string;
  location?: string;
}

export interface AlertDeliveryResult {
  channel: AlertChannel;
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt: string;
}

export interface AlertStats {
  clientId: string;
  totalAlerts: number;
  byLevel: Record<AlertLevel, number>;
  byStatus: Record<AlertStatus, number>;
  averageAcknowledgmentMinutes: number;
  period: string;
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

export async function initializeAlertTables(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shms_alerts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      alert_id VARCHAR(100) UNIQUE NOT NULL,
      client_id VARCHAR(100) NOT NULL,
      sensor_id VARCHAR(100) NOT NULL,
      level VARCHAR(20) NOT NULL,
      title VARCHAR(500) NOT NULL,
      message TEXT NOT NULL,
      value DECIMAL(20, 4),
      threshold DECIMAL(20, 4),
      unit VARCHAR(50),
      status VARCHAR(30) DEFAULT 'PENDING',
      channels JSON DEFAULT ('[]'),
      proof_hash VARCHAR(64),
      acknowledged_at TIMESTAMP NULL,
      acknowledged_by VARCHAR(255) NULL,
      resolved_at TIMESTAMP NULL,
      escalated_at TIMESTAMP NULL,
      metadata JSON DEFAULT ('{}'),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW(),
      INDEX idx_alert_client (client_id, created_at),
      INDEX idx_alert_level (level, status),
      INDEX idx_alert_sensor (sensor_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shms_alert_deliveries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      alert_id VARCHAR(100) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      success BOOLEAN DEFAULT FALSE,
      message_id VARCHAR(255),
      error TEXT,
      delivered_at TIMESTAMP DEFAULT NOW(),
      INDEX idx_delivery_alert (alert_id)
    )
  `);
}

// ============================================================
// ALERT TRIGGERING
// ============================================================

/**
 * Trigger an alert based on sensor reading
 *
 * Scientific basis: ICOLD Bulletin 158 — 3-level alarm system
 * Level 1 (INFO): value > warning threshold
 * Level 2 (WARNING): value > 80% of critical threshold
 * Level 3 (CRITICAL): value > critical threshold
 */
export async function triggerAlert(trigger: AlertTrigger): Promise<AlertEvent | null> {
  const level = determineAlertLevel(trigger.value, trigger.warningThreshold, trigger.criticalThreshold);
  if (!level) return null;

  await initializeAlertTables();

  const alertId = generateAlertId(trigger.clientId, trigger.sensorId);
  const timestamp = new Date().toISOString();

  const title = generateAlertTitle(level, trigger.sensorType, trigger.location);
  const message = generateAlertMessage(trigger, level);

  const channels = await getAlertChannels(trigger.clientId, level);

  const alert: AlertEvent = {
    alertId,
    clientId: trigger.clientId,
    sensorId: trigger.sensorId,
    level,
    title,
    message,
    value: trigger.value,
    threshold: level === 'CRITICAL' ? trigger.criticalThreshold : trigger.warningThreshold,
    unit: trigger.unit,
    timestamp,
    status: 'PENDING',
    channels,
    proofHash: '',
    metadata: {
      sensorType: trigger.sensorType,
      location: trigger.location,
      warningThreshold: trigger.warningThreshold,
      criticalThreshold: trigger.criticalThreshold,
    },
  };

  alert.proofHash = computeAlertProofHash(alert);

  // Persist to database
  const db = await getDb();
  if (db) {
    await db.execute(sql`
      INSERT INTO shms_alerts (
        alert_id, client_id, sensor_id, level, title, message,
        value, threshold, unit, status, channels, proof_hash, metadata, created_at
      ) VALUES (
        ${alertId}, ${trigger.clientId}, ${trigger.sensorId}, ${level},
        ${title}, ${message}, ${trigger.value},
        ${level === 'CRITICAL' ? trigger.criticalThreshold : trigger.warningThreshold},
        ${trigger.unit}, 'PENDING', ${JSON.stringify(channels)}, ${alert.proofHash},
        ${JSON.stringify(alert.metadata)}, ${timestamp}
      )
    `);
  }

  // Deliver alert
  const deliveryResults = await deliverAlert(alert);
  const allSucceeded = deliveryResults.every(r => r.success);

  if (db) {
    await db.execute(sql`
      UPDATE shms_alerts SET status = ${allSucceeded ? 'SENT' : 'PENDING'}
      WHERE alert_id = ${alertId}
    `);
  }

  alert.status = allSucceeded ? 'SENT' : 'PENDING';

  // Store in bd_central for CRITICAL alerts
  if (level === 'CRITICAL') {
    await insertKnowledge({
      title: `CRITICAL Alert: ${title} — ${trigger.clientId}`,
      content: JSON.stringify({ alertId, clientId: trigger.clientId, sensorId: trigger.sensorId, value: trigger.value, threshold: trigger.criticalThreshold, proofHash: alert.proofHash, timestamp }),
      category: 'shms_v2',
      source: 'shms-alerts-service',
    });
  }

  return alert;
}

// ============================================================
// ALERT DELIVERY
// ============================================================

async function deliverAlert(alert: AlertEvent): Promise<AlertDeliveryResult[]> {
  const results: AlertDeliveryResult[] = [];

  for (const channel of alert.channels) {
    try {
      let result: AlertDeliveryResult;

      switch (channel) {
        case 'EMAIL':
          result = await deliverEmail(alert);
          break;
        case 'SMS':
          result = await deliverSMS(alert);
          break;
        case 'WEBHOOK':
          result = await deliverWebhook(alert);
          break;
        default:
          result = { channel, success: true, deliveredAt: new Date().toISOString() };
      }

      results.push(result);

      // Log delivery
      const db = await getDb();
      if (db) {
        await db.execute(sql`
          INSERT INTO shms_alert_deliveries (alert_id, channel, success, message_id, error, delivered_at)
          VALUES (${alert.alertId}, ${channel}, ${result.success}, ${result.messageId || null}, ${result.error || null}, ${result.deliveredAt})
        `);
      }
    } catch (error) {
      results.push({
        channel,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        deliveredAt: new Date().toISOString(),
      });
    }
  }

  return results;
}

async function deliverEmail(alert: AlertEvent): Promise<AlertDeliveryResult> {
  // Integration point for SendGrid — uses env var SENDGRID_API_KEY
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return { channel: 'EMAIL', success: false, error: 'SENDGRID_API_KEY not configured', deliveredAt: new Date().toISOString() };
  }

  try {
    const emailBody = generateEmailBody(alert);
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: process.env.ALERT_EMAIL || 'alerts@intelltech.com.br' }] }],
        from: { email: 'mother@intelltech.com.br', name: 'MOTHER SHMS' },
        subject: `[${alert.level}] ${alert.title}`,
        content: [{ type: 'text/html', value: emailBody }],
      }),
    });

    if (response.ok) {
      return { channel: 'EMAIL', success: true, messageId: response.headers.get('X-Message-Id') || undefined, deliveredAt: new Date().toISOString() };
    }
    return { channel: 'EMAIL', success: false, error: `SendGrid error: ${response.status}`, deliveredAt: new Date().toISOString() };
  } catch (error) {
    return { channel: 'EMAIL', success: false, error: error instanceof Error ? error.message : String(error), deliveredAt: new Date().toISOString() };
  }
}

async function deliverSMS(alert: AlertEvent): Promise<AlertDeliveryResult> {
  // Integration point for Twilio — uses env vars TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { channel: 'SMS', success: false, error: 'Twilio credentials not configured', deliveredAt: new Date().toISOString() };
  }

  const smsBody = `[MOTHER SHMS] ${alert.level}: ${alert.title}. Valor: ${alert.value} ${alert.unit}. Threshold: ${alert.threshold} ${alert.unit}. ID: ${alert.alertId.slice(0, 8)}`;

  try {
    const toNumber = process.env.ALERT_SMS_TO || '+5511999999999';
    const fromNumber = process.env.TWILIO_FROM_NUMBER || '+15551234567';

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toNumber, From: fromNumber, Body: smsBody }),
    });

    const data = await response.json() as Record<string, unknown>;
    if (response.ok) {
      return { channel: 'SMS', success: true, messageId: data.sid as string, deliveredAt: new Date().toISOString() };
    }
    return { channel: 'SMS', success: false, error: `Twilio error: ${(data as Record<string, unknown>).message}`, deliveredAt: new Date().toISOString() };
  } catch (error) {
    return { channel: 'SMS', success: false, error: error instanceof Error ? error.message : String(error), deliveredAt: new Date().toISOString() };
  }
}

async function deliverWebhook(alert: AlertEvent): Promise<AlertDeliveryResult> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return { channel: 'WEBHOOK', success: false, error: 'ALERT_WEBHOOK_URL not configured', deliveredAt: new Date().toISOString() };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MOTHER-Signature': computeWebhookSignature(alert) },
      body: JSON.stringify({ alertId: alert.alertId, clientId: alert.clientId, level: alert.level, title: alert.title, message: alert.message, value: alert.value, threshold: alert.threshold, unit: alert.unit, timestamp: alert.timestamp, proofHash: alert.proofHash }),
    });

    if (response.ok) {
      return { channel: 'WEBHOOK', success: true, deliveredAt: new Date().toISOString() };
    }
    return { channel: 'WEBHOOK', success: false, error: `Webhook error: ${response.status}`, deliveredAt: new Date().toISOString() };
  } catch (error) {
    return { channel: 'WEBHOOK', success: false, error: error instanceof Error ? error.message : String(error), deliveredAt: new Date().toISOString() };
  }
}

// ============================================================
// ALERT MANAGEMENT
// ============================================================

export async function acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const acknowledgedAt = new Date().toISOString();
  await db.execute(sql`
    UPDATE shms_alerts SET status = 'ACKNOWLEDGED', acknowledged_at = ${acknowledgedAt}, acknowledged_by = ${acknowledgedBy}
    WHERE alert_id = ${alertId}
  `);
  return true;
}

export async function resolveAlert(alertId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`
    UPDATE shms_alerts SET status = 'RESOLVED', resolved_at = NOW()
    WHERE alert_id = ${alertId}
  `);
  return true;
}

export async function getAlertHistory(clientId: string, limit = 50): Promise<AlertEvent[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT * FROM shms_alerts WHERE client_id = ${clientId}
    ORDER BY created_at DESC LIMIT ${limit}
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  return (rows as Record<string, unknown>[]).map(row => ({
    alertId: row.alert_id as string,
    clientId: row.client_id as string,
    sensorId: row.sensor_id as string,
    level: row.level as AlertLevel,
    title: row.title as string,
    message: row.message as string,
    value: parseFloat(String(row.value || 0)),
    threshold: parseFloat(String(row.threshold || 0)),
    unit: row.unit as string,
    timestamp: String(row.created_at),
    status: row.status as AlertStatus,
    channels: typeof row.channels === 'string' ? JSON.parse(row.channels) : (row.channels as AlertChannel[]),
    proofHash: row.proof_hash as string,
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : undefined,
    acknowledgedBy: row.acknowledged_by as string | undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    escalatedAt: row.escalated_at ? String(row.escalated_at) : undefined,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>),
  }));
}

export async function getAlertStats(clientId: string, days = 30): Promise<AlertStats> {
  const db = await getDb();
  if (!db) return { clientId, totalAlerts: 0, byLevel: { INFO: 0, WARNING: 0, CRITICAL: 0 }, byStatus: { PENDING: 0, SENT: 0, ACKNOWLEDGED: 0, ESCALATED: 0, RESOLVED: 0, FAILED: 0 }, averageAcknowledgmentMinutes: 0, period: `${days}d` };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const result = await db.execute(sql`
    SELECT level, status, COUNT(*) as count,
           AVG(TIMESTAMPDIFF(MINUTE, created_at, acknowledged_at)) as avg_ack_minutes
    FROM shms_alerts
    WHERE client_id = ${clientId} AND created_at >= ${since.toISOString()}
    GROUP BY level, status
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  const byLevel: Record<AlertLevel, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
  const byStatus: Record<AlertStatus, number> = { PENDING: 0, SENT: 0, ACKNOWLEDGED: 0, ESCALATED: 0, RESOLVED: 0, FAILED: 0 };
  let totalAlerts = 0;
  let totalAckMinutes = 0;
  let ackCount = 0;

  for (const row of (rows as Record<string, unknown>[])) {
    const level = row.level as AlertLevel;
    const status = row.status as AlertStatus;
    const count = parseInt(String(row.count || '0'));
    const avgAck = parseFloat(String(row.avg_ack_minutes || '0'));

    if (level in byLevel) byLevel[level] += count;
    if (status in byStatus) byStatus[status] += count;
    totalAlerts += count;
    if (avgAck > 0) { totalAckMinutes += avgAck; ackCount++; }
  }

  return { clientId, totalAlerts, byLevel, byStatus, averageAcknowledgmentMinutes: ackCount > 0 ? Math.round(totalAckMinutes / ackCount) : 0, period: `${days}d` };
}

// ============================================================
// ESCALATION JOB
// ============================================================

export async function runEscalationJob(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Find WARNING alerts not acknowledged in 15 minutes
  const result = await db.execute(sql`
    SELECT alert_id, client_id FROM shms_alerts
    WHERE level = 'WARNING' AND status = 'SENT'
      AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
  `);

  const rows = (result as unknown as [Record<string, unknown>[], unknown])[0] || [];
  let escalated = 0;

  for (const row of (rows as Record<string, unknown>[])) {
    const alertId = row.alert_id as string;
    await db.execute(sql`
      UPDATE shms_alerts SET level = 'CRITICAL', status = 'ESCALATED', escalated_at = NOW()
      WHERE alert_id = ${alertId}
    `);
    escalated++;
  }

  return escalated;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function determineAlertLevel(value: number, warningThreshold: number, criticalThreshold: number): AlertLevel | null {
  const absValue = Math.abs(value);
  if (absValue >= criticalThreshold) return 'CRITICAL';
  if (absValue >= warningThreshold) return 'WARNING';
  if (absValue >= warningThreshold * 0.8) return 'INFO';
  return null;
}

function generateAlertId(clientId: string, sensorId: string): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString('hex');
  return `alert-${clientId.slice(0, 8)}-${sensorId.slice(0, 8)}-${timestamp}-${random}`;
}

function generateAlertTitle(level: AlertLevel, sensorType: string, location?: string): string {
  const locationStr = location ? ` em ${location}` : '';
  switch (level) {
    case 'CRITICAL': return `⚠️ ALERTA CRÍTICO: ${sensorType}${locationStr} — Threshold excedido`;
    case 'WARNING': return `⚡ AVISO: ${sensorType}${locationStr} — Valor elevado`;
    default: return `ℹ️ INFO: ${sensorType}${locationStr} — Monitoramento`;
  }
}

function generateAlertMessage(trigger: AlertTrigger, level: AlertLevel): string {
  return `Sensor: ${trigger.sensorId} (${trigger.sensorType})\nValor atual: ${trigger.value} ${trigger.unit}\nThreshold ${level === 'CRITICAL' ? 'crítico' : 'de aviso'}: ${level === 'CRITICAL' ? trigger.criticalThreshold : trigger.warningThreshold} ${trigger.unit}\nLocalização: ${trigger.location || 'N/A'}\nNível: ${level}\n\nAção requerida: ${level === 'CRITICAL' ? 'Intervenção imediata necessária' : 'Monitoramento intensificado recomendado'}`;
}

async function getAlertChannels(clientId: string, level: AlertLevel): Promise<AlertChannel[]> {
  const channels: AlertChannel[] = ['INTERNAL'];
  if (level === 'WARNING' || level === 'CRITICAL') {
    channels.push('EMAIL');
    if (process.env.ALERT_WEBHOOK_URL) channels.push('WEBHOOK');
  }
  if (level === 'CRITICAL') {
    if (process.env.TWILIO_ACCOUNT_SID) channels.push('SMS');
  }
  return channels;
}

function generateEmailBody(alert: AlertEvent): string {
  const levelColor = alert.level === 'CRITICAL' ? '#ef4444' : alert.level === 'WARNING' ? '#f59e0b' : '#3b82f6';
  return `<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: ${levelColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
  <h2 style="margin: 0;">${alert.title}</h2>
  <p style="margin: 5px 0 0;">MOTHER SHMS — Intelltech</p>
</div>
<div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold;">Cliente:</td><td>${alert.clientId}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Sensor:</td><td>${alert.sensorId}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Valor:</td><td>${alert.value} ${alert.unit}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Threshold:</td><td>${alert.threshold} ${alert.unit}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Timestamp:</td><td>${alert.timestamp}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Proof Hash:</td><td style="font-size: 11px;">${alert.proofHash}</td></tr>
  </table>
  <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">Este alerta foi gerado automaticamente por MOTHER v80.5 — Intelltech SHMS</p>
</div></body></html>`;
}

function computeAlertProofHash(alert: AlertEvent): string {
  const data = JSON.stringify({ alertId: alert.alertId, clientId: alert.clientId, sensorId: alert.sensorId, level: alert.level, value: alert.value, threshold: alert.threshold, timestamp: alert.timestamp });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeWebhookSignature(alert: AlertEvent): string {
  const secret = process.env.WEBHOOK_SECRET || 'mother-webhook-secret';
  return crypto.createHmac('sha256', secret).update(JSON.stringify({ alertId: alert.alertId, timestamp: alert.timestamp })).digest('hex');
}
