/**
 * SHMS Helpers — Centralized design tokens and utility functions for G-Trust Sentinel
 */

export const T = {
  bg: 'oklch(8% 0.02 220)',
  surface: 'oklch(11% 0.02 220)',
  surfaceHover: 'oklch(14% 0.03 220)',
  border: 'oklch(18% 0.03 220)',
  borderHover: 'oklch(24% 0.04 220)',
  text: 'oklch(88% 0.01 220)',
  muted: 'oklch(52% 0.02 220)',
  dim: 'oklch(38% 0.02 220)',
  accent: 'oklch(68% 0.18 220)',
  green: 'oklch(72% 0.18 145)',
  greenBg: 'oklch(14% 0.06 145)',
  greenBorder: 'oklch(22% 0.08 145)',
  yellow: 'oklch(78% 0.16 80)',
  yellowBg: 'oklch(14% 0.06 80)',
  yellowBorder: 'oklch(22% 0.08 80)',
  red: 'oklch(65% 0.22 25)',
  redBg: 'oklch(14% 0.06 25)',
  redBorder: 'oklch(22% 0.08 25)',
  orange: 'oklch(72% 0.18 50)',
  orangeBg: 'oklch(14% 0.06 50)',
  orangeBorder: 'oklch(22% 0.08 50)',
  blue: 'oklch(68% 0.16 260)',
  blueBg: 'oklch(14% 0.05 260)',
  blueBorder: 'oklch(22% 0.07 260)',
} as const;

export function icoldColor(level: 'GREEN' | 'YELLOW' | 'RED'): string {
  return level === 'GREEN' ? T.green : level === 'YELLOW' ? T.yellow : T.red;
}

export function riskColor(level?: string): string {
  switch (level) {
    case 'low': return T.green;
    case 'medium': return T.yellow;
    case 'high': return T.orange;
    case 'critical': return T.red;
    default: return T.muted;
  }
}

export function riskLabel(level?: string): string {
  switch (level) {
    case 'low': return 'BAIXO';
    case 'medium': return 'MÉDIO';
    case 'high': return 'ALTO';
    case 'critical': return 'CRÍTICO';
    default: return 'N/D';
  }
}

export function HealthRing({ value, status }: { value: number; status: 'GREEN' | 'YELLOW' | 'RED' }) {
  const color = icoldColor(status);
  const r = 28, cx = 36, cy = 36, sw = 5;
  const circ = 2 * Math.PI * r;
  const safePct = Math.min(100, Math.max(0, value));
  const dash = (safePct / 100) * circ;
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" aria-label={`Health ${safePct.toFixed(0)}%`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={T.border} strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
        strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 11, fill: color, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
        {safePct.toFixed(0)}%
      </text>
    </svg>
  );
}

export function SensorChart({ readings, predictions = [] }: { readings: any[], predictions?: any[] }) {
  const W = 100, H = 60, PAD = 4;
  if (readings.length === 0) return null;

  const vals = readings.map(r => r.value);
  const preds = predictions.map(p => p.predicted);
  const allVals = [...vals, ...preds];
  const minV = Math.min(...allVals) - 0.5;
  const maxV = Math.max(...allVals) + 0.5;
  const range = maxV - minV || 1;
  const n = readings.length;

  const tx = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2);
  const ty = (v: number) => H - PAD - ((v - minV) / range) * (H - PAD * 2);

  // Confidence band
  const confUpper = predictions.slice(0, n).map((p, i) => {
    const hw = (1 - p.confidence) * range * 1.5;
    return `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(p.predicted + hw).toFixed(1)}`;
  }).join(' ');
  const confLower = [...predictions.slice(0, n)].reverse().map((p, i) => {
    const hw = (1 - p.confidence) * range * 1.5;
    const origIdx = Math.min(n - 1 - i, n - 1);
    return `L ${tx(origIdx).toFixed(1)} ${ty(p.predicted - hw).toFixed(1)}`;
  }).join(' ');
  const confBand = predictions.length > 0 ? `${confUpper} ${confLower} Z` : '';

  const actualPath = readings.map((r, i) => `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(r.value).toFixed(1)}`).join(' ');
  const predPath = predictions.slice(0, n).map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(i).toFixed(1)} ${ty(p.predicted).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
      {/* Grid */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PAD} y1={PAD + f * (H - PAD * 2)} x2={W - PAD} y2={PAD + f * (H - PAD * 2)} stroke={T.border} strokeWidth={0.4} />
      ))}
      <path d={confBand} fill="rgba(96,165,250,0.08)" stroke="none" />
      <path d={predPath} stroke={T.orange} strokeWidth={0.8} fill="none" strokeDasharray="2,1.5" opacity={0.75} />
      <path d={actualPath} stroke={T.accent} strokeWidth={1.2} fill="none" />
      {readings.map((r, i) => r.isAnomaly && (
        <circle key={i} cx={tx(i)} cy={ty(r.value)} r={1.5} fill={T.red} />
      ))}
    </svg>
  );
}
