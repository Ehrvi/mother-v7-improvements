/**
 * OpenTelemetry Metrics Provider for MOTHER v29.0
 * 
 * Implements the Four Golden Signals (SRE) for auto-observation:
 * 1. Latency - How long it takes to service a request
 * 2. Traffic - How much demand is being placed on the system
 * 3. Errors - The rate of requests that fail
 * 4. Saturation - How "full" the service is (CPU/Memory)
 * 
 * References:
 * [8] Beyer, B., et al. (2016). Site Reliability Engineering: How Google Runs Production Systems. O'Reilly Media.
 */

import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

let meterProvider: MeterProvider | null = null;

export function initMeterProvider(): MeterProvider {
  if (meterProvider) {
    return meterProvider;
  }

  // Create OTLP exporter for Google Cloud Monitoring
  // Cloud Run automatically provides GOOGLE_APPLICATION_CREDENTIALS
  const exporter = new OTLPMetricExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics',
    headers: {},
  });

  // Create metric reader with 60-second export interval
  const metricReader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60000, // Export every 60 seconds
  });

  // Create meter provider
  meterProvider = new MeterProvider({
    readers: [metricReader],
  });

  console.log('[OpenTelemetry] MeterProvider initialized with OTLP exporter');
  console.log('[OpenTelemetry] Export endpoint:', process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/metrics');

  return meterProvider;
}

/**
 * Get the global meter for instrumentation
 */
export function getMeter() {
  const provider = initMeterProvider();
  return provider.getMeter('mother-agent-instrumentation', '29.0');
}

/**
 * Gracefully shutdown the meter provider
 */
export async function shutdownMeterProvider() {
  if (meterProvider) {
    await meterProvider.shutdown();
    console.log('[OpenTelemetry] MeterProvider shut down');
  }
}
