/**
 * DGM Version Manager — C202 Sprint 3
 * Versionamento por run e ciclo: C202-R001, C202-R002...
 *
 * Referências científicas:
 * - Semantic Versioning 2.0.0 — semver.org
 * - arXiv:2505.22954 — Darwin Gödel Machine: traceable self-improvement
 * - Google SRE Book (Beyer et al., 2016) — Change Management + Audit Trail
 *
 * Formato de versao:
 *   runId:   C202-R001 (ciclo + run sequencial com zero-padding)
 *   version: v83.0-C202-R001 (versao MOTHER + ciclo + run)
 *   tag:     dgm/C202-R001-<sha8> (git tag)
 *
 * STATUS: PRODUCAO C202-R001
 */

import { createLogger } from '../_core/logger';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('DGM-VERSION-MANAGER');

// ─────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────

export interface RunVersion {
  runId: string;       // ex: C202-R001
  version: string;     // ex: v83.0-C202-R001
  tag: string;         // ex: dgm/C202-R001
  cycle: string;       // ex: C202
  runNumber: number;   // ex: 1
  timestamp: Date;
}

export interface RunRecord {
  runId: string;
  version: string;
  cycle: string;
  fitnessScore: number;
  proofHash: string;
  commitSha?: string;
  prUrl?: string;
  deployRevision?: string;
  durationMs: number;
  success: boolean;
  timestamp?: Date;
}

// ─────────────────────────────────────────────────────────────────────────
// DGM Version Manager
// ─────────────────────────────────────────────────────────────────────────

export class DGMVersionManager {
  private readonly cycle: string;
  private readonly stateFile: string;
  private readonly motherVersion: string;
  private runCounter: number = 0;
  private runHistory: RunRecord[] = [];

  constructor(cycle: string, motherVersion?: string) {
    this.cycle = cycle;
    this.motherVersion = motherVersion || process.env.MOTHER_VERSION || 'v83.0';
    this.stateFile = path.join(process.cwd(), `.dgm-version-state-${cycle}.json`);
    this.loadState();
  }

  /**
   * Incrementa o contador de runs e retorna a proxima versao
   */
  async nextRun(): Promise<RunVersion> {
    this.runCounter += 1;
    this.saveState();

    const runNumber = this.runCounter;
    const runId = `${this.cycle}-R${String(runNumber).padStart(3, '0')}`;
    const version = `${this.motherVersion}-${runId}`;
    const tag = `dgm/${runId}`;

    const runVersion: RunVersion = {
      runId,
      version,
      tag,
      cycle: this.cycle,
      runNumber,
      timestamp: new Date(),
    };

    log.info(`[VERSION] Next run: ${runId} | version: ${version}`);

    // Update env var for downstream use
    process.env.MOTHER_RUN_ID = runId;
    process.env.MOTHER_VERSION_FULL = version;

    return runVersion;
  }

  /**
   * Registra o resultado de um run no historico
   */
  async recordRun(record: RunRecord): Promise<void> {
    const entry: RunRecord = {
      ...record,
      timestamp: record.timestamp || new Date(),
    };
    this.runHistory.push(entry);
    this.saveState();
    log.info(`[VERSION] Run recorded: ${record.runId} success=${record.success} fitness=${record.fitnessScore.toFixed(3)}`);
  }

  /**
   * Retorna o historico de runs do ciclo atual
   */
  getHistory(): RunRecord[] {
    return [...this.runHistory];
  }

  /**
   * Retorna o ultimo run bem-sucedido
   */
  getLastSuccessful(): RunRecord | null {
    return [...this.runHistory].reverse().find(r => r.success) || null;
  }

  /**
   * Retorna estatisticas do ciclo atual
   */
  getStats(): {
    cycle: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    avgFitness: number;
    bestFitness: number;
    lastRunId: string | null;
  } {
    const total = this.runHistory.length;
    const successful = this.runHistory.filter(r => r.success);
    const failed = total - successful.length;
    const avgFitness = total > 0
      ? this.runHistory.reduce((sum, r) => sum + r.fitnessScore, 0) / total
      : 0;
    const bestFitness = total > 0
      ? Math.max(...this.runHistory.map(r => r.fitnessScore))
      : 0;

    return {
      cycle: this.cycle,
      totalRuns: total,
      successfulRuns: successful.length,
      failedRuns: failed,
      successRate: total > 0 ? successful.length / total : 0,
      avgFitness,
      bestFitness,
      lastRunId: total > 0 ? this.runHistory[total - 1].runId : null,
    };
  }

  /**
   * Gera o changelog do ciclo para incluir no PR
   */
  generateChangelog(): string {
    const stats = this.getStats();
    const lines: string[] = [
      `## DGM Changelog — ${this.cycle}`,
      '',
      `**Total Runs:** ${stats.totalRuns}`,
      `**Success Rate:** ${(stats.successRate * 100).toFixed(1)}%`,
      `**Best Fitness:** ${stats.bestFitness.toFixed(3)}`,
      `**Avg Fitness:** ${stats.avgFitness.toFixed(3)}`,
      '',
      '### Run History',
      '',
    ];

    for (const run of this.runHistory.slice(-10)) {
      const status = run.success ? 'PASS' : 'FAIL';
      const ts = run.timestamp ? new Date(run.timestamp).toISOString().substring(0, 19) : 'N/A';
      lines.push(`- \`${run.runId}\` [${status}] fitness=${run.fitnessScore.toFixed(3)} ${ts}`);
      if (run.prUrl) lines.push(`  PR: ${run.prUrl}`);
    }

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────
  // State persistence
  // ─────────────────────────────────────────────────────────────────────

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        const state = JSON.parse(raw);
        this.runCounter = state.runCounter || 0;
        this.runHistory = state.runHistory || [];
        log.info(`[VERSION] State loaded: cycle=${this.cycle} counter=${this.runCounter} history=${this.runHistory.length}`);
      }
    } catch (err: any) {
      log.warn(`[VERSION] Could not load state: ${err.message}`);
    }
  }

  private saveState(): void {
    try {
      const state = {
        cycle: this.cycle,
        runCounter: this.runCounter,
        runHistory: this.runHistory,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (err: any) {
      log.warn(`[VERSION] Could not save state: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Singleton factory
// ─────────────────────────────────────────────────────────────────────────

const _managers = new Map<string, DGMVersionManager>();

export function getDGMVersionManager(cycle?: string): DGMVersionManager {
  const c = cycle || process.env.MOTHER_CYCLE || 'C202';
  if (!_managers.has(c)) {
    _managers.set(c, new DGMVersionManager(c));
  }
  return _managers.get(c)!;
}

/**
 * Formata um runId a partir de ciclo e numero
 * ex: formatRunId('C202', 1) => 'C202-R001'
 */
export function formatRunId(cycle: string, runNumber: number): string {
  return `${cycle}-R${String(runNumber).padStart(3, '0')}`;
}

/**
 * Formata uma versao completa
 * ex: formatVersion('v83.0', 'C202', 1) => 'v83.0-C202-R001'
 */
export function formatVersion(motherVersion: string, cycle: string, runNumber: number): string {
  return `${motherVersion}-${formatRunId(cycle, runNumber)}`;
}
