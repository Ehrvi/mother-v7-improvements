/**
 * SHMS Signal Processor — server/shms/signal-processor.ts
 * MOTHER v7 | Structural Health Monitoring System
 *
 * Scientific basis:
 * - FFT with Hann window (Harris, 1978): reduces spectral leakage in DFT
 * - Welch PSD (Welch, 1967): power spectral density via averaged periodograms with 50% overlap
 * - DWT Haar wavelet (Mallat, 1989): discrete wavelet transform for multi-resolution analysis
 * - Damage indices (Rytter, 1993): frequency shift, MAC, WER for structural damage classification
 * - MAC (Allemang & Brown, 1982): Modal Assurance Criterion for mode shape comparison
 * - AASHTO (2018) / ISO 13822 (2010): structural assessment thresholds
 */

import { createLogger } from '../_core/logger.js';

const logger = createLogger('signal-processor');

// ============================================================
// Public Interfaces
// ============================================================

export interface SignalAnalysisResult {
  fundamentalFreqHz: number;
  peakFrequencies: { freq: number; magnitude: number; modeOrder: number }[];
  rmsValue: number;
  psdEstimate: { frequencies: number[]; magnitudes: number[] };
  waveletEnergyRatio: number;
  crestFactor: number;
  kurtosis: number;
  timestamp: Date;
}

export interface DamageIndexResult {
  freqShiftPct: number;
  macValue: number;
  rmsChangePct: number;
  werChange: number;
  compositeScore: number;
  damageLevel: 'healthy' | 'watch' | 'warning' | 'critical';
  recommendation: string;
}

export interface ModalShiftResult {
  shifted: boolean;
  shiftPct: number[];
  maxShiftPct: number;
  severity: 'none' | 'minor' | 'moderate' | 'severe';
}

// ============================================================
// Hann Window
// Reference: Harris (1978) — "On the Use of Windows for Harmonic Analysis"
// ============================================================

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

// ============================================================
// FFT (Cooley-Tukey radix-2, iterative)
// Reference: Cooley & Tukey (1965)
// ============================================================

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
      }
    }
  }
}

// Next power of 2 >= n
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// ============================================================
// Welch PSD Estimator
// Reference: Welch (1967) — 50% overlap, Hann window
// ============================================================

function welchPSD(signal: number[], sampleRateHz: number): { frequencies: number[]; magnitudes: number[] } {
  const segLen = Math.min(256, nextPow2(Math.floor(signal.length / 2)));
  const hop = Math.floor(segLen / 2);         // 50% overlap
  const win = hannWindow(segLen);
  const winPower = win.reduce((s, v) => s + v * v, 0);

  const psd = new Float64Array(segLen / 2 + 1);
  let numSegments = 0;

  for (let start = 0; start + segLen <= signal.length; start += hop) {
    const re = new Float64Array(segLen);
    const im = new Float64Array(segLen);
    for (let i = 0; i < segLen; i++) {
      re[i] = signal[start + i] * win[i];
    }
    fft(re, im);
    for (let i = 0; i <= segLen / 2; i++) {
      const mag = re[i] * re[i] + im[i] * im[i];
      psd[i] += (i === 0 || i === segLen / 2) ? mag / winPower : 2 * mag / winPower;
    }
    numSegments++;
  }

  if (numSegments === 0) return { frequencies: [], magnitudes: [] };

  const freqRes = sampleRateHz / segLen;
  const frequencies: number[] = [];
  const magnitudes: number[] = [];
  for (let i = 0; i <= segLen / 2; i++) {
    frequencies.push(i * freqRes);
    magnitudes.push(psd[i] / numSegments);
  }
  return { frequencies, magnitudes };
}

// ============================================================
// Haar DWT — 5 levels
// Reference: Mallat (1989) — "A Theory for Multiresolution Signal Decomposition"
// ============================================================

function haarDWT(signal: number[], levels: number = 5): number[][] {
  const coeffs: number[][] = [];
  let current = [...signal];
  for (let lvl = 0; lvl < levels && current.length >= 2; lvl++) {
    const approx: number[] = [];
    const detail: number[] = [];
    const half = Math.floor(current.length / 2);
    for (let i = 0; i < half; i++) {
      approx.push((current[2 * i] + current[2 * i + 1]) / Math.SQRT2);
      detail.push((current[2 * i] - current[2 * i + 1]) / Math.SQRT2);
    }
    coeffs.push(detail);
    current = approx;
  }
  coeffs.push(current); // final approximation
  return coeffs;
}

function waveletEnergyRatio(coeffs: number[][]): number {
  let detailEnergy = 0;
  let totalEnergy = 0;
  for (let i = 0; i < coeffs.length - 1; i++) {
    const e = coeffs[i].reduce((s, v) => s + v * v, 0);
    detailEnergy += e;
    totalEnergy += e;
  }
  const approxEnergy = coeffs[coeffs.length - 1].reduce((s, v) => s + v * v, 0);
  totalEnergy += approxEnergy;
  return totalEnergy > 0 ? detailEnergy / totalEnergy : 0;
}

// ============================================================
// Statistical helpers
// ============================================================

function rms(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
}

function kurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (variance === 0) return 0;
  const m4 = values.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
  return m4 / (variance * variance);
}

function findPeaks(freqs: number[], mags: number[], topN: number = 5): { freq: number; magnitude: number; modeOrder: number }[] {
  const peaks: { freq: number; magnitude: number; idx: number }[] = [];
  for (let i = 1; i < mags.length - 1; i++) {
    if (mags[i] > mags[i - 1] && mags[i] > mags[i + 1] && freqs[i] > 0.1) {
      peaks.push({ freq: freqs[i], magnitude: mags[i], idx: i });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, topN).map((p, order) => ({ freq: p.freq, magnitude: p.magnitude, modeOrder: order + 1 }));
}

// ============================================================
// Public API
// ============================================================

/**
 * Process a raw signal and extract structural health indicators.
 * Uses Welch PSD (Welch, 1967), Haar DWT (Mallat, 1989), and
 * statistical moments for feature extraction.
 */
export function processSignal(readings: number[], sampleRateHz: number): SignalAnalysisResult {
  if (readings.length === 0) {
    return {
      fundamentalFreqHz: 0,
      peakFrequencies: [],
      rmsValue: 0,
      crestFactor: 0,
      kurtosis: 0,
      waveletEnergyRatio: 0,
      psdEstimate: { frequencies: [], magnitudes: [] },
      timestamp: new Date(),
    };
  }
  if (readings.length < 8) {
    logger.warn('Signal too short for analysis', { length: readings.length });
  }

  const psdEstimate = welchPSD(readings, sampleRateHz);
  const peaks = findPeaks(psdEstimate.frequencies, psdEstimate.magnitudes);
  const fundamentalFreqHz = peaks.length > 0 ? peaks[0].freq : 0;

  const coeffs = haarDWT(readings, 5);
  const wer = waveletEnergyRatio(coeffs);
  const rmsValue = rms(readings);
  const peakValue = Math.max(...readings.map(Math.abs));
  const crestFactor = rmsValue > 0 ? peakValue / rmsValue : 0;
  const kurt = kurtosis(readings);

  logger.debug('Signal processed', { fundamentalFreqHz, rmsValue, wer, crestFactor });

  return {
    fundamentalFreqHz,
    peakFrequencies: peaks,
    rmsValue,
    psdEstimate,
    waveletEnergyRatio: wer,
    crestFactor,
    kurtosis: kurt,
    timestamp: new Date(),
  };
}

/**
 * Compute damage indices comparing current signal to baseline.
 * Scientific thresholds: ISO 13822 / Rytter (1993) damage classification.
 *
 * Limits:
 *  healthy  : freqShift < 3%,  MAC > 0.95, RMS < 10%
 *  watch    : freqShift 3–5%,  MAC 0.90–0.95, RMS 10–20%
 *  warning  : freqShift 5–10%, MAC 0.85–0.90, RMS 20–40%
 *  critical : freqShift > 10%, MAC < 0.85,    RMS > 40%
 */
export function computeDamageIndex(
  current: SignalAnalysisResult,
  baseline: SignalAnalysisResult
): DamageIndexResult {
  const freqShiftPct =
    baseline.fundamentalFreqHz > 0
      ? Math.abs((current.fundamentalFreqHz - baseline.fundamentalFreqHz) / baseline.fundamentalFreqHz) * 100
      : 0;

  // MAC: dot product of PSD magnitude vectors normalised — Allemang & Brown (1982)
  const curMags = current.psdEstimate.magnitudes;
  const baseMags = baseline.psdEstimate.magnitudes;
  const minLen = Math.min(curMags.length, baseMags.length);
  let dot = 0, normCur = 0, normBase = 0;
  for (let i = 0; i < minLen; i++) {
    dot += curMags[i] * baseMags[i];
    normCur += curMags[i] * curMags[i];
    normBase += baseMags[i] * baseMags[i];
  }
  const macValue = (normCur > 0 && normBase > 0) ? (dot * dot) / (normCur * normBase) : 1;

  const rmsChangePct =
    baseline.rmsValue > 0
      ? Math.abs((current.rmsValue - baseline.rmsValue) / baseline.rmsValue) * 100
      : 0;

  const werChange = Math.abs(current.waveletEnergyRatio - baseline.waveletEnergyRatio);

  // Composite score (0–1): weighted combination
  const freqScore = Math.min(1, freqShiftPct / 15);
  const macScore = 1 - macValue;
  const rmsScore = Math.min(1, rmsChangePct / 50);
  const werScore = Math.min(1, werChange / 0.5);
  const compositeScore = 0.35 * freqScore + 0.30 * macScore + 0.20 * rmsScore + 0.15 * werScore;

  let damageLevel: DamageIndexResult['damageLevel'];
  let recommendation: string;

  if (freqShiftPct > 10 || macValue < 0.85 || rmsChangePct > 40) {
    damageLevel = 'critical';
    recommendation = 'Immediate structural inspection required. Load restriction may be necessary.';
  } else if (freqShiftPct > 5 || (macValue >= 0.85 && macValue < 0.90) || rmsChangePct > 20) {
    damageLevel = 'warning';
    recommendation = 'Schedule detailed inspection within 30 days. Monitor continuously.';
  } else if (freqShiftPct > 3 || (macValue >= 0.90 && macValue < 0.95) || rmsChangePct > 10) {
    damageLevel = 'watch';
    recommendation = 'Increase monitoring frequency. Plan inspection within 90 days.';
  } else {
    damageLevel = 'healthy';
    recommendation = 'Structure within normal operating parameters. Continue routine monitoring.';
  }

  logger.info('Damage index computed', { freqShiftPct, macValue, rmsChangePct, damageLevel });

  return {
    freqShiftPct: Math.round(freqShiftPct * 100) / 100,
    macValue: Math.round(macValue * 10000) / 10000,
    rmsChangePct: Math.round(rmsChangePct * 100) / 100,
    werChange: Math.round(werChange * 10000) / 10000,
    compositeScore: Math.round(compositeScore * 10000) / 10000,
    damageLevel,
    recommendation,
  };
}

/**
 * Detect modal frequency shifts across multiple modes.
 * Reference: Salawu (1997) — "Detection of structural damage through changes in frequency"
 */
export function detectModalShift(freqs: number[], refFreqs: number[]): ModalShiftResult {
  const len = Math.min(freqs.length, refFreqs.length);
  if (len === 0) {
    return { shifted: false, shiftPct: [], maxShiftPct: 0, severity: 'none' };
  }

  const shiftPct: number[] = [];
  for (let i = 0; i < len; i++) {
    const shift = refFreqs[i] > 0 ? Math.abs((freqs[i] - refFreqs[i]) / refFreqs[i]) * 100 : 0;
    shiftPct.push(Math.round(shift * 100) / 100);
  }

  const maxShiftPct = Math.max(...shiftPct);
  let severity: ModalShiftResult['severity'];

  if (maxShiftPct > 10) severity = 'severe';
  else if (maxShiftPct > 5) severity = 'moderate';
  else if (maxShiftPct > 3) severity = 'minor';
  else severity = 'none';

  const shifted = severity !== 'none';
  logger.debug('Modal shift detection', { maxShiftPct, severity });

  return { shifted, shiftPct, maxShiftPct: Math.round(maxShiftPct * 100) / 100, severity };
}
