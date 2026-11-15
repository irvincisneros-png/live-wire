import { describe, expect, it } from 'vitest';
import { solve } from '../src/sim/circuit';
import { commonCropSize, FAULTS, ROLES, SETUPS, SETUP_CORRECT, diagramCrop, faultFor, globeLit, guidedComplete, guidedStart, isShort, shortMade, shortStart } from '../src/stations/s1/logic';
import { adjacent } from '../src/bench/grid';

const grid = { cols: 5, rows: 4 };
const onGrid = (parts: { a: number; b: number }[]) => parts.every((p) => adjacent(grid, p.a, p.b));

describe('station 1 scenes', () => {
  it('guided start has a battery and a globe, not lit; two wires light it', () => {
    expect(guidedStart().map((p) => p.kind).sort()).toEqual(['battery', 'globe']);
    expect(globeLit(guidedStart())).toBe(false);
    expect(globeLit(guidedComplete())).toBe(true);
    expect(onGrid(guidedComplete())).toBe(true);
  });

  it.each(FAULTS.map((f) => [f.id, f] as const))('fault %s is really dead and really fixed', (_id, f) => {
    expect(globeLit(f.parts())).toBe(false);
    expect(solve({ parts: f.parts() }).status).toBe('ok');
    expect(globeLit(f.fixed())).toBe(true);
    expect(isShort(f.fixed())).toBe(false);
    expect(onGrid(f.parts())).toBe(true);
    expect(onGrid(f.fixed())).toBe(true);
    expect(f.hint.length).toBeGreaterThan(20);
  });

  it('the open-switch fault differs from its fix only by the switch state', () => {
    const f = FAULTS.find((x) => x.id === 'open-switch')!;
    expect(f.parts().find((p) => p.kind === 'switch')!.closed).toBe(false);
    expect(f.fixed().find((p) => p.kind === 'switch')!.closed).toBe(true);
  });

  it('the same-terminal fault has both globe ends joined to the battery positive end', () => {
    const f = FAULTS.find((x) => x.id === 'same-terminal')!;
    const bat = f.parts().find((p) => p.kind === 'battery')!;
    const sol = solve({ parts: f.parts() });
    const globe = f.parts().find((p) => p.kind === 'globe')!;
    expect(sol.node[globe.a]).toBeCloseTo(sol.node[bat.b], 3);
    expect(sol.node[globe.b]).toBeCloseTo(sol.node[bat.b], 3);
  });

  it('rotates through all faults, so retries see different ones', () => {
    expect(new Set([0, 1, 2].map((n) => faultFor(n).id)).size).toBe(3);
    expect(faultFor(3).id).toBe(faultFor(0).id);
    expect(faultFor(-1).id).toBe(faultFor(2).id);
  });

  it('the short-circuit start is lit and safe; the bypass wire makes a short', () => {
    expect(globeLit(shortStart())).toBe(true);
    expect(isShort(shortStart())).toBe(false);
    expect(isShort(shortMade())).toBe(true);
    expect(globeLit(shortMade())).toBe(false);
    expect(onGrid(shortMade())).toBe(true);
  });

  it('exactly one of the four pictured setups is a complete circuit, and it is the marked one', () => {
    const lit = SETUPS.map((s) => globeLit(s.parts));
    expect(lit.filter(Boolean)).toHaveLength(1);
    expect(lit.indexOf(true)).toBe(SETUP_CORRECT);
    for (const s of SETUPS) expect(onGrid(s.parts)).toBe(true);
  });

  it('crops the diagram to the posts in use', () => {
    const [x, y, w, h] = diagramCrop(SETUPS[0].parts);
    expect(w).toBeLessThan(300);
    expect(h).toBeLessThan(260);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('gives every setup the same centred frame', () => {
    const size = commonCropSize(SETUPS.map((s) => s.parts));
    for (const s of SETUPS) {
      const own = diagramCrop(s.parts);
      const [x, y, w, h] = diagramCrop(s.parts, size);
      expect([w, h]).toEqual(size);
      expect(x + w / 2).toBeCloseTo(own[0] + own[2] / 2, 6);
      expect(y + h / 2).toBeCloseTo(own[1] + own[3] / 2, 6);
    }
  });

  it('the parts card names four roles', () => {
    expect(ROLES.map((r) => r.id)).toEqual(['source', 'path', 'load', 'switch']);
  });
});
