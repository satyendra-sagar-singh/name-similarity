import { longestCommonSubsequenceLength } from './sequence.js';

/**
 * Initial-sequence comparison.
 *
 * `A. K. Sharma` and `Ajay Kumar Sharma` share nothing at the string level and
 * everything at the initial level, so this is the feature that carries the
 * pairing.
 */

export interface InitialsComparison {
  /** Compatibility of the two initial sequences, `0..1`. */
  similarity: number;
  /** True when either side is written wholly or partly as initials. */
  usesInitials: boolean;
  /** True when the shorter sequence is contained in the longer, in order. */
  containment: boolean;
  a: string;
  b: string;
}

export function initialsOf(tokens: readonly string[]): string {
  return tokens.map((token) => token[0] ?? '').join('');
}

export function compareInitials(
  tokensA: readonly string[],
  tokensB: readonly string[],
): InitialsComparison {
  const a = initialsOf(tokensA);
  const b = initialsOf(tokensB);
  const usesInitials =
    tokensA.some((token) => token.length === 1) || tokensB.some((token) => token.length === 1);

  if (a.length === 0 || b.length === 0) {
    return { similarity: 0, usesInitials, containment: false, a, b };
  }
  if (a === b) {
    return { similarity: 1, usesInitials, containment: true, a, b };
  }

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const shared = longestCommonSubsequenceLength(shorter, longer);
  const containment = shared === shorter.length;

  // Containment means the shorter name is a sub-sequence of the longer one,
  // which is what dropping a middle name looks like.
  if (containment) {
    const lengthPenalty = shorter.length / longer.length;
    return {
      similarity: 0.75 + 0.25 * lengthPenalty,
      usesInitials,
      containment: true,
      a,
      b,
    };
  }

  return {
    similarity: shared / longer.length,
    usesInitials,
    containment: false,
    a,
    b,
  };
}

/**
 * Whether a one-letter token is compatible with a full token.
 *
 * Returns `0` rather than a small value on mismatch: an initial that disagrees
 * is a genuine contradiction, not a weak signal.
 */
export function initialCompatibility(initial: string, full: string): number {
  if (initial.length !== 1 || full.length === 0) return 0;
  return initial[0] === full[0] ? 1 : 0;
}
