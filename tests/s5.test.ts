import { describe, expect, it } from 'vitest';
import { LABELS, labelById, pairSavingPerYear } from '../src/sim/appliances';
import { isAcceptable } from '../src/ui/numcheck';
import {
  RUNS, S5_APPLIANCES, S5_IDS, activeSeconds, clockText, costText, createState, durationText, finishRun, grouped, meterWatts,
  moveMeter, packetRate, runEnergyJ, runSeconds, runningAt, startRun, stepRun, summary,
} from '../src/stations/s5/model';
import { CHECK_PAIR, GUIDED_PAIR, costTask, energyTask, pairTask, trapTask } from '../src/stations/s5/tasks';

describe('s5 appliances come from src/sim', () => {
  it('uses the sim powers', () => {
    const p = Object.fromEntries(S5_APPLIANCES.map((a) => [a.id, a.powerW]));
    expect(p.kettle).toBe(2200);
    expect(p.toaster).toBe(900);
    expect(p['led-lamp']).toBe(9);
    expect(p['phone-charger']).toBe(10);
    expect(S5_IDS.length).toBe(6);
  });
  it('typical day: kettle 10 min, lamp 6 h, TV 5 h', () => {
    expect(runSeconds('kettle', 'day')).toBeCloseTo(600, 6);
    expect(runSeconds('led-lamp', 'day')).toBeCloseTo(6 * 3600, 6);
    expect(runSeconds('led-tv', 'day')).toBeCloseTo(5 * 3600, 6);
    expect(runSeconds('kettle', 'week')).toBeCloseTo(7 * 600, 6);
  });
  it('kettle 3 min = 396 000 J; lamp 3 min = 1620 J', () => {
    expect(runEnergyJ('kettle', 'min3')).toBe(396000);
    expect(runEnergyJ('led-lamp', 'min3')).toBe(1620);
  });
  it('a typical day: kettle beats the lamp, but the TV (100 W for 5 h) beats the kettle', () => {
    const k = runEnergyJ('kettle', 'day'), l = runEnergyJ('led-lamp', 'day'), tv = runEnergyJ('led-tv', 'day');
    expect(k).toBeCloseTo(1_320_000, 3);
    expect(l).toBeCloseTo(194_400, 3);
    expect(k).toBeGreaterThan(l);
    expect(tv).toBeGreaterThan(k);
    expect(summary(k).kWh).toBeCloseTo(0.3667, 4);
  });
  it('activeSeconds splits a run exactly', () => {
    const a = activeSeconds('kettle', 'day', 0, 43200) + activeSeconds('kettle', 'day', 43200, 86400);
    expect(a).toBeCloseTo(600, 6);
    expect(activeSeconds('kettle', 'min3', 0, 1000)).toBe(180);
    expect(runningAt('led-lamp', 'day', 18 * 3600)).toBe(true);
    expect(runningAt('led-lamp', 'day', 8 * 3600)).toBe(false);
    expect(runningAt('led-lamp', 'h24', 8 * 3600)).toBe(true);
  });
});

describe('s5 run state', () => {
  it('stepping a run adds up to the exact total and fills the meter', () => {
    const s = createState('kettle');
    s.on.kettle = true; s.on['led-lamp'] = true;
    startRun(s, 'day');
    let done = false, n = 0;
    while (!done && n < 10000) { done = stepRun(s, 1 / 60); n++; }
    expect(done).toBe(true);
    expect(s.run).toBeNull();
    expect(s.last!.joules.kettle).toBeCloseTo(1_320_000, 3);
    expect(s.last!.joules['led-lamp']).toBeCloseTo(194_400, 3);
    expect(s.last!.joules.toaster).toBe(0);
    expect(s.meter.joules).toBeCloseTo(1_320_000, 3);
    expect(s.meter.seconds).toBeCloseTo(600, 6);
    expect(s.runs).toBe(1);
  });
  it('moving the meter resets it; meter reads 0 W when the appliance is off', () => {
    const s = createState('kettle');
    s.on.kettle = true;
    expect(meterWatts(s)).toBe(2200);
    startRun(s, 'min3'); finishRun(s);
    expect(s.meter.joules).toBe(396000);
    moveMeter(s, 'led-lamp');
    expect(s.meter.joules).toBe(0);
    expect(meterWatts(s)).toBe(0);
    s.on['led-lamp'] = true;
    expect(meterWatts(s)).toBe(9);
  });
  it('the meter reads 0 W during a typical day while the appliance is idle', () => {
    const s = createState('kettle');
    s.on.kettle = true;
    startRun(s, 'day');
    s.run!.t = 10 * 3600;
    expect(meterWatts(s)).toBe(0);
    s.run!.t = 7 * 3600 + 60;
    expect(meterWatts(s)).toBe(2200);
  });
  it('run definitions are sane', () => {
    for (const r of Object.values(RUNS)) { expect(r.seconds).toBeGreaterThan(0); expect(r.realSeconds).toBeGreaterThan(0); }
  });
});

describe('s5 packets and formatting', () => {
  it('packet rate grows with power, kettle much busier, charger still visible', () => {
    expect(packetRate(0)).toBe(0);
    expect(packetRate(10)).toBeGreaterThanOrEqual(0.8);
    expect(packetRate(2200)).toBeGreaterThan(packetRate(900));
    expect(packetRate(2200) / packetRate(10)).toBeGreaterThan(8);
  });
  it('formats', () => {
    expect(costText(0.0363)).toBe('3.63 c');
    expect(costText(0.12)).toBe('12.0 c');
    expect(costText(1.452)).toBe('$1.45');
    expect(costText(0)).toBe('0 c');
    expect(grouped(396000)).toBe('396 000');
    expect(clockText(180)).toBe('0:03:00');
    expect(clockText(86400)).toBe('24:00:00');
    expect(durationText(600)).toBe('10 min');
    expect(durationText(6 * 3600)).toBe('6 h');
  });
});

describe('s5 checks', () => {
  it('(a) joules = P × t for the toaster', () => {
    const t = energyTask();
    expect(t.answer).toBe(135000);
    expect(isAcceptable(t.answer, t.tolerance, 135000)).toBe(true);
    expect(isAcceptable(t.answer, t.tolerance, 135)).toBe(false); // used kJ
    expect(isAcceptable(t.answer, t.tolerance, 2250)).toBe(false); // used minutes
  });
  it('(b) cost = kWh × price for the kettle', () => {
    const t = costTask();
    expect(t.kWh).toBeCloseTo(4.4, 12);
    expect(t.answer).toBeCloseTo(1.452, 12);
    expect(isAcceptable(t.answer, t.tolerance, 1.45)).toBe(true);
    expect(isAcceptable(t.answer, t.tolerance, 4.4)).toBe(false);
    expect(isAcceptable(t.answer, t.tolerance, 145.2)).toBe(false);
  });
  it('(c) the higher-star TV saves pairSavingPerYear', () => {
    const t = pairTask();
    expect(CHECK_PAIR.type).toBe('tv');
    expect(t.options[t.correct]).toContain('4.5-star');
    expect(t.options[t.correct]).toContain('$39.60');
    expect(pairSavingPerYear(CHECK_PAIR)).toBeCloseTo(39.6, 9);
    expect(t.options.filter((o, i) => i !== t.correct && o === t.options[t.correct]).length).toBe(0);
    expect(t.options[0]).not.toContain('4.5-star');
  });
  it('(d) size trap: bigger 5-star fridge uses more than the small 3-star', () => {
    const t = trapTask();
    expect(t.big.stars).toBeGreaterThan(t.small.stars);
    expect(t.big.kWhPerYear).toBeGreaterThan(t.small.kWhPerYear);
    expect(t.options[t.correct]).toMatch(/similar size/);
    expect(t.correct).not.toBe(0);
  });
  it('the guided pair is two fridges of the same size', () => {
    const a = labelById(GUIDED_PAIR.lower)!, b = labelById(GUIDED_PAIR.higher)!;
    expect(a.type).toBe('fridge'); expect(b.type).toBe('fridge');
    expect(a.sizeLabel).toBe(b.sizeLabel);
    expect(LABELS.length).toBeGreaterThan(0);
  });
});
