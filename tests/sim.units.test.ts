import { describe, expect, it } from 'vitest';
import { fmt, fmtMoney, joulesToKWh, kWhToJoules, within, starsFor } from '../src/sim/units';
import { clampScore, makeResult } from '../src/sim/score';

describe('fmt', () => {
  it('uses 3 significant figures and SI prefixes', () => {
    expect(fmt(0.0123, 'A')).toBe('12.3 mA');
    expect(fmt(1500, 'W')).toBe('1.50 kW');
    expect(fmt(3600000, 'J')).toBe('3.60 MJ');
    expect(fmt(230, 'V')).toBe('230 V');
    expect(fmt(4.7e-6, 'A')).toBe('4.70 µA');
    expect(fmt(10_000_000, 'Ω')).toBe('10.0 MΩ');
    expect(fmt(-0.5, 'A')).toBe('-500 mA');
  });
  it('rounds up across a prefix boundary', () => {
    expect(fmt(999.6, 'W')).toBe('1.00 kW');
    expect(fmt(0.9996, 'A')).toBe('1.00 A');
  });
  it('handles zero, NaN and Infinity', () => {
    expect(fmt(0, 'A')).toBe('0 A');
    expect(fmt(NaN, 'A')).toBe('—');
    expect(fmt(Infinity, 'W')).toBe('—');
    expect(fmt(-Infinity, 'W')).toBe('—');
  });
  it('does not prefix kWh or %', () => {
    expect(fmt(1234, 'kWh')).toBe('1230 kWh');
    expect(fmt(8.04, 'kWh')).toBe('8.04 kWh');
    expect(fmt(6.667, '%')).toBe('6.67 %');
    expect(fmt(0.0123, 'kWh')).toBe('0.0123 kWh');
  });
});

describe('fmtMoney', () => {
  it('formats dollars', () => {
    expect(fmtMoney(0)).toBe('$0.00');
    expect(fmtMoney(1234.5)).toBe('$1,234.50');
    expect(fmtMoney(0.33)).toBe('$0.33');
    expect(fmtMoney(-5)).toBe('-$5.00');
    expect(fmtMoney(1234567.891)).toBe('$1,234,567.89');
    expect(fmtMoney(NaN)).toBe('—');
  });
});

describe('energy conversion', () => {
  it('1 kWh = 3.6 MJ', () => {
    expect(kWhToJoules(1)).toBe(3_600_000);
    expect(joulesToKWh(3_600_000)).toBe(1);
    expect(joulesToKWh(kWhToJoules(2.5))).toBeCloseTo(2.5, 12);
  });
});

describe('within', () => {
  it('uses a fractional tolerance', () => {
    expect(within(10.5, 10, 0.05)).toBe(true);
    expect(within(10.51, 10, 0.05)).toBe(false);
    expect(within(9.5, 10, 0.05)).toBe(true);
  });
  it('has an absolute floor near zero', () => {
    expect(within(0.0000005, 0, 0.05)).toBe(true);
    expect(within(0.01, 0, 0.05)).toBe(false);
    expect(within(0.01, 0, 0.05, 0.02)).toBe(true);
  });
  it('rejects NaN and Infinity', () => {
    expect(within(NaN, 1, 0.1)).toBe(false);
    expect(within(1, Infinity, 0.1)).toBe(false);
  });
});

describe('stars and results', () => {
  it('starsFor thresholds', () => {
    expect([0, 49, 49.9, 50, 69, 70, 89, 90, 100].map(starsFor)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3]);
    expect(starsFor(NaN)).toBe(0);
  });
  it('makeResult clamps and trims', () => {
    expect(clampScore(120)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(72.4)).toBe(72);
    const r = makeResult(91, ['a', 'b', 'c', 'd', 'e'], []);
    expect(r.stars).toBe(3);
    expect(r.lines.length).toBe(4);
  });
});
