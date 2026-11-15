import { describe, expect, it } from 'vitest';
import { solve } from '../src/sim/circuit';
import { REASONING_CORRECT, allFaults, applyFault, buildScenario, darkGlobes, discriminates, distinguishes, healthyHouse, houseLayout, isUseful, readVoltage, scoreFault } from '../src/sim/faults';
import type { Fault } from '../src/sim/faults';

const find = (id: string): Fault => allFaults().find((f) => f.partId === id)!;

describe('healthy house', () => {
  it('lights all three globes at about 10 W each', () => {
    const parts = healthyHouse();
    const s = solve({ parts });
    expect(s.status).toBe('ok');
    for (const g of ['g0', 'g1', 'g2']) { expect(s.parts[g].power).toBeCloseTo(10, 1); expect(s.parts[g].drop).toBeCloseTo(12, 1); }
    expect(darkGlobes(parts)).toEqual([]);
  });
  it('globes are in parallel: each branch carries 5/6 A, the battery carries all three', () => {
    const s = solve({ parts: healthyHouse() });
    expect(s.parts.g0.current).toBeCloseTo(10 / 12, 2);
    expect(s.parts.bat.current).toBeCloseTo(3 * 10 / 12, 2);
  });
  it('every part has a layout entry and every node has a position', () => {
    const parts = healthyHouse(), layout = houseLayout();
    for (const p of parts) expect(layout.parts[p.id]?.label).toBeTruthy();
    for (const p of parts) for (const n of [p.a, p.b]) expect(layout.nodes[n]).toBeDefined();
    expect(layout.parts.g0.label).toBe('Lounge globe');
    expect(layout.parts.sw1.label).toBe('Kitchen switch');
    expect(layout.parts['wire-C'].label).toBe('Wire C');
  });
});

describe('faults', () => {
  it('there are 16 candidate faults', () => {
    const f = allFaults();
    expect(f.length).toBe(16);
    expect(f.filter((x) => x.kind === 'switch-open').length).toBe(4);
    expect(f.filter((x) => x.kind === 'blown-globe').length).toBe(3);
    expect(f.filter((x) => x.kind === 'broken-wire').length).toBe(9);
  });
  it('every fault changes exactly one part and darkens at least one globe', () => {
    for (const f of allFaults()) {
      const healthy = healthyHouse(), faulty = applyFault(f);
      if (f.kind === 'broken-wire') expect(faulty.length).toBe(healthy.length - 1);
      else expect(faulty.filter((p, i) => JSON.stringify(p) !== JSON.stringify(healthy[i])).length).toBe(1);
      expect(darkGlobes(faulty).length).toBeGreaterThan(0);
    }
  });
  it('a stuck switch is open and locked so it cannot be closed', () => {
    const p = applyFault(find('sw1')).find((x) => x.id === 'sw1')!;
    expect(p.closed).toBe(false);
    expect(p.locked).toBe(true);
    expect(darkGlobes(applyFault(find('sw1')))).toEqual(['g1']);
  });
  it('the main switch fault darkens everything; a branch fault darkens one globe', () => {
    expect(darkGlobes(applyFault(find('main'))).length).toBe(3);
    expect(darkGlobes(applyFault(find('wire-H')))).toEqual(['g2']);
    expect(darkGlobes(applyFault(find('g0')))).toEqual(['g0']);
  });
  it('other globes stay lit with a branch fault', () => {
    const s = solve({ parts: applyFault(find('wire-B')) });
    expect(s.parts.g1.power).toBeCloseTo(10, 1);
    expect(s.parts.g2.power).toBeCloseTo(10, 1);
  });
});

describe('seed', () => {
  it('is deterministic', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const a = buildScenario(seed), b = buildScenario(seed);
      expect(a.fault).toEqual(b.fault);
      expect(a.parts).toEqual(b.parts);
    }
  });
  it('covers every kind across seeds, with exactly one fault each', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const sc = buildScenario(seed);
      kinds.add(sc.fault.kind);
      expect(sc.fault.description.length).toBeGreaterThan(5);
      expect(sc.layout.parts[sc.fault.partId]).toBeDefined();
      expect(sc.layout.parts[sc.fault.partId].missing === true).toBe(sc.fault.kind === 'broken-wire');
      expect(sc.parts).toEqual(applyFault(sc.fault));
    }
    expect([...kinds].sort()).toEqual(['blown-globe', 'broken-wire', 'switch-open']);
  });
});

describe('measurements', () => {
  it('voltmeter across a healthy globe reads 12 V; across a closed switch reads 0 V', () => {
    expect(readVoltage(healthyHouse(), { a: 5, b: 6 })).toBeCloseTo(-12, 1);
    expect(readVoltage(healthyHouse(), { a: 6, b: 5 })).toBeCloseTo(12, 1);
    expect(readVoltage(healthyHouse(), { a: 3, b: 4 })).toBeCloseTo(0, 2);
    expect(readVoltage(healthyHouse(), { a: 0, b: 0 })).toBe(0);
  });
  it('across a stuck-open switch the voltmeter reads the full 12 V', () => {
    const f = find('sw0'); // nodes 3 and 4
    expect(Math.abs(readVoltage(applyFault(f), { a: 3, b: 4 }))).toBeCloseTo(12, 1);
    expect(distinguishes(f, { a: 3, b: 4 })).toBe(true);
  });
  it('across a broken wire the voltmeter reads the full 12 V', () => {
    const f = find('wire-C'); // wire-C joins node 6 to node 0
    expect(Math.abs(readVoltage(applyFault(f), { a: 6, b: 0 }))).toBeCloseTo(12, 1);
    expect(distinguishes(f, { a: 6, b: 0 })).toBe(true);
  });
  it('a measurement in a healthy branch does not distinguish the fault', () => {
    const f = find('wire-C');
    expect(distinguishes(f, { a: 7, b: 8 })).toBe(false); // Kitchen switch nodes 7 and 8
    expect(isUseful(f, { a: 7, b: 8 })).toBe(false);
    expect(distinguishes(f, { a: 0, b: 2 })).toBe(false); // supply rail
  });
  it('a blown globe reads like a healthy one, so only discrimination can tell it apart', () => {
    const f = find('g0'); // globe nodes 5 and 6
    expect(distinguishes(f, { a: 6, b: 5 })).toBe(false);
    expect(discriminates(f, { a: 6, b: 5 })).toBe(true);
    expect(isUseful(f, { a: 6, b: 5 })).toBe(true);
  });
  it('a floating end of a broken wire is read through the globe', () => {
    const f = find('wire-A'); // feed wire: bus node 2 to switch-in node 3
    expect(distinguishes(f, { a: 3, b: 0 })).toBe(true);
  });
});

describe('scoreFault', () => {
  const f = find('sw1');
  const good = { fault: f, answerKind: 'switch-open' as const, answerPartId: 'sw1', measurements: [{ a: 7, b: 8 }], reasoning: REASONING_CORRECT };
  it('perfect = 100', () => {
    const r = scoreFault(good);
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
  });
  it('nothing = 0', () => {
    const r = scoreFault({ fault: f, answerKind: null, answerPartId: null, measurements: [], reasoning: null });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
  });
  it('right kind, wrong part in the same room = 20 + 10, plus the other parts', () => {
    expect(scoreFault({ ...good, answerPartId: 'g1', measurements: [], reasoning: null }).score).toBe(30);
  });
  it('right part but wrong kind: 30', () => {
    expect(scoreFault({ ...good, answerKind: 'blown-globe', measurements: [], reasoning: null }).score).toBe(30);
  });
  it('measuring without finding the fault still earns the measurement marks', () => {
    expect(scoreFault({ fault: f, answerKind: null, answerPartId: null, measurements: [{ a: 7, b: 8 }], reasoning: null }).score).toBe(25);
  });
  it('a useless measurement earns nothing', () => {
    expect(scoreFault({ ...good, measurements: [{ a: 3, b: 4 }] }).score).toBe(75);
  });
});
