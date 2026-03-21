# 🏗️ Dam 3D Models for Digital Twins — Research Report

> **Date**: 2026-03-18 | **Sources**: arXiv, CGTrader, Sketchfab, TurboSquid, ICOLD, MDPI, ResearchGate
> **Dam types covered**: Concrete gravity, Arch, Buttress, Earth embankment, Run-of-river

---

## 📦 1. FREE 3D DAM MODELS

### By Platform

| Platform | Models | Formats | Dam Types | Link |
|----------|--------|---------|-----------|------|
| **Meshy AI** | Multiple | STL, OBJ, glTF, FBX | Generic | [meshy.ai](https://meshy.ai) |
| **CGTrader** | Arch Dam, Cooby Dam | MAX, OBJ, FBX, 3DS, C4D | Arch, Generic | [cgtrader.com](https://cgtrader.com) |
| **TurboSquid** | Dam on River, Hydroelectric | FBX, OBJ, Blend | Gravity, Hydro | [turbosquid.com](https://turbosquid.com) |
| **Sketchfab** | Dam collections | glTF, OBJ, FBX | Mixed | [sketchfab.com](https://sketchfab.com) |
| **SketchUp 3D Warehouse** | Buttress Dam | SKP | Buttress | [3dwarehouse.sketchup.com](https://3dwarehouse.sketchup.com) |
| **3DModels.org** | Embankment Dam | FBX, OBJ | Embankment | [3dmodels.org](https://3dmodels.org) |
| **CadNav** | Concrete Overflow, River Dam | .3DS | Gravity, Overflow | [cadnav.com](https://cadnav.com) |
| **Clara.io** | Multiple | OBJ, Blend, STL, FBX | Mixed | [clara.io](https://clara.io) |
| **Open3DModel** | Multiple | OBJ, STL, glTF, FBX | Mixed | [open3dmodel.com](https://open3dmodel.com) |
| **Energy Encyclopedia** | Buttress Dam | Downloadable + instructions | Buttress | [energyencyclopedia.com](https://energyencyclopedia.com) |

### By Dam Type

| Dam Type | Best Free Model | Format | Notes |
|----------|----------------|--------|-------|
| **Concrete Gravity** | TurboSquid "Dam on River" | Blend/FBX | Most common, easy to parametrize |
| **Arch** | CGTrader "Arch Dam" | OBJ/FBX | ICOLD-relevant, curved geometry |
| **Buttress** | SketchUp "Buttress Dam" | SKP→OBJ | Energy Encyclopedia has instructions |
| **Earth Embankment** | 3DModels.org "Embankment Dam" | FBX/OBJ | Blender 3.5 source |
| **Run-of-River** | CadNav "Concrete Overflow" | .3DS | Low-head dam for hydropower |

> **Recommended format for web**: **glTF** (GL Transmission Format) — "JPEG of 3D". Three.js `GLTFLoader` supports geometry, materials, animations. Optimal for web digital twins.

---

## 🔬 2. ACADEMIC RESEARCH

### Digital Twin Frameworks for Dams

| Source | Title/Focus | Key Technique |
|--------|-------------|---------------|
| **MDPI (2025)** | Digital Twin for Concrete Gravity Dam Durability | FEM + field monitoring + risk quantification |
| **K-Twin SJ** | GIS-based geospatial DT of dam/river systems | 3D GIS + real-time water management data |
| **Hydro3DJS** | Real-time 3D hydro monitoring | Three.js + sensor overlay + live data ingestion |
| **Stanford** | Structural Digital Twin framework | Real-time data + physics models + ML |
| **Middlesex Uni.** | Low-cost DT for bridges & dams | Early structural damage detection |
| **CFBR** | 3D laser scanning + photogrammetry for dams | GIS point clouds with deformation data |

### ICOLD Sensor Placement Research

| Topic | Method | Reference |
|-------|--------|-----------|
| **Optimal sensor placement** (arch dams) | Effective Independence Method + quantum genetic algorithm | ResearchGate (2024) |
| **Dynamic characteristics** | Modal identification from sensor arrays | Semantic Scholar |
| **Sensor types** | Pore pressure, strain, crack, tilt, InSAR, accelerometers | Encardio-rite / ICOLD |

### UAV-Based 3D Reconstruction

- **Open-source tools**: UAV photogrammetry → point clouds, orthophotos, textured 3D models
- **Use case**: Crack detection, displacement monitoring, dam safety assessment
- **Cost**: Low-cost alternative to LiDAR for periodic surveys

---

## 🛠️ 3. TOOLS FOR WEB INTEGRATION

| Tool | Type | Use for Dam DT |
|------|------|----------------|
| **Three.js** | WebGL library | Render glTF dam models in browser w/ sensor overlay |
| **GLTFLoader** | Three.js plugin | Import dam `*.glb` / `*.gltf` files |
| **Xeokit SDK** | Open-source WebGL | Large-scale BIM visualization in browser |
| **CivilFEM** | Commercial FEA | Dam stability analysis (nonlinear, transient) |
| **PrePoMax** (open-source) | FEA pre/post | Structural analysis of 3D dam models (CalculiX) |
| **Frame3DD** | Open-source | 3D structural analysis |
| **OpenSees** | Open-source FEA | Nonlinear seismic analysis for dams |

---

## 🎯 4. INTEGRATION RECOMMENDATION

### Immediate (current SHMS)

1. **Download glTF dam model** from Sketchfab/Meshy AI → load via `GLTFLoader` in Three.js
2. **Overlay sensor dots** on 3D model at known coordinates (same as SVG wireframe, but in 3D)
3. **Color-code sensors** by anomaly status (green/yellow/red per ICOLD/ISA-18.2)
4. **Live data feed** from `/api/shms/v2/dashboard/all` → update sensor values in real-time

### Medium-term

5. **UAV photogrammetry** → generate site-specific point cloud → render in Three.js
6. **FEM mesh overlay** → show stress/strain contours on 3D model (from OpenSees/CivilFEM results)
7. **Multi-dam support** → different glTF models per `structureType` (gravity, arch, buttress, embankment)

### Advanced

8. **Hydro3DJS integration** → real-time water level + flow visualization
9. **InSAR deformation overlay** → satellite-based ground deformation on 3D model
10. **ICOLD-optimal sensor placement** → suggest sensor positions via quantum genetic algorithm

---

## 📁 5. RECOMMENDED DOWNLOADS

| Priority | Model | Source | Format | Action |
|----------|-------|--------|--------|--------|
| ⭐⭐⭐ | Generic concrete dam | Meshy AI | glTF | Download → `public/models/dam.glb` |
| ⭐⭐⭐ | Arch dam | Sketchfab | glTF | Download → `public/models/arch-dam.glb` |
| ⭐⭐ | Embankment dam | 3DModels.org | FBX→glTF | Convert in Blender → export glTF |
| ⭐⭐ | Hydroelectric dam | TurboSquid | Blend→glTF | Convert in Blender → export glTF |
| ⭐ | Buttress dam | Energy Encyclopedia | SKP→glTF | Convert via SketchUp/Blender |
