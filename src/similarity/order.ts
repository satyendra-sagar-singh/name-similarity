import { longestIncreasingSubsequenceLength } from './sequence.js';

/**
 * Token-order metrics.
 *
 * Order is evidence in both directions. `Smith John` matching `John Smith`
 * should stay high — most registries invert names — but the inversion is worth
 * recording, because two records that disagree on order also disagree on which
 * token is the family name.
 */

/**
 * Fraction of aligned positions that keep their relative order.
 *
 * `indices` holds the B-side position of each aligned token, listed in A-side
 * order. Uses the longest increasing subsequence so that an inserted middle
 * name is not mistaken for a reordering.
 */
export function orderSimilarityFromIndices(indices: readonly number[]): number {
  if (indices.length <= 1) return 1;
  return longestIncreasingSubsequenceLength(indices) / indices.length;
}

/** Normalised Kendall tau distance in `0..1`, where 0 means identical order. */
export function kendallTauDistance(indices: readonly number[]): number {
  const count = indices.length;
  if (count < 2) return 0;
  let discordant = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      if (indices[i]! > indices[j]!) discordant++;
    }
  }
  return discordant / ((count * (count - 1)) / 2);
}

/** True when the alignment is a full reversal rather than a partial shuffle. */
export function isCompleteReversal(indices: readonly number[]): boolean {
  if (indices.length < 2) return false;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i]! >= indices[i - 1]!) return false;
  }
  return true;
}
