import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODE_PRESETS, NameMatcher } from '../../src/index.js';
import type { MatchMode } from '../../src/types.js';
import { buildReport, loadDataset, projectRoot, scorePairs } from '../../scripts/lib/metrics.js';

/**
 * Benchmark regression gate (Phase 19).
 *
 * Runs the full labelled dataset in CI. Thresholds are set just below the
 * measured numbers so an accuracy regression fails the build rather than
 * arriving silently in a release.
 */

function evaluate(file: string, mode: MatchMode) {
  const pairs = loadDataset(file);
  const threshold = MODE_PRESETS[mode].threshold;
  const matcher = new NameMatcher({ mode });
  const scored = scorePairs(pairs, (a, b) => matcher.score(a, b), threshold);
  return { report: buildReport(scored, threshold), size: pairs.length };
}

describe('benchmark — full dataset', () => {
  const { report, size } = evaluate('datasets/benchmark/pairs.json', 'balanced');

  it('covers a dataset of meaningful size and breadth', () => {
    expect(size).toBeGreaterThanOrEqual(1000);
    expect(report.byCategory.length).toBeGreaterThanOrEqual(25);
  });

  it('meets the overall accuracy gate', () => {
    expect(report.overall.precision).toBeGreaterThanOrEqual(0.98);
    expect(report.overall.recall).toBeGreaterThanOrEqual(0.98);
    expect(report.overall.f1).toBeGreaterThanOrEqual(0.985);
    expect(report.auc).toBeGreaterThanOrEqual(0.995);
  });

  it('keeps false positives near zero, which is the expensive error', () => {
    expect(report.overall.falsePositiveRate).toBeLessThanOrEqual(0.02);
  });

  it('performs on every category, not just in aggregate', () => {
    const weak = report.byCategory.filter(
      (category) => category.total >= 20 && category.f1 < 0.9 && category.truePositives > 0,
    );
    expect(weak.map((category) => `${category.category}=${category.f1.toFixed(3)}`)).toEqual([]);
  });

  it('never confuses a negative category for a positive one', () => {
    for (const category of report.byCategory) {
      if (!category.category.startsWith('neg-')) continue;
      expect(category.falsePositiveRate, category.category).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('benchmark — modes trade errors as documented', () => {
  const strict = evaluate('datasets/benchmark/pairs.json', 'strict').report;
  const balanced = evaluate('datasets/benchmark/pairs.json', 'balanced').report;
  const fuzzy = evaluate('datasets/benchmark/pairs.json', 'fuzzy').report;

  it('strict favours precision', () => {
    // Compared on error counts, not on the precision ratio: with the same
    // false positives but fewer true positives, a stricter mode can show a
    // fractionally lower precision while being strictly more conservative.
    expect(strict.overall.falsePositives).toBeLessThanOrEqual(balanced.overall.falsePositives);
    expect(strict.overall.falseNegatives).toBeGreaterThanOrEqual(balanced.overall.falseNegatives);
  });

  it('fuzzy favours recall', () => {
    expect(fuzzy.overall.recall).toBeGreaterThanOrEqual(balanced.overall.recall);
    expect(fuzzy.overall.falseNegatives).toBeLessThanOrEqual(balanced.overall.falseNegatives);
  });
});

describe('benchmark — curated hard cases', () => {
  const { report } = evaluate('datasets/development/curated.json', 'balanced');

  it('meets the accuracy gate on the hand-labelled set', () => {
    expect(report.overall.f1).toBeGreaterThanOrEqual(0.98);
    expect(report.overall.precision).toBeGreaterThanOrEqual(0.97);
  });
});

const holdoutPath = resolve(projectRoot, 'datasets/benchmark/holdout.json');

describe.skipIf(!existsSync(holdoutPath))('benchmark — held-out set', () => {
  it('generalises: held-out F1 tracks the tuned set', () => {
    const tuned = evaluate('datasets/benchmark/pairs.json', 'balanced').report;
    const holdout = evaluate('datasets/benchmark/holdout.json', 'balanced').report;

    expect(holdout.overall.f1).toBeGreaterThanOrEqual(0.98);
    // A large gap would mean the engine was fitted to the tuning data.
    expect(tuned.overall.f1 - holdout.overall.f1).toBeLessThanOrEqual(0.02);
  });
});
