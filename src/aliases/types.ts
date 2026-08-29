/**
 * Alias data model.
 *
 * Aliases never rewrite the input. They produce a *feature*, so the scoring
 * layer can decide how much a nickname is worth — `Bob`/`Robert` is strong
 * evidence in a customer database and weak evidence in a passport check.
 */

export type AliasKind =
  | 'variant' // same name, different spelling: Catherine / Katherine
  | 'nickname' // diminutive or short form: Bob / Robert
  | 'transliteration' // romanisation of the same source name: Mohammad / Muhammad
  | 'translation'; // cross-language equivalent: Juan / John

export interface AliasGroup {
  /** Stable identifier, normally the canonical member. */
  id: string;
  members: string[];
  kind: AliasKind;
  /**
   * How much evidence a shared membership provides, in `0..1`.
   * Spelling variants sit near 1; translations sit low because `Juan` and
   * `John` being the same person is a genuine coin flip.
   */
  strength: number;
}

export interface AliasLookup {
  groupIds: string[];
  strength: number;
  kind: AliasKind;
}
