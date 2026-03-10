/**
 * NC-SHMS-006: Federated Learning SHMS — Multi-Site Model Aggregation
 *
 * Conselho dos 6 — PHASE 4 C219 — arXiv:1811.11400
 * Base científica:
 * - McMahan et al. (2017) "Communication-Efficient Learning of Deep Networks
 *   from Decentralized Data" — FedAvg algorithm
 *   arXiv:1602.05629 (original FedAvg)
 * - Li et al. (2020) "Federated Learning: Challenges, Methods, and Future Directions"
 *   arXiv:1908.07873
 * - arXiv:1811.11400: Privacy-preserving federated learning for SHMS
 *
 * Arquitetura:
 * - Servidor Central: Agrega gradientes de múltiplos sites SHMS
 * - Clientes (Sites): Treinam localmente, enviam apenas gradientes (não dados brutos)
 * - Privacidade: Differential Privacy (ε-DP) opcional
 * - Protocolo: FedAvg com pesos proporcionais ao número de amostras locais
 *
 * FedAvg: w_global = Σ (n_k / n_total) × w_k
 * onde n_k = amostras locais do site k, w_k = pesos locais do site k
 */

import { getPool } from '../db.js';

// ============================================================
// INTERFACES
// ============================================================

export interface ModelWeights {
  layerName: string;
  weights: number[][];
  biases: number[];
  shape: number[];
}

export interface LocalModelUpdate {
  siteId: string;
  modelVersion: string;
  localSamples: number;
  gradients: ModelWeights[];
  trainingLoss: number;
  validationLoss: number;
  trainingEpochs: number;
  timestamp: Date;
  // Differential Privacy metadata
  dpEpsilon?: number;
  dpDelta?: number;
  noiseScale?: number;
}

export interface GlobalModelState {
  version: string;
  weights: ModelWeights[];
  aggregatedFrom: string[];
  totalSamples: number;
  globalLoss: number;
  roundNumber: number;
  createdAt: Date;
  convergenceMetric: number;
}

export interface FederatedRound {
  roundId: string;
  roundNumber: number;
  participatingSites: string[];
  startedAt: Date;
  completedAt?: Date;
  status: 'collecting' | 'aggregating' | 'distributing' | 'completed' | 'failed';
  globalLoss?: number;
  convergenceMetric?: number;
}

// ============================================================
// DIFFERENTIAL PRIVACY (Gaussian Mechanism)
// ============================================================

/**
 * Add Gaussian noise for ε-DP (Differential Privacy)
 * σ = (sensitivity × √(2 × ln(1.25/δ))) / ε
 * arXiv:1607.00133: Deep Learning with Differential Privacy
 */
function addGaussianNoise(value: number, epsilon: number, delta: number, sensitivity: number): number {
  const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
  // Box-Muller transform for Gaussian noise
  const u1 = Math.random();
  const u2 = Math.random();
  const noise = sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return value + noise;
}

function applyDPToGradients(
  weights: ModelWeights[],
  epsilon: number,
  delta: number,
  sensitivity = 1.0,
): ModelWeights[] {
  return weights.map((layer) => ({
    ...layer,
    weights: layer.weights.map((row) =>
      row.map((w) => addGaussianNoise(w, epsilon, delta, sensitivity)),
    ),
    biases: layer.biases.map((b) => addGaussianNoise(b, epsilon, delta, sensitivity)),
  }));
}

// ============================================================
// FEDAVG AGGREGATION
// ============================================================

/**
 * FedAvg: Weighted average of model weights
 * w_global = Σ (n_k / n_total) × w_k
 * McMahan et al. (2017) arXiv:1602.05629
 */
function fedAvgAggregate(updates: LocalModelUpdate[]): ModelWeights[] {
  if (updates.length === 0) throw new Error('No updates to aggregate');

  const totalSamples = updates.reduce((sum, u) => sum + u.localSamples, 0);
  const weights = updates.map((u) => u.localSamples / totalSamples);

  // Initialize global weights from first update structure
  const globalWeights: ModelWeights[] = updates[0].gradients.map((layer) => ({
    layerName: layer.layerName,
    shape: layer.shape,
    weights: layer.weights.map((row) => row.map(() => 0)),
    biases: layer.biases.map(() => 0),
  }));

  // Weighted sum
  for (let i = 0; i < updates.length; i++) {
    const w = weights[i];
    const update = updates[i];

    for (let l = 0; l < update.gradients.length; l++) {
      const layer = update.gradients[l];
      const globalLayer = globalWeights[l];

      if (!globalLayer) continue;

      // Add weighted contribution to each weight
      for (let r = 0; r < layer.weights.length; r++) {
        for (let c = 0; c < (layer.weights[r]?.length ?? 0); c++) {
          if (globalLayer.weights[r] !== undefined && layer.weights[r] !== undefined) {
            globalLayer.weights[r]![c] = (globalLayer.weights[r]![c] ?? 0) + w * (layer.weights[r]![c] ?? 0);
          }
        }
      }

      // Add weighted contribution to each bias
      for (let b = 0; b < layer.biases.length; b++) {
        globalLayer.biases[b] = (globalLayer.biases[b] ?? 0) + w * (layer.biases[b] ?? 0);
      }
    }
  }

  return globalWeights;
}

/**
 * Compute convergence metric (L2 norm of weight change)
 */
function computeConvergence(prevWeights: ModelWeights[], newWeights: ModelWeights[]): number {
  let sumSquared = 0;
  let count = 0;

  for (let l = 0; l < Math.min(prevWeights.length, newWeights.length); l++) {
    const prev = prevWeights[l];
    const next = newWeights[l];
    if (!prev || !next) continue;

    for (let r = 0; r < prev.weights.length; r++) {
      for (let c = 0; c < (prev.weights[r]?.length ?? 0); c++) {
        const diff = (next.weights[r]?.[c] ?? 0) - (prev.weights[r]?.[c] ?? 0);
        sumSquared += diff * diff;
        count++;
      }
    }
  }

  return count > 0 ? Math.sqrt(sumSquared / count) : 0;
}

// ============================================================
// FEDERATED LEARNING SERVER
// ============================================================

export class FederatedLearningServer {
  private currentGlobalModel: GlobalModelState | null = null;
  private pendingUpdates: Map<string, LocalModelUpdate> = new Map();
  private currentRound: FederatedRound | null = null;
  private roundNumber = 0;
  private readonly MIN_SITES_FOR_AGGREGATION = 2;
  private readonly CONVERGENCE_THRESHOLD = 0.001;

  /**
   * Register a new federated site
   */
  async registerSite(siteId: string, siteName: string, siteUrl?: string): Promise<void> {
    try {
      const pool = getPool();
      if (!pool) return;
      await pool.query(
        `INSERT INTO shms_federated_sites (id, site_name, site_url, status, created_at)
         VALUES (?, ?, ?, 'active', NOW())
         ON DUPLICATE KEY UPDATE site_name = VALUES(site_name), site_url = VALUES(site_url), status = 'active'`,
        [siteId, siteName, siteUrl ?? null],
      );
      console.log(`[FL-SERVER] Site registered: ${siteId} (${siteName})`);
    } catch (err) {
      console.error('[FL-SERVER] Failed to register site:', err);
    }
  }

  /**
   * Receive local model update from a site
   * Sites send gradients (not raw data) for privacy preservation
   */
  async receiveLocalUpdate(update: LocalModelUpdate): Promise<{
    accepted: boolean;
    roundId: string;
    message: string;
  }> {
    // Apply Differential Privacy if configured
    if (update.dpEpsilon && update.dpDelta) {
      update.gradients = applyDPToGradients(
        update.gradients,
        update.dpEpsilon,
        update.dpDelta,
        update.noiseScale ?? 1.0,
      );
    }

    this.pendingUpdates.set(update.siteId, update);

    // Update site metadata in DB
    try {
      const pool = getPool();
      if (!pool) throw new Error('DB not available');
      await pool.query(
        `UPDATE shms_federated_sites
         SET last_sync_at = NOW(), local_samples = ?, model_version = ?, status = 'active'
         WHERE id = ?`,
        [update.localSamples, update.modelVersion, update.siteId],
      );
    } catch {
      // Non-critical
    }

    const roundId = this.currentRound?.roundId ?? `round-${this.roundNumber}`;
    console.log(`[FL-SERVER] Received update from site ${update.siteId}. Pending: ${this.pendingUpdates.size}`);

    // Check if we have enough updates to aggregate
    if (this.pendingUpdates.size >= this.MIN_SITES_FOR_AGGREGATION) {
      await this.aggregateAndUpdateGlobalModel();
    }

    return {
      accepted: true,
      roundId,
      message: `Update accepted. ${this.pendingUpdates.size}/${this.MIN_SITES_FOR_AGGREGATION} sites ready for aggregation.`,
    };
  }

  /**
   * Aggregate local updates using FedAvg
   * McMahan et al. (2017): Communication-Efficient Learning
   */
  private async aggregateAndUpdateGlobalModel(): Promise<void> {
    const updates = Array.from(this.pendingUpdates.values());
    if (updates.length < this.MIN_SITES_FOR_AGGREGATION) return;

    console.log(`[FL-SERVER] Aggregating ${updates.length} updates using FedAvg...`);

    try {
      const prevWeights = this.currentGlobalModel?.weights ?? [];
      const newWeights = fedAvgAggregate(updates);

      const convergence = prevWeights.length > 0
        ? computeConvergence(prevWeights, newWeights)
        : 1.0;

      const totalSamples = updates.reduce((sum, u) => sum + u.localSamples, 0);
      const globalLoss = updates.reduce((sum, u) => sum + u.validationLoss * (u.localSamples / totalSamples), 0);

      this.roundNumber++;
      this.currentGlobalModel = {
        version: `v${this.roundNumber}.0`,
        weights: newWeights,
        aggregatedFrom: updates.map((u) => u.siteId),
        totalSamples,
        globalLoss,
        roundNumber: this.roundNumber,
        createdAt: new Date(),
        convergenceMetric: convergence,
      };

      // Persist to DB
      await this.persistGlobalModel();

      // Clear pending updates
      this.pendingUpdates.clear();

      const converged = convergence < this.CONVERGENCE_THRESHOLD;
      console.log(`[FL-SERVER] Round ${this.roundNumber} complete. Loss: ${globalLoss.toFixed(4)}, Convergence: ${convergence.toFixed(6)}${converged ? ' ✓ CONVERGED' : ''}`);
    } catch (err) {
      console.error('[FL-SERVER] Aggregation failed:', err);
    }
  }

  /**
   * Get current global model for distribution to sites
   */
  getGlobalModel(): GlobalModelState | null {
    return this.currentGlobalModel;
  }

  /**
   * Get federation statistics
   */
  async getFederationStats(): Promise<{
    totalSites: number;
    activeSites: number;
    currentRound: number;
    globalLoss: number;
    convergenceMetric: number;
    totalSamples: number;
    pendingUpdates: number;
  }> {
    try {
      const pool = getPool();
      if (!pool) throw new Error("DB not available");
      const [rows] = await pool.query<any[]>(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                SUM(local_samples) as total_samples
         FROM shms_federated_sites`,
      );

      const stats = rows[0];
      return {
        totalSites: parseInt(stats?.total ?? '0'),
        activeSites: parseInt(stats?.active ?? '0'),
        currentRound: this.roundNumber,
        globalLoss: this.currentGlobalModel?.globalLoss ?? 0,
        convergenceMetric: this.currentGlobalModel?.convergenceMetric ?? 1.0,
        totalSamples: parseInt(stats?.total_samples ?? '0'),
        pendingUpdates: this.pendingUpdates.size,
      };
    } catch {
      return {
        totalSites: 0,
        activeSites: 0,
        currentRound: this.roundNumber,
        globalLoss: 0,
        convergenceMetric: 1.0,
        totalSamples: 0,
        pendingUpdates: this.pendingUpdates.size,
      };
    }
  }

  private async persistGlobalModel(): Promise<void> {
    if (!this.currentGlobalModel) return;
    try {
      const pool = getPool();
      if (!pool) return;
      await pool.query(
        `INSERT INTO shms_global_models
          (version, round_number, global_loss, convergence_metric, total_samples,
           aggregated_from, weights_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           global_loss = VALUES(global_loss),
           convergence_metric = VALUES(convergence_metric),
           total_samples = VALUES(total_samples),
           weights_json = VALUES(weights_json)`,
        [
          this.currentGlobalModel.version,
          this.currentGlobalModel.roundNumber,
          this.currentGlobalModel.globalLoss,
          this.currentGlobalModel.convergenceMetric,
          this.currentGlobalModel.totalSamples,
          JSON.stringify(this.currentGlobalModel.aggregatedFrom),
          JSON.stringify(this.currentGlobalModel.weights),
        ],
      ).catch(() => {
        // Table may not exist yet — non-critical
      });
    } catch {
      // Non-critical
    }
  }
}

export const federatedLearningServer = new FederatedLearningServer();
