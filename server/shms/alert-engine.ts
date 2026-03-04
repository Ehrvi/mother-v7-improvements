/**
 * SHMS Alert Engine — server/shms/alert-engine.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * Scientific basis:
 * - GISTM 2020 Section 8: Alert Level Framework for tailings dams
 * - ANCOLD Guidelines on Tailings Dams (2012): Emergency Action Plan
 * - ICOLD Bulletin 158 (2011): Tailings Dam Safety
 * - ABNT NBR 13028:2017: Barragens de rejeitos — Requisitos para elaboração de projeto
 *
 * Alert Level Framework (GISTM 2020):
 *   Level 1 (Normal):    All parameters within normal range
 *   Level 2 (Watch):     Parameters approaching threshold — increased monitoring
 *   Level 3 (Warning):   Parameters at threshold — prepare for action
 *   Level 4 (Alert):     Parameters exceeded — immediate action required
 *   Level 5 (Emergency): Imminent failure — Emergency Action Plan activated
 */

import type { AnomalyResult, AlertSeverity } from './anomaly-detector';

// ============================================================
// Types
// ============================================================

export interface Alert {
  id: string;
  sensorId: string;
  severity: AlertSeverity;
  timestamp: Date;
  value: number;
  unit: string;
  message: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  details: AnomalyResult['details'];
  actions: string[];       // Recommended actions per GISTM 2020
  escalationLevel: number; // 1-5 (GISTM levels)
}

export interface AlertSummary {
  totalActive: number;
  bySeverity: Record<AlertSeverity, number>;
  criticalSensors: string[];
  lastUpdated: Date;
  systemStatus: 'operational' | 'watch' | 'warning' | 'alert' | 'emergency';
}

// ============================================================
// GISTM Action Recommendations
// Reference: GISTM 2020 Table 8.1 — Trigger Action Response Plan
// ============================================================

const GISTM_ACTIONS: Record<AlertSeverity, string[]> = {
  normal: [
    'Continue routine monitoring per inspection schedule',
    'Log reading in SHMS database',
  ],
  watch: [
    'Increase monitoring frequency (2x normal)',
    'Notify dam safety engineer',
    'Review trend data for last 30 days',
    'Inspect sensor for malfunction',
  ],
  warning: [
    'Activate Trigger Action Response Plan (TARP) Level 2',
    'Notify dam safety engineer and site manager immediately',
    'Increase monitoring to continuous (real-time)',
    'Inspect dam face and instrumentation',
    'Review piezometric levels and stability calculations',
    'Prepare for potential evacuation of downstream area',
  ],
  alert: [
    'Activate TARP Level 3 — Emergency Response',
    'Notify dam safety engineer, site manager, and regulators',
    'Initiate Emergency Action Plan (EAP)',
    'Evacuate downstream community if required',
    'Deploy emergency response team',
    'Contact local emergency services',
    'Cease tailings deposition immediately',
  ],
  emergency: [
    'ACTIVATE EMERGENCY ACTION PLAN — LEVEL 5',
    'Immediate evacuation of all downstream areas',
    'Notify regulatory authorities, emergency services, and community',
    'Deploy all emergency response resources',
    'Contact national dam safety authority',
    'Initiate dam failure consequence management',
    'Document all actions with timestamps',
  ],
};

const SEVERITY_TO_LEVEL: Record<AlertSeverity, number> = {
  normal: 1,
  watch: 2,
  warning: 3,
  alert: 4,
  emergency: 5,
};

// ============================================================
// Alert Engine
// ============================================================

export class SHMSAlertEngine {
  private alerts: Map<string, Alert>;
  private alertHistory: Alert[];
  private readonly maxHistorySize: number;
  private notificationCallbacks: Array<(alert: Alert) => void>;

  constructor(maxHistorySize: number = 1000) {
    this.alerts = new Map();
    this.alertHistory = [];
    this.maxHistorySize = maxHistorySize;
    this.notificationCallbacks = [];
  }

  /**
   * Register a notification callback (e.g., webhook, email, SMS).
   */
  onAlert(callback: (alert: Alert) => void): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Process an anomaly result and create/update alerts.
   * Scientific basis: GISTM 2020 Section 8 — Alert Level Framework
   */
  processAnomaly(anomaly: AnomalyResult): Alert | null {
    if (!anomaly.isAnomaly && anomaly.severity === 'normal') {
      // Resolve existing alert if sensor returns to normal
      const existingKey = anomaly.sensorId;
      if (this.alerts.has(existingKey)) {
        const existing = this.alerts.get(existingKey)!;
        existing.resolvedAt = new Date();
        this.alertHistory.push({ ...existing });
        this.alerts.delete(existingKey);
        console.log(`[SHMS-Alert] RESOLVED: ${anomaly.sensorId} returned to normal`);
      }
      return null;
    }

    const alertId = `ALERT-${anomaly.sensorId}-${Date.now()}`;
    const alert: Alert = {
      id: alertId,
      sensorId: anomaly.sensorId,
      severity: anomaly.severity,
      timestamp: anomaly.timestamp,
      value: anomaly.value,
      unit: anomaly.unit,
      message: anomaly.message,
      acknowledged: false,
      details: anomaly.details,
      actions: GISTM_ACTIONS[anomaly.severity],
      escalationLevel: SEVERITY_TO_LEVEL[anomaly.severity],
    };

    // Check if this is an escalation from existing alert
    const existingAlert = this.alerts.get(anomaly.sensorId);
    if (existingAlert) {
      const existingLevel = SEVERITY_TO_LEVEL[existingAlert.severity];
      const newLevel = SEVERITY_TO_LEVEL[anomaly.severity];

      if (newLevel > existingLevel) {
        // Escalation — create new alert
        this.alertHistory.push({ ...existingAlert });
        this.alerts.set(anomaly.sensorId, alert);
        console.log(`[SHMS-Alert] ESCALATED: ${anomaly.sensorId} ${existingAlert.severity} → ${anomaly.severity}`);
        this.notifyAll(alert);
        return alert;
      } else {
        // Same or lower severity — update existing
        existingAlert.timestamp = alert.timestamp;
        existingAlert.value = alert.value;
        existingAlert.message = alert.message;
        return existingAlert;
      }
    }

    // New alert
    this.alerts.set(anomaly.sensorId, alert);
    this.alertHistory.push({ ...alert });

    // Trim history
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    console.log(`[SHMS-Alert] NEW ${alert.severity.toUpperCase()}: ${alert.message}`);
    this.notifyAll(alert);
    return alert;
  }

  /**
   * Acknowledge an alert.
   */
  acknowledge(sensorId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(sensorId);
    if (!alert) return false;

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();
    console.log(`[SHMS-Alert] ACKNOWLEDGED: ${sensorId} by ${acknowledgedBy}`);
    return true;
  }

  /**
   * Get current active alerts.
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => SEVERITY_TO_LEVEL[b.severity] - SEVERITY_TO_LEVEL[a.severity]);
  }

  /**
   * Get alert summary for dashboard.
   */
  getSummary(): AlertSummary {
    const active = this.getActiveAlerts();
    const bySeverity: Record<AlertSeverity, number> = {
      normal: 0, watch: 0, warning: 0, alert: 0, emergency: 0
    };

    for (const alert of active) {
      bySeverity[alert.severity]++;
    }

    // System status = highest severity active
    let systemStatus: AlertSummary['systemStatus'] = 'operational';
    if (bySeverity.emergency > 0) systemStatus = 'emergency';
    else if (bySeverity.alert > 0) systemStatus = 'alert';
    else if (bySeverity.warning > 0) systemStatus = 'warning';
    else if (bySeverity.watch > 0) systemStatus = 'watch';

    return {
      totalActive: active.length,
      bySeverity,
      criticalSensors: active
        .filter(a => a.escalationLevel >= 4)
        .map(a => a.sensorId),
      lastUpdated: new Date(),
      systemStatus,
    };
  }

  /**
   * Get alert history.
   */
  getHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  // ============================================================
  // Private
  // ============================================================

  private notifyAll(alert: Alert): void {
    for (const cb of this.notificationCallbacks) {
      try {
        cb(alert);
      } catch (err) {
        console.error('[SHMS-Alert] Notification error:', err);
      }
    }
  }
}
