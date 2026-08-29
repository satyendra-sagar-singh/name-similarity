import { describe, expect, it } from 'vitest';

import {
  NameMatcher,
  clearCaches,
  matchNames,
  rankNames,
  similarityScore,
} from '../../src/index.js';

/** Named bands from the documented 1-100 interpretation. */
const EXTREMELY_STRONG = 95;
const STRONG = 85;
const WEAK = 50;

describe('matchNames — scenarios from the specification', () => {
  const cases: Array<[string, string, (score: number) => void, string]> = [
    ['John Smith', 'John Smith', (s) => expect(s).toBe(100), 'identical'],
    ['John Smith', 'Jon Smith', (s) => expect(s).toBeGreaterThanOrEqual(STRONG), 'typo'],
    ['John Smith', 'Smith John', (s) => expect(s).toBeGreaterThanOrEqual(STRONG), 'reordered'],
    [
      'John Michael Smith',
      'John Smith',
      (s) => expect(s).toBeGreaterThanOrEqual(STRONG),
      'missing middle',
    ],
    ['A K Sharma', 'Ajay Kumar Sharma', (s) => expect(s).toBeGreaterThanOrEqual(STRONG), 'initials'],
    ['Mohd Rahman', 'Mohammad Rahman', (s) => expect(s).toBeGreaterThanOrEqual(STRONG), 'abbreviation'],
    ['José García', 'Jose Garcia', (s) => expect(s).toBeGreaterThanOrEqual(EXTREMELY_STRONG), 'accents'],
    [
      'Mary-Jane Smith',
      'Mary Jane Smith',
      (s) => expect(s).toBeGreaterThanOrEqual(EXTREMELY_STRONG),
      'hyphenation',
    ],
    ['Dr. John Smith', 'John Smith', (s) => expect(s).toBeGreaterThanOrEqual(EXTREMELY_STRONG), 'title'],
    ['राहुल शर्मा', 'Rahul Sharma', (s) => expect(s).toBeGreaterThanOrEqual(STRONG), 'devanagari'],
    ['محمد علي', 'Mohammad Ali', (s) => expect(s).toBeGreaterThanOrEqual(STRONG), 'arabic'],
    ['John Smith', 'Peter Smith', (s) => expect(s).toBeLessThan(WEAK), 'given differs'],
    ['John Smith', 'John Jones', (s) => expect(s).toBeLessThan(WEAK), 'family differs'],
    ['John Smith', 'Peter Jones', (s) => expect(s).toBeLessThan(30), 'both differ'],
  ];

  for (const [a, b, assertion, label] of cases) {
    it(`${label}: "${a}" vs "${b}"`, () => {
      assertion(matchNames(a, b).score);
    });
  }

  it('orders the documented example scores sensibly', () => {
    const exact = matchNames('John Smith', 'John Smith').score;
    const typo = matchNames('John Smith', 'Jon Smith').score;
    const missingMiddle = matchNames('John Michael Smith', 'John Smith').score;
    const differentGiven = matchNames('John Smith', 'Peter Smith').score;

    expect(exact).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(missingMiddle);
    expect(missingMiddle).toBeGreaterThan(differentGiven);
  });
});

describe('matchNames — adversarial pairs', () => {
  const shouldNotMatch: Array<[string, string]> = [
    ['Michael Johnson', 'Michelle Johnson'],
    ['Raj Kumar', 'Rajesh Kumar'],
    ['John Smith Jr', 'John Smith Sr'],
    ['John A Smith', 'John B Smith'],
    ['Daniel Craig', 'Danielle Craig'],
    ['Erik Larsson', 'Erika Larsson'],
    ['Ana Silva', 'Anastasia Silva'],
    ['Zhang Wei', 'Chang Wei'],
    ['Smith', 'John Smith'],
    ['R Patel', 'S Patel'],
    ['Maria de la Cruz', 'Maria de la Torre'],
  ];

  for (const [a, b] of shouldNotMatch) {
    it(`rejects "${a}" vs "${b}"`, () => {
      const result = matchNames(a, b);
      expect(result.matched, `scored ${result.score}`).toBe(false);
    });
  }

  it('rejects them under strict mode too', () => {
    for (const [a, b] of shouldNotMatch) {
      expect(matchNames(a, b, { mode: 'strict' }).matched, `${a} vs ${b}`).toBe(false);
    }
  });
});

describe('result shape', () => {
  it('returns the simple shape by default', () => {
    const result = matchNames('John Smith', 'Jon Smith');
    expect(Object.keys(result).sort()).toEqual(['confidence', 'matched', 'score']);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('returns the documented detailed shape on request', () => {
    const result = matchNames('Mohammad Abdul Rahman', 'Mohd A Rahman', { detailed: true });

    expect(result.normalized).toEqual({
      a: 'mohammad abdul rahman',
      b: 'mohd a rahman',
    });
    expect(result.components.firstNameSimilarity).toBeGreaterThan(0.8);
    expect(result.components.lastNameSimilarity).toBe(1);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.evidence.every((reason) => reason.code.length > 0)).toBe(true);
    expect(result.band).toBeDefined();
    expect(result.model).toBe('heuristic');
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThan(1);
    expect(result.alignment.length).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('explains both supporting and opposing evidence', () => {
    const result = matchNames('John Smith Jr', 'John Smith Sr', { detailed: true });
    const polarities = new Set(result.evidence.map((reason) => reason.polarity));
    expect(polarities.has('negative')).toBe(true);
    expect(result.reasons.some((reason) => /suffix/i.test(reason))).toBe(true);
  });

  it('names the specific alias or abbreviation it used', () => {
    const alias = matchNames('Bob Smith', 'Robert Smith', { detailed: true });
    expect(alias.reasons.join(' ')).toMatch(/nickname|variant/i);

    const abbreviation = matchNames('Mohd Rahman', 'Mohammad Rahman', { detailed: true });
    expect(abbreviation.reasons.join(' ')).toMatch(/abbreviation/i);
  });
});

describe('configuration', () => {
  it('honours an explicit threshold', () => {
    const score = matchNames('John Michael Smith', 'John Smith').score;
    expect(matchNames('John Michael Smith', 'John Smith', { threshold: score }).matched).toBe(true);
    expect(matchNames('John Michael Smith', 'John Smith', { threshold: score + 1 }).matched).toBe(
      false,
    );
  });

  it('applies mode presets without the caller naming a threshold', () => {
    const pair: [string, string] = ['John Michael Smith', 'John Smith'];
    expect(matchNames(...pair, { mode: 'fuzzy' }).matched).toBe(true);
    expect(matchNames(...pair, { mode: 'strict' }).score).toBeLessThanOrEqual(
      matchNames(...pair, { mode: 'balanced' }).score,
    );
  });

  it('accepts custom aliases', () => {
    const withoutAlias = matchNames('Zed Smith', 'Zebulon Smith').score;
    const withAlias = matchNames('Zed Smith', 'Zebulon Smith', {
      aliases: { zed: ['zebulon'] },
    }).score;
    expect(withAlias).toBeGreaterThan(withoutAlias);
  });

  it('accepts caller-declared distinct names, the counterpart to aliases', () => {
    // `aliases` can only raise a score. This is the only way to lower one.
    const before = matchNames('Ana Nunez', 'Ana Nunes');
    const after = matchNames('Ana Nunez', 'Ana Nunes', {
      distinctNames: [['nunez', 'nunes']],
    });
    expect(before.matched).toBe(true);
    expect(after.score).toBeLessThan(before.score);
    expect(after.matched).toBe(false);
  });

  it('can disable the built-in look-alike table', () => {
    const withDefaults = matchNames('Michael Johnson', 'Michelle Johnson').score;
    const withoutDefaults = matchNames('Michael Johnson', 'Michelle Johnson', {
      disableDefaultDistinctNames: true,
    }).score;
    expect(withoutDefaults).toBeGreaterThan(withDefaults);
  });

  it('keeps memoised token comparisons isolated between configurations', () => {
    // Same tokens, different look-alike tables, interleaved so a shared cache
    // entry would leak from one configuration into the other.
    const strictOptions = { distinctNames: [['nunez', 'nunes'] as const] };
    const first = matchNames('Ana Nunez', 'Ana Nunes', strictOptions).score;
    const plain = matchNames('Ana Nunez', 'Ana Nunes').score;
    const again = matchNames('Ana Nunez', 'Ana Nunes', strictOptions).score;

    expect(again).toBe(first);
    expect(plain).toBeGreaterThan(first);
    expect(matchNames('Ana Nunez', 'Ana Nunes').score).toBe(plain);
  });

  it('can disable the built-in alias table', () => {
    const withDefaults = matchNames('Bob Smith', 'Robert Smith').score;
    const withoutDefaults = matchNames('Bob Smith', 'Robert Smith', {
      disableDefaultAliases: true,
    }).score;
    expect(withoutDefaults).toBeLessThan(withDefaults);
  });

  it('can turn normalisation steps off', () => {
    const stripped = matchNames('Dr. John Smith', 'John Smith').score;
    const kept = matchNames('Dr. John Smith', 'John Smith', {
      normalize: { stripTitles: false },
    }).score;
    expect(kept).toBeLessThan(stripped);
  });

  it('accepts weight overrides', () => {
    const result = matchNames('John Smith', 'John Jones', {
      weights: { lastName: 0 },
    });
    expect(result.score).toBeGreaterThan(matchNames('John Smith', 'John Jones').score);
  });

  it('reports honestly when the logistic model is unavailable', () => {
    const attempt = () => matchNames('John Smith', 'Jon Smith', { model: 'logistic' });
    // Either a trained model is bundled and this works, or it throws a clear error.
    try {
      const result = attempt();
      expect(result.score).toBeGreaterThan(0);
    } catch (error) {
      expect((error as Error).message).toMatch(/logistic/i);
    }
  });
});

describe('symmetry and determinism', () => {
  const pairs: Array<[string, string]> = [
    ['John Smith', 'Jon Smith'],
    ['A K Sharma', 'Ajay Kumar Sharma'],
    ['Mohd Rahman', 'Mohammad Rahman'],
    ['राहुल शर्मा', 'Rahul Sharma'],
    ['Jan van der Berg', 'Jan Vanderberg'],
    ['Smith, John', 'John Smith'],
  ];

  it('scores a pair the same in either order', () => {
    for (const [a, b] of pairs) {
      expect(matchNames(a, b).score, `${a} vs ${b}`).toBe(matchNames(b, a).score);
    }
  });

  it('scores a pair the same on repeat, cold or warm', () => {
    for (const [a, b] of pairs) {
      const first = matchNames(a, b).score;
      clearCaches();
      expect(matchNames(a, b).score).toBe(first);
      expect(matchNames(a, b).score).toBe(first);
    }
  });
});

describe('degenerate input', () => {
  const inputs: Array<[unknown, unknown]> = [
    ['', ''],
    ['', 'John Smith'],
    ['   ', 'John Smith'],
    ['123', '456'],
    ['!!!', '???'],
    [null, 'John Smith'],
    [undefined, undefined],
    ['a'.repeat(1000), 'a'.repeat(1000)],
    ['John Smith', 'John '.repeat(50)],
  ];

  for (const [a, b] of inputs) {
    it(`survives ${JSON.stringify(String(a).slice(0, 20))} vs ${JSON.stringify(String(b).slice(0, 20))}`, () => {
      const result = matchNames(a as string, b as string);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(typeof result.matched).toBe('boolean');
    });
  }

  it('does not match an empty name against a real one', () => {
    expect(matchNames('', 'John Smith').matched).toBe(false);
  });
});

describe('helpers', () => {
  it('exposes a score-only helper', () => {
    expect(similarityScore('John Smith', 'John Smith')).toBe(100);
  });

  it('ranks candidates by score', () => {
    const ranked = rankNames('John Smith', ['Peter Jones', 'Jon Smith', 'John Smith']);
    expect(ranked[0]!.candidate).toBe('John Smith');
    expect(ranked[1]!.candidate).toBe('Jon Smith');
    expect(ranked[2]!.candidate).toBe('Peter Jones');
  });

  it('reuses configuration through NameMatcher', () => {
    const matcher = new NameMatcher({ mode: 'strict' });
    expect(matcher.score('John Smith', 'John Smith')).toBe(100);
    expect(matcher.match('John Smith', 'Peter Jones').matched).toBe(false);
    expect(matcher.rank('John Smith', ['Jon Smith'], 1)).toHaveLength(1);
  });

  it('gives NameMatcher.match the result type its options imply', () => {
    const detailed = new NameMatcher({ detailed: true }).match('John Smith', 'Jon Smith');
    // No narrowing needed: `reasons` is present on the static type.
    expect(detailed.reasons.length).toBeGreaterThan(0);

    const plain = new NameMatcher().match('John Smith', 'Jon Smith');
    expect(Object.keys(plain).sort()).toEqual(['confidence', 'matched', 'score']);
  });
});
