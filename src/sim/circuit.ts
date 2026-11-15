// DC circuit solver: nodal analysis, one connected island at a time. Pure; no DOM, no three.
import type { Circuit, Part, PartResult, Solution } from '../types';

export const WIRE_OHMS = 1e-4;
export const AMMETER_OHMS = 1e-4;
export const VOLTMETER_OHMS = 1e7;
export const BATTERY_RINT = 0.005;
/** battery current above this is treated as a short circuit */
export const SHORT_LIMIT_A = 10;
/** a globe above this multiple of its rated power is overloaded */
export const BLOW_FACTOR = 1.5;

/** resistance of a part in ohms, or Infinity if it does not conduct. A battery returns its internal resistance. */
export function resistanceOf(p: Part): number {
  switch (p.kind) {
    case 'wire': return WIRE_OHMS;
    case 'ammeter': return AMMETER_OHMS;
    case 'voltmeter': return VOLTMETER_OHMS;
    case 'switch': return p.closed ? WIRE_OHMS : Infinity;
    case 'resistor': return Math.max(p.resistance ?? 10, 1e-6);
    case 'globe': {
      if (p.blown) return Infinity;
      const v = p.ratedV ?? 6, w = p.ratedW ?? 3;
      return (v * v) / w;
    }
    case 'battery': return Math.max(p.rInt ?? BATTERY_RINT, 1e-6);
  }
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-300) return null;
    if (piv !== c) { [A[piv], A[c]] = [A[c], A[piv]]; [b[piv], b[c]] = [b[c], b[piv]]; }
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

export function solve(circuit: Circuit): Solution {
  const sol: Solution = { status: 'ok', node: {}, parts: {}, shorted: [], overloaded: [], live: false };
  const parts = circuit.parts;
  // union-find over conducting parts (a part joining a node to itself conducts nothing useful)
  const parent = new Map<number, number>();
  const find = (x: number): number => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const p of parts) { if (!parent.has(p.a)) parent.set(p.a, p.a); if (!parent.has(p.b)) parent.set(p.b, p.b); }
  const conducting = parts.filter((p) => p.a !== p.b && Number.isFinite(resistanceOf(p)));
  for (const p of conducting) parent.set(find(p.a), find(p.b));

  const islands = new Map<number, number[]>();
  for (const n of parent.keys()) { const r = find(n); if (!islands.has(r)) islands.set(r, []); islands.get(r)!.push(n); }

  for (const [root, nodes] of islands) {
    const mine = conducting.filter((p) => find(p.a) === root);
    if (!mine.some((p) => p.kind === 'battery' && (p.emf ?? 0) !== 0) || nodes.length < 2) {
      for (const n of nodes) sol.node[n] = 0;
      continue;
    }
    nodes.sort((x, y) => x - y);
    // ground nodes[0]; unknowns are the rest
    const idx = new Map<number, number>();
    nodes.slice(1).forEach((n, i) => idx.set(n, i));
    const N = nodes.length - 1;
    const A = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    const rhs = new Array<number>(N).fill(0);
    for (const p of mine) {
      const g = 1 / resistanceOf(p);
      const ia = idx.get(p.a), ib = idx.get(p.b);
      if (ia !== undefined) A[ia][ia] += g;
      if (ib !== undefined) A[ib][ib] += g;
      if (ia !== undefined && ib !== undefined) { A[ia][ib] -= g; A[ib][ia] -= g; }
      if (p.kind === 'battery') {
        // Norton equivalent: current source emf*g pushing conventional current from a (−) to b (+) inside the battery
        const j = (p.emf ?? 0) * g;
        if (ia !== undefined) rhs[ia] -= j;
        if (ib !== undefined) rhs[ib] += j;
      }
    }
    const x = solveLinear(A, rhs);
    if (!x || x.some((v) => !Number.isFinite(v))) { sol.status = 'invalid'; for (const n of nodes) sol.node[n] = 0; continue; }
    let min = 0;
    for (const v of x) if (v < min) min = v;
    sol.node[nodes[0]] = 0 - min;
    nodes.slice(1).forEach((n, i) => { sol.node[n] = x[i] - min; });
  }

  for (const p of parts) {
    const va = sol.node[p.a] ?? 0, vb = sol.node[p.b] ?? 0;
    const drop = va - vb;
    const r = resistanceOf(p);
    let res: PartResult;
    if (p.a === p.b || !Number.isFinite(r) || sol.status === 'invalid') res = { current: 0, drop: sol.status === 'invalid' ? 0 : drop, power: 0 };
    else if (p.kind === 'battery') {
      const current = ((p.emf ?? 0) + drop) / r; // (emf − (Vb − Va)) / rInt
      res = { current, drop, power: (p.emf ?? 0) * current };
      if (Math.abs(current) > SHORT_LIMIT_A) sol.shorted.push(p.id);
    } else {
      const current = drop / r;
      res = { current, drop, power: drop * current };
      if (p.kind === 'globe' && res.power > BLOW_FACTOR * (p.ratedW ?? 3)) sol.overloaded.push(p.id);
    }
    if (Math.abs(res.current) > 1e-6) sol.live = true;
    sol.parts[p.id] = res;
  }
  return sol;
}

/** what a meter part displays: amps for an ammeter (signed a→b), volts for a voltmeter (V(b) − V(a), i.e. positive when lead b is on the higher potential) */
export function meterReading(p: Part, sol: Solution): number {
  const r = sol.parts[p.id];
  if (!r || sol.status !== 'ok') return NaN;
  return p.kind === 'ammeter' ? r.current : -r.drop;
}
