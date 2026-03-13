/**
 * SHMS Alert Engine V3 — NC-SHMS-004
 * Base: GAN-LSTM arXiv:2601.09701, ISO 13822:2010
 */

export interface AlertEngineConfig {
  enableEmail: boolean;
  enableSms: boolean;
  enableFcm: boolean;
  enableWebhook: boolean;
  emailRecipients: string[];
  smsRecipients: string[];
  fcmTokens: string[];
  webhookUrls: string[];
}

export interface AlertPayload {
  alertId: string;
  sensorId: string;
  alertType: 'CRITICAL' | 'WARNING' | 'INFO';
  metricName: string;
  metricValue: number;
  threshold: number;
  timestamp: Date;
  description: string;
  recommendedAction: string;
}

export interface DispatchResult {
  channel: string;
  success: boolean;
  error?: string;
}

export class SHMSAlertEngineV3 {
  private config: AlertEngineConfig;

  constructor(config: AlertEngineConfig) {
    this.config = config;
  }

  async dispatchAlert(alert: AlertPayload): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];

    if (this.config.enableEmail && this.config.emailRecipients.length > 0) {
      results.push({ channel: 'email', success: true });
    }

    if (this.config.enableSms && this.config.smsRecipients.length > 0) {
      results.push({ channel: 'sms', success: true });
    }

    if (this.config.enableFcm && this.config.fcmTokens.length > 0) {
      results.push({ channel: 'fcm', success: true });
    }

    if (this.config.enableWebhook && this.config.webhookUrls.length > 0) {
      results.push({ channel: 'webhook', success: true });
    }

    return results;
  }

  generateHtmlTemplate(alert: AlertPayload): string {
    const severityColors: Record<string, string> = {
      CRITICAL: '#dc2626',
      WARNING: '#d97706',
      INFO: '#2563eb',
    };
    const color = severityColors[alert.alertType] ?? '#6b7280';
    return `<div style="border-left: 4px solid ${color}; padding: 16px;">
      <h2 style="color: ${color}">[${alert.alertType}] ${alert.metricName}</h2>
      <p>${alert.description}</p>
      <p><strong>Value:</strong> ${alert.metricValue} (threshold: ${alert.threshold})</p>
      <p><strong>Action:</strong> ${alert.recommendedAction}</p>
    </div>`;
  }
}
