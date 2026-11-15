import { describe, expect, it } from 'vitest';
import { AUDIT_APPLIANCES, BUDGET, EXPLANATION_CORRECT, OPTIONS, applianceYearlyKWh, applyOptions, bestPlan, compatible, conflicts, optionsCost, scoreAudit, topUsers, yearlyCost, yearlyKWh, yearlySaving } from '../src/sim/audit';

const best = bestPlan();

describe('dataset', () => {
  it('has 10 appliances and 8 options with unique ids', () => {
    expect(AUDIT_APPLIANCES.length).toBe(10);
    expect(OPTIONS.length).toBe(8);
    expect(new Set(AUDIT_APPLIANCES.map((a) => a.id)).size).toBe(10);
    expect(new Set(OPTIONS.map((o) => o.id)).size).toBe(8);
    for (const o of OPTIONS) {
      expect(AUDIT_APPLIANCES.some((a) => a.id === o.applianceId)).toBe(true);
      expect(o.power !== undefined || o.hours !== undefined).toBe(true);
      for (const x of o.excludes ?? []) expect(OPTIONS.some((p) => p.id === x)).toBe(true);
    }
  });
  it('every option actually saves energy', () => {
    for (const o of OPTIONS) expect(yearlySaving([o.id])).toBeGreaterThan(0);
  });
});

describe('maths', () => {
  it('yearly kWh worked numbers', () => {
    const hw = AUDIT_APPLIANCES.find((a) => a.id === 'hot-water')!;
    expect(applianceYearlyKWh(hw)).toBeCloseTo(3.6 * 3 * 365, 9); // 3942
    expect(yearlyCost([hw])).toBeCloseTo(3942 * 0.33, 6);
    expect(yearlyKWh()).toBeCloseTo(AUDIT_APPLIANCES.reduce((s, a) => s + a.powerW * a.hoursPerDay, 0) * 0.365, 6);
  });
  it('top users: hot water, air con, heater', () => {
    expect(topUsers(3).map((a) => a.id)).toEqual(['hot-water', 'air-con', 'heater']);
    expect(topUsers(10).length).toBe(10);
  });
});

describe('applyOptions', () => {
  it('no options changes nothing', () => {
    expect(applyOptions([])).toEqual(AUDIT_APPLIANCES);
  });
  it('power and hours options on one appliance compose', () => {
    const hw = applyOptions(['heat-pump', 'short-showers']).find((a) => a.id === 'hot-water')!;
    expect(hw.powerW).toBe(1000);
    expect(hw.hoursPerDay).toBe(2.4);
    expect(yearlySaving(['heat-pump', 'short-showers'])).toBeCloseTo((3.942 * 1000 - 1 * 2.4 * 365) * 0.33, 6);
    expect(yearlySaving(['heat-pump', 'short-showers'])).toBeGreaterThan(yearlySaving(['heat-pump']));
  });
  it('conflicting options are refused', () => {
    expect(conflicts('second-fridge-off', 'second-fridge-swap')).toBe(true);
    expect(conflicts('heat-pump', 'short-showers')).toBe(false);
    expect(conflicts('led-downlights', 'tv-swap')).toBe(false);
    expect(compatible(['second-fridge-off', 'second-fridge-swap'])).toBe(false);
    expect(() => applyOptions(['second-fridge-off', 'second-fridge-swap'])).toThrow();
    expect(compatible(['tv-swap', 'tv-swap'])).toBe(false);
    expect(compatible(['made-up'])).toBe(false);
  });
  it('LED downlights: 300 W to 42 W at 5 h a day saves 471 kWh', () => {
    expect(yearlyKWh(AUDIT_APPLIANCES) - yearlyKWh(applyOptions(['led-downlights']))).toBeCloseTo(0.258 * 5 * 365, 9);
  });
});

describe('bestPlan', () => {
  it('respects budget and compatibility', () => {
    expect(best.costDollars).toBeLessThanOrEqual(BUDGET);
    expect(compatible(best.ids)).toBe(true);
    expect(best.savingDollars).toBeCloseTo(yearlySaving(best.ids), 9);
  });
  it('beats or ties every other affordable compatible subset (brute-force check)', () => {
    for (let m = 0; m < 1 << OPTIONS.length; m++) {
      const ids = OPTIONS.filter((_, i) => m & (1 << i)).map((o) => o.id);
      if (optionsCost(ids) > BUDGET || !compatible(ids)) continue;
      expect(yearlySaving(ids)).toBeLessThanOrEqual(best.savingDollars + 1e-9);
    }
  });
  it('includes the free habits and skips the unaffordable heat pump', () => {
    for (const id of ['second-fridge-off', 'short-showers', 'aircon-24']) expect(best.ids).toContain(id);
    expect(best.ids).not.toContain('heat-pump');
  });
  it('a bigger budget makes the heat pump worthwhile', () => {
    expect(bestPlan(5000).ids).toContain('heat-pump');
    expect(bestPlan(5000).savingDollars).toBeGreaterThan(best.savingDollars);
  });
  it('a zero budget still finds the free options', () => {
    const z = bestPlan(0);
    expect(z.costDollars).toBe(0);
    expect(z.ids.length).toBeGreaterThan(0);
  });
});

describe('scoreAudit', () => {
  const top = ['hot-water', 'air-con', 'heater'];
  it('perfect = 100', () => {
    const r = scoreAudit({ top3: top, chosen: best.ids, explanation: EXPLANATION_CORRECT });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
  });
  it('empty = 0', () => {
    expect(scoreAudit({ top3: [], chosen: [], explanation: null }).score).toBe(0);
  });
  it('top three: right set, wrong order = 18; one right and in place = 10', () => {
    expect(scoreAudit({ top3: ['heater', 'hot-water', 'air-con'], chosen: [], explanation: null }).score).toBe(18);
    expect(scoreAudit({ top3: ['hot-water', 'tv', 'computer'], chosen: [], explanation: null }).score).toBe(10);
  });
  it('saving is scored as a fraction of the best', () => {
    const half = ['second-fridge-off'];
    const frac = yearlySaving(half) / best.savingDollars;
    expect(scoreAudit({ top3: [], chosen: half, explanation: null }).score).toBe(Math.round(frac * 50));
  });
  it('over budget or conflicting plans score nothing for savings', () => {
    expect(scoreAudit({ top3: [], chosen: ['heat-pump', 'tv-swap', 'second-fridge-swap'], explanation: null }).score).toBe(0);
    expect(scoreAudit({ top3: [], chosen: ['second-fridge-off', 'second-fridge-swap'], explanation: null }).score).toBe(0);
  });
  it('explanation alone = 20', () => {
    expect(scoreAudit({ top3: [], chosen: [], explanation: EXPLANATION_CORRECT }).score).toBe(20);
  });
});
