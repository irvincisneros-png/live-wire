// Circuit diagram (SVG) that mirrors the bench on the same grid with standard school symbols,
// the "draw it" diagram editor, and symbol icons for the tray. Strokes use currentColor.
import type { Part, PartKind } from '../types';
import { adjacent, allEdges, colRow, edgeKey, postName, type GridSize } from './grid';
import { sameTopology } from './topology';

export { sameTopology };

const NS = 'http://www.w3.org/2000/svg';
const S = 60, MARGIN = 34;

type DPart = Pick<Part, 'kind' | 'a' | 'b'> & Partial<Pick<Part, 'emf' | 'closed' | 'blown' | 'resistance' | 'mystery' | 'id' | 'label'>>;

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

const px = (g: GridSize, id: number): [number, number] => { const { col, row } = colRow(g, id); return [MARGIN + col * S, MARGIN + row * S]; };

/** SVG markup (local frame, terminals at x = ±30) for a two-terminal symbol */
export function symbolMarkup(kind: PartKind, o: { emf?: number; closed?: boolean; blown?: boolean; adjustable?: boolean } = {}): string {
  const L = (x1: number, y1: number, x2: number, y2: number, w = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`;
  switch (kind) {
    case 'wire': return L(-30, 0, 30, 0);
    case 'battery': {
      const multi = (o.emf ?? 1.5) > 1.6;
      // negative (short, thick) toward a (−x); positive (long, thin) toward b
      let s = multi ? L(-30, 0, -11, 0) + L(11, 0, 30, 0) : L(-30, 0, -4, 0) + L(4, 0, 30, 0);
      const cell = (x: number) => L(x - 3, -6, x - 3, 6, 4.5) + L(x + 4, -14, x + 4, 14, 2);
      s += multi ? cell(-7) + `<line x1="-3" y1="0" x2="3" y2="0" stroke-width="2" stroke-dasharray="2 2"/>` + cell(7) : cell(0);
      if (o.adjustable) s += L(-14, 14, 14, -14, 1.6) + `<path d="M14 -14 l-7 1 l6 6 z" fill="currentColor" stroke="none"/>`;
      return s;
    }
    case 'switch': {
      const blade = o.closed ? L(-12, 0, 12, 0) : L(-12, 0, 10, -13);
      return L(-30, 0, -12, 0) + L(12, 0, 30, 0) + blade + `<circle cx="-12" cy="0" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="0" r="2.6" fill="none" stroke-width="1.6"/>`;
    }
    case 'globe': {
      const r = 11, k = r * Math.SQRT1_2;
      return L(-30, 0, -r, 0) + L(r, 0, 30, 0) + `<circle cx="0" cy="0" r="${r}" fill="none" stroke-width="2"${o.blown ? ' stroke-dasharray="4 3"' : ''}/>` + L(-k, -k, k, k) + L(-k, k, k, -k);
    }
    case 'resistor': return L(-30, 0, -15, 0) + L(15, 0, 30, 0) + `<rect x="-15" y="-6" width="30" height="12" fill="none" stroke-width="2"/>`;
    case 'ammeter': case 'voltmeter':
      return L(-30, 0, -11, 0) + L(11, 0, 30, 0) + `<circle cx="0" cy="0" r="11" fill="none" stroke-width="2"/>`;
  }
}

/** a standalone icon (for the tray): symbol + meter letter, 64×32 viewBox */
export function symbolIcon(kind: PartKind, o: { emf?: number; closed?: boolean; adjustable?: boolean } = {}): string {
  const letter = kind === 'ammeter' ? 'A' : kind === 'voltmeter' ? 'V' : '';
  return `<svg viewBox="-32 -18 64 36" width="48" height="27" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-linecap="round">${symbolMarkup(kind, { closed: kind === 'switch' ? !!o.closed : undefined, emf: o.emf, adjustable: o.adjustable })}</g>${letter ? `<text x="0" y="4.5" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">${letter}</text>` : ''}</svg>`;
}

function drawGridDots(g: GridSize, parent: SVGGElement, used: Map<number, number>): void {
  for (let id = 0; id < g.cols * g.rows; id++) {
    const [x, y] = px(g, id), n = used.get(id) ?? 0;
    if (n >= 3) el('circle', { cx: x, cy: y, r: 4, fill: 'currentColor', class: 'lw-dg-junction' }, parent);
    else if (n === 0) el('circle', { cx: x, cy: y, r: 1.8, fill: 'currentColor', opacity: 0.22, class: 'lw-dg-post' }, parent);
  }
}

function drawParts(g: GridSize, parent: SVGGElement, parts: DPart[], adjustableId?: string | null): void {
  const used = new Map<number, number>();
  // centre of the drawn circuit, so voltmeters are drawn on the outside
  let cxs = 0, cys = 0, cn = 0;
  for (const p of parts) if (p.kind !== 'voltmeter') for (const id of [p.a, p.b]) { const [x, y] = px(g, id); cxs += x; cys += y; cn++; }
  const centre: [number, number] = cn ? [cxs / cn, cys / cn] : [0, 0];
  for (const p of parts) { used.set(p.a, (used.get(p.a) ?? 0) + 1); used.set(p.b, (used.get(p.b) ?? 0) + 1); }
  for (const p of parts) {
    const [ax, ay] = px(g, p.a), [bx, by] = px(g, p.b);
    const g2 = el('g', { class: `lw-dg-part lw-dg-${p.kind}`, 'data-part': p.id ?? '' }, parent);
    if (p.kind === 'voltmeter') {
      // drawn in parallel: thin leads out to a meter circle beside the two posts
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      let nx = -(by - ay), ny = bx - ax; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if (cn ? (mx - centre[0]) * nx + (my - centre[1]) * ny < 0 : ny > 0) { nx = -nx; ny = -ny; } // away from the circuit
      const off = adjacent(g, p.a, p.b) ? 24 : 18;
      const cx = mx + nx * off, cy = my + ny * off;
      const d = `M${ax} ${ay} L${ax + nx * off} ${ay + ny * off} L${cx} ${cy} M${bx} ${by} L${bx + nx * off} ${by + ny * off} L${cx} ${cy}`;
      el('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-dasharray': '0', opacity: 0.85 }, g2);
      el('circle', { cx, cy, r: 10, fill: 'var(--lw-diagram-bg, #fff)', stroke: 'currentColor', 'stroke-width': 2 }, g2);
      const t = el('text', { x: cx, y: cy + 4.5, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, fill: 'currentColor', stroke: 'none' }, g2);
      t.textContent = 'V';
      continue;
    }
    const len = Math.hypot(bx - ax, by - ay);
    const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    const inner = el('g', { transform: `translate(${(ax + bx) / 2} ${(ay + by) / 2}) rotate(${ang}) scale(${len / S} 1)`, fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round' }, g2);
    inner.innerHTML = symbolMarkup(p.kind, { emf: p.emf, closed: p.closed, blown: p.blown, adjustable: p.id !== undefined && p.id === adjustableId });
    const vertical = Math.abs(bx - ax) < 1;
    const lx = (ax + bx) / 2 + (vertical ? -24 : 0), ly = (ay + by) / 2 + (vertical ? 4 : -19);
    const label = p.kind === 'battery' ? `${+(p.emf ?? 0).toFixed(1)} V` : p.kind === 'resistor' ? (p.mystery ? '?' : `${p.resistance ?? 10} Ω`) : p.kind === 'ammeter' ? 'A' : '';
    if (p.kind === 'ammeter') {
      const t = el('text', { x: (ax + bx) / 2, y: (ay + by) / 2 + 4.5, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, fill: 'currentColor' }, g2);
      t.textContent = 'A';
    } else if (label) {
      const t = el('text', { x: lx, y: ly, 'text-anchor': vertical ? 'end' : 'middle', 'font-size': 10.5, 'font-weight': 600, fill: 'currentColor', opacity: 0.8 }, g2);
      t.textContent = label;
    }
  }
  drawGridDots(g, parent, used);
}

function makeSvg(g: GridSize, label: string): SVGSVGElement {
  const w = MARGIN * 2 + (g.cols - 1) * S, h = MARGIN * 2 + (g.rows - 1) * S;
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'lw-diagram', role: 'img', 'aria-label': label, 'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif' });
  svg.style.color = 'var(--lw-diagram-ink, currentColor)';
  const title = el('title', {}, svg); title.textContent = label;
  return svg;
}

/** a live diagram for the bench: call update(parts) after every change */
export function createDiagram(g: GridSize): { svg: SVGSVGElement; update(parts: Part[], adjustableId?: string | null): void } {
  const svg = makeSvg(g, 'Circuit diagram of the board');
  const layer = el('g', {}, svg);
  return {
    svg,
    update(parts, adjustableId) {
      layer.replaceChildren();
      drawParts(g, layer, parts, adjustableId);
      const n = parts.length;
      svg.setAttribute('aria-label', n ? `Circuit diagram: ${describe(g, parts)}` : 'Circuit diagram: the board is empty');
    },
  };
}

const NAMES: Record<PartKind, string> = { battery: 'battery', wire: 'wire', switch: 'switch', globe: 'globe', resistor: 'resistor', ammeter: 'ammeter', voltmeter: 'voltmeter' };
function describe(g: GridSize, parts: DPart[]): string {
  return parts.map((p) => `${NAMES[p.kind]} ${postName(g, p.a)} to ${postName(g, p.b)}`).join(', ');
}

// ───────────────────────────── the "draw it" editor ─────────────────────────────

export interface DiagramEditor {
  svg: SVGSVGElement;
  getParts(): Pick<Part, 'kind' | 'a' | 'b'>[];
  clear(): void;
  onChange(cb: () => void): () => void;
}

export function createDiagramEditor(opts: { cols: number; rows: number; symbols: PartKind[] }): DiagramEditor {
  const g: GridSize = { cols: opts.cols, rows: opts.rows };
  const svg = makeSvg(g, 'Blank circuit diagram. Choose a gap between two dots, then choose a symbol.');
  svg.classList.add('lw-diagram-editor');
  const layer = el('g', {}, svg);
  const hits = el('g', { class: 'lw-dg-hits' }, svg);
  const picker = el('g', { class: 'lw-dg-picker' }, svg);
  const onEdge = new Map<string, DPart>(); // non-voltmeter parts
  const vms = new Map<string, DPart>(); // voltmeters, one per edge
  const cbs = new Set<() => void>();
  let open: string | null = null;
  const edges = allEdges(g);
  const parts = (): DPart[] => [...onEdge.values(), ...vms.values()];
  const changed = () => { redraw(); for (const cb of [...cbs]) cb(); };
  const redraw = () => { layer.replaceChildren(); drawParts(g, layer, parts()); };

  for (const e of edges) {
    const [ax, ay] = px(g, e.a), [bx, by] = px(g, e.b);
    const r = el('rect', e.horizontal
      ? { x: ax + 8, y: ay - 16, width: bx - ax - 16, height: 32 }
      : { x: ax - 16, y: ay + 8, width: 32, height: by - ay - 16 }, hits);
    r.setAttribute('class', 'lw-dg-hit');
    r.setAttribute('rx', '8');
    r.setAttribute('tabindex', '0');
    r.setAttribute('role', 'button');
    r.setAttribute('aria-label', `Gap from ${postName(g, e.a)} to ${postName(g, e.b)}`);
    r.dataset.edge = e.key;
    const act = (ev: Event) => { ev.preventDefault(); showPicker(e.key, e.a, e.b); };
    r.addEventListener('click', act);
    r.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') act(ev); });
  }

  const closePicker = () => { picker.replaceChildren(); open = null; };
  function showPicker(key: string, a: number, b: number): void {
    if (open === key) { closePicker(); return; }
    closePicker(); open = key;
    const cur = onEdge.get(key);
    const choices: { k: string; label: string; markup: string }[] = opts.symbols.map((k) => ({ k, label: NAMES[k], markup: symbolMarkup(k, { closed: false }) + (k === 'ammeter' ? '<text x="0" y="4.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none">A</text>' : k === 'voltmeter' ? '<text x="0" y="4.5" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none">V</text>' : '') }));
    if (cur?.kind === 'battery') choices.push({ k: 'flip', label: 'flip the battery', markup: '<path d="M-14 -4 H12 l-5 -5 M14 4 H-12 l5 5" stroke-width="2" fill="none"/>' });
    if (cur || vms.has(key)) choices.push({ k: 'erase', label: 'erase', markup: '<path d="M-10 -10 L10 10 M10 -10 L-10 10" stroke-width="2.4"/>' });
    const [ax, ay] = px(g, a), [bx, by] = px(g, b);
    const vbW = MARGIN * 2 + (g.cols - 1) * S, vbH = MARGIN * 2 + (g.rows - 1) * S;
    const bw = 40, gap = 4, total = choices.length * (bw + gap) - gap;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const x0 = Math.min(vbW - total - 2, Math.max(2, mx - total / 2));
    const y0 = my + 22 + bw > vbH ? my - 22 - bw : my + 22;
    el('rect', { x: x0 - 4, y: y0 - 4, width: total + 8, height: bw + 8, rx: 10, class: 'lw-dg-picker-bg' }, picker);
    choices.forEach((c, i) => {
      const bx0 = x0 + i * (bw + gap);
      const btn = el('g', { class: 'lw-dg-choice', tabindex: 0, role: 'button', 'aria-label': `Place ${c.label}`, transform: `translate(${bx0} ${y0})` }, picker);
      el('rect', { x: 0, y: 0, width: bw, height: bw, rx: 7 }, btn);
      const sym = el('g', { transform: `translate(${bw / 2} ${bw / 2}) scale(0.55)`, fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round' }, btn);
      sym.innerHTML = c.markup;
      const pick = (ev: Event) => {
        ev.preventDefault(); ev.stopPropagation();
        if (c.k === 'erase') { onEdge.delete(key); vms.delete(key); }
        else if (c.k === 'flip') { const p = onEdge.get(key); if (p) onEdge.set(key, { ...p, a: p.b, b: p.a }); }
        else if (c.k === 'voltmeter') vms.set(key, { kind: 'voltmeter', a, b });
        else onEdge.set(key, { kind: c.k as PartKind, a, b, emf: c.k === 'battery' ? 1.5 : undefined, closed: c.k === 'switch' ? true : undefined });
        closePicker(); changed();
        (hits.querySelector(`[data-edge="${key}"]`) as SVGElement | null)?.focus();
      };
      btn.addEventListener('click', pick);
      btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') pick(ev); if (ev.key === 'Escape') closePicker(); });
    });
    (picker.querySelector('.lw-dg-choice') as SVGElement | null)?.focus();
  }

  redraw();
  return {
    svg,
    getParts: () => parts().map((p) => ({ kind: p.kind, a: p.a, b: p.b })),
    clear() { onEdge.clear(); vms.clear(); closePicker(); changed(); },
    onChange(cb) { cbs.add(cb); return () => cbs.delete(cb); },
  };
}

export { edgeKey };
