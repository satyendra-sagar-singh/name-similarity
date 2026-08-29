/**
 * Public contract for `name-similarity`.
 *
 * Layering rule enforced by this file: nothing here imports from the algorithm
 * layers. Types flow downward (index -> scoring -> features -> similarity),
 * never upward.
 */

/* -------------------------------------------------------------------------- */
/* Score semantics                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Calibrated similarity band. This is a *similarity* label, not a probability.
 * Use {@link DetailedMatchResult.probability} when you need P(same person).
 *
 * ```text
 *  1-29   very-low    Very weak
 * 30-49   low         Weak
 * 50-69   medium      Possible
 * 70-84   high        Likely
 * 85-94   very-high   Strong
 * 95-100  very-high   Extremely strong
 * ```
 */
export type Confidence = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

/** Coarse verbal band, kept separate from {@link Confidence} for reporting. */
export type ScoreBand =
  | 'very-weak'
  | 'weak'
  | 'possible'
  | 'likely'
  | 'strong'
  | 'extremely-strong';

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

/** Result returned by `matchNames` in its default (non-detailed) mode. */
export interface MatchResult {
  /** Calibrated similarity in the inclusive range 1..100. */
  score: number;
  /** `score >= options.threshold`. */
  matched: boolean;
  confidence: Confidence;
}

/**
 * Every feature the engine derives from a pair of names.
 *
 * All members are normalised to `0..1` unless documented otherwise. This object
 * is the architectural boundary between name intelligence and scoring: the
 * scoring layer may only read from here, never from raw strings.
 */
export interface FeatureVector {
  /** 1 when the raw inputs are byte-identical. */
  exact: number;
  /** 1 when the normalised full strings are identical. */
  normalizedExact: number;
  /** 1 when the accent/punctuation-free compact forms are identical. */
  compactExact: number;
  /** 1 when both names carry exactly the same multiset of tokens. */
  tokenSetExact: number;

  /** Assignment-based token overlap, penalised by unmatched tokens. */
  tokenSimilarity: number;
  /** Assignment-based token overlap over the *shorter* name only. */
  coreTokenSimilarity: number;
  /** Jaccard index over token sets. */
  tokenJaccard: number;
  /** 1 when aligned tokens appear in the same relative order. */
  tokenOrderSimilarity: number;
  /** 1 when a token-order swap was required to reach the best alignment. */
  reordered: number;

  firstNameSimilarity: number;
  middleNameSimilarity: number;
  lastNameSimilarity: number;
  /** 1 when both names actually have a given-name slot to compare. */
  firstNameKnown: number;
  /** 1 when both names actually have a family-name slot to compare. */
  lastNameKnown: number;

  /** Similarity of the whole normalised string (Damerau + Jaro-Winkler blend). */
  editSimilarity: number;
  /** Jaro-Winkler over the compact forms. */
  jaroWinklerSimilarity: number;
  /** Double Metaphone / Soundex / NYSIIS agreement across aligned tokens. */
  phoneticSimilarity: number;
  /** Phonetic agreement restricted to the family-name slot. */
  lastNamePhoneticSimilarity: number;
  /** Phonetic agreement restricted to the given-name slot. */
  firstNamePhoneticSimilarity: number;

  /** Compatibility of initials, e.g. `A K Sharma` vs `Ajay Kumar Sharma`. */
  initialsSimilarity: number;
  /** Strength of contraction evidence, e.g. `Mohd` vs `Mohammad`. */
  abbreviationSimilarity: number;
  /** Strength of nickname/alias evidence, e.g. `Bob` vs `Robert`. */
  aliasSimilarity: number;
  /** Fraction of aligned tokens that agreed only after transliteration. */
  transliterationSimilarity: number;

  /** `|tokenCountA - tokenCountB|` (raw count, not normalised). */
  tokenCountDifference: number;
  /** Normalised character-length difference of the compact forms. */
  lengthDifference: number;
  /** Number of tokens in the shorter name (raw count, not normalised). */
  minTokenCount: number;
  /** Length of the shortest non-initial token seen (raw count). */
  shortestTokenLength: number;

  /** 1 when one name has middle tokens the other lacks. */
  middleNameOmitted: number;
  /** 1 when both sides carry middle tokens and they disagree. */
  middleNameConflict: number;
  /** 1 when family names are present on both sides and clearly disagree. */
  familyNameConflict: number;
  /** 1 when given names are present on both sides and clearly disagree. */
  givenNameConflict: number;
  /** 1 when generational suffixes disagree (`Jr` vs `Sr`). */
  suffixConflict: number;
  /** 1 when one side carries a title or suffix the other does not. */
  affixMismatch: number;
  /** 1 when the pair is a curated look-alike-but-distinct name pair. */
  distinctNamePenalty: number;
  /** 1 when one token is a strict truncation of a longer standalone name. */
  truncationRisk: number;
  /** 1 when a whole name is a single token. */
  singleTokenName: number;
  /** 1 when the two names use different writing systems. */
  crossScript: number;
  /** Identifying agreement: coverage times distinctiveness of the agreeing tokens. */
  rarityWeightedAgreement: number;
}

/** A single human-readable piece of evidence. */
export interface Reason {
  /** Stable machine-readable identifier, e.g. `last-name-identical`. */
  code: string;
  /** Sentence suitable for logs or UI. */
  message: string;
  /** Does this raise or lower the score? */
  polarity: 'positive' | 'negative' | 'neutral';
  /** Rough contribution magnitude in score points; informational only. */
  weight: number;
}

/** Normalised representations kept for one input string. */
export interface NormalizedName {
  /** Untouched input. */
  original: string;
  /** Lower-cased, accent-folded, punctuation-normalised, space-collapsed. */
  normalized: string;
  /** `normalized` with all separators removed. */
  compact: string;
  /** Name tokens after title/suffix extraction. */
  tokens: string[];
  /** Titles found and removed, e.g. `["dr"]`. */
  titles: string[];
  /** Generational/qualification suffixes found and removed, e.g. `["jr"]`. */
  suffixes: string[];
  /** Unicode script detected for the input, e.g. `latin`, `devanagari`. */
  script: ScriptName;
  /** True when the pipeline transliterated a non-Latin script. */
  transliterated: boolean;
  /** True when the input was in `Family, Given` order. */
  commaInverted: boolean;
}

export interface DetailedMatchResult extends MatchResult {
  /** Score band label matching the documented 1-100 interpretation. */
  band: ScoreBand;
  /** Calibrated P(same person) when a calibrated model is active. */
  probability: number;
  /** Which scoring model produced the score. */
  model: 'heuristic' | 'logistic';
  normalized: { a: string; b: string };
  /** Full normalisation output for both sides. */
  parts: { a: NormalizedName; b: NormalizedName };
  /** Structural parse for both sides. */
  parsed: { a: ParsedName; b: ParsedName };
  /** Backwards-compatible flat map of every feature. */
  components: Record<string, number>;
  /** The typed feature vector consumed by the scoring layer. */
  features: FeatureVector;
  /** Positive and negative evidence, strongest first. */
  reasons: string[];
  /** Structured form of `reasons`. */
  evidence: Reason[];
  /** Per-token alignment used to build the features. */
  alignment: TokenAlignment[];
  /** Wall-clock cost of this comparison in milliseconds. */
  elapsedMs: number;
}

/** How a single token from A was paired with a token from B. */
export interface TokenAlignment {
  a: string | null;
  b: string | null;
  score: number;
  kind: TokenMatchKind;
}

export type TokenMatchKind =
  | 'exact'
  | 'alias'
  | 'abbreviation'
  | 'initial'
  | 'typo'
  | 'phonetic'
  | 'concatenation'
  | 'unmatched';

/* -------------------------------------------------------------------------- */
/* Name parsing                                                               */
/* -------------------------------------------------------------------------- */

export interface ParsedName {
  /** First given name(s). Usually one token. */
  given: string[];
  /** Everything between the given and family slots. */
  middle: string[];
  /** Family name including any nobiliary particles (`van der berg`). */
  family: string[];
  /** Generational or professional suffixes (`jr`, `iii`, `phd`). */
  suffix: string[];
  /** Honorifics stripped from the front (`dr`, `mrs`). */
  title: string[];
  /** All name tokens in reading order, titles and suffixes removed. */
  tokens: string[];
  /** True when parsing had to guess because of an unusual shape. */
  ambiguous: boolean;
}

export type LocaleCode = 'en' | 'es' | 'pt' | 'nl' | 'de' | 'fr' | 'ar' | 'hi' | 'zh' | 'auto';

export interface ParseOptions {
  locale?: LocaleCode;
  /** Force `Family Given` reading (common for zh/ja/ko/hu records). */
  familyNameFirst?: boolean;
}

export type ScriptName =
  | 'latin'
  | 'devanagari'
  | 'arabic'
  | 'cyrillic'
  | 'greek'
  | 'han'
  | 'hangul'
  | 'kana'
  | 'hebrew'
  | 'bengali'
  | 'tamil'
  | 'telugu'
  | 'gurmukhi'
  | 'gujarati'
  | 'thai'
  | 'mixed'
  | 'unknown';

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Tolerance preset. Changes thresholds *and* conflict sensitivity. */
export type MatchMode = 'strict' | 'balanced' | 'fuzzy';

export type AliasMap = Record<string, string[]>;

export interface NormalizeOptions {
  /** Fold diacritics (`José` -> `jose`). Default `true`. */
  foldAccents?: boolean;
  /** Split hyphenated tokens (`Mary-Jane` -> `mary jane`). Default `true`. */
  splitHyphens?: boolean;
  /** Split on apostrophes (`O'Connor` -> `o connor`). Default `true`. */
  splitApostrophes?: boolean;
  /** Detect and strip honorifics. Default `true`. */
  stripTitles?: boolean;
  /** Detect and strip generational suffixes. Default `true`. */
  stripSuffixes?: boolean;
  /** Transliterate non-Latin scripts to Latin. Default `true`. */
  transliterate?: boolean;
  /** Extra honorifics to recognise, lower-cased and accent-free. */
  extraTitles?: string[];
  /** Extra suffixes to recognise, lower-cased and accent-free. */
  extraSuffixes?: string[];
}

export interface MatchOptions {
  /** Return {@link DetailedMatchResult} instead of {@link MatchResult}. */
  detailed?: boolean;
  /** Score at or above which `matched` is true. Defaults per {@link MatchMode}. */
  threshold?: number;
  /** Tolerance preset. Default `balanced`. */
  mode?: MatchMode;
  /** Scoring engine. Default `heuristic`. */
  model?: 'heuristic' | 'logistic';
  /** Nickname/alias groups merged into the built-in table. */
  aliases?: AliasMap;
  /** Ignore the built-in alias table entirely. Default `false`. */
  disableDefaultAliases?: boolean;
  /**
   * Token pairs your data treats as *different* names, merged into the built-in
   * look-alike table.
   *
   * The counterpart to `aliases`: that option can only make two names more
   * similar, this one only less. A registry that must keep `Nunez` and `Nunes`
   * apart, or that has been burned by a specific pair, declares it here.
   *
   * ```ts
   * matchNames(a, b, { distinctNames: [['nunez', 'nunes']] });
   * ```
   */
  distinctNames?: Array<readonly [string, string]>;
  /** Ignore the built-in look-alike table entirely. Default `false`. */
  disableDefaultDistinctNames?: boolean;
  /** Normalisation pipeline overrides. */
  normalize?: NormalizeOptions;
  /** Parser overrides, e.g. locale. */
  parse?: ParseOptions;
  /** Cache normalisation and phonetic codes across calls. Default `true`. */
  cache?: boolean;
  /**
   * Weight overrides for the heuristic model, merged over the tuned defaults.
   * Values are relative and re-normalised internally.
   */
  weights?: Partial<HeuristicWeights>;
  /** Return score 100 immediately for identical normalised names. Default `true`. */
  fastPath?: boolean;
}

/** Resolved options: every field present, no `undefined` reaches the engine. */
export interface ResolvedOptions {
  detailed: boolean;
  threshold: number;
  mode: MatchMode;
  model: 'heuristic' | 'logistic';
  normalize: Required<NormalizeOptions>;
  parse: Required<ParseOptions>;
  cache: boolean;
  fastPath: boolean;
  weights: HeuristicWeights;
  aliasIndex: AliasIndexLike;
  distinctPairs: DistinctPairIndexLike;
  /** Mode-derived multiplier applied to every conflict penalty. */
  conflictSensitivity: number;
  /**
   * Fingerprint of every setting that changes a token-pair comparison.
   *
   * Memoised token-pair results are keyed by this, so two configurations can
   * never read each other's answers.
   */
  variantKey: string;
}

/** Minimal surface the engine needs from a look-alike index. */
export interface DistinctPairIndexLike {
  /** True when the two tokens are recorded as different names. */
  has(a: string, b: string): boolean;
}

/** Minimal surface the engine needs from an alias index. */
export interface AliasIndexLike {
  /** Canonical group ids for a token, or `null` when unknown. */
  groupsOf(token: string): readonly string[] | null;
  /** True when both tokens share at least one alias group. */
  areAliases(a: string, b: string): boolean;
  /** Strength of the strongest shared group, in `0..1`; `0` when unrelated. */
  aliasStrength(a: string, b: string): number;
}

export interface HeuristicWeights {
  firstName: number;
  lastName: number;
  middleName: number;
  token: number;
  edit: number;
  phonetic: number;
  initials: number;
  abbreviation: number;
  order: number;
  alias: number;
}

/* -------------------------------------------------------------------------- */
/* Benchmark / dataset                                                        */
/* -------------------------------------------------------------------------- */

export type ExpectedLabel = 'match' | 'different';

export interface LabeledPair {
  a: string;
  b: string;
  expected: ExpectedLabel;
  /** e.g. `typo`, `initials`, `transliteration`. */
  category: string;
  /** Optional free-text note explaining a tricky case. */
  note?: string;
}

export interface CategoryMetrics {
  category: string;
  total: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
}

export interface BenchmarkReport {
  overall: CategoryMetrics;
  byCategory: CategoryMetrics[];
  threshold: number;
  /** Area under the ROC curve across all thresholds. */
  auc: number;
  /** Threshold that maximises F1 on this dataset. */
  bestThreshold: number;
  bestF1: number;
  worstCases: Array<LabeledPair & { score: number; kind: 'fp' | 'fn' }>;
}
