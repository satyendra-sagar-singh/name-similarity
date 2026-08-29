import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { MODE_PRESETS, NameMatcher } from '../src/index.js';
import type { MatchMode } from '../src/types.js';
import { buildReport, formatPercent, loadDataset, projectRoot, scorePairs } from './lib/metrics.js';

/**
 * Cross-dataset, cross-mode validation.
 *
 * Reports the tuned set next to a held-out set generated from a different seed.
 * A gap between the two is the signal that a change was fitted to the data
 * rather than to the problem.
 */

const DATASETS: Array<{ label: string; file: string }> = [
  { label: 'tuned', file: 'datasets/benchmark/pairs.json' },
  { label: 'curated', file: 'datasets/development/curated.json' },
  { label: 'holdout', file: 'datasets/benchmark/holdout.json' },
  { label: 'english', file: 'datasets/benchmark/english.json' },
  { label: 'indian', file: 'datasets/benchmark/indian.json' },
];

const MODES: MatchMode[] = ['strict', 'balanced', 'fuzzy'];

function main(): void {
  const header =
    'dataset'.padEnd(10) +
    'mode'.padEnd(10) +
    'n'.padStart(6) +
    'prec'.padStart(9) +
    'recall'.padStart(9) +
    'F1'.padStart(9) +
    'AUC'.padStart(9) +
    'FP'.padStart(5) +
    'FN'.padStart(5);

  console.log('');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const { label, file } of DATASETS) {
    if (!existsSync(resolve(projectRoot, file))) {
      console.log(`${label.padEnd(10)}(missing: ${file})`);
      continue;
    }
    const pairs = loadDataset(file);

    for (const mode of MODES) {
      const threshold = MODE_PRESETS[mode].threshold;
      const matcher = new NameMatcher({ mode });
      const scored = scorePairs(pairs, (a, b) => matcher.score(a, b), threshold);
      const report = buildReport(scored, threshold);

      console.log(
        label.padEnd(10) +
          mode.padEnd(10) +
          String(pairs.length).padStart(6) +
          formatPercent(report.overall.precision).padStart(9) +
          formatPercent(report.overall.recall).padStart(9) +
          formatPercent(report.overall.f1).padStart(9) +
          report.auc.toFixed(4).padStart(9) +
          String(report.overall.falsePositives).padStart(5) +
          String(report.overall.falseNegatives).padStart(5),
      );
    }
    console.log('-'.repeat(header.length));
  }
  console.log('');
}

main();
