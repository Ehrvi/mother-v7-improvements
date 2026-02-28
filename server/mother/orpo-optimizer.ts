/**
 * ORPO — Odds Ratio Preference Optimization
 * MOTHER v75.5 — Ciclo 56 — Action 3
 *
 * Scientific basis:
 *   - ORPO (Hong et al., arXiv:2403.07691, EMNLP 2024):
 *     Monolithic alignment without a reference model. Combines SFT loss with
 *     an odds ratio penalty that penalizes disfavored responses. Achieves
 *     state-of-the-art on MT-Bench, AlpacaEval 2.0, and IFEval without
 *     needing a separate reference model (unlike DPO/SimPO).
 *
 *   - Key formula: L_ORPO = L_SFT + λ * L_OR
 *     where L_OR = -log(σ(log(odds_w / odds_l)))
 *     odds_w = P(y_w|x) / (1 - P(y_w|x))  [winning response odds]
 *     odds_l = P(y_l|x) / (1 - P(y_l|x))  [losing response odds]
 *
 *   - Advantage over DPO: No reference model needed → simpler, faster, cheaper
 *   - Advantage over SimPO: Explicit SFT supervision → better instruction following
 *   - Target dimensions: faithfulness (-12.2%), coherence (-12.2%) in Ciclo 55
 *
 *   - Additional references:
 *     * DPO (Rafailov et al., arXiv:2305.18290, NeurIPS 2023): reference baseline
 *     * SimPO (Meng et al., arXiv:2405.14734, NeurIPS 2024): length-normalized
 *     * SPIN (Chen et al., arXiv:2401.01335, ICML 2024): self-play alternative
 *
 * Implementation:
 *   This module operates at inference time, collecting preference data and
 *   computing ORPO-style scores for response quality assessment. The actual
 *   gradient updates happen offline via the fine-tuning pipeline.
 *
 * Usage in MOTHER pipeline:
 *   - Collects (prompt, chosen, rejected) pairs from production queries
 *   - Computes ORPO preference score for response quality ranking
 *   - Exports ORPO-formatted dataset for offline fine-tuning
 */

import { createLogger } from '../_core/logger';
import { invokeLLM } from '../_core/llm';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('ORPO');

export interface ORPOPreferencePair {
  prompt: string;
  chosen: string;
  rejected: string;
  chosenScore: number;   // 0-100: quality score of chosen response
  rejectedScore: number; // 0-100: quality score of rejected response
  oddsRatio: number;     // log(odds_w / odds_l) — ORPO preference signal
  dimension: string;     // which quality dimension this pair targets
  timestamp: string;
  queryCategory: string;
}

export interface ORPOStats {
  totalPairs: number;
  avgOddsRatio: number;
  pairsByDimension: Record<string, number>;
  avgChosenScore: number;
  avgRejectedScore: number;
  lastUpdated: string;
}

// In-memory store for ORPO preference pairs (persisted to bd_central periodically)
const orpoPairs: ORPOPreferencePair[] = [];

/**
 * Compute ORPO odds ratio from quality scores.
 * Scientific basis: Hong et al. (ORPO, 2024) — Equation 3.
 *
 * odds(y|x) = P(y|x) / (1 - P(y|x))
 * ORPO signal = log(odds_w / odds_l)
 */
function computeOddsRatio(chosenScore: number, rejectedScore: number): number {
  // Convert scores (0-100) to probabilities (0.01-0.99) to avoid log(0)
  const pChosen = Math.max(0.01, Math.min(0.99, chosenScore / 100));
  const pRejected = Math.max(0.01, Math.min(0.99, rejectedScore / 100));

  const oddsChosen = pChosen / (1 - pChosen);
  const oddsRejected = pRejected / (1 - pRejected);

  // log(odds_w / odds_l) — positive means chosen is preferred
  return Math.log(oddsChosen / oddsRejected);
}

/**
 * Collect a preference pair for ORPO training.
 * Called after each response when we have quality scores from Guardian.
 *
 * @param prompt - The user query
 * @param response - The generated response
 * @param qualityScore - Guardian quality score (0-100)
 * @param queryCategory - Routing category
 * @param dimension - Quality dimension with largest gap (faithfulness/coherence/depth)
 */
export async function collectORPOPair(
  prompt: string,
  response: string,
  qualityScore: number,
  queryCategory: string,
  dimension: string = 'faithfulness'
): Promise<void> {
  // Only collect pairs where quality is below threshold (these need improvement)
  if (qualityScore >= 85) return; // High quality — no improvement needed

  try {
    // Generate a "chosen" (improved) version via LLM critique-revise
    // This creates the (prompt, chosen=improved, rejected=original) pair
    const improvePrompt = `You are a quality improvement assistant. The following response has quality issues.
Improve it to be more faithful, coherent, and deep. Focus on: ${dimension}.

ORIGINAL QUERY: ${prompt.slice(0, 500)}

ORIGINAL RESPONSE (quality score: ${qualityScore}/100):
${response.slice(0, 1500)}

Provide an improved version that:
1. Is more factually accurate and faithful to the query
2. Has better logical coherence and flow
3. Provides more depth and nuance
4. Maintains the same language as the original

Return ONLY the improved response, no meta-commentary.`;

    const improvedResult = await invokeLLM({
      model: 'gpt-4o-mini',
      provider: 'openai',
      messages: [
        { role: 'system', content: 'You are a response quality improvement assistant.' },
        { role: 'user', content: improvePrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const rawImproved = improvedResult.choices[0]?.message?.content;
    const improvedResponse = typeof rawImproved === 'string' ? rawImproved : '';

    if (!improvedResponse || improvedResponse.length < 100) return;

    // Score the improved response (heuristic: assume +15 improvement)
    const improvedScore = Math.min(95, qualityScore + 15);

    const oddsRatio = computeOddsRatio(improvedScore, qualityScore);

    // Only store pairs with meaningful preference signal (oddsRatio > 0.3)
    if (oddsRatio < 0.3) return;

    const pair: ORPOPreferencePair = {
      prompt: prompt.slice(0, 500),
      chosen: improvedResponse.slice(0, 2000),
      rejected: response.slice(0, 2000),
      chosenScore: improvedScore,
      rejectedScore: qualityScore,
      oddsRatio,
      dimension,
      timestamp: new Date().toISOString(),
      queryCategory,
    };

    orpoPairs.push(pair);

    // Keep only last 500 pairs in memory
    if (orpoPairs.length > 500) {
      orpoPairs.splice(0, orpoPairs.length - 500);
    }

    log.info(`[ORPO] Collected pair: dimension=${dimension}, oddsRatio=${oddsRatio.toFixed(3)}, score=${qualityScore}→${improvedScore}`);
  } catch (err) {
    log.warn('[ORPO] Failed to collect pair (non-blocking):', (err as Error).message);
  }
}

/**
 * Get ORPO statistics for monitoring.
 */
export function getORPOStats(): ORPOStats {
  if (orpoPairs.length === 0) {
    return {
      totalPairs: 0,
      avgOddsRatio: 0,
      pairsByDimension: {},
      avgChosenScore: 0,
      avgRejectedScore: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  const pairsByDimension: Record<string, number> = {};
  let totalOddsRatio = 0;
  let totalChosenScore = 0;
  let totalRejectedScore = 0;

  for (const pair of orpoPairs) {
    pairsByDimension[pair.dimension] = (pairsByDimension[pair.dimension] || 0) + 1;
    totalOddsRatio += pair.oddsRatio;
    totalChosenScore += pair.chosenScore;
    totalRejectedScore += pair.rejectedScore;
  }

  return {
    totalPairs: orpoPairs.length,
    avgOddsRatio: totalOddsRatio / orpoPairs.length,
    pairsByDimension,
    avgChosenScore: totalChosenScore / orpoPairs.length,
    avgRejectedScore: totalRejectedScore / orpoPairs.length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Export ORPO dataset in HuggingFace TRL format for offline fine-tuning.
 * Scientific basis: Hong et al. (ORPO, arXiv:2403.07691, EMNLP 2024) — Section 3.2
 *
 * TRL ORPOTrainer format:
 *   {"prompt": "...",
 *    "chosen": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
 *    "rejected": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
 *
 * Compatible with: trl.ORPOTrainer, trl.DPOTrainer, axolotl (preference format),
 *                  LLaMA-Factory, FastChat, OpenRLHF
 */
export function exportORPODataset(format: 'simple' | 'trl' = 'trl'): Array<Record<string, unknown>> {
  const highSignalPairs = orpoPairs.filter(p => p.oddsRatio > 0.5);

  if (format === 'trl') {
    // HuggingFace TRL format — compatible with ORPOTrainer and DPOTrainer
    return highSignalPairs.map(p => ({
      prompt: p.prompt,
      chosen: [
        { role: 'user', content: p.prompt },
        { role: 'assistant', content: p.chosen }
      ],
      rejected: [
        { role: 'user', content: p.prompt },
        { role: 'assistant', content: p.rejected }
      ],
      metadata: {
        odds_ratio: p.oddsRatio,
        dimension: p.dimension,
        chosen_score: p.chosenScore,
        rejected_score: p.rejectedScore,
        source: 'MOTHER_production',
        timestamp: p.timestamp,
      }
    }));
  }

  // Simple format (backward compatible)
  return highSignalPairs.map(p => ({
    prompt: p.prompt,
    chosen: p.chosen,
    rejected: p.rejected,
    odds_ratio: p.oddsRatio,
  }));
}

/**
 * Export ORPO dataset to JSONL file for offline fine-tuning.
 * Scientific basis: UltraFeedback dataset format (Cui et al., 2023)
 *
 * Output: /tmp/orpo_dataset_<timestamp>.jsonl
 * Compatible with: trl.ORPOTrainer, axolotl, LLaMA-Factory, OpenRLHF
 *
 * Usage (Python):
 *   from datasets import load_dataset
 *   dataset = load_dataset('json', data_files='orpo_dataset_*.jsonl')
 *   trainer = ORPOTrainer(model=model, args=orpo_args, train_dataset=dataset)
 */
export function exportORPODatasetToFile(): string {
  const dataset = exportORPODataset('trl');
  if (dataset.length === 0) {
    log.info('[ORPO] No high-signal pairs to export yet (need oddsRatio > 0.5, collect more production data)');
    return '';
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join('/tmp', `orpo_dataset_${timestamp}.jsonl`);

  const jsonlContent = dataset.map(pair => JSON.stringify(pair)).join('\n');
  fs.writeFileSync(outputPath, jsonlContent, 'utf-8');

  log.info(`[ORPO] Exported ${dataset.length} pairs to ${outputPath} (TRL format)`);
  log.info(`[ORPO] Fine-tune with: trl.ORPOTrainer(model, args, train_dataset=load_dataset('json', data_files='${outputPath}'))`);
  return outputPath;
}

/**
 * Apply ORPO-style preference scoring to rank multiple candidate responses.
 * Used at inference time to select the best response from MoA ensemble.
 *
 * Scientific basis: ORPO (Hong et al., 2024) — inference-time preference ranking
 */
export async function rankResponsesByORPO(
  prompt: string,
  candidates: string[],
  qualityScores: number[]
): Promise<{ bestIndex: number; oddsRatios: number[] }> {
  if (candidates.length <= 1) {
    return { bestIndex: 0, oddsRatios: [1.0] };
  }

  // Compute odds for each candidate
  const odds = qualityScores.map(score => {
    const p = Math.max(0.01, Math.min(0.99, score / 100));
    return p / (1 - p);
  });

  // Find best candidate (highest odds)
  let bestIndex = 0;
  let maxOdds = odds[0];
  for (let i = 1; i < odds.length; i++) {
    if (odds[i] > maxOdds) {
      maxOdds = odds[i];
      bestIndex = i;
    }
  }

  // Compute odds ratios relative to best
  const oddsRatios = odds.map(o => Math.log(o / odds[bestIndex] + 1e-8));

  log.info(`[ORPO] Ranked ${candidates.length} candidates: best=${bestIndex} (score=${qualityScores[bestIndex]})`);

  return { bestIndex, oddsRatios };
}
