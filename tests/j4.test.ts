import { describe, expect, it } from 'vitest';
import { BUDGET, bestPlan, optionsCost, topUsers } from '../src/sim/audit';
import { LABEL_PAIRS, labelById, pairSavingPerYear } from '../src/sim/appliances';
import { canSubmit, labelOrder, newState, optionBlock, pairFor, perfectState, poorState, rankComplete, revealFor, setRank, toResult, toggleOption } from '../src/job/desk/j4logic';
import { evalExpression } from '../src/job/desk/maths';

describe('job 4 glue', () => {
  it('a perfect run scores 100 for every seed', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 98765]) {
      const r = toResult(perfectState(seed), seed);
      expect(r.score).toBe(100);
      expect(r.stars).toBe(3);
      expect(canSubmit(perfectState(seed))).toBe(true);
    }
  });
  it('a poor run scores low', () => {
    const r = toResult(poorState(1), 1);
    expect(r.score).toBeLessThan(25);
    expect(r.stars).toBe(0);
  });
  it('records the label answers without changing the mark', () => {
    const good = toResult(perfectState(4), 4);
    const labelAnswers = good.answers.slice(-2);
    expect(labelAnswers.every((a) => a.ok)).toBe(true);
    const st = { ...perfectState(4), labelPick: pairFor(4).lower, labelSavingText: '1' };
    const bad = toResult(st, 4);
    expect(bad.score).toBe(100);
    expect(bad.answers.slice(-2).every((a) => a.ok === false)).toBe(true);
  });
  it('the better label always uses fewer kWh, in either order', () => {
    for (let seed = 0; seed < 12; seed++) {
      const p = pairFor(seed);
      expect(LABEL_PAIRS).toContain(p);
      const [l, r] = labelOrder(seed);
      expect(new Set([l, r])).toEqual(new Set([p.lower, p.higher]));
      expect(labelById(p.higher)!.kWhPerYear).toBeLessThan(labelById(p.lower)!.kWhPerYear);
    }
    expect(new Set(Array.from({ length: 12 }, (_, s) => labelOrder(s)[0])).size).toBeGreaterThan(3);
  });
  it('ranking keeps each appliance in one slot', () => {
    let r = setRank([null, null, null], 0, 'tv');
    r = setRank(r, 1, 'tv');
    expect(r).toEqual([null, 'tv', null]);
    expect(rankComplete(r)).toBe(false);
    expect(rankComplete(['a', 'b', 'c'])).toBe(true);
    expect(rankComplete(['a', 'a', 'c'])).toBe(false);
  });
  it('blocks conflicting options and options over budget', () => {
    expect(optionBlock('second-fridge-swap', ['second-fridge-off'])).toEqual({ reason: 'conflict', with: 'second-fridge-off' });
    expect(optionBlock('heat-pump', [])).toEqual({ reason: 'budget' });
    expect(optionBlock('tv-swap', ['second-fridge-swap'])).toEqual({ reason: 'budget' });
    expect(optionBlock('led-downlights', ['tv-swap'])).toBeNull();
    expect(toggleOption(['tv-swap'], 'heat-pump')).toEqual(['tv-swap']);
    expect(toggleOption(['tv-swap'], 'tv-swap')).toEqual([]);
    expect(toggleOption([], 'draughts')).toEqual(['draughts']);
  });
  it('the best plan fits the budget and can be ticked in order', () => {
    const ids = bestPlan().ids;
    expect(optionsCost(ids)).toBeLessThanOrEqual(BUDGET);
    let chosen: string[] = [];
    for (const id of ids) chosen = toggleOption(chosen, id);
    expect(chosen.sort()).toEqual(ids.slice().sort());
  });
  it('reveal numbers match the sim', () => {
    const none = revealFor([]);
    expect(none.saving).toBe(0);
    expect(none.beforeKWh).toBeCloseTo(none.afterKWh, 9);
    const best = revealFor(bestPlan().ids);
    expect(best.fraction).toBeCloseTo(1, 9);
    expect(best.afterKWh).toBeLessThan(best.beforeKWh);
    expect(best.beforeCost - best.afterCost).toBeCloseTo(best.saving, 9);
    expect(best.rows).toHaveLength(10);
  });
  it('submit needs every answer and a valid upgrade set', () => {
    expect(canSubmit(newState())).toBe(false);
    const st = perfectState(2);
    expect(canSubmit({ ...st, explanation: null })).toBe(false);
    expect(canSubmit({ ...st, labelSavingText: '' })).toBe(false);
    expect(canSubmit({ ...st, chosen: ['heat-pump', 'second-fridge-swap'] })).toBe(false);
    expect(canSubmit({ ...st, chosen: [] })).toBe(true);
  });
  it('top three users are hot water, air conditioner, heater', () => {
    expect(topUsers(3).map((a) => a.id)).toEqual(['hot-water', 'air-con', 'heater']);
    expect(pairSavingPerYear(LABEL_PAIRS[0])).toBeCloseTo(59.4, 1);
  });
  it('the notepad calculator gets kWh right', () => {
    expect(evalExpression('3600*3*365/1000')).toBeCloseTo(3942, 6);
  });
});
