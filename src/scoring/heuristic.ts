import type { FeatureVector, HeuristicWeights } from '../types.js';
import {
  applyGates,
  collectConflicts,
  evidenceCeiling,
  hasHardConflict,
  interactionFloor,
  type ConflictGate,
} from './conflict.js';

/**
 * Deterministic scoring model (Phase 9 + 10).
 *
 * Three stages, in order:
 *
 * 1. weighted evidence — a mean over the components the pair actually provides;
 * 2. interaction floors — rules a mean cannot express;
 * 3. conflict gates and ceilings — contradictions and structural limits.
 *
 * The output is a similarity in `0..1`. Converting it to the public 1-100 scale
 * and to a probability happens in {@link ../scoring/calibration.js}, so this
 * function stays comparable with the trained model.
 */

/**
 * Weights fitted by `npm run tune` (coordinate ascent on mean F1 across all
 * three presets, validated on a held-out set generated from a different seed).
 * Held-out mean F1 rose from 0.9857 to 0.9912, which is why they were adopted.
 *
 * They are data, not truth. Two things are worth understanding before changing
 * them:
 *
 * - `token` dominates because assignment-based token coverage already contains
 *   the per-token alias, abbreviation and phonetic evidence. The small `edit`,
 *   `abbreviation` and `order` weights are not the engine ignoring those
 *   signals; they stop it counting them twice.
 * - Only relative size matters. The weighted mean divides by the sum of the
 *   weights it actually applied, so scaling them all is a no-op.
 *
 * Any change must be justified by a measured improvement on held-out data.
 */
export const DEFAULT_WEIGHTS: HeuristicWeights = Object.freeze({
  firstName: 0.135,
  lastName: 0.219,
  middleName: 0.015,
  token: 0.485,
  edit: 0.006,
  phonetic: 0.06,
  initials: 0.035,
  abbreviation: 0.003,
  order: 0.006,
  alias: 0.035,
});

export interface HeuristicResult {
  /** Similarity in `0..1`. */
  value: number;
  /** Weighted evidence before floors and gates. */
  weightedEvidence: number;
  /** Floor applied by an interaction rule, or 0. */
  floor: number;
  /** Ceiling imposed by structural weakness, or 1. */
  ceiling: number;
  gates: ConflictGate[];
  /** Per-component contributions, for explanation and debugging. */
  components: Record<string, number>;
}

/** Similarity awarded when names differ only in how their parts are spaced. */
const SPACING_ONLY_SIMILARITY = 0.99;
/** Similarity awarded when names are equal but their affixes are not. */
const AFFIX_DIFFERENCE_SIMILARITY = 0.985;

export function scoreHeuristic(
  features: FeatureVector,
  weights: HeuristicWeights,
  conflictSensitivity: number,
): HeuristicResult {
  const components = componentsOf(features);

  // Identical names short-circuit everything — but only when no affix
  // contradicts them. `John Smith Jr` and `John Smith Sr` normalise to the
  // same string and are not the same person.
  const exactish = exactShortCircuit(features);
  if (exactish !== null) {
    return {
      value: exactish,
      weightedEvidence: exactish,
      floor: exactish,
      ceiling: 1,
      gates: [],
      components,
    };
  }

  const weightedEvidence = weightedMean(components, weights, features);

  const gates = collectConflicts(features, conflictSensitivity);

  // A floor only applies when nothing contradicts the match; gates then
  // discount the lifted value, so an omitted middle name still costs something
  // even after the both-slots-agree floor has applied.
  const floor = hasHardConflict(gates) ? 0 : interactionFloor(features);
  const lifted = Math.max(weightedEvidence, floor);
  const gated = applyGates(lifted, gates);
  const ceiling = evidenceCeiling(features);

  const value = clamp01(Math.min(ceiling, gated));

  return { value, weightedEvidence, floor, ceiling, gates, components };
}

/**
 * `null` when no short circuit applies.
 *
 * Three tiers, because "identical" has three meanings once normalisation is
 * involved: the same string, the same string with different spacing, and the
 * same string with a title or suffix on one side only.
 */
function exactShortCircuit(features: FeatureVector): number | null {
  if (features.suffixConflict > 0) return null;

  if (features.normalizedExact > 0) {
    return features.affixMismatch > 0 ? AFFIX_DIFFERENCE_SIMILARITY : 1;
  }
  if (features.compactExact > 0) {
    return features.affixMismatch > 0
      ? Math.min(SPACING_ONLY_SIMILARITY, AFFIX_DIFFERENCE_SIMILARITY)
      : SPACING_ONLY_SIMILARITY;
  }
  return null;
}

/**
 * Weighted mean over the components the pair actually exhibits.
 *
 * Alias and abbreviation evidence is conditional: a pair with no nickname
 * relationship should not be penalised for the absence of one, so those
 * components leave the denominator when they are zero.
 */
function weightedMean(
  components: Record<string, number>,
  weights: HeuristicWeights,
  features: FeatureVector,
): number {
  let numerator = 0;
  let denominator = 0;

  const add = (weight: number, value: number, applicable = true): void => {
    if (!applicable || weight <= 0) return;
    numerator += weight * value;
    denominator += weight;
  };

  add(weights.firstName, components.firstName!);
  add(weights.lastName, components.lastName!);
  add(weights.middleName, components.middleName!);
  add(weights.token, components.token!);
  add(weights.edit, components.edit!);
  add(weights.phonetic, components.phonetic!);
  add(weights.initials, components.initials!);
  add(weights.order, components.order!);
  add(weights.abbreviation, components.abbreviation!, features.abbreviationSimilarity > 0);
  add(weights.alias, components.alias!, features.aliasSimilarity > 0);

  return denominator === 0 ? 0 : numerator / denominator;
}

function componentsOf(features: FeatureVector): Record<string, number> {
  return {
    firstName: features.firstNameSimilarity,
    lastName: features.lastNameSimilarity,
    middleName: features.middleNameSimilarity,
    token: features.tokenSimilarity,
    edit: features.editSimilarity,
    phonetic: features.phoneticSimilarity,
    initials: features.initialsSimilarity,
    abbreviation: features.abbreviationSimilarity,
    alias: features.aliasSimilarity,
    order: features.tokenOrderSimilarity,
  };
}

export function resolveWeights(overrides?: Partial<HeuristicWeights>): HeuristicWeights {
  if (!overrides) return DEFAULT_WEIGHTS;
  return { ...DEFAULT_WEIGHTS, ...overrides };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
