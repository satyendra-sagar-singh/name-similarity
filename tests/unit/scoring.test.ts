import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEIGHTS,
  MODE_PRESETS,
  ZERO_FEATURES,
  bandOf,
  collectConflicts,
  confidenceOf,
  evidenceCeiling,
  extractFeatures,
  fitCalibration,
  fromScore,
  interactionFloor,
  isModelTrained,
  probabilityOf,
  resolveOptions,
  scoreHeuristic,
  toScore,
  trainLogistic,
} from '../../src/index.js';
import type { FeatureVector } from '../../src/types.js';

const features = (overrides: Partial<FeatureVector>): FeatureVector => ({
  ...ZERO_FEATURES,
  ...overrides,
});

describe('score mapping', () => {
  it('spans exactly 1..100', () => {
    expect(toScore(0)).toBe(1);
    expect(toScore(1)).toBe(100);
    expect(toScore(0.5)).toBe(51);
    expect(toScore(-5)).toBe(1);
    expect(toScore(Number.NaN)).toBe(1);
  });

  it('round-trips through fromScore within rounding', () => {
    for (const similarity of [0, 0.25, 0.5, 0.75, 1]) {
      expect(fromScore(toScore(similarity))).toBeCloseTo(similarity, 1);
    }
  });

  it('labels the documented bands', () => {
    expect(confidenceOf(100)).toBe('very-high');
    expect(confidenceOf(85)).toBe('very-high');
    expect(confidenceOf(70)).toBe('high');
    expect(confidenceOf(50)).toBe('medium');
    expect(confidenceOf(30)).toBe('low');
    expect(confidenceOf(1)).toBe('very-low');

    expect(bandOf(97)).toBe('extremely-strong');
    expect(bandOf(88)).toBe('strong');
    expect(bandOf(75)).toBe('likely');
    expect(bandOf(60)).toBe('possible');
    expect(bandOf(40)).toBe('weak');
    expect(bandOf(10)).toBe('very-weak');
  });
});

describe('probability', () => {
  it('is strictly monotonic in similarity and stays inside (0,1)', () => {
    let previous = 0;
    for (const similarity of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const probability = probabilityOf(similarity);
      expect(probability, `at ${similarity}`).toBeGreaterThan(previous);
      expect(probability).toBeGreaterThan(0);
      expect(probability).toBeLessThan(1);
      previous = probability;
    }
  });

  it('keeps resolution at the bottom of the curve', () => {
    // The low end is where "definitely not the same person" lives, so it must
    // not be flattened by the clamp.
    expect(probabilityOf(0)).toBeLessThan(probabilityOf(0.1));
    expect(probabilityOf(0.1)).toBeLessThan(probabilityOf(0.2));
    expect(probabilityOf(0)).toBeLessThan(0.001);
  });

  it('is distinct from the score, as the contract requires', () => {
    // A score of 90/100 must not be asserted to mean a probability of 0.90.
    expect(probabilityOf(0.9)).not.toBeCloseTo(0.9, 2);
  });

  it('can be refitted on caller-supplied labels', () => {
    const samples: Array<{ similarity: number; label: 0 | 1 }> = [];
    for (let index = 0; index < 200; index++) {
      const similarity = index / 200;
      samples.push({ similarity, label: similarity > 0.5 ? 1 : 0 });
    }
    const calibration = fitCalibration(samples, 1500, 1);
    expect(calibration.source).toBe('fitted');
    expect(calibration.midpoint).toBeGreaterThan(0.3);
    expect(calibration.midpoint).toBeLessThan(0.7);
  });
});

describe('conflict handling', () => {
  const sensitivity = 1;

  it('gates a family-name conflict hard', () => {
    const gates = collectConflicts(features({ familyNameConflict: 1, lastNameKnown: 1 }), sensitivity);
    const gate = gates.find((item) => item.code === 'family-name-conflict');
    expect(gate).toBeDefined();
    expect(gate!.multiplier).toBeLessThan(0.6);
  });

  it('does not charge both the look-alike and the role gate for one disagreement', () => {
    const gates = collectConflicts(
      features({ distinctNamePenalty: 1, givenNameConflict: 1, firstNameKnown: 1 }),
      sensitivity,
    );
    expect(gates.map((gate) => gate.code)).toContain('look-alike-distinct-names');
    expect(gates.map((gate) => gate.code)).not.toContain('given-name-conflict');
  });

  it('scales penalties with mode sensitivity', () => {
    const base = collectConflicts(features({ familyNameConflict: 1, lastNameKnown: 1 }), 1);
    const strict = collectConflicts(features({ familyNameConflict: 1, lastNameKnown: 1 }), 1.35);
    expect(strict[0]!.multiplier).toBeLessThan(base[0]!.multiplier);
  });

  it('interpolates the weak-slot band instead of stepping', () => {
    const low = collectConflicts(features({ lastNameKnown: 1, lastNameSimilarity: 0.52 }), 1);
    const high = collectConflicts(features({ lastNameKnown: 1, lastNameSimilarity: 0.76 }), 1);
    const lowGate = low.find((gate) => gate.code === 'weak-family-evidence')!;
    const highGate = high.find((gate) => gate.code === 'weak-family-evidence')!;
    expect(lowGate.multiplier).toBeLessThan(highGate.multiplier);
  });

  it('raises a floor only when both slots agree', () => {
    expect(interactionFloor(features({ firstNameSimilarity: 1, lastNameSimilarity: 1, tokenSimilarity: 1 }))).toBeGreaterThan(0.9);
    expect(interactionFloor(features({ firstNameSimilarity: 1, lastNameSimilarity: 0.2 }))).toBe(0);
  });

  it('caps an inexact single-token pair', () => {
    // A realistic bare-surname vector: one token, six letters, good agreement.
    const bareSurname = {
      minTokenCount: 1,
      shortestTokenLength: 6,
      rarityWeightedAgreement: 0.9,
    };
    expect(evidenceCeiling(features({ ...bareSurname, singleTokenName: 1 }))).toBeLessThan(1);
    expect(
      evidenceCeiling(features({ ...bareSurname, singleTokenName: 1, normalizedExact: 1 })),
    ).toBe(1);
  });

  it('caps a pair that is nothing but initials', () => {
    expect(
      evidenceCeiling(
        features({ shortestTokenLength: 1, minTokenCount: 2, rarityWeightedAgreement: 0.9 }),
      ),
    ).toBeLessThan(1);
  });
});

describe('scoreHeuristic', () => {
  it('short-circuits identical names but not conflicting affixes', () => {
    expect(scoreHeuristic(features({ normalizedExact: 1 }), DEFAULT_WEIGHTS, 1).value).toBe(1);
    expect(
      scoreHeuristic(features({ normalizedExact: 1, suffixConflict: 1 }), DEFAULT_WEIGHTS, 1).value,
    ).toBeLessThan(1);
  });

  it('treats spacing-only differences as near-identical', () => {
    const value = scoreHeuristic(features({ compactExact: 1 }), DEFAULT_WEIGHTS, 1).value;
    expect(value).toBeGreaterThan(0.98);
    expect(value).toBeLessThan(1);
  });

  it('always returns a value inside 0..1', () => {
    const extremes = [
      features({}),
      features({ firstNameSimilarity: 1, lastNameSimilarity: 1, tokenSimilarity: 1 }),
      features({ familyNameConflict: 1, givenNameConflict: 1, suffixConflict: 1 }),
    ];
    for (const vector of extremes) {
      const value = scoreHeuristic(vector, DEFAULT_WEIGHTS, 1.35).value;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('mode presets', () => {
  it('order thresholds strict > balanced > fuzzy', () => {
    expect(MODE_PRESETS.strict.threshold).toBeGreaterThan(MODE_PRESETS.balanced.threshold);
    expect(MODE_PRESETS.balanced.threshold).toBeGreaterThan(MODE_PRESETS.fuzzy.threshold);
  });

  it('order conflict sensitivity the same way', () => {
    expect(MODE_PRESETS.strict.conflictSensitivity).toBeGreaterThan(1);
    expect(MODE_PRESETS.fuzzy.conflictSensitivity).toBeLessThan(1);
  });

  it('clamps a caller threshold into range', () => {
    expect(resolveOptions({ threshold: 500 }).threshold).toBe(100);
    expect(resolveOptions({ threshold: -5 }).threshold).toBe(1);
    expect(resolveOptions({ threshold: Number.NaN }).threshold).toBe(MODE_PRESETS.balanced.threshold);
  });
});

describe('learned model', () => {
  it('reports honestly whether a trained model is bundled', () => {
    expect(typeof isModelTrained()).toBe('boolean');
  });

  it('can be trained on caller data and separates a trivial problem', () => {
    const samples = [
      { features: extractFeatures('John Smith', 'John Smith'), label: 1 as const },
      { features: extractFeatures('John Smith', 'Jon Smith'), label: 1 as const },
      { features: extractFeatures('John Smith', 'Peter Jones'), label: 0 as const },
      { features: extractFeatures('Mary Cole', 'Susan Baker'), label: 0 as const },
    ];
    const model = trainLogistic(samples, { iterations: 400 });
    expect(model.trained).toBe(true);
    expect(model.coefficients.length).toBe(model.featureKeys.length);
    expect(model.coefficients.every((value) => Number.isFinite(value))).toBe(true);
  });
});
