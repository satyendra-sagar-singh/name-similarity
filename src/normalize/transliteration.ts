import type { ScriptName } from '../types.js';
import { detectScript, stripCombiningMarks } from './unicode.js';
import {
  ARABIC_CONSONANTS,
  ARABIC_DIACRITICS,
  ARABIC_VOWELS,
  CURATED_TRANSLITERATIONS,
  CYRILLIC_MAP,
  DEVANAGARI_CONSONANTS,
  DEVANAGARI_INDEPENDENT_VOWELS,
  DEVANAGARI_MATRAS,
  DEVANAGARI_NUKTA,
  DEVANAGARI_NUKTA_PAIRS,
  DEVANAGARI_SIGNS,
  DEVANAGARI_VIRAMA,
  GREEK_DIGRAPHS,
  GREEK_MAP,
  HAN_GIVEN,
  HAN_SURNAMES,
  HEBREW_MAP,
} from './transliteration-tables.js';

/**
 * Script-to-Latin transliteration.
 *
 * The goal is not scholarly romanisation; it is to land in the same
 * neighbourhood as the Latin spelling a person would actually use, so that the
 * downstream fuzzy and phonetic layers can finish the job. Abjads (Arabic,
 * Hebrew) drop short vowels, so the consonant-skeleton feature in the
 * similarity layer does the heavy lifting there.
 */

export interface TransliterationResult {
  text: string;
  script: ScriptName;
  transliterated: boolean;
  /** `curated` beats `rule` when reporting how confident we are. */
  source: 'none' | 'curated' | 'rule' | 'partial';
}

const SUPPORTED: ReadonlySet<ScriptName> = new Set<ScriptName>([
  'devanagari',
  'arabic',
  'cyrillic',
  'greek',
  'hebrew',
  'han',
]);

export function isTransliterable(script: ScriptName): boolean {
  return SUPPORTED.has(script);
}

/** Transliterate a whole string word by word. */
export function transliterate(input: string, scriptHint?: ScriptName): TransliterationResult {
  const script = scriptHint ?? detectScript(input);
  if (script === 'latin' || script === 'unknown') {
    return { text: input, script, transliterated: false, source: 'none' };
  }

  const words = input.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { text: input, script, transliterated: false, source: 'none' };
  }

  let anyCurated = false;
  let anyRule = false;
  let anyUnmapped = false;

  const converted = words.map((word) => {
    const curated = CURATED_TRANSLITERATIONS[word];
    if (curated) {
      anyCurated = true;
      return curated;
    }
    const wordScript = detectScript(word);
    const latin = transliterateWord(word, wordScript);
    if (latin === null) {
      anyUnmapped = true;
      return word;
    }
    if (latin !== word) anyRule = true;
    return latin;
  });

  const text = converted.join(' ').replace(/\s+/g, ' ').trim();
  const transliterated = anyCurated || anyRule;
  const source: TransliterationResult['source'] = !transliterated
    ? 'none'
    : anyUnmapped
      ? 'partial'
      : anyCurated && !anyRule
        ? 'curated'
        : 'rule';

  return { text: text.length > 0 ? text : input, script, transliterated, source };
}

function transliterateWord(word: string, script: ScriptName): string | null {
  switch (script) {
    case 'devanagari':
      return transliterateDevanagari(word);
    case 'arabic':
      return transliterateArabic(word);
    case 'cyrillic':
      return transliterateWithMap(word, CYRILLIC_MAP);
    case 'greek':
      return transliterateGreek(word);
    case 'hebrew':
      return transliterateWithMap(word, HEBREW_MAP);
    case 'han':
      return transliterateHan(word);
    default:
      return null;
  }
}

/* ------------------------------- Devanagari ------------------------------- */

/**
 * Abugida-aware transliteration.
 *
 * Every consonant carries an inherent `a` that a matra replaces, a virama
 * suppresses, and word-final position deletes (the schwa-deletion rule that
 * turns `राहुल` into `rahul` rather than `rahula`).
 */
export function transliterateDevanagari(word: string): string {
  const chars = precomposeNukta([...word]);
  const pieces: string[] = [];
  let inherentIndex = -1;

  for (const char of chars) {
    const consonant = DEVANAGARI_CONSONANTS[char];
    if (consonant !== undefined) {
      pieces.push(consonant, 'a');
      inherentIndex = pieces.length - 1;
      continue;
    }

    const matra = DEVANAGARI_MATRAS[char];
    if (matra !== undefined) {
      if (inherentIndex >= 0) pieces[inherentIndex] = matra;
      else pieces.push(matra);
      inherentIndex = -1;
      continue;
    }

    if (char === DEVANAGARI_VIRAMA) {
      if (inherentIndex >= 0) pieces[inherentIndex] = '';
      inherentIndex = -1;
      continue;
    }

    const vowel = DEVANAGARI_INDEPENDENT_VOWELS[char];
    if (vowel !== undefined) {
      pieces.push(vowel);
      inherentIndex = -1;
      continue;
    }

    const sign = DEVANAGARI_SIGNS[char];
    if (sign !== undefined) {
      if (sign) pieces.push(sign);
      inherentIndex = -1;
      continue;
    }

    if (/\d/.test(char)) {
      pieces.push(char);
      inherentIndex = -1;
      continue;
    }
    // Anything unrecognised is dropped rather than leaked into the Latin form.
    inherentIndex = -1;
  }

  // Word-final schwa deletion, but never down to a bare consonant cluster.
  const meaningful = pieces.filter(Boolean).join('');
  if (inherentIndex === pieces.length - 1 && pieces[inherentIndex] === 'a' && meaningful.length > 2) {
    pieces[inherentIndex] = '';
  }

  return pieces.join('');
}

/** Merge `base + nukta` sequences into their precomposed equivalents. */
function precomposeNukta(chars: string[]): string[] {
  const output: string[] = [];
  for (const char of chars) {
    if (char === DEVANAGARI_NUKTA && output.length > 0) {
      const previous = output[output.length - 1]!;
      const combined = DEVANAGARI_NUKTA_PAIRS[previous];
      if (combined) {
        output[output.length - 1] = combined;
        continue;
      }
    }
    output.push(char);
  }
  return output;
}

/* --------------------------------- Arabic --------------------------------- */

const ARABIC_TATWEEL = 'ـ';

/**
 * Arabic script transliteration.
 *
 * `و` and `ي` are read as vowels between consonants or word-finally and as
 * glides otherwise, which is the split that recovers `mahmoud` from `محمود`
 * instead of `mhmwd`.
 */
export function transliterateArabic(word: string): string {
  const chars = [...word].filter((char) => char !== ARABIC_TATWEEL);
  const pieces: string[] = [];

  const isConsonantAt = (index: number): boolean => {
    const char = chars[index];
    if (char === undefined) return false;
    return ARABIC_CONSONANTS[char] !== undefined;
  };

  for (let index = 0; index < chars.length; index++) {
    const char = chars[index]!;

    const diacritic = ARABIC_DIACRITICS[char];
    if (diacritic !== undefined) {
      if (diacritic === '' && char === 'ّ' && pieces.length > 0) continue; // shadda: no doubling
      if (diacritic) pieces.push(diacritic);
      continue;
    }

    if (char === 'و' || char === 'ي' || char === 'ی') {
      const previousIsConsonant = isConsonantAt(index - 1);
      const nextIsConsonantOrEnd = index === chars.length - 1 || isConsonantAt(index + 1);
      const asVowel = index > 0 && previousIsConsonant && nextIsConsonantOrEnd;
      if (asVowel) pieces.push(char === 'و' ? 'u' : 'i');
      else pieces.push(char === 'و' ? 'w' : 'y');
      continue;
    }

    const consonant = ARABIC_CONSONANTS[char];
    if (consonant !== undefined) {
      pieces.push(consonant);
      continue;
    }

    const vowel = ARABIC_VOWELS[char];
    if (vowel !== undefined) {
      // A word-final ta marbuta is usually dropped in modern romanisation.
      if (char === 'ة' && index === chars.length - 1) {
        pieces.push('a');
        continue;
      }
      if (vowel) pieces.push(vowel);
      continue;
    }

    if (/\d/.test(char)) pieces.push(char);
  }

  return pieces.join('');
}

/* ---------------------------------- Greek --------------------------------- */

export function transliterateGreek(word: string): string {
  // Greek vowels carry a tonos that the map does not list; folding first keeps
  // `Παπαδόπουλος` from losing its accented omicron entirely.
  const lower = stripCombiningMarks(word.normalize('NFD')).toLowerCase();
  const pieces: string[] = [];

  for (let index = 0; index < lower.length; index++) {
    const pair = lower.slice(index, index + 2);
    const digraph = GREEK_DIGRAPHS[pair];
    if (digraph !== undefined) {
      pieces.push(digraph);
      index++;
      continue;
    }
    const single = GREEK_MAP[lower[index]!];
    if (single !== undefined) pieces.push(single);
    else if (/[a-z0-9]/.test(lower[index]!)) pieces.push(lower[index]!);
  }

  return pieces.join('');
}

/* ----------------------------------- Han ---------------------------------- */

/**
 * Each character becomes its own Latin token, which is how Chinese names are
 * conventionally romanised. A two-character given name written as one Latin
 * token (`Jianguo`) is reunited later by concatenation reconciliation.
 *
 * Unmapped characters are dropped rather than passed through, so a partial
 * mapping still produces a usable Latin form.
 */
export function transliterateHan(word: string): string | null {
  const pieces: string[] = [];
  let mapped = 0;
  for (const char of word) {
    const pinyin = HAN_SURNAMES[char] ?? HAN_GIVEN[char];
    if (pinyin) {
      pieces.push(pinyin);
      mapped++;
    }
  }
  if (mapped === 0) return null;
  return pieces.join(' ');
}

/* --------------------------------- Generic -------------------------------- */

function transliterateWithMap(word: string, map: Record<string, string>): string {
  const pieces: string[] = [];
  for (const char of word.toLowerCase()) {
    const mapped = map[char];
    if (mapped !== undefined) pieces.push(mapped);
    else if (/[a-z0-9]/.test(char)) pieces.push(char);
  }
  return pieces.join('');
}
