import { describe, expect, it } from 'vitest';

import {
  damerauSimilarity,
  detectScripts,
  familyString,
  familyTokens,
  firstGiven,
  initialCompatibility,
  isCompleteReversal,
  isLatinScript,
  isVeryCommon,
  kendallTauDistance,
  levenshteinSimilarity,
  parseName,
  phoneticKey,
  symmetricJaroWinkler,
  toTokens,
} from '../../src/index.js';
import {
  transliterateArabic,
  transliterateDevanagari,
  transliterateGreek,
  transliterateHan,
} from '../../src/normalize/transliteration.js';

/**
 * Covers the exports that nothing inside the package consumes.
 *
 * They are public API, so they are somebody's dependency even though the engine
 * never calls them — and untested public API is how a published package breaks
 * without any test going red.
 */

describe('normalised similarity wrappers', () => {
  it('levenshteinSimilarity scales to 0..1', () => {
    expect(levenshteinSimilarity('smith', 'smith')).toBe(1);
    expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
    expect(levenshteinSimilarity('john', 'jon')).toBeCloseTo(0.75, 5);
  });

  it('damerauSimilarity forgives a transposition that Levenshtein charges twice', () => {
    expect(damerauSimilarity('john', 'john')).toBe(1);
    expect(damerauSimilarity('', '')).toBe(1);
    // A transposition is one Damerau edit but two Levenshtein edits.
    expect(damerauSimilarity('jonh', 'john')).toBeGreaterThan(
      levenshteinSimilarity('jonh', 'john'),
    );
    // A substitution costs the same under both.
    expect(damerauSimilarity('jahn', 'john')).toBe(levenshteinSimilarity('jahn', 'john'));
  });

  it('symmetricJaroWinkler also rewards a shared ending', () => {
    // Plain Jaro-Winkler only boosts on a shared prefix.
    expect(symmetricJaroWinkler('andersen', 'anderson')).toBeGreaterThan(0.9);
    expect(symmetricJaroWinkler('smith', 'smith')).toBe(1);
    expect(symmetricJaroWinkler('abc', 'xyz')).toBe(0);
  });
});

describe('order metrics', () => {
  it('kendallTauDistance is 0 for sorted and 1 for reversed', () => {
    expect(kendallTauDistance([0, 1, 2, 3])).toBe(0);
    expect(kendallTauDistance([3, 2, 1, 0])).toBe(1);
    expect(kendallTauDistance([0])).toBe(0);
    expect(kendallTauDistance([0, 2, 1])).toBeCloseTo(1 / 3, 5);
  });

  it('isCompleteReversal separates a full inversion from a partial shuffle', () => {
    expect(isCompleteReversal([2, 1, 0])).toBe(true);
    expect(isCompleteReversal([0, 2, 1])).toBe(false);
    expect(isCompleteReversal([0])).toBe(false);
  });
});

describe('token helpers', () => {
  it('toTokens records the provenance the name layer needs', () => {
    const tokens = toTokens(['a', 'van', 'berg']);
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toMatchObject({ text: 'a', index: 0, isInitial: true, length: 1 });
    expect(tokens[1]).toMatchObject({ text: 'van', isParticle: true });
    expect(tokens[2]).toMatchObject({ text: 'berg', isInitial: false, isParticle: false });
  });

  it('initialCompatibility treats a disagreeing initial as a contradiction', () => {
    expect(initialCompatibility('k', 'kumar')).toBe(1);
    expect(initialCompatibility('k', 'sharma')).toBe(0);
    expect(initialCompatibility('kk', 'kumar')).toBe(0);
    expect(initialCompatibility('k', '')).toBe(0);
  });
});

describe('parsed-name accessors', () => {
  const parsed = parseName('Jan van der Berg');

  it('reads the given slot', () => {
    expect(firstGiven(parsed)).toBe('jan');
    expect(firstGiven(parseName(''))).toBeNull();
  });

  it('reads the family slot both joined and flattened', () => {
    expect(familyString(parsed)).toBe('van der berg');
    expect(familyTokens(parsed)).toEqual(['van', 'der', 'berg']);
    expect(familyString(parseName('Madonna'))).toBeNull();
    expect(familyTokens(parseName('Madonna'))).toEqual([]);
  });
});

describe('script helpers', () => {
  it('detectScripts lists every script present, most frequent first', () => {
    expect(detectScripts('John Smith')).toEqual(['latin']);
    expect(detectScripts('محمد Ali')).toEqual(expect.arrayContaining(['arabic', 'latin']));
    expect(detectScripts('123 !!!')).toEqual([]);
  });

  it('isLatinScript treats unknown as Latin-compatible', () => {
    expect(isLatinScript('latin')).toBe(true);
    expect(isLatinScript('unknown')).toBe(true);
    expect(isLatinScript('arabic')).toBe(false);
  });
});

describe('phoneticKey', () => {
  it('returns a blocking key that agrees for same-sounding names', () => {
    expect(phoneticKey('smith')).toBe(phoneticKey('smyth'));
    expect(phoneticKey('john')).not.toBe(phoneticKey('peter'));
  });

  it('falls back to Soundex when Double Metaphone yields nothing', () => {
    expect(phoneticKey('')).toBe('');
  });
});

describe('isVeryCommon', () => {
  it('flags names whose agreement is weak evidence', () => {
    expect(isVeryCommon('smith')).toBe(true);
    expect(isVeryCommon('john')).toBe(true);
    expect(isVeryCommon('kowalczyk')).toBe(false);
  });
});

describe('rule-based transliteration', () => {
  // These names are deliberately absent from the curated tables, so they
  // exercise the rule engines rather than a lookup.

  it('Devanagari handles conjuncts, anusvara and schwa deletion', () => {
    expect(transliterateDevanagari('भारती')).toBe('bharati');
    expect(transliterateDevanagari('चंद्रा')).toBe('chandra');
    expect(transliterateDevanagari('गोविंद')).toBe('govind');
    expect(transliterateDevanagari('त्रिवेदी')).toBe('trivedi');
    expect(transliterateDevanagari('स्वाति')).toBe('svati');
  });

  it('Arabic reads waw and ya as vowels between consonants', () => {
    expect(transliterateArabic('سمير')).toBe('smir');
    expect(transliterateArabic('فريد')).toBe('frid');
    expect(transliterateArabic('خليل')).toBe('khlil');
    // Word-initial they stay glides.
    expect(transliterateArabic('وسام')).toBe('wsam');
    // Word-final ta marbuta becomes a vowel.
    expect(transliterateArabic('حليمة')).toBe('hlima');
  });

  it('Greek folds the tonos and keeps the conventional ou digraph', () => {
    expect(transliterateGreek('Νικολάου')).toBe('nikolaou');
    expect(transliterateGreek('Αθανασίου')).toBe('athanasiou');
    expect(transliterateGreek('Θεοδώρου')).toBe('theodorou');
  });

  it('Han maps one character per Latin token, or nothing at all', () => {
    expect(transliterateHan('王伟')).toBe('wang wei');
    expect(transliterateHan('张强')).toBe('zhang qiang');
    expect(transliterateHan('未知')).toBeNull();
  });
});
