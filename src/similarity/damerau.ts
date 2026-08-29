/**
 * Damerau-Levenshtein distance with unrestricted transpositions.
 *
 * The unrestricted variant (not the cheaper optimal-string-alignment
 * approximation) matters for names: `Jonhatan` -> `Jonathan` needs two
 * transpositions that share a character, which OSA over-counts.
 */

/** Reused across calls; grown on demand and never shared across ticks. */
let scratch = new Uint32Array(1024);

export function damerauLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length;
  const columns = b.length;
  const maxDistance = rows + columns;

  // Distance matrix padded by one row/column holding the "infinite" sentinel.
  // Flat, reused, and indexed arithmetically: accessor closures and a fresh
  // typed array per call together cost more than the algorithm itself.
  const width = columns + 2;
  const needed = (rows + 2) * width;
  if (scratch.length < needed) scratch = new Uint32Array(Math.max(needed, 1024));
  const matrix = scratch;
  matrix.fill(0, 0, needed);

  matrix[0] = maxDistance;
  for (let row = 0; row <= rows; row++) {
    const base = (row + 1) * width;
    matrix[base] = maxDistance;
    matrix[base + 1] = row;
  }
  for (let column = 0; column <= columns; column++) {
    matrix[column + 1] = maxDistance;
    matrix[width + column + 1] = column;
  }

  /** Last row in which each character of `a` was seen. */
  const lastRowByChar = charRowScratch;
  lastRowByChar.clear();

  for (let row = 1; row <= rows; row++) {
    const charA = a.charCodeAt(row - 1);
    let lastMatchColumn = 0;
    const previousBase = row * width;
    const currentBase = (row + 1) * width;

    for (let column = 1; column <= columns; column++) {
      const charB = b.charCodeAt(column - 1);
      const lastRow = lastRowByChar.get(charB) ?? 0;
      const substitutionCost = charA === charB ? 0 : 1;

      const deletion = matrix[previousBase + column + 1]! + 1;
      const insertion = matrix[currentBase + column]! + 1;
      const substitution = matrix[previousBase + column]! + substitutionCost;
      const transposition =
        matrix[lastRow * width + lastMatchColumn]! +
        (row - lastRow - 1) +
        1 +
        (column - lastMatchColumn - 1);

      let value = deletion < insertion ? deletion : insertion;
      if (substitution < value) value = substitution;
      if (transposition < value) value = transposition;

      matrix[currentBase + column + 1] = value;
      if (substitutionCost === 0) lastMatchColumn = column;
    }

    lastRowByChar.set(charA, row);
  }

  return matrix[(rows + 1) * width + columns + 1]!;
}

const charRowScratch = new Map<number, number>();

/** Distance normalised to `0..1`, where 1 means identical. */
export function damerauSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - damerauLevenshteinDistance(a, b) / longest;
}

/** True when the pair differs by exactly one adjacent transposition. */
export function isSingleTransposition(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const differing: number[] = [];
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) differing.push(index);
    if (differing.length > 2) return false;
  }
  if (differing.length !== 2) return false;
  const [first, second] = differing as [number, number];
  return second === first + 1 && a[first] === b[second] && a[second] === b[first];
}
