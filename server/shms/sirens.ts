/**
 * SHMS Module 13 — Sirens / Emergency Alert System
 * MOTHER v7 | server/shms/sirens.ts
 *
 * Scientific basis:
 * - FEMA Emergency Alert System (EAS) — tiered alert levels
 * - ICOLD Bulletin 158 §6.3 — Emergency Action Plan (PAE) alert zones
 * - Haversine distance for geographic zone coverage
 * - IEC 60849 — sound system design for emergency use (coverage radius per siren)
 * - Brazilian NBR 15809 — sirens for warning systems
 */

// ============================================================
// Types
// ============================================================

export type SirenStatus = 'idle' | 'testing' | 'active' | 'maintenance' | 'fault';

export type AlertZone = 'ZAS' | 'ZSS' | 'ZA'; // Zona de Auto Salvamento, Zona de Segurança Secundária, Zona de Atendimento

export type SirenAlertLevel = 'TEST' | 'WATCH' | 'WARNING' | 'EMERGENCY'; // ascending severity

export interface Siren {
  id: string;
  structureId: string;
  name: string;
  lat: number;
  lon: number;
  coverageRadiusM: number; // IEC 60849 audible range
  zone: AlertZone;
  status: SirenStatus;
  lastTestedAt?: string;
  lastActivatedAt?: string;
  powerSource: 'grid' | 'battery' | 'solar';
  batteryLevelPercent?: number;
}

export interface SirenActivationEvent {
  id: string;
  structureId: string;
  sirenIds: string[]; // which sirens were activated
  alertLevel: SirenAlertLevel;
  triggeredBy: string; // user or 'AUTOMATIC'
  triggeredAt: string;
  durationSeconds: number;
  cancelledAt?: string;
  affectedZones: AlertZone[];
  message?: string;
}

export interface SirenTestResult {
  sirenId: string;
  testedAt: string;
  success: boolean;
  responseTimeMs: number;
  decibels?: number;
  notes?: string;
}

// ============================================================
// Helpers
// ============================================================

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Haversine distance between two lat/lon points — returns metres.
 * Reference: Sinnott, R.W. (1984), "Virtues of the Haversine", Sky and Telescope, 68(2).
 */
function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Duration in seconds by alert level (IEC 60849 / NBR 15809 recommendations) */
const ALERT_DURATION_SECONDS: Record<SirenAlertLevel, number> = {
  TEST: 30,
  WATCH: 60,
  WARNING: 180,
  EMERGENCY: 300,
};

/** Zone priority order — ZAS is closest/most critical (ICOLD PAE) */
const ZONE_PRIORITY: Record<AlertZone, number> = {
  ZAS: 1,
  ZSS: 2,
  ZA: 3,
};

const ALL_ZONES: AlertZone[] = ['ZAS', 'ZSS', 'ZA'];

// ============================================================
// Standalone functions
// ============================================================

/**
 * Compute siren coverage across all operational zones.
 * Uses each siren's coverageRadiusM as the audible range (IEC 60849).
 * A zone is considered "covered" if it has at least one operational siren.
 * Gaps are represented by siren positions that don't cover other siren positions.
 */
export function computeSirenCoverage(
  sirens: Siren[],
  alertLevel: SirenAlertLevel,
): {
  coveredZones: AlertZone[];
  gaps: Array<{ lat: number; lon: number; nearestSirenId: string; distanceM: number }>;
  coveragePercent: number;
} {
  // Operational sirens for the given alert level
  const operationalStatuses: SirenStatus[] =
    alertLevel === 'TEST' ? ['idle', 'testing'] : ['idle', 'active'];
  const operational = sirens.filter((s) => operationalStatuses.includes(s.status));

  // Covered zones: zones that have at least one operational siren
  const coveredZoneSet = new Set<AlertZone>(operational.map((s) => s.zone));
  const coveredZones = ALL_ZONES.filter((z) => coveredZoneSet.has(z));

  // Gaps: non-operational sirens that are not within range of an operational siren
  const nonOperational = sirens.filter((s) => !operationalStatuses.includes(s.status));
  const gaps: Array<{ lat: number; lon: number; nearestSirenId: string; distanceM: number }> = [];

  for (const nonOp of nonOperational) {
    let nearestId = '';
    let nearestDist = Infinity;
    for (const op of operational) {
      const dist = haversineDistanceM(nonOp.lat, nonOp.lon, op.lat, op.lon);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = op.id;
      }
    }
    // Only report as gap if the non-operational siren's position is outside coverage of nearest
    if (nearestId && nearestDist > (sirens.find((s) => s.id === nearestId)?.coverageRadiusM ?? 0)) {
      gaps.push({
        lat: nonOp.lat,
        lon: nonOp.lon,
        nearestSirenId: nearestId,
        distanceM: Math.round(nearestDist),
      });
    }
  }

  const coveragePercent =
    sirens.length > 0
      ? Math.round((operational.length / sirens.length) * 100)
      : 0;

  return { coveredZones, gaps, coveragePercent };
}

/**
 * Returns all sirens assigned to the specified PAE alert zone (ICOLD Bulletin 158 §6.3).
 */
export function getSirensForZone(sirens: Siren[], zone: AlertZone): Siren[] {
  return sirens.filter((s) => s.zone === zone);
}

// ============================================================
// SirenManager
// ============================================================

export class SirenManager {
  private sirens: Map<string, Siren> = new Map();
  private activations: Map<string, SirenActivationEvent> = new Map();
  private testResults: Map<string, SirenTestResult[]> = new Map();

  // ----------------------------------------------------------
  // Registration & lookup
  // ----------------------------------------------------------

  registerSiren(siren: Omit<Siren, 'id'>): Siren {
    const newSiren: Siren = { ...siren, id: generateId('SRN') };
    this.sirens.set(newSiren.id, newSiren);
    return newSiren;
  }

  getSiren(id: string): Siren | undefined {
    return this.sirens.get(id);
  }

  getSirensForStructure(structureId: string): Siren[] {
    return Array.from(this.sirens.values()).filter(
      (s) => s.structureId === structureId,
    );
  }

  // ----------------------------------------------------------
  // Alert activation
  // ----------------------------------------------------------

  /**
   * Activates all operational (idle) sirens for the given structure.
   * Returns a SirenActivationEvent recording which sirens were triggered.
   * Per NBR 15809 / ICOLD PAE, all zones are activated simultaneously during emergencies.
   */
  activateAlert(
    structureId: string,
    alertLevel: SirenAlertLevel,
    triggeredBy: string,
    message?: string,
  ): SirenActivationEvent {
    const structureSirens = this.getSirensForStructure(structureId);
    const eligibleSirens = structureSirens.filter(
      (s) => s.status === 'idle' || s.status === 'testing',
    );

    const now = new Date().toISOString();
    const activatedIds: string[] = [];
    const affectedZoneSet = new Set<AlertZone>();

    for (const siren of eligibleSirens) {
      const updated: Siren = { ...siren, status: 'active', lastActivatedAt: now };
      this.sirens.set(siren.id, updated);
      activatedIds.push(siren.id);
      affectedZoneSet.add(siren.zone);
    }

    // Sort affected zones by priority (ICOLD PAE zone ordering)
    const affectedZones = Array.from(affectedZoneSet).sort(
      (a, b) => ZONE_PRIORITY[a] - ZONE_PRIORITY[b],
    );

    const event: SirenActivationEvent = {
      id: generateId('ACT'),
      structureId,
      sirenIds: activatedIds,
      alertLevel,
      triggeredBy,
      triggeredAt: now,
      durationSeconds: ALERT_DURATION_SECONDS[alertLevel],
      affectedZones,
      message,
    };

    this.activations.set(event.id, event);
    return event;
  }

  /**
   * Cancels an active alert and returns activated sirens to idle status.
   */
  cancelAlert(activationId: string, _cancelledBy: string): void {
    const event = this.activations.get(activationId);
    if (!event) throw new Error(`Activation not found: ${activationId}`);
    if (event.cancelledAt) throw new Error(`Activation already cancelled: ${activationId}`);

    const now = new Date().toISOString();
    this.activations.set(activationId, { ...event, cancelledAt: now });

    // Return activated sirens to idle
    for (const sirenId of event.sirenIds) {
      const siren = this.sirens.get(sirenId);
      if (siren && siren.status === 'active') {
        this.sirens.set(sirenId, { ...siren, status: 'idle' });
      }
    }
  }

  // ----------------------------------------------------------
  // Test results & status
  // ----------------------------------------------------------

  recordTestResult(result: SirenTestResult): void {
    const existing = this.testResults.get(result.sirenId) ?? [];
    this.testResults.set(result.sirenId, [...existing, result]);

    // Update siren lastTestedAt
    const siren = this.sirens.get(result.sirenId);
    if (siren) {
      const updated: Siren = { ...siren, lastTestedAt: result.testedAt };
      // If test failed and siren was testing, mark fault
      if (!result.success && siren.status === 'testing') {
        updated.status = 'fault';
      } else if (result.success && siren.status === 'testing') {
        updated.status = 'idle';
      }
      this.sirens.set(siren.id, updated);
    }
  }

  updateSirenStatus(sirenId: string, status: SirenStatus): void {
    const siren = this.sirens.get(sirenId);
    if (!siren) throw new Error(`Siren not found: ${sirenId}`);
    this.sirens.set(sirenId, { ...siren, status });
  }

  // ----------------------------------------------------------
  // History & reporting
  // ----------------------------------------------------------

  getActivationHistory(structureId: string, limitDays?: number): SirenActivationEvent[] {
    let events = Array.from(this.activations.values()).filter(
      (e) => e.structureId === structureId,
    );
    if (limitDays !== undefined) {
      const cutoff = Date.now() - limitDays * 24 * 60 * 60 * 1000;
      events = events.filter((e) => new Date(e.triggeredAt).getTime() >= cutoff);
    }
    return events.sort(
      (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
    );
  }

  getTestHistory(sirenId: string): SirenTestResult[] {
    return this.testResults.get(sirenId) ?? [];
  }

  /**
   * Returns sirens with fault status OR last test > 30 days ago (NBR 15809 maintenance schedule).
   */
  getSirensNeedingMaintenance(): Siren[] {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return Array.from(this.sirens.values()).filter((s) => {
      if (s.status === 'fault') return true;
      if (!s.lastTestedAt) return true; // never tested
      return new Date(s.lastTestedAt).getTime() < thirtyDaysAgo;
    });
  }

  /**
   * Exports a PAE (Emergency Action Plan) zone summary report as JSON string.
   * Based on ICOLD Bulletin 158 §6.3 zone coverage requirements.
   */
  exportPAEReport(structureId: string): string {
    const sirens = this.getSirensForStructure(structureId);
    const coverage = computeSirenCoverage(sirens, 'EMERGENCY');

    const zoneDetails = ALL_ZONES.map((zone) => {
      const zoneSirens = getSirensForZone(sirens, zone);
      return {
        zone,
        totalSirens: zoneSirens.length,
        operationalSirens: zoneSirens.filter(
          (s) => s.status === 'idle' || s.status === 'active',
        ).length,
        faultSirens: zoneSirens.filter((s) => s.status === 'fault').length,
        maintenanceSirens: zoneSirens.filter((s) => s.status === 'maintenance').length,
        covered: coverage.coveredZones.includes(zone),
      };
    });

    const needingMaintenance = this.getSirensNeedingMaintenance().filter(
      (s) => s.structureId === structureId,
    );

    const report = {
      structureId,
      generatedAt: new Date().toISOString(),
      standard: 'ICOLD Bulletin 158 §6.3 / NBR 15809',
      totalSirens: sirens.length,
      coveragePercent: coverage.coveragePercent,
      coveredZones: coverage.coveredZones,
      uncoveredZones: ALL_ZONES.filter((z) => !coverage.coveredZones.includes(z)),
      coverageGaps: coverage.gaps,
      zoneDetails,
      sirensMaintenance: needingMaintenance.map((s) => ({
        id: s.id,
        name: s.name,
        zone: s.zone,
        status: s.status,
        lastTestedAt: s.lastTestedAt ?? null,
      })),
      recentActivations: this.getActivationHistory(structureId, 90).slice(0, 10),
    };

    return JSON.stringify(report, null, 2);
  }
}

export const sirenManager: SirenManager = new SirenManager();
