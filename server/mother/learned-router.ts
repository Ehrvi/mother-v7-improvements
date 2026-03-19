/**
 * MOTHER — Learned Router (RouteLLM-style ML Classifier)
 * P2 Upgrade: Replace heuristic pattern matching with ML-based routing
 *
 * Scientific basis:
 * - RouteLLM (Ong et al., arXiv:2406.18665, 2024) — learned routing with preference data
 * - FrugalGPT (Chen et al., arXiv:2305.05176, 2023) — cost-optimal LLM cascade
 * - Matrix Factorization (Koren et al., IEEE Computer 2009) — collaborative filtering
 *
 * Architecture:
 * - Trains a lightweight classifier on historical (query, quality_score, tier) tuples
 * - Predicts P(strong_model_needed) for new queries
 * - If P > threshold → route to TIER_3/4, else → TIER_1/2
 * - Falls back to heuristic router when insufficient training data (<100 pairs)
 *
 * Cost impact: -85% LLM cost while maintaining 95% of quality (RouteLLM benchmark)
 */

import { createLogger } from '../_core/logger';

const log = createLogger('LEARNED_ROUTER');

export interface RoutingPair {
  query: string;
  tier: string;
  qualityScore: number;
  provider: string;
  timestamp: number;
}

export interface LearnedPrediction {
  strongModelNeeded: boolean;
  confidence: number;
  suggestedTier: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';
  source: 'learned' | 'heuristic';
  features: FeatureVector;
}

interface FeatureVector {
  queryLength: number;
  wordCount: number;
  avgWordLength: number;
  questionMarkCount: number;
  hasCode: boolean;
  hasMath: boolean;
  hasResearch: boolean;
  hasSystemDesign: boolean;
  hasCreative: boolean;
  complexityKeywordDensity: number;
  sentenceCount: number;
}

// ============================================================
// FEATURE EXTRACTION
// ============================================================

const COMPLEXITY_KEYWORDS = new Set([
  'implement', 'architecture', 'design', 'optimize', 'algorithm',
  'distributed', 'concurrent', 'parallel', 'asynchronous', 'microservice',
  'benchmark', 'performance', 'scalable', 'production', 'deploy',
  'research', 'paper', 'arxiv', 'scientific', 'methodology',
  'prove', 'theorem', 'calculate', 'integral', 'derivative',
  'implementar', 'arquitetura', 'projetar', 'otimizar', 'algoritmo',
  'pesquisa', 'artigo', 'cientifico', 'metodologia', 'calcular',
]);

function extractFeatures(query: string): FeatureVector {
  const q = query.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = q.split(/\s+/).filter(w => w.length > 0);
  const sentences = q.split(/[.!?]+/).filter(s => s.trim().length > 0);

  let complexityKeywords = 0;
  for (const word of words) {
    if (COMPLEXITY_KEYWORDS.has(word)) complexityKeywords++;
  }

  return {
    queryLength: query.length,
    wordCount: words.length,
    avgWordLength: words.length > 0 ? words.reduce((s, w) => s + w.length, 0) / words.length : 0,
    questionMarkCount: (query.match(/\?/g) || []).length,
    hasCode: /\b(code|implement|function|class|typescript|python|api|sql|programar|codificar)\b/.test(q),
    hasMath: /\b(equation|calculate|prove|integral|matrix|statistics|equacao|calcular)\b/.test(q),
    hasResearch: /\b(research|arxiv|paper|study|scientific|pesquisa|artigo|cientifico)\b/.test(q),
    hasSystemDesign: /\b(architecture|system|infrastructure|microservice|arquitetura|sistema)\b/.test(q),
    hasCreative: /\b(write|create|story|essay|blog|escrever|gerar|historia)\b/.test(q),
    complexityKeywordDensity: words.length > 0 ? complexityKeywords / words.length : 0,
    sentenceCount: sentences.length,
  };
}

// ============================================================
// LIGHTWEIGHT ML CLASSIFIER (Logistic Regression on features)
// ============================================================

interface ModelWeights {
  weights: number[];
  bias: number;
  trainedAt: number;
  trainingSize: number;
  accuracy: number;
}

let modelWeights: ModelWeights | null = null;
const trainingData: RoutingPair[] = [];
const MAX_TRAINING_DATA = 5000;
const MIN_TRAINING_DATA = 100;
const RETRAIN_INTERVAL_MS = 3600000; // 1 hour
let lastTrainTime = 0;

function featureToVector(f: FeatureVector): number[] {
  return [
    Math.log1p(f.queryLength) / 10,  // normalized
    Math.log1p(f.wordCount) / 8,
    f.avgWordLength / 15,
    Math.min(f.questionMarkCount, 3) / 3,
    f.hasCode ? 1 : 0,
    f.hasMath ? 1 : 0,
    f.hasResearch ? 1 : 0,
    f.hasSystemDesign ? 1 : 0,
    f.hasCreative ? 1 : 0,
    Math.min(f.complexityKeywordDensity * 10, 1),
    Math.min(f.sentenceCount, 10) / 10,
  ];
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function predictStrong(features: FeatureVector): number {
  if (!modelWeights) return 0.5; // uncertain
  const vec = featureToVector(features);
  let logit = modelWeights.bias;
  for (let i = 0; i < vec.length; i++) {
    logit += vec[i] * (modelWeights.weights[i] || 0);
  }
  return sigmoid(logit);
}

/**
 * Train the logistic regression classifier on collected routing pairs.
 * Scientific basis: SGD on binary cross-entropy (Bishop, PRML 2006)
 *
 * Label: 1 if quality was high with strong model (TIER_3/4), 0 otherwise
 * Features: extracted from query text
 */
function trainClassifier(): void {
  if (trainingData.length < MIN_TRAINING_DATA) {
    log.info(`[LearnedRouter] Insufficient training data: ${trainingData.length}/${MIN_TRAINING_DATA}`);
    return;
  }

  const numFeatures = 11;
  const weights = new Array(numFeatures).fill(0);
  let bias = 0;
  const learningRate = 0.01;
  const epochs = 50;

  // Prepare training pairs
  const pairs = trainingData.map(d => {
    const features = extractFeatures(d.query);
    const vec = featureToVector(features);
    // Label: was TIER_3/4 AND quality was good (≥80)?
    const isStrongTier = d.tier === 'TIER_3' || d.tier === 'TIER_4';
    const label = isStrongTier && d.qualityScore >= 80 ? 1 : 0;
    return { vec, label };
  });

  // SGD training
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Shuffle
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }

    for (const { vec, label } of pairs) {
      let logit = bias;
      for (let i = 0; i < numFeatures; i++) {
        logit += vec[i] * weights[i];
      }
      const pred = sigmoid(logit);
      const error = pred - label;

      // Gradient descent
      for (let i = 0; i < numFeatures; i++) {
        weights[i] -= learningRate * error * vec[i];
      }
      bias -= learningRate * error;
    }
  }

  // Compute accuracy
  let correct = 0;
  for (const { vec, label } of pairs) {
    let logit = bias;
    for (let i = 0; i < numFeatures; i++) {
      logit += vec[i] * weights[i];
    }
    const pred = sigmoid(logit) >= 0.5 ? 1 : 0;
    if (pred === label) correct++;
  }

  const accuracy = correct / pairs.length;
  modelWeights = { weights, bias, trainedAt: Date.now(), trainingSize: pairs.length, accuracy };
  lastTrainTime = Date.now();

  log.info(`[LearnedRouter] Trained on ${pairs.length} samples. Accuracy: ${(accuracy * 100).toFixed(1)}%. Weights: [${weights.map(w => w.toFixed(3)).join(', ')}]`);

  // B-FIX: Persist trained weights to DB for cross-restart durability
  // Scientific basis: EvoRoute (arXiv:2601.02695, 2026) — persisted routing weights survive restarts
  (async () => {
    try {
      const { getDb } = await import('../db');
      const { learningPatterns } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (db) {
        // Upsert: update existing or insert new
        const existing = await db.select().from(learningPatterns)
          .where(eq(learningPatterns.patternType, 'learned_router_weights'))
          .limit(1);
        const patternData = JSON.stringify(modelWeights);
        if (existing.length > 0) {
          await db.update(learningPatterns)
            .set({ pattern: patternData, successRate: accuracy.toFixed(4), updatedAt: new Date() })
            .where(eq(learningPatterns.patternType, 'learned_router_weights'));
        } else {
          await db.insert(learningPatterns).values({
            patternType: 'learned_router_weights',
            pattern: patternData,
            successRate: accuracy.toFixed(4),
            confidence: accuracy.toFixed(4),
            isActive: 1,
          });
        }
        log.info(`[LearnedRouter] Weights persisted to DB (accuracy=${(accuracy * 100).toFixed(1)}%)`);
      }
    } catch {
      // Non-critical: in-memory weights still active
    }
  })();
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Record a routing outcome for future training.
 */
export function recordRoutingOutcome(pair: RoutingPair): void {
  trainingData.push(pair);
  if (trainingData.length > MAX_TRAINING_DATA) {
    trainingData.splice(0, trainingData.length - MAX_TRAINING_DATA);
  }

  // Auto-retrain periodically
  if (Date.now() - lastTrainTime > RETRAIN_INTERVAL_MS && trainingData.length >= MIN_TRAINING_DATA) {
    try { trainClassifier(); } catch (e) { /* non-blocking */ }
  }
}

/**
 * Predict routing tier using learned classifier.
 * Returns null if insufficient training data (falls back to heuristic).
 *
 * Scientific basis: RouteLLM (Ong et al., 2024)
 * - threshold=0.5: balanced (default)
 * - threshold=0.3: prefer strong models (quality-first)
 * - threshold=0.7: prefer weak models (cost-first)
 */
export function predictRouting(
  query: string,
  threshold = 0.5,
): LearnedPrediction | null {
  const features = extractFeatures(query);

  // Check if model is trained
  if (!modelWeights || modelWeights.trainingSize < MIN_TRAINING_DATA) {
    return null; // Fall back to heuristic
  }

  const pStrong = predictStrong(features);
  const strongModelNeeded = pStrong >= threshold;

  let suggestedTier: LearnedPrediction['suggestedTier'];
  if (pStrong >= 0.8) suggestedTier = 'TIER_4';
  else if (pStrong >= threshold) suggestedTier = 'TIER_3';
  else if (pStrong >= 0.3) suggestedTier = 'TIER_2';
  else suggestedTier = 'TIER_1';

  return {
    strongModelNeeded,
    confidence: Math.abs(pStrong - 0.5) * 2, // 0-1, higher = more certain
    suggestedTier,
    source: 'learned',
    features,
  };
}

/**
 * Force retrain the classifier (useful after bulk data import).
 */
export function forceRetrain(): { accuracy: number; trainingSize: number } | null {
  if (trainingData.length < MIN_TRAINING_DATA) return null;
  trainClassifier();
  return modelWeights ? { accuracy: modelWeights.accuracy, trainingSize: modelWeights.trainingSize } : null;
}

/**
 * Get classifier stats for observability.
 */
export function getLearnedRouterStats() {
  return {
    trainingDataSize: trainingData.length,
    minRequired: MIN_TRAINING_DATA,
    modelTrained: modelWeights !== null,
    accuracy: modelWeights?.accuracy || 0,
    lastTrainTime: modelWeights?.trainedAt ? new Date(modelWeights.trainedAt).toISOString() : null,
    trainingSize: modelWeights?.trainingSize || 0,
  };
}

// B-FIX: Restore persisted weights on module load (non-blocking)
// Scientific basis: EvoRoute (arXiv:2601.02695, 2026) — warm-start from persisted state
(async () => {
  try {
    const { getDb } = await import('../db');
    const { learningPatterns } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(learningPatterns)
        .where(eq(learningPatterns.patternType, 'learned_router_weights'))
        .limit(1);
      if (rows.length > 0 && rows[0].pattern) {
        const restored = JSON.parse(rows[0].pattern) as ModelWeights;
        if (restored.weights && restored.trainingSize >= MIN_TRAINING_DATA) {
          modelWeights = restored;
          lastTrainTime = restored.trainedAt;
          log.info(`[LearnedRouter] Restored weights from DB (accuracy=${(restored.accuracy * 100).toFixed(1)}%, n=${restored.trainingSize})`);
        }
      }
    }
  } catch {
    // Non-critical: will retrain from scratch if DB unavailable
  }
})();
