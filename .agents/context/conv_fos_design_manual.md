# MOTHER SHMS — Design Manual

> Minimalist Scientific Visualization Standard

## 1. Philosophy

**"Above all else, show the data."** — Edward Tufte

Every pixel must earn its place. Remove chartjunk. Maximize data-ink ratio.

## 2. Color Palette (Dark Mode)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0f1117` | Page background |
| `--bg-card` | `#161b22` | Card surfaces (elevation 1) |
| `--bg-elevated` | `#1c2129` | Elevated surfaces (elevation 2) |
| `--border` | `#30363d` | Borders, grid lines |
| `--text-primary` | `#e6edf3` | Primary text |
| `--text-secondary` | `#8b949e` | Labels, captions, axes |
| `--text-muted` | `#484f58` | Disabled, decorative |
| `--accent-primary` | `#58a6ff` | Primary data, links |
| `--accent-success` | `#3fb950` | FOS safe (>1.5) |
| `--accent-warning` | `#d29922` | FOS marginal (1.0-1.5) |
| `--accent-danger` | `#f85149` | FOS critical (<1.0) |
| `--soil-fill` | `#8b949e` | Generic soil fill (opacity 0.08) |

> [!IMPORTANT]
> Maximum 2 accent colors per visualization. Use opacity (0.1–0.3) for fills, full opacity for strokes.

## 3. Typography

- **Headers**: `Inter` 600, 14px
- **Data labels**: `Inter` 500, 11px
- **Annotations**: `JetBrains Mono` 400, 10px (monospaced for numbers)
- **Axis labels**: `Inter` 400, 10px, `--text-secondary`

## 4. SVG Visualization Rules

### 4.1 Geometry
- Use `<clipPath>` to restrict all drawn elements to the soil body
- Stroke width: 1–2px for data, 0.5px for grid
- No drop shadows. No gradients on data.
- Soil layers: fill with hatch pattern (45° lines, 4px gap)

### 4.2 Slip Surface
- Draw ONLY the arc from entry-point to exit-point (circle ∩ surface)
- Stroke: 2px solid, `--accent-primary` (single result) or distinct accent per method
- Entry/exit points: small circles (r=3px)
- NO full circles. Ever.
- Failure mass: fill between arc and surface, opacity 0.08

### 4.3 Labels
- Position OUTSIDE the geometry (above or to the side)
- Background: semi-transparent `--bg-card` pill
- Format: `FOS = 1.373` (monospace numbers)
- Never overlap. Use leader lines if necessary.

### 4.4 Grid & Scale
- Light dotted grid, color `--border` at 0.3 opacity
- Axis ticks every 5m or 10m (auto-scaled)
- Scale bar at bottom-right
- Dimensions in meters

## 5. Tables

- No visible borders on cells
- Header row: `--text-secondary`, bottom border only
- Data rows: `--text-primary`, subtle row separator
- Numbers: right-aligned, monospace font
- Highlight best result with `--accent-primary` text weight

## 6. Component Hierarchy

```
Card (--bg-card, 12px radius, 1px border)
  └─ Header (14px, 600 weight, no emoji)
  └─ SVG Visualization (viewBox, clipPath, grid)
  └─ Legend (inline, minimal, 10px)
  └─ Table (comparison data)
```

## 7. Anti-Patterns (NEVER DO)

- ❌ Emoji in headers (📐🧬🐝)
- ❌ Full circles extending outside slope
- ❌ More than 2 data colors per chart
- ❌ Convergence charts (user doesn't need to see algorithm internals)
- ❌ Bright saturated colors (#22c55e, #f59e0b)
- ❌ Overlapping labels
- ❌ Decorative elements that don't encode data

## References

1. Tufte, E.R. (2001). *The Visual Display of Quantitative Information*
2. Material Design — Dark Theme Guidelines (2024)
3. WCAG 2.1 — Contrast Requirements (AA: 4.5:1)
4. Carbon Design System — Data Visualization (IBM, 2024)
5. Rocscience SLIDE2 — Display Preferences
6. GeoStudio SLOPE/W — Output Customization
