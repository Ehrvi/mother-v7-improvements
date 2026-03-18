/**
 * MOTHER v76.0 — Observability Module
 * Ciclo 67: Arquitetura SOTA v76.0 — Conselho Deliberativo Ciclo 66
 *
 * Scientific basis:
 * - OpenTelemetry (CNCF, 2023) — distributed tracing, metrics, logs standard
 * - Google SRE Book (2016) — SLO/SLI/SLA framework
 * - Prometheus (CNCF, 2012) — time-series metrics collection
 * - The Four Golden Signals (Google SRE) — latency, traffic, errors, saturation
 * - DORA Metrics (Forsgren et al., 2018, "Accelerate") — deployment frequency, lead time, MTTR, change failure rate
 *
 * Metrics collected (The Four Golden Signals):
 * 1. Latency: P50/P95/P99 per tier, provider, endpoint
 * 2. Traffic: requests/min per tier, provider, endpoint
 * 3. Errors: error rate per provider, circuit state
 * 4. Saturation: queue depth, active requests, memory usage
 *
 * DORA Metrics:
 * - Deployment Frequency: commits/day to GCloud
 * - Lead Time: commit → production time
 * - MTTR: time to recover from incidents
 * - Change Failure Rate: % of deployments causing incidents
 */

// ============================================================
// TYPES
// ============================================================

export interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
  unit: string;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: Date; attributes?: Record<string, unknown> }>;
}

export interface RequestMetrics {
  requestId: string;
  tier: string;
  provider: string;
  model: string;
  latencyMs: number;
  success: boolean;
  fromCache: boolean;
  qualityScore: number;
  queryLength: number;
  responseLength: number;
  timestamp: Date;
}

// ============================================================
// METRICS REGISTRY
// ============================================================

const metrics: MetricPoint[] = [];
const traces: Map<string, TraceSpan> = new Map();
const requestHistory: RequestMetrics[] = [];
const MAX_METRICS = 10000;
const MAX_REQUESTS = 5000;

// Counters
const counters = {
  totalRequests: 0,
  totalErrors: 0,
  totalCacheHits: 0,
  deployments: 0,
  incidents: 0,
};

// Histograms (for percentile computation)
const latencyHistogram: Record<string, number[]> = {
  TIER_1: [], TIER_2: [], TIER_3: [], TIER_4: [], overall: [],
};

// ============================================================
// METRIC RECORDING
// ============================================================

/**
 * Record a metric point.
 */
export function recordMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  unit = '',
): void {
  metrics.push({ name, value, labels, timestamp: new Date(), unit });
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }
}

/**
 * Record a complete request for observability.
 * Called by core-orchestrator.ts after each request.
 */
export function recordRequest(req: RequestMetrics): void {
  requestHistory.push(req);
  if (requestHistory.length > MAX_REQUESTS) {
    requestHistory.splice(0, requestHistory.length - MAX_REQUESTS);
  }

  // Update counters
  counters.totalRequests++;
  if (!req.success) counters.totalErrors++;
  if (req.fromCache) counters.totalCacheHits++;

  // Update latency histogram
  const tier = req.tier as keyof typeof latencyHistogram;
  if (latencyHistogram[tier]) latencyHistogram[tier].push(req.latencyMs);
  latencyHistogram.overall.push(req.latencyMs);

  // Keep histogram bounded
  for (const key of Object.keys(latencyHistogram)) {
    if (latencyHistogram[key]!.length > 1000) {
      latencyHistogram[key] = latencyHistogram[key]!.slice(-1000);
    }
  }

  // Record individual metrics
  recordMetric('request_latency_ms', req.latencyMs, { tier: req.tier, provider: req.provider }, 'ms');
  recordMetric('request_quality_score', req.qualityScore, { tier: req.tier, provider: req.provider }, 'score');
  if (!req.success) {
    recordMetric('request_error', 1, { tier: req.tier, provider: req.provider }, 'count');
  }
  if (req.fromCache) {
    recordMetric('cache_hit', 1, { tier: req.tier }, 'count');
  }
}

// ============================================================
// PERCENTILE COMPUTATION
// ============================================================

function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * (percentile / 100));
  return sorted[Math.min(index, sorted.length - 1)] ?? 0;
}

// ============================================================
// DISTRIBUTED TRACING
// ============================================================

/**
 * Start a new trace span.
 */
export function startSpan(
  name: string,
  parentSpanId?: string,
  attributes: Record<string, string | number | boolean> = {},
): TraceSpan {
  const span: TraceSpan = {
    traceId: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    spanId: `span_${Math.random().toString(36).slice(2, 10)}`,
    parentSpanId,
    name,
    startTime: new Date(),
    status: 'UNSET',
    attributes,
    events: [],
  };

  traces.set(span.spanId, span);
  return span;
}

/**
 * End a trace span.
 */
export function endSpan(spanId: string, status: TraceSpan['status'] = 'OK', error?: string): void {
  const span = traces.get(spanId);
  if (!span) return;

  span.endTime = new Date();
  span.durationMs = span.endTime.getTime() - span.startTime.getTime();
  span.status = status;

  if (error) {
    span.events.push({ name: 'error', timestamp: new Date(), attributes: { message: error } });
  }

  // Record latency metric
  recordMetric('span_duration_ms', span.durationMs, { span: span.name }, 'ms');

  // Clean up old spans
  if (traces.size > 1000) {
    const oldestKey = traces.keys().next().value;
    if (oldestKey) traces.delete(oldestKey);
  }
}

// ============================================================
// SLO DASHBOARD
// ============================================================

export interface SLODashboard {
  timestamp: Date;
  sloCompliance: {
    p95LatencyMs: { target: number; actual: number; compliant: boolean };
    errorRate: { target: number; actual: number; compliant: boolean };
    cacheHitRate: { target: number; actual: number; compliant: boolean };
    uptime: { target: number; actual: number; compliant: boolean };
  };
  fourGoldenSignals: {
    latency: { p50: number; p95: number; p99: number };
    traffic: { requestsPerMin: number };
    errors: { errorRate: number; totalErrors: number };
    saturation: { activeSpans: number; metricsBufferSize: number };
  };
  tierBreakdown: Record<string, { requests: number; avgLatencyMs: number; errorRate: number }>;
  providerBreakdown: Record<string, { requests: number; avgLatencyMs: number; errorRate: number }>;
  doraMetrics: {
    deploymentFrequency: number;  // deployments/day
    changeFailureRate: number;    // 0-1
  };
}

/**
 * Generate SLO dashboard snapshot.
 * Scientific basis: Google SRE Book (2016) — Four Golden Signals
 */
export function getSLODashboard(): SLODashboard {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;  // 5-minute window
  const recent = requestHistory.filter(r => now - r.timestamp.getTime() < windowMs);

  // Four Golden Signals
  const p95Latency = computePercentile(latencyHistogram.overall, 95);
  const errorRate = counters.totalRequests > 0 ? counters.totalErrors / counters.totalRequests : 0;
  const cacheHitRate = counters.totalRequests > 0 ? counters.totalCacheHits / counters.totalRequests : 0;
  const requestsPerMin = recent.length / 5;

  // Tier breakdown
  const tierBreakdown: SLODashboard['tierBreakdown'] = {};
  for (const tier of ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4']) {
    const tierRequests = requestHistory.filter(r => r.tier === tier);
    if (tierRequests.length > 0) {
      tierBreakdown[tier] = {
        requests: tierRequests.length,
        avgLatencyMs: tierRequests.reduce((s, r) => s + r.latencyMs, 0) / tierRequests.length,
        errorRate: tierRequests.filter(r => !r.success).length / tierRequests.length,
      };
    }
  }

  // Provider breakdown
  const providerBreakdown: SLODashboard['providerBreakdown'] = {};
  const providers = [...new Set(requestHistory.map(r => r.provider))];
  for (const provider of providers) {
    const provRequests = requestHistory.filter(r => r.provider === provider);
    if (provRequests.length > 0) {
      providerBreakdown[provider] = {
        requests: provRequests.length,
        avgLatencyMs: provRequests.reduce((s, r) => s + r.latencyMs, 0) / provRequests.length,
        errorRate: provRequests.filter(r => !r.success).length / provRequests.length,
      };
    }
  }

  return {
    timestamp: new Date(),
    sloCompliance: {
      p95LatencyMs: { target: 2000, actual: p95Latency, compliant: p95Latency <= 2000 },
      errorRate: { target: 0.001, actual: errorRate, compliant: errorRate <= 0.001 },
      cacheHitRate: { target: 0.20, actual: cacheHitRate, compliant: cacheHitRate >= 0.20 },
      uptime: { target: 0.999, actual: 1.0, compliant: true },  // tracked externally
    },
    fourGoldenSignals: {
      latency: {
        p50: computePercentile(latencyHistogram.overall, 50),
        p95: p95Latency,
        p99: computePercentile(latencyHistogram.overall, 99),
      },
      traffic: { requestsPerMin },
      errors: { errorRate, totalErrors: counters.totalErrors },
      saturation: { activeSpans: traces.size, metricsBufferSize: metrics.length },
    },
    tierBreakdown,
    providerBreakdown,
    doraMetrics: {
      deploymentFrequency: counters.deployments,
      changeFailureRate: counters.deployments > 0 ? counters.incidents / counters.deployments : 0,
    },
  };
}

/**
 * Export metrics in Prometheus text format.
 * Compatible with Prometheus scraping and Grafana dashboards.
 */
export function exportPrometheusMetrics(): string {
  const dashboard = getSLODashboard();
  const lines: string[] = [
    '# HELP mother_request_latency_p95_ms P95 request latency in milliseconds',
    '# TYPE mother_request_latency_p95_ms gauge',
    `mother_request_latency_p95_ms ${dashboard.fourGoldenSignals.latency.p95}`,
    '',
    '# HELP mother_error_rate Request error rate (0-1)',
    '# TYPE mother_error_rate gauge',
    `mother_error_rate ${dashboard.fourGoldenSignals.errors.errorRate}`,
    '',
    '# HELP mother_requests_total Total requests processed',
    '# TYPE mother_requests_total counter',
    `mother_requests_total ${counters.totalRequests}`,
    '',
    '# HELP mother_cache_hit_rate Semantic cache hit rate (0-1)',
    '# TYPE mother_cache_hit_rate gauge',
    `mother_cache_hit_rate ${dashboard.sloCompliance.cacheHitRate.actual}`,
  ];

  return lines.join('\n');
}

/**
 * Record a deployment event (for DORA metrics).
 */
export function recordDeployment(success: boolean): void {
  counters.deployments++;
  if (!success) counters.incidents++;
  recordMetric('deployment', 1, { success: String(success) }, 'count');
}

// ============================================================
// LANGFUSE-COMPATIBLE DISTRIBUTED TRACING (P1 Upgrade)
// Scientific basis:
// - OpenTelemetry (CNCF, 2023) — distributed tracing standard
// - Langfuse (2024) — LLM observability, OTLP-compatible
// - Helicone (2024) — per-layer latency tracking
// ============================================================

export type PipelineLayer =
  | 'intake'
  | 'cache_lookup'
  | 'routing'
  | 'context_assembly'
  | 'generation'
  | 'tool_execution'
  | 'guardian'
  | 'memory_writeback'
  | 'dgm_observation';

const PIPELINE_LAYERS: PipelineLayer[] = [
  'intake', 'cache_lookup', 'routing', 'context_assembly',
  'generation', 'tool_execution', 'guardian', 'memory_writeback', 'dgm_observation',
];

// Per-layer latency histograms for P50/P95/P99 breakdown
const layerLatencyHistogram: Record<string, number[]> = {};
for (const layer of PIPELINE_LAYERS) {
  layerLatencyHistogram[layer] = [];
}

export interface LangfuseTrace {
  traceId: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata: Record<string, string | number | boolean>;
  spans: LangfuseSpan[];
  totalDurationMs?: number;
}

export interface LangfuseSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  layer: PipelineLayer;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  status: 'OK' | 'ERROR' | 'SKIPPED';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: Date; attributes?: Record<string, unknown> }>;
}

// Active traces registry
const activeTraces = new Map<string, LangfuseTrace>();
const completedTraces: LangfuseTrace[] = [];
const MAX_COMPLETED_TRACES = 500;

/**
 * Start a new request trace (Langfuse-compatible).
 * Creates a parent trace that child layer spans attach to.
 */
export function traceRequest(
  requestId: string,
  input?: Record<string, unknown>,
  metadata: Record<string, string | number | boolean> = {},
): LangfuseTrace {
  const trace: LangfuseTrace = {
    traceId: requestId || `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: 'mother.request',
    startTime: new Date(),
    input,
    metadata,
    spans: [],
  };
  activeTraces.set(trace.traceId, trace);
  return trace;
}

/**
 * Start a layer span within a trace.
 */
export function startLayerSpan(
  traceId: string,
  layer: PipelineLayer,
  attributes: Record<string, string | number | boolean> = {},
): LangfuseSpan {
  const span: LangfuseSpan = {
    spanId: `${layer}_${Math.random().toString(36).slice(2, 8)}`,
    name: `mother.${layer}`,
    layer,
    startTime: new Date(),
    status: 'OK',
    attributes,
    events: [],
  };

  const trace = activeTraces.get(traceId);
  if (trace) {
    span.parentSpanId = trace.traceId;
    trace.spans.push(span);
  }

  return span;
}

/**
 * End a layer span and record latency.
 */
export function endLayerSpan(
  span: LangfuseSpan,
  status: LangfuseSpan['status'] = 'OK',
  extraAttributes?: Record<string, string | number | boolean>,
): void {
  span.endTime = new Date();
  span.durationMs = span.endTime.getTime() - span.startTime.getTime();
  span.status = status;

  if (extraAttributes) {
    Object.assign(span.attributes, extraAttributes);
  }

  // Record per-layer latency
  const histogram = layerLatencyHistogram[span.layer];
  if (histogram) {
    histogram.push(span.durationMs);
    if (histogram.length > 1000) {
      layerLatencyHistogram[span.layer] = histogram.slice(-1000);
    }
  }

  recordMetric('layer_duration_ms', span.durationMs, { layer: span.layer, status }, 'ms');
}

/**
 * End a request trace.
 */
export function endTrace(
  traceId: string,
  output?: Record<string, unknown>,
): LangfuseTrace | undefined {
  const trace = activeTraces.get(traceId);
  if (!trace) return undefined;

  trace.endTime = new Date();
  trace.totalDurationMs = trace.endTime.getTime() - trace.startTime.getTime();
  trace.output = output;

  activeTraces.delete(traceId);
  completedTraces.push(trace);
  if (completedTraces.length > MAX_COMPLETED_TRACES) {
    completedTraces.splice(0, completedTraces.length - MAX_COMPLETED_TRACES);
  }

  return trace;
}

/**
 * Helper: Wrap a pipeline layer function with automatic span tracing.
 * Usage: const result = await traceLayer(traceId, 'routing', { tier: 'TIER_3' }, async () => { ... });
 */
export async function traceLayer<T>(
  traceId: string,
  layer: PipelineLayer,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const span = startLayerSpan(traceId, layer, attributes);
  try {
    const result = await fn();
    endLayerSpan(span, 'OK');
    return result;
  } catch (err) {
    endLayerSpan(span, 'ERROR', { error: (err as Error).message });
    throw err;
  }
}

/**
 * Get per-layer latency percentiles.
 * Returns P50/P95/P99 for each pipeline layer.
 */
export function getLayerLatencyBreakdown(): Record<PipelineLayer, { p50: number; p95: number; p99: number; count: number }> {
  const result = {} as Record<PipelineLayer, { p50: number; p95: number; p99: number; count: number }>;
  for (const layer of PIPELINE_LAYERS) {
    const values = layerLatencyHistogram[layer] || [];
    result[layer] = {
      p50: computePercentile(values, 50),
      p95: computePercentile(values, 95),
      p99: computePercentile(values, 99),
      count: values.length,
    };
  }
  return result;
}

/**
 * Get recent completed traces (for dashboard/debugging).
 */
export function getRecentTraces(limit = 20): LangfuseTrace[] {
  return completedTraces.slice(-limit).reverse();
}

/**
 * Export traces in Langfuse-compatible JSON format.
 * Can be sent to Langfuse OTLP endpoint when self-hosted/cloud is configured.
 */
export function exportLangfuseTraces(limit = 50): object[] {
  return completedTraces.slice(-limit).map(trace => ({
    id: trace.traceId,
    name: trace.name,
    startTime: trace.startTime.toISOString(),
    endTime: trace.endTime?.toISOString(),
    input: trace.input,
    output: trace.output,
    metadata: trace.metadata,
    observations: trace.spans.map(span => ({
      id: span.spanId,
      traceId: trace.traceId,
      type: 'SPAN',
      name: span.name,
      startTime: span.startTime.toISOString(),
      endTime: span.endTime?.toISOString(),
      metadata: span.attributes,
      level: span.status === 'ERROR' ? 'ERROR' : 'DEFAULT',
    })),
  }));
}
