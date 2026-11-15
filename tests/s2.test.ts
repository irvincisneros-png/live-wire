import { describe, expect, it } from 'vitest';
import { sameTopology } from '../src/bench/topology';
import { adjacent } from '../src/bench/grid';
import { solve } from '../src/sim/circuit';
import type { Part } from '../src/types';
import {
  DRAW_CIRCUIT, sameCircuit, seriesLoopKinds, P, PARALLEL_TARGET, SERIES_TARGET, SYMBOL_QUIZ, allGlobesLit, buildPasses, countKinds, diagramCrop, diagramFeedback, drawPasses,
} from '../src/stations/s2/logic';

const grid = { cols: 5, rows: 4 };
const G = { kind: 'globe' as const, ratedV: 6, ratedW: 3 };
const lite = (kind: Part['kind'], a: number, b: number) => ({ kind, a, b });

describe('station 2 targets', () => {
  it.each([['series', SERIES_TARGET], ['parallel', PARALLEL_TARGET], ['draw', DRAW_CIRCUIT]] as const)('%s is a valid working circuit on the grid', (_n, parts) => {
    for (const p of parts) expect(adjacent(grid, p.a, p.b)).toBe(true);
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    const sol = solve({ parts: [...parts] });
    expect(sol.status).toBe('ok');
    expect(sol.shorted).toEqual([]);
    expect(sol.live).toBe(true);
    expect(sol.overloaded).toEqual([]);
  });

  it('series and parallel targets light every globe, and differ from each other', () => {
    expect(allGlobesLit(SERIES_TARGET)).toBe(true);
    expect(allGlobesLit(PARALLEL_TARGET)).toBe(true);
    expect(sameTopology(SERIES_TARGET, PARALLEL_TARGET)).toBe(false);
    expect(countKinds(SERIES_TARGET)).toEqual({ battery: 1, switch: 1, globe: 2 });
    expect(countKinds(PARALLEL_TARGET)).toEqual({ battery: 1, globe: 2 });
  });

  it('the draw circuit is locked and has battery, switch, globe and resistor', () => {
    expect(DRAW_CIRCUIT.every((p) => p.locked)).toBe(true);
    expect(countKinds(DRAW_CIRCUIT)).toEqual({ battery: 1, switch: 1, globe: 1, resistor: 1 });
  });
});

describe('buildPasses', () => {
  // the same series circuit, laid out differently on the board
  const seriesElsewhere: Part[] = [
    { id: 'b', kind: 'battery', a: P(3, 3), b: P(2, 3), emf: 6 },
    { id: 'g1', ...G, a: P(2, 3), b: P(2, 2) },
    { id: 'g2', ...G, a: P(2, 2), b: P(2, 1) },
    { id: 's', kind: 'switch', a: P(2, 1), b: P(3, 1), closed: true },
    { id: 'w', kind: 'wire', a: P(3, 1), b: P(3, 2) },
    { id: 'w2', kind: 'wire', a: P(3, 2), b: P(3, 3) },
  ];
  it('accepts the same circuit laid out differently', () => {
    expect(buildPasses(seriesElsewhere, SERIES_TARGET)).toBe(true);
  });
  it('rejects a good build with the switch open (it does not work)', () => {
    const open = seriesElsewhere.map((p) => (p.kind === 'switch' ? { ...p, closed: false } : p));
    expect(sameCircuit(open, SERIES_TARGET)).toBe(true);
    expect(buildPasses(open, SERIES_TARGET)).toBe(false);
  });
  it('rejects parallel when series is wanted, and the reverse', () => {
    expect(buildPasses(PARALLEL_TARGET, SERIES_TARGET)).toBe(false);
    expect(buildPasses(SERIES_TARGET, PARALLEL_TARGET)).toBe(false);
  });
  it('accepts the parallel target itself and rejects it with a branch missing', () => {
    expect(buildPasses(PARALLEL_TARGET, PARALLEL_TARGET)).toBe(true);
    expect(buildPasses(PARALLEL_TARGET.filter((p) => p.id !== 'g2'), PARALLEL_TARGET)).toBe(false);
  });
});

describe('drawPasses', () => {
  const drawn = (list: ReturnType<typeof lite>[]) => list;
  // the draw circuit, drawn on a different part of the grid, wires included
  const good = drawn([
    lite('battery', P(0, 2), P(1, 2)), lite('wire', P(1, 2), P(2, 2)), lite('switch', P(2, 2), P(2, 1)),
    lite('globe', P(2, 1), P(1, 1)), lite('resistor', P(1, 1), P(0, 1)), lite('wire', P(0, 1), P(0, 2)),
  ]);
  it('accepts a correct drawing, wires or not', () => {
    expect(drawPasses(good, DRAW_CIRCUIT)).toBe(true);
    expect(drawPasses(DRAW_CIRCUIT, DRAW_CIRCUIT)).toBe(true);
  });
  it('rejects an empty diagram, a missing part, and a wrong join', () => {
    expect(drawPasses([], DRAW_CIRCUIT)).toBe(false);
    expect(drawPasses(good.filter((p) => p.kind !== 'resistor'), DRAW_CIRCUIT)).toBe(false);
    const parallelGlobe = drawn([
      lite('battery', P(0, 2), P(1, 2)), lite('switch', P(1, 2), P(1, 1)), lite('resistor', P(1, 1), P(0, 1)), lite('wire', P(0, 1), P(0, 2)),
      lite('globe', P(1, 2), P(0, 2)),
    ]);
    expect(drawPasses(parallelGlobe, DRAW_CIRCUIT)).toBe(false);
  });
  it('accepts the same parts in a different order round a single loop', () => {
    const reordered = drawn([
      lite('battery', P(0, 2), P(1, 2)), lite('resistor', P(1, 2), P(2, 2)), lite('globe', P(2, 2), P(2, 1)),
      lite('switch', P(2, 1), P(1, 1)), lite('wire', P(1, 1), P(0, 1)), lite('wire', P(0, 1), P(0, 2)),
    ]);
    expect(drawPasses(reordered, DRAW_CIRCUIT)).toBe(true);
  });
  it('rejects two separate loops that have the right parts', () => {
    const two = drawn([
      lite('battery', P(0, 2), P(1, 2)), lite('switch', P(1, 2), P(0, 2)),
      lite('globe', P(3, 1), P(4, 1)), lite('resistor', P(4, 1), P(3, 1)),
    ]);
    expect(seriesLoopKinds(two)).toBeNull();
    expect(drawPasses(two, DRAW_CIRCUIT)).toBe(false);
  });
});

describe('diagramFeedback', () => {
  const good = [
    lite('battery', P(0, 2), P(1, 2)), lite('wire', P(1, 2), P(2, 2)), lite('switch', P(2, 2), P(2, 1)),
    lite('globe', P(2, 1), P(1, 1)), lite('resistor', P(1, 1), P(0, 1)), lite('wire', P(0, 1), P(0, 2)),
  ];
  it('returns null for a correct diagram', () => {
    expect(diagramFeedback(good, DRAW_CIRCUIT)).toBeNull();
  });
  it('says the diagram is empty', () => {
    expect(diagramFeedback([], DRAW_CIRCUIT)).toMatch(/empty/);
  });
  it('counts a wrong number of lamps, with the diagram/circuit words', () => {
    expect(diagramFeedback(SERIES_TARGET.filter((p) => p.id !== 'g2'), SERIES_TARGET)).toBe('Your diagram has 1 lamp. The circuit has 2.');
    expect(diagramFeedback(SERIES_TARGET.filter((p) => p.id !== 'g2'), SERIES_TARGET, { mine: 'circuit', other: 'diagram' })).toBe('Your circuit has 1 globe. The diagram has 2.');
  });
  it('says there is none of a part', () => {
    expect(diagramFeedback(good.filter((p) => p.kind !== 'resistor'), DRAW_CIRCUIT)).toBe('Your diagram has no resistor. The circuit has 1.');
  });
  it('says too many of a part', () => {
    expect(diagramFeedback([...good, lite('switch', P(3, 0), P(3, 1))], DRAW_CIRCUIT)).toBe('Your diagram has 2 switches. The circuit has 1.');
  });
  it('points at the wiring when the parts are right but joined wrongly', () => {
    const twoGlobesParallel = [
      lite('battery', P(1, 2), P(1, 1)), lite('wire', P(1, 1), P(2, 1)), lite('wire', P(2, 1), P(3, 1)),
      lite('globe', P(2, 1), P(2, 2)), lite('globe', P(3, 1), P(3, 2)), lite('wire', P(1, 2), P(2, 2)), lite('wire', P(2, 2), P(3, 2)),
      lite('switch', P(4, 1), P(4, 2)),
    ];
    const msg = diagramFeedback(twoGlobesParallel, SERIES_TARGET);
    expect(msg).toBe('The parts are right. Check how they are joined.');
  });
  it('points at the battery when only its direction is wrong (a circuit where it matters)', () => {
    // resistor on the positive side, then two lamps in parallel back to the negative end
    const target = [
      lite('battery', P(0, 3), P(0, 2)), lite('resistor', P(0, 2), P(1, 2)), lite('wire', P(1, 2), P(2, 2)),
      lite('globe', P(1, 2), P(1, 3)), lite('globe', P(2, 2), P(2, 3)), lite('wire', P(1, 3), P(0, 3)), lite('wire', P(1, 3), P(2, 3)),
    ];
    const flipped = target.map((p) => (p.kind === 'battery' ? { ...p, a: p.b, b: p.a } : p));
    expect(sameCircuit(flipped, target)).toBe(false);
    expect(diagramFeedback(flipped, target)).toMatch(/which way the battery faces/);
    expect(diagramFeedback(target, target)).toBeNull();
  });
});

describe('symbol quiz and crop', () => {
  it('has four distinct options and the right one first', () => {
    expect(new Set(SYMBOL_QUIZ.options.map((o) => o.kind)).size).toBe(4);
    expect(SYMBOL_QUIZ.options[SYMBOL_QUIZ.correct].kind).toBe(SYMBOL_QUIZ.kind);
  });
  it('crops tightly to the posts in use', () => {
    const [x, y, w, h] = diagramCrop(SERIES_TARGET);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThan(308);
    expect(h).toBeLessThan(268);
  });
});
