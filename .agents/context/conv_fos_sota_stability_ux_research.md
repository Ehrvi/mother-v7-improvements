# SOTA Research: Geotechnical Stability Analysis UX/UI

## Sources Consulted

| Source | Type | Key Findings |
|--------|------|-------------|
| **Rocscience Slide2** (rocscience.com/software/slide2) | Commercial software manual | Workflow tabs (Profile→Geometry→Support→Surfaces→Groundwater), context-sensitive sidebar with per-entity editing, visibility tree, material editor with per-layer modal, slip surface methods (Grid Search/Slope Search/Auto Refine/Cuckoo Search), probabilistic inputs for all parameters |
| **GeoSlope SLOPE/W** (geoslope.com) | Commercial software manual | Define→Solve→Results 3-view architecture, piezometric line assignment per layer, material editor with clone/add/color picker, Morgenstern-Price side function selector, entry/exit range for slip surfaces |
| **GEO5 Slope Stability** (finesoftware.eu) | Commercial software manual | Top-to-bottom frame workflow, built-in soil database with hint buttons, color+pattern per soil, construction stages, anchor verification (2024) |
| **CalcForge** (calcforge.com) | Web-based analysis tool | 50 slices, multi-layer, water table, Bishop + Fellenius, reactive web UI |
| **arXiv API** (export.arxiv.org) | Academic literature | PCA-PANN hybrid ML for slope stability prediction (MDPI 2024), deep learning for geotechnical reliability |
| **OWASP/WCAG/Material Design** | UX standards | 4.5:1 contrast ratio, progressive disclosure, avoid pure #000/#FFF, desaturate vibrant hues 20-30% on dark backgrounds |

## Critical SOTA Patterns Identified

### 1. Per-Layer Modal Editor (Slide2 Sidebar Pattern)
— Each soil layer should be clickable → opens a dedicated modal with **all** editable properties:
- Mohr-Coulomb: c', φ', γ, γ_sat
- Water: ru, piezometric head, water table assignment
- Advanced: anisotropy, non-linear strength envelope, Hoek-Brown for rock
- Visual: color picker, hatch pattern selector
- **Scientific ref**: Slide2 Material Properties Dialog (Rocscience, 2024)

### 2. Number of Slices as User Input (Method of Slices)
— **All** LEM methods should expose `nSlices` as an input (default 20-50)
- Bishop, Spencer, M-Price, Janbu all use this parameter
- Higher slices → more accuracy but slower
- **Scientific ref**: CalcForge uses 50 slices; SLOPE/W standard is 30

### 3. Multiple Piezometers & Water Levels
— Each layer can have its own piezometric surface
- SLOPE/W: "Assign piezometric line to layer" dialog
- Slide2: Multiple water tables, drawdown lines, tension cracks
- **Scientific ref**: GeoStudio SLOPE/W Piezometric Lines (Seequent, 2024)

### 4. Multiple Surcharges with Position/Magnitude
— Array of surcharges, each with: position (x₁, x₂), magnitude (kPa), type (uniform/trapezoidal/point)
- Slide2: Distributed loads, line loads, seismic loads as separate entities
- **Scientific ref**: SLOPE/W concentrated/distributed load dialogs

### 5. Workflow-Driven UI (Slide2 Workflow Tabs)
— Replace flat tab bar with a guided workflow:
`Geometria → Materiais → Água → Cargas → Superfície → Análise → Resultados`
- Context-sensitive: selecting a layer in geometry highlights it in the SVG
- **Scientific ref**: Slide2 Workflow Tabs (Rocscience, 2024)

### 6. Progressive Disclosure (Nielsen/Norman Group)
— Don't show all options at once. Use expandable sections and contextual panels
- Parameters revealed only when relevant method is selected
- Advanced settings behind "More Options" expander
- **Scientific ref**: Nielsen (1994) "10 Usability Heuristics"; Material Design 3 guidelines

### 7. Visual Identity & Design System
— Current issues: flat buttons, no depth, no glassmorphism, weak color hierarchy
- SOTA: desaturated accent colors, subtle gradients, card elevation with box-shadow layers
- Dark theme: background #0d1117 → #161b22 → #21262d (GitHub dark palette)
- **Scientific ref**: Material Design 3 Dark Theme guidelines; Atmos.style dark mode patterns
