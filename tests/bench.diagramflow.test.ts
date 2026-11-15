import { describe, expect, it } from 'vitest';
import { flowLines } from '../src/bench/diagram';
import { solve } from '../src/sim/circuit';
import type { Part } from '../src/types';

const g = { cols: 5, rows: 4 };
// battery on the bottom edge (a = negative at post 11, b = positive at post 12), loop up and over through a globe
const parts: Part[] = [
  { id: 'B', kind: 'battery', a: 11, b: 12, emf: 6 },
  { id: 'W1', kind: 'wire', a: 12, b: 7 },
  { id: 'G', kind: 'globe', a: 7, b: 6, ratedV: 6, ratedW: 3 },
  { id: 'W2', kind: 'wire', a: 6, b: 11 },
];

describe('electron flow on the circuit diagram', () => {
  it('draws one moving line per current-carrying part', () => {
    expect(flowLines(g, parts, solve({ parts }))).toHaveLength(4);
  });
  it('electrons leave the negative terminal and arrive at the positive terminal', () => {
    const lines = flowLines(g, parts, solve({ parts }));
    const px = (id: number): [number, number] => [34 + (id % 5) * 60, 34 + Math.floor(id / 5) * 60];
    // the wire joined to the negative terminal (post 11) carries electrons AWAY from it: 11 → 6
    expect(lines[3].from).toEqual(px(11));
    expect(lines[3].to).toEqual(px(6));
    // the wire joined to the positive terminal (post 12) carries electrons INTO it: 7 → 12
    expect(lines[1].from).toEqual(px(7));
    expect(lines[1].to).toEqual(px(12));
    // dots are brighter (more energy) before the globe than after it
    expect(lines[3].glow).toBeGreaterThan(lines[1].glow);
  });
  it('shows nothing when no current flows, and skips voltmeters', () => {
    const open: Part[] = [...parts.slice(0, 3), { id: 'S', kind: 'switch', a: 6, b: 11, closed: false }, { id: 'V', kind: 'voltmeter', a: 6, b: 7 }];
    expect(flowLines(g, open, solve({ parts: open }))).toHaveLength(0);
  });
});
