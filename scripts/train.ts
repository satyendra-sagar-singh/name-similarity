import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_WEIGHTS,
  FEATURE_KEYS,
  extractFeatures,
  fitCalibration,
  resolveOptions,
  scoreHeuristic,
  toScore,
  trainLogistic,
  type LogisticModel,
  type TrainingSample,
} from '../src/index.js';
import type { FeatureVector, LabeledPair } from '../src/types.js';
import { areaUnderRoc, loadDataset, metricsFor, projectRoot, type ScoredPair } from './lib/metrics.js';

/**
 * Trains the logistic scoring model and fits the probability calibration,
 * then regenerates `src/scoring/weights.ts`.
 *
 * The model is only adopted if it beats the heuristic on *held-out* data. A
 * linear model with 38 features and a few thousand samples can memorise the
 * tuning set easily, and shipping that would be worse than shipping nothing.
 */

interface Prepared {
  pair: LabeledPair;
  features: FeatureVector;
  label: 0 | 1;
  heuristicSimilarity: number;
}

function prepare(pairs: readonly LabeledPair[]): Prepared[] {
  const options = resolveOptions({});
  return pairs.map((pair) => {
    const features = extractFeatures(pair.a, pair.b);
    const heuristic = scoreHeuristic(features, DEFAULT_WEIGHTS, options.conflictSensitivity);
    return {
      pair,
      features,
      label: pair.expected === 'match' ? (1 as const) : (0 as const),
      heuristicSimilarity: heuristic.value,
    };
  });
}

function scoreWith(
  prepared: readonly Prepared[],
  similarityOf: (item: Prepared) => number,
  threshold: number,
): ScoredPair[] {
  return prepared.map((item) => {
    const score = toScore(similarityOf(item));
    return {
      ...item.pair,
      score,
      predicted: score >= threshold ? ('match' as const) : ('different' as const),
    };
  });
}

function report(label: string, scored: ScoredPair[]): { f1: number; auc: number } {
  const metrics = metricsFor(label, scored);
  const auc = areaUnderRoc(scored);
  console.log(
    `  ${label.padEnd(22)} P=${(metrics.precision * 100).toFixed(2)}%  R=${(metrics.recall * 100).toFixed(2)}%  F1=${(metrics.f1 * 100).toFixed(2)}%  AUC=${auc.toFixed(5)}  FP=${metrics.falsePositives} FN=${metrics.falseNegatives}`,
  );
  return { f1: metrics.f1, auc };
}

function main(): void {
  const threshold = 75;

  console.log('Extracting features...');
  const training = prepare(loadDataset('datasets/benchmark/pairs.json'));

  let holdout: Prepared[] = [];
  try {
    holdout = prepare(loadDataset('datasets/benchmark/holdout.json'));
  } catch {
    console.log('No holdout set found. Build one before trusting these numbers.\n');
  }

  console.log(`  ${training.length} training pairs, ${holdout.length} held-out pairs\n`);

  console.log('Heuristic baseline:');
  const heuristicTrain = report('heuristic / training', scoreWith(training, (item) => item.heuristicSimilarity, threshold));
  const heuristicHoldout =
    holdout.length > 0
      ? report('heuristic / holdout', scoreWith(holdout, (item) => item.heuristicSimilarity, threshold))
      : null;

  console.log('\nTraining logistic model...');
  const samples: TrainingSample[] = training.map((item) => ({
    features: item.features,
    label: item.label,
  }));
  const model = trainLogistic(samples, {
    iterations: 6000,
    learningRate: 0.8,
    l2: 0.003,
    negativeWeight: 1.6,
  });

  const predict = (item: Prepared): number => logistic(model, item.features);
  const logisticTrain = report('logistic / training', scoreWith(training, predict, threshold));
  const logisticHoldout =
    holdout.length > 0 ? report('logistic / holdout', scoreWith(holdout, predict, threshold)) : null;

  console.log('\nStrongest coefficients:');
  [...model.coefficients.entries()]
    .map(([index, value]) => ({ key: FEATURE_KEYS[index]!, value }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 12)
    .forEach(({ key, value }) => {
      console.log(`  ${key.padEnd(28)} ${value >= 0 ? '+' : ''}${value.toFixed(4)}`);
    });

  const calibration = fitCalibration(
    training.map((item) => ({ similarity: item.heuristicSimilarity, label: item.label })),
  );
  console.log(
    `\nCalibration: P=0.5 at similarity ${calibration.midpoint.toFixed(4)} (score ${toScore(calibration.midpoint)}), slope ${calibration.slope.toFixed(3)}`,
  );

  const beatsHeuristic =
    holdout.length === 0 ||
    (logisticHoldout !== null &&
      heuristicHoldout !== null &&
      logisticHoldout.f1 >= heuristicHoldout.f1 - 1e-9);

  if (!beatsHeuristic) {
    console.log(
      '\nThe logistic model does NOT beat the heuristic on held-out data. Shipping it disabled;\n' +
        'the heuristic stays the default and `{ model: "logistic" }` will report it is unavailable.',
    );
  }

  writeWeights(beatsHeuristic ? model : { ...model, trained: false }, calibration, {
    heuristicHoldoutF1: heuristicHoldout?.f1 ?? null,
    logisticHoldoutF1: logisticHoldout?.f1 ?? null,
    trainingF1: logisticTrain.f1,
    auc: logisticHoldout?.auc ?? logisticTrain.auc,
  });

  console.log(`\nWrote src/scoring/weights.ts (trained: ${beatsHeuristic}).`);
  void heuristicTrain;
}

function logistic(model: LogisticModel, features: FeatureVector): number {
  const values = FEATURE_KEYS.map((key) => {
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
  let logit = model.intercept;
  for (let index = 0; index < values.length; index++) {
    logit += model.coefficients[index]! * values[index]!;
  }
  return 1 / (1 + Math.exp(-logit));
}

function writeWeights(
  model: LogisticModel,
  calibration: ReturnType<typeof fitCalibration>,
  metrics: {
    heuristicHoldoutF1: number | null;
    logisticHoldoutF1: number | null;
    trainingF1: number;
    auc: number;
  },
): void {
  const source = `import type { LogisticModel } from './model.js';
import type { PlattCalibration } from './calibration.js';

/**
 * GENERATED FILE — produced by \`npm run train\`. Edit the trainer, not this.
 *
 * Held-out F1: heuristic ${format(metrics.heuristicHoldoutF1)}, logistic ${format(metrics.logisticHoldoutF1)}.
 * The logistic model ships enabled only when it matches or beats the heuristic
 * on data it was not fitted to.
 */
export const TRAINED_MODEL: LogisticModel = {
  trained: ${model.trained},
  featureKeys: ${JSON.stringify(model.featureKeys)},
  coefficients: ${JSON.stringify(model.coefficients.map((value) => Number(value.toFixed(6))))},
  intercept: ${Number(model.intercept.toFixed(6))},
  sampleSize: ${model.sampleSize ?? 0},
  metrics: {
    f1: ${Number(metrics.trainingF1.toFixed(6))},
    precision: 0,
    recall: 0,
    auc: ${Number(metrics.auc.toFixed(6))},
  },
};

/**
 * Platt scaling fitted to the heuristic similarity, so \`probability\` reflects
 * the labelled data rather than an assumption that score equals probability.
 */
export const TRAINED_CALIBRATION: PlattCalibration = {
  slope: ${Number(calibration.slope.toFixed(6))},
  intercept: ${Number(calibration.intercept.toFixed(6))},
  midpoint: ${Number(calibration.midpoint.toFixed(6))},
  source: 'fitted',
  sampleSize: ${calibration.sampleSize ?? 0},
};
`;
  writeFileSync(resolve(projectRoot, 'src/scoring/weights.ts'), source, 'utf8');
}

function format(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

main();
