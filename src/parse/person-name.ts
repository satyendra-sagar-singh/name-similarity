import { normalize } from '../normalize/index.js';
import { groupParticles } from '../normalize/particles.js';
import type {
  LocaleCode,
  NormalizeOptions,
  NormalizedName,
  ParseOptions,
  ParsedName,
} from '../types.js';
import { EMPTY_PARSED_NAME } from './name-parts.js';

/**
 * Lightweight structural parser.
 *
 * Design stance: guess only what is safe, mark everything else `ambiguous`, and
 * let the feature layer compensate. A parser that confidently mis-assigns
 * `Garcia Marquez` costs far more than one that admits uncertainty.
 */

export const DEFAULT_PARSE_OPTIONS: Required<ParseOptions> = Object.freeze({
  locale: 'auto',
  familyNameFirst: false,
});

export function resolveParseOptions(options?: ParseOptions): Required<ParseOptions> {
  if (!options) return DEFAULT_PARSE_OPTIONS;
  return { ...DEFAULT_PARSE_OPTIONS, ...options };
}

/** Locales where two family names are the norm. */
const DOUBLE_FAMILY_LOCALES: ReadonlySet<LocaleCode> = new Set<LocaleCode>(['es', 'pt']);

/** Scripts whose conventional order is family-first. */
const FAMILY_FIRST_SCRIPTS = new Set(['han', 'hangul', 'kana']);

export function parseName(
  input: string,
  options?: ParseOptions & { normalize?: NormalizeOptions },
): ParsedName {
  const parsed = normalize(input, options?.normalize);
  return parseNormalized(parsed, options);
}

/** Parse a name that has already been through {@link normalize}. */
export function parseNormalized(
  parts: NormalizedName,
  options?: ParseOptions,
): ParsedName {
  const resolved = resolveParseOptions(options);
  const tokens = parts.tokens;

  if (tokens.length === 0) {
    return { ...EMPTY_PARSED_NAME, title: [...parts.titles], suffix: [...parts.suffixes] };
  }

  const grouped = groupParticles(tokens);
  const base = {
    suffix: [...parts.suffixes],
    title: [...parts.titles],
    tokens: [...tokens],
  };

  if (grouped.length === 1) {
    return {
      ...base,
      given: [grouped[0]!],
      middle: [],
      family: [],
      ambiguous: true,
    };
  }

  const familyFirst =
    resolved.familyNameFirst ||
    (resolved.locale === 'zh' && !parts.transliterated) ||
    (resolved.locale === 'auto' && FAMILY_FIRST_SCRIPTS.has(parts.script));

  if (familyFirst) {
    return {
      ...base,
      family: [grouped[0]!],
      given: [grouped[1]!],
      middle: grouped.slice(2),
      ambiguous: false,
    };
  }

  // A trailing single letter is a middle initial, never a family name. Records
  // written `SMITH JOHN A` or `John A` are common, and reading the `A` as the
  // surname wrecks every downstream role comparison.
  const trailingInitials: string[] = [];
  const units = [...grouped];
  while (units.length >= 2 && units[units.length - 1]!.length === 1) {
    trailingInitials.unshift(units.pop()!);
  }

  const familySlotSize =
    DOUBLE_FAMILY_LOCALES.has(resolved.locale) && units.length >= 3 ? 2 : 1;

  const hasFamilySlot = units.length > 1;
  const family = hasFamilySlot ? units.slice(units.length - familySlotSize) : [];
  const remaining = hasFamilySlot ? units.slice(0, units.length - familySlotSize) : units;
  const given = remaining.length > 0 ? [remaining[0]!] : [];
  const middle = [...remaining.slice(1), ...trailingInitials];

  // A name written entirely as initials cannot be split reliably.
  const allInitials = tokens.every((token) => token.length === 1);

  return {
    ...base,
    given,
    middle,
    family,
    ambiguous: allInitials || grouped.length > 5,
  };
}

/** Convenience wrapper matching the documented `parseName(name, { locale })`. */
export function parseNames(
  inputs: readonly string[],
  options?: ParseOptions & { normalize?: NormalizeOptions },
): ParsedName[] {
  return inputs.map((input) => parseName(input, options));
}
