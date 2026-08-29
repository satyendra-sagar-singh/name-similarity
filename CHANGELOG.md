# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
semantic versioning.

## [0.5.0] — 2026-08-22

First public release. Reaches the v0.5 milestone of the roadmap
(benchmark-driven scoring improvements); v1.0 is gated on the items under
*Unreleased* below.

### Core

- `matchNames(a, b, options?)` returning a 1-100 score, a `matched` decision and a
  confidence band, with a `detailed: true` mode carrying the full feature vector,
  token alignment and human-readable evidence.
- `NameMatcher` for bulk work, `rankNames`, `similarityScore`, `extractFeatures`.
- Dual ESM/CJS build, full type declarations, zero runtime dependencies.

### Normalisation

- Unicode NFKD folding, ligature expansion and atomic-diacritic handling
  (`ø→o`, `ß→ss`, `Þ→Th`, `Ł→L`).
- Script detection across eleven writing systems.
- Punctuation, hyphen and apostrophe handling; `Family, Given` inversion detection;
  parenthetical and numeric noise removal.
- Position-aware title and suffix extraction, with a second reading kept whenever an
  *ambiguous* honorific was stripped (`Sri Ram Iyer` vs `Shri Narendra Modi`).
- Transliteration from Devanagari (with schwa deletion), Arabic, Cyrillic, Greek,
  Hebrew and Han, backed by curated tables for high-frequency names.

### Matching

- Levenshtein, unrestricted Damerau-Levenshtein, Jaro, Jaro-Winkler, Soundex,
  Refined Soundex, NYSIIS and a full Double Metaphone implementation.
- Optimal token alignment via the Hungarian algorithm — greedy pairing strands tokens.
- Name intelligence: initials, contractions, truncations, nicknames, spelling variants,
  orthographic variants, gendered look-alikes, particles, concatenation reconciliation
  and reordering.
- Conflict handling as multiplicative gates over weighted evidence, with interaction
  floors and structural ceilings.

### Scoring

- Heuristic weights fitted by coordinate ascent and validated on a held-out set.
- Platt-scaled `probability`, deliberately separate from `score`.
- Logistic model implementation, trainer and calibration fitter. **Shipped disabled**:
  it did not beat the heuristic on held-out data (99.72% vs 99.81% F1).

### Benchmark

- 1,848 labelled pairs across 40 categories (236 curated, 1,612 generated), plus a
  1,616-pair held-out set generated from a different seed.
- Per-category precision, recall, F1, FPR, FNR, AUC and best-threshold reporting.
- CI gates on overall accuracy, per-category F1, negative-category false-positive rate,
  and the tuned/held-out gap.

Balanced mode: **99.9% precision, 100.0% recall, AUC 0.9993** on the tuned set;
**100.0% / 99.6%, AUC 0.9987** held out.

### Performance

~55,000 comparisons/sec (18 µs), ~330,000/sec on the identical-name fast path, 0.26 ms
cold start. Throughput is flat from 1,000 to 1,000,000 comparisons.

---

## Unreleased — toward 1.0

- Broader alias and nickname coverage, especially East Asian, African and Slavic names.
- Rule-based Arabic and Hebrew transliteration good enough to stand without the curated
  tables.
- Korean and Japanese romanisation.
- More labelled data, particularly for categories the generated set covers thinly, and a
  re-evaluation of the logistic model against it.
- Blocking/indexing helpers for large-scale record linkage.
- API freeze.
