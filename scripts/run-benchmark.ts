import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MODE_PRESETS, NameMatcher } from '../src/index.js';
import type { MatchMode } from '../src/types.js';
import {
  buildReport,
  formatPercent,
  loadDataset,
  projectRoot,
  scorePairs,
} from './lib/metrics.js';

/**
 * Benchmark runner.
 *
 * ```
 * npm run bench -- --mode strict
 * npm run bench -- --threshold 80 --model logistic
 * npm run bench -- --curated
 * ```
 */

interface Cli {
  mode: MatchMode;
  threshold: number | null;
  model: 'heuristic' | 'logistic';
  curatedOnly: boolean;
  showWorst: number;
  json: string | null;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    mode: 'balanced',
    threshold: null,
    model: 'heuristic',
    curatedOnly: false,
    showWorst: 15,
    json: null,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--mode' && next) cli.mode = next as MatchMode;
    else if (arg === '--threshold' && next) cli.threshold = Number(next);
    else if (arg === '--model' && next) cli.model = next as 'heuristic' | 'logistic';
    else if (arg === '--curated') cli.curatedOnly = true;
    else if (arg === '--worst' && next) cli.showWorst = Number(next);
    else if (arg === '--json' && next) cli.json = next;
  }
  return cli;
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  const threshold = cli.threshold ?? MODE_PRESETS[cli.mode].threshold;

  const pairs = loadDataset(
    cli.curatedOnly ? 'datasets/development/curated.json' : 'datasets/benchmark/pairs.json',
  );

  const matcher = new NameMatcher({ mode: cli.mode, model: cli.model, threshold });
  const startedAt = performance.now();
  const scored = scorePairs(pairs, (a, b) => matcher.score(a, b), threshold);
  const elapsed = performance.now() - startedAt;

  const report = buildReport(scored, threshold);

  console.log('');
  console.log(`name-similarity benchmark  ·  mode=${cli.mode}  model=${cli.model}  threshold=${threshold}`);
  console.log(`${pairs.length} pairs scored in ${elapsed.toFixed(0)} ms (${((pairs.length / elapsed) * 1000).toFixed(0)} pairs/sec)`);
  console.log('');

  const header = 'category'.padEnd(24) + 'n'.padStart(5) + 'prec'.padStart(8) + 'recall'.padStart(8) + 'F1'.padStart(8) + 'FPR'.padStart(8) + 'FNR'.padStart(8);
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const category of report.byCategory) {
    // A category of only negatives has no true positives, so precision, recall
    // and F1 are undefined. Printing 0.0% there reads as a failure when every
    // pair was classified correctly; a dash says "not applicable".
    const positives = category.truePositives + category.falseNegatives;
    const rate = (value: number): string =>
      positives === 0 ? '    —' : formatPercent(value);

    console.log(
      category.category.padEnd(24) +
        String(category.total).padStart(5) +
        rate(category.precision).padStart(8) +
        rate(category.recall).padStart(8) +
        rate(category.f1).padStart(8) +
        formatPercent(category.falsePositiveRate).padStart(8) +
        rate(category.falseNegativeRate).padStart(8),
    );
  }

  console.log('-'.repeat(header.length));
  const overall = report.overall;
  console.log(
    'OVERALL'.padEnd(24) +
      String(overall.total).padStart(5) +
      formatPercent(overall.precision).padStart(8) +
      formatPercent(overall.recall).padStart(8) +
      formatPercent(overall.f1).padStart(8) +
      formatPercent(overall.falsePositiveRate).padStart(8) +
      formatPercent(overall.falseNegativeRate).padStart(8),
  );

  console.log('');
  console.log(`AUC ${report.auc.toFixed(4)}   best F1 ${report.bestF1.toFixed(4)} at threshold ${report.bestThreshold}`);
  console.log(`False positives: ${overall.falsePositives}   False negatives: ${overall.falseNegatives}`);

  if (cli.showWorst > 0 && report.worstCases.length > 0) {
    console.log('');
    console.log(`Worst ${Math.min(cli.showWorst, report.worstCases.length)} errors:`);
    for (const worst of report.worstCases.slice(0, cli.showWorst)) {
      const label = worst.kind === 'fp' ? 'FP' : 'FN';
      console.log(
        `  ${label} ${String(worst.score).padStart(3)}  [${worst.category}]  ${worst.a}  ||  ${worst.b}${worst.note ? `   (${worst.note})` : ''}`,
      );
    }
  }
  console.log('');

  if (cli.json) {
    writeFileSync(resolve(projectRoot, cli.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Report written to ${cli.json}`);
  }
}

main();
