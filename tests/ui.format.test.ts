import { describe, expect, it } from 'vitest';
import { formatBase, formatSI, ohmLine, powerLine } from '../src/ui/format';
import { allowedError, isAcceptable, numberHint, parseNumber } from '../src/ui/numcheck';

describe('formatSI', () => {
  it('uses 3 significant figures and SI prefixes', () => {
    expect(formatSI(6, 'V')).toBe('6.00 V');
    expect(formatSI(12, 'Ω')).toBe('12.0 Ω');
    expect(formatSI(0.5, 'A')).toBe('500 mA');
    expect(formatSI(0.0123, 'A')).toBe('12.3 mA');
    expect(formatSI(1500, 'W')).toBe('1.50 kW');
    expect(formatSI(3.6e6, 'J')).toBe('3.60 MJ');
    expect(formatSI(4.7e-6, 'A')).toBe('4.70 µA');
    expect(formatSI(100, 'Ω')).toBe('100 Ω');
  });
  it('rounds up into the next prefix instead of showing 1000', () => {
    expect(formatSI(999.7, 'W')).toBe('1.00 kW');
    expect(formatSI(0.9996, 'A')).toBe('1.00 A');
  });
  it('handles zero, negatives and missing values', () => {
    expect(formatSI(0, 'J')).toBe('0.00 J');
    expect(formatSI(-0.25, 'V')).toBe('−250 mV');
    expect(formatSI(undefined, 'V')).toBe('—');
    expect(formatSI(NaN, 'V')).toBe('—');
    expect(formatSI(Infinity, 'V')).toBe('—');
  });
});

describe('formula lines', () => {
  it('matches the example in the brief', () => {
    const l = ohmLine({ V: 6, I: 0.5, R: 12 });
    expect(l.nums).toBe('6.00 = 0.500 × 12.0');
    expect(l.complete).toBe(true);
    expect(powerLine({ P: 3, V: 6, I: 0.5 }).nums).toBe('3.00 = 6.00 × 0.500');
  });
  it('fills in only when the values are present', () => {
    const l = ohmLine({ V: 6, I: 0.5 });
    expect(l.complete).toBe(false);
    expect(l.nums).toBe('6.00 = 0.500 × —');
  });
  it('formatBase uses exponents only at extremes', () => {
    expect(formatBase(1500)).toBe('1500');
    expect(formatBase(0.0005)).toBe('5.00e-4');
    expect(formatBase(0)).toBe('0.00');
  });
});

describe('number checks', () => {
  it('parses what students type', () => {
    expect(parseNumber('0.5')).toBe(0.5);
    expect(parseNumber(' 0,5 ')).toBe(0.5);
    expect(parseNumber('12 ohm')).toBe(12);
    expect(parseNumber('6 V')).toBe(6);
    expect(parseNumber('1e3')).toBe(1000);
    expect(parseNumber('−2')).toBe(-2);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('5 6 7')).toBeNull();
  });
  it('accepts within the fractional tolerance', () => {
    expect(isAcceptable(12, 0.05, 12.5)).toBe(true);
    expect(isAcceptable(12, 0.05, 12.6)).toBe(true);
    expect(isAcceptable(12, 0.05, 12.7)).toBe(false);
    expect(isAcceptable(12, 0.05, 11.4)).toBe(true);
    expect(isAcceptable(12, 0.05, 11.3)).toBe(false);
  });
  it('applies an absolute floor of 0.005 near zero', () => {
    expect(allowedError(0, 0.05)).toBe(0.005);
    expect(isAcceptable(0, 0.05, 0.004)).toBe(true);
    expect(isAcceptable(0, 0.05, 0.01)).toBe(false);
    expect(isAcceptable(0.02, 0.01, 0.024)).toBe(true);
    expect(allowedError(50, 0.01)).toBeCloseTo(0.5);
  });
  it('does not reveal the answer on the first two wrong tries', () => {
    for (const n of [1, 2]) {
      const hint = numberHint(0.5, 0.9, n);
      expect(hint).not.toMatch(/0\.5/);
    }
    expect(numberHint(6, null, 1)).toMatch(/number/i);
    expect(numberHint(6, 6000, 1)).toMatch(/units/i);
  });
  it('gives direction on the second wrong try', () => {
    expect(numberHint(10, 20, 2)).toMatch(/high/);
    expect(numberHint(10, 2, 2)).toMatch(/low/);
  });
});
