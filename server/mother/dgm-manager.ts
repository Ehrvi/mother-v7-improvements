/**
 * MOTHER — DGM Manager (Orchestrator)
 *
 * Coordinates DGM-Evolution 🧬 and DGM-Guardian 🛡️ running in parallel.
 *
 * Responsibilities:
 *   - Start/stop both systems
 *   - Guardian can BLOCK Evolution if system is unstable
 *   - Unified status dashboard
 *   - Cross-system event forwarding
 *
 * Scientific basis:
 *   - Autonomic Computing (Kephart & Chess, IEEE 2003)
 *   - Self-Adaptive Systems (Cheng et al., "Software Engineering for Self-Adaptive Systems", 2009)
 */

import { DGMGuardian } from './dgm-guardian';
import type { HealthStatus, Anomaly } from './dgm-guardian';
import { createLogger } from '../_core/logger';

const log = createLogger('DGMManager');

// ============================================================
// TYPES
// ============================================================

export interface DGMSystemStatus {
  version: string;
  guardian: {
    running: boolean;
    health: HealthStatus | null;
    activeAnomalies: number;
    evolutionBlocked: boolean;
  };
  evolution: {
    running: boolean;
    fitnessScore: number | null;
    pendingProposals: number;
    totalObservations: number;
    blocked: boolean;
  };
  uptime: string;
}

// ============================================================
// MANAGER (SINGLETON)
// ============================================================

class DGMManagerImpl {
  private guardian: DGMGuardian;
  private evolutionBlocked = false;
  private startTime: Date | null = null;
  private alertCallbacks: Array<(anomaly: Anomaly) => void> = [];

  constructor() {
    this.guardian = new DGMGuardian();

    // Wire Guardian → Evolution blocking
    this.guardian.setOnEvolutionBlock((blocked) => {
      if (blocked !== this.evolutionBlocked) {
        this.evolutionBlocked = blocked;
        if (blocked) {
          log.warn('[DGMManager] ⛔ Evolution BLOCKED by Guardian (system unstable)');
        } else {
          log.info('[DGMManager] ✅ Evolution UNBLOCKED by Guardian (system stable)');
        }
      }
    });

    // Wire Guardian alerts
    this.guardian.setOnAlert((anomaly) => {
      log.error(`[DGMManager] 🚨 ALERT: ${anomaly.type} — ${anomaly.metric} (severity: ${anomaly.severity})`);
      for (const cb of this.alertCallbacks) {
        try { cb(anomaly); } catch { /* ignore */ }
      }
    });
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  start(): void {
    this.startTime = new Date();
    log.info('[DGMManager] ═══════════════════════════════════════════');
    log.info('[DGMManager] 🚀 DGM SYSTEM STARTED');
    log.info('[DGMManager]    🛡️ Guardian: Real-time monitoring');
    log.info('[DGMManager]    🧬 Evolution: Self-improvement (via dgm-agent)');
    log.info('[DGMManager] ═══════════════════════════════════════════');

    this.guardian.start();
    // Evolution runs via existing dgm-agent.ts (not changed)
  }

  stop(): void {
    this.guardian.stop();
    log.info('[DGMManager] DGM SYSTEM STOPPED');
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Check if Evolution is allowed to run.
   * Guardian blocks Evolution when system is unstable.
   */
  isEvolutionAllowed(): boolean {
    return !this.evolutionBlocked;
  }

  /**
   * Get unified status of both systems.
   */
  async getStatus(): Promise<DGMSystemStatus> {
    let fitnessScore: number | null = null;
    let pendingProposals = 0;
    let totalObservations = 0;

    try {
      const dgm = await import('./dgm-agent');
      const fitness = dgm.getCurrentFitness();
      fitnessScore = fitness?.fitnessScore ?? null;
      const dgmStatus = dgm.getDGMStatus();
      pendingProposals = dgmStatus.pendingProposals;
      totalObservations = dgmStatus.totalObservations;
    } catch { /* dgm-agent may not be ready */ }

    const guardianHealth = this.guardian.getStatus();
    const uptime = this.startTime
      ? `${Math.round((Date.now() - this.startTime.getTime()) / 1000)}s`
      : '0s';

    return {
      version: 'DGM-v77.0 (Evolution + Guardian)',
      guardian: {
        running: this.guardian.isRunning(),
        health: guardianHealth,
        activeAnomalies: this.guardian.getActiveAnomalies().length,
        evolutionBlocked: this.evolutionBlocked,
      },
      evolution: {
        running: true, // Always running via dgm-agent
        fitnessScore,
        pendingProposals,
        totalObservations,
        blocked: this.evolutionBlocked,
      },
      uptime,
    };
  }

  /**
   * Get Guardian instance for detailed queries.
   */
  getGuardian(): DGMGuardian {
    return this.guardian;
  }

  /**
   * Register alert callback.
   */
  onAlert(callback: (anomaly: Anomaly) => void): void {
    this.alertCallbacks.push(callback);
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

let instance: DGMManagerImpl | null = null;

export function getDGMManager(): DGMManagerImpl {
  if (!instance) {
    instance = new DGMManagerImpl();
  }
  return instance;
}

/**
 * Start the full DGM system (Guardian + Evolution).
 * Call this once at server startup.
 */
export function startDGMSystem(): void {
  getDGMManager().start();
}

/**
 * Stop the full DGM system.
 */
export function stopDGMSystem(): void {
  getDGMManager().stop();
}
