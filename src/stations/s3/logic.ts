// Station 3 pure logic: the two measurement scenes, the results-table rows and the "ammeter measures only B" validator.
// No DOM, no three. `P` is the bench's postId(col, row).
import type { Part, Solution } from '../../types';
import { meterReading } from '../../sim/circuit';
import { edgeKey } from '../../bench/grid';

export type Scene = 'series' | 'parallel';
export type PostFn = (col: number, row: number) => number;

export interface Site { key: string; label: string; a: number; b: number }
export interface Row { key: string; label: string; kind: 'I' | 'V'; site?: string; across?: [number, number] }

/** meter points: the three edges in each scene where a part (wire or ammeter) can sit */
export function sitesOf(scene: Scene, P: PostFn): Site[] {
  return scene === 'series'
    ? [
      { key: 'A', label: 'point A (next to the battery)', a: P(2, 2), b: P(3, 2) },
      { key: 'B', label: 'point B (between R1 and R2)', a: P(3, 1), b: P(2, 1) },
      { key: 'C', label: 'point C (back to the battery)', a: P(1, 1), b: P(1, 2) },
    ]
    : [
      { key: 'M', label: 'the main line', a: P(2, 3), b: P(3, 3) },
      { key: 'A', label: "globe A's branch", a: P(2, 1), b: P(2, 0) },
      { key: 'B', label: "globe B's branch", a: P(3, 1), b: P(3, 0) },
    ];
}

export function rowsOf(scene: Scene, P: PostFn): Row[] {
  if (scene === 'series') {
    return [
      { key: 'iA', label: 'Current at A', kind: 'I', site: 'A' },
      { key: 'iB', label: 'Current at B', kind: 'I', site: 'B' },
      { key: 'iC', label: 'Current at C', kind: 'I', site: 'C' },
      { key: 'vR1', label: 'Voltage across R1', kind: 'V', across: [P(3, 2), P(3, 1)] },
      { key: 'vR2', label: 'Voltage across R2', kind: 'V', across: [P(2, 1), P(1, 1)] },
      { key: 'vS', label: 'Voltage across the battery', kind: 'V', across: [P(1, 2), P(2, 2)] },
    ];
  }
  return [
    { key: 'iM', label: 'Current in the main line', kind: 'I', site: 'M' },
    { key: 'iA', label: 'Current in branch A', kind: 'I', site: 'A' },
    { key: 'iB', label: 'Current in branch B', kind: 'I', site: 'B' },
    { key: 'vA', label: 'Voltage across globe A', kind: 'V', across: [P(2, 2), P(2, 1)] },
    { key: 'vB', label: 'Voltage across globe B', kind: 'V', across: [P(3, 2), P(3, 1)] },
    { key: 'vS', label: 'Voltage across the battery', kind: 'V', across: [P(1, 3), P(2, 3)] },
  ];
}

export interface SeriesOpts { r1?: number; r2?: number; emf?: number; open?: string[]; ammeters?: string[]; voltmeters?: ('R1' | 'R2' | 'S')[] }

function siteParts(scene: Scene, P: PostFn, open: string[], ammeters: string[]): Part[] {
  const out: Part[] = [];
  for (const s of sitesOf(scene, P)) {
    if (ammeters.includes(s.key)) out.push({ id: `m${s.key}`, kind: 'ammeter', a: s.a, b: s.b });
    else if (!open.includes(s.key)) out.push({ id: `w${s.key}`, kind: 'wire', a: s.a, b: s.b });
  }
  return out;
}

/** series loop: battery, R1, R2 and three meter points. Open points have no part at all (a real gap). */
export function seriesParts(P: PostFn, o: SeriesOpts = {}): Part[] {
  const parts: Part[] = [
    { id: 'B', kind: 'battery', a: P(1, 2), b: P(2, 2), emf: o.emf ?? 6, locked: true },
    { id: 'R1', kind: 'resistor', a: P(3, 2), b: P(3, 1), resistance: o.r1 ?? 10, label: 'R1', locked: true },
    { id: 'R2', kind: 'resistor', a: P(2, 1), b: P(1, 1), resistance: o.r2 ?? 20, label: 'R2', locked: true },
    ...siteParts('series', P, o.open ?? [], o.ammeters ?? []),
  ];
  const vm: Record<string, [number, number]> = { R1: [P(3, 1), P(3, 2)], R2: [P(1, 1), P(2, 1)], S: [P(1, 2), P(2, 2)] };
  for (const v of o.voltmeters ?? []) parts.push({ id: `v${v}`, kind: 'voltmeter', a: vm[v][0], b: vm[v][1] });
  return parts;
}

export interface ParallelOpts { open?: string[]; ammeters?: string[]; voltmeters?: ('A' | 'B' | 'S')[] }

/** parallel scene: 6 V battery, globe A (12 ohm) and globe B (24 ohm) on two branches, three meter points. */
export function parallelParts(P: PostFn, o: ParallelOpts = {}): Part[] {
  const parts: Part[] = [
    { id: 'B', kind: 'battery', a: P(1, 3), b: P(2, 3), emf: 6, locked: true },
    { id: 'GA', kind: 'globe', ratedV: 6, ratedW: 3, a: P(2, 2), b: P(2, 1), label: 'A', locked: true },
    { id: 'GB', kind: 'globe', ratedV: 6, ratedW: 1.5, a: P(3, 2), b: P(3, 1), label: 'B', locked: true },
    { id: 'j1', kind: 'wire', a: P(3, 3), b: P(3, 2) },
    { id: 'j2', kind: 'wire', a: P(3, 2), b: P(2, 2) },
    { id: 'j3', kind: 'wire', a: P(2, 0), b: P(3, 0) },
    { id: 'j4', kind: 'wire', a: P(1, 0), b: P(2, 0) },
    { id: 'j5', kind: 'wire', a: P(1, 0), b: P(1, 1) },
    { id: 'j6', kind: 'wire', a: P(1, 1), b: P(1, 2) },
    { id: 'j7', kind: 'wire', a: P(1, 2), b: P(1, 3) },
    ...siteParts('parallel', P, o.open ?? [], o.ammeters ?? []),
  ];
  const vm: Record<string, [number, number]> = { A: [P(2, 1), P(2, 2)], B: [P(3, 1), P(3, 2)], S: [P(1, 3), P(2, 3)] };
  for (const v of o.voltmeters ?? []) parts.push({ id: `v${v}`, kind: 'voltmeter', a: vm[v][0], b: vm[v][1] });
  return parts;
}

/** union-find over parts that are just a conductor (wire, ammeter, closed switch): posts in one class are the same electrical point */
export function pointClasses(parts: Part[]): (post: number) => number {
  const parent = new Map<number, number>();
  const find = (x: number): number => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const p of parts) if (p.kind === 'wire' || p.kind === 'ammeter' || (p.kind === 'switch' && p.closed)) parent.set(find(p.a), find(p.b));
  return find;
}

/** live value for each table row, or null if no suitable meter is in place or the circuit is not running */
export function liveReadings(scene: Scene, parts: Part[], sol: Solution, P: PostFn): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const cls = pointClasses(parts);
  const sites = sitesOf(scene, P);
  for (const row of rowsOf(scene, P)) {
    out[row.key] = null;
    if (sol.status !== 'ok' || !sol.live) continue;
    if (row.kind === 'I') {
      const s = sites.find((x) => x.key === row.site)!;
      const m = parts.find((p) => p.kind === 'ammeter' && edgeKey(p.a, p.b) === edgeKey(s.a, s.b));
      if (m) out[row.key] = Math.abs(meterReading(m, sol));
    } else {
      const [x, y] = row.across!;
      const cx = cls(x), cy = cls(y);
      const m = parts.find((p) => {
        if (p.kind !== 'voltmeter') return false;
        const pa = cls(p.a), pb = cls(p.b);
        return pa !== pb && ((pa === cx && pb === cy) || (pa === cy && pb === cx));
      });
      if (m) out[row.key] = Math.abs(meterReading(m, sol));
    }
  }
  return out;
}

export const fmt2 = (x: number): string => x.toFixed(2);

export interface SumLine { text: string; ok: boolean }

/** the "what do you notice" lines under the table, built only from recorded values */
export function summaryLines(scene: Scene, rec: Record<string, number | undefined>): SumLine[] {
  const out: SumLine[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b), 0.05);
  if (scene === 'series') {
    const cs = ['iA', 'iB', 'iC'].filter((k) => rec[k] !== undefined).map((k) => rec[k]!);
    if (cs.length >= 2) out.push({ text: `Current: ${cs.map((c) => `${fmt2(c)} A`).join(', ')}. ${cs.every((c) => near(c, cs[0])) ? 'The same everywhere in the loop.' : 'These should match.'}`, ok: cs.every((c) => near(c, cs[0])) });
    if (rec.vR1 !== undefined && rec.vR2 !== undefined) {
      const sum = rec.vR1 + rec.vR2;
      const s = rec.vS;
      out.push({ text: `${fmt2(rec.vR1)} V + ${fmt2(rec.vR2)} V = ${fmt2(sum)} V${s !== undefined ? ` (battery: ${fmt2(s)} V)` : ''}. The voltages add up to the supply.`, ok: s === undefined || near(sum, s) });
    }
  } else {
    if (rec.vA !== undefined && rec.vB !== undefined) {
      out.push({ text: `Voltage across A: ${fmt2(rec.vA)} V. Across B: ${fmt2(rec.vB)} V${rec.vS !== undefined ? `. Battery: ${fmt2(rec.vS)} V` : ''}. The same across each branch.`, ok: near(rec.vA, rec.vB) });
    }
    if (rec.iA !== undefined && rec.iB !== undefined && rec.iM !== undefined) {
      const sum = rec.iA + rec.iB;
      out.push({ text: `${fmt2(rec.iA)} A + ${fmt2(rec.iB)} A = ${fmt2(sum)} A. The main line carries ${fmt2(rec.iM)} A. The branch currents add up to the total.`, ok: near(sum, rec.iM) });
    }
  }
  return out;
}

export interface OnlyBResult { ok: boolean; why: string }

/** Check (c): is there an ammeter that measures ONLY globe B's current? It must read B's current, and differ from the total
 *  (so it is not in the main line), with both globes running. Globe ids and battery id are 'GB', 'GA', 'B'. */
export function measuresOnlyB(parts: Part[], sol: Solution): OnlyBResult {
  if (sol.status !== 'ok') return { ok: false, why: 'The circuit cannot be read.' };
  const iA = Math.abs(sol.parts.GA?.current ?? 0), iB = Math.abs(sol.parts.GB?.current ?? 0), total = Math.abs(sol.parts.B?.current ?? 0);
  if (iA < 0.01 || iB < 0.01) return { ok: false, why: 'Both globes must be lit. Close every gap with a wire or the ammeter.' };
  const ammeters = parts.filter((p) => p.kind === 'ammeter');
  if (!ammeters.length) return { ok: false, why: 'No ammeter placed yet.' };
  let sawTotal = false, sawA = false;
  for (const m of ammeters) {
    const r = Math.abs(meterReading(m, sol));
    if (Math.abs(r - total) <= 0.02 * total + 1e-6) { sawTotal = true; continue; }
    if (Math.abs(r - iA) <= 0.02 * iA + 1e-6 && Math.abs(iA - iB) > 0.05 * iA) { sawA = true; continue; }
    if (Math.abs(r - iB) <= 0.02 * iB + 1e-6) return { ok: true, why: 'This ammeter is in series with globe B only.' };
  }
  if (sawTotal) return { ok: false, why: 'That ammeter reads the total current, so it is in the main line. Put it in the branch with globe B.' };
  if (sawA) return { ok: false, why: "That ammeter reads globe A's current. Put it in globe B's branch." };
  return { ok: false, why: "The ammeter reading does not match globe B's current yet." };
}

/** current (A) through a part from the solver, always positive */
export const currentOf = (sol: Solution, id: string): number => Math.abs(sol.parts[id]?.current ?? 0);
export const dropOf = (sol: Solution, id: string): number => Math.abs(sol.parts[id]?.drop ?? 0);
