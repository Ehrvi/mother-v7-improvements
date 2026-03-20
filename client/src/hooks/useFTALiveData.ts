/**
 * useFTALiveData — React hook for real-time FTA data from the Integration Bus
 *
 * Polls /api/shms/v2/fta/live/:structureId every pollInterval ms
 * and provides merged live probability updates to all FTA sub-panels.
 *
 * Scientific basis:
 *   - Grieves & Vickers (2017) — Digital Twin real-time sync
 *   - Bobbio et al. (2001) — sensor evidence → FTA probability
 *   - ICOLD B.158 §4.3 — instrument alarm management
 *
 * Usage:
 *   const { liveState, isConnected, error } = useFTALiveData('structure-alpha', 5000);
 *
 * Extension hooks:
 *   - registerProbabilitySource(sourceId, callback) — register custom source
 *   - updateNodeProbability(nodeId, probability) — manual override
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types (mirrors server-side FTALiveState)
// ═══════════════════════════════════════════════════════════════════════════════

export interface FTAProbabilityUpdate {
  nodeId: string;
  probability: number;
  source: 'mqtt' | 'lstm' | 'dgm' | 'instrumentation' | 'simulated' | 'user';
  sensorId?: string;
  sensorValue?: number;
  sensorUnit?: string;
  alarmLevel?: string;
  confidence: number;
  timestamp: string;
}

export interface FTALiveState {
  structureId: string;
  topEventProbability: number;
  probabilityUpdates: FTAProbabilityUpdate[];
  sensorReadings: Record<string, { value: number; unit: string; timestamp: string; quality: string }>;
  lstmPredictions: Record<string, { predicted: number; horizon: string; confidence: number }>;
  dgmStatus: { healthy: boolean; activeAlerts: number; lastCheck: string };
  digitalTwinHealth: { healthIndex: number; riskLevel: string; activeSensors: number };
  auditTrail: { recordCount: number; chainValid: boolean };
  dataSources: { mqtt: boolean; lstm: boolean; dgm: boolean; instrumentation: boolean };
  lastUpdated: string;
}

export interface SensorNodeMapping {
  sensorId: string;
  ftaNodeId: string;
  sensorType: string;
  thresholdNormal: number;
  thresholdAlert: number;
  thresholdCritical: number;
  unit: string;
  sigma: number;
}

type ProbabilitySourceCallback = () => Map<string, { probability: number; confidence: number }>;

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useFTALiveData(structureId: string, pollIntervalMs = 5000) {
  const [liveState, setLiveState] = useState<FTALiveState | null>(null);
  const [instrumentMappings, setInstrumentMappings] = useState<SensorNodeMapping[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Extension: external probability sources
  const externalSourcesRef = useRef<Map<string, ProbabilitySourceCallback>>(new Map());
  // Manual overrides
  const overridesRef = useRef<Map<string, number>>(new Map());

  // Fetch live FTA state from API
  const fetchLiveState = useCallback(async () => {
    try {
      const resp = await fetch(`/api/shms/v2/fta/live/${structureId}`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.success) {
        // Apply manual overrides
        if (overridesRef.current.size > 0) {
          data.probabilityUpdates = data.probabilityUpdates.map((u: FTAProbabilityUpdate) => {
            const override = overridesRef.current.get(u.nodeId);
            if (override !== undefined) {
              return { ...u, probability: override, source: 'user' as const };
            }
            return u;
          });
        }

        // Apply external source updates
        for (const [, callback] of externalSourcesRef.current) {
          try {
            const updates = callback();
            for (const [nodeId, { probability }] of updates) {
              const existing = data.probabilityUpdates.find((u: FTAProbabilityUpdate) => u.nodeId === nodeId);
              if (existing) {
                existing.probability = probability;
                existing.source = 'user';
              }
            }
          } catch { /* ignore failing external sources */ }
        }

        setLiveState(data);
        setIsConnected(true);
        setError(null);
        setLastFetchTime(Date.now());
      }
    } catch (err) {
      setError((err as Error).message);
      setIsConnected(false);
    }
  }, [structureId]);

  // Fetch instrument mappings (infrequent)
  const fetchMappings = useCallback(async () => {
    try {
      const resp = await fetch('/api/shms/v2/fta/instruments');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) setInstrumentMappings(data.mappings);
      }
    } catch { /* silent */ }
  }, []);

  // Polling effect
  useEffect(() => {
    fetchLiveState();
    fetchMappings();
    const interval = setInterval(fetchLiveState, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchLiveState, fetchMappings, pollIntervalMs]);

  // ─── Extension hooks ──────────────────────────────────────────────────────

  /** Register a custom probability source (future modules) */
  const registerProbabilitySource = useCallback((sourceId: string, callback: ProbabilitySourceCallback) => {
    externalSourcesRef.current.set(sourceId, callback);
  }, []);

  /** Unregister a custom probability source */
  const unregisterProbabilitySource = useCallback((sourceId: string) => {
    externalSourcesRef.current.delete(sourceId);
  }, []);

  /** Manually override a node's probability */
  const updateNodeProbability = useCallback((nodeId: string, probability: number) => {
    overridesRef.current.set(nodeId, probability);
  }, []);

  /** Clear a manual override */
  const clearNodeOverride = useCallback((nodeId: string) => {
    overridesRef.current.delete(nodeId);
  }, []);

  /** Force immediate refresh */
  const refresh = useCallback(() => {
    fetchLiveState();
  }, [fetchLiveState]);

  // ─── Derived data for FTA components ──────────────────────────────────────

  /** Build Map<nodeId, probability> for FaultTreeEngine.updateNodeProbabilities */
  const probabilityMap = liveState
    ? new Map(liveState.probabilityUpdates.map(u => [u.nodeId, u.probability]))
    : new Map<string, number>();

  /** Build Map<sensorId, value> for display on SVG nodes */
  const sensorValueMap = liveState
    ? new Map(Object.entries(liveState.sensorReadings).map(([sid, r]) => [sid, r]))
    : new Map<string, { value: number; unit: string; timestamp: string; quality: string }>();

  return {
    liveState,
    isConnected,
    error,
    lastFetchTime,
    instrumentMappings,
    probabilityMap,
    sensorValueMap,
    refresh,
    registerProbabilitySource,
    unregisterProbabilitySource,
    updateNodeProbability,
    clearNodeOverride,
  };
}
