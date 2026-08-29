/**
 * Levenshtein edit distance, two-row dynamic programming.
 *
 * `maxDistance` enables a banded early exit: for name matching we rarely care
 * whether a distance is 7 or 12, only that it exceeds the tolerance.
 */

export function levenshteinDistance(a: string, b: string, maxDistance = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string on the inner axis to minimise row allocation.
  let source = a;
  let target = b;
  if (source.length > target.length) [source, target] = [target, source];

  const lengthGap = target.length - source.length;
  if (lengthGap > maxDistance) return maxDistance + 1;

  const width = source.length + 1;
  let previous = new Uint32Array(width);
  let current = new Uint32Array(width);
  for (let index = 0; index < width; index++) previous[index] = index;

  for (let row = 1; row <= target.length; row++) {
    current[0] = row;
    const targetChar = target.charCodeAt(row - 1);
    let rowMinimum = current[0]!;

    for (let column = 1; column < width; column++) {
      const substitutionCost = source.charCodeAt(column - 1) === targetChar ? 0 : 1;
      const value = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + substitutionCost,
      );
      current[column] = value;
      if (value < rowMinimum) rowMinimum = value;
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    [previous, current] = [current, previous];
  }

  return previous[source.length]!;
}

/** Distance normalised to `0..1`, where 1 means identical. */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longest;
}
