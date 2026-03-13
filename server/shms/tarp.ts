/**
 * SHMS Module 17 — TARP (Trigger Action Response Plan)
 * MOTHER v7 | server/shms/tarp.ts
 *
 * Scientific basis:
 * - ICOLD Bulletin 158 §6.3 — Trigger-Action Response Plan (TARP) for tailings dams
 * - Australian National Committee on Large Dams (ANCOLD) Guidelines 2019 — TARP matrix
 * - GISTM (Global Industry Standard on Tailings Management) 2020 — §7.3 Trigger levels
 * - Consequence-based risk matrix: ISO 31000:2018 — likelihood × consequence
 */

// ============================================================
// Types
// ============================================================

export type TARPLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED'; // ascending alert

export type TriggerType =
  | 'piezometer'
  | 'inclinometer'
  | 'settlement'
  | 'seepage'
  | 'visual_inspection'
  | 'rainfall'
  | 'seismic'
  | 'other';

export type ResponseAction =
  | 'monitor'
  | 'notify_team'
  | 'restrict_access'
  | 'increase_monitoring'
  | 'notify_authority'
  | 'evacuate'
  | 'emergency_response';

export interface TARPTrigger {
  id: string;
  structureId: string;
  type: TriggerType;
  sensorId?: string;
  description: string;
  parameter: string; // e.g. "piezometric_level", "horizontal_displacement"
  thresholds: {
    green: number; // normal operating
    yellow: number; // elevated concern
    orange: number; // significant concern
    red: number; // critical / emergency
  };
  unit: string;
}

export interface TARPAction {
  id: string;
  level: TARPLevel;
  action: ResponseAction;
  description: string;
  responsible: string; // role (e.g. "Dam Safety Engineer", "Site Manager")
  timeframeHours: number; // required response time
  notifyList: string[]; // email/phone stubs
  escalatesTo?: TARPLevel; // if not resolved in timeframeHours
}

export interface TARPMatrix {
  structureId: string;
  triggers: TARPTrigger[];
  actions: TARPAction[];
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  reviewDate: string; // mandatory periodic review date
}

export interface TARPActivation {
  id: string;
  structureId: string;
  triggerId: string;
  activatedLevel: TARPLevel;
  sensorValue: number;
  threshold: number;
  activatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  actionsCompleted: string[]; // action ids
  notes?: string;
}

// ============================================================
// Helpers
// ============================================================

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Numeric rank for TARP levels — used for comparisons */
const TARP_LEVEL_RANK: Record<TARPLevel, number> = {
  GREEN: 0,
  YELLOW: 1,
  ORANGE: 2,
  RED: 3,
};

// ============================================================
// Standalone functions
// ============================================================

/**
 * Evaluates a sensor reading against a TARPTrigger's threshold table.
 * Returns GREEN if value < yellow threshold, YELLOW if >= yellow and < orange, etc.
 * Implements the ANCOLD 2019 / GISTM 2020 §7.3 escalating threshold model.
 */
export function evaluateTrigger(trigger: TARPTrigger, currentValue: number): TARPLevel {
  const { yellow, orange, red } = trigger.thresholds;
  if (currentValue >= red) return 'RED';
  if (currentValue >= orange) return 'ORANGE';
  if (currentValue >= yellow) return 'YELLOW';
  return 'GREEN';
}

/**
 * Returns all TARPActions at or below (i.e., cumulative up to) the given level.
 * Rationale: lower-level actions remain in force when a higher level is triggered
 * (ICOLD Bulletin 158 §6.3 — cumulative response).
 */
export function getRequiredActions(matrix: TARPMatrix, level: TARPLevel): TARPAction[] {
  const levelRank = TARP_LEVEL_RANK[level];
  return matrix.actions.filter(
    (a) => TARP_LEVEL_RANK[a.level] <= levelRank,
  );
}

/**
 * Generates a JSON summary report of the TARP matrix and its activations.
 * Includes compliance status per GISTM 2020 §7.3 and ANCOLD 2019 requirements.
 */
export function generateTARPReport(
  matrix: TARPMatrix,
  activations: TARPActivation[],
): string {
  const now = new Date();
  const overdueReview = new Date(matrix.reviewDate) < now;

  const activeActivations = activations.filter((a) => !a.resolvedAt);
  const criticalUnresolved = activeActivations.filter(
    (a) => a.activatedLevel === 'RED' || a.activatedLevel === 'ORANGE',
  );

  // Count activations per level
  const countByLevel: Record<TARPLevel, number> = {
    GREEN: 0,
    YELLOW: 0,
    ORANGE: 0,
    RED: 0,
  };
  for (const act of activations) {
    countByLevel[act.activatedLevel]++;
  }

  // Trigger summary
  const triggerSummary = matrix.triggers.map((t) => ({
    id: t.id,
    parameter: t.parameter,
    type: t.type,
    unit: t.unit,
    thresholds: t.thresholds,
    sensorId: t.sensorId ?? null,
    description: t.description,
  }));

  const report = {
    structureId: matrix.structureId,
    generatedAt: now.toISOString(),
    standard: 'ICOLD Bulletin 158 §6.3 / ANCOLD 2019 / GISTM 2020 §7.3',
    matrixApproved: !!matrix.approvedBy,
    approvedBy: matrix.approvedBy ?? null,
    approvedAt: matrix.approvedAt ?? null,
    reviewDate: matrix.reviewDate,
    overdueReview,
    totalTriggers: matrix.triggers.length,
    totalActions: matrix.actions.length,
    activationSummary: {
      total: activations.length,
      active: activeActivations.length,
      resolved: activations.length - activeActivations.length,
      criticalUnresolved: criticalUnresolved.length,
      byLevel: countByLevel,
    },
    activeAlerts: activeActivations.map((a) => ({
      id: a.id,
      triggerId: a.triggerId,
      level: a.activatedLevel,
      sensorValue: a.sensorValue,
      threshold: a.threshold,
      activatedAt: a.activatedAt,
      actionsCompleted: a.actionsCompleted,
    })),
    triggerSummary,
    complianceStatus: {
      hasApprovedMatrix: !!matrix.approvedBy,
      overdueReview,
      activeAlerts: activeActivations.length,
      criticalUnresolved: criticalUnresolved.length,
    },
  };

  return JSON.stringify(report, null, 2);
}

// ============================================================
// TARPManager
// ============================================================

export class TARPManager {
  private matrices: Map<string, TARPMatrix> = new Map(); // keyed by structureId
  private activations: Map<string, TARPActivation> = new Map();

  // ----------------------------------------------------------
  // Matrix management
  // ----------------------------------------------------------

  setMatrix(matrix: TARPMatrix): void {
    this.matrices.set(matrix.structureId, matrix);
  }

  getMatrix(structureId: string): TARPMatrix | undefined {
    return this.matrices.get(structureId);
  }

  // ----------------------------------------------------------
  // Trigger evaluation
  // ----------------------------------------------------------

  /**
   * Evaluates all triggers for a structure against provided sensor readings.
   * readings is a Map of sensorId|parameter => current value.
   * Returns a Map of triggerId => TARPLevel.
   */
  evaluateAllTriggers(
    structureId: string,
    readings: Map<string, number>,
  ): Map<string, TARPLevel> {
    const matrix = this.matrices.get(structureId);
    if (!matrix) return new Map();

    const results = new Map<string, TARPLevel>();

    for (const trigger of matrix.triggers) {
      // Match by sensorId first, then by parameter name (ANCOLD 2019 §4.2)
      const value =
        (trigger.sensorId !== undefined && readings.has(trigger.sensorId)
          ? readings.get(trigger.sensorId)
          : readings.get(trigger.parameter)) ?? undefined;

      if (value !== undefined) {
        results.set(trigger.id, evaluateTrigger(trigger, value));
      }
    }

    return results;
  }

  /**
   * Creates a TARPActivation record for a trigger if its evaluated level > GREEN.
   * Returns null if the trigger evaluates to GREEN (no activation needed).
   */
  activateTrigger(
    structureId: string,
    triggerId: string,
    sensorValue: number,
  ): TARPActivation | null {
    const matrix = this.matrices.get(structureId);
    if (!matrix) throw new Error(`No TARP matrix for structure: ${structureId}`);

    const trigger = matrix.triggers.find(
      (t) => t.id === triggerId && t.structureId === structureId,
    );
    if (!trigger) throw new Error(`Trigger not found: ${triggerId}`);

    const level = evaluateTrigger(trigger, sensorValue);
    if (level === 'GREEN') return null; // no activation for normal conditions

    // Determine the threshold that was exceeded
    const thresholdExceeded =
      level === 'RED'
        ? trigger.thresholds.red
        : level === 'ORANGE'
        ? trigger.thresholds.orange
        : trigger.thresholds.yellow;

    const activation: TARPActivation = {
      id: generateId('TARP'),
      structureId,
      triggerId,
      activatedLevel: level,
      sensorValue,
      threshold: thresholdExceeded,
      activatedAt: new Date().toISOString(),
      actionsCompleted: [],
    };

    this.activations.set(activation.id, activation);
    return activation;
  }

  /**
   * Marks an activation as resolved with timestamp and responsible person.
   */
  resolveTrigger(
    activationId: string,
    resolvedBy: string,
    notes?: string,
  ): void {
    const activation = this.activations.get(activationId);
    if (!activation) throw new Error(`Activation not found: ${activationId}`);
    if (activation.resolvedAt) throw new Error(`Activation already resolved: ${activationId}`);

    this.activations.set(activationId, {
      ...activation,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      notes: notes ?? activation.notes,
    });
  }

  // ----------------------------------------------------------
  // Querying
  // ----------------------------------------------------------

  getActiveActivations(structureId: string): TARPActivation[] {
    return Array.from(this.activations.values()).filter(
      (a) => a.structureId === structureId && !a.resolvedAt,
    );
  }

  getActivationHistory(structureId: string, limitDays?: number): TARPActivation[] {
    let activations = Array.from(this.activations.values()).filter(
      (a) => a.structureId === structureId,
    );
    if (limitDays !== undefined) {
      const cutoff = Date.now() - limitDays * 24 * 60 * 60 * 1000;
      activations = activations.filter(
        (a) => new Date(a.activatedAt).getTime() >= cutoff,
      );
    }
    return activations.sort(
      (a, b) => new Date(b.activatedAt).getTime() - new Date(a.activatedAt).getTime(),
    );
  }

  // ----------------------------------------------------------
  // Compliance
  // ----------------------------------------------------------

  /**
   * Returns the compliance status for a structure's TARP matrix.
   * Evaluates against GISTM 2020 §7.3 and ANCOLD 2019 requirements.
   */
  getComplianceStatus(structureId: string): {
    hasApprovedMatrix: boolean;
    overdueReview: boolean;
    activeAlerts: number;
    criticalUnresolved: number;
    lastActivation?: string;
  } {
    const matrix = this.matrices.get(structureId);
    const now = new Date();

    const hasApprovedMatrix = !!(matrix?.approvedBy && matrix?.approvedAt);
    const overdueReview = matrix ? new Date(matrix.reviewDate) < now : true;

    const active = this.getActiveActivations(structureId);
    const criticalUnresolved = active.filter(
      (a) => a.activatedLevel === 'RED' || a.activatedLevel === 'ORANGE',
    ).length;

    // Most recent activation across all history
    const allActivations = this.getActivationHistory(structureId);
    const lastActivation =
      allActivations.length > 0 ? allActivations[0].activatedAt : undefined;

    return {
      hasApprovedMatrix,
      overdueReview,
      activeAlerts: active.length,
      criticalUnresolved,
      lastActivation,
    };
  }
}

export const tarpManager: TARPManager = new TARPManager();
