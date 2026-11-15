// Station 4 pure logic: the Ohm's law scene, V-I graph maths and check validators. No DOM, no three.
import type { Part } from '../../types';
import { edgeKey } from '../../bench/grid';
import { rng } from '../../sim/seed';

export type PostFn = (col: number, row: number) => number;

/** one recorded point: the group is which resistor it was measured on ("22", "mystery", "globe") */
export interface Pt { group: string; I: number; V: number }

export const RESISTORS = [10, 22, 33, 47, 100] as const;
export const MYSTERY_VALUES = [15, 27, 39, 56, 68] as const;

export function pickMystery(seed: number): number { return rng(seed).pick(MYSTERY_VALUES); }

/** Least-squares gradient of a line through the origin: sum(I*V) / sum(I*I). For ideal data V = I*R this is exactly R. */
export function fitThroughOrigin(pts: { I: number; V: number }[]): number | null {
  let siv = 0, sii = 0;
  for (const p of pts) { siv += p.I * p.V; sii += p.I * p.I; }
  return sii > 0 ? siv / sii : null;
}

/** V divided by I for one point (ohms), NaN if there is no current */
export const ratio = (p: { I: number; V: number }): number => (p.I > 0 ? p.V / p.I : NaN);

/** where the line V = g * I leaves the plot box [0, xmax] x [0, ymax] */
export function lineEnd(g: number, xmax: number, ymax: number): { x: number; y: number } {
  if (!(g > 0)) return { x: xmax, y: 0 };
  const xAtTop = ymax / g;
  return xAtTop <= xmax ? { x: xAtTop, y: ymax } : { x: xmax, y: g * xmax };
}

/** how many points sit at distinct voltages (at least `gap` volts apart) */
export function distinctVoltages(pts: { V: number }[], gap = 0.4): number {
  const vs = pts.map((p) => p.V).sort((a, b) => a - b);
  let n = 0, last = -Infinity;
  for (const v of vs) if (v - last >= gap) { n++; last = v; }
  return n;
}

/** check (a): at least four points on the mystery resistor, spread over at least three different voltages */
export function mysteryRecorded(pts: Pt[]): boolean {
  const m = pts.filter((p) => p.group === 'mystery');
  return m.length >= 4 && distinctVoltages(m) >= 3;
}

/** I = V / R */
export const ohmCurrent = (V: number, R: number): number => V / R;
/** V = I * R */
export const ohmVoltage = (I: number, R: number): number => I * R;

export const groupLabel = (g: string): string => (g === 'mystery' ? 'Mystery' : g === 'globe' ? 'Globe' : g === 'other' ? 'Other' : `${g} Ω`);

/** marker shape per group so lines are never told apart by colour alone */
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'star' | 'hex';
export function shapeOf(g: string): Shape {
  switch (g) {
    case '10': return 'circle';
    case '22': return 'square';
    case '33': return 'triangle';
    case '47': return 'diamond';
    case '100': return 'cross';
    case 'mystery': return 'star';
    default: return 'hex';
  }
}

/** which group does a voltmeter belong to: the resistor or globe it sits across (either lead order), else 'other' */
export function groupOf(parts: Part[], volt: Part): string {
  const k = edgeKey(volt.a, volt.b);
  const target = parts.find((p) => (p.kind === 'resistor' || p.kind === 'globe') && edgeKey(p.a, p.b) === k);
  if (!target) return 'other';
  if (target.kind === 'globe') return 'globe';
  return target.mystery ? 'mystery' : String(target.resistance ?? 0);
}

export interface OhmOpts {
  emf: number;
  R: number;
  mystery?: boolean;
  /** false replaces the ammeter with a plain wire (so the current is not shown) */
  ammeter?: boolean;
  voltmeter?: boolean;
}

/** The Ohm's law bench: adjustable supply PSU, ammeter A in series, resistor R, voltmeter V across R. */
export function ohmParts(P: PostFn, o: OhmOpts): Part[] {
  const parts: Part[] = [
    { id: 'PSU', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: o.emf },
    o.ammeter === false ? { id: 'A', kind: 'wire', a: P(2, 2), b: P(3, 2) } : { id: 'A', kind: 'ammeter', a: P(2, 2), b: P(3, 2) },
    { id: 'W1', kind: 'wire', a: P(3, 2), b: P(3, 1) },
    { id: 'R', kind: 'resistor', a: P(3, 1), b: P(2, 1), resistance: o.R, label: o.mystery ? undefined : 'R', mystery: o.mystery },
    { id: 'W2', kind: 'wire', a: P(2, 1), b: P(1, 1) },
    { id: 'W3', kind: 'wire', a: P(1, 1), b: P(1, 2) },
  ];
  if (o.voltmeter !== false) parts.push({ id: 'V', kind: 'voltmeter', a: P(2, 1), b: P(3, 1) });
  return parts;
}

/** plain-text V÷I to 3 significant figures */
export function sig3(x: number): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(x)));
  return x.toFixed(Math.max(0, 2 - mag));
}
