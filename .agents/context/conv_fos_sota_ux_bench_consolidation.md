# SOTA Research — Bench Consolidation (2024-2025)

> Sources: arXiv, Frontiers, MDPI, UWA, NIOSH/CDC, Rocscience, Maptek, ResearchGate

---

## 1. Expanded Modified Ritchie Criterion (EMRC)

**Source:** NIOSH Highwall Safety Project (UWA, 2023-2024)

The original MRC (`CBW = 0.2×BH + 4.5`) only uses bench height. The EMRC adds bench face angle:

```
90% Retention Distance = 0.2 × BH - 0.1 × (BFA - 65) + 4.5
```

| Variable | Description |
|---|---|
| `BH` | Bench height (m) |
| `BFA` | Bench face angle (°) |
| `90% RD` | Distance to contain 90% of rockfall events |

> **Insight:** For BFA > 65°, less catch bench width is needed; for BFA < 65°, more width is needed. Current implementation uses MRC only.

**Implementation:** Replace `assessCatchment()` with EMRC that takes `alpha` (bench face angle) into account.

---

## 2. Probabilistic FoS — Monte Carlo Simulation

**Source:** MDPI (2024), ResearchGate, MIT

Deterministic FoS alone doesn't capture parameter uncertainty. Monte Carlo samples c, φ, γ from statistical distributions:

```
For i = 1 to N_sims:
  c_i ~ Normal(μ_c, σ_c)      // cohesion
  φ_i ~ Normal(μ_φ, σ_φ)      // friction angle
  γ_i ~ Normal(μ_γ, σ_γ)      // unit weight
  FoS_i = Bishop(c_i, φ_i, γ_i, geometry)

PoF = count(FoS_i < 1.0) / N_sims
```

**Read & Stacey 2009 PoF Acceptance Criteria:**

| Scale | Low Consequence | Medium | High |
|---|---|---|---|
| Bench | PoF ≤ 50% | PoF ≤ 25% | PoF ≤ 10% |
| Inter-ramp | PoF ≤ 25% | PoF ≤ 15% | PoF ≤ 10% |
| Overall | PoF ≤ 20% | PoF ≤ 10% | PoF ≤ 5% |

**Implementation:** Add `monteCarloPoF()` function with N=5000 simulations, output PoF% and FoS histogram data.

---

## 3. NSGA-II Multi-Objective Optimization

**Source:** Frontiers in Earth Science (2025), SVM-NSGA-II

Current DGM uses single-objective (weighted sum). True NSGA-II provides:
- **Non-dominated sorting** (Pareto ranks)
- **Crowding distance** (diversity preservation)
- **Multiple objectives:** maximize FoS, minimize rock volume, maximize catchment retention

```
Objectives:
  f₁ = -FoS_min        (maximize safety)
  f₂ = Volume           (minimize waste)
  f₃ = -Retention%      (maximize catchment)
```

**Implementation:** Replace `dgmOptimize()` sorting with true non-dominated sorting + crowding distance. Return `paretoFront[]` with rank classification.

---

## 4. Compliance Heatmap Visualization

**Source:** Maptek PointStudio (2024), SRK Consulting

Per-bench color-coded conformance comparing designed vs. as-built face angles:

| Deviation | Color | Status |
|---|---|---|
| ≤ ±3° | 🟢 Green | Compliant |
| ±3°–6° | 🟡 Amber | Marginal |
| > ±6° | 🔴 Red | Non-compliant |

**Implementation:** Add SVG heatmap showing per-bench compliance with tooltip showing designed vs actual angle.

---

## 5. Managed Bench Approach

**Source:** Rocscience SWedge (2024)

Accept ≤20% controlled bench-scale failures for steeper angles → economic benefit. Design reliability = 80% standard in open-pit mining.

```
Acceptable design: PoF_bench ≤ 20% AND FoS_bench ≥ 1.1
```

**Implementation:** Show managed approach indicator: "Design Reliability: X%" badge on hero verdict card.

---

## 6. Real-Time Dashboard Patterns

**Source:** Canary Systems, RamJack Tech, GroundProbe (2024)

| Feature | Current | SOTA |
|---|---|---|
| Parameter input | Sliders | Sliders + presets + autofill from sensor |
| Results display | DAC cards | DAC cards + PoF gauge + compliance heatmap |
| Optimization | Single sparkline | 3-axis Pareto + convergence |
| Audit | Timeline | Timeline + PDF report with SHA-256 |
| Catchment | MRC bar | EMRC comparison + retention probability |
