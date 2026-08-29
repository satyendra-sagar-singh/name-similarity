import type { TokenMatchKind } from '../types.js';
import { solveMaxAssignment } from './assignment.js';
import { orderSimilarityFromIndices } from './order.js';

/**
 * Generic token alignment.
 *
 * Deliberately ignorant of names: it takes a pairwise scoring function and
 * returns the best one-to-one alignment plus order statistics. All name
 * knowledge lives in the scorer the caller supplies.
 */

export interface TokenPairScore {
  score: number;
  kind: TokenMatchKind;
}

export type TokenPairScorer = (a: string, b: string) => TokenPairScore;

export interface AlignedPair {
  indexA: number;
  indexB: number;
  a: string;
  b: string;
  score: number;
  kind: TokenMatchKind;
}

export interface TokenAlignmentResult {
  pairs: AlignedPair[];
  unmatchedA: Array<{ index: number; token: string }>;
  unmatchedB: Array<{ index: number; token: string }>;
  /** Sum of matched scores divided by the larger token count. */
  coverage: number;
  /** Sum of matched scores divided by the smaller token count. */
  coreCoverage: number;
  /** Mean score across matched pairs, or 0 when nothing matched. */
  meanPairScore: number;
  /** 1 when matched pairs keep their relative order in both names. */
  orderSimilarity: number;
}

/** Pairs scoring below this are treated as non-matches, not weak matches. */
export const MATCH_FLOOR = 0.34;

export function alignTokens(
  tokensA: readonly string[],
  tokensB: readonly string[],
  score: TokenPairScorer,
): TokenAlignmentResult {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return {
      pairs: [],
      unmatchedA: tokensA.map((token, index) => ({ index, token })),
      unmatchedB: tokensB.map((token, index) => ({ index, token })),
      coverage: 0,
      coreCoverage: 0,
      meanPairScore: 0,
      orderSimilarity: tokensA.length === 0 && tokensB.length === 0 ? 1 : 0,
    };
  }

  const scores: TokenPairScore[][] = tokensA.map((a) => tokensB.map((b) => score(a, b)));
  const similarity = scores.map((row) => row.map((cell) => cell.score));
  const assignment = solveMaxAssignment(similarity);

  const pairs: AlignedPair[] = [];
  const matchedB = new Set<number>();

  assignment.forEach((indexB, indexA) => {
    if (indexB < 0) return;
    const cell = scores[indexA]![indexB]!;
    if (cell.score < MATCH_FLOOR) return;
    matchedB.add(indexB);
    pairs.push({
      indexA,
      indexB,
      a: tokensA[indexA]!,
      b: tokensB[indexB]!,
      score: cell.score,
      kind: cell.kind,
    });
  });

  const matchedA = new Set(pairs.map((pair) => pair.indexA));
  const unmatchedA = tokensA
    .map((token, index) => ({ index, token }))
    .filter(({ index }) => !matchedA.has(index));
  const unmatchedB = tokensB
    .map((token, index) => ({ index, token }))
    .filter(({ index }) => !matchedB.has(index));

  const total = pairs.reduce((sum, pair) => sum + pair.score, 0);
  const longer = Math.max(tokensA.length, tokensB.length);
  const shorter = Math.min(tokensA.length, tokensB.length);

  return {
    pairs,
    unmatchedA,
    unmatchedB,
    coverage: longer === 0 ? 0 : total / longer,
    coreCoverage: shorter === 0 ? 0 : Math.min(1, total / shorter),
    meanPairScore: pairs.length === 0 ? 0 : total / pairs.length,
    orderSimilarity: orderSimilarityOf(pairs),
  };
}

/**
 * How much of the alignment preserves reading order.
 *
 * Uses the longest increasing subsequence of B-indices ordered by A-index, so
 * inserting or dropping a middle name does not look like a reordering.
 */
export function orderSimilarityOf(pairs: readonly AlignedPair[]): number {
  // With nothing aligned there is no order evidence either way.
  if (pairs.length === 0) return 0.5;
  if (pairs.length === 1) return 1;
  const ordered = [...pairs].sort((left, right) => left.indexA - right.indexA);
  return orderSimilarityFromIndices(ordered.map((pair) => pair.indexB));
}

/** Simple Jaccard over token multisets, used as an independent cross-check. */
export function tokenJaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}
