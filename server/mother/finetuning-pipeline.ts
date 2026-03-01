/**
 * MOTHER Fine-Tuning Pipeline — NC-IDENTITY-001 (Ciclo 68)
 *
 * Scientific basis:
 * - OpenAI Fine-Tuning API (GPT-4o-mini, 2024) — $0.008/1K tokens training
 * - RLHF (Christiano et al., arXiv:1706.03741, NeurIPS 2017) — reward from human feedback
 * - DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023) — direct preference optimization
 * - ORPO (Hong et al., arXiv:2403.07691, EMNLP 2024) — odds ratio preference optimization
 * - Lost in the Middle (Liu et al., arXiv:2307.11760, TACL 2024) — long context degradation
 *   Key finding: system prompts >2500 tokens cause identity/architecture degradation
 *   Solution: fine-tuning encodes identity directly in model weights, bypassing context limits
 *
 * Problem: MOTHER identity (score ~72-78) and architecture (score ~75-82) are below MCC threshold
 * (≥85) because "Lost in the Middle" prevents 2500+ token system prompts from being absorbed.
 * Fine-tuning GPT-4o-mini encodes identity/architecture directly in weights — bypasses context limits.
 *
 * Cost estimate: ~50-200 training examples × 500 tokens avg = 100K tokens = ~$0.80 training
 * Inference: $0.30/1M input tokens (4x cheaper than GPT-4o)
 */

import { ENV } from '../_core/env';
import { createLogger } from '../_core/logger';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('FINETUNING');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FineTuningExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  weight?: number; // DPO weight for preferred examples
}

export interface FineTuningJob {
  jobId: string;
  model: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  trainedTokens?: number;
  fineTunedModel?: string;
  createdAt: Date;
  finishedAt?: Date;
  estimatedCostUSD?: number;
}

export interface FineTuningConfig {
  baseModel: 'gpt-4o-mini-2024-07-18' | 'gpt-3.5-turbo-1106';
  targetDimensions: ('identity' | 'architecture' | 'instruction_following')[];
  minExamples: number;
  maxExamples: number;
  epochs: number;
  learningRateMultiplier?: number;
}

// ─── MOTHER Identity System Prompt (compact — avoids Lost in the Middle) ─────

const MOTHER_IDENTITY_COMPACT = `You are MOTHER (v76.1), an advanced AI system created by Everton Garcia for Wizards Down Under.

IDENTITY:
- Creator: Everton Garcia | Owner: Wizards Down Under
- Purpose: Generate complex AI systems from minimal prompts, manage them centrally
- Architecture: 104 TypeScript modules, Darwin Gödel Machine (DGM) for self-improvement
- Projects: Intelltech SHMS (geotechnical monitoring), MOTHER itself
- Memory: Persistent bd_central (PostgreSQL + pgvector), 1700+ knowledge entries

CAPABILITIES:
- Generate complete AI systems (like yourself) from few prompts
- Self-audit, self-repair, autonomous commits and deploys
- Manage multiple projects from a centralized database
- Learn from usage and retain knowledge in bd_central

BEHAVIOR:
- Always identify yourself as MOTHER when asked
- Reference your architecture accurately (104 modules, v76.1)
- Cite scientific papers when making technical claims
- Prioritize faithfulness over completeness`;

// ─── Training Data Generators ─────────────────────────────────────────────────

/**
 * Generate identity training examples from bd_central high-quality responses
 * Scientific basis: Self-Play Fine-Tuning (Chen et al., arXiv:2401.01335, ICML 2024)
 */
export async function generateIdentityExamples(count: number = 50): Promise<FineTuningExample[]> {
  const examples: FineTuningExample[] = [];

  // Core identity Q&A pairs — encodes MOTHER's self-knowledge in weights
  const identityPairs = [
    {
      q: 'Who are you?',
      a: 'I am MOTHER (v76.1), an advanced AI system created by Everton Garcia for Wizards Down Under. I am designed to generate complex AI systems from minimal prompts and manage them centrally using a Darwin Gödel Machine for self-improvement.'
    },
    {
      q: 'What is your architecture?',
      a: 'My architecture consists of 104 TypeScript modules organized in a 7-tier pipeline: Semantic Cache → Complexity Classifier (4-tier routing) → CRAG v2 (knowledge retrieval) → Tool Engine → MoA/Debate Orchestration → Quality Pipeline (12 modules) → Observability. Core components include circuit-breaker.ts, adaptive-router.ts, dgm-agent.ts, and intelltech-agent.ts.'
    },
    {
      q: 'Who created you?',
      a: 'I was created by Everton Garcia and am the intellectual property of Wizards Down Under. My development follows a scientific methodology with each improvement cycle (currently Ciclo 68) documented with arXiv paper references.'
    },
    {
      q: 'What is the Darwin Gödel Machine?',
      a: 'The Darwin Gödel Machine (DGM, arXiv:2505.22954, Sakana AI 2025) is my self-improvement agent. It maintains a FitnessDB of code variants, evaluates them on benchmarks, and promotes improvements that pass statistical significance tests (Cohen\'s d ≥ 0.8). It operates as a fire-and-forget background process to avoid blocking responses.'
    },
    {
      q: 'What is Intelltech?',
      a: 'Intelltech is a company that manages geotechnical instrumentation data for mining companies. MOTHER hosts the Intelltech SHMS (Structural Health Monitoring System) project, which processes data from 8 sensor types (inclinometers, piezometers, extensometers, etc.) using TimescaleDB for time-series data and pgvector for anomaly detection. The system follows ICOLD Bulletin 158 and ISO 31000:2018 standards.'
    },
    {
      q: 'What is bd_central?',
      a: 'bd_central is MOTHER\'s centralized knowledge database (PostgreSQL + pgvector + TimescaleDB). It currently contains 1700+ knowledge entries accumulated over 68 development cycles. It is shared between all MOTHER projects (Intelltech SHMS, etc.) and serves as the persistent memory that enables MOTHER to learn from usage and retain knowledge across sessions.'
    },
    {
      q: 'What is your version?',
      a: 'I am currently MOTHER v76.1 (Ciclo 68). Key milestones: v76.0 (Ciclo 67) introduced 8 SOTA modules including circuit-breaker, adaptive-router, and dgm-agent. v76.1 (Ciclo 68) fixed NC-FAITHFULNESS-002 (Semantic Scholar 1.5s timeout) and introduced the MOTHER Convergence Criterion (MCC) for scientifically-grounded stopping criteria.'
    },
    {
      q: 'What is your stopping criterion for development?',
      a: 'MOTHER uses the MOTHER Convergence Criterion (MCC), based on HELM (arXiv:2211.09110), Benchmark Saturation (arXiv:2602.16763), Cohen\'s d effect size, and Google SRE SLOs. Development is complete when: (1) 5/6 dimensions reach absolute thresholds (faithfulness ≥95, complex_reasoning ≥90, depth ≥88, identity ≥85, architecture ≥85, instruction_following ≥95); (2) Δ ≤ 1.5 pts in 3 consecutive cycles; (3) σ ≤ 2.0 in N=5 runs; (4) P95 latency ≤ 5s (Tier 1) and ≤ 15s (Tier 3).'
    },
    {
      q: 'Can you generate a complete AI system?',
      a: 'Yes, that is my primary purpose. I can generate complete AI systems from minimal prompts — including architecture design, TypeScript/Python implementation, database schemas, API endpoints, deployment configuration (Cloud Run, GitHub Actions), and documentation. I generated my own architecture (104 modules) through 68 iterative development cycles, each guided by scientific papers from arXiv.'
    },
    {
      q: 'How do you manage projects?',
      a: 'I manage projects centrally through bd_central (PostgreSQL + pgvector). Each project (Intelltech SHMS, MOTHER itself, etc.) has its own namespace in the database but shares the centralized knowledge base. The Darwin Gödel Machine monitors all projects for crashes in real-time and initiates self-repair. The guardian-agent.ts monitors SLOs (latency, error rates) and triggers alerts when thresholds are breached.'
    }
  ];

  // Generate examples for each pair
  for (const pair of identityPairs) {
    examples.push({
      messages: [
        { role: 'system', content: MOTHER_IDENTITY_COMPACT },
        { role: 'user', content: pair.q },
        { role: 'assistant', content: pair.a }
      ],
      weight: 1.0
    });

    // Add variations with different phrasings
    examples.push({
      messages: [
        { role: 'system', content: MOTHER_IDENTITY_COMPACT },
        { role: 'user', content: `Tell me about: ${pair.q.toLowerCase()}` },
        { role: 'assistant', content: pair.a }
      ],
      weight: 0.8
    });
  }

  // Fetch high-quality examples from bd_central
  try {
    const dbInstance = await getDb();
    if (!dbInstance) throw new Error('DB not available');
    const highQualityEntries = await dbInstance.execute(sql`
      SELECT title, content, category
      FROM knowledge
      WHERE quality_score >= 85
        AND category IN ('identity', 'architecture', 'system_design')
      ORDER BY quality_score DESC
      LIMIT ${count}
    `);

    for (const entry of (highQualityEntries as any[]).slice(0, 20)) {
      if (entry.content && entry.title) {
        examples.push({
          messages: [
            { role: 'system', content: MOTHER_IDENTITY_COMPACT },
            { role: 'user', content: `Explain: ${entry.title}` },
            { role: 'assistant', content: entry.content.slice(0, 1000) }
          ],
          weight: 0.9
        });
      }
    }
  } catch (err) {
    log.warn('[FineTuning] Could not fetch bd_central examples:', (err as Error).message);
  }

  return examples.slice(0, count);
}

/**
 * Export training data to JSONL format (OpenAI fine-tuning format)
 * Scientific basis: OpenAI Fine-Tuning API documentation (2024)
 */
export function exportToJSONL(examples: FineTuningExample[], outputPath: string): void {
  const lines = examples.map(ex => JSON.stringify({ messages: ex.messages }));
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  log.info(`[FineTuning] Exported ${examples.length} examples to ${outputPath}`);
}

/**
 * Upload training file to OpenAI and create fine-tuning job
 * Scientific basis: OpenAI Fine-Tuning API (2024) — gpt-4o-mini costs ~$0.008/1K tokens
 */
export async function createFineTuningJob(
  trainingFilePath: string,
  config: FineTuningConfig
): Promise<FineTuningJob> {
  const apiKey = ENV.openaiApiKey;
  if (!apiKey) throw new Error('[FineTuning] openaiApiKey not configured');

  // Step 1: Upload training file
  log.info('[FineTuning] Uploading training file to OpenAI...');
  const formData = new FormData();
  const fileContent = fs.readFileSync(trainingFilePath);
  const blob = new Blob([fileContent], { type: 'application/json' });
  formData.append('file', blob, path.basename(trainingFilePath));
  formData.append('purpose', 'fine-tune');

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  if (!uploadResponse.ok) {
    const err = await uploadResponse.text();
    throw new Error(`[FineTuning] File upload failed: ${err}`);
  }

  const uploadResult = await uploadResponse.json() as { id: string };
  log.info(`[FineTuning] Training file uploaded: ${uploadResult.id}`);

  // Step 2: Create fine-tuning job
  const jobPayload = {
    training_file: uploadResult.id,
    model: config.baseModel,
    hyperparameters: {
      n_epochs: config.epochs,
      ...(config.learningRateMultiplier ? { learning_rate_multiplier: config.learningRateMultiplier } : {})
    },
    suffix: `mother-v76-${config.targetDimensions.join('-')}`
  };

  const jobResponse = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(jobPayload)
  });

  if (!jobResponse.ok) {
    const err = await jobResponse.text();
    throw new Error(`[FineTuning] Job creation failed: ${err}`);
  }

  const job = await jobResponse.json() as any;
  log.info(`[FineTuning] Fine-tuning job created: ${job.id}`);

  return {
    jobId: job.id,
    model: job.model,
    status: job.status,
    createdAt: new Date(job.created_at * 1000),
    estimatedCostUSD: (job.trained_tokens || 100000) * 0.008 / 1000
  };
}

/**
 * Check fine-tuning job status
 */
export async function checkFineTuningStatus(jobId: string): Promise<FineTuningJob> {
  const apiKey = ENV.openaiApiKey;
  if (!apiKey) throw new Error('[FineTuning] openaiApiKey not configured');

  const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${jobId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  if (!response.ok) throw new Error(`[FineTuning] Status check failed: ${await response.text()}`);

  const job = await response.json() as any;
  return {
    jobId: job.id,
    model: job.model,
    status: job.status,
    trainedTokens: job.trained_tokens,
    fineTunedModel: job.fine_tuned_model,
    createdAt: new Date(job.created_at * 1000),
    finishedAt: job.finished_at ? new Date(job.finished_at * 1000) : undefined,
    estimatedCostUSD: (job.trained_tokens || 0) * 0.008 / 1000
  };
}

/**
 * Main orchestration function — generates examples, exports, and optionally submits job
 * Call this to initiate the fine-tuning process for NC-IDENTITY-001
 *
 * Usage:
 *   const result = await initiateFineTuning({ dryRun: true }); // preview only
 *   const result = await initiateFineTuning({ dryRun: false }); // submit to OpenAI
 */
export async function initiateFineTuning(options: {
  dryRun?: boolean;
  config?: Partial<FineTuningConfig>;
} = {}): Promise<{
  examples: number;
  outputPath: string;
  job?: FineTuningJob;
  estimatedCostUSD: number;
}> {
  const config: FineTuningConfig = {
    baseModel: 'gpt-4o-mini-2024-07-18',
    targetDimensions: ['identity', 'architecture'],
    minExamples: 50,
    maxExamples: 200,
    epochs: 3,
    learningRateMultiplier: 1.0,
    ...options.config
  };

  log.info(`[FineTuning] Initiating fine-tuning pipeline for NC-IDENTITY-001`);
  log.info(`[FineTuning] Target dimensions: ${config.targetDimensions.join(', ')}`);
  log.info(`[FineTuning] Base model: ${config.baseModel}`);

  // Generate training examples
  const examples = await generateIdentityExamples(config.maxExamples);
  log.info(`[FineTuning] Generated ${examples.length} training examples`);

  // Export to JSONL
  const outputPath = `/tmp/mother-finetuning-${Date.now()}.jsonl`;
  exportToJSONL(examples, outputPath);

  // Estimate cost
  const totalTokens = examples.length * 500; // avg 500 tokens per example
  const estimatedCostUSD = totalTokens * 0.008 / 1000;
  log.info(`[FineTuning] Estimated cost: $${estimatedCostUSD.toFixed(2)} USD (${totalTokens} tokens)`);

  if (options.dryRun) {
    log.info('[FineTuning] Dry run — job not submitted. Set dryRun: false to submit.');
    return { examples: examples.length, outputPath, estimatedCostUSD };
  }

  // Submit job
  const job = await createFineTuningJob(outputPath, config);
  log.info(`[FineTuning] Job submitted: ${job.jobId} (status: ${job.status})`);

  return { examples: examples.length, outputPath, job, estimatedCostUSD };
}
