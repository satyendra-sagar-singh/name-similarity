import {
  distinctSignature,
  resolveAliasIndex,
  resolveDistinctPairIndex,
} from './aliases/resolver.js';
import { resolveNormalizeOptions } from './normalize/index.js';
import { resolveParseOptions } from './parse/person-name.js';
import { resolveWeights } from './scoring/heuristic.js';
import type { MatchMode, MatchOptions, ResolvedOptions } from './types.js';

/**
 * Option resolution.
 *
 * Presets change two things together, on purpose: the decision threshold *and*
 * how harshly contradictions are punished. Raising the threshold alone would
 * make a strict caller reject good matches while still scoring conflicting
 * names generously.
 */

export interface ModePreset {
  threshold: number;
  conflictSensitivity: number;
  description: string;
}

export const MODE_PRESETS: Record<MatchMode, ModePreset> = Object.freeze({
  strict: {
    threshold: 88,
    conflictSensitivity: 1.35,
    description:
      'Identity, KYC and sanctions work. Minimises false positives; cross-language cognates are ignored.',
  },
  balanced: {
    threshold: 75,
    conflictSensitivity: 1,
    description: 'General record linkage and de-duplication. The default.',
  },
  fuzzy: {
    threshold: 62,
    conflictSensitivity: 0.7,
    description: 'Search and suggestion ranking, where a missed match costs more than a spurious one.',
  },
});

export const DEFAULT_MODE: MatchMode = 'balanced';

export function resolveOptions(options: MatchOptions = {}): ResolvedOptions {
  const mode = options.mode ?? DEFAULT_MODE;
  const preset = MODE_PRESETS[mode] ?? MODE_PRESETS[DEFAULT_MODE];

  return {
    detailed: options.detailed ?? false,
    threshold: clampThreshold(options.threshold ?? preset.threshold),
    mode,
    model: options.model ?? 'heuristic',
    normalize: resolveNormalizeOptions(options.normalize),
    parse: resolveParseOptions(options.parse),
    cache: options.cache ?? true,
    fastPath: options.fastPath ?? true,
    weights: resolveWeights(options.weights),
    aliasIndex: resolveAliasIndex({
      custom: options.aliases,
      disableDefaults: options.disableDefaultAliases,
      mode,
    }),
    distinctPairs: resolveDistinctPairIndex({
      custom: options.distinctNames,
      disableDefaults: options.disableDefaultDistinctNames,
    }),
    conflictSensitivity: preset.conflictSensitivity,
    variantKey: buildVariantKey(preset.conflictSensitivity, options),
  };
}

/**
 * Fingerprint of everything that changes a token-pair comparison.
 *
 * Token-pair results are memoised, and the cache is keyed by the alias index —
 * which today differs per mode only because `mode` happens to be part of the
 * alias cache key. Relying on that coincidence would break the moment conflict
 * sensitivity or the look-alike table became independently configurable, so the
 * fingerprint states the dependency explicitly instead.
 */
function buildVariantKey(conflictSensitivity: number, options: MatchOptions): string {
  return `${conflictSensitivity}|${distinctSignature({
    custom: options.distinctNames,
    disableDefaults: options.disableDefaultDistinctNames,
  })}`;
}

function clampThreshold(threshold: number): number {
  if (!Number.isFinite(threshold)) return MODE_PRESETS[DEFAULT_MODE].threshold;
  return Math.min(100, Math.max(1, threshold));
}
