import { describe, expect, it } from 'vitest';

import {
  doubleMetaphone,
  doubleMetaphoneFull,
  isPhoneticMatch,
  nysiis,
  phoneticSimilarity,
  refinedSoundex,
  soundex,
} from '../../src/index.js';

describe('soundex', () => {
  it('matches the reference values used by the US Census', () => {
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    expect(soundex('Ashcraft')).toBe('A261');
    expect(soundex('Ashcroft')).toBe('A261');
    expect(soundex('Tymczak')).toBe('T522');
    expect(soundex('Pfister')).toBe('P236');
    expect(soundex('Honeyman')).toBe('H555');
  });

  it('pads short keys and tolerates empty input', () => {
    expect(soundex('Lee')).toBe('L000');
    expect(soundex('')).toBe('');
  });

  it('produces a variable-length refined key', () => {
    expect(refinedSoundex('Braz')).toBe(refinedSoundex('Broz'));
    expect(refinedSoundex('')).toBe('');
  });
});

describe('nysiis', () => {
  it('normalises the prefixes and suffixes it was designed for', () => {
    expect(nysiis('MacDonald')).toBe(nysiis('McDonald'));
    expect(nysiis('Knight')).toBe(nysiis('Night'));
    expect(nysiis('Phillips')).toBe(nysiis('Fillips'));
  });

  it('handles empty input', () => {
    expect(nysiis('')).toBe('');
  });
});

describe('double metaphone', () => {
  it('returns both readings for names with two pronunciations', () => {
    expect(doubleMetaphone('Smith')).toEqual(['SM0', 'XMT']);
    expect(doubleMetaphone('Schmidt')).toEqual(['XMT', 'SMT']);
  });

  it('lets Smith reach Schmidt through the secondary code', () => {
    expect(isPhoneticMatch('smith', 'schmidt')).toBe(true);
  });

  it('drops the silent clusters it is known for', () => {
    expect(doubleMetaphone('Knight')[0]).toBe('NT');
    expect(doubleMetaphone('Wright')[0]).toBe('RT');
    expect(doubleMetaphone('Pneumonia')[0].startsWith('N')).toBe(true);
    expect(doubleMetaphone('Psalm')[0].startsWith('S')).toBe(true);
  });

  it('agrees on names that sound the same', () => {
    const pairs: Array<[string, string]> = [
      ['Catherine', 'Katherine'],
      ['Sofia', 'Sophia'],
      ['Steven', 'Stephen'],
      ['Meyer', 'Maier'],
      ['Carl', 'Karl'],
      ['Jon', 'John'],
      ['Reilly', 'Reily'],
    ];
    for (const [a, b] of pairs) {
      expect(isPhoneticMatch(a.toLowerCase(), b.toLowerCase()), `${a} ~ ${b}`).toBe(true);
    }
  });

  it('keeps distinctions the reference algorithm keeps', () => {
    // Double Metaphone does not silence the P in Thompson, so Thompson and
    // Thomson differ here. They are related through the alias table instead.
    expect(doubleMetaphoneFull('Thompson')[0]).toBe('TMPSN');
    expect(doubleMetaphoneFull('Thomson')[0]).toBe('TMSN');
  });

  it('disagrees on names that do not', () => {
    const pairs: Array<[string, string]> = [
      ['john', 'peter'],
      ['smith', 'jones'],
      ['garcia', 'martinez'],
      ['sharma', 'verma'],
    ];
    for (const [a, b] of pairs) {
      expect(isPhoneticMatch(a, b), `${a} !~ ${b}`).toBe(false);
    }
  });

  it('never loops or throws on adversarial input', () => {
    const inputs = ['', 'x', 'zzzz', 'aeiou', 'ghghgh', "o'connor", 'x'.repeat(500)];
    for (const input of inputs) {
      expect(() => doubleMetaphoneFull(input)).not.toThrow();
    }
  });

  it('generates full-length codes but truncates on request', () => {
    const full = doubleMetaphoneFull('Rodriguez')[0];
    expect(full.length).toBeGreaterThan(4);
    expect(doubleMetaphone('Rodriguez')[0]).toBe(full.slice(0, 4));
  });
});

describe('phoneticSimilarity', () => {
  it('is 1 for identical tokens and graded otherwise', () => {
    expect(phoneticSimilarity('smith', 'smith')).toBe(1);
    expect(phoneticSimilarity('smith', 'smyth')).toBeGreaterThan(0.9);
    expect(phoneticSimilarity('john', 'peter')).toBeLessThan(0.5);
  });

  it('returns 0 when either side has no letters', () => {
    expect(phoneticSimilarity('', 'smith')).toBe(0);
    expect(phoneticSimilarity('123', 'smith')).toBe(0);
  });
});
