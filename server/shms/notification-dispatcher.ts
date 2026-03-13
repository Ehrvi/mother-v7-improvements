/**
 * SHMS Notification Dispatcher — server/shms/notification-dispatcher.ts
 * MOTHER v7 | Structural Health Monitoring System
 *
 * Scientific basis / standards:
 * - GISTM (2020) Section 10: Emergency notification requirements for tailings dam monitoring
 * - ISO 13822 (2010): Procedures for assessment of existing structures — alerting obligations
 *
 * Channels:
 *   webhook : POST with exponential backoff retry (2s, 4s, 8s), 5s timeout
 *   email   : HTML template via SendGrid API (SENDGRID_API_KEY)
 *   slack   : Block Kit message with severity colour and Acknowledge button
 *   teams   : Adaptive Card with detail sections
 *
 * If API keys are absent the channel logs a warning but does not throw.
 */

import { createLogger } from '../_core/logger.js';

const logger = createLogger('notification-dispatcher');

// ============================================================
// Public Interfaces
// ============================================================

export type AlertSeverityLevel = 'WATCH' | 'WARNING' | 'ALERT' | 'CRITICAL';

export interface NotificationPayload {
  alertId: string;
  structureId: string;
  severity: AlertSeverityLevel;
  title: string;
  description: string;
  sensorId?: string;
  value?: number;
  threshold?: number;
  timestamp: Date;
  dashboardUrl?: string;
}

export interface NotificationResult {
  channelType: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  sentAt: Date;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface EmailConfig {
  to: string[];
  from: string;
  replyTo?: string;
}

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
}

export interface TeamsConfig {
  webhookUrl: string;
}

export interface NotificationChannel {
  type: 'webhook' | 'email' | 'slack' | 'teams';
  config: WebhookConfig | EmailConfig | SlackConfig | TeamsConfig;
  minSeverity: AlertSeverityLevel;
}

// ============================================================
// Severity helpers
// ============================================================

const SEVERITY_ORDER: Record<AlertSeverityLevel, number> = {
  WATCH: 0, WARNING: 1, ALERT: 2, CRITICAL: 3,
};

const SEVERITY_COLOR: Record<AlertSeverityLevel, string> = {
  WATCH: '#F5A623',
  WARNING: '#E07C00',
  ALERT: '#D0021B',
  CRITICAL: '#7B0000',
};

const SEVERITY_HEX: Record<AlertSeverityLevel, number> = {
  WATCH:    0xF5A623,
  WARNING:  0xE07C00,
  ALERT:    0xD0021B,
  CRITICAL: 0x7B0000,
};

function meetsMinSeverity(payload: NotificationPayload, minSeverity: AlertSeverityLevel): boolean {
  return SEVERITY_ORDER[payload.severity] >= SEVERITY_ORDER[minSeverity];
}

// ============================================================
// Exponential backoff retry
// ============================================================

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error = new Error('Unknown fetch error');
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;   // 2s, 4s, 8s
      await new Promise(res => setTimeout(res, delay));
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timeout);
        return response;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Fetch attempt ${attempt + 1} failed`, { url, error: lastError.message });
    }
  }
  throw lastError;
}

// ============================================================
// Channel: Webhook
// ============================================================

async function sendWebhook(
  payload: NotificationPayload,
  config: WebhookConfig
): Promise<NotificationResult> {
  const body = JSON.stringify({
    alertId: payload.alertId,
    structureId: payload.structureId,
    severity: payload.severity,
    title: payload.title,
    description: payload.description,
    sensorId: payload.sensorId,
    value: payload.value,
    threshold: payload.threshold,
    timestamp: payload.timestamp.toISOString(),
    dashboardUrl: payload.dashboardUrl,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };
  if (config.secret) {
    headers['X-SHMS-Secret'] = config.secret;
  }

  try {
    const response = await fetchWithRetry(config.url, { method: 'POST', headers, body });
    if (!response.ok) {
      return { channelType: 'webhook', success: false, statusCode: response.status, sentAt: new Date() };
    }
    return { channelType: 'webhook', success: true, statusCode: response.status, sentAt: new Date() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { channelType: 'webhook', success: false, error: msg, sentAt: new Date() };
  }
}

// ============================================================
// Channel: Email (SendGrid)
// ============================================================

function buildEmailHtml(payload: NotificationPayload): string {
  const color = SEVERITY_COLOR[payload.severity];
  const ts = payload.timestamp.toLocaleString('en-US', { timeZoneName: 'short' });
  const sensorRow = payload.sensorId
    ? `<tr><td style="padding:4px 8px;font-weight:bold">Sensor</td><td style="padding:4px 8px">${payload.sensorId}</td></tr>`
    : '';
  const valueRow = payload.value !== undefined
    ? `<tr><td style="padding:4px 8px;font-weight:bold">Value</td><td style="padding:4px 8px">${payload.value}${payload.threshold !== undefined ? ` (threshold: ${payload.threshold})` : ''}</td></tr>`
    : '';
  const dashBtn = payload.dashboardUrl
    ? `<p><a href="${payload.dashboardUrl}" style="background:${color};color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Open Dashboard</a></p>`
    : '';
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:auto">
<div style="background:${color};color:#fff;padding:16px;border-radius:4px 4px 0 0">
  <h2 style="margin:0">[${payload.severity}] ${payload.title}</h2>
</div>
<div style="border:1px solid #ddd;padding:16px;border-radius:0 0 4px 4px">
  <p>${payload.description}</p>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:4px 8px;font-weight:bold">Structure</td><td style="padding:4px 8px">${payload.structureId}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold">Alert ID</td><td style="padding:4px 8px">${payload.alertId}</td></tr>
    <tr><td style="padding:4px 8px;font-weight:bold">Time</td><td style="padding:4px 8px">${ts}</td></tr>
    ${sensorRow}${valueRow}
  </table>
  ${dashBtn}
</div></body></html>`;
}

async function sendEmail(
  payload: NotificationPayload,
  config: EmailConfig
): Promise<NotificationResult> {
  const apiKey = process.env['SENDGRID_API_KEY'];
  if (!apiKey) {
    logger.warn('SENDGRID_API_KEY not configured — email notification skipped', { alertId: payload.alertId });
    return { channelType: 'email', success: false, error: 'SENDGRID_API_KEY not set', sentAt: new Date() };
  }

  const body = JSON.stringify({
    personalizations: [{ to: config.to.map(e => ({ email: e })) }],
    from: { email: config.from },
    reply_to: config.replyTo ? { email: config.replyTo } : undefined,
    subject: `[SHMS][${payload.severity}] ${payload.title}`,
    content: [{ type: 'text/html', value: buildEmailHtml(payload) }],
  });

  try {
    const response = await fetchWithRetry('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });
    const success = response.status >= 200 && response.status < 300;
    return { channelType: 'email', success, statusCode: response.status, sentAt: new Date() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { channelType: 'email', success: false, error: msg, sentAt: new Date() };
  }
}

// ============================================================
// Channel: Slack (Block Kit)
// ============================================================

function buildSlackBlocks(payload: NotificationPayload): object[] {
  const color = SEVERITY_COLOR[payload.severity];
  const fields: object[] = [
    { type: 'mrkdwn', text: `*Structure:*\n${payload.structureId}` },
    { type: 'mrkdwn', text: `*Alert ID:*\n${payload.alertId}` },
    { type: 'mrkdwn', text: `*Time:*\n${payload.timestamp.toISOString()}` },
    { type: 'mrkdwn', text: `*Severity:*\n${payload.severity}` },
  ];
  if (payload.sensorId) {
    fields.push({ type: 'mrkdwn', text: `*Sensor:*\n${payload.sensorId}` });
  }
  if (payload.value !== undefined) {
    fields.push({ type: 'mrkdwn', text: `*Value:*\n${payload.value}${payload.threshold !== undefined ? ` / ${payload.threshold}` : ''}` });
  }

  const blocks: object[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*[${payload.severity}] ${payload.title}*\n${payload.description}` },
    },
    { type: 'section', fields },
  ];

  if (payload.dashboardUrl) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Acknowledge' },
        style: payload.severity === 'CRITICAL' || payload.severity === 'ALERT' ? 'danger' : 'primary',
        url: payload.dashboardUrl,
        action_id: `ack_${payload.alertId}`,
      }],
    });
  }
  return [{ color, blocks }];
}

async function sendSlack(
  payload: NotificationPayload,
  config: SlackConfig
): Promise<NotificationResult> {
  const body = JSON.stringify({
    text: `[${payload.severity}] ${payload.title}`,
    attachments: buildSlackBlocks(payload),
    channel: config.channel,
  });

  try {
    const response = await fetchWithRetry(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const success = response.ok;
    return { channelType: 'slack', success, statusCode: response.status, sentAt: new Date() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { channelType: 'slack', success: false, error: msg, sentAt: new Date() };
  }
}

// ============================================================
// Channel: Microsoft Teams (Adaptive Card)
// ============================================================

function buildTeamsCard(payload: NotificationPayload): object {
  const color = SEVERITY_COLOR[payload.severity].replace('#', '');
  const facts: object[] = [
    { title: 'Structure ID', value: payload.structureId },
    { title: 'Alert ID', value: payload.alertId },
    { title: 'Severity', value: payload.severity },
    { title: 'Time', value: payload.timestamp.toISOString() },
  ];
  if (payload.sensorId) facts.push({ title: 'Sensor', value: payload.sensorId });
  if (payload.value !== undefined) {
    facts.push({ title: 'Value', value: String(payload.value) });
  }
  if (payload.threshold !== undefined) {
    facts.push({ title: 'Threshold', value: String(payload.threshold) });
  }

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: payload.severity === 'CRITICAL' ? 'Attention' : 'Warning',
            text: `[${payload.severity}] ${payload.title}`,
          },
          { type: 'TextBlock', text: payload.description, wrap: true },
          { type: 'FactSet', facts },
        ],
        actions: payload.dashboardUrl
          ? [{ type: 'Action.OpenUrl', title: 'Open Dashboard', url: payload.dashboardUrl }]
          : [],
        msteams: { width: 'Full', themeColor: color },
      },
    }],
  };
}

async function sendTeams(
  payload: NotificationPayload,
  config: TeamsConfig
): Promise<NotificationResult> {
  const body = JSON.stringify(buildTeamsCard(payload));
  try {
    const response = await fetchWithRetry(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return { channelType: 'teams', success: response.ok, statusCode: response.status, sentAt: new Date() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { channelType: 'teams', success: false, error: msg, sentAt: new Date() };
  }
}

// ============================================================
// Public Class: NotificationDispatcher
// ============================================================

export class NotificationDispatcher {
  /**
   * Dispatch a notification to all channels that meet the minimum severity.
   * Channels are contacted in parallel; individual failures do not abort others.
   */
  async dispatch(
    payload: NotificationPayload,
    channels: NotificationChannel[]
  ): Promise<NotificationResult[]> {
    const eligible = channels.filter(ch => meetsMinSeverity(payload, ch.minSeverity));

    if (eligible.length === 0) {
      logger.debug('No eligible channels for severity', { severity: payload.severity });
      return [];
    }

    const promises = eligible.map(ch => {
      switch (ch.type) {
        case 'webhook': return sendWebhook(payload, ch.config as WebhookConfig);
        case 'email':   return sendEmail(payload, ch.config as EmailConfig);
        case 'slack':   return sendSlack(payload, ch.config as SlackConfig);
        case 'teams':   return sendTeams(payload, ch.config as TeamsConfig);
      }
    });

    const results = await Promise.all(promises);

    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      logger.warn('Some notifications failed', {
        alertId: payload.alertId,
        failed: failed.map(r => ({ channel: r.channelType, error: r.error })),
      });
    } else {
      logger.info('All notifications dispatched', { alertId: payload.alertId, channels: results.length });
    }

    return results;
  }
}

/** Singleton instance for convenience. */
export const notificationDispatcher = new NotificationDispatcher();
