import {
  doubleMetaphone,
  doubleMetaphoneFull,
  metaphoneCodesMatch,
  type MetaphoneCodes,
} from './double-metaphone.js';
import { nysiis } from './nysiis.js';
import { refinedSoundex, soundex } from './soundex.js';

export { soundex, refinedSoundex } from './soundex.js';
export { nysiis } from './nysiis.js';
export {
  doubleMetaphone,
  doubleMetaphoneFull,
  metaphoneCodesMatch,
  type MetaphoneCodes,
} from './double-metaphone.js';

export interface PhoneticCodes {
  metaphoneFull: MetaphoneCodes;
  metaphoneShort: MetaphoneCodes;
  soundex: string;
  refinedSoundex: string;
  nysiis: string;
}

const MAX_CACHE_ENTRIES = 20_000;
const codeCache = new Map<string, PhoneticCodes>();

/** Compute and memoise every phonetic key for a token. */
export function phoneticCodes(token: string): PhoneticCodes {
  const cached = codeCache.get(token);
  if (cached) return cached;

  const full = doubleMetaphoneFull(token);
  const codes: PhoneticCodes = {
    metaphoneFull: full,
    metaphoneShort: [full[0].slice(0, 4), full[1].slice(0, 4)],
    soundex: soundex(token),
    refinedSoundex: refinedSoundex(token),
    nysiis: nysiis(token),
  };

  if (codeCache.size >= MAX_CACHE_ENTRIES) codeCache.clear();
  codeCache.set(token, codes);
  return codes;
}

export function clearPhoneticCache(): void {
  codeCache.clear();
}

/**
 * Graded phonetic agreement between two tokens.
 *
 * Graded rather than boolean because the algorithms disagree in an informative
 * order: a full Double Metaphone match is far stronger evidence than a shared
 * Soundex key, and collapsing both to `1` throws that away.
 */
export function phoneticSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const left = phoneticCodes(a);
  const right = phoneticCodes(b);

  if (left.metaphoneFull[0].length === 0 || right.metaphoneFull[0].length === 0) return 0;

  if (left.metaphoneFull[0] === right.metaphoneFull[0]) return 1;
  if (metaphoneCodesMatch(left.metaphoneFull, right.metaphoneFull)) return 0.95;

  if (left.nysiis === right.nysiis && left.nysiis.length > 1) return 0.85;
  if (metaphoneCodesMatch(left.metaphoneShort, right.metaphoneShort)) return 0.8;

  // Partial agreement: how much of the shorter code the longer one reproduces.
  const overlap = codePrefixOverlap(left.metaphoneFull[0], right.metaphoneFull[0]);
  if (left.soundex === right.soundex && left.soundex.length > 0) {
    return Math.max(0.6, overlap * 0.7);
  }
  if (left.refinedSoundex === right.refinedSoundex) return Math.max(0.55, overlap * 0.65);

  return overlap * 0.6;
}

function codePrefixOverlap(a: string, b: string): number {
  const shortest = Math.min(a.length, b.length);
  if (shortest === 0) return 0;
  let shared = 0;
  while (shared < shortest && a[shared] === b[shared]) shared++;
  return shared / Math.max(a.length, b.length);
}

/** Boolean form used for explanation text. */
export function isPhoneticMatch(a: string, b: string): boolean {
  return phoneticSimilarity(a, b) >= 0.95;
}

/** Classic four-character keys, useful for blocking in a record-linkage pass. */
export function phoneticKey(token: string): string {
  return doubleMetaphone(token)[0] || soundex(token);
}
