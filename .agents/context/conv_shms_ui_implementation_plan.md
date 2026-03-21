# SOTA UI Upgrade — SHMS Narrative Twin

## Goal

Transform the Narrative Twin from a functional prototype into a **premium, SOTA monitoring interface** that feels like Google Earth Pro meets a professional SCADA control room. The 3D mine model remains the hero; all UI overlays enhance without cluttering.

## Scientific Grounding

| Principle | Source | Application |
|---|---|---|
| Overview → Zoom → Details | Shneiderman (1996) | 3D overview → hover labels → modal details |
| Color for anomalies only | ISA-101 / IEC 62682 | Muted base, color only on alerts/thresholds |
| Reduce cognitive load | ISA-101 §4 | Hide HUD until needed, progressive disclosure |
| Data-ink ratio | Tufte (2001) | Charts in modals, not on 3D canvas |
| Glassmorphism depth | UI Trends 2025 | Frosted glass panels with motion blur |
| Gestalt figure-ground | Wertheimer (1923) | Modal backdrop blur separates focus |

---

## Proposed Changes

### 1. Ambient HUD CSS Effects

#### [NEW] `shms-narrative-twin.css`

Create dedicated CSS file with:
- **Scan-line overlay**: subtle horizontal lines across 3D (CRT monitor effect, 2% opacity)
- **Radial vignette**: dark edges focus attention on center model
- **Pulse keyframes**: sensor dots, health indicators
- **Grid overlay**: faint engineering grid (5% opacity) for scale reference
- **Glow effects**: accent borders on health strip and chat
- **Smooth transitions**: modal enter/exit, chat expand/collapse

---

### 2. Health Strip Redesign

#### [MODIFY] [SHMSNarrativeTwin.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/pages/SHMSNarrativeTwin.tsx)

Current: simple flex row with pills.
Upgrade to:
- **Glassmorphism bar** with frosted glass (`backdrop-filter: blur(20px) saturate(180%)`)
- **Animated health arc**: circular SVG indicator showing 94.2% with gradient fill
- **Timestamp + live dot** (pulsing green dot with "LIVE" label)
- **Structure selector dropdown** (for multi-structure support)
- **Alert badge** with count + severity color coding (ISA-101: red=critical, yellow=warning)

---

### 3. Floating Instrument Labels on 3D

#### [MODIFY] [SHMSNarrativeTwin.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/pages/SHMSNarrativeTwin.tsx)

Add floating HTML labels that project from instrument positions on the 3D model:
- Mini cards showing `ID: value unit` (e.g. "PZ-003: 187.5 kPa")
- Color-coded status dot (green/yellow/red per ISA-101)
- Click to open the instrument modal
- Appear/disappear with hover proximity

---

### 4. Chat Bar AI Experience

#### [MODIFY] [SHMSNarrativeTwin.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/pages/SHMSNarrativeTwin.tsx)

- **AI typing animation**: pulsing dots "..." while "thinking"
- **Suggested prompts**: chip buttons above input ("Status geral", "PZ-003", "Anomalias", "Relatório ICOLD")
- **Markdown rendering** in AI messages (bold, bullet lists)
- **Smooth expand/collapse** with spring animation
- **Timestamp** on each message

---

### 5. Modal Redesign — Tabbed + Animated

#### [MODIFY] [SHMSNarrativeTwin.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/pages/SHMSNarrativeTwin.tsx)

Current: single 2-column layout.
Upgrade to **tabbed interface** with animated transitions:

| Tab | Content |
|---|---|
| 📊 Série Temporal | Full 90d chart + LSTM 48h forecast (expanded, recharts-based) |
| 🔬 Análise HST | HST decomposition + scientific context |
| 📋 Ficha Técnica | Instrument specs table |
| 🤖 IA Análise | AI-generated narrative about this instrument's health |

Additional improvements:
- **Animated chart entrance** (draw-in effect with CSS)
- **Threshold proximity indicator** (gauge showing how close to limit)
- **Viridis gradient top accent** (already exists, keep)
- **Comparison mode**: overlay another instrument's data

---

### 6. Quick Info Chips

#### [MODIFY] [SHMSNarrativeTwin.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/pages/SHMSNarrativeTwin.tsx)

Add subtle floating info chips around 3D edges:
- Bottom-left: "🛰️ 16 sensores online" with pulse
- Bottom-right: "LSTM: estável" with green indicator
- Only visible on idle (fade out when interacting)

---

### 7. Minimap / Overview Indicator

#### [MODIFY] [SHMSNarrativeTwin.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/pages/SHMSNarrativeTwin.tsx)

Small wireframe minimap in bottom-left corner:
- Shows camera position relative to structure
- Clickable sections to navigate to instrument groups
- Glassmorphism panel style

---

## Verification Plan

### Browser Testing
- Navigate to `/shms-narrative`
- Verify 3D model loads with ambient HUD effects (scanlines, vignette)
- Verify health strip animates and shows live data
- Test chat with "Mostra PZ-003" → verify tabbed modal opens
- Test modal tab switching with animated transitions
- Verify no HUD clutter — 3D remains hero
- Screenshot comparisons with mockup
