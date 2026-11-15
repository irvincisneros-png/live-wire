import { describe, expect, it } from 'vitest';
import { OMITTED, SOURCES, hasTurbine, midpoint, renewableIds, sourceById } from '../src/sim/sources';

describe('sources table', () => {
  it('has the five sources', () => {
    expect(SOURCES.map((s) => s.id)).toEqual(['coal', 'gas', 'hydro', 'wind', 'solar']);
  });
  it('ranges are ordered and in sensible bounds', () => {
    for (const s of SOURCES) {
      for (const r of [s.efficiencyPct, s.capacityFactorPct]) { expect(r[0]).toBeLessThanOrEqual(r[1]); expect(r[0]).toBeGreaterThan(0); expect(r[1]).toBeLessThanOrEqual(100); }
      expect(s.buildYears[0]).toBeLessThanOrEqual(s.buildYears[1]);
      expect(s.costBand).toBeGreaterThanOrEqual(1); expect(s.costBand).toBeLessThanOrEqual(5);
      expect(s.co2gPerKWh).toBeGreaterThanOrEqual(0);
      expect(s.advantage.length).toBeGreaterThan(5); expect(s.disadvantage.length).toBeGreaterThan(5);
      expect(s.costNote.length).toBeGreaterThan(5);
    }
  });
  it('renewables are hydro, wind and solar with no operating CO2', () => {
    expect(renewableIds()).toEqual(['hydro', 'wind', 'solar']);
    for (const s of SOURCES) if (s.renewable) expect(s.co2gPerKWh).toBe(0); else expect(s.co2gPerKWh).toBeGreaterThan(0);
  });
  it('every chain starts at a store and ends electrical', () => {
    for (const s of SOURCES) {
      expect(s.chain.length).toBeGreaterThanOrEqual(2);
      expect(s.chain[s.chain.length - 1].form).toBe('electrical');
      expect(s.chain.slice(0, -1).every((c) => c.form !== 'electrical')).toBe(true);
    }
  });
  it('PV is direct: light to electrical, no turbine or generator', () => {
    const pv = sourceById('solar');
    expect(pv.chain.map((c) => c.form)).toEqual(['light', 'electrical']);
    expect(hasTurbine(pv)).toBe(false);
    expect(pv.chain.some((c) => /generator/i.test(c.device))).toBe(false);
  });
  it('wind and hydro have no heat step', () => {
    for (const id of ['wind', 'hydro'] as const) {
      expect(sourceById(id).chain.some((c) => c.form === 'thermal')).toBe(false);
      expect(hasTurbine(sourceById(id))).toBe(true);
    }
  });
  it('gas uses a gas turbine, not a boiler; coal uses a boiler and steam turbine', () => {
    const gas = sourceById('gas').chain.map((c) => c.device.toLowerCase()).join('|');
    expect(gas).toContain('gas turbine');
    expect(gas).not.toContain('boiler');
    expect(sourceById('coal').chain.map((c) => c.device)).toEqual(['Coal', 'Boiler', 'Steam turbine', 'Generator']);
  });
  it('non-dispatchable are exactly wind and solar', () => {
    expect(SOURCES.filter((s) => !s.dispatchable).map((s) => s.id)).toEqual(['wind', 'solar']);
  });
  it('lists nuclear, geothermal and biomass as omitted', () => {
    expect(OMITTED).toEqual(['nuclear', 'geothermal', 'biomass']);
  });
  it('coal has the highest operating CO2; solar and wind build fastest', () => {
    for (const s of SOURCES) expect(sourceById('coal').co2gPerKWh).toBeGreaterThanOrEqual(s.co2gPerKWh);
    for (const id of ['wind', 'solar'] as const) expect(midpoint(sourceById(id).buildYears)).toBeLessThan(midpoint(sourceById('coal').buildYears));
  });
  it('midpoint', () => { expect(midpoint([30, 40])).toBe(35); });
});
