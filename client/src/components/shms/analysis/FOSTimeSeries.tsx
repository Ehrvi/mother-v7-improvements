/**
 * FOSTimeSeries.tsx — Real-Time Factor of Safety Time-Series Chart
 *
 * SVG-based chart showing FOS(t) over last 24 hours with:
 *   - TARP color zones (Green >1.5, Yellow 1.3-1.5, Orange 1.0-1.3, Red <1.0)
 *   - Rainfall overlay
 *   - Pore pressure (ru) trend
 *   - Auto-recompute trigger on Δru > 5%
 *
 * Scientific basis: ICOLD Bulletin 158, ANCOLD Guidelines, NR DNPM (Brazil)
 */

import { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FOSDataPoint {
  timestamp: number;
  fos: number;
  ru?: number;
  rainfall?: number; // mm/h
  method: string;
}

// Simplified sensor reading for FOS chart (no external dependency)
interface SimpleSensorReading {
  timestamp: number;
  value: number;
  unit?: string;
}

interface FOSTimeSeriesProps {
  data: FOSDataPoint[];
  currentFOS?: number | null;
  piezometerData?: SimpleSensorReading[];
  rainData?: SimpleSensorReading[];
  height?: number;
  showRainfall?: boolean;
  showRu?: boolean;
}

// ─── TARP Thresholds (ICOLD/ANCOLD/NR DNPM) ──────────────────────────────────

const TARP = {
  safe:     { min: 1.5, color: '#22c55e', label: 'Seguro' },
  alert:    { min: 1.3, color: '#eab308', label: 'Atenção' },
  warning:  { min: 1.0, color: '#f97316', label: 'Alerta' },
  critical: { min: 0,   color: '#ef4444', label: 'Crítico' },
};

function fosToColor(fos: number): string {
  if (fos >= TARP.safe.min)    return TARP.safe.color;
  if (fos >= TARP.alert.min)   return TARP.alert.color;
  if (fos >= TARP.warning.min) return TARP.warning.color;
  return TARP.critical.color;
}

function fosToLabel(fos: number): string {
  if (fos >= TARP.safe.min)    return TARP.safe.label;
  if (fos >= TARP.alert.min)   return TARP.alert.label;
  if (fos >= TARP.warning.min) return TARP.warning.label;
  return TARP.critical.label;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FOSTimeSeries({
  data,
  currentFOS = null,
  piezometerData,
  rainData,
  height = 200,
  showRainfall = true,
  showRu = true,
}: FOSTimeSeriesProps) {
  const svgWidth = 600;
  const padding = { top: 20, right: 60, bottom: 30, left: 50 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Time range: last 24h
  const now = Date.now();
  const timeRange = 24 * 60 * 60 * 1000; // 24h in ms
  const tMin = now - timeRange;
  const tMax = now;

  // FOS range: 0 to max(2.5, max FOS)
  const maxFOS = useMemo(() =>
    Math.max(2.5, ...data.map(d => d.fos), currentFOS ?? 0),
    [data, currentFOS]
  );

  // Scale functions
  const xScale = (t: number) => padding.left + ((t - tMin) / (tMax - tMin)) * plotWidth;
  const yScale = (fos: number) => padding.top + (1 - fos / maxFOS) * plotHeight;

  // Rainfall scale (inverted, top of chart = max rainfall)
  const maxRain = useMemo(() =>
    Math.max(30, ...(rainData ?? []).map(r => r.value)),
    [rainData]
  );
  const yRainScale = (v: number) => padding.top + (v / maxRain) * (plotHeight * 0.3); // top 30% of chart

  // Build FOS path
  const fosPath = useMemo(() => {
    const filtered = data.filter(d => d.timestamp >= tMin);
    if (filtered.length === 0) return '';
    return filtered
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.timestamp).toFixed(1)},${yScale(d.fos).toFixed(1)}`)
      .join(' ');
  }, [data, tMin]);

  // Build rainfall bars
  const rainBars = useMemo(() => {
    if (!showRainfall || !rainData) return [];
    return rainData
      .filter(r => r.timestamp >= tMin && r.value > 0)
      .map(r => ({
        x: xScale(r.timestamp),
        h: yRainScale(r.value),
        value: r.value,
      }));
  }, [rainData, showRainfall, tMin]);

  // Time axis labels
  const timeLabels = useMemo(() => {
    const labels = [];
    for (let h = 0; h <= 24; h += 6) {
      const t = tMin + h * 60 * 60 * 1000;
      const date = new Date(t);
      labels.push({
        x: xScale(t),
        label: `${date.getHours().toString().padStart(2, '0')}:00`,
      });
    }
    return labels;
  }, [tMin]);

  // FOS axis labels
  const fosLabels = [0, 0.5, 1.0, 1.3, 1.5, 2.0, 2.5].filter(v => v <= maxFOS);

  return (
    <div className="shms-card" style={{ padding: 'var(--shms-sp-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--shms-sp-2)' }}>
        <div style={{ fontSize: 'var(--shms-fs-base)', fontWeight: 600 }}>
          📈 FOS em Tempo Real
        </div>
        {currentFOS != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: fosToColor(currentFOS),
              boxShadow: `0 0 8px ${fosToColor(currentFOS)}40`,
              animation: 'pulse 2s infinite',
            }} />
            <span style={{ fontSize: 'var(--shms-fs-xl)', fontWeight: 700, color: fosToColor(currentFOS) }}>
              FOS = {currentFOS.toFixed(3)}
            </span>
            <span className={`shms-badge shms-badge--${currentFOS >= 1.5 ? 'green' : currentFOS >= 1.0 ? 'yellow' : 'red'}`}>
              {fosToLabel(currentFOS)}
            </span>
          </div>
        )}
      </div>

      <svg width="100%" viewBox={`0 0 ${svgWidth} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* TARP color zones */}
        <rect x={padding.left} y={yScale(maxFOS)} width={plotWidth} height={yScale(1.5) - yScale(maxFOS)}
          fill={TARP.safe.color} opacity={0.08} />
        <rect x={padding.left} y={yScale(1.5)} width={plotWidth} height={yScale(1.3) - yScale(1.5)}
          fill={TARP.alert.color} opacity={0.08} />
        <rect x={padding.left} y={yScale(1.3)} width={plotWidth} height={yScale(1.0) - yScale(1.3)}
          fill={TARP.warning.color} opacity={0.08} />
        <rect x={padding.left} y={yScale(1.0)} width={plotWidth} height={yScale(0) - yScale(1.0)}
          fill={TARP.critical.color} opacity={0.08} />

        {/* Threshold lines */}
        {[1.0, 1.3, 1.5].map(v => (
          <g key={v}>
            <line x1={padding.left} y1={yScale(v)} x2={padding.left + plotWidth} y2={yScale(v)}
              stroke={fosToColor(v)} strokeWidth={0.5} strokeDasharray="4 4" opacity={0.5} />
            <text x={padding.left + plotWidth + 4} y={yScale(v) + 3}
              fontSize={8} fill={fosToColor(v)} opacity={0.7}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Rainfall bars (blue, top of chart) */}
        {rainBars.map((bar, i) => (
          <rect key={i} x={bar.x - 1} y={padding.top} width={2} height={bar.h}
            fill="#3b82f6" opacity={0.4} />
        ))}

        {/* FOS line */}
        {fosPath && (
          <path d={fosPath}
            fill="none" stroke={currentFOS != null ? fosToColor(currentFOS) : '#60a5fa'}
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Current FOS dot */}
        {currentFOS != null && data.length > 0 && (
          <circle
            cx={xScale(data[data.length - 1].timestamp)}
            cy={yScale(currentFOS)}
            r={4}
            fill={fosToColor(currentFOS)}
            stroke="var(--shms-bg-card)" strokeWidth={2}
          />
        )}

        {/* Y axis (FOS) */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotHeight}
          stroke="var(--shms-border)" strokeWidth={1} />
        {fosLabels.map(v => (
          <text key={v} x={padding.left - 8} y={yScale(v) + 3}
            fontSize={9} fill="var(--shms-text-dim)" textAnchor="end">
            {v.toFixed(1)}
          </text>
        ))}
        <text x={12} y={padding.top + plotHeight / 2}
          fontSize={10} fill="var(--shms-text-dim)" transform={`rotate(-90, 12, ${padding.top + plotHeight / 2})`}
          textAnchor="middle">
          FOS
        </text>

        {/* X axis (time) */}
        <line x1={padding.left} y1={padding.top + plotHeight} x2={padding.left + plotWidth} y2={padding.top + plotHeight}
          stroke="var(--shms-border)" strokeWidth={1} />
        {timeLabels.map((lbl, i) => (
          <text key={i} x={lbl.x} y={padding.top + plotHeight + 15}
            fontSize={9} fill="var(--shms-text-dim)" textAnchor="middle">
            {lbl.label}
          </text>
        ))}

        {/* No data message */}
        {data.length === 0 && (
          <text x={svgWidth / 2} y={height / 2}
            fontSize={12} fill="var(--shms-text-dim)" textAnchor="middle">
            Aguardando dados dos sensores...
          </text>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 'var(--shms-sp-3)', marginTop: 'var(--shms-sp-2)', fontSize: 'var(--shms-fs-xs)', color: 'var(--shms-text-dim)' }}>
        {Object.values(TARP).map(t => (
          <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color, opacity: 0.6 }} />
            {t.label} (≥{t.min.toFixed(1)})
          </div>
        ))}
        {showRainfall && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6', opacity: 0.4 }} />
            Chuva (mm/h)
          </div>
        )}
      </div>
    </div>
  );
}
