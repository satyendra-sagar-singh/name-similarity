# Benchmark

The benchmark is the source of truth. Every accuracy change in this package was justified
by a measured improvement on it, and several changes that "looked better" were reverted
because it disagreed.

## Datasets

| File | Pairs | Purpose |
| --- | ---: | --- |
| `datasets/development/curated.ts` | 331 | Hand-written hard cases. The real difficulty measure. |
| `datasets/benchmark/pairs.json` | 1,941 | Curated + generated. What tuning optimises. |
| `datasets/benchmark/holdout.json` | 1,616 | Generated from a different seed. Never tuned on. |
| `datasets/benchmark/english.json` | 1,552 | Anglo names only. A primary target, measured alone. |
| `datasets/benchmark/indian.json` | 1,560 | South Asian names only. The other primary target. |

```bash
npm run dataset:build      # curated + generated, all traditions
npm run dataset:holdout    # different seed, never tuned against
npm run dataset:english    # --culture anglo, a primary target in isolation
npm run dataset:indian     # --culture south-asian, the other one
```

The `--culture` flag restricts generation to one naming tradition. An aggregate
over nine traditions hides how the engine performs on any one of them, which is
the wrong thing to report when a caller's data is all English.

Generation is deterministic — a dataset that changes between runs cannot tell you whether a
metric moved because the model improved or because the data did.

## Current results

```
dataset   mode           n     prec   recall       F1      AUC   FP   FN
------------------------------------------------------------------------
tuned     strict      1941    99.9%    99.2%    99.5%   0.9994    1   11
tuned     balanced    1941    99.9%   100.0%   100.0%   0.9994    1    0
tuned     fuzzy       1941    96.3%   100.0%    98.1%   0.9993   50    0
------------------------------------------------------------------------
curated   strict       331    99.6%    99.2%    99.4%   0.9960    1    2
curated   balanced     331    99.6%   100.0%    99.8%   0.9960    1    0
curated   fuzzy        331    94.5%   100.0%    97.2%   0.9960   14    0
------------------------------------------------------------------------
holdout   strict      1616   100.0%    99.2%    99.6%   0.9999    0    9
holdout   balanced    1616   100.0%    99.8%    99.9%   0.9999    0    2
holdout   fuzzy       1616    97.1%   100.0%    98.5%   0.9999   32    0
------------------------------------------------------------------------
english   strict      1552   100.0%    99.4%    99.7%   1.0000    0    6
english   balanced    1552   100.0%   100.0%   100.0%   1.0000    0    0
english   fuzzy       1552    97.5%   100.0%    98.7%   1.0000   28    0
------------------------------------------------------------------------
indian    strict      1560   100.0%    98.9%    99.4%   0.9998    0   12
indian    balanced    1560   100.0%    99.8%    99.9%   0.9998    0    2
indian    fuzzy       1560    97.4%   100.0%    98.7%   0.9999   29    0
------------------------------------------------------------------------
```

`npm run validate` reproduces this table.

The tuned/holdout gap is the number that matters. At `balanced` it is 0.2 points of F1,
which is the evidence that the engine generalised rather than memorised.

## How to read these numbers honestly

**Three categories measure integration, not generalisation.** `nickname`, `alias` and
`transliteration` positives are generated from this package's own tables, so of course it
scores well on them. They verify the tables are wired in correctly; they say nothing about
names outside the tables. The curated set is where out-of-table behaviour is tested.

**Negatives are drawn from the same naming tradition as positives.** Pairing a Polish
surname against a Tamil one produces a trivially separable negative. The generator draws
`neg-same-family`, `neg-same-given`, `neg-near-surname` and `neg-near-given` from within one
culture group, and adds explicit hard cases: contradicting middle initials, generational
suffix conflicts, reordered-but-different names, and bare surnames against full names.

**Aggregate F1 hides category failures.** A model can look excellent overall and be useless
on transliterated names. `npm run bench` reports every category separately, and the CI gate
fails if any category with 20+ pairs drops below 0.90 F1.

## Categories

Positive: `exact`, `case`, `accent`, `unicode`, `typo`, `transposition`, `initials`,
`abbreviation`, `missing-middle`, `extra-middle`, `phonetic`, `nickname`, `alias`,
`transliteration`, `token-order`, `comma-order`, `prefix`, `suffix`, `hyphenation`,
`particle`, `concatenation`, `whitespace`, `noise`.

English-specific: `hypocorism` (short forms no rule can derive — `Peggy`/`Margaret`,
`Polly`/`Mary`, `Nancy`/`Ann`), `english-surname` (Mc/Mac, O', `-s` families),
`english-record` (quoted nicknames, `LASTNAME FIRSTNAME M` layouts).

India-specific: `indic-romanisation` (aspirate folds, `ee`/`oo`, `ksh`/`x`),
`indian-initials` (South Indian leading initials and their expansions),
`indian-record` (`S/O` · `D/O` · `W/O`, honorifics, compound given names),
`indian-false-positive` (gendered pairs and near-miss given names).

A category made only of negatives has no true positives, so precision, recall and
F1 are undefined for it; the report prints a dash rather than 0.0%, which would
read as a failure when every pair was in fact classified correctly.

Negative: `neg-same-family`, `neg-same-given`, `neg-near-surname`, `neg-near-given`,
`neg-middle-initial`, `neg-suffix`, `neg-reordered`, `neg-unrelated`, `neg-unrelated-cross`,
`neg-single-token`.

Mixed: `false-positive`, `adversarial`, `short-name`, `common-name`, `single-token`,
`cross-script`, `degenerate`.

## Labelling stance

Applied consistently, and stated so disagreement is possible:

- A recognised spelling or transliteration variant of the same name is a **match**
  (`Katherine`/`Kathryn`, `Mohammad`/`Muhammad`, `Clark`/`Clarke`).
- A distinct name that merely looks similar is **different**, even when one is a prefix of
  the other (`Raj`/`Rajesh`, `Ana`/`Anastasia`, `Kim`/`Kimberly`).
- Agreement on only one of the two discriminating slots is **different**
  (`John Smith`/`Peter Smith`).
- A gendered pair is **different** (`Michael`/`Michelle`, `Daniel`/`Danielle`).
- Iberian `-ez`/`-es` surname endings are treated as one family (`Nunez`/`Nunes`,
  `Gomez`/`Gomes`). This is a judgment call; a registry that must keep them apart should
  override it with `distinctNames: [['nunez', 'nunes']]`. (`aliases` cannot express this —
  it can only make two names *more* similar.)

Where a label is contestable, the pair carries a `note` explaining the reasoning.

## The known false positive

`Md Rahman` vs `Rahman MD` scores 95 and is labelled `different`. Leading `Md` abbreviates
`Mohammad`; trailing `MD` is a medical degree. With two tokens on each side the engine sees
the same token multiset and no basis to prefer one reading. It is left in the benchmark as
a failing case rather than relabelled to make the numbers look better.

## Adding cases

Add to `datasets/development/curated.ts`, then:

```bash
npm run dataset:build
npm run bench -- --worst 30
```

A new case that fails is information, not a bug to be papered over. Fix the engine, or
document why the case is out of scope.
