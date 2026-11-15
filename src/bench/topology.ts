// Circuit topology comparison (pure). Two part lists are the same circuit when, after collapsing every
// wire-connected group of posts into one net, the same kinds of parts join the same nets.
// Battery polarity matters (a = negative, b = positive); grid position, switch state and values do not.
import type { Part, PartKind } from '../types';

type Lite = Pick<Part, 'kind' | 'a' | 'b'>;

interface Graph {
  nets: number;
  /** key `${kind}|${i}|${j}` → count; undirected kinds have i ≤ j, batteries are directed (neg → pos) */
  edges: Map<string, number>;
  degree: number[];
  /** per net: sorted signature of incident edge kinds, for pruning */
  sig: string[];
}

function build(parts: Lite[]): Graph {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const p of parts) { find(p.a); find(p.b); }
  for (const p of parts) if (p.kind === 'wire') parent.set(find(p.a), find(p.b));
  const comps = parts.filter((p) => p.kind !== 'wire');
  const netIndex = new Map<number, number>();
  const net = (post: number): number => {
    const r = find(post);
    if (!netIndex.has(r)) netIndex.set(r, netIndex.size);
    return netIndex.get(r)!;
  };
  const edges = new Map<string, number>();
  const incident: string[][] = [];
  const touch = (n: number, s: string) => { (incident[n] ??= []).push(s); };
  for (const p of comps) {
    let i = net(p.a), j = net(p.b);
    const directed = p.kind === 'battery';
    if (!directed && i > j) [i, j] = [j, i];
    const k = `${p.kind}|${i}|${j}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
    if (directed) { touch(net(p.a), `${p.kind}-`); touch(net(p.b), `${p.kind}+`); }
    else if (i === j) touch(i, `${p.kind}o`);
    else { touch(i, p.kind); touch(j, p.kind); }
  }
  const n = netIndex.size;
  const sig: string[] = [], degree: number[] = [];
  for (let i = 0; i < n; i++) { const s = (incident[i] ?? []).sort(); sig.push(s.join(',')); degree.push(s.length); }
  return { nets: n, edges, degree, sig };
}

const KINDS: PartKind[] = ['battery', 'switch', 'globe', 'resistor', 'ammeter', 'voltmeter'];

function count(g: Graph, kind: PartKind, i: number, j: number): number {
  if (kind !== 'battery' && i > j) [i, j] = [j, i];
  return g.edges.get(`${kind}|${i}|${j}`) ?? 0;
}

export function sameTopology(a: Lite[], b: Lite[]): boolean {
  const A = build(a), B = build(b);
  if (A.nets !== B.nets) return false;
  // edge multisets by kind must agree before we search
  const tally = (g: Graph) => { const m = new Map<string, number>(); for (const [k, c] of g.edges) { const kind = k.split('|')[0]; m.set(kind, (m.get(kind) ?? 0) + c); } return m; };
  const ta = tally(A), tb = tally(B);
  if (ta.size !== tb.size) return false;
  for (const [k, c] of ta) if (tb.get(k) !== c) return false;
  if (A.sig.slice().sort().join(';') !== B.sig.slice().sort().join(';')) return false;

  const n = A.nets;
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => A.degree[y] - A.degree[x]);
  const map = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);
  const assigned: number[] = [];

  const consistent = (ai: number, bi: number): boolean => {
    for (const aj of [...assigned, ai]) {
      const bj = aj === ai ? bi : map[aj];
      for (const k of KINDS) {
        if (count(A, k, ai, aj) !== count(B, k, bi, bj)) return false;
        if (k === 'battery' && count(A, k, aj, ai) !== count(B, k, bj, bi)) return false;
      }
    }
    return true;
  };

  const go = (d: number): boolean => {
    if (d === n) return true;
    const ai = order[d];
    for (let bi = 0; bi < n; bi++) {
      if (used[bi] || A.sig[ai] !== B.sig[bi]) continue;
      if (!consistent(ai, bi)) continue;
      map[ai] = bi; used[bi] = true; assigned.push(ai);
      if (go(d + 1)) return true;
      assigned.pop(); used[bi] = false; map[ai] = -1;
    }
    return false;
  };
  return go(0);
}
