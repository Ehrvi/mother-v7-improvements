// Module 12 — Boreholes (SHMS)
// Lithologic profile rendering, borehole deviation, USCS color mapping

export type BoreholeVariableType = 'categorical' | 'continuous' | 'descriptive' | 'survey' | 'level';
export type BoreholeStatus = 'active' | 'inactive' | 'abandoned';

export interface BoreholeVariable {
  id: string;
  name: string;
  type: BoreholeVariableType;
  unit?: string;
  categories?: string[];
  description: string;
}

export interface LithologicInterval {
  depthFrom: number;
  depthTo: number;
  material: string;
  color: string;
  description?: string;
  spt?: number;
  rqd?: number;
  variableValues: Record<string, string | number>;
}

export interface SurveyPoint {
  depth: number;
  inclination: number; // degrees from vertical
  azimuth: number;     // degrees from North
}

export interface Borehole {
  id: string;
  name: string;
  structureId: string;
  lat: number;
  lng: number;
  surfaceElevation: number;
  totalDepth: number;
  drillingDate: Date;
  status: BoreholeStatus;
  intervals: LithologicInterval[];
  survey: SurveyPoint[];
  groundwaterDepth?: number;
  notes: string;
}

export interface LithologicProfile {
  boreholeId: string;
  svgProfile: string;
  width: number;
  height: number;
  scale: number; // m/px
}

// ─── USCS color map ────────────────────────────────────────────────────────

const USCS_COLORS: Record<string, string> = {
  clay: '#8B4513', silt: '#D2B48C', sand: '#F4A460',
  gravel: '#808080', rock: '#696969', fill: '#9ACD32',
  organic: '#2F4F2F', sandstone: '#C8A96E', limestone: '#B0C4DE',
  granite: '#A9A9A9', shale: '#708090',
};

export function getMaterialColor(material: string): string {
  const key = material.toLowerCase().trim();
  return USCS_COLORS[key] ?? '#CCCCCC';
}

// ─── SVG rendering ────────────────────────────────────────────────────────

export function renderLithologicProfileSVG(
  borehole: Borehole,
  options?: { width?: number; showSPT?: boolean; showRQD?: boolean }
): LithologicProfile {
  const showSPT = options?.showSPT !== false;
  const colW = 60;    // lithology column width
  const sptW = showSPT ? 80 : 0;
  const labelW = 50;  // depth labels
  const descW = 120;  // description column
  const totalW = options?.width ?? (labelW + colW + sptW + descW + 20);
  const PX_PER_M = 20;
  const totalH = Math.max(borehole.totalDepth * PX_PER_M + 60, 200);
  const scale = 1 / PX_PER_M;

  const toY = (depth: number) => 40 + depth * PX_PER_M;
  const parts: string[] = [];

  // Title
  parts.push(`<text x="${totalW / 2}" y="18" font-size="11" text-anchor="middle" font-weight="bold" fill="#222">${borehole.name}</text>`);
  parts.push(`<text x="${totalW / 2}" y="32" font-size="9" text-anchor="middle" fill="#555">Elev. ${borehole.surfaceElevation}m | Prof. ${borehole.totalDepth}m</text>`);

  // Column headers
  const xLith = labelW;
  const xSPT = labelW + colW + 4;
  const xDesc = xSPT + sptW;
  parts.push(`<text x="${xLith + colW / 2}" y="50" font-size="8" text-anchor="middle" fill="#333">Litologia</text>`);
  if (showSPT) parts.push(`<text x="${xSPT + sptW / 2}" y="50" font-size="8" text-anchor="middle" fill="#333">SPT</text>`);
  parts.push(`<text x="${xDesc + 4}" y="50" font-size="8" fill="#333">Material</text>`);

  // Groundwater line
  if (borehole.groundwaterDepth !== undefined) {
    const gwy = toY(borehole.groundwaterDepth);
    parts.push(`<line x1="${xLith}" y1="${gwy}" x2="${xLith + colW}" y2="${gwy}" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="5,3"/>`);
    parts.push(`<text x="${xLith + colW + 2}" y="${gwy + 4}" font-size="8" fill="#3b82f6">NA</text>`);
  }

  // Lithologic intervals
  const maxSPT = Math.max(...borehole.intervals.map((i) => i.spt ?? 0), 1);
  for (const iv of borehole.intervals) {
    const y1 = toY(iv.depthFrom);
    const y2 = toY(iv.depthTo);
    const h = Math.max(y2 - y1, 1);
    const fill = iv.color || getMaterialColor(iv.material);

    // Lithology rect
    parts.push(`<rect x="${xLith}" y="${y1}" width="${colW}" height="${h}" fill="${fill}" stroke="#555" stroke-width="0.5" opacity="0.9"/>`);

    // Depth label (left)
    parts.push(`<text x="${xLith - 4}" y="${y1 + 10}" font-size="8" text-anchor="end" fill="#444">${iv.depthFrom.toFixed(1)}</text>`);
    parts.push(`<line x1="${xLith - 2}" y1="${y1}" x2="${xLith}" y2="${y1}" stroke="#888" stroke-width="0.5"/>`);

    // SPT bar
    if (showSPT && iv.spt !== undefined) {
      const barW = Math.min((iv.spt / maxSPT) * (sptW - 8), sptW - 8);
      parts.push(`<rect x="${xSPT}" y="${y1 + 1}" width="${barW}" height="${Math.max(h - 2, 1)}" fill="#6366f1" opacity="0.7"/>`);
      parts.push(`<text x="${xSPT + barW + 2}" y="${y1 + h / 2 + 4}" font-size="7" fill="#333">${iv.spt}</text>`);
    }

    // Description
    const label = `${iv.material}${iv.description ? ' - ' + iv.description.slice(0, 20) : ''}`;
    parts.push(`<text x="${xDesc + 2}" y="${y1 + h / 2 + 4}" font-size="8" fill="#222">${label}</text>`);
  }

  // Bottom depth label
  parts.push(`<text x="${xLith - 4}" y="${toY(borehole.totalDepth) + 4}" font-size="8" text-anchor="end" fill="#444">${borehole.totalDepth.toFixed(1)}m</text>`);

  // Border on lithology column
  parts.push(`<rect x="${xLith}" y="${toY(0)}" width="${colW}" height="${borehole.totalDepth * PX_PER_M}" fill="none" stroke="#333" stroke-width="1"/>`);

  const svgProfile = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="${totalW}" height="${totalH}" fill="#f8f9fa"/>
  ${parts.join('\n  ')}
</svg>`;

  return { boreholeId: borehole.id, svgProfile, width: totalW, height: totalH, scale };
}

// ─── Deviation survey ─────────────────────────────────────────────────────

export function computeBoreholeDeviation(
  survey: SurveyPoint[],
  surfaceLat: number,
  surfaceLng: number
): { depth: number; lat: number; lng: number; northing: number; easting: number }[] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  // 1 degree latitude ≈ 111320 m
  const M_PER_LAT = 111320;
  const M_PER_LNG = 111320 * Math.cos(toRad(surfaceLat));

  const result: { depth: number; lat: number; lng: number; northing: number; easting: number }[] = [];
  let northing = 0;
  let easting = 0;
  let prevDepth = 0;
  let prevInc = 0;
  let prevAz = 0;

  result.push({ depth: 0, lat: surfaceLat, lng: surfaceLng, northing: 0, easting: 0 });

  for (const pt of survey) {
    const dz = pt.depth - prevDepth;
    if (dz <= 0) continue;
    // Minimum curvature approximation
    const avgInc = toRad((prevInc + pt.inclination) / 2);
    const avgAz = toRad((prevAz + pt.azimuth) / 2);
    northing += dz * Math.sin(avgInc) * Math.cos(avgAz);
    easting += dz * Math.sin(avgInc) * Math.sin(avgAz);
    result.push({
      depth: pt.depth,
      lat: surfaceLat + northing / M_PER_LAT,
      lng: surfaceLng + easting / M_PER_LNG,
      northing, easting,
    });
    prevDepth = pt.depth;
    prevInc = pt.inclination;
    prevAz = pt.azimuth;
  }

  return result;
}

// ─── Manager ──────────────────────────────────────────────────────────────

export class BoreholesManager {
  private boreholes = new Map<string, Borehole>();
  private counter = 0;

  registerBorehole(borehole: Omit<Borehole, 'id'>): Borehole {
    const id = `bh_${++this.counter}_${Date.now()}`;
    const full: Borehole = { ...borehole, id };
    this.boreholes.set(id, full);
    return full;
  }

  getBoreholesForStructure(structureId: string): Borehole[] {
    return [...this.boreholes.values()].filter((b) => b.structureId === structureId);
  }

  renderProfiles(structureId: string): Map<string, LithologicProfile> {
    const result = new Map<string, LithologicProfile>();
    for (const bh of this.getBoreholesForStructure(structureId)) {
      result.set(bh.id, renderLithologicProfileSVG(bh));
    }
    return result;
  }

  getNearbyBoreholes(lat: number, lng: number, radiusM: number): Borehole[] {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    return [...this.boreholes.values()].filter((bh) => {
      const dLat = toRad(bh.lat - lat);
      const dLng = toRad(bh.lng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(bh.lat)) * Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return dist <= radiusM;
    });
  }

  exportBoreholeData(boreholeId: string): string {
    const bh = this.boreholes.get(boreholeId);
    if (!bh) throw new Error(`Borehole not found: ${boreholeId}`);
    return JSON.stringify(bh, null, 2);
  }
}

export const boreholesManager = new BoreholesManager();
