import { describe, expect, it } from 'vitest';

import {
  analyzeAbbreviation,
  compareInitials,
  damerauLevenshteinDistance,
  isSingleTransposition,
  jaroSimilarity,
  jaroWinklerSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  longestCommonSubsequenceLength,
  isSubsequence,
  solveMaxAssignment,
  strictConsonantSkeleton,
  tokenJaccard,
} from '../../src/index.js';

describe('levenshtein', () => {
  it('matches known distances', () => {
    expect(levenshteinDistance('john', 'jon')).toBe(1);
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('smith', 'smyth')).toBe(levenshteinDistance('smyth', 'smith'));
  });

  it('early-exits above maxDistance without lying about small distances', () => {
    expect(levenshteinDistance('abcdefgh', 'zyxwvuts', 2)).toBeGreaterThan(2);
    expect(levenshteinDistance('john', 'jon', 5)).toBe(1);
  });

  it('normalises to 0..1', () => {
    expect(levenshteinSimilarity('abc', 'abc')).toBe(1);
    expect(levenshteinSimilarity('', '')).toBe(1);
    expect(levenshteinSimilarity('john', 'jon')).toBeCloseTo(0.75, 5);
  });
});

describe('damerau-levenshtein', () => {
  it('counts an adjacent transposition as one edit', () => {
    expect(damerauLevenshteinDistance('jonh', 'john')).toBe(1);
    expect(levenshteinDistance('jonh', 'john')).toBe(2);
  });

  it('handles transpositions that share a character', () => {
    expect(damerauLevenshteinDistance('ca', 'abc')).toBe(2);
  });

  it('is stable across repeated calls despite the shared buffer', () => {
    const first = damerauLevenshteinDistance('aleksandra', 'aleksandr');
    damerauLevenshteinDistance('a-very-much-longer-string-here', 'another-long-string');
    expect(damerauLevenshteinDistance('aleksandra', 'aleksandr')).toBe(first);
  });

  it('detects a single adjacent transposition', () => {
    expect(isSingleTransposition('jonh', 'john')).toBe(true);
    expect(isSingleTransposition('john', 'john')).toBe(false);
    expect(isSingleTransposition('john', 'jean')).toBe(false);
  });
});

describe('jaro-winkler', () => {
  it('matches published reference values', () => {
    expect(jaroSimilarity('MARTHA', 'MARHTA')).toBeCloseTo(0.944444, 5);
    expect(jaroWinklerSimilarity('MARTHA', 'MARHTA')).toBeCloseTo(0.961111, 5);
    expect(jaroSimilarity('DIXON', 'DICKSONX')).toBeCloseTo(0.766667, 5);
    expect(jaroWinklerSimilarity('DIXON', 'DICKSONX')).toBeCloseTo(0.813333, 5);
  });

  it('returns 1 for identical and 0 for disjoint strings', () => {
    expect(jaroWinklerSimilarity('smith', 'smith')).toBe(1);
    expect(jaroWinklerSimilarity('abc', 'xyz')).toBe(0);
  });

  it('is stable across repeated calls despite the shared buffers', () => {
    const first = jaroWinklerSimilarity('katherine', 'kathryn');
    jaroWinklerSimilarity('a'.repeat(200), 'b'.repeat(200));
    expect(jaroWinklerSimilarity('katherine', 'kathryn')).toBe(first);
  });
});

describe('sequence helpers', () => {
  it('computes longest common subsequence length', () => {
    expect(longestCommonSubsequenceLength('abcde', 'ace')).toBe(3);
    expect(longestCommonSubsequenceLength('abc', 'xyz')).toBe(0);
    expect(longestCommonSubsequenceLength('', 'abc')).toBe(0);
  });

  it('detects subsequences', () => {
    expect(isSubsequence('mohd', 'mohammad')).toBe(true);
    expect(isSubsequence('wm', 'william')).toBe(true);
    expect(isSubsequence('xyz', 'william')).toBe(false);
  });

  it('reduces to a consonant skeleton', () => {
    expect(strictConsonantSkeleton('mohammad')).toBe('mhmd');
    expect(strictConsonantSkeleton('muhammed')).toBe('mhmd');
    expect(strictConsonantSkeleton('aeiou')).toBe('');
  });
});

describe('abbreviation analysis', () => {
  it('recognises contractions that skip internal letters', () => {
    expect(analyzeAbbreviation('mohd', 'mohammad').shape).toBe('contraction');
    expect(analyzeAbbreviation('wm', 'william').shape).toBe('contraction');
    expect(analyzeAbbreviation('robt', 'robert').shape).toBe('contraction');
  });

  it('recognises plain truncations separately', () => {
    expect(analyzeAbbreviation('raj', 'rajesh').shape).toBe('truncation');
    expect(analyzeAbbreviation('ana', 'anastasia').shape).toBe('truncation');
  });

  it('refuses to call a one-letter insertion a contraction', () => {
    // Both are subsequences of the longer form, but neither drops enough to be
    // a written abbreviation. They may still register as phonetic evidence.
    expect(analyzeAbbreviation('grace', 'gracie').shape).not.toBe('contraction');
    expect(analyzeAbbreviation('ronaldo', 'ronaldinho').shape).not.toBe('contraction');
  });

  it('requires a shared first letter', () => {
    expect(analyzeAbbreviation('smith', 'asmith').shape).toBe('none');
  });
});

describe('initials', () => {
  it('treats identical initial sequences as fully compatible', () => {
    expect(compareInitials(['a', 'k', 'sharma'], ['ajay', 'kumar', 'sharma']).similarity).toBe(1);
  });

  it('treats containment as a dropped middle name', () => {
    const result = compareInitials(['john', 'michael', 'smith'], ['john', 'smith']);
    expect(result.containment).toBe(true);
    expect(result.similarity).toBeGreaterThan(0.75);
    expect(result.similarity).toBeLessThan(1);
  });

  it('scores contradictory initials low', () => {
    expect(compareInitials(['r', 'patel'], ['s', 'patel']).similarity).toBeLessThan(0.6);
  });
});

describe('assignment', () => {
  it('finds the globally optimal pairing, not the greedy one', () => {
    // Greedy takes john->johnson first and strands james.
    const similarity = [
      [0.8, 0.2],
      [0.3, 0.9],
    ];
    expect(solveMaxAssignment(similarity)).toEqual([0, 1]);
  });

  it('prefers the total even when it costs the best single pair', () => {
    const similarity = [
      [0.9, 0.85],
      [0.88, 0.0],
    ];
    expect(solveMaxAssignment(similarity)).toEqual([1, 0]);
  });

  it('handles rectangular matrices in both orientations', () => {
    expect(solveMaxAssignment([[0.1, 0.9, 0.2]])).toEqual([1]);
    const tall = solveMaxAssignment([[0.1], [0.9], [0.2]]);
    expect(tall.filter((value) => value >= 0)).toHaveLength(1);
    expect(tall[1]).toBe(0);
  });

  it('handles empty input', () => {
    expect(solveMaxAssignment([])).toEqual([]);
  });
});

describe('tokenJaccard', () => {
  it('is order independent', () => {
    expect(tokenJaccard(['john', 'smith'], ['smith', 'john'])).toBe(1);
    expect(tokenJaccard(['john', 'smith'], ['john', 'jones'])).toBeCloseTo(1 / 3, 5);
  });
});
