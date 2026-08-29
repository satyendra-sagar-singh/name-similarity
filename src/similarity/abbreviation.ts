import { commonPrefixLength } from './exact.js';
import { consonantSkeleton, isSubsequence, strictConsonantSkeleton } from './sequence.js';

/**
 * Abbreviation primitives.
 *
 * Two shapes matter and they carry very different weight:
 *
 * - **contraction** — internal letters are dropped (`Mohd` from `Mohammad`,
 *   `Wm` from `William`). Almost nothing but deliberate abbreviation produces
 *   this pattern, so it is strong evidence.
 * - **truncation** — a plain prefix (`Raj` from `Rajesh`). Weak evidence,
 *   because the short form is frequently a complete name in its own right.
 *
 * The policy decision about how much each is worth lives in the feature layer;
 * this module only reports the shape.
 */

export type AbbreviationShape = 'none' | 'truncation' | 'contraction' | 'skeleton';

export interface AbbreviationAnalysis {
  shape: AbbreviationShape;
  /** Raw strength of the structural evidence, `0..1`. */
  strength: number;
  /** The shorter token, when one is clearly an abbreviation of the other. */
  short: string | null;
  long: string | null;
}

const NO_ABBREVIATION: AbbreviationAnalysis = Object.freeze({
  shape: 'none',
  strength: 0,
  short: null,
  long: null,
});

/** Minimum length for the abbreviated form; single letters are initials. */
const MIN_ABBREVIATION_LENGTH = 2;
/**
 * Bounds that separate a written abbreviation from an ordinary spelling
 * difference. Abbreviations are short and drop several letters — `Mohd` for
 * `Mohammad`, `Wm` for `William`. Without these bounds `Grace`/`Gracie` and
 * `Ronaldo`/`Ronaldinho` both qualify, since each is a subsequence of the other.
 */
const MAX_CONTRACTION_LENGTH = 6;
const MIN_CONTRACTION_SAVING = 2;
const MAX_CONTRACTION_RATIO = 0.8;

export function analyzeAbbreviation(a: string, b: string): AbbreviationAnalysis {
  if (a === b || a.length === 0 || b.length === 0) return NO_ABBREVIATION;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_ABBREVIATION_LENGTH) return NO_ABBREVIATION;
  if (short.length === long.length) return NO_ABBREVIATION;
  if (short[0] !== long[0]) return NO_ABBREVIATION;

  const isTruncation = long.startsWith(short);
  const subsequence = isSubsequence(short, long);

  const coverage = short.length / long.length;
  const looksAbbreviated =
    short.length <= MAX_CONTRACTION_LENGTH &&
    long.length - short.length >= MIN_CONTRACTION_SAVING &&
    coverage <= MAX_CONTRACTION_RATIO;

  if (subsequence && !isTruncation && looksAbbreviated) {
    // Letters were skipped inside a short form: a real contraction.
    return {
      shape: 'contraction',
      strength: 0.72 + 0.28 * Math.min(1, coverage * 1.6),
      short,
      long,
    };
  }

  if (isTruncation) {
    const coverage = short.length / long.length;
    return {
      shape: 'truncation',
      strength: 0.35 + 0.45 * coverage,
      short,
      long,
    };
  }

  // Neither shape held. Fall back to a consonant-skeleton comparison, which is
  // what recovers vowel-dropped forms such as `Mhmd` for `Mohammad`.
  const shortSkeleton = strictConsonantSkeleton(short);
  const longSkeleton = strictConsonantSkeleton(long);
  if (
    shortSkeleton.length >= 2 &&
    shortSkeleton === longSkeleton &&
    consonantSkeleton(short)[0] === consonantSkeleton(long)[0]
  ) {
    return { shape: 'skeleton', strength: 0.8, short, long };
  }

  return NO_ABBREVIATION;
}

/** Numeric convenience wrapper. */
export function abbreviationSimilarity(a: string, b: string): number {
  return analyzeAbbreviation(a, b).strength;
}

/**
 * Consonant-skeleton agreement, `0..1`.
 *
 * The primary tool for abjad transliterations, where short vowels are simply
 * absent from the source script.
 */
export function skeletonSimilarity(a: string, b: string): number {
  const left = strictConsonantSkeleton(a);
  const right = strictConsonantSkeleton(b);
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;

  const shared = commonPrefixLength(left, right);
  const longest = Math.max(left.length, right.length);
  return shared / longest;
}
