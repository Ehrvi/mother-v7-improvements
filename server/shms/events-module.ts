/**
 * SHMS Events Module — server/shms/events-module.ts
 * MOTHER v79.2 | Ciclo 109 | Fase 3: SHMS Agent
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 §6 (2011): Incident/event reporting for tailings dams —
 *   traceability, retrospective analysis and automated report generation.
 * - GISTM 2020 §9: Monitoring, inspection and event documentation requirements.
 * - ABNT NBR 13028:2017 §8: Operational event registry for dam safety management.
 * - ISO 55001:2014: Asset management — lifecycle event traceability.
 */

import { createLogger } from '../_core/logger.js';

const log = createLogger('SHMS-Events');

// ============================================================
// Types
// ============================================================

export type EventCategory =
  | 'maintenance' | 'inspection' | 'anomaly_confirmed' | 'false_positive'
  | 'calibration' | 'sensor_failure' | 'extreme_weather' | 'seismic'
  | 'observation' | 'construction' | 'operational_change';

export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface SHMSEvent {
  id: string;
  structureId: string;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  description: string;
  occurredAt: Date;
  recordedAt: Date;
  recordedBy?: string;
  relatedSensorIds: string[];
  relatedAlertIds: string[];
  sensorValueAtEvent?: number;
  attachments: string[];   // file paths or URLs
  tags: string[];
  isAutomatic: boolean;    // true if triggered by the system
  resolutionNotes?: string;
  resolvedAt?: Date;
}

export interface EventTimeline {
  events: SHMSEvent[];
  periodStart: Date;
  periodEnd: Date;
  totalCount: number;
  byCategory: Record<EventCategory, number>;
  bySeverity: Record<EventSeverity, number>;
  criticalCount: number;
}

export interface EventReport {
  structureId: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  timeline: EventTimeline;
  correlatedWithReadings: boolean;
  summary: string;
}

// ============================================================
// Helpers
// ============================================================

const ALL_CATEGORIES: EventCategory[] = [
  'maintenance', 'inspection', 'anomaly_confirmed', 'false_positive',
  'calibration', 'sensor_failure', 'extreme_weather', 'seismic',
  'observation', 'construction', 'operational_change',
];
const ALL_SEVERITIES: EventSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
const SEV_RANK: Record<EventSeverity, number> = { info:0, low:1, medium:2, high:3, critical:4 };

const emptyByCategory = (): Record<EventCategory, number> =>
  Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0])) as Record<EventCategory, number>;
const emptyBySeverity = (): Record<EventSeverity, number> =>
  Object.fromEntries(ALL_SEVERITIES.map(s => [s, 0])) as Record<EventSeverity, number>;

let _seq = 0;
const nextId = () => `EVT-${Date.now()}-${(++_seq).toString().padStart(4, '0')}`;

// ============================================================
// EventsModule
// ============================================================

export class EventsModule {
  private events: SHMSEvent[] = [];

  /**
   * Record a new event. Auto-generates id and recordedAt.
   * Reference: ICOLD Bulletin 158 §6.2 — minimum event metadata.
   */
  recordEvent(event: Omit<SHMSEvent, 'id' | 'recordedAt'>): SHMSEvent {
    const full: SHMSEvent = { ...event, id: nextId(), recordedAt: new Date() };
    this.events.push(full);
    log.info('Event recorded', { id: full.id, category: full.category, severity: full.severity, structureId: full.structureId });
    return full;
  }

  /**
   * Build an EventTimeline for a structure and date range.
   * Reference: GISTM 2020 §9 — event aggregation for monitoring dashboards.
   */
  getTimeline(structureId: string, from: Date, to: Date): EventTimeline {
    const filtered = this.events
      .filter(e => e.structureId === structureId && e.occurredAt >= from && e.occurredAt <= to)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const byCategory = emptyByCategory();
    const bySeverity = emptyBySeverity();
    let criticalCount = 0;
    for (const ev of filtered) { byCategory[ev.category]++; bySeverity[ev.severity]++; if (ev.severity === 'critical') criticalCount++; }

    return { events: filtered, periodStart: from, periodEnd: to, totalCount: filtered.length, byCategory, bySeverity, criticalCount };
  }

  /**
   * Generate a structured EventReport with prose summary.
   * Reference: ABNT NBR 13028:2017 §8 — automated dam safety report.
   */
  generateReport(structureId: string, from: Date, to: Date): EventReport {
    const timeline = this.getTimeline(structureId, from, to);
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    const topCat = (Object.entries(timeline.byCategory) as [EventCategory, number][])
      .sort((a, b) => b[1] - a[1])[0];
    const summary =
      `Period: ${from.toISOString().slice(0,10)} – ${to.toISOString().slice(0,10)} (${days}d). ` +
      `Total: ${timeline.totalCount}. Critical: ${timeline.criticalCount}. High: ${timeline.bySeverity.high}. ` +
      (topCat && topCat[1] > 0 ? `Top category: ${topCat[0]} (${topCat[1]}).` : 'No events recorded.');
    log.info('Report generated', { structureId, total: timeline.totalCount, critical: timeline.criticalCount });
    return { structureId, generatedAt: new Date(), periodStart: from, periodEnd: to, timeline, correlatedWithReadings: false, summary };
  }

  /**
   * Find the sensor reading nearest to the event's occurredAt.
   * Reference: ICOLD Bulletin 158 §6.3 — contextual event/reading correlation.
   */
  correlateWithReadings(
    event: SHMSEvent,
    readings: { timestamp: Date; value: number }[],
  ): { nearestReading?: { timestamp: Date; value: number }; deltaMinutes: number } {
    if (!readings.length) return { deltaMinutes: Infinity };
    let nearest = readings[0]!;
    let minDelta = Math.abs(event.occurredAt.getTime() - nearest.timestamp.getTime());
    for (const r of readings) {
      const d = Math.abs(event.occurredAt.getTime() - r.timestamp.getTime());
      if (d < minDelta) { minDelta = d; nearest = r; }
    }
    return { nearestReading: nearest, deltaMinutes: minDelta / 60_000 };
  }

  /** Filter events by severity, optionally scoped to a structure. */
  getEventsBySeverity(severity: EventSeverity, structureId?: string): SHMSEvent[] {
    return this.events
      .filter(e => e.severity === severity && (structureId === undefined || e.structureId === structureId))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }

  /** Resolve/acknowledge an event. */
  acknowledgeEvent(eventId: string, resolvedBy: string, notes: string): void {
    const ev = this.events.find(e => e.id === eventId);
    if (!ev) { log.warn('acknowledgeEvent: not found', { eventId }); return; }
    ev.resolutionNotes = notes;
    ev.resolvedAt = new Date();
    ev.recordedBy = ev.recordedBy ?? resolvedBy;
    log.info('Event acknowledged', { eventId, resolvedBy });
  }

  /** Serialise events to JSON for external reporting and audit trails. */
  exportToJSON(structureId: string, from: Date, to: Date): string {
    const t = this.getTimeline(structureId, from, to);
    return JSON.stringify({ exportedAt: new Date(), structureId, periodStart: from, periodEnd: to, totalCount: t.totalCount, byCategory: t.byCategory, bySeverity: t.bySeverity, events: t.events }, null, 2);
  }

  /**
   * Auto-generate an event from an anomaly detection result.
   * Maps SHMS anomaly severity → EventSeverity and selects appropriate category.
   * Reference: GISTM 2020 §9.4 — automated event generation from monitoring thresholds.
   */
  fromAnomalyDetection(anomalyResult: {
    sensorId: string; structureId: string;
    severity: string; message: string;
    timestamp: Date; value: number;
  }): SHMSEvent {
    const sevMap: Record<string, EventSeverity> = {
      emergency: 'critical', alert: 'high', warning: 'medium', watch: 'low', normal: 'info',
    };
    const severity: EventSeverity = sevMap[anomalyResult.severity] ?? 'medium';
    const category: EventCategory = SEV_RANK[severity] >= SEV_RANK['high'] ? 'anomaly_confirmed' : 'observation';
    return this.recordEvent({
      structureId: anomalyResult.structureId, category, severity,
      title: `Anomaly detected — ${anomalyResult.sensorId}`,
      description: anomalyResult.message,
      occurredAt: anomalyResult.timestamp,
      recordedBy: 'SHMS-AutoDetect',
      relatedSensorIds: [anomalyResult.sensorId],
      relatedAlertIds: [], sensorValueAtEvent: anomalyResult.value,
      attachments: [], tags: ['auto', anomalyResult.severity], isAutomatic: true,
    });
  }

  getAllEvents(): SHMSEvent[] { return [...this.events]; }
}

export const eventsModule = new EventsModule();
