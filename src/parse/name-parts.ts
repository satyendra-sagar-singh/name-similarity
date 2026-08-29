import { familyHead, isParticle } from '../normalize/particles.js';
import type { ParsedName } from '../types.js';

/** Helpers for reading a {@link ParsedName} without re-deriving its shape. */

export const EMPTY_PARSED_NAME: ParsedName = Object.freeze({
  given: [],
  middle: [],
  family: [],
  suffix: [],
  title: [],
  tokens: [],
  ambiguous: true,
}) as ParsedName;

/** Primary given name, or `null` when the name has none. */
export function firstGiven(name: ParsedName): string | null {
  return name.given[0] ?? null;
}

/** Family unit joined for display, e.g. `van der berg`. */
export function familyString(name: ParsedName): string | null {
  return name.family.length > 0 ? name.family.join(' ') : null;
}

/** Family unit with particles dropped and spaces removed, for comparison. */
export function familyKey(name: ParsedName): string | null {
  if (name.family.length === 0) return null;
  const head = familyHead(name.family);
  return head.length > 0 ? head : null;
}

/** Every family token including particles, flattened. */
export function familyTokens(name: ParsedName): string[] {
  return name.family.flatMap((part) => part.split(' ')).filter(Boolean);
}

/** Middle tokens with particles removed. */
export function middleTokens(name: ParsedName): string[] {
  return name.middle
    .flatMap((part) => part.split(' '))
    .filter((token) => token.length > 0 && !isParticle(token));
}
