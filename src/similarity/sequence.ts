/**
 * Sequence utilities shared by the token-order and abbreviation features.
 */

/** Length of the longest common subsequence. */
export function longestCommonSubsequenceLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  let previous = new Uint32Array(b.length + 1);
  let current = new Uint32Array(b.length + 1);

  for (let indexA = 1; indexA <= a.length; indexA++) {
    const charA = a[indexA - 1];
    for (let indexB = 1; indexB <= b.length; indexB++) {
      current[indexB] =
        charA === b[indexB - 1]
          ? previous[indexB - 1]! + 1
          : Math.max(previous[indexB]!, current[indexB - 1]!);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }

  return previous[b.length]!;
}

/** True when every character of `needle` appears in `haystack` in order. */
export function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length > haystack.length) return false;
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) cursor++;
    if (cursor === needle.length) return true;
  }
  return cursor === needle.length;
}

/**
 * Length of the longest strictly increasing subsequence.
 *
 * Applied to aligned token indices it measures how much of the name survived in
 * its original order, which is a better order signal than counting inversions
 * when tokens are also inserted or dropped.
 */
export function longestIncreasingSubsequenceLength(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const tails: number[] = [];

  for (const value of values) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tails[middle]! < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
  }

  return tails.length;
}

/** Consonant skeleton: vowels and repeats removed, first letter kept. */
export function consonantSkeleton(value: string): string {
  if (value.length === 0) return '';
  const letters = value.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length === 0) return '';

  const pieces: string[] = [letters[0]!];
  for (let index = 1; index < letters.length; index++) {
    const char = letters[index]!;
    if ('aeiouy'.includes(char)) continue;
    if (char === pieces[pieces.length - 1]) continue;
    pieces.push(char);
  }
  return pieces.join('');
}

/** Vowel-free, repeat-free skeleton including the first letter even if a vowel. */
export function strictConsonantSkeleton(value: string): string {
  const letters = value.toLowerCase().replace(/[^a-z]/g, '');
  let previous = '';
  const pieces: string[] = [];
  for (const char of letters) {
    if ('aeiou'.includes(char)) continue;
    if (char === previous) continue;
    pieces.push(char);
    previous = char;
  }
  return pieces.join('');
}
