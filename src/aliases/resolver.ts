import type {
  AliasIndexLike,
  AliasMap,
  DistinctPairIndexLike,
  MatchMode,
} from '../types.js';
import { DEFAULT_ALIAS_GROUPS, DISTINCT_NAME_PAIRS } from './default.js';
import type { AliasGroup, AliasLookup } from './types.js';

/**
 * Inverted index over alias groups.
 *
 * Built once per distinct configuration and cached, because a match call must
 * not pay for rebuilding a few thousand map entries.
 */
export class AliasIndex implements AliasIndexLike {
  private readonly byToken = new Map<string, AliasLookup>();
  private readonly groupsById = new Map<string, AliasGroup>();

  constructor(groups: readonly AliasGroup[]) {
    for (const group of groups) {
      this.groupsById.set(group.id, group);
      for (const member of group.members) {
        const key = member.trim().toLowerCase();
        if (!key) continue;
        const existing = this.byToken.get(key);
        if (existing) {
          existing.groupIds.push(group.id);
          if (group.strength > existing.strength) {
            existing.strength = group.strength;
            existing.kind = group.kind;
          }
          continue;
        }
        this.byToken.set(key, {
          groupIds: [group.id],
          strength: group.strength,
          kind: group.kind,
        });
      }
    }
  }

  groupsOf(token: string): readonly string[] | null {
    return this.byToken.get(token)?.groupIds ?? null;
  }

  lookup(token: string): AliasLookup | null {
    return this.byToken.get(token) ?? null;
  }

  areAliases(a: string, b: string): boolean {
    return this.aliasStrength(a, b) > 0;
  }

  /**
   * Strength of the strongest group shared by both tokens, or `0`.
   *
   * Strength comes from the *shared* group rather than from either token's best
   * group, so a token that belongs to both a variant group and a translation
   * group does not leak the variant strength into an unrelated pairing.
   */
  aliasStrength(a: string, b: string): number {
    return this.strongestSharedGroup(a, b)?.strength ?? (a === b ? 1 : 0);
  }

  /** Kind of the strongest shared group, for explanation text. */
  sharedKind(a: string, b: string): AliasGroup['kind'] | null {
    return this.strongestSharedGroup(a, b)?.kind ?? null;
  }

  private strongestSharedGroup(a: string, b: string): AliasGroup | null {
    if (a === b) return null;
    const left = this.byToken.get(a);
    const right = this.byToken.get(b);
    if (!left || !right) return null;

    const rightIds = right.groupIds.length > 4 ? new Set(right.groupIds) : right.groupIds;
    let best: AliasGroup | null = null;
    for (const id of left.groupIds) {
      const shared = Array.isArray(rightIds) ? rightIds.includes(id) : rightIds.has(id);
      if (!shared) continue;
      const group = this.groupsById.get(id);
      if (group && (best === null || group.strength > best.strength)) best = group;
    }
    return best;
  }
}

/** Turn the user-facing `{ bob: ["robert"] }` shape into alias groups. */
export function aliasMapToGroups(map: AliasMap, strength = 0.92): AliasGroup[] {
  return Object.entries(map).map(([key, values]) => ({
    id: `custom:${key.toLowerCase()}`,
    members: [key.toLowerCase(), ...values.map((value) => value.toLowerCase())],
    kind: 'nickname' as const,
    strength,
  }));
}

const indexCache = new Map<string, AliasIndex>();

export interface AliasIndexRequest {
  custom?: AliasMap;
  disableDefaults?: boolean;
  mode: MatchMode;
}

/**
 * Resolve an alias index for a configuration, memoised on a structural key.
 *
 * `strict` mode drops cross-language translations entirely: in a sanctions or
 * KYC context, treating `Juan` and `John` as the same person is exactly the
 * false positive that matters most.
 */
export function resolveAliasIndex(request: AliasIndexRequest): AliasIndex {
  const cacheKey = JSON.stringify({
    custom: request.custom ? Object.entries(request.custom).sort() : null,
    disableDefaults: request.disableDefaults ?? false,
    mode: request.mode,
  });

  const cached = indexCache.get(cacheKey);
  if (cached) return cached;

  const groups: AliasGroup[] = [];
  if (!request.disableDefaults) {
    for (const group of DEFAULT_ALIAS_GROUPS) {
      if (request.mode === 'strict' && group.kind === 'translation') continue;
      groups.push(group);
    }
  }
  if (request.custom) groups.push(...aliasMapToGroups(request.custom));

  const index = new AliasIndex(expandNicknamesThroughVariants(groups));
  if (indexCache.size > 32) indexCache.clear();
  indexCache.set(cacheKey, index);
  return index;
}

/**
 * Extend every nickname group with the spelling variants of its members.
 *
 * A nickname is recorded against one spelling of a name, and the variants of
 * that name are recorded separately, so the pairing that matters most is the
 * one neither table states: `Steve` is listed under `Stephen`, `Stephen` is a
 * variant of `Steven`, and nothing linked `Steve` to `Steven`. Closing the
 * nickname relation over the variant relation fixes that class outright instead
 * of one missing pair at a time.
 *
 * The closure runs one step and only in this direction. Chaining variants
 * through nicknames as well would merge groups that share a common short form —
 * `Harry` belongs to both `Henry` and `Harold`, which are not the same name.
 */
function expandNicknamesThroughVariants(groups: readonly AliasGroup[]): AliasGroup[] {
  const variantsOf = new Map<string, Set<string>>();
  for (const group of groups) {
    if (group.kind !== 'variant' && group.kind !== 'transliteration') continue;
    for (const member of group.members) {
      const existing = variantsOf.get(member);
      if (existing) for (const other of group.members) existing.add(other);
      else variantsOf.set(member, new Set(group.members));
    }
  }

  return groups.map((group) => {
    if (group.kind !== 'nickname') return group;
    const expanded = new Set(group.members);
    for (const member of group.members) {
      const equivalents = variantsOf.get(member);
      if (equivalents) for (const other of equivalents) expanded.add(other);
    }
    return expanded.size === group.members.length ? group : { ...group, members: [...expanded] };
  });
}

/** Curated look-alike pairs, indexed for O(1) lookup in both directions. */
export class DistinctPairIndex implements DistinctPairIndexLike {
  private readonly pairs = new Set<string>();

  constructor(pairs: ReadonlyArray<readonly [string, string]>) {
    for (const [a, b] of pairs) {
      this.pairs.add(DistinctPairIndex.key(a.toLowerCase(), b.toLowerCase()));
    }
  }

  private static key(a: string, b: string): string {
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  }

  has(a: string, b: string): boolean {
    return this.pairs.has(DistinctPairIndex.key(a, b));
  }

  get size(): number {
    return this.pairs.size;
  }
}

const distinctCache = new Map<string, DistinctPairIndex>();

export interface DistinctIndexRequest {
  custom?: Array<readonly [string, string]>;
  disableDefaults?: boolean;
}

/**
 * Resolve a look-alike index, memoised on a structural key.
 *
 * The counterpart to {@link resolveAliasIndex}. Aliases can only raise a pair's
 * score; these can only lower it. A caller needs both to express what their own
 * data actually means.
 */
export function resolveDistinctPairIndex(
  request: DistinctIndexRequest = {},
): DistinctPairIndex {
  const cacheKey = distinctSignature(request);
  const cached = distinctCache.get(cacheKey);
  if (cached) return cached;

  const pairs: Array<readonly [string, string]> = request.disableDefaults
    ? []
    : [...DISTINCT_NAME_PAIRS];
  if (request.custom) pairs.push(...request.custom);

  const index = new DistinctPairIndex(pairs);
  if (distinctCache.size > 32) distinctCache.clear();
  distinctCache.set(cacheKey, index);
  return index;
}

/** Stable fingerprint of a look-alike configuration. */
export function distinctSignature(request: DistinctIndexRequest = {}): string {
  const custom = (request.custom ?? [])
    .map(([a, b]) => {
      const left = a.toLowerCase();
      const right = b.toLowerCase();
      return left < right ? `${left}~${right}` : `${right}~${left}`;
    })
    .sort()
    .join(',');
  return `${request.disableDefaults ? 'none' : 'default'}:${custom}`;
}
