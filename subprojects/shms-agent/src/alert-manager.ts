// Generated autonomously by MOTHER v80.0 — Ciclo C119
import { MotherClient } from './mother-client';
import { Alert, AlertLevel, SensorData } from './types';
import axios from 'axios';

export class AlertManager {
  private motherClient: MotherClient;
  private alertHistory: Alert[] = [];
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly MAX_HISTORY_SIZE = 100;
  private readonly POLLING_INTERVAL_MS = 30 * 1000; // 30 seconds
  private webhookUrl: string | undefined;

  constructor(motherClient: MotherClient, webhookUrl?: string) {
    this.motherClient = motherClient;
    this.webhookUrl = webhookUrl;
  }

  public startPolling(): void {
    if (this.pollingInterval) {
      console.warn('AlertManager: Polling already started.');
      return;
    }
    console.log('AlertManager: Starting alert polling...');
    this.pollingInterval = setInterval(() => this.pollAlerts(), this.POLLING_INTERVAL_MS);
  }

  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('AlertManager: Stopped alert polling.');
    } else {
      console.warn('AlertManager: Polling not active.');
    }
  }

  private async pollAlerts(): Promise<void> {
    try {
      console.log('AlertManager: Polling MOTHER for alerts...');
      const alerts = await this.motherClient.getAlerts();
      if (alerts && alerts.length > 0) {
        console.log(`AlertManager: Received ${alerts.length} alerts from MOTHER.`);
        alerts.forEach(alert => this.processAlert(alert));
      } else {
        console.log('AlertManager: No new alerts from MOTHER.');
      }
    } catch (error) {
      console.error('AlertManager: Error polling alerts from MOTHER:', error);
    }
  }

  private processAlert(alert: Alert): void {
    // Check if this alert is already in history (simple check by ID and timestamp)
    if (this.alertHistory.some(a => a.id === alert.id && a.timestamp === alert.timestamp)) {
      // console.log(`AlertManager: Alert ${alert.id} at ${alert.timestamp} already processed.`);
      return;
    }

    this.evaluateAndNotify(alert);
    this.addAlertToHistory(alert);
  }

  private evaluateAndNotify(alert: Alert): void {
    const level = this.determineAlertLevel(alert);
    const message = `[ALERT ${level}] Sensor: ${alert.sensorId}, Type: ${alert.sensorType}, Value: ${alert.value}, Threshold: ${alert.threshold}, Timestamp: ${alert.timestamp}, Message: ${alert.message}`;

    console.log(message); // Always log to console

    if (this.webhookUrl) {
      this.sendWebhookNotification(alert, level, message);
    }
  }

  // ICOLD Bulletin 158 (2014) - General guidance for alert levels
  // This is a simplified interpretation. Real-world implementation would be more complex.
  private determineAlertLevel(alert: Alert): AlertLevel {
    // Assuming 'threshold' in the alert object is the critical threshold.
    // We can define multiple thresholds (e.g., warning, action, critical)
    // For simplicity, let's assume a single threshold and derive levels.

    // Example logic:
    // If value exceeds threshold significantly, it's CRITICAL.
    // If value is close to threshold, it's ACTION.
    // If value is slightly above normal, it's WARNING.

    // This logic needs to be refined based on actual sensor types and thresholds.
    // For now, a basic comparison:
    if (alert.value === undefined || alert.threshold === undefined) {
      return AlertLevel.INFO; // Cannot determine without values
    }

    const deviation = Math.abs(alert.value - alert.threshold);
    const relativeDeviation = alert.threshold !== 0 ? deviation / Math.abs(alert.threshold) : deviation;

    // These percentages are illustrative and should be configured per sensor type
    if (relativeDeviation > 0.20) { // e.g., 20% deviation from threshold
      return AlertLevel.CRITICAL;
    } else if (relativeDeviation > 0.05) { // e.g., 5% deviation from threshold
      return AlertLevel.ACTION;
    } else if (relativeDeviation > 0) { // Any deviation above threshold
      return AlertLevel.WARNING;
    } else {
      return AlertLevel.INFO; // Below or at threshold, but still an 'alert' from MOTHER
    }
  }

  private async sendWebhookNotification(alert: Alert, level: AlertLevel, message: string): Promise<void> {
    if (!this.webhookUrl) {
      console.warn('AlertManager: Webhook URL not configured. Skipping webhook notification.');
      return;
    }

    try {
      await axios.post(this.webhookUrl, {
        alertId: alert.id,
        sensorId: alert.sensorId,
        sensorType: alert.sensorType,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: alert.timestamp,
        message: alert.message,
        alertLevel: level,
        fullMessage: message,
        source: 'shms-agent',
      });
      console.log(`AlertManager: Webhook notification sent for alert ${alert.id}.`);
    } catch (error) {
      console.error(`AlertManager: Error sending webhook notification for alert ${alert.id}:`, error);
    }
  }

  private addAlertToHistory(alert: Alert): void {
    this.alertHistory.unshift(alert); // Add to the beginning
    if (this.alertHistory.length > this.MAX_HISTORY_SIZE) {
      this.alertHistory.pop(); // Remove the oldest if history exceeds size
    }
  }

  public getAlertHistory(): Alert[] {
    return [...this.alertHistory]; // Return a copy to prevent external modification
  }
}