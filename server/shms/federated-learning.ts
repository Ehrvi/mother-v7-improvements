/**
 * Federated Learning Module — SHMS (NC-SHMS-006)
 * Base: arXiv:1602.05629 (McMahan et al., FedAvg algorithm)
 */

export interface LocalUpdate {
  clientId: string;
  weights: number[];
  numSamples: number;
  round: number;
}

export interface GlobalModel {
  weights: number[];
  roundNumber: number;
  numClients: number;
}

export class FederatedLearningServer {
  private globalModel: GlobalModel | null = null;
  private pendingUpdates: LocalUpdate[] = [];

  receiveLocalUpdate(update: LocalUpdate): void {
    this.pendingUpdates.push(update);
  }

  aggregateUpdates(): GlobalModel {
    if (this.pendingUpdates.length === 0) {
      const round = this.globalModel ? this.globalModel.roundNumber + 1 : 0;
      this.globalModel = { weights: [], roundNumber: round, numClients: 0 };
      return this.globalModel;
    }

    // FedAvg: weighted average by numSamples
    const totalSamples = this.pendingUpdates.reduce((sum, u) => sum + u.numSamples, 0);
    const weightLen = this.pendingUpdates[0].weights.length;
    const avgWeights = new Array(weightLen).fill(0);

    for (const update of this.pendingUpdates) {
      const scale = update.numSamples / totalSamples;
      for (let i = 0; i < weightLen; i++) {
        avgWeights[i] += (update.weights[i] ?? 0) * scale;
      }
    }

    const roundNumber = this.pendingUpdates[0].round;
    this.globalModel = { weights: avgWeights, roundNumber, numClients: this.pendingUpdates.length };
    this.pendingUpdates = [];
    return this.globalModel;
  }

  getGlobalModel(): GlobalModel | null {
    return this.globalModel;
  }
}

/**
 * Differential Privacy noise via Gaussian mechanism (Abadi et al., arXiv:1607.00133)
 * σ = (sensitivity × √(2 × ln(1.25/δ))) / ε
 */
export function addDifferentialPrivacyNoise(
  weights: number[],
  epsilon: number,
  delta: number,
  sensitivity = 1.0,
): number[] {
  const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
  return weights.map((w) => w + gaussianNoise(0, sigma));
}

function gaussianNoise(mean: number, stddev: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z;
}

export const federatedLearningServer = new FederatedLearningServer();
