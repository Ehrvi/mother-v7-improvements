/**
 * notification-service.ts — MOTHER v82.4 — Ciclo 194
 *
 * C194-5: ICOLD Alert Notification Service
 * Sends alerts via email (SMTP) and webhook (HTTP POST) when ICOLD YELLOW/RED
 * thresholds are breached in the SHMS sensor pipeline.
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 (2014): Emergency Action Plans — 3-level alarm system
 *   Level 1 (GREEN): Normal operation — no notification
 *   Level 2 (YELLOW): Attention — email to engineers
 *   Level 3 (RED): Emergency — email + webhook + escalation
 * - ISO/IEC 27001:2022: Information security for alert channels
 * - Google SRE Book (Beyer et al., 2016): Alerting on symptoms, not causes
 *
 * Configuration (env vars):
 *   NOTIFICATION_WEBHOOK_URL — HTTP POST endpoint for alerts (optional)
 *   NOTIFICATION_EMAIL_TO    — comma-separated email recipients (optional)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — SMTP config (optional)
 *
 * Status: ACTIVE (C194 — 2026-03-08)
 * Note: Operates in DRY-RUN mode if env vars not configured (logs only, no send)
 *
 * @module notification-service
 * @version 1.0.0
 * @cycle C194
 * @council C188 — Seção 9.4 Phase 7 S3-4
 */

// ─── Types ────────────────────────────────────────────────────────────────────

import { createLogger } from '../_core/logger';
const log = createLogger('NOTIFICATION_SERVICE');

export interface AlertNotification {
  sensorId: string;
  structureId: string;
  structureName?: string;
  alertLevel: 'YELLOW' | 'RED';
  icoldLevel: 2 | 3;
  message: string;
  value: number;
  threshold: number;
  unit?: string;
  sensorType?: string;
  timestamp: Date;
  violations: Array<{ code: string; message: string; severity: string }>;
}

export interface NotificationResult {
  sent: boolean;
  channels: ('webhook' | 'email' | 'log')[];
  errors: string[];
  dryRun: boolean;
}

// ─── Notification Stats ───────────────────────────────────────────────────────

interface NotificationStats {
  totalSent: number;
  yellowAlerts: number;
  redAlerts: number;
  webhookErrors: number;
  emailErrors: number;
  lastAlertAt: Date | null;
}

const _stats: NotificationStats = {
  totalSent: 0,
  yellowAlerts: 0,
  redAlerts: 0,
  webhookErrors: 0,
  emailErrors: 0,
  lastAlertAt: null,
};

// ─── Deduplication (prevent alert storms) ────────────────────────────────────
// Scientific basis: Google SRE Book — alert deduplication window (5 min)

const _recentAlerts = new Map<string, number>(); // key: sensorId+level → timestamp
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(sensorId: string, alertLevel: string): boolean {
  const key = `${sensorId}:${alertLevel}`;
  const lastSent = _recentAlerts.get(key);
  if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) {
    return true;
  }
  _recentAlerts.set(key, Date.now());
  return false;
}

// ─── Webhook Notification ─────────────────────────────────────────────────────

async function sendWebhook(alert: AlertNotification): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return { success: false, error: 'NOTIFICATION_WEBHOOK_URL not configured' };

  const payload = {
    source: 'MOTHER-SHMS',
    version: 'v82.4',
    alertLevel: alert.alertLevel,
    icoldLevel: alert.icoldLevel,
    sensorId: alert.sensorId,
    structureId: alert.structureId,
    structureName: alert.structureName ?? alert.structureId,
    message: alert.message,
    value: alert.value,
    threshold: alert.threshold,
    unit: alert.unit ?? '',
    sensorType: alert.sensorType ?? 'unknown',
    violations: alert.violations,
    timestamp: alert.timestamp.toISOString(),
    // ICOLD Bulletin 158 action codes
    actionRequired: alert.icoldLevel === 3 ? 'EMERGENCY_ACTION_PLAN' : 'ENGINEER_INSPECTION',
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MOTHER-Alert': alert.alertLevel,
        'X-MOTHER-Structure': alert.structureId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Email Notification (SMTP) ────────────────────────────────────────────────

async function sendEmail(alert: AlertNotification): Promise<{ success: boolean; error?: string }> {
  const emailTo = process.env.NOTIFICATION_EMAIL_TO;
  const smtpHost = process.env.SMTP_HOST;

  if (!emailTo || !smtpHost) {
    return { success: false, error: 'SMTP not configured (NOTIFICATION_EMAIL_TO or SMTP_HOST missing)' };
  }

  // Build email body (plain text — ICOLD Bulletin 158 format)
  const levelEmoji = alert.icoldLevel === 3 ? '🔴 EMERGENCY' : '🟡 ATTENTION';
  const subject = `[MOTHER SHMS] ${levelEmoji} — ${alert.structureName ?? alert.structureId} — ${alert.sensorId}`;
  const body = [
    `MOTHER SHMS Alert Notification`,
    `================================`,
    ``,
    `Alert Level: ICOLD Level ${alert.icoldLevel} (${alert.alertLevel})`,
    `Structure: ${alert.structureName ?? alert.structureId} (${alert.structureId})`,
    `Sensor: ${alert.sensorId} (${alert.sensorType ?? 'unknown'})`,
    ``,
    `Measured Value: ${alert.value} ${alert.unit ?? ''}`,
    `Threshold: ${alert.threshold} ${alert.unit ?? ''}`,
    ``,
    `Message: ${alert.message}`,
    ``,
    `Violations:`,
    ...alert.violations.map(v => `  - [${v.severity.toUpperCase()}] ${v.code}: ${v.message}`),
    ``,
    `Timestamp: ${alert.timestamp.toISOString()}`,
    ``,
    `Action Required: ${alert.icoldLevel === 3 ? 'ACTIVATE EMERGENCY ACTION PLAN (ICOLD Bulletin 158 Level 3)' : 'Schedule engineer inspection within 24h (ICOLD Bulletin 158 Level 2)'}`,
    ``,
    `---`,
    `MOTHER v82.4 | Ciclo 194 | SHMS Geotechnical Monitoring`,
    `Scientific basis: ICOLD Bulletin 158 (2014) — 3-level alarm system`,
  ].join('\n');

  // Use nodemailer if available, otherwise log
  try {
    // Dynamic import to avoid hard dependency — nodemailer is optional
    const nodemailer = await import('nodemailer' as string).catch(() => null) as any;
    if (!nodemailer) {
      log.warn('[NotificationService] nodemailer not installed — email logged only');
      log.info(`[NotificationService] EMAIL (dry-run):\nTo: ${emailTo}\nSubject: ${subject}\n${body}`);
      return { success: false, error: 'nodemailer not installed' };
    }

    const transporter = (nodemailer.default ?? nodemailer).createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ?? '',
      } : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER ?? `mother-shms@${smtpHost}`,
      to: emailTo,
      subject,
      text: body,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Main Notification Function ───────────────────────────────────────────────

/**
 * Send ICOLD alert notification via all configured channels.
 * Deduplicates alerts within a 5-minute window to prevent alert storms.
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 (2014): Emergency Action Plans
 * - Google SRE Book (Beyer et al., 2016): Alert deduplication
 */
export async function sendAlertNotification(alert: AlertNotification): Promise<NotificationResult> {
  const result: NotificationResult = {
    sent: false,
    channels: [],
    errors: [],
    dryRun: false,
  };

  // Only notify for YELLOW (Level 2) and RED (Level 3)
  if (alert.icoldLevel < 2) {
    return result;
  }

  // Deduplication check
  if (isDuplicate(alert.sensorId, alert.alertLevel)) {
    console.debug(`[NotificationService] Deduplicated alert — sensor=${alert.sensorId} level=${alert.alertLevel}`);
    return result;
  }

  const hasWebhook = !!process.env.NOTIFICATION_WEBHOOK_URL;
  const hasEmail = !!(process.env.NOTIFICATION_EMAIL_TO && process.env.SMTP_HOST);
  const isDryRun = !hasWebhook && !hasEmail;

  if (isDryRun) {
    result.dryRun = true;
    // Log-only mode (no channels configured)
    const levelEmoji = alert.icoldLevel === 3 ? '🔴' : '🟡';
    log.warn(
      `[NotificationService] ${levelEmoji} ICOLD Level ${alert.icoldLevel} (${alert.alertLevel}) — ` +
      `sensor=${alert.sensorId} structure=${alert.structureId} value=${alert.value} threshold=${alert.threshold} — ` +
      `${alert.message} [DRY-RUN: configure NOTIFICATION_WEBHOOK_URL or SMTP_HOST to enable real notifications]`
    );
    result.channels.push('log');
    result.sent = true;
  } else {
    // Webhook
    if (hasWebhook) {
      const webhookResult = await sendWebhook(alert);
      if (webhookResult.success) {
        result.channels.push('webhook');
      } else {
        result.errors.push(`webhook: ${webhookResult.error}`);
        _stats.webhookErrors++;
      }
    }

    // Email
    if (hasEmail) {
      const emailResult = await sendEmail(alert);
      if (emailResult.success) {
        result.channels.push('email');
      } else {
        result.errors.push(`email: ${emailResult.error}`);
        _stats.emailErrors++;
      }
    }

    result.sent = result.channels.length > 0;
  }

  // Update stats
  if (result.sent) {
    _stats.totalSent++;
    _stats.lastAlertAt = alert.timestamp;
    if (alert.alertLevel === 'YELLOW') _stats.yellowAlerts++;
    if (alert.alertLevel === 'RED') _stats.redAlerts++;
  }

  return result;
}

/**
 * Get notification service statistics.
 */
export function getNotificationStats(): NotificationStats & {
  webhookConfigured: boolean;
  emailConfigured: boolean;
  dedupWindowMs: number;
} {
  return {
    ..._stats,
    webhookConfigured: !!process.env.NOTIFICATION_WEBHOOK_URL,
    emailConfigured: !!(process.env.NOTIFICATION_EMAIL_TO && process.env.SMTP_HOST),
    dedupWindowMs: DEDUP_WINDOW_MS,
  };
}
