/**
 * NYSIIS (New York State Identification and Intelligence System).
 *
 * Built specifically for personal names and noticeably better than Soundex on
 * European surnames, which is why it earns a place next to Double Metaphone.
 */

const PREFIX_RULES: Array<[RegExp, string]> = [
  [/^MAC/, 'MCC'],
  [/^KN/, 'NN'],
  [/^K/, 'C'],
  [/^PH/, 'FF'],
  [/^PF/, 'FF'],
  [/^SCH/, 'SSS'],
];

const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/EE$/, 'Y'],
  [/IE$/, 'Y'],
  [/DT$/, 'D'],
  [/RT$/, 'D'],
  [/RD$/, 'D'],
  [/NT$/, 'D'],
  [/ND$/, 'D'],
];

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

export function nysiis(input: string): string {
  let word = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (word.length === 0) return '';

  for (const [pattern, replacement] of PREFIX_RULES) {
    if (pattern.test(word)) {
      word = word.replace(pattern, replacement);
      break;
    }
  }
  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (pattern.test(word)) {
      word = word.replace(pattern, replacement);
      break;
    }
  }

  const first = word[0]!;
  let key = first;
  let previous = first;

  for (let index = 1; index < word.length; index++) {
    let char = word[index]!;
    const next = word[index + 1] ?? '';

    if (char === 'E' && next === 'V') {
      char = 'AF';
      index++;
    } else if (VOWELS.has(char)) {
      char = 'A';
    } else if (char === 'Q') {
      char = 'G';
    } else if (char === 'Z') {
      char = 'S';
    } else if (char === 'M') {
      char = 'N';
    } else if (char === 'K') {
      char = next === 'N' ? 'N' : 'C';
      if (next === 'N') index++;
    } else if (char === 'S' && word.startsWith('CH', index)) {
      char = 'SS';
      index += 2;
    } else if (char === 'P' && next === 'H') {
      char = 'FF';
      index++;
    } else if (char === 'H' && (!VOWELS.has(previous) || !VOWELS.has(next))) {
      char = previous;
    } else if (char === 'W' && VOWELS.has(previous)) {
      char = previous;
    }

    if (char.length > 0 && char[0] !== key[key.length - 1]) key += char;
    previous = word[index] ?? previous;
  }

  key = key.replace(/S$/, '');
  key = key.replace(/AY$/, 'Y');
  key = key.replace(/A$/, '');

  return key.length > 0 ? key : first;
}
