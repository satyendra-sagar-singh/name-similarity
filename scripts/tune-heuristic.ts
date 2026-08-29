import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_WEIGHTS, MODE_PRESETS, NameMatcher } from '../src/index.js';
import type { HeuristicWeights, LabeledPair, MatchMode } from '../src/types.js';
import {
  areaUnderRoc,
  loadDataset,
  metricsFor,
  projectRoot,
  scorePairs,
} from './lib/metrics.js';

/**
 * Weight tuning by coordinate ascent.
 *
 * The objective is the mean F1 across all three presets, tie-broken by AUC.
 * Optimising a single threshold is misleading once F1 saturates there: the
 * model can still be improving in how well it *separates* the classes, which
 * is what strict and fuzzy callers actually feel.
 *
 * Every candidate is scored on the tuning set and reported against the held-out
 * set, so a weight change that only helps the data it was fitted to is visible.
 */

const WEIGHT_KEYS: Array<keyof HeuristicWeights> = [
  'firstName',
  'lastName',
  'middleName',
  'token',
  'edit',
  'phonetic',
  'initials',
  'abbreviation',
  'order',
  'alias',
];

const MULTIPLIERS = [0.5, 0.7, 0.85, 1, 1.2, 1.5, 2];
const MODES: MatchMode[] = ['strict', 'balanced', 'fuzzy'];

interface Objective {
  meanF1: number;
  auc: number;
  perMode: Record<MatchMode, number>;
}

function evaluateWeights(pairs: readonly LabeledPair[], weights: HeuristicWeights): Objective {
  const perMode = {} as Record<MatchMode, number>;
  let total = 0;
  let auc = 0;

  for (const mode of MODES) {
    const threshold = MODE_PRESETS[mode].threshold;
    const matcher = new NameMatcher({ mode, weights, threshold });
    const scored = scorePairs(pairs, (a, b) => matcher.score(a, b), threshold);
    const f1 = metricsFor(mode, scored).f1;
    perMode[mode] = f1;
    total += f1;
    if (mode === 'balanced') auc = areaUnderRoc(scored);
  }

  return { meanF1: total / MODES.length, auc, perMode };
}

/** Strictly better on mean F1, or equal on F1 and better on AUC. */
function isBetter(candidate: Objective, incumbent: Objective): boolean {
  const epsilon = 1e-9;
  if (candidate.meanF1 > incumbent.meanF1 + epsilon) return true;
  if (candidate.meanF1 < incumbent.meanF1 - epsilon) return false;
  return candidate.auc > incumbent.auc + epsilon;
}

function main(): void {
  const rounds = Number(process.env.TUNE_ROUNDS ?? 3);
  const tuning = loadDataset('datasets/benchmark/pairs.json');
  let holdout: LabeledPair[] = [];
  try {
    holdout = loadDataset('datasets/benchmark/holdout.json');
  } catch {
    console.log('No holdout set found; run `npm run dataset:build -- --seed 777001 --out datasets/benchmark/holdout.json --no-curated` first.\n');
  }

  let best: HeuristicWeights = { ...DEFAULT_WEIGHTS };
  let bestObjective = evaluateWeights(tuning, best);

  console.log(`Baseline  meanF1=${bestObjective.meanF1.toFixed(5)}  AUC=${bestObjective.auc.toFixed(5)}`);
  console.log(`  per mode: ${MODES.map((mode) => `${mode}=${bestObjective.perMode[mode].toFixed(4)}`).join('  ')}\n`);

  for (let round = 1; round <= rounds; round++) {
    let improvedThisRound = false;

    for (const key of WEIGHT_KEYS) {
      for (const multiplier of MULTIPLIERS) {
        if (multiplier === 1) continue;
        const candidate: HeuristicWeights = { ...best, [key]: best[key] * multiplier };
        const objective = evaluateWeights(tuning, candidate);
        if (!isBetter(objective, bestObjective)) continue;

        console.log(
          `round ${round}  ${key} x${multiplier}  ->  meanF1=${objective.meanF1.toFixed(5)}  AUC=${objective.auc.toFixed(5)}`,
        );
        best = candidate;
        bestObjective = objective;
        improvedThisRound = true;
      }
    }

    if (!improvedThisRound) {
      console.log(`round ${round}: no improvement, stopping early\n`);
      break;
    }
  }

  console.log('\nTuned weights:');
  for (const key of WEIGHT_KEYS) {
    console.log(`  ${key.padEnd(14)} ${best[key].toFixed(4)}  (was ${DEFAULT_WEIGHTS[key].toFixed(4)})`);
  }

  console.log(`\nTuning set   meanF1=${bestObjective.meanF1.toFixed(5)}  AUC=${bestObjective.auc.toFixed(5)}`);
  if (holdout.length > 0) {
    const baselineHoldout = evaluateWeights(holdout, DEFAULT_WEIGHTS);
    const tunedHoldout = evaluateWeights(holdout, best);
    console.log(`Holdout base meanF1=${baselineHoldout.meanF1.toFixed(5)}  AUC=${baselineHoldout.auc.toFixed(5)}`);
    console.log(`Holdout tuned meanF1=${tunedHoldout.meanF1.toFixed(5)}  AUC=${tunedHoldout.auc.toFixed(5)}`);

    if (tunedHoldout.meanF1 < baselineHoldout.meanF1) {
      console.log('\nWARNING: the tuned weights are worse on held-out data. Do not adopt them.');
    }
  }

  const outputPath = resolve(projectRoot, 'datasets/benchmark/tuned-weights.json');
  writeFileSync(outputPath, `${JSON.stringify(best, null, 2)}\n`, 'utf8');
  console.log(`\nWritten to datasets/benchmark/tuned-weights.json`);
  console.log('Adopt by editing DEFAULT_WEIGHTS in src/scoring/heuristic.ts, only if the holdout agrees.');
}

main();
