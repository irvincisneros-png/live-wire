import { describe, expect, it } from 'vitest';
import { applianceCurrent, mainIds } from '../src/sim/powerboard';
import { canSubmit, currentsComplete, newState, perfectState, planComplete, poorState, runOutcome, toPlan, toResult } from '../src/job/desk/j3logic';
import { evalExpression, parseNumber } from '../src/job/desk/maths';

describe('job 3 glue', () => {
  it('a perfect run scores 100 with three stars', () => {
    const r = toResult(perfectState());
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.answers.at(-1)?.q).toMatch(/plan was run/);
  });
  it('a poor run scores low', () => {
    const r = toResult(poorState());
    expect(r.score).toBeLessThan(30);
    expect(r.stars).toBe(0);
  });
  it('maps circuits A and B to 1 and 2 and unplaced to off', () => {
    const plan = toPlan({ heater: 'A', kettle: 'B', toaster: 'off' });
    expect(plan.heater).toBe(1);
    expect(plan.kettle).toBe(2);
    expect(plan.toaster).toBe(0);
    expect(plan.iron).toBe(0);
  });
  it('run outcome matches the scorer', () => {
    const ok = runOutcome(perfectState().assign);
    expect(ok.held).toBe(true);
    expect(ok.a).toBeCloseTo(applianceCurrent('heater') + applianceCurrent('sandwich-press'), 6);
    const bad = runOutcome(poorState().assign);
    expect(bad.tripA).toBe(true);
    expect(bad.held).toBe(false);
  });
  it('one circuit over 16 A trips but the other holds', () => {
    const o = runOutcome({ heater: 'A', kettle: 'A', toaster: 'B', iron: 'B', 'sandwich-press': 'B' });
    expect(o.tripA).toBe(true);
    expect(o.tripB).toBe(false);
    expect(o.held).toBe(false);
  });
  it('submit needs every answer and a run of the current plan', () => {
    const st = perfectState();
    expect(canSubmit(st)).toBe(true);
    expect(canSubmit({ ...st, explanation: null })).toBe(false);
    expect(canSubmit({ ...st, ranCurrent: false })).toBe(false);
    expect(canSubmit({ ...st, runs: 0 })).toBe(false);
    expect(canSubmit({ ...st, assign: { ...st.assign, iron: undefined } })).toBe(false);
    expect(canSubmit(newState())).toBe(false);
  });
  it('accepts decimals and decimal commas for currents', () => {
    const t: Record<string, string> = {};
    for (const id of mainIds()) t[id] = String(applianceCurrent(id)).replace('.', ',');
    expect(currentsComplete(t)).toBe(true);
    expect(planComplete(perfectState().assign)).toBe(true);
    const r = toResult({ ...perfectState(), currentsText: t });
    expect(r.score).toBe(100);
  });
  it('a current 5 % out still counts, 10 % out does not', () => {
    const st = perfectState();
    const near = { ...st, currentsText: { ...st.currentsText, kettle: (applianceCurrent('kettle') * 1.04).toFixed(2) } };
    expect(toResult(near).score).toBe(100);
    const far = { ...st, currentsText: { ...st.currentsText, kettle: (applianceCurrent('kettle') * 1.1).toFixed(2) } };
    expect(toResult(far).score).toBe(92);
  });
});

describe('number helpers', () => {
  it('parses what students type', () => {
    expect(parseNumber('9.57')).toBe(9.57);
    expect(parseNumber(' 9,57 ')).toBe(9.57);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('9.5.1')).toBeUndefined();
  });
  it('evaluates calculator sums without eval', () => {
    expect(evalExpression('3600*3*365/1000')).toBeCloseTo(3942, 6);
    expect(evalExpression('(1.5 + 2.5) × 4')).toBe(16);
    expect(evalExpression('2200 ÷ 230')).toBeCloseTo(9.5652, 3);
    expect(evalExpression('2 +')).toBeUndefined();
    expect(evalExpression('alert(1)')).toBeUndefined();
    expect(evalExpression('1/0')).toBeUndefined();
  });
});
