import { describe, expect, it } from 'vitest';
import { rng } from '../src/sim/seed';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = rng(42), b = rng(42);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).toEqual(sb);
  });
  it('differs between seeds', () => {
    expect(rng(1).next()).not.toBe(rng(2).next());
  });
  it('has a known first value for seed 1 (mulberry32)', () => {
    expect(rng(1).next()).toBeCloseTo(0.6270739405881613, 12);
  });
  it('next is in [0, 1)', () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) { const x = r.next(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  it('int is inclusive and covers the range', () => {
    const r = rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
  it('pick returns members and throws on empty', () => {
    const r = rng(9);
    for (let i = 0; i < 50; i++) expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    expect(() => r.pick([])).toThrow();
  });
  it('shuffle keeps members, does not change the input, and is repeatable', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = rng(5).shuffle(input), s2 = rng(5).shuffle(input);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
