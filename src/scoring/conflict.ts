import type { FeatureVector } from '../types.js';

/**
 * Conflict handling (Phase 10).
 *
 * A weighted average cannot express "these two agree on everything except the
 * one thing that matters". Conflicts are therefore applied as multiplicative
 * gates on top of the weighted evidence, so a single contradiction can pull a
 * 0.9 down to 0.4 without every other component having to be re-weighted.
 */

export interface ConflictGate {
  code: string;
  multiplier: number;
  message: string;
}

/** Base multipliers at `conflictSensitivity = 1`. */
const GATES = {
  familyNameConflict: 0.55,
  givenNameConflict: 0.7,
  middleNameConflict: 0.6,
  suffixConflict: 0.72,
  distinctName: 0.6,
  truncationRisk: 0.85,
  unresolvedCrossScript: 0.8,
  reordered: 0.97,
  middleNameOmitted: 0.97,
} as const;

/** Similarity at or above which a slot counts as genuine support. */
const WEAK_SLOT_CEILING = 0.78;
/** Multiplier at the bottom of the weak band, where the slot barely agrees. */
const WEAK_FAMILY_FLOOR = 0.6;
const WEAK_GIVEN_FLOOR = 0.72;

/**
 * Multiplier for a slot whose similarity sits between "contradicted" and
 * "supportive", or `null` when the slot is outside that band.
 *
 * Interpolated rather than stepped so a pair does not jump several points
 * because a similarity crossed a hard boundary.
 */
function weakSlotMultiplier(
  applicable: boolean,
  similarity: number,
  floor: number,
): number | null {
  if (!applicable) return null;
  if (similarity >= WEAK_SLOT_CEILING || similarity < 0.5) return null;
  const position = (similarity - 0.5) / (WEAK_SLOT_CEILING - 0.5);
  return floor + (1 - floor) * position;
}

/**
 * Apply a multiplier scaled by sensitivity.
 *
 * Sensitivity moves the *penalty*, not the multiplier, so `strict` mode makes
 * a 0.55 gate harsher (0.39) while `fuzzy` softens it (0.66) — and a
 * multiplier of 1 stays 1 at every setting.
 */
function scaled(multiplier: number, sensitivity: number): number {
  const penalty = 1 - multiplier;
  return Math.max(0.05, 1 - penalty * sensitivity);
}

export function collectConflicts(
  features: FeatureVector,
  sensitivity: number,
): ConflictGate[] {
  const gates: ConflictGate[] = [];

  // A curated look-alike already explains why the slot disagrees. Charging the
  // generic role-conflict gate on top would penalise the same evidence twice.
  const lookAlike = features.distinctNamePenalty > 0;

  if (features.familyNameConflict > 0 && !lookAlike) {
    gates.push({
      code: 'family-name-conflict',
      multiplier: scaled(GATES.familyNameConflict, sensitivity),
      message: 'Family names conflict',
    });
  }
  if (features.givenNameConflict > 0 && !lookAlike) {
    gates.push({
      code: 'given-name-conflict',
      multiplier: scaled(GATES.givenNameConflict, sensitivity),
      message: 'Given names conflict',
    });
  }
  if (features.distinctNamePenalty > 0) {
    gates.push({
      code: 'look-alike-distinct-names',
      multiplier: scaled(GATES.distinctName, sensitivity),
      message: 'Names are similar in spelling but are recognised as distinct names',
    });
  }
  if (features.truncationRisk > 0) {
    gates.push({
      code: 'truncation-risk',
      multiplier: scaled(GATES.truncationRisk, sensitivity),
      message: 'One name is a shorter name that also exists in its own right, not an abbreviation',
    });
  }
  if (features.middleNameConflict > 0) {
    gates.push({
      code: 'middle-name-conflict',
      multiplier: scaled(GATES.middleNameConflict, sensitivity),
      message: 'Middle names are present on both sides and disagree',
    });
  }

  // Partial agreement in a discriminating slot. Not a contradiction, but far
  // from support: `Ingrid Schneider` and `Ingrid Schmidt` share a given name
  // and a first syllable, and are two different people.
  const weakFamily = weakSlotMultiplier(
    features.lastNameKnown > 0 && features.familyNameConflict === 0 && !lookAlike,
    features.lastNameSimilarity,
    WEAK_FAMILY_FLOOR,
  );
  if (weakFamily !== null) {
    gates.push({
      code: 'weak-family-evidence',
      multiplier: scaled(weakFamily, sensitivity),
      message: 'Family names are only partially similar',
    });
  }

  const weakGiven = weakSlotMultiplier(
    features.firstNameKnown > 0 && features.givenNameConflict === 0 && !lookAlike,
    features.firstNameSimilarity,
    WEAK_GIVEN_FLOOR,
  );
  if (weakGiven !== null) {
    gates.push({
      code: 'weak-given-evidence',
      multiplier: scaled(weakGiven, sensitivity),
      message: 'Given names are only partially similar',
    });
  }
  if (features.suffixConflict > 0) {
    gates.push({
      code: 'suffix-conflict',
      multiplier: scaled(GATES.suffixConflict, sensitivity),
      message: 'Generational suffixes disagree',
    });
  }
  if (features.crossScript > 0 && features.transliterationSimilarity === 0) {
    gates.push({
      code: 'unresolved-script-difference',
      multiplier: scaled(GATES.unresolvedCrossScript, sensitivity),
      message: 'Names use different writing systems and could not be transliterated',
    });
  }
  if (features.reordered > 0) {
    gates.push({
      code: 'token-order-differs',
      multiplier: GATES.reordered,
      message: 'Name parts appear in a different order',
    });
  }
  if (features.middleNameOmitted > 0 && features.middleNameConflict === 0) {
    gates.push({
      code: 'middle-name-omitted',
      multiplier: GATES.middleNameOmitted,
      message: 'One name carries a middle name the other does not',
    });
  }

  return gates;
}

/** True when a gate that indicates a real contradiction fired. */
export function hasHardConflict(gates: readonly ConflictGate[]): boolean {
  return gates.some((gate) =>
    gate.code === 'family-name-conflict' ||
    gate.code === 'given-name-conflict' ||
    gate.code === 'look-alike-distinct-names' ||
    gate.code === 'middle-name-conflict' ||
    gate.code === 'suffix-conflict',
  );
}

export function applyGates(base: number, gates: readonly ConflictGate[]): number {
  return gates.reduce((value, gate) => value * gate.multiplier, base);
}

/**
 * Interaction floors (Phase 10).
 *
 * Express the rules the weighted average cannot: agreement on *both* the given
 * and family name is qualitatively stronger than the sum of its parts, because
 * two independent slots agreeing is much less likely by chance.
 */
export function interactionFloor(features: FeatureVector): number {
  const { firstNameSimilarity: first, lastNameSimilarity: last } = features;
  const completeness = features.tokenSimilarity;

  if (first >= 0.99 && last >= 0.99) return 0.9 + 0.08 * completeness;
  if (first >= 0.85 && last >= 0.99) return 0.84 + 0.08 * completeness;
  if (first >= 0.99 && last >= 0.85) return 0.82 + 0.08 * completeness;
  if (first >= 0.8 && last >= 0.8) return 0.7 + 0.1 * completeness;
  return 0;
}

/**
 * Ceilings that no amount of positive evidence may exceed.
 *
 * The single-token ceiling matters most: `Smith` and `Smith` are the same
 * string but very weak evidence of the same person.
 */
export function evidenceCeiling(features: FeatureVector): number {
  let ceiling = 1;

  if (features.singleTokenName > 0 && features.normalizedExact === 0) {
    // A bare token is a weak *identification*, which the probability and the
    // explanation both say. The similarity itself may still be high, so the
    // ceiling only rules out the top of the scale.
    ceiling = Math.min(ceiling, 0.85);
  }
  if (features.minTokenCount <= 1 && features.rarityWeightedAgreement < 0.5) {
    ceiling = Math.min(ceiling, 0.7);
  }
  // Initials alone can never be strong evidence: `A. K. Sharma` matches a large
  // fraction of every Indian registry.
  if (features.shortestTokenLength <= 1 && features.minTokenCount <= 2) {
    ceiling = Math.min(ceiling, 0.88);
  }
  return ceiling;
}
