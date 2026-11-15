import { describe, expect, it } from 'vitest';
import { LAMPS, LAMP_LIGHT_W, efficiency, lampEfficiency, lampSankey, sankey } from '../src/sim/efficiency';

describe('efficiency', () => {
  it('useful ÷ total × 100', () => {
    expect(efficiency(25, 100)).toBe(25);
    expect(efficiency(4, 60)).toBeCloseTo(6.6667, 4);
    expect(efficiency(0, 10)).toBe(0);
  });
  it('is NaN with no input', () => {
    expect(efficiency(1, 0)).toBeNaN();
    expect(efficiency(1, -2)).toBeNaN();
  });
});

describe('lamps', () => {
  it('are 60, 42 and 9 W with the same light output', () => {
    expect(LAMPS.map((l) => l.inputW)).toEqual([60, 42, 9]);
    for (const l of LAMPS) expect(l.lightW).toBe(LAMP_LIGHT_W);
  });
  it('conserve energy exactly: light + heat = input', () => {
    for (const l of LAMPS) expect(l.lightW + l.heatW).toBe(l.inputW);
  });
  it('efficiencies rank LED > halogen > incandescent', () => {
    const [inc, hal, led] = LAMPS.map(lampEfficiency);
    expect(inc).toBeCloseTo(6.667, 2);
    expect(hal).toBeCloseTo(9.524, 2);
    expect(led).toBeCloseTo(44.44, 2);
    expect(led).toBeGreaterThan(hal);
    expect(hal).toBeGreaterThan(inc);
  });
  it('lamp sankey agrees with lamp efficiency', () => {
    for (const l of LAMPS) {
      const s = lampSankey(l);
      expect(s.efficiencyPct).toBeCloseTo(lampEfficiency(l), 12);
      expect(s.usefulW + s.wastedW).toBe(l.inputW);
    }
  });
});

describe('sankey', () => {
  it('accepts balanced outputs', () => {
    const s = sankey(100, [{ label: 'Motion', watts: 30, useful: true }, { label: 'Heat', watts: 70, useful: false }]);
    expect(s.usefulW).toBe(30);
    expect(s.wastedW).toBe(70);
    expect(s.efficiencyPct).toBe(30);
  });
  it('throws when energy is not conserved', () => {
    expect(() => sankey(100, [{ label: 'a', watts: 30, useful: true }, { label: 'b', watts: 60, useful: false }])).toThrow();
    expect(() => sankey(100, [{ label: 'a', watts: 60, useful: true }, { label: 'b', watts: 60, useful: false }])).toThrow();
  });
});
