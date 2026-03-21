/**
 * useStabilityWorker.ts — React Hook for Web Worker LEM Computation
 *
 * Wraps the stability.worker.ts lifecycle for clean React integration.
 * Provides: { analyze, cancel, results, circle, progress, isComputing, timing }
 *
 * Pattern matches Rocscience SLIDE2 architecture:
 *   - Single worker per tab
 *   - Auto-cancels previous computation on new request
 *   - Progress callbacks for responsive UI
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  LemMethod,
  WorkerRequest,
  WorkerResponse,
  ResultMessage,
} from './stability.worker';
import type {
  SlopeProfile,
  SlipCircle,
  StabilityResult,
  FEMResult,
  GAResult,
  PSOResult,
} from './SlopeStabilityEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisOptions {
  nSlices: number;
  methods: LemMethod[];
  circle?: SlipCircle;
  includeFEM?: boolean;
  includeGA?: boolean;
  includePSO?: boolean;
  gaOptions?: { generations: number; populationSize: number };
  psoOptions?: { iterations: number; particleCount: number };
}

export interface AnalysisResults {
  circle: SlipCircle | null;
  fellenius: StabilityResult | null;
  bishop: StabilityResult | null;
  janbuSimp: StabilityResult | null;
  janbuCorr: StabilityResult | null;
  spencer: StabilityResult | null;
  mp: StabilityResult | null;
  coe: StabilityResult | null;
  fem: FEMResult | null;
  ga: GAResult | null;
  pso: PSOResult | null;
  timing: number | null;
}

const EMPTY_RESULTS: AnalysisResults = {
  circle: null,
  fellenius: null, bishop: null,
  janbuSimp: null, janbuCorr: null,
  spencer: null, mp: null, coe: null,
  fem: null, ga: null, pso: null,
  timing: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStabilityWorker() {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const [results, setResults] = useState<AnalysisResults>(EMPTY_RESULTS);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize worker on mount
  useEffect(() => {
    const worker = new Worker(
      new URL('./stability.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse | { type: 'ready' }>) => {
      const msg = event.data;

      if (msg.type === 'ready') {
        console.log('[StabilityWorker] Ready');
        return;
      }

      // Ignore messages from old requests
      if ('id' in msg && msg.id !== requestIdRef.current) return;

      switch (msg.type) {
        case 'progress':
          setProgress(msg.payload.percent);
          setProgressStatus(msg.payload.status);
          break;

        case 'result': {
          const r = msg.payload as ResultMessage['payload'];
          setResults({
            circle: r.circle,
            fellenius: r.results.fellenius ?? null,
            bishop: r.results.bishop ?? null,
            janbuSimp: r.results.janbu_simp ?? null,
            janbuCorr: r.results.janbu_corr ?? null,
            spencer: r.results.spencer ?? null,
            mp: r.results.mp ?? null,
            coe: r.results.coe ?? null,
            fem: r.femResult ?? null,
            ga: r.gaResult ?? null,
            pso: r.psoResult ?? null,
            timing: r.timing,
          });
          setIsComputing(false);
          setProgress(100);
          break;
        }

        case 'error':
          setError(msg.payload.message);
          setIsComputing(false);
          break;
      }
    };

    worker.onerror = (e) => {
      console.error('[StabilityWorker] Error:', e);
      setError(e.message);
      setIsComputing(false);
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Analyze function — auto-cancels previous request
  const analyze = useCallback((profile: SlopeProfile, options: AnalysisOptions) => {
    const worker = workerRef.current;
    if (!worker) return;

    // Cancel previous analysis
    if (requestIdRef.current) {
      worker.postMessage({
        type: 'cancel',
        id: requestIdRef.current,
      } as WorkerRequest);
    }

    // New request ID
    const id = `lem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    requestIdRef.current = id;

    setIsComputing(true);
    setProgress(0);
    setProgressStatus('Iniciando análise...');
    setError(null);

    worker.postMessage({
      type: 'analyze',
      id,
      payload: {
        profile,
        nSlices: options.nSlices,
        methods: options.methods,
        circle: options.circle,
        includeFEM: options.includeFEM,
        includeGA: options.includeGA,
        includePSO: options.includePSO,
        gaOptions: options.gaOptions,
        psoOptions: options.psoOptions,
      },
    } as WorkerRequest);
  }, []);

  // Cancel function
  const cancel = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || !requestIdRef.current) return;

    worker.postMessage({
      type: 'cancel',
      id: requestIdRef.current,
    } as WorkerRequest);

    requestIdRef.current = null;
    setIsComputing(false);
    setProgress(0);
    setProgressStatus('Cancelado');
  }, []);

  return {
    analyze,
    cancel,
    results,
    progress,
    progressStatus,
    isComputing,
    error,
  };
}
