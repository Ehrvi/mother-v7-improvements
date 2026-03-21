/**
 * stability.worker.ts — Web Worker for Non-Blocking LEM Computation
 *
 * Moves ALL slope stability calculations off the main thread.
 * Based on SOTA architecture validated by 21 primary sources:
 *   - Rocscience Slide2/3 pattern: dedicated computation thread
 *   - NGI Digital Twin pipeline: IoT → Worker → Dashboard
 *   - Vite native Web Worker support (import.meta.url)
 *
 * Protocol:
 *   Main Thread → Worker:  { type: 'analyze', id, payload }
 *   Worker → Main Thread:  { type: 'progress' | 'result' | 'error', id, payload }
 */

import {
  searchCriticalCircle,
  felleniusOMS,
  bishopSimplified,
  janbuSimplified,
  janbuCorrected,
  spencerMethod,
  morgensternPrice,
  corpsOfEngineers,
  femCPhiReduction,
  gaOptimize,
  psoOptimize,
  type SlopeProfile,
  type SlipCircle,
  type StabilityResult,
  type FEMResult,
  type GAResult,
  type PSOResult,
} from './SlopeStabilityEngine';

// ─── Message Types ────────────────────────────────────────────────────────────

export type LemMethod = 'bishop' | 'fellenius' | 'janbu_simp' | 'janbu_corr' | 'spencer' | 'mp' | 'coe';

export interface AnalyzeRequest {
  type: 'analyze';
  id: string;
  payload: {
    profile: SlopeProfile;
    nSlices: number;
    methods: LemMethod[];
    circle?: SlipCircle;        // optional: use specific circle instead of auto-search
    includeFEM?: boolean;
    includeGA?: boolean;
    includePSO?: boolean;
    gaOptions?: { generations: number; populationSize: number };
    psoOptions?: { iterations: number; particleCount: number };
  };
}

export interface CancelRequest {
  type: 'cancel';
  id: string;
}

export type WorkerRequest = AnalyzeRequest | CancelRequest;

export interface ProgressMessage {
  type: 'progress';
  id: string;
  payload: {
    percent: number;
    status: string;
  };
}

export interface ResultMessage {
  type: 'result';
  id: string;
  payload: {
    circle: SlipCircle;
    results: Record<LemMethod, StabilityResult | null>;
    femResult?: FEMResult | null;
    gaResult?: GAResult | null;
    psoResult?: PSOResult | null;
    timing: number;
  };
}

export interface ErrorMessage {
  type: 'error';
  id: string;
  payload: {
    message: string;
  };
}

export type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;

// ─── Worker Context ───────────────────────────────────────────────────────────

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let currentRequestId: string | null = null;

function sendProgress(id: string, percent: number, status: string) {
  ctx.postMessage({ type: 'progress', id, payload: { percent, status } } as ProgressMessage);
}

function sendResult(id: string, payload: ResultMessage['payload']) {
  ctx.postMessage({ type: 'result', id, payload } as ResultMessage);
}

function sendError(id: string, message: string) {
  ctx.postMessage({ type: 'error', id, payload: { message } } as ErrorMessage);
}

// ─── LEM Method Runner ───────────────────────────────────────────────────────

function runMethod(
  method: LemMethod,
  profile: SlopeProfile,
  circle: SlipCircle,
  nSlices: number
): StabilityResult | null {
  try {
    switch (method) {
      case 'fellenius':
        return felleniusOMS(profile, circle, nSlices);
      case 'bishop':
        return bishopSimplified(profile, circle, nSlices, 100, 0.001);
      case 'janbu_simp':
        return janbuSimplified(profile, circle, nSlices, 100, 0.001);
      case 'janbu_corr':
        return janbuCorrected(profile, circle, nSlices, 100, 0.001);
      case 'spencer':
        return spencerMethod(profile, circle, nSlices, 200, 0.001);
      case 'mp':
        return morgensternPrice(profile, circle, 'half-sine', nSlices, 300, 0.001);
      case 'coe':
        return corpsOfEngineers(profile, circle, 'coe', nSlices, 100, 0.001);
      default:
        return null;
    }
  } catch (e) {
    console.warn(`[Worker] Method ${method} failed:`, e);
    return null;
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'cancel') {
    if (currentRequestId === msg.id) {
      currentRequestId = null;
    }
    return;
  }

  if (msg.type === 'analyze') {
    const { id, payload } = msg;
    currentRequestId = id;
    const t0 = performance.now();

    try {
      const { profile, nSlices, methods, includeFEM, includeGA, includePSO } = payload;

      // Step 1: Find critical circle (or use provided one)
      sendProgress(id, 5, 'Buscando superfície crítica...');
      let circle: SlipCircle;
      if (payload.circle) {
        circle = payload.circle;
        sendProgress(id, 15, 'Usando superfície fornecida');
      } else {
        const searchResult = searchCriticalCircle(profile, nSlices);
        circle = searchResult.circle;
        sendProgress(id, 20, `Superfície crítica: R=${circle.radius.toFixed(1)}m`);
      }

      // Check if cancelled
      if (currentRequestId !== id) return;

      // Step 2: Run each LEM method
      const results: Record<string, StabilityResult | null> = {};
      const totalSteps = methods.length + (includeFEM ? 1 : 0) + (includeGA ? 1 : 0) + (includePSO ? 1 : 0);
      let step = 0;

      for (const method of methods) {
        if (currentRequestId !== id) return; // cancelled

        const methodNames: Record<LemMethod, string> = {
          fellenius: 'Fellenius (OMS)',
          bishop: 'Bishop Simplificado',
          janbu_simp: 'Janbu Simplificado',
          janbu_corr: 'Janbu Corrigido',
          spencer: 'Spencer',
          mp: 'Morgenstern-Price',
          coe: 'Corps of Engineers',
        };

        sendProgress(id, 20 + Math.round((step / totalSteps) * 60), `Calculando ${methodNames[method]}...`);
        results[method] = runMethod(method, profile, circle, nSlices);
        step++;
      }

      // Step 3: Optional FEM
      let femResult: FEMResult | null = null;
      if (includeFEM && currentRequestId === id) {
        sendProgress(id, 20 + Math.round((step / totalSteps) * 60), 'Calculando FEM (SSR)...');
        try {
          femResult = femCPhiReduction(profile, 12);
        } catch (e) {
          console.warn('[Worker] FEM failed:', e);
        }
        step++;
      }

      // Step 4: Optional GA
      let gaResult: GAResult | null = null;
      if (includeGA && currentRequestId === id) {
        sendProgress(id, 20 + Math.round((step / totalSteps) * 60), 'Otimizando com GA...');
        try {
          const opts = payload.gaOptions ?? { generations: 60, populationSize: 40 };
          gaResult = gaOptimize(profile, opts);
        } catch (e) {
          console.warn('[Worker] GA failed:', e);
        }
        step++;
      }

      // Step 5: Optional PSO
      let psoResult: PSOResult | null = null;
      if (includePSO && currentRequestId === id) {
        sendProgress(id, 20 + Math.round((step / totalSteps) * 60), 'Otimizando com PSO...');
        try {
          const opts = payload.psoOptions ?? { iterations: 50, particleCount: 25 };
          psoResult = psoOptimize(profile, opts);
        } catch (e) {
          console.warn('[Worker] PSO failed:', e);
        }
        step++;
      }

      // Check cancellation one last time
      if (currentRequestId !== id) return;

      const timing = performance.now() - t0;
      sendProgress(id, 100, `Concluído em ${(timing / 1000).toFixed(1)}s`);

      sendResult(id, {
        circle,
        results: results as Record<LemMethod, StabilityResult | null>,
        femResult,
        gaResult,
        psoResult,
        timing,
      });

    } catch (e) {
      sendError(id, e instanceof Error ? e.message : String(e));
    } finally {
      if (currentRequestId === id) {
        currentRequestId = null;
      }
    }
  }
};

// Signal that the worker is ready
ctx.postMessage({ type: 'ready' });
