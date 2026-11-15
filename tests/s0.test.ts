import { describe, expect, it } from 'vitest';
import { createLensModel, fromOut, glowAt, heatFor, neckRadius, solveLens, DRIFT_PER_AMP } from '../src/lens/model';
import { loopLength, makeLayout, neckWeight, pointAt } from '../src/lens/path';
import {
  HALF_AMP, NUMBER_SETUP, NUMBER_SETUP_ANSWER, SWITCH_CORRECT, SWITCH_OPTIONS, VOLTAGE_CORRECT, VOLTAGE_OPTIONS, WORDS, LIMITS, ARROW_NOTE,
  halfAmpOk, pileAnswer,
} from '../src/stations/s0/logic';

describe('lens model', () => {
  it('I = V / R when closed, zero when open', () => {
    const r = solveLens({ volts: 6, ohms: 12, closed: true });
    expect(r.I).toBeCloseTo(0.5, 10);
    expect(r.VR).toBeCloseTo(6, 10);
    expect(r.P).toBeCloseTo(3, 10);
    expect(r.Vgap).toBe(0);
    const o = solveLens({ volts: 6, ohms: 12, closed: false });
    expect(o.I).toBe(0);
    expect(o.P).toBe(0);
    expect(o.VR).toBe(0);
    expect(o.Vgap).toBe(6);
    expect(o.drift).toBe(0);
  });
  it('drift speed and packet rate are proportional to I and P', () => {
    const a = solveLens({ volts: 6, ohms: 12, closed: true });
    const b = solveLens({ volts: 12, ohms: 12, closed: true });
    expect(a.drift).toBeCloseTo(DRIFT_PER_AMP * 0.5, 10);
    expect(b.drift / a.drift).toBeCloseTo(2, 10);
    expect(b.packetRate / a.packetRate).toBeCloseTo(4, 10);
  });
  it('glow is full before the resistor and dim after it; dim on both sides when open', () => {
    const c = solveLens({ volts: 9, ohms: 18, closed: true });
    expect(c.glowBefore).toBeCloseTo(0.75, 10);
    expect(c.glowAfter).toBe(0);
    const o = solveLens({ volts: 9, ohms: 18, closed: false });
    expect(o.glowBefore).toBe(0);
  });
  it('clamps voltage to 0..12 and survives bad input', () => {
    expect(solveLens({ volts: 50, ohms: 12, closed: true }).V).toBe(12);
    expect(solveLens({ volts: NaN, ohms: 12, closed: true }).I).toBe(0);
  });
  it('integrates the energy tally over sim time and resets', () => {
    const m = createLensModel({ volts: 6, ohms: 12, closed: true });
    for (let i = 0; i < 100; i++) m.step(0.05); // 5 s at 3 W
    expect(m.readings().E).toBeCloseTo(15, 6);
    m.set({ closed: false });
    m.step(0.1);
    expect(m.readings().E).toBeCloseTo(15, 6);
    m.resetEnergy();
    expect(m.energy).toBe(0);
  });
  it('a thinner neck for more resistance; heat rises with power', () => {
    expect(neckRadius(40)).toBeLessThan(neckRadius(12));
    expect(neckRadius(12)).toBeLessThan(neckRadius(4));
    expect(heatFor(0)).toBe(0);
    expect(heatFor(10)).toBeGreaterThan(heatFor(3));
  });
});

describe('loop layout and the energy picture', () => {
  const L = makeLayout();
  it('regions sit in the order dots meet them: − end, switch, gate, resistor, + end', () => {
    const order = [L.gapStart, L.gapEnd, L.gate, L.neckStart, L.neckEnd, L.batteryIn].map((s) => fromOut(s, L));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
  it('dots travel from the − end to the + end along the wire: the − end is on the left of the battery on the back straight, dots move −x there', () => {
    const f = { p: [0, 0, 0] as [number, number, number], t: [0, 0, 0] as [number, number, number] };
    pointAt(L.batteryOut, f);
    expect(f.p[0]).toBeCloseTo(L.batteryX[1], 6);
    expect(f.t[0]).toBe(-1);
    pointAt(L.batteryIn, f);
    expect(f.p[0]).toBeCloseTo(L.batteryX[0], 6);
  });
  it('path is continuous and closed', () => {
    const f = { p: [0, 0, 0] as [number, number, number], t: [0, 0, 0] as [number, number, number] };
    const n = 2000, len = loopLength();
    let prev: number[] = [...pointAt(0, f).p];
    let total = 0;
    for (let i = 1; i <= n; i++) {
      const p = [...pointAt((i / n) * len, f).p];
      const d = Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      expect(d).toBeLessThan((len / n) * 1.01);
      total += d; prev = p;
    }
    expect(total).toBeCloseTo(len, 1);
  });
  it('glow: full leaving −, steady to A, falls across the resistor, dim to +, rises inside the battery', () => {
    const g = (s: number, closed = true) => glowAt(s, L, 12, closed);
    expect(g(L.batteryOut + 0.01)).toBeCloseTo(1, 2);
    expect(g(L.gate)).toBeCloseTo(1, 6);
    expect(g((L.neckStart + L.neckEnd) / 2)).toBeCloseTo(0.5, 6);
    expect(g(L.neckEnd + 0.5)).toBe(0);
    expect(g(L.batteryIn - 0.1)).toBe(0);
    const mid = (L.batteryIn + L.batteryOut) / 2;
    expect(g(mid)).toBeCloseTo(0.5, 2);
  });
  it('glow with the switch open: bright only from − to the gap, dim everywhere after it', () => {
    const g = (s: number) => glowAt(s, L, 6, false);
    expect(g((L.batteryOut + L.gapStart) / 2)).toBeCloseTo(0.5, 6);
    expect(g(L.gate)).toBe(0);
    expect(g((L.neckStart + L.neckEnd) / 2)).toBe(0);
  });
  it('glow scales with voltage (energy per dot)', () => {
    expect(glowAt(L.gate, L, 6, true) * 2).toBeCloseTo(glowAt(L.gate, L, 12, true), 10);
  });
  it('neck weight is 1 inside the resistor and 0 on ordinary wire', () => {
    expect(neckWeight((L.neckStart + L.neckEnd) / 2, L)).toBe(1);
    expect(neckWeight(L.gate, L)).toBe(0);
  });
});

describe('station 0 checks', () => {
  it('half-amp do-check: good and bad states', () => {
    expect(halfAmpOk({ ...solveLens({ volts: 6, ohms: 12, closed: true }) })).toBe(true);
    expect(halfAmpOk({ ...solveLens({ volts: 9, ohms: 18, closed: true }) })).toBe(true);
    expect(halfAmpOk({ ...solveLens({ volts: 6, ohms: 12, closed: false }) })).toBe(false);
    expect(halfAmpOk({ ...solveLens({ volts: 3, ohms: 12, closed: true }) })).toBe(false);
    expect(halfAmpOk({ ...solveLens({ volts: 6.5, ohms: 12, closed: true }) })).toBe(false);
    expect(HALF_AMP).toBe(0.5);
  });
  it('pile number check uses E = P × t from the live model', () => {
    expect(pileAnswer({ P: 4.5 })).toBeCloseTo(45, 10);
    expect(NUMBER_SETUP_ANSWER).toBeCloseTo(solveLens(NUMBER_SETUP).P * 10, 10);
    expect(NUMBER_SETUP_ANSWER).toBeCloseTo(45, 10);
    expect(pileAnswer({ P: 4.5 })).not.toBeCloseTo(4.5, 3); // a student who types the power is wrong
  });
  it('choice answers point at the right options', () => {
    expect(VOLTAGE_OPTIONS[VOLTAGE_CORRECT]).toMatch(/A to point B/);
    expect(VOLTAGE_OPTIONS.some((o, i) => i !== VOLTAGE_CORRECT && /atoms/.test(o))).toBe(true);
    expect(SWITCH_OPTIONS[SWITCH_CORRECT]).toMatch(/stay in the wire/);
  });
  it('student text follows the writing rules', () => {
    const all = [...WORDS.map((w) => w.line), ...LIMITS, ...ARROW_NOTE, ...VOLTAGE_OPTIONS, ...SWITCH_OPTIONS].join(' ');
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/\b(simply|just)\b/i);
    expect(WORDS.map((w) => w.q)).toEqual(['charge', 'current', 'voltage', 'resistance', 'energy', 'power']);
  });
});
