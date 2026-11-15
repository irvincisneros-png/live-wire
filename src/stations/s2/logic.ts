// Station 2 (Build and draw): pure logic. No DOM, no three. Posts use the default 5 x 4 bench grid.
import type { Part, PartKind } from '../../types';
import { solve } from '../../sim/circuit';
import { sameTopology } from '../../bench/topology';

export const COLS = 5;
export const ROWS = 4;
export const P = (col: number, row: number): number => row * COLS + col;

type Lite = Pick<Part, 'kind' | 'a' | 'b'>;
const GLOBE = { kind: 'globe' as const, ratedV: 6, ratedW: 3 };

// ───────────────────────────── targets ─────────────────────────────

/** series: battery, switch and two globes in one loop */
export const SERIES_TARGET: Part[] = [
  { id: 'b', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 },
  { id: 'w1', kind: 'wire', a: P(2, 2), b: P(3, 2) },
  { id: 's', kind: 'switch', a: P(3, 2), b: P(3, 1), closed: true },
  { id: 'g1', ...GLOBE, a: P(3, 1), b: P(2, 1) },
  { id: 'g2', ...GLOBE, a: P(2, 1), b: P(1, 1) },
  { id: 'w2', kind: 'wire', a: P(1, 1), b: P(1, 2) },
];

/** parallel: two globes, each on its own branch across the battery */
export const PARALLEL_TARGET: Part[] = [
  { id: 'b', kind: 'battery', a: P(1, 2), b: P(1, 1), emf: 6 },
  { id: 'w1', kind: 'wire', a: P(1, 1), b: P(2, 1) },
  { id: 'w2', kind: 'wire', a: P(2, 1), b: P(3, 1) },
  { id: 'g1', ...GLOBE, a: P(2, 1), b: P(2, 2) },
  { id: 'g2', ...GLOBE, a: P(3, 1), b: P(3, 2) },
  { id: 'w3', kind: 'wire', a: P(1, 2), b: P(2, 2) },
  { id: 'w4', kind: 'wire', a: P(2, 2), b: P(3, 2) },
];

/** the read-only circuit the student draws: battery, switch, globe, resistor in series (all locked) */
export const DRAW_CIRCUIT: Part[] = ([
  { id: 'b', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: 6 },
  { id: 'w1', kind: 'wire', a: P(2, 2), b: P(3, 2) },
  { id: 's', kind: 'switch', a: P(3, 2), b: P(3, 1), closed: true },
  { id: 'g', ...GLOBE, a: P(3, 1), b: P(2, 1) },
  { id: 'r', kind: 'resistor', a: P(2, 1), b: P(1, 1), resistance: 22 },
  { id: 'w2', kind: 'wire', a: P(1, 1), b: P(1, 2) },
] as Part[]).map((p) => ({ ...p, locked: true }));

// ───────────────────────────── same circuit? ─────────────────────────────

/**
 * If every part is in ONE loop (every net has exactly two part ends, nothing branches), the sorted kinds in that loop; else null.
 * The bench's `sameTopology` is order sensitive: battery, switch, lamp and lamp, battery, switch are different rings to it.
 * In a series loop the order does not change how the circuit behaves, so for loops we compare the parts only.
 */
export function seriesLoopKinds(parts: Lite[]): string[] | null {
  const parent = new Map<number, number>();
  const find = (x: number): number => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const p of parts) { find(p.a); find(p.b); }
  for (const p of parts) if (p.kind === 'wire') parent.set(find(p.a), find(p.b));
  const comps = parts.filter((p) => p.kind !== 'wire');
  if (comps.length < 2 || comps.some((p) => p.kind === 'voltmeter' || find(p.a) === find(p.b))) return null;
  const degree = new Map<number, number>();
  for (const p of comps) for (const n of [find(p.a), find(p.b)]) degree.set(n, (degree.get(n) ?? 0) + 1);
  if ([...degree.values()].some((d) => d !== 2)) return null;
  // one loop, not two separate ones: walk it
  const seen = new Set<Lite>();
  const start = comps[0];
  let node = find(start.b);
  seen.add(start);
  for (;;) {
    const next = comps.find((p) => !seen.has(p) && (find(p.a) === node || find(p.b) === node));
    if (!next) break;
    seen.add(next);
    node = find(next.a) === node ? find(next.b) : find(next.a);
  }
  if (seen.size !== comps.length) return null;
  return comps.map((p) => p.kind).sort();
}

/** the same circuit: same topology, or the same parts in a single series loop (in any order) */
export function sameCircuit(a: Lite[], b: Lite[]): boolean {
  if (sameTopology(a, b)) return true;
  const ka = seriesLoopKinds(a), kb = seriesLoopKinds(b);
  return !!ka && !!kb && ka.join() === kb.join();
}

// ───────────────────────────── checking a build ─────────────────────────────

/** every globe lit (power above 5 % of rated) and at least one globe */
export function allGlobesLit(parts: Part[]): boolean {
  const sol = solve({ parts });
  if (sol.status !== 'ok') return false;
  const globes = parts.filter((p) => p.kind === 'globe');
  return globes.length > 0 && globes.every((p) => !p.blown && (sol.parts[p.id]?.power ?? 0) > 0.05 * (p.ratedW ?? 3));
}

/** the student's bench circuit is the target circuit, and it works */
export const buildPasses = (bench: Part[], target: Part[]): boolean => sameCircuit(bench, target) && allGlobesLit(bench);

/** the student's drawn diagram is the circuit on the bench */
export const drawPasses = (drawn: Lite[], circuit: Lite[]): boolean => drawn.length > 0 && sameCircuit(drawn, circuit);

// ───────────────────────────── feedback ─────────────────────────────

const ORDER: PartKind[] = ['battery', 'switch', 'globe', 'resistor', 'ammeter', 'voltmeter'];
const WORD: Record<string, [string, string]> = {
  battery: ['battery', 'batteries'], switch: ['switch', 'switches'], resistor: ['resistor', 'resistors'],
  ammeter: ['ammeter', 'ammeters'], voltmeter: ['voltmeter', 'voltmeters'],
};
const word = (kind: PartKind, n: number, globeWord: string): string => (kind === 'globe' ? (n === 1 ? globeWord : `${globeWord}s`) : WORD[kind][n === 1 ? 0 : 1]);

export function countKinds(parts: Lite[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of parts) if (p.kind !== 'wire') out[p.kind] = (out[p.kind] ?? 0) + 1;
  return out;
}

export interface FeedbackOpts {
  /** what the student made: 'diagram' or 'circuit' */
  mine: 'diagram' | 'circuit';
  /** the other thing it should match */
  other: 'diagram' | 'circuit';
}

/**
 * Specific feedback comparing the student's parts with the target.
 * Returns null when they are the same circuit. The globe is called a "lamp" in a diagram and a "globe" in a circuit.
 */
export function diagramFeedback(student: Lite[], target: Lite[], o: FeedbackOpts = { mine: 'diagram', other: 'circuit' }): string | null {
  if (sameCircuit(student, target)) return null;
  const s = countKinds(student), t = countKinds(target);
  const gw = (who: 'diagram' | 'circuit') => (who === 'diagram' ? 'lamp' : 'globe');
  if (Object.keys(s).length === 0) {
    return o.mine === 'diagram'
      ? 'Your diagram is empty. Tap a gap between two dots, then choose a symbol.'
      : 'Your circuit is empty. Pick a part in the tray and place it on a gap.';
  }
  for (const k of ORDER) {
    const n = s[k] ?? 0, m = t[k] ?? 0;
    if (n === m) continue;
    const mineText = n === 0 ? `no ${word(k, 1, gw(o.mine))}` : `${n} ${word(k, n, gw(o.mine))}`;
    // the other side's count, in the other side's word for a globe
    const theirText = m === 0 ? 'none' : String(m);
    return `Your ${o.mine} has ${mineText}. The ${o.other} has ${theirText}.`;
  }
  // same parts: is it the battery the wrong way round?
  const flip = (list: Lite[]): Lite[] => list.map((p) => (p.kind === 'battery' ? { ...p, a: p.b, b: p.a } : p));
  if (s.battery && sameCircuit(flip(student), target)) {
    return `The parts are right. Check which way the battery faces: the long thin line is the positive (+) end, and it should match the ${o.other}.`;
  }
  return 'The parts are right. Check how they are joined.';
}

// ───────────────────────────── symbol match ─────────────────────────────

export interface SymbolQuiz { kind: PartKind; options: { kind: PartKind; label: string }[]; correct: number }
export const SYMBOL_QUIZ: SymbolQuiz = {
  kind: 'globe',
  options: [
    { kind: 'globe', label: 'Lamp (globe)' },
    { kind: 'resistor', label: 'Resistor' },
    { kind: 'ammeter', label: 'Ammeter' },
    { kind: 'switch', label: 'Switch' },
  ],
  correct: 0,
};

// ───────────────────────────── diagram crop ─────────────────────────────

const S = 60, MARGIN = 34;
/** viewBox [x, y, w, h] framing the posts used, so a small picture is not mostly empty grid */
export function diagramCrop(parts: Pick<Part, 'a' | 'b'>[]): [number, number, number, number] {
  if (!parts.length) return [0, 0, MARGIN * 2 + (COLS - 1) * S, MARGIN * 2 + (ROWS - 1) * S];
  const xs: number[] = [], ys: number[] = [];
  for (const p of parts) for (const id of [p.a, p.b]) { xs.push(MARGIN + (id % COLS) * S); ys.push(MARGIN + Math.floor(id / COLS) * S); }
  const x0 = Math.min(...xs) - 36, x1 = Math.max(...xs) + 36, y0 = Math.min(...ys) - 38, y1 = Math.max(...ys) + 30;
  return [x0, y0, x1 - x0, y1 - y0];
}
