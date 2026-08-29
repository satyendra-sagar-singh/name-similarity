import { commonPrefixLength } from './exact.js';

/**
 * Jaro and Jaro-Winkler similarity.
 *
 * Jaro-Winkler is the strongest single generic metric for short personal names
 * because it rewards a shared prefix, which is exactly where name variants
 * agree (`Katherine`/`Kathryn`) and where different names disagree.
 */

let flagsA = new Uint8Array(64);
let flagsB = new Uint8Array(64);

export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  // Reused flag buffers: allocating two typed arrays per call dominates the
  // cost for tokens this short.
  if (flagsA.length < a.length) flagsA = new Uint8Array(Math.max(a.length, 64));
  if (flagsB.length < b.length) flagsB = new Uint8Array(Math.max(b.length, 64));
  const matchedA = flagsA;
  const matchedB = flagsB;
  matchedA.fill(0, 0, a.length);
  matchedB.fill(0, 0, b.length);

  let matches = 0;
  for (let indexA = 0; indexA < a.length; indexA++) {
    const start = Math.max(0, indexA - matchWindow);
    const end = Math.min(indexA + matchWindow + 1, b.length);
    for (let indexB = start; indexB < end; indexB++) {
      if (matchedB[indexB] || a[indexA] !== b[indexB]) continue;
      matchedA[indexA] = 1;
      matchedB[indexB] = 1;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let indexB = 0;
  for (let indexA = 0; indexA < a.length; indexA++) {
    if (!matchedA[indexA]) continue;
    while (!matchedB[indexB]) indexB++;
    if (a[indexA] !== b[indexB]) transpositions++;
    indexB++;
  }

  const halfTranspositions = transpositions / 2;
  return (
    (matches / a.length + matches / b.length + (matches - halfTranspositions) / matches) / 3
  );
}

export interface JaroWinklerOptions {
  /** Prefix bonus per matching leading character. Standard value is 0.1. */
  scalingFactor?: number;
  /** Maximum prefix length that earns the bonus. Standard value is 4. */
  maxPrefixLength?: number;
  /** Only apply the bonus above this Jaro score. Standard value is 0.7. */
  boostThreshold?: number;
}

export function jaroWinklerSimilarity(
  a: string,
  b: string,
  options: JaroWinklerOptions = {},
): number {
  const jaro = jaroSimilarity(a, b);
  const boostThreshold = options.boostThreshold ?? 0.7;
  if (jaro < boostThreshold) return jaro;

  const scalingFactor = options.scalingFactor ?? 0.1;
  const maxPrefixLength = options.maxPrefixLength ?? 4;
  const prefix = commonPrefixLength(a, b, maxPrefixLength);
  return jaro + prefix * scalingFactor * (1 - jaro);
}

/**
 * Jaro-Winkler with a suffix bonus as well.
 *
 * Useful for family names, where the discriminating information often sits at
 * the end (`Andersen`/`Anderson`) rather than the start.
 */
export function symmetricJaroWinkler(a: string, b: string): number {
  const forward = jaroWinklerSimilarity(a, b);
  const backward = jaroWinklerSimilarity(reverse(a), reverse(b));
  return Math.max(forward, (forward + backward) / 2);
}

function reverse(value: string): string {
  return [...value].reverse().join('');
}
