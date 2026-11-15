import { describe, expect, it } from 'vitest';
import { APPLIANCES, LABELS, LABEL_PAIRS, SIZE_TRAP, applianceById, cost, currentAt, energyJ, energyKWh, labelById, pairSavingPerYear } from '../src/sim/appliances';
import { joulesToKWh } from '../src/sim/units';

describe('appliance maths', () => {
  it('E = P × t in joules', () => {
    expect(energyJ(2200, 60)).toBe(132000);
    expect(energyJ(1000, 3600)).toBe(3_600_000);
  });
  it('kWh = kW × hours', () => {
    expect(energyKWh(2200, 0.5)).toBeCloseTo(1.1, 12);
    expect(energyKWh(1000, 1)).toBe(1);
    expect(joulesToKWh(energyJ(2200, 1800))).toBeCloseTo(energyKWh(2200, 0.5), 12);
  });
  it('cost = kWh × price, default 33 c', () => {
    expect(cost(10)).toBeCloseTo(3.3, 12);
    expect(cost(10, 0.5)).toBe(5);
  });
  it('I = P ÷ V', () => {
    expect(currentAt(2200)).toBeCloseTo(9.5652, 4);
    expect(currentAt(2400)).toBeCloseTo(10.4348, 4);
    expect(currentAt(24, 12)).toBe(2);
  });
});

describe('appliance table', () => {
  it('has about 16 unique, sensible entries', () => {
    expect(APPLIANCES.length).toBe(16);
    expect(new Set(APPLIANCES.map((a) => a.id)).size).toBe(APPLIANCES.length);
    for (const a of APPLIANCES) {
      expect(a.powerW).toBeGreaterThan(0);
      expect(a.hoursPerDay).toBeGreaterThan(0);
      expect(a.hoursPerDay).toBeLessThanOrEqual(24);
    }
    expect(applianceById('kettle')?.resistive).toBe(true);
    expect(applianceById('nope')).toBeUndefined();
  });
  it('resistive ones are heating elements', () => {
    const ids = APPLIANCES.filter((a) => a.resistive).map((a) => a.id).sort();
    expect(ids).toEqual(['iron', 'kettle', 'room-heater', 'sandwich-press', 'toaster']);
  });
});

describe('energy labels', () => {
  it('stars are 1 to 6 in half steps and ids are unique', () => {
    expect(new Set(LABELS.map((l) => l.id)).size).toBe(LABELS.length);
    for (const l of LABELS) {
      expect(l.stars).toBeGreaterThanOrEqual(1);
      expect(l.stars).toBeLessThanOrEqual(6);
      expect((l.stars * 2) % 1).toBe(0);
      expect(l.kWhPerYear).toBeGreaterThan(0);
    }
  });
  it('matched pairs: same type and size, more stars means fewer kWh', () => {
    expect(LABEL_PAIRS.length).toBeGreaterThanOrEqual(3);
    for (const p of LABEL_PAIRS) {
      const lo = labelById(p.lower)!, hi = labelById(p.higher)!;
      expect(lo.type).toBe(p.type); expect(hi.type).toBe(p.type);
      expect(lo.sizeLabel).toBe(p.sizeLabel); expect(hi.sizeLabel).toBe(p.sizeLabel);
      expect(hi.stars).toBeGreaterThan(lo.stars);
      expect(hi.kWhPerYear).toBeLessThan(lo.kWhPerYear);
      expect(pairSavingPerYear(p)).toBeGreaterThan(0);
    }
  });
  it('the size trap really is a trap: more stars, more energy, different size', () => {
    const [small, large] = SIZE_TRAP.map((id) => labelById(id)!);
    expect(small.type).toBe(large.type);
    expect(small.sizeLabel).not.toBe(large.sizeLabel);
    expect(large.stars).toBeGreaterThan(small.stars);
    expect(large.kWhPerYear).toBeGreaterThan(small.kWhPerYear);
  });
  it('worked saving: fridge pair saves 180 kWh = $59.40 at 33 c', () => {
    expect(pairSavingPerYear(LABEL_PAIRS[0])).toBeCloseTo(59.4, 9);
  });
});
