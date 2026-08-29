import { STANDALONE_SHORT_NAMES } from '../aliases/default.js';
import { canonicalGenerational } from '../normalize/titles.js';
import { familyKey, middleTokens } from '../parse/name-parts.js';
import { damerauLevenshteinDistance } from '../similarity/damerau.js';
import { compareInitials } from '../similarity/initials.js';
import { jaroWinklerSimilarity } from '../similarity/jaro-winkler.js';
import { phoneticSimilarity } from '../similarity/phonetic/index.js';
import {
  alignTokens,
  tokenJaccard,
  type AlignedPair,
  type TokenAlignmentResult,
} from '../similarity/token.js';
import { concatenationVariants, tokenSetStats } from '../tokenize/tokenizer.js';
import type {
  FeatureVector,
  NormalizedName,
  ParsedName,
  TokenAlignment,
} from '../types.js';
import { rarityWeightedAgreement } from './frequency.js';
import {
  ABJAD_SKELETON_WEIGHT,
  LATIN_SKELETON_WEIGHT,
  abbreviationEvidence,
  compareTokens,
  tokenScorerFor,
  type TokenPairContext,
} from './token-pair.js';

/**
 * Feature generation.
 *
 * Consumes normalised and parsed names, emits a {@link FeatureVector}. Nothing
 * downstream of this module sees a string, and nothing in this module knows
 * what a score is — that separation is what lets the heuristic scorer be
 * swapped for a trained model without touching name logic.
 */

export interface FeatureContext extends TokenPairContext {
  /** Raw inputs, needed only for the byte-identical check. */
  originalA: string;
  originalB: string;
}

export interface FeatureResult {
  features: FeatureVector;
  alignment: TokenAlignment[];
  /** Roles as finally interpreted, after any reordering was resolved. */
  roles: RoleComparison;
  /** Aligned pairs with their evidence kind, for explanation generation. */
  pairs: AlignedPair[];
  unmatchedA: string[];
  unmatchedB: string[];
}

export interface RoleComparison {
  first: number;
  middle: number;
  last: number;
  firstAvailable: boolean;
  lastAvailable: boolean;
  swapped: boolean;
  firstTokens: [string | null, string | null];
  lastTokens: [string | null, string | null];
}

/** Below this a role is treated as contradicted rather than merely different. */
const CONFLICT_THRESHOLD = 0.5;

export function buildFeatureVector(
  partsA: NormalizedName,
  partsB: NormalizedName,
  parsedA: ParsedName,
  parsedB: ParsedName,
  context: FeatureContext,
): FeatureResult {
  const reconciled = reconcileConcatenations(partsA.tokens, partsB.tokens);
  const tokensA = reconciled.a;
  const tokensB = reconciled.b;

  if (tokensA.length === 0 || tokensB.length === 0) {
    return emptyResult(partsA, partsB);
  }

  // Vowel-less source scripts make the consonant skeleton the only reliable
  // signal, so it is trusted more here than in Latin-to-Latin comparison.
  const scoringContext: TokenPairContext = {
    ...context,
    skeletonWeight: usesAbjadSource(partsA, partsB)
      ? ABJAD_SKELETON_WEIGHT
      : LATIN_SKELETON_WEIGHT,
  };

  const familyA = familyKey(parsedA);
  const familyB = familyKey(parsedB);
  const givenA = parsedA.given[0] ?? null;
  const givenB = parsedB.given[0] ?? null;

  const scorer = tokenScorerFor(scoringContext);
  const alignment = alignTokens(tokensA, tokensB, scorer);
  const roles = compareRoles(parsedA, parsedB, scoringContext, givenA, givenB, familyA, familyB);
  const setStats = tokenSetStats(tokensA, tokensB);

  const compactA = tokensA.join('');
  const compactB = tokensB.join('');
  const longestCompact = Math.max(compactA.length, compactB.length);

  const editSimilarity =
    longestCompact === 0
      ? 0
      : 1 - damerauLevenshteinDistance(compactA, compactB) / longestCompact;
  const jaroWinkler = jaroWinklerSimilarity(compactA, compactB);

  const middlesA = middleTokens(parsedA);
  const middlesB = middleTokens(parsedB);
  const middleState = compareMiddles(middlesA, middlesB, scoringContext);

  // Initials are compared in the interpretation the role comparison chose, so
  // a reordered name is not also penalised for having reordered initials.
  const initials = compareInitials(tokensA, roles.swapped ? swapEnds(tokensB) : tokensB);

  const suffixConflict = compareSuffixes(partsA.suffixes, partsB.suffixes);

  const abbreviation = bestAbbreviationEvidence(alignment.pairs);
  const alias = bestAliasEvidence(alignment.pairs, scoringContext);

  const phonetic = aggregatePhonetic(alignment.pairs, tokensA.length, tokensB.length);

  const familyConflict = roles.lastAvailable && roles.last < CONFLICT_THRESHOLD
    ? conflictAfterCrossCheck(roles.lastTokens, tokensA, tokensB, scoringContext)
    : 0;
  const givenConflict = roles.firstAvailable && roles.first < CONFLICT_THRESHOLD
    ? conflictAfterCrossCheck(roles.firstTokens, tokensA, tokensB, scoringContext)
    : 0;

  const shortestTokenLength = Math.min(
    ...[...tokensA, ...tokensB].filter((token) => token.length > 1).map((token) => token.length),
    99,
  );

  const crossScript =
    partsA.script !== partsB.script && (partsA.script !== 'latin' || partsB.script !== 'latin')
      ? 1
      : 0;

  const features: FeatureVector = {
    exact: context.originalA === context.originalB ? 1 : 0,
    normalizedExact: partsA.normalized === partsB.normalized && partsA.normalized.length > 0 ? 1 : 0,
    compactExact: compactA === compactB && compactA.length > 0 ? 1 : 0,
    tokenSetExact: setStats.identicalMultiset ? 1 : 0,

    tokenSimilarity: alignment.coverage,
    coreTokenSimilarity: alignment.coreCoverage,
    tokenJaccard: tokenJaccard(tokensA, tokensB),
    tokenOrderSimilarity: alignment.orderSimilarity,
    reordered: roles.swapped ? 1 : 0,

    firstNameSimilarity: roles.first,
    middleNameSimilarity: middleState.similarity,
    lastNameSimilarity: roles.last,
    firstNameKnown: roles.firstAvailable ? 1 : 0,
    lastNameKnown: roles.lastAvailable ? 1 : 0,

    editSimilarity: Math.max(0, editSimilarity),
    jaroWinklerSimilarity: jaroWinkler,
    phoneticSimilarity: phonetic.overall,
    firstNamePhoneticSimilarity: pairPhonetic(roles.firstTokens),
    lastNamePhoneticSimilarity: pairPhonetic(roles.lastTokens),

    initialsSimilarity: initials.similarity,
    abbreviationSimilarity: abbreviation,
    aliasSimilarity: alias,
    transliterationSimilarity:
      partsA.transliterated || partsB.transliterated ? alignment.coverage : 0,

    tokenCountDifference: Math.abs(tokensA.length - tokensB.length),
    lengthDifference:
      longestCompact === 0 ? 0 : Math.abs(compactA.length - compactB.length) / longestCompact,
    minTokenCount: Math.min(tokensA.length, tokensB.length),
    shortestTokenLength: shortestTokenLength === 99 ? 1 : shortestTokenLength,

    middleNameOmitted: middleState.omitted ? 1 : 0,
    middleNameConflict: middleState.conflict ? 1 : 0,
    familyNameConflict: familyConflict,
    givenNameConflict: givenConflict,
    suffixConflict,
    affixMismatch: affixMismatch(partsA, partsB),
    distinctNamePenalty: distinctPenalty(roles),
    truncationRisk: truncationRisk(givenA, givenB, familyA, familyB),
    // Counted before concatenation reconciliation: `Abdul Rahman` merged to
    // match `Abdulrahman` is not a single-token record.
    singleTokenName: partsA.tokens.length === 1 || partsB.tokens.length === 1 ? 1 : 0,
    crossScript,

    rarityWeightedAgreement: rarityWeightedAgreement(
      alignment.pairs,
      [...alignment.unmatchedA.map((item) => item.token), ...alignment.unmatchedB.map((item) => item.token)],
    ),
  };

  return {
    features,
    alignment: toPublicAlignment(alignment),
    roles,
    pairs: alignment.pairs,
    unmatchedA: alignment.unmatchedA.map((item) => item.token),
    unmatchedB: alignment.unmatchedB.map((item) => item.token),
  };
}

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compare given/middle/family slots, trying both the literal reading and the
 * reading in which one side has its given and family names swapped.
 *
 * Registries invert names constantly, and a swapped reading that scores far
 * better is much more likely to be the truth than a coincidence.
 */
function compareRoles(
  parsedA: ParsedName,
  parsedB: ParsedName,
  context: TokenPairContext,
  givenA: string | null,
  givenB: string | null,
  familyA: string | null,
  familyB: string | null,
): RoleComparison {

  const direct = {
    first: roleScore(givenA, givenB, context),
    last: roleScore(familyA, familyB, context),
  };
  const swapped = {
    first: roleScore(givenA, familyB, context),
    last: roleScore(familyA, givenB, context),
  };

  const directTotal = direct.first.score + direct.last.score;
  const swappedTotal = swapped.first.score + swapped.last.score;
  const useSwapped = swappedTotal > directTotal + 0.15;

  const chosen = useSwapped ? swapped : direct;
  return {
    first: chosen.first.score,
    last: chosen.last.score,
    middle: 1,
    firstAvailable: chosen.first.available,
    lastAvailable: chosen.last.available,
    swapped: useSwapped,
    firstTokens: useSwapped ? [givenA, familyB] : [givenA, givenB],
    lastTokens: useSwapped ? [familyA, givenB] : [familyA, familyB],
  };
}

/**
 * A missing slot is neutral, not a contradiction. `Cher` has no family name in
 * the record; that is not evidence against a match with `Cher Bono`.
 */
function roleScore(
  a: string | null,
  b: string | null,
  context: TokenPairContext,
): { score: number; available: boolean } {
  if (a === null && b === null) return { score: 1, available: false };
  if (a === null || b === null) return { score: 0.5, available: false };
  return { score: compareTokens(a, b, context).score, available: true };
}

/**
 * A role disagreement is only a conflict when the token has no home anywhere in
 * the other name. `Jose Garcia Marquez` vs `Jose Marquez` puts `Marquez` in
 * different slots without any contradiction.
 */
function conflictAfterCrossCheck(
  tokens: [string | null, string | null],
  tokensA: readonly string[],
  tokensB: readonly string[],
  context: TokenPairContext,
): number {
  const [a, b] = tokens;
  if (a === null || b === null) return 0;
  const aFoundInB = tokensB.some((token) => compareTokens(a, token, context).score >= 0.75);
  const bFoundInA = tokensA.some((token) => compareTokens(b, token, context).score >= 0.75);
  return aFoundInB || bFoundInA ? 0 : 1;
}

/* -------------------------------------------------------------------------- */
/* Middles, suffixes, evidence aggregation                                    */
/* -------------------------------------------------------------------------- */

interface MiddleState {
  similarity: number;
  omitted: boolean;
  conflict: boolean;
}

function compareMiddles(
  middlesA: readonly string[],
  middlesB: readonly string[],
  context: TokenPairContext,
): MiddleState {
  if (middlesA.length === 0 && middlesB.length === 0) {
    return { similarity: 1, omitted: false, conflict: false };
  }
  if (middlesA.length === 0 || middlesB.length === 0) {
    // One side simply did not record a middle name. Neutral evidence, flagged
    // separately so the scorer can apply a small, explicit cost.
    return { similarity: 1, omitted: true, conflict: false };
  }

  const alignment = alignTokens(middlesA, middlesB, tokenScorerFor(context));
  return {
    similarity: alignment.coreCoverage,
    omitted: middlesA.length !== middlesB.length,
    conflict: alignment.coreCoverage < CONFLICT_THRESHOLD,
  };
}

const ABJAD_SCRIPTS = new Set(['arabic', 'hebrew']);

/** True when either side came from a script that omits short vowels. */
function usesAbjadSource(a: NormalizedName, b: NormalizedName): boolean {
  return (
    (a.transliterated && ABJAD_SCRIPTS.has(a.script)) ||
    (b.transliterated && ABJAD_SCRIPTS.has(b.script))
  );
}

/** 1 when the two sides carry different titles or suffixes. */
function affixMismatch(a: NormalizedName, b: NormalizedName): number {
  const same = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && left.every((value, index) => value === right[index]);
  return same(a.titles, b.titles) && same(a.suffixes, b.suffixes) ? 0 : 1;
}

function compareSuffixes(a: readonly string[], b: readonly string[]): number {
  const generationalA = a.map(canonicalGenerational).filter((value): value is string => value !== null);
  const generationalB = b.map(canonicalGenerational).filter((value): value is string => value !== null);
  if (generationalA.length === 0 || generationalB.length === 0) return 0;
  const overlap = generationalA.some((value) => generationalB.includes(value));
  return overlap ? 0 : 1;
}

function bestAbbreviationEvidence(pairs: readonly AlignedPair[]): number {
  let best = 0;
  for (const pair of pairs) {
    // Reuses the token channel so the feature can never disagree with the
    // policy the alignment actually applied.
    const evidence =
      pair.kind === 'abbreviation' ? pair.score : abbreviationEvidence(pair.a, pair.b) * 0.8;
    if (evidence > best) best = evidence;
  }
  return best;
}

function bestAliasEvidence(pairs: readonly AlignedPair[], context: TokenPairContext): number {
  let best = 0;
  for (const pair of pairs) {
    best = Math.max(best, context.aliases.aliasStrength(pair.a, pair.b));
  }
  return best === 1 ? 0 : best; // identical tokens are not alias evidence
}

function aggregatePhonetic(
  pairs: readonly AlignedPair[],
  countA: number,
  countB: number,
): { overall: number } {
  const denominator = Math.max(countA, countB);
  if (denominator === 0) return { overall: 0 };
  let total = 0;
  for (const pair of pairs) {
    total +=
      pair.kind === 'initial'
        ? pair.score
        : Math.max(phoneticSimilarity(pair.a, pair.b), pair.a === pair.b ? 1 : 0);
  }
  return { overall: Math.min(1, total / denominator) };
}

function pairPhonetic(tokens: [string | null, string | null]): number {
  const [a, b] = tokens;
  if (a === null || b === null) return 0;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 1 : 0;
  return phoneticSimilarity(a, b);
}

function distinctPenalty(roles: RoleComparison): number {
  const firstLooksWrong = roles.firstAvailable && roles.first > 0 && roles.first <= 0.32;
  const lastLooksWrong = roles.lastAvailable && roles.last > 0 && roles.last <= 0.32;
  return firstLooksWrong || lastLooksWrong ? 1 : 0;
}

/**
 * Flags the `Raj` / `Rajesh` shape, where a complete short name is also a
 * prefix of a longer one. The pair may still be the same person; the scorer
 * decides, but it must know the risk exists.
 */
function truncationRisk(
  givenA: string | null,
  givenB: string | null,
  familyA: string | null,
  familyB: string | null,
): number {
  const risky = (a: string | null, b: string | null): boolean => {
    if (!a || !b || a === b) return false;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (!long.startsWith(short) || short.length < 2) return false;
    return STANDALONE_SHORT_NAMES.has(short);
  };
  return risky(givenA, givenB) || risky(familyA, familyB) ? 1 : 0;
}

/* -------------------------------------------------------------------------- */
/* Token preprocessing                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Merge adjacent tokens whose concatenation matches a single token on the
 * other side.
 *
 * `Abdul Rahman` vs `Abdulrahman` and `Van Der Berg` vs `Vanderberg` are
 * spacing conventions, not different names, and leaving them unmerged costs
 * two unmatched tokens on every such pair.
 */
export function reconcileConcatenations(
  tokensA: readonly string[],
  tokensB: readonly string[],
): { a: string[]; b: string[]; merged: boolean } {
  if (tokensA.length === tokensB.length) return { a: [...tokensA], b: [...tokensB], merged: false };

  const [shorter, longer, longerIsA] =
    tokensA.length < tokensB.length
      ? [tokensA, tokensB, false]
      : [tokensB, tokensA, true];

  const shorterSet = new Set(shorter);
  const variants = concatenationVariants(longer).filter((variant) => shorterSet.has(variant.text));
  if (variants.length === 0) return { a: [...tokensA], b: [...tokensB], merged: false };

  // Apply the longest merges first and never overlap two merges.
  variants.sort((left, right) => right.end - right.start - (left.end - left.start));
  const consumed = new Set<number>();
  const merges: Array<{ start: number; end: number; text: string }> = [];

  for (const variant of variants) {
    let free = true;
    for (let index = variant.start; index <= variant.end; index++) {
      if (consumed.has(index)) free = false;
    }
    if (!free) continue;
    for (let index = variant.start; index <= variant.end; index++) consumed.add(index);
    merges.push(variant);
  }

  const rebuilt: string[] = [];
  for (let index = 0; index < longer.length; index++) {
    const merge = merges.find((candidate) => candidate.start === index);
    if (merge) {
      rebuilt.push(merge.text);
      index = merge.end;
      continue;
    }
    if (!consumed.has(index)) rebuilt.push(longer[index]!);
  }

  return longerIsA
    ? { a: rebuilt, b: [...tokensB], merged: true }
    : { a: [...tokensA], b: rebuilt, merged: true };
}

function swapEnds(tokens: readonly string[]): string[] {
  if (tokens.length < 2) return [...tokens];
  const copy = [...tokens];
  const first = copy[0]!;
  copy[0] = copy[copy.length - 1]!;
  copy[copy.length - 1] = first;
  return copy;
}

function toPublicAlignment(alignment: TokenAlignmentResult): TokenAlignment[] {
  const pairs: TokenAlignment[] = alignment.pairs.map((pair) => ({
    a: pair.a,
    b: pair.b,
    score: pair.score,
    kind: pair.kind,
  }));
  for (const item of alignment.unmatchedA) {
    pairs.push({ a: item.token, b: null, score: 0, kind: 'unmatched' });
  }
  for (const item of alignment.unmatchedB) {
    pairs.push({ a: null, b: item.token, score: 0, kind: 'unmatched' });
  }
  return pairs;
}

function emptyResult(partsA: NormalizedName, partsB: NormalizedName): FeatureResult {
  const bothEmpty = partsA.tokens.length === 0 && partsB.tokens.length === 0;
  return {
    features: {
      ...ZERO_FEATURES,
      exact: bothEmpty ? 1 : 0,
      normalizedExact: bothEmpty ? 1 : 0,
      compactExact: bothEmpty ? 1 : 0,
      singleTokenName: 1,
    },
    alignment: [],
    roles: {
      first: 0,
      middle: 0,
      last: 0,
      firstAvailable: false,
      lastAvailable: false,
      swapped: false,
      firstTokens: [null, null],
      lastTokens: [null, null],
    },
    pairs: [],
    unmatchedA: [...partsA.tokens],
    unmatchedB: [...partsB.tokens],
  };
}

/** All-zero baseline, exported so the trainer can enumerate feature keys. */
export const ZERO_FEATURES: FeatureVector = Object.freeze({
  exact: 0,
  normalizedExact: 0,
  compactExact: 0,
  tokenSetExact: 0,
  tokenSimilarity: 0,
  coreTokenSimilarity: 0,
  tokenJaccard: 0,
  tokenOrderSimilarity: 0,
  reordered: 0,
  firstNameSimilarity: 0,
  middleNameSimilarity: 0,
  lastNameSimilarity: 0,
  firstNameKnown: 0,
  lastNameKnown: 0,
  editSimilarity: 0,
  jaroWinklerSimilarity: 0,
  phoneticSimilarity: 0,
  lastNamePhoneticSimilarity: 0,
  firstNamePhoneticSimilarity: 0,
  initialsSimilarity: 0,
  abbreviationSimilarity: 0,
  aliasSimilarity: 0,
  transliterationSimilarity: 0,
  tokenCountDifference: 0,
  lengthDifference: 0,
  minTokenCount: 0,
  shortestTokenLength: 0,
  middleNameOmitted: 0,
  middleNameConflict: 0,
  familyNameConflict: 0,
  givenNameConflict: 0,
  suffixConflict: 0,
  affixMismatch: 0,
  distinctNamePenalty: 0,
  truncationRisk: 0,
  singleTokenName: 0,
  crossScript: 0,
  rarityWeightedAgreement: 0,
});

export const FEATURE_KEYS = Object.keys(ZERO_FEATURES) as Array<keyof FeatureVector>;
