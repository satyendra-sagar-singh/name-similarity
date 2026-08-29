import { isParticle } from '../normalize/particles.js';

/**
 * Token model.
 *
 * A token carries enough provenance for the name-intelligence layer to reason
 * about it — most importantly whether a one-letter token is a real initial
 * (`A. K. Sharma`) or the debris of an apostrophe split (`O'Brien`).
 */
export interface NameToken {
  text: string;
  index: number;
  /** Single letter, i.e. an initial rather than a name. */
  isInitial: boolean;
  /** Nobiliary or patronymic particle (`van`, `de`, `bin`). */
  isParticle: boolean;
  length: number;
}

export function toTokens(tokens: readonly string[]): NameToken[] {
  return tokens.map((text, index) => ({
    text,
    index,
    isInitial: text.length === 1,
    isParticle: isParticle(text),
    length: text.length,
  }));
}

/** Token-set statistics used by the feature layer. */
export interface TokenSetStats {
  intersection: string[];
  unionSize: number;
  onlyInA: string[];
  onlyInB: string[];
  jaccard: number;
  identicalMultiset: boolean;
}

export function tokenSetStats(a: readonly string[], b: readonly string[]): TokenSetStats {
  const countsA = counted(a);
  const countsB = counted(b);

  const intersection: string[] = [];
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];

  const keys = new Set([...countsA.keys(), ...countsB.keys()]);
  let intersectionSize = 0;
  let unionSize = 0;

  for (const key of keys) {
    const inA = countsA.get(key) ?? 0;
    const inB = countsB.get(key) ?? 0;
    const shared = Math.min(inA, inB);
    intersectionSize += shared;
    unionSize += Math.max(inA, inB);
    for (let i = 0; i < shared; i++) intersection.push(key);
    for (let i = 0; i < inA - inB; i++) onlyInA.push(key);
    for (let i = 0; i < inB - inA; i++) onlyInB.push(key);
  }

  return {
    intersection,
    unionSize,
    onlyInA,
    onlyInB,
    jaccard: unionSize === 0 ? 0 : intersectionSize / unionSize,
    identicalMultiset:
      a.length === b.length && onlyInA.length === 0 && onlyInB.length === 0 && a.length > 0,
  };
}

function counted(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/**
 * Every way consecutive tokens can be glued together, capped by `maxParts`.
 *
 * Needed because `Abdul Rahman` and `Abdulrahman` are the same name written
 * with different spacing conventions, as are `Van Der Berg` and `Vanderberg`.
 */
export function concatenationVariants(
  tokens: readonly string[],
  maxParts = 3,
): Array<{ text: string; start: number; end: number }> {
  const variants: Array<{ text: string; start: number; end: number }> = [];
  for (let start = 0; start < tokens.length; start++) {
    let buffer = '';
    for (let end = start; end < Math.min(tokens.length, start + maxParts); end++) {
      buffer += tokens[end]!;
      if (end > start) variants.push({ text: buffer, start, end });
    }
  }
  return variants;
}

/** Leading letters of each token, particles skipped. */
export function initialsOf(tokens: readonly string[], includeParticles = false): string[] {
  return tokens
    .filter((token) => includeParticles || !isParticle(token))
    .map((token) => token[0] ?? '')
    .filter(Boolean);
}
