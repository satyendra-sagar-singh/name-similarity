import { differsOnlyByAccents } from '../normalize/accents.js';
import type { AlignedPair } from '../similarity/token.js';
import type { FeatureVector, NormalizedName, Reason } from '../types.js';
import type { RoleComparison } from '../features/feature-vector.js';
import type { ConflictGate } from './conflict.js';

/**
 * Explanation generation (Phase 11).
 *
 * Reports both directions of evidence. Negative evidence is the part that
 * actually gets used in production: an analyst reviewing a 78 needs to know
 * *what stopped it* being a 95.
 */

export interface ExplainInput {
  features: FeatureVector;
  roles: RoleComparison;
  pairs: readonly AlignedPair[];
  unmatchedA: readonly string[];
  unmatchedB: readonly string[];
  gates: readonly ConflictGate[];
  partsA: NormalizedName;
  partsB: NormalizedName;
}

export function explain(input: ExplainInput): Reason[] {
  const reasons: Reason[] = [];
  const { features, roles, partsA, partsB } = input;

  if (features.exact > 0) {
    return [
      {
        code: 'inputs-identical',
        message: 'The two inputs are identical',
        polarity: 'positive',
        weight: 100,
      },
    ];
  }

  if (features.normalizedExact > 0) {
    reasons.push({
      code: 'identical-after-normalization',
      message: normalizationReason(partsA, partsB),
      polarity: 'positive',
      weight: 95,
    });
  }

  collectRoleReasons(reasons, roles, features);
  collectEvidenceReasons(reasons, input);
  collectStructureReasons(reasons, input);

  for (const gate of input.gates) {
    reasons.push({
      code: gate.code,
      message: gate.message,
      polarity: gate.multiplier >= 0.98 ? 'neutral' : 'negative',
      weight: Math.round((1 - gate.multiplier) * 100),
    });
  }

  collectUnmatchedReasons(reasons, input);

  return reasons
    .filter((reason, index, all) => all.findIndex((other) => other.code === reason.code) === index)
    .sort((left, right) => right.weight - left.weight);
}

function normalizationReason(a: NormalizedName, b: NormalizedName): string {
  if (differsOnlyByAccents(a.original, b.original)) {
    return 'Names are identical apart from accents';
  }
  if (a.titles.length !== b.titles.length) {
    return 'Names are identical once titles are removed';
  }
  if (a.suffixes.join(' ') !== b.suffixes.join(' ')) {
    return a.suffixes.length === 0 || b.suffixes.length === 0
      ? 'Names are identical once suffixes are removed'
      : 'Names are identical apart from their suffixes';
  }
  if (a.transliterated || b.transliterated) {
    return 'Names are identical after transliteration';
  }
  return 'Names are identical after normalisation';
}

function collectRoleReasons(
  reasons: Reason[],
  roles: RoleComparison,
  features: FeatureVector,
): void {
  if (roles.lastAvailable) {
    if (roles.last >= 0.999) {
      reasons.push({
        code: 'last-name-identical',
        message: 'Last names are identical',
        polarity: 'positive',
        weight: 30,
      });
    } else if (roles.last >= 0.8) {
      reasons.push({
        code: 'last-name-similar',
        message: 'Last names are highly similar',
        polarity: 'positive',
        weight: 24,
      });
    } else if (roles.last >= 0.5) {
      reasons.push({
        code: 'last-name-weakly-similar',
        message: 'Last names are only weakly similar',
        polarity: 'negative',
        weight: 14,
      });
    }
  }

  if (roles.firstAvailable) {
    if (roles.first >= 0.999) {
      reasons.push({
        code: 'first-name-identical',
        message: 'First names are identical',
        polarity: 'positive',
        weight: 28,
      });
    } else if (roles.first >= 0.8) {
      reasons.push({
        code: 'first-name-similar',
        message: 'First names are highly similar',
        polarity: 'positive',
        weight: 22,
      });
    } else if (roles.first >= 0.5) {
      reasons.push({
        code: 'first-name-weakly-similar',
        message: 'First names are only weakly similar',
        polarity: 'negative',
        weight: 12,
      });
    }
  }

  if (features.lastNamePhoneticSimilarity >= 0.95 && roles.last < 0.999 && roles.lastAvailable) {
    reasons.push({
      code: 'last-name-phonetic',
      message: 'Last names sound the same despite different spelling',
      polarity: 'positive',
      weight: 18,
    });
  }
}

function collectEvidenceReasons(reasons: Reason[], input: ExplainInput): void {
  const { pairs, features } = input;

  const alias = pairs.find((pair) => pair.kind === 'alias');
  if (alias) {
    reasons.push({
      code: 'alias-match',
      message: `"${alias.a}" is a known variant or nickname of "${alias.b}"`,
      polarity: 'positive',
      weight: 20,
    });
  }

  const abbreviation = pairs.find((pair) => pair.kind === 'abbreviation');
  if (abbreviation) {
    const [short, long] =
      abbreviation.a.length <= abbreviation.b.length
        ? [abbreviation.a, abbreviation.b]
        : [abbreviation.b, abbreviation.a];
    reasons.push({
      code: 'abbreviation-match',
      message: `"${short}" is an abbreviation of "${long}"`,
      polarity: 'positive',
      weight: 18,
    });
  }

  const initialPairs = pairs.filter((pair) => pair.kind === 'initial');
  if (initialPairs.length > 0) {
    const middleOnly = initialPairs.every(
      (pair) => pair.indexA > 0 && pair.indexB > 0,
    );
    reasons.push({
      code: middleOnly ? 'middle-name-abbreviated' : 'initials-compatible',
      message: middleOnly
        ? 'Middle name is written as an initial'
        : 'Initials are compatible with the full names',
      polarity: 'positive',
      weight: 15,
    });
  }

  const phoneticPairs = pairs.filter((pair) => pair.kind === 'phonetic');
  if (phoneticPairs.length > 0 || features.phoneticSimilarity >= 0.95) {
    reasons.push({
      code: 'phonetic-similarity',
      message: 'Names have strong phonetic similarity',
      polarity: 'positive',
      weight: 16,
    });
  }

  const typoPairs = pairs.filter((pair) => pair.kind === 'typo' && pair.score >= 0.7);
  if (typoPairs.length > 0) {
    reasons.push({
      code: 'minor-spelling-difference',
      message: 'Differences look like minor spelling or typing variation',
      polarity: 'positive',
      weight: 12,
    });
  }

  if (features.transliterationSimilarity > 0) {
    reasons.push({
      code: 'transliterated',
      message: 'One name was transliterated from a non-Latin script before comparison',
      polarity: 'neutral',
      weight: 8,
    });
  }
}

function collectStructureReasons(reasons: Reason[], input: ExplainInput): void {
  const { features, partsA, partsB } = input;

  if (features.tokenSetExact > 0 && features.normalizedExact === 0) {
    reasons.push({
      code: 'same-tokens',
      message: 'Both names contain exactly the same parts',
      polarity: 'positive',
      weight: 26,
    });
  }

  if (partsA.titles.length !== partsB.titles.length) {
    reasons.push({
      code: 'title-difference',
      message: 'One name carries a title the other does not; titles are ignored',
      polarity: 'neutral',
      weight: 4,
    });
  }

  if (features.singleTokenName > 0) {
    reasons.push({
      code: 'single-token-name',
      message: 'One name has a single part, which limits how strong any match can be',
      polarity: 'negative',
      weight: 20,
    });
  }

  if (features.rarityWeightedAgreement > 0 && features.rarityWeightedAgreement < 0.45) {
    reasons.push({
      code: 'common-name-agreement',
      message: 'The parts that agree are very common names, so agreement is weak evidence',
      polarity: 'negative',
      weight: 10,
    });
  }
}

function collectUnmatchedReasons(reasons: Reason[], input: ExplainInput): void {
  const extras = [...input.unmatchedA, ...input.unmatchedB].filter((token) => token.length > 1);
  if (extras.length === 0) return;
  if (input.features.middleNameOmitted > 0 && extras.length === 1) return;

  reasons.push({
    code: 'unmatched-parts',
    message: `Unmatched name parts: ${extras.map((token) => `"${token}"`).join(', ')}`,
    polarity: 'negative',
    weight: 12 + extras.length * 4,
  });
}
