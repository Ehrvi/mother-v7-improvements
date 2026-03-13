// Module 6 — Static Cross-Section (SHMS)
// Geological layer imaging, instrument alarm limits, SVG rendering

export interface GeologicalLayer {
  id: string;
  name: string;
  description: string;
  color: string;
  pattern?: 'solid' | 'hatched' | 'dotted';
  elevationTop: number;
  elevationBottom: number;
  material: string;
  properties?: {
    cohesion?: number;
    frictionAngle?: number;
    unitWeight?: number;
    permeability?: number;
  };
}

export interface CrossSectionInstrument {
  instrumentId: string;
  name: string;
  horizontalPosition: number;
  elevation: number;
  currentValue?: number;
  unit?: string;
  alarmLimits: {
    watchLevel?: number;
    warningLevel?: number;
    alertLevel?: number;
    criticalLevel?: number;
  };
  currentAlarmLevel: 'normal' | 'watch' | 'warning' | 'alert' | 'critical';
}

export interface StaticCrossSection {
  id: string;
  name: string;
  structureId: string;
  description: string;
  orientation: string;
  startPoint: { lat: number; lng: number };
  endPoint: { lat: number; lng: number };
  totalLengthM: number;
  baseElevationM: number;
  topElevationM: number;
  geologicalLayers: GeologicalLayer[];
  instruments: CrossSectionInstrument[];
  waterTableElevation?: number;
  lastUpdated: Date;
  imageOverlay?: string;
}

export interface CrossSectionSVG {
  svg: string;
  width: number;
  height: number;
  scale: number;
}

const ALARM_COLORS: Record<CrossSectionInstrument['currentAlarmLevel'], string> = {
  normal: '#22c55e',
  watch: '#3b82f6',
  warning: '#eab308',
  alert: '#f97316',
  critical: '#ef4444',
};

function buildHatchPattern(id: string, color: string): string {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8">
    <rect width="8" height="8" fill="${color}" opacity="0.3"/>
    <line x1="0" y1="0" x2="8" y2="8" stroke="${color}" stroke-width="1"/>
  </pattern>`;
}

function buildDotPattern(id: string, color: string): string {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6">
    <rect width="6" height="6" fill="${color}" opacity="0.2"/>
    <circle cx="3" cy="3" r="1" fill="${color}"/>
  </pattern>`;
}

export function renderCrossSectionSVG(
  section: StaticCrossSection,
  options?: { width?: number; height?: number; showAlarms?: boolean; showWaterTable?: boolean }
): CrossSectionSVG {
  const W = options?.width ?? 800;
  const H = options?.height ?? 400;
  const showAlarms = options?.showAlarms !== false;
  const showWaterTable = options?.showWaterTable !== false;
  const padding = { top: 20, right: 20, bottom: 50, left: 60 };
  const drawW = W - padding.left - padding.right;
  const drawH = H - padding.top - padding.bottom;
  const elevRange = section.topElevationM - section.baseElevationM || 1;
  const scale = section.totalLengthM / drawW; // m/px

  const toX = (h: number) => padding.left + (h / section.totalLengthM) * drawW;
  const toY = (elev: number) =>
    padding.top + ((section.topElevationM - elev) / elevRange) * drawH;

  const defs: string[] = [];
  const layers: string[] = [];
  const instruments: string[] = [];

  for (const layer of section.geologicalLayers) {
    const yTop = toY(layer.elevationTop);
    const yBot = toY(layer.elevationBottom);
    const layH = yBot - yTop;
    const pid = `pat_${layer.id}`;
    let fill = layer.color;

    if (layer.pattern === 'hatched') {
      defs.push(buildHatchPattern(pid, layer.color));
      fill = `url(#${pid})`;
    } else if (layer.pattern === 'dotted') {
      defs.push(buildDotPattern(pid, layer.color));
      fill = `url(#${pid})`;
    }

    layers.push(
      `<rect x="${padding.left}" y="${yTop.toFixed(1)}" width="${drawW}" height="${Math.max(layH, 1).toFixed(1)}" fill="${fill}" stroke="#333" stroke-width="0.5" opacity="0.85"/>`,
      `<text x="${(padding.left + 4).toFixed(1)}" y="${(yTop + 12).toFixed(1)}" font-size="9" fill="#222">${layer.name}</text>`
    );
  }

  // Water table
  const wtLines: string[] = [];
  if (showWaterTable && section.waterTableElevation !== undefined) {
    const wy = toY(section.waterTableElevation);
    wtLines.push(
      `<line x1="${padding.left}" y1="${wy.toFixed(1)}" x2="${padding.left + drawW}" y2="${wy.toFixed(1)}" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,3" opacity="0.8"/>`,
      `<text x="${(padding.left + drawW - 50).toFixed(1)}" y="${(wy - 4).toFixed(1)}" font-size="9" fill="#3b82f6">N.A. ${section.waterTableElevation.toFixed(1)}m</text>`
    );
  }

  // Instruments
  if (showAlarms) {
    for (const inst of section.instruments) {
      const ix = toX(inst.horizontalPosition);
      const iy = toY(inst.elevation);
      const color = ALARM_COLORS[inst.currentAlarmLevel];
      instruments.push(
        `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="6" fill="${color}" stroke="#fff" stroke-width="1.5"/>`,
        `<text x="${(ix + 8).toFixed(1)}" y="${(iy + 4).toFixed(1)}" font-size="8" fill="#111">${inst.name}</text>`
      );
    }
  }

  // Elevation labels (left axis)
  const elevSteps = 5;
  const axisLabels: string[] = [];
  for (let i = 0; i <= elevSteps; i++) {
    const elev = section.baseElevationM + (elevRange * i) / elevSteps;
    const y = toY(elev);
    axisLabels.push(
      `<text x="${(padding.left - 4).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="9" text-anchor="end" fill="#555">${elev.toFixed(0)}m</text>`,
      `<line x1="${(padding.left - 2).toFixed(1)}" y1="${y.toFixed(1)}" x2="${padding.left.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#555"/>`
    );
  }

  // Scale bar at footer
  const scaleBarPx = 100;
  const scaleBarM = (scaleBarPx * scale).toFixed(0);
  const sbX = padding.left;
  const sbY = H - 20;
  const scalePart = `<line x1="${sbX}" y1="${sbY}" x2="${sbX + scaleBarPx}" y2="${sbY}" stroke="#333" stroke-width="2"/>
    <text x="${sbX}" y="${sbY - 3}" font-size="9" fill="#333">0</text>
    <text x="${sbX + scaleBarPx}" y="${sbY - 3}" font-size="9" fill="#333">${scaleBarM}m</text>
    <text x="${sbX + scaleBarPx / 2}" y="${sbY + 12}" font-size="9" text-anchor="middle" fill="#555">Escala 1:${Math.round(scale * 100)}</text>`;

  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defsBlock}
  <rect width="${W}" height="${H}" fill="#f8f9fa"/>
  <text x="${W / 2}" y="14" font-size="11" text-anchor="middle" font-weight="bold" fill="#222">${section.name} — ${section.orientation}</text>
  ${layers.join('\n  ')}
  ${wtLines.join('\n  ')}
  ${instruments.join('\n  ')}
  ${axisLabels.join('\n  ')}
  ${scalePart}
  <rect x="${padding.left}" y="${padding.top}" width="${drawW}" height="${drawH}" fill="none" stroke="#333" stroke-width="1"/>
</svg>`;

  return { svg, width: W, height: H, scale };
}

export function updateInstrumentReadings(
  section: StaticCrossSection,
  readings: Map<string, number>
): StaticCrossSection {
  const updated = section.instruments.map((inst) => {
    const val = readings.get(inst.instrumentId);
    if (val === undefined) return inst;
    const lim = inst.alarmLimits;
    let level: CrossSectionInstrument['currentAlarmLevel'] = 'normal';
    if (lim.criticalLevel !== undefined && val >= lim.criticalLevel) level = 'critical';
    else if (lim.alertLevel !== undefined && val >= lim.alertLevel) level = 'alert';
    else if (lim.warningLevel !== undefined && val >= lim.warningLevel) level = 'warning';
    else if (lim.watchLevel !== undefined && val >= lim.watchLevel) level = 'watch';
    return { ...inst, currentValue: val, currentAlarmLevel: level };
  });
  return { ...section, instruments: updated, lastUpdated: new Date() };
}

const STATUS_ORDER = ['normal', 'watch', 'warning', 'alert', 'critical'] as const;

export function computeSectionOverallStatus(
  section: StaticCrossSection
): 'normal' | 'watch' | 'warning' | 'alert' | 'critical' {
  let worst: number = 0;
  for (const inst of section.instruments) {
    const idx = STATUS_ORDER.indexOf(inst.currentAlarmLevel);
    if (idx > worst) worst = idx;
  }
  return STATUS_ORDER[worst];
}

export class CrossSectionManager {
  private sections = new Map<string, StaticCrossSection>();

  registerSection(section: Omit<StaticCrossSection, 'lastUpdated'>): StaticCrossSection {
    const full: StaticCrossSection = { ...section, lastUpdated: new Date() };
    this.sections.set(full.id, full);
    return full;
  }

  updateSection(id: string, updates: Partial<StaticCrossSection>): void {
    const existing = this.sections.get(id);
    if (!existing) throw new Error(`CrossSection not found: ${id}`);
    this.sections.set(id, { ...existing, ...updates, lastUpdated: new Date() });
  }

  getSectionsByStructure(structureId: string): StaticCrossSection[] {
    return [...this.sections.values()].filter((s) => s.structureId === structureId);
  }

  updateReadings(structureId: string, readings: Map<string, number>): void {
    for (const [id, section] of this.sections) {
      if (section.structureId !== structureId) continue;
      this.sections.set(id, updateInstrumentReadings(section, readings));
    }
  }

  renderAll(structureId: string): Map<string, CrossSectionSVG> {
    const result = new Map<string, CrossSectionSVG>();
    for (const section of this.getSectionsByStructure(structureId)) {
      result.set(section.id, renderCrossSectionSVG(section));
    }
    return result;
  }

  getAlertedSections(): StaticCrossSection[] {
    return [...this.sections.values()].filter((s) => {
      const status = computeSectionOverallStatus(s);
      return status === 'alert' || status === 'critical';
    });
  }
}

export const crossSectionManager = new CrossSectionManager();
