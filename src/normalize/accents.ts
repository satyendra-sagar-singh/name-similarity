import { stripCombiningMarks, toNFC, toNFKD } from './unicode.js';

/**
 * Letters that carry a diacritic *inside* the glyph, so NFKD leaves them
 * unchanged. Without this table `Håkon`/`Hakon` folds correctly but
 * `Jørgen`/`Jorgen` does not.
 */
const ATOMIC_FOLD: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ł: 'l',
  Ł: 'L',
  ħ: 'h',
  Ħ: 'H',
  ŧ: 't',
  Ŧ: 'T',
  ı: 'i',
  İ: 'I',
  ŉ: 'n',
  ĸ: 'k',
  ŋ: 'n',
  Ŋ: 'N',
  ſ: 's',
  ẞ: 'SS',
  ǅ: 'dz',
  ǆ: 'dz',
  ǳ: 'dz',
  ǈ: 'lj',
  ǉ: 'lj',
  ǋ: 'nj',
  ǌ: 'nj',
  ﬀ: 'ff',
  ﬁ: 'fi',
  ﬂ: 'fl',
  ﬃ: 'ffi',
  ﬄ: 'ffl',
};

const ATOMIC_PATTERN = new RegExp(`[${Object.keys(ATOMIC_FOLD).join('')}]`, 'g');

/**
 * Remove diacritics and expand ligatures, leaving plain ASCII letters wherever
 * a sensible mapping exists.
 *
 * `foldAccents("José García-Márquez") === "Jose Garcia-Marquez"`
 */
export function foldAccents(input: string): string {
  const expanded = input.replace(ATOMIC_PATTERN, (char) => ATOMIC_FOLD[char] ?? char);
  return toNFC(stripCombiningMarks(toNFKD(expanded)));
}

/**
 * True when the two strings differ only by diacritics or ligature spelling.
 * Used to explain an accent-only difference rather than reporting a typo.
 */
export function differsOnlyByAccents(a: string, b: string): boolean {
  if (a === b) return false;
  return foldAccents(a).toLowerCase() === foldAccents(b).toLowerCase();
}
