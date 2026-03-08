/**
 * STARTUP SCHEDULER — C206
 *
 * Extrai todos os setTimeout/setInterval de production-entry.ts.
 * Resolve NC-ARCH-001: God Object (1044 linhas → <300 linhas).
 *
 * Base científica:
 * - Fowler (1999) "Refactoring" — Extract Module, God Class anti-pattern
 * - Martin (2008) "Clean Code" — Single Responsibility Principle (SRP)
 * - McConnell (2004) "Code Complete" §7.5 — módulos devem ter ≤500 linhas
 * - Martin (2003) "Agile Software Development" — SRP: "A class should have only one reason to change"
 *
 * MOTHER v88.0 | C206 | Sprint 7 | 2026-03-09
 */

import { createLogger } from './logger';

const log = createLogger('startup-scheduler-c206');

export interface ScheduledTask {
  /** Nome único da tarefa para logging */
  name: string;
  /** Ciclo de origem (e.g., 'C197', 'C203') */
  cycle: string;
  /** Delay em ms antes da primeira execução */
  delayMs: number;
  /** Intervalo em ms para execuções recorrentes (undefined = one-shot) */
  intervalMs?: number;
  /** Função a executar */
  fn: () => Promise<void>;
  /** Se true, falha não impede outros tasks (default: true) */
  nonCritical?: boolean;
}

/**
 * StartupScheduler
 *
 * Gerencia todos os tasks de inicialização de MOTHER.
 * Padrão: Registry + Executor (Fowler 1999 + Martin 2008).
 *
 * Uso:
 * ```typescript
 * startupScheduler.register({ name: 'Redis Cache', cycle: 'C197', delayMs: 7000, fn: initRedisSHMSCache });
 * await startupScheduler.start();
 * ```
 */
export class StartupScheduler {
  private static instance: StartupScheduler;
  private tasks: ScheduledTask[] = [];
  private timers: NodeJS.Timeout[] = [];
  private started = false;

  private constructor() {}

  static getInstance(): StartupScheduler {
    if (!this.instance) this.instance = new StartupScheduler();
    return this.instance;
  }

  /**
   * Registra um task de startup.
   * Deve ser chamado ANTES de start().
   */
  register(task: ScheduledTask): void {
    this.tasks.push({ nonCritical: true, ...task });
    log.info(`[StartupScheduler] Registered: ${task.name} (${task.cycle}) — delay=${task.delayMs}ms`);
  }

  /**
   * Inicia todos os tasks registrados.
   * Ordem de execução determinada por delayMs (menor delay = primeiro).
   */
  async start(): Promise<void> {
    if (this.started) {
      log.warn('[StartupScheduler] Already started — ignoring duplicate start()');
      return;
    }
    this.started = true;

    // Sort by delayMs for predictable logging
    const sorted = [...this.tasks].sort((a, b) => a.delayMs - b.delayMs);

    log.info(`[StartupScheduler] Starting ${sorted.length} tasks — C206 NC-ARCH-001 (Fowler 1999 SRP)`);

    for (const task of sorted) {
      const timer = setTimeout(async () => {
        try {
          log.info(`[StartupScheduler] Executing: ${task.name} (${task.cycle})`);
          await task.fn();
          log.info(`[StartupScheduler] Completed: ${task.name} ✅`);

          if (task.intervalMs) {
            const intervalTimer = setInterval(async () => {
              try {
                await task.fn();
              } catch (err) {
                if (task.nonCritical) {
                  log.warn(`[StartupScheduler] Recurring error in ${task.name} (non-critical):`, (err as Error).message?.slice(0, 100));
                } else {
                  log.error(`[StartupScheduler] Recurring error in ${task.name}:`, err);
                }
              }
            }, task.intervalMs);
            this.timers.push(intervalTimer);
          }
        } catch (err) {
          if (task.nonCritical) {
            log.warn(`[StartupScheduler] ${task.name} falhou (non-critical): ${(err as Error).message?.slice(0, 100)}`);
          } else {
            log.error(`[StartupScheduler] ${task.name} falhou (critical):`, err);
            throw err;
          }
        }
      }, task.delayMs);

      this.timers.push(timer);
    }
  }

  /**
   * Para todos os timers (para graceful shutdown).
   */
  stop(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.started = false;
    log.info('[StartupScheduler] All timers stopped');
  }

  /**
   * Retorna lista de tasks registrados (para diagnóstico).
   */
  getTasks(): Array<{ name: string; cycle: string; delayMs: number; intervalMs?: number }> {
    return this.tasks.map(({ name, cycle, delayMs, intervalMs }) => ({
      name,
      cycle,
      delayMs,
      intervalMs,
    }));
  }

  /**
   * Retorna status do scheduler.
   */
  getStatus(): { started: boolean; taskCount: number; timerCount: number } {
    return {
      started: this.started,
      taskCount: this.tasks.length,
      timerCount: this.timers.length,
    };
  }
}

/**
 * Singleton export para uso em production-entry.ts e outros módulos.
 */
export const startupScheduler = StartupScheduler.getInstance();
