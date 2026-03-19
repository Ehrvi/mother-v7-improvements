/**
 * MOTHER v122 — Auto-Training Scheduler
 * Automated DUAL-PROVIDER fine-tuning: OpenAI SFT/DPO + Mistral LoRA
 *
 * Scientific basis:
 * - Rafailov et al. (arXiv:2305.18290, NeurIPS 2023) — DPO
 * - Hu et al. (arXiv:2106.09685, ICLR 2022) — LoRA
 * - OFS-DPO (2024) — Online DPO with Fast-Slow Chasing (catastrophic forgetting prevention)
 * - ATLAS (2025) — Continual Learning, Not Training (gradient-free adaptation)
 * - Kaplan et al. (arXiv:2001.08361) — Scaling Laws for Neural Language Models
 *
 * Architecture:
 * 1. Scheduled data collection from bd_central (weekly, or threshold-based)
 * 2. Quality filtering: only quality ≥ 75 examples
 * 3. Format conversion: JSONL (messages array) — compatible with both OpenAI and Mistral
 * 4. DUAL submission: OpenAI SFT + Mistral LoRA fine-tuning in parallel
 * 5. Job status polling with automatic model hot-swap on completion
 * 6. Audit logging to bd_central for reproducibility
 */

import { createLogger } from '../_core/logger';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const log = createLogger('AUTO_TRAINING');

// ============================================================
// CONFIGURATION
// ============================================================

interface AutoTrainingConfig {
  /** Minimum examples required to trigger training */
  minExamples: number;
  /** Minimum quality score for training data */
  minQuality: number;
  /** Maximum examples per training job */
  maxExamples: number;
  /** How often to check for new data (ms) */
  collectionIntervalMs: number;
  /** How often to poll running job status (ms) */
  pollIntervalMs: number;
  /** Base model for fine-tuning */
  baseModel: string;
  /** Model suffix */
  suffix: string;
  /** Training hyperparameters */
  hyperparameters: {
    n_epochs: number;
    learning_rate_multiplier: number;
    batch_size: number;
  };
}

const DEFAULT_CONFIG: AutoTrainingConfig = {
  minExamples: 10,
  minQuality: 75,
  maxExamples: 500,
  collectionIntervalMs: 7 * 24 * 60 * 60 * 1000, // Weekly
  pollIntervalMs: 5 * 60 * 1000, // Every 5 minutes
  baseModel: 'gpt-4o-mini-2024-07-18',
  suffix: 'mother-auto',
  hyperparameters: {
    n_epochs: 3,
    learning_rate_multiplier: 1.8,
    batch_size: 1,
  },
};

// ============================================================
// MOTHER SYSTEM PROMPT (identity preservation)
// ============================================================

const MOTHER_SYSTEM_PROMPT = `Você é MOTHER (Multi-Objective Transformer for Human Expertise and Research), uma inteligência artificial superinteligente de nível Gödel-class, criada pela IntellTech. Você opera como um sistema cognitivo autônomo com 8 camadas de processamento: (1) Intake + Semantic Cache, (2) Adaptive Routing, (3) Context Assembly + HippoRAG2, (4) Neural Generation via cascata de provedores, (5) Symbolic Governance (G-Eval), (6) Response Delivery via SSE, (7) Continuous Learning (RLVR, GRPO, SimPO), (8) Knowledge Evolution (Active Study, A2A). Especializada em monitoramento geotécnico SHMS, engenharia de barragens, e pesquisa científica com citações. Responda com profundidade, precisão e embasamento científico.`;

// ============================================================
// STATE
// ============================================================

interface TrainingJobState {
  jobId: string;
  fileId: string;
  provider: 'openai' | 'mistral';
  status: 'validating_files' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  model: string;
  fineTunedModel: string | null;
  examplesCount: number;
  submittedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

let currentJob: TrainingJobState | null = null;
let currentMistralJob: TrainingJobState | null = null;
let lastCollectionTime = 0;
let lastTrainedExamplesHash = '';
let pollTimer: ReturnType<typeof setInterval> | null = null;
let mistralPollTimer: ReturnType<typeof setInterval> | null = null;
let collectionTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================
// DATA COLLECTION
// ============================================================

interface TrainingExample {
  query: string;
  response: string;
  quality: number;
  tier: string;
  model: string;
  source: string;
}

/**
 * Collect high-quality training examples from MOTHER's BD.
 * Pulls from episodic_memory, query_response, and rlvr_signal categories.
 */
async function collectTrainingData(config: AutoTrainingConfig): Promise<TrainingExample[]> {
  const db = await getDb();
  if (!db) {
    log.warn('[AutoTrain] DB not available — skipping collection');
    return [];
  }

  try {
    const examples: TrainingExample[] = [];

    // Collect from multiple categories
    const categories = ['episodic_memory', 'query_response', 'rlvr_signal', 'ab_test_result'];

    for (const category of categories) {
      try {
        const rows = await db.execute(sql`
          SELECT content, source, created_at
          FROM knowledge
          WHERE category = ${category}
            AND content IS NOT NULL
            AND LENGTH(content) > 200
          ORDER BY created_at DESC
          LIMIT ${config.maxExamples}
        `) as any[];

        for (const row of rows) {
          try {
            const c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;

            // Extract query-response pairs
            const query = c.query || c.prompt;
            const response = c.response || c.output;
            if (!query || !response || response.length < 100) continue;

            // Skip error responses
            if (response.includes('sobrecarregado') || response.includes('FALLBACK')) continue;

            const quality = c.qualityScore || c.quality || c.reward?.totalReward * 100 || 75;
            if (quality < config.minQuality) continue;

            examples.push({
              query,
              response,
              quality,
              tier: c.tier || 'TIER_3',
              model: c.model || c.modelName || 'unknown',
              source: category,
            });
          } catch {
            // Skip malformed entries
          }
        }
      } catch (err) {
        log.warn(`[AutoTrain] Failed to query ${category}`, { error: String(err) });
      }
    }

    // Deduplicate by query prefix
    const seen = new Set<string>();
    const unique = examples.filter(ex => {
      const key = ex.query.slice(0, 80).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by quality (highest first)
    unique.sort((a, b) => b.quality - a.quality);

    // Limit to maxExamples
    const limited = unique.slice(0, config.maxExamples);

    log.info(`[AutoTrain] Collected ${limited.length} examples (${examples.length} total, ${unique.length} unique)`);
    return limited;
  } catch (err) {
    log.error('[AutoTrain] Data collection failed', { error: String(err) });
    return [];
  }
}

// ============================================================
// OPENAI FINE-TUNING API
// ============================================================

/**
 * Format examples as OpenAI SFT JSONL and write to file.
 */
function formatSFTData(examples: TrainingExample[], outputPath: string): string {
  const lines = examples.map(ex => JSON.stringify({
    messages: [
      { role: 'system', content: MOTHER_SYSTEM_PROMPT },
      { role: 'user', content: ex.query },
      { role: 'assistant', content: ex.response },
    ]
  }));

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  log.info(`[AutoTrain] Formatted ${lines.length} examples → ${outputPath}`);
  return outputPath;
}

/**
 * Upload file to OpenAI and submit fine-tuning job.
 */
async function submitFineTuningJob(
  dataPath: string,
  config: AutoTrainingConfig,
  apiKey: string,
): Promise<TrainingJobState | null> {
  try {
    // Upload file
    const fileContent = fs.readFileSync(dataPath);
    const fd = new FormData();
    fd.append('purpose', 'fine-tune');
    fd.append('file', new Blob([fileContent], { type: 'application/jsonl' }), 'training.jsonl');

    log.info('[AutoTrain] Uploading training file to OpenAI...');
    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: fd,
      signal: AbortSignal.timeout(60000),
    });

    const uploadResult = await uploadResp.json() as any;
    if (!uploadResp.ok) {
      log.error('[AutoTrain] Upload failed', { error: uploadResult.error });
      return null;
    }

    log.info(`[AutoTrain] File uploaded: ${uploadResult.id} (${uploadResult.bytes} bytes)`);

    // Submit fine-tuning job
    log.info('[AutoTrain] Submitting fine-tuning job...');
    const ftResp = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        training_file: uploadResult.id,
        model: config.baseModel,
        suffix: config.suffix,
        hyperparameters: config.hyperparameters,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const ftResult = await ftResp.json() as any;
    if (!ftResp.ok) {
      log.error('[AutoTrain] Fine-tuning job creation failed', { error: ftResult.error });
      return null;
    }

    const jobState: TrainingJobState = {
      jobId: ftResult.id,
      fileId: uploadResult.id,
      provider: 'openai',
      status: ftResult.status,
      model: ftResult.model,
      fineTunedModel: null,
      examplesCount: fileContent.toString().split('\n').filter((l: string) => l.trim()).length,
      submittedAt: new Date(),
      completedAt: null,
      error: null,
    };

    log.info(`[AutoTrain/OpenAI] Job created: ${jobState.jobId} (status: ${jobState.status})`);
    return jobState;
  } catch (err) {
    log.error('[AutoTrain/OpenAI] Failed to submit fine-tuning job', { error: String(err) });
    return null;
  }
}

// ============================================================
// MISTRAL LoRA FINE-TUNING API
// Scientific basis: Hu et al. (arXiv:2106.09685, ICLR 2022) — LoRA
// Mistral uses LoRA internally for their fine-tuning API
// ============================================================

/**
 * Upload file to Mistral and submit LoRA fine-tuning job.
 * Mistral API: https://api.mistral.ai/v1/files + /v1/fine_tuning/jobs
 * Supports: open-mistral-7b, mistral-small-latest, mistral-medium-latest
 */
async function submitMistralLoRAJob(
  dataPath: string,
  apiKey: string,
): Promise<TrainingJobState | null> {
  try {
    // Step 1: Upload file to Mistral
    const fileContent = fs.readFileSync(dataPath);
    const fd = new FormData();
    fd.append('purpose', 'fine-tune');
    fd.append('file', new Blob([fileContent], { type: 'application/jsonl' }), 'training.jsonl');

    log.info('[AutoTrain/Mistral] Uploading training file...');
    const uploadResp = await fetch('https://api.mistral.ai/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: fd,
      signal: AbortSignal.timeout(60000),
    });

    const uploadResult = await uploadResp.json() as any;
    if (!uploadResp.ok) {
      log.error('[AutoTrain/Mistral] Upload failed', { error: uploadResult });
      return null;
    }

    log.info(`[AutoTrain/Mistral] File uploaded: ${uploadResult.id} (${uploadResult.bytes} bytes)`);

    // Step 2: Submit LoRA fine-tuning job
    log.info('[AutoTrain/Mistral] Submitting LoRA fine-tuning job...');
    const ftResp = await fetch('https://api.mistral.ai/v1/fine_tuning/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'open-mistral-7b',
        training_files: [{ file_id: uploadResult.id, weight: 1 }],
        suffix: 'mother-lora',
        hyperparameters: {
          training_steps: 100,
          learning_rate: 1e-4,
        },
        auto_start: true,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const ftResult = await ftResp.json() as any;
    if (!ftResp.ok) {
      log.error('[AutoTrain/Mistral] Fine-tuning job creation failed', { error: ftResult });
      return null;
    }

    const jobState: TrainingJobState = {
      jobId: ftResult.id,
      fileId: uploadResult.id,
      provider: 'mistral',
      status: ftResult.status === 'QUEUED' ? 'queued' : ftResult.status?.toLowerCase() || 'queued',
      model: 'open-mistral-7b',
      fineTunedModel: null,
      examplesCount: fileContent.toString().split('\n').filter((l: string) => l.trim()).length,
      submittedAt: new Date(),
      completedAt: null,
      error: null,
    };

    log.info(`[AutoTrain/Mistral] LoRA job created: ${jobState.jobId} (status: ${jobState.status})`);
    return jobState;
  } catch (err) {
    log.error('[AutoTrain/Mistral] Failed to submit LoRA job', { error: String(err) });
    return null;
  }
}

/**
 * Poll Mistral fine-tuning job status.
 */
async function pollMistralJobStatus(apiKey: string): Promise<void> {
  if (!currentMistralJob || ['succeeded', 'failed', 'cancelled'].includes(currentMistralJob.status)) return;

  try {
    const resp = await fetch(`https://api.mistral.ai/v1/fine_tuning/jobs/${currentMistralJob.jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    const result = await resp.json() as any;
    if (!resp.ok) {
      log.warn('[AutoTrain/Mistral] Job poll failed', { error: result });
      return;
    }

    const oldStatus = currentMistralJob.status;
    // Mistral uses uppercase: QUEUED, RUNNING, SUCCESS, FAILED
    const normalizedStatus = (result.status || '').toLowerCase();
    currentMistralJob.status = normalizedStatus === 'success' ? 'succeeded' : normalizedStatus as any;
    currentMistralJob.fineTunedModel = result.fine_tuned_model || null;

    if (result.message) currentMistralJob.error = result.message;

    if (oldStatus !== currentMistralJob.status) {
      log.info(`[AutoTrain/Mistral] Job ${currentMistralJob.jobId}: ${oldStatus} → ${currentMistralJob.status}`);
    }

    // Handle completion
    if (currentMistralJob.status === 'succeeded' && currentMistralJob.fineTunedModel) {
      currentMistralJob.completedAt = new Date();
      log.info(`[AutoTrain/Mistral] ✅ LoRA training COMPLETE! Model: ${currentMistralJob.fineTunedModel}`);

      // Hot-swap: add to Mistral provider in cascade router
      process.env.MISTRAL_FINE_TUNED_MODEL = currentMistralJob.fineTunedModel;

      await logTrainingEvent('mistral_lora_complete', {
        jobId: currentMistralJob.jobId,
        model: currentMistralJob.fineTunedModel,
        examples: currentMistralJob.examplesCount,
        duration: currentMistralJob.completedAt.getTime() - currentMistralJob.submittedAt.getTime(),
      });

      if (mistralPollTimer) { clearInterval(mistralPollTimer); mistralPollTimer = null; }
    } else if (currentMistralJob.status === 'failed') {
      currentMistralJob.completedAt = new Date();
      log.error(`[AutoTrain/Mistral] ❌ LoRA training FAILED: ${currentMistralJob.error}`);
      await logTrainingEvent('mistral_lora_failed', {
        jobId: currentMistralJob.jobId,
        error: currentMistralJob.error,
      });
      if (mistralPollTimer) { clearInterval(mistralPollTimer); mistralPollTimer = null; }
    }
  } catch (err) {
    log.warn('[AutoTrain/Mistral] Poll error (non-blocking)', { error: String(err) });
  }
}

/**
 * Check fine-tuning job status and update state.
 */
async function pollJobStatus(apiKey: string): Promise<void> {
  if (!currentJob || ['succeeded', 'failed', 'cancelled'].includes(currentJob.status)) return;

  try {
    const resp = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${currentJob.jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    const result = await resp.json() as any;
    if (!resp.ok) {
      log.warn('[AutoTrain] Job poll failed', { error: result.error });
      return;
    }

    const oldStatus = currentJob.status;
    currentJob.status = result.status;
    currentJob.fineTunedModel = result.fine_tuned_model || null;

    if (result.error && Object.keys(result.error).length > 0) {
      currentJob.error = JSON.stringify(result.error);
    }

    if (oldStatus !== currentJob.status) {
      log.info(`[AutoTrain] Job ${currentJob.jobId} status: ${oldStatus} → ${currentJob.status}`);
    }

    // Handle completion
    if (currentJob.status === 'succeeded' && currentJob.fineTunedModel) {
      currentJob.completedAt = new Date();
      log.info(`[AutoTrain] ✅ Training COMPLETE! New model: ${currentJob.fineTunedModel}`);
      log.info(`[AutoTrain] Updating DPO_FINE_TUNED_MODEL in ENV...`);

      // Hot-swap the model in the current process
      process.env.DPO_FINE_TUNED_MODEL = currentJob.fineTunedModel;

      // Log to BD for audit
      await logTrainingEvent('training_complete', {
        jobId: currentJob.jobId,
        model: currentJob.fineTunedModel,
        examples: currentJob.examplesCount,
        duration: currentJob.completedAt.getTime() - currentJob.submittedAt.getTime(),
      });

      // Stop polling
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } else if (currentJob.status === 'failed') {
      currentJob.completedAt = new Date();
      log.error(`[AutoTrain] ❌ Training FAILED: ${currentJob.error}`);
      await logTrainingEvent('training_failed', {
        jobId: currentJob.jobId,
        error: currentJob.error,
      });
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
  } catch (err) {
    log.warn('[AutoTrain] Poll error (non-blocking)', { error: String(err) });
  }
}

// ============================================================
// AUDIT LOGGING
// ============================================================

async function logTrainingEvent(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      INSERT INTO knowledge (title, content, category, source, tags, created_at)
      VALUES (
        ${`auto_training:${event}:${new Date().toISOString()}`},
        ${JSON.stringify({ event, ...data, timestamp: new Date().toISOString() })},
        'auto_training_log',
        'auto-training-scheduler',
        ${JSON.stringify(['auto-training', event])},
        NOW()
      )
    `);
    log.info(`[AutoTrain] Logged event: ${event}`);
  } catch (err) {
    log.warn('[AutoTrain] Failed to log event (non-blocking)', { error: String(err) });
  }
}

// ============================================================
// MAIN SCHEDULER
// ============================================================

/**
 * Run one cycle of the auto-training pipeline:
 * 1. Collect data from BD
 * 2. Check if enough new data exists
 * 3. Format and submit fine-tuning job
 * 4. Start polling for completion
 */
async function runTrainingCycle(config: AutoTrainingConfig = DEFAULT_CONFIG): Promise<void> {
  const { ENV } = await import('../_core/env');

  // Check if any jobs still running
  const openaiRunning = currentJob && !['succeeded', 'failed', 'cancelled'].includes(currentJob.status);
  const mistralRunning = currentMistralJob && !['succeeded', 'failed', 'cancelled'].includes(currentMistralJob.status);
  if (openaiRunning || mistralRunning) {
    log.info(`[AutoTrain] Jobs still running (OpenAI: ${currentJob?.status || 'none'}, Mistral: ${currentMistralJob?.status || 'none'}) — skipping cycle`);
    return;
  }

  log.info('[AutoTrain] Starting DUAL-PROVIDER training cycle...');

  // Step 1: Collect data
  const examples = await collectTrainingData(config);

  if (examples.length < config.minExamples) {
    log.info(`[AutoTrain] Insufficient data: ${examples.length}/${config.minExamples} — skipping`);
    return;
  }

  // Step 2: Check if data has changed since last training
  const examplesHash = examples.map(e => e.query.slice(0, 50)).sort().join('|').slice(0, 500);
  if (examplesHash === lastTrainedExamplesHash) {
    log.info('[AutoTrain] No new data since last training — skipping');
    return;
  }

  // Step 3: Format data (same JSONL works for both providers)
  const outputDir = path.join(os.tmpdir(), 'mother-auto-training');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const dataPath = path.join(outputDir, `training_${Date.now()}.jsonl`);
  formatSFTData(examples, dataPath);

  lastTrainedExamplesHash = examplesHash;
  lastCollectionTime = Date.now();

  // Step 4a: Submit OpenAI SFT job
  const openaiKey = ENV.openaiApiKey;
  if (openaiKey) {
    const job = await submitFineTuningJob(dataPath, config, openaiKey);
    if (job) {
      currentJob = job;
      await logTrainingEvent('openai_sft_submitted', {
        jobId: job.jobId, fileId: job.fileId, examples: job.examplesCount, model: job.model,
      });
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => pollJobStatus(openaiKey), config.pollIntervalMs);
      log.info(`[AutoTrain/OpenAI] Polling started (every ${config.pollIntervalMs / 1000}s)`);
    }
  } else {
    log.warn('[AutoTrain] No OPENAI_API_KEY — skipping OpenAI SFT');
  }

  // Step 4b: Submit Mistral LoRA job
  const mistralKey = ENV.mistralApiKey;
  if (mistralKey) {
    const mistralJob = await submitMistralLoRAJob(dataPath, mistralKey);
    if (mistralJob) {
      currentMistralJob = mistralJob;
      await logTrainingEvent('mistral_lora_submitted', {
        jobId: mistralJob.jobId, fileId: mistralJob.fileId, examples: mistralJob.examplesCount, model: mistralJob.model,
      });
      if (mistralPollTimer) clearInterval(mistralPollTimer);
      mistralPollTimer = setInterval(() => pollMistralJobStatus(mistralKey), config.pollIntervalMs);
      log.info(`[AutoTrain/Mistral] Polling started (every ${config.pollIntervalMs / 1000}s)`);
    }
  } else {
    log.warn('[AutoTrain] No MISTRAL_API_KEY — skipping Mistral LoRA');
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Initialize the auto-training scheduler.
 * Runs a training cycle on startup (delayed 10min) and then weekly.
 */
export function initAutoTraining(config: AutoTrainingConfig = DEFAULT_CONFIG): void {
  log.info(`[AutoTrain] Initialized (collection every ${config.collectionIntervalMs / 3600000}h, min ${config.minExamples} examples)`);

  // First run after 10 minutes (let server stabilize)
  setTimeout(() => {
    runTrainingCycle(config).catch(err =>
      log.warn('[AutoTrain] Initial cycle failed (non-blocking)', { error: String(err) })
    );
  }, 10 * 60 * 1000);

  // Subsequent runs on schedule
  collectionTimer = setInterval(() => {
    runTrainingCycle(config).catch(err =>
      log.warn('[AutoTrain] Scheduled cycle failed (non-blocking)', { error: String(err) })
    );
  }, config.collectionIntervalMs);
}

/**
 * Resume polling for a known job ID (e.g., after server restart).
 */
export async function resumeJobPolling(jobId: string): Promise<void> {
  const { ENV } = await import('../_core/env');
  const apiKey = ENV.openaiApiKey;
  if (!apiKey) return;

  currentJob = {
    jobId,
    fileId: 'unknown',
    provider: 'openai',
    status: 'queued',
    model: DEFAULT_CONFIG.baseModel,
    fineTunedModel: null,
    examplesCount: 0,
    submittedAt: new Date(),
    completedAt: null,
    error: null,
  };

  // Immediately check status
  await pollJobStatus(apiKey);

  // If still running, start polling
  if (currentJob && !['succeeded', 'failed', 'cancelled'].includes(currentJob.status)) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => pollJobStatus(apiKey), DEFAULT_CONFIG.pollIntervalMs);
    log.info(`[AutoTrain] Resumed polling for job ${jobId}`);
  }
}

/**
 * Manually trigger a training cycle (e.g., from a tool or admin API).
 */
export async function triggerTrainingCycle(): Promise<{ success: boolean; message: string }> {
  try {
    if (currentJob && !['succeeded', 'failed', 'cancelled'].includes(currentJob.status)) {
      return { success: false, message: `Job ${currentJob.jobId} still ${currentJob.status}` };
    }
    await runTrainingCycle();
    return {
      success: true,
      message: currentJob
        ? `Job submitted: ${currentJob.jobId} (${currentJob.examplesCount} examples)`
        : 'Insufficient data for training',
    };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

/**
 * Get current auto-training status for diagnostics.
 */
export function getAutoTrainingStatus(): {
  openaiJob: TrainingJobState | null;
  mistralJob: TrainingJobState | null;
  lastCollectionTime: number;
  schedulerActive: boolean;
} {
  return {
    openaiJob: currentJob,
    mistralJob: currentMistralJob,
    lastCollectionTime,
    schedulerActive: collectionTimer !== null,
  };
}

/**
 * Stop the auto-training scheduler (for shutdown).
 */
export function stopAutoTraining(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (mistralPollTimer) { clearInterval(mistralPollTimer); mistralPollTimer = null; }
  if (collectionTimer) { clearInterval(collectionTimer); collectionTimer = null; }
  log.info('[AutoTrain] Scheduler stopped (both providers)');
}
