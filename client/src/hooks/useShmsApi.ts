/**
 * useShmsApi.ts — MOTHER SHMS v4 — React Query hooks for all 36 SHMS endpoints
 *
 * Scientific basis:
 * - Stale-while-revalidate (Nottingham, RFC 5861) — cache pattern
 * - React Query v5 (Linsley, 2024) — server-state management
 * - ICOLD Bulletin 158 §4.3 — monitoring data refresh requirements
 *
 * @module useShmsApi
 */

import { useQuery, useMutation, type UseQueryOptions } from '@tanstack/react-query';

const BASE = '/api/shms/v2';

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function shmsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`SHMS API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function shmsPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SHMS API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SensorSummary {
  sensorId: string;
  sensorType: string;
  lastReading: number;
  unit: string;
  icoldLevel: 'GREEN' | 'YELLOW' | 'RED';
  lastUpdated: string;
}

export interface StructureData {
  structureId: string;
  structureName: string;
  timestamp: string;
  overallStatus: 'GREEN' | 'YELLOW' | 'RED';
  sensors: SensorSummary[];
  activeAlerts: number;
  lstmPrediction: { rmse: number; trend: string; confidence: number } | null;
  digitalTwinStatus: string;
  mqttConnected: boolean;
  timescaleConnected: boolean;
  healthIndex?: number;
  riskLevel?: string;
  shmsLevel?: number;
  structureType?: string;
  recentReadings?: ReadingPoint[];
  predictions?: PredictionPoint[];
  signalAnalysis?: SignalAnalysisSummary;
}

export interface ReadingPoint {
  timestamp: string;
  value: number;
  unit: string;
  isAnomaly: boolean;
  zScore?: number;
  sensorId?: string;
}

export interface PredictionPoint {
  timestamp: string;
  predicted: number;
  confidence: number;
}

export interface SignalAnalysisSummary {
  fundamentalFreqHz: number;
  damageLevel: string;
  macValue: number;
  rmsChangePct: number;
  werChange: number;
  compositeScore: number;
}

export interface DashboardAll {
  structures: StructureData[];
  totalReadings: number;
  activeAlerts: number;
  avgHealthScore: number;
  mqttConnected: boolean;
  lastUpdated: string;
  alerts?: AlertItem[];
}

export interface AlertItem {
  id: string;
  severity: string;
  message: string;
  sensorId: string;
  structureId: string;
  timestamp: string;
}

export interface HistoryResult {
  structureId: string;
  readings: Array<{ time: string; value: number; sensorId?: string; sensorType?: string }>;
  count: number;
}

export interface SignalAnalysisResult {
  structureId: string;
  signalAnalysis: Record<string, unknown>;
  damageIndex: Record<string, unknown>;
  usedFallback: boolean;
}

export interface RULResult {
  structureId: string;
  rulDays: { p10: number; p50: number; p90: number };
  currentHealth: number;
  degradationRate: number;
  criticalThreshold: number;
  daysAnalysed: number;
  usedFallback: boolean;
}

export interface StabilityResult {
  structureId: string;
  analyses: unknown[];
  count: number;
}

export interface FaultTreeResult {
  structureId: string;
  trees: unknown[];
  count: number;
}

export interface RiskMapResult {
  structureId: string;
  zones: unknown[];
  snapshot: unknown;
  count: number;
}

export interface CrossSectionResult {
  structureId: string;
  sections: unknown[];
  count: number;
}

export interface BoreholeResult {
  structureId: string;
  boreholes: unknown[];
  count: number;
}

export interface EventsResult {
  structureId: string;
  events: unknown[];
  count: number;
  periodStart: string;
  periodEnd: string;
}

export interface TARPResult {
  structureId: string;
  matrix: unknown;
  compliance: unknown;
  activeActivations: unknown[];
}

export interface SirenResult {
  structureId: string;
  sirens: unknown[];
  count: number;
}

export interface InstrumentationResult {
  structureId: string;
  tags: unknown[];
  count: number;
}

export interface BigDataResult {
  structureId: string;
  capabilities: string[];
}

export interface IngestStatusResult {
  connectors: Array<{
    protocol: string;
    status: string;
    lastActivity: string | null;
    totalIngested: number;
    totalRejected: number;
    configuration: Record<string, unknown>;
    scientificBasis: string;
  }>;
  totalProtocols: number;
  activeProtocols: number;
}

export interface FilesResult {
  structureId: string;
  files: unknown[];
  count: number;
}

export interface DocumentsResult {
  structureId: string;
  documents: unknown[];
  count: number;
}

export interface BankResult {
  structureId: string;
  [key: string]: unknown;
}

export interface Scene3DResult {
  structureId: string;
  [key: string]: unknown;
}

export interface BridgeStatsResult {
  status: string;
  stats?: Record<string, unknown>;
}

export interface HealthResult {
  status: string;
  service: string;
  mqttConfigured: boolean;
  timestamp: string;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const shmsKeys = {
  all: ['shms'] as const,
  health: () => [...shmsKeys.all, 'health'] as const,
  dashboardAll: () => [...shmsKeys.all, 'dashboard', 'all'] as const,
  dashboard: (id: string) => [...shmsKeys.all, 'dashboard', id] as const,
  history: (id: string) => [...shmsKeys.all, 'history', id] as const,
  bridgeStats: () => [...shmsKeys.all, 'bridge', 'stats'] as const,
  signalAnalysis: (id: string) => [...shmsKeys.all, 'signal-analysis', id] as const,
  rul: (id: string) => [...shmsKeys.all, 'rul', id] as const,
  stability: (id: string) => [...shmsKeys.all, 'stability', id] as const,
  faultTree: (id: string) => [...shmsKeys.all, 'fault-tree', id] as const,
  riskMap: (id: string) => [...shmsKeys.all, 'risk-map', id] as const,
  crossSection: (id: string) => [...shmsKeys.all, 'cross-section', id] as const,
  boreholes: (id: string) => [...shmsKeys.all, 'boreholes', id] as const,
  instrumentation: (id: string) => [...shmsKeys.all, 'instrumentation', id] as const,
  events: (id: string) => [...shmsKeys.all, 'events', id] as const,
  tarp: (id: string) => [...shmsKeys.all, 'tarp', id] as const,
  sirens: (id: string) => [...shmsKeys.all, 'sirens', id] as const,
  bigData: (id: string) => [...shmsKeys.all, 'big-data', id] as const,
  scene3d: (id: string) => [...shmsKeys.all, '3d', id] as const,
  files: (id: string) => [...shmsKeys.all, 'files', id] as const,
  documents: (id: string) => [...shmsKeys.all, 'documents', id] as const,
  bank: (id: string) => [...shmsKeys.all, 'bank', id] as const,
  ingestStatus: () => [...shmsKeys.all, 'ingest', 'status'] as const,
} as const;

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Health check — GET /health */
export function useShmsHealth(opts?: Partial<UseQueryOptions<HealthResult>>) {
  return useQuery({ queryKey: shmsKeys.health(), queryFn: () => shmsGet<HealthResult>('/health'), staleTime: 30_000, ...opts });
}

/** Dashboard all structures — GET /dashboard/all — polls every 30s */
export function useShmsDashboardAll(opts?: Partial<UseQueryOptions<DashboardAll>>) {
  return useQuery({ queryKey: shmsKeys.dashboardAll(), queryFn: () => shmsGet<DashboardAll>('/dashboard/all'), refetchInterval: 30_000, staleTime: 15_000, ...opts });
}

/** Single structure dashboard — GET /dashboard/:id */
export function useShmsDashboard(structureId: string, opts?: Partial<UseQueryOptions<StructureData>>) {
  return useQuery({ queryKey: shmsKeys.dashboard(structureId), queryFn: () => shmsGet<StructureData>(`/dashboard/${structureId}`), enabled: !!structureId, staleTime: 15_000, ...opts });
}

/** Historical readings — GET /history/:id */
export function useShmsHistory(structureId: string, hours = 24, opts?: Partial<UseQueryOptions<HistoryResult>>) {
  return useQuery({ queryKey: [...shmsKeys.history(structureId), hours], queryFn: () => shmsGet<HistoryResult>(`/history/${structureId}?hours=${hours}`), enabled: !!structureId, staleTime: 60_000, ...opts });
}

/** Bridge/pipeline stats — GET /bridge/stats */
export function useShmsBridgeStats(opts?: Partial<UseQueryOptions<BridgeStatsResult>>) {
  return useQuery({ queryKey: shmsKeys.bridgeStats(), queryFn: () => shmsGet<BridgeStatsResult>('/bridge/stats'), staleTime: 30_000, ...opts });
}

/** Signal analysis — GET /signal-analysis/:id */
export function useShmsSignalAnalysis(structureId: string, opts?: Partial<UseQueryOptions<SignalAnalysisResult>>) {
  return useQuery({ queryKey: shmsKeys.signalAnalysis(structureId), queryFn: () => shmsGet<SignalAnalysisResult>(`/signal-analysis/${structureId}`), enabled: !!structureId, staleTime: 120_000, ...opts });
}

/** RUL prediction — GET /rul/:id */
export function useShmsRUL(structureId: string, opts?: Partial<UseQueryOptions<RULResult>>) {
  return useQuery({ queryKey: shmsKeys.rul(structureId), queryFn: () => shmsGet<RULResult>(`/rul/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Stability analysis — GET /stability/:id */
export function useShmsStability(structureId: string, opts?: Partial<UseQueryOptions<StabilityResult>>) {
  return useQuery({ queryKey: shmsKeys.stability(structureId), queryFn: () => shmsGet<StabilityResult>(`/stability/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Fault tree — GET /fault-tree/:id */
export function useShmsFaultTree(structureId: string, opts?: Partial<UseQueryOptions<FaultTreeResult>>) {
  return useQuery({ queryKey: shmsKeys.faultTree(structureId), queryFn: () => shmsGet<FaultTreeResult>(`/fault-tree/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Risk map — GET /risk-map/:id */
export function useShmsRiskMap(structureId: string, opts?: Partial<UseQueryOptions<RiskMapResult>>) {
  return useQuery({ queryKey: shmsKeys.riskMap(structureId), queryFn: () => shmsGet<RiskMapResult>(`/risk-map/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Cross section — GET /cross-section/:id */
export function useShmsCrossSection(structureId: string, opts?: Partial<UseQueryOptions<CrossSectionResult>>) {
  return useQuery({ queryKey: shmsKeys.crossSection(structureId), queryFn: () => shmsGet<CrossSectionResult>(`/cross-section/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Boreholes — GET /boreholes/:id */
export function useShmsBoreholes(structureId: string, opts?: Partial<UseQueryOptions<BoreholeResult>>) {
  return useQuery({ queryKey: shmsKeys.boreholes(structureId), queryFn: () => shmsGet<BoreholeResult>(`/boreholes/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Instrumentation — GET /instrumentation/:id */
export function useShmsInstrumentation(structureId: string, opts?: Partial<UseQueryOptions<InstrumentationResult>>) {
  return useQuery({ queryKey: shmsKeys.instrumentation(structureId), queryFn: () => shmsGet<InstrumentationResult>(`/instrumentation/${structureId}`), enabled: !!structureId, staleTime: 120_000, ...opts });
}

/** Events — GET /events/:id */
export function useShmsEvents(structureId: string, days = 30, opts?: Partial<UseQueryOptions<EventsResult>>) {
  return useQuery({ queryKey: [...shmsKeys.events(structureId), days], queryFn: () => shmsGet<EventsResult>(`/events/${structureId}?days=${days}`), enabled: !!structureId, staleTime: 60_000, ...opts });
}

/** TARP — GET /tarp/:id */
export function useShmsTARP(structureId: string, opts?: Partial<UseQueryOptions<TARPResult>>) {
  return useQuery({ queryKey: shmsKeys.tarp(structureId), queryFn: () => shmsGet<TARPResult>(`/tarp/${structureId}`), enabled: !!structureId, staleTime: 120_000, ...opts });
}

/** Sirens — GET /sirens/:id */
export function useShmsSirens(structureId: string, opts?: Partial<UseQueryOptions<SirenResult>>) {
  return useQuery({ queryKey: shmsKeys.sirens(structureId), queryFn: () => shmsGet<SirenResult>(`/sirens/${structureId}`), enabled: !!structureId, staleTime: 30_000, ...opts });
}

/** Big data — GET /big-data/:id */
export function useShmsBigData(structureId: string, opts?: Partial<UseQueryOptions<BigDataResult>>) {
  return useQuery({ queryKey: shmsKeys.bigData(structureId), queryFn: () => shmsGet<BigDataResult>(`/big-data/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** 3D Scene — GET /3d/:id */
export function useShms3D(structureId: string, opts?: Partial<UseQueryOptions<Scene3DResult>>) {
  return useQuery({ queryKey: shmsKeys.scene3d(structureId), queryFn: () => shmsGet<Scene3DResult>(`/3d/${structureId}`), enabled: !!structureId, staleTime: 600_000, ...opts });
}

/** Files — GET /files/:id */
export function useShmsFiles(structureId: string, opts?: Partial<UseQueryOptions<FilesResult>>) {
  return useQuery({ queryKey: shmsKeys.files(structureId), queryFn: () => shmsGet<FilesResult>(`/files/${structureId}`), enabled: !!structureId, staleTime: 60_000, ...opts });
}

/** Documents — GET /documents/:id */
export function useShmsDocuments(structureId: string, opts?: Partial<UseQueryOptions<DocumentsResult>>) {
  return useQuery({ queryKey: shmsKeys.documents(structureId), queryFn: () => shmsGet<DocumentsResult>(`/documents/${structureId}`), enabled: !!structureId, staleTime: 60_000, ...opts });
}

/** Bank — GET /bank/:id */
export function useShmsBank(structureId: string, opts?: Partial<UseQueryOptions<BankResult>>) {
  return useQuery({ queryKey: shmsKeys.bank(structureId), queryFn: () => shmsGet<BankResult>(`/bank/${structureId}`), enabled: !!structureId, staleTime: 300_000, ...opts });
}

/** Ingest status — GET /ingest/status */
export function useShmsIngestStatus(opts?: Partial<UseQueryOptions<IngestStatusResult>>) {
  return useQuery({ queryKey: shmsKeys.ingestStatus(), queryFn: () => shmsGet<IngestStatusResult>('/ingest/status'), staleTime: 30_000, ...opts });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/** AI Analysis — POST /analyze */
export function useShmsAnalyze() {
  return useMutation({ mutationFn: (body: { structureId: string; query: string }) => shmsPost<unknown>('/analyze', body) });
}

/** Alert notify — POST /alerts/:id/notify */
export function useShmsAlertNotify() {
  return useMutation({ mutationFn: (p: { alertId: string; body: unknown }) => shmsPost<unknown>(`/alerts/${p.alertId}/notify`, p.body) });
}

/** Siren activate — POST /sirens/:id/activate */
export function useShmsSirenActivate() {
  return useMutation({ mutationFn: (p: { structureId: string; body: unknown }) => shmsPost<unknown>(`/sirens/${p.structureId}/activate`, p.body) });
}

/** Export — POST /export */
export function useShmsExport() {
  return useMutation({ mutationFn: (body: unknown) => shmsPost<Blob>('/export', body) });
}

/** BI Push — POST /bi/push */
export function useShmsBIPush() {
  return useMutation({ mutationFn: (body: unknown) => shmsPost<unknown>('/bi/push', body) });
}

/** CSV Ingest — POST /ingest/csv */
export function useShmsIngestCsv() {
  return useMutation({ mutationFn: (body: unknown) => shmsPost<unknown>('/ingest/csv', body) });
}

/** Universal ingest — POST /ingest */
export function useShmsIngest() {
  return useMutation({ mutationFn: (body: { protocol: string; payload: unknown }) => shmsPost<unknown>('/ingest', body) });
}

/** File registration — POST /files */
export function useShmsFileRegister() {
  return useMutation({ mutationFn: (body: unknown) => shmsPost<unknown>('/files', body) });
}
