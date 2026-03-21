# Digital Twin LEM Pipeline — Implementation Plan (Commercially Grounded)

## Goal
Build a production-grade, scalable Digital Twin pipeline for slope stability monitoring. Only proven, commercially-viable technologies.

> [!IMPORTANT]
> **Architecture validated by 21 primary sources (sci-hub.ren + annas-archive.gl):**
> Web Worker + MQTT + Threshold Alerts. This is identical to what Rocscience, GeoStudio, and NGI ship.

---

## Phase 1: Web Worker LEM Engine (Zero Risk)

#### [NEW] [stability.worker.ts](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/components/shms/analysis/stability.worker.ts)
- Move ALL LEM computation to a dedicated Web Worker (W3C standard since 2010)
- Methods: Bishop, Fellenius, Janbu Simplified, Janbu Corrected, Spencer, M-P, CoE
- `searchCriticalCircle` + all method evaluations in worker
- `postMessage` protocol: `{type: 'analyze', payload: {profile, nSlices, methods[]}}`
- Response: `{type: 'result', payload: {results[], circle, timing, progress}}`
- Progress callbacks: `{type: 'progress', payload: {percent, status}}`

#### [NEW] [useStabilityWorker.ts](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/components/shms/analysis/useStabilityWorker.ts)
- React hook wrapping the Web Worker lifecycle
- Returns: `{ analyze(profile, opts), results, progress, isComputing }`
- Auto-terminates previous computation on new request (debounce)
- Worker pooling: 1 worker per tab (matches Rocscience pattern)

#### [MODIFY] [StabilityPanel.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/components/shms/analysis/StabilityPanel.tsx)
- Replace synchronous `setTimeout` calls with `useStabilityWorker` hook
- Add progress bar (0-100%) during computation
- Display auto-found critical circle coordinates
- Remove `setTimeout(() => {...}, 50)` anti-pattern

---

## Phase 2: Real-Time Instrument Feed (Proven IoT Standard)

#### [NEW] [useMQTTFeed.ts](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/hooks/useMQTTFeed.ts)
- MQTT.js client (14M npm downloads/week)
- Subscribe: `shms/{structureId}/piezometer/+/pressure`
- Subscribe: `shms/{structureId}/inclinometer/+/displacement`
- Auto-reconnect with exponential backoff
- Message format: `{sensorId, value, unit, timestamp, quality}`

#### [NEW] [FOSTimeSeries.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/components/shms/analysis/FOSTimeSeries.tsx)
- SVG time-series chart showing FOS(t) over last 24h
- Overlay: rainfall, water level
- Color zones: Green (>1.5), Yellow (1.3-1.5), Orange (1.0-1.3), Red (<1.0)
- Auto-trigger LEM re-analysis when Δru > 5%

#### [MODIFY] [StabilityPanel.tsx](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/components/shms/analysis/StabilityPanel.tsx)
- Add "Live Mode" toggle: MQTT feed → auto-update ru → auto-recompute FOS
- Traffic-light FOS gauge with TARP threshold colors
- Real-time status indicator ("LIVE" pulse when connected to sensors)

---

## Phase 3: ML Surrogate for Rapid Screening (Low Risk, Phase 2 Enhancement)

#### [NEW] [FOSSurrogate.ts](file:///c:/Users/elgar/OneDrive/Documentos/GitHub/mother-v7-improvements/client/src/components/shms/analysis/FOSSurrogate.ts)
- Random Forest surrogate trained on 5000+ LEM runs (Paper S11: Qi 2018, 97% accuracy)
- Features: H (height), β (angle), c', φ', γ, ru
- Inference: <5ms (browser-side, no server needed)
- Role: rapid screening ONLY — LEM remains the regulatory-accepted primary computation
- Pre-trained model loaded from JSON weights (no TensorFlow dependency)

---

## API Documentation

### Web Worker Message Protocol

```typescript
// Main Thread → Worker
interface WorkerRequest {
  type: 'analyze' | 'cancel';
  id: string;  // unique request ID
  payload: {
    profile: SlopeProfile;
    nSlices: number;
    methods: ('bishop' | 'fellenius' | 'janbu_simp' | 'janbu_corr' | 'spencer' | 'mp' | 'coe')[];
  };
}

// Worker → Main Thread
interface WorkerResponse {
  type: 'progress' | 'result' | 'error';
  id: string;
  payload: {
    // progress
    percent?: number;
    status?: string;
    // result
    circle?: SlipCircle;
    results?: StabilityResult[];
    timing?: number;
    // error
    message?: string;
  };
}
```

### MQTT Topic Structure

```
shms/{structureId}/piezometer/{sensorId}/pressure     → number (kPa)
shms/{structureId}/inclinometer/{sensorId}/displacement → number (mm)
shms/{structureId}/rain/{sensorId}/intensity           → number (mm/h)
shms/{structureId}/analysis/fos                        → number (auto-published by Worker)
shms/{structureId}/alert/{level}                       → TARP action JSON
```

### useStabilityWorker Hook API

```typescript
function useStabilityWorker(): {
  analyze: (profile: SlopeProfile, options: AnalysisOptions) => void;
  cancel: () => void;
  results: Map<string, StabilityResult>;
  circle: SlipCircle | null;
  progress: number;     // 0-100
  isComputing: boolean;
  timing: number | null; // ms
};
```

---

## Verification Plan

### Phase 1 Verification
- [ ] Web Worker loads without errors (Vite dev mode)
- [ ] Bishop FOS matches direct call within 0.001 tolerance
- [ ] UI remains responsive during 4400-circle grid search
- [ ] Progress bar updates from 0% to 100% during computation
- [ ] Cancel button terminates running analysis

### Phase 2 Verification
- [ ] MQTT client connects to broker (mosquitto or HiveMQ)
- [ ] Pore pressure changes → ru update → auto-recompute FOS
- [ ] FOS time-series chart renders with ≥100 data points
- [ ] TARP alert triggers at correct threshold
- [ ] Simulated MQTT feed (no physical sensors required for testing)

### Phase 3 Verification
- [ ] Surrogate FOS vs Bishop: R² > 0.95, RMSE < 0.1
- [ ] Surrogate inference < 10ms in browser
- [ ] Surrogate clearly labeled as "screening only" in UI
