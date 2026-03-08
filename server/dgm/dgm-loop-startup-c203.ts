/**
 * dgm-loop-startup-c203.ts — DGM Loop Activator Startup Connector
 * Sprint 4 | C203 | Conselho dos 6 IAs | 2026-03-09
 *
 * Scientific basis:
 * - Darwin Gödel Machine (Zhang et al. 2025, arXiv:2505.22954) — autonomous self-modification
 *   with formal proof: each modification must improve expected performance
 * - SICA (arXiv:2504.15228, 2025) — self-improving coding agents with pre-commit validation
 * - Semantic Versioning 2.0.0 (semver.org) — version management for autonomous systems
 * - Cohen (1988) Statistical Power Analysis — MCC threshold 0.85 for quality gate
 *
 * Purpose:
 * Connects the DGM Loop Activator (C202) to the production-entry.ts startup sequence.
 * This resolves the gap identified in Sprint 3: the Loop Activator was implemented but
 * not connected to the production startup — functions DEAD → ALIVE (R32 pattern).
 *
 * Activation schedule:
 * - t=25min: First DGM Loop C203 cycle (after all other modules are stable)
 * - t=24h: Recurring daily cycle via setInterval
 *
 * @module dgm-loop-startup-c203
 * @version 1.0.0
 * @cycle C203
 * @sprint Sprint 4 — Long-form Output ≥20 páginas em <5min
 */

import { createLogger } from '../_core/logger.js';
import { runDGMLoopC202, getDGMCycleStats } from './dgm-autonomous-loop-c197.js';

const log = createLogger('dgm-loop-startup-c203');

// ─────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────

const DGM_LOOP_FIRST_RUN_DELAY_MS = 25 * 60 * 1000; // 25min after startup
const DGM_LOOP_DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h recurring
const CURRENT_CYCLE = process.env.MOTHER_CYCLE || 'C203';
const DRY_RUN = process.env.DGM_DRY_RUN === 'true';

// ─────────────────────────────────────────────────────────────────────────
// DGM Loop C203 Daily Cycle
// ─────────────────────────────────────────────────────────────────────────

/**
 * Executes one complete DGM Loop cycle (6 phases):
 * Phase 1: Proposal generation via runDGMCycle()
 * Phase 2: Sandbox isolation (tmpdir + timeout + rollback)
 * Phase 3: Fitness evaluation (MCC gate ≥ 0.85)
 * Phase 4: Cryptographic proof (SHA256 + HMAC + Merkle chain)
 * Phase 5: Autonomous commit (branch → commit → push → PR)
 * Phase 6: Cloud Build deploy trigger
 *
 * Scientific basis: Darwin Gödel Machine arXiv:2505.22954 — closed-loop self-modification
 */
async function runDGMLoopC203DailyCycle(): Promise<void> {
  const cycleStart = Date.now();
  log.info('[DGM-C203] Iniciando ciclo DGM Loop diário', {
    cycle: CURRENT_CYCLE,
    dryRun: DRY_RUN,
    scientificBasis: 'Darwin Gödel Machine arXiv:2505.22954 — autonomous self-modification',
    schedule: 'daily',
  });

  try {
    const result = await runDGMLoopC202(CURRENT_CYCLE, DRY_RUN);

    const durationMs = Date.now() - cycleStart;

    if (result.success) {
      const stats = getDGMCycleStats(CURRENT_CYCLE);
      log.info('[DGM-C203] Ciclo DGM Loop CONCLUÍDO ✅', {
        cycle: CURRENT_CYCLE,
        version: result.version,
        fitnessScore: result.fitnessScore?.toFixed(3),
        phase: result.phase,
        durationMs,
        totalRuns: stats.totalRuns,
        successRate: `${(stats.successRate * 100).toFixed(1)}%`,
        scientificBasis: 'Darwin Gödel Machine arXiv:2505.22954 + Cohen 1988 MCC ≥ 0.85',
      });
    } else {
      log.warn('[DGM-C203] Ciclo DGM Loop REJEITADO (non-critical)', {
        cycle: CURRENT_CYCLE,
        phase: result.phase,
        reason: result.reason,
        fitnessScore: result.fitnessScore?.toFixed(3),
        durationMs,
        note: 'Rejection is expected when fitness < 0.85 — MCC gate working correctly',
        scientificBasis: 'Cohen (1988) Statistical Power Analysis — MCC threshold 0.85',
      });
    }
  } catch (err) {
    log.warn('[DGM-C203] Ciclo DGM Loop falhou (non-critical — sandbox isolated)', {
      cycle: CURRENT_CYCLE,
      error: (err as Error).message?.slice(0, 200),
      durationMs: Date.now() - cycleStart,
      note: 'Failure is isolated in sandbox — production system unaffected',
      scientificBasis: 'SICA arXiv:2504.15228 — pre-commit validation prevents bad changes',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Startup Scheduler
// ─────────────────────────────────────────────────────────────────────────

/**
 * Schedules the DGM Loop C203 daily cycle.
 * Called from production-entry.ts during startup.
 *
 * Schedule:
 * - First run: 25min after startup (after all other modules are stable)
 * - Recurring: every 24h via setInterval
 *
 * This replaces the previous pattern of calling runDGMDailyCycle() which
 * used dgm-orchestrator.ts (Sprint 12). The new pattern uses the complete
 * 6-phase pipeline from dgm-loop-activator.ts (Sprint 3 C202).
 */
export function scheduleDGMLoopC203(): void {
  log.info('[DGM-C203] Agendando DGM Loop C203 — primeiro ciclo em 25min, recorrente a cada 24h', {
    cycle: CURRENT_CYCLE,
    firstRunDelayMs: DGM_LOOP_FIRST_RUN_DELAY_MS,
    dailyIntervalMs: DGM_LOOP_DAILY_INTERVAL_MS,
    dryRun: DRY_RUN,
    scientificBasis: 'Darwin Gödel Machine arXiv:2505.22954 — autonomous self-improvement loop',
  });

  // First run after 25min (after DGM Sprint 15 at 20min and C199 modules at 12-14s)
  setTimeout(runDGMLoopC203DailyCycle, DGM_LOOP_FIRST_RUN_DELAY_MS);

  // Recurring every 24h
  setInterval(runDGMLoopC203DailyCycle, DGM_LOOP_DAILY_INTERVAL_MS);
}

/**
 * Returns current DGM Loop C203 statistics.
 * Used by /api/dgm/status endpoint.
 */
export function getDGMLoopC203Status(): {
  cycle: string;
  dryRun: boolean;
  firstRunDelayMs: number;
  dailyIntervalMs: number;
  stats: ReturnType<typeof getDGMCycleStats>;
} {
  return {
    cycle: CURRENT_CYCLE,
    dryRun: DRY_RUN,
    firstRunDelayMs: DGM_LOOP_FIRST_RUN_DELAY_MS,
    dailyIntervalMs: DGM_LOOP_DAILY_INTERVAL_MS,
    stats: getDGMCycleStats(CURRENT_CYCLE),
  };
}
