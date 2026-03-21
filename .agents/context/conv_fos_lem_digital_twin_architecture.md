# LEM ↔ Digital Twin: Architecture & Compatibility Guide

> **Documento de Referência para Consulta e Manuais Futuros**
> Versão 1.0 | 2026-03-21

---

## 1. Existing Digital Twin Components

| Component | File | Role |
|:----------|:-----|:-----|
| DT Engine | `server/shms/digital-twin-engine-c205.ts` | Twin registry, anomaly detect (Z-score+IQR), health index |
| MQTT Bridge | `server/shms/mqtt-digital-twin-bridge.ts` | MQTT→DT→LSTM pipeline, <1s latency |
| DT Routes | `server/shms/digital-twin-routes-c206.ts` | REST API for twin state, alerts, sensor data |
| DT Dashboard | `server/shms/digital-twin-dashboard.ts` | Dashboard aggregation endpoint |
| DT Panel UI | `client/.../shms/DigitalTwinPanel.tsx` | SVG wireframe, KPIs, Recharts health/anomaly |
| 3D Viewer | `client/.../shms/DigitalTwin3DViewer.tsx` | 3D structure visualization |
| DT Display | `client/.../displays/SHMSDigitalTwinDisplay.tsx` | Read-only display component |

---

## 2. System Architecture Diagram

```mermaid
graph TB
    subgraph Physical["⚡ Physical Layer"]
        PZ["Piezometers<br/>VW sensors"]
        INC["Inclinometers<br/>MEMS"]
        RAIN["Rain Gauges<br/>Tipping bucket"]
    end

    subgraph IoT["📡 IoT Layer (Existing)"]
        MQTT["MQTT Broker<br/>Mosquitto/HiveMQ"]
        BRIDGE["mqtt-digital-twin-bridge.ts<br/>Gap 13 Closure (C116)"]
    end

    subgraph Server["🖥️ Server Layer (Existing)"]
        ENGINE["digital-twin-engine-c205.ts<br/>Health index + anomaly detection"]
        LSTM["lstm-predictor.ts<br/>Hochreiter & Schmidluber 1997"]
        ROUTES["digital-twin-routes-c206.ts<br/>REST API"]
        DB["MySQL / TimescaleDB"]
    end

    subgraph Client["🌐 Client Layer"]
        DTPANEL["DigitalTwinPanel.tsx<br/>(Existing: SVG + KPIs + Recharts)"]
        STABPANEL["StabilityPanel.tsx<br/>(Modified: Web Worker integration)"]
        WORKER["stability.worker.ts<br/>(NEW: LEM in Web Worker)"]
        FOSCHART["FOSTimeSeries.tsx<br/>(NEW: FOS(t) + TARP zones)"]
        MQTTHOOK["useMQTTFeed.ts<br/>(NEW: client-side MQTT hook)"]
    end

    PZ --> MQTT
    INC --> MQTT
    RAIN --> MQTT

    MQTT --> BRIDGE
    BRIDGE --> ENGINE
    BRIDGE --> LSTM
    ENGINE --> ROUTES
    ENGINE --> DB
    ROUTES --> DTPANEL
    ROUTES --> STABPANEL

    MQTTHOOK -.->|"WebSocket"| MQTT
    MQTTHOOK --> STABPANEL
    STABPANEL --> WORKER
    WORKER --> FOSCHART
    WORKER -.->|"POST /api/shms/fos"| ROUTES

    style WORKER fill:#22c55e20,stroke:#22c55e
    style FOSCHART fill:#22c55e20,stroke:#22c55e
    style MQTTHOOK fill:#22c55e20,stroke:#22c55e
```

---

## 3. Data Flow Pipeline

```mermaid
sequenceDiagram
    participant S as Piezometer
    participant M as MQTT Broker
    participant B as MQTT Bridge (Server)
    participant E as DT Engine (C205)
    participant C as StabilityPanel (Client)
    participant W as Web Worker (LEM)
    participant F as FOS Chart

    S->>M: Publish pressure (kPa)
    M->>B: Forward reading
    B->>E: digitalTwin.updateFromReading()
    B->>E: lstmPredictor.ingest()

    Note over C: Live Mode ON
    M-->>C: WebSocket (useMQTTFeed)
    C->>C: Calculate ru = u/(γ·z)
    C->>C: Check Δru > 5%

    alt Δru > 5%
        C->>W: postMessage({profile, methods})
        W->>W: searchCriticalCircle()
        W->>W: bishopSimplified()
        W-->>C: postMessage({fos, circle, timing})
        C->>F: Update FOS time-series
        C-->>E: POST /api/shms/fos (update health)
    end
```

---

## 4. Compatibility Layer Design

```mermaid
graph LR
    subgraph Existing["Existing DT (C205/C206)"]
        HI["healthIndex: 0-1"]
        AN["anomalyCount"]
        RL["riskLevel"]
        SR["sensorReadings Map"]
    end

    subgraph New["New LEM Pipeline"]
        FOS["FOS value"]
        TARP["TARP classification"]
        RU["ru from piezometers"]
    end

    subgraph Bridge["Compatibility Bridge"]
        FOS2HI["FOS → Health Index<br/>FOS 1.5+ → HI 0.9+<br/>FOS 1.0 → HI 0.7<br/>FOS < 1.0 → HI < 0.5"]
        TARP2RL["TARP → Risk Level<br/>Green → low<br/>Yellow → medium<br/>Orange → high<br/>Red → critical"]
    end

    FOS --> FOS2HI --> HI
    TARP --> TARP2RL --> RL
    RU --> SR
```

### 4.1 FOS → Health Index Mapping

| FOS Range | TARP | Health Index | Risk Level | DT Color |
|:----------|:-----|:-------------|:-----------|:---------|
| ≥ 1.5 | 🟢 Safe | 0.90 – 1.00 | `low` | Green |
| 1.3 – 1.5 | 🟡 Alert | 0.70 – 0.90 | `medium` | Yellow |
| 1.0 – 1.3 | 🟠 Warning | 0.50 – 0.70 | `high` | Orange |
| < 1.0 | 🔴 Critical | 0.00 – 0.50 | `critical` | Red |

### 4.2 Integration Points

| Existing DT API | LEM Integration | Direction |
|:----------------|:----------------|:---------|
| `ingestSensorReading(pore_pressure)` | Triggers ru recalculation | DT → LEM |
| `DigitalTwinState.healthIndex` | Updated with FOS-derived value | LEM → DT |
| `DigitalTwinState.riskLevel` | Updated with TARP classification | LEM → DT |
| `DigitalTwinPanel` radar "Estabilidade" | Populated with real Bishop FOS | LEM → DT |
| `MQTT bridge` simulation fallback | Feeds simulated pore_pressure to LEM | DT → LEM |

---

## 5. MQTT Topic Topology

```mermaid
graph TD
    ROOT["shms/"]
    ROOT --> S1["shms/{structureId}/"]

    S1 --> PZ["piezometer/"]
    S1 --> INC["inclinometer/"]
    S1 --> RAIN["rain/"]
    S1 --> ANAL["analysis/"]
    S1 --> ALERT["alert/"]

    PZ --> PZ1["{sensorId}/pressure → kPa"]
    INC --> INC1["{sensorId}/displacement → mm"]
    RAIN --> RAIN1["{sensorId}/intensity → mm/h"]

    ANAL --> FOS["fos → number (auto-published)"]
    ANAL --> METHOD["method → string (Bishop/Spencer)"]

    ALERT --> GREEN["green → TARP action JSON"]
    ALERT --> YELLOW["yellow → TARP action JSON"]
    ALERT --> RED["red → TARP action JSON"]

    style FOS fill:#22c55e20,stroke:#22c55e
    style METHOD fill:#22c55e20,stroke:#22c55e
```

---

## 6. Component Integration Pattern

### Where LEM Plugs Into the Existing DT Panel

The existing `DigitalTwinPanel.tsx` radar chart has **"Estabilidade"** as one of its 6 axes, currently using `70 + Math.random() * 25` (line 178):

```diff
- { axis: 'Estabilidade', value: 70 + Math.random() * 25 },
+ { axis: 'Estabilidade', value: fosToPct(currentFOS) },
```

Where `fosToPct` maps FOS to 0-100 scale:
```typescript
function fosToPct(fos: number | null): number {
  if (!fos) return 50;
  return Math.min(100, Math.max(0, (fos / 2.0) * 100));
}
```

---

## 7. Reference Manual: API Endpoints

### Existing DT REST API (digital-twin-routes-c206.ts)

| Endpoint | Method | Description |
|:---------|:-------|:-----------|
| `/api/shms/digital-twin/state/:structureId` | GET | Get twin state |
| `/api/shms/digital-twin/readings/:structureId` | GET | Get sensor readings |
| `/api/shms/digital-twin/alerts` | GET | Get active alerts |
| `/api/shms/digital-twin/alerts/:alertId/ack` | POST | Acknowledge alert |
| `/api/shms/digital-twin/predict/:structureId` | POST | Run prediction |

### New LEM API Endpoints (to add)

| Endpoint | Method | Description |
|:---------|:-------|:-----------|
| `/api/shms/stability/fos/:structureId` | GET | Get latest FOS |
| `/api/shms/stability/history/:structureId` | GET | Get FOS history (24h) |
| `/api/shms/stability/tarp/:structureId` | GET | Get TARP classification |

---

## 8. File Dependency Map

```mermaid
graph TD
    subgraph Server
        MQC["mqtt-connector.ts"] --> MQB["mqtt-digital-twin-bridge.ts"]
        MQB --> DTE["digital-twin-engine-c205.ts"]
        MQB --> LSTM["lstm-predictor.ts"]
        DTE --> DTR["digital-twin-routes-c206.ts"]
    end

    subgraph Client
        SSE["SlopeStabilityEngine.ts"] --> SW["stability.worker.ts (NEW)"]
        SW --> USW["useStabilityWorker.ts (NEW)"]
        USW --> SP["StabilityPanel.tsx"]
        UMF["useMQTTFeed.ts (NEW)"] --> SP
        FOST["FOSTimeSeries.tsx (NEW)"] --> SP
        SP --> DTP["DigitalTwinPanel.tsx"]
    end

    DTR -.->|"REST API"| SP
    MQC -.->|"WebSocket"| UMF

    style SW fill:#22c55e20,stroke:#22c55e
    style USW fill:#22c55e20,stroke:#22c55e
    style UMF fill:#22c55e20,stroke:#22c55e
    style FOST fill:#22c55e20,stroke:#22c55e
```

---

## 9. Glossary

| Term | Definition |
|:-----|:-----------|
| **FOS** | Factor of Safety — ratio of resisting to driving forces |
| **ru** | Pore pressure ratio — u/(γ·z), ranges 0–1 |
| **TARP** | Trigger Action Response Plan — regulatory framework |
| **LEM** | Limit Equilibrium Method — Bishop, Spencer, M-P |
| **DT** | Digital Twin — virtual replica of physical structure |
| **MQTT** | Message Queuing Telemetry Transport (ISO/IEC 20922) |
| **SSR** | Shear Strength Reduction — FEM-based FOS |
| **HI** | Health Index — 0.0 (critical) to 1.0 (healthy) |
