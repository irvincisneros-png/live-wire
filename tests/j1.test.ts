import { describe, expect, it } from 'vitest';
import { J1_POINTS, createJ1, correctRun, liveParts, locationOptions, measure, poorRun, resultJ1, usefulPair } from '../src/job/house/j1logic';
import { darkGlobes, houseLayout } from '../src/sim/faults';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 123, 777, 2024, 31337, 987654];

describe('Job 1 glue', () => {
  it('has 15 test points covering every node once', () => {
    expect(J1_POINTS).toHaveLength(15);
    expect(new Set(J1_POINTS.map((p) => p.node)).size).toBe(15);
  });
  it('lists every fault location', () => {
    const ids = locationOptions().map((o) => o.id);
    for (const id of Object.keys(houseLayout().parts)) if (id !== 'bat') expect(ids).toContain(id);
  });
  it('a stuck switch stays open even when the student switches it on', () => {
    for (const seed of SEEDS) {
      const s = createJ1(seed);
      if (s.scenario.fault.kind !== 'switch-open') continue;
      const p = liveParts(s).find((x) => x.id === s.scenario.fault.partId)!;
      expect(p.closed).toBe(false);
    }
  });
  it('switching a working room off darkens its globe', () => {
    const s = createJ1(5);
    const before = darkGlobes(liveParts(s));
    s.switchOn.sw0 = s.switchOn.sw1 = s.switchOn.sw2 = false;
    expect(darkGlobes(liveParts(s))).toHaveLength(3);
    expect(before.length).toBeGreaterThan(0);
  });
  it('the meter reads V(red) − V(black) on the live circuit', () => {
    const s = createJ1(9);
    s.switchOn.main = false;
    const v = measure(s, 0, 1);
    expect(v).toBeCloseTo(12, 1);
    expect(s.log).toHaveLength(1);
  });
  for (const seed of SEEDS) {
    it(`seed ${seed}: a useful reading exists, a correct run scores 100, a poor run scores low`, () => {
      expect(usefulPair(createJ1(seed))).not.toBeNull();
      const good = resultJ1(correctRun(createJ1(seed)));
      expect(good.score).toBe(100);
      expect(good.stars).toBe(3);
      expect(good.answers.length).toBeGreaterThanOrEqual(4);
      const bad = resultJ1(poorRun(createJ1(seed)));
      expect(bad.score).toBeLessThan(30);
    });
  }
});
