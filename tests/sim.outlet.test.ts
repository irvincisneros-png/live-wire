import { describe, expect, it } from 'vitest';
import { CORRECT_WIRING, OUTLET_POINTS, PROTECTOR_LIMIT_A, analyseOutlet, handPredictionA, netOf, predictedTotalA, scoreOutlet, type Wiring } from '../src/sim/outlet';

const perfect = { wiring: CORRECT_WIRING, isolated: true, provedDead: true, testedBoth: true, predictedA: 2 };

describe('analyseOutlet: correct wiring', () => {
  const r = analyseOutlet(CORRECT_WIRING);
  it('is parallel, both outlets at 12 V, total 2 A, protector holds', () => {
    expect(r.status).toBe('ok');
    expect(r.topology).toBe('parallel');
    expect(r.existingVolts).toBeCloseTo(12, 1);
    expect(r.newVolts).toBeCloseTo(12, 1);
    expect(r.existingCurrentA).toBeCloseTo(1, 1);
    expect(r.newCurrentA).toBeCloseTo(1, 1);
    expect(r.totalCurrentA).toBeCloseTo(2, 1);
    expect(r.protectorHolds).toBe(true);
    expect(r.newOutletFull && r.existingOutletFull).toBe(true);
    expect(r.problems).toEqual([]);
  });
  it('currents add: total = existing + new', () => {
    expect(r.totalCurrentA).toBeCloseTo(r.existingCurrentA + r.newCurrentA, 6);
  });
  it('matches I = V ÷ R by hand (12 V, 12 W lamps: 12 Ω each, 1 A each)', () => {
    expect(handPredictionA()).toBeCloseTo(2, 12);
    expect(predictedTotalA()).toBeCloseTo(handPredictionA(), 1);
  });
  it('connecting to the supply points is just as good as the existing terminals', () => {
    const w: Wiring = { active: 'supply-active', neutral: 'supply-neutral', earth: 'supply-earth' };
    const s = analyseOutlet(w);
    expect(s.topology).toBe('parallel');
    expect(s.newVolts).toBeCloseTo(12, 1);
  });
  it('adding a new lamp does not change the existing outlet voltage (it stays about 12 V)', () => {
    const alone = analyseOutlet({ active: null, neutral: null, earth: null });
    expect(alone.existingVolts).toBeCloseTo(12, 1);
    expect(alone.totalCurrentA).toBeCloseTo(1, 1);
    expect(r.existingVolts).toBeGreaterThan(11.9);
  });
});

describe('analyseOutlet: errors', () => {
  it('reversed polarity is named as cross-connected and reads negative', () => {
    const r = analyseOutlet({ active: 'existing-neutral', neutral: 'existing-active', earth: 'existing-earth' });
    expect(r.topology).toBe('reversed');
    expect(r.verdict).toMatch(/cross-connected/i);
    expect(r.newVolts).toBeCloseTo(-12, 1);
    expect(r.newOutletFull).toBe(false);
    expect(r.existingVolts).toBeCloseTo(12, 1);
  });
  it('both conductors on one point gives a dead outlet', () => {
    const r = analyseOutlet({ active: 'existing-active', neutral: 'supply-active', earth: 'existing-earth' });
    expect(r.topology).toBe('same-point');
    expect(Math.abs(r.newVolts)).toBeLessThan(0.01);
    expect(r.newCurrentA).toBeCloseTo(0, 4);
  });
  it('a missing conductor is incomplete and the outlet is dead', () => {
    const r = analyseOutlet({ active: 'existing-active', neutral: null, earth: 'existing-earth' });
    expect(r.topology).toBe('incomplete');
    expect(r.problems[0]).toMatch(/neutral/);
    expect(r.newOutletFull).toBe(false);
    expect(r.newCurrentA).toBeCloseTo(0, 6);
  });
  it('nothing connected is incomplete with three problems', () => {
    const r = analyseOutlet({ active: null, neutral: null, earth: null });
    expect(r.topology).toBe('incomplete');
    expect(r.problems.length).toBe(3);
  });
  it('earth on the live point is flagged', () => {
    const r = analyseOutlet({ active: 'existing-active', neutral: 'existing-neutral', earth: 'existing-active' });
    expect(r.topology).toBe('earth-misused');
    expect(r.problems[0]).toMatch(/live/);
  });
  it('earth used as the lamp return is flagged but the lamp still works', () => {
    const r = analyseOutlet({ active: 'existing-active', neutral: 'existing-earth', earth: 'existing-earth' });
    expect(r.topology).toBe('earth-misused');
    expect(r.newVolts).toBeCloseTo(12, 1);
  });
  it('a heavy load trips the protector: two 40 W lamps draw 6.7 A', () => {
    const r = analyseOutlet(CORRECT_WIRING, { existingLampW: 40, newLampW: 40 });
    expect(r.totalCurrentA).toBeCloseTo(80 / 12, 1);
    expect(r.protectorHolds).toBe(false);
    expect(r.problems.join(' ')).toMatch(/trip/);
    expect(PROTECTOR_LIMIT_A).toBe(5);
  });
  it('the limit can be changed', () => {
    expect(analyseOutlet(CORRECT_WIRING, { existingLampW: 40, newLampW: 40, limitA: 10 }).protectorHolds).toBe(true);
  });
});

describe('every possible wiring solves cleanly', () => {
  it('216 combinations: status ok, only the correct nets give parallel', () => {
    const choices = [...OUTLET_POINTS, null] as const;
    let parallel = 0;
    for (const a of choices) for (const n of choices) for (const e of choices) {
      const r = analyseOutlet({ active: a, neutral: n, earth: e });
      expect(r.status).toBe('ok');
      expect(Number.isFinite(r.totalCurrentA)).toBe(true);
      if (r.topology === 'parallel') {
        parallel++;
        expect(a && netOf(a)).toBe('active'); expect(n && netOf(n)).toBe('neutral'); expect(e && netOf(e)).toBe('earth');
        expect(r.newOutletFull).toBe(true);
      }
    }
    expect(parallel).toBe(8);
  });
});

describe('scoreOutlet', () => {
  it('perfect = 100', () => {
    const r = scoreOutlet(perfect);
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
  });
  it('nothing = 0', () => {
    const r = scoreOutlet({ wiring: { active: null, neutral: null, earth: null }, isolated: false, provedDead: false, testedBoth: false, predictedA: null });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
  });
  it('connection partials: 12 + 12 + 11', () => {
    const wrongEarth = scoreOutlet({ ...perfect, wiring: { ...CORRECT_WIRING, earth: 'existing-active' } });
    expect(wrongEarth.score).toBe(12 + 12 + 25 + 15 + 25);
    expect(wrongEarth.answers[0].ok).toBe(false);
    const swapped = scoreOutlet({ ...perfect, wiring: { active: 'existing-neutral', neutral: 'existing-active', earth: 'existing-earth' } });
    expect(swapped.score).toBe(11 + 25 + 0 + 25);
  });
  it('off but not proven dead = 12; neither = 0', () => {
    expect(scoreOutlet({ ...perfect, provedDead: false }).score).toBe(100 - 25 + 12);
    expect(scoreOutlet({ ...perfect, isolated: false, provedDead: false }).score).toBe(75);
  });
  it('full voltage without testing both = 7 of 15', () => {
    expect(scoreOutlet({ ...perfect, testedBoth: false }).score).toBe(92);
  });
  it('prediction within 5 %', () => {
    expect(scoreOutlet({ ...perfect, predictedA: 2.09 }).score).toBe(100);
    expect(scoreOutlet({ ...perfect, predictedA: 2.2 }).score).toBe(75);
    expect(scoreOutlet({ ...perfect, predictedA: 1 }).score).toBe(75);
  });
  it('a different lamp load changes the right answer', () => {
    const options = { existingLampW: 24, newLampW: 24 };
    expect(predictedTotalA(options)).toBeCloseTo(4, 1);
    expect(scoreOutlet({ ...perfect, options, predictedA: 4 }).score).toBe(100);
    expect(scoreOutlet({ ...perfect, options, predictedA: 2 }).score).toBe(75);
  });
});
