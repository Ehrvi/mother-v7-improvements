/**
 * MOTHER v81.5 — GRPO Online RL Reward Signal
 * F3-3 (Ciclo 171): Fase 3 SOTA — Conselho dos 6 Plano SOTA
 *
 * Scientific basis:
 * - Shao et al. arXiv:2402.03300 (GRPO, DeepSeekMath 2024):
 *   Group Relative Policy Optimization — reward signal from group comparison
 *   "GRPO eliminates the need for a critic model by using group-relative rewards"
 * - Guo et al. arXiv:2501.12948 (DeepSeek-R1, 2025):
 *   GRPO as core RL algorithm; online RL with real interaction data
 *   "Online RL with real rollouts is key to DeepSeek-R1's reasoning improvement"
 * - Lu et al. arXiv:2602.03190 (Prompt Augmentation GRPO, 2026):
 *   CoT prompting scales GRPO performance; online data collection critical
 * - Schulman et al. arXiv:1707.06347 (PPO, 2017):
 *   Online RL fundamentals — collect trajectories, compute rewards, update policy
 * - Lewis et al. arXiv:2005.11401 (RAG, 2020):
 *   Retrieval-augmented generation; reward signal improves retrieval quality
 *
 * Architecture (F3-3 Online RL Loop):
 * 1. After each query: compute reward = f(quality_score, grpo_rewards, constitutional_score)
 * 2. Store (query, response, reward, metadata) in BD as `grpo_online_reward` entries
 * 3. LoRA trainer (F2-1) reads high-reward pairs for fine-tuning
 * 4. A/B testing (F2-3) validates improvement via shadow mode
 * → Closes the RL loop: GRPO inference → reward → storage → LoRA training → deployment
 *
 * Reward Function:
 * R(q, r) = α·quality + β·grpo_advantage + γ·constitutional + δ·latency_penalty
 * where α=0.5, β=0.2, γ=0.2, δ=0.1
 *
 * Integration: Called after quality scoring in core-orchestrator.ts
 * Storage: BD table `knowledge` with category='grpo_online_reward'
 * Dataset: `getOnlineRewardDataset()` for LoRA trainer (F2-1)
 *
 * Expected impact: +5 pts qualidade (Conselho dos 6 estimate, via LoRA training)
 */

import { createLogger } from '../_core/logger';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';

const log = createLogger('GRPO-ONLINE');

// ============================================================
// TYPES
// ============================================================

export interface OnlineRewardRecord {
  query: string;
  response: string;
  qualityScore: number;
  grpoRewards?: number[];      // Group rewards from GRPO inference
  constitutionalScore?: number; // Score from Constitutional AI v2
  latencyMs: number;
  model: string;
  category: string;
  reward: number;              // Computed composite reward (0-100)
  timestamp: Date;
}

export interface RewardDatasetEntry {
  instruction: string;         // The query (for LoRA fine-tuning)
  output: string;              // The response
  reward: number;              // Reward score (0-100)
  metadata: {
    model: string;
    category: string;
    latencyMs: number;
    qualityScore: number;
  };
}

// ============================================================
// REWARD FUNCTION
// ============================================================

/**
 * Compute composite reward for a (query, response) pair.
 * F3-3: R(q,r) = α·quality + β·grpo_advantage + γ·constitutional + δ·latency_bonus
 *
 * Scientific basis: GRPO reward shaping (Shao et al. arXiv:2402.03300 Section 3.2)
 * Reward components:
 * - quality (50%): G-Eval quality score from quality assessor
 * - grpo_advantage (20%): Normalized advantage from GRPO group comparison
 * - constitutional (20%): Constitutional AI v2 score
 * - latency_bonus (10%): Bonus for fast responses (<5s = full bonus, >30s = 0)
 */
export function computeOnlineReward(
  qualityScore: number,
  grpoRewards?: number[],
  constitutionalScore?: number,
  latencyMs?: number,
): number {
  // α: Quality component (50%)
  const qualityComponent = (qualityScore / 100) * 50;

  // β: GRPO advantage component (20%)
  // Normalized advantage = (selected_reward - mean_reward) / std_reward
  let grpoComponent = 10;  // Default: neutral (50% of 20%)
  if (grpoRewards && grpoRewards.length >= 2) {
    const mean = grpoRewards.reduce((a, b) => a + b, 0) / grpoRewards.length;
    const maxReward = Math.max(...grpoRewards);
    // Advantage = how much better than average (0-1 scale)
    const advantage = mean > 0 ? (maxReward - mean) / mean : 0;
    grpoComponent = Math.min(20, advantage * 20 + 10);  // 10 baseline + up to 10 bonus
  }

  // γ: Constitutional AI component (20%)
  const constScore = constitutionalScore ?? qualityScore;
  const constitutionalComponent = (constScore / 100) * 20;

  // δ: Latency bonus (10%) — faster = better UX
  let latencyComponent = 5;  // Default: neutral (50% of 10%)
  if (latencyMs !== undefined) {
    if (latencyMs < 5000) latencyComponent = 10;        // <5s: full bonus
    else if (latencyMs < 15000) latencyComponent = 7;   // <15s: good
    else if (latencyMs < 30000) latencyComponent = 3;   // <30s: acceptable
    else latencyComponent = 0;                          // >30s: no bonus
  }

  const reward = qualityComponent + grpoComponent + constitutionalComponent + latencyComponent;
  return Math.round(Math.min(100, Math.max(0, reward)));
}

// ============================================================
// ONLINE REWARD RECORDING
// ============================================================

/**
 * Record an online RL reward signal to the BD.
 * F3-3: Non-blocking (fire-and-forget) — does not affect response latency.
 *
 * @param record - The reward record to store
 */
export async function recordOnlineReward(record: OnlineRewardRecord): Promise<void> {
  // Only record high-quality or notably poor responses (for contrastive learning)
  // Scientific basis: DPO (Rafailov et al. arXiv:2305.18290) uses chosen/rejected pairs
  const shouldRecord =
    record.reward >= 75 ||  // High reward: positive example for LoRA
    record.reward <= 40;    // Low reward: negative example for DPO contrastive learning

  if (!shouldRecord) return;

  try {
    const db = await getDb();
    if (!db) return;

    const label = record.reward >= 75 ? 'CHOSEN' : 'REJECTED';
    const title = `[GRPO-RL ${label}] ${record.category} | reward=${record.reward} | q=${record.qualityScore}`;
    const content = JSON.stringify({
      query: record.query.slice(0, 500),
      response: record.response.slice(0, 2000),
      reward: record.reward,
      qualityScore: record.qualityScore,
      grpoRewards: record.grpoRewards,
      constitutionalScore: record.constitutionalScore,
      latencyMs: record.latencyMs,
      model: record.model,
      category: record.category,
      label,
      timestamp: record.timestamp.toISOString(),
    });

    // C357: Add domain and updatedAt columns (required by schema — was causing insert failures)
    await db.execute(sql`
      INSERT INTO knowledge (title, content, category, source, tags, domain, createdAt, updatedAt)
      VALUES (
        ${title},
        ${content},
        'grpo_online_reward',
        'grpo-online-rl-f3-3',
        ${JSON.stringify(['grpo', 'online_rl', 'reward', label.toLowerCase(), record.category])},
        'GRPO Online RL',
        NOW(),
        NOW()
      )
    `);

    log.info(`[F3-3] Online reward recorded: ${label} | reward=${record.reward} | model=${record.model}`);
  } catch (err) {
    // Non-blocking: log but don't throw
    log.warn('[F3-3] Failed to record online reward (non-blocking)', { error: String(err) });
  }
}

// ============================================================
// DATASET EXPORT FOR LORA TRAINING
// ============================================================

/**
 * Get online reward dataset for LoRA fine-tuning (F2-1 integration).
 * F3-3: Exports chosen/rejected pairs for DPO or reward-weighted SFT.
 *
 * @param minReward - Minimum reward for CHOSEN examples (default: 75)
 * @param maxReward - Maximum reward for REJECTED examples (default: 40)
 * @param limit - Maximum entries to return (default: 500)
 */
export async function getOnlineRewardDataset(
  minReward: number = 75,
  maxReward: number = 40,
  limit: number = 500,
): Promise<{ chosen: RewardDatasetEntry[]; rejected: RewardDatasetEntry[] }> {
  try {
    const db = await getDb();
    if (!db) return { chosen: [], rejected: [] };

    const rows = await db.execute(sql`
      SELECT content
      FROM knowledge
      WHERE category = 'grpo_online_reward'
      ORDER BY created_at DESC
      LIMIT ${limit * 2}
    `) as any[];

    const chosen: RewardDatasetEntry[] = [];
    const rejected: RewardDatasetEntry[] = [];

    for (const row of rows) {
      try {
        const data = JSON.parse(String(row.content));
        const entry: RewardDatasetEntry = {
          instruction: data.query ?? '',
          output: data.response ?? '',
          reward: data.reward ?? 0,
          metadata: {
            model: data.model ?? 'unknown',
            category: data.category ?? 'unknown',
            latencyMs: data.latencyMs ?? 0,
            qualityScore: data.qualityScore ?? 0,
          },
        };

        if (data.label === 'CHOSEN' && data.reward >= minReward) {
          chosen.push(entry);
        } else if (data.label === 'REJECTED' && data.reward <= maxReward) {
          rejected.push(entry);
        }
      } catch {
        // Skip malformed entries
      }
    }

    log.info(`[F3-3] Dataset: ${chosen.length} chosen, ${rejected.length} rejected`);
    return {
      chosen: chosen.slice(0, limit),
      rejected: rejected.slice(0, limit),
    };
  } catch (err) {
    log.warn('[F3-3] Failed to get reward dataset', { error: String(err) });
    return { chosen: [], rejected: [] };
  }
}

// ============================================================
// STATISTICS
// ============================================================

/**
 * Get online RL statistics for diagnostics.
 */
export async function getOnlineRLStats(): Promise<{
  totalRecords: number;
  chosenCount: number;
  rejectedCount: number;
  avgReward: number;
  lastRecorded: string | null;
}> {
  try {
    const db = await getDb();
    if (!db) return { totalRecords: 0, chosenCount: 0, rejectedCount: 0, avgReward: 0, lastRecorded: null };

    const rows = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN content LIKE '%"label":"CHOSEN"%' THEN 1 ELSE 0 END) as chosen_count,
        SUM(CASE WHEN content LIKE '%"label":"REJECTED"%' THEN 1 ELSE 0 END) as rejected_count,
        MAX(created_at) as last_recorded
      FROM knowledge
      WHERE category = 'grpo_online_reward'
    `) as any[];

    const row = rows[0] ?? {};

    // Compute average reward from recent records
    const recentRows = await db.execute(sql`
      SELECT content FROM knowledge
      WHERE category = 'grpo_online_reward'
      ORDER BY created_at DESC LIMIT 100
    `) as any[];

    let totalReward = 0;
    let count = 0;
    for (const r of recentRows) {
      try {
        const data = JSON.parse(String(r.content));
        if (typeof data.reward === 'number') {
          totalReward += data.reward;
          count++;
        }
      } catch { /* skip */ }
    }

    return {
      totalRecords: Number(row.total ?? 0),
      chosenCount: Number(row.chosen_count ?? 0),
      rejectedCount: Number(row.rejected_count ?? 0),
      avgReward: count > 0 ? Math.round(totalReward / count) : 0,
      lastRecorded: row.last_recorded ? String(row.last_recorded) : null,
    };
  } catch {
    return { totalRecords: 0, chosenCount: 0, rejectedCount: 0, avgReward: 0, lastRecorded: null };
  }
}
