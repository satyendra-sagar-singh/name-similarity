/**
 * Soundex (American, as used by the US Census) and Refined Soundex.
 *
 * Kept because it is extremely cheap and catches a class of Germanic and
 * Anglo spelling drift that Double Metaphone smooths away. It is never used
 * alone: its four-character key is far too coarse for a matching decision.
 */

const SOUNDEX_CODES: Record<string, string> = {
  b: '1',
  f: '1',
  p: '1',
  v: '1',
  c: '2',
  g: '2',
  j: '2',
  k: '2',
  q: '2',
  s: '2',
  x: '2',
  z: '2',
  d: '3',
  t: '3',
  l: '4',
  m: '5',
  n: '5',
  r: '6',
};

/** `h` and `w` are transparent: they do not break a repeated code run. */
const TRANSPARENT = new Set(['h', 'w']);

export function soundex(input: string): string {
  const letters = input.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length === 0) return '';

  const first = letters[0]!;
  let previousCode = SOUNDEX_CODES[first] ?? '';
  let output = first.toUpperCase();

  for (let index = 1; index < letters.length && output.length < 4; index++) {
    const char = letters[index]!;
    const code = SOUNDEX_CODES[char];

    if (code === undefined) {
      // Vowels reset the run; h/w keep it alive.
      if (!TRANSPARENT.has(char)) previousCode = '';
      continue;
    }
    if (code !== previousCode) output += code;
    previousCode = code;
  }

  return output.padEnd(4, '0');
}

const REFINED_CODES: Record<string, string> = {
  b: '1',
  p: '1',
  f: '2',
  v: '2',
  c: '3',
  k: '3',
  s: '3',
  g: '4',
  j: '4',
  q: '5',
  x: '5',
  z: '5',
  d: '6',
  t: '6',
  l: '7',
  m: '8',
  n: '8',
  r: '9',
};

/** Refined Soundex keeps a variable-length key and never truncates. */
export function refinedSoundex(input: string): string {
  const letters = input.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length === 0) return '';

  let output = letters[0]!.toUpperCase();
  let previousCode = '';

  for (const char of letters) {
    const code = REFINED_CODES[char] ?? '0';
    if (code !== previousCode) output += code;
    previousCode = code;
  }

  return output;
}
