# MOTHER × LEM — Estudo Completo de Integração Arquitetural

> **Versão**: 1.0 | **Data**: 2026-03-21
> **Base**: 29 documentos de contexto, 501 arquivos fonte, 30+ papers científicos
> **Autor**: Guiado pela visão de Everton Garcia (Wizards Down Under / Intelltech)

---

## 1. Visão e Missão de MOTHER

### Missão
> Sistema cognitivo autônomo auto-evolutivo para monitoramento geotécnico de barragens/minas com capacidade de auto-melhoria contínua.

### Dual Objectives

| Objetivo | Descrição | Status |
|:---------|:----------|:-------|
| **A — SHMS Brain** | IoT → MQTT → TimescaleDB → LSTM → Digital Twin → Alertas | 8.5/10 |
| **B — Autonomia Total** | Darwin Gödel Machine — auto-modificação com prova formal | 9.5/10 |

### Onde LEM Se Encaixa
**LEM é um sub-módulo do Objetivo A (SHMS Brain)**, dentro do domínio de Estabilidade de Taludes. Não é um sistema independente — é uma engrenagem no mecanismo maior.

---

## 2. Arquitetura Completa — MOTHER com LEM

```mermaid
graph TB
    subgraph Entry["🚪 Entry Points"]
        USER["👤 User (Web/Voice/API)"]
        IOT["📡 IoT (8 tipos de sensores)"]
        A2A["🤖 A2A Protocol"]
    end

    subgraph Core["🧠 Core Engine (213 módulos, Score 9.5)"]
        ORCH["Core Orchestrator<br/>95KB, 8-Layer Pipeline"]
        PIPE["Core Pipeline<br/>157KB, 35 estágios"]
        TOOL["Tool Engine<br/>72KB, 20+ tools"]
        ROUTER["Adaptive Router<br/>4-Tier + ML Learned"]
    end

    subgraph Quality["🛡️ Quality Gate (Score 9.5)"]
        GUARD["Guardian G-Eval 7D"]
        CAI["Constitutional AI<br/>11 princípios"]
        REFINE["Self-Refine<br/>+20% qualidade"]
        JUDGE["Agent-as-Judge<br/>Galileo 2025"]
    end

    subgraph Memory["💾 Persistent Memory (Score 9.0)"]
        AMEM["A-MEM Episodic<br/>Zettelkasten"]
        HIPPO["HippoRAG2<br/>Knowledge Graph"]
        CACHE["Semantic Cache<br/>pgvector cosine"]
        UMEM["User Memory<br/>Per-tenant"]
        BD[("bd_central<br/>PostgreSQL + pgvector<br/>+ TimescaleDB<br/>1700+ entries")]
    end

    subgraph DGM["🧬 DGM Self-Improvement (Score 9.5)"]
        OUTER["DGM Outer Loop<br/>122KB, MAP-Elites"]
        COUNCIL["AI Council<br/>Delphi + MAD Debate"]
        SAFETY["Safety Gate<br/>AST-level checks"]
        LEDGER["Evolution Ledger<br/>Formal proof chain"]
    end

    subgraph SHMS["📡 SHMS Brain (48 módulos, Score 8.5)"]
        MQTT["MQTT Bridge<br/>mqtt-connector.ts"]
        VALID["Sensor Validator"]
        SIGNAL["Signal Processor<br/>FFT + filtering"]
        ANOMALY["Anomaly ML<br/>Isolation Forest"]
        LSTM["LSTM Predictor<br/>BiLSTM+Attention"]
        TWIN["Digital Twin<br/>3D + Health Index"]
        FEM["FEM Engine<br/>28KB, CST"]
        FTA["Fault Tree Analysis"]
        ALERT["Alert Engine<br/>ICOLD 4-level"]
        TARP_MOD["TARP Module<br/>Trigger-Action-Response"]
        MULTI["Multi-Tenant<br/>27KB"]

        subgraph LEM_MODULE["⚖️ LEM Module (NOVO)"]
            WORKER["stability.worker.ts<br/>Web Worker, 7 métodos"]
            HOOK["useStabilityWorker.ts<br/>React hook"]
            FOS_CHART["FOSTimeSeries.tsx<br/>SVG + TARP zones"]
            STAB["stability-analysis.ts<br/>(EXISTENTE, server)"]
        end
    end

    subgraph LLM["🤖 Multi-LLM (4 provedores)"]
        DS["DeepSeek V3"]
        GEM["Gemini 2.5"]
        CL["Claude Sonnet 4"]
        GPT["GPT-4o"]
    end

    USER --> ORCH
    IOT --> MQTT
    A2A --> ORCH

    ORCH --> ROUTER --> DS & GEM & CL & GPT
    ORCH --> TOOL
    ORCH --> AMEM & HIPPO & CACHE & UMEM
    AMEM & HIPPO & CACHE & UMEM --> BD

    PIPE --> GUARD --> CAI --> REFINE
    GUARD --> JUDGE

    MQTT --> VALID --> SIGNAL --> ANOMALY
    MQTT --> BD
    BD --> LSTM
    BD --> FEM --> LEM_MODULE
    ANOMALY & LSTM & LEM_MODULE --> TWIN
    TWIN --> FTA --> ALERT --> TARP_MOD
    MULTI -.-> TWIN & ALERT & LEM_MODULE

    OUTER --> COUNCIL --> SAFETY --> LEDGER
    LEDGER -.->|"feedback"| OUTER

    style LEM_MODULE fill:#22c55e20,stroke:#22c55e,stroke-width:3px
    style TWIN fill:#1b4332,stroke:#2d6a4f,color:#fff
    style OUTER fill:#2d132c,stroke:#ee4540,color:#fff
    style ORCH fill:#1a1a2e,stroke:#e94560,color:#fff
    style BD fill:#0f3460,stroke:#16213e,color:#fff
```

---

## 3. Ciclo Cognitivo Completo com LEM

```mermaid
flowchart LR
    P["🔍 PERCEPTION<br/>Queries + IoT data<br/>+ Piezometer kPa"] --> M["💾 MEMORY<br/>CRAG + A-MEM +<br/>HippoRAG2 + bd_central<br/>+ FOS history"]
    M --> R["🧠 REASONING<br/>CoT + Abductive +<br/>MoA-Debate + Z3<br/>+ Bishop/Spencer"]
    R --> A["⚡ ACTION<br/>Tool Engine (20+) +<br/>LEM Worker +<br/>Alert/TARP"]
    A --> L["📝 LEARNING<br/>DPO + GRPO +<br/>Episodic memory<br/>+ FOS→HI mapping"]
    L --> E["🧬 EVOLUTION<br/>DGM → branch →<br/>deploy → validate<br/>+ LEM accuracy Δ"]
    E -->|"loop contínuo"| P

    style R fill:#462255,color:#fff
    style E fill:#6b0f1a,color:#fff
```

---

## 4. SHMS Data Flow — LEM como Módulo

```mermaid
flowchart LR
    subgraph Field["⚡ Campo (8 tipos)"]
        PZ["Piezômetros"]
        INC["Inclinômetros"]
        RAIN["Pluviômetros"]
        ACC["Acelerômetros"]
        STR["Strain Gauges"]
        GNSS["GNSS"]
        WL["Nível d'água"]
        TEMP["Temperatura"]
    end

    subgraph Ingest["📡 Ingestão"]
        MQTT["MQTT Broker"]
        PROTO["Protocol Adapters<br/>Modbus, OPC-UA, CSV"]
        VALID["Sensor Validator"]
    end

    subgraph Storage["💾 Armazenamento"]
        TS[("TimescaleDB<br/>Hypertables")]
    end

    subgraph Analysis["🔬 Análise (Paralela)"]
        SIG["Signal Processor<br/>FFT + trends"]
        ANOM["Anomaly ML<br/>Z-score + IQR"]
        LSTM_P["LSTM Predictor<br/>24-72h forecast"]
        FEM_E["FEM Engine<br/>Stress + Seepage"]
        LEM_E["⚖️ LEM Engine<br/>Bishop, Spencer, M-P<br/>Web Worker (client)<br/>stability-analysis.ts (server)"]
    end

    subgraph Response["🚨 Resposta"]
        DT["Digital Twin<br/>Health Index 0-100"]
        FTA_E["Fault Tree<br/>Failure probability"]
        ALERT_E["Alert Engine<br/>ICOLD L1-L4"]
        TARP_E["TARP Module<br/>Green/Yellow/Red"]
        SIREN["Sirenes"]
        NOTIF["Notificações"]
    end

    PZ & INC & RAIN & ACC & STR & GNSS & WL & TEMP --> MQTT
    MQTT --> PROTO --> VALID --> TS

    TS --> SIG --> ANOM
    TS --> LSTM_P
    TS --> FEM_E
    FEM_E --> LEM_E
    ANOM & LSTM_P & LEM_E --> DT
    ANOM & LSTM_P --> FTA_E
    FTA_E --> ALERT_E --> TARP_E
    TARP_E --> SIREN & NOTIF

    style LEM_E fill:#22c55e20,stroke:#22c55e,stroke-width:3px
    style DT fill:#1b4332,stroke:#2d6a4f,color:#fff
    style TS fill:#0f3460,stroke:#16213e,color:#fff
```

---

## 5. DGM 7-Phase Cycle — LEM Feedback Loop

```mermaid
flowchart TD
    O["🔍 PHASE 1: OBSERVE<br/>core-orchestrator.ts<br/>+ LEM FOS accuracy metrics"]
    E["📊 PHASE 2: EVALUATE<br/>Fitness: quality 40% + latency 30%<br/>+ reliability 20% + cache 10%<br/>+ FOS_accuracy (SHMS)"]
    C["🏛️ PHASE 3: AI COUNCIL<br/>Delphi (5 LLMs) + MAD Debate"]
    V["🛡️ PHASE 4: VALIDATE<br/>Safety Gate + AST checks<br/>+ forbidden patterns"]
    X["⚡ PHASE 5: EXECUTE<br/>git clone + apply changes<br/>+ SICA retry loop"]
    T["🧪 PHASE 6: TEST<br/>tsc --noEmit + vitest<br/>+ FOS benchmark regression"]
    L["🧠 PHASE 7: LEARN<br/>Episodic memory + A-MEM<br/>+ Evolution Ledger"]

    O --> E --> C --> V --> X --> T --> L
    L -.->|"feedback loop"| O

    LEM_FB["⚖️ LEM Feedback:<br/>FOS(predicted) vs FOS(observed)<br/>= Reality-to-Simulation Gap<br/>Müller et al. 2022"]

    LEM_FB -.-> O
    T -.->|"ACADS benchmark"| LEM_FB

    style LEM_FB fill:#22c55e20,stroke:#22c55e,stroke-width:2px
    style C fill:#462255,color:#fff
    style L fill:#0a3d62,color:#fff
```

---

## 6. Multi-Tenant Architecture (LEM Isolation)

```mermaid
flowchart TB
    subgraph Tenant_A["🏢 Tenant A (Mineradora)"]
        A_MQTT["MQTT topics:<br/>shms/STRUCT-001/*"]
        A_DT["Digital Twin A<br/>healthIndex: 0.85"]
        A_LEM["LEM Profile A<br/>Bishop FOS: 1.45"]
        A_HIST["FOS History A<br/>TimescaleDB"]
    end

    subgraph Tenant_B["🏢 Tenant B (Construtora)"]
        B_MQTT["MQTT topics:<br/>shms/STRUCT-002/*"]
        B_DT["Digital Twin B<br/>healthIndex: 0.72"]
        B_LEM["LEM Profile B<br/>Spencer FOS: 1.12"]
        B_HIST["FOS History B<br/>TimescaleDB"]
    end

    MT["shms-multitenant.ts<br/>27KB — Tenant isolation"]

    MT --> Tenant_A & Tenant_B

    BD[("bd_central<br/>tenant_id FK")]
    A_HIST & B_HIST --> BD

    style MT fill:#0f3460,stroke:#16213e,color:#fff
```

---

## 7. Inventário Completo de Módulos SHMS (48 arquivos)

| # | Módulo | Tamanho | Papel | Integra com LEM? |
|:--|:-------|:--------|:------|:-:|
| 1 | `mqtt-connector.ts` | 14KB | MQTT client | Fornece dados de sensores |
| 2 | `mqtt-digital-twin-bridge.ts` | 9KB | MQTT→DT bridge, Gap 13 | **Sim** — envia pore_pressure |
| 3 | `mqtt-digital-twin-bridge-c206.ts` | 11KB | Bridge v2 | **Sim** |
| 4 | `mqtt-timescale-bridge.ts` | 11KB | MQTT→TimescaleDB | Armazena dados |
| 5 | `digital-twin.ts` | 13KB | DT class + simulation | **Sim** — recebe FOS |
| 6 | `digital-twin-engine-c205.ts` | 13KB | DT Engine + anomaly detect | **Sim** — FOS→healthIndex |
| 7 | `digital-twin-routes-c206.ts` | 15KB | REST API do DT | **Sim** — endpoint FOS |
| 8 | `digital-twin-dashboard.ts` | 4KB | Dashboard aggregation | **Sim** |
| 9 | `stability-analysis.ts` | 10KB | Server-side stability | **Sim** — LEM methods |
| 10 | `tarp.ts` | 12KB | TARP triggers | **Sim** — FOS thresholds |
| 11 | `fem-engine.ts` | 28KB | FEM (stress/seepage/thermal) | **Sim** — feeds LEM |
| 12 | `lstm-predictor.ts` | 16KB | LSTM predictions | **Sim** — predicts FOS trend |
| 13 | `lstm-predictor-c207.ts` | 23KB | LSTM v2 BiLSTM+Attention | **Sim** |
| 14 | `anomaly-detector.ts` | 11KB | Z-score + IQR | Indirect |
| 15 | `anomaly-ml.ts` | 12KB | Isolation Forest | Indirect |
| 16 | `sensor-validator.ts` | 10KB | Data quality | Upstream |
| 17 | `signal-processor.ts` | 14KB | FFT + filtering | Upstream |
| 18 | `shms-multitenant.ts` | 28KB | Tenant isolation | **Sim** — per-tenant LEM |
| 19 | `fault-tree.ts` | 10KB | FTA | **Sim** — FOS feeds P(failure) |
| 20 | `fta-integration-bus.ts` | 16KB | FTA event bus | Indirect |
| 21 | `alert-engine.ts` | 9KB | Alert generation | **Sim** — TARP from FOS |
| 22 | `rul-predictor.ts` | 10KB | Remaining Useful Life | Feeds from FOS trend |
| 23 | `timescale-connector.ts` | 19KB | TimescaleDB client | Storage |
| 24-48 | 24 more modules | Various | Support functions | — |

---

## 8. Roadmap — LEM Integration in MOTHER

### Phase 1: Foundation ✅ (Sprint Atual)

| Deliverable | KPI | Status |
|:------------|:----|:-------|
| Web Worker LEM (7 métodos) | FOS accuracy < 3% vs ACADS | ✅ Done |
| `useStabilityWorker` hook | UI response time < 100ms | ✅ Done |
| StabilityPanel integration | Progress bar, cancel, timing | ✅ Done |
| Cleanup duplicações | Zero duplicate files | ✅ Done |
| Architecture documentation | 6+ diagrams | ✅ Done |

### Phase 2: DT Integration (Próximo Sprint)

| Deliverable | KPI | Target |
|:------------|:----|:-------|
| FOS endpoint in `digital-twin-routes-c206.ts` | Response < 200ms | GET `/api/shms/v2/stability/fos/:id` |
| Radar real FOS in `DigitalTwinPanel.tsx` | Replace Math.random() | Bishop FOS mapped 0-100 |
| `FOSTimeSeries.tsx` inside existing DT panel | 24h history, TARP zones | SVG chart |
| FOS→healthIndex mapping | Documented formula | FOS 1.5+ → HI 90+ |
| Multi-tenant FOS isolation | Per-tenant profiles | Via `shms-multitenant.ts` |

### Phase 3: LSTM + LEM Coupling (Sprint +2)

| Deliverable | KPI | Target |
|:------------|:----|:-------|
| LSTM predicts FOS trend | R² > 0.95 vs Bishop | 24h forecast |
| Auto-recompute on Δru > 5% | Latency < 500ms | Server-side trigger |
| DGM feedback: FOS accuracy | Reality-Simulation gap | Evolution Ledger entry |
| FOS in Fault Tree | P(failure) from FOS | `fta-integration-bus.ts` |
| TARP auto-alert from FOS | Green/Yellow/Orange/Red | `tarp.ts` integration |

### Phase 4: ML Surrogate + Production (Sprint +3)

| Deliverable | KPI | Target |
|:------------|:----|:-------|
| Random Forest surrogate | R² > 0.95, < 10ms | Rapid screening only |
| Production benchmark suite | 5 ACADS cases pass | CI/CD gate |
| TimescaleDB FOS hypertable | 1M+ readings/day | Per-tenant |
| LEM in DGM fitness | FOS accuracy in composite score | 5% weight |

---

## 9. KPIs de Gestão

### KPIs Técnicos

| KPI | Baseline | Target | Medição |
|:----|:---------|:-------|:--------|
| FOS accuracy vs ACADS | 2.8% | < 3% | Bishop/Spencer on 5 benchmarks |
| LEM computation time | 100ms | < 200ms | Web Worker end-to-end |
| UI responsiveness during LEM | 60fps | > 30fps | Chrome DevTools |
| FOS→DT update latency | N/A | < 1s | ICOLD B.158 requirement |
| LSTM FOS prediction R² | N/A | > 0.95 | 24h forecast vs actual |
| ML surrogate inference | N/A | < 10ms | Browser-side |

### KPIs de Negócio

| KPI | Target | Justificativa |
|:----|:-------|:-------------|
| Tenants usando LEM | 3+ | Product-market fit |
| Cálculos LEM/dia | 1000+ | Engagement |
| Alertas FOS gerados | 100% accuracy | Zero missed critical |
| Uptime DT+LEM pipeline | 99.9% | SLA regulatório |

---

## 10. Base Científica Consolidada (30+ Papers)

### Core MOTHER

| # | Paper | Usado Em |
|:--|:------|:---------|
| 1 | Zhang et al. (2025) — Darwin Gödel Machine, arXiv:2505.22954 | DGM |
| 2 | Xu et al. (2025) — A-MEM, arXiv:2502.12110 | Episodic Memory |
| 3 | Yan et al. (2024) — CRAG, arXiv:2401.15884 | Knowledge Retrieval |
| 4 | Wang et al. (2024) — MoA, arXiv:2406.04692 | Multi-LLM Debate |
| 5 | Bai et al. (2022) — Constitutional AI, arXiv:2212.08073 | Safety |
| 6 | Madaan et al. (2023) — Self-Refine, arXiv:2303.17651 | Quality Loop |
| 7 | Shao et al. (2024) — GRPO, arXiv:2402.03300 | Training |
| 8 | Liu et al. (2023) — G-Eval, arXiv:2303.16634 | Evaluation |

### SHMS + Digital Twin

| # | Paper | Usado Em |
|:--|:------|:---------|
| 9 | Grieves (2014) — Digital Twin Manufacturing | DT Architecture |
| 10 | Farrar & Worden (2012) — SHM ML Perspective | Anomaly Detection |
| 11 | ICOLD Bulletin 158 (2017) — Dam Surveillance | Alert Thresholds |
| 12 | ISO 13374-1:2003 — Condition Monitoring | Health Index |
| 13 | Müller et al. (2022) — Self-improving DT Models | DGM+DT |
| 14 | Liu et al. (2022) — Slope DT for rainfall instability | FOS prediction |
| 15 | Xu et al. (2025) — AI-powered Highway DT for slopes | M-P + AI |

### LEM Específico

| # | Paper | Usado Em |
|:--|:------|:---------|
| 16 | Bishop (1955) — Circular slip simplified method | Bishop FOS |
| 17 | Morgenstern & Price (1965) — Variable interslice | M-P method |
| 18 | Spencer (1967) — Parallel interslice forces | Spencer method |
| 19 | Janbu (1954/1973) — Simplified/corrected non-circular | Janbu methods |
| 20 | Fredlund & Krahn (1977) — GLE comparison | Method validation |

### ML + LEM Integration

| # | Paper | Relevância |
|:--|:------|:-----------|
| 21 | Pei et al. (2023) — Knowledge-guided ML for slopes | Physics + DL |
| 22 | Qi & Tang (2018) — Metaheuristic ML for slope stability | GA/PSO optimization |
| 23 | Huang (2023) — Physics-based ML for landslides | LEM→ML pipeline |
| 24 | Lin et al. (2022) — 8 ensemble methods for slope prediction | Benchmark comparison |
| 25 | Kumar et al. (2021) — RNN for real-world slope movements | LSTM validation |

### Autonomous / Self-Improving

| # | Paper | Relevância |
|:--|:------|:-----------|
| 26 | Schmidhuber (2003) — Gödel Machines | DGM foundation |
| 27 | Schmidhuber et al. (2011) — Gödel Machine implementations | DGM practical |
| 28 | Rølvåg & Stranden (2022) — DT-based SHM offshore crane | DT+SHM real-time |
| 29 | Qing et al. (2010) — Autonomous SHM systems | Historical context |
| 30 | Lai et al. (2023) — DT-based NDT for bridge SHM | Health Index methods |

---

## 11. Mapa de Dependências LEM

```mermaid
graph TD
    subgraph Server["🖥️ Server (Existentes)"]
        SA["stability-analysis.ts<br/>10KB"]
        DTE["digital-twin-engine-c205.ts"]
        DTR["digital-twin-routes-c206.ts"]
        TARP["tarp.ts<br/>12KB"]
        MQTT_B["mqtt-digital-twin-bridge.ts"]
        LSTM_P["lstm-predictor.ts"]
        FEM_E["fem-engine.ts<br/>28KB"]
        MT["shms-multitenant.ts<br/>28KB"]
        FTA["fta-integration-bus.ts"]
    end

    subgraph Client["🌐 Client (Novo + Existente)"]
        SSE["SlopeStabilityEngine.ts<br/>1795 lines"]
        SW["stability.worker.ts<br/>(NEW)"]
        USW["useStabilityWorker.ts<br/>(NEW)"]
        SP["StabilityPanel.tsx"]
        FOS["FOSTimeSeries.tsx<br/>(NEW)"]
        DTP["DigitalTwinPanel.tsx<br/>(EXISTENTE)"]
    end

    SSE --> SW --> USW --> SP
    FOS --> DTP
    SP -->|"POST /stability"| DTR
    DTR --> DTE
    DTE --> TARP
    MQTT_B --> DTE
    FEM_E -.->|"seepage → ru"| SA
    SA -.->|"FOS → DT"| DTE
    LSTM_P -.->|"FOS forecast"| DTE
    MT -.->|"tenant isolation"| SA & DTE
    DTE -.->|"P(failure)"| FTA

    style SW fill:#22c55e20,stroke:#22c55e
    style USW fill:#22c55e20,stroke:#22c55e
    style FOS fill:#22c55e20,stroke:#22c55e
```

---

## 12. Pipeline de Resposta de MOTHER para Queries Geotécnicas

Quando um usuário pergunta a MOTHER: *"Qual o FOS atual da Barragem Norte?"*

```mermaid
sequenceDiagram
    participant U as 👤 Engenheiro
    participant CO as Core Orchestrator
    participant INT as Intelligence Router
    participant KN as Knowledge (bd_central)
    participant DT as Digital Twin Engine
    participant LEM as LEM Worker
    participant GU as Guardian G-Eval
    participant CAI as Constitutional AI

    U->>CO: "Qual o FOS da Barragem Norte?"
    CO->>INT: classify(query)
    INT-->>CO: natural_science + SHMS context

    par Knowledge
        CO->>KN: queryKnowledge("FOS barragem")
        KN-->>CO: LEM docs + ACADS benchmarks
    and DT State
        CO->>DT: getTwinState("STRUCT-001")
        DT-->>CO: healthIndex: 0.85, riskLevel: low
    end

    CO->>LEM: computeFOS(profile, bishop)
    LEM-->>CO: FOS = 1.45, circle, timing

    CO->>GU: validate(response)
    GU-->>CO: quality = 92
    CO->>CAI: checkPrinciple8(geotechnical_accuracy)
    CAI-->>CO: pass

    CO-->>U: "FOS = 1.45 (Bishop), Seguro ≥1.5<br/>Health Index: 85%, Risk: Baixo<br/>Ref: ICOLD B.158, USACE EM 1110-2-1902"
```

---

## 13. Glossário de Tecnologias Implementadas em MOTHER

| Tecnologia | Módulo | Papel no Sistema |
|:-----------|:-------|:----------------|
| **PostgreSQL + pgvector** | bd_central | Vetor search, knowledge base |
| **TimescaleDB** | timescale-connector.ts | Time-series sensor data |
| **MQTT** | mqtt-connector.ts | IoT sensor ingestion |
| **LSTM/BiLSTM** | lstm-predictor.ts | 24-72h forecasting |
| **Digital Twin** | digital-twin.ts | Virtual replica real-time |
| **FEM** | fem-engine.ts | Stress/seepage/thermal |
| **LEM** | stability.worker.ts + stability-analysis.ts | Slope FOS (7 methods) |
| **FTA** | fault-tree.ts | Failure probability |
| **TARP** | tarp.ts | Trigger-Action-Response |
| **DGM** | dgm-true-outer-loop.ts | Self-modification |
| **GRPO/DPO/SimPO/ORPO** | 4 trainers | Model alignment |
| **LoRA** | lora-trainer.ts | Efficient fine-tuning |
| **A-MEM** | amem-agent.ts | Episodic memory |
| **HippoRAG2** | hipporag2.ts | Knowledge graph RAG |
| **Constitutional AI** | constitutional-ai.ts | Safety alignment |
| **G-Eval** | guardian.ts | Quality scoring |
| **Self-Refine** | self-refine.ts | Iterative improvement |
| **ReAct** | react.ts | Tool-augmented reasoning |
| **Z3** | z3-subprocess-verifier.ts | Formal verification |
| **Multi-Tenant** | shms-multitenant.ts | Client isolation |
| **Cloud Run** | deployment | Serverless compute |
| **React + Vite** | client/ | Frontend SPA |
| **Recharts** | DigitalTwinPanel.tsx | Data visualization |
