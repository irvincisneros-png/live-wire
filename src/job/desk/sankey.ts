// A small SVG Sankey diagram for Job 5. Layout is pure (testable); the drawing function builds SVG.
import type { SolarSankey } from '../../sim/solar';
import { s } from '../../ui/dom';

export interface SNode { name: string; col: 0 | 1 | 2; kWh: number; x: number; y: number; h: number; colour: string }
export interface SLink { from: string; to: string; kWh: number; width: number; y0: number; y1: number; x0: number; x1: number; colour: string }
export interface SLayout { nodes: SNode[]; links: SLink[]; scale: number; width: number; height: number }

const COL: Record<string, 0 | 1 | 2> = { 'Solar panels': 0, 'Grid import': 0, Battery: 1, House: 2, 'Grid export': 2, 'Lost as heat': 2, 'Left in battery': 2 };
const COLOUR: Record<string, string> = {
  'Solar panels': '#f0b429', 'Grid import': '#5ea8ff', Battery: '#2fd6b4', House: '#e9e6dc', 'Grid export': '#b58cff', 'Lost as heat': '#ff7a59', 'Left in battery': '#1f9e84',
};
const NODE_W = 12;
const GAP = 10;
const MIN_H = 3;

/** Work out node boxes and link ribbons for a width and height (in SVG units). Each link is exactly `kWh × scale` thick. */
export function sankeyLayout(sk: SolarSankey, width: number, height: number, margin = { l: 96, r: 96 }): SLayout {
  const nodes: SNode[] = sk.nodes.map((name) => {
    const out = sk.flows.filter((f) => f.from === name).reduce((a, f) => a + f.kWh, 0);
    const inn = sk.flows.filter((f) => f.to === name).reduce((a, f) => a + f.kWh, 0);
    return { name, col: COL[name] ?? 1, kWh: Math.max(out, inn), x: 0, y: 0, h: 0, colour: COLOUR[name] ?? '#999' };
  });
  const cols: SNode[][] = [[], [], []];
  for (const n of nodes) cols[n.col].push(n);
  // one scale for the whole diagram: the tallest column fits
  let scale = Infinity;
  for (const c of cols) {
    if (!c.length) continue;
    const total = c.reduce((a, n) => a + n.kWh, 0);
    const avail = height - GAP * (c.length - 1) - MIN_H * c.filter((n) => n.kWh * 1e-9 === 0 || n.kWh < 1e-6).length;
    if (total > 0) scale = Math.min(scale, avail / total);
  }
  if (!Number.isFinite(scale)) scale = 1;
  const xs = [margin.l, margin.l + (width - margin.l - margin.r - NODE_W) / 2, width - margin.r - NODE_W];
  cols.forEach((c, ci) => {
    c.forEach((n) => { n.h = Math.max(MIN_H, n.kWh * scale); n.x = xs[ci]; });
    const used = c.reduce((a, n) => a + n.h, 0) + GAP * (c.length - 1);
    let y = Math.max(0, (height - used) / 2);
    for (const n of c) { n.y = y; y += n.h + GAP; }
  });
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const outOff = new Map<string, number>(), inOff = new Map<string, number>();
  const links: SLink[] = [];
  const order = (a: string, b: string) => (byName.get(a)!.y - byName.get(b)!.y);
  const sorted = sk.flows.slice().sort((a, b) => order(a.to, b.to) || order(a.from, b.from));
  const bySource = new Map<string, typeof sorted>();
  for (const f of sorted) { if (!bySource.has(f.from)) bySource.set(f.from, []); bySource.get(f.from)!.push(f); }
  const placed: { f: (typeof sorted)[number]; y0: number }[] = [];
  for (const [from, fl] of bySource) {
    const n = byName.get(from)!;
    let o = outOff.get(from) ?? 0;
    for (const f of fl) { placed.push({ f, y0: n.y + o }); o += f.kWh * scale; }
    outOff.set(from, o);
  }
  const byTarget = new Map<string, typeof placed>();
  for (const p of placed.slice().sort((a, b) => order(a.f.from, b.f.from))) { if (!byTarget.has(p.f.to)) byTarget.set(p.f.to, []); byTarget.get(p.f.to)!.push(p); }
  const y1Of = new Map<(typeof sorted)[number], number>();
  for (const [to, ps] of byTarget) {
    const n = byName.get(to)!;
    let o = inOff.get(to) ?? 0;
    for (const p of ps) { y1Of.set(p.f, n.y + o); o += p.f.kWh * scale; }
    inOff.set(to, o);
  }
  for (const p of placed) {
    const a = byName.get(p.f.from)!, b = byName.get(p.f.to)!;
    links.push({ from: p.f.from, to: p.f.to, kWh: p.f.kWh, width: p.f.kWh * scale, y0: p.y0, y1: y1Of.get(p.f)!, x0: a.x + NODE_W, x1: b.x, colour: a.colour });
  }
  return { nodes, links, scale, width, height };
}

const fmtK = (x: number) => `${x.toFixed(1)} kWh`;

export function sankeySvg(sk: SolarSankey): SVGSVGElement {
  const W = 470, H = 272;
  const lay = sankeyLayout(sk, W, H);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'j5-sankey', role: 'img', 'aria-label': 'Sankey diagram of where every kilowatt hour went. The numbers are listed in the table below.' });
  for (const l of lay.links) {
    if (l.width < 0.05) continue;
    const mid = (l.x0 + l.x1) / 2;
    const d = `M ${l.x0} ${l.y0 + l.width / 2} C ${mid} ${l.y0 + l.width / 2}, ${mid} ${l.y1 + l.width / 2}, ${l.x1} ${l.y1 + l.width / 2}`;
    svg.appendChild(s('path', { d, fill: 'none', stroke: l.colour, 'stroke-width': Math.max(0.6, l.width), opacity: 0.5 }, s('title', null, `${l.from} to ${l.to}: ${fmtK(l.kWh)}`)));
  }
  // label heights: keep labels in a column at least 28 apart so tiny nodes stay readable
  const labelY = new Map<string, number>();
  for (const col of [0, 1, 2]) {
    const ns = lay.nodes.filter((n) => n.col === col).sort((p, q) => p.y - q.y);
    let prev = -Infinity;
    for (const n of ns) { const y = Math.max(n.y + n.h / 2, prev + 27); labelY.set(n.name, y); prev = y; }
    const over = prev - (H - 16);
    if (over > 0) for (const n of ns) labelY.set(n.name, labelY.get(n.name)! - over);
  }
  for (const n of lay.nodes) {
    svg.appendChild(s('rect', { x: n.x, y: n.y, width: NODE_W, height: n.h, rx: 3, fill: n.colour, stroke: '#0d0e10', 'stroke-width': 0.8 }));
    const left = n.col === 0;
    const tx = left ? n.x - 6 : n.x + NODE_W + 6;
    const ty = labelY.get(n.name)!;
    svg.append(
      s('text', { x: tx, y: ty - 2, 'text-anchor': left ? 'end' : 'start', class: 'j5-s-name' }, n.name),
      s('text', { x: tx, y: ty + 12, 'text-anchor': left ? 'end' : 'start', class: 'j5-s-val' }, fmtK(n.kWh)));
  }
  return svg;
}
