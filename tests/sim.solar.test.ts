import { describe, expect, it } from 'vitest';
import { BATTERY_EFFICIENCY, EVENING_HOURS, LOAD_KWH, PV_KWH_PER_KW, TRADEOFF_CORRECT, balanceAnswer, balanceIn, balanceOut, eveningImport, sankeyFor, scoreSolar, simulateDay } from '../src/sim/solar';

describe('profiles', () => {
  it('load is 24 hours, about 18 kWh, evening peak', () => {
    expect(LOAD_KWH.length).toBe(24);
    const total = LOAD_KWH.reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(18, 6);
    const peak = LOAD_KWH.indexOf(Math.max(...LOAD_KWH));
    expect(EVENING_HOURS).toContain(peak);
  });
  it('PV per kW is 4.5 kWh a day, zero at night, peaks near noon', () => {
    expect(PV_KWH_PER_KW.length).toBe(24);
    expect(PV_KWH_PER_KW.reduce((s, x) => s + x, 0)).toBeCloseTo(4.5, 9);
    for (const h of [0, 1, 2, 3, 4, 5, 18, 19, 20, 21, 22, 23]) expect(PV_KWH_PER_KW[h]).toBe(0);
    const peak = PV_KWH_PER_KW.indexOf(Math.max(...PV_KWH_PER_KW));
    expect([11, 12]).toContain(peak);
    expect(PV_KWH_PER_KW[peak]).toBeGreaterThan(0.5);
    expect(PV_KWH_PER_KW[peak]).toBeLessThan(0.7);
  });
});

describe('simulateDay', () => {
  it('no panels, no battery: everything imported', () => {
    const r = simulateDay({ pvKW: 0, batteryKWh: 0 });
    expect(r.totals.pv).toBe(0);
    expect(r.totals.imported).toBeCloseTo(r.totals.load, 12);
    expect(r.totals.exported).toBe(0);
  });
  it('panels only: export at midday, import at night', () => {
    const r = simulateDay({ pvKW: 5, batteryKWh: 0 });
    expect(r.totals.pv).toBeCloseTo(22.5, 9);
    expect(r.hourly.exported[12]).toBeGreaterThan(1);
    expect(r.hourly.imported[12]).toBe(0);
    expect(r.hourly.imported[2]).toBeCloseTo(LOAD_KWH[2], 12);
    expect(r.totals.toBattery).toBe(0);
  });
  it('battery loses 10 % on charging and never exceeds 0.5 C', () => {
    const r = simulateDay({ pvKW: 6, batteryKWh: 10 });
    expect(r.totals.batteryLoss).toBeCloseTo(r.totals.toBattery * (1 - BATTERY_EFFICIENCY), 12);
    for (let i = 0; i < 24; i++) {
      expect(r.hourly.toBattery[i]).toBeLessThanOrEqual(5 + 1e-12);
      expect(r.hourly.fromBattery[i]).toBeLessThanOrEqual(5 + 1e-12);
      expect(r.hourly.soc[i]).toBeLessThanOrEqual(10 + 1e-9);
      expect(r.hourly.soc[i]).toBeGreaterThanOrEqual(0);
    }
  });
  it('the battery starts empty and never charges and discharges in one hour', () => {
    const r = simulateDay({ pvKW: 6, batteryKWh: 10 });
    expect(r.hourly.fromBattery[0]).toBe(0);
    for (let i = 0; i < 24; i++) expect(r.hourly.toBattery[i] * r.hourly.fromBattery[i]).toBe(0);
  });
  it('energy balance: PV + import = load + export + loss + battery end, across a grid of sizes', () => {
    for (let pv = 0; pv <= 12; pv += 0.5) {
      for (let bat = 0; bat <= 20; bat += 1) {
        const t = simulateDay({ pvKW: pv, batteryKWh: bat }).totals;
        expect(Math.abs(balanceIn(t) - balanceOut(t))).toBeLessThan(1e-9);
        expect(Math.abs(t.load - (t.selfUsed + t.fromBattery + t.imported))).toBeLessThan(1e-9);
        expect(Math.abs(t.pv - (t.selfUsed + t.toBattery + t.exported))).toBeLessThan(1e-9);
        expect(t.imported).toBeGreaterThanOrEqual(0);
        expect(t.exported).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });
  it('bad inputs are treated as zero', () => {
    const r = simulateDay({ pvKW: NaN, batteryKWh: -5 });
    expect(r.input).toEqual({ pvKW: 0, batteryKWh: 0 });
  });
  it('a bigger battery never raises evening import', () => {
    let prev = Infinity;
    for (let b = 0; b <= 16; b += 2) { const e = eveningImport(simulateDay({ pvKW: 5, batteryKWh: b })); expect(e).toBeLessThanOrEqual(prev + 1e-9); prev = e; }
  });
});

describe('sankeyFor', () => {
  it('every middle node balances and the ends match the totals', () => {
    for (const cfg of [{ pvKW: 0, batteryKWh: 0 }, { pvKW: 5, batteryKWh: 0 }, { pvKW: 5, batteryKWh: 8 }, { pvKW: 10, batteryKWh: 2 }]) {
      const r = simulateDay(cfg);
      const s = sankeyFor(r);
      for (const node of ['House', 'Battery']) {
        const inn = s.flows.filter((f) => f.to === node).reduce((a, f) => a + f.kWh, 0);
        const out = s.flows.filter((f) => f.from === node).reduce((a, f) => a + f.kWh, 0);
        if (node === 'House') expect(inn).toBeCloseTo(r.totals.load, 9);
        else expect(inn).toBeCloseTo(out, 9);
      }
      expect(s.flows.filter((f) => f.from === 'Solar panels').reduce((a, f) => a + f.kWh, 0)).toBeCloseTo(r.totals.pv, 9);
      for (const f of s.flows) expect(s.nodes).toContain(f.from), expect(s.nodes).toContain(f.to);
    }
  });
});

describe('scoreSolar', () => {
  const good = { pvKW: 4, batteryKWh: 8 };
  it('the reference system meets both targets', () => {
    const r = simulateDay(good);
    expect(eveningImport(r)).toBeLessThanOrEqual(2);
    expect(r.totals.exported / r.totals.pv).toBeLessThanOrEqual(0.4);
  });
  it('perfect = 100', () => {
    const r = scoreSolar({ ...good, balanceKWh: balanceAnswer(simulateDay(good)), tradeoff: TRADEOFF_CORRECT });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(3);
  });
  it('nothing built, nothing answered = 0', () => {
    expect(scoreSolar({ pvKW: 0, batteryKWh: 0, balanceKWh: null, tradeoff: null }).score).toBe(0);
  });
  it('panels with no battery: evening import fails, answers still score', () => {
    const cfg = { pvKW: 5, batteryKWh: 0 };
    const r = scoreSolar({ ...cfg, balanceKWh: balanceAnswer(simulateDay(cfg)), tradeoff: TRADEOFF_CORRECT });
    expect(r.score).toBe(60);
    expect(r.stars).toBe(1);
  });
  it('balance answer has a 5 % tolerance', () => {
    const truth = balanceAnswer(simulateDay(good));
    expect(scoreSolar({ ...good, balanceKWh: truth * 1.04, tradeoff: null }).score).toBe(70);
    expect(scoreSolar({ ...good, balanceKWh: truth * 1.2, tradeoff: null }).score).toBe(40);
  });
  it('the balance answer equals export + loss + battery end', () => {
    const t = simulateDay(good).totals;
    expect(balanceAnswer(simulateDay(good))).toBeCloseTo(t.exported + t.batteryLoss + t.batteryEnd, 9);
  });
});
