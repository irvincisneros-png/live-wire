import { describe, expect, it } from 'vitest';
import { BOARD_APPLIANCES, EXPLANATION_CORRECT, MIN_RUNNING, applianceCurrent, boardCurrent, mainIds, planCurrents, planRuns, scorePowerBoard, trips, type Plan } from '../src/sim/powerboard';

const perfectCurrents = () => Object.fromEntries(mainIds().map((id) => [id, applianceCurrent(id)]));
// heater + sandwich press on circuit 1 kettle + toaster on circuit 2; iron off
const goodPlan: Plan = { heater: 1, 'sandwich-press': 1, kettle: 2, toaster: 2, iron: 0 };

describe('board currents (I = P ÷ V, 230 V)', () => {
  it('worked numbers', () => {
    expect(applianceCurrent('heater')).toBeCloseTo(8.6957, 4);
    expect(applianceCurrent('kettle')).toBeCloseTo(9.5652, 4);
    expect(applianceCurrent('toaster')).toBeCloseTo(3.9130, 4);
    expect(applianceCurrent('iron')).toBeCloseTo(7.8261, 4);
    expect(applianceCurrent('sandwich-press')).toBeCloseTo(3.2609, 4);
    expect(applianceCurrent('phone-charger')).toBeCloseTo(0.0435, 4);
    expect(applianceCurrent('lamp')).toBeCloseTo(0.0522, 4);
  });
  it('currents add in parallel', () => {
    expect(boardCurrent(['heater', 'kettle'])).toBeCloseTo(18.26, 1);
    expect(boardCurrent(['heater', 'kettle'])).toBeCloseTo(applianceCurrent('heater') + applianceCurrent('kettle'), 12);
    expect(boardCurrent(mainIds())).toBeCloseTo(7650 / 230, 12);
    expect(boardCurrent([])).toBe(0);
  });
  it('no single appliance exceeds a 10 A power point, but all together trip the 10 A cut-out', () => {
    for (const id of mainIds()) expect(trips(boardCurrent([id]), 10)).toBe(false);
    expect(trips(boardCurrent(mainIds()), 10)).toBe(true);
  });
  it('exactly at the limit does not trip', () => {
    expect(trips(16, 16)).toBe(false);
    expect(trips(16.01, 16)).toBe(true);
    expect(trips(3680 / 230, 16)).toBe(false);
  });
});

describe('plans', () => {
  it('good plan: no trip, four running', () => {
    const [c1, c2] = planCurrents(goodPlan);
    expect(c1).toBeCloseTo((2000 + 750) / 230, 9);
    expect(c2).toBeCloseTo((2200 + 900) / 230, 9);
    expect(planRuns(goodPlan)).toBe(true);
  });
  it('all five cannot fit on two 16 A circuits (7650 W is more than 7360 W)', () => {
    const all = mainIds();
    for (let m = 0; m < 1 << all.length; m++) {
      const plan: Plan = Object.fromEntries(all.map((id, i) => [id, ((m >> i) & 1 ? 1 : 2) as 1 | 2]));
      expect(planRuns(plan)).toBe(false);
    }
  });
  it('overloaded or idle plans do not run', () => {
    expect(planRuns({ heater: 1, kettle: 1, toaster: 2, iron: 2, 'sandwich-press': 2 })).toBe(false);
    expect(planRuns({})).toBe(false);
    expect(MIN_RUNNING).toBe(4);
  });
  it('at least four main appliances can run across two circuits', () => {
    expect(planRuns({ heater: 1, 'sandwich-press': 1, kettle: 2, toaster: 2, iron: 0 })).toBe(true);
  });
  it('small loads do not count as main appliances', () => {
    expect(planRuns({ heater: 1, kettle: 2, 'phone-charger': 1, lamp: 2 })).toBe(false);
  });
});

describe('scorePowerBoard', () => {
  it('perfect = 100, three stars', () => {
    const r = scorePowerBoard({ currents: perfectCurrents(), explanation: EXPLANATION_CORRECT, plan: goodPlan });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.answers.every((a) => a.ok)).toBe(true);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.lines.length).toBeLessThanOrEqual(4);
  });
  it('empty = 0', () => {
    const r = scorePowerBoard({ currents: {}, explanation: null, plan: {} });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
  });
  it('currents within 5 % earn 8 each', () => {
    const c = perfectCurrents();
    c.heater = c.heater * 1.049;
    c.kettle = c.kettle * 1.06;
    const r = scorePowerBoard({ currents: c, explanation: null, plan: {} });
    expect(r.score).toBe(32);
  });
  it('explanation only = 20, plan only = 40', () => {
    expect(scorePowerBoard({ currents: {}, explanation: EXPLANATION_CORRECT, plan: {} }).score).toBe(20);
    expect(scorePowerBoard({ currents: {}, explanation: 1, plan: goodPlan }).score).toBe(40);
  });
  it('a tripping plan scores nothing for the plan and says why', () => {
    const r = scorePowerBoard({ currents: perfectCurrents(), explanation: EXPLANATION_CORRECT, plan: { heater: 1, kettle: 1, toaster: 1, iron: 2, 'sandwich-press': 2 } });
    expect(r.score).toBe(60);
    expect(r.stars).toBe(1);
    expect(r.lines.join(' ')).toContain('16 A');
  });
  it('dataset is as specified', () => {
    expect(BOARD_APPLIANCES.map((a) => [a.id, a.powerW])).toEqual([['heater', 2000], ['kettle', 2200], ['toaster', 900], ['iron', 1800], ['sandwich-press', 750], ['phone-charger', 10], ['lamp', 12]]);
  });
});
