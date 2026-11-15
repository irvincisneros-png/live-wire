// Station 1 (Complete circuits): pure logic. No DOM, no three. Posts use the default 5 x 4 bench grid.
import type { Part } from '../../types';
import { solve } from '../../sim/circuit';

export const COLS = 5;
export const ROWS = 4;
/** post id for (col,row) on the default bench grid */
export const P = (col: number, row: number): number => row * COLS + col;

const GLOBE = { kind: 'globe' as const, ratedV: 6, ratedW: 3 };
const BAT = (id: string, a: number, b: number): Part => ({ id, kind: 'battery', a, b, emf: 6, locked: true });
const GLB = (id: string, a: number, b: number): Part => ({ id, ...GLOBE, a, b, locked: true });
const W = (id: string, a: number, b: number): Part => ({ id, kind: 'wire', a, b });

/** true if some globe in the list is lit (power above 5 % of rated), judged with the real solver */
export function globeLit(parts: Part[]): boolean {
  const sol = solve({ parts });
  if (sol.status !== 'ok') return false;
  return parts.some((p) => p.kind === 'globe' && !p.blown && (sol.parts[p.id]?.power ?? 0) > 0.05 * (p.ratedW ?? 3));
}

// ───────────────────────────── guided ─────────────────────────────

/** guided start: a 6 V battery and a globe on the board, not joined */
export function guidedStart(): Part[] {
  return [
    { id: 'bat', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6, locked: true },
    { id: 'globe', ...GLOBE, a: P(1, 1), b: P(2, 1), locked: true },
  ];
}
/** the posts the two missing wires join (for the coach highlight) */
export const GUIDED_POSTS = [P(1, 1), P(2, 1), P(1, 2), P(2, 2)];
export const guidedComplete = (): Part[] => [...guidedStart(), W('w-right', P(2, 2), P(2, 1)), W('w-left', P(1, 1), P(1, 2))];

// ───────────────────────────── the dead-circuit faults ─────────────────────────────

export interface Fault {
  id: 'gap' | 'open-switch' | 'same-terminal';
  name: string;
  /** a broken circuit: the globe is dark */
  parts(): Part[];
  /** one valid repair of it: the globe lights */
  fixed(): Part[];
  /** extra wires the tray must allow */
  extraWires: number;
  /** shown when the student presses Check and it is not fixed yet */
  hint: string;
  explain: string;
}

/** the common lit loop: battery bottom left, wires up the right, globe on top, left side back down. `mid` fills the top-left edge. */
function loop(mid: Part): Part[] {
  return [
    BAT('bat', P(1, 2), P(2, 2)),
    W('w1', P(2, 2), P(3, 2)),
    W('w2', P(3, 2), P(3, 1)),
    GLB('globe', P(3, 1), P(2, 1)),
    mid,
    W('w4', P(1, 1), P(1, 2)),
  ];
}
const topLeft = (p: Partial<Part> & Pick<Part, 'kind'>): Part => ({ id: 'top', a: P(2, 1), b: P(1, 1), ...p });

export const FAULTS: Fault[] = [
  {
    id: 'gap',
    name: 'a missing wire',
    parts: () => loop(topLeft({ kind: 'wire' })).filter((p) => p.id !== 'top'),
    fixed: () => loop(topLeft({ kind: 'wire' })),
    extraWires: 2,
    hint: 'Switch on <b>X-ray</b>. Charge only moves in a complete loop. Follow the loop with your eyes from one battery end to the other: is there a gap?',
    explain: 'There was a gap in the loop. Charge can only flow when the conducting path goes all the way round, from one end of the battery to the other.',
  },
  {
    id: 'open-switch',
    name: 'an open switch',
    parts: () => loop(topLeft({ kind: 'switch', closed: false })),
    fixed: () => loop(topLeft({ kind: 'switch', closed: true })),
    extraWires: 2,
    hint: 'Look at every part in the loop, not only the wires. Which part can open and close the path? Tap it.',
    explain: 'The open switch was a gap in the loop. Closing it completed the path, so charge could flow and the globe lit.',
  },
  {
    id: 'same-terminal',
    name: 'a globe wired to one battery terminal',
    // the globe branch loops back to the battery's positive end, so it never reaches the negative end
    parts: () => [
      BAT('bat', P(1, 2), P(2, 2)),
      W('w1', P(2, 2), P(3, 2)),
      W('w2', P(3, 2), P(3, 1)),
      GLB('globe', P(3, 1), P(2, 1)),
      W('bad', P(2, 1), P(2, 2)),
    ],
    fixed: () => [
      BAT('bat', P(1, 2), P(2, 2)),
      W('w1', P(2, 2), P(3, 2)),
      W('w2', P(3, 2), P(3, 1)),
      GLB('globe', P(3, 1), P(2, 1)),
      W('w3', P(2, 1), P(1, 1)),
      W('w4', P(1, 1), P(1, 2)),
    ],
    extraWires: 2,
    hint: 'Check where the globe’s two ends go. A complete circuit starts at one battery terminal and must come back to the <i>other</i> one. Does it?',
    explain: 'Both ends of the globe branch joined the same battery terminal. Charge went out and came back to the same place, so it never crossed from one terminal to the other. The path must link the two different terminals.',
  },
];

/** fault for the nth attempt: rotates so repeat attempts see different faults */
export const faultFor = (n: number): Fault => FAULTS[((n % FAULTS.length) + FAULTS.length) % FAULTS.length];

// ───────────────────────────── the short circuit ─────────────────────────────

/** a working circuit: battery, wires and a lit globe. The short-circuit wire is NOT here. */
export function shortStart(): Part[] {
  return [
    BAT('bat', P(1, 2), P(2, 2)),
    { id: 'w1', kind: 'wire', a: P(2, 2), b: P(3, 2), locked: true },
    { id: 'w2', kind: 'wire', a: P(3, 2), b: P(3, 1), locked: true },
    GLB('globe', P(3, 1), P(2, 1)),
    { id: 'w3', kind: 'wire', a: P(2, 1), b: P(1, 1), locked: true },
    { id: 'w4', kind: 'wire', a: P(1, 1), b: P(1, 2), locked: true },
  ];
}
/** the wire that makes the short: from the battery's + end across to the globe's far end, bypassing the globe */
export const SHORT_WIRE = { a: P(2, 1), b: P(2, 2) };
export const SHORT_POSTS = [SHORT_WIRE.a, SHORT_WIRE.b];
export const shortMade = (): Part[] => [...shortStart(), { id: 'short', kind: 'wire', ...SHORT_WIRE }];

/** does this circuit contain a short (battery current above the solver's limit)? */
export function isShort(parts: Part[]): boolean {
  const sol = solve({ parts });
  return sol.status === 'ok' && sol.shorted.length > 0;
}

// ───────────────────────────── which setup is a complete circuit? ─────────────────────────────

export interface Setup { label: string; caption: string; parts: Part[] }

const sBat = (): Part => ({ id: 'b', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 });
const sGlb = (a: number, b: number): Part => ({ id: 'g', ...GLOBE, a, b });
const sW = (id: string, a: number, b: number): Part => ({ id, kind: 'wire', a, b });

/** four setups, exactly one of which lights the globe */
export const SETUPS: Setup[] = [
  { label: 'A', caption: 'The right-hand wire is missing', parts: [sBat(), sGlb(P(1, 1), P(2, 1)), sW('w', P(1, 1), P(1, 2))] },
  { label: 'B', caption: 'A switch is in the loop and it is open', parts: [sBat(), sGlb(P(1, 1), P(2, 1)), sW('w', P(1, 1), P(1, 2)), { id: 's', kind: 'switch', a: P(2, 1), b: P(2, 2), closed: false }] },
  { label: 'C', caption: 'Wires join both globe ends to the battery', parts: [sBat(), sGlb(P(1, 1), P(2, 1)), sW('w1', P(1, 1), P(1, 2)), sW('w2', P(2, 1), P(2, 2))] },
  { label: 'D', caption: 'The globe\u2019s two ends both go to the battery\u2019s positive end', parts: [sBat(), sW('w1', P(2, 2), P(3, 2)), sGlb(P(3, 2), P(3, 1)), sW('w2', P(3, 1), P(2, 1)), sW('w3', P(2, 1), P(2, 2))] },
];
export const SETUP_CORRECT = 2;

// ───────────────────────────── diagram crop (for small pictures) ─────────────────────────────

const S = 60, MARGIN = 34;
/** viewBox [x, y, w, h] that frames just the posts used by these parts, so a small picture is not mostly empty grid. With `size`, the frame is that big and centred on the parts. */
export function diagramCrop(parts: Pick<Part, 'a' | 'b'>[], size?: [number, number]): [number, number, number, number] {
  if (!parts.length) return [0, 0, MARGIN * 2 + (COLS - 1) * S, MARGIN * 2 + (ROWS - 1) * S];
  const xs: number[] = [], ys: number[] = [];
  for (const p of parts) for (const id of [p.a, p.b]) { xs.push(MARGIN + (id % COLS) * S); ys.push(MARGIN + Math.floor(id / COLS) * S); }
  const x0 = Math.min(...xs) - 36, x1 = Math.max(...xs) + 36, y0 = Math.min(...ys) - 38, y1 = Math.max(...ys) + 30;
  if (!size) return [x0, y0, x1 - x0, y1 - y0];
  const [w, h] = size;
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}

/** the smallest frame that holds every one of these circuits, so pictures of different circuits share a scale */
export function commonCropSize(lists: Pick<Part, 'a' | 'b'>[][]): [number, number] {
  let w = 0, h = 0;
  for (const l of lists) { const c = diagramCrop(l); w = Math.max(w, c[2]); h = Math.max(h, c[3]); }
  return [w, h];
}

// ───────────────────────────── parts-of-a-circuit card ─────────────────────────────

export interface PartRole { id: 'source' | 'path' | 'load' | 'switch'; name: string; what: string; kinds: Part['kind'][]; icon: Part['kind'] }
export const ROLES: PartRole[] = [
  { id: 'source', name: 'Energy source', what: 'Gives the charge its energy. A battery or cell.', kinds: ['battery'], icon: 'battery' },
  { id: 'path', name: 'Conducting path', what: 'Wires. They must make a complete loop, with no gaps.', kinds: ['wire'], icon: 'wire' },
  { id: 'load', name: 'Load', what: 'Changes electrical energy into light and heat. A globe or resistor.', kinds: ['globe', 'resistor'], icon: 'globe' },
  { id: 'switch', name: 'Switch', what: 'Opens or closes the loop. Open means a gap, so the current stops.', kinds: ['switch'], icon: 'switch' },
];
