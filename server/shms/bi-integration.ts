/**
 * bi-integration.ts — Module 15: Business Intelligence Integration
 * SHMS MOTHER v7 | Sprint 1 | 2026-03-13
 *
 * Scientific basis:
 * - Power BI REST API v2.0 — push dataset via POST /datasets/{datasetId}/rows
 * - Tableau REST API 3.18 — datasource append via POST /datasources/{id}/data
 * - KPI taxonomy: ISO 55001:2014 §9.1 — asset performance monitoring
 * - ICOLD Bulletin 158 (2014) — dam safety performance indicators
 *
 * Architecture:
 * - BIIntegrationManager: orchestrates push to multiple BI sinks
 * - PowerBIConnector: OAuth2 Bearer push dataset
 * - TableauConnector: PAT-authenticated webhook
 * - Generates embedded iframe src for direct dashboard embedding
 */

export type BISinkType = 'powerbi' | 'tableau' | 'metabase' | 'grafana';

export interface BISinkConfig {
  type: BISinkType;
  name: string;
  /** Power BI: dataset push URL; Tableau: webhook URL; Metabase/Grafana: base URL */
  endpointUrl: string;
  /** Bearer token or PAT */
  token?: string;
  /** Additional sink-specific options */
  options?: Record<string, string>;
}

export interface SHMSKpi {
  structureId: string;
  structureName: string;
  timestamp: string;          // ISO 8601
  overallHealthScore: number; // 0–100
  activeCriticalAlerts: number;
  activeWarningAlerts: number;
  uptimePercent: number;
  meanRULDays?: number;
  dataCompletenessPercent: number;
  maxDeformation?: number;    // mm
  maxPiezometricLevel?: number; // m
}

export interface BIPushResult {
  sink: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  latencyMs: number;
}

export interface EmbedToken {
  sink: BISinkType;
  embedUrl: string;
  token?: string;
  expiresAt?: string;
}

// ─── Power BI Connector ──────────────────────────────────────────────────

async function pushToPowerBI(
  config: BISinkConfig,
  kpis: SHMSKpi[]
): Promise<BIPushResult> {
  const start = Date.now();
  try {
    // Power BI push dataset API: POST /datasets/{datasetId}/rows
    // Reference: https://learn.microsoft.com/en-us/rest/api/power-bi/push-datasets/datasets-post-rows
    const rows = kpis.map((k) => ({
      structureId: k.structureId,
      structureName: k.structureName,
      timestamp: k.timestamp,
      overallHealthScore: k.overallHealthScore,
      activeCriticalAlerts: k.activeCriticalAlerts,
      activeWarningAlerts: k.activeWarningAlerts,
      uptimePercent: k.uptimePercent,
      meanRULDays: k.meanRULDays ?? null,
      dataCompletenessPercent: k.dataCompletenessPercent,
      maxDeformation: k.maxDeformation ?? null,
      maxPiezometricLevel: k.maxPiezometricLevel ?? null,
    }));

    const resp = await fetch(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token ?? ''}`,
      },
      body: JSON.stringify({ rows }),
      signal: AbortSignal.timeout(10000),
    });

    return {
      sink: config.name,
      success: resp.ok,
      statusCode: resp.status,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      sink: config.name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Tableau Connector ───────────────────────────────────────────────────

async function pushToTableau(
  config: BISinkConfig,
  kpis: SHMSKpi[]
): Promise<BIPushResult> {
  const start = Date.now();
  try {
    // Tableau REST API: append rows to a datasource
    // Reference: https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_data_sources.htm
    const payload = {
      data: kpis.map((k) => [
        k.timestamp,
        k.structureId,
        k.structureName,
        k.overallHealthScore,
        k.activeCriticalAlerts,
        k.activeWarningAlerts,
        k.uptimePercent,
        k.meanRULDays ?? null,
        k.dataCompletenessPercent,
      ]),
      columns: [
        'timestamp', 'structureId', 'structureName', 'overallHealthScore',
        'activeCriticalAlerts', 'activeWarningAlerts', 'uptimePercent',
        'meanRULDays', 'dataCompletenessPercent',
      ],
    };

    const resp = await fetch(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tableau-Auth': config.token ?? '',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    return {
      sink: config.name,
      success: resp.ok,
      statusCode: resp.status,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      sink: config.name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Generic Webhook (Metabase / Grafana / custom) ───────────────────────

async function pushToGenericWebhook(
  config: BISinkConfig,
  kpis: SHMSKpi[]
): Promise<BIPushResult> {
  const start = Date.now();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    const resp = await fetch(config.endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kpis, source: 'mother-shms-v7' }),
      signal: AbortSignal.timeout(10000),
    });

    return {
      sink: config.name,
      success: resp.ok,
      statusCode: resp.status,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      sink: config.name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── KPI Computation ─────────────────────────────────────────────────────

export function computeSHMSKpis(
  structureId: string,
  structureName: string,
  data: {
    sensorCount: number;
    activeSensors: number;
    criticalAlerts: number;
    warningAlerts: number;
    readings: Array<{ value: number; unit: string }>;
    meanRULDays?: number;
    deformationReadings?: number[];
    piezometricReadings?: number[];
  }
): SHMSKpi {
  const uptimePercent =
    data.sensorCount > 0
      ? Math.round((data.activeSensors / data.sensorCount) * 1000) / 10
      : 0;

  const dataCompletenessPercent =
    data.sensorCount > 0
      ? Math.round((data.readings.length / Math.max(data.sensorCount, 1)) * 1000) / 10
      : 0;

  // Health score: 100 - penalty for alerts and poor uptime
  // ICOLD BUL 158: critical=50pt, warning=10pt, uptime<80%=20pt
  const criticalPenalty = Math.min(data.criticalAlerts * 50, 80);
  const warningPenalty = Math.min(data.warningAlerts * 10, 30);
  const uptimePenalty = uptimePercent < 80 ? 20 : 0;
  const overallHealthScore = Math.max(0, 100 - criticalPenalty - warningPenalty - uptimePenalty);

  return {
    structureId,
    structureName,
    timestamp: new Date().toISOString(),
    overallHealthScore,
    activeCriticalAlerts: data.criticalAlerts,
    activeWarningAlerts: data.warningAlerts,
    uptimePercent,
    meanRULDays: data.meanRULDays,
    dataCompletenessPercent,
    maxDeformation:
      data.deformationReadings && data.deformationReadings.length > 0
        ? Math.max(...data.deformationReadings)
        : undefined,
    maxPiezometricLevel:
      data.piezometricReadings && data.piezometricReadings.length > 0
        ? Math.max(...data.piezometricReadings)
        : undefined,
  };
}

// ─── Manager ─────────────────────────────────────────────────────────────

export class BIIntegrationManager {
  private sinks: Map<string, BISinkConfig> = new Map();

  registerSink(config: BISinkConfig): void {
    this.sinks.set(config.name, config);
  }

  removeSink(name: string): void {
    this.sinks.delete(name);
  }

  listSinks(): BISinkConfig[] {
    return Array.from(this.sinks.values()).map((s) => ({
      ...s,
      token: s.token ? '***' : undefined, // redact token in listings
    }));
  }

  /**
   * Push KPIs to all registered BI sinks in parallel.
   * Returns one result per sink.
   */
  async pushKpis(kpis: SHMSKpi[]): Promise<BIPushResult[]> {
    const pushPromises = Array.from(this.sinks.values()).map((sink) => {
      switch (sink.type) {
        case 'powerbi':
          return pushToPowerBI(sink, kpis);
        case 'tableau':
          return pushToTableau(sink, kpis);
        default:
          return pushToGenericWebhook(sink, kpis);
      }
    });

    return Promise.all(pushPromises);
  }

  /**
   * Generate an embed token/URL for iframe embedding.
   * Power BI: GenerateToken API; Tableau: trusted tickets; others: direct URL.
   * Reference: Power BI Embedded — https://learn.microsoft.com/en-us/power-bi/developer/embedded/generate-embed-token
   */
  async generateEmbedToken(sinkName: string): Promise<EmbedToken | null> {
    const sink = this.sinks.get(sinkName);
    if (!sink) return null;

    const base = sink.options?.dashboardUrl ?? sink.endpointUrl;

    switch (sink.type) {
      case 'powerbi':
        return {
          sink: 'powerbi',
          embedUrl: base,
          token: sink.token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h
        };

      case 'tableau':
        // Tableau trusted auth: GET /trusted/{ticket}/views/{viewId}/jsondata
        return {
          sink: 'tableau',
          embedUrl: `${base}?:embed=yes&:toolbar=no&:showVizHome=no`,
          token: sink.token,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10min
        };

      default:
        return {
          sink: sink.type,
          embedUrl: base,
        };
    }
  }
}

export const biIntegrationManager = new BIIntegrationManager();
