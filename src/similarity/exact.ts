/**
 * Exact comparisons.
 *
 * Trivial by design: keeping them here means the scoring layer never inlines a
 * `a === b` that would later need to become locale-aware.
 */

export function exactSimilarity(a: string, b: string): number {
  return a === b ? 1 : 0;
}

/** Length of the shared leading run. */
export function commonPrefixLength(a: string, b: string, limit = Infinity): number {
  const max = Math.min(a.length, b.length, limit);
  let index = 0;
  while (index < max && a[index] === b[index]) index++;
  return index;
}
