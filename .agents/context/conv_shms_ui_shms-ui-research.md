# SHMS UI Research — Systematic Literature Review

> Methodology: Kitchenham & Charters (2007) — Systematic Literature Review
> Date: 2026-03-18 | Sources: 6 web searches, 40+ references

---

## 1. Research Questions & Key Findings

### RQ1: Dashboard patterns for geotechnical real-time monitoring

**Finding:** SOTA SHM dashboards use a **sidebar+topbar shell** with contextual content area. Critical pattern: **Overview → Drill-down** (Grafana, ThingsBoard, Proqio, AEM Elements 360).

- **KPI cards** at top for instant situational awareness (health score, active alerts, structures count)
- **Structure/asset selector** in sidebar for multi-structure navigation
- **Time-series** as primary visualization, with threshold lines and anomaly markers
- **Digital twin integration** as a premium differentiator (Proqio, Adasa Dam360)

### RQ2: SCADA/SHM multi-sensor visualization with ICOLD alerts

**Finding:** High-Performance HMI (HPHMI) principles from ISA-18.2 / IEC 62682 are the gold standard:

- **Grayscale for normal** — subdued palette reduces visual fatigue
- **Color reserved for alarms** — bright/saturated colors ONLY for abnormal states
- **Redundant coding** — never rely on color alone (shape + text + position)
- **P1-P4 alarm priority** with IEC 62682 lifecycle (unacknowledged → acknowledged → cleared)
- **Dark backgrounds** (dark gray/navy) reduce glare in 24/7 control rooms

### RQ3: Design systems for engineering-critical applications

**Finding:** No pre-built design system fits. Industrial apps create custom systems with:
- **oklch color space** for perceptual uniformity
- **Design tokens** for systematic dark mode
- **Inter typeface** (optimized for UI) at 12-14px body, 10px for dense data
- **8px grid** for consistent spacing

### RQ4: Geospatial & time-series visualization SOTA

**Finding:**
- **Time-series:** Apache ECharts chosen over Recharts/D3 for Canvas rendering (10x performance on large datasets), built-in zoom/pan/brush, dataZoom, streaming support
- **Geospatial:** SVG-based cross-sections + risk maps (no need for full Mapbox — structures are localized)
- **3D:** Existing Three.js/React Three Fiber implementation is adequate

### RQ5: Emergency alert interaction patterns

**Finding:** From ICOLD Bulletin 158 + GISTM 2020 + IEC 62682:
- **3-level alarm** (WATCH → WARNING → CRITICAL) with distinct colors (yellow → orange → red)
- **Acknowledge workflow** — operators must explicitly acknowledge alerts
- **Escalation timeline** — visual indicator of time since alert was raised
- **Siren control** — big, clear emergency buttons with confirmation dialogs

---

## 2. Commercial Software Analysis

| Software | Layout Pattern | Key UI Feature |
|---|---|---|
| **Proqio** (Encardio) | Sidebar + map + charts | Real-time dashboard, digital twin, 3D geological maps |
| **Adasa Dam360** | Tab navigation + configurable widgets | Drag-and-drop dashboard builder, map + charts + tables |
| **AEM Elements 360** | Vertical tabs + content area | Custom dashboard displays, multi-sensor overlay |
| **Grafana** | Sidebar + panel grid | Time-series panels, threshold coloring, drill-down links |
| **ThingsBoard** | Sidebar + widget dashboard | IoT widget library, real-time WebSocket, alarm tables |
| **OSIsoft PI Vision** | Asset tree + display area | Process graphics, trend overlays, event frames |

**Common pattern:** All use a **persistent sidebar** for navigation + **topbar** for global status + **content area** with contextual panels.

---

## 3. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Chart library | **Apache ECharts** (via `echarts-for-react`) | Canvas rendering, 10x faster than SVG for real-time, built-in dataZoom, 25+ chart types, streaming |
| Data fetching | **React Query** (`@tanstack/react-query`) | Cache-aside, automatic polling, stale-while-revalidate, error retry |
| Routing | **React Router v6** nested routes | Already in project, supports layout nesting |
| CSS approach | **Vanilla CSS with design tokens** | oklch color space, no Tailwind dependency |
| Tables | **Native HTML** with sort/filter hooks | Avoids large dependency; ~200 sensors max |
| SVG visualization | **Inline SVG** (React components) | Cross-sections, boreholes, fault trees — all tree/graph structures |

---

## 4. Design Principles (Consolidated)

### From HPHMI (ISA-18.2 / IEC 62682)
1. **Grayscale-first** — normal state uses muted/subdued palette
2. **Color = alarm** — bright color reserved exclusively for abnormal conditions
3. **4-level priority** — P1 (critical/red), P2 (high/orange), P3 (medium/yellow), P4 (low/blue)
4. **No animation except alarms** — pulsing/blinking only for unacknowledged critical alerts

### From Grafana/ThingsBoard
5. **Overview → drill-down** — summary first, click for detail
6. **Time range selector** — global control that affects all time-series panels
7. **Threshold lines** — visual reference on charts for warn/alert levels
8. **Panel links** — interconnected dashboards for navigation flow

### From Nielsen (1994) + ISO 9241
9. **H1: System status visibility** — always show MQTT status, last update, health score
10. **H2: Match real world** — use geotechnical terminology (piezômetro, FOS, etc.)
11. **H7: Flexibility** — collapsible sidebar, resizable panels
12. **H10: Help** — tooltips with scientific basis references

### From WCAG 2.1 AA
13. **Contrast ≥ 4.5:1** for text on dark backgrounds
14. **Never color-only** — pair color with icon/text/shape
15. **Keyboard navigation** — all interactive elements focusable

---

## 5. Module Wireframes (Text)

### Layout Shell
```
┌──────────────────────────────────────────────────┐
│ [TOPBAR] Logo │ Health:92% │ MQTT● │ ⟳ │ 🔔 3  │
├────────┬─────────────────────────────────────────┤
│        │                                         │
│  S     │        CONTENT AREA                     │
│  I     │                                         │
│  D     │  (routed by sidebar selection)           │
│  E     │                                         │
│  B     │                                         │
│  A     │                                         │
│  R     │                                         │
│        │                                         │
├────────┴─────────────────────────────────────────┤
│ [FOOTER] SHMS v4 │ ISO 13374 │ ICOLD 158 │ 36ep │
└──────────────────────────────────────────────────┘
```

### Sidebar Sections
```
📊 Dashboard (Overview, Structure Detail)
📡 Sensors (Time Series, Sensor Table)
🔬 Analysis (Signal, RUL, Stability, Fault Tree)
🗺 Geo (Risk Map, Cross-Section, Boreholes, 3D)
🚨 Alerts (Alerts, Events, TARP, Sirens)
📥 Ingestion (Status, Config, Import)
📁 Documents (Files, Docs, Export)
⚙ Admin (BI, Budget, System Health)
🤖 AI (Analysis Chat, Insights)
```
