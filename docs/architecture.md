# Architecture

## The layering rule

```text
index.ts              public API, option resolution, result assembly
  └── scoring/        heuristic · conflict · calibration · model · explain
        └── features/ feature-vector · token-pair · frequency
              └── similarity/  levenshtein · damerau · jaro-winkler · phonetic · assignment
              └── parse/       person-name · name-parts
              └── tokenize/    tokenizer
              └── normalize/   unicode · accents · punctuation · titles · particles · transliteration
              └── aliases/     default tables · resolver
```

Dependencies point **downward only**. Four rules make that worth enforcing:

### 1. Similarity algorithms know nothing about names

`src/similarity/` contains pure string functions. `jaroWinklerSimilarity('john', 'jon')`
computes string similarity; it does not know the arguments are given names, and it must
not learn. This is what lets them be unit-tested against published reference values
(`MARTHA`/`MARHTA` = 0.961111) rather than against intuitions about names.

`similarity/token.ts` takes a *scoring function* as a parameter. The aligner solves an
assignment problem; the caller supplies the name knowledge.

### 2. Name intelligence is its own layer

`src/features/token-pair.ts` is where generic algorithms become name evidence. It decides
that `Mohd` abbreviates `Mohammad`, that `Raj` does *not* abbreviate `Rajesh`, and that a
single transposition is a stronger signal than an arbitrary substitution.

It works by **channels**. Each channel proposes a score for the pair, and the strongest
wins:

| Channel | Fires on | Ceiling |
| --- | --- | ---: |
| `exact` | identical tokens | 1.00 |
| `initial` | a one-letter token against a full one | 0.88 |
| `alias` | shared alias group, or an orthographic variant | 0.97 |
| `abbreviation` | a dictionary or structural contraction | 0.95 |
| `typo` | small edit distance, transposition-aware | 0.94 |
| `phonetic` | Double Metaphone / NYSIIS / Soundex / consonant skeleton | 0.74 |

Taking the maximum rather than an average matters: a pair should be allowed to match as an
alias *or* a typo *or* a contraction without those independent explanations being averaged
into something weaker than any of them.

Two policies then reduce false positives:

- **Attested-name damping.** When both tokens are names people are actually given, and no
  alias relationship is recorded between them, the typo and phonetic channels are cut to
  72%. `Marco` and `Mario` are one edit apart and are not a misspelling of each other.
- **Look-alike capping.** Curated pairs (`Michael`/`Michelle`) and productive gendered
  endings (`Robert`→`Roberta`, `Simon`→`Simone`) are capped below the match floor, so they
  register as a contradiction rather than a near-match.

### 3. Everything becomes a feature

`src/features/feature-vector.ts` emits a `FeatureVector` — 38 numbers. The scoring layer
sees nothing else. It never touches a string, which is why the heuristic model can be
swapped for a trained one without any of the layers above changing.

### 4. The scoring model is replaceable

`scoreHeuristic(features, weights, sensitivity)` and
`predictProbability(features, model)` have the same input type. `extractFeatures(a, b)` is
public so callers can train their own model on the same features.

---

## The pipeline

### Normalisation

```text
input
  → strip invisible characters (zero-width, bidi marks)
  → detect script
  → transliterate non-Latin scripts
  → fold accents and expand ligatures (ø→o, ß→ss, Þ→Th)
  → lowercase
  → drop parenthetical annotations and bare numbers
  → normalise punctuation, detect the `Family, Given` inversion
  → tokenise
  → extract leading titles and trailing suffixes
```

The original string is never discarded. `normalize()` returns `original`, `normalized`,
`compact`, `tokens`, `titles`, `suffixes`, `script`, `transliterated` and `commaInverted`.

**Multiple representations.** Some decisions cannot be made from one name alone. `Shri` is
an honorific in `Shri Narendra Modi` and the first syllable of a name in `Sri Ram Iyer`.
`normalizeVariants()` returns both readings when an ambiguous honorific was stripped, and
the matcher scores every combination and keeps the best. This is the only place the engine
searches rather than decides.

### Tokenisation

Two operations beyond splitting on whitespace:

- **Particle grouping.** `van der berg` becomes one family unit. Particles are kept, not
  deleted — dropping them makes `De Souza` and `Souza` the same key and inflates false
  positives on Iberian and Dutch registries. A leading particle in a two-token name is
  *not* bound, because `Abd Kamau` is a person, not a family unit with no first name.
- **Concatenation reconciliation.** When token counts differ, adjacent tokens whose
  concatenation matches a token on the other side are merged. This is what makes
  `Abdul Rahman` ≡ `Abdulrahman` and `Van Der Berg` ≡ `Vanderberg`.

### Parsing

Deliberately conservative. It guesses only what is safe and sets `ambiguous` otherwise. A
parser that confidently mis-assigns `Garcia Marquez` costs far more than one that admits
uncertainty — and the feature layer compensates, because a role disagreement is only
treated as a conflict when the token has no home *anywhere* in the other name.

### Feature generation

The alignment is an **optimal assignment**, not a greedy pass. With `John James` against
`James Johnson`, greedy locks `John`→`Johnson` first and strands `James`; the Hungarian
algorithm maximises the total instead.

Role features are computed under two interpretations — as parsed, and with one side's
given and family names swapped — and the better one wins. Registries invert names
constantly, and a swapped reading that scores far better is much more likely to be the
truth than a coincidence.

### Scoring

Three stages, in order. See [scoring.md](scoring.md).

---

## Adding a language

1. Add the character tables to `src/normalize/transliteration-tables.ts`.
2. Add a branch to `transliterateWord` in `src/normalize/transliteration.ts`.
3. Add the script to `SCRIPT_RANGES` in `src/normalize/unicode.ts` if it is not there.
4. **Add benchmark pairs to `datasets/development/curated.ts` first**, then measure.

Abjads (Arabic, Hebrew) need one extra consideration: they do not write short vowels, so
`محمد` can only be romanised mechanically as `mhmd`. Two mechanisms handle this — a curated
table of common names, and a consonant-skeleton comparison whose weight is raised only when
an abjad source is actually involved. In Latin-to-Latin comparison the skeleton is weak
evidence, because `Mohammed` and `Mahmood` also reduce to `mhmd`.
