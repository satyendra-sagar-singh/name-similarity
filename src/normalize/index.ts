import type { NormalizeOptions, NormalizedName, ScriptName } from '../types.js';
import { foldAccents } from './accents.js';
import { collapseWhitespace, normalizePunctuation } from './punctuation.js';
import {
  AMBIGUOUS_TITLES,
  DEFAULT_SUFFIXES,
  DEFAULT_TITLES,
  extractTitlesAndSuffixes,
} from './titles.js';
import { transliterate } from './transliteration.js';
import { detectScript, stripInvisible } from './unicode.js';

export { foldAccents, differsOnlyByAccents } from './accents.js';
export { detectScript, detectScripts, isLatinScript } from './unicode.js';
export { transliterate, isTransliterable } from './transliteration.js';
export { groupParticles, isParticle, familyHead, PARTICLES } from './particles.js';
export {
  DEFAULT_SUFFIXES,
  DEFAULT_TITLES,
  GENERATIONAL_SUFFIXES,
  canonicalGenerational,
} from './titles.js';

export const DEFAULT_NORMALIZE_OPTIONS: Required<NormalizeOptions> = Object.freeze({
  foldAccents: true,
  splitHyphens: true,
  splitApostrophes: true,
  stripTitles: true,
  stripSuffixes: true,
  transliterate: true,
  extraTitles: [],
  extraSuffixes: [],
});

export function resolveNormalizeOptions(
  options?: NormalizeOptions,
): Required<NormalizeOptions> {
  if (!options) return DEFAULT_NORMALIZE_OPTIONS;
  return { ...DEFAULT_NORMALIZE_OPTIONS, ...options };
}

/**
 * Cache key must capture every option that changes the output. Memoised on the
 * options object, which callers reuse across every comparison.
 */
const optionsKeyCache = new WeakMap<Required<NormalizeOptions>, string>();

function optionsKey(options: Required<NormalizeOptions>): string {
  const cached = optionsKeyCache.get(options);
  if (cached !== undefined) return cached;
  const key = buildOptionsKey(options);
  optionsKeyCache.set(options, key);
  return key;
}

function buildOptionsKey(options: Required<NormalizeOptions>): string {
  return [
    options.foldAccents ? 1 : 0,
    options.splitHyphens ? 1 : 0,
    options.splitApostrophes ? 1 : 0,
    options.stripTitles ? 1 : 0,
    options.stripSuffixes ? 1 : 0,
    options.transliterate ? 1 : 0,
    options.extraTitles.join(','),
    options.extraSuffixes.join(','),
  ].join('|');
}

const MAX_CACHE_ENTRIES = 5000;
const normalizeCache = new Map<string, NormalizedName[]>();

const EMPTY_RESULT: NormalizedName = Object.freeze({
  original: '',
  normalized: '',
  compact: '',
  tokens: Object.freeze([]) as unknown as string[],
  titles: Object.freeze([]) as unknown as string[],
  suffixes: Object.freeze([]) as unknown as string[],
  script: 'latin' as ScriptName,
  transliterated: false,
  commaInverted: false,
});

/**
 * Full normalisation pipeline.
 *
 * ```text
 * input -> invisible strip -> script detect -> transliterate -> accent fold
 *       -> lowercase -> punctuation -> tokenise -> title/suffix extraction
 * ```
 *
 * The original string is never discarded: callers get every intermediate
 * representation they might need for explanation or re-parsing.
 */
export function normalize(input: string, options?: NormalizeOptions): NormalizedName {
  return normalizeVariants(input, options)[0]!;
}

/**
 * Every reading of the input worth comparing.
 *
 * The first entry is the canonical normalisation. A second appears only when an
 * *ambiguous* honorific was stripped, because that call cannot be made from one
 * name alone: `Shri` is an honorific in `Shri Narendra Modi` and the first
 * syllable of a name in `Sri Ram Iyer`. The matcher scores both readings and
 * keeps the better one, which is what preserving multiple representations buys.
 */
export function normalizeVariants(
  input: string,
  options?: NormalizeOptions,
): NormalizedName[] {
  if (typeof input !== 'string') return [{ ...EMPTY_RESULT }];
  const resolved = resolveNormalizeOptions(options);
  const cacheKey = `${optionsKey(resolved)} ${input}`;
  const cached = normalizeCache.get(cacheKey);
  if (cached) return cached;

  const primary = normalizeUncached(input, resolved, true);
  const variants = [primary];

  if (primary.titles.some((title) => AMBIGUOUS_TITLES.has(title))) {
    const kept = normalizeUncached(input, resolved, false);
    if (kept.normalized !== primary.normalized) variants.push(kept);
  }

  if (normalizeCache.size >= MAX_CACHE_ENTRIES) normalizeCache.clear();
  normalizeCache.set(cacheKey, variants);
  return variants;
}

export function clearNormalizeCache(): void {
  normalizeCache.clear();
}

function normalizeUncached(
  input: string,
  options: Required<NormalizeOptions>,
  stripAmbiguousTitles: boolean,
): NormalizedName {
  const original = input;
  const cleaned = stripInvisible(input);
  const trimmed = collapseWhitespace(cleaned);
  if (trimmed.length === 0) return { ...EMPTY_RESULT, original };

  const script = detectScript(trimmed);
  let working = trimmed;
  let transliterated = false;

  if (options.transliterate && script !== 'latin' && script !== 'unknown') {
    const converted = transliterate(trimmed, script);
    if (converted.transliterated) {
      working = converted.text;
      transliterated = true;
    }
  }

  if (options.foldAccents) working = foldAccents(working);
  working = working.toLowerCase();

  const allTitles = buildSet(DEFAULT_TITLES, options.extraTitles);
  const titles = stripAmbiguousTitles ? allTitles : withoutAmbiguous(allTitles);
  const suffixes = buildSet(DEFAULT_SUFFIXES, options.extraSuffixes);

  const punctuation = normalizePunctuation(
    working,
    {
      splitHyphens: options.splitHyphens,
      splitApostrophes: options.splitApostrophes,
    },
    (token) => suffixes.has(stripNonWord(token)),
  );

  const rawTokens = punctuation.text
    .split(' ')
    .map(stripNonWord)
    // Bare numbers are record artefacts (`John Smith 2`), never name parts.
    .filter((token) => token.length > 0 && !/^\d+$/.test(token));

  const extraction = extractTitlesAndSuffixes(rawTokens, {
    stripTitles: options.stripTitles,
    stripSuffixes: options.stripSuffixes,
    titles,
    suffixes,
  });

  const normalized = extraction.tokens.join(' ');

  return {
    original,
    normalized,
    compact: normalized.replace(/\s+/g, ''),
    tokens: extraction.tokens,
    titles: extraction.titles,
    suffixes: extraction.suffixes,
    script,
    transliterated,
    commaInverted: punctuation.commaInverted,
  };
}

function stripNonWord(token: string): string {
  return token.replace(/[^\p{L}\p{N}]/gu, '');
}

function withoutAmbiguous(titles: ReadonlySet<string>): ReadonlySet<string> {
  const kept = new Set(titles);
  for (const title of AMBIGUOUS_TITLES) kept.delete(title);
  return kept;
}

function buildSet(base: ReadonlySet<string>, extra: string[]): ReadonlySet<string> {
  if (extra.length === 0) return base;
  const merged = new Set(base);
  for (const item of extra) merged.add(item.trim().toLowerCase());
  return merged;
}
