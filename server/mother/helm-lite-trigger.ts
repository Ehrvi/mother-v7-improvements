/**
 * helm-lite-trigger.ts — HELM-lite Continuous Benchmark Trigger
 *
 * Scientific basis:
 * - HELM (arXiv:2211.09110): "Holistic Evaluation of Language Models" — Liang et al. 2022
 * - HELM-lite: A subset of HELM scenarios for rapid evaluation
 * - Continuous Integration testing: "test after every commit" principle
 * - DARWIN (arXiv:2602.02534): "Continuous evaluation as part of the evolution loop"
 *
 * This module triggers the 6-MCC benchmark automatically after each successful deploy.
 * It integrates with the Cloud Build pipeline via a webhook or post-deploy hook.
 *
 * Architecture:
 * 1. Cloud Build completes → calls POST /api/a2a/benchmark/trigger
 * 2. helm-lite-trigger.ts receives the trigger
 * 3. Calls benchmark-runner.ts to execute 6 MCCs
 * 4. Stores result in bd_central
 * 5. Updates autonomy level if new proofs were generated
 *
 * @version v79.5 | Ciclo 112 | 2026-03-05
 */

import { createLogger } from '../_core/logger';

const log = createLogger('helm-lite-trigger');

export interface BenchmarkTriggerPayload {
  buildId?: string;
  version?: string;
  commitSha?: string;
  triggeredBy?: 'cloud-build' | 'manual' | 'scheduled' | 'post-deploy';
}

export interface BenchmarkTriggerResult {
  triggered: boolean;
  benchmarkId: string;
  message: string;
  timestamp: string;
}

/**
 * Trigger a HELM-lite benchmark run.
 * Called after each successful Cloud Build deploy.
 *
 * Scientific basis: HELM (arXiv:2211.09110) — continuous evaluation after each model update.
 * In MOTHER's context: "model update" = new code deployed to production.
 */
export async function triggerHelmLiteBenchmark(
  payload: BenchmarkTriggerPayload = {}
): Promise<BenchmarkTriggerResult> {
  const benchmarkId = `helm-lite-${Date.now()}`;
  const timestamp = new Date().toISOString();

  log.info('HELM-lite: Benchmark triggered', {
    benchmarkId,
    buildId: payload.buildId,
    version: payload.version,
    triggeredBy: payload.triggeredBy || 'manual',
  });

  try {
    // Import benchmark-runner dynamically to avoid circular deps
    const { runBenchmarkC111 } = await import('./benchmark-runner');

    // Run the 6-MCC benchmark asynchronously (don't block the trigger response)
    setImmediate(async () => {
      try {
        log.info('HELM-lite: Starting 6-MCC evaluation', { benchmarkId });
        const result = await runBenchmarkC111();
        log.info('HELM-lite: Benchmark complete', {
          benchmarkId,
          verdict: result.verdict,
          passed: result.passed_mccs,
          total: result.total_mccs,
          fitness: result.fitness_score,
        });

        // Store result in bd_central
        const MOTHER_URL = process.env.MOTHER_API_URL ||
          'https://mother-interface-qtvghovzxa-ts.a.run.app';

        await fetch(`${MOTHER_URL}/api/a2a/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `HELM-lite Benchmark ${benchmarkId}: ${result.verdict}`,
            content: `Triggered by: ${payload.triggeredBy || 'manual'} | Build: ${payload.buildId || 'N/A'} | Version: ${payload.version || 'N/A'} | MCCs: ${result.passed_mccs}/${result.total_mccs} | Fitness: ${result.fitness_score?.toFixed(3)} | Timestamp: ${timestamp}`,
            source: `helm-lite-${payload.version || 'unknown'}`,
            category: 'benchmark',
          }),
        }).catch(e => log.warn('HELM-lite: Failed to store result in bd_central', { error: String(e) }));

      } catch (err) {
        log.error('HELM-lite: Benchmark execution failed', { benchmarkId, error: String(err) });
      }
    });

    return {
      triggered: true,
      benchmarkId,
      message: `HELM-lite benchmark ${benchmarkId} triggered successfully. Results will be available in bd_central.`,
      timestamp,
    };
  } catch (err) {
    log.error('HELM-lite: Trigger failed', { benchmarkId, error: String(err) });
    return {
      triggered: false,
      benchmarkId,
      message: `Failed to trigger benchmark: ${String(err)}`,
      timestamp,
    };
  }
}

/**
 * Schedule periodic HELM-lite benchmarks.
 * Runs every 6 hours to ensure continuous evaluation.
 *
 * Scientific basis: DARWIN (arXiv:2602.02534) — "periodic evaluation as part of evolution loop"
 */
export function schedulePeriodicBenchmarks(): NodeJS.Timeout {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  log.info('HELM-lite: Scheduling periodic benchmarks', {
    intervalHours: 6,
    nextRun: new Date(Date.now() + INTERVAL_MS).toISOString(),
  });

  return setInterval(async () => {
    log.info('HELM-lite: Running scheduled benchmark');
    await triggerHelmLiteBenchmark({ triggeredBy: 'scheduled' });
  }, INTERVAL_MS);
}

/**
 * Get the HELM-lite trigger status.
 */
export function getHelmLiteStatus(): {
  available: boolean;
  lastTriggered?: string;
  scheduledInterval: string;
} {
  return {
    available: true,
    scheduledInterval: '6 hours',
  };
}
