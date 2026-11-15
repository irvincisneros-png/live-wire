import { describe, expect, it } from 'vitest';
import { balanceAnswer, balanceIn, balanceOut, simulateDay } from '../src/sim/solar';
import {
  canSubmit, clockText, designCurrent, finalResult, flowsAt, modulesFor, newState, panelsFor, perfectState, poorState, runDesign, sankeyOf, toResult,
} from '../src/job/desk/j5logic';
import { sankeyLayout } from '../src/job/desk/sankey';

describe('job 5 glue', () => {
  it('a perfect run scores 100 with three stars', () => {
    const st = perfectState();
    expect(canSubmit(st)).toBe(true);
    const r = toResult(st);
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
    expect(r.answers.at(-1)?.q).toMatch(/Designs tried/);
  });
  it('a poor run scores low', () => {
    const r = toResult(poorState());
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
  });
  it('scores the design that was run, not a slider moved afterwards', () => {
    const st = perfectState();
    st.pv = 0;
    expect(designCurrent(st)).toBe(false);
    expect(canSubmit(st)).toBe(false);
    expect(toResult(st).score).toBe(100);
  });
  it('records every attempt', () => {
    const st = newState();
    runDesign(st); st.pv = 6; runDesign(st); st.battery = 10; runDesign(st);
    expect(st.attempts).toHaveLength(3);
    expect(toResult({ ...st, balanceText: '1', tradeoff: 0 }).answers.at(-1)?.a).toBe('3 kW + 5 kWh; 6 kW + 5 kWh; 6 kW + 10 kWh');
  });
  it('the balance answer is solar + import - house use and fits the Sankey', () => {
    for (const [pv, b] of [[0, 0], [3, 5], [5, 8], [10, 15]]) {
      const st = newState(); st.pv = pv; st.battery = b; runDesign(st);
      const r = finalResult(st)!;
      const sk = sankeyOf(st)!;
      const into = (n: string) => sk.flows.filter((f) => f.to === n).reduce((s, f) => s + f.kWh, 0);
      const notUsed = into('Grid export') + into('Lost as heat') + into('Left in battery');
      expect(notUsed).toBeCloseTo(balanceAnswer(r), 9);
      expect(balanceIn(r.totals)).toBeCloseTo(balanceOut(r.totals), 9);
    }
  });
  it('hourly flows add up to the load each hour', () => {
    const r = simulateDay({ pvKW: 6, batteryKWh: 8 });
    for (let h = 0; h < 24; h++) {
      const f = flowsAt(r, h);
      expect(f.pvToHouse + f.batteryToHouse + f.gridToHouse).toBeCloseTo(f.load, 9);
      expect(f.pvToHouse + f.pvToBattery + f.pvToGrid).toBeCloseTo(f.pv, 9);
    }
  });
  it('panels and battery modules grow with the sliders', () => {
    expect(panelsFor(0)).toBe(0);
    expect(panelsFor(1)).toBe(2);
    expect(panelsFor(10)).toBe(20);
    expect(modulesFor(0)).toBe(0);
    expect(modulesFor(2.5)).toBe(1);
    expect(modulesFor(15)).toBe(6);
  });
  it('needs a number and a trade-off answer before submit', () => {
    const st = perfectState();
    expect(canSubmit({ ...st, balanceText: '' })).toBe(false);
    expect(canSubmit({ ...st, tradeoff: null })).toBe(false);
    expect(canSubmit({ ...st, balanceText: 'abc' })).toBe(false);
  });
  it('formats clock times', () => {
    expect(clockText(0)).toBe('12:00 am');
    expect(clockText(13.5)).toBe('1:30 pm');
    expect(clockText(23.99)).toBe('11:59 pm');
  });
});

describe('sankey layout', () => {
  it('keeps every link as thick as its kWh and balances each node', () => {
    const st = newState(); st.pv = 6; st.battery = 8; runDesign(st);
    const sk = sankeyOf(st)!;
    const lay = sankeyLayout(sk, 440, 250);
    expect(lay.links).toHaveLength(sk.flows.length);
    for (const l of lay.links) expect(l.width).toBeCloseTo(l.kWh * lay.scale, 6);
    const house = lay.nodes.find((n) => n.name === 'House')!;
    const into = sk.flows.filter((f) => f.to === 'House').reduce((s, f) => s + f.kWh, 0);
    expect(house.kWh).toBeCloseTo(into, 9);
    const battery = lay.nodes.find((n) => n.name === 'Battery')!;
    const inB = sk.flows.filter((f) => f.to === 'Battery').reduce((s, f) => s + f.kWh, 0);
    const outB = sk.flows.filter((f) => f.from === 'Battery').reduce((s, f) => s + f.kWh, 0);
    expect(inB).toBeCloseTo(outB, 9);
    expect(battery.kWh).toBeCloseTo(inB, 9);
    for (const n of lay.nodes) { expect(n.y).toBeGreaterThanOrEqual(0); expect(n.y + n.h).toBeLessThanOrEqual(250.001); }
  });
});
