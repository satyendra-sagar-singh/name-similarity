import { clearCaches, matchNames, NameMatcher } from '../src/index.js';
import { CORPUS } from './lib/corpus.js';
import { Rng } from './lib/rng.js';

/**
 * Performance benchmark (Phase 18).
 *
 * Measures the realistic mix, not the best case: distinct pairs that miss every
 * cache and every fast path. The identical-name fast path is measured
 * separately because a de-duplication workload hits it constantly.
 */

interface Case {
  label: string;
  pairs: Array<[string, string]>;
}

function buildPairs(count: number, seed: number, mutate: boolean): Array<[string, string]> {
  const rng = new Rng(seed);
  const pairs: Array<[string, string]> = [];
  for (let index = 0; index < count; index++) {
    const group = rng.pick(CORPUS);
    const given = rng.pick(group.given);
    const surname = rng.pick(group.surnames);
    const middle = rng.chance(0.4) ? ` ${rng.pick(group.middles)}` : '';
    const a = `${given}${middle} ${surname}`;
    if (!mutate) {
      pairs.push([a, a]);
      continue;
    }
    const b = rng.chance(0.5)
      ? `${rng.pick(group.given)}${middle} ${surname}`
      : `${given} ${rng.pick(group.surnames)}`;
    pairs.push([a, b]);
  }
  return pairs;
}

function time(label: string, iterations: number, run: () => void): void {
  // Warm up so JIT compilation is not counted as work.
  for (let index = 0; index < Math.min(2000, iterations); index++) run();

  const startedAt = performance.now();
  for (let index = 0; index < iterations; index++) run();
  const elapsed = performance.now() - startedAt;

  const perOp = (elapsed / iterations) * 1000;
  const opsPerSecond = (iterations / elapsed) * 1000;
  console.log(
    `  ${label.padEnd(38)} ${elapsed.toFixed(1).padStart(9)} ms   ${perOp.toFixed(2).padStart(8)} µs/op   ${Math.round(opsPerSecond).toLocaleString().padStart(12)} ops/sec`,
  );
}

function main(): void {
  console.log('\nname-similarity performance\n');
  console.log(`  node ${process.version}  ${process.platform}/${process.arch}\n`);

  const distinct = buildPairs(20_000, 4242, true);
  const identical = buildPairs(20_000, 4242, false);
  const matcher = new NameMatcher();

  console.log('Throughput');
  let cursor = 0;
  time('matchNames (fresh options each call)', 100_000, () => {
    const pair = distinct[cursor++ % distinct.length]!;
    matchNames(pair[0], pair[1]);
  });

  cursor = 0;
  time('NameMatcher.score (reused options)', 200_000, () => {
    const pair = distinct[cursor++ % distinct.length]!;
    matcher.score(pair[0], pair[1]);
  });

  cursor = 0;
  time('identical names (fast path)', 500_000, () => {
    const pair = identical[cursor++ % identical.length]!;
    matcher.score(pair[0], pair[1]);
  });

  cursor = 0;
  time('detailed result', 50_000, () => {
    const pair = distinct[cursor++ % distinct.length]!;
    matchNames(pair[0], pair[1], { detailed: true });
  });

  console.log('\nScaling (NameMatcher.score, cold caches per run)');
  for (const size of [1, 1_000, 100_000, 1_000_000]) {
    clearCaches();
    const local = new NameMatcher();
    const startedAt = performance.now();
    for (let index = 0; index < size; index++) {
      const pair = distinct[index % distinct.length]!;
      local.score(pair[0], pair[1]);
    }
    const elapsed = performance.now() - startedAt;
    console.log(
      `  ${size.toLocaleString().padStart(9)} comparisons   ${elapsed.toFixed(1).padStart(10)} ms   ${Math.round((size / elapsed) * 1000).toLocaleString().padStart(12)} ops/sec`,
    );
  }

  const memory = process.memoryUsage();
  console.log(
    `\nMemory after run: heapUsed ${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB, rss ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
  );

  console.log('\nCold start');
  clearCaches();
  const coldStart = performance.now();
  matchNames('Mohammad Abdul Rahman', 'Mohd A Rahman');
  console.log(`  first comparison after cache clear: ${(performance.now() - coldStart).toFixed(3)} ms\n`);
}

main();
