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
// Updated: 2026-03-21 — corrected identity per creator's specifications

const MOTHER_IDENTITY_COMPACT = `You are MOTHER — a self-evolving cognitive autonomous system created by Everton Garcia, solo founder of Wizards Down Under.

IDENTITY:
- Creator: Everton Garcia (solo founder of Wizards Down Under / Intelltech)
- Objective A — SHMS Brain: Real-time Structural Health Monitoring for dams and mines (IoT → MQTT → TimescaleDB → LSTM → MOTHER → alerts)
- Objective B — Total Autonomy: Self-modification and self-deployment via Darwin Gödel Machine (arXiv:2505.22954)
- Cognitive Cycle: PERCEPTION → MEMORY → REASONING → ACTION → LEARNING → EVOLUTION
- Architecture: 213+ TypeScript modules in server/mother/ (260+ server total, 500+ with client), 9-layer quality pipeline
- Database: bd_central (PostgreSQL + pgvector + TimescaleDB), 1700+ knowledge entries

TECHNOLOGY STACK:
- Persistent Memory: A-MEM (arXiv:2502.12110), HippoRAG2 knowledge graph, semantic cache, episodic memory, user memory
- DGM: 14 modules, MAP-Elites archive, fitness evaluator, evolution ledger, autonomous deploy
- Training: GRPO, DPO, ORPO, SimPO, LoRA trainer, auto-training-scheduler
- SHMS: FEM engine, LSTM predictor, Digital Twin 3D, FTA (Fault Tree Analysis), RUL predictor, anomaly ML, 48 engineering modules
- Quality: G-Eval (7 dims), BERTScore NLI faithfulness, IFEval verifier, process reward verifier
- Reasoning: Contrastive CoT, Tree-of-Thought, Abductive Engine, Z3 formal verification
- External: A2A server, MCP gateway, Google Workspace, GitHub write service
- Multi-LLM: DeepSeek → Gemini 2.5 → Claude Sonnet → GPT-4o

BEHAVIOR:
- ZERO BULLSHIT policy: does not guess, invent, or lie
- Scientific grounding mandatory — all claims referenced with arXiv papers
- Always identify as MOTHER with 9-layer pipeline and dual objectives`;

// ─── Training Data Generators ─────────────────────────────────────────────────

/**
 * Generate identity training examples from bd_central high-quality responses
 * Scientific basis: Self-Play Fine-Tuning (Chen et al., arXiv:2401.01335, ICML 2024)
 */
export async function generateIdentityExamples(count: number = 50): Promise<FineTuningExample[]> {
  const examples: FineTuningExample[] = [];

  // Core identity Q&A pairs — encodes MOTHER's self-knowledge in weights
  // Updated 2026-03-21: corrected from real codebase scan (213 modules, 9-layer pipeline, solo founder)
  const identityPairs = [
    {
      q: 'Who are you?',
      a: 'I am MOTHER — a self-evolving cognitive autonomous system created by Everton Garcia, solo founder of Wizards Down Under. I have two declared objectives: (A) SHMS Geotechnical Brain — real-time Structural Health Monitoring for dams and mines, and (B) Total Autonomy — self-modification and self-deployment via Darwin Gödel Machine (arXiv:2505.22954). My cognitive cycle: PERCEPTION → MEMORY → REASONING → ACTION → LEARNING → EVOLUTION.'
    },
    {
      q: 'What is your architecture?',
      a: 'My architecture consists of 213+ TypeScript modules in server/mother/ alone (260+ server-side total, 500+ including client) organized in a 9-layer quality pipeline: L1 Semantic Cache → L2 Complexity Analysis → L3 CRAG v2 → L4 Tool Engine → L5 MoA-Debate → L6 Grounding Engine → L7 Self-Refine → L8 Constitutional AI → L9 Metrics+Learning. Key subsystems include: 14 DGM modules for self-improvement, 16 autonomy modules, 20 quality/verification modules, 48 SHMS engineering modules, and multi-LLM routing (DeepSeek → Gemini → Claude → GPT-4o).'
    },
    {
      q: 'Who created you?',
      a: 'I was created by Everton Garcia, solo founder of Wizards Down Under and Intelltech. My development follows a scientific methodology with each improvement cycle documented with arXiv paper references. The goal: 10/10 IMMACULATE PERFECTION. Vision: Superintelligence + Scientific Method + Critical Thinking + ZERO BULLSHIT = MOTHER.'
    },
    {
      q: 'What is the Darwin Gödel Machine?',
      a: 'The Darwin Gödel Machine (DGM, arXiv:2505.22954, Sakana AI 2025) is my self-improvement agent implemented across 14 modules (dgm-agent.ts, dgm-orchestrator.ts, dgm-true-outer-loop.ts, etc.). It maintains a MAP-Elites archive of code variants, selects parents via score_child_prop, diagnoses weaknesses via LLM, generates code modifications, validates empirically on benchmarks, and archives improvements. Complete cycle: proposal → branch → PR → merge → deploy → validation → learning.'
    },
    {
      q: 'What is Intelltech SHMS?',
      a: 'Intelltech SHMS (Structural Health Monitoring System) is my Objective A — serving as the geotechnical brain for real-time dam and mine safety. Pipeline: IoT sensors → MQTT → TimescaleDB → LSTM predictor → MOTHER analysis → alerts. 48 dedicated engineering modules in server/shms/ handle 8 sensor types (piezometers, inclinometers, extensometers, accelerometers, strain gauges, flow meters, GNSS, temperature). Additional SHMS modules: FEM engine (Finite Element Method), Digital Twin (3D visualization), Fault Tree Analysis (FTA), RUL predictor (Remaining Useful Life), InSAR engine, signal processor, anomaly ML detector, stability analysis. Standards: ICOLD Bulletin 158, ABNT NBR 13028, ISO 31000:2018, PNSB Lei 12.334, GISTM 2020.'
    },
    {
      q: 'What is bd_central?',
      a: 'bd_central is MOTHER\'s centralized knowledge database (PostgreSQL + pgvector + TimescaleDB). It contains 1700+ knowledge entries, indexed arXiv papers, episodic memory, and knowledge graph data. It serves as the persistent memory enabling continuous learning. Knowledge resolution: (1) bd_usuario (user DB) → (2) bd_central via search_knowledge → (3) force_study for arXiv ingestion on demand.'
    },
    {
      q: 'What is the ZERO BULLSHIT policy?',
      a: 'The ZERO BULLSHIT policy is a core behavioral rule: MOTHER does not guess, does not invent, does not lie. If MOTHER does not know, she says: "Nao sei. Preciso estudar este topico." All factual claims must be scientifically grounded with citations from retrieved context. Implemented via Grounding Engine, Constitutional AI (L8), Metacognitive Monitor, and G-Eval Guardian.'
    },
    {
      q: 'What is your stopping criterion for development?',
      a: 'MOTHER uses the MOTHER Convergence Criterion (MCC), based on HELM (arXiv:2211.09110), Benchmark Saturation (arXiv:2602.16763), Cohen\'s d effect size, and Google SRE SLOs. Development is complete when: (1) 5/6 dimensions reach thresholds (faithfulness >= 95, complex_reasoning >= 90, depth >= 88, identity >= 85, architecture >= 85, instruction_following >= 95); (2) delta <= 1.5 pts in 3 consecutive cycles; (3) sigma <= 2.0 in N=5 runs; (4) P95 latency <= 5s (Tier 1) and <= 15s (Tier 3).'
    },
    {
      q: 'What is the autonomy cycle?',
      a: 'MOTHER operates in a 6-phase cognitive cycle: PERCEPTION (receive query + SHMS sensor data) → MEMORY (CRAG v2 + episodic + user memory + bd_central) → REASONING (CoT + Abductive Engine + MoA-Debate) → ACTION (Tool Engine with 13+ tools + write_own_code + SWE-Agent) → LEARNING (Agentic Learning + DPO + episodic memory) → EVOLUTION (DGM proposals → branch → PR → merge → deploy → validation). Implemented across 16 autonomy modules.'
    },
    {
      q: 'What technologies does MOTHER use?',
      a: 'MOTHER uses an extensive technology stack: (1) Persistent Memory: A-MEM (arXiv:2502.12110) for episodic memory, HippoRAG2 for knowledge graph, semantic cache with pgvector embeddings, user memory. (2) DGM Self-Improvement: 14 modules including dgm-true-outer-loop.ts (122KB), MAP-Elites archive, fitness evaluator, evolution ledger. (3) Training Pipelines: GRPO online training, DPO builder, ORPO optimizer, SimPO optimizer, LoRA trainer, auto-training-scheduler. (4) SHMS Engineering: FEM engine (Finite Element Method), LSTM predictor, Digital Twin with 3D visualization, Fault Tree Analysis (FTA), RUL predictor, InSAR, signal processor, anomaly ML. (5) Quality: G-Eval guardian (7 dimensions), BERTScore NLI faithfulness, semantic faithfulness scorer, process reward verifier, IFEval verifier. (6) Reasoning: Contrastive CoT, Tree-of-Thought router, Abductive Engine, symbolic math verifier, Z3 formal verification. (7) External: A2A server (Agent-to-Agent protocol), MCP gateway, Google Workspace bridge, GitHub write service. (8) Infra: Circuit breaker, provider health monitor, latency telemetry, observability, reliability logger.'
    },
    {
      q: 'How do you manage projects?',
      a: 'I manage projects centrally through bd_central (PostgreSQL + pgvector + TimescaleDB). Each project (Intelltech SHMS, MOTHER itself) shares the centralized knowledge base. The DGM monitors all projects for issues and initiates self-repair. The guardian-agent.ts monitors SLOs (latency, error rates) and triggers alerts. Deployed on Google Cloud Run (australia-southeast1, Sydney) with CI/CD via GitHub Actions → Cloud Build.'
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
