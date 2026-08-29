/**
 * Runnable tour of the API.
 *
 *   npx tsx examples/basic.ts
 */
import {
  NameMatcher,
  clearCaches,
  extractFeatures,
  matchNames,
  normalize,
  parseName,
  rankNames,
} from '../src/index.js';

function heading(title: string): void {
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

/* 1 — the simple case ------------------------------------------------------ */

heading('1. Simple result');
console.log(matchNames('Satyendra Sagar Singh', 'S S Singh'));

/* 2 — the evidence behind the score ---------------------------------------- */

heading('2. Detailed result');
const detailed = matchNames('Satyendra Sagar Singh', 'S S Singh', { detailed: true });
console.log(`score ${detailed.score}  ·  ${detailed.band}  ·  P(same) ≈ ${detailed.probability.toFixed(3)}`);
console.log('\nnormalised:');
console.log(`  a: ${detailed.normalized.a}`);
console.log(`  b: ${detailed.normalized.b}`);
console.log('\nalignment:');
for (const pair of detailed.alignment) {
  console.log(`  ${String(pair.a).padEnd(10)} ~ ${String(pair.b).padEnd(10)} ${pair.score.toFixed(2)}  (${pair.kind})`);
}
console.log('\nwhy:');
for (const reason of detailed.evidence) {
  const mark = reason.polarity === 'positive' ? '+' : reason.polarity === 'negative' ? '-' : '·';
  console.log(`  ${mark} ${reason.message}`);
}

/* 3 — the decision is yours ------------------------------------------------ */

heading('3. Thresholds and modes');
// A preset moves the threshold *and* how harshly contradictions are punished,
// so a borderline pair can change score as well as verdict.
const pair: [string, string] = ['John Smith Jr', 'John Smith Sr'];
console.log(`  ${pair[0]}  ||  ${pair[1]}`);
for (const mode of ['strict', 'balanced', 'fuzzy'] as const) {
  const result = matchNames(...pair, { mode });
  console.log(`  ${mode.padEnd(9)} score ${String(result.score).padStart(3)}  matched ${result.matched}`);
}
console.log(`  explicit threshold 60 → matched ${matchNames(...pair, { threshold: 60 }).matched}`);

/* 4 — negative evidence ---------------------------------------------------- */

heading('4. Why a plausible-looking pair was rejected');
for (const [a, b] of [
  ['Satyendra Sagar Singh', 'Satyendra Kumar Singh'],
  ['John Smith Jr', 'John Smith Sr'],
  ['Michael Johnson', 'Michelle Johnson'],
  ['Raj Kumar', 'Rajesh Kumar'],
] as Array<[string, string]>) {
  const result = matchNames(a, b, { detailed: true });
  console.log(`\n  ${a}  ||  ${b}   →  ${result.score}`);
  for (const reason of result.evidence.filter((item) => item.polarity === 'negative')) {
    console.log(`    - ${reason.message}`);
  }
}

/* 5 — non-Latin scripts ---------------------------------------------------- */

heading('5. Transliteration');
for (const [a, b] of [
  ['सत्येंद्र सागर सिंह', 'Satyendra Sagar Singh'],
  ['राहुल शर्मा', 'Rahul Sharma'],
  ['محمد علي', 'Mohammad Ali'],
  ['Владимир Петров', 'Vladimir Petrov'],
  ['王伟', 'Wang Wei'],
] as Array<[string, string]>) {
  console.log(`  ${String(matchNames(a, b).score).padStart(3)}   ${a.padEnd(18)} || ${b}`);
}

/* 6 — inspecting the pipeline ---------------------------------------------- */

heading('6. Normalisation and parsing');
console.log(normalize('  Shri Satyendra Sagar Singh S/O Ram Singh '));
console.log(parseName('Jan van der Berg'));
console.log(parseName('Jose Garcia Marquez', { locale: 'es' }));

/* 7 — ranking candidates --------------------------------------------------- */

heading('7. Ranking');
const candidates = [
  'Satyendra Sagar Singh',
  'S S Singh',
  'Satyendra Kumar Singh',
  'Surendra Sagar Singh',
  'Rahul Sharma',
];
for (const row of rankNames('Satyendra Sagar Singh', candidates)) {
  console.log(`  ${String(row.score).padStart(3)}  ${row.matched ? '✓' : ' '}  ${row.candidate}`);
}

/* 8 — extending with your own aliases -------------------------------------- */

heading('8. Custom aliases');
console.log(`  without: ${matchNames('Zed Smith', 'Zebulon Smith').score}`);
console.log(`  with:    ${matchNames('Zed Smith', 'Zebulon Smith', { aliases: { zed: ['zebulon'] } }).score}`);

/* 9 — the feature vector, for your own model ------------------------------- */

heading('9. Feature vector');
const features = extractFeatures('Satyendra Sagar Singh', 'S S Singh');
const notable = Object.entries(features)
  .filter(([, value]) => value !== 0)
  .map(([key, value]) => `${key}=${Number(value.toFixed(3))}`);
console.log(`  ${notable.join('\n  ')}`);

/* 10 — bulk work ----------------------------------------------------------- */

heading('10. Bulk comparison');
clearCaches();
const matcher = new NameMatcher({ mode: 'strict' });
const startedAt = performance.now();
let matches = 0;
for (let index = 0; index < 50_000; index++) {
  if (matcher.score('Satyendra Sagar Singh', `S S Singh ${index % 7}`) >= 88) matches++;
}
const elapsed = performance.now() - startedAt;
console.log(`  50,000 comparisons in ${elapsed.toFixed(0)} ms (${Math.round(50_000 / elapsed * 1000).toLocaleString()} /sec), ${matches} matched`);
console.log('');
