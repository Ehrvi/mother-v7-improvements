# SOTA Research — SHMS Time Series, Bench Consolidation & LEM

## 1. Time Series Visualization & Analysis — SOTA

### 1.1 Scientific Foundations

| Paper/Source | Key Contribution |
|---|---|
| **HAT: Hierarchical Attention Transformer** (MDP, 2025) | Multi-scale anomaly detection via local/global Transformer encoders — 96.3% accuracy on SHM data |
| **Foundation Models for SHM** (arXiv, Oct 2025) | Masked Auto-Encoder + fine-tuning achieves 99.92% anomaly detection on bridge sensors |
| **Temporal Fusion Transformer** (ResearchGate, 2024) | TFT for SHM in masonry: seq-to-seq + multi-head attention captures long-term dependencies |
| **Attention-Focused Transformer** (arXiv, 2024) | Self-attention anomaly scores from attention weight deviations — 98.7% accuracy for rail SHM |
| **ISA-18.2** §5.4 (ANSI/ISA-18.2-2016) | Alarm management standards — global alarm summary always visible |
| **HPHMI** (ASM Consortium, 2015) | High Performance HMI: grayscale baseline, color only for alarms, reduced cognitive load |
| **Nielsen Heuristics** | H1: Visibility of system status, H7: Flexibility and efficiency |

### 1.2 SOTA UX/UI Patterns for Time Series Dashboards

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP BAR: KPIs (avg, min, max, trend) + alert count + status    │
├─────────────────────────────────────────────────────────────────┤
│ TOOLBAR: Time range (6h/12h/24h/2D/7D) + sensor filter        │
│          + export PDF + annotations toggle                     │
├─────────────────────────────────────────────────────────────────┤
│ CHART AREA (interactive):                                      │
│   • Zoom/pan (brush selection) via d3/Recharts                 │
│   • Hover crosshair with tooltip (value, time, unit)           │
│   • Alarm thresholds as dashed horizontal lines                │
│   • Anomaly regions highlighted (red/yellow bands)             │
│   • Statistical bands (mean ± 2σ confidence interval)          │
│   • Click-to-expand individual chart to fullscreen             │
│   • Sparklines in side panel for non-focused sensors           │
├─────────────────────────────────────────────────────────────────┤
│ BOTTOM: Correlation matrix mini-heatmap + AI insights panel    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Recommended Improvements

| Feature | Priority | Basis |
|---|---|---|
| **Zoomable brush** — drag-to-zoom on x-axis | 🔴 High | d3-brush, every professional SCADA has this |
| **Crosshair tooltip** — synchronized across charts | 🔴 High | Grafana/Datadog standard |
| **Alarm threshold lines** — dashed horizontal markers | 🔴 High | ISA-18.2 §5.4, ICOLD B.158 |
| **Statistical bands** — mean ± 2σ or ± 3σ | 🟠 Medium | ISO 13374 (Condition Monitoring) |
| **Anomaly highlighting** — colored bands for AI detections | 🟠 Medium | HAT paper, TFT paper |
| **Click-to-expand** — individual chart fullscreen | 🟡 Low | Grafana pattern |
| **Multi-axis overlay** — compare sensors on same chart | 🟠 Medium | Engineering best practice |
| **Export chart as PNG/SVG** — for reports | 🟡 Low | Professional requirement |

---

## 2. Bench Consolidation — SOTA & Benchmarks

### 2.1 Benchmark Parameters (Literature)

| Parameter | Symbol | Typical Range | Standard |
|---|---|---|---|
| **Compression Index** | Cc | 0.1 – 1.0 (soft clay: 0.4–0.8) | ASTM D2435 |
| **Recompression Index** | Cr | 0.015 – 0.035 × Cc | ASTM D2435 |
| **Coefficient of Consolidation** | Cv | 10⁻⁴ – 10⁻² cm²/s | Casagrande log-t / Taylor √t |
| **Preconsolidation Pressure** | σ'p | Site-specific | Casagrande construction |
| **Secondary Compression Index** | Cα | 0.01 – 0.05 (inorganic clays) | ASTM D2435 |
| **Initial Void Ratio** | e₀ | 0.6 – 2.5 (depends on soil) | — |
| **Coefficient of Permeability** | k | 10⁻⁸ – 10⁻⁶ cm/s (clays) | Back-calculated from Cv |

### 2.2 ICOLD Benchmark References

- **ICOLD Bulletin 158**: Dam Safety Management — monitoring parameters
- **ICOLD Benchmark Workshop**: Numerical models comparison for dam safety
- **ICOLD Committee H** (2024-2028): Risk identification via surveillance and monitoring

### 2.3 SOTA Software Dashboard Features

| Software | Key UI Feature |
|---|---|
| **GDSLAB v2024/2025** | Real-time oedometer dashboard, customizable GUI, multi-language |
| **SO-Consolidation** | Auto Cv/Cc computation with Casagrande/Taylor methods |
| **Certified MTP** | Real-time graphing, ASTM/AASHTO compliant reports |
| **CiviLab** | Oedometer curve plotting, Cc/Cr/σ'p computation |
| **Rocscience Settle3** | 3D primary/secondary consolidation analysis |

### 2.4 Recommended UI Inputs (Current Missing)

```
┌── Consolidation Parameters Input Form ──┐
│ Initial Void Ratio (e₀):     [____]     │
│ Specific Gravity (Gs):       [____]     │
│ Sample Height (H):           [____] mm  │
│ Sample Diameter (D):         [____] mm  │
│ ─── Load Schedule ───────────────────── │
│ Stage 1: [___] kPa  Duration: [__] hours│
│ Stage 2: [___] kPa  Duration: [__] hours│
│ [+ Add Stage]                            │
│ ─── Method Selection ───────────────── │
│ ☑ Casagrande log-t   ☑ Taylor √t       │
│ ☐ Isotache method                       │
│ ─── Output Parameters ─────────────── │
│ ☑ e-log σ' curve   ☑ Cv   ☑ Cc/Cr     │
│ ☑ Settlement prediction                 │
└──────────────────────────────────────────┘
```

---

## 3. Limit Equilibrium Methods (LEM) — SOTA & Required Inputs

### 3.1 Methods Comparison

| Method | Slip Surface | Force/Moment Eq. | Interslice Assumptions |
|---|---|---|---|
| **Bishop Simplified** | Circular | Moment only | Horizontal interslice forces |
| **Janbu Simplified** | Non-circular | Force only | Horizontal interslice forces |
| **Spencer** | Any | Both | Constant interslice force ratio |
| **Morgenstern-Price** | Any | Both | Variable interslice function f(x) |
| **GLE** | Any | Both | Generalized (most rigorous) |

### 3.2 Required User Inputs (SOTA Software Standard)

> [!IMPORTANT]
> Current SHMS Stability Panel is **missing most of these inputs**. Users need to define their specific parameters.

#### A. Geometry Inputs
- Cross-section profile (coordinates or drawn)
- Soil layer boundaries
- Rock surface / bedrock depth
- Slope angle and height

#### B. Material Properties (per layer)
| Property | Symbol | Unit |
|---|---|---|
| Unit Weight (bulk) | γ | kN/m³ |
| Unit Weight (saturated) | γ_sat | kN/m³ |
| Effective Cohesion | c' | kPa |
| Effective Friction Angle | φ' | degrees |
| Undrained Shear Strength | Su | kPa |
| Strength Model | — | Mohr-Coulomb / Hoek-Brown |

#### C. Pore Water Pressure
- Water table elevation
- Piezometric line
- Ru coefficient (ratio)
- Seepage analysis results (from FEM)

#### D. External Loading
- Surcharge loads (kPa)
- Seismic coefficients (kh, kv) — pseudo-static
- Reservoir water level

#### E. Reinforcement (optional)
- Geogrid / geotextile strength
- Anchor locations and forces
- Pile locations and capacity

#### F. Slip Surface Search
- Circular (center grid + radius)
- Non-circular (entry-exit points)
- Block (planar wedges)
- Auto-search (Cuckoo, Simulated Annealing)

### 3.3 Recommended UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ LEFT PANEL (1/3)              │ CENTER (2/3)                    │
│ ┌──────────────────────────┐  │ ┌────────────────────────────┐  │
│ │ 📐 Geometry              │  │ │ Interactive SVG/Canvas     │  │
│ │  Draw / Import           │  │ │  - Slope cross-section     │  │
│ │  Add Layer →             │  │ │  - Colored soil layers     │  │
│ ├──────────────────────────┤  │ │  - Water table (blue)      │  │
│ │ 🧱 Materials             │  │ │  - Load arrows             │  │
│ │  Layer 1: [γ][c'][φ']    │  │ │  - Slip circle (result)    │  │
│ │  Layer 2: [γ][c'][φ']    │  │ │  - FoS label on critical   │  │
│ │  [+ Add Material]        │  │ └────────────────────────────┘  │
│ ├──────────────────────────┤  │ ┌────────────────────────────┐  │
│ │ 💧 Water Table           │  │ │ Results Table              │  │
│ │  Elevation: [____] m     │  │ │  Bishop:   FoS = 1.45      │  │
│ │  Ru: [____]              │  │ │  Spencer:  FoS = 1.42      │  │
│ ├──────────────────────────┤  │ │  M-Price:  FoS = 1.43      │  │
│ │ ⚡ Loading                │  │ │  Min FoS: 1.42 (Spencer)   │  │
│ │  Surcharge: [____] kPa   │  │ └────────────────────────────┘  │
│ │  kh: [____]  kv: [____]  │  │                                 │
│ ├──────────────────────────┤  │                                 │
│ │ 🔧 Analysis Method       │  │                                 │
│ │  ☑ Bishop  ☑ Spencer     │  │                                 │
│ │  ☑ M-Price ☐ Janbu       │  │                                 │
│ │  Search: [Circular ▼]    │  │                                 │
│ │  [▶ Run Analysis]        │  │                                 │
│ └──────────────────────────┘  │                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Reference Software (SOTA)

| Software | Publisher | Key Features |
|---|---|---|
| **Slide2** | Rocscience | Auto-search, 2D/3D, probabilistic analysis |
| **SLOPE/W** | GeoStudio | Rigorous GLE, coupled with SEEP/W |
| **PLAXIS LE** | Bentley | 2D/3D + MPA, FEM integration |
| **SSAP2010** | Open source | Freeware, Windows 11 GUI |
| **EnSlope** | Ensoft | Enhanced graphics, simplified entry |

---

## References

1. Hierarchical Attention Transformer for sensor anomaly detection (MDP, 2025)
2. Foundation Models for SHM using Transformers (arXiv:2510.xxxxx, 2025)
3. Temporal Fusion Transformer for SHM masonry (ResearchGate, 2024)
4. Attention-Focused Transformer for rail SHM (arXiv, 2024)
5. ISA-18.2 Alarm Management Standard (ANSI/ISA, 2016)
6. HPHMI — High Performance HMI Design (ASM Consortium, 2015)
7. ICOLD Bulletin 158 — Dam Surveillance (ICOLD, 2018)
8. ASTM D2435 — Standard Test for Consolidation of Soils
9. Rocscience Slide2 — Slope Stability Analysis (rocscience.com)
10. GeoStudio SLOPE/W — Limit Equilibrium (geoslope.com)
11. PLAXIS LE — 2D/3D Slope Stability (bentley.com)
12. Terzaghi's Theory of 1D Consolidation (1925)
13. ICOLD Committee H — Dam Safety (2024-2028)
