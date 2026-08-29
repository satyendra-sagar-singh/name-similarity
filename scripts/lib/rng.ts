/**
 * Deterministic PRNG (mulberry32).
 *
 * The benchmark must be reproducible: a dataset that changes between runs
 * cannot tell you whether a metric moved because the model improved or because
 * the data did.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty list');
    return items[this.int(items.length)]!;
  }

  /** Pick an item that is not `exclude`, giving up after a bounded retry. */
  pickOther<T>(items: readonly T[], exclude: T): T {
    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = this.pick(items);
      if (candidate !== exclude) return candidate;
    }
    return this.pick(items);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const swapIndex = this.int(index + 1);
      const temporary = copy[index]!;
      copy[index] = copy[swapIndex]!;
      copy[swapIndex] = temporary;
    }
    return copy;
  }
}
