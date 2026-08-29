import { describe, expect, it } from 'vitest';

import {
  detectScript,
  differsOnlyByAccents,
  foldAccents,
  normalize,
  transliterate,
} from '../../src/index.js';
import { normalizeVariants } from '../../src/normalize/index.js';

describe('foldAccents', () => {
  it('strips combining diacritics', () => {
    expect(foldAccents('José García-Márquez')).toBe('Jose Garcia-Marquez');
    expect(foldAccents('François Lefèvre')).toBe('Francois Lefevre');
  });

  it('expands letters whose diacritic is part of the glyph', () => {
    expect(foldAccents('Jørgen')).toBe('Jorgen');
    expect(foldAccents('Łukasz')).toBe('Lukasz');
    expect(foldAccents('Straße')).toBe('Strasse');
    expect(foldAccents('Þór')).toBe('Thor');
    expect(foldAccents('Ægir')).toBe('Aegir');
    expect(foldAccents('Đorđe')).toBe('Dorde');
  });

  it('reports accent-only differences', () => {
    expect(differsOnlyByAccents('José', 'Jose')).toBe(true);
    expect(differsOnlyByAccents('Jose', 'Jose')).toBe(false);
    expect(differsOnlyByAccents('Jose', 'Josef')).toBe(false);
  });
});

describe('normalize', () => {
  it('produces every representation documented in the contract', () => {
    const result = normalize('  José García-Márquez Jr. ');
    expect(result.original).toBe('  José García-Márquez Jr. ');
    expect(result.normalized).toBe('jose garcia marquez');
    expect(result.compact).toBe('josegarciamarquez');
    expect(result.tokens).toEqual(['jose', 'garcia', 'marquez']);
    expect(result.suffixes).toEqual(['jr']);
    expect(result.script).toBe('latin');
  });

  it('handles the documented punctuation cases', () => {
    expect(normalize('Mary-Jane Smith').tokens).toEqual(['mary', 'jane', 'smith']);
    expect(normalize("O'Connor Sean").tokens).toEqual(['o', 'connor', 'sean']);
    expect(normalize('JOHN SMITH').normalized).toBe('john smith');
    expect(normalize('extra    spaces').normalized).toBe('extra spaces');
  });

  it('detects and inverts the comma form', () => {
    const inverted = normalize('Smith, John Michael');
    expect(inverted.commaInverted).toBe(true);
    expect(inverted.tokens).toEqual(['john', 'michael', 'smith']);
  });

  it('does not treat a trailing suffix as a comma inversion', () => {
    const result = normalize('Smith, Jr');
    expect(result.commaInverted).toBe(false);
  });

  it('strips titles and suffixes into their own fields', () => {
    const result = normalize('Dr. John Smith PhD');
    expect(result.tokens).toEqual(['john', 'smith']);
    expect(result.titles).toEqual(['dr']);
    expect(result.suffixes).toEqual(['phd']);
  });

  it('keeps ambiguous affixes when stripping would gut the name', () => {
    // `Md` is Mohammad here, not a medical degree.
    expect(normalize('Md Rahman').tokens).toEqual(['md', 'rahman']);
    // `Gen` is short for Genevieve, not General.
    expect(normalize('Gen Chen').tokens).toEqual(['gen', 'chen']);
  });

  it('offers the un-stripped reading for ambiguous honorifics', () => {
    const variants = normalizeVariants('Sri Ram Iyer');
    expect(variants.length).toBe(2);
    expect(variants.map((variant) => variant.normalized)).toContain('sri ram iyer');
  });

  it('drops record-keeping noise', () => {
    expect(normalize('John Smith (deceased)').tokens).toEqual(['john', 'smith']);
    expect(normalize('John Smith #2').tokens).toEqual(['john', 'smith']);
  });

  it('survives degenerate input', () => {
    expect(normalize('').tokens).toEqual([]);
    expect(normalize('   ').tokens).toEqual([]);
    expect(normalize('123').tokens).toEqual([]);
    expect(normalize(undefined as unknown as string).tokens).toEqual([]);
  });
});

describe('detectScript', () => {
  it('identifies the scripts the engine supports', () => {
    expect(detectScript('John Smith')).toBe('latin');
    expect(detectScript('राहुल शर्मा')).toBe('devanagari');
    expect(detectScript('محمد علي')).toBe('arabic');
    expect(detectScript('Владимир Петров')).toBe('cyrillic');
    expect(detectScript('Γεώργιος')).toBe('greek');
    expect(detectScript('שרה כהן')).toBe('hebrew');
    expect(detectScript('王伟')).toBe('han');
  });

  it('treats punctuation and digits as script-neutral', () => {
    expect(detectScript('J. R. R. Tolkien, 2nd')).toBe('latin');
  });
});

describe('transliterate', () => {
  it('applies Devanagari schwa deletion', () => {
    expect(transliterate('राहुल').text).toBe('rahul');
    expect(transliterate('शर्मा').text).toBe('sharma');
    expect(transliterate('कुमार').text).toBe('kumar');
    expect(transliterate('प्रिया').text).toBe('priya');
  });

  it('romanises Arabic through the curated table', () => {
    expect(transliterate('محمد').text).toBe('muhammad');
    expect(transliterate('علي').text).toBe('ali');
  });

  it('romanises Cyrillic and Greek by rule', () => {
    expect(transliterate('Петров').text).toBe('petrov');
    expect(transliterate('Παπαδόπουλος').text).toBe('papadopoulos');
  });

  it('leaves Latin input untouched', () => {
    const result = transliterate('John Smith');
    expect(result.transliterated).toBe(false);
    expect(result.text).toBe('John Smith');
  });
});
