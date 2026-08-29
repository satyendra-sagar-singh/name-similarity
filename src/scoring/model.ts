import { FEATURE_KEYS } from '../features/feature-vector.js';
import type { FeatureVector } from '../types.js';
import { TRAINED_MODEL } from './weights.js';

/**
 * Learned scoring model (Phase 14).
 *
 * Logistic regression over the same {@link FeatureVector} the heuristic model
 * consumes. Starting simple is deliberate: a linear model is inspectable, its
 * coefficients can be sanity-checked against domain knowledge, and it gives the
 * benchmark something to beat before anything heavier is justified.
 */

export interface LogisticModel {
  trained: boolean;
  featureKeys: string[];
  coefficients: number[];
  intercept: number;
  trainedAt?: string;
  sampleSize?: number;
  /** Benchmark metrics recorded at training time, for provenance. */
  metrics?: { f1: number; precision: number; recall: number; auc: number };
}

/**
 * Rescale the handful of non-`0..1` features.
 *
 * Logistic regression is not scale-invariant, and a raw token count would
 * otherwise dominate every similarity in the vector.
 */
export function featuresToArray(features: FeatureVector): number[] {
  return FEATURE_KEYS.map((key) => {
    const value = features[key];
    switch (key) {
      case 'tokenCountDifference':
        return Math.min(1, value / 3);
      case 'minTokenCount':
        return Math.min(1, value / 4);
      case 'shortestTokenLength':
        return Math.min(1, value / 8);
      default:
        return value;
    }
  });
}

export function isModelTrained(model: LogisticModel = TRAINED_MODEL): boolean {
  return model.trained && model.coefficients.length === FEATURE_KEYS.length;
}

/**
 * Predicted P(same person) from the trained model.
 *
 * Throws rather than silently falling back: a caller that asked for the trained
 * model should learn that it is unavailable, not receive heuristic numbers
 * labelled as model output.
 */
export function predictProbability(
  features: FeatureVector,
  model: LogisticModel = TRAINED_MODEL,
): number {
  if (!isModelTrained(model)) {
    throw new Error(
      'name-similarity: the logistic model has not been trained. Run `npm run train` or use { model: "heuristic" }.',
    );
  }
  const values = featuresToArray(features);
  let logit = model.intercept;
  for (let index = 0; index < values.length; index++) {
    logit += model.coefficients[index]! * values[index]!;
  }
  return 1 / (1 + Math.exp(-logit));
}

/* -------------------------------------------------------------------------- */
/* Training                                                                   */
/* -------------------------------------------------------------------------- */

export interface TrainingSample {
  features: FeatureVector;
  label: 0 | 1;
}

export interface TrainOptions {
  iterations?: number;
  learningRate?: number;
  /** L2 penalty. Keeps coefficients small on a modestly sized dataset. */
  l2?: number;
  /** Weight applied to negative samples; >1 punishes false positives harder. */
  negativeWeight?: number;
}

/**
 * Batch gradient descent with L2 regularisation.
 *
 * `negativeWeight` exists because the two error types are not symmetric in
 * identity matching: declaring two different people the same is usually the
 * more expensive mistake.
 */
export function trainLogistic(
  samples: readonly TrainingSample[],
  options: TrainOptions = {},
): LogisticModel {
  const iterations = options.iterations ?? 3000;
  const learningRate = options.learningRate ?? 0.6;
  const l2 = options.l2 ?? 0.002;
  const negativeWeight = options.negativeWeight ?? 1.4;

  const rows = samples.map((sample) => featuresToArray(sample.features));
  const labels = samples.map((sample) => sample.label);
  const featureCount = FEATURE_KEYS.length;

  const coefficients = new Array<number>(featureCount).fill(0);
  let intercept = 0;

  const weights = labels.map((label) => (label === 1 ? 1 : negativeWeight));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  for (let step = 0; step < iterations; step++) {
    const gradients = new Array<number>(featureCount).fill(0);
    let interceptGradient = 0;

    for (let row = 0; row < rows.length; row++) {
      const values = rows[row]!;
      let logit = intercept;
      for (let index = 0; index < featureCount; index++) {
        logit += coefficients[index]! * values[index]!;
      }
      const prediction = 1 / (1 + Math.exp(-logit));
      const error = (prediction - labels[row]!) * weights[row]!;

      for (let index = 0; index < featureCount; index++) {
        gradients[index] = gradients[index]! + error * values[index]!;
      }
      interceptGradient += error;
    }

    for (let index = 0; index < featureCount; index++) {
      const gradient = gradients[index]! / totalWeight + l2 * coefficients[index]!;
      coefficients[index] = coefficients[index]! - learningRate * gradient;
    }
    intercept -= (learningRate * interceptGradient) / totalWeight;
  }

  return {
    trained: true,
    featureKeys: [...FEATURE_KEYS],
    coefficients,
    intercept,
    sampleSize: samples.length,
  };
}

export { TRAINED_MODEL };
