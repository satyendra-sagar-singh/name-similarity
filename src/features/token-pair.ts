import { KNOWN_CONTRACTIONS, STANDALONE_SHORT_NAMES } from '../aliases/default.js';
import { resolveDistinctPairIndex } from '../aliases/resolver.js';
import type { AliasIndexLike, DistinctPairIndexLike } from '../types.js';
import { isAttestedGivenName, isAttestedName } from './frequency.js';
import { analyzeAbbreviation, skeletonSimilarity } from '../similarity/abbreviation.js';
import { damerauLevenshteinDistance, isSingleTransposition } from '../similarity/damerau.js';
import { jaroWinklerSimilarity } from '../similarity/jaro-winkler.js';
import { phoneticSimilarity } from '../similarity/phonetic/index.js';
import type { TokenPairScore } from '../similarity/token.js';
import type { TokenMatchKind } from '../types.js';

/**
 * Name intelligence for a single token pair.
 *
 * This is where generic string algorithms become name evidence. Each channel
 * produces a candidate score and the strongest one wins, so a pair can match
 * as an alias *or* a typo *or* a contraction without those channels being
 * averaged into mush.
 *
 * Two policies do most of the work on the false-positive side:
 *
 * - a **truncation** (`Raj` from `Rajesh`) is discounted hard when the short
 *   form is itself a common standalone name;
 * - a curated **look-alike** pair (`Michael`/`Michelle`) is capped below the
 *   match floor, so it registers as a conflict rather than a near-match.
 */

/** Fallback for callers that build a context by hand. */
const DEFAULT_DISTINCT_PAIRS = resolveDistinctPairIndex();

export interface TokenPairContext {
  aliases: AliasIndexLike;
  /** Multiplier on penalties; 1 is balanced, >1 is stricter. */
  conflictSensitivity: number;
  /** Token pairs recorded as different names. Defaults to the built-in table. */
  distinctPairs?: DistinctPairIndexLike;
  /**
   * Everything else about the configuration that changes a comparison, as one
   * string. Memoised results are keyed by it, so two configurations can never
   * read each other's answers.
   */
  variantKey?: string;
  /**
   * How much a consonant-skeleton agreement is worth.
   *
   * Raised only when one side was transliterated from a script that does not
   * write short vowels. In Latin-to-Latin comparison a shared skeleton is weak
   * evidence — `Mohammed` and `Mahmood` both reduce to `mhmd`.
   */
  skeletonWeight?: number;
}

/** Skeleton weight for ordinary Latin-to-Latin comparison. */
export const LATIN_SKELETON_WEIGHT = 0.75;
/** Skeleton weight when an abjad source makes vowels unrecoverable. */
export const ABJAD_SKELETON_WEIGHT = 0.95;

/** Score awarded when an initial agrees with a full token's first letter. */
const INITIAL_MATCH_SCORE = 0.82;
/** Score awarded when two initials are the same letter. */
const INITIAL_PAIR_SCORE = 0.88;
/** Ceiling applied to a curated look-alike pair. */
const DISTINCT_PAIR_CEILING = 0.3;
/** Ceiling applied to any purely phonetic agreement. */
const PHONETIC_CEILING = 0.74;
/** Ceiling for a pair differing by exactly one adjacent transposition. */
const TRANSPOSITION_CAP = 0.9;
/**
 * Alias strength at or above which the pair counts as a stated same-name
 * relationship. Sits above translation (0.55) and romanisation-family (0.62)
 * groups, below nickname (0.9) and variant (0.97).
 */
const STRONG_ALIAS_THRESHOLD = 0.85;
/** Applied when both tokens are attested, unrelated names. */
const DISTINCT_ATTESTED_DAMPING = 0.72;

export interface DetailedTokenPairScore extends TokenPairScore {
  /** Per-channel candidates, for debugging and explanation. */
  channels: Partial<Record<TokenMatchKind, number>>;
}

export function compareTokensDetailed(
  a: string,
  b: string,
  context: TokenPairContext,
): DetailedTokenPairScore {
  if (a === b) {
    return { score: 1, kind: 'exact', channels: { exact: 1 } };
  }
  if (a.length === 0 || b.length === 0) {
    return { score: 0, kind: 'unmatched', channels: {} };
  }

  const channels: Partial<Record<TokenMatchKind, number>> = {};

  // --- Initials ------------------------------------------------------------
  // An initial carries no information beyond its first letter, so it short
  // circuits every other channel: comparing `k` to `kumar` as a typo would be
  // meaningless.
  const aIsInitial = a.length === 1;
  const bIsInitial = b.length === 1;
  if (aIsInitial || bIsInitial) {
    const matches = a[0] === b[0];
    const score = !matches ? 0 : aIsInitial && bIsInitial ? INITIAL_PAIR_SCORE : INITIAL_MATCH_SCORE;
    channels.initial = score;
    return { score, kind: matches ? 'initial' : 'unmatched', channels };
  }

  // --- Alias ---------------------------------------------------------------
  const aliasStrength = context.aliases.aliasStrength(a, b);
  if (aliasStrength > 0) channels.alias = aliasStrength;

  // Two tokens that are both names in their own right, with no recorded
  // relationship between them, are unlikely to be a misspelling of each other.
  // This is what separates `Jenifer`/`Jennifer` from `Marco`/`Mario`.
  const bothAttested =
    aliasStrength === 0 && isAttestedName(a) && isAttestedName(b);
  const resemblanceDamping = bothAttested ? DISTINCT_ATTESTED_DAMPING : 1;

  // --- Abbreviation --------------------------------------------------------
  const abbreviation = abbreviationEvidence(a, b);
  if (abbreviation > 0) channels.abbreviation = abbreviation;

  // --- Typo ----------------------------------------------------------------
  const typo = typoChannel(a, b) * resemblanceDamping;
  if (typo > 0) channels.typo = typo;

  // --- Phonetic ------------------------------------------------------------
  const phonetic =
    phoneticChannel(a, b, context.skeletonWeight ?? LATIN_SKELETON_WEIGHT) *
    resemblanceDamping;
  if (phonetic > 0) channels.phonetic = phonetic;

  // --- Orthographic variant -------------------------------------------------
  const orthographic = orthographicVariantChannel(a, b);
  if (orthographic > 0) channels.alias = Math.max(channels.alias ?? 0, orthographic);

  let best: { score: number; kind: TokenMatchKind } = { score: 0, kind: 'unmatched' };
  for (const [kind, score] of Object.entries(channels) as Array<[TokenMatchKind, number]>) {
    if (score > best.score) best = { score, kind };
  }

  // Look-alike caps are applied last so no channel can route around them.
  //
  // A *curated* look-alike always wins — it is an explicit statement, including
  // anything the caller passed as `distinctNames`. The two *inferred* rules
  // yield only to a *strong* alias: a variant, transliteration or nickname
  // group states the two spellings are one name, which beats a suffix pattern
  // (`Ann`/`Anna`, `Noor`/`Noora`, `Ganesh`/`Ganesha`). A cross-language
  // cognate group does not — `Andre` and `Andrea` both sit under `Andrew` at
  // translation strength, and they are still different people.
  const distinctPairs = context.distinctPairs ?? DEFAULT_DISTINCT_PAIRS;
  const inferredLookAlike =
    aliasStrength < STRONG_ALIAS_THRESHOLD &&
    (isGenderedPair(a, b) || isPluralSurnamePair(a, b));
  const lookAlike = distinctPairs.has(a, b) || inferredLookAlike;
  if (lookAlike && best.score > DISTINCT_PAIR_CEILING) {
    const ceiling = Math.max(0, DISTINCT_PAIR_CEILING / Math.max(1, context.conflictSensitivity));
    best = { score: ceiling, kind: best.score > 0 ? best.kind : 'unmatched' };
    channels.unmatched = ceiling;
  }

  return { ...best, channels };
}

/**
 * Memoised token-pair comparison.
 *
 * Comparing two names of three tokens each runs this nine times for the
 * alignment, four more for the role slots and once more per cross-check. Token
 * pairs also repeat constantly across a corpus, so the cache pays twice.
 *
 * Keyed on the alias index so two configurations never share results: a caller
 * that supplied custom aliases must not see another caller's answers. A
 * `WeakMap` lets the whole cache be collected with the configuration.
 */
let pairCaches = new WeakMap<AliasIndexLike, Map<string, TokenPairScore>>();
const MAX_PAIR_CACHE_ENTRIES = 50_000;

export function compareTokens(
  a: string,
  b: string,
  context: TokenPairContext,
): TokenPairScore {
  if (a === b) return EXACT_SCORE;

  let cache = pairCaches.get(context.aliases);
  if (cache === undefined) {
    cache = new Map();
    pairCaches.set(context.aliases, cache);
  }

  // Order-independent key: the comparison is symmetric. The suffix covers every
  // configuration input, so results never leak between configurations.
  const suffix = `\u0000${context.skeletonWeight ?? 0}\u0000${context.variantKey ?? ''}`;
  const key = a < b ? `${a}\u0000${b}${suffix}` : `${b}\u0000${a}${suffix}`;

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const detailed = compareTokensDetailed(a, b, context);
  const result: TokenPairScore = { score: detailed.score, kind: detailed.kind };
  if (cache.size >= MAX_PAIR_CACHE_ENTRIES) cache.clear();
  cache.set(key, result);
  return result;
}

const EXACT_SCORE: TokenPairScore = Object.freeze({ score: 1, kind: 'exact' as const });

/** Bind a context so the result can be handed to a generic aligner. */
export function tokenScorerFor(context: TokenPairContext) {
  return (a: string, b: string): TokenPairScore => compareTokens(a, b, context);
}

/**
 * Drop every memoised token-pair result.
 *
 * Replaces the map rather than clearing it, because a `WeakMap` cannot be
 * enumerated. Existing alias indexes simply start accumulating again.
 */
export function clearTokenPairCaches(): void {
  pairCaches = new WeakMap();
}

/* -------------------------------------------------------------------------- */
/* Channels                                                                   */
/* -------------------------------------------------------------------------- */

export function abbreviationEvidence(a: string, b: string): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];

  const known = KNOWN_CONTRACTIONS[short];
  if (known?.includes(long)) return 0.95;

  const analysis = analyzeAbbreviation(a, b);
  if (analysis.shape === 'none') return 0;

  if (analysis.shape === 'contraction') {
    return Math.min(0.95, analysis.strength);
  }

  if (analysis.shape === 'truncation') {
    // A prefix is only weak evidence, and no evidence at all when the short
    // form is a name people are actually christened with.
    const standalone = STANDALONE_SHORT_NAMES.has(short) || isAttestedGivenName(short);
    const damping = standalone ? 0.45 : 0.8;
    return analysis.strength * damping;
  }

  // `skeleton` agreement is handled by the phonetic channel, where it is both
  // weighted by script provenance and subject to the attested-name damping.
  return 0;
}

/**
 * Endings that turn a masculine given name into a distinct feminine one.
 *
 * A rule rather than a list, because the pattern is productive across
 * languages: `Robert`/`Roberta`, `Simon`/`Simone`, `Daniel`/`Danielle`,
 * `Karim`/`Karima`, `Martin`/`Martina`.
 */
const GENDERED_ENDINGS = ['a', 'e', 'le', 'na', 'ia', 'ina', 'ine', 'elle', 'ette', 'etta'];

/**
 * True when one token is the other plus a gendered ending, and the base is an
 * attested given name.
 *
 * Restricted to given names on purpose: the same trailing `e` that separates
 * `Simon` from `Simone` merely respells `Clark` as `Clarke`.
 */
export function isGenderedPair(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3 || long.length <= short.length) return false;
  if (!isAttestedGivenName(short)) return false;
  if (!long.startsWith(short)) return false;
  // `Neha` -> `Nehaa` doubles the final letter; it is a respelling, not a
  // different, gendered name.
  if (isLetterDoubling(short, long)) return false;
  return GENDERED_ENDINGS.includes(long.slice(short.length));
}

/**
 * True when one surname is the other plus a trailing `s`.
 *
 * In English these are separate families, not spellings of one: `Brook` and
 * `Brooks`, `Wood` and `Woods`, `Evan` and `Evans`. Given names are excluded,
 * because there the same shape is often one name — `Luca` and `Lucas`,
 * `Thoma` and `Thomas`.
 */
export function isPluralSurnamePair(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 4) return false;
  if (long !== `${short}s`) return false;
  return !isAttestedGivenName(short);
}

/**
 * Orthographic surname variants: a silent trailing `e`, or a doubled consonant
 * written once.
 *
 * `Clark`/`Clarke`, `Brown`/`Browne`, `Bergman`/`Bergmann` are one family name
 * each. The length floor keeps short tokens out, where the same rule would
 * merge genuinely different names such as `Lee` and `Le`.
 */
/**
 * Four rather than five: many Indian given names are four letters and vary by
 * exactly one of these folds (`Anup`/`Anoop`, `Amit`/`Ameet`, `Anil`/`Aneel`).
 * Three would be too permissive — it would merge `Lee` with `Li`.
 */
const MIN_ORTHOGRAPHIC_LENGTH = 4;
const ORTHOGRAPHIC_VARIANT_SCORE = 0.93;

function orthographicVariantChannel(a: string, b: string): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_ORTHOGRAPHIC_LENGTH) return 0;
  if (isGenderedPair(a, b) || isPluralSurnamePair(a, b)) return 0;

  if (long === `${short}e`) return ORTHOGRAPHIC_VARIANT_SCORE;
  if (isLetterDoubling(short, long)) return ORTHOGRAPHIC_VARIANT_SCORE;
  if (orthographicKey(a) === orthographicKey(b)) return ORTHOGRAPHIC_VARIANT_SCORE;
  return 0;
}

/**
 * True when `long` is `short` with one letter written twice.
 *
 * Position-sensitive on purpose. Collapsing every double first would call
 * `Hopper` and `Hooper` the same name, since both reduce to `hoper`.
 */
function isLetterDoubling(short: string, long: string): boolean {
  if (long.length !== short.length + 1) return false;
  for (let index = 0; index < long.length; index++) {
    const removed = long.slice(0, index) + long.slice(index + 1);
    if (removed !== short) continue;
    const doubled = long[index];
    if (doubled === long[index - 1] || doubled === long[index + 1]) return true;
  }
  return false;
}

/**
 * Spelling-neutral key for interchangeable digraphs.
 *
 * Two families of substitution, both of which respell one name rather than
 * produce a different one:
 *
 * - English: `ph`/`f`, `ck`/`k`, and a non-initial `y`/`i` — `Sofia`/`Sophia`,
 *   `Eriksen`/`Ericksen`, `Tiwari`/`Tiwary`.
 * - Indic romanisation, where no standard exists and the same name is written
 *   half a dozen ways: aspirated consonants lose their `h` (`Bhavesh`/`Bavesh`,
 *   `Geetha`/`Geeta`, `Padmanabhan`/`Padmanaban`), `ee`/`oo` collapse to `i`/`u`
 *   (`Rajeev`/`Rajiv`, `Anoop`/`Anup`), and `ksh` is written `x`
 *   (`Lakshmi`/`Laxmi`).
 *
 * Deliberately excludes `z`/`s`, which separates the Spanish and Portuguese
 * branches of surnames such as `Nunez` and `Nunes`, and `sh`/`s`, which
 * separates genuinely different Indian surnames such as `Shah` and `Sah`.
 */
function orthographicKey(value: string): string {
  const folded = value
    .replace(/ksh/g, 'x')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    // Aspirated consonants: bh dh gh jh kh th -> b d g j k t
    .replace(/([bdgjkt])h/g, '$1')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u');

  // `y` reads as `i` except word-initially, where it is a distinct sound.
  const key = folded.charAt(0) + folded.slice(1).replace(/y/g, 'i');
  return key.replace(/e$/, '');
}

function typoChannel(a: string, b: string): number {
  const distance = damerauLevenshteinDistance(a, b);
  const longest = Math.max(a.length, b.length);
  const editSimilarity = 1 - distance / longest;
  const jaroWinkler = jaroWinklerSimilarity(a, b);
  const blended = 0.55 * editSimilarity + 0.45 * jaroWinkler;

  // Absolute distance matters more than the ratio for short names: one edit in
  // a four-letter name is a different event from one edit in a twelve-letter
  // name, yet both score 0.75 and 0.92 on ratio alone.
  //
  // A single adjacent transposition is the exception. It is the archetypal
  // typing slip and almost never yields another real name, so `Jonh`/`John`
  // deserves more credit than an arbitrary one-character substitution.
  const transposed = longest >= 4 && isSingleTransposition(a, b);
  const cap = transposed
    ? Math.max(TRANSPOSITION_CAP, distanceCap(distance, longest))
    : distanceCap(distance, longest);
  return Math.min(Math.max(blended, transposed ? TRANSPOSITION_CAP : 0), cap);
}

/**
 * Ceiling on typo evidence given the absolute edit distance.
 *
 * Absolute distance matters more than the ratio, because a name's information
 * is concentrated: one edit in `Jennifer` leaves the name recognisable, while
 * one edit in `Jing` produces a completely different name.
 */
function distanceCap(distance: number, longest: number): number {
  if (distance === 0) return 1;
  if (distance === 1) {
    if (longest >= 8) return 0.94;
    if (longest >= 6) return 0.9;
    if (longest === 5) return 0.82;
    if (longest === 4) return 0.72;
    return 0.5;
  }
  if (distance === 2) {
    if (longest >= 10) return 0.86;
    if (longest >= 8) return 0.76;
    if (longest >= 6) return 0.62;
    if (longest >= 5) return 0.5;
    return 0.34;
  }
  if (distance === 3) {
    if (longest >= 11) return 0.74;
    if (longest >= 8) return 0.6;
    return 0.36;
  }
  return Math.max(0, 0.55 - 0.06 * (distance - 3));
}

function phoneticChannel(a: string, b: string, skeletonWeight: number): number {
  const phonetic = phoneticSimilarity(a, b);
  const skeleton = skeletonSimilarity(a, b);

  // Consonant-skeleton agreement is the signal that survives abjad
  // transliteration, where the source script never wrote the vowels.
  const combined = Math.max(phonetic, skeleton * skeletonWeight);

  const base =
    combined >= 0.99
      ? PHONETIC_CEILING
      : combined >= 0.95
        ? PHONETIC_CEILING - 0.05
        : combined >= 0.85
          ? 0.66
          : combined >= 0.75
            ? 0.56
            : combined * 0.5;

  // Two discounts, for the two ways a phonetic key over-generalises:
  //  - short tokens produce one- or two-character keys that collide constantly
  //    (`Lee` and `Li` both reduce to `L`);
  //  - identical keys with distant spellings are weak evidence (`Bakker` and
  //    `Becker` share a key without sharing a single vowel).
  const orthographicSupport = 0.62 + 0.38 * jaroWinklerSimilarity(a, b);
  return base * shortTokenDamping(Math.min(a.length, b.length)) * orthographicSupport;
}

function shortTokenDamping(shortestLength: number): number {
  if (shortestLength >= 5) return 1;
  if (shortestLength === 4) return 0.92;
  if (shortestLength === 3) return 0.78;
  return 0.62;
}
