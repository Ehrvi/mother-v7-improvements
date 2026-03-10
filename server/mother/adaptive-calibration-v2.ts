/**
 * Adaptive Calibration V2 — server/mother/adaptive-calibration-v2.ts
 * MOTHER v100.0 | Ciclo C217 | NC-CAL-002
 *
 * Multi-dimensional calibration system that adapts MOTHER's confidence
 * and quality scores based on:
 * 1. Historical G-Eval scores per domain
 * 2. User feedback signals (explicit + implicit)
 * 3. Temporal drift detection (concept drift)
 * 4. Cross-model calibration (MOTHER vs GPT-4o vs Claude)
 *
 * Scientific basis:
 * - Guo et al. (2017) "On Calibration of Modern Neural Networks"
 *   arXiv:1706.04599 — temperature scaling calibration
 * - Naeini et al. (2015) "Obtaining Well Calibrated Probabilities Using Bayesian Binning into Quantiles"
 *   AAAI 2015 — BBQ calibration
 * - Desai & Durrett (2020) "Calibration of Pre-trained Transformers"
 *   arXiv:2003.07892 — LLM calibration methods
 * - Kadavath et al. (2022) "Language Models (Mostly) Know What They Know"
 *   arXiv:2207.05221 — self-knowledge calibration
 */

export type CalibrationDomain =
  | 'mathematics' | 'logic' | 'science' | 'programming' | 'language'
  | 'creative' | 'analysis' | 'geotechnical' | 'general';

export interface CalibrationObservation {
  domain: CalibrationDomain;
  predictedQuality: number;    // MOTHER's self-assessed quality (0-100)
  actualQuality: number;       // G-Eval score or user feedback (0-100)
  model: string;               // Which model was used
  timestamp: Date;
  queryLength: number;
  responseLength: number;
}

export interface CalibrationBin {
  domain: CalibrationDomain;
  binRange: [number, number];  // [min, max] predicted quality
  observations: number;
  meanPredicted: number;
  meanActual: number;
  calibrationError: number;    // |meanPredicted - meanActual|
  temperature: number;         // Platt scaling temperature
}

export interface CalibrationResult {
  domain: CalibrationDomain;
  rawScore: number;
  calibratedScore: number;
  calibrationAdjustment: number;
  confidence: number;          // Calibration confidence (0-1)
  method: 'temperature_scaling' | 'platt_scaling' | 'bbq' | 'identity';
  ece: number;                 // Expected Calibration Error
}

export interface DriftDetectionResult {
  hasDrift: boolean;
  domain: CalibrationDomain;
  driftMagnitude: number;
  driftDirection: 'improving' | 'degrading' | 'stable';
  windowSize: number;
  recommendation: string;
}

// Calibration history (production: MySQL calibration_v2 table)
const calibrationHistory = new Map<CalibrationDomain, CalibrationObservation[]>();
const temperatureByDomain = new Map<CalibrationDomain, number>();

// Initialize temperature scaling factors (domain-specific)
const DEFAULT_TEMPERATURES: Record<CalibrationDomain, number> = {
  mathematics: 0.85,    // MOTHER tends to overconfident on math
  logic: 0.90,
  science: 0.95,
  programming: 0.88,
  language: 1.05,       // MOTHER slightly underconfident on language
  creative: 1.10,
  analysis: 0.92,
  geotechnical: 0.80,   // Domain-specific, needs more calibration
  general: 1.00,
};

// Initialize with defaults
for (const [domain, temp] of Object.entries(DEFAULT_TEMPERATURES)) {
  temperatureByDomain.set(domain as CalibrationDomain, temp);
}

/**
 * Record a new calibration observation.
 */
export function recordCalibrationObservation(obs: CalibrationObservation): void {
  const history = calibrationHistory.get(obs.domain) ?? [];
  history.push(obs);
  if (history.length > 200) history.shift();  // Keep last 200 per domain
  calibrationHistory.set(obs.domain, history);

  // Update temperature scaling if enough observations
  if (history.length >= 20) {
    updateTemperatureScaling(obs.domain, history);
  }
}

/**
 * Update temperature scaling for a domain using Platt scaling.
 */
function updateTemperatureScaling(
  domain: CalibrationDomain,
  history: CalibrationObservation[]
): void {
  const recent = history.slice(-50);  // Last 50 observations
  const meanPredicted = recent.reduce((s, o) => s + o.predictedQuality, 0) / recent.length;
  const meanActual = recent.reduce((s, o) => s + o.actualQuality, 0) / recent.length;

  if (meanPredicted === 0) return;

  // Temperature = actual/predicted (simple scaling)
  const newTemperature = meanActual / meanPredicted;

  // Smooth update (exponential moving average, α=0.1)
  const currentTemp = temperatureByDomain.get(domain) ?? 1.0;
  const smoothedTemp = 0.9 * currentTemp + 0.1 * newTemperature;

  // Clamp to reasonable range [0.5, 1.5]
  temperatureByDomain.set(domain, Math.min(1.5, Math.max(0.5, smoothedTemp)));
}

/**
 * Apply calibration to a raw quality score.
 */
export function applyCalibrationV2(
  rawScore: number,
  domain: CalibrationDomain,
  model: string = 'claude-sonnet'
): CalibrationResult {
  const temperature = temperatureByDomain.get(domain) ?? 1.0;
  const history = calibrationHistory.get(domain) ?? [];

  // Temperature scaling
  const calibratedScore = Math.min(100, Math.max(0, rawScore * temperature));
  const adjustment = calibratedScore - rawScore;

  // Compute ECE (Expected Calibration Error)
  let ece = 0;
  if (history.length >= 10) {
    const bins = computeCalibrationBins(domain, history);
    ece = bins.reduce((sum, bin) => sum + Math.abs(bin.calibrationError) * (bin.observations / history.length), 0);
  }

  // Confidence based on observation count
  const confidence = Math.min(1.0, history.length / 50);

  return {
    domain,
    rawScore,
    calibratedScore,
    calibrationAdjustment: adjustment,
    confidence,
    method: history.length >= 20 ? 'temperature_scaling' : 'identity',
    ece,
  };
}

/**
 * Compute calibration bins for ECE calculation.
 */
function computeCalibrationBins(
  domain: CalibrationDomain,
  history: CalibrationObservation[]
): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  const binSize = 10;  // 10-point bins

  for (let binMin = 0; binMin < 100; binMin += binSize) {
    const binMax = binMin + binSize;
    const inBin = history.filter(o => o.predictedQuality >= binMin && o.predictedQuality < binMax);

    if (inBin.length === 0) continue;

    const meanPredicted = inBin.reduce((s, o) => s + o.predictedQuality, 0) / inBin.length;
    const meanActual = inBin.reduce((s, o) => s + o.actualQuality, 0) / inBin.length;

    bins.push({
      domain,
      binRange: [binMin, binMax],
      observations: inBin.length,
      meanPredicted,
      meanActual,
      calibrationError: meanPredicted - meanActual,
      temperature: temperatureByDomain.get(domain) ?? 1.0,
    });
  }

  return bins;
}

/**
 * Detect concept drift in calibration performance.
 */
export function detectCalibrationDrift(domain: CalibrationDomain): DriftDetectionResult {
  const history = calibrationHistory.get(domain) ?? [];

  if (history.length < 20) {
    return {
      hasDrift: false,
      domain,
      driftMagnitude: 0,
      driftDirection: 'stable',
      windowSize: history.length,
      recommendation: 'Insufficient data for drift detection (need ≥20 observations)',
    };
  }

  const windowSize = Math.min(20, history.length);
  const recent = history.slice(-windowSize);
  const older = history.slice(-windowSize * 2, -windowSize);

  if (older.length === 0) {
    return {
      hasDrift: false,
      domain,
      driftMagnitude: 0,
      driftDirection: 'stable',
      windowSize,
      recommendation: 'Not enough history for comparison',
    };
  }

  const recentError = recent.reduce((s, o) => s + Math.abs(o.predictedQuality - o.actualQuality), 0) / recent.length;
  const olderError = older.reduce((s, o) => s + Math.abs(o.predictedQuality - o.actualQuality), 0) / older.length;

  const driftMagnitude = Math.abs(recentError - olderError);
  const hasDrift = driftMagnitude > 5.0;  // 5-point threshold
  const driftDirection = recentError < olderError ? 'improving' : recentError > olderError ? 'degrading' : 'stable';

  return {
    hasDrift,
    domain,
    driftMagnitude,
    driftDirection,
    windowSize,
    recommendation: hasDrift
      ? `Drift detected in ${domain}: ${driftDirection} by ${driftMagnitude.toFixed(1)} points. Recalibrate temperature.`
      : `No significant drift in ${domain}. Current ECE is stable.`,
  };
}

/**
 * Get calibration report for all domains.
 */
export function getCalibrationReport(): string {
  const lines = [
    '## NC-CAL-002: Adaptive Calibration V2 Report',
    '',
    '| Domain | Temperature | Observations | ECE | Status |',
    '|--------|------------|--------------|-----|--------|',
  ];

  for (const domain of Object.keys(DEFAULT_TEMPERATURES) as CalibrationDomain[]) {
    const temp = temperatureByDomain.get(domain) ?? 1.0;
    const history = calibrationHistory.get(domain) ?? [];
    const drift = detectCalibrationDrift(domain);
    const ece = history.length >= 10
      ? computeCalibrationBins(domain, history).reduce((s, b) => s + Math.abs(b.calibrationError) * (b.observations / history.length), 0)
      : 0;

    const status = drift.hasDrift ? `⚠️ ${drift.driftDirection}` : '✅ stable';
    lines.push(`| ${domain} | ${temp.toFixed(3)} | ${history.length} | ${ece.toFixed(2)} | ${status} |`);
  }

  return lines.join('\n');
}
