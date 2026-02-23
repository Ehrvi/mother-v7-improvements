/**
 * MOTHER v29.0 - Metrics Middleware
 * 
 * Implements the Four Golden Signals (SRE) for auto-observation:
 * 1. Latency - How long it takes to service a request
 * 2. Traffic - How much demand is being placed on the system
 * 3. Errors - The rate of requests that fail
 * 4. Saturation - How "full" the service is (CPU/Memory)
 * 
 * This middleware instruments all tRPC procedures with OpenTelemetry metrics.
 * 
 * References:
 * [8] Beyer, B., et al. (2016). Site Reliability Engineering: How Google Runs Production Systems. O'Reilly Media.
 */

import { getMeter } from './opentelemetry';

// Initialize OpenTelemetry meter
const meter = getMeter();

// Create metric instruments for the Four Golden Signals
export const metrics = {
  // 1. LATENCY: Histogram to track request duration
  latency: meter.createHistogram('mother.request.latency', {
    description: 'Request latency in milliseconds',
    unit: 'ms',
  }),

  // 2. TRAFFIC: Counter to track total requests
  traffic: meter.createCounter('mother.request.count', {
    description: 'Total number of requests',
  }),

  // 3. ERRORS: Counter to track failed requests
  errors: meter.createCounter('mother.request.errors', {
    description: 'Total number of failed requests',
  }),

  // 4. SATURATION: Gauges for resource utilization
  memoryUsage: meter.createObservableGauge('mother.memory.usage', {
    description: 'Memory usage in bytes',
    unit: 'bytes',
  }),

  cpuUsage: meter.createObservableGauge('mother.cpu.usage', {
    description: 'CPU usage percentage',
    unit: 'percent',
  }),
};

// Register saturation metrics (collected periodically)
metrics.memoryUsage.addCallback((observableResult) => {
  const usage = process.memoryUsage();
  observableResult.observe(usage.heapUsed, { type: 'heap' });
  observableResult.observe(usage.rss, { type: 'rss' });
});

metrics.cpuUsage.addCallback((observableResult) => {
  const usage = process.cpuUsage();
  // Convert microseconds to percentage (approximate)
  const cpuPercent = ((usage.user + usage.system) / 1000000) * 100;
  observableResult.observe(cpuPercent);
});

/**
 * Record metrics for a request
 */
export function recordRequestMetrics(params: {
  path: string;
  method: string;
  duration: number;
  success: boolean;
  errorCode?: string;
  tier?: string;
}) {
  const { path, method, duration, success, errorCode, tier } = params;

  // Common attributes for all metrics
  const attributes = {
    path,
    method,
    tier: tier || 'unknown',
  };

  // 1. LATENCY: Record request duration
  metrics.latency.record(duration, attributes);

  // 2. TRAFFIC: Increment request counter
  metrics.traffic.add(1, attributes);

  // 3. ERRORS: Increment error counter if request failed
  if (!success) {
    metrics.errors.add(1, {
      ...attributes,
      error_code: errorCode || 'unknown',
    });
  }

  // 4. SATURATION: Collected automatically via callbacks above
}

/**
 * Log metrics to console (structured logging)
 */
export function logMetrics(params: {
  path: string;
  method: string;
  duration: number;
  success: boolean;
  errorCode?: string;
  tier?: string;
  userId?: string;
}) {
  const { path, method, duration, success, errorCode, tier, userId } = params;

  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'metric',
    path,
    method,
    duration_ms: duration,
    success,
    error_code: errorCode,
    tier,
    user_id: userId,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };

  console.log(JSON.stringify(logEntry));
}
