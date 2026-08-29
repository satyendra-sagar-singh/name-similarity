import type { ScriptName } from '../types.js';

/**
 * Unicode-level utilities: NFC/NFKD normalisation and script detection.
 *
 * Deliberately free of name semantics — this module only knows about code
 * points, never about first names or families.
 */

const SCRIPT_RANGES: Array<[number, number, ScriptName]> = [
  [0x0041, 0x005a, 'latin'],
  [0x0061, 0x007a, 'latin'],
  [0x00c0, 0x024f, 'latin'],
  [0x1e00, 0x1eff, 'latin'],
  [0x2c60, 0x2c7f, 'latin'],
  [0xa720, 0xa7ff, 'latin'],
  [0x0370, 0x03ff, 'greek'],
  [0x1f00, 0x1fff, 'greek'],
  [0x0400, 0x052f, 'cyrillic'],
  [0x2de0, 0x2dff, 'cyrillic'],
  [0x0590, 0x05ff, 'hebrew'],
  [0xfb1d, 0xfb4f, 'hebrew'],
  [0x0600, 0x06ff, 'arabic'],
  [0x0750, 0x077f, 'arabic'],
  [0x08a0, 0x08ff, 'arabic'],
  [0xfb50, 0xfdff, 'arabic'],
  [0xfe70, 0xfeff, 'arabic'],
  [0x0900, 0x097f, 'devanagari'],
  [0xa8e0, 0xa8ff, 'devanagari'],
  [0x0980, 0x09ff, 'bengali'],
  [0x0a00, 0x0a7f, 'gurmukhi'],
  [0x0a80, 0x0aff, 'gujarati'],
  [0x0b80, 0x0bff, 'tamil'],
  [0x0c00, 0x0c7f, 'telugu'],
  [0x0e00, 0x0e7f, 'thai'],
  [0x3040, 0x309f, 'kana'],
  [0x30a0, 0x30ff, 'kana'],
  [0x31f0, 0x31ff, 'kana'],
  [0x4e00, 0x9fff, 'han'],
  [0x3400, 0x4dbf, 'han'],
  [0xf900, 0xfaff, 'han'],
  [0xac00, 0xd7af, 'hangul'],
  [0x1100, 0x11ff, 'hangul'],
];

/** Code points that carry no script signal (spaces, digits, punctuation). */
function isNeutral(code: number): boolean {
  if (code <= 0x0040) return true; // control, space, digits, common punctuation
  if (code >= 0x005b && code <= 0x0060) return true;
  if (code >= 0x007b && code <= 0x00bf) return true;
  if (code >= 0x2000 && code <= 0x206f) return true; // general punctuation
  if (code >= 0xfe00 && code <= 0xfe0f) return true; // variation selectors
  return false;
}

function scriptOfCodePoint(code: number): ScriptName | null {
  if (isNeutral(code)) return null;
  for (const [start, end, script] of SCRIPT_RANGES) {
    if (code >= start && code <= end) return script;
  }
  return null;
}

/**
 * Detect the dominant writing system of a string.
 *
 * Returns `mixed` when two or more scripts each contribute meaningful content,
 * which matters because a mixed-script input usually means the caller already
 * concatenated a native name with its romanisation.
 */
export function detectScript(input: string): ScriptName {
  const counts = new Map<ScriptName, number>();
  let recognised = 0;
  let unrecognised = 0;

  for (const char of input) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    const script = scriptOfCodePoint(code);
    if (script === null) {
      if (!isNeutral(code)) unrecognised++;
      continue;
    }
    counts.set(script, (counts.get(script) ?? 0) + 1);
    recognised++;
  }

  if (recognised === 0) return unrecognised > 0 ? 'unknown' : 'latin';

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const [topScript, topCount] = ranked[0]!;
  const secondCount = ranked[1]?.[1] ?? 0;

  // A minority script counts as "mixed" only when it is not incidental noise.
  if (secondCount >= 2 && secondCount / recognised >= 0.2) return 'mixed';
  return topCount > 0 ? topScript : 'unknown';
}

/** All distinct scripts present, ordered by frequency. */
export function detectScripts(input: string): ScriptName[] {
  const counts = new Map<ScriptName, number>();
  for (const char of input) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    const script = scriptOfCodePoint(code);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  return [...counts.entries()].sort((l, r) => r[1] - l[1]).map(([script]) => script);
}

export function isLatinScript(script: ScriptName): boolean {
  return script === 'latin' || script === 'unknown';
}

/**
 * Compatibility decomposition. Turns ﬁ into fi, ４ into 4 and separates
 * diacritics from their base letters so {@link foldAccents} can drop them.
 */
export function toNFKD(input: string): string {
  return input.normalize('NFKD');
}

export function toNFC(input: string): string {
  return input.normalize('NFC');
}

/** Combining diacritical mark blocks. */
const COMBINING_MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃰︠-︯]/g;

export function stripCombiningMarks(input: string): string {
  return input.replace(COMBINING_MARKS, '');
}

/** Zero-width and directional formatting characters that survive NFKD. */
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿­]/g;

export function stripInvisible(input: string): string {
  return input.replace(INVISIBLE, '');
}
