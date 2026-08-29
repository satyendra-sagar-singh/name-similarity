import { createRequire } from 'node:module';

import { NameMatcher, normalize } from '../src/index.js';
import type { LabeledPair } from '../src/types.js';
import { areaUnderRoc, loadDataset, metricsFor, type ScoredPair } from './lib/metrics.js';

/**
 * Head-to-head against the libraries people actually reach for.
 *
 * Fairness rules, because a rigged comparison is worthless:
 *
 * 1. Every library is scored on the *same* pairs, with no preprocessing that
 *    one gets and another does not.
 * 2. Every library gets its own optimal threshold, found by sweeping all 100
 *    cut-offs on this very data. That is a real advantage handed to the
 *    baselines — they are tuned on the test set, `name-similarity` is not.
 * 3. AUC is reported too, which is threshold-free and cannot be gamed by the
 *    sweep.
 *
 * The point is not to prove a winner on aggregate F1. It is to show *where* a
 * name-aware engine differs from a string metric, which the per-category table
 * makes obvious.
 */

const require = createRequire(import.meta.url);

/**
 * The comparison libraries are an optional install, not a dependency.
 *
 * They are only needed to reproduce this one report, and pulling ~200 MB into
 * every contributor's `node_modules` to run it once is not a trade worth
 * making. Missing libraries are skipped with a note rather than crashing.
 */
export const COMPARISON_PACKAGES = [
  'fastest-levenshtein',
  'string-similarity',
  'fuzzball',
  'natural',
  'talisman',
] as const;

const INSTALL_HINT = `npm install --no-save ${COMPARISON_PACKAGES.join(' ')}`;

function tryRequire<T>(name: string): T | null {
  // `natural` writes banner noise to stdout when required.
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return require(name) as T;
  } catch {
    return null;
  } finally {
    process.stdout.write = originalWrite;
  }
}

const levenshtein = tryRequire<{ distance: (a: string, b: string) => number }>(
  'fastest-levenshtein',
);
const stringSimilarity = tryRequire<{ compareTwoStrings: (a: string, b: string) => number }>(
  'string-similarity',
);
const fuzzball = tryRequire<{
  ratio: (a: string, b: string) => number;
  token_set_ratio: (a: string, b: string) => number;
  token_sort_ratio: (a: string, b: string) => number;
}>('fuzzball');
const natural = tryRequire<{
  JaroWinklerDistance: (a: string, b: string, options?: unknown) => number;
  DoubleMetaphone: new () => { process: (value: string) => [string, string] };
}>('natural');

/** `natural` exposes Double Metaphone as a class, not a singleton. */
const doubleMetaphone = natural ? new natural.DoubleMetaphone() : null;

const talismanModule = tryRequire<
  ((a: string, b: string) => number) | { default: (a: string, b: string) => number }
>('talisman/metrics/jaro-winkler');
const jaroWinklerTalisman =
  talismanModule === null
    ? null
    : typeof talismanModule === 'function'
      ? talismanModule
      : talismanModule.default;

/* -------------------------------------------------------------------------- */

interface Contender {
  name: string;
  note: string;
  /** Returns 0..100. */
  score: (a: string, b: string) => number;
}

const lower = (value: string): string => value.trim().toLowerCase();
const tokensOf = (value: string): string[] =>
  lower(value).split(/[^a-z0-9]+/).filter(Boolean);

function levenshteinRatio(a: string, b: string): number {
  const x = lower(a);
  const y = lower(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 100;
  return (1 - levenshtein!.distance(x, y) / longest) * 100;
}

function doubleMetaphoneScore(a: string, b: string): number {
  const codesA = tokensOf(a).map((token) => doubleMetaphone!.process(token));
  const codesB = tokensOf(b).map((token) => doubleMetaphone!.process(token));
  if (codesA.length === 0 || codesB.length === 0) return 0;

  let hits = 0;
  for (const [primaryA, secondaryA] of codesA) {
    const matched = codesB.some(
      ([primaryB, secondaryB]) =>
        primaryA === primaryB || primaryA === secondaryB || secondaryA === primaryB,
    );
    if (matched) hits++;
  }
  return (hits / Math.max(codesA.length, codesB.length)) * 100;
}

/**
 * The hand-rolled combination people write when they need name matching and
 * reach for a metrics library: token-aware fuzzy ratio, lifted by a phonetic
 * check. This is the realistic baseline, not plain Levenshtein.
 */
function handRolledBlend(a: string, b: string): number {
  const token = fuzzball!.token_set_ratio(lower(a), lower(b));
  const phonetic = doubleMetaphoneScore(a, b);
  return Math.max(token, 0.5 * token + 0.5 * phonetic);
}

interface OptionalContender extends Contender {
  /** Skipped, with a note, when this is false. */
  available: boolean;
}

const ALL_CONTENDERS: OptionalContender[] = [
  {
    name: 'name-similarity',
    note: 'this package, balanced preset',
    available: true,
    score: (() => {
      const matcher = new NameMatcher();
      return (a: string, b: string) => matcher.score(a, b);
    })(),
  },
  {
    name: 'fuzzball token_set',
    note: 'fuzzywuzzy port; token-set ratio, the usual choice',
    available: fuzzball !== null,
    score: (a, b) => fuzzball!.token_set_ratio(lower(a), lower(b)),
  },
  {
    name: 'fuzzball token_sort',
    note: 'fuzzywuzzy port; token-sort ratio',
    available: fuzzball !== null,
    score: (a, b) => fuzzball!.token_sort_ratio(lower(a), lower(b)),
  },
  {
    name: 'fuzzball ratio',
    note: 'fuzzywuzzy port; plain ratio',
    available: fuzzball !== null,
    score: (a, b) => fuzzball!.ratio(lower(a), lower(b)),
  },
  {
    name: 'natural JaroWinkler',
    note: 'natural; Jaro-Winkler over the whole string',
    available: natural !== null,
    score: (a, b) => natural!.JaroWinklerDistance(lower(a), lower(b), { ignoreCase: true }) * 100,
  },
  {
    name: 'talisman JaroWinkler',
    note: 'talisman; Jaro-Winkler over the whole string',
    available: jaroWinklerTalisman !== null,
    score: (a, b) => jaroWinklerTalisman!(lower(a), lower(b)) * 100,
  },
  {
    name: 'Levenshtein ratio',
    note: 'fastest-levenshtein, normalised',
    available: levenshtein !== null,
    score: levenshteinRatio,
  },
  {
    name: 'Dice coefficient',
    note: 'string-similarity',
    available: stringSimilarity !== null,
    score: (a, b) => stringSimilarity!.compareTwoStrings(lower(a), lower(b)) * 100,
  },
  {
    name: 'Double Metaphone',
    note: 'natural; per-token phonetic agreement',
    available: doubleMetaphone !== null,
    score: doubleMetaphoneScore,
  },
  {
    name: 'hand-rolled blend',
    note: 'token_set_ratio lifted by Double Metaphone — the realistic DIY baseline',
    available: fuzzball !== null && doubleMetaphone !== null,
    score: handRolledBlend,
  },
  {
    name: 'normalised token_set',
    note: "fuzzball on this package's normalised output — isolates preprocessing from name intelligence",
    available: fuzzball !== null,
    score: (a, b) => fuzzball!.token_set_ratio(normalize(a).normalized, normalize(b).normalized),
  },
  {
    name: 'normalised blend',
    note: 'the DIY baseline, given the same normalisation',
    available: fuzzball !== null && doubleMetaphone !== null,
    score: (a, b) => handRolledBlend(normalize(a).normalized, normalize(b).normalized),
  },
];

const CONTENDERS: Contender[] = ALL_CONTENDERS.filter((contender) => contender.available);

interface Result {
  contender: Contender;
  bestThreshold: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
  falsePositives: number;
  falseNegatives: number;
  scored: ScoredPair[];
}

function evaluate(contender: Contender, pairs: readonly LabeledPair[]): Result {
  const raw = pairs.map((pair) => ({
    ...pair,
    score: clampScore(contender.score(pair.a, pair.b)),
  }));

  let best = { threshold: 50, f1: -1 };
  for (let threshold = 1; threshold <= 100; threshold++) {
    const predicted = raw.map((pair) => ({
      ...pair,
      predicted: pair.score >= threshold ? ('match' as const) : ('different' as const),
    }));
    const { f1 } = metricsFor('sweep', predicted);
    if (f1 > best.f1) best = { threshold, f1 };
  }

  const scored: ScoredPair[] = raw.map((pair) => ({
    ...pair,
    predicted: pair.score >= best.threshold ? ('match' as const) : ('different' as const),
  }));
  const metrics = metricsFor(contender.name, scored);

  return {
    contender,
    bestThreshold: best.threshold,
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    auc: areaUnderRoc(scored),
    falsePositives: metrics.falsePositives,
    falseNegatives: metrics.falseNegatives,
    scored,
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

function main(): void {
  const file = process.argv.includes('--curated')
    ? 'datasets/development/curated.json'
    : 'datasets/benchmark/pairs.json';
  const pairs = loadDataset(file);

  const missing = ALL_CONTENDERS.filter((contender) => !contender.available);
  if (CONTENDERS.length === 1) {
    console.log('\nThe comparison libraries are not installed. To reproduce this report:\n');
    console.log(`  ${INSTALL_HINT}\n`);
    console.log('They are intentionally not dependencies — they are only needed for this');
    console.log('one report, and would add roughly 200 MB to every install.\n');
    return;
  }

  console.log(`\nComparison on ${pairs.length} labelled pairs (${file})`);
  console.log('Every library is given its own best threshold, swept on this data.\n');
  if (missing.length > 0) {
    console.log(`Skipped (not installed): ${missing.map((c) => c.name).join(', ')}`);
    console.log(`  ${INSTALL_HINT}\n`);
  }

  const results = CONTENDERS.map((contender) => evaluate(contender, pairs));
  results.sort((left, right) => right.f1 - left.f1);

  const header =
    'library'.padEnd(23) +
    'thr'.padStart(5) +
    'prec'.padStart(8) +
    'recall'.padStart(8) +
    'F1'.padStart(8) +
    'AUC'.padStart(9) +
    'FP'.padStart(6) +
    'FN'.padStart(6);
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const result of results) {
    console.log(
      result.contender.name.padEnd(23) +
        String(result.bestThreshold).padStart(5) +
        percent(result.precision).padStart(8) +
        percent(result.recall).padStart(8) +
        percent(result.f1).padStart(8) +
        result.auc.toFixed(4).padStart(9) +
        String(result.falsePositives).padStart(6) +
        String(result.falseNegatives).padStart(6),
    );
  }

  /* Where the difference actually lives. */
  const focus = [
    'hypocorism',
    'indic-romanisation',
    'indian-initials',
    'indian-record',
    'english-surname',
    'initials',
    'abbreviation',
    'token-order',
    'transliteration',
    'nickname',
    'suffix',
    'false-positive',
    'indian-false-positive',
    'neg-middle-initial',
    'neg-near-surname',
  ];

  const shown = results.filter((result) =>
    ['name-similarity', 'normalised blend', 'hand-rolled blend', 'fuzzball token_set'].includes(
      result.contender.name,
    ),
  );

  console.log('\n\nPer-category F1 (— means the category has no positives to recall)\n');
  const catHeader = 'category'.padEnd(23) + 'n'.padStart(5) + shown.map((r) => r.contender.name.slice(0, 17).padStart(19)).join('');
  console.log(catHeader);
  console.log('-'.repeat(catHeader.length));

  for (const category of focus) {
    const inCategory = pairs.filter((pair) => pair.category === category);
    if (inCategory.length === 0) continue;
    const cells = shown.map((result) => {
      const subset = result.scored.filter((pair) => pair.category === category);
      const metrics = metricsFor(category, subset);
      const positives = metrics.truePositives + metrics.falseNegatives;
      return (positives === 0
        ? `— (${metrics.falsePositives} FP)`
        : percent(metrics.f1)
      ).padStart(19);
    });
    console.log(category.padEnd(23) + String(inCategory.length).padStart(5) + cells.join(''));
  }
  console.log('');
}

main();
