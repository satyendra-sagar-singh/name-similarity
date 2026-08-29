import type { LogisticModel } from './model.js';
import type { PlattCalibration } from './calibration.js';

/**
 * GENERATED FILE — produced by `npm run train`. Edit the trainer, not this.
 *
 * Held-out F1: heuristic 99.91%, logistic 99.86%.
 * The logistic model ships enabled only when it matches or beats the heuristic
 * on data it was not fitted to.
 */
export const TRAINED_MODEL: LogisticModel = {
  trained: false,
  featureKeys: ["exact","normalizedExact","compactExact","tokenSetExact","tokenSimilarity","coreTokenSimilarity","tokenJaccard","tokenOrderSimilarity","reordered","firstNameSimilarity","middleNameSimilarity","lastNameSimilarity","firstNameKnown","lastNameKnown","editSimilarity","jaroWinklerSimilarity","phoneticSimilarity","lastNamePhoneticSimilarity","firstNamePhoneticSimilarity","initialsSimilarity","abbreviationSimilarity","aliasSimilarity","transliterationSimilarity","tokenCountDifference","lengthDifference","minTokenCount","shortestTokenLength","middleNameOmitted","middleNameConflict","familyNameConflict","givenNameConflict","suffixConflict","affixMismatch","distinctNamePenalty","truncationRisk","singleTokenName","crossScript","rarityWeightedAgreement"],
  coefficients: [0.224149,0.128842,0.277461,0.252268,1.767063,1.813052,0.188396,-0.365,-0.635076,1.466912,1.037234,1.296553,-0.334049,0.333413,-0.200787,-0.246487,0.943575,1.290909,0.262779,1.103584,0.560881,-0.038622,0.057311,0.177262,0.517305,0.236941,-0.40791,1.063766,-1.550154,-1.537386,-1.88963,-2.878751,-1.244082,-0.695551,-0.003596,-0.523393,0.047407,1.229299],
  intercept: -8.197824,
  sampleSize: 1935,
  metrics: {
    f1: 0.99504,
    precision: 0,
    recall: 0,
    auc: 0.999973,
  },
};

/**
 * Platt scaling fitted to the heuristic similarity, so `probability` reflects
 * the labelled data rather than an assumption that score equals probability.
 */
export const TRAINED_CALIBRATION: PlattCalibration = {
  slope: 17.727131,
  intercept: -12.778914,
  midpoint: 0.720868,
  source: 'fitted',
  sampleSize: 1935,
};
