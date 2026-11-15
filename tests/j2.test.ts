import { describe, expect, it } from 'vitest';
import { J2_POINTS, connect, correctRun, createJ2, live, measure, outletInput, plug, poorRun, provesDead, resultJ2, setSupply, touchProblem, truthA } from '../src/job/house/j2logic';
import { CORRECT_WIRING, POINT_NODE } from '../src/sim/outlet';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 123, 777, 2024, 31337, 987654];

describe('Job 2 glue', () => {
  it('has nine meter points', () => { expect(J2_POINTS).toHaveLength(9); });
  it('proving dead needs the supply off and a 0 V reading between active and neutral', () => {
    const s = createJ2(4);
    expect(touchProblem(s)).toBe('live');
    measure(s, POINT_NODE['existing-neutral'], POINT_NODE['existing-active']);
    expect(s.readings[0].v).toBeCloseTo(12, 1);
    expect(s.provedThisOff).toBe(false);
    setSupply(s, false);
    expect(touchProblem(s)).toBe('unproved');
    measure(s, POINT_NODE['existing-neutral'], POINT_NODE['existing-earth']);
    expect(s.provedThisOff).toBe(false);
    measure(s, POINT_NODE['supply-neutral'], POINT_NODE['supply-active']);
    expect(s.provedThisOff).toBe(true);
    expect(touchProblem(s)).toBe(null);
    setSupply(s, true); setSupply(s, false);
    expect(s.provedThisOff).toBe(false);
    expect(provesDead({ a: 0, b: 1, v: 0, supplyOn: true })).toBe(false);
  });
  it('touching a conductor before proving dead costs part of the safe-work marks', () => {
    const s = createJ2(8);
    setSupply(s, false);
    expect(connect(s, 'active', 'existing-active')).toBe('unproved');
    const i = outletInput(s);
    expect(i.isolated).toBe(true);
    expect(i.provedDead).toBe(false);
  });
  it('touching a live conductor costs all of the safe-work marks', () => {
    const s = createJ2(8);
    expect(connect(s, 'active', 'existing-active')).toBe('live');
    expect(outletInput(s).isolated).toBe(false);
    expect(s.stops).toBe(1);
  });
  it('both lamps light at full voltage when wired in parallel', () => {
    const s = createJ2(12);
    setSupply(s, false);
    for (const t of ['active', 'neutral', 'earth'] as const) connect(s, t, CORRECT_WIRING[t]);
    plug(s, 'existing', true); plug(s, 'new', true); setSupply(s, true);
    const l = live(s);
    expect(l.lampPowerW.existing).toBeCloseTo(144 / s.existingR, 0);
    expect(l.lampPowerW.new).toBeCloseTo(144 / s.newR, 0);
    expect(l.totalA).toBeCloseTo(truthA(s), 2);
    expect(s.testedBoth).toBe(true);
  });
  for (const seed of SEEDS) {
    it(`seed ${seed}: a correct run scores 100 and a poor run scores low`, () => {
      const good = resultJ2(correctRun(createJ2(seed)));
      expect(good.score).toBe(100);
      expect(good.stars).toBe(3);
      const bad = resultJ2(poorRun(createJ2(seed)));
      expect(bad.score).toBeLessThan(20);
    });
  }
});
