/**
 * MODULE REGISTRY — C206
 *
 * Centraliza todos os imports de módulos de production-entry.ts.
 * Resolve NC-ARCH-001: God Object — extrai responsabilidade de importação.
 *
 * Base científica:
 * - Fowler (1999) "Refactoring" — Extract Module
 * - Martin (2008) "Clean Code" — SRP: Single Responsibility Principle
 * - Gamma et al. (1994) "Design Patterns" — Registry Pattern
 * - McConnell (2004) "Code Complete" §5.3 — Information Hiding
 *
 * MOTHER v88.0 | C206 | Sprint 7 | 2026-03-09
 */

import { createLogger } from './logger';

const log = createLogger('module-registry-c206');

export interface ModuleEntry {
  name: string;
  path: string;
  cycle: string;
  status: 'CONNECTED' | 'ORPHAN' | 'DEPRECATED';
  importedIn: string;
  exportedFunctions: string[];
}

/**
 * Registro centralizado de todos os módulos de MOTHER.
 * Implementa o padrão Registry (Fowler 2002 "Patterns of Enterprise Application Architecture").
 *
 * R27: Todo novo módulo gerado pelo DGM DEVE ser registrado aqui.
 */
class ModuleRegistry {
  private static instance: ModuleRegistry;
  private modules: Map<string, ModuleEntry> = new Map();

  private constructor() {
    this.initializeRegistry();
  }

  static getInstance(): ModuleRegistry {
    if (!this.instance) this.instance = new ModuleRegistry();
    return this.instance;
  }

  /**
   * Inicializa o registro com todos os módulos conhecidos de MOTHER.
   * Fonte: AWAKE V286 PASSO 6 — Connection Registry.
   */
  private initializeRegistry(): void {
    const modules: ModuleEntry[] = [
      // ─── Core ───────────────────────────────────────────────────────────
      { name: 'corsConfig', path: 'server/_core/cors-config.ts', cycle: 'C195', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['corsConfig'] },
      { name: 'logger', path: 'server/_core/logger.ts', cycle: 'C188', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['createLogger'] },
      { name: 'startupScheduler', path: 'server/_core/startup-scheduler.ts', cycle: 'C206', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['startupScheduler', 'StartupScheduler'] },

      // ─── SHMS ────────────────────────────────────────────────────────────
      { name: 'shmsAlertsRouter', path: 'server/shms/shms-alerts-endpoint.ts', cycle: 'C196', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['shmsAlertsRouter'] },
      { name: 'initRedisSHMSCache', path: 'server/shms/redis-shms-cache.ts', cycle: 'C197', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['initRedisSHMSCache'] },
      { name: 'DigitalTwinEngineC205', path: 'server/shms/digital-twin-engine-c205.ts', cycle: 'C205', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['DigitalTwinEngineC205'] },
      { name: 'digitalTwinRoutesC206', path: 'server/shms/digital-twin-routes-c206.ts', cycle: 'C206', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['digitalTwinRoutesC206'] },
      { name: 'mqttDigitalTwinBridgeC206', path: 'server/shms/mqtt-digital-twin-bridge-c206.ts', cycle: 'C206', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['initMQTTDigitalTwinBridgeC206', 'mqttDigitalTwinBridgeC206'] },

      // ─── DGM ─────────────────────────────────────────────────────────────
      { name: 'scheduleDGMLoopC203', path: 'server/dgm/dgm-loop-startup-c203.ts', cycle: 'C203', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['scheduleDGMLoopC203', 'getDGMLoopC203Status'] },
      { name: 'generateDiversifiedProposals', path: 'server/dgm/dgm-proposal-dedup-c204.ts', cycle: 'C204', status: 'CONNECTED', importedIn: 'dgm-loop-activator.ts', exportedFunctions: ['generateDiversifiedProposals'] },

      // ─── Mother ──────────────────────────────────────────────────────────
      { name: 'scheduleHippoRAG2IndexingC204', path: 'server/mother/hipporag2-indexer-c204.ts', cycle: 'C204', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['scheduleHippoRAG2IndexingC204'] },
      { name: 'scheduleBenchmarkRunnerC204', path: 'server/mother/longform-benchmark-runner-c204.ts', cycle: 'C204', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['scheduleBenchmarkRunnerC204'] },
      { name: 'startClosedLoopLearning', path: 'server/mother/closed-loop-learning-c205.ts', cycle: 'C205', status: 'CONNECTED', importedIn: 'production-entry.ts', exportedFunctions: ['startClosedLoopLearning', 'ClosedLoopLearning'] },

      // ─── Client Components ───────────────────────────────────────────────
      { name: 'ExpandableSidebar', path: 'client/src/components/ExpandableSidebar.tsx', cycle: 'C202', status: 'CONNECTED', importedIn: 'RightPanel.tsx (Monitor tab)', exportedFunctions: ['ExpandableSidebar'] },
      { name: 'DGMPanel', path: 'client/src/components/DGMPanel.tsx', cycle: 'C202', status: 'CONNECTED', importedIn: 'RightPanel.tsx (Monitor tab)', exportedFunctions: ['DGMPanel'] },
      { name: 'MotherMonitor', path: 'client/src/components/MotherMonitor.tsx', cycle: 'C202', status: 'CONNECTED', importedIn: 'RightPanel.tsx (Monitor tab)', exportedFunctions: ['MotherMonitor'] },
    ];

    for (const mod of modules) {
      this.modules.set(mod.name, mod);
    }

    log.info(`[ModuleRegistry] Initialized with ${this.modules.size} modules (C206 NC-ARCH-001)`);
  }

  /**
   * Registra um novo módulo (chamado pelo DGM ao criar novos módulos — R27).
   */
  register(entry: ModuleEntry): void {
    this.modules.set(entry.name, entry);
    log.info(`[ModuleRegistry] Registered: ${entry.name} (${entry.cycle}) — status=${entry.status}`);
  }

  /**
   * Atualiza status de um módulo.
   */
  updateStatus(name: string, status: ModuleEntry['status']): void {
    const mod = this.modules.get(name);
    if (mod) {
      mod.status = status;
      log.info(`[ModuleRegistry] Updated: ${name} → ${status}`);
    }
  }

  /**
   * Retorna módulos ORPHAN (R27 — devem ser conectados ou arquivados em 2 ciclos).
   */
  getOrphans(): ModuleEntry[] {
    return Array.from(this.modules.values()).filter((m) => m.status === 'ORPHAN');
  }

  /**
   * Retorna todos os módulos conectados.
   */
  getConnected(): ModuleEntry[] {
    return Array.from(this.modules.values()).filter((m) => m.status === 'CONNECTED');
  }

  /**
   * Retorna status completo do registry.
   */
  getStatus(): {
    total: number;
    connected: number;
    orphan: number;
    deprecated: number;
    byCycle: Record<string, number>;
  } {
    const all = Array.from(this.modules.values());
    const byCycle: Record<string, number> = {};
    for (const mod of all) {
      byCycle[mod.cycle] = (byCycle[mod.cycle] || 0) + 1;
    }

    return {
      total: all.length,
      connected: all.filter((m) => m.status === 'CONNECTED').length,
      orphan: all.filter((m) => m.status === 'ORPHAN').length,
      deprecated: all.filter((m) => m.status === 'DEPRECATED').length,
      byCycle,
    };
  }

  /**
   * Retorna todos os módulos.
   */
  getAll(): ModuleEntry[] {
    return Array.from(this.modules.values());
  }
}

/**
 * Singleton export.
 */
export const moduleRegistry = ModuleRegistry.getInstance();
