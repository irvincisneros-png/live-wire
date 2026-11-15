import { describe, expect, it } from 'vitest';
import { solve, meterReading } from '../src/sim/circuit';
import type { Part } from '../src/types';

const bat = (id: string, a: number, b: number, emf = 6): Part => ({ id, kind: 'battery', a, b, emf, rInt: 1e-6 });
const res = (id: string, a: number, b: number, r: number): Part => ({ id, kind: 'resistor', a, b, resistance: r });
const wire = (id: string, a: number, b: number): Part => ({ id, kind: 'wire', a, b });

describe('solver', () => {
  it('single resistor: I = V / R, battery delivers', () => {
    const s = solve({ parts: [bat('B', 0, 1), res('R', 1, 0, 12)] });
    expect(s.status).toBe('ok');
    expect(s.parts.R.current).toBeCloseTo(0.5, 5);
    expect(s.parts.B.current).toBeCloseTo(0.5, 5);
    expect(s.parts.B.drop).toBeCloseTo(-6, 5);
    expect(s.parts.R.power).toBeCloseTo(3, 4);
    expect(s.parts.B.power).toBeCloseTo(3, 4);
    expect(s.node[1] - s.node[0]).toBeCloseTo(6, 5);
  });
  it('series: same current, voltages add', () => {
    const s = solve({ parts: [bat('B', 0, 1, 12), res('R1', 1, 2, 10), res('R2', 2, 0, 30)] });
    expect(s.parts.R1.current).toBeCloseTo(0.3, 5);
    expect(s.parts.R2.current).toBeCloseTo(0.3, 5);
    expect(s.parts.R1.drop + s.parts.R2.drop).toBeCloseTo(12, 4);
    expect(s.parts.R2.drop).toBeCloseTo(9, 4);
  });
  it('parallel: same voltage, currents add', () => {
    const s = solve({ parts: [bat('B', 0, 1, 6), res('R1', 1, 0, 12), res('R2', 1, 0, 6)] });
    expect(s.parts.R1.current).toBeCloseTo(0.5, 4);
    expect(s.parts.R2.current).toBeCloseTo(1, 4);
    expect(s.parts.B.current).toBeCloseTo(1.5, 4);
  });
  it('open switch: no current, dots stay; closed: flows', () => {
    const parts: Part[] = [bat('B', 0, 1), { id: 'S', kind: 'switch', a: 1, b: 2, closed: false }, res('R', 2, 0, 12)];
    let s = solve({ parts });
    expect(s.live).toBe(false);
    expect(s.parts.R.current).toBe(0);
    parts[1].closed = true;
    s = solve({ parts });
    expect(s.parts.R.current).toBeCloseTo(0.5, 3);
  });
  it('short circuit is flagged', () => {
    const s = solve({ parts: [{ id: 'B', kind: 'battery', a: 0, b: 1, emf: 6 }, wire('W', 1, 0)] });
    expect(s.shorted).toEqual(['B']);
  });
  it('globe overloaded at double voltage, and blown globe is open', () => {
    const g: Part = { id: 'G', kind: 'globe', a: 1, b: 0, ratedV: 6, ratedW: 3 };
    let s = solve({ parts: [bat('B', 0, 1, 12), g] });
    expect(s.overloaded).toEqual(['G']);
    g.blown = true;
    s = solve({ parts: [bat('B', 0, 1, 12), g] });
    expect(s.live).toBe(false);
  });
  it('meters: ammeter in series reads I, voltmeter across reads V and barely loads', () => {
    const parts: Part[] = [bat('B', 0, 1, 6), { id: 'A', kind: 'ammeter', a: 1, b: 2 }, res('R', 2, 0, 12), { id: 'V', kind: 'voltmeter', a: 0, b: 2 }];
    const s = solve({ parts });
    expect(meterReading(parts[1], s)).toBeCloseTo(0.5, 3);
    expect(meterReading(parts[3], s)).toBeCloseTo(6, 3);
  });
  it('voltmeter across an open switch reads the full supply', () => {
    const parts: Part[] = [bat('B', 0, 1, 6), { id: 'S', kind: 'switch', a: 1, b: 2 }, res('R', 2, 0, 12), { id: 'V', kind: 'voltmeter', a: 2, b: 1 }];
    const s = solve({ parts });
    expect(meterReading(parts[3], s)).toBeCloseTo(6, 3);
  });
  it('floating bits and empty circuits never throw or go invalid', () => {
    expect(solve({ parts: [] }).status).toBe('ok');
    const s = solve({ parts: [bat('B', 0, 1), res('R', 5, 6, 10), wire('W', 7, 7)] });
    expect(s.status).toBe('ok');
    expect(s.live).toBe(false);
  });
  it('energy is conserved: battery power = sum of dissipated power', () => {
    const parts: Part[] = [{ id: 'B', kind: 'battery', a: 0, b: 1, emf: 9 }, res('R1', 1, 2, 22), res('R2', 2, 0, 47), res('R3', 2, 0, 33), wire('W', 1, 3), res('R4', 3, 0, 68)];
    const s = solve({ parts });
    const out = parts.filter((p) => p.kind !== 'battery').reduce((t, p) => t + s.parts[p.id].power, 0);
    const lostInside = s.parts.B.current ** 2 * 0.005;
    expect(s.parts.B.power).toBeCloseTo(out + lostInside, 6);
  });
});
