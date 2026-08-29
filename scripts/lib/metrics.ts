import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BenchmarkReport, CategoryMetrics, LabeledPair } from '../../src/types.js';

/**
 * Benchmark metrics (Phase 16).
 *
 * Reported per category as well as overall, because an aggregate F1 hides the
 * failure that matters: a model can look excellent overall while being useless
 * on transliterated names.
 */

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptDir, '../..');

export interface ScoredPair extends LabeledPair {
  score: number;
  predicted: 'match' | 'different';
}

export function loadDataset(file = 'datasets/benchmark/pairs.json'): LabeledPair[] {
  const raw = readFileSync(resolve(projectRoot, file), 'utf8');
  const parsed = JSON.parse(raw) as { pairs: LabeledPair[] };
  return parsed.pairs;
}

export function scorePairs(
  pairs: readonly LabeledPair[],
  score: (a: string, b: string) => number,
  threshold: number,
): ScoredPair[] {
  return pairs.map((pair) => {
    const value = score(pair.a, pair.b);
    return {
      ...pair,
      score: value,
      predicted: value >= threshold ? ('match' as const) : ('different' as const),
    };
  });
}

export function metricsFor(category: string, pairs: readonly ScoredPair[]): CategoryMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  for (const pair of pairs) {
    const actualMatch = pair.expected === 'match';
    const predictedMatch = pair.predicted === 'match';
    if (actualMatch && predictedMatch) truePositives++;
    else if (!actualMatch && predictedMatch) falsePositives++;
    else if (!actualMatch && !predictedMatch) trueNegatives++;
    else falseNegatives++;
  }

  const precision = safeDivide(truePositives, truePositives + falsePositives);
  const recall = safeDivide(truePositives, truePositives + falseNegatives);

  return {
    category,
    total: pairs.length,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    accuracy: safeDivide(truePositives + trueNegatives, pairs.length),
    falsePositiveRate: safeDivide(falsePositives, falsePositives + trueNegatives),
    falseNegativeRate: safeDivide(falseNegatives, falseNegatives + truePositives),
  };
}

export function buildReport(scored: readonly ScoredPair[], threshold: number): BenchmarkReport {
  const categories = [...new Set(scored.map((pair) => pair.category))].sort();
  const byCategory = categories.map((category) =>
    metricsFor(
      category,
      scored.filter((pair) => pair.category === category),
    ),
  );

  const sweep = sweepThresholds(scored);

  const worstCases = scored
    .filter((pair) => pair.expected !== pair.predicted)
    .map((pair) => ({
      ...pair,
      kind: (pair.expected === 'different' ? 'fp' : 'fn') as 'fp' | 'fn',
    }))
    .sort((left, right) =>
      left.kind === 'fp' ? right.score - left.score : left.score - right.score,
    );

  return {
    overall: metricsFor('overall', scored),
    byCategory,
    threshold,
    auc: areaUnderRoc(scored),
    bestThreshold: sweep.bestThreshold,
    bestF1: sweep.bestF1,
    worstCases,
  };
}

/** Threshold that maximises F1, found by sweeping every integer score. */
export function sweepThresholds(scored: readonly ScoredPair[]): {
  bestThreshold: number;
  bestF1: number;
} {
  let bestThreshold = 50;
  let bestF1 = -1;

  for (let threshold = 1; threshold <= 100; threshold++) {
    const repredicted = scored.map((pair) => ({
      ...pair,
      predicted: pair.score >= threshold ? ('match' as const) : ('different' as const),
    }));
    const { f1 } = metricsFor('sweep', repredicted);
    if (f1 > bestF1) {
      bestF1 = f1;
      bestThreshold = threshold;
    }
  }

  return { bestThreshold, bestF1 };
}

/**
 * AUC via the rank-sum identity, which handles ties correctly and avoids
 * building an explicit ROC curve.
 */
export function areaUnderRoc(scored: readonly ScoredPair[]): number {
  const positives = scored.filter((pair) => pair.expected === 'match');
  const negatives = scored.filter((pair) => pair.expected === 'different');
  if (positives.length === 0 || negatives.length === 0) return 0.5;

  const ranked = [...scored].sort((left, right) => left.score - right.score);
  const ranks = new Map<ScoredPair, number>();

  let index = 0;
  while (index < ranked.length) {
    let end = index;
    while (end + 1 < ranked.length && ranked[end + 1]!.score === ranked[index]!.score) end++;
    const averageRank = (index + end) / 2 + 1;
    for (let position = index; position <= end; position++) {
      ranks.set(ranked[position]!, averageRank);
    }
    index = end + 1;
  }

  const positiveRankSum = positives.reduce((sum, pair) => sum + (ranks.get(pair) ?? 0), 0);
  return (
    (positiveRankSum - (positives.length * (positives.length + 1)) / 2) /
    (positives.length * negatives.length)
  );
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1).padStart(5)}%`;
}
