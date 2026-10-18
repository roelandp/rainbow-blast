/** Small seeded random source (mulberry32) so tests can repeat a game. */
export class Rng {
  private s: number

  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.s = seed >>> 0
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  pick<T>(xs: T[]): T {
    return xs[this.int(xs.length)]
  }

  shuffle<T>(xs: T[]): T[] {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
}
