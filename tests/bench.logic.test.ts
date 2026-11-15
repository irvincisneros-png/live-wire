import { describe, expect, it } from 'vitest';
import { solve } from '../src/sim/circuit';
import type { Part } from '../src/types';
import { adjacent, allEdges, colRow, edgeKey, nearestEdge, postId, postName, postXZ, stepEdge, stepPost } from '../src/bench/grid';
import { sameTopology } from '../src/bench/topology';
import { BLOW_TIME, SIM_STEP, SimClock, TRIP_TIME, effectiveParts } from '../src/bench/simclock';
import { advancePhase, dotLayout, dotSpeedMag, electronVelocity, glowAt, potentialAlong } from '../src/bench/flowmath';

const g = { cols: 5, rows: 4 };

describe('grid maths', () => {
  it('post ids round-trip and name like the board', () => {
    expect(postId(g, 2, 1)).toBe(7);
    expect(colRow(g, 7)).toEqual({ col: 2, row: 1 });
    expect(postName(g, 0)).toBe('A1');
    expect(postName(g, 7)).toBe('C2');
    expect(postName(g, 19)).toBe('E4');
  });
  it('posts are centred and 1 unit apart', () => {
    expect(postXZ(g, 0)).toEqual([-2, -1.5]);
    expect(postXZ(g, 19)).toEqual([2, 1.5]);
    const [x0] = postXZ(g, 0), [x1] = postXZ(g, 1);
    expect(x1 - x0).toBe(1);
  });
  it('adjacency is orthogonal only', () => {
    expect(adjacent(g, 0, 1)).toBe(true);
    expect(adjacent(g, 0, 5)).toBe(true);
    expect(adjacent(g, 0, 6)).toBe(false);
    expect(adjacent(g, 4, 5)).toBe(false); // row wrap
    expect(adjacent(g, 3, 3)).toBe(false);
  });
  it('edge count and keys', () => {
    const e = allEdges(g);
    expect(e.length).toBe(4 * 4 + 5 * 3);
    expect(new Set(e.map((x) => x.key)).size).toBe(e.length);
    expect(edgeKey(6, 1)).toBe('1-6');
  });
  it('nearest edge snaps and keyboard steps move the right way', () => {
    const edges = allEdges(g);
    const e = nearestEdge(g, edges, -1.5, -1.5)!;
    expect(e.key).toBe(edgeKey(0, 1));
    const r = stepEdge(g, edges, e, 'right');
    expect(r.key).toBe(edgeKey(1, 2));
    const d = stepEdge(g, edges, e, 'down');
    const [, z0] = postXZ(g, e.a);
    expect((postXZ(g, d.a)[1] + postXZ(g, d.b)[1]) / 2).toBeGreaterThan(z0);
    expect(stepEdge(g, edges, e, 'up').key).toBe(e.key); // border
    expect(stepPost(g, 0, 'left')).toBe(0);
    expect(stepPost(g, 0, 'down')).toBe(5);
  });
});

const W = (a: number, b: number): Pick<Part, 'kind' | 'a' | 'b'> => ({ kind: 'wire', a, b });

describe('sameTopology', () => {
  // a: battery 0(−)→1(+), globe 1–2, wires 2-7-6-5-0 vs a compact layout elsewhere on the grid
  const big = [{ kind: 'battery' as const, a: 0, b: 1 }, { kind: 'globe' as const, a: 1, b: 2 }, W(2, 7), W(7, 6), W(6, 5), W(5, 0)];
  const small = [{ kind: 'battery' as const, a: 11, b: 12 }, { kind: 'globe' as const, a: 12, b: 17 }, W(17, 16), W(16, 11)];
  it('matches after collapsing wires, anywhere on the grid', () => {
    expect(sameTopology(big, small)).toBe(true);
    expect(sameTopology(small, big)).toBe(true);
  });
  it('battery polarity matters', () => {
    const flipped = [{ kind: 'battery' as const, a: 12, b: 11 }, ...small.slice(1)];
    // a single loop with one battery is symmetric, so flipping alone is the same circuit...
    expect(sameTopology(small, flipped)).toBe(true);
    // ...but with an ammeter-free asymmetric circuit polarity shows: battery + resistor in series with a voltmeter across the resistor only
    const base = [{ kind: 'battery' as const, a: 0, b: 1 }, { kind: 'resistor' as const, a: 1, b: 2 }, { kind: 'globe' as const, a: 2, b: 0 }, { kind: 'voltmeter' as const, a: 1, b: 2 }];
    const rev = [{ kind: 'battery' as const, a: 1, b: 0 }, ...base.slice(1)];
    expect(sameTopology(base, rev)).toBe(false);
  });
  it('different kinds or structure do not match', () => {
    const resistor = [{ kind: 'battery' as const, a: 11, b: 12 }, { kind: 'resistor' as const, a: 12, b: 17 }, W(17, 16), W(16, 11)];
    expect(sameTopology(small, resistor)).toBe(false);
    const series2 = [{ kind: 'battery' as const, a: 0, b: 1 }, { kind: 'globe' as const, a: 1, b: 2 }, { kind: 'globe' as const, a: 2, b: 3 }, W(3, 8), W(8, 5), W(5, 0)];
    const parallel2 = [{ kind: 'battery' as const, a: 0, b: 1 }, { kind: 'globe' as const, a: 1, b: 6 }, { kind: 'globe' as const, a: 2, b: 7 }, W(1, 2), W(6, 7), W(6, 5), W(5, 0)];
    expect(sameTopology(series2, parallel2)).toBe(false);
    const parallelElsewhere = [{ kind: 'battery' as const, a: 15, b: 10 }, W(10, 11), { kind: 'globe' as const, a: 11, b: 16 }, W(11, 12), { kind: 'globe' as const, a: 12, b: 17 }, W(16, 17), W(15, 16)];
    expect(sameTopology(parallel2, parallelElsewhere)).toBe(true);
  });
  it('a missing wire (open circuit) is a different circuit', () => {
    expect(sameTopology(small, small.slice(0, 3))).toBe(false);
  });
});

describe('sim clock', () => {
  const short: Part[] = [{ id: 'B', kind: 'battery', a: 0, b: 1, emf: 1.5 }, { id: 'W', kind: 'wire', a: 1, b: 0 }];
  it('trips after 1.5 s of short and then solves with no emf', () => {
    const clock = new SimClock();
    let parts = short;
    let sol = solve({ parts: effectiveParts(parts, false) });
    expect(sol.shorted).toContain('B');
    let tripped = 0;
    const hooks = { solution: () => sol, parts: () => parts, onBlow: () => {}, onTrip: () => { tripped++; sol = solve({ parts: effectiveParts(parts, true) }); } };
    for (let i = 0; i < 17; i++) clock.tick(1 / 12, hooks); // 1.417 s
    expect(clock.tripped).toBe(false);
    for (let i = 0; i < 3; i++) clock.tick(1 / 12, hooks);
    expect(clock.tripped).toBe(true);
    expect(tripped).toBe(1);
    expect(sol.shorted.length).toBe(0);
    expect(sol.live).toBe(false);
    clock.resetBreaker();
    expect(clock.tripped).toBe(false);
    parts = short;
  });
  it('blows a globe after 0.4 s overloaded, not before', () => {
    const parts: Part[] = [{ id: 'B', kind: 'battery', a: 0, b: 1, emf: 12 }, { id: 'G', kind: 'globe', a: 1, b: 0, ratedV: 6, ratedW: 3 }];
    let sol = solve({ parts });
    expect(sol.overloaded).toContain('G');
    const clock = new SimClock();
    const blown: string[] = [];
    const hooks = { solution: () => sol, parts: () => parts, onTrip: () => {}, onBlow: (id: string) => { blown.push(id); parts[1].blown = true; sol = solve({ parts }); } };
    for (let i = 0; i < Math.round((BLOW_TIME - 0.05) / 0.05); i++) clock.tick(0.05, hooks); // 0.35 s
    expect(blown).toEqual([]);
    clock.tick(0.1, hooks);
    expect(blown).toEqual(['G']);
    expect(sol.live).toBe(false);
  });
  it('integrates energy in fixed steps and clamps big frames', () => {
    const parts: Part[] = [{ id: 'B', kind: 'battery', a: 0, b: 1, emf: 6, rInt: 1e-6 }, { id: 'R', kind: 'resistor', a: 1, b: 0, resistance: 12 }];
    const sol = solve({ parts });
    const clock = new SimClock();
    const hooks = { solution: () => sol, parts: () => parts, onBlow: () => {}, onTrip: () => {} };
    for (let i = 0; i < 120; i++) clock.tick(1 / 120 + 1e-9, hooks);
    expect(clock.energyOf('R')).toBeCloseTo(3, 1); // 3 W for 1 s
    const n = clock.tick(5, hooks); // clamped to 0.1 s
    expect(n).toBeLessThanOrEqual(Math.ceil(0.1 / SIM_STEP) + 1);
    clock.resetEnergy();
    expect(clock.energyOf('R')).toBe(0);
    expect(TRIP_TIME).toBe(1.5);
  });
});

describe('electron flow', () => {
  // series: battery 0(−)→1(+), wire 1→2, globe 2→3, wire 3→0 (the wire attached to the − terminal is "W2" with a = 3, b = 0)
  const parts: Part[] = [
    { id: 'B', kind: 'battery', a: 0, b: 1, emf: 6 },
    { id: 'W1', kind: 'wire', a: 1, b: 2 },
    { id: 'G', kind: 'globe', a: 2, b: 3, ratedV: 6, ratedW: 3 },
    { id: 'W2', kind: 'wire', a: 3, b: 0 },
    { id: 'W3', kind: 'wire', a: 0, b: 4 }, // dead-end stub: no current
  ];
  const sol = solve({ parts });
  it('dots on the wire at the negative terminal move away from it', () => {
    // W2 runs 3 → 0 and node 0 is the − terminal: moving away from 0 means velocity toward a (negative)
    const v = electronVelocity(sol.parts.W2.current);
    expect(v).toBeLessThan(0);
    // wire leaving the + terminal: electrons arrive at node 1, i.e. W1 (a = 1) velocity is toward a (negative)
    expect(electronVelocity(sol.parts.W1.current)).toBeLessThan(0);
    // inside the battery electrons are lifted from + (b) to − (a): velocity toward a
    expect(electronVelocity(sol.parts.B.current)).toBeLessThan(0);
    // dead-end stub: dots stay still
    expect(electronVelocity(sol.parts.W3.current)).toBe(0);
  });
  it('series parts share one dot speed; speed grows with current, with a minimum and a cap', () => {
    expect(Math.abs(electronVelocity(sol.parts.W1.current))).toBeCloseTo(Math.abs(electronVelocity(sol.parts.G.current)), 6);
    expect(dotSpeedMag(0)).toBe(0);
    expect(dotSpeedMag(1e-4)).toBeGreaterThan(0);
    expect(dotSpeedMag(1)).toBeGreaterThan(dotSpeedMag(0.5));
    expect(dotSpeedMag(1000)).toBeLessThan(3);
  });
  it('glow is brightest leaving the − terminal and dims after the globe', () => {
    const vs = Object.values(sol.node);
    const vmin = Math.min(...vs), vmax = Math.max(...vs);
    const gNeg = glowAt(sol.node[0], vmin, vmax);
    const gAfterGlobe = glowAt(sol.node[2], vmin, vmax); // electrons go 0 → 3 → (globe) → 2 → 1
    const gMidGlobe = glowAt(potentialAlong(sol.node[2], sol.node[3], 0.5), vmin, vmax);
    expect(gNeg).toBeCloseTo(1, 3);
    expect(glowAt(sol.node[3], vmin, vmax)).toBeCloseTo(1, 2);
    expect(gMidGlobe).toBeLessThan(glowAt(sol.node[3], vmin, vmax));
    expect(gAfterGlobe).toBeLessThan(gMidGlobe);
    expect(gAfterGlobe).toBeLessThan(0.05);
    // inside the battery glow rises from + (node 1) to − (node 0)
    expect(glowAt(potentialAlong(sol.node[0], sol.node[1], 0.2), vmin, vmax)).toBeGreaterThan(glowAt(potentialAlong(sol.node[0], sol.node[1], 0.8), vmin, vmax));
  });
  it('dot layout keeps whole spacing and the phase wraps', () => {
    const l = dotLayout(1.03, 0.1);
    expect(l.count).toBe(10);
    expect(l.spacing * l.count).toBeCloseTo(1.03, 9);
    const p = advancePhase(0.01, -0.5, 0.1, l.spacing);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(l.spacing);
  });
});

import { colourBands } from '../src/kit/parts/resistor';
describe('resistor colour code', () => {
  it('reads the right bands', () => {
    // yellow violet black gold = 47 Ω; brown black brown = 100 Ω; brown black black = 10 Ω; yellow violet gold = 4.7 Ω
    expect(colourBands(47)).toEqual(['#f2d21b', '#7b3fb5', '#111111', '#c9a13b']);
    expect(colourBands(100).slice(0, 3)).toEqual(['#7a4a21', '#111111', '#7a4a21']);
    expect(colourBands(10).slice(0, 3)).toEqual(['#7a4a21', '#111111', '#111111']);
    expect(colourBands(4.7).slice(0, 3)).toEqual(['#f2d21b', '#7b3fb5', '#c9a13b']);
  });
});
