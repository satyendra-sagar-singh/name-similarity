import { resolveOptions } from './config.js';
import { buildFeatureVector } from './features/feature-vector.js';
import { clearNormalizeCache, normalizeVariants } from './normalize/index.js';
import { parseNormalized } from './parse/person-name.js';
import {
  DEFAULT_CALIBRATION,
  bandOf,
  confidenceOf,
  probabilityOf,
  toScore,
} from './scoring/calibration.js';
import { explain } from './scoring/explain.js';
import { scoreHeuristic } from './scoring/heuristic.js';
import { isModelTrained, predictProbability } from './scoring/model.js';
import { clearTokenPairCaches } from './features/token-pair.js';
import { clearPhoneticCache } from './similarity/phonetic/index.js';
import type {
  DetailedMatchResult,
  FeatureVector,
  MatchOptions,
  MatchResult,
  NormalizedName,
  ResolvedOptions,
} from './types.js';

/**
 * `name-similarity` — person-name similarity with an explainable 1-100 score.
 *
 * ```ts
 * import { matchNames } from 'name-similarity';
 *
 * matchNames('Mohammad Abdul Rahman', 'Mohd A Rahman');
 * // { score: 93, matched: true, confidence: 'high' }
 * ```
 */

export function matchNames(
  nameA: string,
  nameB: string,
  options: MatchOptions & { detailed: true },
): DetailedMatchResult;
export function matchNames(
  nameA: string,
  nameB: string,
  options?: MatchOptions & { detailed?: false },
): MatchResult;
export function matchNames(
  nameA: string,
  nameB: string,
  options?: MatchOptions,
): MatchResult | DetailedMatchResult;
export function matchNames(
  nameA: string,
  nameB: string,
  options: MatchOptions = {},
): MatchResult | DetailedMatchResult {
  return runMatch(nameA, nameB, resolveOptions(options));
}

/** Score only, for callers that just want the number. */
export function similarityScore(
  nameA: string,
  nameB: string,
  options: MatchOptions = {},
): number {
  return runMatch(nameA, nameB, resolveOptions({ ...options, detailed: false })).score;
}

/**
 * Reusable matcher.
 *
 * Resolving options builds an alias index; doing that once and reusing it is
 * measurably faster when comparing many pairs with the same configuration.
 */
export class NameMatcher<Detailed extends boolean = false> {
  private readonly options: ResolvedOptions;
  /** Pre-built non-detailed variant so `score` allocates nothing per call. */
  private readonly scoreOptions: ResolvedOptions;

  constructor(options: MatchOptions & { detailed?: Detailed } = {} as MatchOptions & { detailed?: Detailed }) {
    this.options = resolveOptions(options);
    this.scoreOptions = { ...this.options, detailed: false };
  }

  /**
   * Result type follows the `detailed` flag given to the constructor, so a
   * caller never has to narrow a union that was decided at construction.
   */
  match(nameA: string, nameB: string): Detailed extends true ? DetailedMatchResult : MatchResult {
    return runMatch(nameA, nameB, this.options) as Detailed extends true
      ? DetailedMatchResult
      : MatchResult;
  }

  score(nameA: string, nameB: string): number {
    return runMatch(nameA, nameB, this.scoreOptions).score;
  }

  /** Best matches for `name` from `candidates`, highest score first. */
  rank(
    name: string,
    candidates: readonly string[],
    limit = candidates.length,
  ): Array<{ candidate: string; score: number; matched: boolean }> {
    return candidates
      .map((candidate) => {
        const result = runMatch(name, candidate, this.scoreOptions);
        return { candidate, score: result.score, matched: result.matched };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}

/** One-shot ranking helper. */
export function rankNames(
  name: string,
  candidates: readonly string[],
  options: MatchOptions = {},
): Array<{ candidate: string; score: number; matched: boolean }> {
  return new NameMatcher(options).rank(name, candidates);
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

interface Evaluation {
  similarity: number;
  partsA: NormalizedName;
  partsB: NormalizedName;
  parsed: { a: ReturnType<typeof parseNormalized>; b: ReturnType<typeof parseNormalized> };
  featureResult: ReturnType<typeof buildFeatureVector>;
  heuristic: ReturnType<typeof scoreHeuristic>;
}

function runMatch(
  nameA: string,
  nameB: string,
  options: ResolvedOptions,
): MatchResult | DetailedMatchResult {
  const startedAt = options.detailed ? now() : 0;

  const variantsA = normalizeVariants(nameA, options.normalize);
  const variantsB = normalizeVariants(nameB, options.normalize);
  const primaryA = variantsA[0]!;
  const primaryB = variantsB[0]!;

  // Fast path: identical normalised names cannot be improved on, and this is
  // the single most common comparison in a de-duplication workload. Affixes
  // must agree too — `John Smith Jr` and `John Smith Sr` normalise alike.
  if (
    options.fastPath &&
    !options.detailed &&
    primaryA.normalized.length > 0 &&
    primaryA.normalized === primaryB.normalized &&
    sameAffixes(primaryA, primaryB)
  ) {
    return { score: 100, matched: 100 >= options.threshold, confidence: 'very-high' };
  }

  // Ambiguous honorifics produce a second reading of a name; take whichever
  // pairing the evidence supports best.
  let best: Evaluation | null = null;
  for (const partsA of variantsA) {
    for (const partsB of variantsB) {
      const evaluation = evaluate(nameA, nameB, partsA, partsB, options);
      if (best === null || evaluation.similarity > best.similarity) best = evaluation;
    }
  }

  const { partsA, partsB, parsed, featureResult, heuristic } = best!;
  let similarity = best!.similarity;
  let model: 'heuristic' | 'logistic' = 'heuristic';

  if (options.model === 'logistic') {
    if (!isModelTrained()) {
      throw new Error(
        'name-similarity: { model: "logistic" } was requested but no trained model is bundled. Run `npm run train` first.',
      );
    }
    similarity = predictProbability(featureResult.features);
    model = 'logistic';
  }

  const parsedA = parsed.a;
  const parsedB = parsed.b;
  const score = toScore(similarity);
  const matched = score >= options.threshold;
  const confidence = confidenceOf(score);

  if (!options.detailed) return { score, matched, confidence };

  const evidence = explain({
    features: featureResult.features,
    roles: featureResult.roles,
    pairs: featureResult.pairs,
    unmatchedA: featureResult.unmatchedA,
    unmatchedB: featureResult.unmatchedB,
    gates: heuristic.gates,
    partsA,
    partsB,
  });

  return {
    score,
    matched,
    confidence,
    band: bandOf(score),
    probability:
      model === 'logistic' ? similarity : probabilityOf(similarity, DEFAULT_CALIBRATION),
    model,
    normalized: { a: partsA.normalized, b: partsB.normalized },
    parts: { a: partsA, b: partsB },
    parsed: { a: parsedA, b: parsedB },
    components: { ...heuristic.components, ...toPlainRecord(featureResult.features) },
    features: featureResult.features,
    reasons: evidence.map((reason) => reason.message),
    evidence,
    alignment: featureResult.alignment,
    elapsedMs: now() - startedAt,
  };
}

/**
 * Feature vector for a pair, without scoring it.
 *
 * Exposed so callers can train their own model on their own labelled data
 * using exactly the features the built-in models see.
 */
export function extractFeatures(
  nameA: string,
  nameB: string,
  options: MatchOptions = {},
): FeatureVector {
  const resolved = resolveOptions(options);
  const variantsA = normalizeVariants(nameA, resolved.normalize);
  const variantsB = normalizeVariants(nameB, resolved.normalize);

  let best: Evaluation | null = null;
  for (const partsA of variantsA) {
    for (const partsB of variantsB) {
      const evaluation = evaluate(nameA, nameB, partsA, partsB, resolved);
      if (best === null || evaluation.similarity > best.similarity) best = evaluation;
    }
  }
  return best!.featureResult.features;
}

/** Score one pairing of normalised readings. */
function evaluate(
  nameA: string,
  nameB: string,
  partsA: NormalizedName,
  partsB: NormalizedName,
  options: ResolvedOptions,
): Evaluation {
  const parsedA = parseNormalized(partsA, options.parse);
  const parsedB = parseNormalized(partsB, options.parse);

  const featureResult = buildFeatureVector(partsA, partsB, parsedA, parsedB, {
    aliases: options.aliasIndex,
    distinctPairs: options.distinctPairs,
    conflictSensitivity: options.conflictSensitivity,
    variantKey: options.variantKey,
    originalA: nameA,
    originalB: nameB,
  });

  const heuristic = scoreHeuristic(
    featureResult.features,
    options.weights,
    options.conflictSensitivity,
  );

  return {
    similarity: heuristic.value,
    partsA,
    partsB,
    parsed: { a: parsedA, b: parsedB },
    featureResult,
    heuristic,
  };
}

function sameAffixes(a: NormalizedName, b: NormalizedName): boolean {
  const equal = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && left.every((value, index) => value === right[index]);
  return equal(a.titles, b.titles) && equal(a.suffixes, b.suffixes);
}

function toPlainRecord(features: FeatureVector): Record<string, number> {
  return { ...features } as unknown as Record<string, number>;
}

const hasPerformance = typeof globalThis.performance?.now === 'function';
function now(): number {
  return hasPerformance ? globalThis.performance.now() : Date.now();
}

/** Drop every internal cache. Useful in long-lived processes under memory pressure. */
export function clearCaches(): void {
  clearNormalizeCache();
  clearPhoneticCache();
  clearTokenPairCaches();
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                             */
/* -------------------------------------------------------------------------- */

export type {
  AliasMap,
  AliasIndexLike,
  BenchmarkReport,
  CategoryMetrics,
  Confidence,
  DetailedMatchResult,
  DistinctPairIndexLike,
  ExpectedLabel,
  FeatureVector,
  HeuristicWeights,
  LabeledPair,
  LocaleCode,
  MatchMode,
  MatchOptions,
  MatchResult,
  NormalizeOptions,
  NormalizedName,
  ParseOptions,
  ParsedName,
  Reason,
  ResolvedOptions,
  ScoreBand,
  ScriptName,
  TokenAlignment,
  TokenMatchKind,
} from './types.js';

export { DEFAULT_MODE, MODE_PRESETS, resolveOptions, type ModePreset } from './config.js';

export {
  DEFAULT_NORMALIZE_OPTIONS,
  detectScript,
  detectScripts,
  differsOnlyByAccents,
  foldAccents,
  isLatinScript,
  isTransliterable,
  normalize,
  normalizeVariants,
  transliterate,
} from './normalize/index.js';

export { groupParticles, isParticle, familyHead, PARTICLES } from './normalize/particles.js';
export {
  DEFAULT_SUFFIXES,
  DEFAULT_TITLES,
  GENERATIONAL_SUFFIXES,
  canonicalGenerational,
} from './normalize/titles.js';

export { parseName, parseNormalized, parseNames } from './parse/person-name.js';
export {
  familyKey,
  familyString,
  familyTokens,
  firstGiven,
  middleTokens,
} from './parse/name-parts.js';

export { toTokens, tokenSetStats, initialsOf, concatenationVariants } from './tokenize/tokenizer.js';

export { exactSimilarity, commonPrefixLength } from './similarity/exact.js';
export { levenshteinDistance, levenshteinSimilarity } from './similarity/levenshtein.js';
export {
  damerauLevenshteinDistance,
  damerauSimilarity,
  isSingleTransposition,
} from './similarity/damerau.js';
export {
  jaroSimilarity,
  jaroWinklerSimilarity,
  symmetricJaroWinkler,
} from './similarity/jaro-winkler.js';
export {
  consonantSkeleton,
  isSubsequence,
  longestCommonSubsequenceLength,
  strictConsonantSkeleton,
} from './similarity/sequence.js';
export {
  doubleMetaphone,
  doubleMetaphoneFull,
  isPhoneticMatch,
  nysiis,
  phoneticCodes,
  phoneticKey,
  phoneticSimilarity,
  refinedSoundex,
  soundex,
} from './similarity/phonetic/index.js';
export { compareInitials, initialCompatibility } from './similarity/initials.js';
export {
  abbreviationSimilarity,
  analyzeAbbreviation,
  skeletonSimilarity,
} from './similarity/abbreviation.js';
export { alignTokens, tokenJaccard, MATCH_FLOOR } from './similarity/token.js';
export { solveAssignment, solveMaxAssignment } from './similarity/assignment.js';
export {
  isCompleteReversal,
  kendallTauDistance,
  orderSimilarityFromIndices,
} from './similarity/order.js';

export {
  FEATURE_KEYS,
  ZERO_FEATURES,
  buildFeatureVector,
  reconcileConcatenations,
} from './features/feature-vector.js';
export {
  compareTokens,
  compareTokensDetailed,
  clearTokenPairCaches,
} from './features/token-pair.js';
export { tokenRarity, isVeryCommon } from './features/frequency.js';

export { DEFAULT_WEIGHTS, scoreHeuristic } from './scoring/heuristic.js';
export {
  DEFAULT_CALIBRATION,
  PRIOR_CALIBRATION,
  bandOf,
  confidenceOf,
  fitCalibration,
  fromScore,
  probabilityOf,
  toScore,
  type PlattCalibration,
} from './scoring/calibration.js';
export {
  TRAINED_MODEL,
  featuresToArray,
  isModelTrained,
  predictProbability,
  trainLogistic,
  type LogisticModel,
  type TrainOptions,
  type TrainingSample,
} from './scoring/model.js';
export { collectConflicts, interactionFloor, evidenceCeiling } from './scoring/conflict.js';

export {
  AliasIndex,
  DistinctPairIndex,
  distinctSignature,
  resolveAliasIndex,
  resolveDistinctPairIndex,
} from './aliases/resolver.js';
export {
  DEFAULT_ALIAS_GROUPS,
  DISTINCT_NAME_PAIRS,
  KNOWN_CONTRACTIONS,
  STANDALONE_SHORT_NAMES,
} from './aliases/default.js';
export type { AliasGroup, AliasKind } from './aliases/types.js';
