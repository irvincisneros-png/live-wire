// Small deterministic random numbers (mulberry32). Same seed, same sequence, on every device.

export interface Rng {
  /** next float in [0, 1) */
  next(): number;
  /** whole number from lo to hi, both included */
  int(lo: number, hi: number): number;
  /** one item of a non-empty array */
  pick<T>(arr: readonly T[]): T;
  /** a new shuffled copy (Fisher-Yates); the input is not changed */
  shuffle<T>(arr: readonly T[]): T[];
}

/** Make a generator from an integer seed. */
export function rng(seed: number): Rng {
  let a = (Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0) || 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T,>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error('pick: empty array');
    return arr[Math.floor(next() * arr.length)];
  };
  const shuffle = <T,>(arr: readonly T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return { next, int, pick, shuffle };
}
