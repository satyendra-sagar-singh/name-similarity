import type { Confidence, ScoreBand } from '../types.js';
import { TRAINED_CALIBRATION } from './weights.js';

/**
 * Score calibration (Phase 15).
 *
 * `score` and `probability` are deliberately different quantities. The score is
 * a stable, explainable similarity on a 1-100 scale; the probability is a
 * calibrated estimate of P(same person) fitted to labelled data. Conflating
 * them is exactly the mistake that makes identity systems overconfident.
 */

export interface PlattCalibration {
  /** Slope. Larger means a sharper transition around the midpoint. */
  slope: number;
  /** Intercept. `-slope * midpoint` puts P = 0.5 at `midpoint`. */
  intercept: number;
  /** Similarity at which P(same person) = 0.5, for documentation. */
  midpoint: number;
  /** How the parameters were obtained. */
  source: 'default' | 'fitted';
  /** Number of labelled pairs used, when fitted. */
  sampleSize?: number;
}

/**
 * Prior used before any labelled data exists. Placing P = 0.5 at similarity
 * 0.70 matches the documented "Possible" band.
 */
export const PRIOR_CALIBRATION: PlattCalibration = Object.freeze({
  slope: 12,
  intercept: -8.4,
  midpoint: 0.7,
  source: 'default',
});

/**
 * Active calibration: the fitted parameters when `npm run train` has produced
 * them, otherwise the prior.
 */
export const DEFAULT_CALIBRATION: PlattCalibration = Object.freeze(
  TRAINED_CALIBRATION ?? PRIOR_CALIBRATION,
);

/** Smallest probability the calibration will report, and its mirror below 1. */
const PROBABILITY_EPSILON = 1e-9;

/** Map a `0..1` similarity onto the public 1-100 scale. */
export function toScore(similarity: number): number {
  if (!Number.isFinite(similarity)) return 1;
  const clamped = Math.min(1, Math.max(0, similarity));
  return Math.min(100, Math.max(1, Math.round(1 + 99 * clamped)));
}

/** Inverse of {@link toScore}, used when a caller supplies a threshold in points. */
export function fromScore(score: number): number {
  return Math.min(1, Math.max(0, (score - 1) / 99));
}

export function probabilityOf(
  similarity: number,
  calibration: PlattCalibration = DEFAULT_CALIBRATION,
): number {
  const logit = calibration.slope * similarity + calibration.intercept;
  const probability = 1 / (1 + Math.exp(-logit));
  // Bounded away from 0 and 1 so no caller ever sees absolute certainty, but
  // only just: a coarser clamp flattens the bottom of the curve, and the bottom
  // is where "definitely not the same person" lives.
  return Math.min(1 - PROBABILITY_EPSILON, Math.max(PROBABILITY_EPSILON, probability));
}

export function confidenceOf(score: number): Confidence {
  if (score >= 85) return 'very-high';
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'low';
  return 'very-low';
}

export function bandOf(score: number): ScoreBand {
  if (score >= 95) return 'extremely-strong';
  if (score >= 85) return 'strong';
  if (score >= 70) return 'likely';
  if (score >= 50) return 'possible';
  if (score >= 30) return 'weak';
  return 'very-weak';
}

/**
 * Fit Platt scaling by gradient descent on the log loss.
 *
 * Kept in the runtime bundle rather than in a build script so downstream users
 * can recalibrate on their own labelled data without forking the package.
 */
export function fitCalibration(
  samples: ReadonlyArray<{ similarity: number; label: 0 | 1 }>,
  iterations = 4000,
  learningRate = 0.5,
): PlattCalibration {
  if (samples.length === 0) return PRIOR_CALIBRATION;

  let slope = PRIOR_CALIBRATION.slope;
  let intercept = PRIOR_CALIBRATION.intercept;

  for (let step = 0; step < iterations; step++) {
    let slopeGradient = 0;
    let interceptGradient = 0;

    for (const { similarity, label } of samples) {
      const prediction = 1 / (1 + Math.exp(-(slope * similarity + intercept)));
      const error = prediction - label;
      slopeGradient += error * similarity;
      interceptGradient += error;
    }

    slope -= (learningRate * slopeGradient) / samples.length;
    intercept -= (learningRate * interceptGradient) / samples.length;
  }

  return {
    slope,
    intercept,
    midpoint: slope === 0 ? 0.5 : -intercept / slope,
    source: 'fitted',
    sampleSize: samples.length,
  };
}
