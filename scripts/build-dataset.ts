import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import curated from '../datasets/development/curated.js';
import {
  DEFAULT_ALIAS_GROUPS,
  KNOWN_CONTRACTIONS,
  levenshteinDistance,
} from '../src/index.js';
import type { LabeledPair } from '../src/types.js';
import {
  ACCENT_SUBSTITUTIONS,
  CORPUS,
  PHONETIC_SUBSTITUTIONS,
  SUFFIXES,
  TITLES,
  type CorpusGroup,
} from './lib/corpus.js';
import { Rng } from './lib/rng.js';

/**
 * Benchmark dataset builder.
 *
 * Produces `datasets/benchmark/pairs.json` from two sources:
 *
 *  - the curated set, which carries the genuinely hard cases;
 *  - generated pairs, which exercise each transformation at volume.
 *
 * The generated negatives are drawn from the *same* naming tradition as their
 * positives. Random cross-culture negatives are trivially separable and would
 * make every metric look better than it is.
 *
 * Known limitation, stated so the numbers are not over-read: nickname, alias
 * and transliteration positives are drawn from the package's own tables, so
 * those categories measure integration rather than generalisation. The curated
 * set is where out-of-table behaviour is tested.
 */

const args = process.argv.slice(2);
const seedArg = args.indexOf('--seed');
const outArg = args.indexOf('--out');
const includeCuratedArg = !args.includes('--no-curated');

/**
 * A second seed produces a held-out set: same generators, disjoint samples.
 * Tuning on one and reporting on the other is the only way to know whether an
 * improvement generalised or was fitted to the data.
 */
const SEED = seedArg >= 0 ? Number(args[seedArg + 1]) : 20260821;
const OUTPUT = outArg >= 0 ? args[outArg + 1]! : 'datasets/benchmark/pairs.json';

const cultureArg = args.indexOf('--culture');

/**
 * Restrict generation to one naming tradition.
 *
 * An aggregate over nine traditions hides how the engine performs on any one of
 * them, which is exactly the wrong thing when a caller's data is all English.
 */
const CULTURES: CorpusGroup[] =
  cultureArg >= 0
    ? CORPUS.filter((group) => group.culture === args[cultureArg + 1])
    : CORPUS;

if (CULTURES.length === 0) {
  throw new Error(
    `Unknown culture "${args[cultureArg + 1]}". Known: ${CORPUS.map((g) => g.culture).join(', ')}`,
  );
}
const TARGET_PER_POSITIVE_CATEGORY = 60;
const TARGET_PER_NEGATIVE_CATEGORY = 75;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const SURNAME_POOL: string[] = CULTURES.flatMap((group) => group.surnames);

interface FullName {
  given: string;
  middle: string;
  surname: string;
  group: CorpusGroup;
}

function main(): void {
  const rng = new Rng(SEED);
  const generated: LabeledPair[] = [];

  generatePositives(rng, generated);
  generateNegatives(rng, generated);

  const deduped = dedupe(includeCuratedArg ? [...curated, ...generated] : generated);
  const stats = summarise(deduped);

  const outputPath = resolve(projectRoot, OUTPUT);
  mkdirSync(dirname(outputPath), { recursive: true });

  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        version: 1,
        seed: SEED,
        generatedAt: 'deterministic',
        counts: stats,
        pairs: deduped,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  if (includeCuratedArg) {
    writeFileSync(
      resolve(projectRoot, 'datasets/development/curated.json'),
      `${JSON.stringify({ version: 1, pairs: curated }, null, 2)}\n`,
      'utf8',
    );
  }

  console.log(`Wrote ${deduped.length} pairs to ${OUTPUT}`);
  console.log(`  curated: ${includeCuratedArg ? curated.length : 0}`);
  console.log(`  generated: ${deduped.length - (includeCuratedArg ? curated.length : 0)}`);
  console.log(`  match: ${stats.match}   different: ${stats.different}`);
  console.log(`  categories: ${Object.keys(stats.byCategory).length}`);
}

/* -------------------------------------------------------------------------- */
/* Positive generation                                                        */
/* -------------------------------------------------------------------------- */

function generatePositives(rng: Rng, output: LabeledPair[]): void {
  const transformations: Array<[string, (name: FullName, rng: Rng) => string | null]> = [
    ['case', (name, r) => randomCase(render(name), r)],
    ['accent', (name, r) => addAccent(render(name), r)],
    ['typo', (name, r) => applyTypo(render(name), r)],
    ['transposition', (name, r) => applyTransposition(render(name), r)],
    ['initials', (name) => toInitials(name)],
    ['missing-middle', (name) => (name.middle ? `${name.given} ${name.surname}` : null)],
    ['extra-middle', (name, r) => addMiddle(name, r)],
    ['phonetic', (name, r) => applyPhonetic(render(name), r)],
    ['token-order', (name) => `${name.surname} ${name.given}`],
    ['comma-order', (name) => `${name.surname}, ${name.given}`],
    ['prefix', (name, r) => `${r.pick(TITLES)} ${render(name)}`],
    ['suffix', (name, r) => `${render(name)} ${r.pick(['Jr', 'PhD', 'Esq'])}`],
    ['whitespace', (name, r) => noisyWhitespace(render(name), r)],
    ['hyphenation', (name, r) => hyphenate(name, r)],
  ];

  for (const [category, transform] of transformations) {
    let produced = 0;
    let attempts = 0;
    while (produced < TARGET_PER_POSITIVE_CATEGORY && attempts < 3000) {
      attempts++;
      const name = randomName(rng, category === 'missing-middle' || category === 'initials');
      const original = render(name);
      const variant = transform(name, rng);
      if (!variant || variant === original) continue;
      output.push({ a: original, b: variant, expected: 'match', category });
      produced++;
    }
  }

  generateAliasPositives(rng, output, 'nickname', ['nickname']);
  generateAliasPositives(rng, output, 'alias', ['variant']);
  generateAliasPositives(rng, output, 'transliteration', ['transliteration']);
  generateAbbreviationPositives(rng, output);
}

function generateAliasPositives(
  rng: Rng,
  output: LabeledPair[],
  category: string,
  kinds: string[],
): void {
  const groups = DEFAULT_ALIAS_GROUPS.filter(
    (group) => kinds.includes(group.kind) && group.members.length >= 2 && group.strength >= 0.85,
  );
  if (groups.length === 0) return;

  for (let index = 0; index < TARGET_PER_POSITIVE_CATEGORY; index++) {
    const group = rng.pick(groups);
    const first = rng.pick(group.members);
    const second = rng.pickOther(group.members, first);
    if (first === second) continue;
    const surname = rng.pick(SURNAME_POOL);
    output.push({
      a: `${capitalise(first)} ${surname}`,
      b: `${capitalise(second)} ${surname}`,
      expected: 'match',
      category,
    });
  }
}

function generateAbbreviationPositives(rng: Rng, output: LabeledPair[]): void {
  const entries = Object.entries(KNOWN_CONTRACTIONS);
  for (let index = 0; index < TARGET_PER_POSITIVE_CATEGORY; index++) {
    const [short, longs] = rng.pick(entries);
    const long = rng.pick(longs);
    const surname = rng.pick(SURNAME_POOL);
    output.push({
      a: `${capitalise(short)} ${surname}`,
      b: `${capitalise(long)} ${surname}`,
      expected: 'match',
      category: 'abbreviation',
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Negative generation                                                        */
/* -------------------------------------------------------------------------- */

function generateNegatives(rng: Rng, output: LabeledPair[]): void {
  // Same family name, different given name — the classic sibling confusion.
  emit(rng, output, 'neg-same-family', TARGET_PER_NEGATIVE_CATEGORY, (r) => {
    const group = r.pick(CULTURES);
    const surname = r.pick(group.surnames);
    const givenA = r.pick(group.given);
    const givenB = r.pickOther(group.given, givenA);
    if (givenA === givenB) return null;
    return [`${givenA} ${surname}`, `${givenB} ${surname}`];
  });

  // Same given name, different family name.
  emit(rng, output, 'neg-same-given', TARGET_PER_NEGATIVE_CATEGORY, (r) => {
    const group = r.pick(CULTURES);
    const given = r.pick(group.given);
    const surnameA = r.pick(group.surnames);
    const surnameB = r.pickOther(group.surnames, surnameA);
    if (surnameA === surnameB) return null;
    return [`${given} ${surnameA}`, `${given} ${surnameB}`];
  });

  // Two genuinely different surnames that happen to sit close in edit space.
  emit(rng, output, 'neg-near-surname', TARGET_PER_NEGATIVE_CATEGORY, (r) => {
    const group = r.pick(CULTURES);
    const given = r.pick(group.given);
    const surnameA = r.pick(group.surnames);
    const close = group.surnames.filter((candidate) => {
      if (candidate === surnameA) return false;
      const distance = levenshteinDistance(candidate.toLowerCase(), surnameA.toLowerCase());
      return distance >= 2 && distance <= 4;
    });
    if (close.length === 0) return null;
    return [`${given} ${surnameA}`, `${given} ${r.pick(close)}`];
  });

  // Two genuinely different given names that sit close in edit space.
  emit(rng, output, 'neg-near-given', TARGET_PER_NEGATIVE_CATEGORY, (r) => {
    const group = r.pick(CULTURES);
    const surname = r.pick(group.surnames);
    const givenA = r.pick(group.given);
    const close = group.given.filter((candidate) => {
      if (candidate === givenA) return false;
      const distance = levenshteinDistance(candidate.toLowerCase(), givenA.toLowerCase());
      return distance >= 2 && distance <= 3;
    });
    if (close.length === 0) return null;
    return [`${surname === givenA ? givenA : givenA} ${surname}`, `${r.pick(close)} ${surname}`];
  });

  // Contradicting middle initials with everything else identical.
  emit(rng, output, 'neg-middle-initial', 40, (r) => {
    const group = r.pick(CULTURES);
    const given = r.pick(group.given);
    const surname = r.pick(group.surnames);
    const letterA = String.fromCharCode(65 + r.int(26));
    const letterB = String.fromCharCode(65 + r.int(26));
    if (letterA === letterB) return null;
    return [`${given} ${letterA} ${surname}`, `${given} ${letterB} ${surname}`];
  });

  // Generational suffix conflict.
  emit(rng, output, 'neg-suffix', 30, (r) => {
    const group = r.pick(CULTURES);
    const given = r.pick(group.given);
    const surname = r.pick(group.surnames);
    return [`${given} ${surname} Jr`, `${given} ${surname} Sr`];
  });

  // Reordered but with a different given name.
  emit(rng, output, 'neg-reordered', 40, (r) => {
    const group = r.pick(CULTURES);
    const surname = r.pick(group.surnames);
    const givenA = r.pick(group.given);
    const givenB = r.pickOther(group.given, givenA);
    if (givenA === givenB) return null;
    return [`${surname} ${givenA}`, `${givenB} ${surname}`];
  });

  // Unrelated names, same tradition. Easy, but they must not be absent.
  emit(rng, output, 'neg-unrelated', 60, (r) => {
    const group = r.pick(CULTURES);
    const a = renderRandom(r, group);
    const b = renderRandom(r, group);
    if (a === b) return null;
    return [a, b];
  });

  // Unrelated names across traditions. The floor case.
  if (CULTURES.length > 1) {
    emit(rng, output, 'neg-unrelated-cross', 40, (r) => {
      const groupA = r.pick(CULTURES);
      const groupB = r.pickOther(CULTURES, groupA);
      return [renderRandom(r, groupA), renderRandom(r, groupB)];
    });
  }

  // A bare surname against a full name.
  emit(rng, output, 'neg-single-token', 30, (r) => {
    const group = r.pick(CULTURES);
    const surname = r.pick(group.surnames);
    return [surname, `${r.pick(group.given)} ${surname}`];
  });
}

function emit(
  rng: Rng,
  output: LabeledPair[],
  category: string,
  target: number,
  make: (rng: Rng) => [string, string] | null,
): void {
  let produced = 0;
  let attempts = 0;
  while (produced < target && attempts < 6000) {
    attempts++;
    const pair = make(rng);
    if (!pair) continue;
    const [a, b] = pair;
    if (a === b) continue;
    output.push({ a, b, expected: 'different', category });
    produced++;
  }
}

/* -------------------------------------------------------------------------- */
/* Name construction and mutation                                             */
/* -------------------------------------------------------------------------- */

function randomName(rng: Rng, forceMiddle = false): FullName {
  const group = rng.pick(CULTURES);
  return {
    given: rng.pick(group.given),
    middle: forceMiddle || rng.chance(0.35) ? rng.pick(group.middles) : '',
    surname: rng.pick(group.surnames),
    group,
  };
}

function render(name: FullName): string {
  return [name.given, name.middle, name.surname].filter(Boolean).join(' ');
}

function renderRandom(rng: Rng, group: CorpusGroup): string {
  return `${rng.pick(group.given)} ${rng.pick(group.surnames)}`;
}

function randomCase(value: string, rng: Rng): string {
  if (rng.chance(0.5)) return value.toUpperCase();
  if (rng.chance(0.5)) return value.toLowerCase();
  return [...value]
    .map((char) => (rng.chance(0.5) ? char.toUpperCase() : char.toLowerCase()))
    .join('');
}

function addAccent(value: string, rng: Rng): string | null {
  const positions = [...value]
    .map((char, index) => ({ char: char.toLowerCase(), index }))
    .filter(({ char }) => ACCENT_SUBSTITUTIONS[char] !== undefined);
  if (positions.length === 0) return null;
  const target = rng.pick(positions);
  const replacement = ACCENT_SUBSTITUTIONS[target.char]!;
  return value.slice(0, target.index) + replacement + value.slice(target.index + 1);
}

/** One substitution, insertion or deletion, never on the first letter. */
function applyTypo(value: string, rng: Rng): string | null {
  const tokens = value.split(' ');
  const tokenIndex = rng.int(tokens.length);
  const token = tokens[tokenIndex]!;
  if (token.length < 4) return null;

  const position = 1 + rng.int(token.length - 1);
  const operation = rng.int(3);
  const letters = 'abcdefghijklmnopqrstuvwxyz';

  let mutated: string;
  if (operation === 0) {
    mutated = token.slice(0, position) + rng.pick([...letters]) + token.slice(position + 1);
  } else if (operation === 1) {
    mutated = token.slice(0, position) + rng.pick([...letters]) + token.slice(position);
  } else {
    mutated = token.slice(0, position) + token.slice(position + 1);
  }

  if (mutated === token) return null;
  tokens[tokenIndex] = mutated;
  return tokens.join(' ');
}

function applyTransposition(value: string, rng: Rng): string | null {
  const tokens = value.split(' ');
  const candidates = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.length >= 4);
  if (candidates.length === 0) return null;

  const { token, index } = rng.pick(candidates);
  const position = 1 + rng.int(token.length - 2);
  if (token[position] === token[position + 1]) return null;

  tokens[index] =
    token.slice(0, position) + token[position + 1] + token[position] + token.slice(position + 2);
  return tokens.join(' ');
}

function toInitials(name: FullName): string | null {
  if (!name.middle) return null;
  return `${name.given[0]!}. ${name.middle[0]!}. ${name.surname}`;
}

function addMiddle(name: FullName, rng: Rng): string | null {
  if (name.middle) return null;
  return `${name.given} ${rng.pick(name.group.middles)} ${name.surname}`;
}

/**
 * Respell exactly one token, and only a token long enough for the respelling to
 * leave a recognisable name. Mutating every token at once, or mutating a
 * three-letter name, produces pairs no human would call the same person.
 */
function applyPhonetic(value: string, rng: Rng): string | null {
  const tokens = value.split(' ');
  const candidates = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.length >= 5);
  if (candidates.length === 0) return null;

  const target = rng.pick(candidates);
  for (const [pattern, replacement] of rng.shuffle(PHONETIC_SUBSTITUTIONS)) {
    const mutated = target.token.replace(pattern, replacement);
    if (mutated === target.token) continue;
    tokens[target.index] = mutated;
    return tokens.join(' ');
  }
  return null;
}

function noisyWhitespace(value: string, rng: Rng): string {
  const separator = rng.chance(0.5) ? '  ' : '\t';
  return ` ${value.split(' ').join(separator)} `;
}

function hyphenate(name: FullName, rng: Rng): string | null {
  if (!name.middle) return null;
  return rng.chance(0.5)
    ? `${name.given}-${name.middle} ${name.surname}`
    : `${name.given} ${name.middle}-${name.surname}`;
}

/* -------------------------------------------------------------------------- */
/* Output helpers                                                             */
/* -------------------------------------------------------------------------- */

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dedupe(pairs: readonly LabeledPair[]): LabeledPair[] {
  const seen = new Set<string>();
  const output: LabeledPair[] = [];
  for (const pair of pairs) {
    const key = `${pair.a}\u0000${pair.b}`;
    const reverseKey = `${pair.b}\u0000${pair.a}`;
    if (seen.has(key) || seen.has(reverseKey)) continue;
    seen.add(key);
    output.push(pair);
  }
  return output;
}

function summarise(pairs: readonly LabeledPair[]): {
  total: number;
  match: number;
  different: number;
  byCategory: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  let match = 0;
  for (const pair of pairs) {
    byCategory[pair.category] = (byCategory[pair.category] ?? 0) + 1;
    if (pair.expected === 'match') match++;
  }
  return { total: pairs.length, match, different: pairs.length - match, byCategory };
}

main();
