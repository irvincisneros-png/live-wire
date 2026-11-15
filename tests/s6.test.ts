// Station 6 pure helpers: every check answer comes from the sim lamps.
import { describe, expect, it } from 'vitest';
import {
  IMPROVE_CORRECT, IMPROVE_OPTIONS, IRON, LAMPS, WHERE_CORRECT, WHERE_OPTIONS, checkAnswers, conserves, efficiencyAnswerOk, lampById,
  mostEfficient, packetRates, pct1, sankeyFor, surfaceTempC, thermalT,
} from '../src/stations/s6/logic';
import { within } from '../src/sim/units';

describe('s6 check answers', () => {
  it('halogen efficiency is light ÷ input × 100 from the sim', () => {
    const { haloEff } = checkAnswers();
    const h = lampById('halogen');
    expect(haloEff).toBeCloseTo((h.lightW / h.inputW) * 100, 9);
    expect(within(9.5, haloEff, 0.03)).toBe(true);
    expect(within(42, haloEff, 0.03)).toBe(false);
    expect(within(4, haloEff, 0.03)).toBe(false);
  });
  it('incandescent waste is input − light (conservation)', () => {
    const { incWaste } = checkAnswers();
    expect(incWaste).toBe(56);
    expect(within(56, incWaste, 0.01)).toBe(true);
    expect(within(64, incWaste, 0.01)).toBe(false);
  });
  it('the most efficient lamp is the LED', () => { expect(mostEfficient()).toBe('led'); });
  it('choice answers point at the right options', () => {
    expect(WHERE_OPTIONS[WHERE_CORRECT]).toMatch(/still exists/);
    expect(IMPROVE_OPTIONS[IMPROVE_CORRECT]).toMatch(/oil the chain/);
  });
});

describe('s6 guided efficiency entry', () => {
  it('accepts a rounded answer and rejects wrong ones', () => {
    expect(efficiencyAnswerOk('incandescent', 6.7)).toBe(true);
    expect(efficiencyAnswerOk('incandescent', 6.67)).toBe(true);
    expect(efficiencyAnswerOk('led', 44.4)).toBe(true);
    expect(efficiencyAnswerOk('led', 9)).toBe(false);
    expect(efficiencyAnswerOk('halogen', NaN)).toBe(false);
    expect(efficiencyAnswerOk('incandescent', 0.067)).toBe(false);
  });
  it('formats to one decimal place', () => { expect(pct1(6.6667)).toBe('6.7'); expect(pct1(44.444)).toBe('44.4'); });
});

describe('s6 Sankey and packets', () => {
  it('light + heat = input for every lamp', () => {
    for (const l of LAMPS) {
      expect(conserves(l.id)).toBe(true);
      const s = sankeyFor(l.id);
      expect(s.usefulW + s.wastedW).toBeCloseTo(s.inputW, 9);
    }
  });
  it('packet rates are in proportion to the watts', () => {
    for (const l of LAMPS) {
      const r = packetRates(l);
      expect(r.light + r.heat).toBeCloseTo(l.inputW, 9);
      expect(r.light / r.heat).toBeCloseTo(l.lightW / l.heatW, 9);
    }
  });
});

describe('s6 thermal view', () => {
  it('the incandescent is hottest and the LED is barely warm', () => {
    const [inc, hal, led] = ['incandescent', 'halogen', 'led'].map((id) => surfaceTempC(lampById(id as 'led')));
    expect(inc).toBeGreaterThan(hal);
    expect(hal).toBeGreaterThan(led);
    expect(led).toBeLessThan(50);
    expect(inc).toBeGreaterThan(150);
  });
  it('maps temperatures into 0..1 and the palette is ordered', () => {
    expect(thermalT(-50)).toBe(0);
    expect(thermalT(1000)).toBe(1);
    for (let i = 1; i < IRON.length; i++) expect(IRON[i][0]).toBeGreaterThan(IRON[i - 1][0]);
  });
});

describe('s6 writing rules', () => {
  it('no em dashes, "simply" or "just" in the option text', () => {
    for (const t of [...WHERE_OPTIONS, ...IMPROVE_OPTIONS]) { expect(t).not.toMatch(/—/); expect(t).not.toMatch(/\b(simply|just)\b/i); }
  });
});
