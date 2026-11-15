import { describe, expect, it } from 'vitest';
import { solve, meterReading } from '../src/sim/circuit';
import { postId } from '../src/bench/grid';
import type { Part } from '../src/types';
import { liveReadings, measuresOnlyB, parallelParts, pointClasses, rowsOf, seriesParts, sitesOf, summaryLines } from '../src/stations/s3/logic';

const g = { cols: 5, rows: 4 };
const P = (c: number, r: number) => postId(g, c, r);
const sol = (parts: Part[]) => solve({ parts });
const close = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('series scene', () => {
  it('is a 6 V loop of 10 and 20 ohm giving round readings', () => {
    const s = sol(seriesParts(P));
    close(Math.abs(s.parts.R1.current), 0.2);
    close(Math.abs(s.parts.R1.drop), 2);
    close(Math.abs(s.parts.R2.drop), 4);
  });
  it('current is the same at every ammeter point', () => {
    const parts = seriesParts(P, { ammeters: ['A', 'B', 'C'] });
    const s = sol(parts);
    const l = liveReadings('series', parts, s, P);
    close(l.iA!, 0.2); close(l.iB!, 0.2); close(l.iC!, 0.2);
    for (const m of parts.filter((p) => p.kind === 'ammeter')) close(Math.abs(meterReading(m, s)), 0.2);
  });
  it('voltages across the parts add up to the supply', () => {
    const parts = seriesParts(P, { voltmeters: ['R1', 'R2', 'S'] });
    const l = liveReadings('series', parts, sol(parts), P);
    close(l.vR1! + l.vR2!, l.vS!, 1e-3);
    close(l.vS!, 6, 0.01);
  });
  it('an open gap kills the loop and no rows log a reading', () => {
    const parts = [...seriesParts(P, { open: ['A'] }), { id: 'x', kind: 'voltmeter' as const, a: P(3, 2), b: P(3, 1) }];
    const l = liveReadings('series', parts, sol(parts), P);
    expect(Object.values(l).every((v) => v === null)).toBe(true);
  });
  it('a voltmeter on the far post of a wire still counts as across that part', () => {
    const parts = [...seriesParts(P), { id: 'x', kind: 'voltmeter' as const, a: P(2, 2), b: P(3, 1) }];
    const l = liveReadings('series', parts, sol(parts), P);
    close(l.vR1!, 2);
  });
});

describe('parallel scene', () => {
  it('branch voltages equal the supply and branch currents add up', () => {
    const parts = parallelParts(P, { voltmeters: ['A', 'B', 'S'], ammeters: ['M', 'A', 'B'] });
    const l = liveReadings('parallel', parts, sol(parts), P);
    close(l.vA!, 6, 0.01); close(l.vB!, 6, 0.01); close(l.vS!, 6, 0.01);
    close(l.iA!, 0.5, 0.005); close(l.iB!, 0.25, 0.005); close(l.iM!, 0.75, 0.005);
    close(l.iA! + l.iB!, l.iM!, 0.005);
  });
  it('one globe taken out does not stop the other', () => {
    const parts = parallelParts(P, { open: ['A'], ammeters: ['M', 'B'] });
    const l = liveReadings('parallel', parts, sol(parts), P);
    close(l.iB!, 0.25, 0.005);
    expect(l.iA).toBeNull();
  });
  it('every site edge is adjacent and every row names a real site', () => {
    for (const sc of ['series', 'parallel'] as const) {
      const keys = sitesOf(sc, P).map((s) => s.key);
      for (const r of rowsOf(sc, P)) if (r.site) expect(keys).toContain(r.site);
    }
  });
  it('wires and ammeters join posts into one point', () => {
    const cls = pointClasses(parallelParts(P));
    expect(cls(P(3, 2))).toBe(cls(P(2, 2)));
    expect(cls(P(2, 2))).not.toBe(cls(P(2, 1)));
  });
});

describe('check (c): ammeter measures only globe B', () => {
  const closeWith = (open: string[], amm: string[], wires: string[]): Part[] => {
    const parts = parallelParts(P, { open: ['M', 'A', 'B'] });
    const all = sitesOf('parallel', P);
    for (const k of open) void k;
    for (const s of all) {
      if (amm.includes(s.key)) parts.push({ id: `m${s.key}`, kind: 'ammeter', a: s.a, b: s.b });
      else if (wires.includes(s.key)) parts.push({ id: `w${s.key}`, kind: 'wire', a: s.a, b: s.b });
    }
    return parts;
  };
  it('passes with the ammeter in branch B and wires elsewhere', () => {
    const parts = closeWith([], ['B'], ['M', 'A']);
    expect(measuresOnlyB(parts, sol(parts)).ok).toBe(true);
  });
  it('fails with the ammeter in the main line', () => {
    const parts = closeWith([], ['M'], ['A', 'B']);
    const r = measuresOnlyB(parts, sol(parts));
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/main line/);
  });
  it('fails with the ammeter in branch A', () => {
    const parts = closeWith([], ['A'], ['M', 'B']);
    const r = measuresOnlyB(parts, sol(parts));
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/globe A/);
  });
  it('fails while a gap is still open (globes dark)', () => {
    const parts = closeWith([], ['B'], ['M']);
    expect(measuresOnlyB(parts, sol(parts)).ok).toBe(false);
  });
  it('fails with no ammeter', () => {
    const parts = closeWith([], [], ['M', 'A', 'B']);
    expect(measuresOnlyB(parts, sol(parts)).ok).toBe(false);
  });
  it('passes even with a second ammeter in the main line, as long as one measures only B', () => {
    const parts = closeWith([], ['M', 'B'], ['A']);
    expect(measuresOnlyB(parts, sol(parts)).ok).toBe(true);
  });
});

describe('check answers come from the solver', () => {
  it('(a) 10 + 15 ohm in series on 6 V is 0.24 A', () => {
    const s = sol(seriesParts(P, { r1: 10, r2: 15, ammeters: ['B'] }));
    close(Math.abs(s.parts.R1.current), 0.24, 1e-3);
  });
  it('(b) 10 + 50 ohm: 1 V and 5 V, adding to 6 V', () => {
    const s = sol(seriesParts(P, { r1: 10, r2: 50, voltmeters: ['R1'] }));
    close(Math.abs(s.parts.R1.drop), 1, 0.01);
    close(Math.abs(s.parts.R2.drop), 5, 0.01);
  });
});

describe('summary lines', () => {
  it('series sums and equal currents are confirmed', () => {
    const l = summaryLines('series', { iA: 0.2, iB: 0.2, vR1: 2, vR2: 4, vS: 6 });
    expect(l).toHaveLength(2);
    expect(l.every((x) => x.ok)).toBe(true);
    expect(l[1].text).toContain('2.00 V + 4.00 V = 6.00 V');
  });
  it('parallel currents that do not add up are flagged', () => {
    const l = summaryLines('parallel', { iA: 0.5, iB: 0.25, iM: 0.5 });
    expect(l[0].ok).toBe(false);
  });
});
