# Scoring

The heuristic model runs in three stages. Order matters.

```text
weighted evidence  →  interaction floors  →  conflict gates  →  ceilings
```

## Stage 0 — short circuits

| Condition | Similarity |
| --- | ---: |
| Normalised strings identical, affixes identical | 1.000 |
| Normalised strings identical, titles or suffixes differ | 0.985 |
| Compact forms identical (spacing only) | 0.990 |
| Any generational suffix conflict | *no short circuit* |

The last row is the important one. `John Smith Jr` and `John Smith Sr` normalise to the
same string; short-circuiting them to 100 is the classic father/son false positive.

## Stage 1 — weighted evidence

A weighted mean over the components the pair actually exhibits:

| Component | Weight | Source |
| --- | ---: | --- |
| `token` | 0.485 | assignment-based token coverage |
| `lastName` | 0.219 | family-slot similarity |
| `firstName` | 0.135 | given-slot similarity |
| `phonetic` | 0.060 | phonetic agreement across aligned tokens |
| `initials` | 0.035 | initial-sequence compatibility |
| `alias` | 0.035 | strongest alias evidence *(conditional)* |
| `middleName` | 0.015 | middle-slot similarity |
| `edit` | 0.006 | Damerau + Jaro-Winkler over the compact strings |
| `order` | 0.006 | token-order preservation |
| `abbreviation` | 0.003 | strongest abbreviation evidence *(conditional)* |

Two things about these numbers:

**`token` dominating is not a bug.** Assignment-based token coverage already contains the
per-token alias, abbreviation, typo and phonetic evidence, because each aligned pair was
scored by the name-intelligence layer. The small `edit`, `abbreviation` and `order` weights
stop the engine counting the same evidence twice.

**Conditional components leave the denominator when absent.** A pair with no nickname
relationship is not penalised for the absence of one. Without this, every ordinary pair
would be dragged down by two components that are zero for almost all names.

Only relative size matters — the mean divides by the sum of the weights it applied, so
scaling them all changes nothing.

They were fitted by `npm run tune` (coordinate ascent on mean F1 across all three presets)
and adopted because held-out mean F1 rose from 0.9857 to 0.9912.

## Stage 2 — interaction floors

A weighted average cannot say *"two independent slots agreeing is worth more than the sum
of its parts"*. Floors do:

| Condition | Floor |
| --- | --- |
| given ≥ 0.99 **and** family ≥ 0.99 | `0.90 + 0.08 × coverage` |
| given ≥ 0.85 **and** family ≥ 0.99 | `0.84 + 0.08 × coverage` |
| given ≥ 0.99 **and** family ≥ 0.85 | `0.82 + 0.08 × coverage` |
| given ≥ 0.80 **and** family ≥ 0.80 | `0.70 + 0.10 × coverage` |

A floor is suppressed entirely when a hard conflict fired, so identical given and family
names cannot rescue a suffix or middle-name contradiction.

## Stage 3 — conflict gates

Multiplicative, applied after the floor, so an omitted middle name still costs something
even when both slots agree.

| Gate | Multiplier | Fires when |
| --- | ---: | --- |
| `family-name-conflict` | 0.55 | family names present on both sides and contradictory |
| `middle-name-conflict` | 0.60 | both sides record a middle name and they disagree |
| `look-alike-distinct-names` | 0.60 | curated or gendered look-alike pair |
| `given-name-conflict` | 0.70 | given names present on both sides and contradictory |
| `suffix-conflict` | 0.72 | generational suffixes disagree |
| `unresolved-script-difference` | 0.80 | different writing systems, transliteration failed |
| `truncation-risk` | 0.85 | one name is a shorter name that also stands alone |
| `weak-family-evidence` | 0.60 → 1.00 | family similarity in the ambiguous 0.50-0.78 band |
| `weak-given-evidence` | 0.72 → 1.00 | given similarity in the ambiguous 0.50-0.78 band |
| `middle-name-omitted` | 0.97 | one side carries a middle name the other lacks |
| `token-order-differs` | 0.97 | the reordered reading won |

The two **weak-evidence** gates carry more of the load than any other rule. They cover the
case that a threshold-based conflict test misses entirely: `Ingrid Schneider` and
`Ingrid Schmidt` share a given name and a first syllable, contradict nothing, and are two
different people. They interpolate rather than step, so a pair does not jump several points
because a similarity crossed a boundary.

A curated look-alike suppresses the generic role gate — one disagreement, one penalty.

### Mode sensitivity

`conflictSensitivity` scales the *penalty*, not the multiplier:

```text
scaled = 1 - (1 - multiplier) × sensitivity
```

So a 0.55 gate becomes 0.39 under `strict` and 0.69 under `fuzzy`, while a multiplier of
1 stays 1 at every setting.

## Stage 4 — ceilings

| Condition | Ceiling |
| --- | ---: |
| Either name is a single token and they are not identical | 0.85 |
| One token on the shorter side with poor identifying agreement | 0.70 |
| Every token is an initial and there are at most two | 0.88 |

Ceilings express structural weakness of the *evidence*, not disagreement.

---

## Score, probability, and why they differ

```ts
score       = round(1 + 99 × similarity)          // 1..100
probability = 1 / (1 + e^-(17.73 × similarity - 12.78))
```

The Platt parameters are fitted by `npm run train` against the labelled set. On the current
benchmark P = 0.5 sits at similarity 0.721, i.e. score 72.

They diverge sharply, and that is the point:

| Score | Probability |
| ---: | ---: |
| 100 | 0.993 |
| 93 | 0.976 |
| 85 | 0.906 |
| 75 | 0.616 |
| 72 | 0.484 |
| 60 | 0.098 |
| 40 | 0.003 |

Reporting a score of 90 as "90% likely the same person" would be wrong in both directions
depending on where you are on the curve. Use `score` for ranking and display, `probability`
when a downstream decision needs a calibrated number.

Recalibrate on your own data:

```ts
import { fitCalibration, probabilityOf } from 'name-similarity';

const calibration = fitCalibration(
  myPairs.map(({ similarity, isSame }) => ({ similarity, label: isSame ? 1 : 0 })),
);
probabilityOf(similarity, calibration);
```

---

## The learned model

`src/scoring/model.ts` implements logistic regression over the same `FeatureVector`. It is
trained by `npm run train`, which writes `src/scoring/weights.ts`.

**It currently ships disabled.** On held-out data it scored 99.72% F1 against the
heuristic's 99.81%, and the trainer refuses to enable a model that does not beat the
heuristic on data it was not fitted to. Requesting `{ model: 'logistic' }` throws rather
than silently returning heuristic numbers under a different label.

The coefficients are still informative, and they agree with the design:

```text
suffixConflict               -2.92
givenNameConflict            -1.98
coreTokenSimilarity          +1.72
tokenSimilarity              +1.69
familyNameConflict           -1.63
middleNameConflict           -1.59
firstNameSimilarity          +1.34
affixMismatch                -1.26
lastNamePhoneticSimilarity   +1.25
lastNameSimilarity           +1.24
```

Interestingly the model's held-out **AUC** (0.9992) beats the heuristic's (0.9987) — it
separates the classes slightly better but is worse at the specific operating point. With
more labelled data, particularly on the categories the generated set covers thinly, that
gap is where a learned model would start to win.
