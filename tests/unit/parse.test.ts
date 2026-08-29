import { describe, expect, it } from 'vitest';

import {
  concatenationVariants,
  familyKey,
  groupParticles,
  initialsOf,
  parseName,
  reconcileConcatenations,
  tokenSetStats,
} from '../../src/index.js';

describe('parseName', () => {
  it('handles the shapes listed in the contract', () => {
    expect(parseName('John Michael Smith')).toMatchObject({
      given: ['john'],
      middle: ['michael'],
      family: ['smith'],
    });
    expect(parseName('John Smith')).toMatchObject({ given: ['john'], family: ['smith'] });
    expect(parseName('Smith, John')).toMatchObject({ given: ['john'], family: ['smith'] });
    expect(parseName('John Smith Jr')).toMatchObject({
      given: ['john'],
      family: ['smith'],
      suffix: ['jr'],
    });
  });

  it('keeps nobiliary particles with the family name', () => {
    const parsed = parseName('Jan van der Berg');
    expect(parsed.given).toEqual(['jan']);
    expect(parsed.family).toEqual(['van der berg']);
    expect(familyKey(parsed)).toBe('berg');
  });

  it('does not swallow a given name that looks like a particle', () => {
    const parsed = parseName('Abd Kamau');
    expect(parsed.given).toEqual(['abd']);
    expect(parsed.family).toEqual(['kamau']);
  });

  it('flags a single-token name as ambiguous', () => {
    const parsed = parseName('Madonna');
    expect(parsed.given).toEqual(['madonna']);
    expect(parsed.family).toEqual([]);
    expect(parsed.ambiguous).toBe(true);
  });

  it('flags an all-initials name as ambiguous', () => {
    expect(parseName('A K S').ambiguous).toBe(true);
  });

  it('takes two family names for Iberian locales', () => {
    expect(parseName('Jose Garcia Marquez', { locale: 'es' }).family).toEqual([
      'garcia',
      'marquez',
    ]);
    expect(parseName('Jose Garcia Marquez', { locale: 'en' }).family).toEqual(['marquez']);
  });

  it('reads family-first when told to', () => {
    expect(parseName('Chen Wei', { familyNameFirst: true })).toMatchObject({
      family: ['chen'],
      given: ['wei'],
    });
  });

  it('returns an empty parse for empty input', () => {
    const parsed = parseName('');
    expect(parsed.tokens).toEqual([]);
    expect(parsed.ambiguous).toBe(true);
  });
});

describe('groupParticles', () => {
  it('binds particle runs to the token they qualify', () => {
    expect(groupParticles(['van', 'der', 'berg'])).toEqual(['van der berg']);
    expect(groupParticles(['ana', 'de', 'la', 'cruz'])).toEqual(['ana', 'de la cruz']);
  });

  it('leaves a trailing particle alone', () => {
    expect(groupParticles(['john', 'van'])).toEqual(['john', 'van']);
  });
});

describe('token helpers', () => {
  it('summarises token set overlap', () => {
    const stats = tokenSetStats(['john', 'smith'], ['smith', 'john']);
    expect(stats.identicalMultiset).toBe(true);
    expect(stats.jaccard).toBe(1);

    const partial = tokenSetStats(['john', 'michael', 'smith'], ['john', 'smith']);
    expect(partial.onlyInA).toEqual(['michael']);
    expect(partial.identicalMultiset).toBe(false);
  });

  it('enumerates concatenation variants', () => {
    const variants = concatenationVariants(['abdul', 'rahman']).map((item) => item.text);
    expect(variants).toContain('abdulrahman');
  });

  it('collects leading letters, skipping particles', () => {
    expect(initialsOf(['john', 'michael', 'smith'])).toEqual(['j', 'm', 's']);
    expect(initialsOf(['jan', 'van', 'berg'])).toEqual(['j', 'b']);
  });
});

describe('reconcileConcatenations', () => {
  it('merges tokens whose join matches a token on the other side', () => {
    const result = reconcileConcatenations(['abdul', 'rahman'], ['abdulrahman']);
    expect(result.merged).toBe(true);
    expect(result.a).toEqual(['abdulrahman']);
  });

  it('leaves equal-length token lists untouched', () => {
    const result = reconcileConcatenations(['john', 'smith'], ['jon', 'smith']);
    expect(result.merged).toBe(false);
    expect(result.a).toEqual(['john', 'smith']);
  });

  it('does not merge when nothing lines up', () => {
    const result = reconcileConcatenations(['john', 'michael', 'smith'], ['john', 'smith']);
    expect(result.merged).toBe(false);
  });
});
