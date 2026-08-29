/**
 * Honorific and suffix dictionaries plus position-aware extraction.
 *
 * Extraction is position-aware on purpose. `md` is a medical suffix in
 * `John Smith MD` but a given name in `Md Rahman`, and `Dr` is a title in
 * `Dr John Smith` yet a family name in `John Dr` (rare, but the parser must
 * not corrupt it).
 */

export const DEFAULT_TITLES: ReadonlySet<string> = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'mx',
  'dr',
  'doctor',
  'prof',
  'professor',
  'rev',
  'reverend',
  'fr',
  'father',
  'sr',
  'sister',
  'br',
  'brother',
  'hon',
  'honorable',
  'honourable',
  'judge',
  'justice',
  'sir',
  'dame',
  'lord',
  'lady',
  'capt',
  'captain',
  'col',
  'colonel',
  'gen',
  'general',
  'lt',
  'lieutenant',
  'maj',
  'major',
  'sgt',
  'sergeant',
  'cmdr',
  'commander',
  'adm',
  'admiral',
  'pvt',
  'engr',
  'er',
  'adv',
  'advocate',
  'shri',
  'sri',
  'smt',
  'kum',
  'thiru',
  'sheikh',
  'shaikh',
  'syed',
  'sayyid',
  'hafiz',
  'imam',
  'maulana',
  'pandit',
  'swami',
  'baba',
  'haji',
  'alhaji',
  'don',
  'dona',
  'sra',
  'srta',
  'herr',
  'frau',
  'monsieur',
  'madame',
  'mlle',
  'mme',
  'ing',
  'lic',
  'the',
]);

/**
 * Titles that are also common given or family names. They are only stripped
 * when at least two other name tokens survive, so `Sri Devi` keeps both parts.
 */
export const AMBIGUOUS_TITLES: ReadonlySet<string> = new Set([
  'gen',
  'maj',
  'sr',
  'br',
  'don',
  'dona',
  'the',
  'sheikh',
  'shaikh',
  'syed',
  'sayyid',
  'sri',
  'shri',
  'baba',
  'er',
  'lord',
  'lady',
  'sister',
  'father',
  'imam',
]);

export const DEFAULT_SUFFIXES: ReadonlySet<string> = new Set([
  'jr',
  'jnr',
  'junior',
  'sr',
  'snr',
  'senior',
  'ii',
  'iii',
  'iv',
  'vi',
  'vii',
  'viii',
  'ix',
  'phd',
  'dphil',
  'md',
  'do',
  'dds',
  'dmd',
  'dvm',
  'jd',
  'llb',
  'llm',
  'esq',
  'esquire',
  'cpa',
  'mba',
  'msc',
  'bsc',
  'bs',
  'ba',
  'ma',
  'rn',
  'np',
  'pe',
  'pmp',
  'cfa',
  'ret',
  'retd',
  'usa',
  'usmc',
  'usn',
  'usaf',
]);

/**
 * Suffixes that double as ordinary name tokens. `md` is by far the most
 * dangerous: in South Asian records it abbreviates `Mohammad`.
 */
export const AMBIGUOUS_SUFFIXES: ReadonlySet<string> = new Set([
  'md',
  'do',
  'ma',
  'ba',
  'bs',
  'np',
  'pe',
  'rn',
  'ii',
  'vi',
  'usa',
]);

/** Generational suffixes whose disagreement is meaningful evidence. */
export const GENERATIONAL_SUFFIXES: ReadonlySet<string> = new Set([
  'jr',
  'jnr',
  'junior',
  'sr',
  'snr',
  'senior',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
]);

const GENERATIONAL_CANONICAL: Record<string, string> = {
  jr: 'jr',
  jnr: 'jr',
  junior: 'jr',
  ii: 'ii',
  sr: 'sr',
  snr: 'sr',
  senior: 'sr',
  iii: 'iii',
  iv: 'iv',
  v: 'v',
  vi: 'vi',
  vii: 'vii',
  viii: 'viii',
  ix: 'ix',
};

export function canonicalGenerational(token: string): string | null {
  return GENERATIONAL_CANONICAL[token] ?? null;
}

export interface TitleExtraction {
  tokens: string[];
  titles: string[];
  suffixes: string[];
}

export interface TitleOptions {
  stripTitles: boolean;
  stripSuffixes: boolean;
  titles: ReadonlySet<string>;
  suffixes: ReadonlySet<string>;
}

/** Minimum name tokens that must remain after stripping. */
const MIN_REMAINING_TOKENS = 1;

/**
 * Ambiguous affixes need a longer surviving name before they are stripped, and
 * the caller additionally evaluates the reading where they are kept — see
 * `normalizeVariants`.
 */
const MIN_TOKENS_FOR_AMBIGUOUS = 3;

/**
 * Pull leading honorifics and trailing suffixes off a token list.
 *
 * Ambiguous entries need a larger surviving name to be stripped, which keeps
 * single-token records such as `Md` intact.
 */
export function extractTitlesAndSuffixes(
  tokens: string[],
  options: TitleOptions,
): TitleExtraction {
  const working = [...tokens];
  const titles: string[] = [];
  const suffixes: string[] = [];

  if (options.stripTitles) {
    while (working.length > MIN_REMAINING_TOKENS) {
      const head = working[0]!;
      if (!options.titles.has(head)) break;
      const needsMoreContext = AMBIGUOUS_TITLES.has(head);
      if (needsMoreContext && working.length < MIN_TOKENS_FOR_AMBIGUOUS) break;
      titles.push(head);
      working.shift();
    }
  }

  if (options.stripSuffixes) {
    while (working.length > MIN_REMAINING_TOKENS) {
      const tail = working[working.length - 1]!;
      if (!options.suffixes.has(tail)) break;
      const needsMoreContext = AMBIGUOUS_SUFFIXES.has(tail);
      if (needsMoreContext && working.length < 3) break;
      suffixes.unshift(tail);
      working.pop();
    }
  }

  return { tokens: working, titles, suffixes };
}
