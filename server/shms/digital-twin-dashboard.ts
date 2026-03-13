/**
 * Digital Twin Dashboard — NC-SHMS-005
 * Base: arXiv:2511.00100 (Deep RC-NN + Kalman), ISO 13822:2010
 */

export interface SensorReading {
  sensorId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: Date;
  quality: 'good' | 'bad' | 'unknown';
}

export interface SensorState {
  sensorId: string;
  sensorType: string;
  lastValue: number;
  unit: string;
  quality: 'good' | 'bad' | 'unknown';
  lastUpdate: Date;
  ekfEstimate?: number;
  ekfUncertainty?: number;
}

export interface SiteState {
  siteId: string;
  sensors: SensorState[];
  healthScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  lastUpdate: Date;
}

export interface SiteSummary {
  siteId: string;
  healthScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  activeAlerts: number;
  sensorCount: number;
}

function computeHealthScore(sensors: SensorState[]): number {
  if (sensors.length === 0) return 100;
  const goodCount = sensors.filter((s) => s.quality === 'good').length;
  return Math.round((goodCount / sensors.length) * 100);
}

function computeRiskLevel(healthScore: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (healthScore >= 80) return 'LOW';
  if (healthScore >= 60) return 'MEDIUM';
  if (healthScore >= 30) return 'HIGH';
  return 'CRITICAL';
}

function extractSiteId(sensorId: string): string {
  // "site1-piezometer-001" → "site1"
  const parts = sensorId.split('-');
  return parts[0] ?? sensorId;
}

export class DigitalTwinDashboard {
  private sites = new Map<string, SiteState>();
  private clientCount = 0;

  getClientCount(): number {
    return this.clientCount;
  }

  addClient(): void {
    this.clientCount++;
  }

  removeClient(): void {
    if (this.clientCount > 0) this.clientCount--;
  }

  async updateSensorReading(reading: SensorReading): Promise<void> {
    const siteId = extractSiteId(reading.sensorId);
    const site = this.sites.get(siteId) ?? {
      siteId,
      sensors: [],
      healthScore: 100,
      riskLevel: 'LOW' as const,
      lastUpdate: new Date(),
    };

    const existing = site.sensors.findIndex((s) => s.sensorId === reading.sensorId);
    const sensorState: SensorState = {
      sensorId: reading.sensorId,
      sensorType: reading.sensorType,
      lastValue: reading.value,
      unit: reading.unit,
      quality: reading.quality,
      lastUpdate: reading.timestamp,
    };

    if (existing >= 0) {
      const prev = site.sensors[existing]!;
      sensorState.ekfEstimate = prev.ekfEstimate;
      sensorState.ekfUncertainty = prev.ekfUncertainty;
      site.sensors[existing] = sensorState;
    } else {
      site.sensors.push(sensorState);
    }

    site.healthScore = computeHealthScore(site.sensors);
    site.riskLevel = computeRiskLevel(site.healthScore);
    site.lastUpdate = reading.timestamp;
    this.sites.set(siteId, site);
  }

  getSiteState(siteId: string): SiteState | undefined {
    return this.sites.get(siteId);
  }

  updateEKFEstimate(sensorId: string, estimate: number, uncertainty: number): void {
    const siteId = extractSiteId(sensorId);
    const site = this.sites.get(siteId);
    if (!site) return;
    const sensor = site.sensors.find((s) => s.sensorId === sensorId);
    if (sensor) {
      sensor.ekfEstimate = estimate;
      sensor.ekfUncertainty = uncertainty;
    }
  }

  getAllSitesSummary(): SiteSummary[] {
    return Array.from(this.sites.values()).map((site) => ({
      siteId: site.siteId,
      healthScore: site.healthScore,
      riskLevel: site.riskLevel,
      activeAlerts: site.sensors.filter((s) => s.quality === 'bad').length,
      sensorCount: site.sensors.length,
    }));
  }
}
