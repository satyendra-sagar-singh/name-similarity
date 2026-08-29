# name-similarity

[![npm version](https://img.shields.io/npm/v/name-similarity.svg)](https://www.npmjs.com/package/name-similarity)
[![CI](https://github.com/satyendra-sagar-singh/name-similarity/actions/workflows/ci.yml/badge.svg)](https://github.com/satyendra-sagar-singh/name-similarity/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/name-similarity.svg)](https://github.com/satyendra-sagar-singh/name-similarity/blob/main/LICENSE)

Compare two human names and get an explainable similarity score from **1 to 100**. The question this package answers is not *"how similar are these two strings?"* — it is **"how likely are these two strings to be the same person's name?"** Those are different questions, and generic fuzzy-string libraries only answer the first.

- 🇬🇧 **English-first** — a large hypocorism table (`Peggy`→`Margaret`, `Polly`→`Mary`, `Nancy`→`Ann`), Mc/Mac and O' handling, and English record conventions
- 🇮🇳 **Indian names as a first-class target** — Indic romanisation folds (`Geetha`/`Geeta`, `Lakshmi`/`Laxmi`, `Rajeev`/`Rajiv`), South Indian initials, and `S/O` · `D/O` · `W/O` record markers
- 🧠 Name intelligence — initials, abbreviations, nicknames, spelling variants, particles, titles, suffixes, reordering
- 🔍 Explainable — every score comes with the evidence for and against it
- 🌍 Also handles non-Latin input — transliteration from Devanagari, Arabic, Cyrillic, Greek, Hebrew and Han
- 📊 Benchmarked on **1,941 labelled pairs** across 47 categories, plus held-out, English-only and Indian-only sets
- ⚖️ `strict` / `balanced` / `fuzzy` presets — you own the match decision, not the library
- 🟦 TypeScript, zero runtime dependencies, ESM + CJS

```ts
import { matchNames } from 'name-similarity'

matchNames('Satyendra Sagar Singh', 'S S Singh')
// { score: 90, matched: true, confidence: 'very-high' }

matchNames('सत्येंद्र सागर सिंह', 'Satyendra Sagar Singh')
// { score: 100, matched: true, confidence: 'very-high' }

matchNames('Satyendra Sagar Singh', 'Satyendra Kumar Singh')
// { score: 47, matched: false, confidence: 'low' }
```

## Install

```bash
npm install name-similarity
```

Node 18+. Works in browsers and edge runtimes — no Node built-ins are used at runtime.

## Why not a fuzzy-string library

Levenshtein does not know that `Mohd` abbreviates `Mohammad`, that `Smith John` is `John Smith`, or that `Michael` and `Michelle` are different people. It also does not know that a one-character difference means something very different in `Jennifer` than it does in `Jing`.

| Pair | Jaro-Winkler | `name-similarity` | Reality |
|---|---:|---:|---|
| `John Smith` / `Smith John` | 0.53 | **96** | Same person, inverted |
| `Mohd Rahman` / `Mohammad Rahman` | 0.86 | **95** | Same person, abbreviated |
| `A K Sharma` / `Ajay Kumar Sharma` | 0.74 | **90** | Same person, initials |
| `Michael Johnson` / `Michelle Johnson` | 0.96 | **38** | Different people |
| `Raj Kumar` / `Rajesh Kumar` | 0.94 | **32** | Different people |

The last two are the point. A string metric ranks them as near-certain matches; a name matcher must not.

## Quickstart

```ts
import { matchNames } from 'name-similarity'

matchNames('Satyendra Sagar Singh', 'Satyendra S Singh')
// { score: 98, matched: true, confidence: 'very-high' }
```

Ask for the evidence with `detailed: true`:

```ts
const result = matchNames('Satyendra Sagar Singh', 'S S Singh', { detailed: true })
```

```jsonc
{
  "score": 90,
  "matched": true,
  "confidence": "very-high",
  "band": "strong",
  "probability": 0.9598,          // P(same person), calibrated separately from score
  "model": "heuristic",

  "normalized": { "a": "satyendra sagar singh", "b": "s s singh" },

  "components": {
    "firstNameSimilarity": 0.82,
    "middleNameSimilarity": 0.82,
    "lastNameSimilarity": 1,
    "tokenSimilarity": 0.88,
    "initialsSimilarity": 1,
    "phoneticSimilarity": 0.88
  },

  "reasons": [
    "Last names are identical",
    "First names are highly similar",
    "Initials are compatible with the full names"
  ],

  "alignment": [
    { "a": "satyendra", "b": "s",     "score": 0.82, "kind": "initial" },
    { "a": "sagar",     "b": "s",     "score": 0.82, "kind": "initial" },
    { "a": "singh",     "b": "singh", "score": 1,    "kind": "exact" }
  ]
}
```

`reasons` reports **negative** evidence too, which is what you actually need in production:

```ts
matchNames('Satyendra Sagar Singh', 'Satyendra Kumar Singh', { detailed: true })
// {
//   score: 47,
//   matched: false,
//   reasons: [
//     "Middle names are present on both sides and disagree",
//     "Last names are identical",
//     "First names are identical",
//     "Unmatched name parts: \"sagar\", \"kumar\"",
//     "The parts that agree are very common names, so agreement is weak evidence"
//   ]
// }
```

Identical given and family names, and still not a match — because the middle names
contradict each other, and `Singh` is common enough that agreeing on it carries little
weight. The same shape catches `John Smith Jr` against `John Smith Sr`, which scores
**72** and does not match at the default threshold.

## Score semantics

The score is a **calibrated similarity**, not a probability.

| Score | Band | Confidence |
|---|---|---|
| 95-100 | Extremely strong | `very-high` |
| 85-94 | Strong | `very-high` |
| 70-84 | Likely | `high` |
| 50-69 | Possible | `medium` |
| 30-49 | Weak | `low` |
| 1-29 | Very weak | `very-low` |

`score` and `probability` are deliberately separate. A score of 93 does **not** mean a 93% chance of the same person — on this benchmark it corresponds to about 0.976. Conflating the two is exactly the mistake that makes identity systems overconfident. Use `score` for ranking and display; use `probability` when a downstream decision needs a calibrated number.

## Similarity is not a decision

The engine produces evidence. **You** decide what counts as a match.

```ts
matchNames(a, b, { threshold: 85 })
matchNames(a, b, { mode: 'strict' })
```

| Mode | Threshold | Conflict sensitivity | Use for |
|---|---:|---:|---|
| `strict` | 88 | 1.35 | Identity, KYC, sanctions screening. Cross-language cognates (`Juan`/`John`) are ignored. |
| `balanced` | 75 | 1.0 | General record linkage and de-duplication. **Default.** |
| `fuzzy` | 62 | 0.7 | Search and suggestion ranking, where a miss costs more than a spurious hit. |

A preset moves the threshold *and* how harshly contradictions are punished. Raising the threshold alone would make a strict caller reject good matches while still scoring conflicting names generously.

## What it handles

### English names

English is the primary target, so it gets the deepest coverage. Real scores from the current build:

| A | B | Score | Verdict | Why |
|---|---|---:|---|---|
| `John McDonald` | `John MacDonald` | **99** | match | Mc / Mac interchange |
| `Patrick O'Brien` | `Patrick OBrien` | **99** | match | apostrophe surname |
| `Smith, John A.` | `John Alan Smith` | **98** | match | records layout, middle initial |
| `Steve Rogers` | `Steven Rogers` | **94** | match | nickname reached through a spelling variant |
| `John "Jack" Smith` | `John Smith` | **93** | match | quoted nickname, a US records convention |
| `Peggy Wilson` | `Margaret Wilson` | **92** | match | hypocorism no rule can derive |
| `Polly Adams` | `Mary Adams` | **92** | match | hypocorism |
| `Nancy Foster` | `Ann Foster` | **92** | match | hypocorism |
| `Nate Baker` | `Kate Baker` | **57** | no match | two short forms, one edit apart |
| `Sally Brooks` | `Sally Brook` | **34** | no match | a trailing `s` marks a separate family |

The last two matter as much as the first eight. `Brook` and `Brooks` are one edit apart and different families; `Nate` and `Kate` are one edit apart and different people.


### Indian names

The second focus. Indic romanisation has no standard, so the same person appears under many spellings — the folds below are applied so those variants are recognised as one name rather than left to fuzzy matching.

| A | B | Score | Verdict | Why |
|---|---|---:|---|---|
| `सत्येंद्र सागर सिंह` | `Satyendra Sagar Singh` | **100** | match | Devanagari → Latin |
| `Rajesh Kumar S/O Suresh` | `Rajesh Kumar` | **100** | match | `S/O` names the father; it is dropped |
| `Satyendra Sagar Singh` | `Singh, Satyendra Sagar` | **100** | match | comma-inverted record |
| `Satyendra Sagar Singh` | `S S Singh` | **90** | match | South Indian initials |
| `Smt Sunita Devi` | `Sunita Devi` | **99** | match | honorific |
| `Ram Kumar Yadav` | `Ramkumar Yadav` | **99** | match | compound given name |
| `Geetha Krishnan` | `Geeta Krishnan` | **98** | match | aspirated consonant folded (`th`→`t`) |
| `Padmanabhan Iyer` | `Padmanaban Iyer` | **98** | match | `bh`→`b` |
| `Lakshmi Narayanan` | `Laxmi Narayanan` | **97** | match | `ksh` written `x` |
| `Rajeev Menon` | `Rajiv Menon` | **97** | match | `ee`→`i` |
| `Anoop Nambiar` | `Anup Nambiar` | **97** | match | `oo`→`u` |
| `M S Dhoni` | `Mahendra Singh Dhoni` | **90** | match | initials expanded |
| `V V S Laxman` | `Vangipurappu Venkata Sai Laxman` | **89** | match | three leading initials |
| `Priya Menon` | `Riya Menon` | **64** | no match | different given names |
| `Deepak Verma` | `Deepika Verma` | **60** | no match | gendered pair |
| `Amit Shah` | `Amit Sah` | **48** | no match | `sh`/`s` is deliberately not folded |
| `Satyendra Sagar Singh` | `Satyendra Kumar Singh` | **47** | no match | middle names contradict |
| `Rajesh Kumar S/O Suresh` | `Suresh Kumar` | **36** | no match | subject must not match the father |

The last row is the one that matters. Without handling `S/O`, `D/O` and `W/O`, a record matches the *father's* name — a false positive that looks entirely plausible.

### Everything else

| A | B | Score | Verdict | Why |
|---|---|---:|---|---|
| `John Smith` | `John Smith` | **100** | match | identical |
| `José García` | `Jose Garcia` | **100** | match | accents folded |
| `Mary-Jane Smith` | `Mary Jane Smith` | **100** | match | hyphenation |
| `Smith, John` | `John Smith` | **100** | match | comma-inverted |
| `राहुल शर्मा` | `Rahul Sharma` | **100** | match | Devanagari → Latin |
| `Dr. John Smith` | `John Smith` | **99** | match | title removed |
| `Abdul Rahman` | `Abdulrahman` | **99** | match | spacing convention |
| `John Smith` | `Jon Smith` | **99** | match | spelling variant |
| `Katherine Jones` | `Kathryn Jones` | **99** | match | variant spelling |
| `Jan van der Berg` | `Jan Vanderberg` | **99** | match | particles joined |
| `محمد علي` | `Mohammad Ali` | **98** | match | Arabic → Latin |
| `Jonh Smith` | `John Smith` | **96** | match | transposition |
| `John Smith` | `Smith John` | **96** | match | reordered |
| `Mohd Rahman` | `Mohammad Rahman` | **95** | match | contraction |
| `John Michael Smith` | `John Smith` | **93** | match | middle name dropped |
| `Mohammad Abdul Rahman` | `Mohd A Rahman` | **93** | match | contraction + initial |
| `Bob Smith` | `Robert Smith` | **92** | match | nickname |
| `A K Sharma` | `Ajay Kumar Sharma` | **90** | match | initials expanded |
| `John Smith Jr` | `John Smith Sr` | **72** | no match | suffix conflict |
| `John Lee` | `Jon Li` | **63** | no match | short surnames differ |
| `John Smith` | `Peter Smith` | **39** | no match | given name differs |
| `Michael Johnson` | `Michelle Johnson` | **38** | no match | gendered look-alike |
| `Wei Zhang` | `Wei Chang` | **33** | no match | distinct romanisations |
| `Raj Kumar` | `Rajesh Kumar` | **32** | no match | truncation, not abbreviation |
| `John Smith` | `John Jones` | **26** | no match | family name differs |
| `John Smith` | `Peter Jones` | **7** | no match | unrelated |

## API

### `matchNames(a, b, options?)`

Returns `MatchResult`, or `DetailedMatchResult` when `detailed: true`.

```ts
interface MatchResult {
  score: number       // 1..100
  matched: boolean    // score >= threshold
  confidence: 'very-low' | 'low' | 'medium' | 'high' | 'very-high'
}
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `detailed` | `boolean` | `false` | Return the full evidence object |
| `threshold` | `number` | per mode | Score at or above which `matched` is true |
| `mode` | `'strict' \| 'balanced' \| 'fuzzy'` | `'balanced'` | Tolerance preset |
| `model` | `'heuristic' \| 'logistic'` | `'heuristic'` | Scoring engine |
| `aliases` | `Record<string, string[]>` | — | Extra nickname/variant groups (raises scores) |
| `distinctNames` | `Array<[string, string]>` | — | Pairs your data treats as different names (lowers scores) |
| `disableDefaultAliases` | `boolean` | `false` | Ignore the built-in alias tables |
| `disableDefaultDistinctNames` | `boolean` | `false` | Ignore the built-in look-alike table |
| `normalize` | `NormalizeOptions` | — | Pipeline overrides (accents, hyphens, titles, …) |
| `parse` | `ParseOptions` | — | `locale`, `familyNameFirst` |
| `weights` | `Partial<HeuristicWeights>` | tuned | Component weight overrides |
| `cache` | `boolean` | `true` | Memoise normalisation and phonetic codes |
| `fastPath` | `boolean` | `true` | Short-circuit identical normalised names |

### Exports

- **`matchNames(a, b, options?)`** — the main entry point.
- **`NameMatcher`** — reusable, pre-resolved configuration for bulk work. The result type of `match()` follows the `detailed` option it was constructed with.
- **`rankNames(name, candidates, options?)`** — rank candidates, highest score first.
- **`similarityScore(a, b, options?)`** — score only.
- **`extractFeatures(a, b, options?)`** — the feature vector, for training your own model.
- **`normalize(name, options?)`** / **`parseName(name, options?)`** — inspect the pipeline.
- **`fitCalibration(samples)`** / **`probabilityOf(similarity, calibration)`** — recalibrate on your own data.
- **`clearCaches()`** — drop every internal cache.

Every algorithm is exported individually too — `levenshteinDistance`, `damerauLevenshteinDistance`, `jaroWinklerSimilarity`, `doubleMetaphone`, `soundex`, `nysiis`, `solveMaxAssignment`, and the rest.

## Configuring for your data

### Custom aliases and custom look-alikes

Two opposite levers. `aliases` can only make a pair *more* similar:

```ts
matchNames('Zed Smith', 'Zebulon Smith', { aliases: { zed: ['zebulon'] } })
// 53 → 94
```

`distinctNames` can only make it *less* similar — the lever you need when the engine's default judgment is wrong for your data:

```ts
matchNames('Ana Nunez', 'Ana Nunes')
// 98, matched — the -ez/-es endings are treated as one surname family

matchNames('Ana Nunez', 'Ana Nunes', { distinctNames: [['nunez', 'nunes']] })
// 34, not matched
```

Neither rewrites the input; both produce *features*, so the scorer decides what the evidence is worth.

### Locale-aware parsing

```ts
parseName('Jose Garcia Marquez', { locale: 'es' })
// family: ['garcia', 'marquez']

parseName('Chen Wei', { familyNameFirst: true })
// family: ['chen'], given: ['wei']
```

### Your own model

```ts
import { extractFeatures, trainLogistic, predictProbability } from 'name-similarity'

const samples = labelled.map(({ a, b, isSame }) => ({
  features: extractFeatures(a, b),
  label: isSame ? 1 : 0,
}))

const model = trainLogistic(samples, { negativeWeight: 2 }) // punish false positives
predictProbability(extractFeatures('John Smith', 'Jon Smith'), model)
```

## Bulk comparison

For large jobs use `NameMatcher`, which resolves the configuration once:

```ts
const matcher = new NameMatcher({ mode: 'strict' })
for (const [a, b] of pairs) matcher.score(a, b)
```

Apple M-series, Node 24, full comparisons that miss every cache:

| Operation | Throughput | Per call |
|---|---:|---:|
| `NameMatcher.score` | ~55,000 /sec | 18 µs |
| `matchNames` (fresh options) | ~50,000 /sec | 20 µs |
| `matchNames` detailed | ~48,000 /sec | 21 µs |
| identical names (fast path) | ~330,000 /sec | 3 µs |

Cold start is 0.26 ms. Throughput is flat from 1,000 to 1,000,000 comparisons.

## How it compares

Measured, not asserted. `npm run compare` runs every library below over the same 1,941
labelled pairs, and **gives each one its own optimal threshold** by sweeping all 100
cut-offs on that data — an advantage the baselines get and `name-similarity` does not.

The comparison libraries are deliberately *not* dependencies — they exist only to
reproduce this one report and would add roughly 200 MB to every install. Install them
when you want to check the numbers:

```bash
npm install --no-save fastest-levenshtein string-similarity fuzzball natural talisman
npm run compare
```

| Library | Precision | Recall | F1 | AUC | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| **name-similarity** | **99.9%** | **100.0%** | **100.0%** | **0.9994** | **1** | **0** |
| normalised blend¹ | 82.1% | 94.4% | 87.8% | 0.8578 | 271 | 74 |
| hand-rolled blend² | 81.9% | 92.8% | 87.0% | 0.8609 | 270 | 95 |
| fuzzball `token_set_ratio` | 81.9% | 92.2% | 86.7% | 0.8486 | 268 | 102 |
| fuzzball `token_sort_ratio` | 79.5% | 92.8% | 85.6% | 0.8427 | 315 | 95 |
| Dice (`string-similarity`) | 83.8% | 86.3% | 85.0% | 0.8311 | 219 | 180 |
| Double Metaphone (`natural`) | 71.2% | 98.2% | 82.5% | 0.7850 | 523 | 23 |
| Jaro-Winkler (`natural`) | 70.6% | 94.8% | 80.9% | 0.7019 | 519 | 68 |
| Jaro-Winkler (`talisman`) | 67.8% | 99.8% | 80.8% | 0.7033 | 621 | 3 |
| Levenshtein ratio | 67.6% | 99.1% | 80.4% | 0.6946 | 623 | 12 |

¹ `fuzzball.token_set_ratio` + Double Metaphone, run on this package's normalised output.
² the same blend on raw strings — what people actually write when they need name matching.

**Normalisation is not the difference.** Handing the baselines this package's own
normalisation moves them from 87.0% to 87.8% F1, and leaves AUC flat. The gap is the name
intelligence and the conflict handling, not the accent folding.

### Where the difference actually is

Per-category F1 against the strongest baseline:

| Category | name-similarity | best baseline | What the baseline misses |
|---|---:|---:|---|
| adversarial false positives | **100.0%** | 21.4% | `Michael`/`Michelle`, `Raj`/`Rajesh` score ~95 on string metrics |
| contradicting middle initials | **0 FP** | 40 FP / 40 | `John A Smith` vs `John B Smith` looks like a 97% match |
| near-miss surnames | **0 FP** | 29 FP / 74 | `Ingrid Schneider` vs `Ingrid Schmidt` |
| initials expanded | **100.0%** | 72.2% | `A K Sharma` vs `Ajay Kumar Sharma` shares almost no characters |
| English hypocorisms | **100.0%** | 68.4% | `Peggy`/`Margaret` has no string relationship at all |
| Indian initials | **100.0%** | 66.7% | `M S Dhoni` vs `Mahendra Singh Dhoni` |
| English surnames | **100.0%** | 77.8% | Mc/Mac, `Brook`/`Brooks` |
| abbreviations | **100.0%** | 89.8% | `Mohd`/`Mohammad` |

### Where they are fine

Being straight about it — a generic token-aware metric is competitive on several things,
and if this is all you need, you do not need this package:

| Category | name-similarity | best baseline |
|---|---:|---:|
| token reordering | 100.0% | **100.0%** |
| Indic romanisation | 100.0% | 97.9% |
| suffixes | 99.2% | 97.7% |
| transliteration | 100.0% | 99.3% |

`fuzzball.token_set_ratio` handles `John Smith` vs `Smith John` perfectly, because sorting
tokens is exactly what it does. Simple character-level variation is largely solved by any
decent metric.

### Read this with the caveat it deserves

This benchmark is **mine**. I chose the categories, wrote the hard cases, and built the
engine against them — so it is evidence about the cases I think matter, not a neutral
survey. Two things partly offset that: the baselines get their best possible threshold,
and the generated portion (83% of the pairs) comes from transformation rules rather than
from anything the engine knows about.

On the 331 hand-curated hard cases the baselines fall to AUC 0.50-0.71, and their optimal
strategy becomes "match everything". That number says those cases were *selected* to defeat
string similarity — which is the point of a curated adversarial set, but it is not a claim
that these libraries are broadly poor. Reproduce any of it with the install line above and `npm run compare`.

## Benchmark

1,941 labelled pairs across 47 categories: 331 hand-curated hard cases plus 1,610 generated ones. Three further sets are generated and never tuned against — a **held-out** set (1,616 pairs, different seed), an **English-only** set (1,552 pairs) and an **Indian-only** set (1,560 pairs), since those two traditions are the primary targets and an aggregate hides how either performs.

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

Held-out results track the tuned set closely, which is the evidence that the engine was fitted to the problem rather than to the data. On English and Indian names alone it reaches **100% precision at `strict` and `balanced`**, with AUC 1.0000 and 0.9998 respectively.

**Read the numbers honestly.** The `nickname`, `alias` and `transliteration` positives are generated from this package's own tables, so those categories measure integration, not generalisation. The curated set is where out-of-table behaviour is tested. See [docs/benchmark.md](docs/benchmark.md).

## How it works

```text
Name A ──┐
Name B ──┤
         ▼
   Normalization      unicode · accents · punctuation · titles · suffixes · transliteration
         ▼
   Tokenization       particles · concatenation reconciliation
         ▼
   Name parser        given / middle / family / suffix, locale-aware
         ▼
   Feature generation exact · token · edit · phonetic · initials · abbreviation
                      alias · reordering · transliteration · conflicts · rarity
         ▼
   Scoring engine     weighted evidence → interaction floors → conflict gates → ceilings
         ▼
   Score + confidence + probability + explanation
```

Four rules keep the layers honest:

1. **Similarity algorithms know nothing about names.** `jaroWinkler('john', 'jon')` computes string similarity and nothing else.
2. **Name intelligence is its own layer.** Initials, nicknames, abbreviations, particles and reordering live there, not in the metrics and not in the scorer.
3. **Everything becomes a feature.** The `FeatureVector` is the only thing the scoring layer sees — it never touches a string.
4. **The scoring model is replaceable.** Swapping the heuristic for a trained model changes nothing upstream.

See [docs/architecture.md](docs/architecture.md) and [docs/scoring.md](docs/scoring.md).

## Limitations

Stated plainly, because a matcher you cannot trust the limits of is a matcher you cannot use for identity work.

- **Han, Hangul and Kana are table-driven.** Chinese surnames and common given-name characters are mapped to pinyin; anything outside those tables will not transliterate. Korean and Japanese are detected but not romanised.
- **Arabic and Hebrew rely on curated tables for common names.** Rule-based fallback recovers consonants but not short vowels, so an uncommon Arabic name may score lower than it should. Add entries via `aliases` for your own data.
- **Nickname and variant coverage is a dictionary, and dictionaries are incomplete.** The built-in tables lean Anglo, South Asian, Arabic and European. Extend with `aliases`.
- **`Md Rahman` vs `Rahman MD` is scored as a match.** Leading `Md` abbreviates `Mohammad` and trailing `MD` is a medical degree, but with two tokens each the engine sees the same token multiset. This is the single known false positive in the benchmark.
- **Two people genuinely called `John Smith` will score 100.** That is correct as a *similarity*; use `probability` and `rarityWeightedAgreement`, which both account for how common the agreeing names are.
- **The bundled logistic model is disabled.** It was trained (see `npm run train`) and did not beat the heuristic on held-out data — 99.72% vs 99.81% F1 — so it is not shipped enabled. Requesting `{ model: 'logistic' }` throws a clear error rather than silently returning heuristic numbers.

## Development

```bash
npm install
npm test                 # unit + integration + benchmark gates
npm run typecheck
npm run bench            # per-category accuracy report
npm run bench:perf       # throughput
npm run validate         # tuned vs curated vs held-out vs English vs Indian
npm run compare          # head-to-head vs other libraries (optional install, see above)
npm run dataset:build    # regenerate the benchmark (deterministic)
npm run dataset:holdout  # regenerate the held-out set
npm run dataset:english  # regenerate the English-only set
npm run dataset:indian   # regenerate the Indian-only set
npm run tune             # tune heuristic weights, validated against the holdout
npm run train            # train the logistic model and fit calibration
npm run build
```

Every accuracy change must be justified by a measured improvement on **held-out** data, not by inspection. `npm run tune` and `npm run train` both refuse to adopt a change that only helps the data it was fitted to.

## License

MIT
