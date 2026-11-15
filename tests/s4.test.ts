import { describe, expect, it } from 'vitest';
import { solve, meterReading } from '../src/sim/circuit';
import { postId } from '../src/bench/grid';
import {
  MYSTERY_VALUES, RESISTORS, distinctVoltages, fitThroughOrigin, groupOf, lineEnd, mysteryRecorded, ohmCurrent, ohmParts, ohmVoltage, pickMystery, ratio, shapeOf, sig3,
} from '../src/stations/s4/logic';

const g = { cols: 5, rows: 4 };
const P = (c: number, r: number) => postId(g, c, r);
const readPoint = (emf: number, R: number) => {
  const parts = ohmParts(P, { emf, R });
  const s = solve({ parts });
  const a = parts.find((p) => p.kind === 'ammeter')!, v = parts.find((p) => p.kind === 'voltmeter')!;
  return { I: Math.abs(meterReading(a, s)), V: Math.abs(meterReading(v, s)) };
};

describe('best fit through the origin', () => {
  it('recovers R exactly for ideal data', () => {
    for (const R of [10, 22, 33, 47, 100, 15, 68]) {
      const pts = [1, 2, 3, 4.5, 6].map((V) => ({ V, I: V / R }));
      expect(Math.abs(fitThroughOrigin(pts)! - R)).toBeLessThan(1e-9);
    }
  });
  it('is close to R for readings taken from the simulator (meters read within 0.1 %)', () => {
    for (const R of RESISTORS) {
      const pts = [2, 4, 6].map((v) => readPoint(v, R));
      const k = fitThroughOrigin(pts)!;
      expect(Math.abs(k - R) / R).toBeLessThan(0.001);
    }
  });
  it('returns null with no current', () => {
    expect(fitThroughOrigin([])).toBeNull();
    expect(fitThroughOrigin([{ V: 0, I: 0 }])).toBeNull();
  });
  it('V divided by I is the same at every point', () => {
    const r = [2, 4, 6].map((v) => ratio(readPoint(v, 47)));
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(0.1);
  });
});

describe('Ohm helpers', () => {
  it('double the voltage doubles the current; double the resistance halves it', () => {
    expect(ohmCurrent(4, 22) / ohmCurrent(2, 22)).toBeCloseTo(2, 12);
    expect(ohmCurrent(6, 100) / ohmCurrent(6, 50)).toBeCloseTo(0.5, 12);
    expect(ohmVoltage(ohmCurrent(9, 33), 33)).toBeCloseTo(9, 12);
  });
  it('sig3 gives three significant figures', () => {
    expect(sig3(0.0909)).toBe('0.0909');
    expect(sig3(47.0004)).toBe('47.0');
    expect(sig3(100)).toBe('100');
  });
});

describe('graph geometry', () => {
  it('a line leaves through the top or the right edge', () => {
    expect(lineEnd(10, 1.2, 12)).toEqual({ x: 1.2, y: 12 });
    const e = lineEnd(100, 1.2, 12);
    expect(e.y).toBe(12);
    expect(e.x).toBeCloseTo(0.12, 12);
    const f = lineEnd(5, 1.2, 12);
    expect(f.x).toBe(1.2);
    expect(f.y).toBeCloseTo(6, 12);
  });
  it('each resistor has its own marker shape', () => {
    const shapes = new Set([...RESISTORS.map(String), 'mystery', 'globe'].map(shapeOf));
    expect(shapes.size).toBe(7);
  });
});

describe('check (a): mystery points', () => {
  const mk = (vs: number[], group = 'mystery') => vs.map((V) => ({ group, V, I: V / 39 }));
  it('passes with four points at different voltages', () => expect(mysteryRecorded(mk([2, 4, 6, 8]))).toBe(true));
  it('fails with three points', () => expect(mysteryRecorded(mk([2, 4, 6]))).toBe(false));
  it('fails when the four points are at nearly one voltage', () => expect(mysteryRecorded(mk([2, 2.1, 2.2, 2.3]))).toBe(false));
  it('fails when the points belong to another resistor', () => expect(mysteryRecorded(mk([2, 4, 6, 8], '47'))).toBe(false));
  it('counts distinct voltages', () => expect(distinctVoltages([{ V: 2 }, { V: 2.1 }, { V: 4 }])).toBe(2));
});

describe('mystery resistor and grouping', () => {
  it('the seeded value is always from the list and repeatable', () => {
    for (let s = 0; s < 50; s++) expect(MYSTERY_VALUES).toContain(pickMystery(s));
    expect(pickMystery(7)).toBe(pickMystery(7));
  });
  it('R from the solver matches the hidden value, within the answer tolerance', () => {
    for (const R of MYSTERY_VALUES) {
      const s = solve({ parts: ohmParts(P, { emf: 6, R, mystery: true }) });
      const k = Math.abs(s.parts.R.drop / s.parts.R.current);
      expect(Math.abs(k - R) / R).toBeLessThan(0.08);
    }
  });
  it('a point is grouped by the resistor the voltmeter sits across', () => {
    const plain = ohmParts(P, { emf: 4, R: 33 });
    expect(groupOf(plain, plain.find((p) => p.kind === 'voltmeter')!)).toBe('33');
    const mys = ohmParts(P, { emf: 4, R: 33, mystery: true });
    expect(groupOf(mys, mys.find((p) => p.kind === 'voltmeter')!)).toBe('mystery');
    expect(groupOf(plain, { id: 'x', kind: 'voltmeter', a: P(0, 0), b: P(1, 0) })).toBe('other');
  });
});

describe('checks (c) and (d)', () => {
  it('(c) I = V / R from the solver for 9 V across 33 ohm with no ammeter', () => {
    const s = solve({ parts: ohmParts(P, { emf: 9, R: 33, ammeter: false }) });
    const V = Math.abs(s.parts.R.drop);
    expect(Math.abs(Math.abs(s.parts.R.current) - V / 33)).toBeLessThan(1e-9);
    expect(Math.abs(s.parts.R.current)).toBeCloseTo(0.2727, 3);
  });
  it('(d) halving: the same supply with double R gives half the current', () => {
    const a = Math.abs(solve({ parts: ohmParts(P, { emf: 6, R: 22 }) }).parts.R.current);
    const b = Math.abs(solve({ parts: ohmParts(P, { emf: 6, R: 44 }) }).parts.R.current);
    expect(b / a).toBeCloseTo(0.5, 3);
  });
});
