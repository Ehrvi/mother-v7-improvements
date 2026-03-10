/**
 * Neural Extended Kalman Filter — server/mother/shms-neural-ekf.ts
 * MOTHER v98.0 | Ciclo C215 | NC-SHMS-001
 *
 * Neural-augmented Extended Kalman Filter (Neural-EKF) for geotechnical
 * sensor state estimation. Combines classical EKF with neural correction
 * for non-linear soil/structure dynamics.
 *
 * Scientific basis:
 * - Kalman (1960) "A New Approach to Linear Filtering and Prediction Problems"
 *   Trans. ASME J. Basic Eng. 82(1):35-45 — original Kalman filter
 * - Wan & van der Merwe (2000) "The Unscented Kalman Filter for Nonlinear Estimation"
 *   IEEE ASSPCC 2000 — UKF for nonlinear systems
 * - Raissi et al. (2019) "Physics-Informed Neural Networks"
 *   J. Comput. Phys. 378:686-707 — neural + physics hybrid
 * - Solin et al. (2021) "Scalable Inference in SDEs by Direct Matching of the Fokker-Planck-Kolmogorov Equation"
 *   arXiv:2110.09339 — stochastic differential equations for sensor fusion
 * - Fortescue (2024) "SHMS IoT Geotechnical Monitoring" — project domain
 */

export interface EKFState {
  // State vector x = [displacement, velocity, acceleration, temperature_effect]
  displacement: number;   // mm — structural displacement
  velocity: number;       // mm/s — rate of change
  acceleration: number;   // mm/s² — second derivative
  tempEffect: number;     // mm — thermal expansion component
}

export interface EKFCovariance {
  // 4x4 covariance matrix (stored as flat array, row-major)
  P: number[];  // 16 elements
}

export interface EKFMeasurement {
  sensorId: string;
  sensorType: 'inclinometer' | 'piezometer' | 'settlement_gauge' | 'crack_meter' | 'accelerometer';
  value: number;
  unit: string;
  timestamp: Date;
  noiseVariance?: number;   // Measurement noise R (default: sensor-specific)
}

export interface EKFPrediction {
  sensorId: string;
  estimatedState: EKFState;
  predictedValue: number;
  uncertainty: number;        // 1-sigma uncertainty in measurement units
  innovationResidual: number; // y_k - H*x_k (Kalman innovation)
  kalmanGain: number;         // Scalar gain for this measurement
  isAnomaly: boolean;
  anomalyScore: number;       // Mahalanobis distance
  neuralCorrection: number;   // Neural network correction term
  timestamp: Date;
}

// Process noise covariance Q (tuned for geotechnical applications)
const Q_DIAGONAL = [0.01, 0.001, 0.0001, 0.005]; // [disp, vel, acc, temp]

// Measurement noise R by sensor type (mm²)
const R_BY_SENSOR: Record<string, number> = {
  inclinometer: 0.025,       // ±0.5mm typical accuracy
  piezometer: 0.1,           // ±1mm water level
  settlement_gauge: 0.04,    // ±0.4mm
  crack_meter: 0.01,         // ±0.1mm
  accelerometer: 0.001,      // ±0.03mm/s²
};

// State transition matrix F (discrete-time, dt=1s)
function buildStateTransition(dt: number): number[] {
  // F = [[1, dt, dt²/2, 0],
  //      [0,  1,    dt, 0],
  //      [0,  0,     1, 0],
  //      [0,  0,     0, 1]]
  return [
    1, dt, (dt * dt) / 2, 0,
    0,  1,             dt, 0,
    0,  0,              1, 0,
    0,  0,              0, 1,
  ];
}

// Measurement matrix H (maps state to measurement)
function buildMeasurementMatrix(sensorType: string): number[] {
  // H = [1, 0, 0, 1] for displacement sensors (measures disp + temp effect)
  // H = [0, 1, 0, 0] for velocity sensors
  // H = [0, 0, 1, 0] for accelerometers
  switch (sensorType) {
    case 'accelerometer':
      return [0, 0, 1, 0];
    case 'piezometer':
      return [0, 1, 0, 0];
    default:
      return [1, 0, 0, 1]; // displacement + thermal
  }
}

// Matrix multiply 4x4 * 4x4
function matMul4x4(A: number[], B: number[]): number[] {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        C[i * 4 + j] += A[i * 4 + k] * B[k * 4 + j];
      }
    }
  }
  return C;
}

// Matrix-vector multiply 4x4 * 4x1
function matVecMul4(A: number[], v: number[]): number[] {
  return [
    A[0]*v[0] + A[1]*v[1] + A[2]*v[2] + A[3]*v[3],
    A[4]*v[0] + A[5]*v[1] + A[6]*v[2] + A[7]*v[3],
    A[8]*v[0] + A[9]*v[1] + A[10]*v[2] + A[11]*v[3],
    A[12]*v[0] + A[13]*v[1] + A[14]*v[2] + A[15]*v[3],
  ];
}

// Transpose 4x4 matrix
function transpose4x4(A: number[]): number[] {
  const T = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      T[j * 4 + i] = A[i * 4 + j];
    }
  }
  return T;
}

// Add diagonal Q to matrix
function addQ(P: number[]): number[] {
  const result = [...P];
  for (let i = 0; i < 4; i++) {
    result[i * 4 + i] += Q_DIAGONAL[i];
  }
  return result;
}

/**
 * Neural correction network (lightweight 2-layer MLP approximation).
 * Applies a learned bias correction based on recent innovation history.
 * Simulates a trained neural network with fixed weights for geotechnical domain.
 */
function neuralCorrection(
  state: number[],
  innovation: number,
  sensorType: string
): number {
  // Simplified neural correction: tanh activation with domain-tuned weights
  // In production: load actual trained weights from model file
  const w1 = sensorType === 'inclinometer' ? 0.15 : 0.08;
  const w2 = sensorType === 'piezometer' ? 0.12 : 0.06;
  const bias = 0.001;

  // Input features: [displacement, velocity, innovation]
  const h1 = Math.tanh(w1 * state[0] + w2 * state[1] + bias);
  const h2 = Math.tanh(w1 * innovation + bias);
  const correction = 0.05 * (h1 + h2);

  return correction;
}

// Per-sensor EKF state store
const sensorStates = new Map<string, { state: number[]; P: number[]; lastUpdate: Date }>();

/**
 * Run one EKF predict+update cycle for a sensor measurement.
 */
export function runEKFCycle(measurement: EKFMeasurement, dt: number = 1.0): EKFPrediction {
  const sensorId = measurement.sensorId;
  const sensorType = measurement.sensorType;

  // Initialize state if first measurement
  if (!sensorStates.has(sensorId)) {
    sensorStates.set(sensorId, {
      state: [measurement.value, 0, 0, 0],  // [disp, vel, acc, temp]
      P: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
      lastUpdate: measurement.timestamp,
    });
  }

  const stored = sensorStates.get(sensorId)!;
  const x = [...stored.state];
  const P = [...stored.P];

  // ── PREDICT STEP ──────────────────────────────────────────────────────────
  const F = buildStateTransition(dt);
  const xPred = matVecMul4(F, x);
  const FT = transpose4x4(F);
  const FP = matMul4x4(F, P);
  const FPFT = matMul4x4(FP, FT);
  const PPred = addQ(FPFT);

  // ── UPDATE STEP ───────────────────────────────────────────────────────────
  const H = buildMeasurementMatrix(sensorType);
  const R = measurement.noiseVariance ?? R_BY_SENSOR[sensorType] ?? 0.1;

  // Innovation: y = z - H*x_pred
  const zPred = H[0]*xPred[0] + H[1]*xPred[1] + H[2]*xPred[2] + H[3]*xPred[3];
  const innovation = measurement.value - zPred;

  // Innovation covariance: S = H*P*H^T + R
  const HP = [
    H[0]*PPred[0] + H[1]*PPred[4] + H[2]*PPred[8] + H[3]*PPred[12],
    H[0]*PPred[1] + H[1]*PPred[5] + H[2]*PPred[9] + H[3]*PPred[13],
    H[0]*PPred[2] + H[1]*PPred[6] + H[2]*PPred[10] + H[3]*PPred[14],
    H[0]*PPred[3] + H[1]*PPred[7] + H[2]*PPred[11] + H[3]*PPred[15],
  ];
  const S = HP[0]*H[0] + HP[1]*H[1] + HP[2]*H[2] + HP[3]*H[3] + R;

  // Kalman gain: K = P*H^T / S
  const PHT = [
    PPred[0]*H[0] + PPred[1]*H[1] + PPred[2]*H[2] + PPred[3]*H[3],
    PPred[4]*H[0] + PPred[5]*H[1] + PPred[6]*H[2] + PPred[7]*H[3],
    PPred[8]*H[0] + PPred[9]*H[1] + PPred[10]*H[2] + PPred[11]*H[3],
    PPred[12]*H[0] + PPred[13]*H[1] + PPred[14]*H[2] + PPred[15]*H[3],
  ];
  const K = PHT.map(k => k / S);

  // Neural correction
  const nc = neuralCorrection(xPred, innovation, sensorType);

  // State update: x = x_pred + K*(y + neural_correction)
  const xNew = xPred.map((xi, i) => xi + K[i] * (innovation + nc));

  // Covariance update: P = (I - K*H)*P_pred
  const KH = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      KH[i * 4 + j] = K[i] * H[j];
    }
  }
  const IminusKH = KH.map((v, idx) => (idx % 5 === 0 ? 1 - v : -v)); // I - KH
  const PNew = matMul4x4(IminusKH, PPred);

  // Store updated state
  sensorStates.set(sensorId, { state: xNew, P: PNew, lastUpdate: measurement.timestamp });

  // Anomaly detection: Mahalanobis distance
  const mahalanobis = Math.abs(innovation) / Math.sqrt(Math.max(S, 0.001));
  const isAnomaly = mahalanobis > 3.0;  // 3-sigma threshold

  // Uncertainty: sqrt of measurement variance in updated state
  const uncertainty = Math.sqrt(Math.max(S, 0));

  return {
    sensorId,
    estimatedState: {
      displacement: xNew[0],
      velocity: xNew[1],
      acceleration: xNew[2],
      tempEffect: xNew[3],
    },
    predictedValue: zPred,
    uncertainty,
    innovationResidual: innovation,
    kalmanGain: K[0],  // Primary gain component
    isAnomaly,
    anomalyScore: mahalanobis,
    neuralCorrection: nc,
    timestamp: measurement.timestamp,
  };
}

/**
 * Process batch of sensor readings through Neural-EKF.
 */
export function processBatchEKF(measurements: EKFMeasurement[]): EKFPrediction[] {
  return measurements.map(m => runEKFCycle(m));
}

/**
 * Get current state estimate for a sensor.
 */
export function getSensorStateEstimate(sensorId: string): EKFState | null {
  const stored = sensorStates.get(sensorId);
  if (!stored) return null;
  return {
    displacement: stored.state[0],
    velocity: stored.state[1],
    acceleration: stored.state[2],
    tempEffect: stored.state[3],
  };
}

/**
 * Generate EKF status report for SHMS dashboard.
 */
export function generateEKFReport(predictions: EKFPrediction[]): string {
  const anomalies = predictions.filter(p => p.isAnomaly);
  const lines = [
    `## NC-SHMS-001: Neural-EKF State Estimation Report`,
    `**Sensores processados:** ${predictions.length}`,
    `**Anomalias detectadas:** ${anomalies.length}`,
    '',
  ];

  for (const pred of predictions) {
    const status = pred.isAnomaly ? '🔴 ANOMALIA' : '🟢 NORMAL';
    lines.push(`**${pred.sensorId}** ${status}`);
    lines.push(`  Deslocamento estimado: ${pred.estimatedState.displacement.toFixed(3)} mm`);
    lines.push(`  Incerteza: ±${pred.uncertainty.toFixed(3)} mm`);
    lines.push(`  Resíduo de inovação: ${pred.innovationResidual.toFixed(3)}`);
    lines.push(`  Score Mahalanobis: ${pred.anomalyScore.toFixed(2)}`);
    if (pred.isAnomaly) {
      lines.push(`  ⚠️ ALERTA: Score ${pred.anomalyScore.toFixed(2)} > 3.0 (3-sigma)`);
    }
  }

  return lines.join('\n');
}
